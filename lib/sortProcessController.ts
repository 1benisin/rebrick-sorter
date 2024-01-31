// sortProcessController.ts
import VideoCapture, { ImageCapture } from "./videoCapture"; // Adjust the import path as needed
import Detector from "./detector"; // Adjust the import path as needed
import { sortProcessStore } from "@/stores/sortProcessStore";

export default class SortProcessController {
  private static instance: SortProcessController;
  private videoCapture: VideoCapture;
  private detector: Detector;
  private modelLoaded: boolean;

  private constructor() {
    this.videoCapture = new VideoCapture("video1");
    this.detector = new Detector();
    this.modelLoaded = false; // Initialize modelLoaded as false
    this.loadModel().then(() => {
      this.modelLoaded = true;
    });
  }

  public static getInstance(): SortProcessController {
    if (!SortProcessController.instance) {
      SortProcessController.instance = new SortProcessController();
    }
    return SortProcessController.instance;
  }

  private async runProcess() {
    console.log("Process running...");
    try {
      // Capture an image from the camera
      const imageCapture = this.videoCapture.captureImage();

      // Detect objects in the image
      const detections = await this.detector.detect(imageCapture);
      console.log("Detections:", detections);
    } catch (error) {
      console.error("Error during process:", error);
      sortProcessStore
        .getState()
        .addError(error instanceof Error ? error.message : String(error));
      this.stop();
    }

    // Simulate some work with a delay
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check if we should continue running after the delay
    if (sortProcessStore.getState().isRunning) {
      this.runProcess();
    }
  }

  private async loadModel(): Promise<void> {
    try {
      await this.detector.loadModel();
      this.modelLoaded = true;
      console.log("Model loaded successfully");
    } catch (error) {
      console.error("Error loading model:", error);
      this.stop();
    }
  }

  public start() {
    if (!sortProcessStore.getState().isRunning) {
      // Check if the model is loaded before starting
      if (!this.modelLoaded) {
        console.log("Loading model...");
        this.loadModel().then(() => {
          sortProcessStore.getState().setIsRunning(true);
          console.log("Process started.");
          this.runProcess();
        });
      } else {
        sortProcessStore.getState().setIsRunning(true);
        console.log("Process started.");
        this.runProcess();
      }
    }
  }

  public stop() {
    if (sortProcessStore.getState().isRunning) {
      sortProcessStore.getState().setIsRunning(false);
      console.log("Process stopped.");
    }
  }
}
