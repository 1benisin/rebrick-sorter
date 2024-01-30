// camera-controller.ts

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export default class CameraController {
  videoElement: HTMLVideoElement;
  canvasElement: HTMLCanvasElement;

  constructor(videoId: string) {
    this.videoElement = document.getElementById(videoId) as HTMLVideoElement;
    this.canvasElement = document.createElement("canvas");
  }

  captureImage() {
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
        return this.canvasElement.toDataURL("image/png");
      } else {
        throw new Error("Unable to access canvas context");
      }
    } else {
      throw new Error("No video stream available");
    }
  }
}
