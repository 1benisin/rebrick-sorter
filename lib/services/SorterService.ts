// lib/services/SorterService.ts

import { Service, ServiceName, ServiceState } from './Service.interface';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';
import { ClassificationItem } from '@/types/detectionPairs';
import { DetectionPairGroup } from '@/types/detectionPairs';
import { Detection } from '@/types/types';

import { v4 as uuid } from 'uuid';
import serviceManager from './ServiceManager';
const MIN_PROCESS_LOOP_TIME = 500;

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

  // Match detection pairs to DetectionPairGroups using encoder-based absolute position matching
  private matchDetectionsPairsToGroups(detectionPairs: [Detection, Detection][]): void {
    // Get calibration settings for encoder-based matching
    const settingsService = serviceManager.getService(ServiceName.SETTINGS);
    const settings = settingsService.getSettings();
    const { cameraWidthInTicks, cameraWidthPixels } = settings.positionCalibration;
    const { width: videoWidth } = sortProcessStore.getState().videoCaptureDimensions;

    // Use video width or calibrated width for pixel-to-tick conversion
    const pixelWidth = videoWidth || cameraWidthPixels || 1280;

    console.log('=== matchDetectionsPairsToGroups START (encoder-based) ===');
    console.log(`  Incoming detection pairs: ${detectionPairs.length}`);
    console.log(`  Existing groups: ${this.detectionPairGroups.length}`);
    console.log(`  cameraWidthInTicks: ${cameraWidthInTicks}, pixelWidth: ${pixelWidth}`);

    // Check if calibration is available for encoder-based matching
    if (!cameraWidthInTicks || cameraWidthInTicks <= 0) {
      console.warn('[MATCH] Calibration required - falling back to creating new groups for each detection');
      // Without calibration, just create new groups (no cross-frame matching)
      for (const detectionPair of detectionPairs) {
        const newGroup: DetectionPairGroup = { id: uuid(), detectionPairs: [detectionPair] };
        this.detectionPairGroups.unshift(newGroup);
        sortProcessStore.getState().addDetectionPairGroup(newGroup);
      }
      return;
    }

    // Helper: convert pixel position to ticks from camera left edge
    const pixelToTicks = (pixelX: number) => (pixelX / pixelWidth) * cameraWidthInTicks;

    // Helper: calculate "absolute encoder position" (encoder value when part crossed camera left edge)
    // This value should be constant for the same part across multiple detections
    const getAbsolutePos = (detection: Detection) => detection.encoderAtDetection - pixelToTicks(detection.centroid.x);

    // Matching threshold in encoder ticks (~20% of camera width, minimum 50)
    // This accounts for detection jitter, encoder timing skew, and part wobble
    const MATCH_THRESHOLD_TICKS = Math.max(50, cameraWidthInTicks * 0.2);

    for (const detectionPair of detectionPairs) {
      const newDetection = detectionPair[0]; // Use top view for matching

      // Validate encoder data exists before calculating position
      if (newDetection.encoderAtDetection === undefined) {
        console.warn('[MATCH] New detection missing encoderAtDetection - creating new group without matching');
        const newGroup: DetectionPairGroup = { id: uuid(), detectionPairs: [detectionPair] };
        this.detectionPairGroups.unshift(newGroup);
        sortProcessStore.getState().addDetectionPairGroup(newGroup);
        continue;
      }

      const newAbsolutePos = getAbsolutePos(newDetection);

      console.log(
        `\n  Processing detection: x=${newDetection.centroid.x.toFixed(1)}, ` +
          `encoder=${newDetection.encoderAtDetection}, absolutePos=${newAbsolutePos.toFixed(1)}`,
      );

      let closestGroupIndex: number | null = null;
      let closestDelta = MATCH_THRESHOLD_TICKS;

      for (let i = 0; i < this.detectionPairGroups.length; i++) {
        const group = this.detectionPairGroups[i];
        const lastPair = group.detectionPairs[group.detectionPairs.length - 1];
        const lastDetection = lastPair?.[0];

        if (!lastDetection || lastDetection.encoderAtDetection === undefined) {
          console.log(`    Group ${i}: No encoder data, skipping`);
          continue;
        }

        const lastAbsolutePos = getAbsolutePos(lastDetection);
        const delta = Math.abs(newAbsolutePos - lastAbsolutePos);

        console.log(
          `    Group ${i}: lastAbsolutePos=${lastAbsolutePos.toFixed(1)}, ` +
            `delta=${delta.toFixed(1)}, threshold=${closestDelta.toFixed(1)}, MATCH=${delta < closestDelta}`,
        );

        if (delta < closestDelta) {
          closestDelta = delta;
          closestGroupIndex = i;
        }
      }

      if (closestGroupIndex !== null) {
        // Match found - add to existing group
        console.log(
          `  ✓ MATCHED to group ${closestGroupIndex} ` +
            `(id: ${this.detectionPairGroups[closestGroupIndex].id}), delta: ${closestDelta.toFixed(1)} ticks`,
        );
        this.detectionPairGroups[closestGroupIndex].detectionPairs.push(detectionPair);
        sortProcessStore
          .getState()
          .addDetectionPairToGroup(this.detectionPairGroups[closestGroupIndex].id, detectionPair);
      } else {
        // No match - create new group
        const newGroup: DetectionPairGroup = { id: uuid(), detectionPairs: [detectionPair] };
        console.log(`  ✗ NO MATCH - Creating new group (id: ${newGroup.id})`);
        this.detectionPairGroups.unshift(newGroup);
        sortProcessStore.getState().addDetectionPairGroup(newGroup);
      }
    }

    console.log(`=== matchDetectionsPairsToGroups END - Total groups: ${this.detectionPairGroups.length} ===\n`);
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

        // if traveled 1/3 of the way (right to left movement) and not already classifying: classify
        if (lastDetectionPair[0].centroid.x < videoCaptureDimensions.width * 0.67 && !group?.classifying) {
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
              encoderAtDetection: lastDetectionPair[0].encoderAtDetection,
              detectionDimensions: { width: lastDetectionPair[0].box.width, height: lastDetectionPair[0].box.height },
              classificationThresholdPercentage: settings.classificationThresholdPercentage,
              maxPartDimensions: settings.sorters.map((s) => s.maxPartDimensions),
              videoCaptureDimensions,
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
    const settingsService = serviceManager.getService(ServiceName.SETTINGS);
    const settings = settingsService.getSettings();
    const { cameraWidthInTicks, cameraWidthPixels, jetEncoderOffsets, jetLeadCounts } = settings.positionCalibration;
    const { width: videoWidth } = sortProcessStore.getState().videoCaptureDimensions;
    const currentEncoder = sortProcessStore.getState().encoderPosition;

    // Use video width or calibrated width
    const pixelWidth = videoWidth || cameraWidthPixels || 1280;

    // Skip if no calibration - can't calculate encoder positions
    if (!cameraWidthInTicks || cameraWidthInTicks <= 0) {
      return;
    }

    // Use the furthest jet as the "off-screen" boundary
    const maxJetOffset = Math.max(...jetEncoderOffsets.filter((o) => o > 0));
    if (maxJetOffset <= 0) {
      return; // No valid jet offsets configured
    }

    const pixelToTicks = (pixelX: number) => (pixelX / pixelWidth) * cameraWidthInTicks;

    // Buffer: use jetLeadCounts (when jet command is sent) as off-screen threshold
    // Parts are "off screen" once they've passed the furthest jet + some buffer
    const offscreenBuffer = jetLeadCounts || 100;

    for (const group of this.detectionPairGroups) {
      if (group.offScreen) continue; // Already marked

      const lastPair = group.detectionPairs[group.detectionPairs.length - 1];
      const lastDetection = lastPair[0];

      // Skip if no encoder data
      if (lastDetection.encoderAtDetection === undefined) continue;

      // Calculate absolute position (encoder value when part crossed camera left edge)
      const absolutePos = lastDetection.encoderAtDetection - pixelToTicks(lastDetection.centroid.x);

      // Part's jet position would be at absolutePos + maxJetOffset
      const partJetPosition = absolutePos + maxJetOffset;

      // Part is off-screen when current encoder has passed beyond the jet position + buffer
      if (currentEncoder > partJetPosition + offscreenBuffer) {
        group.offScreen = true;
        sortProcessStore.getState().updateDetectionPairGroupValue(group.id, 'offScreen', true);
      }
    }
  }

  /**
   * Removes detection groups that are off-screen AND have been classified.
   * These groups are no longer needed for matching or classification.
   * Called after markOffscreenDetections() to prevent memory growth.
   */
  private cleanupCompletedGroups(): void {
    const beforeCount = this.detectionPairGroups.length;

    // Find groups to remove (off-screen AND classified)
    const groupsToRemove = this.detectionPairGroups.filter(
      (group) => group.offScreen && group.classificationResult,
    );

    // Remove from store first
    for (const group of groupsToRemove) {
      sortProcessStore.getState().removeDetectionPairGroup(group.id);
    }

    // Keep groups that are:
    // 1. Not off-screen yet (still tracking), OR
    // 2. Off-screen but not classified yet (waiting for classification to complete)
    this.detectionPairGroups = this.detectionPairGroups.filter(
      (group) => !group.offScreen || !group.classificationResult,
    );

    const removedCount = beforeCount - this.detectionPairGroups.length;
    if (removedCount > 0) {
      console.log(`[SORTER_SERVICE] Cleaned up ${removedCount} completed detection groups`);
    }
  }

  private async runProcess() {
    const startTime = Date.now();
    // console.log('----------- Process Start ');
    try {
      // Get detections

      const detector = serviceManager.getService(ServiceName.DETECTOR);

      const detectionPairs = await detector.detect();

      // Log detections for debugging
      if (detectionPairs.length > 0) {
        console.log(`${detectionPairs.length} detection pair(s) found`);
      }

      // match detections to proper DetectionGroups
      this.matchDetectionsPairsToGroups(detectionPairs);

      // classify detections past screen detection point
      await this.classifyDetections();

      // mark offscreen detections
      this.markOffscreenDetections();

      // cleanup completed groups to prevent memory growth
      this.cleanupCompletedGroups();
    } catch (error) {
      const message = 'Error during sort process: ' + error;
      console.error(message);

      // Check if this is a recoverable "encoder not ready" error
      if (error instanceof Error && error.message.includes('no encoder data')) {
        console.warn('[SORTER_SERVICE] Skipping frame - waiting for encoder data');
        // Don't stop, just continue the loop - encoder data should arrive soon
      } else {
        // Fatal error - alert and stop
        alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
        this.stop();
      }
    }

    if (sortProcessStore.getState().isRunning) {
      // schedule to run process again after MIN_PROCESS_LOOP_TIME
      const timeToNextRun = Math.max(0, MIN_PROCESS_LOOP_TIME - (Date.now() - startTime));

      // console.log('----------- Process End ', (Date.now() + timeToNextRun - startTime) / 1000);
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
