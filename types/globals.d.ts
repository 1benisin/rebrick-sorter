import { Interface } from 'readline';

declare global {
  class ImageCapture {
    constructor(track: MediaStreamTrack);
    takePhoto(): Promise<Blob>;
    grabFrame(): Promise<ImageBitmap>;
  }
  interface HTMLVideoElement_extended extends HTMLVideoElement {
    captureStream(): MediaStream;
    videoTracks: MediaStreamTrack[];
  }
}

export {};
