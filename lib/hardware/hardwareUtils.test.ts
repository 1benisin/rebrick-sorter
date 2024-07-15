// lib/hardware/hardwareUtils.test.ts

import { SpeedQueue } from './hardwareTypes';
import { findTimeAfterDistance, findPositionAtTime } from './hardwareUtils';

describe('findTimeAfterDistance function', () => {
  it('returns the start time when distance is zero', () => {
    const startTime = 100;
    const distance = 0;
    const speedQueue: SpeedQueue = [{ time: startTime, speed: 10, ref: setTimeout(() => {}, 0) }];

    const result = findTimeAfterDistance(startTime, distance, speedQueue);
    expect(result).toBe(startTime);
  });

  it('handles negative distance', () => {
    const startTime = 100;
    const distance = -10; // intentionally negative
    const speedQueue: SpeedQueue = [{ time: startTime, speed: 10, ref: setTimeout(() => {}, 0) }];

    const result = findTimeAfterDistance(startTime, distance, speedQueue);
    // Expect some logical result or behavior; adjust based on function's intended handling
    expect(result).toBe(startTime); // Adjust this based on how you want to handle negative distance
  });

  it('calculates finish time overlapping one speed change', () => {
    const startTime = 100;
    const distance = 50; // some positive distance
    const speedQueue: SpeedQueue = [
      { time: startTime, speed: 1, ref: setTimeout(() => {}, 0) },
      { time: startTime + 1000, speed: 2, ref: setTimeout(() => {}, 0) },
    ];

    const expectedFinishTime = startTime + 50;
    const result = findTimeAfterDistance(startTime, distance, speedQueue);
    expect(result).toBe(expectedFinishTime);
  });

  it('calculates finish time overlapping two speed changes', () => {
    const startTime = 100;
    const distance = 1500; // some positive distance
    const speedQueue: SpeedQueue = [
      { time: startTime, speed: 1, ref: setTimeout(() => {}, 0) },
      { time: startTime + 1000, speed: 2, ref: setTimeout(() => {}, 0) },
    ];

    const expectedFinishTime = startTime + 1000 + 250;
    const result = findTimeAfterDistance(startTime, distance, speedQueue);
    expect(result).toBe(expectedFinishTime);
  });

  it('calculates finish time with an arbitrary number of previous speed changes', () => {
    const startTime = 100;
    const distance = 1500; // some positive distance
    const speedQueue: SpeedQueue = [
      { time: startTime - 1000, speed: 100, ref: setTimeout(() => {}, 0) },
      { time: startTime - 500, speed: 400, ref: setTimeout(() => {}, 0) },
      { time: startTime - 10, speed: 30, ref: setTimeout(() => {}, 0) },
      { time: startTime, speed: 1, ref: setTimeout(() => {}, 0) },
      { time: startTime + 1000, speed: 2, ref: setTimeout(() => {}, 0) },
    ];

    const expectedFinishTime = startTime + 1000 + 250;
    const result = findTimeAfterDistance(startTime, distance, speedQueue);
    expect(result).toBe(expectedFinishTime);
  });

  it('calculates finish past the last speed change', () => {
    const startTime = 100;
    const distance = 3000; // some positive distance
    const speedQueue: SpeedQueue = [{ time: startTime - 1000, speed: 1, ref: setTimeout(() => {}, 0) }];

    const expectedFinishTime = startTime + 3000;
    const result = findTimeAfterDistance(startTime, distance, speedQueue);
    expect(result).toBe(expectedFinishTime);
  });
});

describe('findPositionAtTime function', () => {
  it('returns the start position when startTime is equal to endTime', () => {
    const startTime = Date.now();
    const endTime = startTime;
    const startPos = 100;
    const speedQueue: SpeedQueue = [{ time: startTime, speed: 10, ref: setTimeout(() => {}, 0) }];

    const result = findPositionAtTime(startPos, startTime, endTime, speedQueue);
    expect(result).toBe(startPos);
  });

  it('handles startTime being after endTime', () => {
    const startTime = Date.now();
    const endTime = startTime - 1000; // endTime is before startTime
    const startPos = 100;
    const speedQueue: SpeedQueue = [{ time: startTime, speed: 10, ref: setTimeout(() => {}, 0) }];

    const result = findPositionAtTime(startPos, startTime, endTime, speedQueue);
    expect(result).toBe(startPos);
  });

  it('calculates the correct end position with one speed change', () => {
    const startTime = Date.now();
    const endTime = startTime + 5000; // 5 seconds later
    const startPos = 0;
    const speedQueue: SpeedQueue = [
      { time: startTime, speed: 2, ref: setTimeout(() => {}, 0) }, // 2 units per millisecond
    ];

    const expectedEndPos = startPos + 2 * 5000; // speed * time
    const result = findPositionAtTime(startPos, startTime, endTime, speedQueue);
    expect(result).toBe(expectedEndPos);
  });

  it('calculates the correct end position with multiple speed changes', () => {
    const startTime = Date.now();
    const endTime = startTime + 10000; // 10 seconds later
    const startPos = 50;
    const speedQueue: SpeedQueue = [
      { time: startTime, speed: 1, ref: setTimeout(() => {}, 0) }, // 1 unit per ms for the first 5 seconds
      { time: startTime + 5000, speed: 3, ref: setTimeout(() => {}, 0) }, // then 3 units per ms
    ];

    const expectedEndPos = startPos + 1 * 5000 + 3 * 5000; // startPos + speed1 * time1 + speed2 * time2
    const result = findPositionAtTime(startPos, startTime, endTime, speedQueue);
    expect(result).toBe(expectedEndPos);
  });
});
