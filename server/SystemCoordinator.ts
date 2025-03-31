import { Server as SocketIOServer, Socket } from 'socket.io';
import { SettingsManager } from './components/SettingsManager';
import { SocketManager } from './components/SocketManager';
import { DeviceManager } from './components/DeviceManager';
import { SorterManager } from './components/SorterManager';
import { ConveyorManager } from './components/ConveyorManager';
import { SpeedManager } from './components/SpeedManager';
import { SortPartDto } from '../types/sortPart.dto';
import { Part } from '../types/part.type';
import { DeviceName } from '../types/deviceName.type';

export const FALL_TIME_SHORTEST = 1200;
export const FALL_TIME_LONGEST = 2000;

export class SystemCoordinator {
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private deviceManager: DeviceManager;
  private sorterManager: SorterManager;
  private conveyorManager: ConveyorManager;
  private speedManager: SpeedManager;

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
    });

    this.settingsManager = new SettingsManager(this.socketManager);

    this.deviceManager = new DeviceManager({
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
    });

    // Register device manager as a callback for settings updates
    this.settingsManager.registerSettingsUpdateCallback(this.deviceManager.updateSettings.bind(this.deviceManager));

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

    // Setup socket connection handling
    this.io.on('connection', this.handleConnection.bind(this));
  }

  private async handleConnection(socket: Socket): Promise<void> {
    console.log('New client connected');
    this.socketManager.setSocket(socket);

    // Initialize components
    await this.initializeComponents();
  }

  private async initializeComponents(): Promise<void> {
    try {
      // Initialize socket manager first
      await this.socketManager.initialize();

      // Initialize settings manager to get initial settings
      await this.settingsManager.initialize();

      // Initialize device manager with settings
      await this.deviceManager.initialize();

      // Initialize speed manager
      await this.speedManager.initialize();

      // Initialize sorter manager
      await this.sorterManager.initialize();

      // Initialize conveyor manager
      await this.conveyorManager.initialize();

      console.log('Initialized all components =============================');
    } catch (error) {
      console.error('\x1b[33mError initializing components:\x1b[0m', error);
    }
  }

  // Event handlers
  private async handleSortPart(data: SortPartDto): Promise<void> {
    try {
      // Calculate all timings for the part
      const part = this.buildPart(data);

      // if there is an arrival time delay, we need to slow down the part
      if (part.arrivalTimeDelay > 0) {
        // Calculate required slowdown percentage before applying it
        const targetJetTime = part.jetTime + part.arrivalTimeDelay;
        const currentTimeGap = part.jetTime - part.conveyorSpeedTime;
        const requiredTimeGap = targetJetTime - part.conveyorSpeedTime;
        const slowdownPercent = currentTimeGap / requiredTimeGap;
        const newSpeed = part.conveyorSpeed * slowdownPercent;
        const settings = this.settingsManager.getSettings();
        if (!settings) {
          part.status = 'skipped';
          this.socketManager.emitPartSkipped(part);
          return;
        }
        const minAllowedSpeed = this.speedManager.getDefaultSpeed() * (settings.minConveyorRPM / settings.conveyorRPM);

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

      // Insert speed change
      this.conveyorManager.insertPart(part);

      // filter partQueue
      this.conveyorManager.filterQueue();
    } catch (error) {
      console.error('\x1b[33mError handling sort part:\x1b[0m', error);
    }
  }

  private buildPart(data: SortPartDto): Part {
    const { partId, initialTime, initialPosition, bin, sorter } = data;
    // -- calculate part properties --
    // default arrival time
    const jetPosition = this.conveyorManager.getJetPosition(sorter);
    const distanceToJet = jetPosition - initialPosition;
    const defaultSpeed = this.speedManager.getDefaultSpeed();
    const conveyorTravelTime = distanceToJet / defaultSpeed;
    const defaultArrivalTime = initialTime + conveyorTravelTime;
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
    const conveyorSpeed = nextConveyorPart?.conveyorSpeed || defaultSpeed;
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

  private handleConveyorOnOff(): void {
    console.log('handleConveyorOnOff');
    this.conveyorManager.toggleConveyor();
  }

  private async handleHomeSorter(data: { sorter: number }): Promise<void> {
    await this.sorterManager.homeSorter(data.sorter);
  }

  private async handleMoveSorter(data: { sorter: number; bin: number }): Promise<void> {
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
    this.conveyorManager.reinitialize();
  }

  private handleUpdateFeederSettings(data: {
    vibrationSpeed: number;
    stopDelay: number;
    pauseTime: number;
    shortMoveTime: number;
    hopperCycleInterval: number;
  }): void {
    // Send settings to Arduino in the format: 's,<HOPPER_CYCLE_INTERVAL>,<FEEDER_VIBRATION_SPEED>,<FEEDER_STOP_DELAY>,<FEEDER_PAUSE_TIME>,<FEEDER_SHORT_MOVE_TIME>'
    const message = `s,${data.hopperCycleInterval},${data.vibrationSpeed},${data.stopDelay},${data.pauseTime},${data.shortMoveTime}`;
    this.deviceManager.sendCommand(DeviceName.HOPPER_FEEDER, message);
  }
}
