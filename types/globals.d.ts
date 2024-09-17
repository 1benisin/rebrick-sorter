// types/globals.d.ts

import { Interface } from 'readline';

declare global {
  class ImageCapture {
    constructor(track: MediaStreamTrack);
    takePhoto(): Promise<Blob>;
    grabFrame(): Promise<ImageBitmap>;
  }

  interface HTMLVideoElement {
    captureStream(frameRate?: number): MediaStream;
    videoTracks: MediaStreamTrack[];
  }
}

export {};
