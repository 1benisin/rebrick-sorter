import { Socket } from 'socket.io';
import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { SettingsType } from '../../types/settings.type';
import { BackToFrontEvents, FrontToBackEvents } from '../../types/socketMessage.type';
import { Part } from '../../types/part.type';
import { SortPartDto } from '../../types/sortPart.dto';

export interface SocketManagerConfig extends ComponentConfig {
  onSortPart: (data: SortPartDto) => void;
  onConveyorOnOff: () => void;
  onHomeSorter: (data: { sorter: number }) => void;
  onMoveSorter: (data: { sorter: number; bin: number }) => void;
  onFireJet: (data: { sorter: number }) => void;
  onListSerialPorts: () => Promise<void>;
  onResetSortProcess: () => void;
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

    this.socket.on('disconnect', () => {
      this.setStatus(ComponentStatus.UNINITIALIZED);
    });
  }

  // Backend to Frontend events
  public emitSettingsUpdate(settings: SettingsType): void {
    this.socket?.emit(BackToFrontEvents.SETTINGS_UPDATE, settings);
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

  public emitPartSorted(part: Part): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.PART_SORTED, { part });
  }

  public emitPartSkipped(part: Part): void {
    if (!this.socket) return;
    this.socket.emit(BackToFrontEvents.PART_SKIPPED, { part });
  }

  public emitConveyorSpeedUpdate(speed: number): void {
    this.socket?.emit(BackToFrontEvents.CONVEYOR_SPEED_UPDATE, speed);
  }

  public emitSortPartSuccess(success: boolean): void {
    this.socket?.emit(BackToFrontEvents.SORT_PART_SUCCESS, { success });
  }

  public emitListSerialPortsSuccess(ports: string[]): void {
    this.socket?.emit(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, ports);
  }

  protected notifyStatusChange(): void {
    this.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
