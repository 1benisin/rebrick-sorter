// types/socketMessage.type.ts

import { HardwareInitDto } from './hardwareInit.dto';
import { SortPartDto } from './sortPart.dto';

export type SocketMessage = {
  [AllEvents.INIT_HARDWARE]: HardwareInitDto;
  [AllEvents.INIT_HARDWARE_SUCCESS]: boolean;

  [AllEvents.SORT_PART]: SortPartDto;
  [AllEvents.SORT_PART_SUCCESS]: boolean;
};

export const FrontToBackEvents = {
  INIT_HARDWARE: 'init-hardware',
  CLEAR_HARDWARE_ACTIONS: 'reset-hardware',
  CONVEYOR_ON_OFF: 'conveyor-on-off',
  MOVE_SORTER: 'move-sorter',
  FIRE_JET: 'fire-jet',
  HOME_SORTER: 'home-sorter',
  SORT_PART: 'sort-part',
  LOG_PART_QUEUE: 'log-part-queue',
  LOG_SPEED_QUEUE: 'log-speed-queue',
  LIST_SERIAL_PORTS: 'list-serial-ports',
  ABC_TEST: 'abc',
} as const;

export const BackToFrontEvents = {
  INIT_HARDWARE_SUCCESS: 'init-hardware-success',
  SORT_PART_SUCCESS: 'sort-part-success',
  CONVEYOR_SPEED_UPDATE: 'conveyor-speed-update',
  LOG_PART_QUEUE_SUCCESS: 'log-part-queue-success',
  LOG_SPEED_QUEUE_SUCCESS: 'log-speed-queue-success',
  LIST_SERIAL_PORTS_SUCCESS: 'list-serial-ports-success',
  ABC_TEST: 'abc',
} as const;

export const AllEvents = {
  ...FrontToBackEvents,
  ...BackToFrontEvents,
  SCHEDULE_SORTER_MOVE: 'schedule-sorter-move',
  SCHEDULE_JET_FIRE: 'schedule-jet-fire',
} as const;

export type AllEventNames = (typeof AllEvents)[keyof typeof AllEvents];

export type EventPayloads = {
  [AllEvents.INIT_HARDWARE]: HardwareInitDto;
  [AllEvents.SORT_PART]: SortPartDto;
  [AllEvents.SORT_PART_SUCCESS]: boolean;
  [AllEvents.SCHEDULE_SORTER_MOVE]: { sorter: number; bin: number; moveTime: number };
  [AllEvents.SCHEDULE_JET_FIRE]: { sorter: number; jetTime: number };
  [AllEvents.CLEAR_HARDWARE_ACTIONS]: undefined;
  [AllEvents.CONVEYOR_ON_OFF]: undefined;
  [AllEvents.MOVE_SORTER]: { sorter: number; bin: number };
  [AllEvents.FIRE_JET]: { sorter: number };
  [AllEvents.HOME_SORTER]: { sorter: number };
  [AllEvents.LOG_PART_QUEUE]: undefined;
  [AllEvents.LOG_SPEED_QUEUE]: undefined;
  [AllEvents.LIST_SERIAL_PORTS]: undefined;
  [AllEvents.ABC_TEST]: undefined;
  [AllEvents.INIT_HARDWARE_SUCCESS]: { success: boolean };
  [AllEvents.SORT_PART_SUCCESS]: boolean;
  [AllEvents.CONVEYOR_SPEED_UPDATE]: { speed: number };
  [AllEvents.LOG_PART_QUEUE_SUCCESS]: {
    sorter: number;
    bin: number;
    initialPosition: number;
    initialTime: string;
    moveTime: string;
    moveFinishedTime: string;
    jetTime: string;
  }[];
  [AllEvents.LOG_SPEED_QUEUE_SUCCESS]: { speed: number; time: string }[];
  [AllEvents.LIST_SERIAL_PORTS_SUCCESS]: string[];
};

export type AllEventsType = (typeof AllEvents)[keyof typeof AllEvents];
