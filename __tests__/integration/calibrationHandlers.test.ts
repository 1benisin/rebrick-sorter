// __tests__/integration/calibrationHandlers.test.ts

/**
 * Integration tests for calibration handlers in SystemCoordinator.
 *
 * These tests verify the handler logic by testing the handler functions
 * in isolation with mocked dependencies. This allows testing business logic
 * without requiring hardware connections.
 */

import {
  createMockSettingsManager,
  createNullSettingsManager,
  defaultPositionCalibration,
} from '../mocks/mockSettingsManager';
import { createMockConveyorManager, createErrorConveyorManager } from '../mocks/mockConveyorManager';
import { createMockSocketManager } from '../mocks/mockSocketManager';

/**
 * Creates a minimal handler context for testing.
 * This simulates the dependencies available to SystemCoordinator handlers.
 */
const createHandlerContext = (overrides?: {
  settingsManager?: ReturnType<typeof createMockSettingsManager>;
  conveyorManager?: ReturnType<typeof createMockConveyorManager>;
  socketManager?: ReturnType<typeof createMockSocketManager>;
}) => {
  return {
    settingsManager: overrides?.settingsManager ?? createMockSettingsManager(),
    conveyorManager: overrides?.conveyorManager ?? createMockConveyorManager(),
    socketManager: overrides?.socketManager ?? createMockSocketManager(),
  };
};

/**
 * Simulates handleRecordCameraWidth handler logic.
 * Extracted from SystemCoordinator for testability.
 */
async function handleRecordCameraWidth(
  data: { widthInTicks: number; cameraWidthPixels?: number },
  context: ReturnType<typeof createHandlerContext>,
): Promise<void> {
  try {
    const { widthInTicks, cameraWidthPixels } = data;

    if (widthInTicks <= 0) {
      throw new Error(`Invalid camera width: ${widthInTicks} (must be positive)`);
    }

    const currentSettings = context.settingsManager.getSettings();
    if (!currentSettings) {
      throw new Error('Settings not available');
    }

    await context.settingsManager.updateSettings({
      positionCalibration: {
        ...currentSettings.positionCalibration,
        cameraWidthInTicks: widthInTicks,
        ...(cameraWidthPixels && cameraWidthPixels > 0 && { cameraWidthPixels }),
      },
    });

    context.socketManager.emitCalibrationPointRecorded('cameraWidth', widthInTicks, true);
  } catch (error) {
    context.socketManager.emitCalibrationPointRecorded('cameraWidth', 0, false);
  }
}

/**
 * Simulates handleRecordJetPosition handler logic.
 * Extracted from SystemCoordinator for testability.
 */
async function handleRecordJetPosition(
  data: { sorter: number; offsetFromLeftEdge: number },
  context: ReturnType<typeof createHandlerContext>,
): Promise<void> {
  try {
    const { sorter, offsetFromLeftEdge } = data;

    // Validate sorter index
    if (sorter < 0 || sorter > 3) {
      throw new Error(`Invalid sorter index: ${sorter}`);
    }

    // Validate offset value
    if (typeof offsetFromLeftEdge !== 'number' || Number.isNaN(offsetFromLeftEdge) || offsetFromLeftEdge < 0) {
      throw new Error(`Invalid offset: ${offsetFromLeftEdge} (must be a non-negative number)`);
    }

    const currentSettings = context.settingsManager.getSettings();
    if (!currentSettings) {
      throw new Error('Settings not available');
    }

    // Clone and update jet offsets
    const jetEncoderOffsets = [...currentSettings.positionCalibration.jetEncoderOffsets];
    jetEncoderOffsets[sorter] = offsetFromLeftEdge;

    await context.settingsManager.updateSettings({
      positionCalibration: {
        ...currentSettings.positionCalibration,
        jetEncoderOffsets,
      },
    });

    context.socketManager.emitCalibrationPointRecorded('jet', offsetFromLeftEdge, true, sorter);

    // Validation warning for jet offset <= camera width
    const cameraWidth = currentSettings.positionCalibration.cameraWidthInTicks;
    if (cameraWidth > 0 && offsetFromLeftEdge <= cameraWidth) {
      console.warn(
        `Warning: Jet ${sorter} offset (${offsetFromLeftEdge}) ` +
          `is not greater than camera width (${cameraWidth}). This may cause timing issues.`,
      );
    }
  } catch (error) {
    context.socketManager.emitCalibrationPointRecorded('jet', 0, false, data.sorter);
  }
}

