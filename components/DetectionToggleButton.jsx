import React, { useRef } from 'react';
import ToggleButton from './ToggleButton';
import { start, stop } from '../logic/sorterManager';

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
      toggleOn={() => start(stopCallback)}
      toggleOff={stop}
      useRef={buttonRef}
    />
  );
};

export default DetectionToggleButton;
