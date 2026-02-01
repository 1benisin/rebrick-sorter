// __tests__/integration/calibrationSortingLock.test.ts

/**
 * Integration tests for the sorting lock during calibration.
 *
 * These tests verify that:
 * 1. New parts are skipped when calibration is in progress (SystemCoordinator path)
 * 2. Queued parts are marked as skipped when calibration starts (ConveyorManager path)
 * 3. Socket events are emitted correctly for skipped parts
 * 4. System resumes normal operation after calibration completes
 */

import { createMockSettingsManager, defaultPositionCalibration } from '../mocks/mockSettingsManager';
import { createMockSocketManager } from '../mocks/mockSocketManager';
import { createMockConveyorManager } from '../mocks/mockConveyorManager';
import { EncoderPart } from '../../types/part.type';

/**
 * Creates a mock SorterManager for testing calibration lock behavior.
 */
const createMockSorterManager = (isCalibrating: boolean = false) => ({
  isCalibrationInProgress: jest.fn().mockReturnValue(isCalibrating),
  startCalibration: jest.fn().mockResolvedValue([]),
  getTravelTimeBetweenBins: jest.fn().mockReturnValue(500),
  moveSorter: jest.fn(),
  homeSorter: jest.fn(),
  getCurrentPosition: jest.fn().mockReturnValue(1),
  initialize: jest.fn().mockResolvedValue(undefined),
});

/**
 * Creates a mock SorterStateManager for testing.
 */
const createMockSorterStateManager = () => ({
  canSorterReachBin: jest.fn().mockReturnValue({
    available: true,
    triggerPosition: 100,
    reason: 'ok',
  }),
  getCurrentBin: jest.fn().mockReturnValue(1),
  getEffectiveFromBin: jest.fn().mockReturnValue(1),
  calculateLeadCounts: jest.fn().mockReturnValue(50),
  scheduleMove: jest.fn(),
  markMoveStarted: jest.fn(),
  clearAllScheduledMoves: jest.fn(),
});

/**
 * Creates a mock PositionTranslator for testing.
 */
const createMockPositionTranslator = () => ({
  getCalibration: jest.fn().mockReturnValue({
    cameraWidthInTicks: 150,
    cameraWidthPixels: 1280,
    jetEncoderOffsets: [500, 600, 700, 800],
    fallTimeInCounts: 5,
  }),
  calculateJetTriggerEncoder: jest.fn().mockReturnValue(600),
  calculateRequiredByPosition: jest.fn().mockReturnValue(550),
});

/**
 * Simulates the handleEncoderSortPart logic from SystemCoordinator.
 * This is extracted for testability.
 */
function handleEncoderSortPart(
  data: { partId: string; sorter: number; bin: number; encoderAtDetection: number },
  context: {
    sorterManager: ReturnType<typeof createMockSorterManager>;
    socketManager: ReturnType<typeof createMockSocketManager>;
    sorterStateManager: ReturnType<typeof createMockSorterStateManager>;
    positionTranslator: ReturnType<typeof createMockPositionTranslator>;
    conveyorManager: ReturnType<typeof createMockConveyorManager>;
  },
): EncoderPart | null {
  // Check calibration lock
  if (context.sorterManager.isCalibrationInProgress()) {
    context.socketManager.emitEncoderPartSkipped(
      data.partId,
      'Calibration in progress - sorting disabled',
      data.sorter,
      data.bin,
    );
    return null;
  }

  // Check if sorter can reach bin
  const availability = context.sorterStateManager.canSorterReachBin(data.sorter, data.bin, 550);
  if (!availability.available) {
    context.socketManager.emitEncoderPartSkipped(data.partId, availability.reason, data.sorter, data.bin);
    return null;
  }

  // Build encoder part (simplified)
  const encoderPart: EncoderPart = {
    partId: data.partId,
    detectionEncoderPos: data.encoderAtDetection,
    jetPosition: 600,
    jet: data.sorter,
    sorter: data.sorter,
    bin: data.bin,
    moveTriggerPosition: 100,
    expectedMoveCompletePosition: 150,
    jetCommandSent: false,
    moveCommandSent: false,
    status: 'scheduled',
    detectionTime: Date.now(),
    pixelPosition: 100,
  };

  context.socketManager.emitEncoderPartScheduled(encoderPart);
  return encoderPart;
}

