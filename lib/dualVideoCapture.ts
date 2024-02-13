// dualVideoCapture.ts

import { sortProcessStore } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';
import { ImageCaptureType } from '@/types/imageCapture.type';

class DualVideoCapture {
  private imageCapture1: ImageCapture | null = null;
  private imageCapture2: ImageCapture | null = null;
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
        const videoElement1 = document.getElementById('video1') as HTMLVideoElement_extended; // HTMLVideoElement_extended is a custom type in globals.d.ts
        const videoElement2 = document.getElementById('video1') as HTMLVideoElement_extended;
        if (!videoElement1 || !videoElement2) {
          const error = 'One of the Video elements not found.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }

        const mediaStream1 = videoElement1.captureStream();
        const mediaStream2 = videoElement2.captureStream();
        const videoTracks1 = mediaStream1.getVideoTracks();
        const videoTracks2 = mediaStream2.getVideoTracks();
        if (videoTracks1.length === 0 || videoTracks2.length === 0) {
          const error = 'No video tracks available in the provided stream.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }
        this.imageCapture1 = new ImageCapture(videoTracks1[0]);
        this.imageCapture2 = new ImageCapture(videoTracks2[0]);
      } else {
        // else use webcam to capture the stream
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: videoStreamId } });
        const videoTracks = mediaStream.getVideoTracks();
        if (videoTracks.length === 0) {
          const error = 'No video tracks available in the provided stream.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }
        this.imageCapture1 = new ImageCapture(videoTracks[0]);
        this.imageCapture2 = new ImageCapture(videoTracks[0]);
      }
      // setup VideoCaptureDimensions
      const imageBitmap = await this.imageCapture1.grabFrame();

      sortProcessStore.getState().setVideoCaptureDimensions(imageBitmap.width, imageBitmap.height);
    } catch (error) {
      console.error('Error initializing ImageCapture:', error);
    }
  }

  private async checkImageCaptureIsCurrent(): Promise<void> {
    // make sure it matches videostreamId in case it was changed
    const videoStreamId = sortProcessStore.getState().videoStreamId;
    if (!this.imageCapture1 || this.videoStreamId !== videoStreamId) {
      await this.setupImageCaptureTrack();
    }
  }

  // Function to capture a photo from the current track
  public async captureImage(): Promise<ImageCaptureType> {
    await this.checkImageCaptureIsCurrent();

    if (!this.imageCapture1 || !this.imageCapture2) {
      const message = 'An ImageCapture not initialized';
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }

    try {
      const captureTime = Date.now();
      const imageBitmap1 = await this.imageCapture1.grabFrame();
      const imageBitmap2 = await this.imageCapture2.grabFrame();

      return { imageBitmaps: [imageBitmap1, imageBitmap2], timestamp: captureTime };
    } catch (error) {
      const message = 'Error taking photos: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }
}

export default DualVideoCapture;
