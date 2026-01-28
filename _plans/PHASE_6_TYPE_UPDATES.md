# Phase 6: Type Updates - Implementation Plan

## Overview

This document provides a detailed implementation plan for Phase 6 of the Encoder-Based Position Tracking Refactor. Phase 6 focuses on updating TypeScript types to fully support the encoder-based scheduling system.

**Parent Document:** `_plans/ENCODER_REFACTOR_PLANNING.md`

**Dependencies:** Phases 1-5 (most type infrastructure already exists from those phases)

---

## Current State Analysis

### Summary Table

| Task                      | File                            | Status      | Action Required      |
| ------------------------- | ------------------------------- | ----------- | -------------------- |
| 6.1 Socket Message Types  | `types/socketMessage.type.ts`   | ✅ Complete | Verify only          |
| 6.2 Arduino Command Types | `types/arduinoCommands.type.ts` | ⚠️ Partial  | Add encoder commands |
| 6.3 Part Type             | `types/part.type.ts`            | ✅ Complete | Verify only          |
| 6.4 SortPart DTO          | `types/sortPart.dto.ts`         | ⚠️ Optional | Add JSDoc            |

---

## Task 6.1: Verify Socket Message Types

**File:** `types/socketMessage.type.ts`

**Status:** ✅ COMPLETE - No implementation needed

### Existing Implementation

The following encoder-related types are already implemented:

```typescript
// BackToFrontEvents enum (lines 30-36)
ENCODER_POSITION_UPDATE = 'encoder-position-update',
ENCODER_PART_SCHEDULED = 'encoder-part-scheduled',
ENCODER_PART_SORTED = 'encoder-part-sorted',
ENCODER_PART_SKIPPED = 'encoder-part-skipped',
BUFFER_STATUS_UPDATE = 'buffer-status-update',
SORTER_STATE_UPDATE = 'sorter-state-update',

// EventPayloads interface (lines 92-129)
[BackToFrontEvents.ENCODER_POSITION_UPDATE]: {
  position: number;
  timestamp: number;
  velocity: number;
};
[BackToFrontEvents.ENCODER_PART_SCHEDULED]: {
  partId: string;
  jetPosition: number;
  moveTriggerPosition: number;
  sorter: number;
  bin: number;
};
[BackToFrontEvents.ENCODER_PART_SORTED]: {
  partId: string;
  jetPosition: number;
  sorter: number;
  bin: number;
};
[BackToFrontEvents.ENCODER_PART_SKIPPED]: {
  partId: string;
  reason: string;
  sorter: number;
  bin: number;
};
[BackToFrontEvents.BUFFER_STATUS_UPDATE]: {
  count: number;
  capacity: number;
};
```

### Agent Instructions

1. Read `types/socketMessage.type.ts` to verify the types exist
2. Verify types match usage in:
   - `server/components/SocketManager.ts` (emit methods)
   - `lib/services/SocketService.ts` (event listeners)
3. Run TypeScript compilation to confirm no type errors

### Acceptance Criteria

- [ ] All encoder event types exist in `BackToFrontEvents` enum
- [ ] All event payloads are properly typed in `EventPayloads` interface
- [ ] TypeScript compiles without errors

---

## Task 6.2: Update Arduino Command Types

**File:** `types/arduinoCommands.type.ts`

**Status:** ⚠️ NEEDS IMPLEMENTATION

### Current State

The file contains basic commands but is missing encoder-specific commands:

```typescript
// Current ArduinoCommands object (lines 5-20)
export const ArduinoCommands = {
  RESET: 'r',
  SETUP: 's',
  CONVEYOR_ON_OFF: 'o',
  CONVEYOR_SPEED: 'c',
  FIRE_JET: 'j',
  CENTER_SORTER: 'h',
  MOVE_TO_ORIGIN: 'a',
  MOVE_TO_BIN: 'm',
  HOPPER_ON_OFF: 'b',
  FEEDER_ON_OFF: 'f',
} as const;
```

### Required Changes

#### Step 1: Add Encoder Commands to ArduinoCommands Object

Add the following commands after `FEEDER_ON_OFF`:

