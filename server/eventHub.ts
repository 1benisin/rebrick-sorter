// server/eventHub.ts

import { EventEmitter } from 'events';

export const FrontToBackEvents = {
  INIT_HARDWARE: 'init-hardware',
  CLEAR_HARDWARE_ACTIONS: 'reset-hardware',
  CONVEYOR_ON_OFF: 'conveyor-on-off',
  MOVE_SORTER: 'move-sorter',
  FIRE_JET: 'fire-jet',
  HOME_SORTER: 'home-sorter',
  SORT_PART: 'sort-part',
  LOG_PART_QUEUE: 'log-part-queue',
  LOG_SPEED_QUEUE: 'log-speed-queue',
  ABC_TEST: 'abc',
};
export const BackToFrontEvents = {
  INIT_HARDWARE_SUCCESS: 'init-hardware-success',
  SORT_PART_SUCCESS: 'sort-part-success',
  CONVEYOR_SPEED_UPDATE: 'conveyor-speed-update',
  LOG_PART_QUEUE_SUCCESS: 'log-part-queue-success',
  LOG_SPEED_QUEUE_SUCCESS: 'log-speed-queue-success',
  ABC_TEST: 'abc',
};

export const AllEvents = {
  ...FrontToBackEvents,
  ...BackToFrontEvents,
} as const;

export type AllEventsType = (typeof AllEvents)[keyof typeof AllEvents];

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

  emitEvent(event: AllEventsType, data: any): void {
    this.emit(event, data);
  }

  onEvent(event: AllEventsType, listener: (...args: any[]) => void): void {
    this.on(event, listener);
  }

  offListener(event: AllEventsType, listener: (...args: any[]) => void): void {
    console.log(`Removing listener from ${event} event`);
    this.removeListener(event, listener);
  }

  offEvent(event: AllEventsType): void {
    console.log(`Removing all listeners from ${event} event`);
    this.removeAllListeners(event);
  }

  offAllEvents(): void {
    console.log(`Removing all listeners from all events`);
    Object.values(AllEvents).forEach((event) => {
      this.removeAllListeners(event);
    });
  }
}

export const eventHub = new EventHub();
