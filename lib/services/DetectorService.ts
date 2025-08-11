// lib/services/DetectorService.ts

// lib/dualDetector.ts

// detection-model.ts

import * as automl from '@tensorflow/tfjs-automl';
import '@tensorflow/tfjs-backend-webgl';
import { alertStore } from '@/stores/alertStore';
import { Detection } from '@/types/types';
import { Service, ServiceName, ServiceState } from './Service.interface';
import serviceManager from './ServiceManager';

export const CLASSIFICATION_DIMENSIONS = {
  width: 299,
  height: 299,
};
const DETECTION_MODEL_URL = '/detection-model/model.json';
const DETECTION_OPTIONS = { score: 0.5, iou: 0.5, topk: 5 };
const MAX_DETECTION_DIMENSION = 300; // max width or height of image to be used for detection
const MIN_DETECT_DIST_PERCENT = 0.1; // min percentage of detection image width two detections can be from each other
const CALIBRATION_SAMPLE_COUNT = 20;
const CALIBRATION_MIN_TIME_DIFF_MS = 150; // ignore tiny time gaps
const CALIBRATION_MIN_PIXEL_DELTA = 8; // ignore jitter/noise
const CALIBRATION_MAX_ITERATIONS = 400; // upper bound to avoid infinite loops
const CALIBRATION_MAX_Y_DELTA = 60; // avoid switching to other parts far in Y
const CALIBRATION_MIN_IOU = 0.2; // bounding box overlap continuity threshold

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

class DetectorService implements Service {
  private status: ServiceState = ServiceState.UNINITIALIZED;
  private model: automl.ObjectDetectionModel | null = null;
  private error: string | null = null;

  constructor() {}

  async init(): Promise<void> {
    this.status = ServiceState.INITIALIZING;

    try {
      // check if dependency is initialized
      const videoCaptureService = serviceManager.getService(ServiceName.VIDEO_CAPTURE);
      if (videoCaptureService.getStatus() !== ServiceState.INITIALIZED) {
        this.status = ServiceState.UNINITIALIZED;
        console.error('Failed to initialize DetectorService: dependencies not initialized');
        return;
      }

      // load object detection model
      await this.loadModel();
      this.status = ServiceState.INITIALIZED;
    } catch (error) {
      this.status = ServiceState.FAILED;
      this.error = 'Failed to initialize detector';
      throw error;
    }
  }

  getStatus(): ServiceState {
    return this.status;
  }

