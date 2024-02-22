import { PartQueue, SpeedQueue, Part } from './hardwareTypes.d';
import { findTimeAfterDistance, getTravelTimeBetweenBins } from './hardwareUtils';
import SerialPortManager from './serialPortManager';
import { ArduinoCommands, ArduinoDeviceCommand } from '@/types/arduinoCommands.d';
import { serialPortNames } from '@/types/serialPort.type';
import { SortPartDto } from '@/types/sortPart.dto';
import { BinLookupType } from '@/types/binLookup.type';
import { HardwareInitDto } from '@/types/hardwareInit.dto';

// TODO: integreate methods to calibrate sorter travel times
const sorterTravelTimes = [
  [0, 609, 858, 1051, 1217, 1358, 1487, 1606, 1716, 1714, 1762, 1818, 1825, 1874, 1923, 2016, 2017],
  [0, 767, 1088, 1331, 1538, 1721, 1886, 2036, 2177, 2310, 2448, 2585, 2522, 2545, 2726, 2861, 2667, 2734, 2870, 3006, 3009, 3144],
];

const FALL_TIME = 800; // time it takes to fall down the tube
const MOVE_PAUSE_BUFFER = 1600; // time buffer for part to fall out the tube

export default class HardwareController {
  static instance: HardwareController;
  private serialPortManager: SerialPortManager;

  initialized: boolean = false;

  private serialPorts: Record<string, string> = {};
  private defaultConveyorSpeed_PPS: number = 0;
  private sorterTravelTimes: number[][] = [];
  private sorterBinPositions: { x: number; y: number }[][] = [];
  private jetPositions: number[] = [];

  private partQueue: PartQueue = [];
  private speedQueue: SpeedQueue = [];

  constructor() {
    this.serialPortManager = SerialPortManager.getInstance();
  }

  static getInstance() {
    if (!HardwareController.instance) {
      HardwareController.instance = new HardwareController();
    }
    return HardwareController.instance;
  }

