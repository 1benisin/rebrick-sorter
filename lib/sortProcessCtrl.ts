// sortProcessController.ts
import Detector from './detector'; // Adjust the import path as needed
import { sortProcessStore } from '@/stores/sortProcessStore';
import { settingsStore } from '@/stores/settingsStore';
import { alertStore } from '@/stores/alertStore';
import { Detection } from '@/types';

const MIN_PROCESS_LOOP_TIME = 1000;

export default class SortProcessCtrl {
  private static instance: SortProcessCtrl;
  private detector: Detector;

  private constructor() {
    this.detector = Detector.getInstance();
  }

  public static getInstance(): SortProcessCtrl {
    if (!SortProcessCtrl.instance) {
      SortProcessCtrl.instance = new SortProcessCtrl();
    }
    return SortProcessCtrl.instance;
  }

  // a function that matches detections to proper DetectionGroups
  // and adds the detections to the detectionGroups
  private matchDetectionsToGroups(detections: Detection[]): void {
    const detectDistanceThreshold = settingsStore.getState().detectDistanceThreshold;

    // loop through detections
    for (const unmatchedDetection of detections) {
      console.log('------------------------------');
      // find the index of the detection group whose last detection centroid is closest unmatchedDetection centroid
      let closestDistance = detectDistanceThreshold;
      let closestDetectionGroupIndex = -1;
      const topViewDetectionGroups = sortProcessStore.getState().topViewDetectGroups;

      // start form the end of the array to get the last detection and loop through the last 3 detections
      for (let i = topViewDetectionGroups.length - 1; i >= 0; i--) {
        if (i < topViewDetectionGroups.length - 3) {
          break;
        }
        // find the predicted centroid of the last detection in the detection group
        const lastDetection = topViewDetectionGroups[i][topViewDetectionGroups[i].length - 1];
        if (!lastDetection) {
          continue;
        }
        const conveyorSpeed_PPS = settingsStore.getState().conveyorSpeed_PPS;

        const distanceTravelled = ((unmatchedDetection.timestamp - lastDetection.timestamp) / 1000) * conveyorSpeed_PPS;
        console.log('distanceTravelled', distanceTravelled);
        const predictedX = lastDetection.centroid.x + distanceTravelled;
        const distanceBetweenDetections = Math.abs(predictedX - unmatchedDetection.centroid.x);
        // console.log('distance', distance, 'detectDistanceThreshold', detectDistanceThreshold);

        if (distanceBetweenDetections < closestDistance) {
          closestDistance = distanceBetweenDetections;
          closestDetectionGroupIndex = i;
        }
      }
      console.log('closesDistance', closestDistance, 'closestDetectionGroupIndex', closestDetectionGroupIndex);
      // if closestDetectionGroup is found, add unmatchedDetection to closestDetectionGroup
      // else create a new detectionGroup with unmatchedDetection and add it to topViewDetectionGroups
      if (closestDetectionGroupIndex > -1) {
        sortProcessStore.getState().addDetectionGroup('top', closestDetectionGroupIndex, unmatchedDetection);
      } else {
        sortProcessStore.getState().newDetectGroup('top', [unmatchedDetection]);
      }
    }
  }

  private async runProcess() {
    const startTime = Date.now();
    console.log('Process running...');
    try {
      // Get detections
      const detections = await this.detector.detect();
      console.log('detections', detections);
      // match detections to proper DetectionGroups
      if (detections.length > 0) this.matchDetectionsToGroups(detections);
    } catch (error) {
      const message = 'Error during sort process: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      this.stop();
    }

    // Check if we should continue running after the delay
    if (sortProcessStore.getState().isRunning) {
      // Ensure the process loop takes at least MIN_PROCESS_LOOP_TIME
      // if (Date.now() - startTime < MIN_PROCESS_LOOP_TIME) {
      //   await new Promise((resolve) => setTimeout(resolve, MIN_PROCESS_LOOP_TIME - (Date.now() - startTime)));
      // }
      // Continue looping the process
      this.runProcess();
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
