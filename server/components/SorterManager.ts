import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { SettingsManager } from './SettingsManager';
import { DeviceName } from '../../types/deviceName.type';

const FALL_TIME = 800; // time it takes to fall down the tube
const MOVE_PAUSE_BUFFER = 1500; // time buffer for part to fall out the tube

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

  constructor(config: SorterManagerConfig) {
    super('SorterManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
  }

  private generateBinPositions(gridDimensions: number[]): void {
    this.binPositions = [];
    for (const gridDimension of gridDimensions) {
      const positions = [{ x: 0, y: 0 }]; // position 0 is null because bin ids start at 1
      for (let y = 0; y < gridDimension; y++) {
        for (let x = 0; x < gridDimension; x++) {
          positions.push({ x, y });
        }
      }
      this.binPositions.push(positions);
    }
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
      this.travelTimes = [
        [0, 609, 858, 1051, 1217, 1358, 1487, 1606, 1716, 1714, 1762, 1818, 1825, 1874, 1923, 2016, 2017],
        [
          0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870,
          3006, 3009, 3144,
        ],
        [
          0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870,
          3006, 3009, 3144,
        ],
        [0, 609, 858, 1051, 1217, 1358, 1487, 1606, 1716, 1714, 1762, 1818, 1825, 1874, 1923, 2016, 2017],
      ];
      this.currentPositions = new Array(this.sorterCount).fill(0);

      // Generate bin positions and initialize sorters
      this.generateBinPositions(this.gridDimensions);

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.reinitialize.bind(this));
      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing sorter manager');
    }
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    // Unregister settings callback
    this.settingsManager.unregisterSettingsUpdateCallback(this.reinitialize.bind(this));
    this.currentPositions = new Array(this.sorterCount).fill(0);
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public async homeSorter(sorter: number): Promise<void> {
    const deviceName = DeviceName[`SORTER_${sorter}` as keyof typeof DeviceName];
    this.deviceManager.sendCommand(deviceName, ArduinoCommands.MOVE_TO_ORIGIN);
    this.currentPositions[sorter] = 0;
    this.socketManager.emitSorterPositionUpdate(sorter, 0);
  }

  public async moveSorter(sorter: number, bin: number): Promise<void> {
    const maxBin = this.gridDimensions[sorter] * this.gridDimensions[sorter];
    const constrainedBin = Math.max(1, Math.min(bin, maxBin));
    const deviceName = DeviceName[`SORTER_${sorter}` as keyof typeof DeviceName];
    this.deviceManager.sendCommand(deviceName, ArduinoCommands.MOVE_TO_BIN, constrainedBin);
    this.currentPositions[sorter] = constrainedBin;
    this.socketManager.emitSorterPositionUpdate(sorter, constrainedBin);
  }

  private getTravelTimeBetweenBins(
    sorter: number,
    fromBin: number,
    toBin: number,
    binPositions: { x: number; y: number }[][],
    travelTimes: number[][],
  ): number {
    // console.log(`sorter: ${sorter} from: ${fromBin} to: ${toBin}`);
    const { x: x1, y: y1 } = binPositions[sorter][toBin];
    const { x: x2, y: y2 } = binPositions[sorter][fromBin];
    const y = x2 - x1;
    const x = y2 - y1;
    const moveDist = Math.sqrt(x * x + y * y);
    const closestTravelTimeIndex = Math.round(moveDist);
    return travelTimes[sorter][closestTravelTimeIndex];
  }

  public calculateTimings(
    sorter: number,
    bin: number,
    initialTime: number,
    initialPosition: number,
    prevSorterBin: number,
    conveyorSpeed: number,
    jetPositionMiddle: number,
  ): { moveTime: number; jetTime: number; travelTimeFromLastBin: number } {
    const distanceToJet = jetPositionMiddle - initialPosition;
    const jetTime = conveyorSpeed * distanceToJet + initialTime;

    const travelTimeFromLastBin = this.getTravelTimeBetweenBins(
      sorter,
      prevSorterBin,
      bin,
      this.binPositions,
      this.travelTimes,
    );

    const moveTime = Math.max(jetTime + FALL_TIME - travelTimeFromLastBin, 1);

    return { moveTime, jetTime, travelTimeFromLastBin };
  }

  public async scheduleSorterMove(sorter: number, bin: number, moveTime: number): Promise<void> {
    const delay = moveTime - Date.now();
    setTimeout(() => {
      this.moveSorter(sorter, bin);
    }, delay);
  }

  public getCurrentPosition(sorter: number): number {
    return this.currentPositions[sorter];
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
