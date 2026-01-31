# Post-Refactor Fixes Plan

## Overview

This plan addresses issues identified during the code review after implementing the Constant Speed Simplification refactor. The issues range from critical startup validation to cleanup and edge case handling.

**Goal:** Increase code robustness, prevent edge case failures, and reduce remaining code entropy.

---

## Issue Summary

| Priority | Issue | File(s) | Effort |
|----------|-------|---------|--------|
| 🔴 Critical | Sorting can start before encoder updates arrive | VideoCaptureService.ts | Small |
| 🟡 Medium | DetectionPairGroups memory growth | SorterService.ts | Small |
| 🟡 Medium | No server-side DTO validation | SystemCoordinator.ts | Small |
| 🟡 Medium | Jet fired matching could mismatch | ConveyorManager.ts | Small |
| 🟢 Low | Legacy deprecated code still present | PositionTranslator.ts | Small |
| 🟢 Low | jetEncoderOffsets schema allows wrong length | settings.type.ts | Small |
| 🟠 Edge Case | Arduino buffer full handling | ConveyorManager.ts | Medium |
| 🟠 Edge Case | Sorter reconnection during sorting | SorterStateManager.ts, ConveyorManager.ts | Medium |

---

## Phase 1: Critical Fixes

### Task 1.1: Block Sorting Until Encoder Data Available

**Problem:** At frontend startup, `encoderPosition` is 0 until the first server update arrives. If sorting starts immediately, all detections will have `encoderAtDetection: 0`, causing incorrect jet positions.

**File:** `lib/services/VideoCaptureService.ts`

**Current Code (lines 122-134):**
```typescript
try {
  // CRITICAL: Read encoder position BEFORE any async operations to minimize timing skew.
  // The encoder position should represent where the conveyor was when we initiated capture.
  const encoderAtCapture = sortProcessStore.getState().encoderPosition;
  const captureTime = Date.now();

  // Optional: warn if encoder data seems stale (no updates in last 2 seconds)
  const encoderTimestamp = sortProcessStore.getState().encoderTimestamp;
  if (encoderTimestamp > 0 && captureTime - encoderTimestamp > 2000) {
    console.warn(
      `[VIDEO_CAPTURE] Encoder data may be stale - last update was ${captureTime - encoderTimestamp}ms ago`,
    );
  }
```

**Replace with:**
```typescript
try {
  // Get encoder state
  const { encoderPosition, encoderTimestamp } = sortProcessStore.getState();
  const captureTime = Date.now();

  // CRITICAL: Block capture if no encoder data has been received yet
  // This prevents sorting with encoderAtDetection=0 which causes incorrect jet positions
  if (encoderTimestamp === 0) {
    const message = 'Cannot capture: no encoder data received from server yet. Waiting for encoder updates.';
    console.warn(`[VIDEO_CAPTURE] ${message}`);
    throw new Error(message);
  }

  // Warn if encoder data seems stale (no updates in last 2 seconds)
  // This could indicate Arduino disconnection or communication issues
  if (captureTime - encoderTimestamp > 2000) {
    console.warn(
      `[VIDEO_CAPTURE] Encoder data may be stale - last update was ${captureTime - encoderTimestamp}ms ago`,
    );
  }

  const encoderAtCapture = encoderPosition;
```

**Why this works:**
- `encoderTimestamp` starts at 0 and is only set when the first `ENCODER_POSITION_UPDATE` arrives
- This prevents sorting from starting before the conveyor/encoder system is ready
- The error will propagate up to `SorterService.runProcess()` which catches errors and logs them

**Validation:**
- [ ] Start sorting before encoder updates arrive → should see warning and not crash
- [ ] Start sorting after encoder updates arrive → should work normally
- [ ] Check that error is caught gracefully in SorterService.runProcess()

---

## Phase 2: Medium Priority Fixes

### Task 2.1: Add DetectionPairGroups Cleanup

**Problem:** The internal `detectionPairGroups` array grows continuously. Groups are marked `offScreen` but never removed, causing memory growth over long sessions.

**File:** `lib/services/SorterService.ts`

**Step 1: Add cleanup method after line 267 (after markOffscreenDetections):**

