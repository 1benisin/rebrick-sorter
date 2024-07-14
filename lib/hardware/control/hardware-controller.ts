// lib/hardware/control/hardware-controller.ts

import { Part } from '../types/hardware.type';
import { findTimeAfterDistance, getTravelTimeBetweenBins } from '../utils/utils';
import SerialPortManager from '../communication/communication-manager';
import { ArduinoCommands, ArduinoDeviceCommand } from '@/types/arduinoCommands.type';
import { serialPortNames } from '@/types/serialPort.type';
import { SortPartDto } from '@/types/sortPart.dto';
import { HardwareInitDto } from '@/types/hardwareInit.dto';
import { getFormattedTime } from '@/lib/utils';
import Conveyor from './Conveyor';

// min amount conveyor speed can be slowed down from it's default speed (maximum speed): 255
const MIN_SLOWDOWN_PERCENT = 0.4;

// TODO: integreate methods to calibrate sorter travel times
const sorterTravelTimes = [
  [0, 609, 858, 1051, 1217, 1358, 1487, 1606, 1716, 1714, 1762, 1818, 1825, 1874, 1923, 2016, 2017],
  [
    0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870, 3006,
    3009, 3144,
  ],
];

const FALL_TIME = 800; // time it takes to fall down the tube
const MOVE_PAUSE_BUFFER = 1600; // time buffer for part to fall out the tube

export default class HardwareController {
  static instance: HardwareController;
  private serialPortManager: SerialPortManager;
  private conveyor: Conveyor;

  initialized: boolean = false;

  serialPorts: Record<string, string> = {};
  sorterTravelTimes: number[][] = [];
  sorterBinPositions: { x: number; y: number }[][] = [];

  private constructor() {
    this.serialPortManager = SerialPortManager.getInstance();
    this.conveyor = Conveyor.getInstance();
  }

  static getInstance() {
    if (!HardwareController.instance) {
      HardwareController.instance = new HardwareController();
    }
    return HardwareController.instance;
  }

