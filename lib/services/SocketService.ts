// lib/services/SocketService.ts


import { io, Socket } from 'socket.io-client';
import { Service, ServiceState } from './Service.interface';
import { SocketAction } from '@/types/socketMessage.type';
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
        reconnectionDelay: 1000
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

    this.socket.on(SocketAction.LOG_PART_QUEUE_SUCCESS, (data: any) => {
      console.log('Part Queue: ', data);
    });

    this.socket.on(SocketAction.LOG_SPEED_QUEUE_SUCCESS, (data: any) => {
      console.log('Speed Queue: ', data);
    });

    this.socket.on(SocketAction.INIT_HARDWARE_SUCCESS, (success: boolean) => {
      console.log('INIT_HARDWARE_SUCCESS result: ', success);
    });

    this.socket.on(SocketAction.CONVEYOR_SPEED_UPDATE, (speed: number) => {
      console.log('CONVEYOR_SPEED_UPDATE: ', speed);
      sortProcessStore.getState().setConveyorSpeed(speed);
    });
  }

  public getStatus(): ServiceState {
    return this.state;
  }

  public getTransport(): string {
    return this.transport;
  }

  public emit(event: string, data?: any): void {
    if (this.socket && this.state === ServiceState.INITIALIZED) {
      !!data ? this.socket.emit(event, data) : this.socket.emit(event);
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
