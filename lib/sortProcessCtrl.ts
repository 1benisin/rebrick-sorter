// sortProcessController.ts
import Detector from '@/lib/dualDetector';
import { sortProcessStore, SortProcessState } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';
import Classifier from './classifier';

import { DetectionPairGroup } from '@/types/detectionPairs';
import { Detection } from '@/types/types';
import { SettingsType } from '@/types/settings.type';

import { v4 as uuid } from 'uuid';

const MIN_PROCESS_LOOP_TIME = 1500;

export default class SortProcessCtrl {
  private static instance: SortProcessCtrl;
  private detector: Detector;
  private classifier: Classifier;
  private detectionPairGroups: DetectionPairGroup[] = [];
  private settings: SettingsType;

  private constructor(detector: Detector, classifier: Classifier, settings: SettingsType) {
    this.detector = detector;
    this.classifier = classifier;
    this.settings = settings;
  }

  public static getInstance(detector: Detector, classifier: Classifier, settings: SettingsType): SortProcessCtrl {
    if (!SortProcessCtrl.instance) {
      SortProcessCtrl.instance = new SortProcessCtrl(detector, classifier, settings);
    }
    return SortProcessCtrl.instance;
  }

  // a function that matches detection pairs to proper DetectionPairGroups
  private matchDetectionsPairsToGroups(detectionPairs: [Detection, Detection][]): void {
    // loop through detectionPairs
    for (const detectionPair of detectionPairs) {
      const unmatchedDetection = detectionPair[0];
      // find the index of the detection group whose last detection centroid is closest unmatchedDetection centroid
      let closestDistance = this.settings.detectDistanceThreshold;
      let closestGroupIndex = null;

      // start form the end of the array to get the last detection
      for (let i = this.detectionPairGroups.length - 1; i >= 0; i--) {
        // find the predicted centroid of the last detection in the detection group
        const [lastDetection, _] = this.detectionPairGroups[i].detectionPairs[this.detectionPairGroups[i].detectionPairs.length - 1];
        if (!lastDetection) {
          continue;
        }
        const conveyorSpeed_PPS = this.settings.conveyorSpeed_PPS;

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

      // loop through detectionPairGroups to find which ones to classify
      for (let i = 0; i < this.detectionPairGroups.length; i++) {
        const group = this.detectionPairGroups[i];
        const lastDetectionIndex = group.detectionPairs.length - 1;
        const lastDetectionPair = group.detectionPairs[lastDetectionIndex];

        // if past 1/3 of the screen and not already classifying: classify
        if (lastDetectionPair[0].centroid.x > videoCaptureDimensions.width * 0.33 && !group?.classifying) {
          this.updateDetectionPairGroupValue(group.id, 'classifying', true);

          this.classifier
            .classify(lastDetectionPair[0].imageURI, lastDetectionPair[1].imageURI, lastDetectionPair[0].timestamp, lastDetectionPair[0].centroid.x)
            .then((response) => {
              this.updateDetectionPairGroupValue(group.id, 'classificationResult', response);
              this.updateDetectionPairGroupValue(group.id, 'indexUsedToClassify', lastDetectionIndex);
            })
            .catch((error) => {
              console.error(`Error classifying detection pair: ${error}`);
            });
        }
      }
    } catch (error) {
      const message = 'Error during classification: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
    }
  }

  private updateDetectionPairGroupValue<K extends keyof DetectionPairGroup>(groupId: string, key: K, value: DetectionPairGroup[K]): void {
    const groups = this.detectionPairGroups;
    // find the group with the given id
    const index = groups.findIndex((g) => g.id === groupId);
    if (index === -1) return;

    // Clone the matching group and update the specified key with the given value
    const updatedGroup = { ...groups[index], [key]: value };

    // Create a new array for detectionPairGroups with the updated group
    this.detectionPairGroups = [...groups.slice(0, index), updatedGroup, ...groups.slice(index + 1)];

    sortProcessStore.getState().updateDetectionPairGroupValue(groupId, key, value);
  }

  private markOffscreenDetections(): void {
    for (const group of this.detectionPairGroups) {
      const lastPair = group.detectionPairs[group.detectionPairs.length - 1];
      // find the predicted centroid of the last detection in the detection group
      const conveyorSpeed_PPS = this.settings.conveyorSpeed_PPS;
      const distanceTravelled = ((Date.now() - lastPair[0].timestamp) / 1000) * conveyorSpeed_PPS;
      const predictedX = lastPair[0].centroid.x + distanceTravelled;
      if (predictedX > sortProcessStore.getState().videoCaptureDimensions.width) {
        group.offScreen = true;
      }

      // update detectionPairGroups
      this.detectionPairGroups[this.detectionPairGroups.indexOf(group)] = group;
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