  public async init(initSettings: HardwareInitDto): Promise<void> {
    console.log('HardwareController initializing');
    try {
      // connect serial ports
      const connectionStatuses = await this.serialPortManager.connectPorts(initSettings.serialPorts);
      const isEveryPortConnected = connectionStatuses.every((status) => status.success);
      if (!isEveryPortConnected) throw new Error(`Failed to connect to serial ports: ${connectionStatuses}`);

      this.serialPorts = initSettings.serialPorts.reduce((acc: Record<string, string>, port) => {
        acc[port.name] = port.path;
        return acc;
      }, {});

      // set sorter travel times
      this.sorterTravelTimes = sorterTravelTimes;

      // generate sorter bin positions
      this.generateBinPositions(initSettings.sorterDimensions);

      // initialize conveyor
      this.conveyor.init({
        defaultConveyorSpeed: initSettings.defaultConveyorSpeed,
        sorterCount: initSettings.sorterDimensions.length,
        jetPositions: initSettings.jetPositions,
        arduinoPath: this.serialPorts[serialPortNames.conveyor_jets as keyof typeof serialPortNames],
      });

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize hardware controller: ${error}`);
    }
  }

  private generateBinPositions = (
    sorterDimensions: {
      gridWidth: number;
      gridHeight: number;
    }[],
  ) => {
    this.sorterBinPositions = [];
    for (const { gridHeight, gridWidth } of sorterDimensions) {
      const positions = [{ x: 0, y: 0 }]; // postion 0 is null because bin ids start at 1
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          positions.push({ x, y });
        }
      }
      this.sorterBinPositions.push(positions);
    }
  };

  public onSpeedUpdate(callback: (speed: number) => void) {
    this.conveyor.speedUpdateCallback = callback;
  }

  public homeSorter(sorter: number) {
    console.log('homeSorter:', sorter);
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
      command: ArduinoCommands.MOVE_TO_ORIGIN,
    };
    this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
  }

  public fireJet(sorter: number) {
    console.log('fireJet:', sorter);
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
      command: ArduinoCommands.FIRE_JET,
      data: sorter,
    };
    this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
  }

  public moveSorter({ sorter, bin }: { sorter: number; bin: number }) {
    console.log('moveSorter:', sorter, bin);
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
      command: ArduinoCommands.MOVE_TO_BIN,
      data: bin,
    };
    this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
  }

  private calculateTimings(
    sorter: number,
    bin: number,
    initialTime: number,
    initialPosition: number,
    prevSorterbin: number,
  ) {
    // distance to jet should never be negative
    const distanceToJet = this.conveyor.getJetPositions[sorter] - initialPosition;
    // jet time is the time it takes to travel the distance to the jet
    // jetTime should always be after initialTime
    const jetTime = findTimeAfterDistance(initialTime, distanceToJet, this.conveyor.getSpeedQueue);

    const travelTimeFromLastBin = getTravelTimeBetweenBins(
      sorter,
      prevSorterbin,
      bin,
      this.sorterBinPositions,
      this.sorterTravelTimes,
    );
    // sorter should have enough travel time to reach the bin before the jet is fired
    const moveTime = Math.max(jetTime + FALL_TIME - travelTimeFromLastBin, 1);
    return { moveTime, jetTime, travelTimeFromLastBin };
  }

  private createAndSchedulePart(
    sorter: number,
    bin: number,
    initialPosition: number,
    initialTime: number,
    moveTime: number,
    jetTime: number,
    travelTimeFromLastBin: number,
  ): Part {
    const part: Part = {
      sorter,
      bin,
      initialPosition,
      initialTime,
      moveTime,
      moveRef: this.scheduleSorterToPosition(sorter, bin, moveTime),
      moveFinishedTime: moveTime + travelTimeFromLastBin + MOVE_PAUSE_BUFFER,
      jetTime,
      jetRef: this.scheduleJet(sorter, jetTime),
    };

    this.conveyor.addPartToEndOfQueue(part);
    return part;
  }

  private scheduleJet(jet: number, atTime?: number) {
    // no timeStamp is provided for manually requested moves
    const timeout = !atTime ? 0 : atTime - Date.now();

    return setTimeout(() => {
      console.log(getFormattedTime('min', 'ms'), 'jet fired: ', jet, getFormattedTime('min', 'ms', atTime));
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
        command: ArduinoCommands.FIRE_JET,
        data: jet,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  private scheduleSorterToPosition(sorter: number, bin: number, atTime?: number) {
    // check to make sure serialPortNames[sorter] is a valid key
    if (!(sorter in serialPortNames)) {
      throw new Error(`sorter "${sorter}" is not a valid key in serialPortNames`);
    }

    // no timeStamp is provided for manually requested moves
    const timeout = !atTime ? 0 : atTime - Date.now();

    return setTimeout(() => {
      console.log(getFormattedTime('min', 'ms'), 'sorter To Bin:', sorter, bin, getFormattedTime('min', 'ms', atTime));
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
        command: ArduinoCommands.MOVE_TO_BIN,
        data: bin,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  private computeSlowDownPercent({
    jetTime,
    startSpeedChange,
    arrivalTimeDelay,
  }: {
    jetTime: number;
    startSpeedChange: number;
    arrivalTimeDelay: number;
  }) {
    // find updated move and jet times
    const oldArrivalTime = jetTime;
    const newArrivalTime = jetTime + arrivalTimeDelay;

    startSpeedChange = Math.max(startSpeedChange, Date.now());

    // find new speed percent
    const tooSmallTimeDif = oldArrivalTime - startSpeedChange;
    const targetTimeDif = newArrivalTime - startSpeedChange;
    const slowDownPercent = tooSmallTimeDif / targetTimeDif;
    return slowDownPercent;
  }

  // return type {sorter: string; bin: number}
  public sortPart = ({ initialTime, initialPosition, bin, sorter }: SortPartDto) => {
    console.log('--- sortPart:', {
      initialTime: getFormattedTime('min', 'ms', initialTime),
      initialPosition,
      bin,
      sorter,
    });
    try {
      if (!this.initialized) {
        throw new Error('HardwareController not initialized');
      }
      // sort partQueue by arrival time to jet position using default conveyor speed
      this.conveyor.prioritySortPartQueue();

      // find the previous part for the same sorter
      const prevSorterPart = this.conveyor.findPreviousPart(sorter);

      let { moveTime, jetTime, travelTimeFromLastBin } = this.calculateTimings(
        sorter,
        bin,
        initialTime,
        initialPosition,
        prevSorterPart.bin,
      );

      const arrivalTimeDelay = Math.max(prevSorterPart.moveFinishedTime - moveTime, 0);

      // figure out slowdown percentage
      const slowDownPercent = this.computeSlowDownPercent({
        jetTime,
        startSpeedChange: prevSorterPart.jetTime,
        arrivalTimeDelay,
      });

      // if slowdown is more than 50% and less than 100% slow down the part
      if (slowDownPercent > MIN_SLOWDOWN_PERCENT && slowDownPercent < 1) {
        console.log('SLOW-DOWN:', arrivalTimeDelay);
        // find updated move and jet times
        const oldJetTime = jetTime;
        moveTime += arrivalTimeDelay;
        jetTime += arrivalTimeDelay;

        // --- insert speed change
        this.conveyor.insertSpeedChange({
          startSpeedChange: prevSorterPart.jetTime,
          newArrivalTime: jetTime,
          oldArrivalTime: oldJetTime,
          slowDownPercent,
        });

        // --- reschedule part actions after slowdown
        this.conveyor.rescheduleActions({
          startOfSlowdown: prevSorterPart.jetTime,
          endOfSlowdown: jetTime,
          delayBy: arrivalTimeDelay,
          scheduleJet: this.scheduleJet,
          scheduleSorterToPosition: this.scheduleSorterToPosition,
        });
      }

      // create and schedule part actions only if slowDownPercent is greater than .50
      if (slowDownPercent > MIN_SLOWDOWN_PERCENT) {
        this.createAndSchedulePart(sorter, bin, initialPosition, initialTime, moveTime, jetTime, travelTimeFromLastBin);
      }

      this.conveyor.filterQueues(this.sorterBinPositions);
    } catch (error) {
      console.error('sortPart error:', error);
      throw error;
    }
  };

  public logPartQueue() {
    this.conveyor.logPartQueue();
  }

  public logSpeedQueue() {
    this.conveyor.logSpeedQueue();
  }

  public conveyorOnOff() {
    this.conveyor.conveyorOnOff();
  }

  public clearActions() {
    this.conveyor.clearActions();
  }
}
