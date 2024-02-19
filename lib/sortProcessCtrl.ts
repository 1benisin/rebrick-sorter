// sortProcessController.ts
// import Detector from './detector';
import Detector from '@/lib/dualDetector';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { settingsStore } from '@/stores/settingsStore';
import { alertStore } from '@/stores/alertStore';
import { Detection } from '@/types/types';
import Classifier from './classifier';
import { DetectionPairGroup, ClassificationItem } from '@/types/detectionPairs';
import { BrickognizeResponse } from '@/types/types';
import { v4 as uuid } from 'uuid';
import axios from 'axios';
import { SortPartDto } from '@/types/sortPart.dto';

const MIN_PROCESS_LOOP_TIME = 1000;

export default class SortProcessCtrl {
  private static instance: SortProcessCtrl;
  private detector: Detector;
  private detectionPairGroups: DetectionPairGroup[] = [];

  private constructor() {
    this.detector = Detector.getInstance();
  }

  public static getInstance(): SortProcessCtrl {
    if (!SortProcessCtrl.instance) {
      SortProcessCtrl.instance = new SortProcessCtrl();
    }
    return SortProcessCtrl.instance;
  }

  // a function that matches detection pairs to proper DetectionPairGroups
  private matchDetectionsPairsToGroups(detectionPairs: [Detection, Detection][]): void {
    const detectDistanceThreshold = settingsStore.getState().detectDistanceThreshold;

    // loop through detectionPairs
    for (const detectionPair of detectionPairs) {
      const unmatchedDetection = detectionPair[0];
      // find the index of the detection group whose last detection centroid is closest unmatchedDetection centroid
      let closestDistance = detectDistanceThreshold;
      let closestGroupIndex = null;

      // start form the end of the array to get the last detection
      for (let i = this.detectionPairGroups.length - 1; i >= 0; i--) {
        // find the predicted centroid of the last detection in the detection group
        const [lastDetection, _] = this.detectionPairGroups[i].detectionPairs[this.detectionPairGroups[i].detectionPairs.length - 1];
        if (!lastDetection) {
          continue;
        }
        const conveyorSpeed_PPS = settingsStore.getState().conveyorSpeed_PPS;

        const distanceTravelled = ((unmatchedDetection.timestamp - lastDetection.timestamp) / 1000) * conveyorSpeed_PPS;
        const predictedX = lastDetection.centroid.x + distanceTravelled;
        const distanceBetweenDetections = Math.abs(predictedX - unmatchedDetection.centroid.x);
        // console.log('distance', distance, 'detectDistanceThreshold', detectDistanceThreshold);

        if (distanceBetweenDetections < closestDistance) {
          closestDistance = distanceBetweenDetections;
          closestGroupIndex = i;
        }
      }
      if (closestGroupIndex !== null) {
        // if closestDetectionGroup is found, add unmatchedDetection to closestDetectionGroup
        this.detectionPairGroups[closestGroupIndex].detectionPairs.push(detectionPair);
        sortProcessStore.getState().addDetectionPairToGroup(this.detectionPairGroups[closestGroupIndex].id, detectionPair);
      } else {
        // else create a new detectionGroup with unmatchedDetection and add it to topViewDetectionPairGroups
        const newGroup = { id: uuid(), detectionPairs: [detectionPair] };
        this.detectionPairGroups.unshift(newGroup);
        sortProcessStore.getState().addDetectionPairGroup(newGroup);
      }
    }
  }

  // function that classifies detections past screen 1/3
  private async classifyDetections(): Promise<void> {
    try {
      const videoCaptureDimensions = sortProcessStore.getState().videoCaptureDimensions;

      // loop through detectionPairGroups
      for (let i = 0; i < this.detectionPairGroups.length; i++) {
        const group = this.detectionPairGroups[i];
        const lastDetectionPair = group.detectionPairs[group.detectionPairs.length - 1];

        if (lastDetectionPair[0].centroid.x > videoCaptureDimensions.width * 0.33 && !group.classifications) {
          // classify the detection
          const topViewClassification = await Classifier.classify(lastDetectionPair[0].imageURI);
          const sideViewClassification = await Classifier.classify(lastDetectionPair[1].imageURI);

          // update index of the detection used to classify
          const indexUsedToClassify = group.detectionPairs.length - 1;
          // add classifications to group
          group.classifications = [topViewClassification, sideViewClassification];
          group.indexUsedToClassify = indexUsedToClassify;

          // update detectionPairGroups
          this.detectionPairGroups[i] = group;
        }
      }
    } catch (error) {
      const message = 'Error during classification: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
    }
  }

