// lib/hardware/control/hardware-controller.test.ts

// import HardwareController from './hardware-controller';
// import { HardwareInitDto } from '@/types/hardwareInit.dto';

// jest.mock('./serialPortManager', () => {
//   return {
//     getInstance: jest.fn().mockImplementation(() => ({
//       connectPorts: jest.fn().mockResolvedValue([{ success: true }]),
//       sendCommandToDevice: jest.fn(),
//     })),
//   };
// });
// jest.mock('./hardwareUtils', () => ({
//   findTimeAfterDistance: jest.fn((initialTime, distance, speedQueue) => initialTime + distance),
//   getTravelTimeBetweenBins: jest.fn().mockReturnValue(100), // Mock a consistant travel time between bins
// }));

// const initSettings: HardwareInitDto = {
//   defaultConveyorSpeed: 10,
//   serialPorts: [
//     { name: 'sorter_A', path: '/mock/sorter_A_serial_port' },
//     { name: 'sorter_B', path: '/mock/sorter_B_serial_port' },
//     { name: 'conveyor_jets', path: '/mock/conveyor_jets_serial_port' },
//     { name: 'hopper_feeder', path: '/mock/hopper_feeder_serial_port' },
//   ],
//   sorterDimensions: [
//     { gridWidth: 12, gridHeight: 12 },
//     { gridWidth: 16, gridHeight: 16 },
//   ],
//   jetPositions: [500, 1000],
// };

// describe('HARDWARE CONTROLLER ---', () => {
//   describe('HardwareController Initialization', () => {
//     it('should initialize correctly with provided settings', async () => {
//       const controller = HardwareController.getInstance();
//       await controller.init(initSettings);

//       expect(controller.initialized).toBeTruthy();
//     });
//   });

//   describe('prioritySortPartQueue function', () => {
//     let controller: HardwareController;

//     beforeEach(() => {
//       controller = HardwareController.getInstance();
//       controller.defaultConveyorSpeed = 10; // Set a default speed for the conveyor
//       controller.jetPositions = [100, 200, 300]; // Mock jet positions
//     });

//     it('should sort parts based on their default arrival times', () => {
//       controller.partQueue = [
//         { sorter: 0, bin: 1, initialPosition: 50, initialTime: 1000, moveTime: 0, moveFinishedTime: 0, jetTime: 0 },
//         { sorter: 1, bin: 1, initialPosition: 150, initialTime: 500, moveTime: 0, moveFinishedTime: 0, jetTime: 0 },
//         { sorter: 2, bin: 1, initialPosition: 250, initialTime: 750, moveTime: 0, moveFinishedTime: 0, jetTime: 0 },
//       ];

//       controller.prioritySortPartQueue();

//       // Assuming findTimeAfterDistance simply adds initialTime and distance for this mock
//       expect(controller.partQueue).toEqual([
//         {
//           sorter: 1,
//           bin: 1,
//           initialPosition: 150,
//           initialTime: 500,
//           defaultArrivalTime: 550,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: 0,
//         },
//         {
//           sorter: 2,
//           bin: 1,
//           initialPosition: 250,
//           initialTime: 750,
//           defaultArrivalTime: 800,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: 0,
//         },
//         {
//           sorter: 0,
//           bin: 1,
//           initialPosition: 50,
//           initialTime: 1000,
//           defaultArrivalTime: 1050,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: 0,
//         },
//       ]);
//     });

//     it('should not change parts that already have a defaultArrivalTime', () => {
//       controller.partQueue = [
//         {
//           sorter: 0,
//           bin: 1,
//           initialPosition: 50,
//           initialTime: 1000,
//           defaultArrivalTime: 1005,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: 0,
//         },
//         { sorter: 1, bin: 1, initialPosition: 150, initialTime: 500, moveTime: 0, moveFinishedTime: 0, jetTime: 0 },
//       ];

//       controller.prioritySortPartQueue();

//       expect(controller.partQueue).toEqual([
//         {
//           sorter: 1,
//           bin: 1,
//           initialPosition: 150,
//           initialTime: 500,
//           defaultArrivalTime: 550,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: 0,
//         },
//         {
//           sorter: 0,
//           bin: 1,
//           initialPosition: 50,
//           initialTime: 1000,
//           defaultArrivalTime: 1005,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: 0,
//         },
//       ]);
//     });
//   });

//   describe('generateBinPositions', () => {
//     it('should correctly generate bin positions for given sorter dimensions', () => {
//       const hardwareController = HardwareController.getInstance();
//       const sorterDimensions = [
//         { gridWidth: 2, gridHeight: 2 },
//         { gridWidth: 3, gridHeight: 1 },
//       ];

//       hardwareController.generateBinPositions(sorterDimensions);

//       expect(hardwareController.sorterBinPositions).toEqual([
//         [
//           { x: 0, y: 0 },
//           { x: 0, y: 0 },
//           { x: 1, y: 0 },
//           { x: 0, y: 1 },
//           { x: 1, y: 1 },
//         ],
//         [
//           { x: 0, y: 0 },
//           { x: 0, y: 0 },
//           { x: 1, y: 0 },
//           { x: 2, y: 0 },
//         ],
//       ]);
//     });

