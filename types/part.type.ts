export interface Part {
  partId: string;
  sorter: number;
  bin: number;
  initialPosition: number;
  initialTime: number;
  jetTime: number;
  jetRef?: NodeJS.Timeout;
  moveTime: number;
  moveRef?: NodeJS.Timeout;
  moveFinishedTime: number;
  defaultArrivalTime: number; // the time it takes for the part to reach the jet at default speed
  arrivalTimeDelay: number;
  conveyorSpeed: number;
  conveyorSpeedTime: number;
  conveyorSpeedRef?: NodeJS.Timeout;
  status: 'pending' | 'completed' | 'skipped';
}
