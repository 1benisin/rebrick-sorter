// sortProcessController.ts
import Detector from './detector'; // Adjust the import path as needed
import { sortProcessStore } from '@/stores/sortProcessStore';
import { settingsStore } from '@/stores/settingsStore';
import { alertStore } from '@/stores/alertStore';
import { Detection } from '@/types';
import Classifier from './classifier';

const MIN_PROCESS_LOOP_TIME = 1200;

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
      // find the index of the detection group whose last detection centroid is closest unmatchedDetection centroid
      let closestDistance = detectDistanceThreshold;
      let closestDetectionGroup = null;
      const topViewDetectionGroups = sortProcessStore.getState().topViewDetectGroups;

      // start form the end of the array to get the last detection and loop through the last 3 detections
      for (let i = topViewDetectionGroups.length - 1; i >= 0; i--) {
        // find the predicted centroid of the last detection in the detection group
        const lastDetection = topViewDetectionGroups[i].detections[topViewDetectionGroups[i].detections.length - 1];
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
          closestDetectionGroup = topViewDetectionGroups[i];
        }
      }
      // if closestDetectionGroup is found, add unmatchedDetection to closestDetectionGroup
      // else create a new detectionGroup with unmatchedDetection and add it to topViewDetectionGroups
      if (closestDetectionGroup !== null) {
        sortProcessStore.getState().addDetectionToGroup('top', closestDetectionGroup.id, unmatchedDetection);
      } else {
        sortProcessStore.getState().newDetectGroup('top', { id: Date.now().toString(), detections: [unmatchedDetection] });
      }
    }
  }

  // function that checks if there are detections to classify
  private async classifyDetections(): Promise<void> {
    try {
      // classify detections past screen center
      // for each detection group
      const topViewDetectGroups = sortProcessStore.getState().topViewDetectGroups;
      // filter out groups that are already classified
      const unclassifiedGroups = topViewDetectGroups.filter((group) => !group.classification);

      const videoCaptureDimensions = sortProcessStore.getState().videoCaptureDimensions;
      for (const group of unclassifiedGroups) {
        const lastDetection = group.detections[group.detections.length - 1];
        if (lastDetection.centroid.x > videoCaptureDimensions.width / 2) {
          // classify the detection
          const classification = await Classifier.classify(lastDetection.imageURI);
          const indexUsedToClassify = group.detections.length - 1; // index of the detection used to classify
          sortProcessStore.getState().addClassificationToGroup('top', group.id, classification, indexUsedToClassify);
          // if classified, set isClassified to true
        }
        // if last detection is past screen center and not classified
      }
    } catch (error) {
      const message = 'Error during classification: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
    }
  }

  private markOffscreenDetections(): void {
    const topViewDetectionGroups = sortProcessStore.getState().topViewDetectGroups;
    for (const group of topViewDetectionGroups) {
      const lastDetection = group.detections[group.detections.length - 1];
      // find the predicted centroid of the last detection in the detection group
      const conveyorSpeed_PPS = settingsStore.getState().conveyorSpeed_PPS;
      const distanceTravelled = ((Date.now() - lastDetection.timestamp) / 1000) * conveyorSpeed_PPS;
      const predictedX = lastDetection.centroid.x + distanceTravelled;
      if (predictedX > sortProcessStore.getState().videoCaptureDimensions.width) {
        group.offScreen = true;
      }
    }
  }

  private async runProcess() {
    const startTime = Date.now();
    console.log('----------- Process Start ');
    try {
      // Get detections
      const detections = await this.detector.detect();
      // match detections to proper DetectionGroups
      this.matchDetectionsToGroups(detections);
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
