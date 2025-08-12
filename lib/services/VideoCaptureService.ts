// lib/services/VideoCaptureService.ts

import { Service, ServiceName, ServiceState } from './Service.interface';
import serviceManager from './ServiceManager';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { alertStore } from '@/stores/alertStore';
import { ImageCaptureType } from '@/types/imageCapture';

class VideoCaptureService implements Service {
  private status: ServiceState = ServiceState.UNINITIALIZED;
  private imageCapture1: ImageCapture | null = null;
  private imageCapture2: ImageCapture | null = null;
  private videoStreamId1: string = '';
  private videoStreamId2: string = '';

  constructor() {}

  async init(): Promise<void> {
    try {
      // check if dependency is initialized
      const settingsService = serviceManager.getService(ServiceName.SETTINGS);
      const settings = settingsService.getSettings();
      if (settingsService.getStatus() !== ServiceState.INITIALIZED || !settings) {
        console.log('----settings', settingsService.getStatus(), settings);
        this.status = ServiceState.UNINITIALIZED;
        console.error('Failed to initialize VideoCaptureService: dependencies not initialized');
        return;
      }

      const videoStreamId1 = settings.videoStreamId1;
      const videoStreamId2 = settings.videoStreamId2;

      // if videoStreamId1 || videoStreamId2)are an empty string
      if (!videoStreamId1 || !videoStreamId2) {
        console.log('No video stream ids available.');
        this.status = ServiceState.FAILED;
        return;
      }

      await this.initializeImageCapture(videoStreamId1, videoStreamId2);
      this.status = ServiceState.INITIALIZED;
      console.log('VIDEO CAPTURE SERVICE INITIALIZED');
    } catch (error) {
      console.error('Failed to initialize video capture service:', error);
      this.status = ServiceState.FAILED;
    }
  }

  private async initializeImageCapture(videoStreamId1: string, videoStreamId2: string): Promise<void> {
    if (this.videoStreamId1 === videoStreamId1 && this.videoStreamId2 === videoStreamId2) return;
    console.log('Initializing ImageCapture with videoStreamId1:', videoStreamId1);

    this.videoStreamId1 = videoStreamId1;
    this.videoStreamId2 = videoStreamId2;

    await this.initializeWebcamStream();

    await this.setupVideoCaptureDimensions();
  }

  private async initializeTestStream(): Promise<void> {
    const videoElement1 = document.getElementById('video1') as HTMLVideoElement;
    const videoElement2 = document.getElementById('video2') as HTMLVideoElement;
    if (!videoElement1 || !videoElement2) {
      const error = 'One of the Video elements not found.';
      alertStore.getState().addAlert({ type: 'error', message: error, timestamp: Date.now() });
      throw new Error(error);
    }

    const mediaStream1 = videoElement1.captureStream();
    const mediaStream2 = videoElement2.captureStream();

    this.imageCapture1 = new ImageCapture(mediaStream1.getVideoTracks()[0]);
    this.imageCapture2 = new ImageCapture(mediaStream2.getVideoTracks()[0]);
  }

  private async initializeWebcamStream(): Promise<void> {
    const mediaStream1 = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: this.videoStreamId1,
        width: { ideal: 3840, max: 3840 },
        height: { ideal: 2160, max: 2160 },
      },
    });
    const mediaStream2 = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: this.videoStreamId2,
        width: { ideal: 3840, max: 3840 },
        height: { ideal: 2160, max: 2160 },
      },
    });

    const settings1 = mediaStream1.getVideoTracks()[0].getSettings();
    console.log('mediaStream1', settings1.width, settings1.height);

    const settings2 = mediaStream2.getVideoTracks()[0].getSettings();
    console.log('mediaStream2', settings2.width, settings2.height);

    this.imageCapture1 = new ImageCapture(mediaStream1.getVideoTracks()[0]);
    this.imageCapture2 = new ImageCapture(mediaStream2.getVideoTracks()[0]);
  }

  private async setupVideoCaptureDimensions(): Promise<void> {
    if (!this.imageCapture1 || !this.imageCapture2) return;

    const imageBitmap1 = await this.imageCapture1.grabFrame();
    console.log('ImageCapture1 initialized with dimensions:', imageBitmap1.width, imageBitmap1.height);
    sortProcessStore.getState().setVideoCaptureDimensions(imageBitmap1.width, imageBitmap1.height);

    const imageBitmap2 = await this.imageCapture2.grabFrame();
    console.log('ImageCapture2 initialized with dimensions:', imageBitmap2.width, imageBitmap2.height);
  }

  public async captureImage(): Promise<ImageCaptureType> {
    if (!this.imageCapture1 || !this.imageCapture2) {
      const message = 'An ImageCapture not initialized';
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }

    try {
      const imageBitmap1 = await this.imageCapture1.grabFrame();
      const imageBitmap2 = await this.imageCapture2.grabFrame();
      const captureTime = Date.now();

      // Do not flip here; mergeBitmaps in DetectorService handles the flip once
      return { imageBitmaps: [imageBitmap1, imageBitmap2], timestamp: captureTime };
    } catch (error) {
      const message = 'Error taking photos: ' + error;
      console.error(message);
      alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
      throw new Error(message);
    }
  }

  private async flipImageBitmap(imageBitmap: ImageBitmap): Promise<ImageBitmap> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    ctx.translate(imageBitmap.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(imageBitmap, 0, 0);
    return await createImageBitmap(canvas);
  }

  getStatus(): ServiceState {
    return this.status;
  }
}

const videoCaptureService = new VideoCaptureService();
export default videoCaptureService;
