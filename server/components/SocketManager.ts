import { Socket } from 'socket.io';
import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { SettingsType } from '../../types/settings.type';
import { BackToFrontEvents, FrontToBackEvents } from '../../types/socketMessage.type';
import { Part, EncoderPart } from '../../types/part.type';
import { SortPartDto } from '../../types/sortPart.dto';

export interface SocketManagerConfig extends ComponentConfig {
  onSortPart: (data: SortPartDto) => void;
  onConveyorOnOff: () => void;
  onHomeSorter: (data: { sorter: number }) => void;
  onMoveSorter: (data: { sorter: number; bin: number }) => void;
  onFireJet: (data: { sorter: number }) => void;
  onListSerialPorts: () => Promise<void>;
  onResetSortProcess: () => void;
  onUpdateFeederSettings: (data: {
    vibrationSpeed: number;
    stopDelay: number;
    pauseTime: number;
    shortMoveTime: number;
    longMoveTime: number;
    hopperCycleInterval: number;
    hopperCycleSteps: number;
  }) => void;
  // Phase 7: Encoder calibration handlers
  onResetEncoder: () => void;
  onRecordCameraPosition: () => void;
  onRecordCameraWidth: (data: { widthInTicks: number; cameraWidthPixels?: number }) => void;
  onRecordJetPosition: (data: { sorter: number; offsetFromLeftEdge: number }) => void;
  onSaveCalibrationData: (data: {
    cameraWidthInTicks: number;
    cameraWidthPixels?: number;
    jetEncoderOffsets: [number, number, number, number];
  }) => Promise<void>;
}

export class SocketManager extends BaseComponent {
  private socket: Socket | null = null;
  private handlers: SocketManagerConfig;

  constructor(handlers: SocketManagerConfig) {
    super('SocketManager');
    this.handlers = handlers;
  }

  public setSocket(socket: Socket): void {
    this.socket = socket;
    this.setupSocketListeners();
  }

  public async initialize(): Promise<void> {
    this.setStatus(ComponentStatus.READY);
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Frontend to Backend events
    this.socket.on(FrontToBackEvents.SORT_PART, this.handlers.onSortPart);
    this.socket.on(FrontToBackEvents.CONVEYOR_ON_OFF, this.handlers.onConveyorOnOff);
    this.socket.on(FrontToBackEvents.HOME_SORTER, this.handlers.onHomeSorter);
    this.socket.on(FrontToBackEvents.MOVE_SORTER, this.handlers.onMoveSorter);
    this.socket.on(FrontToBackEvents.FIRE_JET, this.handlers.onFireJet);
    this.socket.on(FrontToBackEvents.LIST_SERIAL_PORTS, this.handlers.onListSerialPorts);
    this.socket.on(FrontToBackEvents.RESET_SORT_PROCESS, this.handlers.onResetSortProcess);
    this.socket.on(FrontToBackEvents.UPDATE_FEEDER_SETTINGS, this.handlers.onUpdateFeederSettings);

    // Phase 7: Encoder calibration events
    this.socket.on(FrontToBackEvents.RESET_ENCODER, this.handlers.onResetEncoder);
    this.socket.on(FrontToBackEvents.RECORD_CAMERA_POSITION, this.handlers.onRecordCameraPosition);
    this.socket.on(FrontToBackEvents.RECORD_CAMERA_WIDTH, this.handlers.onRecordCameraWidth);
    this.socket.on(FrontToBackEvents.RECORD_JET_POSITION, this.handlers.onRecordJetPosition);
    this.socket.on(FrontToBackEvents.SAVE_CALIBRATION_DATA, this.handlers.onSaveCalibrationData);

    this.socket.on('disconnect', () => {
      this.setStatus(ComponentStatus.UNINITIALIZED);
    });
  }

  public emitComponentStatusUpdate(componentName: string, status: ComponentStatus, error: string | null): void {
    this.socket?.emit(BackToFrontEvents.COMPONENT_STATUS_UPDATE, {
      componentName,
      status,
      error,
    });
  }

