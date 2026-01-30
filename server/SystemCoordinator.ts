import { Server as SocketIOServer, Socket } from 'socket.io';
import { SettingsManager } from './components/SettingsManager';
import { SocketManager } from './components/SocketManager';
import { DeviceManager } from './components/DeviceManager';
import { SorterManager } from './components/SorterManager';
import { SorterStateManager } from './components/SorterStateManager';
import { ConveyorManager } from './components/ConveyorManager';
import { SpeedManager } from './components/SpeedManager';
import { PositionTranslator } from './components/PositionTranslator';
import { SortPartDto } from '../types/sortPart.dto';
import { Part, EncoderPart } from '../types/part.type';
import { DeviceName } from '../types/deviceName.type';

export const FALL_TIME_SHORTEST = 1200;
export const FALL_TIME_LONGEST = 2000;

export class SystemCoordinator {
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private deviceManager: DeviceManager;
  private sorterManager: SorterManager;
  private sorterStateManager: SorterStateManager;
  private conveyorManager: ConveyorManager;
  private speedManager: SpeedManager;
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
    });

    this.settingsManager = new SettingsManager(this.socketManager);

    this.deviceManager = new DeviceManager({
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
    });

    this.speedManager = new SpeedManager({
      deviceManager: this.deviceManager,
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
      speedManager: this.speedManager,
      sorterManager: this.sorterManager,
      buildPart: this.buildPart.bind(this),
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

      console.log('Initializing SpeedManager...');
      await this.speedManager.initialize();
      console.log('SpeedManager initialized successfully.');

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
  private async handleSortPart(data: SortPartDto): Promise<void> {
    try {
      const settings = this.settingsManager.getSettings();
      if (!settings) {
        console.error('Settings not available, skipping part.');
        return;
      }

      // Check if encoder-based scheduling is enabled (Phase 4)
      if (settings.useEncoderScheduling) {
        this.handleEncoderSortPart(data);
        return;
      }

      // Legacy time-based scheduling
      this.handleTimeSortPart(data, settings);
    } catch (error) {
      console.error('\x1b[33mError handling sort part:\x1b[0m', error);
    }
  }

  /**
   * Handles part sorting using encoder-based position scheduling (Phase 4).
   * Uses position triggers instead of setTimeout for jet firing and sorter moves.
   */
  private handleEncoderSortPart(data: SortPartDto): void {
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
   * Handles part sorting using legacy time-based scheduling.
   * Uses setTimeout for jet firing and sorter moves.
   */
  private handleTimeSortPart(
    data: SortPartDto,
    settings: NonNullable<ReturnType<typeof this.settingsManager.getSettings>>,
  ): void {
    // Calculate all timings for the part
    const part = this.buildPart(data);

    // if constant speed is enabled and there is an arrival time delay, we must skip the part
    if (settings.constantConveyorSpeed) {
      if (part.arrivalTimeDelay > 0) {
        console.log(`Skipping part ${part.partId}: Timing conflict with constant speed mode enabled.`);
        this.socketManager.emitPartSkipped(part);
        return;
      }
    } else {
      // if there is an arrival time delay, we need to slow down the part
      if (part.arrivalTimeDelay > 0) {
        // Calculate required slowdown percentage before applying it
        const targetJetTime = part.jetTime + part.arrivalTimeDelay;
        const currentTimeGap = part.jetTime - part.conveyorSpeedTime;
        const requiredTimeGap = targetJetTime - part.conveyorSpeedTime;
        const slowdownPercent = currentTimeGap / requiredTimeGap;
        const newSpeed = part.conveyorSpeed * slowdownPercent;

        const minAllowedSpeed =
          this.speedManager.getDefaultSpeed() * (settings.minConveyorRPM / settings.maxConveyorRPM);

        if (newSpeed < minAllowedSpeed) {
          part.status = 'skipped';
          this.socketManager.emitPartSkipped(part);
          return;
        }

        // Update part with arrival time delay
        part.moveTime += part.arrivalTimeDelay;
        part.moveFinishedTime += part.arrivalTimeDelay;
        part.jetTime += part.arrivalTimeDelay;
        part.conveyorSpeed = newSpeed;
      }
    }

    // Insert speed change
    this.conveyorManager.insertPart(part);

    // filter partQueue
    this.conveyorManager.filterQueue();
  }

  private buildPart(data: SortPartDto): Part {
    const { partId, initialTime, initialPosition, bin, sorter } = data;
    const settings = this.settingsManager.getSettings();
    if (!settings) {
      throw new Error('Settings not available in buildPart');
    }

    // -- calculate part properties --
    // default arrival time
    const jetPosition = this.conveyorManager.getJetPosition(sorter);
    // Use absolute belt distance from detection to jet; clamp to at least 1px.
    // This keeps timing correct regardless of leftward or rightward motion.
    const distanceToJet = Math.max(1, Math.abs(jetPosition - initialPosition));
    const defaultSpeed = this.speedManager.getDefaultSpeed();
    const conveyorTravelTime = distanceToJet / defaultSpeed;
    const defaultArrivalTime = initialTime + conveyorTravelTime;
    console.log('[JET_CALC]', {
      sorter,
      bin,
      initialPosition,
      jetPosition,
      distanceToJet,
      defaultSpeed,
      conveyorTravelTime,
      initialTime,
      defaultArrivalTime,
    });
    // jet time
    const jetTime = this.conveyorManager.findTimeAfterDistance(initialTime, distanceToJet);
    // move time
    const sorterPreviousPart = this.conveyorManager.findPreviousSorterPart(sorter);
    const travelTimeFromPreviousBin = this.sorterManager.getTravelTimeBetweenBins({
      sorter: sorter,
      fromBin: sorterPreviousPart?.bin,
      toBin: bin,
    });
    const moveTime = jetTime + FALL_TIME_SHORTEST - travelTimeFromPreviousBin;
    const moveFinishedTime = jetTime + FALL_TIME_LONGEST;
    // arrival time delay
    const arrivalTimeDelay = sorterPreviousPart ? Math.max(sorterPreviousPart.moveFinishedTime - moveTime, 0) : 0;
    // conveyor speed
    const nextConveyorPart = this.conveyorManager.findNextConveyorPart(defaultArrivalTime);
    let conveyorSpeed = defaultSpeed;
    if (!settings.constantConveyorSpeed && nextConveyorPart) {
      conveyorSpeed = nextConveyorPart.conveyorSpeed;
    }

    // conveyor speed time
    const previousConveyorPart = this.conveyorManager.findPreviousConveyorPart(defaultArrivalTime);
    const conveyorSpeedTime = previousConveyorPart?.jetTime || Date.now();

    // Create new part
    const part: Part = {
      partId,
      sorter,
      bin,
      initialPosition,
      initialTime,
      defaultArrivalTime,
      jetTime,
      moveTime,
      moveFinishedTime,
      arrivalTimeDelay,
      conveyorSpeed,
      conveyorSpeedTime,
      status: 'pending',
    };

    return part;
  }

  /**
   * Builds an EncoderPart for position-based scheduling.
   * Returns null if the sorter is unavailable (part should be skipped).
   *
   * Uses the new left-edge-based calibration system:
   * 1. Gets encoder position at detection time via interpolation
   * 2. Uses calculateJetTriggerEncoder() for accurate pixel-to-tick translation
   *
   * @param data - Sort part data from frontend
   * @returns EncoderPart for scheduling, or null if part should be skipped
   */
  private buildEncoderPart(data: SortPartDto): EncoderPart | null {
    const { partId, initialPosition, initialTime, bin, sorter, cameraWidthPixels: providedCameraWidth } = data;

    // Get calibration settings for camera width
    const calibration = this.positionTranslator.getCalibration();
    const isCalibrated = this.positionTranslator.isCalibrated();

    // Determine effective camera width: prefer provided value from frontend, fall back to calibration
    let effectiveCameraWidthPixels = calibration.cameraWidthPixels;
    if (providedCameraWidth && providedCameraWidth > 0) {
      // Validate against calibration - warn if mismatch detected
      if (calibration.cameraWidthPixels !== providedCameraWidth) {
        console.warn(
          `[ENCODER_PART] Camera width mismatch: calibration=${calibration.cameraWidthPixels}px, ` +
            `actual=${providedCameraWidth}px. Using actual value. Consider recalibrating.`,
        );
      }
      effectiveCameraWidthPixels = providedCameraWidth;
    }

    // 1. Get encoder position at detection time
    // When calibrated: get raw encoder position (no pixel offset) - pixel conversion is done in calculateJetTriggerEncoder
    // When not calibrated: use legacy pixelToEncoderPosition which includes pixel offset
    const detectionEncoderPos = isCalibrated
      ? this.positionTranslator.getEncoderPositionAtTime(initialTime)
      : this.positionTranslator.pixelToEncoderPosition(initialPosition, initialTime);

    // 2. Calculate jet fire position using the new calibration-based method
    // If calibrated: uses pixel position + raw encoder at detection + calibration data
    // If not calibrated: falls back to adding jet offset to detection position (which already has pixel offset)
    let jetPosition: number;
    if (isCalibrated) {
      // Use the new calibration-based calculation with raw encoder position
      jetPosition = this.positionTranslator.calculateJetTriggerEncoder(
        initialPosition, // pixelX from detection
        detectionEncoderPos, // raw encoder value at detection time (no pixel offset)
        sorter, // jet index
        effectiveCameraWidthPixels, // camera resolution width (from frontend or calibration)
      );
    } else {
      // Fallback to old method if not calibrated
      jetPosition = this.positionTranslator.calculateJetPosition(detectionEncoderPos, sorter);
      console.log('[ENCODER_PART] Using legacy calculation (not calibrated)');
    }

    // 3. Calculate the position by which the sorter must be ready
    const requiredByPosition = this.positionTranslator.calculateRequiredByPosition(jetPosition);

    // 4. Check if sorter can reach the bin in time
    const availability = this.sorterStateManager.canSorterReachBin(sorter, bin, requiredByPosition);

    // 5. Return null if sorter is unavailable (part will be skipped)
    if (!availability.available) {
      console.log(`[ENCODER_PART] Part ${partId} - sorter ${sorter} unavailable: ${availability.reason}`);
      return null;
    }

    // 6. Get the effective "from bin" for lead count calculation
    const fromBin = this.sorterStateManager.getEffectiveFromBin(sorter);
    const leadCounts = this.sorterStateManager.calculateLeadCounts(sorter, fromBin, bin);

    // 7. Build the encoder part
    const encoderPart: EncoderPart = {
      partId,
      detectionEncoderPos,
      jetPosition,
      jet: sorter, // jet number corresponds to sorter number
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
      moveTriggerPosition: availability.triggerPosition,
      expectedMoveCompletePosition: availability.triggerPosition + leadCounts,
      sorter,
      bin,
      calibrated: this.positionTranslator.isCalibrated(),
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
      const jetEncoderOffsets = [...currentSettings.positionCalibration.jetEncoderOffsets];
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
}
