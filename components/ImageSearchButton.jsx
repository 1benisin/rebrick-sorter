import { Button } from 'react-bootstrap';
import React, { useState } from 'react';

const ImageSearchButton = () => {
  const [stream, setStream] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        setStream(stream);
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const stopStream = () => {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    setStream(null);
  };

  const captureImage = () => {
    const canvas = document.createElement('canvas');
    const video = document.querySelector('video');

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const maxSize = 1024;
    const scalingFactor =
      videoWidth <= maxSize && videoHeight <= maxSize
        ? 1
        : videoHeight <= videoWidth
        ? maxSize / videoWidth
        : maxSize / videoHeight;
    canvas.width = videoWidth * scalingFactor;
    canvas.height = videoHeight * scalingFactor;

    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/png');
    // create buffer from image data
    // const buffer = Buffer.from(imageData.split(',')[1], 'base64');

    // const jsonimage =JSON.stringify({ imageData })
    console.log(typeof imageData, imageData.slice(0, 100));
    // Send the image data to the backend
    // const formData = new FormData();
    // formData.append('query_image', imageData);

    setLoading(true);
    fetch('/api/brickognize', {
      method: 'POST',
      body: JSON.stringify({ imageData }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setLoading(false);
        setImageData(null);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
        setImageData(null);
      });

    stopStream();
  };

  const createFileFromCanvas = (canvas, fileName, mimeType) => {
    const dataURL = canvas.toDataURL(mimeType, 0.9);
    const binaryData = Buffer.from(dataURL.split(',')[1], 'base64');
    const contentType = dataURL.split(',')[0].split(':')[1].split(';')[0];
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData[i];
    }
    const blob = new Blob([bytes], { type: contentType });
    const file = new File([blob], fileName, { type: contentType });
    return file;
  };

  const sendImage = (formData) => {
    setLoading(true);
    fetch('/api/brickognize', {
      method: 'POST',
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setLoading(false);
        setImageData(null);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
        setImageData(null);
      });
  };

  return (
    <div>
      {!stream && !imageData && <Button onClick={onClick}>Open Camera</Button>}
      {stream && (
        <div>
          <video
            ref={(ref) => {
              if (ref) ref.srcObject = stream;
            }}
            autoPlay
          />
          <Button onClick={captureImage}>Capture Image</Button>
          <Button onClick={stopStream}>Close Camera</Button>
        </div>
      )}
      {imageData && (
        <div>
          <img src={imageData} alt="Captured" />
          <Button onClick={sendImage} disabled={loading}>
            Search
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageSearchButton;
