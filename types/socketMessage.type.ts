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
} as const;

export type AllEventsType = (typeof AllEvents)[keyof typeof AllEvents];
