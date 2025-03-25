export enum DeviceName {
  CONVEYOR_JETS = 'conveyor_jets',
  HOPPER_FEEDER = 'hopper_feeder',
  SORTER_0 = 'sorter_0',
  SORTER_1 = 'sorter_1',
  SORTER_2 = 'sorter_2',
  SORTER_3 = 'sorter_3',
}

export type DeviceInfo = {
  deviceName: DeviceName;
  portName: string;
  device: any; // SerialPort | SerialPortMock
  config: any; // ArduinoConfig
};