```typescript
/**
 * Removes detection groups that are off-screen AND have been classified.
 * These groups are no longer needed for matching or classification.
 * Called after markOffscreenDetections() to prevent memory growth.
 */
private cleanupCompletedGroups(): void {
  const beforeCount = this.detectionPairGroups.length;
  
  // Keep groups that are:
  // 1. Not off-screen yet (still tracking), OR
  // 2. Off-screen but not classified yet (waiting for classification to complete)
  this.detectionPairGroups = this.detectionPairGroups.filter(
    (group) => !group.offScreen || !group.classificationResult
  );
  
  const removedCount = beforeCount - this.detectionPairGroups.length;
  if (removedCount > 0) {
    console.log(`[SORTER_SERVICE] Cleaned up ${removedCount} completed detection groups`);
  }
}
```

**Step 2: Call cleanup in runProcess() (around line 291):**

**Current:**
```typescript
// mark offscreen detections
this.markOffscreenDetections();
```

**After:**
```typescript
// mark offscreen detections
this.markOffscreenDetections();

// cleanup completed groups to prevent memory growth
this.cleanupCompletedGroups();
```

**Validation:**
- [ ] Run sorting for extended period, monitor memory usage
- [ ] Verify detection groups are cleaned up (check console logs)
- [ ] Verify active groups are not prematurely removed

---

### Task 2.2: Add Server-Side DTO Validation

**Problem:** The server doesn't validate incoming `SortPartDto` with the zod schema, risking runtime errors from malformed data.

**File:** `server/SystemCoordinator.ts`

**Step 1: Add import at top of file (around line 9):**

```typescript
import { SortPartDto, sortPartSchema } from '../types/sortPart.dto';
```

**Note:** `SortPartDto` is already imported, just need to add `sortPartSchema`.

**Step 2: Update handleSortPart method (lines 122-158):**

**Current:**
```typescript
private async handleSortPart(data: SortPartDto): Promise<void> {
  try {
    const settings = this.settingsManager.getSettings();
    if (!settings) {
      console.error('Settings not available, skipping part.');
      return;
    }

    // Validate encoderAtDetection is present
    if (data.encoderAtDetection === undefined || data.encoderAtDetection === null) {
```

**Replace with:**
```typescript
private async handleSortPart(rawData: unknown): Promise<void> {
  try {
    // Validate incoming data against schema
    const parseResult = sortPartSchema.safeParse(rawData);
    if (!parseResult.success) {
      console.error('[SORT] Invalid SORT_PART data:', parseResult.error.format());
      // Try to extract partId for skip notification, fall back to 'unknown'
      const partId = (rawData as any)?.partId ?? 'unknown';
      const sorter = (rawData as any)?.sorter ?? 0;
      const bin = (rawData as any)?.bin ?? 0;
      this.socketManager.emitEncoderPartSkipped(partId, 'Invalid data format', sorter, bin);
      return;
    }
    const data = parseResult.data;

    const settings = this.settingsManager.getSettings();
    if (!settings) {
      console.error('Settings not available, skipping part.');
      return;
    }

    // encoderAtDetection is now guaranteed by schema validation
    // but keep explicit check for extra safety and clear error message
    if (data.encoderAtDetection === undefined || data.encoderAtDetection === null) {
```

**Step 3: Update SocketManagerConfig interface (server/components/SocketManager.ts line 8):**

**Current:**
```typescript
export interface SocketManagerConfig extends ComponentConfig {
  onSortPart: (data: SortPartDto) => void;
```

**Replace with:**
```typescript
export interface SocketManagerConfig extends ComponentConfig {
  onSortPart: (data: unknown) => void;
```

**Validation:**
- [ ] Send malformed SORT_PART message → should log error and emit skip
- [ ] Send valid SORT_PART message → should process normally
- [ ] TypeScript compilation passes

---

### Task 2.3: Improve Jet Fired Matching

**Problem:** When multiple parts are queued for the same jet, matching by jet number alone could mismatch if commands get reordered.

**File:** `server/components/ConveyorManager.ts`

