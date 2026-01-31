// types/imageCapture.d.ts

/**
 * Represents the result of capturing frames from both cameras.
 * Created by VideoCaptureService.captureImage() using ImageCapture.grabFrame().
 */
export type ImageCaptureType = {
  /** Pair of image bitmaps from top and side cameras */
  imageBitmaps: [ImageBitmap, ImageBitmap];

  /** Unix timestamp (ms) when capture was initiated */
  timestamp: number;

  /**
   * Encoder position (ticks) at the moment of capture.
   * Read from sortProcessStore.encoderPosition before async frame grab.
   * Used for encoder-based detection matching and position calculation.
   */
  encoderAtCapture: number;
};