  async init(initSettings: HardwareInitDto): Promise<void> {
    try {
      // connect serial ports
      const connectionStatuses = await this.serialPortManager.connectPorts(initSettings.serialPorts);
      const isEveryPortConnected = connectionStatuses.every((status) => status.success);
      if (!isEveryPortConnected) throw new Error(`Failed to connect to serial ports: ${connectionStatuses}`);

      this.serialPorts = initSettings.serialPorts.reduce((acc: Record<string, string>, port) => {
        acc[port.name] = port.path;
        return acc;
      }, {});

      // load bin lookup data
      // this.binLookup = initSettings.binLookup;

      // // set sorter travel times
      this.sorterTravelTimes = sorterTravelTimes;

      // generate sorter bin positions
      this.generateBinPositions(initSettings.sorterDimensions);

      // set conveyor speed
      this.defaultConveyorSpeed_PPS = initSettings.defaultConveyorSpeed_PPS;

      // set jet positions
      this.jetPositions = initSettings.jetPositions;

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

  private calculateTimings(sorter: number, bin: number, initialTime: number, initialPosition: number, prevSorterbin: number | undefined) {
    const distanceToJet = this.jetPositions[sorter] - initialPosition;
    const jetTime = findTimeAfterDistance(initialTime, distanceToJet, this.speedQueue, this.defaultConveyorSpeed_PPS);
    // default to max travel time if no prevSorterPart
    const travelTimeFromLastBin = !prevSorterbin
      ? this.sorterTravelTimes[sorter][this.sorterTravelTimes[sorter].length - 1]
      : getTravelTimeBetweenBins(sorter, prevSorterbin, bin, this.sorterBinPositions, this.sorterTravelTimes);
    const moveTime = jetTime - Math.max(travelTimeFromLastBin - FALL_TIME, 1);
    return { moveTime, jetTime, travelTimeFromLastBin };
  }

  private adjustSpeedIfNeeded(moveTime: number, sorterReadyTime: number) {
    let adjustmentDetails = { slowdownNeeded: false, arrivalTimeDelay: 0 };

    if (moveTime < sorterReadyTime) {
      const arrivalTimeDelay = sorterReadyTime - moveTime;
      // Calculate new speed percent and adjust speed changes
      adjustmentDetails = { slowdownNeeded: true, arrivalTimeDelay };
    }

    return adjustmentDetails;
  }

  private insertSpeedChange(startSpeedChange: number, arrivalTime: number, arrivalTimeDelay: number) {
    /* insert new speed change at beginning and end of slowdown
    slow dow all speed changes during slowdown by slowDownPercent */

    // find new speed percent
    const tooSmallTimeDif = arrivalTime - startSpeedChange - arrivalTimeDelay;
    const targetTimeDif = arrivalTime - startSpeedChange;
    const slowDownPercent = tooSmallTimeDif / targetTimeDif;

    // -- insert new speed change beginning and end of slowdown

    // --- previous speed change before slowdown
    const prevSpeedChangeIndex = this.speedQueue.reduce((acc, s, i) => {
      if (s.speed < startSpeedChange) return i;
      return acc;
    }, 0);
    const prevSpeed = this.speedQueue[prevSpeedChangeIndex].speed;
    // schedule new speed change
    const prevSpeedRef = this.scheduleConveyorSpeedChange(prevSpeed, startSpeedChange);
    // insert new speed change into speed queue in cronological order
    this.speedQueue.splice(prevSpeedChangeIndex + 1, 0, {
      speed: prevSpeed,
      time: startSpeedChange,
      ref: prevSpeedRef,
    });

    // --- last speed before the end of slowdow will be the next speed
    const nextSpeedChangeIndex = this.speedQueue.reduce((acc, s, i) => {
      if (s.speed < arrivalTime) return i;
      return acc;
    }, 0);
    const nextSpeed = this.speedQueue[nextSpeedChangeIndex].speed;
    // schedule new speed change
    const nextSpeedRef = this.scheduleConveyorSpeedChange(nextSpeed, arrivalTime);
    // insert new speed change into speed queue in cronological order
    this.speedQueue.splice(nextSpeedChangeIndex + 1, 0, {
      speed: nextSpeed,
      time: arrivalTime,
      ref: nextSpeedRef,
    });

    // -- reschedule all speed changes during slowdown by slowDownPercent
    for (let i = prevSpeedChangeIndex + 1; i < nextSpeedChangeIndex + 1; i++) {
      const s = this.speedQueue[i];
      if (s.ref) clearTimeout(s.ref);
      const newSpeed = s.speed * slowDownPercent;
      const newSpeedRef = this.scheduleConveyorSpeedChange(newSpeed, s.speed);
      this.speedQueue[i] = {
        speed: newSpeed,
        time: s.speed,
        ref: newSpeedRef,
      };
    }
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

    this.partQueue.push(part);
    return part;
  }

  private rescheduleActions(startOfSlowdown: number, endOfSlowdown: number, delayBy: number) {
    this.partQueue = this.partQueue.map((p, i) => {
      if (!p.moveTime || !p.moveFinishedTime || !p.jetTime) {
        console.error('rescheduleActions: p.moveTime, p.moveFinishedTime, p.jetTime is undefined');
        return p;
      }
      // -- move
      if (p.moveTime > startOfSlowdown) {
        // if action happens during slowdown
        if (p.moveTime < endOfSlowdown) {
          // how much of slowdown time has passed
          delayBy *= (p.moveTime - startOfSlowdown) / (endOfSlowdown - startOfSlowdown);
        }
        if (p.moveRef) clearTimeout(p.moveRef);
        const newMoveTime = p.moveTime + delayBy;
        const newMoveRef = this.scheduleSorterToPosition(p.sorter, p.bin, newMoveTime);
        const newMoveFinishedTime = p.moveFinishedTime + delayBy;
        p.moveRef = newMoveRef;
        p.moveTime = newMoveTime;
        p.moveFinishedTime = newMoveFinishedTime;
      }
      // -- jet
      if (p.jetTime > startOfSlowdown) {
        // if action happens during slowdown
        if (p.jetTime < endOfSlowdown) {
          // how much of slowdown time has passed
          delayBy *= (p.jetTime - startOfSlowdown) / (endOfSlowdown - startOfSlowdown);
        }
        if (p.jetRef) clearTimeout(p.jetRef);
        const newJetTime = p.jetTime + delayBy;
        const newJetRef = this.scheduleJet(p.sorter, newJetTime);
        p.jetRef = newJetRef;
        p.jetTime = newJetTime;
      }

      return p;
    });
  }

  private filterQueues() {
    // -- filter partQueue
    let lastSorterPartIndexes = new Array(this.sorterBinPositions.length).fill(0);
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
    // get index of last speed change before first part in queue
    const lastSpeedChangeIndex = this.speedQueue.reduce((acc, s, i) => {
      if (s.time < this.partQueue[0].initialTime) return i;
      return acc;
    }, 0);
    this.speedQueue = this.speedQueue.slice(lastSpeedChangeIndex);

    console.log('%c END', 'color: red', { Pq: [...this.partQueue], Sq: [...this.speedQueue] });
  }

  private scheduleJet(jet: number, atTime?: number) {
    // no timeStamp is provided for manually requested moves
    const timeout = !atTime ? 0 : atTime - Date.now();
    return setTimeout(() => {
      console.log('%c jet fired: ', 'color: yellow', jet);
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
      console.log('%c sorterToBin: ', 'color: blue', sorter, bin);
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
        command: ArduinoCommands.FIRE_JET,
        data: bin,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  private scheduleConveyorSpeedChange(speed: number, atTime?: number) {
    const timeout = !atTime ? 0 : atTime - Date.now();
    return setTimeout(() => {
      console.log('%c speedChanged: ', 'color: red', speed);
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
        command: ArduinoCommands.CONVEYOR_SPEED,
        data: speed,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  // return type {sorter: string; bin: number}
  public sortPart = ({ initialTime, initialPosition, bin, sorter }: SortPartDto): { sorter: Number; bin: Number } | { error: String } => {
    try {
      const prevSorterPart = this.partQueue.filter((part) => part.sorter === sorter).pop();
      let { moveTime, jetTime, travelTimeFromLastBin } = this.calculateTimings(sorter, bin, initialTime, initialPosition, prevSorterPart?.bin);
      if (!prevSorterPart?.moveFinishedTime) {
        throw new Error('prevSorterPart.moveFinishedTime is undefined');
      }
      const { slowdownNeeded, arrivalTimeDelay } = this.adjustSpeedIfNeeded(moveTime, prevSorterPart.moveFinishedTime);

      if (slowdownNeeded) {
        // find updated move and jet times
        moveTime += arrivalTimeDelay;
        jetTime += arrivalTimeDelay;

        // --- insert speed change
        const startSpeedChange = prevSorterPart.jetTime || Date.now();
        this.insertSpeedChange(startSpeedChange, jetTime, arrivalTimeDelay);

        // --- reschedule part actions after slowdown
        this.rescheduleActions(startSpeedChange, jetTime, arrivalTimeDelay);
      }

      // create and schedule part actions
      this.createAndSchedulePart(sorter, bin, initialPosition, initialTime, moveTime, jetTime, travelTimeFromLastBin);

      this.filterQueues();

      return { sorter, bin };
    } catch (error) {
      console.error('sortPart error:', error);
      return { error: `Failed to sort part: ${error}` };
    }
  };
}
