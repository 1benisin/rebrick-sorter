// camera-controller.ts

import { sortProcessStore } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';

// VideoCapture.ts

// had to delare global because typscript does not have these in the imports
declare global {
  class ImageCapture {
    constructor(track: MediaStreamTrack);
    takePhoto(): Promise<Blob>;
    grabFrame(): Promise<ImageBitmap>;
  }
  class HTMLVideoElement_extended extends HTMLVideoElement {
    captureStream(): MediaStream;
    videoTracks: MediaStreamTrack[];
  }
}

class VideoCapture {
  private imageCapture: ImageCapture | null = null;
  private videoStreamId: string = '';

  constructor() {
    // Initial setup can be done here if needed
    this.setupImageCaptureTrack();
  }

  // Function to initialize or update the MediaStream track for ImageCapture
  private async setupImageCaptureTrack(): Promise<void> {
    try {
      const videoStreamId = sortProcessStore.getState().videoStreamId;

      this.videoStreamId = videoStreamId;
      if (videoStreamId.slice(0, 4) === 'test') {
        // if videoStreamId is a test stream, use the video element to capture the stream
        const videoElement = document.getElementById('video') as HTMLVideoElement_extended;
        if (!videoElement) {
          const error = 'Video element not found: video';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }

        const mediaStream = videoElement.captureStream();
        const videoTracks = mediaStream.getVideoTracks();
        if (videoTracks.length === 0) {
          const error = 'No video tracks available in the provided stream.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }
        this.imageCapture = new ImageCapture(videoTracks[0]);
      } else {
        // else use webcam to capture the stream
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: videoStreamId } });
        const videoTracks = mediaStream.getVideoTracks();
        if (videoTracks.length === 0) {
          const error = 'No video tracks available in the provided stream.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }
        this.imageCapture = new ImageCapture(videoTracks[0]);
      }
      // setup VideoCaptureDimensions
      const imageBitmap = await this.imageCapture.grabFrame();

      sortProcessStore.getState().setVideoCaptureDimensions(imageBitmap.width, imageBitmap.height);
    } catch (error) {
      console.error('Error initializing ImageCapture:', error);
    }
  }

  private async checkImageCaptureIsCurrent(): Promise<void> {
    // make sure it matches videostreamId in case it was changed
    const videoStreamId = sortProcessStore.getState().videoStreamId;
    if (!this.imageCapture || this.videoStreamId !== videoStreamId) {
      await this.setupImageCaptureTrack();
    }
  }

  // Function to capture a photo from the current track
  public async captureImage(): Promise<{ imageBitmap: ImageBitmap; timestamp: number } | null> {
    await this.checkImageCaptureIsCurrent();

    if (!this.imageCapture) {
      console.error('ImageCapture not initialized. Call updateImageCaptureTrack first.');
      return null;
    }

    try {
      const captureTime = Date.now();
      const imageBitmap = await this.imageCapture.grabFrame();

      return { imageBitmap, timestamp: captureTime };
    } catch (error) {
      const message = 'Error taking photo: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      return null;
    }
  }
}

export default VideoCapture;

// export default class VideoCapture {
//   private canvasElement: HTMLCanvasElement;
//   public videoId: string;

//   constructor(videoId: string) {
//     this.videoId = videoId;
//     const videoElement = document.getElementById(videoId) as HTMLVideoElement;
//     if (!videoElement) {
//       const error = 'Video element not found: ' + videoId;
//       alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
//       throw new Error(error);
//     }
//     this.canvasElement = document.createElement('canvas');
//     sortProcessStore.getState().setVideoCaptureDimensions(videoElement.videoWidth, videoElement.videoHeight);
//   }

//   captureImage(): ImageCapture {
//     const videoElement = document.getElementById(this.videoId) as HTMLVideoElement;
//     // Check if the video element is in a state ready to be captured:  2 = HAVE_CURRENT_DATA
//     if (videoElement.readyState >= 2) {
//       this.canvasElement.width = videoElement.videoWidth;
//       this.canvasElement.height = videoElement.videoHeight;
//       const context = this.canvasElement.getContext('2d');
//       if (context) {
//         context.drawImage(videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
//         return { canvas: this.canvasElement, timestamp: Date.now() };
//       } else {
//         const error = 'Unable to access canvas context: ' + this.videoId;
//         alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
//         throw new Error(error);
//       }
//     } else {
//       const error = 'No video stream available: ' + this.videoId;
//       alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
//       throw new Error(error);
//     }
//   }
// }
