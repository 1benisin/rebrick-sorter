"use strict";
// server.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const next_1 = __importDefault(require("next"));
const socket_io_1 = require("socket.io");
const eventHub_1 = require("./server/eventHub");
const hardwareController_1 = __importDefault(require("./server/hardwareController"));
const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const app = (0, next_1.default)({ dev, hostname, port });
const handler = app.getRequestHandler();
const listeners = {};
let currentSocket = null;
app.prepare().then(() => __awaiter(void 0, void 0, void 0, function* () {
    const httpServer = (0, http_1.createServer)(handler);
    const io = new socket_io_1.Server(httpServer);
    const cleanupOldListeners = () => {
        Object.values(eventHub_1.BackToFrontEvents).forEach((event) => {
            if (listeners[`B->F:${event}`]) {
                eventHub_1.eventHub.offListener(event, listeners[`B->F:${event}`]);
                delete listeners[`B->F:${event}`];
            }
        });
    };
    const setupSocketListeners = (socket) => {
        console.log('New client connected');
        // Disconnect the previous socket if it exists
        if (currentSocket) {
            console.log('Disconnecting previous client');
            currentSocket.disconnect(true);
        }
        // Set the current socket to the new connection
        currentSocket = socket;
        // Clean up old listeners before setting up new ones
        cleanupOldListeners();
        // Events from Backend to Frontend
        Object.values(eventHub_1.BackToFrontEvents).forEach((event) => {
            listeners[`B->F:${event}`] = (data) => {
                console.log(`---B->F: ${event}`, data);
                if (currentSocket) {
                    currentSocket.emit(event, data);
                }
            };
            eventHub_1.eventHub.onEvent(event, listeners[`B->F:${event}`]);
        });
        Object.values(eventHub_1.FrontToBackEvents).forEach((event) => {
            // Events from Frontend to Backend
            socket.on(event, (data) => {
                console.log(`---F->B: ${event}`, data);
                eventHub_1.eventHub.emitEvent(event, data);
            });
        });
        socket.on(eventHub_1.FrontToBackEvents.INIT_HARDWARE, (data) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`---F->B: ${eventHub_1.FrontToBackEvents.INIT_HARDWARE}`, data);
            try {
                yield hardwareController_1.default.init(data);
                // The success event will be emitted by the hardwareController itself
            }
            catch (error) {
                console.error('---Failed to initialize hardware:', error);
            }
        }));
        // Handle client disconnection
        socket.on('disconnect', () => {
            console.log('Client disconnected');
            if (currentSocket === socket) {
                currentSocket = null;
                cleanupOldListeners();
            }
        });
    };
    io.on('connection', setupSocketListeners);
    httpServer
        .once('error', (err) => {
        console.error(err);
        process.exit(1);
    })
        .listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
}));