  private markOffscreenDetections(): void {
    for (const group of this.detectionPairGroups) {
      const lastPair = group.detectionPairs[group.detectionPairs.length - 1];
      // find the predicted centroid of the last detection in the detection group
      const conveyorSpeed_PPS = settingsStore.getState().conveyorSpeed_PPS;
      const distanceTravelled = ((Date.now() - lastPair[0].timestamp) / 1000) * conveyorSpeed_PPS;
      const predictedX = lastPair[0].centroid.x + distanceTravelled;
      if (predictedX > sortProcessStore.getState().videoCaptureDimensions.width) {
        group.offScreen = true;
      }

      // update detectionPairGroups
      this.detectionPairGroups[this.detectionPairGroups.indexOf(group)] = group;
    }
  }

  private combineBrickognizeResponses(response1: BrickognizeResponse, response2: BrickognizeResponse): ClassificationItem[] {
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
    return combinedItems;
  }

  private combineClassificationResults(): void {
    // loop through detectionPairGroups
    for (let i = 0; i < this.detectionPairGroups.length; i++) {
      const group = this.detectionPairGroups[i];
      if (group.classifications && !group.combineclassification) {
        const combinedResults = this.combineBrickognizeResponses(group.classifications[0], group.classifications[1]);
        group.combineclassification = combinedResults;
        // update detectionPairGroups
        this.detectionPairGroups[i] = group;
      }
    }
  }

  private sendClassifiedPartsToSorter(): void {
    // loop through detectionPairGroups
    for (let i = 0; i < this.detectionPairGroups.length; i++) {
      const group = this.detectionPairGroups[i];
      if (group.combineclassification && !group.sentToSorter) {
        const data: SortPartDto = {
          partId: group.combineclassification[0].id,
          initialPosition: group.detectionPairs[0][0].centroid.x,
          initialTime: group.detectionPairs[0][0].timestamp,
        };
        const result = axios.post('/api/hardware/sort', data);

        // console.log('Sending to server', group.combineclassification[0].id);
        group.sentToSorter = true;
        // update detectionPairGroups
        this.detectionPairGroups[i] = group;
      }
    }
  }

  private async runProcess() {
    const startTime = Date.now();
    console.log('----------- Process Start ');
    try {
      // Get detections
      const detectionPairs = await this.detector.detect();
      // match detections to proper DetectionGroups
      this.matchDetectionsPairsToGroups(detectionPairs);

      // classify detections past screen center
      await this.classifyDetections();

      // combine classification results
      await this.combineClassificationResults();

      this.sendClassifiedPartsToSorter();

      // mark offscreen detections
      this.markOffscreenDetections();
    } catch (error) {
      const message = 'Error during sort process: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      this.stop();
    }

    if (sortProcessStore.getState().isRunning) {
      // schedult to run process again after MIN_PROCESS_LOOP_TIME
      const timeToNextRun = Math.max(0, MIN_PROCESS_LOOP_TIME - (Date.now() - startTime));

      console.log('----------- Process End ', (Date.now() + timeToNextRun - startTime) / 1000);
      setTimeout(() => this.runProcess(), timeToNextRun);
    }
  }

  public start() {
    if (!sortProcessStore.getState().isRunning) {
      sortProcessStore.getState().setIsRunning(true);
      console.log('Process started.');
      this.runProcess();
    }
  }

  public stop() {
    if (sortProcessStore.getState().isRunning) {
      sortProcessStore.getState().setIsRunning(false);
      console.log('Process stopped.');
    }
  }
}
