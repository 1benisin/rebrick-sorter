import { Server as SocketIOServer, Socket } from 'socket.io';
import { SettingsManager } from './components/SettingsManager';
import { SocketManager } from './components/SocketManager';
import { DeviceManager } from './components/DeviceManager';
import { FALL_TIME, SorterManager } from './components/SorterManager';
import { ConveyorManager } from './components/ConveyorManager';
import { SpeedManager } from './components/SpeedManager';
import { SortPartDto } from '../types/sortPart.dto';
import { Part } from '../types/hardwareTypes.d';

export class Server {
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

      // Get initial settings
      const settings = this.settingsManager.getSettings();
      console.log('settings', settings);
      if (!settings) {
        throw new Error('No settings available');
      }

      // Initialize device manager with settings
      await this.deviceManager.initialize();

      // Initialize speed manager
      await this.speedManager.initialize();

      // Initialize sorter manager
      await this.sorterManager.initialize();

      // Initialize conveyor manager
      await this.conveyorManager.initialize();
    } catch (error) {
      console.error('Error initializing components:', error);
      // Handle initialization error
    }
  }

  // Event handlers
  private async handleSortPart(data: SortPartDto): Promise<void> {
    try {
      const { initialTime, initialPosition, bin, sorter, partId } = data;

      // Create new part
      const part: Part = {
        partId,
        sorter,
        bin,
        initialPosition,
        initialTime,
        moveTime: 0, // Will be calculated below
        moveFinishedTime: 0, // Will be calculated below
        jetTime: 0, // Will be calculated below
        defaultArrivalTime: 0, // Will be calculated below
        arrivalTimeDelay: 0, // Will be calculated below
        status: 'pending',
        conveyorSpeed: this.speedManager.getDefaultSpeed(),
      };

      // calculate values
      const jetPosition = this.conveyorManager.getJetPosition(sorter);
      const distanceToJet = jetPosition - initialPosition;
      const jetTime = this.conveyorManager.findTimeAfterDistance(initialTime, distanceToJet);
      const sorterPreviousPart = this.conveyorManager.findPreviousSorterPart(sorter);
      const travelTimeFromLastBin = this.sorterManager.getTravelTimeBetweenBins({
        sorter,
        fromBin: sorterPreviousPart?.bin,
        toBin: bin,
      });
      const moveTime = Math.max(jetTime + FALL_TIME - travelTimeFromLastBin, 1);
      const defaultSpeed = this.speedManager.getDefaultSpeed();
      const conveyorTravelTime = distanceToJet / defaultSpeed;
      const defaultArrivalTime = part.initialTime + conveyorTravelTime;

      // Update part with calculated values
      part.jetTime = jetTime;
      part.moveTime = moveTime;
      part.moveFinishedTime = moveTime + travelTimeFromLastBin;
      part.defaultArrivalTime = defaultArrivalTime;

      // if there is an arrival time delay, we need to slow down the part
      const arrivalTimeDelay = sorterPreviousPart ? Math.max(sorterPreviousPart.moveFinishedTime - moveTime, 0) : 0;
      if (arrivalTimeDelay > 0 && sorterPreviousPart) {
        // Update part with arrival time delay
        part.moveTime += arrivalTimeDelay;
        part.jetTime += arrivalTimeDelay;
        part.arrivalTimeDelay = arrivalTimeDelay;
      }

      // Insert speed change
      this.conveyorManager.insertPart(part);

      // filter partQueue
      this.conveyorManager.filterQueue();

      this.socketManager.emitSortPartSuccess(true);
    } catch (error) {
      console.error('Error handling sort part:', error);
      this.socketManager.emitSortPartSuccess(false);
    }
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
    this.deviceManager.sendCommand('conveyor_jets', 'f', data.sorter);
  }
}
