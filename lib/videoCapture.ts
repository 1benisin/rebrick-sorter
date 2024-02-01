// camera-controller.ts

import { sortProcessStore } from "@/stores/sortProcessStore";

export type ImageCapture = {
  canvas: HTMLCanvasElement;
  timestamp: number;
};

export default class VideoCapture {
  private canvasElement: HTMLCanvasElement;
  public videoId: string;

  constructor(videoId: string) {
    this.videoId = videoId;
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    if (!videoElement) {
      const error = "Video element not found: " + videoId;
      sortProcessStore.getState().addError(error);
      throw new Error(error);
    }
    this.canvasElement = document.createElement("canvas");
  }

  captureImage(): ImageCapture {
    const videoElement = document.getElementById(
      this.videoId
    ) as HTMLVideoElement;
    // Check if the video element is in a state ready to be captured:  2 = HAVE_CURRENT_DATA
    if (videoElement.readyState >= 2) {
      this.canvasElement.width = videoElement.videoWidth;
      this.canvasElement.height = videoElement.videoHeight;
      const context = this.canvasElement.getContext("2d");
      if (context) {
        context.drawImage(
          videoElement,
          0,
          0,
          this.canvasElement.width,
          this.canvasElement.height
        );
        return { canvas: this.canvasElement, timestamp: Date.now() };
      } else {
        const error = "Unable to access canvas context: " + this.videoId;
        sortProcessStore.getState().addError(error);
        throw new Error(error);
      }
    } else {
      const error = "No video stream available: " + this.videoId;
      sortProcessStore.getState().addError(error);
      throw new Error(error);
    }
  }
}
