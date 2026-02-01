import { Server as SocketIOServer, Socket } from 'socket.io';
import { SettingsManager } from './components/SettingsManager';
import { SocketManager } from './components/SocketManager';
import { DeviceManager } from './components/DeviceManager';
import { SorterManager } from './components/SorterManager';
import { SorterStateManager } from './components/SorterStateManager';
import { ConveyorManager } from './components/ConveyorManager';
import { PositionTranslator } from './components/PositionTranslator';
import { SortPartDto, sortPartSchema } from '../types/sortPart.dto';
import { EncoderPart } from '../types/part.type';
import { DeviceName } from '../types/deviceName.type';

export class SystemCoordinator {
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private deviceManager: DeviceManager;
  private sorterManager: SorterManager;
  private sorterStateManager: SorterStateManager;
  private conveyorManager: ConveyorManager;
  private positionTranslator: PositionTranslator;

  constructor(private io: SocketIOServer) {
    // Initialize components
    this.socketManager = new SocketManager({
      onSortPart: this.handleSortPart.bind(this),
      onConveyorOnOff: this.handleConveyorOnOff.bind(this),
      onHomeSorter: this.handleHomeSorter.bind(this),
      onMoveSorter: this.handleMoveSorter.bind(this),
      onFireJet: this.handleFireJet.bind(this),
      onListSerialPorts: this.handleListSerialPorts.bind(this),
      onResetSortProcess: this.handleResetSortProcess.bind(this),
      onUpdateFeederSettings: this.handleUpdateFeederSettings.bind(this),
      // Phase 7: Encoder calibration handlers
      onResetEncoder: this.handleResetEncoder.bind(this),
      onRecordCameraPosition: this.handleRecordCameraPosition.bind(this),
      onRecordCameraWidth: this.handleRecordCameraWidth.bind(this),
      onRecordJetPosition: this.handleRecordJetPosition.bind(this),
      onSaveCalibrationData: this.handleSaveCalibrationData.bind(this),
      // Phase 8: Travel time calibration handler
      onStartTravelTimeCalibration: this.handleStartTravelTimeCalibration.bind(this),
    });

    this.settingsManager = new SettingsManager(this.socketManager);

    this.deviceManager = new DeviceManager({
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
    });

    this.sorterManager = new SorterManager({
      deviceManager: this.deviceManager,
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
    });

    this.conveyorManager = new ConveyorManager({
      deviceManager: this.deviceManager,
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
      sorterManager: this.sorterManager,
    });

    // PositionTranslator for encoder-based scheduling (Phase 4)
    this.positionTranslator = new PositionTranslator(this.conveyorManager, this.settingsManager);

    this.sorterStateManager = new SorterStateManager({
      deviceManager: this.deviceManager,
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
      sorterManager: this.sorterManager,
      conveyorManager: this.conveyorManager,
    });

    // Complete circular dependency: ConveyorManager needs SorterStateManager for encoder-based scheduling
    this.conveyorManager.setSorterStateManager(this.sorterStateManager);

    // Setup socket connection handling
    this.io.on('connection', this.handleConnection.bind(this));
  }

  private async handleConnection(socket: Socket): Promise<void> {
    console.log('New client connected');
    this.socketManager.setSocket(socket);

    // Initialize components
    // await this.initializeComponents(); // Removed for eager initialization
  }

  public async initializeComponents(): Promise<void> {
    console.log('Starting component initialization...');
    try {
      console.log('Initializing SocketManager...');
      await this.socketManager.initialize();
      console.log('SocketManager initialized successfully.');

      console.log('Initializing SettingsManager...');
      await this.settingsManager.initialize();
      console.log('SettingsManager initialized successfully.');

      console.log('Initializing DeviceManager...');
      await this.deviceManager.initialize();
      console.log('DeviceManager initialized successfully.');

      console.log('Initializing SorterManager...');
      await this.sorterManager.initialize();
      console.log('SorterManager initialized successfully.');

      console.log('Initializing ConveyorManager...');
      await this.conveyorManager.initialize();
      console.log('ConveyorManager initialized successfully.');

      console.log('Initializing SorterStateManager...');
      await this.sorterStateManager.initialize();
      console.log('SorterStateManager initialized successfully.');

      console.log('All components initialized successfully. =============================');
    } catch (error) {
      console.error('\x1b[33mError during component initialization process:\x1b[0m', error);
      throw error;
    }
  }