```typescript
// Encoder commands (conveyor_jets Arduino)
QUEUE_JET: 'q',              // Queue jet at position: q<jet>,<position>
REQUEST_ENCODER_POSITION: 'e', // Request current encoder position
RESET_ENCODER: 'R',          // Reset encoder to 0 (capital R to avoid conflict)
BUFFER_STATUS: 'B',          // Request buffer status (capital B to avoid conflict)
```

**Note on Command Conflicts:**

- Lowercase `r` is already used for `RESET`
- Lowercase `b` is already used for `HOPPER_ON_OFF`
- Use capital letters `R` and `B` for encoder commands

#### Step 2: Update Zod Union

Add new commands to the `arduinoCommandUnion`:

```typescript
const arduinoCommandUnion = z.union([
  z.literal(ArduinoCommands.RESET),
  z.literal(ArduinoCommands.SETUP),
  z.literal(ArduinoCommands.CONVEYOR_ON_OFF),
  z.literal(ArduinoCommands.CONVEYOR_SPEED),
  z.literal(ArduinoCommands.FIRE_JET),
  z.literal(ArduinoCommands.CENTER_SORTER),
  z.literal(ArduinoCommands.MOVE_TO_ORIGIN),
  z.literal(ArduinoCommands.MOVE_TO_BIN),
  z.literal(ArduinoCommands.HOPPER_ON_OFF),
  z.literal(ArduinoCommands.FEEDER_ON_OFF),
  // Encoder commands
  z.literal(ArduinoCommands.QUEUE_JET),
  z.literal(ArduinoCommands.REQUEST_ENCODER_POSITION),
  z.literal(ArduinoCommands.RESET_ENCODER),
  z.literal(ArduinoCommands.BUFFER_STATUS),
]);
```

#### Step 3: Add Typed Command Literals

Add these type definitions after the schema (around line 45):

```typescript
// ============================================================================
// Encoder Command Types (Phase 6)
// ============================================================================

/**
 * Typed conveyor commands for encoder-based scheduling.
 * Uses template literal types for precise command validation.
 *
 * Commands:
 * - 'o': Toggle conveyor on/off
 * - 'c<rpm>': Set RPM (e.g., 'c55')
 * - 'j<jet>': Fire jet immediately (e.g., 'j2')
 * - 'q<jet>,<pos>': Queue jet at encoder position (e.g., 'q2,14800')
 * - 'e': Request encoder position
 * - 'R': Reset encoder to 0
 * - 'B': Request buffer status
 */
export type ConveyorEncoderCommand =
  | 'o' // Toggle conveyor on/off
  | `c${number}` // Set RPM (e.g., c55)
  | `j${number}` // Fire jet immediately (e.g., j2)
  | `q${number},${number}` // Queue jet at position (e.g., q2,14800)
  | 'e' // Request encoder position
  | 'R' // Reset encoder to 0
  | 'B' // Request buffer status
  | `s,${string}`; // Settings command

/**
 * Arduino response patterns from conveyor Arduino.
 * Used for parsing and type-safe response handling.
 *
 * Responses:
 * - 'Ready': Arduino booted and ready
 * - 'EP:<pos>': Encoder position report
 * - 'JF:<jet>,<pos>': Jet fired confirmation
 * - 'JQ:<jet>,<pos>': Jet queued confirmation
 * - 'BS:<count>,<cap>': Buffer status
 * - 'ER:<pos>': Encoder reset confirmation
 */
export type ConveyorArduinoResponse =
  | 'Ready'
  | `EP:${number}` // Encoder position
  | `JF:${number},${number}` // Jet fired (jet, position)
  | `JQ:${number},${number}` // Jet queued (jet, position)
  | `BS:${number},${number}` // Buffer status (count, capacity)
  | `ER:${number}` // Encoder reset confirmation
  | 'Settings updated';

/**
 * Sorter Arduino commands.
 */
export type SorterCommand =
  | `m${number}` // Move to bin (e.g., m045)
  | 'a' // Home/origin
  | 'h'; // Center

/**
 * Sorter Arduino response patterns.
 */
export type SorterArduinoResponse = 'Ready' | `MC:${number}`; // Move complete (bin)
```

#### Step 4: Add JSDoc Documentation Block

Add this documentation block at the top of the file (after the import):

