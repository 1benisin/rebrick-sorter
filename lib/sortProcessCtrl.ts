// sortProcessController.ts
import VideoCapture from "./videoCapture"; // Adjust the import path as needed
import Detector from "./detector"; // Adjust the import path as needed
import { sortProcessStore } from "@/stores/sortProcessStore";
import { alertStore } from "@/stores/alertStore";
import Classifier from "./classifier";
import { Detection } from "@/types";

const MIN_PROCESS_LOOP_TIME = 1000;

export default class SortProcessCtrl {
  private static instance: SortProcessCtrl;
  private detector: Detector;
  private topDetectionGroups: Detection[][] = [];
  private sideDetectionGroups: Detection[][] = [];

  private constructor() {
    this.detector = Detector.getInstance();
  }

  public static getInstance(): SortProcessCtrl {
    if (!SortProcessCtrl.instance) {
      SortProcessCtrl.instance = new SortProcessCtrl();
    }
    return SortProcessCtrl.instance;
  }

  private async runProcess() {
    const startTime = Date.now();
    console.log("Process running...");
    try {
      // Get detections
      const detections = await this.detector.detect();

      // match detections to proper DetectionGroups
      this.matchDetectionsToGroups(detections);
    } catch (error) {
      const message = "Error during sort process: " + error;
      console.error(message);
      alertStore
        .getState()
        .addAlert({ type: "error", message, timestamp: Date.now() });
      this.stop();
    }

    // Check if we should continue running after the delay
    if (sortProcessStore.getState().isRunning) {
      // Ensure the process loop takes at least MIN_PROCESS_LOOP_TIME
      if (Date.now() - startTime < MIN_PROCESS_LOOP_TIME) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_PROCESS_LOOP_TIME - (Date.now() - startTime))
        );
      }
      // Continue looping the process
      this.runProcess();
    }
  }

  // a function that matches detections to proper DetectionGroups
  // and adds the detections to the detectionGroups
  private matchDetectionsToGroups(detections: Detection[]): void {
    // ... implementation ...
  }

  public start() {
    if (!sortProcessStore.getState().isRunning) {
      sortProcessStore.getState().setIsRunning(true);
      console.log("Process started.");
      this.runProcess();
    }
  }

  public stop() {
    if (sortProcessStore.getState().isRunning) {
      sortProcessStore.getState().setIsRunning(false);
      console.log("Process stopped.");
    }
  }
}
