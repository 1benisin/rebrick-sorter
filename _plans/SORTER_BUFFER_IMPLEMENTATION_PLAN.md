# Sorter Rest Buffer Implementation Plan

**Goal:** Implement the intended skip/schedule behavior where a sorter must "rest" for a configurable buffer period (in encoder counts) after completing a move before starting the next move. This ensures the previous part has time to fully fall out of the tube.

**Based on:** `_docs/SORTER_TIMING_RESEARCH.md` Section 1 (Intended Behavior)

---

## Critical Background: What Was Removed

The old time-based system (before PR #113) had **two** fall time constants in `SystemCoordinator.ts`:

```typescript
export const FALL_TIME_SHORTEST = 1200; // ms - when sorter MUST be in position
export const FALL_TIME_LONGEST = 2000;  // ms - when sorter is "free" for next part
```

The old scheduling formula was:
```typescript
moveTime = jetTime + FALL_TIME_SHORTEST - travelTimeFromPreviousBin;
moveFinishedTime = jetTime + FALL_TIME_LONGEST;
arrivalTimeDelay = sorterPreviousPart 
  ? Math.max(sorterPreviousPart.moveFinishedTime - moveTime, 0) 
  : 0;
```

**Key insight:** The 800ms difference (2000 - 1200) was effectively a **buffer** between when the sorter arrived and when it was considered "free" for the next part.

The new encoder-based system only has `fallTimeInCounts` (equivalent to FALL_TIME_SHORTEST). The FALL_TIME_LONGEST equivalent is **missing** and needs to be added as `sorterRestBufferInCounts`.

---

## Verified: What Still Exists

✅ **Travel time lookup table** - `SorterManager.travelTimes[][]` with `getTravelTimeBetweenBins()` (lines 64-138)  
✅ **Lead counts calculation** - `SorterStateManager.calculateLeadCounts()` using travel times  
✅ **Position-based scheduling** - `ConveyorManager` with `EncoderPart` queue  
✅ **Sorter state tracking** - `SorterStateManager` with `getFreePosition()`, `canSorterReachBin()`  
✅ **Fall time setting** - `positionCalibration.fallTimeInCounts` (default 24)

---

## Phase 1: Add Buffer Setting to Settings Schema

**File:** `types/settings.type.ts`

**Location:** After `fallTimeInCounts` in `positionCalibrationSchema` (around line 44-46)

**Add:**
```typescript
/**
 * Encoder counts the sorter must remain idle after a move completes
 * before starting the next move. This buffer ensures the previous part
 * has time to fully fall out of the tube before the sorter moves again.
 * 
 * This is the encoder-based equivalent of (FALL_TIME_LONGEST - FALL_TIME_SHORTEST)
 * from the old time-based system (800ms ≈ 16-40 counts depending on velocity).
 * 
 * Default: 20 counts (reasonable starting point; tune based on testing)
 */
sorterRestBufferInCounts: z.coerce.number().default(20),
```

**Rationale:** 
- Default 20 counts provides a reasonable buffer at typical velocities
- At 0.02 counts/ms (DEFAULT_VELOCITY), 20 counts ≈ 1000ms
- At 0.05 counts/ms (faster conveyor), 20 counts ≈ 400ms
- User can tune via UI

---

## Phase 2: Update Test Mocks

**File:** `__tests__/mocks/mockSettingsManager.ts`

**Update `defaultPositionCalibration` (around line 9-17):**
```typescript
export const defaultPositionCalibration: PositionCalibrationType = {
  cameraEncoderOffset: 0,
  countsPerPixel: 1,
  cameraWidthInTicks: 150,
  cameraWidthPixels: 1280,
  jetEncoderOffsets: [500, 600, 700, 800] as [number, number, number, number],
  fallTimeInCounts: 24,
  jetLeadCounts: 100,
  sorterRestBufferInCounts: 20, // ADD THIS
};
```

**Update `uncalibratedPositionCalibration` (around line 23-31):**
```typescript
export const uncalibratedPositionCalibration: PositionCalibrationType = {
  cameraEncoderOffset: 0,
  countsPerPixel: 1,
  cameraWidthInTicks: 0,
  cameraWidthPixels: 1280,
  jetEncoderOffsets: [0, 0, 0, 0] as [number, number, number, number],
  fallTimeInCounts: 24,
  jetLeadCounts: 100,
  sorterRestBufferInCounts: 0, // ADD THIS (0 for backward compat)
};
```

---

## Phase 3: Update SorterStateManager - Core Logic

**File:** `server/components/SorterStateManager.ts`

### 3.1: Add `getBufferCounts()` helper method

**Location:** After `getEffectiveVelocity()` (around line 425)

**Add:**
```typescript
/**
 * Gets the configured sorter rest buffer in encoder counts.
 * This is the minimum encoder counts the sorter must remain idle
 * after completing a move before starting the next move.
 * 
 * Equivalent to (FALL_TIME_LONGEST - FALL_TIME_SHORTEST) from the
 * old time-based system, converted to encoder counts.
 */
private getBufferCounts(): number {
  const settings = this.settingsManager.getSettings();
  return settings?.positionCalibration?.sorterRestBufferInCounts ?? 0;
}
```

### 3.2: Add `getFreePositionAfterBuffer()` method

**Location:** After `getFreePosition()` (around line 414)

**Add:**
```typescript
/**
 * Gets the encoder position at which the sorter will be free to start a new move,
 * INCLUDING the required buffer time after the previous move completes.
 * 
 * This is the authoritative "free after buffer" position used for scheduling.
 * A move command should NOT be sent before this position.
 * 
 * Formula: freeAfterBuffer = rawFreePosition + bufferCounts
 */
private getFreePositionAfterBuffer(sorterNum: number): number {
  const rawFreePosition = this.getFreePosition(sorterNum);
  const bufferCounts = this.getBufferCounts();
  return rawFreePosition + bufferCounts;
}
```

### 3.3: Update `canSorterReachBin()` method

**File:** `server/components/SorterStateManager.ts`

**Location:** Lines 464-522

**Replace the entire method with:**
```typescript
/**
 * Checks if a sorter can reach a target bin by a required encoder position.
 * 
 * Skip rule (from SORTER_TIMING_RESEARCH.md Section 1.2):
 *   Skip when earliestMoveStartPosition < freeAfterBufferPosition
 *   i.e., (requiredByPosition - leadCounts) < (freePosition + bufferCounts)
 * 
 * Schedule rule (from SORTER_TIMING_RESEARCH.md Section 1.3):
 *   triggerPosition = max(freeAfterBufferPosition, requiredByPosition - leadCounts)
 *   This is "just-in-time": move as late as possible while respecting buffer.
 *
 * @param sorterNum - Sorter index (0-3)
 * @param targetBin - Desired bin number
 * @param requiredByPosition - Encoder position by which the sorter must arrive
 * @returns Availability result with trigger position or reason for unavailability
 */
public canSorterReachBin(sorterNum: number, targetBin: number, requiredByPosition: number): AvailabilityResult {
  const state = this.sorterStates.get(sorterNum);
  if (!state) {
    return {
      available: false,
      triggerPosition: 0,
      reason: `Invalid sorter number: ${sorterNum}`,
    };
  }

  // 1. Get free position AFTER buffer (this is when the sorter can START moving)
  const freePositionAfterBuffer = this.getFreePositionAfterBuffer(sorterNum);

  // 2. Determine the effective "from bin"
  const fromBin = this.getEffectiveFromBin(sorterNum);

  // 3. If already at target bin, no movement needed
  //    Still respect buffer - return freePositionAfterBuffer for consistency
  if (fromBin === targetBin) {
    return {
      available: true,
      triggerPosition: freePositionAfterBuffer,
    };
  }

  // 4. Calculate lead counts (travel time in encoder counts)
  const leadCounts = this.calculateLeadCounts(sorterNum, fromBin, targetBin);

  // 5. Calculate the EARLIEST position at which the sorter MUST start moving
  //    to arrive by requiredByPosition
  const earliestMoveStartPosition = requiredByPosition - leadCounts;

  // 6. SKIP RULE: If the earliest we NEED to start moving is BEFORE
  //    when we're allowed to start (after buffer), we cannot make it.
  if (earliestMoveStartPosition < freePositionAfterBuffer) {
    const bufferCounts = this.getBufferCounts();
    return {
      available: false,
      triggerPosition: 0,
      reason:
        `Sorter ${sorterNum} cannot reach bin ${targetBin} in time. ` +
        `Must start by position ${earliestMoveStartPosition} but sorter free (after buffer) at ${freePositionAfterBuffer}. ` +
        `Lead counts: ${leadCounts}, buffer: ${bufferCounts}`,
    };
  }

  // 7. SCHEDULE RULE: Trigger position is "just-in-time" - as late as possible
  //    while still respecting the buffer and arriving on time.
  //    triggerPosition = max(freeAfterBuffer, earliestMoveStart)
  const triggerPosition = Math.max(freePositionAfterBuffer, earliestMoveStartPosition);

  return {
    available: true,
    triggerPosition,
  };
}
```

---

## Phase 4: Create Unit Tests for Buffer Logic

**File:** Create `__tests__/unit/SorterStateManager.test.ts`

```typescript
// __tests__/unit/SorterStateManager.test.ts

import { SorterStateManager } from '../../server/components/SorterStateManager';
import { createMockSettingsManager } from '../mocks/mockSettingsManager';
import { createMockConveyorManager } from '../mocks/mockConveyorManager';

// Mock dependencies
const createMockDeviceManager = () => ({
  registerDeviceDataCallback: jest.fn(),
  unregisterDeviceDataCallback: jest.fn(),
  registerDeviceReconnectCallback: jest.fn(),
  unregisterDeviceReconnectCallback: jest.fn(),
});

const createMockSocketManager = () => ({
  emitSorterStateUpdate: jest.fn(),
  emitComponentStatusUpdate: jest.fn(),
});

const createMockSorterManager = (travelTime: number = 500) => ({
  getTravelTimeBetweenBins: jest.fn().mockReturnValue(travelTime),
  getCurrentPosition: jest.fn().mockReturnValue(1),
});

describe('SorterStateManager', () => {
  describe('canSorterReachBin with buffer', () => {
    
    it('skips when earliest move start is before free + buffer', async () => {
      // Setup: buffer = 50, freePosition = 1000 (idle sorter)
      // Part requires sorter by position 1100, travel time = 100ms
      // At velocity 0.8 counts/ms, lead counts = 80
      // earliestMoveStart = 1100 - 80 = 1020
      // freeAfterBuffer = 1000 + 50 = 1050
      // 1020 < 1050 → SKIP
      
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 50 });
      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100); // 100ms travel time
      
      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });
      
      await stateManager.initialize();
      
      const result = stateManager.canSorterReachBin(0, 5, 1100);
      
      expect(result.available).toBe(false);
      expect(result.reason).toContain('cannot reach bin');
      expect(result.reason).toContain('buffer');
    });

    it('schedules when earliest move start is after free + buffer', async () => {
      // Setup: buffer = 20, freePosition = 1000 (idle sorter)
      // Part requires sorter by position 1200, travel time = 100ms
      // At velocity 0.8 counts/ms, lead counts = 80
      // earliestMoveStart = 1200 - 80 = 1120
      // freeAfterBuffer = 1000 + 20 = 1020
      // 1120 >= 1020 → SCHEDULE
      // triggerPosition = max(1020, 1120) = 1120 (just-in-time)
      
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 20 });
      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);
      
      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });
      
      await stateManager.initialize();
      
      const result = stateManager.canSorterReachBin(0, 5, 1200);
      
      expect(result.available).toBe(true);
      expect(result.triggerPosition).toBe(1120); // Just-in-time
    });

    it('uses buffer as trigger when timing is tight', async () => {
      // When freeAfterBuffer > earliestMoveStart, use freeAfterBuffer
      // Setup: buffer = 100, freePosition = 1000
      // Part requires by 1150, lead counts = 80
      // earliestMoveStart = 1150 - 80 = 1070
      // freeAfterBuffer = 1000 + 100 = 1100
      // 1070 < 1100, but arrivalPosition = 1100 + 80 = 1180 > 1150 → SKIP!
      
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 100 });
      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);
      
      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });
      
      await stateManager.initialize();
      
      const result = stateManager.canSorterReachBin(0, 5, 1150);
      
      expect(result.available).toBe(false);
    });

    it('handles zero buffer (backward compatibility)', async () => {
      // buffer = 0 should behave like current implementation
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 0 });
      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(100);
      
      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });
      
      await stateManager.initialize();
      
      // With buffer=0: earliestMoveStart = 1080 - 80 = 1000
      // freeAfterBuffer = 1000 + 0 = 1000
      // 1000 >= 1000 → SCHEDULE
      const result = stateManager.canSorterReachBin(0, 5, 1080);
      
      expect(result.available).toBe(true);
      expect(result.triggerPosition).toBe(1000);
    });

    it('respects buffer even when no movement needed (same bin)', async () => {
      // If sorter is already at target bin, triggerPosition should
      // still be >= freePositionAfterBuffer
      const mockSettings = createMockSettingsManager({ sorterRestBufferInCounts: 50 });
      const mockConveyor = createMockConveyorManager({ position: 1000, velocity: 0.8 });
      const mockSorter = createMockSorterManager(0); // 0 travel time = same bin
      
      const stateManager = new SorterStateManager({
        deviceManager: createMockDeviceManager() as any,
        socketManager: createMockSocketManager() as any,
        settingsManager: mockSettings as any,
        sorterManager: mockSorter as any,
        conveyorManager: mockConveyor as any,
      });
      
      await stateManager.initialize();
      
      // Already at bin 1, no movement needed
      // But triggerPosition should still respect buffer
      const result = stateManager.canSorterReachBin(0, 1, 1100);
      
      expect(result.available).toBe(true);
      expect(result.triggerPosition).toBe(1050); // 1000 + 50 buffer
    });
  });
});
```

---

## Phase 5: Update ConveyorManager Mock for Tests

**File:** `__tests__/mocks/mockConveyorManager.ts`

**Ensure the mock supports velocity and position:**
```typescript
export const createMockConveyorManager = (options?: { position?: number; velocity?: number }) => ({
  getInterpolatedPosition: jest.fn().mockReturnValue(options?.position ?? 0),
  getEncoderVelocity: jest.fn().mockReturnValue(options?.velocity ?? 0.02),
  getCurrentEncoderPosition: jest.fn().mockReturnValue(options?.position ?? 0),
  skipPartsForSorter: jest.fn(),
});
```

---

## Phase 6: Update Logging (Optional Enhancement)

**File:** `server/components/SorterStateManager.ts`

Update `scheduleMove()` (around line 564) to include buffer in logs:
```typescript
console.log(
  `[SORTER_STATE] Scheduled move for sorter ${sorterNum}: ` +
    `part ${partId} -> bin ${bin} at position ${triggerPosition} ` +
    `(expected complete at ${expectedCompletePosition}, buffer: ${this.getBufferCounts()})`,
);
```

---

## Phase 7: Optional UI for Buffer Configuration

**File:** `components/SettingsForm.tsx`

Add input field for `sorterRestBufferInCounts` in the position calibration section (around the `fallTimeInCounts` input):

```tsx
<FormField
  control={form.control}
  name="positionCalibration.sorterRestBufferInCounts"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Sorter Rest Buffer (counts)</FormLabel>
      <FormControl>
        <Input type="number" {...field} />
      </FormControl>
      <FormDescription>
        Encoder counts sorter must wait after move completes before starting next move
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## Implementation Order

```
1. types/settings.type.ts                          (no dependencies)
2. __tests__/mocks/mockSettingsManager.ts          (depends on 1)
3. __tests__/mocks/mockConveyorManager.ts          (no dependencies)
4. server/components/SorterStateManager.ts
   - Add getBufferCounts()                         (depends on 1)
   - Add getFreePositionAfterBuffer()              (depends on getBufferCounts)
   - Update canSorterReachBin()                    (depends on getFreePositionAfterBuffer)
5. __tests__/unit/SorterStateManager.test.ts       (depends on 2, 3, 4)
6. Update logging in SorterStateManager            (depends on 4)
7. components/SettingsForm.tsx                     (optional, depends on 1)
```

---

## Testing Strategy

### Unit Tests
- Test `canSorterReachBin` with various buffer values
- Test edge cases: zero buffer, large buffer, same-bin moves

### Manual Testing
1. Set `sorterRestBufferInCounts: 0` - verify behavior matches current (no regressions)
2. Set `sorterRestBufferInCounts: 30` - verify parts are skipped when timing is tight
3. Monitor logs for correct trigger positions and skip reasons
4. Test rapid consecutive parts to the same sorter

### Integration Testing
- Run sort process with buffer enabled
- Verify skipped parts emit `encoder-part-skipped` events with correct reason
- Verify scheduled parts arrive on time

---

## Backward Compatibility

- Default `sorterRestBufferInCounts: 20` provides reasonable buffer out of the box
- Setting to `0` restores pre-buffer behavior for debugging
- Existing calibration data is unaffected
- `getFreePosition()` remains unchanged for any code that needs raw position

---

## Recommended Default Value

Based on the old system:
- `FALL_TIME_LONGEST - FALL_TIME_SHORTEST = 800ms`
- At typical velocity (0.02 counts/ms): 800ms × 0.02 = 16 counts
- At faster velocity (0.05 counts/ms): 800ms × 0.05 = 40 counts

**Recommendation:** Start with `sorterRestBufferInCounts: 20` (middle ground) and tune based on testing.

---

## Files Modified Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `types/settings.type.ts` | Add field | `sorterRestBufferInCounts` in `positionCalibrationSchema` |
| `__tests__/mocks/mockSettingsManager.ts` | Update | Add buffer to default/uncalibrated calibration |
| `__tests__/mocks/mockConveyorManager.ts` | Update | Support velocity/position options |
| `server/components/SorterStateManager.ts` | Add method | `getBufferCounts()` |
| `server/components/SorterStateManager.ts` | Add method | `getFreePositionAfterBuffer()` |
| `server/components/SorterStateManager.ts` | Update method | `canSorterReachBin()` - new skip/schedule logic |
| `__tests__/unit/SorterStateManager.test.ts` | New file | Unit tests for buffer logic |
| `components/SettingsForm.tsx` | Optional | UI for buffer setting |

---

## Verification Checklist for Coding Agent

Before implementing, verify:
- [ ] `SorterManager.travelTimes` lookup table exists and `getTravelTimeBetweenBins()` works
- [ ] `SorterStateManager.calculateLeadCounts()` calls `getTravelTimeBetweenBins()`
- [ ] `SorterStateManager.getFreePosition()` returns raw position without buffer
- [ ] `positionCalibration.fallTimeInCounts` exists (default 24)
- [ ] No existing `sorterRestBufferInCounts` or similar field

After implementing, verify:
- [ ] Unit tests pass
- [ ] Setting buffer to 0 restores original behavior
- [ ] Skip events include buffer in reason message
- [ ] Trigger positions respect buffer constraint
