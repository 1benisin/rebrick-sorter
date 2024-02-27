import { HardwareInitDto } from './hardwareInit.dto';
import { SortPartDto } from './sortPart.dto';

export enum SocketAction {
  INIT_HARDWARE = 'init-hardware',
  INIT_HARDWARE_SUCCESS = 'init-hardware-success',

  SORT_PART = 'sort-part',
  SORT_PART_SUCCESS = 'sort-part-success',

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
