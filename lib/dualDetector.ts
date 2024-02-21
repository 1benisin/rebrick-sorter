// detection-model.ts

import * as automl from '@tensorflow/tfjs-automl';
import '@tensorflow/tfjs-backend-webgl';
import { alertStore } from '@/stores/alertStore';
import { CLASSIFICATION_DIMENSIONS } from './classifier';
import { Detection } from '@/types/types';
import DualVideoCapture from './dualVideoCapture';

const DETECTION_MODEL_URL = '/detection-model/model.json';
const DETECTION_OPTIONS = { score: 0.5, iou: 0.5, topk: 5 };
const MAX_DETECTION_DIMENSION = 300; // max width or height of image to be used for detection
const MIN_DETECT_DIST_PERCENT = 0.1; // min percentage of detection image width two detections can be from each other
const CALIBRATION_SAMPLE_COUNT = 20;

// create tagged predictions type that extends automl.PredictedObject
type TaggedPredictionType = automl.PredictedObject & {
  isTopView: boolean;
  isTooCloseToScreenEdge: boolean;
  matchingVerticalPairIndex: number;
  isTooCloseToOtherDetection: boolean;
};

type PredictionsPair = {
  topView: TaggedPredictionType;
  sideView: TaggedPredictionType;
};

export default class Detector {
  private static instance: Detector;
  private initialized = false;
  private model: automl.ObjectDetectionModel | null = null;
  public videoCapture: DualVideoCapture | null = null;

  // videoId default value is "video"
  private constructor() {}

  public static getInstance(): Detector {
    if (!Detector.instance) {
      Detector.instance = new Detector();
    }
    return Detector.instance;
  }

  public async init(videoCapture: DualVideoCapture): Promise<void> {
    if (this.initialized) return;
    this.videoCapture = videoCapture;
    await this.loadModel();
    this.initialized = true;
  }

  public async reInit(videoCapture: DualVideoCapture): Promise<void> {
    this.initialized = false;
    await this.init(videoCapture);
  }

