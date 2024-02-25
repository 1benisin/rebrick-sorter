import { HardwareInitDto } from './hardwareInit.dto';
import { SortPartDto } from './sortPart.dto';

export enum SocketAction {
  INIT_HARDWARE = 'init-hardware',
  INIT_HARDWARE_SUCCESS = 'init-hardware-success',

  SORT_PART = 'sort-part',
  SORT_PART_SUCCESS = 'sort-part-success',
}

export type SocketMessage = {
  [SocketAction.INIT_HARDWARE]: HardwareInitDto;
  [SocketAction.INIT_HARDWARE_SUCCESS]: boolean;

  [SocketAction.SORT_PART]: SortPartDto;
  [SocketAction.SORT_PART_SUCCESS]: boolean;
};
