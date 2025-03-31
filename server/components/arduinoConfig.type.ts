export type ArduinoConfig = SorterInitConfig | ConveyorJetsInitConfig | HopperFeederInitConfig;

export enum DeviceType {
  SORTER = 'sorter',
  CONVEYOR_JETS = 'conveyor_jets',
  HOPPER_FEEDER = 'hopper_feeder',
}

export type SorterInitConfig = {
  deviceType: DeviceType.SORTER;
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
  deviceType: DeviceType.CONVEYOR_JETS;
  JET_START_POSITIONS: number[];
  JET_END_POSITIONS: number[];
};

export interface HopperFeederInitConfig {
  deviceType: DeviceType.HOPPER_FEEDER;
  HOPPER_CYCLE_INTERVAL: number;
  FEEDER_VIBRATION_SPEED: number;
  FEEDER_STOP_DELAY: number;
  FEEDER_PAUSE_TIME: number;
  FEEDER_SHORT_MOVE_TIME: number;
  FEEDER_LONG_MOVE_TIME: number;
}
