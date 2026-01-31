// __tests__/mocks/mockConveyorManager.ts

/**
 * Encoder snapshot interface matching ConveyorManager's return type.
 */
export interface EncoderSnapshot {
  position: number;
  timestamp: number;
  velocity: number;
}

/**
 * Creates a mock ConveyorManager for testing.
 * @param snapshotOverrides - Optional overrides for encoder snapshot
 * @returns Mock ConveyorManager with jest functions
 */
export const createMockConveyorManager = (snapshotOverrides?: Partial<EncoderSnapshot>) => {
  const defaultSnapshot: EncoderSnapshot = {
    position: 1000,
    timestamp: Date.now(),
    velocity: 0.5,
  };

  const snapshot = { ...defaultSnapshot, ...snapshotOverrides };

  return {
    getEncoderSnapshot: jest.fn().mockReturnValue(snapshot),
    getInterpolatedPosition: jest.fn().mockReturnValue(snapshot.position),
    getCurrentEncoderPosition: jest.fn().mockReturnValue(snapshot.position),
    getEncoderVelocity: jest.fn().mockReturnValue(snapshot.velocity),
    resetEncoderPosition: jest.fn(),
    skipPartsForSorter: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
  };
};

/**
 * Creates a mock ConveyorManager with no encoder data (timestamp = 0).
 * Simulates the state before any encoder updates have been received.
 */
export const createUninitializedConveyorManager = () => {
  const snapshot: EncoderSnapshot = {
    position: 0,
    timestamp: 0,
    velocity: 0,
  };

  return {
    getEncoderSnapshot: jest.fn().mockReturnValue(snapshot),
    getInterpolatedPosition: jest.fn().mockReturnValue(0),
    getCurrentEncoderPosition: jest.fn().mockReturnValue(0),
    getEncoderVelocity: jest.fn().mockReturnValue(0),
    resetEncoderPosition: jest.fn(),
    skipPartsForSorter: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
  };
};

/**
 * Creates a mock ConveyorManager that throws errors.
 * Useful for testing error handling.
 */
export const createErrorConveyorManager = () => ({
  getEncoderSnapshot: jest.fn().mockImplementation(() => {
    throw new Error('Encoder read failed');
  }),
  getInterpolatedPosition: jest.fn().mockImplementation(() => {
    throw new Error('Position read failed');
  }),
  getCurrentEncoderPosition: jest.fn().mockImplementation(() => {
    throw new Error('Position read failed');
  }),
  getEncoderVelocity: jest.fn().mockImplementation(() => {
    throw new Error('Velocity read failed');
  }),
  resetEncoderPosition: jest.fn().mockImplementation(() => {
    throw new Error('Reset failed');
  }),
  skipPartsForSorter: jest.fn(),
  initialize: jest.fn().mockResolvedValue(undefined),
});