**Current (lines 289-309):**
```typescript
private handleJetFired(jet: number, position: number): void {
  console.log(`\x1b[32m[ENCODER] Jet ${jet} fired at encoder position ${position}\x1b[0m`);

  // Find the part in the encoder queue that matches this jet and hasn't been sorted yet
  const part = this.encoderPartQueue.find((p) => p.jet === jet && p.status !== 'sorted');

  if (part) {
```

**Replace with:**
```typescript
private handleJetFired(jet: number, position: number): void {
  console.log(`\x1b[32m[ENCODER] Jet ${jet} fired at encoder position ${position}\x1b[0m`);

  // Position tolerance for matching (accounts for timing differences)
  const POSITION_MATCH_TOLERANCE = 50;

  // Find the part in the encoder queue that matches this jet, position, and hasn't been sorted yet
  // Primary match: jet number + position within tolerance
  let part = this.encoderPartQueue.find(
    (p) =>
      p.jet === jet &&
      p.status !== 'sorted' &&
      Math.abs(p.jetPosition - position) <= POSITION_MATCH_TOLERANCE,
  );

  // Fallback: if no position match, find by jet number only (backwards compatibility)
  // This handles cases where Arduino position tracking drifts
  if (!part) {
    part = this.encoderPartQueue.find((p) => p.jet === jet && p.status !== 'sorted');
    if (part) {
      console.warn(
        `[JET_FIRED] Position mismatch for jet ${jet}: expected ${part.jetPosition}, actual ${position}. ` +
          `Delta: ${Math.abs(part.jetPosition - position)} ticks. Using fallback match.`,
      );
    }
  }

  if (part) {
```

**Validation:**
- [ ] Fire jet at expected position → should match correctly
- [ ] Fire jet at slightly different position → should match with warning
- [ ] Fire jet with no matching part → should log warning (existing behavior)

---

## Phase 3: Low Priority Fixes

### Task 3.1: Remove Legacy Deprecated Code

**Problem:** Deprecated methods in PositionTranslator add to codebase entropy without being used.

**File:** `server/components/PositionTranslator.ts`

**Remove the following methods:**

1. **Remove `pixelToEncoderPosition()` (lines 59-88)** - Uses old cameraEncoderOffset/countsPerPixel system
2. **Remove `getEncoderPositionAtTime()` (lines 114-143)** - No longer used since frontend provides encoder directly
3. **Remove `calculateJetPosition()` (lines 156-163)** - Superseded by calculateJetTriggerEncoder

**After removal, the file should contain only:**
- `constructor()`
- `getCalibration()`
- `MAX_BACKWARD_INTERPOLATION_MS` constant (can also be removed if not used)
- `calculateJetTriggerEncoder()` - the active method
- `isCalibrated()`
- `calculateRequiredByPosition()`
- `getJetLeadCounts()`
- `getFallTimeInCounts()`

**Validation:**
- [ ] `npx tsc --noEmit` passes
- [ ] Sorting still works correctly
- [ ] No runtime errors referencing removed methods

---

### Task 3.2: Enforce jetEncoderOffsets Array Length

**Problem:** The schema allows any length array for `jetEncoderOffsets`, but code assumes exactly 4 elements.

**File:** `types/settings.type.ts`

**Current (line 39):**
```typescript
jetEncoderOffsets: z.array(z.coerce.number()).default([0, 0, 0, 0]),
```

**Replace with:**
```typescript
/**
 * Encoder tick distance from camera LEFT EDGE to each air jet.
 * Array indices 0-3 correspond to Jets A-D (sorters 0-3).
 * Uses tuple to enforce exactly 4 elements.
 */
jetEncoderOffsets: z
  .tuple([z.coerce.number(), z.coerce.number(), z.coerce.number(), z.coerce.number()])
  .default([0, 0, 0, 0]),
```

**Also update the type annotation if TypeScript complains:**

The type `PositionCalibrationType` will automatically infer the correct tuple type from the schema.

**Validation:**
- [ ] `npx tsc --noEmit` passes
- [ ] Settings with 4 jet offsets parse correctly
- [ ] Settings with wrong number of offsets fail validation (test in console)

---

## Phase 4: Edge Case Handling

### Task 4.1: Handle Arduino Buffer Full

**Problem:** When Arduino jet buffer is full, commands are lost but parts aren't marked as skipped.

**File:** `server/components/ConveyorManager.ts`

**Current (lines 229-232):**
```typescript
} else if (data.includes('Error: Jet buffer full')) {
  // Arduino buffer is full - log warning
  console.error('\x1b[31m[ENCODER] Arduino jet buffer full - commands may be lost\x1b[0m');
  // Could emit event to frontend to display warning
}
```

**Replace with:**
```typescript
} else if (data.includes('Error: Jet buffer full')) {
  // Arduino buffer is full - commands are being lost
  console.error('\x1b[31m[ENCODER] Arduino jet buffer full - marking pending parts as skipped\x1b[0m');

  // Mark all parts that haven't had their jet command sent as skipped
  // These parts won't be sorted because we can't queue their jet commands
  const skippedParts = this.encoderPartQueue.filter((p) => !p.jetCommandSent && p.status !== 'skipped');

  for (const part of skippedParts) {
    part.status = 'skipped';
    this.socketManager.emitEncoderPartSkipped(
      part.partId,
      'Arduino jet buffer full',
      part.sorter,
      part.bin,
    );
    console.warn(`[ENCODER] Skipped part ${part.partId} due to buffer full`);
  }

  // Remove skipped parts from queue
  this.encoderPartQueue = this.encoderPartQueue.filter((p) => p.status !== 'skipped');

  // Also notify frontend about buffer status
  this.socketManager.emitBufferStatusUpdate(16, 16); // Full buffer
}
```

**Validation:**
- [ ] Simulate buffer full (or test with real hardware overload)
- [ ] Verify parts are marked as skipped
- [ ] Verify frontend receives skip notifications
- [ ] Verify queue is cleaned up

---

### Task 4.2: Handle Sorter Reconnection During Sorting

**Problem:** When a sorter reconnects, scheduled moves are cleared but parts in the encoder queue for that sorter still have jets scheduled to fire. The sorter may be at the wrong position.

**File 1:** `server/components/ConveyorManager.ts`

**Add new method after `clearEncoderPartQueue()` (around line 454):**

```typescript
/**
 * Skips all encoder parts targeting a specific sorter.
 * Called when a sorter disconnects/reconnects and its state is unknown.
 * @param sorterNum - Sorter index (0-3)
 * @param reason - Reason for skipping (for logging)
 */
public skipPartsForSorter(sorterNum: number, reason: string): void {
  const affectedParts = this.encoderPartQueue.filter(
    (p) => p.sorter === sorterNum && p.status !== 'sorted' && p.status !== 'skipped',
  );

  for (const part of affectedParts) {
    part.status = 'skipped';
    this.socketManager.emitEncoderPartSkipped(part.partId, reason, part.sorter, part.bin);
    console.warn(`[ENCODER] Skipped part ${part.partId} for sorter ${sorterNum}: ${reason}`);
  }

  // Remove skipped parts from queue
  this.encoderPartQueue = this.encoderPartQueue.filter((p) => p.status !== 'skipped');

  console.log(`[ENCODER] Skipped ${affectedParts.length} parts for sorter ${sorterNum}`);
}
```

**File 2:** `server/components/SorterStateManager.ts`

**Update `handleSorterReconnect()` (around line 255-288):**

**Current:**
```typescript
private handleSorterReconnect(sorterNum: number): void {
  const state = this.sorterStates.get(sorterNum);
  if (!state) {
    console.warn(`[SORTER_STATE] Reconnect event for unknown sorter ${sorterNum}`);
    return;
  }

  console.log(`[SORTER_STATE] Sorter ${sorterNum} reconnected, resetting state`);

  // After reconnect, sorter position is unknown until MC: received
  // Clear any in-flight move state
  state.isMoving = false;
  state.targetBin = null;

  // Clear scheduled moves as they may now be invalid
  // (the sorter may have reset and trigger positions may be in the past)
  const clearedMoveCount = state.scheduledMoves.length;
  state.scheduledMoves = [];

  if (clearedMoveCount > 0) {
    console.warn(
      `[SORTER_STATE] Cleared ${clearedMoveCount} scheduled moves for sorter ${sorterNum} after reconnect`,
    );
  }

  // Emit update to frontend
  this.socketManager.emitSorterStateUpdate(sorterNum, {
```

**Add after clearing scheduled moves (before "Emit update to frontend"):**

```typescript
  if (clearedMoveCount > 0) {
    console.warn(
      `[SORTER_STATE] Cleared ${clearedMoveCount} scheduled moves for sorter ${sorterNum} after reconnect`,
    );
  }

  // Skip any parts in the encoder queue for this sorter
  // Their jets may fire but the sorter position is unknown
  this.conveyorManager.skipPartsForSorter(sorterNum, 'Sorter reconnected - position unknown');

  // Emit update to frontend
```

**Note:** This creates a dependency from SorterStateManager to ConveyorManager. The dependency already exists (via constructor), so this is safe.

**Validation:**
- [ ] Disconnect/reconnect a sorter during sorting
- [ ] Verify parts for that sorter are skipped
- [ ] Verify other sorters continue working
- [ ] Verify no jets fire for skipped parts (or if they do, verify sorter state is safe)

---

## Phase 5: Validation & Testing

### Task 5.1: Integration Testing Checklist

After implementing all fixes, verify:

- [ ] **Startup Flow:**
  - Start server and frontend
  - Wait for encoder updates to arrive (check console)
  - Start sorting → should work
  
- [ ] **Startup Without Encoder:**
  - Start sorting before encoder updates arrive
  - Should see warning, not crash
  - Should start working once encoder updates arrive

- [ ] **Long Running Session:**
  - Run sorting for 10+ minutes
  - Monitor memory usage (should be stable)
  - Check that detection groups are being cleaned up

- [ ] **Invalid Data:**
  - Send malformed SORT_PART via socket (using browser devtools)
  - Should log error and emit skip, not crash

- [ ] **Sorter Reconnection:**
  - Unplug sorter USB during sorting
  - Reconnect
  - Verify parts for that sorter are skipped
  - Verify sorting continues for other sorters

- [ ] **TypeScript Compilation:**
  - Run `npx tsc --noEmit`
  - Should pass with no errors

---

## Files Changed Summary

| Phase | File | Changes |
|-------|------|---------|
| 1.1 | lib/services/VideoCaptureService.ts | Block capture if no encoder data |
| 2.1 | lib/services/SorterService.ts | Add cleanupCompletedGroups() method |
| 2.2 | server/SystemCoordinator.ts | Add DTO validation with zod |
| 2.2 | server/components/SocketManager.ts | Update onSortPart type signature |
| 2.3 | server/components/ConveyorManager.ts | Improve jet fired matching |
| 3.1 | server/components/PositionTranslator.ts | Remove deprecated methods |
| 3.2 | types/settings.type.ts | Use tuple for jetEncoderOffsets |
| 4.1 | server/components/ConveyorManager.ts | Handle buffer full |
| 4.2 | server/components/ConveyorManager.ts | Add skipPartsForSorter() |
| 4.2 | server/components/SorterStateManager.ts | Call skipPartsForSorter on reconnect |

**Total: 7 files modified**

---

## Implementation Order

Recommended order to minimize risk:

1. **Phase 1** (Critical) - Do first, test immediately
2. **Phase 3** (Low priority) - Quick wins, low risk
3. **Phase 2** (Medium) - More complex, test thoroughly
4. **Phase 4** (Edge cases) - Test with hardware if possible
5. **Phase 5** (Validation) - Final verification

---

## Rollback Plan

Each phase can be rolled back independently via git:

```bash
# If issues arise, revert specific commits
git revert <commit-hash>
```

For critical issues, revert to before this plan:
```bash
git revert --no-commit HEAD~N..HEAD && git commit -m "Revert post-refactor fixes"
```

---

## Success Criteria

- [ ] No runtime errors during normal sorting operation
- [ ] Memory stable during long sorting sessions (>30 min)
- [ ] Graceful handling of startup before encoder ready
- [ ] Graceful handling of sorter disconnection
- [ ] TypeScript compilation passes
- [ ] All edge cases logged clearly (not silent failures)
