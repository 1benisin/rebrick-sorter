"use strict";
// server/hardwareController.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hardwareUtils_1 = require("./hardwareUtils");
const serialPortManager_1 = __importDefault(require("./serialPortManager"));
const arduinoCommands_type_1 = require("../types/arduinoCommands.type");
const serialPort_type_1 = require("../types/serialPort.type");
const utils_1 = require("../lib/utils");
const Conveyor_1 = __importDefault(require("./Conveyor"));
const eventHub_1 = require("./eventHub");
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
class HardwareController {
    constructor() {
        this.initialized = false;
        this.initializationPromise = null;
        this.serialPorts = {};
        this.sorterTravelTimes = [];
        this.sorterBinPositions = [];
        this.generateBinPositions = (sorterDimensions) => {
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
        // return type {sorter: string; bin: number}
        this.sortPart = ({ initialTime, initialPosition, bin, sorter }) => {
            console.log('--- sortPart:', {
                initialTime: (0, utils_1.getFormattedTime)('min', 'ms', initialTime),
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
                let { moveTime, jetTime, travelTimeFromLastBin } = this.calculateTimings(sorter, bin, initialTime, initialPosition, prevSorterPart.bin);
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
            }
            catch (error) {
                console.error('sortPart error:', error);
                throw error;
            }
        };
        this.serialPortManager = serialPortManager_1.default.getInstance();
        this.conveyor = Conveyor_1.default.getInstance();
    }
    init(initSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initialized) {
                console.log('HardwareController is already initialized');
                return;
            }
            if (this.initializationPromise) {
                console.log('HardwareController initialization is already in progress');
                return this.initializationPromise;
            }
            this.initializationPromise = this.initializeInternal(initSettings);
            try {
                yield this.initializationPromise;
            }
            finally {
                this.initializationPromise = null;
            }
        });
    }
    initializeInternal(initSettings) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('HardwareController initializing');
            try {
                // connect serial ports
                const connectionStatuses = yield this.serialPortManager.connectPorts(initSettings.serialPorts);
                const isEveryPortConnected = connectionStatuses.every((status) => status.success);
                if (!isEveryPortConnected)
                    throw new Error(`Failed to connect to serial ports: ${connectionStatuses}`);
                this.serialPorts = initSettings.serialPorts.reduce((acc, port) => {
                    acc[port.name] = port.path;
                    return acc;
                }, {});
                // set sorter travel times
                this.sorterTravelTimes = sorterTravelTimes;
                // generate sorter bin positions
                this.generateBinPositions(initSettings.sorterDimensions);
                // initialize conveyor
                yield this.conveyor.init({
                    defaultConveyorSpeed: initSettings.defaultConveyorSpeed,
                    sorterCount: initSettings.sorterDimensions.length,
                    jetPositions: initSettings.jetPositions,
                    arduinoPath: this.serialPorts[serialPort_type_1.serialPortNames.conveyor_jets],
                });
                this.initialized = true;
                // Register for SORT_PART event
                eventHub_1.eventHub.onEvent(eventHub_1.FrontToBackEvents.SORT_PART, this.sortPart.bind(this));
                // Emit success event
                eventHub_1.eventHub.emitEvent(eventHub_1.BackToFrontEvents.INIT_HARDWARE_SUCCESS, { success: true });
            }
            catch (error) {
                this.initialized = false;
                eventHub_1.eventHub.emitEvent(eventHub_1.BackToFrontEvents.INIT_HARDWARE_SUCCESS, { success: false, error: error.message });
            }
        });
    }
    onSpeedUpdate(callback) {
        this.conveyor.speedUpdateCallback = callback;
    }
    homeSorter(sorter) {
        console.log('homeSorter:', sorter);
        const arduinoDeviceCommand = {
            arduinoPath: this.serialPorts[serialPort_type_1.serialPortNames[sorter]],
            command: arduinoCommands_type_1.ArduinoCommands.MOVE_TO_ORIGIN,
        };
        this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }
    fireJet(sorter) {
        console.log('fireJet:', sorter);
        const arduinoDeviceCommand = {
            arduinoPath: this.serialPorts[serialPort_type_1.serialPortNames.conveyor_jets],
            command: arduinoCommands_type_1.ArduinoCommands.FIRE_JET,
            data: sorter,
        };
        this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }
    moveSorter({ sorter, bin }) {
        console.log('moveSorter:', sorter, bin);
        const arduinoDeviceCommand = {
            arduinoPath: this.serialPorts[serialPort_type_1.serialPortNames[sorter]],
            command: arduinoCommands_type_1.ArduinoCommands.MOVE_TO_BIN,
            data: bin,
        };
        this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
    }
    calculateTimings(sorter, bin, initialTime, initialPosition, prevSorterbin) {
        // distance to jet should never be negative
        const distanceToJet = this.conveyor.getJetPositions[sorter] - initialPosition;
        // jet time is the time it takes to travel the distance to the jet
        // jetTime should always be after initialTime
        const jetTime = (0, hardwareUtils_1.findTimeAfterDistance)(initialTime, distanceToJet, this.conveyor.getSpeedQueue);
        const travelTimeFromLastBin = (0, hardwareUtils_1.getTravelTimeBetweenBins)(sorter, prevSorterbin, bin, this.sorterBinPositions, this.sorterTravelTimes);
        // sorter should have enough travel time to reach the bin before the jet is fired
        const moveTime = Math.max(jetTime + FALL_TIME - travelTimeFromLastBin, 1);
        return { moveTime, jetTime, travelTimeFromLastBin };
    }
    createAndSchedulePart(sorter, bin, initialPosition, initialTime, moveTime, jetTime, travelTimeFromLastBin) {
        const part = {
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
    scheduleJet(jet, atTime) {
        // no timeStamp is provided for manually requested moves
        const timeout = !atTime ? 0 : atTime - Date.now();
        return setTimeout(() => {
            console.log((0, utils_1.getFormattedTime)('min', 'ms'), 'jet fired: ', jet, (0, utils_1.getFormattedTime)('min', 'ms', atTime));
            const arduinoDeviceCommand = {
                arduinoPath: this.serialPorts[serialPort_type_1.serialPortNames.conveyor_jets],
                command: arduinoCommands_type_1.ArduinoCommands.FIRE_JET,
                data: jet,
            };
            this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
        }, timeout);
    }
    scheduleSorterToPosition(sorter, bin, atTime) {
        // check to make sure serialPortNames[sorter] is a valid key
        if (!(sorter in serialPort_type_1.serialPortNames)) {
            throw new Error(`sorter "${sorter}" is not a valid key in serialPortNames`);
        }
        // no timeStamp is provided for manually requested moves
        const timeout = !atTime ? 0 : atTime - Date.now();
        return setTimeout(() => {
            console.log((0, utils_1.getFormattedTime)('min', 'ms'), 'sorter To Bin:', sorter, bin, (0, utils_1.getFormattedTime)('min', 'ms', atTime));
            const arduinoDeviceCommand = {
                arduinoPath: this.serialPorts[serialPort_type_1.serialPortNames[sorter]],
                command: arduinoCommands_type_1.ArduinoCommands.MOVE_TO_BIN,
                data: bin,
            };
            this.serialPortManager.sendCommandToDevice(arduinoDeviceCommand);
        }, timeout);
    }
    computeSlowDownPercent({ jetTime, startSpeedChange, arrivalTimeDelay, }) {
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
    logPartQueue() {
        this.conveyor.logPartQueue();
    }
    logSpeedQueue() {
        this.conveyor.logSpeedQueue();
    }
    conveyorOnOff() {
        this.conveyor.conveyorOnOff();
    }
    clearActions() {
        this.conveyor.clearActions();
    }
}
const hardwareController = new HardwareController();
exports.default = hardwareController;
