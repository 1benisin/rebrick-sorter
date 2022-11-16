import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import React, { useState, useEffect } from 'react';

const ToggleButton = ({
  toggleOn = () => {},
  toggleOff = () => {},
  activeText = '',
  inActiveText = '',
  tooltip,
  disabled = false,
  useRef,
}) => {
  const [active, setActive] = useState(false);

  const onClick = () => {
    const updatedActive = !active;
    updatedActive ? toggleOn() : toggleOff();
    setActive(updatedActive);
  };

  return (
    // <OverlayTrigger delay={1000} overlay={<Tooltip>{tooltip}</Tooltip>}>
    <Button
      onClick={onClick}
      variant={active ? 'danger' : 'primary'}
      disabled={disabled}
      ref={useRef}
    >
      {active ? activeText : inActiveText}
    </Button>
    // </OverlayTrigger>
  );
};

export default ToggleButton;
