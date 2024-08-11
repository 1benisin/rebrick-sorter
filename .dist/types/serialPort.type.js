"use strict";
// types/serialPort.type.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.serialPortSchema = exports.serialPortNameEnumSchema = exports.serialPortNamesArray = exports.serialPortNames = void 0;
const zod_1 = require("zod");
// sorter names must come first because they are referenced by index else where
exports.serialPortNames = {
    0: 'sorter_A',
    1: 'sorter_B',
    2: 'conveyor_jets',
    3: 'hopper_feeder',
    sorter_A: 'sorter_A',
    sorter_B: 'sorter_B',
    conveyor_jets: 'conveyor_jets',
    hopper_feeder: 'hopper_feeder',
};
exports.serialPortNamesArray = ['sorter_A', 'sorter_B', 'conveyor_jets', 'hopper_feeder'];
// make a z enum from the keys of serialPortNames
exports.serialPortNameEnumSchema = zod_1.z.enum(exports.serialPortNamesArray);
exports.serialPortSchema = zod_1.z.object({
    name: exports.serialPortNameEnumSchema,
    path: zod_1.z.string(),
});