  getError(): string | null {
    return this.error;
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

  // Method to calibrate conveyor speed
  async calibrateConveyorSpeed(): Promise<number> {
    try {
      if (!this.model) {
        const error = 'Model not loaded. Call loadModel() first.';
        alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
        throw new Error(error);
      }

      console.log('Starting calibration...');
      // loop until we have enough distance samples
      const speedSamples: number[] = []; // pixels per millisecond
      let lastPosition: { x: number; y: number } | null = null;
      let lastBox: { left: number; top: number; width: number; height: number } | null = null;
      let lastTimestamp: number | null = null;
      let iterationCount = 0;

      while (speedSamples.length < CALIBRATION_SAMPLE_COUNT) {
        iterationCount++;

        const detectionPairs = await this.detect();

        if (detectionPairs.length === 0) {
          // brief delay to avoid hot-looping when there are no detections
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (iterationCount > CALIBRATION_MAX_ITERATIONS) {
            console.log(`Calibration timeout after ${CALIBRATION_MAX_ITERATIONS} iterations (no detections)`);
            throw new Error('Calibration timeout - unable to collect enough samples');
          }
          continue;
        }

        // Build a list of top-view detections for this frame
        const topDetections: Detection[] = detectionPairs.map((pair) => pair[0]);

        // Select detection:
        // - First frame: choose rightmost (largest x)
        // - Subsequent frames: choose the detection closest to lastPosition with continuity constraints
        let nextDetection: Detection;
        if (!lastPosition) {
          nextDetection = topDetections.reduce(
            (best, d) => (d.centroid.x > best.centroid.x ? d : best),
            topDetections[0],
          );
        } else {
          // Filter to those not jumping backwards in Y excessively and not moving right significantly
          const candidates = topDetections.filter((d) => {
            const dy = Math.abs(d.centroid.y - lastPosition!.y);
            const dx = d.centroid.x - lastPosition!.x;
            const iouVal = lastBox ? this.computeIoU(lastBox, d.box) : 1;
            return dy <= CALIBRATION_MAX_Y_DELTA && dx <= 2 && iouVal >= CALIBRATION_MIN_IOU; // expect small or negative dx (moving left)
          });

          const pool = candidates.length > 0 ? candidates : topDetections;

          nextDetection = pool.reduce((best, d) => {
            const bestDist =
              Math.abs(best.centroid.x - lastPosition!.x) + 0.3 * Math.abs(best.centroid.y - lastPosition!.y);
            const currDist = Math.abs(d.centroid.x - lastPosition!.x) + 0.3 * Math.abs(d.centroid.y - lastPosition!.y);
            return currDist < bestDist ? d : best;
          }, pool[0]);
        }

        if (lastPosition && lastTimestamp) {
          const timeDiff = nextDetection.timestamp - lastTimestamp;
          const pixelDelta = lastPosition.x - nextDetection.centroid.x; // expect decreasing x (right-to-left)
          // Only calculate speed if moving in expected direction and enough movement/time has occurred
          if (timeDiff >= CALIBRATION_MIN_TIME_DIFF_MS && pixelDelta >= CALIBRATION_MIN_PIXEL_DELTA && pixelDelta > 0) {
            const speed = pixelDelta / timeDiff; // pixels per ms
            speedSamples.push(speed);
            console.log(`Added speed sample: ${speed} (${speedSamples.length}/${CALIBRATION_SAMPLE_COUNT})`);
          }
        }

        lastPosition = { x: nextDetection.centroid.x, y: nextDetection.centroid.y };
        lastBox = nextDetection.box;
        lastTimestamp = nextDetection.timestamp;

        // Safety timeout
        if (iterationCount > CALIBRATION_MAX_ITERATIONS) {
          console.log(`Calibration timeout after ${CALIBRATION_MAX_ITERATIONS} iterations`);
          throw new Error('Calibration timeout - unable to collect enough samples');
        }

        // Add small delay between iterations
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // robust aggregation: trimmed mean (drop top/bottom 20%) and report also median
      speedSamples.sort((a, b) => a - b);
      const medianConveyorSpeed = speedSamples[Math.floor(speedSamples.length / 2)];
      const trimmed = this.computeTrimmedMean(speedSamples, 0.2);

      console.log(`Median conveyor speed: ${medianConveyorSpeed} pixels/ms`);
      console.log(`Trimmed-mean conveyor speed: ${trimmed} pixels/ms`);

      return trimmed;
    } catch (error) {
      const message = 'Error during calibration: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  private computeIoU(
    a: { left: number; top: number; width: number; height: number },
    b: { left: number; top: number; width: number; height: number },
  ): number {
    const ax1 = a.left;
    const ay1 = a.top;
    const ax2 = a.left + a.width;
    const ay2 = a.top + a.height;

    const bx1 = b.left;
    const by1 = b.top;
    const bx2 = b.left + b.width;
    const by2 = b.top + b.height;

    const ix1 = Math.max(ax1, bx1);
    const iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2);
    const iy2 = Math.min(ay2, by2);

    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;
    const areaA = (ax2 - ax1) * (ay2 - ay1);
    const areaB = (bx2 - bx1) * (by2 - by1);
    const union = areaA + areaB - inter;
    return union > 0 ? inter / union : 0;
  }

  private computeTrimmedMean(values: number[], trimFraction: number): number {
    if (values.length === 0) return 0;
    const n = values.length;
    const k = Math.floor(n * trimFraction);
    const trimmed = values.slice(k, Math.max(k, n - k));
    const sum = trimmed.reduce((acc, v) => acc + v, 0);
    return sum / Math.max(1, trimmed.length);
  }

  // Method to detect objects in an image
  async detect(): Promise<[Detection, Detection][]> {
    const videoCapture = serviceManager.getService(ServiceName.VIDEO_CAPTURE);

    // Check if model is loaded
    if (!this.model) {
      const error = 'Model not loaded. Call loadModel() first.';
      alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
      throw new Error(error);
    }

    try {
      // Capture an image from the camera
      const imageCapture = await videoCapture.captureImage();

      // scale down original image to speed up detection
      const scalar = this.getImageScalar(imageCapture.imageBitmaps[0]);

      // merge the two images into one - top view is top 2/3 of the image, front view is bottom 1/3
      const mergedCanvas = this.mergeBitmaps(imageCapture.imageBitmaps[0], imageCapture.imageBitmaps[1]);

      // scale down merged image to speed up detection
      const scaledCanvas = this.scaleCanvas(mergedCanvas, scalar);

      // detect objects in the image
      const predictions = await this.model.detect(scaledCanvas, DETECTION_OPTIONS);

      // tag detections - too close to each other, to close to screen edge, is from top view, has a matching vertical pair
      const taggedPredictions = this.tagPredictions(predictions, {
        width: scaledCanvas.width,
        height: scaledCanvas.height,
      });

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
      const validPredictionPairs = pairedPredictions.filter(
        (p) => !p.topView.isTooCloseToScreenEdge && !p.topView.isTooCloseToOtherDetection,
      );

      // scale up predictions to original image size
      const scaledPredictionPairs = this.scaleUpPredictions(validPredictionPairs, scalar);

      // add cropped detection images, centroid, and timestamp to detections
      const cropCanvas = document.createElement('canvas');
      const DetectionPairs = this.createDetections(
        imageCapture.timestamp,
        mergedCanvas,
        cropCanvas,
        scaledPredictionPairs,
      );

      return DetectionPairs;
    } catch (error) {
      const message = 'Error during detection: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  public getImageScalar(imageBitmap: ImageBitmap): number {
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

  private tagPredictions(
    predictions: automl.PredictedObject[],
    canvasDim: { width: number; height: number },
  ): TaggedPredictionType[] {
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
      // Changed from (2/3) to (3/5) to match mergeBitmaps proportion
      const isTopView = prediction.box.top + prediction.box.height / 2 < canvasDim.height * (3 / 5);
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

      let closestIndex = -1;
      let closestDistance = null;
      for (let i = 0; i < originalPs.length; i++) {
        if (originalPs[i].isTopView) continue; // skip top view predictions
        if (index === i) continue; // skip itself

        // For side view, we need to flip the x-coordinate since the image is flipped
        const sideViewCenterX = canvasDim.width - (originalPs[i].box.left + originalPs[i].box.width / 2);
        const distance = Math.abs(centerX - sideViewCenterX);

        if (closestDistance === null || distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }

      return {
        ...prediction,
        matchingVerticalPairIndex: closestIndex,
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
    // const template = document.getElementById('video-capture-canvas-template') as HTMLTemplateElement;
    // const clone = document.importNode(template!.content, true);
    // const flattenedCanvas = clone.querySelector('canvas') as HTMLCanvasElement;
    const flattenedCanvas = document.createElement('canvas');

    // const flattenedCanvas = document.createElement('canvas');
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
    const { width, height } = imageBitmap1;

    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = height;
    const ctx = targetCanvas.getContext('2d') as CanvasRenderingContext2D;

    // Calculate the middle portion of source images
    const sourceYOffset = height * 0.2; // Skip 20% from top
    const sourceHeight = height * 0.6; // Use middle 60% of source image

    // Draw the first image in the top 3/5 of the canvas
    ctx.drawImage(
      imageBitmap1,
      0,
      sourceYOffset,
      width,
      sourceHeight, // source dimensions (middle portion)
      0,
      0,
      width,
      height * 0.6, // destination dimensions (60% of canvas)
    );

    // For the second image: save context, flip horizontally, draw, then restore
    ctx.save();
    ctx.scale(-1, 1); // Flip horizontally
    ctx.drawImage(
      imageBitmap2,
      0,
      sourceYOffset, // Use same offset as top view
      width,
      sourceHeight, // Use same height as top view
      -width, // Need to use negative width when flipped
      height * 0.6, // Start at 60% of height
      width,
      height * 0.4, // Use remaining 40% of height
    );
    ctx.restore();

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
      width > height
        ? [left, top - (width - height) / 2, width, width]
        : [left - (height - width) / 2, top, height, height];

    // create cropped imgUrl
    cropCanvas.width = CLASSIFICATION_DIMENSIONS.width;
    cropCanvas.height = CLASSIFICATION_DIMENSIONS.height;
    const ctx = cropCanvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(canvas, left, top, width, height, 0, 0, cropCanvas.width, cropCanvas.height);

    return cropCanvas.toDataURL('image/jpeg');
  }
}

const detectorService = new DetectorService();
export default detectorService;
