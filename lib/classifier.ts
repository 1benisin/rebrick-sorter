// Classifier.ts

import axios, { AxiosResponse } from 'axios';
import { brickognizeResponseSchema, BrickognizeResponse } from '@/types/types';
import { ClassificationItem } from '@/types/detectionPairs.d';
import { SortPartDto } from '@/types/sortPart.dto';
import { BinLookupType, binLookupSchema } from '@/types/binLookup.type';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase';
import { Socket } from 'socket.io-client';
import { SocketAction } from '@/types/socketMessage.type';
import { SkipSortReason } from '@/types/detectionPairs.d';
import { settingsStore } from '@/stores/settingsStore';

export const CLASSIFICATION_DIMENSIONS = {
  width: 299,
  height: 299,
};

export default class Classifier {
  private static instance: Classifier;
  private socket: Socket | null = null;
  binLookup: BinLookupType | null = null;

  private constructor() {
    // Initialize the classifier
  }

  public static getInstance(): Classifier {
    if (!this.instance) {
      this.instance = new Classifier();
    }
    return this.instance;
  }

  public async init(socket: Socket): Promise<void> {
    try {
      // load socket
      this.socket = socket;

      // load bin lookup
      const storageRef = ref(storage, 'bin_lookup.json');
      const binLookupUrl = await getDownloadURL(storageRef);
      const response = await axios.get(binLookupUrl);

      const formattedBinLookup = response.data.reduce(
        (acc: Record<string, { bin: number; sorter: number }>, item: [string, number, string]) => {
          const [partId, bin, sorter] = item;
          if (!partId || !bin || !sorter) {
            throw new Error(`Invalid bin lookup item: ${item}`);
          }

          const sorterNumber = sorter.charCodeAt(0) - 65;
          acc[partId] = { bin, sorter: sorterNumber };
          return acc;
        },
        {},
      );

      this.binLookup = binLookupSchema.parse(formattedBinLookup);
    } catch (error) {
      console.error('Error initializing classifier:', error);
      throw error;
    }
  }

  private combineBrickognizeResponses(
    response1: BrickognizeResponse,
    response2: BrickognizeResponse,
  ): ClassificationItem {
    const allItems = [...response1.items, ...response2.items];
    const itemsById: Record<string, any[]> = {};

    // Group items by ID
    allItems.forEach((item) => {
      if (!itemsById[item.id]) {
        itemsById[item.id] = [];
      }
      itemsById[item.id].push(item);
    });

    // Calculate a combined score for each item, boosting items that appear in both responses
    const combinedItems = Object.values(itemsById).map((group) => {
      if (group.length > 1) {
        // Found in both responses, calculate average score and add a boost
        const averageScore = group.reduce((acc, item) => acc + item.score, 0) / group.length;
        const boostedScore = averageScore + 0.1; // Example boost, adjust as needed
        return { ...group[0], score: boostedScore }; // Ensure score does not exceed 1
      }
      return group[0]; // Single occurrence, no boost needed
    });

    // Sort combined items by score, descending
    combinedItems.sort((a, b) => b.score - a.score);

    // Assuming you want the single best result
    return combinedItems[0];
  }

  public async classify({
    imageURI1,
    imageURI2,
    initialTime,
    initialPosition,
    detectionDimensions,
    classificationThresholdPercentage,
    maxPartDimensions,
  }: {
    imageURI1: string;
    imageURI2: string;
    initialTime: number;
    initialPosition: number;
    detectionDimensions: { width: number; height: number };
    classificationThresholdPercentage: number;
    maxPartDimensions: { width: number; height: number }[];
  }): Promise<{ classification: ClassificationItem; reason?: SkipSortReason; error?: string }> {
    try {
      if (!this.binLookup || !this.socket) {
        throw new Error('Classifier not initialized: binLookup not loaded');
      }
      // Classify images
      const response1 = await this.classifyImage(imageURI1);
      const response2 = await this.classifyImage(imageURI2);

      // Combine the results
      const combinedResult = this.combineBrickognizeResponses(response1, response2);

      // skip part if confidence is too low
      if (combinedResult.score < classificationThresholdPercentage) {
        return {
          classification: combinedResult,
          reason: SkipSortReason.tooLowConfidence,
          error: (Math.round(combinedResult.score * 100) / 100).toFixed(2),
        };
      }

      // lookup bin position
      const binPosition = this.binLookup[combinedResult.id];
      if (!binPosition) {
        console.error(`No bin position found for part ID: ${combinedResult.id}`);
        return {
          classification: combinedResult,
          reason: SkipSortReason.noBinForPartId,
          error: combinedResult.id,
        };
      }
      combinedResult.bin = binPosition.bin;
      combinedResult.sorter = binPosition.sorter;

      // skip part if it's too large for the sorter
      const { width: maxPartWidth, height: maxPartHeight } = maxPartDimensions[binPosition.sorter];
      if (detectionDimensions.width > maxPartWidth || detectionDimensions.height > maxPartHeight) {
        return {
          classification: combinedResult,
          reason: SkipSortReason.tooLargeForSorter,
          error: `${Math.round(detectionDimensions.width)}x${Math.round(detectionDimensions.height)}`,
        };
      }

      // send to sorter
      const data: SortPartDto = {
        partId: combinedResult.id,
        initialPosition,
        initialTime,
        bin: binPosition.bin,
        sorter: binPosition.sorter,
      };

      // axios.post('/api/hardware/sort', data);
      this.socket.emit(SocketAction.SORT_PART, data);

      return { classification: combinedResult };
    } catch (error) {
      throw error;
    }
  }

  private async classifyImage(imageURI: string): Promise<BrickognizeResponse> {
    try {
      // Send the request to your Next.js server's API route with the image URI
      const response: AxiosResponse = await axios.post('/api/brickognize', {
        imageURI: imageURI,
      });
      // validate the response
      const brickognizeResponse = brickognizeResponseSchema.parse(response.data);

      // Handle the server response as needed
      return brickognizeResponse;
    } catch (error) {
      throw error;
    }
  }
}