//     it('should handle empty sorter dimensions', () => {
//       const hardwareController = HardwareController.getInstance();
//       hardwareController.generateBinPositions([]);

//       expect(hardwareController.sorterBinPositions).toEqual([]);
//     });
//   });

//   describe('calculateTimings', () => {
//     let hardwareController: HardwareController;

//     beforeEach(() => {
//       hardwareController = HardwareController.getInstance();
//       hardwareController.jetPositions = [100, 200];
//       hardwareController.sorterTravelTimes = [
//         [10, 20, 30],
//         [15, 25, 35],
//       ]; // Example sorter travel times
//       hardwareController.sorterBinPositions = [
//         [
//           { x: 0, y: 0 },
//           { x: 0, y: 0 },
//           { x: 1, y: 0 },
//           { x: 0, y: 1 },
//           { x: 1, y: 1 },
//         ],
//         [
//           { x: 0, y: 0 },
//           { x: 0, y: 0 },
//           { x: 1, y: 0 },
//           { x: 0, y: 1 },
//           { x: 1, y: 1 },
//         ],
//       ]; // Example bin positions for 2 x 2 grids
//       hardwareController.speedQueue = [{ time: 0, speed: 1, ref: setTimeout(() => {}, 0) }]; // Simplified speedQueue
//     });

//     it('calculates correct timings for given sorter, bin, and initial conditions', () => {
//       const sorter = 0;
//       const bin = 3;
//       const initialTime = 100;
//       const initialPosition = 50;
//       const prevSorterbin = 0;

//       const { moveTime, jetTime, travelTimeFromLastBin } = hardwareController.calculateTimings(
//         sorter,
//         bin,
//         initialTime,
//         initialPosition,
//         prevSorterbin,
//       );

//       expect(jetTime).toBeGreaterThan(initialTime);
//       expect(jetTime).toBe(150);
//       expect(moveTime).toBe(850);
//       expect(travelTimeFromLastBin).toBeDefined();
//     });

//     it('ensures jetTime is always after initialTime', () => {
//       const sorter = 1;
//       const bin = 2;
//       const initialTime = 200;
//       const initialPosition = 150;
//       const prevSorterbin = 1;

//       const { jetTime } = hardwareController.calculateTimings(sorter, bin, initialTime, initialPosition, prevSorterbin);

//       expect(jetTime).toBeGreaterThanOrEqual(initialTime);
//     });
//   });

//   describe('rescheduleActions function', () => {
//     let hardwareController: HardwareController;

//     beforeEach(() => {
//       hardwareController = HardwareController.getInstance();
//       hardwareController.partQueue = [
//         {
//           sorter: 1,
//           bin: 1,
//           initialPosition: 0,
//           initialTime: 0,
//           moveTime: 5000,
//           moveFinishedTime: 7000,
//           jetTime: 8000,
//           moveRef: setTimeout(() => {}, 0),
//           jetRef: setTimeout(() => {}, 0),
//         },
//         // Add more parts as needed for thorough testing
//       ];

//       // Mocking methods to prevent actual timeouts
//       hardwareController.scheduleSorterToPosition = jest.fn();
//       hardwareController.scheduleJet = jest.fn();
//     });

//     it('correctly reschedules actions within the slowdown period', () => {
//       const startOfSlowdown = 4000;
//       const endOfSlowdown = 9000;
//       const delayBy = 2000;

//       hardwareController.rescheduleActions(startOfSlowdown, endOfSlowdown, delayBy);

//       expect(hardwareController.partQueue[0].moveTime).toBe(5400);
//       expect(hardwareController.partQueue[0].moveFinishedTime).toBe(7400);
//       expect(hardwareController.partQueue[0].jetTime).toBe(9600);
//       expect(hardwareController.scheduleSorterToPosition).toHaveBeenCalled();
//       expect(hardwareController.scheduleJet).toHaveBeenCalled();
//     });

//     it('does not reschedule actions outside the slowdown period', () => {
//       const startOfSlowdown = 7000;
//       const endOfSlowdown = 9000;
//       const delayBy = 2000;

//       hardwareController.rescheduleActions(startOfSlowdown, endOfSlowdown, delayBy);

//       // Assuming part.moveTime is before the startOfSlowdown
//       expect(hardwareController.partQueue[0].moveTime).toEqual(5000);
//       expect(hardwareController.partQueue[0].jetTime).toBe(9000); // since jetTime is within the slowdown period
//     });
//   });

//   describe('insertSpeedChange function', () => {
//     let hardwareController: HardwareController;
//     let baseTime = 2000000000000; // an even future Date.now() to prevent time conflicts

//     beforeEach(() => {
//       hardwareController = HardwareController.getInstance();
//       hardwareController.speedQueue = [
//         { time: baseTime + 1000, speed: 1, ref: setTimeout(() => {}, 0) },
//         { time: baseTime + 2000, speed: 2, ref: setTimeout(() => {}, 0) },
//       ];

