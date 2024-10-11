// server/Conveyor.ts

import { PartQueue, SpeedQueue, Part, SpeedChange } from './hardwareTypes.d';
import { ArduinoCommands, ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import arduinoDeviceManager from './ArduinoDeviceManager';
import { getFormattedTime } from '../lib/utils';
import { findTimeAfterDistance } from './hardwareUtils';
import eventHub from './eventHub';
import { BackToFrontEvents, FrontToBackEvents, AllEvents } from '../types/socketMessage.type';

type InitSettings = {
  defaultConveyorSpeed: number;
  sorterCount: number;
  jetPositions: number[];
  arduinoPath: string;
};

export default class Conveyor {
  private static instance: Conveyor;
  private partQueue: PartQueue = [];
  private speedQueue: SpeedQueue = [];
  public defaultConveyorSpeed: number = 0;
  private jetPositions: number[] = [];
  private arduinoPath: string = '';

  constructor() {
    // setup event listeners
    eventHub.onEvent(FrontToBackEvents.LOG_PART_QUEUE, this.logPartQueue.bind(this));
    eventHub.onEvent(FrontToBackEvents.LOG_SPEED_QUEUE, this.logSpeedQueue.bind(this));
    eventHub.onEvent(FrontToBackEvents.CONVEYOR_ON_OFF, this.conveyorOnOff.bind(this));
    eventHub.onEvent(FrontToBackEvents.CLEAR_HARDWARE_ACTIONS, this.clearActions.bind(this));
  }

  static getInstance() {
    if (!Conveyor.instance) {
      Conveyor.instance = new Conveyor();
    }
    return Conveyor.instance;
  }

  public init(initSettings: InitSettings) {
    console.log('Conveyor initializing');
    try {
      // initialize speed queue
      this.speedQueue = [{ speed: initSettings.defaultConveyorSpeed, time: Date.now(), ref: setTimeout(() => {}) }];

      // initialize part queue
      // init the part queue with a part for every sorter
      this.partQueue = [];
      for (let i = 0; i < initSettings.sorterCount; i++) {
        const part: Part = {
          sorter: i,
          bin: 1,
          initialPosition: 0,
          initialTime: Date.now(),
          moveTime: Date.now(),
          moveRef: undefined,
          moveFinishedTime: Date.now(),
          jetTime: Date.now(),
          jetRef: undefined,
        };
        this.partQueue.push(part);
      }

      // set conveyor speed
      this.defaultConveyorSpeed = initSettings.defaultConveyorSpeed;

      // set jet positions
      this.jetPositions = initSettings.jetPositions;

      this.arduinoPath = initSettings.arduinoPath;
    } catch (error) {
      throw new Error(`Failed to initialize hardware controller: ${error}`);
    }
  }

  public deinit() {
    console.log('Conveyor deinitializing');
    try {
      // Clear all timeouts in the speed queue
      this.speedQueue.forEach((speedChange) => {
        if (speedChange.ref) {
          clearTimeout(speedChange.ref);
        }
      });

      // Clear all timeouts in the part queue
      this.partQueue.forEach((part) => {
        if (part.moveRef) {
          clearTimeout(part.moveRef);
        }
        if (part.jetRef) {
          clearTimeout(part.jetRef);
        }
      });

      // Reset queues
      this.speedQueue = [];
      this.partQueue = [];

      // Reset other properties
      this.defaultConveyorSpeed = 0;
      this.jetPositions = [];
      this.arduinoPath = '';

      console.log('Conveyor deinitialized successfully');
    } catch (error) {
      console.error(`Failed to deinitialize Conveyor: ${error}`);
    }
  }

  get getSpeedQueue(): SpeedQueue {
    return this.speedQueue;
  }
  get getJetPositions(): number[] {
    return this.jetPositions;
  }

  // find the previous part for the same sorter
  public findPreviousPart(sorter: number) {
    const prevSorterPart = this.partQueue.reduce<Part | null>((acc, p) => {
      if (p.sorter === sorter) return p;
      return acc;
    }, null);
    // prevSorterPart should never be empty. We initialize the partQueue with a part for every sorter
    if (!prevSorterPart) {
      throw new Error('sortPart: prevSorterPart is empty for sorter: ' + sorter);
    }
    return prevSorterPart;
  }

  public logPartQueue() {
    // format partQueue for logging
    const partQueue = this.partQueue.map((p) => ({
      sorter: p.sorter,
      bin: p.bin,
      initialPosition: p.initialPosition,
      initialTime: getFormattedTime('min', 'ms', p.initialTime),
      moveTime: getFormattedTime('min', 'ms', p.moveTime),
      moveFinishedTime: getFormattedTime('min', 'ms', p.moveFinishedTime),
      jetTime: getFormattedTime('min', 'ms', p.jetTime),
    }));
    console.log('partQueue:', partQueue);
    eventHub.emitEvent(BackToFrontEvents.LOG_PART_QUEUE_SUCCESS, partQueue);
    return partQueue;
  }

  public logSpeedQueue() {
    const speedQueue = this.speedQueue.map((s) => ({ speed: s.speed, time: getFormattedTime('min', 'ms', s.time) }));
    console.log('speedQueue:', speedQueue);
    eventHub.emitEvent(BackToFrontEvents.LOG_SPEED_QUEUE_SUCCESS, speedQueue);
    return speedQueue;
  }

  public conveyorOnOff() {
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
  }

  public clearActions() {
    // cancel all scheduled actions
    this.partQueue.forEach((p) => {
      if (!!p.moveRef) clearTimeout(p.moveRef);
      if (!!p.jetRef) clearTimeout(p.jetRef);
    });
    this.speedQueue.forEach((s) => {
      if (!!s.ref) clearTimeout(s.ref);
    });
  }

  public filterQueues(sorterBinPositions: { x: number; y: number }[][]) {
    // -- filter partQueue
    let lastSorterPartIndexes = new Array(sorterBinPositions.length).fill(0);
    let lastPartJettedIndex = 0;
    // get index of last part for each sorter
    // and index of last part jetted
    this.partQueue.forEach((p, i) => {
      lastSorterPartIndexes[p.sorter] = i;
      if (!!p.jetTime && p.jetTime < Date.now()) lastPartJettedIndex = i;
    });
    // slice partQueue to keep all parts that haven't been jetted yet
    // and to keep at least one part for each sorter
    const sliceIndex = Math.min(...lastSorterPartIndexes, lastPartJettedIndex);
    this.partQueue = this.partQueue.slice(sliceIndex);

    // -- filter speedQueue
    // get the time of the earliest part in the partQueue
    const earliestPartTime = this.partQueue.reduce((acc, p) => {
      if (p.initialTime < acc) return p.initialTime;
      return acc;
    }, Date.now());

    // find the speed change that happened just before the earliest part time
    const lastSpeedChangeIndex = this.speedQueue.reduce((acc, s, i) => {
      if (s.time < earliestPartTime) return i;
      return acc;
    }, 0);

    this.speedQueue = this.speedQueue.slice(lastSpeedChangeIndex);
  }

  public rescheduleActions(params: {
    startOfSlowdown: number;
    endOfSlowdown: number;
    delayBy: number;
    scheduleJet: Function;
    scheduleSorterToPosition: Function;
  }) {
    const { startOfSlowdown, endOfSlowdown, delayBy, scheduleJet, scheduleSorterToPosition } = params;

    this.partQueue = this.partQueue.map((p, i) => {
      if (!p.moveTime || !p.moveFinishedTime || !p.jetTime) {
        console.error('rescheduleActions: p.moveTime, p.moveFinishedTime, p.jetTime is undefined');
        return p;
      }
      // -- move
      if (p.moveTime > startOfSlowdown) {
        // if action happens during slowdown
        let moveDelayBy = delayBy;
        if (p.moveTime < endOfSlowdown) {
          // how much of slowdown time has passed
          moveDelayBy *= (p.moveTime - startOfSlowdown) / (endOfSlowdown - startOfSlowdown);
        }
        if (p.moveRef) clearTimeout(p.moveRef);
        const newMoveTime = p.moveTime + moveDelayBy;
        const newMoveRef = scheduleSorterToPosition(p.sorter, p.bin, newMoveTime);
        const newMoveFinishedTime = p.moveFinishedTime + moveDelayBy;
        p.moveRef = newMoveRef;
        p.moveTime = newMoveTime;
        p.moveFinishedTime = newMoveFinishedTime;
      }
      // -- jet
      if (p.jetTime > startOfSlowdown) {
        // if action happens during slowdown
        let jetDelayBy = delayBy;
        if (p.jetTime < endOfSlowdown) {
          // how much of slowdown time has passed
          jetDelayBy *= (p.jetTime - startOfSlowdown) / (endOfSlowdown - startOfSlowdown);
        }
        if (p.jetRef) clearTimeout(p.jetRef);
        const newJetTime = p.jetTime + jetDelayBy;
        const newJetRef = scheduleJet(p.sorter, newJetTime);
        p.jetRef = newJetRef;
        p.jetTime = newJetTime;
      }

      return p;
    });
  }

  public addPartToEndOfQueue(part: Part) {
    this.partQueue.push(part);
  }

  public insertSpeedChange({
    startSpeedChange,
    newArrivalTime,
    oldArrivalTime,
    slowDownPercent,
  }: {
    startSpeedChange: number;
    newArrivalTime: number;
    oldArrivalTime: number;
    slowDownPercent: number;
  }) {
    /* insert new speed change at beginning (startSpeedChange) and end (newArrivalTime) of slowdown
     and slow down all speed changes during slowdown by slowDownPercent */
    if (newArrivalTime < Date.now() || oldArrivalTime < Date.now())
      console.error(
        `insertSpeedChange: time is in the past: ${Date.now()}, ${startSpeedChange}, ${newArrivalTime}, ${oldArrivalTime}`,
      );
    // 5506, 4605.7515, 8515.7515, 7582.505
    if (startSpeedChange > newArrivalTime)
      console.error(`insertSpeedChange: startSpeedChange > newArrivalTime: ${startSpeedChange}, ${newArrivalTime}`);
    if (oldArrivalTime > newArrivalTime)
      console.error(`insertSpeedChange: oldArrivalTime > newArrivalTime: ${oldArrivalTime}, ${newArrivalTime}`);

    // start speed change now or in the future once last part at same sorter has been jetted ( startSpeedChange = lastPartJettedTime)
    startSpeedChange = Math.max(startSpeedChange, Date.now());

    // -- insert new speed change beginning and end of slowdown

    // --- previous speed change before slowdown
    const prevSpeedChangeIndex = this.speedQueue.reduce((acc, s, i) => {
      if (s.time < startSpeedChange) return i;
      return acc;
    }, 0);
    const prevSpeed = this.speedQueue[prevSpeedChangeIndex].speed;
    // schedule new speed change
    const startSpeedRef = this.scheduleConveyorSpeedChange(prevSpeed, startSpeedChange);
    // insert new speed change into speed queue in cronological order
    this.speedQueue.splice(prevSpeedChangeIndex + 1, 0, {
      speed: prevSpeed,
      time: startSpeedChange,
      ref: startSpeedRef,
    });

    // --- last speed before the end of slowdow will be the next speed
    const nextSpeedChangeIndex = this.speedQueue.reduce((acc, s, i) => {
      if (s.time < newArrivalTime) return i;
      return acc;
    }, 0);
    const nextSpeed = this.speedQueue[nextSpeedChangeIndex].speed;
    // schedule new speed change
    const endSpeedRef = this.scheduleConveyorSpeedChange(nextSpeed, newArrivalTime);
    // insert new speed change into speed queue in cronological order
    this.speedQueue.splice(nextSpeedChangeIndex + 1, 0, {
      speed: nextSpeed,
      time: newArrivalTime,
      ref: endSpeedRef,
    });

    // -- reschedule all speed changes during slowdown by slowDownPercent
    for (let i = prevSpeedChangeIndex + 1; i <= nextSpeedChangeIndex; i++) {
      const s: SpeedChange = this.speedQueue[i];
      if (!!s.ref) clearTimeout(s.ref);
      const newSpeed = s.speed * slowDownPercent;
      const newSpeedRef = this.scheduleConveyorSpeedChange(newSpeed, s.time);
      this.speedQueue[i] = {
        speed: newSpeed,
        time: s.time,
        ref: newSpeedRef,
      };
    }
  }

  public prioritySortPartQueue() {
    // Iterate through partQueue to add defaultArrivalTime if it doesn't exist
    this.partQueue = this.partQueue.map((part) => {
      if (!part.defaultArrivalTime) {
        const arrivalTime = findTimeAfterDistance(
          part.initialTime,
          this.jetPositions[part.sorter] - part.initialPosition,
          [{ time: part.initialTime, speed: this.defaultConveyorSpeed, ref: setTimeout(() => {}, 0) }],
        );
        part.defaultArrivalTime = arrivalTime;
      }
      return part;
    });

    // Sort partQueue by defaultArrivalTime
    this.partQueue.sort((a, b) => {
      if (a.defaultArrivalTime && b.defaultArrivalTime) {
        return a.defaultArrivalTime - b.defaultArrivalTime;
      }
      return 0;
    });
  }

  private scheduleConveyorSpeedChange(speed: number, atTime?: number) {
    if (speed < 0 || speed > this.defaultConveyorSpeed) {
      throw new Error(`scheduleConveyorSpeedChange: speed ${speed} is out of range`);
    }
    const timeout = !atTime ? 0 : atTime - Date.now();

    // normalize speed to conveyor motor speed 0-255
    const normalizeConveyorSpeed = Math.round((speed / this.defaultConveyorSpeed) * 255);

    return setTimeout(() => {
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.arduinoPath,
        command: ArduinoCommands.CONVEYOR_SPEED,
        data: normalizeConveyorSpeed,
      };
      arduinoDeviceManager.sendCommandToDevice(arduinoDeviceCommand);

      eventHub.emitEvent(BackToFrontEvents.CONVEYOR_SPEED_UPDATE, { speed });
    }, timeout);
  }
}
