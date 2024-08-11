// server/hardwareUtils.ts

// lib/hardware/hardwareUtils.ts

import { SpeedQueue } from './hardwareTypes.d';

// find the timestamp when part has taveled a certain distance
export const findTimeAfterDistance = (startTime: number, distance: number, speedQueue: SpeedQueue) => {
  if (distance < 0) console.warn('findTimeAfterDistance: distance is negative'); // sanity check
  if (speedQueue.length === 0) console.warn('findTimeAfterDistance: speedQueue is empty'); // sanity check
  if (distance === 0) return startTime; // exit condition

  let remainingDistance = distance;
  let finishTime = startTime;

  // for each part and index in queue
  for (let i = 0; i < speedQueue.length; i++) {
    // exit condition
    if (remainingDistance <= 1) break;

    const { speed: speed, time: speedStart } = speedQueue[i];
    let { time: speedEnd } = speedQueue[i + 1] || {};

    // if no next speed change use 5 minutes from start as the end time
    speedEnd = speedEnd || speedStart + 5 * 60 * 1000;

    // use later start time
    const start = speedStart > startTime ? speedStart : startTime;

    let timeTraveled = speedEnd - start;

    // if speed ended before the start time of the part timeTraveled will be negative
    // -clamp the time traveled to 0 because it has no effect on the position
    timeTraveled = timeTraveled < 0 ? 0 : timeTraveled;
    let distanceTraveled = timeTraveled * speed;

    if (distanceTraveled > remainingDistance) {
      distanceTraveled = remainingDistance;
      timeTraveled = distanceTraveled / speed;
    }

    finishTime += timeTraveled;
    remainingDistance -= distanceTraveled;
  }
  return finishTime;
};

export const findPositionAtTime = (
  startPos: number,
  startTime: number,
  endTime: number,
  speedQueue: {
    time: number;
    speed: number;
  }[],
) => {
  let remainingTime = endTime - startTime;
  if (remainingTime < 0) {
    console.warn('findPositionAtTime: startTime is after endTime'); // sanity check
    return startPos;
  }
  let endPos = startPos;

  for (let i = 0; i < speedQueue.length; i++) {
    // exit condition
    if (remainingTime <= 1) break;

    const { speed, time: speedStart } = speedQueue[i];
    let { time: speedEnd } = speedQueue[i + 1] || {};

    // if no next speed change use 5 minutes from now as the end time
    speedEnd = speedEnd || Date.now() + 5 * 60 * 1000;

    // use later start time
    const start = speedStart > startTime ? speedStart : startTime;

    let timeTraveled = speedEnd - start;
    // if speed ended before the start time of the part timeTraveled will be negative
    // -clamp the time traveled to 0 cause it has no effect on the position
    timeTraveled = timeTraveled < 0 ? 0 : timeTraveled > remainingTime ? remainingTime : timeTraveled;
    let distanceTraveled = timeTraveled * speed;

    remainingTime -= timeTraveled;
    endPos += distanceTraveled;
  }

  return endPos;
};

// find travel time between last bin and next bin
export const getTravelTimeBetweenBins = (
  sorter: number,
  fromBin: number,
  toBin: number,
  binPositions: { x: number; y: number }[][],
  travelTimes: number[][],
) => {
  // console.log(`sorter: ${sorter} from: ${fromBin} to: ${toBin}`);
  const { x: x1, y: y1 } = binPositions[sorter][toBin];
  const { x: x2, y: y2 } = binPositions[sorter][fromBin];
  const y = x2 - x1;
  const x = y2 - y1;
  const moveDist = Math.sqrt(x * x + y * y);
  const closestTravelTimeIndex = Math.round(moveDist);
  return travelTimes[sorter][closestTravelTimeIndex];
};
