// lib/services/SorterService.ts

// lib/sortProcessCtrl.ts

import { Service, ServiceName, ServiceState } from './Service.interface';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';
import { ClassificationItem } from '@/types/detectionPairs';
import { DetectionPairGroup } from '@/types/detectionPairs';
import { Detection } from '@/types/types';

import { v4 as uuid } from 'uuid';
import serviceManager from './ServiceManager';
import { findPositionAtTime } from '../utils';

const MIN_PROCESS_LOOP_TIME = 800;

class SortProcessControllerService implements Service {
  private status: ServiceState = ServiceState.UNINITIALIZED;
  private detectionPairGroups: DetectionPairGroup[] = [];

  constructor() {}

  async init(): Promise<void> {
    this.status = ServiceState.INITIALIZING;

    try {
      const detectorService = serviceManager.getService(ServiceName.DETECTOR);
      const classifierService = serviceManager.getService(ServiceName.CLASSIFIER);
      const settingsService = serviceManager.getService(ServiceName.SETTINGS);

      // check if all dependencies are initialized
      if (
        detectorService.getStatus() !== ServiceState.INITIALIZED ||
        classifierService.getStatus() !== ServiceState.INITIALIZED ||
        settingsService.getStatus() !== ServiceState.INITIALIZED
      ) {
        this.status = ServiceState.UNINITIALIZED;
        console.error('Failed to initialize SortProcessControllerService: dependencies not initialized');
        return;
      }

      this.status = ServiceState.INITIALIZED;
    } catch (error) {
      this.status = ServiceState.FAILED;
      console.error('Failed to initialize SortProcessControllerService:', error);
    }
  }

  getStatus(): ServiceState {
    return this.status;
  }

  // a function that matches detection pairs to proper DetectionPairGroups
  private matchDetectionsPairsToGroups(detectionPairs: [Detection, Detection][]): void {
    // loop through detectionPairs
    for (const detectionPair of detectionPairs) {
      const unmatchedDetection = detectionPair[0];
      // find the index of the detection group whose last detection centroid is closest unmatchedDetection centroid
      const settingsService = serviceManager.getService(ServiceName.SETTINGS);
      let closestDistance = settingsService.getSettings().detectDistanceThreshold;
      let closestGroupIndex = null;

      // start fromm the end of the array to get the last detection
      for (let i = this.detectionPairGroups.length - 1; i >= 0; i--) {
        // find the predicted centroid of the last detection in the detection group
        const [lastDetection, _] =
          this.detectionPairGroups[i].detectionPairs[this.detectionPairGroups[i].detectionPairs.length - 1];
        if (!lastDetection) {
          continue;
        }

        // TODO: properly calculate distance between detections using conveyor speed logs
        // for each speed change in the speed log that would have effected the lastDetection calculate where it would be at the unmatchedDetection.timestamp
        const conveyorSpeedLog = sortProcessStore.getState().conveyorSpeedLog;
        const predictedX = findPositionAtTime(
          lastDetection.centroid.x,
          lastDetection.timestamp,
          unmatchedDetection.timestamp,
          conveyorSpeedLog,
        );
        // const distanceTravelled = (unmatchedDetection.timestamp - lastDetection.timestamp) * conveyorSpeed;
        // const predictedX = lastDetection.centroid.x + distanceTravelled;
        const distanceBetweenDetections = Math.abs(predictedX - unmatchedDetection.centroid.x);

        // distanceBetweenDetections is less than the maximum distance threshold for a match
        if (distanceBetweenDetections < closestDistance) {
          closestDistance = distanceBetweenDetections;
          closestGroupIndex = i;
        }
      }

      if (closestGroupIndex !== null) {
        // if closestDetectionGroup is found, add unmatchedDetection to closestDetectionGroup
        this.detectionPairGroups[closestGroupIndex].detectionPairs.push(detectionPair);
        sortProcessStore
          .getState()
          .addDetectionPairToGroup(this.detectionPairGroups[closestGroupIndex].id, detectionPair);
      } else {
        // else create a new detectionGroup with unmatchedDetection and add it to topViewDetectionPairGroups
        const newGroup: DetectionPairGroup = { id: uuid(), detectionPairs: [detectionPair] };
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
        if (lastDetectionPair[0].centroid.x > videoCaptureDimensions.width * 0.25 && !group?.classifying) {
          this.updateDetectionPairGroupValue(group.id, 'classifying', true);

          const settingsService = serviceManager.getService(ServiceName.SETTINGS);
          const settings = settingsService.getSettings();
          const classifier = serviceManager.getService(ServiceName.CLASSIFIER);

          classifier
            .classify({
              imageURI1: lastDetectionPair[0].imageURI,
              imageURI2: lastDetectionPair[1].imageURI,
              initialTime: lastDetectionPair[0].timestamp,
              initialPosition: lastDetectionPair[0].centroid.x,
              detectionDimensions: { width: lastDetectionPair[0].box.width, height: lastDetectionPair[0].box.height },
              classificationThresholdPercentage: settings.classificationThresholdPercentage,
              maxPartDimensions: settings.sorters.map((s) => s.maxPartDimensions),
            })
            .then(({ classification, error, reason }) => {
              // update values for detection group
              this.updateDetectionPairGroupValue(group.id, 'skipSort', error);
              this.updateDetectionPairGroupValue(group.id, 'skipSortReason', reason);
              this.updateDetectionPairGroupValue(
                group.id,
                'classificationResult',
                classification as ClassificationItem,
              );
              this.updateDetectionPairGroupValue(group.id, 'indexUsedToClassify', lastDetectionIndex);
              // update PPM (parts per minute) count if no skip sort error
              if (!reason) {
                sortProcessStore.getState().updatePPMCount();
              }
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

  private updateDetectionPairGroupValue<K extends keyof DetectionPairGroup>(
    groupId: string,
    key: K,
    value: DetectionPairGroup[K],
  ): void {
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

      const settingsService = serviceManager.getService(ServiceName.SETTINGS);
      const { conveyorSpeed } = settingsService.getSettings();

      const distanceTravelled = (Date.now() - lastPair[0].timestamp) * conveyorSpeed;
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

      const detector = serviceManager.getService(ServiceName.DETECTOR);

      const detectionPairs = await detector.detect();
      // match detections to proper DetectionGroups
      this.matchDetectionsPairsToGroups(detectionPairs);

      // classify detections past screen detection point
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

const sortProcessControllerService = new SortProcessControllerService();
export default sortProcessControllerService;