  // Event handlers
  private async handleSortPart(rawData: unknown): Promise<void> {
    try {
      // Validate incoming data against schema
      const parseResult = sortPartSchema.safeParse(rawData);
      if (!parseResult.success) {
        console.error('[SORT] Invalid SORT_PART data:', parseResult.error.format());
        // Try to extract partId for skip notification, fall back to 'unknown'
        const partId = (rawData as any)?.partId ?? 'unknown';
        const sorter = (rawData as any)?.sorter ?? 0;
        const bin = (rawData as any)?.bin ?? 0;
        this.socketManager.emitEncoderPartSkipped(partId, 'Invalid data format', sorter, bin);
        return;
      }
      const data = parseResult.data;

      const settings = this.settingsManager.getSettings();
      if (!settings) {
        console.error('Settings not available, skipping part.');
        return;
      }

      // encoderAtDetection is now guaranteed by schema validation
      // but keep explicit check for extra safety and clear error message
      if (data.encoderAtDetection === undefined || data.encoderAtDetection === null) {
        console.error('[SORT] Missing encoderAtDetection in SORT_PART message');
        this.socketManager.emitEncoderPartSkipped(
          data.partId,
          'Missing encoder data from frontend',
          data.sorter,
          data.bin,
        );
        return;
      }

      // Check calibration
      const { cameraWidthInTicks, jetEncoderOffsets } = settings.positionCalibration;
      if (cameraWidthInTicks <= 0 || jetEncoderOffsets.every((o) => o === 0)) {
        console.error('[SORT] Calibration required - cannot sort part');
        this.socketManager.emitEncoderPartSkipped(data.partId, 'Calibration required', data.sorter, data.bin);
        return;
      }

      // Check specific sorter's jet is calibrated
      const jetOffset = jetEncoderOffsets[data.sorter];
      if (jetOffset === undefined || jetOffset <= 0) {
        console.error(`[SORT] Jet for sorter ${data.sorter} not calibrated - cannot sort part`);
        this.socketManager.emitEncoderPartSkipped(data.partId, 'Jet not calibrated', data.sorter, data.bin);
        return;
      }

      // Encoder-based scheduling only
      this.handleEncoderSortPart(data);
    } catch (error) {
      console.error('Error handling sort part:', error);
    }
  }

  /**
   * Handles part sorting using encoder-based position scheduling (Phase 4).
   * Uses position triggers instead of setTimeout for jet firing and sorter moves.
   */
  private handleEncoderSortPart(data: SortPartDto): void {
    if (this.sorterManager.isCalibrationInProgress()) {
      this.handleEncoderSkippedPart(data, 'Calibration in progress - sorting disabled');
      return;
    }

    // Build encoder part (returns null if sorter unavailable)
    const encoderPart = this.buildEncoderPart(data);

    if (!encoderPart) {
      // Part skipped - sorter unavailable
      this.handleEncoderSkippedPart(data, 'Sorter unavailable - cannot reach bin in time');
      return;
    }

    // Check if part is already past jet position
    const currentPos = this.conveyorManager.getInterpolatedPosition();
    if (currentPos >= encoderPart.jetPosition) {
      this.handleEncoderSkippedPart(data, 'Part already past jet position');
      return;
    }

    // Insert into encoder part queue
    this.conveyorManager.insertEncoderPart(encoderPart);

    // Schedule move with SorterStateManager
    this.sorterStateManager.scheduleMove(
      encoderPart.sorter,
      encoderPart.bin,
      encoderPart.partId,
      encoderPart.moveTriggerPosition,
    );

    // Emit scheduled event to frontend
    this.socketManager.emitEncoderPartScheduled(encoderPart);

    console.log(
      `[ENCODER_SORT] Part ${encoderPart.partId} scheduled: ` +
        `jetPos=${encoderPart.jetPosition}, movePos=${encoderPart.moveTriggerPosition}, ` +
        `sorter=${encoderPart.sorter}, bin=${encoderPart.bin}`,
    );
  }

