export type ArduinoConfig = SorterInitConfig | ConveyorJetsInitConfig | HopperFeederInitConfig;

export type SorterInitConfig = {
  deviceType: 'sorter';
  GRID_DIMENSION: number;
  X_OFFSET: number;
  Y_OFFSET: number;
  X_STEPS_TO_LAST: number;
  Y_STEPS_TO_LAST: number;
  ACCELERATION: number;
  HOMING_SPEED: number;
  SPEED: number;
  ROW_MAJOR_ORDER: boolean;
};

export type ConveyorJetsInitConfig = {
  deviceType: 'conveyor_jets';
  JET_START_POSITIONS: number[];
  JET_END_POSITIONS: number[];
};

export type HopperFeederInitConfig = {
  deviceType: 'hopper_feeder';
};
