"use strict";
// types/hardwareInit.dto.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.hardwareInitSchema = void 0;
const zod_1 = require("zod");
const serialPort_type_1 = require("./serialPort.type");
exports.hardwareInitSchema = zod_1.z.object({
    defaultConveyorSpeed: zod_1.z.number(), // pixels per second
    serialPorts: zod_1.z.array(serialPort_type_1.serialPortSchema),
    sorterDimensions: zod_1.z.array(zod_1.z.object({
        gridWidth: zod_1.z.number(),
        gridHeight: zod_1.z.number(),
    })),
    jetPositions: zod_1.z.array(zod_1.z.number()),
});
