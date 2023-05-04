import { useState, useEffect } from 'react';
import { Container, Row, Button } from 'react-bootstrap';
import { useSelector, useDispatch } from 'react-redux';
import ToggleButton from '../components/ToggleButton';
import { conveyorOnOff, sorterToOrigin, reCenterAll } from '../logic/arduinoCommunicator';
import { startDetecting, stopDetecting } from '../logic/sorter';
import { DISPLAY_DIMENSIONS } from '../config/globalConfig';
import { fetchAllSessions } from '../features/sortSessionSlice';
import { pause, unPause } from '../logic/sorterController';

import './sortview.css';

function SortView() {
  const [detecting, setDetecting] = useState(false);
  const [availableSorterNames, setAvailableSorterNames] = useState([]);
  const [availableBatchNames, setAvailableBatchNames] = useState([]);
  const { screen1Part, screen2Part, pairedParts, allSessions, partsCounted, sessionStartTime } =
    useSelector((state) => state.sortSession);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchAllSessions());
  }, []);

  useEffect(() => {
    const uniqueSorterNames = [
      ...new Set(allSessions.filter((e) => e.open).map((item) => item.sorterName)),
    ];
    setAvailableSorterNames(uniqueSorterNames);
    const uniqueBatchNames = [
      ...new Set(allSessions.filter((e) => e.open).map((item) => item.batchName)),
    ];
    setAvailableBatchNames(uniqueBatchNames);
  }, [allSessions]);

  const toggleDetectionMode = () => {
    if (detecting) {
      setDetecting(false);
      stopDetecting();
    } else {
      setDetecting(true);
      startDetecting();
    }
  };

  return (
    <Container>
      <Row>
        {`PPM: ${partsCounted}/${((Date.now() - sessionStartTime) / 1000 / 60).toFixed(0)}`}
        {`=${(partsCounted / ((Date.now() - sessionStartTime) / 1000 / 60)).toFixed(0)}`}{' '}
      </Row>
      {/* ____ VIDEO 1 ____ */}
      <Row>
        <canvas
          id="displayCanvas1"
          width={DISPLAY_DIMENSIONS.width}
          height={DISPLAY_DIMENSIONS.height}
          style={{
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
          }}
        />
        <div onClick={() => console.log('screen1Part', screen1Part)}>screen 1</div>
        {screen1Part.map((part, i) => (
          <Row key={i}>
            {part.detections.map((detection, j) => (
              <img
                onClick={() => console.log('detection', detection)}
                key={`img${j}`}
                src={detection.imgUrl}
                alt="crop"
                width={30}
                height={30}
              />
            ))}
          </Row>
        ))}
      </Row>
      {/* ____ VIDEO 2 ____ */}
      <Row>
        <canvas
          id="displayCanvas2"
          width={DISPLAY_DIMENSIONS.width}
          height={DISPLAY_DIMENSIONS.height}
          style={{
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
          }}
        />
        <div onClick={() => console.log('screen2Part', screen2Part)}>screen 2</div>
        {screen2Part.map((part, i) => (
          <Row key={i}>
            {part.detections.map((detection, j) => (
              <img
                onClick={() => console.log('detection', detection)}
                key={`img${j}`}
                src={detection.imgUrl}
                alt="crop"
                width={30}
                height={30}
              />
            ))}
          </Row>
        ))}
      </Row>
      {/* ____ BUTTONS ____ */}
      <Button variant="warning" onClick={pause}>
        Pause
      </Button>{' '}
      <Button variant="warning" onClick={unPause}>
        UnPause
      </Button>{' '}
      <Button onClick={reCenterAll}>ReCenterAll</Button>{' '}
      {/* <Button variant="dark" onClick={() => sorterToOrigin()}>
        Origin
      </Button>{' '} */}
      <Button onClick={conveyorOnOff}>Conveyor</Button>{' '}
      <ToggleButton
        active={detecting}
        tooltip="toggle running detections on cameras"
        onClick={toggleDetectionMode}
        text="Detection Mode"
      />{' '}
      {/* ____ PAIRED PARTS ____ */}
      <div>pairing results</div>
      {pairedParts.map((part, i) => (
        <div key={i} onClick={() => console.log(part)}>
          <div style={{ color: !part.willFitInSorter1 && part.sorterId == '1' ? 'red' : 'black' }}>
            {`${part.sorterId} : ${part.sortingBin} --- 
          ${(part.labelCertainty * 100).toFixed(0)}% --- 
          ${part.label}`}
            {!part.willFitInSorter1 && part.sorterId == '1' && " part don't fit"}
          </div>

          {part.detections.map((detection, k) => (
            <img
              key={k}
              onClick={() => console.log(detection)}
              src={detection.imgUrl}
              alt="crop"
              width={40}
              height={40}
            />
          ))}
        </div>
      ))}
    </Container>
  );
}

export default SortView;
