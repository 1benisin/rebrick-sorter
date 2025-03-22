export enum ComponentStatus {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  ERROR = 'ERROR',
  RECONFIGURING = 'RECONFIGURING',
}

export interface ComponentConfig {
  // Base configuration interface that all components will extend
}

export abstract class BaseComponent {
  protected status: ComponentStatus = ComponentStatus.UNINITIALIZED;
  protected error: string | null = null;

  constructor(protected name: string) {}

  public getStatus(): ComponentStatus {
    return this.status;
  }

  public getError(): string | null {
    return this.error;
  }

  public getName(): string {
    return this.name;
  }

  public abstract initialize(config: ComponentConfig): Promise<void>;
  public abstract reinitialize(config: ComponentConfig): Promise<void>;
  public abstract deinitialize(): Promise<void>;

  protected setStatus(status: ComponentStatus): void {
    this.status = status;
    this.notifyStatusChange();
  }

  protected setError(error: string | null): void {
    this.error = error;
    this.setStatus(ComponentStatus.ERROR);
  }

  protected abstract notifyStatusChange(): void;
}
