// server/hardwareController.ts

import { getTravelTimeBetweenBins } from './hardwareUtils';
import arduinoDeviceManager from './ArduinoDeviceManager';
import { ArduinoCommands, ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import { serialPortNames } from '../types/serialPort.type';
import conveyor, { Conveyor } from './Conveyor';
import eventHub from './eventHub';
import { AllEvents } from '../types/socketMessage.type';
import { settingsSchema, SettingsType } from '../types/settings.type';
import { db } from '../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

// min amount conveyor speed can be slowed down from it's default speed (maximum speed): 255
const MIN_SLOWDOWN_PERCENT = 0.4;

// TODO: integreate methods to calibrate sorter travel times
const sorterTravelTimes = [
  [0, 609, 858, 1051, 1217, 1358, 1487, 1606, 1716, 1714, 1762, 1818, 1825, 1874, 1923, 2016, 2017],
  [
    0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870, 3006,
    3009, 3144,
  ],
  [
    0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870, 3006,
    3009, 3144,
  ],
  [0, 609, 858, 1051, 1217, 1358, 1487, 1606, 1716, 1714, 1762, 1818, 1825, 1874, 1923, 2016, 2017],
];

const FALL_TIME = 800; // time it takes to fall down the tube
const MOVE_PAUSE_BUFFER = 1600; // time buffer for part to fall out the tube

class HardwareManager {
  private static instance: HardwareManager;
  protected initialized: boolean = false;
  protected initializationPromise: Promise<void> | null = null;
  private conveyor: Conveyor;
  private jetPositions: number[] = [];
  private conveyorSpeed: number = 0;
  serialPorts: Record<string, string> = {};
  sorterTravelTimes: number[][] = [];
  sorterBinPositions: { x: number; y: number }[][] = [];
  private unsubscribeSettings: (() => void) | null = null;

  private constructor() {
    this.conveyor = conveyor;
    // setup event listeners
    eventHub.onEvent(AllEvents.HOME_SORTER, this.homeSorter);
    eventHub.onEvent(AllEvents.FIRE_JET, this.fireJet);
    eventHub.onEvent(AllEvents.MOVE_SORTER, this.moveSorter);
    eventHub.onEvent(AllEvents.SCHEDULE_SORTER_MOVE, this.scheduleSorterMove);
    eventHub.onEvent(AllEvents.SCHEDULE_JET_FIRE, this.scheduleJetFire);

    // Subscribe to settings changes
    this.subscribeToSettings();
  }

  static getInstance(): HardwareManager {
    if (!HardwareManager.instance) {
      HardwareManager.instance = new HardwareManager();
    }
    return HardwareManager.instance;
  }

  private subscribeToSettings = () => {
    const settingsRef = doc(db, 'settings', 'dev-user');
    this.unsubscribeSettings = onSnapshot(
      settingsRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          try {
            const settingsData = snapshot.data();
            const settings = settingsSchema.parse(settingsData);
            await this.initializeHardware(settings);
          } catch (error) {
            console.error('Error processing settings update:', error);
            this.initialized = false;
            eventHub.emitEvent(AllEvents.INIT_HARDWARE_SUCCESS, { success: false });
          }
        }
      },
      (error) => {
        console.error('Error subscribing to settings:', error);
      },
    );
  };

  private initializeHardware = async (initSettings: SettingsType) => {
    console.log('HardwareManager initializing with settings:', initSettings);
    try {
      this.conveyorSpeed = initSettings.conveyorSpeed;
      this.jetPositions = initSettings.sorters.map((sorter) => sorter.jetPosition);
      this.sorterTravelTimes = sorterTravelTimes;

      // connect serial ports
      let serialPorts = initSettings.sorters.map((sorter) => ({
        name: sorter.name,
        path: sorter.serialPort,
      }));
      serialPorts.push({ name: 'conveyor_jets', path: initSettings.conveyorJetsSerialPort });
      serialPorts.push({ name: 'hopper_feeder', path: initSettings.hopperFeederSerialPort });

      console.log('---serialPorts:', serialPorts);
      const connectionStatuses = await arduinoDeviceManager.connectAllDevices(initSettings);

      console.log('---connectionStatuses:', connectionStatuses);
      const isEveryPortConnected = connectionStatuses.every((status) => status.success);
      console.log('---isEveryPortConnected:', isEveryPortConnected);

      this.serialPorts = serialPorts.reduce((acc: Record<string, string>, port) => {
        acc[port.name] = port.path;
        return acc;
      }, {});

      // generate sorter bin positions
      this.generateBinPositions(initSettings);

      // initialize conveyor
      await this.conveyor.init({
        defaultConveyorSpeed: initSettings.conveyorSpeed,
        sorterCount: initSettings.sorters.length,
        jetPositions: initSettings.sorters.map((sorter) => sorter.jetPosition),
        arduinoPath: this.serialPorts[serialPortNames.conveyor_jets as keyof typeof serialPortNames],
      });

      this.initialized = true;
      eventHub.emitEvent(AllEvents.INIT_HARDWARE_SUCCESS, { success: true });
    } catch (error) {
      console.error('Error initializing hardware:', error);
      this.initialized = false;
      eventHub.emitEvent(AllEvents.INIT_HARDWARE_SUCCESS, { success: false });
    }
  };

  public init = async () => {
    console.log('HardwareManager initial setup');
    // The actual initialization will happen through the subscription
    // This method is kept for backwards compatibility
  };

  public calculateTimings = (
    sorter: number,
    bin: number,
    initialTime: number,
    initialPosition: number,
    prevSorterbin: number,
  ) => {
    // distance to jet should never be negative
    const distanceToJet = this.jetPositions[sorter] - initialPosition;

    const jetTime = this.conveyorSpeed * distanceToJet + initialTime;

    const travelTimeFromLastBin = getTravelTimeBetweenBins(
      sorter,
      prevSorterbin,
      bin,
      this.sorterBinPositions,
      this.sorterTravelTimes,
    );
    // sorter should have enough travel time to reach the bin before the jet is fired
    const moveTime = Math.max(jetTime + FALL_TIME - travelTimeFromLastBin, 1);

    console.log('---calculateTimings:', {
      conveyorSpeed: this.conveyorSpeed,
      distanceToJet,
      jetTime,
      travelTimeFromLastBin,
      moveTime,
      sorter,
      bin,
      initialTime,
      initialPosition,
      prevSorterbin,
    });
    return { moveTime, jetTime, travelTimeFromLastBin };
  };

  private generateBinPositions = (initSettings: SettingsType) => {
    this.sorterBinPositions = [];
    for (const { gridDimension } of initSettings.sorters) {
      const positions = [{ x: 0, y: 0 }]; // postion 0 is null because bin ids start at 1
      for (let y = 0; y < gridDimension; y++) {
        for (let x = 0; x < gridDimension; x++) {
          positions.push({ x, y });
        }
      }
      this.sorterBinPositions.push(positions);
    }
  };

  public homeSorter = ({ sorter }: { sorter: number }) => {
    console.log('homeSorter:', sorter);

    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
      command: ArduinoCommands.MOVE_TO_ORIGIN,
    };
    arduinoDeviceManager.sendCommandToDevice(arduinoDeviceCommand);
  };

  public fireJet = ({ sorter }: { sorter: number }) => {
    console.log('fireJet:', sorter);
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
      command: ArduinoCommands.FIRE_JET,
      data: sorter,
    };
    arduinoDeviceManager.sendCommandToDevice(arduinoDeviceCommand);
  };

  public moveSorter = ({ sorter, bin }: { sorter: number; bin: number }) => {
    console.log('moveSorter:', sorter, bin);
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
      command: ArduinoCommands.MOVE_TO_BIN,
      data: bin,
    };
    arduinoDeviceManager.sendCommandToDevice(arduinoDeviceCommand);
  };

  public scheduleSorterMove = ({ sorter, bin, moveTime }: { sorter: number; bin: number; moveTime: number }) => {
    console.log('scheduleSorterMove:', sorter, bin, moveTime);
    const delay = moveTime - Date.now();
    setTimeout(() => {
      this.moveSorter({ sorter, bin });
    }, delay);
  };

  public scheduleJetFire = ({ sorter, jetTime }: { sorter: number; jetTime: number }) => {
    console.log('scheduleJetFire:', sorter, jetTime);
    const delay = jetTime - Date.now();
    setTimeout(() => {
      this.fireJet({ sorter });
    }, delay);
  };
}

const hardwareManager = HardwareManager.getInstance();
export default hardwareManager;
