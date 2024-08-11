"use strict";
// types/sortPart.dto.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortPartSchema = void 0;
const zod_1 = require("zod");
exports.sortPartSchema = zod_1.z.object({
    partId: zod_1.z.string(),
    initialTime: zod_1.z.number(),
    initialPosition: zod_1.z.number(),
    bin: zod_1.z.number(),
    sorter: zod_1.z.number(),
});
