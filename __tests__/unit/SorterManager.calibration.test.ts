// __tests__/unit/SorterManager.calibration.test.ts

import { SorterManager } from '../../server/components/SorterManager';
import { createMockSettingsManager } from '../mocks/mockSettingsManager';
import { SorterSettingsType } from '../../types/settings.type';

// Mock dependencies
const createMockDeviceManager = () => ({
  registerDeviceDataCallback: jest.fn(),
  unregisterDeviceDataCallback: jest.fn(),
  registerDeviceReconnectCallback: jest.fn(),
  unregisterDeviceReconnectCallback: jest.fn(),
  sendCommand: jest.fn(),
});

const createMockSocketManager = () => ({
  emitSorterPositionUpdate: jest.fn(),
  emitComponentStatusUpdate: jest.fn(),
});

// Default sorter settings for tests
const defaultSorterSettings: SorterSettingsType[] = [
  {
    name: 'sorter_0' as any,
    serialPort: '/dev/test',
    jetDuration: 100,
    maxPartDimensions: { width: 1, height: 1 },
    gridDimension: 12,
    xOffset: 10,
    yOffset: 10,
    xStepsToLast: 6085,
    yStepsToLast: 6100,
    acceleration: 5000,
    homingSpeed: 1000,
    speed: 120,
    rowMajorOrder: true,
  },
];

