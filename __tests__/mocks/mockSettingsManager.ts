// __tests__/mocks/mockSettingsManager.ts

import { PositionCalibrationType, SettingsType, TravelTimeCalibrationType } from '../../types/settings.type';

/**
 * Default position calibration for tests.
 * Represents a calibrated system with reasonable values.
 */
export const defaultPositionCalibration: PositionCalibrationType = {
  cameraEncoderOffset: 0,
  countsPerPixel: 1,
  cameraWidthInTicks: 150,
  cameraWidthPixels: 1280,
  jetEncoderOffsets: [500, 600, 700, 800] as [number, number, number, number],
  fallTimeInCounts: 5,
  jetLeadCounts: 100,
  sorterRestBufferInCounts: 85,
};

/**
 * Default uncalibrated position calibration.
 * Represents a fresh system that hasn't been calibrated yet.
 */
export const uncalibratedPositionCalibration: PositionCalibrationType = {
  cameraEncoderOffset: 0,
  countsPerPixel: 1,
  cameraWidthInTicks: 0,
  cameraWidthPixels: 1280,
  jetEncoderOffsets: [0, 0, 0, 0] as [number, number, number, number],
  fallTimeInCounts: 5,
  jetLeadCounts: 100,
  sorterRestBufferInCounts: 0, // 0 for backward compat in uncalibrated state
};

/**
 * Creates a mock SettingsManager for testing.
 * @param calibrationOverrides - Optional overrides for position calibration
 * @returns Mock SettingsManager with jest functions
 */
export const createMockSettingsManager = (calibrationOverrides?: Partial<PositionCalibrationType>) => {
  const positionCalibration: PositionCalibrationType = {
    ...defaultPositionCalibration,
    ...calibrationOverrides,
  };

  const settings: SettingsType = {
    positionCalibration,
    travelTimeCalibration: [],
    maxConveyorRPM: 100,
    detectDistanceThreshold: 1,
    conveyorJetsSerialPort: '',
    hopperFeederSerialPort: '',
    classificationThresholdPercentage: 1,
    camera1VerticalPositionPercentage: 1,
    camera2VerticalPositionPercentage: -35,
    videoStreamId1: '',
    videoStreamId2: '',
    feederVibrationSpeed: 200,
    feederStopDelay: 5,
    feederPauseTime: 1000,
    feederShortMoveTime: 250,
    feederLongMoveTime: 2000,
    conveyorPulsesPerRevolution: 20,
    conveyorKp: 1.0,
    conveyorKi: 0.15,
    conveyorKd: 0.0,
    sorters: [],
    hopperCycleInterval: 20000,
    hopperCycleSteps: 2020,
  };

  return {
    getSettings: jest.fn().mockReturnValue(settings),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    registerSettingsUpdateCallback: jest.fn(),
    unregisterSettingsUpdateCallback: jest.fn(),
  };
};

/**
 * Creates a mock SettingsManager that returns null (no settings loaded).
 */
export const createNullSettingsManager = () => ({
  getSettings: jest.fn().mockReturnValue(null),
  updateSettings: jest.fn().mockResolvedValue(undefined),
  initialize: jest.fn().mockResolvedValue(undefined),
  registerSettingsUpdateCallback: jest.fn(),
  unregisterSettingsUpdateCallback: jest.fn(),
});