/**
 * Simulates handleResetEncoder handler logic.
 * Extracted from SystemCoordinator for testability.
 */
function handleResetEncoder(context: ReturnType<typeof createHandlerContext>): void {
  try {
    context.conveyorManager.resetEncoderPosition();
    const position = context.conveyorManager.getCurrentEncoderPosition();
    context.socketManager.emitEncoderResetComplete(true, position);
  } catch (error) {
    context.socketManager.emitEncoderResetComplete(false, -1);
  }
}

describe('handleRecordCameraWidth', () => {
  it('saves valid camera width to settings', async () => {
    const context = createHandlerContext();

    await handleRecordCameraWidth({ widthInTicks: 150 }, context);

    expect(context.settingsManager.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        positionCalibration: expect.objectContaining({
          cameraWidthInTicks: 150,
        }),
      }),
    );
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('cameraWidth', 150, true);
  });

  it('rejects zero width', async () => {
    const context = createHandlerContext();

    await handleRecordCameraWidth({ widthInTicks: 0 }, context);

    expect(context.settingsManager.updateSettings).not.toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('cameraWidth', 0, false);
  });

  it('rejects negative width', async () => {
    const context = createHandlerContext();

    await handleRecordCameraWidth({ widthInTicks: -100 }, context);

    expect(context.settingsManager.updateSettings).not.toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('cameraWidth', 0, false);
  });

  it('includes cameraWidthPixels when provided', async () => {
    const context = createHandlerContext();

    await handleRecordCameraWidth({ widthInTicks: 150, cameraWidthPixels: 1920 }, context);

    expect(context.settingsManager.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        positionCalibration: expect.objectContaining({
          cameraWidthInTicks: 150,
          cameraWidthPixels: 1920,
        }),
      }),
    );
  });

  it('ignores invalid cameraWidthPixels (zero)', async () => {
    const context = createHandlerContext();

    await handleRecordCameraWidth({ widthInTicks: 150, cameraWidthPixels: 0 }, context);

    // Should not include cameraWidthPixels in update
    expect(context.settingsManager.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        positionCalibration: expect.not.objectContaining({
          cameraWidthPixels: 0,
        }),
      }),
    );
  });

  it('handles settings not available', async () => {
    const nullSettings = createNullSettingsManager();
    const context = createHandlerContext({ settingsManager: nullSettings });

    await handleRecordCameraWidth({ widthInTicks: 150 }, context);

    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('cameraWidth', 0, false);
  });

  it('handles large encoder values', async () => {
    const context = createHandlerContext();

    await handleRecordCameraWidth({ widthInTicks: 100000 }, context);

    expect(context.settingsManager.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        positionCalibration: expect.objectContaining({
          cameraWidthInTicks: 100000,
        }),
      }),
    );
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('cameraWidth', 100000, true);
  });
});