  public emitSorterPositionUpdate(sorter: number, bin: number): void {
    this.socket?.emit(BackToFrontEvents.SORTER_POSITION_UPDATE, { sorter, bin });
  }

  public emitSorterStateUpdate(
    sorter: number,
    state: {
      currentBin: number;
      isMoving: boolean;
      targetBin?: number | null;
      scheduledMoveCount?: number;
      encoderPosition: number;
    },
  ): void {
    this.socket?.emit(BackToFrontEvents.SORTER_STATE_UPDATE, {
      sorter,
      currentBin: state.currentBin,
      isMoving: state.isMoving,
      targetBin: state.targetBin ?? null,
      scheduledMoveCount: state.scheduledMoveCount ?? 0,
      encoderPosition: state.encoderPosition,
    });
  }

  public emitPartSorted(part: Part): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.PART_SORTED, { part });
  }

  public emitPartSkipped(part: Part): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.PART_SKIPPED, { part });
  }

  // --- Encoder-Based Part Events (Phase 4) ---

  /**
   * Emits when an encoder-based part is scheduled.
   */
  public emitEncoderPartScheduled(part: EncoderPart): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.ENCODER_PART_SCHEDULED, {
      partId: part.partId,
      jetPosition: part.jetPosition,
      moveTriggerPosition: part.moveTriggerPosition,
      sorter: part.sorter,
      bin: part.bin,
    });
  }

  /**
   * Emits when an encoder-based part is sorted (jet fired successfully).
   */
  public emitEncoderPartSorted(part: EncoderPart): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.ENCODER_PART_SORTED, {
      partId: part.partId,
      jetPosition: part.jetPosition,
      sorter: part.sorter,
      bin: part.bin,
    });
  }

  /**
   * Emits when an encoder-based part is skipped.
   */
  public emitEncoderPartSkipped(partId: string, reason: string, sorter: number, bin: number): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.ENCODER_PART_SKIPPED, {
      partId,
      reason,
      sorter,
      bin,
    });
  }

  public emitConveyorSpeedUpdate(speed: number): void {
    this.socket?.emit(BackToFrontEvents.CONVEYOR_SPEED_UPDATE, speed);
  }

  public emitEncoderPositionUpdate(position: number, timestamp: number, velocity: number): void {
    this.socket?.emit(BackToFrontEvents.ENCODER_POSITION_UPDATE, {
      position,
      timestamp,
      velocity,
    });
  }

  /**
   * Emits the current buffer status for pending jets on the Arduino.
   * @param count - Number of active pending jets in the buffer
   * @param capacity - Total capacity of the pending jets buffer
   */
  public emitBufferStatusUpdate(count: number, capacity: number): void {
    this.socket?.emit(BackToFrontEvents.BUFFER_STATUS_UPDATE, { count, capacity });
  }

  public emitSortPartSuccess(success: boolean): void {
    this.socket?.emit(BackToFrontEvents.SORT_PART_SUCCESS, { success });
  }

  public emitListSerialPortsSuccess(ports: string[]): void {
    this.socket?.emit(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, ports);
  }

  // --- Phase 7: Encoder Calibration Events ---

  /**
   * Emits when encoder reset is complete.
   */
  public emitEncoderResetComplete(success: boolean, position: number): void {
    this.socket?.emit(BackToFrontEvents.ENCODER_RESET_COMPLETE, { success, position });
  }

  /**
   * Emits when a calibration point has been recorded.
   */
  public emitCalibrationPointRecorded(
    type: 'camera' | 'cameraWidth' | 'jet',
    position: number,
    success: boolean,
    sorter?: number,
  ): void {
    this.socket?.emit(BackToFrontEvents.CALIBRATION_POINT_RECORDED, {
      type,
      position,
      success,
      sorter,
    });
  }

  protected notifyStatusChange(): void {
    this.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
