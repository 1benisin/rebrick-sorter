import { Server as SocketIOServer, Socket } from 'socket.io';
import { SettingsManager } from './components/SettingsManager';
import { SocketManager } from './components/SocketManager';
import { DeviceManager } from './components/DeviceManager';
import { SorterManager } from './components/SorterManager';
import { ConveyorManager } from './components/ConveyorManager';
import { SortPartDto } from '../types/sortPart.dto';

export class Server {
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private deviceManager: DeviceManager;
  private sorterManager: SorterManager;
  private conveyorManager: ConveyorManager;

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

    this.sorterManager = new SorterManager({
      deviceManager: this.deviceManager,
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
    });

    this.conveyorManager = new ConveyorManager({
      deviceManager: this.deviceManager,
      socketManager: this.socketManager,
      settingsManager: this.settingsManager,
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

      // Find previous part and validate timing
      const prevPart = this.conveyorManager.findPreviousPart(sorter);
      const prevSorterBin = prevPart ? prevPart.bin : 1;
      const jetPositionMiddle = this.conveyorManager.getJetPosition(sorter);

      // Calculate timings
      const { moveTime, jetTime, travelTimeFromLastBin } = this.sorterManager.calculateTimings(
        sorter,
        bin,
        initialTime,
        initialPosition,
        prevSorterBin,
        this.conveyorManager.getCurrentSpeed(),
        jetPositionMiddle,
      );

      // Check if moveTime is in the past
      if (moveTime < Date.now()) {
        console.log('SORT PART: moveTime is in the past');
        this.socketManager.emitSortPartSuccess(false);
        return;
      }

      // Check if moveTime is before previous part move is finished
      if (prevPart && moveTime < prevPart.moveFinishedTime) {
        console.log('SORT PART: moveTime is before previous part moveFinishedTime');
        this.socketManager.emitSortPartSuccess(false);
        return;
      }

      // Schedule sorter move
      await this.sorterManager.scheduleSorterMove(sorter, bin, moveTime);

      // Add part to queue with proper timing
      this.conveyorManager.addPart({
        sorter,
        bin,
        initialPosition,
        initialTime,
        moveTime,
        moveFinishedTime: moveTime + travelTimeFromLastBin + 1000, // MOVE_PAUSE_BUFFER
        jetTime,
        partId,
        status: 'pending',
      });

      this.socketManager.emitSortPartSuccess(true);
    } catch (error) {
      console.error('Error handling sort part:', error);
      this.socketManager.emitSortPartSuccess(false);
    }
  }

  private handleConveyorOnOff(): void {
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
