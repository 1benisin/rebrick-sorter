// sorter-controller.ts

export enum SorterEvent {
  START = "start",
  STOP = "stop",
}

type EventHandler = () => void;

export default class SorterController {
  private static instance: SorterController;
  private isRunning: boolean;
  private eventHandlers: Record<string, EventHandler[]>;

  private constructor() {
    this.isRunning = false;
    this.eventHandlers = {};
  }

  public static getInstance(): SorterController {
    if (!SorterController.instance) {
      SorterController.instance = new SorterController();
    }
    return SorterController.instance;
  }

  private async mockProcess() {
    console.log("Process running...");
    // Simulate some work with a delay
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check if we should continue running after the delay
    if (this.isRunning) {
      this.runProcess();
    }
  }

  public isProcessRunning(): boolean {
    return this.isRunning;
  }

  private runProcess() {
    // Immediate invocation of mockProcess if we're running
    this.mockProcess();
  }

  public start() {
    if (!this.isRunning) {
      this.isRunning = true;
      console.log("Process started.");
      this.emit(SorterEvent.START);
      this.runProcess();
    }
  }

  public stop() {
    if (this.isRunning) {
      this.isRunning = false;
      this.emit(SorterEvent.STOP);
      console.log("Process stopped.");
    }
  }

  public subscribe(event: SorterEvent, handler: EventHandler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  public unsubscribe(event: SorterEvent, handler: EventHandler) {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      this.eventHandlers[event] = handlers.filter((h) => h !== handler);
    }
  }

  private emit(event: string) {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      handlers.forEach((handler) => handler());
    }
  }
}
