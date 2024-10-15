// server/eventHub.ts

import { EventEmitter } from 'events';
import { AllEvents, AllEventsType, EventPayloads } from '../types/socketMessage.type';

class EventHub extends EventEmitter {
  constructor() {
    super();
    // this.setMaxListeners(0); // Allow unlimited listeners

    // Register EventEmitter special event listeners
    this.on('newListener', (event: string | symbol, listener: (...args: any[]) => void) => {
      console.log(`New listener added to ${String(event)} event`);
    });

    this.on('removeListener', (event: string | symbol, listener: (...args: any[]) => void) => {
      console.log(`Listener removed from ${String(event)} event`);
    });

    this.on('error', (err: Error) => {
      console.error('Attention! There was an error:', err);
    });
  }

  emitEvent<K extends keyof EventPayloads>(event: K, data: EventPayloads[K]): void {
    this.emit(event, data);
  }

  onEvent<K extends keyof EventPayloads>(event: K, listener: (data: EventPayloads[K]) => void): void {
    this.on(event, listener);
  }

  offListener<K extends keyof EventPayloads>(event: K, listener: (data: EventPayloads[K]) => void): void {
    this.removeListener(event, listener);
  }

  offEvent<K extends keyof EventPayloads>(event: K): void {
    this.removeAllListeners(event);
  }

  offAllEvents(): void {
    (Object.values(AllEvents) as Array<keyof EventPayloads>).forEach((event) => {
      this.removeAllListeners(event);
    });
  }
}

const eventHub = new EventHub();
export default eventHub;