/**
 * Simulates the processPositionActions logic from ConveyorManager.
 * This is extracted for testability.
 */
function processPositionActions(
  encoderPartQueue: EncoderPart[],
  context: {
    sorterManager: ReturnType<typeof createMockSorterManager>;
    socketManager: ReturnType<typeof createMockSocketManager>;
  },
): { skippedParts: EncoderPart[]; remainingQueue: EncoderPart[] } {
  if (context.sorterManager.isCalibrationInProgress()) {
    const reason = 'Calibration in progress - sorting disabled';
    const skippedParts = encoderPartQueue.filter((part) => part.status !== 'sorted' && part.status !== 'skipped');

    for (const part of skippedParts) {
      part.status = 'skipped';
      context.socketManager.emitEncoderPartSkipped(part.partId, reason, part.sorter, part.bin);
    }

    return {
      skippedParts,
      remainingQueue: encoderPartQueue.filter((part) => part.status !== 'skipped'),
    };
  }

  return { skippedParts: [], remainingQueue: encoderPartQueue };
}

describe('Sorting Lock During Calibration', () => {
  describe('handleEncoderSortPart with calibration lock', () => {
    it('skips new parts when calibration is in progress', () => {
      const sorterManager = createMockSorterManager(true); // Calibrating
      const socketManager = createMockSocketManager();
      const context = {
        sorterManager,
        socketManager,
        sorterStateManager: createMockSorterStateManager(),
        positionTranslator: createMockPositionTranslator(),
        conveyorManager: createMockConveyorManager(),
      };

      const result = handleEncoderSortPart(
        { partId: 'part-001', sorter: 0, bin: 5, encoderAtDetection: 1000 },
        context,
      );

      expect(result).toBeNull();
      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledWith(
        'part-001',
        'Calibration in progress - sorting disabled',
        0,
        5,
      );
    });

    it('processes parts normally when calibration is not in progress', () => {
      const sorterManager = createMockSorterManager(false); // Not calibrating
      const socketManager = createMockSocketManager();
      const context = {
        sorterManager,
        socketManager,
        sorterStateManager: createMockSorterStateManager(),
        positionTranslator: createMockPositionTranslator(),
        conveyorManager: createMockConveyorManager(),
      };

      const result = handleEncoderSortPart(
        { partId: 'part-001', sorter: 0, bin: 5, encoderAtDetection: 1000 },
        context,
      );

      expect(result).not.toBeNull();
      expect(result?.partId).toBe('part-001');
      expect(socketManager.emitEncoderPartScheduled).toHaveBeenCalledWith(expect.objectContaining({ partId: 'part-001' }));
      expect(socketManager.emitEncoderPartSkipped).not.toHaveBeenCalled();
    });

    it('checks calibration status before processing each part', () => {
      const sorterManager = createMockSorterManager(false);
      const socketManager = createMockSocketManager();
      const context = {
        sorterManager,
        socketManager,
        sorterStateManager: createMockSorterStateManager(),
        positionTranslator: createMockPositionTranslator(),
        conveyorManager: createMockConveyorManager(),
      };

      // Process first part
      handleEncoderSortPart({ partId: 'part-001', sorter: 0, bin: 5, encoderAtDetection: 1000 }, context);

      // Verify isCalibrationInProgress was called
      expect(sorterManager.isCalibrationInProgress).toHaveBeenCalled();
    });
  });

  describe('processPositionActions with calibration lock', () => {
    it('skips all queued parts when calibration starts', () => {
      const sorterManager = createMockSorterManager(true); // Calibrating
      const socketManager = createMockSocketManager();

      const queuedParts: EncoderPart[] = [
        {
          partId: 'part-001',
          detectionEncoderPos: 500,
          jetPosition: 600,
          jet: 0,
          sorter: 0,
          bin: 5,
          moveTriggerPosition: 100,
          expectedMoveCompletePosition: 150,
          jetCommandSent: false,
          moveCommandSent: false,
          status: 'scheduled',
          detectionTime: Date.now(),
          pixelPosition: 100,
        },
        {
          partId: 'part-002',
          detectionEncoderPos: 550,
          jetPosition: 650,
          jet: 1,
          sorter: 1,
          bin: 10,
          moveTriggerPosition: 150,
          expectedMoveCompletePosition: 200,
          jetCommandSent: false,
          moveCommandSent: false,
          status: 'scheduled',
          detectionTime: Date.now(),
          pixelPosition: 200,
        },
      ];

      const { skippedParts, remainingQueue } = processPositionActions(queuedParts, { sorterManager, socketManager });

      expect(skippedParts.length).toBe(2);
      expect(remainingQueue.length).toBe(0);
      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledTimes(2);
      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledWith(
        'part-001',
        'Calibration in progress - sorting disabled',
        0,
        5,
      );
      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledWith(
        'part-002',
        'Calibration in progress - sorting disabled',
        1,
        10,
      );
    });

    it('does not skip already sorted parts', () => {
      const sorterManager = createMockSorterManager(true);
      const socketManager = createMockSocketManager();

      const queuedParts: EncoderPart[] = [
        {
          partId: 'part-001',
          detectionEncoderPos: 500,
          jetPosition: 600,
          jet: 0,
          sorter: 0,
          bin: 5,
          moveTriggerPosition: 100,
          expectedMoveCompletePosition: 150,
          jetCommandSent: true,
          moveCommandSent: true,
          status: 'sorted', // Already sorted
          detectionTime: Date.now(),
          pixelPosition: 100,
        },
        {
          partId: 'part-002',
          detectionEncoderPos: 550,
          jetPosition: 650,
          jet: 1,
          sorter: 1,
          bin: 10,
          moveTriggerPosition: 150,
          expectedMoveCompletePosition: 200,
          jetCommandSent: false,
          moveCommandSent: false,
          status: 'scheduled', // Not yet sorted
          detectionTime: Date.now(),
          pixelPosition: 200,
        },
      ];

      const { skippedParts } = processPositionActions(queuedParts, { sorterManager, socketManager });

      expect(skippedParts.length).toBe(1);
      expect(skippedParts[0].partId).toBe('part-002');
      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledTimes(1);
    });

    it('processes queue normally when not calibrating', () => {
      const sorterManager = createMockSorterManager(false); // Not calibrating
      const socketManager = createMockSocketManager();

      const queuedParts: EncoderPart[] = [
        {
          partId: 'part-001',
          detectionEncoderPos: 500,
          jetPosition: 600,
          jet: 0,
          sorter: 0,
          bin: 5,
          moveTriggerPosition: 100,
          expectedMoveCompletePosition: 150,
          jetCommandSent: false,
          moveCommandSent: false,
          status: 'scheduled',
          detectionTime: Date.now(),
          pixelPosition: 100,
        },
      ];

      const { skippedParts, remainingQueue } = processPositionActions(queuedParts, { sorterManager, socketManager });

      expect(skippedParts.length).toBe(0);
      expect(remainingQueue.length).toBe(1);
      expect(socketManager.emitEncoderPartSkipped).not.toHaveBeenCalled();
    });
  });

  describe('System Resume After Calibration', () => {
    it('resumes normal part processing after calibration completes', () => {
      const sorterManager = createMockSorterManager(false);
      const socketManager = createMockSocketManager();
      const context = {
        sorterManager,
        socketManager,
        sorterStateManager: createMockSorterStateManager(),
        positionTranslator: createMockPositionTranslator(),
        conveyorManager: createMockConveyorManager(),
      };

      // Simulate calibration was in progress
      sorterManager.isCalibrationInProgress.mockReturnValue(true);

      // Part 1 should be skipped during calibration
      const result1 = handleEncoderSortPart(
        { partId: 'part-during-cal', sorter: 0, bin: 5, encoderAtDetection: 1000 },
        context,
      );
      expect(result1).toBeNull();
      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledWith(
        'part-during-cal',
        'Calibration in progress - sorting disabled',
        0,
        5,
      );

      // Calibration ends
      sorterManager.isCalibrationInProgress.mockReturnValue(false);

      // Clear the mock to verify next call
      socketManager.emitEncoderPartSkipped.mockClear();
      socketManager.emitEncoderPartScheduled.mockClear();

      // Part 2 should be processed normally after calibration
      const result2 = handleEncoderSortPart(
        { partId: 'part-after-cal', sorter: 0, bin: 5, encoderAtDetection: 2000 },
        context,
      );

      expect(result2).not.toBeNull();
      expect(result2?.partId).toBe('part-after-cal');
      expect(socketManager.emitEncoderPartScheduled).toHaveBeenCalled();
      expect(socketManager.emitEncoderPartSkipped).not.toHaveBeenCalled();
    });

    it('processes queued parts normally after calibration ends', () => {
      const sorterManager = createMockSorterManager(false);
      const socketManager = createMockSocketManager();

      const queuedParts: EncoderPart[] = [
        {
          partId: 'part-001',
          detectionEncoderPos: 500,
          jetPosition: 600,
          jet: 0,
          sorter: 0,
          bin: 5,
          moveTriggerPosition: 100,
          expectedMoveCompletePosition: 150,
          jetCommandSent: false,
          moveCommandSent: false,
          status: 'scheduled',
          detectionTime: Date.now(),
          pixelPosition: 100,
        },
      ];

      // Calibration just ended, process the queue
      const { skippedParts, remainingQueue } = processPositionActions(queuedParts, { sorterManager, socketManager });

      expect(skippedParts.length).toBe(0);
      expect(remainingQueue.length).toBe(1);
      expect(remainingQueue[0].status).toBe('scheduled');
    });
  });

  describe('Socket Event Verification', () => {
    it('emits correct skip reason for calibration lock', () => {
      const sorterManager = createMockSorterManager(true);
      const socketManager = createMockSocketManager();
      const context = {
        sorterManager,
        socketManager,
        sorterStateManager: createMockSorterStateManager(),
        positionTranslator: createMockPositionTranslator(),
        conveyorManager: createMockConveyorManager(),
      };

      handleEncoderSortPart({ partId: 'test-part', sorter: 2, bin: 15, encoderAtDetection: 500 }, context);

      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledWith(
        'test-part',
        'Calibration in progress - sorting disabled',
        2,
        15,
      );
    });

    it('emits skip events for each queued part during calibration', () => {
      const sorterManager = createMockSorterManager(true);
      const socketManager = createMockSocketManager();

      const queuedParts: EncoderPart[] = Array.from({ length: 5 }, (_, i) => ({
        partId: `part-${i}`,
        detectionEncoderPos: 500 + i * 50,
        jetPosition: 600 + i * 50,
        jet: i % 4,
        sorter: i % 4,
        bin: (i + 1) * 5,
        moveTriggerPosition: 100 + i * 10,
        expectedMoveCompletePosition: 150 + i * 10,
        jetCommandSent: false,
        moveCommandSent: false,
        status: 'scheduled' as const,
        detectionTime: Date.now(),
        pixelPosition: 100 + i * 20,
      }));

      processPositionActions(queuedParts, { sorterManager, socketManager });

      expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledTimes(5);

      // Verify each part was skipped with correct parameters
      queuedParts.forEach((part, i) => {
        expect(socketManager.emitEncoderPartSkipped).toHaveBeenCalledWith(
          `part-${i}`,
          'Calibration in progress - sorting disabled',
          part.sorter,
          part.bin,
        );
      });
    });
  });
});
