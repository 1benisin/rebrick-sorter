// types/socketMessage.type.ts

import { SortPartDto } from './sortPart.dto';

export enum FrontToBackEvents {
  SORT_PART = 'sort-part',
  CONVEYOR_ON_OFF = 'conveyor-on-off',
  HOME_SORTER = 'home-sorter',
  MOVE_SORTER = 'move-sorter',
  FIRE_JET = 'fire-jet',
  LIST_SERIAL_PORTS = 'list-serial-ports',
  RESET_SORT_PROCESS = 'reset-sort-process',
  UPDATE_FEEDER_SETTINGS = 'update-feeder-settings',
  // Phase 7: Encoder calibration events
  RESET_ENCODER = 'reset-encoder',
  RECORD_CAMERA_POSITION = 'record-camera-position',
  RECORD_JET_POSITION = 'record-jet-position',
  /** Record camera view width in encoder ticks (left edge to right edge) */
  RECORD_CAMERA_WIDTH = 'record-camera-width',
  /** Save all calibration data at once (camera width + jet positions) */
  SAVE_CALIBRATION_DATA = 'save-calibration-data',
  // Phase 8: Travel time calibration
  /** Trigger travel time calibration for all sorters */
  START_TRAVEL_TIME_CALIBRATION = 'start-travel-time-calibration',
}

export enum BackToFrontEvents {
  INIT_HARDWARE_SUCCESS = 'init-hardware-success',
  SORT_PART_SUCCESS = 'sort-part-success',
  LOG_PART_QUEUE_SUCCESS = 'log-part-queue-success',
  LIST_SERIAL_PORTS_SUCCESS = 'list-serial-ports-success',
  SORTER_MOVED = 'sorter-moved',
  JET_FIRED = 'jet-fired',
  COMPONENT_STATUS_UPDATE = 'component-status-update',
  SORTER_POSITION_UPDATE = 'sorter-position-update',
  SORTER_STATE_UPDATE = 'sorter-state-update',
  ENCODER_POSITION_UPDATE = 'encoder-position-update',
  // Phase 4: Encoder-based part scheduling events
  ENCODER_PART_SCHEDULED = 'encoder-part-scheduled',
  ENCODER_PART_SORTED = 'encoder-part-sorted',
  ENCODER_PART_SKIPPED = 'encoder-part-skipped',
  // Phase 5: Buffer status for pending jets
  BUFFER_STATUS_UPDATE = 'buffer-status-update',
  // Phase 7: Encoder calibration responses
  ENCODER_RESET_COMPLETE = 'encoder-reset-complete',
  CALIBRATION_POINT_RECORDED = 'calibration-point-recorded',
  // Phase 8: Travel time calibration
  /** Travel time calibration status update */
  TRAVEL_TIME_CALIBRATION_STATUS = 'travel-time-calibration-status',
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
  /** Phase 7: Reset encoder position to zero */
  [FrontToBackEvents.RESET_ENCODER]: void;
  /** Phase 7: Record current encoder position as camera calibration point */
  [FrontToBackEvents.RECORD_CAMERA_POSITION]: void;
  /** Record jet position as encoder tick offset from camera left edge */
  [FrontToBackEvents.RECORD_JET_POSITION]: {
    /** Sorter index (0-3) to record jet position for */
    sorter: number;
    /** Encoder tick offset from camera left edge to this jet */
    offsetFromLeftEdge: number;
  };
  /** Record camera width in encoder ticks for pixel-to-tick translation */
  [FrontToBackEvents.RECORD_CAMERA_WIDTH]: {
    /** Camera view width in encoder ticks (from left edge to right edge) */
    widthInTicks: number;
    /** Optional: Camera resolution width in pixels (auto-synced from video capture) */
    cameraWidthPixels?: number;
  };
  /** Save all calibration data at once (batched save on calibration end) */
  [FrontToBackEvents.SAVE_CALIBRATION_DATA]: {
    /** Camera view width in encoder ticks */
    cameraWidthInTicks: number;
    /** Optional: Camera resolution width in pixels */
    cameraWidthPixels?: number;
    /** Encoder tick offsets from camera left edge to each jet [0-3] */
    jetEncoderOffsets: [number, number, number, number];
  };
  /** Phase 8: Start travel time calibration (no payload needed) */
  [FrontToBackEvents.START_TRAVEL_TIME_CALIBRATION]: void;
  [BackToFrontEvents.INIT_HARDWARE_SUCCESS]: { success: boolean };
  [BackToFrontEvents.SORT_PART_SUCCESS]: { success: boolean };
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
  /** Phase 7: Encoder reset completed confirmation */
  [BackToFrontEvents.ENCODER_RESET_COMPLETE]: {
    /** Whether the reset was successful */
    success: boolean;
    /** New encoder position (should be 0) */
    position: number;
  };
  /** Phase 7: Calibration point recorded confirmation */
  [BackToFrontEvents.CALIBRATION_POINT_RECORDED]: {
    /** Type of calibration point recorded */
    type: 'camera' | 'cameraWidth' | 'jet';
    /** Encoder position that was recorded */
    position: number;
    /** Sorter index (only for jet calibration) */
    sorter?: number;
    /** Whether the calibration was saved successfully */
    success: boolean;
  };
  /** Phase 8: Travel time calibration status response */
  [BackToFrontEvents.TRAVEL_TIME_CALIBRATION_STATUS]: {
    /** Overall calibration status */
    status: 'started' | 'complete' | 'partial_failure' | 'error';
    /** Error message if status is 'error' (e.g., sorters not homed) */
    error?: string;
    /** Results per sorter; present for complete, partial_failure, or error (all failed) */
    results?: {
      sorter: number;
      success: boolean;
      error?: string;
    }[];
  };
}
