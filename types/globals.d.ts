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