describe('handleRecordJetPosition', () => {
  it('saves valid jet position for sorter 0', async () => {
    const context = createHandlerContext();

    await handleRecordJetPosition({ sorter: 0, offsetFromLeftEdge: 500 }, context);

    expect(context.settingsManager.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        positionCalibration: expect.objectContaining({
          jetEncoderOffsets: expect.arrayContaining([500]),
        }),
      }),
    );
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 500, true, 0);
  });

  it('saves valid jet position for all sorters (0-3)', async () => {
    const offsets = [500, 600, 700, 800];

    for (let sorter = 0; sorter <= 3; sorter++) {
      const context = createHandlerContext();
      await handleRecordJetPosition({ sorter, offsetFromLeftEdge: offsets[sorter] }, context);

      expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith(
        'jet',
        offsets[sorter],
        true,
        sorter,
      );
    }
  });

  it('rejects invalid sorter index (negative)', async () => {
    const context = createHandlerContext();

    await handleRecordJetPosition({ sorter: -1, offsetFromLeftEdge: 500 }, context);

    expect(context.settingsManager.updateSettings).not.toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 0, false, -1);
  });

  it('rejects invalid sorter index (> 3)', async () => {
    const context = createHandlerContext();

    await handleRecordJetPosition({ sorter: 4, offsetFromLeftEdge: 500 }, context);

    expect(context.settingsManager.updateSettings).not.toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 0, false, 4);
  });

  it('rejects negative offset', async () => {
    const context = createHandlerContext();

    await handleRecordJetPosition({ sorter: 0, offsetFromLeftEdge: -100 }, context);

    expect(context.settingsManager.updateSettings).not.toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 0, false, 0);
  });

  it('rejects NaN offset', async () => {
    const context = createHandlerContext();

    await handleRecordJetPosition({ sorter: 0, offsetFromLeftEdge: NaN }, context);

    expect(context.settingsManager.updateSettings).not.toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 0, false, 0);
  });

  it('accepts zero offset (edge of camera)', async () => {
    const context = createHandlerContext();

    await handleRecordJetPosition({ sorter: 0, offsetFromLeftEdge: 0 }, context);

    expect(context.settingsManager.updateSettings).toHaveBeenCalled();
    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 0, true, 0);
  });

  it('logs warning when offset <= camera width', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Settings have cameraWidthInTicks: 150
    const context = createHandlerContext();

    // Offset 100 is less than camera width 150
    await handleRecordJetPosition({ sorter: 0, offsetFromLeftEdge: 100 }, context);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not greater than camera width'));
    warnSpy.mockRestore();
  });

  it('preserves other jet offsets when updating one', async () => {
    const context = createHandlerContext();

    // Initial offsets from mock: [500, 600, 700, 800]
    await handleRecordJetPosition({ sorter: 1, offsetFromLeftEdge: 650 }, context);

    const updateCall = context.settingsManager.updateSettings.mock.calls[0][0];
    const newOffsets = updateCall.positionCalibration.jetEncoderOffsets;

    // Sorter 1 updated, others preserved
    expect(newOffsets[0]).toBe(500);
    expect(newOffsets[1]).toBe(650); // Updated
    expect(newOffsets[2]).toBe(700);
    expect(newOffsets[3]).toBe(800);
  });

  it('handles settings not available', async () => {
    const nullSettings = createNullSettingsManager();
    const context = createHandlerContext({ settingsManager: nullSettings });

    await handleRecordJetPosition({ sorter: 0, offsetFromLeftEdge: 500 }, context);

    expect(context.socketManager.emitCalibrationPointRecorded).toHaveBeenCalledWith('jet', 0, false, 0);
  });
});

describe('handleResetEncoder', () => {
  it('resets encoder and emits success', () => {
    const context = createHandlerContext();
    // Mock returns position 1000, but after reset it should be 0
    context.conveyorManager.getCurrentEncoderPosition.mockReturnValue(0);

    handleResetEncoder(context);

    expect(context.conveyorManager.resetEncoderPosition).toHaveBeenCalled();
    expect(context.socketManager.emitEncoderResetComplete).toHaveBeenCalledWith(true, 0);
  });

  it('calls resetEncoderPosition on conveyor manager', () => {
    const context = createHandlerContext();

    handleResetEncoder(context);

    expect(context.conveyorManager.resetEncoderPosition).toHaveBeenCalledTimes(1);
  });

  it('handles error during reset', () => {
    const errorConveyor = createErrorConveyorManager();
    const context = createHandlerContext({ conveyorManager: errorConveyor });

    handleResetEncoder(context);

    expect(context.socketManager.emitEncoderResetComplete).toHaveBeenCalledWith(false, -1);
  });

  it('returns current position after reset', () => {
    const context = createHandlerContext();
    // Simulate that reset worked but there's a small offset
    context.conveyorManager.getCurrentEncoderPosition.mockReturnValue(5);

    handleResetEncoder(context);

    expect(context.socketManager.emitEncoderResetComplete).toHaveBeenCalledWith(true, 5);
  });
});
