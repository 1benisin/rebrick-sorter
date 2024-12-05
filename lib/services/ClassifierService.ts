// lib/services/ClassifierService.ts

// services/ClassifierService.ts

import axios, { AxiosResponse } from 'axios';
import { brickognizeResponseSchema, BrickognizeResponse } from '@/types/types';
import { ClassificationItem } from '@/types/detectionPairs.d';
import { SortPartDto } from '@/types/sortPart.dto';
import { BinLookupType, binLookupSchema } from '@/types/binLookup.type';
import { ref, getDownloadURL, uploadString } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { SkipSortReason } from '@/types/detectionPairs.d';
import { Service, ServiceName, ServiceState } from './Service.interface';
import serviceManager from './ServiceManager';
import { AllEvents } from '@/types/socketMessage.type';
import { collection, doc, setDoc } from 'firebase/firestore';
import pako from 'pako';

export const CLASSIFICATION_DIMENSIONS = {
  width: 299,
  height: 299,
};

class ClassifierService implements Service {
  private binLookup: BinLookupType | null = null;
  private state: ServiceState = ServiceState.UNINITIALIZED;

  public async init(): Promise<void> {
    this.state = ServiceState.INITIALIZING;
    try {
      // check if all dependencies are initialized
      const socketService = serviceManager.getService(ServiceName.SOCKET);
      if (socketService.getStatus() !== ServiceState.INITIALIZED) {
        this.state = ServiceState.UNINITIALIZED;
        console.error('Failed to initialize ClassifierService: dependencies not initialized');
        return;
      }

      // load bin lookup
      const storageRef = ref(storage, 'bin_lookup_v3.json.gz');
      const binLookupUrl = await getDownloadURL(storageRef);
      const response = await axios.get(binLookupUrl, {
        responseType: 'arraybuffer',
      });

      const decompressed = pako.inflate(new Uint8Array(response.data), { to: 'string' });
      const jsonData = JSON.parse(decompressed);

      const formattedBinLookup = jsonData.reduce(
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
      this.state = ServiceState.INITIALIZED;
    } catch (error) {
      console.error('Error initializing classifier:', error);
      this.state = ServiceState.FAILED;
      throw error;
    }
  }

  public getStatus(): ServiceState {
    return this.state;
  }

  private combineBrickognizeResponses(
    response1: BrickognizeResponse,
    response2: BrickognizeResponse,
  ): ClassificationItem {
    // Function to boost the top item if it significantly outscores the next one
    const boostTopItemIfSignificant = (
      items: ClassificationItem[],
      scoreGapThreshold: number,
      boostAmount: number,
    ): ClassificationItem[] => {
      // Clone the items array to avoid mutating the original response
      const sortedItems = [...items].sort((a, b) => b.score - a.score);

      if (sortedItems.length > 1 && sortedItems[0].score - sortedItems[1].score > scoreGapThreshold) {
        // Boost the top item if the gap is significant
        const boostedScore = Math.min(sortedItems[0].score + boostAmount, 1); // Ensuring the score doesn't exceed 1
        return [{ ...sortedItems[0], score: boostedScore }, ...sortedItems.slice(1)];
      }

      return items;
    };

    // Define your thresholds and boost amount
    const scoreGapThreshold = 0.2; // The minimum gap to consider it significant
    const boostAmount = 0.1; // The amount to boost the top score

    // Boost top item scores if they are significantly higher than the second score
    const boostedItems1 = boostTopItemIfSignificant(response1.items, scoreGapThreshold, boostAmount);
    const boostedItems2 = boostTopItemIfSignificant(response2.items, scoreGapThreshold, boostAmount);

    // Combine the possibly boosted items from both responses
    const allItems = [...boostedItems1, ...boostedItems2];

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
      if (!this.binLookup) {
        throw new Error('Classifier not initialized: binLookup not loaded');
      }

      // Classify images
      const response1 = await this.classifyImage(imageURI1);
      const response2 = await this.classifyImage(imageURI2);

      // Combine the results
      const combinedResult = this.combineBrickognizeResponses(response1, response2);
      combinedResult.score = Math.round(combinedResult.score * 100) / 100;

      // skip part if confidence is too low
      if (combinedResult.score < classificationThresholdPercentage) {
        return {
          classification: combinedResult,
          reason: SkipSortReason.tooLowConfidence,
          error: combinedResult.score.toFixed(2),
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

      const socketService = serviceManager.getService(ServiceName.SOCKET);
      socketService.emit(AllEvents.SORT_PART, data);

      return { classification: combinedResult };
    } catch (error) {
      throw error;
    }
  }

  private async saveImageAndResponse(imageURI: string, brickognizeResponse: BrickognizeResponse): Promise<void> {
    try {
      // Get a new document reference with an auto-generated ID
      const classificationRef = doc(collection(db, 'classifications'));
      const id = classificationRef.id;

      // Create a reference to Firebase Storage
      const imageRef = ref(storage, `classified_images/${id}.jpg`);

      // Upload the image
      await uploadString(imageRef, imageURI, 'data_url');

      // Get the download URL
      const imageUrl = await getDownloadURL(imageRef);

      // Prepare the data to save to Firestore
      const dataToSave = {
        imageUrl: imageUrl,
        brickognizeResponse: brickognizeResponse,
        timestamp: Date.now(),
      };

      // Save the data to Firestore
      await setDoc(classificationRef, dataToSave);

      console.log('Image and response saved successfully.');
    } catch (error) {
      console.error('Error saving image and response:', error);
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

      // Save the image and response to Firebase
      await this.saveImageAndResponse(imageURI, brickognizeResponse);

      // Handle the server response as needed
      return brickognizeResponse;
    } catch (error) {
      throw error;
    }
  }
}

const classifierService = new ClassifierService();
export default classifierService;
