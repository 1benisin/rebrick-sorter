// Classifier.ts

import { Detection } from "./detector";

export const CLASSIFICATION_DIMENSIONS = {
  width: 299,
  height: 299,
};

export class Classifier {
  classify(detection: Detection): string {
    // Logic to classify the detection and return the Lego part number
    return "unknown";
  }
}
