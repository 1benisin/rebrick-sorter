export enum ServiceState {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  ERROR = 'ERROR',
  RECONFIGURING = 'RECONFIGURING',
}

export interface ServiceConfig {
  name: string;
  dependencies?: string[];
  priority?: number; // For initialization order
}

export interface Service {
  initialize(): Promise<void>;
  reinitialize(): Promise<void>;
  deinitialize(): Promise<void>;
  getState(): ServiceState;
  getError(): string | null;
  getName(): string;
}

export abstract class BaseService implements Service {
  protected state: ServiceState = ServiceState.UNINITIALIZED;
  protected error: string | null = null;
  protected config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
  }

  public abstract initialize(): Promise<void>;
  public abstract reinitialize(): Promise<void>;
  public abstract deinitialize(): Promise<void>;

  public getState(): ServiceState {
    return this.state;
  }

  public getError(): string | null {
    return this.error;
  }

  public getName(): string {
    return this.config.name;
  }

  protected setState(state: ServiceState): void {
    this.state = state;
    this.notifyStateChange();
  }

  protected setError(error: string | null): void {
    this.error = error;
    this.setState(ServiceState.ERROR);
  }

  protected abstract notifyStateChange(): void;
}
