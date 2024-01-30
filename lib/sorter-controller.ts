// sorter-controller.ts
import CameraController from "./camera-controller"; // Adjust the import path as needed
import DetectionModel from "./detection-model"; // Adjust the import path as needed

export enum SorterEvent {
  START = "start",
  STOP = "stop",
}

type EventHandler = () => void;

export default class SorterController {
  private static instance: SorterController;
  private isRunning: boolean;
  private eventHandlers: Record<string, EventHandler[]>;
  private cameraController: CameraController;
  private detectionModel: DetectionModel;
  private modelLoaded: boolean;

  private constructor() {
    this.isRunning = false;
    this.eventHandlers = {};
    this.cameraController = new CameraController("video1");
    this.detectionModel = new DetectionModel();
    this.modelLoaded = false; // Initialize modelLoaded as false
    this.loadModel().then(() => {
      this.modelLoaded = true;
    });
  }

  public static getInstance(): SorterController {
    if (!SorterController.instance) {
      SorterController.instance = new SorterController();
    }
    return SorterController.instance;
  }

  public isProcessRunning(): boolean {
    return this.isRunning;
  }

  private async mockProcess() {
    console.log("Process running...");
    try {
      // Capture an image from the camera
      const imageData = this.cameraController.captureImage();

      // Detect objects in the image
      const detections = await this.detectionModel.detect(imageData);
      console.log("Detections:", detections);
    } catch (error) {
      console.error("Error during process:", error);
    }

    // Simulate some work with a delay
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check if we should continue running after the delay
    if (this.isRunning) {
      this.runProcess();
    }
  }

  private runProcess() {
    // Immediate invocation of mockProcess if we're running
    this.mockProcess();
  }

  private async loadModel(): Promise<void> {
    try {
      await this.detectionModel.loadModel();
      this.modelLoaded = true;
      console.log("Model loaded successfully");
    } catch (error) {
      console.error("Error loading model:", error);
    }
  }

  public start() {
    if (!this.isRunning) {
      // Check if the model is loaded before starting
      if (!this.modelLoaded) {
        console.log("Loading model...");
        this.loadModel().then(() => {
          this.isRunning = true;
          console.log("Process started.");
          this.emit(SorterEvent.START);
          this.runProcess();
        });
      } else {
        this.isRunning = true;
        console.log("Process started.");
        this.emit(SorterEvent.START);
        this.runProcess();
      }
    }
  }

  public stop() {
    if (this.isRunning) {
      this.isRunning = false;
      this.emit(SorterEvent.STOP);
      console.log("Process stopped.");
    }
  }

  public subscribe(event: SorterEvent, handler: EventHandler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  public unsubscribe(event: SorterEvent, handler: EventHandler) {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      this.eventHandlers[event] = handlers.filter((h) => h !== handler);
    }
  }

  private emit(event: string) {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      handlers.forEach((handler) => handler());
    }
  }
}
