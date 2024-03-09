import { HardwareInitDto } from './hardwareInit.dto';
import { SortPartDto } from './sortPart.dto';

export enum SocketAction {
  INIT_HARDWARE = 'init-hardware',
  INIT_HARDWARE_SUCCESS = 'init-hardware-success',

  CONVEYOR_ON_OFF = 'conveyor-on-off',
  MOVE_SORTER = 'move-sorter',
  FIRE_JET = 'fire-jet',
  HOME_SORTER = 'home-sorter',

  SORT_PART = 'sort-part',
  SORT_PART_SUCCESS = 'sort-part-success',

  CONVEYOR_SPEED_UPDATE = 'conveyor-speed-update',

  LOG_PART_QUEUE = 'log-part-queue',
  LOG_PART_QUEUE_SUCCESS = 'log-part-queue-success',
  LOG_SPEED_QUEUE = 'log-speed-queue',
  LOG_SPEED_QUEUE_SUCCESS = 'log-speed-queue-success',
}

export type SocketMessage = {
  [SocketAction.INIT_HARDWARE]: HardwareInitDto;
  [SocketAction.INIT_HARDWARE_SUCCESS]: boolean;

  [SocketAction.SORT_PART]: SortPartDto;
  [SocketAction.SORT_PART_SUCCESS]: boolean;
};
