// types/socketMessage.type.ts

import { SortPartDto } from './sortPart.dto';
import { Part } from './part.type';

export enum FrontToBackEvents {
  SORT_PART = 'sort-part',
  CONVEYOR_ON_OFF = 'conveyor-on-off',
  HOME_SORTER = 'home-sorter',
  MOVE_SORTER = 'move-sorter',
  FIRE_JET = 'fire-jet',
  LIST_SERIAL_PORTS = 'list-serial-ports',
  RESET_SORT_PROCESS = 'reset-sort-process',
  UPDATE_FEEDER_SETTINGS = 'update-feeder-settings',
}

export enum BackToFrontEvents {
  INIT_HARDWARE_SUCCESS = 'init-hardware-success',
  SORT_PART_SUCCESS = 'sort-part-success',
  CONVEYOR_SPEED_UPDATE = 'conveyor-speed-update',
  LOG_PART_QUEUE_SUCCESS = 'log-part-queue-success',
  LIST_SERIAL_PORTS_SUCCESS = 'list-serial-ports-success',
  SORTER_MOVED = 'sorter-moved',
  JET_FIRED = 'jet-fired',
  COMPONENT_STATUS_UPDATE = 'component-status-update',
  SORTER_POSITION_UPDATE = 'sorter-position-update',
  SORTER_STATE_UPDATE = 'sorter-state-update',
  PART_SORTED = 'part-sorted',
  PART_SKIPPED = 'part-skipped',
  ENCODER_POSITION_UPDATE = 'encoder-position-update',
  // Phase 4: Encoder-based part scheduling events
  ENCODER_PART_SCHEDULED = 'encoder-part-scheduled',
  ENCODER_PART_SORTED = 'encoder-part-sorted',
  ENCODER_PART_SKIPPED = 'encoder-part-skipped',
  // Phase 5: Buffer status for pending jets
  BUFFER_STATUS_UPDATE = 'buffer-status-update',
}

export const AllEvents = { ...FrontToBackEvents, ...BackToFrontEvents } as const;

export type AllEventNames = (typeof AllEvents)[keyof typeof AllEvents];

export interface EventPayloads {
  [FrontToBackEvents.SORT_PART]: SortPartDto;
  [FrontToBackEvents.CONVEYOR_ON_OFF]: void;
  [FrontToBackEvents.HOME_SORTER]: { sorter: number };
  [FrontToBackEvents.MOVE_SORTER]: { sorter: number; bin: number };
  [FrontToBackEvents.FIRE_JET]: { sorter: number };
  [FrontToBackEvents.LIST_SERIAL_PORTS]: void;
  [FrontToBackEvents.RESET_SORT_PROCESS]: void;
  [FrontToBackEvents.UPDATE_FEEDER_SETTINGS]: {
    vibrationSpeed: number;
    stopDelay: number;
    pauseTime: number;
    shortMoveTime: number;
    longMoveTime: number;
    hopperCycleInterval: number;
  };
  [BackToFrontEvents.INIT_HARDWARE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.SORT_PART_SUCCESS]: { success: boolean };
  [BackToFrontEvents.CONVEYOR_SPEED_UPDATE]: number;
  [BackToFrontEvents.LOG_PART_QUEUE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS]: string[];
  [BackToFrontEvents.SORTER_MOVED]: { sorter: number; bin: number };
  [BackToFrontEvents.JET_FIRED]: { sorter: number };
  [BackToFrontEvents.COMPONENT_STATUS_UPDATE]: {
    componentName: string;
    status: string;
    error: string | null;
  };
  [BackToFrontEvents.SORTER_POSITION_UPDATE]: {
    sorter: number;
    bin: number;
  };
  /** Detailed sorter state update for encoder-based tracking */
  [BackToFrontEvents.SORTER_STATE_UPDATE]: {
    /** Sorter index (0-3) */
    sorter: number;
    /** Confirmed current bin (from MC: response) */
    currentBin: number;
    /** True if sorter is currently moving */
    isMoving: boolean;
    /** Target bin if moving, null otherwise */
    targetBin: number | null;
    /** Number of scheduled moves in queue */
    scheduledMoveCount: number;
    /** Current encoder position when update was sent */
    encoderPosition: number;
  };
  [BackToFrontEvents.PART_SORTED]: { part: Part };
  [BackToFrontEvents.PART_SKIPPED]: { part: Part };
  /** Encoder position update from server to frontend for real-time tracking */
  [BackToFrontEvents.ENCODER_POSITION_UPDATE]: {
    /** Encoder position in ticks (counts) */
    position: number;
    /** Server timestamp when position was recorded (ms since epoch) */
    timestamp: number;
    /** Velocity in counts per millisecond (smoothed via EMA, alpha=0.3) */
    velocity: number;
  };
  /** Phase 4: Encoder part scheduled for sorting */
  [BackToFrontEvents.ENCODER_PART_SCHEDULED]: {
    partId: string;
    jetPosition: number;
    moveTriggerPosition: number;
    sorter: number;
    bin: number;
  };
  /** Phase 4: Encoder part successfully sorted (jet fired) */
  [BackToFrontEvents.ENCODER_PART_SORTED]: {
    partId: string;
    jetPosition: number;
    sorter: number;
    bin: number;
  };
  /** Phase 4: Encoder part skipped (sorter unavailable or past position) */
  [BackToFrontEvents.ENCODER_PART_SKIPPED]: {
    partId: string;
    reason: string;
    sorter: number;
    bin: number;
  };
  /** Phase 5: Buffer status update for pending jets on Arduino */
  [BackToFrontEvents.BUFFER_STATUS_UPDATE]: {
    /** Number of active pending jets in Arduino buffer */
    count: number;
    /** Total capacity of the pending jets buffer */
    capacity: number;
  };
}
