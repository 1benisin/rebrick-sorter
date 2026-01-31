// lib/services/SocketService.ts

import { io, Socket } from 'socket.io-client';
import { Service, ServiceState } from './Service.interface';
import { AllEvents, EventPayloads } from '@/types/socketMessage.type';
import { sortProcessStore } from '@/stores/sortProcessStore';

class SocketService implements Service {
  private socket: Socket | null = null;
  private state: ServiceState = ServiceState.UNINITIALIZED;
  private transport: string = 'N/A';

  public async init(): Promise<void> {
    this.state = ServiceState.INITIALIZING;
    try {
      this.socket = io('http://localhost:3000', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      return new Promise<void>((resolve, reject) => {
        this.socket?.on('connect', () => {
          this.setupEventListeners();
          console.log('Socket connected');
          this.state = ServiceState.INITIALIZED;
          resolve();
        });

        this.socket?.on('disconnect', () => {
          console.log('Socket disconnected');
          this.state = ServiceState.FAILED;
        });
        this.socket?.on('connect_error', (error: Error) => {
          console.log('Socket connect error:', error);
          this.state = ServiceState.FAILED;
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error initializing socket:', error);
      this.state = ServiceState.FAILED;
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on(AllEvents.LIST_SERIAL_PORTS_SUCCESS, (ports: string[]) => {
      sortProcessStore.getState().setSerialPorts(ports);
    });

    // Encoder position tracking
    this.socket.on(
      AllEvents.ENCODER_POSITION_UPDATE,
      (data: { position: number; timestamp: number; velocity: number }) => {
        sortProcessStore.getState().setEncoderState(data.position, data.timestamp, data.velocity);
      },
    );

    // Buffer status for pending jets (Phase 5)
    this.socket.on(AllEvents.BUFFER_STATUS_UPDATE, (data: { count: number; capacity: number }) => {
      sortProcessStore.getState().setBufferStatus(data.count, data.capacity);
    });

    // Encoder part lifecycle events (Phase 4)
    this.socket.on(AllEvents.ENCODER_PART_SCHEDULED, (data: EventPayloads[typeof AllEvents.ENCODER_PART_SCHEDULED]) => {
      console.log('[SOCKET] Part scheduled:', data.partId);
      // Store could track scheduled parts if needed
    });

    this.socket.on(AllEvents.ENCODER_PART_SORTED, (data: EventPayloads[typeof AllEvents.ENCODER_PART_SORTED]) => {
      console.log('[SOCKET] Part sorted:', data.partId);
      sortProcessStore.getState().handlePartSorted();
    });

    this.socket.on(AllEvents.ENCODER_PART_SKIPPED, (data: EventPayloads[typeof AllEvents.ENCODER_PART_SKIPPED]) => {
      console.log('[SOCKET] Part skipped:', data.partId, data.reason);
      // Could add alertStore notification for skipped parts
    });
  }

  public getStatus(): ServiceState {
    return this.state;
  }

  public getTransport(): string {
    return this.transport;
  }

  public emit<K extends keyof EventPayloads>(event: K, data: EventPayloads[K]): void {
    if (this.socket && this.state === ServiceState.INITIALIZED) {
      console.log('Emitting event: ', event, data);
      this.socket.emit(event, data);
    } else {
      console.error('Cannot emit event: socket is not initialized');
    }
  }

  public on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      console.error('Cannot add event listener: socket is not initialized');
    }
  }

  public off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    } else {
      console.error('Cannot remove event listener: socket is not initialized');
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }
}

const socketService = new SocketService();
export default socketService;
