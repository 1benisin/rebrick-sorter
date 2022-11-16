//
import { useEffect, useState, useRef } from 'react';
import { Row } from 'react-bootstrap';
import { DISPLAY_DIMENSIONS } from '../logic/globalConfig';
import { useAtom } from 'jotai';
import { videoRefAtom, canvasRefAtom } from '../logic/atoms';
import styled from 'styled-components';
import { getMediaStream } from '../logic/videoManager';

const VideoCapture = ({ onVideoClick, onCanvasClick }) => {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [_videoRef, setVideoRef] = useAtom(videoRefAtom);
  const [_canvasRef, setCanvasRef] = useAtom(canvasRefAtom);

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
