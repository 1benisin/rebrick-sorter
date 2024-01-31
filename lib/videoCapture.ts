// camera-controller.ts

import { sortProcessStore } from "@/stores/sortProcessStore";

export type ImageCapture = {
  canvas: HTMLCanvasElement;
  timestamp: number;
};

export default class VideoCapture {
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  public videoId: string;

  constructor(videoId: string) {
    this.videoId = videoId;
    this.videoElement = document.getElementById(videoId) as HTMLVideoElement;
    if (!this.videoElement) {
      const error = "Video element not found: " + videoId;
      sortProcessStore.getState().addError(error);
      throw new Error(error);
    }
    this.canvasElement = document.createElement("canvas");
  }

  captureImage(): ImageCapture {
    if (this.videoElement.srcObject) {
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;
      const context = this.canvasElement.getContext("2d");
      if (context) {
        context.drawImage(
          this.videoElement,
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
