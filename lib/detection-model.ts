// detection-model.ts

import * as automl from "@tensorflow/tfjs-automl";

const DETECTION_MODEL_URL =
  "/models/tf_js-detection_with_sm_20211124050117-2021-11-26T18:33:55.790970Z/model.json";

type DetectionOptions = {
  // Define any specific options you need for detection
};

type Detection = {
  // Define the structure of your prediction object
};

export default class DetectionModel {
  private model: automl.ObjectDetectionModel | null = null;

  constructor() {}

  // Method to load the model
  async loadModel(): Promise<void> {
    try {
      this.model = await automl.loadObjectDetection(DETECTION_MODEL_URL);
      console.log("Model loaded successfully");
    } catch (error) {
      console.error("Error loading model:", error);
    }
  }

  // Method to detect objects in an image
  async detect(
    imageData: any,
    options?: DetectionOptions
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new Error("Model not loaded. Call loadModel() first.");
    }

    try {
      const predictions = await this.model.detect(imageData, options);
      return predictions;
    } catch (error) {
      console.error("Error during detection:", error);
      return [];
    }
  }
}
