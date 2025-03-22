// /types/hardwareTypes.d.ts

export interface Part {
  sorter: number;
  bin: number;
  initialPosition: number;
  initialTime: number;
  moveTime: number;
  moveFinishedTime: number;
  jetTime: number;
  partId: string;
  status: 'pending' | 'completed' | 'skipped';
}

export type PartQueue = Part[];

export type SpeedChange = {
  time: number;
  speed: number;
  ref: NodeJS.Timeout;
};
export type SpeedQueue = SpeedChange[];
