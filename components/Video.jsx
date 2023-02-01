//
import { useEffect, useState, useRef } from 'react';
import { DISPLAY_DIMENSIONS } from '../logic/globalConfig';
import mediaStore from '../lib/stores/mediaStore';
import styled from 'styled-components';
import { getMediaStream } from '../lib/mediaManager';

const VideoCapture = ({ onVideoClick, onCanvasClick }) => {
  const videoRef = useRef();
  const canvasRef = useRef();

  const setVideoRef = mediaStore((state) => state.setVideoRef);
  const setCanvasRef = mediaStore((state) => state.setCanvasRef);

  useEffect(() => {
    setVideoRef(videoRef);
    setCanvasRef(canvasRef);
  }, [videoRef, canvasRef]);

  useEffect(() => {
    getMediaStream().then((stream) => (videoRef.current.srcObject = stream));
  }, []);

  return (
    <Container>
      <video
        id={`smallVideo`}
        width={DISPLAY_DIMENSIONS.width}
        height={DISPLAY_DIMENSIONS.height}
        autoPlay
        muted
        ref={videoRef}
        onClick={onVideoClick}
      />
      <div style={{ position: 'relative' }}>
        <canvas
          id={`displayCanvas`}
          width={DISPLAY_DIMENSIONS.width}
          height={DISPLAY_DIMENSIONS.height}
          ref={canvasRef}
          style={{
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
          }}
        />
        <canvas
          id={`overlayCanvas`}
          width={DISPLAY_DIMENSIONS.width}
          height={DISPLAY_DIMENSIONS.height}
          style={{
            // backgroundColor: 'rgba(255, 0, 0, 0.2)',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10,
          }}
          onClick={onCanvasClick}
        />
      </div>
    </Container>
  );
};
export default VideoCapture;

const Container = styled.div`
  display: flex;
  // margin: 5px;
`;
