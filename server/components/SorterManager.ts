import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { SettingsManager } from './SettingsManager';
import { DeviceName } from '../../types/deviceName.type';
import { TravelTimeCalibrationType } from '../../types/settings.type';

/**
 * Result of a single sorter's calibration attempt.
 */
export interface CalibrationResult {
  sorter: number;
  success: boolean;
  coefficients?: { a: number; b: number };
  error?: string;
}

/**
 * Result of a timed move operation.
 */
interface TimedMoveResult {
  bin: number;
  timeMs: number;
}

export interface SorterManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
}

export class SorterManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private sorterCount: number = 0;
  private gridDimensions: number[] = [];
  private travelTimes: number[][] = [];
  private binPositions: { x: number; y: number }[][] = [];
  private currentPositions: number[] = [];

  /** Bound callback for settings updates (prevents memory leak) */
  private boundReinitialize: () => Promise<void>;

  // ============================================================================
  // Calibration State
  // ============================================================================

  /** True when calibration is in progress */
  private isCalibrating: boolean = false;

  /** Map of sorter number to resolve function for pending MC: responses */
  private moveCompleteResolvers: Map<number, (bin: number) => void> = new Map();

  /** Bound callbacks for calibration data handling (one per sorter) */
  private boundCalibrationCallbacks: Map<DeviceName, (data: string) => void> = new Map();

  /** Timeout in milliseconds for individual calibration moves */
  private readonly CALIBRATION_MOVE_TIMEOUT_MS = 15000;

  /** Hardcoded fallback travel times for when no calibration data exists */
  private readonly FALLBACK_TRAVEL_TIMES: number[][] = [
    [0, 828, 1166, 1429, 1655, 1846, 2022, 2184, 2333, 2400, 2466, 2533, 2600, 2666, 2733, 2800, 2866],
    [
      0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870, 3006,
      3009, 3144,
    ],
    [
      0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870, 3006,
      3009, 3144, 3280, 3415, 3550, 3685, 3820, 3955, 4090,
    ],
    [0, 828, 1166, 1429, 1655, 1846, 2022, 2184, 2333, 2400, 2466, 2533, 2600, 2666, 2733, 2800, 2866, 2933, 3000],
  ];

  constructor(config: SorterManagerConfig) {
    super('SorterManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;

    // Bind callback once in constructor to ensure same reference for register/unregister
    this.boundReinitialize = this.reinitialize.bind(this);
  }

  private generateBinPositions(gridDimensions: number[]): { x: number; y: number }[][] {
    const binPositions: { x: number; y: number }[][] = [];
    for (const gridDimension of gridDimensions) {
      const positions = [{ x: 0, y: 0 }]; // position 0 is null because bin ids start at 1
      for (let y = 0; y < gridDimension; y++) {
        for (let x = 0; x < gridDimension; x++) {
          positions.push({ x, y });
        }
      }
      binPositions.push(positions);
    }
    return binPositions;
  }

  public async initialize(): Promise<void> {
    try {
      this.setStatus(ComponentStatus.INITIALIZING);

      // Get settings from SettingsManager
      const settings = this.settingsManager.getSettings();
      if (!settings) {
        throw new Error('Settings not available');
      }

      // Initialize from settings
      this.sorterCount = settings.sorters.length;
      this.gridDimensions = settings.sorters.map((sorter) => sorter.gridDimension);
      this.currentPositions = new Array(this.sorterCount).fill(1); // 1 is the first bin

      // Generate bin positions
      this.binPositions = this.generateBinPositions(this.gridDimensions);

      // Initialize travel times from calibration data or fallback to hardcoded values
      this.travelTimes = this.initializeTravelTimes(settings.travelTimeCalibration);

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.boundReinitialize);
      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing sorter manager');
    }
  }

  /**
   * Initializes travel times from calibration data or falls back to hardcoded values.
   * @param calibrationData - Array of calibration data for each sorter (may be empty, may contain nulls)
   * @returns Travel times array for each sorter
   */
  private initializeTravelTimes(calibrationData: (TravelTimeCalibrationType | null)[]): number[][] {
    const travelTimes: number[][] = [];

    for (let sorter = 0; sorter < this.sorterCount; sorter++) {
      const gridDimension = this.gridDimensions[sorter];
      const calibration = calibrationData[sorter];

      // Check for valid calibration data (not undefined, not null)
      if (calibration !== undefined && calibration !== null) {
        // Check if grid dimension has changed since calibration
        if (calibration.gridDimensionAtCalibration !== gridDimension) {
          console.warn(
            `[SORTER_MANAGER] Sorter ${sorter}: Grid dimension changed from ${calibration.gridDimensionAtCalibration} to ${gridDimension}. ` +
              `Using calibration coefficients anyway (they are dimension-agnostic).`,
          );
        }

        // Generate travel times from coefficients
        const generated = this.generateTravelTimesFromCoefficients(
          { a: calibration.a, b: calibration.b },
          gridDimension,
        );
        travelTimes.push(generated);
        console.log(
          `[SORTER_MANAGER] Sorter ${sorter}: Using calibrated travel times ` +
            `(a=${calibration.a.toFixed(4)}, b=${calibration.b.toFixed(2)}, ` +
            `calibrated at ${calibration.calibratedAt ?? 'unknown'})`,
        );
      } else if (this.FALLBACK_TRAVEL_TIMES[sorter]) {
        const fallback = this.FALLBACK_TRAVEL_TIMES[sorter];
        const maxIndex = Math.ceil((gridDimension - 1) * Math.SQRT2);

        // Check if fallback array is long enough for the current grid dimension
        if (fallback.length <= maxIndex) {
          // Fallback array too short for current grid dimension
          console.warn(
            `[SORTER_MANAGER] Sorter ${sorter}: Fallback travel times array too short ` +
              `(need ${maxIndex + 1} entries, have ${fallback.length}). Using basic linear estimate.`,
          );
          const basicTimes = Array.from({ length: maxIndex + 1 }, (_, i) => Math.round(i * 200));
          travelTimes.push(basicTimes);
        } else {
          // Fall back to hardcoded values
          travelTimes.push([...fallback]);
          console.log(`[SORTER_MANAGER] Sorter ${sorter}: Using hardcoded fallback travel times (no calibration data)`);
        }
      } else {
        // No calibration and no fallback - generate a basic linear estimate
        const maxIndex = Math.ceil((gridDimension - 1) * Math.SQRT2);
        const basicTimes = Array.from({ length: maxIndex + 1 }, (_, i) => Math.round(i * 200)); // ~200ms per unit
        travelTimes.push(basicTimes);
        console.warn(
          `[SORTER_MANAGER] Sorter ${sorter}: No calibration data and no fallback. Using basic linear estimate.`,
        );
      }
    }

    return travelTimes;
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    // Unregister settings callback (using same bound reference as registration)
    this.settingsManager.unregisterSettingsUpdateCallback(this.boundReinitialize);
    this.currentPositions = [];
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public async homeSorter(sorter: number): Promise<void> {
    const deviceName = DeviceName[`SORTER_${sorter}` as keyof typeof DeviceName];
    this.deviceManager.sendCommand(deviceName, ArduinoCommands.MOVE_TO_ORIGIN);
    this.currentPositions[sorter] = 1;
    this.socketManager.emitSorterPositionUpdate(sorter, 1);
  }

  public async moveSorter(sorter: number, bin: number): Promise<void> {
    const maxBin = this.gridDimensions[sorter] * this.gridDimensions[sorter];
    if (bin < 1 || bin > maxBin) {
      throw new Error(`Bin ${bin} is out of bounds for sorter ${sorter}. Valid range is 1 to ${maxBin}`);
    }
    const deviceName = DeviceName[`SORTER_${sorter}` as keyof typeof DeviceName];
    this.deviceManager.sendCommand(deviceName, ArduinoCommands.MOVE_TO_BIN, bin);
    this.currentPositions[sorter] = bin;
    this.socketManager.emitSorterPositionUpdate(sorter, bin);
  }

  public getTravelTimeBetweenBins({
    sorter,
    fromBin,
    toBin,
  }: {
    sorter: number;
    fromBin?: number;
    toBin: number;
  }): number {
    // if fromBin is not provided, use the current position of the sorter
    const confirmedFromBin = fromBin || this.currentPositions[sorter] || 1;

    const { x: x1, y: y1 } = this.binPositions[sorter][toBin];
    const { x: x2, y: y2 } = this.binPositions[sorter][confirmedFromBin];
    const y = x2 - x1;
    const x = y2 - y1;
    const moveDist = Math.sqrt(x * x + y * y);
    const closestTravelTimeIndex = Math.round(moveDist);
    // Clamp to valid array bounds (floating-point rounding or edge cases could exceed length)
    const times = this.travelTimes[sorter];
    if (!times || times.length === 0) {
      return 0; // Fallback when no travel times configured (e.g. zero sorters)
    }
    const safeIndex = Math.min(closestTravelTimeIndex, times.length - 1);
    return times[Math.max(0, safeIndex)];
  }

  public scheduleSorterMove(sorter: number, bin: number, moveTime: number): NodeJS.Timeout {
    const delay = moveTime - Date.now();
    return setTimeout(() => {
      this.moveSorter(sorter, bin);
    }, delay);
  }

  public getCurrentPosition(sorter: number): number {
    return this.currentPositions[sorter];
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }

  // ============================================================================
  // Calibration Methods
  // ============================================================================

  /**
   * Returns whether calibration is currently in progress.
   * Used by SystemCoordinator to prevent part processing during calibration.
   */
  public isCalibrationInProgress(): boolean {
    return this.isCalibrating;
  }

  /**
   * Generates a travel times lookup array from calibration coefficients.
   * Formula: time(d) = a×d² + b×d
   *
   * @param coefficients - The a and b coefficients from calibration
   * @param gridDimension - Grid size (NxN) to determine max distance
   * @returns Array of travel times indexed by distance (in bin units, rounded)
   */
  public generateTravelTimesFromCoefficients(
    coefficients: { a: number; b: number },
    gridDimension: number,
  ): number[] {
    const { a, b } = coefficients;

    // Max diagonal distance is from (0,0) to (N-1, N-1) = (N-1)×√2
    const maxIndex = Math.ceil((gridDimension - 1) * Math.SQRT2);

    const times: number[] = [];
    for (let i = 0; i <= maxIndex; i++) {
      // time(d) = a×d² + b×d
      const time = a * i * i + b * i;
      // Ensure non-negative (shouldn't happen with valid calibration, but be safe)
      times.push(Math.max(0, Math.round(time)));
    }

    return times;
  }

  /**
   * Calculates quadratic coefficients from two data points.
   *
   * Given: time(0) = 0, time(D₁) = T₁, time(D₂) = T₂
   * Model: time(d) = a×d² + b×d
   *
   * From two equations:
   *   T₁ = a×D₁² + b×D₁
   *   T₂ = a×D₂² + b×D₂
   *
   * Solving:
   *   a = (T₂×D₁ - T₁×D₂) / (D₁×D₂×(D₂ - D₁))
   *   b = (T₁ - a×D₁²) / D₁
   */
  private calculateCoefficients(
    d1: number,
    t1: number,
    d2: number,
    t2: number,
  ): { a: number; b: number } {
    // Solve for a
    const denominator = d1 * d2 * (d2 - d1);
    if (Math.abs(denominator) < 0.0001) {
      throw new Error('Cannot calculate coefficients: division by zero (distances too similar)');
    }

    const a = (t2 * d1 - t1 * d2) / denominator;
    const b = (t1 - a * d1 * d1) / d1;

    return { a, b };
  }

  /**
   * Creates a callback handler for a specific sorter's calibration data.
   * Parses MC: messages and resolves the pending promise.
   */
  private createCalibrationCallback(sorterNum: number): (data: string) => void {
    return (data: string) => {
      const mcMatch = data.match(/^MC:\s*(\d+)$/);
      if (mcMatch) {
        const bin = parseInt(mcMatch[1], 10);
        const resolver = this.moveCompleteResolvers.get(sorterNum);
        if (resolver) {
          resolver(bin);
          this.moveCompleteResolvers.delete(sorterNum);
        }
      }
    };
  }

  /**
   * Waits for a move complete (MC:) response from a sorter.
   * @param sorterNum - Sorter index (0-3)
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that resolves with the bin number, or rejects on timeout
   */
  private waitForMoveComplete(sorterNum: number, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.moveCompleteResolvers.delete(sorterNum);
        reject(new Error(`Timeout waiting for MC: response from sorter ${sorterNum}`));
      }, timeoutMs);

      // Store resolver that will be called when MC: is received
      this.moveCompleteResolvers.set(sorterNum, (bin: number) => {
        clearTimeout(timeoutId);
        resolve(bin);
      });
    });
  }

  /**
   * Sends a move command and waits for completion, measuring the time taken.
   * @param sorterNum - Sorter index (0-3)
   * @param bin - Target bin number
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise with the bin and time taken
   */
  private async timedMove(sorterNum: number, bin: number, timeoutMs: number): Promise<TimedMoveResult> {
    const startTime = Date.now();

    // Send the move command
    const deviceName = DeviceName[`SORTER_${sorterNum}` as keyof typeof DeviceName];
    this.deviceManager.sendCommand(deviceName, ArduinoCommands.MOVE_TO_BIN, bin);

    // Wait for MC: response
    const resultBin = await this.waitForMoveComplete(sorterNum, timeoutMs);

    const endTime = Date.now();
    const timeMs = endTime - startTime;

    return { bin: resultBin, timeMs };
  }

  /**
   * Calculates bin positions for calibration moves.
   * @param gridDimension - Grid size (NxN)
   * @returns Middle bin number and max bin number
   */
  private getCalibrationBins(gridDimension: number): { middleBin: number; maxBin: number } {
    // Middle bin: floor(N/2), floor(N/2) position
    const midCoord = Math.floor(gridDimension / 2);
    const middleBin = midCoord * gridDimension + midCoord + 1;

    // Max bin: (N-1, N-1) position = N×N
    const maxBin = gridDimension * gridDimension;

    return { middleBin, maxBin };
  }

  /**
   * Calculates the Euclidean distance from bin 1 (0,0) to a target bin.
   * @param bin - Target bin number
   * @param gridDimension - Grid size (NxN)
   * @returns Distance in bin units
   */
  private calculateDistanceFromOrigin(bin: number, gridDimension: number): number {
    const y = Math.floor((bin - 1) / gridDimension);
    const x = (bin - 1) % gridDimension;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * Runs the calibration sequence for a single sorter.
   *
   * Calibration move sequence:
   * 1. Bin 1 (0,0) → Middle bin (N/2, N/2): measure T₁
   * 2. Middle bin → Bin 1: measure T₂ (same distance, for averaging)
   * 3. Bin 1 → Max bin (N-1, N-1): measure T₃
   *
   * Data points:
   * - (0, 0ms) — same bin, no movement (implicit)
   * - (D₁, average(T₁, T₂)) — middle distance
   * - (D₂, T₃) — max distance
   *
   * @param sorterNum - Sorter index (0-3)
   * @returns Calibration result with success status and coefficients
   */
  private async calibrateSorter(sorterNum: number): Promise<CalibrationResult> {
    const gridDimension = this.gridDimensions[sorterNum];
    if (!gridDimension) {
      return {
        sorter: sorterNum,
        success: false,
        error: `No grid dimension configured for sorter ${sorterNum}`,
      };
    }

    const { middleBin, maxBin } = this.getCalibrationBins(gridDimension);
    const d1 = this.calculateDistanceFromOrigin(middleBin, gridDimension);
    const d2 = this.calculateDistanceFromOrigin(maxBin, gridDimension);

    console.log(
      `[CALIBRATION] Sorter ${sorterNum}: Starting calibration ` +
        `(gridDimension=${gridDimension}, middleBin=${middleBin}, maxBin=${maxBin}, d1=${d1.toFixed(2)}, d2=${d2.toFixed(2)})`,
    );

    // Register calibration callback for this sorter
    const deviceName = DeviceName[`SORTER_${sorterNum}` as keyof typeof DeviceName];
    const callback = this.createCalibrationCallback(sorterNum);
    this.boundCalibrationCallbacks.set(deviceName, callback);
    this.deviceManager.registerDeviceDataCallback(deviceName, callback);

    try {
      // Move 1: Bin 1 → Middle bin
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Move 1 - Bin 1 → Bin ${middleBin}`);
      const move1 = await this.timedMove(sorterNum, middleBin, this.CALIBRATION_MOVE_TIMEOUT_MS);
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Move 1 complete in ${move1.timeMs}ms`);

      // Move 2: Middle bin → Bin 1 (same distance, for averaging)
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Move 2 - Bin ${middleBin} → Bin 1`);
      const move2 = await this.timedMove(sorterNum, 1, this.CALIBRATION_MOVE_TIMEOUT_MS);
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Move 2 complete in ${move2.timeMs}ms`);

      // Move 3: Bin 1 → Max bin
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Move 3 - Bin 1 → Bin ${maxBin}`);
      const move3 = await this.timedMove(sorterNum, maxBin, this.CALIBRATION_MOVE_TIMEOUT_MS);
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Move 3 complete in ${move3.timeMs}ms`);

      // Calculate average time for middle distance
      const t1 = (move1.timeMs + move2.timeMs) / 2;
      const t2 = move3.timeMs;

      console.log(
        `[CALIBRATION] Sorter ${sorterNum}: Data points - ` +
          `(d1=${d1.toFixed(2)}, t1=${t1.toFixed(0)}ms avg), ` +
          `(d2=${d2.toFixed(2)}, t2=${t2}ms)`,
      );

      // Calculate coefficients
      const coefficients = this.calculateCoefficients(d1, t1, d2, t2);
      console.log(
        `[CALIBRATION] Sorter ${sorterNum}: Calculated coefficients - ` +
          `a=${coefficients.a.toFixed(6)}, b=${coefficients.b.toFixed(4)}`,
      );

      // Move back to bin 1 (home position) after calibration
      console.log(`[CALIBRATION] Sorter ${sorterNum}: Returning to home position (bin 1)`);
      await this.timedMove(sorterNum, 1, this.CALIBRATION_MOVE_TIMEOUT_MS);

      return {
        sorter: sorterNum,
        success: true,
        coefficients,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CALIBRATION] Sorter ${sorterNum}: Calibration failed - ${errorMessage}`);
      return {
        sorter: sorterNum,
        success: false,
        error: errorMessage,
      };
    } finally {
      // Unregister calibration callback
      this.deviceManager.unregisterDeviceDataCallback(deviceName, callback);
      this.boundCalibrationCallbacks.delete(deviceName);
      this.moveCompleteResolvers.delete(sorterNum);
    }
  }

  /**
   * Starts the travel time calibration process for all sorters.
   *
   * This method:
   * 1. Sets isCalibrating flag to prevent part processing
   * 2. Runs calibration on all sorters in parallel
   * 3. Saves successful results to settings
   * 4. Updates travelTimes arrays with new values
   * 5. Returns results for all sorters
   *
   * @returns Array of calibration results for each sorter
   */
  public async startCalibration(): Promise<CalibrationResult[]> {
    if (this.isCalibrating) {
      throw new Error('Calibration already in progress');
    }

    console.log('[CALIBRATION] Starting travel time calibration for all sorters');
    this.isCalibrating = true;

    try {
      // Run calibration for all sorters in parallel
      const calibrationPromises = [];
      for (let i = 0; i < this.sorterCount; i++) {
        calibrationPromises.push(this.calibrateSorter(i));
      }

      const results = await Promise.allSettled(calibrationPromises);

      // Process results
      const calibrationResults: CalibrationResult[] = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            sorter: index,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          };
        }
      });

      // Build calibration data array for settings (supports null for uncalibrated sorters)
      const calibrationData: (TravelTimeCalibrationType | null)[] = [];
      const timestamp = new Date().toISOString();

      for (const result of calibrationResults) {
        if (result.success && result.coefficients) {
          calibrationData[result.sorter] = {
            a: result.coefficients.a,
            b: result.coefficients.b,
            calibratedAt: timestamp,
            gridDimensionAtCalibration: this.gridDimensions[result.sorter],
          };

          // Update travel times array for this sorter
          this.travelTimes[result.sorter] = this.generateTravelTimesFromCoefficients(
            result.coefficients,
            this.gridDimensions[result.sorter],
          );

          console.log(
            `[CALIBRATION] Sorter ${result.sorter}: Updated travel times array ` +
              `(${this.travelTimes[result.sorter].length} entries)`,
          );
        } else {
          // Keep existing calibration data if this sorter failed (may be null)
          const existingSettings = this.settingsManager.getSettings();
          const existingCalibration = existingSettings?.travelTimeCalibration?.[result.sorter];
          // Only copy if it's a valid calibration object (not null/undefined)
          if (existingCalibration) {
            calibrationData[result.sorter] = existingCalibration;
          }
        }
      }

      // Save calibration data to settings (only if at least one succeeded)
      const successfulCount = calibrationResults.filter((r) => r.success).length;
      if (successfulCount > 0) {
        // Fill any gaps in the array with existing data
        const existingSettings = this.settingsManager.getSettings();
        for (let i = 0; i < this.sorterCount; i++) {
          if (!calibrationData[i]) {
            const existingCalibration = existingSettings?.travelTimeCalibration?.[i];
            // Only copy if it's a valid calibration object (not null/undefined)
            if (existingCalibration) {
              calibrationData[i] = existingCalibration;
            }
          }
        }

        await this.settingsManager.updateSettings({
          travelTimeCalibration: calibrationData,
        });
        console.log(`[CALIBRATION] Saved calibration data for ${successfulCount} sorters to settings`);
      }

      // Log summary
      const failedSorters = calibrationResults.filter((r) => !r.success).map((r) => r.sorter);
      if (failedSorters.length > 0) {
        console.warn(`[CALIBRATION] Calibration failed for sorters: ${failedSorters.join(', ')}`);
      }
      console.log(`[CALIBRATION] Calibration complete: ${successfulCount}/${this.sorterCount} sorters succeeded`);

      return calibrationResults;
    } finally {
      this.isCalibrating = false;
    }
  }
}