//       // Mocking the scheduleConveyorSpeedChange to just return a timeout reference
//       hardwareController.scheduleConveyorSpeedChange = jest
//         .fn()
//         .mockImplementation((speed, time) => setTimeout(() => {}, 0));
//     });

//     it('should correctly insert a new speed change between existing speed changes', () => {
//       const startSpeedChange = baseTime + 1200;
//       const newArrivalTime = baseTime + 2000;
//       const oldArrivalTime = baseTime + 1800;

//       hardwareController.insertSpeedChange({ startSpeedChange, newArrivalTime, oldArrivalTime });

//       expect(hardwareController.speedQueue).toHaveLength(4);
//       expect(hardwareController.scheduleConveyorSpeedChange).toHaveBeenCalled();
//       const newSpeedQueue = hardwareController.speedQueue.map(({ speed, time }) => ({ speed, time }));
//       const expectedQueue = [
//         { speed: 1, time: baseTime + 1000 },
//         { speed: 0.75, time: baseTime + 1200 },
//         { speed: 1, time: baseTime + 2000 },
//         { speed: 2, time: baseTime + 2000 },
//       ];
//       expect(newSpeedQueue).toStrictEqual(expectedQueue);
//     });

//     it('should correctly insert a new speed change overlapping with existing speed changes', () => {
//       const startSpeedChange = baseTime + 1500;
//       const newArrivalTime = baseTime + 2500;
//       const oldArrivalTime = baseTime + 2000;

//       hardwareController.insertSpeedChange({ startSpeedChange, newArrivalTime, oldArrivalTime });

//       expect(hardwareController.speedQueue).toHaveLength(4);
//       expect(hardwareController.scheduleConveyorSpeedChange).toHaveBeenCalled();
//       const newSpeedQueue = hardwareController.speedQueue.map(({ speed, time }) => ({ speed, time }));
//       const expectedQueue = [
//         { speed: 1, time: baseTime + 1000 },
//         { speed: 0.5, time: baseTime + 1500 },
//         { speed: 1, time: baseTime + 2000 },
//         { speed: 2, time: baseTime + 2500 },
//       ];
//       expect(newSpeedQueue).toStrictEqual(expectedQueue);
//     });
//   });

//   describe('filterQueues function', () => {
//     let hardwareController: HardwareController;
//     let baseTime = 2000000000000; // an even future Date.now() to prevent time conflicts

//     beforeEach(() => {
//       hardwareController = HardwareController.getInstance();
//       hardwareController.partQueue = [
//         // Assuming parts are already sorted by time
//         {
//           sorter: 1,
//           bin: 2,
//           initialTime: 2000,
//           initialPosition: 0,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: Date.now() - 15000,
//         }, // Past jetTime
//         {
//           sorter: 1,
//           bin: 0,
//           initialTime: 1000,
//           initialPosition: 0,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: Date.now() - 10000,
//         }, // Past jetTime
//         {
//           sorter: 0,
//           bin: 0,
//           initialTime: 600,
//           initialPosition: 0,
//           moveTime: 0,
//           moveFinishedTime: 0,
//           jetTime: Date.now() + 10000,
//         }, // Future jetTime
//       ];
//       hardwareController.speedQueue = [
//         { time: 400, speed: 1, ref: setTimeout(() => {}, 0) },
//         { time: 500, speed: 2, ref: setTimeout(() => {}, 0) },
//       ];
//       hardwareController.sorterBinPositions = [[], []]; // Mock sorterBinPositions
//     });

//     it('correctly filters the partQueue', () => {
//       hardwareController.filterQueues();

//       // Expect the part with past jetTime to be removed
//       expect(hardwareController.partQueue).toHaveLength(2);
//       expect(hardwareController.partQueue[0].sorter).toBe(1);
//       expect(hardwareController.partQueue[1].sorter).toBe(0);
//     });

//     it('correctly filters the speedQueue', () => {
//       hardwareController.filterQueues();

//       // Expect the speed change before the earliest part initialTime to be removed
//       expect(hardwareController.speedQueue).toHaveLength(1);
//       expect(hardwareController.speedQueue[0].time).toBe(500);
//     });

//     it('retains at least one part per sorter', () => {
//       hardwareController.filterQueues();

//       // Even though both parts for sorter 1 have past jetTimes, at least one should be retained
//       const sorter0Parts = hardwareController.partQueue.filter((p) => p.sorter === 0);
//       expect(sorter0Parts).toHaveLength(1);
//       const sorter1Parts = hardwareController.partQueue.filter((p) => p.sorter === 1);
//       expect(sorter1Parts).toHaveLength(1);
//     });
//   });

//   // describe('SortPart function', () => {
//   //   it('should sort a part at the right timing', async () => {
//   //     const initialTime = Date.now();
//   //     const controller = HardwareController.getInstance();
//   //     const part = { partId: 'test_part', initialTime, initialPosition: 0, bin: 1, sorter: 0 };
//   //     const result = await controller.sortPart(part);
//   //     console.log(result);

//   //     expect(result).toBeTruthy();
//   //   });
//   // });
// });