  // Method to load the model
  private async loadModel(): Promise<void> {
    if (this.model) {
      return;
    }
    try {
      this.model = await automl.loadObjectDetection(DETECTION_MODEL_URL);

      // prime model for faster first detection
      const img = new Image();
      img.width = 299;
      img.height = 299;
      img.src = '/prime_model_image.jpg';
      const primeCanvas = document.createElement('canvas');
      primeCanvas.width = 299;
      primeCanvas.height = 299;
      const ctx = primeCanvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, primeCanvas.width, primeCanvas.height);
      await this.model.detect(primeCanvas, DETECTION_OPTIONS);

      console.log('Model loaded successfully');
    } catch (error) {
      const message = 'Error loading model: ' + error;
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  // Method to calibrate conveyor spped
  async calibrateConveyorSpeed(): Promise<number> {
    try {
      if (!this.model) {
        const error = 'Model not loaded. Call loadModel() first.';
        alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
        throw new Error(error);
      }

      // loop until we have enough distance samples
      let speeds = []; // pixels per millisecond
      let lastPosition = null;
      let lastTimestamp = null;
      while (speeds.length < CALIBRATION_SAMPLE_COUNT) {
        const detectionPairs = await this.detect();
        if (detectionPairs.length === 0) continue;

        // get the dection with the centroid furthest to the right
        const nextDetection = detectionPairs.reduce((acc, pair) => {
          const detection: Detection = pair[0];
          return acc.centroid.x > detection.centroid.x ? acc : detection;
        }, detectionPairs[0][0]);

        // if first detection or nextDetection is to the left of the last detection
        if (lastPosition === null || lastTimestamp === null || nextDetection.centroid.x < lastPosition.x) {
          lastPosition = nextDetection.centroid;
          lastTimestamp = nextDetection.timestamp;
        } else {
          // add speed in pixels per sec to speeds
          const speed = (nextDetection.centroid.x - lastPosition.x) / ((nextDetection.timestamp - lastTimestamp) / 1000);

          speeds.push(speed);
        }
      }
      // return median distance
      speeds.sort((a, b) => a - b);
      const conveyorSpeed = speeds[Math.floor(speeds.length / 2)];
      return conveyorSpeed;
    } catch (error) {
      const message = 'Error during calibration: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  // Method to detect objects in an image
  async detect(): Promise<[Detection, Detection][]> {
    // Check if videoCapture is loaded
    if (!this.videoCapture) {
      const error = 'DualVideoCapture for Detector not loaded.';
      alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
      throw new Error(error);
    }
    // Check if model is loaded
    if (!this.model) {
      const error = 'Model not loaded. Call loadModel() first.';
      alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
      throw new Error(error);
    }

    try {
      // Capture an image from the camera
      const imageCapture = await this.videoCapture.captureImage();

      // scale down original image to speed up detection
      const scalar = Detector.getImageScalar(imageCapture.imageBitmaps[0]);

      // merge the two images into one - top view is top 2/3 of the image, front view is bottom 1/3
      const mergedCanvas = this.mergeBitmaps(imageCapture.imageBitmaps[0], imageCapture.imageBitmaps[1]);

      // scale down merged image to speed up detection
      const scaledCanvas = this.scaleCanvas(mergedCanvas, scalar);

      // detect objects in the image
      const predictions = await this.model.detect(scaledCanvas, DETECTION_OPTIONS);

      // tag detections - too close to each other, to close to screen edge, is from top view, has a matching vertical pair
      const taggedPredictions = this.tagPredictions(predictions, { width: scaledCanvas.width, height: scaledCanvas.height });

      // inject the detection canvas into the video-capture-container and highlight detections
      this.displayDetectionCanvas(scaledCanvas, taggedPredictions);

      // create matching pairs of top view and non top view predictions
      const topViewPredictions = taggedPredictions.filter((p) => p.isTopView && p.matchingVerticalPairIndex !== -1);
      const pairedPredictions: PredictionsPair[] = topViewPredictions.map((p) => {
        return {
          topView: p,
          sideView: taggedPredictions[p.matchingVerticalPairIndex],
        };
      });

      // filter predictions: keep only top view predictions that are not too close to the screen edge or other detections.
      const validPredictionPairs = pairedPredictions.filter((p) => !p.topView.isTooCloseToScreenEdge && !p.topView.isTooCloseToOtherDetection);

      // scale up predictions to original image size
      const scaledPredictionPairs = this.scaleUpPredictions(validPredictionPairs, scalar);

      // add cropped detection images, centroid, and timestamp to detections
      const cropCanvas = document.createElement('canvas');
      const DetectionPairs = this.createDetections(imageCapture.timestamp, mergedCanvas, cropCanvas, scaledPredictionPairs);

      return DetectionPairs;
    } catch (error) {
      const message = 'Error during detection: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  public static getImageScalar(imageBitmap: ImageBitmap): number {
    const { width, height } = imageBitmap;
    const scalar = Math.min(1, MAX_DETECTION_DIMENSION / Math.max(width, height));

    return scalar;
  }

  private createDetections(
    timestamp: number,
    canvas: HTMLCanvasElement,
    cropCanvas: HTMLCanvasElement,
    predictionsPairs: PredictionsPair[],
  ): [Detection, Detection][] {
    return predictionsPairs.map((pair) => {
      const topViewDetectionImageURI = this.getCroppedImageURI(canvas, cropCanvas, pair.topView.box);
      const sideViewDetectionImageURI = this.getCroppedImageURI(canvas, cropCanvas, pair.sideView.box);

      const topViewDetection: Detection = {
        view: 'top',
        imageURI: topViewDetectionImageURI,
        timestamp,
        centroid: {
          x: pair.topView.box.left + pair.topView.box.width / 2,
          y: pair.topView.box.top + pair.topView.box.height / 2,
        },
        box: pair.topView.box,
      };

      const sideViewDetection: Detection = {
        view: 'side',
        imageURI: sideViewDetectionImageURI,
        timestamp,
        centroid: {
          x: pair.sideView.box.left + pair.sideView.box.width / 2,
          y: pair.sideView.box.top + pair.sideView.box.height / 2,
        },
        box: pair.sideView.box,
      };

      return [topViewDetection, sideViewDetection];
    });
  }

  private tagPredictions(predictions: automl.PredictedObject[], canvasDim: { width: number; height: number }): TaggedPredictionType[] {
    let taggedPredictions: TaggedPredictionType[] = predictions.map((prediction) => {
      return {
        ...prediction,
        isTopView: false,
        isTooCloseToScreenEdge: false,
        matchingVerticalPairIndex: -1,
        isTooCloseToOtherDetection: false,
      };
    });

    // tag isTopView
    taggedPredictions = taggedPredictions.map((prediction) => {
      // center Y is less than 2/3 of the canvas height
      const isTopView = prediction.box.top + prediction.box.height / 2 < canvasDim.height * (2 / 3);
      return {
        ...prediction,
        isTopView,
      };
    });

    // tag isTooCloseToScreenEdge
    taggedPredictions = taggedPredictions.map((prediction) => {
      const leftEdge = prediction.box.left;
      const rightEdge = prediction.box.left + prediction.box.width;
      const min_dist = 0.02 * canvasDim.width;

      const isTooCloseToScreenEdge = leftEdge < min_dist || rightEdge > canvasDim.width - min_dist;

      return {
        ...prediction,
        isTooCloseToScreenEdge,
      };
    });

    // tag matchingVerticalPairIndex
    taggedPredictions = taggedPredictions.map((prediction, index, originalPs) => {
      if (!prediction.isTopView) return prediction; // skip non top view predictions
      const centerX = prediction.box.left + prediction.box.width / 2;
      // for each prediction from the top view
      // find the closest prediction not from the top view that has a center x within MIN_DETECT_DIST_PERCENT of the top view prediction
      // and mark their index as matchingVerticalPairIndex as echothers index
      let closestIndex = -1;
      let closestDistance = null;
      for (let i = 0; i < originalPs.length; i++) {
        if (originalPs[i].isTopView) continue; // skip top view predictions
        if (index === i) continue; // skip itself
        const otherCenterX = originalPs[i].box.left + originalPs[i].box.width / 2;
        const distance = Math.abs(centerX - otherCenterX);
        if (closestDistance === null || distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }
      const matchingVerticalPairIndex = closestIndex;
      return {
        ...prediction,
        matchingVerticalPairIndex,
      };
    });

    // tag isTooCloseToOtherDetection
    taggedPredictions = taggedPredictions.map((prediction, index, originalPs) => {
      if (!prediction.isTopView) return prediction; // skip non top view predictions
      const leftEdge = prediction.box.left;
      const rightEdge = prediction.box.left + prediction.box.width;

      // Check if this box is too close to any other box
      const isTooCloseToOtherDetection = originalPs.some((otherP, otherIndex) => {
        if (!otherP.isTopView) return false; // Don't compare with non top view boxes
        if (index === otherIndex) return false; // Don't compare a box with itself

        const otherLeftEdge = otherP.box.left;
        const otherRightEdge = otherP.box.left + otherP.box.width;

        const min_dist = MIN_DETECT_DIST_PERCENT * canvasDim.width;

        // Check for overlap
        const isOverlapping = leftEdge < otherRightEdge && rightEdge > otherLeftEdge;
        // Check closeness between box's left edge and other box's edges
        const isLeftClose = Math.abs(leftEdge - otherLeftEdge) < min_dist || Math.abs(leftEdge - otherRightEdge) < min_dist;
        // Check closeness between box's right edge and other box's edges
        const isRightClose = Math.abs(rightEdge - otherLeftEdge) < min_dist || Math.abs(rightEdge - otherRightEdge) < min_dist;

        return isOverlapping || isLeftClose || isRightClose;
      });

      return {
        ...prediction,
        isTooCloseToOtherDetection,
      };
    });

    return taggedPredictions;
  }

  // Method to display detections on the canvas
  private displayDetectionCanvas(canvas: HTMLCanvasElement, prediction: TaggedPredictionType[]): void {
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.lineWidth = 3;
    // ctx.font = '16px Arial';
    // ctx.fillStyle = 'red';

    prediction.forEach((p) => {
      const { left, top, width, height } = p.box;
      ctx.strokeStyle = p.isTopView ? 'white' : 'blue';
      ctx.strokeStyle = p.matchingVerticalPairIndex !== -1 ? 'green' : ctx.strokeStyle;
      ctx.strokeStyle = p.isTooCloseToOtherDetection === true ? 'red' : ctx.strokeStyle;
      ctx.strokeStyle = p.isTooCloseToScreenEdge === true ? 'yellow' : ctx.strokeStyle;
      ctx.strokeRect(left, top, width, height);
    });

    //   redraw canvas in a new canvas that's 25% of the original canvas height
    const flattenedCanvas = document.createElement('canvas');
    flattenedCanvas.width = canvas.width;
    flattenedCanvas.height = canvas.height * 0.5;
    // set key to current timestamp
    flattenedCanvas.setAttribute('key', Date.now().toString());
    const ctx2 = flattenedCanvas.getContext('2d') as CanvasRenderingContext2D;
    ctx2.drawImage(canvas, 0, 0, flattenedCanvas.width, flattenedCanvas.height);
    // insert the new canvas into the video-capture-container
    const videoCaptureContainer = document.getElementById('video-capture-container');
    if (videoCaptureContainer) {
      while (videoCaptureContainer.children.length >= 6) {
        videoCaptureContainer.removeChild(videoCaptureContainer.children[videoCaptureContainer.children.length - 1]);
      }
      if (videoCaptureContainer.firstChild) {
        // If there is at least one child, insert before the first child
        videoCaptureContainer.insertBefore(flattenedCanvas, videoCaptureContainer.firstChild);
      } else {
        // If there are no children, appendChild will effectively add it to the top
        videoCaptureContainer.appendChild(flattenedCanvas);
      }
    }
  }

  private scaleCanvas(canvas: HTMLCanvasElement, scalar: number): HTMLCanvasElement {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.setAttribute('key', Date.now().toString());
    scaledCanvas.width = canvas.width * scalar;
    scaledCanvas.height = canvas.height * scalar;
    const ctx = scaledCanvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

    return scaledCanvas;
  }

  private mergeBitmaps(imageBitmap1: ImageBitmap, imageBitmap2: ImageBitmap): HTMLCanvasElement {
    // scale down image if it is too large
    const { width, height } = imageBitmap1;

    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = imageBitmap1.width;
    targetCanvas.height = imageBitmap1.height;
    const ctx = targetCanvas.getContext('2d') as CanvasRenderingContext2D;

    // Draw the middle half of imageBitmap1 on the top half of the canvas
    ctx.drawImage(
      imageBitmap1,
      0,
      height / 6,
      width,
      height * (2 / 3), // source rectangle
      0,
      0,
      targetCanvas.width,
      targetCanvas.height * (2 / 3), // destination rectangle on canvas
    );

    // Draw the middle half of imageBitmap2 on the bottom half of the canvas
    ctx.drawImage(
      imageBitmap2,
      0,
      height / 3,
      width,
      height / 3, // source rectangle
      0,
      targetCanvas.height * (2 / 3),
      targetCanvas.width,
      targetCanvas.height / 3, // destination rectangle on canvas
    );

    return targetCanvas;
  }

  private scaleUpPredictions(predictionsPairs: PredictionsPair[], scalar: number): PredictionsPair[] {
    return predictionsPairs.map((pair) => {
      return {
        topView: {
          ...pair.topView,
          box: {
            left: pair.topView.box.left / scalar,
            top: pair.topView.box.top / scalar,
            width: pair.topView.box.width / scalar,
            height: pair.topView.box.height / scalar,
          },
        },
        sideView: {
          ...pair.sideView,
          box: {
            left: pair.sideView.box.left / scalar,
            top: pair.sideView.box.top / scalar,
            width: pair.sideView.box.width / scalar,
            height: pair.sideView.box.height / scalar,
          },
        },
      };
    });
  }

  // Method to crop square detection images from an image
  private getCroppedImageURI(
    canvas: HTMLCanvasElement,
    cropCanvas: HTMLCanvasElement,
    box: { left: number; top: number; width: number; height: number },
  ): string {
    let { left, top, width, height } = box;
    // turn detection box into a square
    [left, top, width, height] =
      width > height ? [left, top - (width - height) / 2, width, width] : [left - (height - width) / 2, top, height, height];

    // create cropped imgUrl
    cropCanvas.width = CLASSIFICATION_DIMENSIONS.width;
    cropCanvas.height = CLASSIFICATION_DIMENSIONS.height;
    const ctx = cropCanvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(canvas, left, top, width, height, 0, 0, cropCanvas.width, cropCanvas.height);

    return cropCanvas.toDataURL('image/jpeg');
  }
}
