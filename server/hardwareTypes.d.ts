// server/hardwareTypes.d.ts

// lib/hardware/hardwareTypes.d.ts

export type Part = {
  sorter: number;
  bin: number;
  initialPosition: number;
  initialTime: number;
  jetTime: number;
  jetRef?: NodeJS.Timeout;
  moveTime: number;
  moveRef?: NodeJS.Timeout;
  moveFinishedTime: number;
  defaultArrivalTime?: number; // the time it takes for the part to reach the jet at default speed
};
export type PartQueue = Part[];

export type SpeedChange = {
  time: number;
  speed: number;
  ref: NodeJS.Timeout;
};
export type SpeedQueue = SpeedChange[];