  /**
   * Handles skipped encoder parts.
   */
  private handleEncoderSkippedPart(data: SortPartDto, reason: string): void {
    console.log(`[ENCODER_SKIP] Part ${data.partId} skipped: ${reason}`);
    this.socketManager.emitEncoderPartSkipped(data.partId, reason, data.sorter, data.bin);
  }

  /**
   * Builds an EncoderPart for position-based scheduling.
   * Returns null if the sorter is unavailable (part should be skipped).
   *
   * Uses encoderAtDetection directly from the frontend - no interpolation needed.
   * Calibration is now required (validated in handleSortPart).
   *
   * @param data - Sort part data from frontend
   * @returns EncoderPart for scheduling, or null if part should be skipped
   */
  private buildEncoderPart(data: SortPartDto): EncoderPart | null {
    const {
      partId,
      initialPosition,
      initialTime,
      encoderAtDetection,
      bin,
      sorter,
      cameraWidthPixels: providedCameraWidth,
    } = data;

    // Get calibration settings
    const calibration = this.positionTranslator.getCalibration();

    // Determine effective camera width: prefer provided value from frontend
    let effectiveCameraWidthPixels = calibration.cameraWidthPixels;
    if (providedCameraWidth && providedCameraWidth > 0) {
      if (calibration.cameraWidthPixels !== providedCameraWidth) {
        console.warn(
          `[ENCODER_PART] Camera width mismatch: calibration=${calibration.cameraWidthPixels}px, ` +
            `actual=${providedCameraWidth}px. Using actual value.`,
        );
      }
      effectiveCameraWidthPixels = providedCameraWidth;
    }

    // Use encoderAtDetection directly from frontend - no interpolation needed!
    const detectionEncoderPos = encoderAtDetection;

    // Calculate jet fire position using calibration
    const jetPosition = this.positionTranslator.calculateJetTriggerEncoder(
      initialPosition,
      detectionEncoderPos,
      sorter,
      effectiveCameraWidthPixels,
    );

    // Calculate the position by which the sorter must be ready
    const requiredByPosition = this.positionTranslator.calculateRequiredByPosition(jetPosition);

    // Check if sorter can reach the bin in time
    const availability = this.sorterStateManager.canSorterReachBin(sorter, bin, requiredByPosition);

    if (!availability.available) {
      console.log(`[ENCODER_PART] Part ${partId} - sorter ${sorter} unavailable: ${availability.reason}`);
      return null;
    }

    // Get the effective "from bin" for lead count calculation
    const fromBin = this.sorterStateManager.getEffectiveFromBin(sorter);
    const leadCounts = this.sorterStateManager.calculateLeadCounts(sorter, fromBin, bin);

    // Build the encoder part
    const encoderPart: EncoderPart = {
      partId,
      detectionEncoderPos,
      jetPosition,
      jet: sorter,
      sorter,
      bin,
      moveTriggerPosition: availability.triggerPosition,
      expectedMoveCompletePosition: availability.triggerPosition + leadCounts,
      jetCommandSent: false,
      moveCommandSent: false,
      status: 'scheduled',
      detectionTime: initialTime,
      pixelPosition: initialPosition,
    };

    console.log('[ENCODER_PART] Built encoder part:', {
      partId,
      detectionEncoderPos,
      jetPosition,
      sorter,
      bin,
    });

    return encoderPart;
  }

  private handleConveyorOnOff(): void {
    console.log('handleConveyorOnOff');
    this.conveyorManager.toggleConveyor();
  }