describe('SorterManager calibration', () => {
  let sorterManager: SorterManager;

  beforeEach(async () => {
    const mockSettings = createMockSettingsManager();
    mockSettings.getSettings.mockReturnValue({
      ...mockSettings.getSettings(),
      sorters: defaultSorterSettings,
      travelTimeCalibration: [],
    });

    sorterManager = new SorterManager({
      deviceManager: createMockDeviceManager() as any,
      socketManager: createMockSocketManager() as any,
      settingsManager: mockSettings as any,
    });

    await sorterManager.initialize();
  });

  describe('generateTravelTimesFromCoefficients', () => {
    it('generates array with correct length for grid dimension 12', () => {
      // gridDimension 12 → maxIndex = ceil(11 * √2) = ceil(15.556) = 16 → array length 17
      const coefficients = { a: 1, b: 100 };
      const gridDimension = 12;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result.length).toBe(17);
    });

    it('generates array with correct length for grid dimension 8', () => {
      // gridDimension 8 → maxIndex = ceil(7 * √2) = ceil(9.899) = 10 → array length 11
      const coefficients = { a: 1, b: 100 };
      const gridDimension = 8;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result.length).toBe(11);
    });

    it('generates time(0) = 0', () => {
      const coefficients = { a: -4.53, b: 250.5 };
      const gridDimension = 12;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result[0]).toBe(0);
    });

    it('generates correct values from known coefficients', () => {
      // Using example from plan: a=-4.53, b=250.5
      // time(d) = -4.53×d² + 250.5×d
      // time(1) = -4.53 + 250.5 = 245.97 ≈ 246
      // time(8) = -4.53×64 + 250.5×8 = -289.92 + 2004 = 1714.08 ≈ 1714
      // time(16) = -4.53×256 + 250.5×16 = -1159.68 + 4008 = 2848.32 ≈ 2848
      const coefficients = { a: -4.53, b: 250.5 };
      const gridDimension = 12;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result[1]).toBe(246);
      expect(result[8]).toBe(1714);
      expect(result[16]).toBe(2848);
    });

    it('clamps negative times to 0', () => {
      // Bad coefficients that would produce negative times at some distances
      // time(d) = -100×d² + 50×d
      // time(1) = -100 + 50 = -50 → should clamp to 0
      // time(0) = 0
      const coefficients = { a: -100, b: 50 };
      const gridDimension = 8;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      // All values should be non-negative
      result.forEach((time, index) => {
        expect(time).toBeGreaterThanOrEqual(0);
      });
      // First element should be 0
      expect(result[0]).toBe(0);
      // time(1) would be negative but should be clamped to 0
      expect(result[1]).toBe(0);
    });

    it('handles zero coefficients', () => {
      const coefficients = { a: 0, b: 0 };
      const gridDimension = 8;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      // All values should be 0
      result.forEach((time) => {
        expect(time).toBe(0);
      });
    });

    it('handles positive quadratic coefficient (decelerating curve)', () => {
      // time(d) = 5×d² + 100×d (positive a = decelerating, takes longer for longer distances)
      // time(1) = 5 + 100 = 105
      // time(2) = 20 + 200 = 220
      // time(3) = 45 + 300 = 345
      const coefficients = { a: 5, b: 100 };
      const gridDimension = 8;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result[1]).toBe(105);
      expect(result[2]).toBe(220);
      expect(result[3]).toBe(345);
    });

    it('handles linear-only coefficients (a=0)', () => {
      // time(d) = 0×d² + 200×d = 200×d (pure linear)
      const coefficients = { a: 0, b: 200 };
      const gridDimension = 8;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result[0]).toBe(0);
      expect(result[1]).toBe(200);
      expect(result[2]).toBe(400);
      expect(result[5]).toBe(1000);
    });

    it('rounds to nearest integer', () => {
      // time(d) = 0.1×d² + 0.3×d
      // time(5) = 0.1×25 + 0.3×5 = 2.5 + 1.5 = 4 (exact)
      // time(3) = 0.1×9 + 0.3×3 = 0.9 + 0.9 = 1.8 → rounds to 2
      const coefficients = { a: 0.1, b: 0.3 };
      const gridDimension = 8;

      const result = sorterManager.generateTravelTimesFromCoefficients(coefficients, gridDimension);

      expect(result[3]).toBe(2); // 1.8 rounds to 2
      expect(result[5]).toBe(4); // 4.0 stays 4
    });
  });

  describe('isCalibrationInProgress', () => {
    it('returns false when calibration is not running', () => {
      expect(sorterManager.isCalibrationInProgress()).toBe(false);
    });
  });

  describe('isCalibrationInProgress during calibration lifecycle', () => {
    let mockDeviceManager: ReturnType<typeof createMockDeviceManager>;
    let mockSocketManager: ReturnType<typeof createMockSocketManager>;
    let mockSettings: ReturnType<typeof createMockSettingsManager>;
    let calibratingManager: SorterManager;
    let registeredCallbacks: Map<string, (data: string) => void>;

    beforeEach(async () => {
      registeredCallbacks = new Map();

      mockDeviceManager = createMockDeviceManager();
      mockSocketManager = createMockSocketManager();
      mockSettings = createMockSettingsManager();

      // Capture registered callbacks so we can simulate MC: responses
      mockDeviceManager.registerDeviceDataCallback.mockImplementation(
        (deviceName: string, callback: (data: string) => void) => {
          registeredCallbacks.set(deviceName, callback);
        },
      );

      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
        travelTimeCalibration: [],
      });

      calibratingManager = new SorterManager({
        deviceManager: mockDeviceManager as any,
        socketManager: mockSocketManager as any,
        settingsManager: mockSettings as any,
      });

      await calibratingManager.initialize();
    });

    /**
     * Helper to simulate MC: response for a sorter.
     * Uses the correct device name format (sorter_0, sorter_1, etc.)
     */
    const simulateMCResponse = (sorterNum: number, bin: number) => {
      const callback = registeredCallbacks.get(`sorter_${sorterNum}`);
      if (callback) {
        callback(`MC: ${bin}`);
      }
    };

    /**
     * Helper to simulate all 4 MC: responses needed for calibration (3 moves + return home).
     * Grid dimension 12: middleBin=79 (floor(6)*12+6+1), maxBin=144
     * Each response is sent after a short delay to allow promise setup.
     */
    const simulateFullCalibrationWithDelays = async (sorterNum: number) => {
      // Move 1: to middle bin (79 for grid 12)
      await new Promise((resolve) => setImmediate(resolve));
      simulateMCResponse(sorterNum, 79);

      // Move 2: back to bin 1
      await new Promise((resolve) => setImmediate(resolve));
      simulateMCResponse(sorterNum, 1);

      // Move 3: to max bin (144 for grid 12)
      await new Promise((resolve) => setImmediate(resolve));
      simulateMCResponse(sorterNum, 144);

      // Move 4: return home
      await new Promise((resolve) => setImmediate(resolve));
      simulateMCResponse(sorterNum, 1);
    };

    it('returns true during calibration', async () => {
      // Start calibration but don't await it yet
      const calibrationPromise = calibratingManager.startCalibration();

      // Check flag is true while calibration is running (synchronous check)
      expect(calibratingManager.isCalibrationInProgress()).toBe(true);

      // Complete calibration in parallel
      await simulateFullCalibrationWithDelays(0);
      await calibrationPromise;
    });

    it('returns false after calibration completes successfully', async () => {
      // Start calibration and simulate responses in parallel
      const calibrationPromise = calibratingManager.startCalibration();
      await simulateFullCalibrationWithDelays(0);

      // Wait for calibration to complete
      await calibrationPromise;

      // Flag should be false after completion
      expect(calibratingManager.isCalibrationInProgress()).toBe(false);
    });

    it('returns false after calibration fails with timeout', async () => {
      // Use jest fake timers to control the timeout
      jest.useFakeTimers();

      // Start calibration (will timeout because we don't send MC: responses)
      const calibrationPromise = calibratingManager.startCalibration();

      // Verify flag is true during calibration
      expect(calibratingManager.isCalibrationInProgress()).toBe(true);

      // Fast-forward past the 15-second timeout
      jest.advanceTimersByTime(16000);

      // Wait for calibration to complete (should fail due to timeout)
      await calibrationPromise;

      // Flag should be false even after failure
      expect(calibratingManager.isCalibrationInProgress()).toBe(false);

      jest.useRealTimers();
    });

    it('prevents concurrent calibration attempts', async () => {
      // Start first calibration
      const firstCalibration = calibratingManager.startCalibration();

      // Immediately try to start second calibration - should throw
      // (the flag is set synchronously at the start of startCalibration)
      await expect(calibratingManager.startCalibration()).rejects.toThrow(
        'Calibration already in progress',
      );

      // Complete the first calibration
      await simulateFullCalibrationWithDelays(0);
      await firstCalibration;
    });

    it('flag is reset even if calibration throws unexpected error', async () => {
      // Use fake timers to simulate timeout (which causes internal error)
      jest.useFakeTimers();

      const calibrationPromise = calibratingManager.startCalibration();

      // Verify flag is true during calibration
      expect(calibratingManager.isCalibrationInProgress()).toBe(true);

      // Advance timers to cause timeout
      jest.advanceTimersByTime(16000);

      await calibrationPromise;

      // Flag should be reset in finally block
      expect(calibratingManager.isCalibrationInProgress()).toBe(false);

      jest.useRealTimers();
    });

    it('allows new calibration after previous one completes', async () => {
      // First calibration
      const firstCalibration = calibratingManager.startCalibration();
      await simulateFullCalibrationWithDelays(0);
      await firstCalibration;

      expect(calibratingManager.isCalibrationInProgress()).toBe(false);

      // Second calibration should now be allowed
      const secondCalibration = calibratingManager.startCalibration();
      expect(calibratingManager.isCalibrationInProgress()).toBe(true);

      await simulateFullCalibrationWithDelays(0);
      await secondCalibration;

      expect(calibratingManager.isCalibrationInProgress()).toBe(false);
    });
  });
});
