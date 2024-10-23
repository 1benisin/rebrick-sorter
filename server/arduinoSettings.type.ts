// server/arduinoSettings.type.ts

export type DeviceSettings = SorterSettings | ConveyorJetsSettings | HopperFeederSettings;

export interface BaseSettings {
  deviceType: 'sorter' | 'conveyor_jets' | 'hopper_feeder';
}

export interface SorterSettings extends BaseSettings {
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
}

export interface ConveyorJetsSettings extends BaseSettings {
  deviceType: 'conveyor_jets';
  JET_FIRE_TIME: number;
}

export interface HopperFeederSettings extends BaseSettings {
  deviceType: 'hopper_feeder';
  hopperStepsPerAction: number;
  hopperActionInterval: number;
  motorSpeed: number;
  ACCELERATION: number;
  SPEED: number;
}
