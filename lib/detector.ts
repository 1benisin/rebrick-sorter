// detection-model.ts

import * as automl from "@tensorflow/tfjs-automl";
import "@tensorflow/tfjs-backend-webgl";
import { alertStore } from "@/stores/alertStore";
import { settingsStore } from "@/stores/settingsStore";
import { CLASSIFICATION_DIMENSIONS } from "./classifier";
import { Detection } from "@/types";
import VideoCapture from "./videoCapture";

const DETECTION_MODEL_URL = "/detection-model/model.json";
const DETECTION_OPTIONS = { score: 0.5, iou: 0.5, topk: 5 };
const MAX_DETECTION_DIMENSION = 300;
const CALIBRATION_SAMPLE_COUNT = 10;

export default class Detector {
  private static instance: Detector;
  private model: automl.ObjectDetectionModel | null = null;
  private videoCapture: VideoCapture | null = null;
  // videoId default value is "video"
  private constructor(videoId = "video") {
    this.loadModel();
    this.loadVideoCapture(videoId);
  }

  public static getInstance(): Detector {
    if (!Detector.instance) {
      Detector.instance = new Detector();
    }
    return Detector.instance;
  }

  // Methode to load VideoCapture
  public loadVideoCapture(videoId = "video"): void {
    this.videoCapture = new VideoCapture(videoId);
  }

  // Method to load the model
  async loadModel(): Promise<void> {
    if (this.model) {
      return;
    }
    try {
      this.model = await automl.loadObjectDetection(DETECTION_MODEL_URL);

      // prime model for faster first detection
      const img = new Image();
      img.width = 299;
      img.height = 299;
      img.src = "/prime_model_image.jpg";
      const primeCanvas = document.createElement("canvas");
      primeCanvas.width = 299;
      primeCanvas.height = 299;
      const ctx = primeCanvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, primeCanvas.width, primeCanvas.height);
      await this.model.detect(primeCanvas, DETECTION_OPTIONS);

      console.log("Model loaded successfully");
    } catch (error) {
      const message = "Error loading model: " + error;
      alertStore
        .getState()
        .addAlert({ type: "error", message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  // Method to calibrate conveyor velocity
  public async calibrateConveyorSpeed(): Promise<void> {
    try {
      if (!this.model) {
        const error = "Model not loaded. Call loadModel() first.";
        alertStore
          .getState()
          .addAlert({ type: "error", message: error, timestamp: Date.now() });
        throw new Error(error);
      }

      // loop until we have enough distance samples
      let distances = [];
      let lastPosition = null;
      while (distances.length < CALIBRATION_SAMPLE_COUNT) {
        const detections = await this.detect();
        if (detections.length === 0) continue;
        // get the dection with the dentroid furthest to the right
        const nextDetection = detections.reduce((acc, detection) => {
          return acc.centroid.x > detection.centroid.x ? acc : detection;
        });
        // if first detection or nextDetection is to the left of the last detection
        if (
          lastPosition === null ||
          nextDetection.centroid.x < lastPosition.x
        ) {
          lastPosition = detections[0].centroid;
        } else {
          // add the distance between the last detection and the next detection
          distances.push(nextDetection.centroid.x - lastPosition.x);
          lastPosition = nextDetection.centroid;
        }
      }
      // return median distance
      distances.sort((a, b) => a - b);
      const conveyorSpeed = distances[Math.floor(distances.length / 2)];
      settingsStore.getState().setConveyorSpeed(conveyorSpeed);
    } catch (error) {
      const message = "Error during calibration: " + error;
      console.error(message);
      alertStore
        .getState()
        .addAlert({ type: "error", message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  // Method to detect objects in an image
  public async detect(): Promise<Detection[]> {
    // Check if videoCapture is loaded
    if (!this.videoCapture) {
      const error = "VideoCapture not loaded. Call loadVideoCapture() first.";
      alertStore
        .getState()
        .addAlert({ type: "error", message: error, timestamp: Date.now() });
      throw new Error(error);
    }
    // Check if model is loaded
    if (!this.model) {
      const error = "Model not loaded. Call loadModel() first.";
      alertStore
        .getState()
        .addAlert({ type: "error", message: error, timestamp: Date.now() });
      throw new Error(error);
    }

    try {
      // Capture an image from the camera
      const imageCapture = this.videoCapture.captureImage();

      // scale down original image to speed up detection
      const scalar = Detector.getCanvasScalar(imageCapture.canvas);
      const scaledCanvas = this.scaleDownCanvas(imageCapture.canvas, scalar);

      const predictions = await this.model.detect(
        scaledCanvas,
        DETECTION_OPTIONS
      );

      // scale up predictions to original image size
      const scaledPredictions = this.scaleUpPredictions(predictions, scalar);

      // crop detections from original image
      // and create Detection objects
      // create a canvas once to crop the detection
      const cropCanvas = document.createElement("canvas");
      const detections = scaledPredictions.map((prediction) => {
        const detectionImageURI = this.getCroppedImageURI(
          imageCapture.canvas,
          cropCanvas,
          prediction
        );

        const detection = {
          view: "top",
          imageURI: detectionImageURI,
          timestamp: imageCapture.timestamp,
          centroid: {
            x: prediction.box.left + prediction.box.width / 2,
            y: prediction.box.top + prediction.box.height / 2,
          },
          box: prediction.box,
        } as Detection;
        return detection;
      });

      return detections;
    } catch (error) {
      const message = "Error during detection: " + error;
      console.error(message);
      alertStore
        .getState()
        .addAlert({ type: "error", message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  public static getCanvasScalar(canvas: HTMLCanvasElement): number {
    const { width, height } = canvas;
    const scalar = Math.min(
      1,
      MAX_DETECTION_DIMENSION / Math.max(width, height)
    );

    return scalar;
  }

  private scaleDownCanvas(
    canvas: HTMLCanvasElement,
    scalar: number
  ): HTMLCanvasElement {
    // scale down image if it is too large
    const { width, height } = canvas;

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = width * scalar;
    scaledCanvas.height = height * scalar;
    const ctx = scaledCanvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return scaledCanvas;
  }

  private scaleUpPredictions(
    predictions: automl.PredictedObject[],
    scalar: number
  ): automl.PredictedObject[] {
    // scalar is .33 and i want to scall up prediction box
    return predictions.map((p) => {
      return {
        ...p,
        box: {
          left: p.box.left / scalar,
          top: p.box.top / scalar,
          width: p.box.width / scalar,
          height: p.box.height / scalar,
        },
      };
    });
  }

  // Method to crop square detection images from an image
  private getCroppedImageURI(
    canvas: HTMLCanvasElement,
    cropCanvas: HTMLCanvasElement,
    detection: automl.PredictedObject
  ): string {
    // get centroid at detection size
    let { left, top, width, height } = detection.box;
    const centroid = [left + width / 2, top + height / 2];
    // turn detection box into a square
    [left, top, width, height] =
      width > height
        ? [left, top - (width - height) / 2, width, width]
        : [left - (height - width) / 2, top, height, height];

    // create cropped imgUrl
    cropCanvas.width = CLASSIFICATION_DIMENSIONS.width;
    cropCanvas.height = CLASSIFICATION_DIMENSIONS.height;
    const ctx = cropCanvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(
      canvas,
      left,
      top,
      width,
      height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );

    return cropCanvas.toDataURL("image/jpeg");
  }
}
