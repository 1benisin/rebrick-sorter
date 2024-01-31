// detection-model.ts

import * as automl from "@tensorflow/tfjs-automl";
import "@tensorflow/tfjs-backend-webgl";
import { sortProcessStore } from "@/stores/sortProcessStore";
import { ImageCapture } from "./videoCapture";
import { CLASSIFICATION_DIMENSIONS } from "./classifier";

const DETECTION_MODEL_URL = "/detection-model/model.json";
const DETECTION_OPTIONS = { score: 0.5, iou: 0.5, topk: 5 };
const MAX_DETECTION_DIMENSION = 300;

export type Detection = {
  imageURI: string;
  timestamp: number;
  centroid: [number, number];
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export default class Detector {
  private model: automl.ObjectDetectionModel | null = null;

  constructor() {}

  // Method to load the model
  async loadModel(): Promise<void> {
    try {
      this.model = await automl.loadObjectDetection(DETECTION_MODEL_URL);
      console.log("Model loaded successfully");
    } catch (error) {
      const message = "Error loading model: " + error;
      sortProcessStore.getState().addError(message);
      throw new Error(message);
    }
  }

  // Method to detect objects in an image
  async detect(imageCapture: ImageCapture): Promise<Detection[]> {
    // Check if model is loaded
    if (!this.model) {
      const error = "Model not loaded. Call loadModel() first.";
      sortProcessStore.getState().addError(error);
      throw new Error(error);
    }

    try {
      // scale down original image to speed up detection
      const { canvas: scaledCanvas, scalar } = this.scaleDownCanvas(
        imageCapture.canvas
      );

      const predictions = await this.model.detect(
        scaledCanvas,
        DETECTION_OPTIONS
      );

      // scale up predictions to original image size
      const scaledPredictions = this.scaleUpPredictions(predictions, scalar);

      // crop detections from original image
      // and create Detection objects
      const detections = scaledPredictions.map((prediction) => {
        const croppedCanvasEl = this.cropDetections(imageCapture, prediction);

        const detection = {
          imageURI: croppedCanvasEl.toDataURL(),
          timestamp: imageCapture.timestamp,
          centroid: [
            prediction.box.left + prediction.box.width / 2,
            prediction.box.top + prediction.box.height / 2,
          ],
          box: prediction.box,
        } as Detection;
        return detection;
      });

      return detections;
    } catch (error) {
      const message = "Error during detection: " + error;
      console.error(message);
      sortProcessStore.getState().addError(message);
      return [];
    }
  }

  private scaleDownCanvas(canvas: HTMLCanvasElement): {
    canvas: HTMLCanvasElement;
    scalar: number;
  } {
    // scale down image if it is too large
    const { width, height } = canvas;
    const scalar = Math.min(
      1,
      MAX_DETECTION_DIMENSION / Math.max(width, height)
    );

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = width * scalar;
    scaledCanvas.height = height * scalar;
    const ctx = scaledCanvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return { canvas: scaledCanvas, scalar };
  }

  private scaleUpPredictions(
    predictions: automl.PredictedObject[],
    scalar: number
  ): automl.PredictedObject[] {
    return predictions.map((p) => {
      p.box.left *= scalar;
      p.box.top *= scalar;
      p.box.width *= scalar;
      p.box.height *= scalar;
      return p;
    });
  }

  // Method to crop square detection images from an image
  private cropDetections(
    imageCapture: ImageCapture,
    detection: automl.PredictedObject
  ): HTMLCanvasElement {
    // get centroid at detection size
    let { left, top, width, height } = detection.box;
    const centroid = [left + width / 2, top + height / 2];
    // turn detection box into a square
    [left, top, width, height] =
      width > height
        ? [left, top - (width - height) / 2, width, width]
        : [left - (height - width) / 2, top, height, height];

    // create cropped imgUrl
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = CLASSIFICATION_DIMENSIONS.width;
    cropCanvas.height = CLASSIFICATION_DIMENSIONS.height;
    const ctx = cropCanvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(
      imageCapture.canvas,
      left,
      top,
      width,
      height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );

    return cropCanvas;
  }
}
