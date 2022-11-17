import React, { useRef } from 'react';
import ToggleButton from './ToggleButton';
import { startDetecting, stop } from '../logic/detectionManager';

const DetectionToggleButton = () => {
  const buttonRef = useRef();

  const stopCallback = () => {
    console.log('stopCallback');
    buttonRef.current.click();
  };

  return (
    <ToggleButton
      activeText="detect off"
      inActiveText="detect on"
      toggleOn={() => startDetecting(stopCallback)}
      toggleOff={stop}
      useRef={buttonRef}
    />
  );
};

export default DetectionToggleButton;
