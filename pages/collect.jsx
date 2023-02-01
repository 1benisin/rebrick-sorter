import Head from 'next/head';
import { Button } from 'react-bootstrap';
import ProtectedRoute from '../components/ProtectedRoute';
import VideoCapture from '../components/Video';
import DetectionToggleButton from '../components/DetectionToggleButton';
import { start, stop, captureToCanvas } from '../lib/mediaManager';
import { videoRefAtom, canvasRefAtom } from '../logic/atoms';
import { createSocketListener, emitTest } from '../logic/socketManager';
import mediaStore from '../lib/stores/mediaStore';

export default function Collect() {
  const videoRef = mediaStore((state) => state.videoRef);
  const canvasRef = mediaStore((state) => state.canvasRef);

  return (
    <>
      <Head>
        <title>Collect Class Images</title>
      </Head>

      <ProtectedRoute>
        <title>Video Experiment</title>
        <Button onClick={() => emitTest('test data')}>emitTest</Button>
        <Button variant="success" onClick={() => captureToCanvas(videoRef, canvasRef)}>
          Capture
        </Button>
        <DetectionToggleButton />
        <VideoCapture />
      </ProtectedRoute>
    </>
  );
}
