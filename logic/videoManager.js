import { useState, useEffect, useCallback } from 'react';
import { mediaDim } from './globalConfig';
import { detectingAtom } from './atoms';
import { useAtom } from 'jotai';
import { classify, detect } from './modelManager';

const mediaStream = null;
const imageCapture = null;

// capture to canvas
export const getDectections = async (videoRef, canvasRef) => {
  const imgCapture = getImageCapture();
  const img = await imgCapture.grabFrame();
  // draw calls
  const displayCanvas = canvasRef.current;
  const displayCtx = displayCanvas.getContext('2d');
  displayCtx.drawImage(
    img,
    0,
    0,
    img.width,
    img.height,
    0,
    0,
    displayCanvas.width,
    displayCanvas.height
  );

  const imageData = displayCtx.getImageData(
    0,
    0,
    displayCanvas.width,
    displayCanvas.height
  );

  // get scaling dimensions
  // if (!scalar) scalar = img.width / DETECT_DIMENSIONS.width;

  // DETECT
  const detections = await getDetections(imageData);
  console.log(detections);
  return detections;
  // CLASSIFY
  // const newDetections = [];
  // for (const detection of detections) {
  //   const classificationResults = await classifyFromDetection(detection, img);
  //   // will return null if cropped detection box overlaps outside of screen
  //   if (classificationResults)
  //     newDetections.push({ ...classificationResults, captureTime });
  // }

  // return newDetections;
};

export const getImageCapture = async () => {
  if (imageCapture) return imageCapture;

  const [track] = getMediaStream().getVideoTracks();
  imageCapture = new ImageCapture(track);
  return imageCapture;
};

export const getMediaStream = async () => {
  if (mediaStream) return mediaStream;

  try {
    // get video devices for multiple cameras
    let devices = await navigator.mediaDevices.enumerateDevices();

    // filter for video and sort UC40M cameras first
    devices = devices
      .filter((d) => d.kind === 'videoinput')
      .sort((a, b) => {
        if (a.label.includes('FaceTime')) return 1;
        if (a.label.includes('UC40M')) return -1;
        return 0;
      });

    const requestedMedia = {
      audio: false,
      video: {
        deviceId: { exact: devices[0].deviceId },
        width: { ideal: mediaDim.width },
        height: { ideal: mediaDim.height },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(requestedMedia);

    // log stream dimensions
    // const trackSettings = stream.getVideoTracks()[0].getSettings();
    // console.log(`${device.label} Dimensions: ${trackSettings.width} x ${trackSettings.height}`);

    mediaStream = stream;
    return mediaStream;
  } catch (err) {
    console.error('Error getting mediaStream', err);
  }
};

export const captureToCanvas = async (videoRef, canvasRef) => {
  const canvas = canvasRef.current;
  const ctx1 = canvas.getContext('2d');
  ctx1.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
};
