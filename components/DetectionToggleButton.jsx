import React, { useRef } from 'react';
import ToggleButton from './ToggleButton';
import { start, stop } from '../logic/detectionManager';
import { useAtom } from 'jotai';
import { videoRefAtom, canvasRefAtom } from '../logic/atoms';

const DetectionToggleButton = () => {
  const buttonRef = useRef();
  const [videoRef, setVideoRef] = useAtom(videoRefAtom);
  const [canvasRef, setCanvasRef] = useAtom(canvasRefAtom);

  const stopCallback = () => {
    console.log('stopCallback');
    buttonRef.current.click();
  };

  return (
    <ToggleButton
      activeText="detect off"
      inActiveText="detect on"
      toggleOn={() => start(stopCallback)}
      toggleOff={stop}
      useRef={buttonRef}
    />
  );
};

export default DetectionToggleButton;
