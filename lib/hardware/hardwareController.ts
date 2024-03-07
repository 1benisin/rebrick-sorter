import { PartQueue, SpeedQueue, Part, SpeedChange } from './hardwareTypes.d';
import { findTimeAfterDistance, getTravelTimeBetweenBins } from './hardwareUtils';
import SerialPortManager from './serialPortManager';
import { ArduinoCommands, ArduinoDeviceCommand } from '@/types/arduinoCommands.type';
import { serialPortNames } from '@/types/serialPort.type';
import { SortPartDto } from '@/types/sortPart.dto';
import { HardwareInitDto } from '@/types/hardwareInit.dto';
import { getFormattedTime } from '@/lib/utils';

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

  initialized: boolean = false;

  serialPorts: Record<string, string> = {};
  defaultConveyorSpeed: number = 0;
  sorterTravelTimes: number[][] = [];
  sorterBinPositions: { x: number; y: number }[][] = [];
  jetPositions: number[] = [];

  partQueue: PartQueue = [];
  speedQueue: SpeedQueue = [];

  private constructor() {
    this.serialPortManager = SerialPortManager.getInstance();
  }

  static getInstance() {
    if (!HardwareController.instance) {
      HardwareController.instance = new HardwareController();
    }
    return HardwareController.instance;
  }

  async init(initSettings: HardwareInitDto): Promise<void> {
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

      // initialize speed queue
      this.speedQueue = [];
      this.speedQueue = [{ speed: initSettings.defaultConveyorSpeed, time: Date.now(), ref: setTimeout(() => {}) }];

      // initialize part queue
      // init the part queue with a part for every sorter
      this.partQueue = [];
      for (let i = 0; i < initSettings.sorterDimensions.length; i++) {
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

      // set sorter travel times
      this.sorterTravelTimes = sorterTravelTimes;

      // generate sorter bin positions
      this.generateBinPositions(initSettings.sorterDimensions);

      // set conveyor speed
      this.defaultConveyorSpeed = initSettings.defaultConveyorSpeed;

      // set jet positions
      this.jetPositions = initSettings.jetPositions;

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize hardware controller: ${error}`);
    }
  }

  generateBinPositions = (
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

  public conveyorOnOff() {
    console.log('conveyorOnOff');
    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
      command: ArduinoCommands.CONVEYOR_ON_OFF,
    };
    this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
  }

  public logPartQueue() {
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
    return partQueue;
  }

  public logSpeedQueue() {
    const speedQueue = this.speedQueue.map((s) => ({ speed: s.speed, time: getFormattedTime('min', 'ms', s.time) }));
    console.log('speedQueue:', speedQueue);
    return speedQueue;
  }

  calculateTimings(sorter: number, bin: number, initialTime: number, initialPosition: number, prevSorterbin: number) {
    // distance to jet should never be negative
    const distanceToJet = this.jetPositions[sorter] - initialPosition;
    // jet time is the time it takes to travel the distance to the jet
    // jetTime should always be after initialTime
    const jetTime = findTimeAfterDistance(initialTime, distanceToJet, this.speedQueue);

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

  insertSpeedChange({
    startSpeedChange,
    newArrivalTime,
    oldArrivalTime,
  }: {
    startSpeedChange: number;
    newArrivalTime: number;
    oldArrivalTime: number;
  }) {
    /* insert new speed change at beginning (startSpeedChange) and end (newArrivalTime) of slowdown
     and slow down all speed changes during slowdown by slowDownPercent */
    if (newArrivalTime < Date.now() || oldArrivalTime < Date.now())
      throw new Error(
        `insertSpeedChange: time is in the past: ${Date.now()}, ${startSpeedChange}, ${newArrivalTime}, ${oldArrivalTime}`,
      );
    // 5506, 4605.7515, 8515.7515, 7582.505
    if (startSpeedChange > newArrivalTime)
      throw new Error(`insertSpeedChange: startSpeedChange > newArrivalTime: ${startSpeedChange}, ${newArrivalTime}`);
    if (oldArrivalTime > newArrivalTime)
      throw new Error(`insertSpeedChange: oldArrivalTime > newArrivalTime: ${oldArrivalTime}, ${newArrivalTime}`);

    // start speed change now or in the future once last part at same sorter has been jetted ( startSpeedChange = lastPartJettedTime)
    startSpeedChange = Math.max(startSpeedChange, Date.now());

    // find new speed percent
    const tooSmallTimeDif = oldArrivalTime - startSpeedChange;
    const targetTimeDif = newArrivalTime - startSpeedChange;
    const slowDownPercent = tooSmallTimeDif / targetTimeDif;

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

  rescheduleActions(startOfSlowdown: number, endOfSlowdown: number, delayBy: number) {
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
        const newMoveRef = this.scheduleSorterToPosition(p.sorter, p.bin, newMoveTime);
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
        const newJetRef = this.scheduleJet(p.sorter, newJetTime);
        p.jetRef = newJetRef;
        p.jetTime = newJetTime;
      }

      return p;
    });
  }

  filterQueues() {
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

  scheduleJet(jet: number, atTime?: number) {
    // no timeStamp is provided for manually requested moves
    const timeout = !atTime ? 0 : atTime - Date.now();

    return setTimeout(() => {
      console.log(getFormattedTime('min', 'ms'), 'jet fired: ', jet);
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
        command: ArduinoCommands.FIRE_JET,
        data: jet,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  scheduleSorterToPosition(sorter: number, bin: number, atTime?: number) {
    // check to make sure serialPortNames[sorter] is a valid key
    if (!(sorter in serialPortNames)) {
      throw new Error(`sorter "${sorter}" is not a valid key in serialPortNames`);
    }

    // no timeStamp is provided for manually requested moves
    const timeout = !atTime ? 0 : atTime - Date.now();

    return setTimeout(() => {
      console.log(getFormattedTime('min', 'ms'), 'sorter To Bin:', sorter, bin);
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames[sorter as keyof typeof serialPortNames]],
        command: ArduinoCommands.MOVE_TO_BIN,
        data: bin,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  scheduleConveyorSpeedChange(speed: number, atTime?: number) {
    if (speed < 0 || speed > this.defaultConveyorSpeed) {
      throw new Error(`scheduleConveyorSpeedChange: speed ${speed} is out of range`);
    }
    const timeout = !atTime ? 0 : atTime - Date.now();

    // normalize spped to conveyor motor speed 0-255
    const normalizeConveyorSpeed = Math.round((speed / this.defaultConveyorSpeed) * 255);

    return setTimeout(() => {
      console.log(getFormattedTime('min', 'ms'), '- speed Changed:', speed, normalizeConveyorSpeed);
      const arduinoDeviceCommand: ArduinoDeviceCommand = {
        arduinoPath: this.serialPorts[serialPortNames.conveyor_jets],
        command: ArduinoCommands.CONVEYOR_SPEED,
        data: normalizeConveyorSpeed,
      };
      this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }, timeout);
  }

  prioritySortPartQueue() {
    // add defaultArrivalTime if it doesn't exist
    this.partQueue.map((part) => {
      if (part.defaultArrivalTime) {
        return part;
      }
      // find arrival time with mock speedQueue with only default speed
      const arrivalTime = findTimeAfterDistance(
        part.initialTime,
        this.jetPositions[part.sorter] - part.initialPosition,
        [{ time: part.initialTime, speed: this.defaultConveyorSpeed, ref: setTimeout(() => {}, 0) }],
      );
      part.defaultArrivalTime = arrivalTime;
      return part;
    });

    this.partQueue.sort((a, b) => {
      if (a.defaultArrivalTime && b.defaultArrivalTime) {
        return a.defaultArrivalTime - b.defaultArrivalTime;
      }
      return 0;
    });
  }

  // return type {sorter: string; bin: number}
  public sortPart = ({ initialTime, initialPosition, bin, sorter }: SortPartDto) => {
    console.log('--- sortPart:', {
      init: getFormattedTime('min', 'sec', initialTime),
      initialTime,
      initialPosition,
      bin,
      sorter,
    });
    try {
      if (!this.initialized) {
        throw new Error('HardwareController not initialized');
      }
      // add defaultArrivalTime and sort partQueue by defaultArrivalTime
      this.prioritySortPartQueue();
      // get the last part in the part queueue for the sorter where part.sorter === sorter

      const prevSorterPart = this.partQueue.reduce<Part | null>((acc, p) => {
        if (p.sorter === sorter) return p;
        return acc;
      }, null);
      // prevSorterPart should never be empty. We initialize the partQueue with a part for every sorter
      if (!prevSorterPart) {
        throw new Error('sortPart: prevSorterPart is empty for sorter: ' + sorter);
      }

      let { moveTime, jetTime, travelTimeFromLastBin } = this.calculateTimings(
        sorter,
        bin,
        initialTime,
        initialPosition,
        prevSorterPart.bin,
      );

      const arrivalTimeDelay = Math.max(prevSorterPart.moveFinishedTime - moveTime, 0);

      // slow down conveyor if arrivalTimeDelay > 0
      if (arrivalTimeDelay > 0) {
        console.log('SLOW-DOWN:', arrivalTimeDelay);
        // find updated move and jet times
        const oldJetTime = jetTime;
        moveTime += arrivalTimeDelay;
        jetTime += arrivalTimeDelay;

        // --- insert speed change
        this.insertSpeedChange({
          startSpeedChange: prevSorterPart.jetTime,
          newArrivalTime: jetTime,
          oldArrivalTime: oldJetTime,
        });

        // --- reschedule part actions after slowdown
        this.rescheduleActions(prevSorterPart.jetTime, jetTime, arrivalTimeDelay);
      }

      // create and schedule part actions
      this.createAndSchedulePart(sorter, bin, initialPosition, initialTime, moveTime, jetTime, travelTimeFromLastBin);

      this.filterQueues();
    } catch (error) {
      console.error('sortPart error:', error);
      throw error;
    }
  };
}
