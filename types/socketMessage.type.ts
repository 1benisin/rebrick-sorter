// types/socketMessage.type.ts

import { HardwareInitDto } from './hardwareInit.dto';
import { SortPartDto } from './sortPart.dto';

export type SocketMessage = {
  [FrontToBackEvents.SORT_PART]: SortPartDto;
  [FrontToBackEvents.CONVEYOR_ON_OFF]: void;
  [FrontToBackEvents.HOME_SORTER]: { sorter: number };
  [FrontToBackEvents.MOVE_SORTER]: { sorter: number; bin: number };
  [FrontToBackEvents.FIRE_JET]: { sorter: number };
  [FrontToBackEvents.LIST_SERIAL_PORTS]: void;
  [FrontToBackEvents.RESET_SORT_PROCESS]: void;
  [BackToFrontEvents.INIT_HARDWARE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.SORT_PART_SUCCESS]: { success: boolean };
  [BackToFrontEvents.CONVEYOR_SPEED_UPDATE]: number;
  [BackToFrontEvents.LOG_PART_QUEUE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS]: string[];
  [BackToFrontEvents.SORTER_MOVED]: { sorter: number; bin: number };
  [BackToFrontEvents.JET_FIRED]: { sorter: number };
  [BackToFrontEvents.SETTINGS_UPDATE]: any; // Replace with SettingsType
  [BackToFrontEvents.COMPONENT_STATUS_UPDATE]: {
    componentName: string;
    status: string;
    error: string | null;
  };
  [BackToFrontEvents.SORTER_POSITION_UPDATE]: {
    sorter: number;
    bin: number;
  };
  [BackToFrontEvents.PART_SORTED]: {
    partId: string;
  };
};

export enum FrontToBackEvents {
  SORT_PART = 'sort-part',
  CONVEYOR_ON_OFF = 'conveyor-on-off',
  HOME_SORTER = 'home-sorter',
  MOVE_SORTER = 'move-sorter',
  FIRE_JET = 'fire-jet',
  LIST_SERIAL_PORTS = 'list-serial-ports',
  RESET_SORT_PROCESS = 'reset-sort-process',
}

export enum BackToFrontEvents {
  INIT_HARDWARE_SUCCESS = 'init-hardware-success',
  SORT_PART_SUCCESS = 'sort-part-success',
  CONVEYOR_SPEED_UPDATE = 'conveyor-speed-update',
  LOG_PART_QUEUE_SUCCESS = 'log-part-queue-success',
  LIST_SERIAL_PORTS_SUCCESS = 'list-serial-ports-success',
  SORTER_MOVED = 'sorter-moved',
  JET_FIRED = 'jet-fired',
  SETTINGS_UPDATE = 'settings-update',
  COMPONENT_STATUS_UPDATE = 'component-status-update',
  SORTER_POSITION_UPDATE = 'sorter-position-update',
  PART_SORTED = 'part-sorted',
}

export type AllEvents = FrontToBackEvents | BackToFrontEvents;

export const AllEvents = {
  ...FrontToBackEvents,
  ...BackToFrontEvents,
  SCHEDULE_SORTER_MOVE: 'schedule-sorter-move',
  SCHEDULE_JET_FIRE: 'schedule-jet-fire',
} as const;

export type AllEventNames = (typeof AllEvents)[keyof typeof AllEvents];

export interface EventPayloads {
  [FrontToBackEvents.SORT_PART]: {
    initialTime: number;
    initialPosition: number;
    bin: number;
    sorter: number;
    partId: string;
  };
  [FrontToBackEvents.CONVEYOR_ON_OFF]: void;
  [FrontToBackEvents.HOME_SORTER]: { sorter: number };
  [FrontToBackEvents.MOVE_SORTER]: { sorter: number; bin: number };
  [FrontToBackEvents.FIRE_JET]: { sorter: number };
  [FrontToBackEvents.LIST_SERIAL_PORTS]: void;
  [FrontToBackEvents.RESET_SORT_PROCESS]: void;
  [BackToFrontEvents.INIT_HARDWARE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.SORT_PART_SUCCESS]: { success: boolean };
  [BackToFrontEvents.CONVEYOR_SPEED_UPDATE]: number;
  [BackToFrontEvents.LOG_PART_QUEUE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS]: string[];
  [BackToFrontEvents.SORTER_MOVED]: { sorter: number; bin: number };
  [BackToFrontEvents.JET_FIRED]: { sorter: number };
  [BackToFrontEvents.SETTINGS_UPDATE]: any; // Replace with SettingsType
  [BackToFrontEvents.COMPONENT_STATUS_UPDATE]: {
    componentName: string;
    status: string;
    error: string | null;
  };
  [BackToFrontEvents.SORTER_POSITION_UPDATE]: {
    sorter: number;
    bin: number;
  };
  [BackToFrontEvents.PART_SORTED]: {
    partId: string;
  };
}

export type AllEventsType = (typeof AllEvents)[keyof typeof AllEvents];
