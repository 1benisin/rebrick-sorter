// __tests__/unit/SorterStateManager.test.ts

import { SorterStateManager } from '../../server/components/SorterStateManager';
import { createMockSettingsManager } from '../mocks/mockSettingsManager';
import { createMockConveyorManager } from '../mocks/mockConveyorManager';
import { DeviceName } from '../../types/deviceName.type';
import { SorterSettingsType } from '../../types/settings.type';

// Mock dependencies
const createMockDeviceManager = () => ({
  registerDeviceDataCallback: jest.fn(),
  unregisterDeviceDataCallback: jest.fn(),
  registerDeviceReconnectCallback: jest.fn(),
  unregisterDeviceReconnectCallback: jest.fn(),
});

const createMockSocketManager = () => ({
  emitSorterStateUpdate: jest.fn(),
  emitComponentStatusUpdate: jest.fn(),
});

const createMockSorterManager = (travelTime: number = 500, currentPosition: number = 1) => ({
  getTravelTimeBetweenBins: jest.fn().mockReturnValue(travelTime),
  getCurrentPosition: jest.fn().mockReturnValue(currentPosition),
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

describe('SorterStateManager', () => {
  describe('canSorterReachBin with buffer', () => {
    it('skips when earliest move start is before free + buffer', async () => {
      // Setup: buffer = 50, freePosition = 1000 (idle sorter)
      // Part requires sorter by position 1100, travel time = 100ms
      // At velocity 0.8 counts/ms, lead counts = 80
      // earliestMoveStart = 1100 - 80 = 1020
      // freeAfterBuffer = 1000 + 50 = 1050
      // 1020 < 1050 → SKIP

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 50 });
      // Add sorters to the settings
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100); // 100ms travel time

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      const result = stateManager.canSorterReachBin(0, 5, 1100);

      expect(result.available).toBe(false);
      expect(result.reason).toContain('cannot reach bin');
      expect(result.reason).toContain('buffer');
    });

    it('schedules when earliest move start is after free + buffer', async () => {
      // Setup: buffer = 20, freePosition = 1000 (idle sorter)
      // Part requires sorter by position 1200, travel time = 100ms
      // At velocity 0.8 counts/ms, lead counts = 80
      // earliestMoveStart = 1200 - 80 = 1120
      // freeAfterBuffer = 1000 + 20 = 1020
      // 1120 >= 1020 → SCHEDULE
      // triggerPosition = max(1020, 1120) = 1120 (just-in-time)

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 20 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      const result = stateManager.canSorterReachBin(0, 5, 1200);

      expect(result.available).toBe(true);
      expect(result.triggerPosition).toBe(1120); // Just-in-time
    });

    it('skips when buffer makes timing impossible', async () => {
      // When freeAfterBuffer > earliestMoveStart, and arrival would be late
      // Setup: buffer = 100, freePosition = 1000
      // Part requires by 1150, travel time = 100ms, velocity = 0.8
      // leadCounts = ceil(100 * 0.8) = 80
      // earliestMoveStart = 1150 - 80 = 1070
      // freeAfterBuffer = 1000 + 100 = 1100
      // 1070 < 1100 → SKIP

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 100 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      const result = stateManager.canSorterReachBin(0, 5, 1150);

      expect(result.available).toBe(false);
    });

    it('handles zero buffer (backward compatibility)', async () => {
      // buffer = 0 should behave like current implementation
      // freePosition = 1000, buffer = 0
      // Part requires by 1080, travel time = 100ms, velocity = 0.8
      // leadCounts = 80
      // earliestMoveStart = 1080 - 80 = 1000
      // freeAfterBuffer = 1000 + 0 = 1000
      // 1000 >= 1000 → SCHEDULE
      // triggerPosition = max(1000, 1000) = 1000

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 0 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      // With buffer=0: earliestMoveStart = 1080 - 80 = 1000
      // freeAfterBuffer = 1000 + 0 = 1000
      // 1000 >= 1000 → SCHEDULE
      const result = stateManager.canSorterReachBin(0, 5, 1080);

      expect(result.available).toBe(true);
      expect(result.triggerPosition).toBe(1000);
    });

    it('respects buffer even when no movement needed (same bin)', async () => {
      // If sorter is already at target bin, triggerPosition should
      // still be >= freePositionAfterBuffer
      // freePosition = 1000, buffer = 50
      // freeAfterBuffer = 1050

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 50 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      // Sorter is at bin 1, and we request to stay at bin 1
      const mockSorter = createMockSorterManager(0, 1); // 0 travel time = same bin

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      // Already at bin 1, no movement needed
      // But triggerPosition should still respect buffer
      const result = stateManager.canSorterReachBin(0, 1, 1100);

      expect(result.available).toBe(true);
      expect(result.triggerPosition).toBe(1050); // 1000 + 50 buffer
    });

    it('returns error for invalid sorter number', async () => {
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 20 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      // Request for sorter 99 which doesn't exist
      const result = stateManager.canSorterReachBin(99, 5, 1200);

      expect(result.available).toBe(false);
      expect(result.reason).toContain('Invalid sorter number');
    });

    it('uses just-in-time trigger when there is slack', async () => {
      // Setup: buffer = 20, freePosition = 1000
      // Part requires by position 1500, travel time = 100ms
      // At velocity 0.8, lead counts = 80
      // earliestMoveStart = 1500 - 80 = 1420
      // freeAfterBuffer = 1000 + 20 = 1020
      // 1420 >= 1020 → SCHEDULE
      // triggerPosition = max(1020, 1420) = 1420 (just-in-time, with slack)

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 20 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      const result = stateManager.canSorterReachBin(0, 5, 1500);

      expect(result.available).toBe(true);
      // Should use just-in-time: 1500 - 80 = 1420, not 1020
      expect(result.triggerPosition).toBe(1420);
    });

    it('uses freeAfterBuffer when that is later than earliestMoveStart', async () => {
      // Setup: buffer = 150, freePosition = 1000
      // Part requires by 1200, travel time = 100ms
      // At velocity 0.8, lead counts = 80
      // earliestMoveStart = 1200 - 80 = 1120
      // freeAfterBuffer = 1000 + 150 = 1150
      // 1120 < 1150 → SKIP (buffer constraint makes it impossible)

      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 150 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      const result = stateManager.canSorterReachBin(0, 5, 1200);

      // With buffer=150, earliestMoveStart=1120 < freeAfterBuffer=1150 → SKIP
      expect(result.available).toBe(false);
    });
  });

  describe('buffer enforcement from lastMoveCompletePosition', () => {
    it('uses lastMoveCompletePosition for idle sorter after move completes', async () => {
      // Setup: buffer = 50
      // 1. Move completes at position 1000 (sets lastMoveCompletePosition = 1000)
      // 2. Conveyor advances to position 1020 (only 20 counts since completion)
      // 3. New part wants sorter by position 1100, travel time = 100ms, velocity = 0.8
      //    leadCounts = ceil(100 * 0.8) = 80
      //    earliestMoveStart = 1100 - 80 = 1020
      //    freePosition = max(1000, 1020) = 1020
      //    freeAfterBuffer = 1020 + 50 = 1070
      //    1020 < 1070 → SKIP (buffer constraint)

      const mockDeviceManager = createMockDeviceManager();
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 50 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100, 1);
      const mockSocketManager = createMockSocketManager();

      const stateManager = new SorterStateManager({
        deviceManager: mockDeviceManager as any,
        socketManager: mockSocketManager as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      // Get the data callback registered for SORTER_0
      const dataCallbackCall = mockDeviceManager.registerDeviceDataCallback.mock.calls.find(
        (call) => call[0] === DeviceName.SORTER_0,
      );
      expect(dataCallbackCall).toBeDefined();
      const dataCallback = dataCallbackCall![1] as (data: string) => void;

      // Simulate move completion at position 1000 (sets lastMoveCompletePosition)
      dataCallback('MC:5');

      // Now advance conveyor to 1020
      mockConveyor.getInterpolatedPosition.mockReturnValue(1020);

      // Test: part requires sorter by position 1100
      // With buffer=50, freeAfterBuffer = max(1000,1020) + 50 = 1070
      // earliestMoveStart = 1100 - 80 = 1020
      // 1020 < 1070 → should skip
      const result = stateManager.canSorterReachBin(0, 3, 1100);

      expect(result.available).toBe(false);
      expect(result.reason).toContain('buffer');
    });
  });

  describe('scheduleMove with buffer logging', () => {
    it('schedules a move and logs buffer info', async () => {
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 25 });
      mockSettings.getSettings.mockReturnValue({
        ...mockSettings.getSettings(),
        sorters: defaultSorterSettings,
      });

      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);

      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });

      await stateManager.initialize();

      // Schedule a move
      stateManager.scheduleMove(0, 5, 'test-part-123', 1100);

      // Verify the move was scheduled
      const scheduledMoves = stateManager.getScheduledMoves(0);
      expect(scheduledMoves).toHaveLength(1);
      expect(scheduledMoves[0].partId).toBe('test-part-123');
      expect(scheduledMoves[0].bin).toBe(5);
      expect(scheduledMoves[0].triggerPosition).toBe(1100);
    });
  });
});