```typescript
/**
 * Arduino Commands and Response Types
 *
 * This module defines the communication protocol between the server and Arduinos.
 *
 * ## Conveyor/Jets Arduino Commands
 * | Command | Format | Description |
 * |---------|--------|-------------|
 * | Toggle | `o` | Toggle conveyor motor on/off |
 * | Set RPM | `c<rpm>` | Set conveyor speed (e.g., `c55`) |
 * | Fire Jet | `j<jet>` | Fire jet immediately for testing |
 * | Queue Jet | `q<jet>,<pos>` | Queue jet to fire at encoder position |
 * | Get Position | `e` | Request current encoder position |
 * | Reset Encoder | `R` | Reset encoder position to 0 |
 * | Buffer Status | `B` | Request pending jets buffer status |
 * | Settings | `s,<params>` | Initialize settings |
 *
 * ## Conveyor/Jets Arduino Responses
 * | Response | Format | Description |
 * |----------|--------|-------------|
 * | Ready | `Ready` | Arduino booted and ready |
 * | Position | `EP:<pos>` | Encoder position report |
 * | Jet Fired | `JF:<jet>,<pos>` | Jet fired confirmation |
 * | Jet Queued | `JQ:<jet>,<pos>` | Jet queued confirmation |
 * | Buffer Status | `BS:<count>,<cap>` | Buffer status |
 * | Encoder Reset | `ER:<pos>` | Encoder reset confirmation |
 *
 * ## Sorter Arduino Commands
 * | Command | Format | Description |
 * |---------|--------|-------------|
 * | Move | `m<bin>` | Move to bin (e.g., `m045`) |
 * | Home | `a` | Start homing sequence |
 * | Center | `h` | Center sorter |
 *
 * ## Sorter Arduino Responses
 * | Response | Format | Description |
 * |----------|--------|-------------|
 * | Ready | `Ready` | Arduino booted |
 * | Move Complete | `MC:<bin>` | Arrived at bin |
 */
```

### Agent Instructions

1. Read `types/arduinoCommands.type.ts`
2. Add encoder commands to `ArduinoCommands` object
3. Update `arduinoCommandUnion` to include new commands
4. Add typed command and response types
5. Add JSDoc documentation block
6. Verify against `arduino_code/conveyor_jets.cpp` that commands match
7. Run TypeScript compilation

### Verification Commands

```bash
# Check Arduino code for command handlers
grep -n "case 'q'" arduino_code/conveyor_jets.cpp
grep -n "case 'e'" arduino_code/conveyor_jets.cpp
grep -n "case 'r'" arduino_code/conveyor_jets.cpp
grep -n "case 'b'" arduino_code/conveyor_jets.cpp

# Compile TypeScript
npx tsc --noEmit
```

### Acceptance Criteria

- [ ] `ArduinoCommands` object includes `QUEUE_JET`, `REQUEST_ENCODER_POSITION`, `RESET_ENCODER`, `BUFFER_STATUS`
- [ ] `arduinoCommandUnion` includes all new commands
- [ ] `ConveyorEncoderCommand` type is defined with template literals
- [ ] `ConveyorArduinoResponse` type is defined
- [ ] `SorterCommand` and `SorterArduinoResponse` types are defined
- [ ] JSDoc documentation added
- [ ] TypeScript compiles without errors
- [ ] Commands match Arduino code implementation

---

## Task 6.3: Verify Part Type

**File:** `types/part.type.ts`

**Status:** ✅ COMPLETE - No implementation needed

### Existing Implementation

The `EncoderPart` interface is fully implemented:

```typescript
export interface EncoderPart {
  partId: string;
  detectionEncoderPos: number;
  jetPosition: number;
  jet: number;
  sorter: number;
  bin: number;
  moveTriggerPosition: number;
  expectedMoveCompletePosition: number;
  jetCommandSent: boolean;
  moveCommandSent: boolean;
  status: 'scheduled' | 'moving' | 'sorted' | 'skipped';
  detectionTime: number;
  pixelPosition: number;
}
```

### Agent Instructions

1. Read `types/part.type.ts` to verify the interface exists
2. Verify it's used correctly in:
   - `server/components/ConveyorManager.ts`
   - `server/components/SocketManager.ts`
3. Confirm TypeScript compiles without errors

### Acceptance Criteria

- [ ] `EncoderPart` interface exists with all required fields
- [ ] Legacy `Part` interface preserved for backward compatibility
- [ ] Types are imported and used correctly in server components

---

