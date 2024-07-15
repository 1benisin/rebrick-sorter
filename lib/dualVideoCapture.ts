// lib/dualVideoCapture.ts

// dualVideoCapture.ts

import { sortProcessStore } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';
import { ImageCaptureType } from '@/types/imageCapture';
import { initialize } from 'next/dist/server/lib/render-server';

class DualVideoCapture {
  static instance: DualVideoCapture;
  private imageCapture1: ImageCapture | null = null;
  private imageCapture2: ImageCapture | null = null;
  private videoStreamId: string = '';
  private videoStreamId2: string = '';

  private constructor() {}

  public static getInstance(): DualVideoCapture {
    if (!DualVideoCapture.instance) {
      DualVideoCapture.instance = new DualVideoCapture();
    }
    return DualVideoCapture.instance;
  }

  // Function to initialize or update the MediaStream track for ImageCapture
  init = async (videoStreamId: string, videoStreamId2: string): Promise<void> => {
    if (this.videoStreamId === videoStreamId && this.videoStreamId2 === videoStreamId2) return;
    console.log('Initializing ImageCapture with videoStreamId:', videoStreamId);
    try {
      this.videoStreamId = videoStreamId;
      this.videoStreamId2 = videoStreamId2;
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
        const mediaStream1 = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: videoStreamId,
            width: { ideal: 3840, max: 3840 },
            height: { ideal: 2160, max: 2160 },
          },
        });
        const mediaStream2 = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: videoStreamId2,
            width: { ideal: 3840, max: 3840 },
            height: { ideal: 2160, max: 2160 },
          },
        });
        const videoTracks1 = mediaStream1.getVideoTracks();
        const videoTracks2 = mediaStream2.getVideoTracks();
        if (videoTracks1.length === 0) {
          const error = 'No video tracks available in the provided stream1.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }
        if (videoTracks2.length === 0) {
          const error = 'No video tracks available in the provided stream2.';
          alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
          throw new Error(error);
        }
        this.imageCapture1 = new ImageCapture(videoTracks1[0]);
        this.imageCapture2 = new ImageCapture(videoTracks2[0]);
      }
      // setup VideoCaptureDimensions
      const imageBitmap = await this.imageCapture1.grabFrame();
      console.log('ImageCapture1 initialized with dimensions:', imageBitmap.width, imageBitmap.height);
      sortProcessStore.getState().setVideoCaptureDimensions(imageBitmap.width, imageBitmap.height);

      const imageBitmap2 = await this.imageCapture1.grabFrame();
      console.log('ImageCapture2 initialized with dimensions:', imageBitmap2.width, imageBitmap2.height);
    } catch (error) {
      console.error('Error initializing ImageCapture:', error);
    }
  };

  // Function to capture a photo from the current track
  public async captureImage(): Promise<ImageCaptureType> {
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

      // Create a canvas to flip imageBitmap2
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = imageBitmap2.width;
      canvas.height = imageBitmap2.height;
      ctx.translate(imageBitmap2.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(imageBitmap2, 0, 0);
      const flippedImageBitmap2 = await createImageBitmap(canvas);

      return { imageBitmaps: [imageBitmap1, flippedImageBitmap2], timestamp: captureTime };
    } catch (error) {
      const message = 'Error taking photos: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }
}

export default DualVideoCapture;
