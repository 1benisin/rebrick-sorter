// __tests__/mocks/mockSocketManager.ts

/**
 * Creates a mock SocketManager for testing.
 * Includes all calibration-related emit methods.
 * @returns Mock SocketManager with jest functions
 */
export const createMockSocketManager = () => ({
  // Calibration event emitters
  emitCalibrationPointRecorded: jest.fn(),
  emitEncoderResetComplete: jest.fn(),

  // Other common emitters
  emitEncoderPartScheduled: jest.fn(),
  emitEncoderPartSorted: jest.fn(),
  emitEncoderPartSkipped: jest.fn(),
  emitListSerialPortsSuccess: jest.fn(),

  // Socket setup
  setSocket: jest.fn(),
  initialize: jest.fn().mockResolvedValue(undefined),
});

/**
 * Creates a mock socket (client-side) for testing frontend components.
 * Simulates socket.io-client socket instance.
 */
export const createMockSocket = () => {
  const listeners: Map<string, Function[]> = new Map();

  return {
    emit: jest.fn(),
    on: jest.fn((event: string, callback: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);
    }),
    off: jest.fn((event: string, callback: Function) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(callback);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
    }),
    // Helper to simulate receiving an event (for testing)
    _simulateEvent: (event: string, data: unknown) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach((callback) => callback(data));
      }
    },
    connected: true,
  };
};
