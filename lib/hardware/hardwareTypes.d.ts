export type Part = {
  sorter: number;
  bin: number;
  initialPosition: number;
  initialTime: number;
  jetTime?: number;
  jetRef?: NodeJS.Timeout;
  moveTime?: number;
  moveRef?: NodeJS.Timeout;
  moveFinishedTime?: number;
};
export type PartQueue = Part[];

export type SpeedChange = {
  time: number;
  speed: number;
  ref: NodeJS.Timeout;
};
export type SpeedQueue = SpeedChange[];
