import { useRef, useEffect, useCallback, useState } from 'react';
import Head from 'next/head';
import { useAtom } from 'jotai';
import { Button } from 'react-bootstrap';
import ProtectedRoute from '../components/ProtectedRoute';
import VideoCapture from '../components/VideoCapture';
import DetectionToggleButton from '../components/DetectionToggleButton';
import { start, stop, captureToCanvas } from '../logic/videoManager';
import { videoRefAtom, canvasRefAtom } from '../logic/atoms';
import { createSocketListener, emitTest } from '../logic/socketManager';

export default function Search() {
  const [videoRef, setVideoRef] = useAtom(videoRefAtom);
  const [canvasRef, setCanvasRef] = useAtom(canvasRefAtom);

  return (
    <>
      <Head>
        <title>Video Experiment</title>
      </Head>

      <ProtectedRoute>
        <title>Video Experiment</title>
        <Button onClick={() => emitTest('test data')}>emitTest</Button>
        <Button
          variant="success"
          onClick={() => captureToCanvas(videoRef, canvasRef)}
        >
          Capture
        </Button>
        <DetectionToggleButton />
        <VideoCapture />
      </ProtectedRoute>
    </>
  );
}