  private async handleHomeSorter(data: { sorter: number }): Promise<void> {
    // Mark move started before homing (homing always goes to bin 1)
    this.sorterStateManager.markMoveStarted(data.sorter, 1);
    await this.sorterManager.homeSorter(data.sorter);
  }

  private async handleMoveSorter(data: { sorter: number; bin: number }): Promise<void> {
    // Mark move started before sending move command
    this.sorterStateManager.markMoveStarted(data.sorter, data.bin);
    await this.sorterManager.moveSorter(data.sorter, data.bin);
  }

  private handleFireJet(data: { sorter: number }): void {
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, 'f', data.sorter);
  }

  private async handleListSerialPorts(): Promise<void> {
    try {
      const ports = await this.deviceManager.listSerialPorts();
      this.socketManager.emitListSerialPortsSuccess(ports);
    } catch (error) {
      console.error('\x1b[33mError listing serial ports:\x1b[0m', error);
    }
  }

  private handleResetSortProcess(): void {
    // Clear encoder part queue and reset conveyor manager
    this.conveyorManager.reinitialize();

    // Clear scheduled moves in SorterStateManager (Phase 4)
    this.sorterStateManager.clearAllScheduledMoves();

    console.log('[RESET] Sort process reset complete');
  }

  private handleUpdateFeederSettings(data: {
    vibrationSpeed: number;
    stopDelay: number;
    pauseTime: number;
    shortMoveTime: number;
    longMoveTime: number;
    hopperCycleInterval: number;
    hopperCycleSteps: number;
  }): void {
    // Send settings to Arduino in the format: 's,<HOPPER_CYCLE_INTERVAL>,<HOPPER_CYCLE_STEPS>,<FEEDER_VIBRATION_SPEED>,<FEEDER_STOP_DELAY>,<FEEDER_PAUSE_TIME>,<FEEDER_SHORT_MOVE_TIME>,<FEEDER_LONG_MOVE_TIME>'
    const message = `s,${data.hopperCycleInterval},${data.hopperCycleSteps},${data.vibrationSpeed},${data.stopDelay},${data.pauseTime},${data.shortMoveTime},${data.longMoveTime}`;
    this.deviceManager.sendCommand(DeviceName.HOPPER_FEEDER, message);
  }

  // --- Phase 7: Encoder Calibration Handlers ---

  /**
   * Handles encoder reset request from frontend.
   * Resets the encoder position to zero on both Arduino and server.
   */
  private handleResetEncoder(): void {
    try {
      console.log('[CALIBRATION] Resetting encoder position to 0');
      this.conveyorManager.resetEncoderPosition();
      const position = this.conveyorManager.getCurrentEncoderPosition();
      this.socketManager.emitEncoderResetComplete(true, position);
      console.log('[CALIBRATION] Encoder reset complete, new position:', position);
    } catch (error) {
      console.error('[CALIBRATION] Error resetting encoder:', error);
      this.socketManager.emitEncoderResetComplete(false, -1);
    }
  }

  /**
   * Handles record camera position request from frontend.
   * Records the current encoder position as the camera calibration offset.
   * @deprecated Use handleRecordCameraWidth instead for the new calibration workflow.
   */
  private async handleRecordCameraPosition(): Promise<void> {
    try {
      const position = this.conveyorManager.getInterpolatedPosition();
      console.log('[CALIBRATION] Recording camera position:', position);

      // Update settings in Firebase
      const currentSettings = this.settingsManager.getSettings();
      if (!currentSettings) {
        throw new Error('Settings not available');
      }

      await this.settingsManager.updateSettings({
        positionCalibration: {
          ...currentSettings.positionCalibration,
          cameraEncoderOffset: position,
        },
      });

      this.socketManager.emitCalibrationPointRecorded('camera', position, true);
      console.log('[CALIBRATION] Camera position recorded successfully:', position);
    } catch (error) {
      console.error('[CALIBRATION] Error recording camera position:', error);
      this.socketManager.emitCalibrationPointRecorded('camera', 0, false);
    }
  }

  /**
   * Handles record camera width request from frontend.
   * Records the camera view width in encoder ticks (left edge to right edge).
   * Optionally updates cameraWidthPixels if provided from video capture.
   * This is used for pixel-to-tick translation during part detection.
   */
  private async handleRecordCameraWidth(data: { widthInTicks: number; cameraWidthPixels?: number }): Promise<void> {
    try {
      const { widthInTicks, cameraWidthPixels } = data;

      if (widthInTicks <= 0) {
        throw new Error(`Invalid camera width: ${widthInTicks} (must be positive)`);
      }

      console.log(`[CALIBRATION] Recording camera width: ${widthInTicks} ticks`);
      if (cameraWidthPixels) {
        console.log(`[CALIBRATION] Auto-syncing camera width pixels: ${cameraWidthPixels}`);
      }

      const currentSettings = this.settingsManager.getSettings();
      if (!currentSettings) {
        throw new Error('Settings not available');
      }

      await this.settingsManager.updateSettings({
        positionCalibration: {
          ...currentSettings.positionCalibration,
          cameraWidthInTicks: widthInTicks,
          // Update cameraWidthPixels if provided from video capture
          ...(cameraWidthPixels && cameraWidthPixels > 0 && { cameraWidthPixels }),
        },
      });

      this.socketManager.emitCalibrationPointRecorded('cameraWidth', widthInTicks, true);
      console.log(`[CALIBRATION] Camera width recorded successfully: ${widthInTicks} ticks`);
    } catch (error) {
      console.error('[CALIBRATION] Error recording camera width:', error);
      this.socketManager.emitCalibrationPointRecorded('cameraWidth', 0, false);
    }
  }

  /**
   * Handles record jet position request from frontend.
   * Records the encoder tick offset from camera left edge to a specific jet.
   * The frontend sends the offset directly (encoder position at mark time,
   * which equals offset since encoder was reset to 0 at calibration start).
   */
  private async handleRecordJetPosition(data: { sorter: number; offsetFromLeftEdge: number }): Promise<void> {
    try {
      const { sorter, offsetFromLeftEdge } = data;

      // Validate sorter index
      if (sorter < 0 || sorter > 3) {
        throw new Error(`Invalid sorter index: ${sorter}`);
      }

      // Validate offset value - must be a non-negative number (not undefined/NaN)
      if (typeof offsetFromLeftEdge !== 'number' || Number.isNaN(offsetFromLeftEdge) || offsetFromLeftEdge < 0) {
        throw new Error(`Invalid offset: ${offsetFromLeftEdge} (must be a non-negative number)`);
      }

      console.log(`[CALIBRATION] Recording jet ${sorter}: ${offsetFromLeftEdge} ticks from camera left edge`);

      const currentSettings = this.settingsManager.getSettings();
      if (!currentSettings) {
        throw new Error('Settings not available');
      }

      // Clone the current jet offsets array and update the specific sorter
      const jetEncoderOffsets = [...currentSettings.positionCalibration.jetEncoderOffsets] as [
        number,
        number,
        number,
        number,
      ];
      jetEncoderOffsets[sorter] = offsetFromLeftEdge;

      await this.settingsManager.updateSettings({
        positionCalibration: {
          ...currentSettings.positionCalibration,
          jetEncoderOffsets,
        },
      });

      this.socketManager.emitCalibrationPointRecorded('jet', offsetFromLeftEdge, true, sorter);
      console.log(`[CALIBRATION] Jet ${sorter} recorded successfully: ${offsetFromLeftEdge} ticks from left edge`);

      // Validate that jet offset is greater than camera width (jets must be past the camera)
      const cameraWidth = currentSettings.positionCalibration.cameraWidthInTicks;
      if (cameraWidth > 0 && offsetFromLeftEdge <= cameraWidth) {
        console.warn(
          `[CALIBRATION] Warning: Jet ${sorter} offset (${offsetFromLeftEdge}) ` +
            `is not greater than camera width (${cameraWidth}). This may cause timing issues.`,
        );
      }
    } catch (error) {
      console.error('[CALIBRATION] Error recording jet position:', error);
      this.socketManager.emitCalibrationPointRecorded('jet', 0, false, data.sorter);
    }
  }

  /**
   * Handles batched calibration data save from frontend.
   * Saves all calibration values (camera width + jet positions) in a single Firebase write.
   * This reduces settings update cascades from 5 to 1.
   */
  private async handleSaveCalibrationData(data: {
    cameraWidthInTicks: number;
    cameraWidthPixels?: number;
    jetEncoderOffsets: [number, number, number, number];
  }): Promise<void> {
    try {
      const { cameraWidthInTicks, cameraWidthPixels, jetEncoderOffsets } = data;

      console.log('[CALIBRATION] Saving all calibration data at once');
      console.log(`[CALIBRATION] Camera width: ${cameraWidthInTicks} ticks`);
      console.log(`[CALIBRATION] Jet offsets: [${jetEncoderOffsets.join(', ')}]`);

      // Validate camera width
      if (cameraWidthInTicks <= 0) {
        throw new Error(`Invalid camera width: ${cameraWidthInTicks} (must be positive)`);
      }

      const currentSettings = this.settingsManager.getSettings();
      if (!currentSettings) {
        throw new Error('Settings not available');
      }

      // Validate jet offsets - warn if any are less than camera width
      jetEncoderOffsets.forEach((offset, index) => {
        if (offset > 0 && offset <= cameraWidthInTicks) {
          console.warn(
            `[CALIBRATION] Warning: Jet ${index} offset (${offset}) ` +
              `is not greater than camera width (${cameraWidthInTicks}). This may cause timing issues.`,
          );
        }
      });

      await this.settingsManager.updateSettings({
        positionCalibration: {
          ...currentSettings.positionCalibration,
          cameraWidthInTicks,
          ...(cameraWidthPixels && cameraWidthPixels > 0 && { cameraWidthPixels }),
          jetEncoderOffsets,
        },
      });

      this.socketManager.emitCalibrationPointRecorded('cameraWidth', cameraWidthInTicks, true);
      console.log('[CALIBRATION] All calibration data saved successfully');
    } catch (error) {
      console.error('[CALIBRATION] Error saving calibration data:', error);
      this.socketManager.emitCalibrationPointRecorded('cameraWidth', 0, false);
    }
  }

  // --- Phase 8: Travel Time Calibration Handler ---

  /**
   * Waits for all sorters to reach home position (bin 1).
   *
   * Polls SorterStateManager.getCurrentBin() until all sorters report bin 1,
   * or times out. This handles the case where the user clicks "Calibrate"
   * shortly after "Home All" - the Arduino MC:1 responses may not have arrived yet.
   *
   * @param sorterCount - Number of sorters to check
   * @param timeoutMs - Maximum time to wait (default 30s, matches Arduino HOMING_TIMEOUT_MS)
   * @param pollIntervalMs - Interval between polls (default 200ms)
   * @returns Object indicating success or failure with list of sorters not at home
   */
  private async waitForAllSortersHomed(
    sorterCount: number,
    timeoutMs: number = 30000,
    pollIntervalMs: number = 200,
  ): Promise<{ ok: true } | { ok: false; notHomedSorters: number[] }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const notHomedSorters: number[] = [];

      for (let i = 0; i < sorterCount; i++) {
        const currentBin = this.sorterStateManager.getCurrentBin(i);
        if (currentBin !== 1) {
          notHomedSorters.push(i);
        }
      }

      // All sorters at home - proceed immediately
      if (notHomedSorters.length === 0) {
        return { ok: true };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - collect final list of sorters not at home
    const notHomedSorters: number[] = [];
    for (let i = 0; i < sorterCount; i++) {
      const currentBin = this.sorterStateManager.getCurrentBin(i);
      if (currentBin !== 1) {
        notHomedSorters.push(i);
      }
    }

    return { ok: false, notHomedSorters };
  }

  /**
   * Handles travel time calibration request from frontend.
   *
   * Preconditions:
   * - All sorters must be homed (at bin 1) before calibration can start
   * - Calibration must not already be in progress
   *
   * The handler:
   * 1. Validates sorters are homed
   * 2. Emits 'started' status
   * 3. Calls sorterManager.startCalibration()
   * 4. Emits final status ('complete' or 'partial_failure')
   */
  private async handleStartTravelTimeCalibration(): Promise<void> {
    try {
      console.log('[CALIBRATION] Travel time calibration requested');

      // Check if calibration is already in progress
      if (this.sorterManager.isCalibrationInProgress()) {
        console.warn('[CALIBRATION] Calibration already in progress');
        this.socketManager.emitTravelTimeCalibrationStatus('error', 'Calibration already in progress');
        return;
      }

      // Reset all sorting state - calibration is a clean-slate operation
      const queuedParts = this.conveyorManager.getEncoderPartQueue();
      for (const part of queuedParts) {
        this.socketManager.emitEncoderPartSkipped(
          part.partId,
          'Calibration started - sorting state reset',
          part.sorter,
          part.bin,
        );
      }
      this.conveyorManager.clearEncoderPartQueue();
      this.sorterStateManager.clearAllScheduledMoves();
      console.log('[CALIBRATION] Reset sorting state (queue cleared, scheduled moves cleared)');

      // Check settings available
      const settings = this.settingsManager.getSettings();
      if (!settings) {
        this.socketManager.emitTravelTimeCalibrationStatus('error', 'Settings not available');
        return;
      }

      const sorterCount = settings.sorters.length;

      // Emit started status immediately for UX feedback
      // (the homing wait can take up to 30 seconds)
      this.socketManager.emitTravelTimeCalibrationStatus('started');
      console.log('[CALIBRATION] Waiting for all sorters to reach home position...');

      // Wait for all sorters to be homed (at bin 1), with polling
      // This handles the case where user clicks Calibrate right after Home All
      const homingResult = await this.waitForAllSortersHomed(sorterCount);

      if (!homingResult.ok) {
        const errorMsg = `Sorters ${homingResult.notHomedSorters.join(', ')} did not reach home within 30 seconds. Ensure all sorters are homed before calibrating.`;
        console.warn(`[CALIBRATION] ${errorMsg}`);
        this.socketManager.emitTravelTimeCalibrationStatus('error', errorMsg);
        return;
      }

      console.log('[CALIBRATION] All sorters homed. Starting travel time calibration for all sorters');

      // Run calibration
      const results = await this.sorterManager.startCalibration();

      // Determine final status
      const successCount = results.filter((r) => r.success).length;
      const totalCount = results.length;

      // Map results to socket payload format
      const socketResults = results.map((r) => ({
        sorter: r.sorter,
        success: r.success,
        error: r.error,
      }));

      if (successCount === totalCount) {
        console.log('[CALIBRATION] Travel time calibration complete - all sorters succeeded');
        this.socketManager.emitTravelTimeCalibrationStatus('complete', undefined, socketResults);
      } else if (successCount > 0) {
        console.warn(`[CALIBRATION] Travel time calibration partial failure: ${successCount}/${totalCount} succeeded`);
        this.socketManager.emitTravelTimeCalibrationStatus('partial_failure', undefined, socketResults);
      } else {
        console.error('[CALIBRATION] Travel time calibration failed for all sorters');
        this.socketManager.emitTravelTimeCalibrationStatus('error', 'All sorters failed calibration', socketResults);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CALIBRATION] Error during travel time calibration:', errorMsg);
      this.socketManager.emitTravelTimeCalibrationStatus('error', errorMsg);
    }
  }
}