## Task 6.4: Enhance SortPart DTO (Optional)

**File:** `types/sortPart.dto.ts`

**Status:** ⚠️ OPTIONAL - Minor enhancement

### Current State

```typescript
export const sortPartSchema = z.object({
  partId: z.string(),
  initialTime: z.number(),
  initialPosition: z.number(),
  bin: z.number(),
  sorter: z.number(),
});
```

### Recommended Enhancement

Add JSDoc comments for clarity:

```typescript
import { z } from 'zod';

/**
 * Data Transfer Object for sorting a part.
 * Sent from frontend to server when a part is detected and classified.
 *
 * The server uses `initialTime` and `initialPosition` to calculate
 * encoder positions via the PositionTranslator.
 */
export const sortPartSchema = z.object({
  /** Unique identifier for this part */
  partId: z.string(),

  /**
   * Timestamp when part was detected (ms since epoch).
   * Used by server for encoder position interpolation.
   */
  initialTime: z.number(),

  /**
   * Pixel X position in camera frame where part was detected.
   * Server translates this to encoder position using calibration settings.
   */
  initialPosition: z.number(),

  /** Destination bin number determined by classifier */
  bin: z.number(),

  /** Which sorter should handle this part (0-3) */
  sorter: z.number(),
});

export type SortPartDto = z.infer<typeof sortPartSchema>;
```

### Agent Instructions

1. Read `types/sortPart.dto.ts`
2. Add JSDoc comments to schema fields
3. Run TypeScript compilation

### Acceptance Criteria

- [ ] JSDoc comments added to all schema fields
- [ ] TypeScript compiles without errors

---

## Implementation Order

Execute tasks in this order:

1. **Task 6.1** - Verify socket message types (read-only)
2. **Task 6.3** - Verify part type (read-only)
3. **Task 6.2** - Update Arduino command types (main work)
4. **Task 6.4** - Enhance SortPart DTO (optional)
5. **Final Verification** - Run full TypeScript compilation

---

## Verification Checklist

### Pre-Implementation

- [ ] Read all target files to understand current state
- [ ] Check `arduino_code/conveyor_jets.cpp` for actual command characters used

### Post-Implementation

- [ ] Run `npx tsc --noEmit` - no errors
- [ ] Run `yarn build` or `npm run build` - no errors
- [ ] Verify no breaking changes to existing functionality

### Cross-Reference Verification

Verify types are used correctly in these files:

| Type                | Used In                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `BackToFrontEvents` | `server/components/SocketManager.ts`, `lib/services/SocketService.ts`        |
| `EncoderPart`       | `server/components/ConveyorManager.ts`, `server/components/SocketManager.ts` |
| `ArduinoCommands`   | `server/components/ConveyorManager.ts`, `server/components/SorterManager.ts` |
| `SortPartDto`       | `server/SystemCoordinator.ts`, `lib/services/SorterService.ts`               |

---

## Files Modified

| File                            | Change Type                                   |
| ------------------------------- | --------------------------------------------- |
| `types/arduinoCommands.type.ts` | **Modified** - Add encoder commands and types |
| `types/sortPart.dto.ts`         | **Modified** - Add JSDoc (optional)           |
| `types/socketMessage.type.ts`   | Verify only                                   |
| `types/part.type.ts`            | Verify only                                   |

---

## Rollback Plan

If issues arise:

1. Revert `types/arduinoCommands.type.ts` to previous version
2. The new types are additive and don't break existing functionality
3. Existing raw string commands in `ConveyorManager.ts` continue to work

---

## Notes

### Command Character Conflicts

The Arduino uses single-character commands. Current conflicts:

- `r` = `RESET` (general)
- `b` = `HOPPER_ON_OFF`

Solution: Use capital letters for new encoder commands (`R`, `B`). Verify Arduino code handles case sensitivity.

### Template Literal Types

The `ConveyorEncoderCommand` type uses TypeScript template literal types. These provide type safety for commands like `q2,14800` while still allowing the dynamic construction used in `ConveyorManager.ts`:

```typescript
// This works because string is assignable when it matches the pattern
const command = `q${part.jet},${part.jetPosition}`;
```

### Backward Compatibility

- Legacy `Part` interface must remain for time-based scheduling
- Feature flag `useEncoderScheduling` controls which system is active
- All changes are additive, not breaking
