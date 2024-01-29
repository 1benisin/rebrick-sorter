export interface CameraDevice {
  deviceId: string;
  label: string;
}

export default class Camera {
  videoElement: HTMLVideoElement;
  canvasElement: HTMLCanvasElement;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    this.canvasElement = document.createElement("canvas");
  }

  async getCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    } catch (error) {
      console.error("Error accessing media devices:", error);
      return [];
    }
  }

  async selectCamera(cameraId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: cameraId },
      });
      this.videoElement.srcObject = stream;
    } catch (error) {
      console.error("Error accessing the selected camera:", error);
    }
  }

  stopCamera() {
    if (this.videoElement.srcObject) {
      const stream: MediaStream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }
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
