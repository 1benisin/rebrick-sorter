// types/imageCapture.d.ts

// ImageCaptureType is a type that represents the imageBitmap and the timestamp of the image capture process
// create after using ImageCatpure.grabFrame() method
export type ImageCaptureType = { imageBitmaps: [ImageBitmap, ImageBitmap]; timestamp: number };
