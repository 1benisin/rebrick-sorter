// server/Conveyor.ts

import { PartQueue, Part } from '../types/hardwareTypes.d';
import { ArduinoCommands, ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import arduinoDeviceManager from './ArduinoDeviceManager';
import { getFormattedTime } from '../lib/utils';
import eventHub from './eventHub';
import { AllEvents } from '../types/socketMessage.type';
import { SortPartDto } from '../types/sortPart.dto';
import hardwareManager from './HardwareManager';

const MOVE_PAUSE_BUFFER = 1600; // pause between sorter moves to allow for part to clear the tube

type InitSettings = {
  defaultConveyorSpeed: number;
  sorterCount: number;
  jetPositionsStart: number[];
  jetPositionsEnd: number[];
  arduinoPath: string;
};

export class Conveyor {
  private static instance: Conveyor;
  private arduinoPath: string = '';
  private partQueue: PartQueue = [];

  constructor() {
    // setup event listeners
    console.log('Conveyor Constructing');
    eventHub.onEvent(AllEvents.SORT_PART, this.sortPart);
    eventHub.onEvent(AllEvents.CONVEYOR_ON_OFF, this.conveyorOnOff);
  }

  static getInstance() {
    if (!Conveyor.instance) {
      Conveyor.instance = new Conveyor();
    }
    return Conveyor.instance;
  }

  public init(initSettings: InitSettings) {
    this.partQueue = [];
    this.arduinoPath = initSettings.arduinoPath;
  }

  public deinit() {
    console.log('Conveyor deinitializing');
    try {
      this.partQueue = [];

      this.arduinoPath = '';

      console.log('Conveyor deinitialized successfully');
    } catch (error) {
      console.error(`Failed to deinitialize Conveyor: ${error}`);
    }
  }

  private sortPart = ({ initialTime, initialPosition, bin, sorter }: SortPartDto) => {
    console.log('--- sortPart:', {
      initialTime: getFormattedTime('min', 'ms', initialTime),
      initialPosition,
      bin,
      sorter,
    });
    try {
      // find the previous part for the same sorter
      const prevSorterPart = this.findPreviousPart(sorter);

      let { moveTime, jetTime, travelTimeFromLastBin } = hardwareManager.calculateTimings(
        sorter,
        bin,
        initialTime,
        initialPosition,
        prevSorterPart?.bin || 1,
      );

      // if moveTime is before current time or previous part moveFinishedTime, skip Part
      if (moveTime < Date.now()) {
        console.log('---SORT PART: moveTime is in the past');
        return;
      }
      if (prevSorterPart && moveTime < prevSorterPart.moveFinishedTime) {
        console.log('---SORT PART: moveTime is before previous part moveFinishedTime');
        return;
      }

      this.createAndSchedulePart(sorter, bin, initialPosition, initialTime, moveTime, jetTime, travelTimeFromLastBin);
    } catch (error) {
      console.error('sortPart error:', error);
      throw error;
    }
  };

  private createAndSchedulePart = (
    sorter: number,
    bin: number,
    initialPosition: number,
    initialTime: number,
    moveTime: number,
    jetTime: number,
    travelTimeFromLastBin: number,
  ): Part => {
    eventHub.emitEvent(AllEvents.SCHEDULE_SORTER_MOVE, { sorter, bin, moveTime });
    eventHub.emitEvent(AllEvents.SCHEDULE_JET_FIRE, { sorter, jetTime });

    const part: Part = {
      sorter,
      bin,
      initialPosition,
      initialTime,
      moveTime,
      moveFinishedTime: moveTime + travelTimeFromLastBin + MOVE_PAUSE_BUFFER,
      jetTime,
    };
    // add part to end of queue
    this.partQueue.push(part);
    // limit queue to 20 parts
    this.partQueue = this.partQueue.slice(-20);

    return part;
  };

  // find the previous part for the same sorter
  private findPreviousPart = (sorter: number): Part | null => {
    const prevSorterPart = this.partQueue.reduce<Part | null>((acc, p) => {
      if (p.sorter === sorter) return p;
      return acc;
    }, null);
    return prevSorterPart;
  };

  private conveyorOnOff = () => {
    console.log('conveyorOnOff');
    if (!this.arduinoPath) {
      console.error('conveyorOnOff: arduinoPath is not set');
      return;
    }
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.arduinoPath,
      command: ArduinoCommands.CONVEYOR_ON_OFF,
    };
    arduinoDeviceManager.sendCommandToDevice(arduinoDeviceCommand);
    // this.scheduleConveyorSpeedChange(this.defaultConveyorSpeed);
  };
}

const conveyor = Conveyor.getInstance();
export default conveyor;
