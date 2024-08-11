"use strict";
// server/eventHub.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventHub = exports.AllEvents = exports.BackToFrontEvents = exports.FrontToBackEvents = void 0;
const events_1 = require("events");
exports.FrontToBackEvents = {
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
exports.BackToFrontEvents = {
    INIT_HARDWARE_SUCCESS: 'init-hardware-success',
    SORT_PART_SUCCESS: 'sort-part-success',
    CONVEYOR_SPEED_UPDATE: 'conveyor-speed-update',
    LOG_PART_QUEUE_SUCCESS: 'log-part-queue-success',
    LOG_SPEED_QUEUE_SUCCESS: 'log-speed-queue-success',
    ABC_TEST: 'abc',
};
exports.AllEvents = Object.assign(Object.assign({}, exports.FrontToBackEvents), exports.BackToFrontEvents);
class EventHub extends events_1.EventEmitter {
    constructor() {
        super();
        // this.setMaxListeners(0); // Allow unlimited listeners
        // Register EventEmitter special event listeners
        this.on('newListener', (event, listener) => {
            console.log(`New listener added to ${String(event)} event`);
        });
        this.on('removeListener', (event, listener) => {
            console.log(`Listener removed from ${String(event)} event`);
        });
        this.on('error', (err) => {
            console.error('Attention! There was an error:', err);
        });
    }
    emitEvent(event, data) {
        this.emit(event, data);
    }
    onEvent(event, listener) {
        this.on(event, listener);
    }
    offListener(event, listener) {
        console.log(`Removing listener from ${event} event`);
        this.removeListener(event, listener);
    }
    offEvent(event) {
        console.log(`Removing all listeners from ${event} event`);
        this.removeAllListeners(event);
    }
    offAllEvents() {
        console.log(`Removing all listeners from all events`);
        Object.values(exports.AllEvents).forEach((event) => {
            this.removeAllListeners(event);
        });
    }
}
exports.eventHub = new EventHub();
