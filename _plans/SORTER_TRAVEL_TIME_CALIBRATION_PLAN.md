# Sorter Travel Time Calibration Plan

## Overview

**Goal:** Replace hardcoded sorter travel time lookup tables with empirically measured values through an automated calibration process.

**Current State:** `SorterManager.travelTimes[sorter][distanceIndex]` contains hardcoded millisecond values for how long it takes each sorter to move a given Euclidean distance (in bin units). These values are used by `getTravelTimeBetweenBins()` → `calculateLeadCounts()` to determine if a sorter can reach a bin in time for an incoming part.

**Target State:** A calibration mode that:
1. Moves each sorter through a sparse set of positions
2. Measures actual travel times via Arduino `MC:` responses
3. Fits a polynomial curve to the measurements
4. Stores coefficients in settings (persists across restarts)
5. Generates the `travelTimes` lookup array from stored coefficients on startup

---

## Target Feature Behavior

### User Flow
1. User navigates to **Settings page** → **Calibration section**
2. User ensures all sorters are homed (at bin 1) — system should verify this
3. User clicks **"Calibrate Travel Times"** button
4. Button shows "Calibrating..." state (disabled during calibration)
5. All 4 sorters run calibration sequence **simultaneously**
6. On completion:
   - Success: Button returns to normal, toast notification "Travel times calibrated successfully"
   - Partial failure: Warning toast "Sorters 0, 2, 3 calibrated. Sorter 1 failed (timeout)"
   - Calibrated values are saved to settings and used immediately

### System Behavior During Calibration
- **Sorting is disabled** — no parts should be processed while calibration runs
- Each sorter executes the calibration move sequence independently
- 15-second timeout per individual move
- Partial results are saved (successful sorters don't depend on failed ones)

### Calibration Move Sequence (Per Sorter)
For a sorter with grid dimension N:

| Step | From | To | Distance (bins) |
|------|------|-----|-----------------|
| 1 | Bin 1 (0,0) | Middle bin (N/2, N/2) | D₁ = (N/2)×√2 |
| 2 | Middle bin | Bin 1 | D₁ (same, for averaging) |
| 3 | Bin 1 | Max bin (N-1, N-1) | D₂ = (N-1)×√2 |

**Data points collected:**
- (0, 0ms) — same bin, no movement (implicit)
- (D₁, average(T₁, T₂)) — middle distance
- (D₂, T₃) — max distance

### Polynomial Curve Fit
With constraint that time(0) = 0, fit a quadratic:

```
time(d) = a×d² + b×d
```

Two unknowns (a, b), two data points (D₁, D₂) → exact solution:

```
T_mid = a×D₁² + b×D₁
T_max = a×D₂² + b×D₂
```

Solving:
```
a = (T_max×D₁ - T_mid×D₂) / (D₂²×D₁ - D₁²×D₂)
b = (T_mid - a×D₁²) / D₁
```

This accounts for stepper acceleration/deceleration curves better than linear interpolation.

### Lookup Table Generation
On startup (or after calibration), generate `travelTimes[sorter][index]` for index 0 to maxIndex:
- maxIndex = `Math.ceil((gridDimension - 1) × √2)`
- For each index i: `travelTimes[sorter][i] = Math.round(a×i² + b×i)`

---

## Technical Design

### New Settings Schema Addition

```typescript
// In types/settings.type.ts

export const TravelTimeCalibrationSchema = z.object({
  a: z.number(),           // Quadratic coefficient
  b: z.number(),           // Linear coefficient  
  calibratedAt: z.string().optional(), // ISO timestamp
  gridDimensionAtCalibration: z.number(), // Grid size when calibrated
});

// Add to SettingsSchema.positionCalibration (or new section):
travelTimeCalibration: z.array(TravelTimeCalibrationSchema).optional(),
```

### SorterManager Changes

```typescript
// server/components/SorterManager.ts

interface CalibrationResult {
  sorter: number;
  success: boolean;
  coefficients?: { a: number; b: number };
  error?: string;
}

class SorterManager {
  // Existing
  private travelTimes: number[][] = [];
  
  // New: calibration state
  private isCalibrating: boolean = false;
  private moveCompleteResolvers: Map<number, (bin: number) => void> = new Map();
  
  // New methods
  public async startCalibration(): Promise<CalibrationResult[]>;
  public isCalibrationInProgress(): boolean;
  private async calibrateSorter(sorter: number): Promise<CalibrationResult>;
  private async timedMove(sorter: number, bin: number, timeoutMs: number): Promise<{ bin: number; timeMs: number }>;
  private waitForMoveComplete(sorter: number, timeoutMs: number): Promise<number>;
  private calculateCoefficients(d1: number, t1: number, d2: number, t2: number): { a: number; b: number };
  private generateTravelTimesFromCoefficients(coefficients: { a: number; b: number }, gridDimension: number): number[];
  
  // Modified
  public async initialize(): Promise<void>; // Load calibration from settings if present
}
```

### MC: Callback Hook for Timing

The existing `SorterStateManager` handles `MC:` messages. For calibration, we need `SorterManager` to also receive these. Options:

**Option A (Recommended):** Add a calibration callback registration in DeviceManager
```typescript
// During calibration, SorterManager registers a callback
this.deviceManager.registerCalibrationCallback(sorterNum, (data) => {
  if (data.match(/^MC:\s*(\d+)$/)) {
    this.moveCompleteResolvers.get(sorterNum)?.(bin);
  }
});
```

**Option B:** SorterManager listens directly via DeviceManager's existing onData mechanism

### Socket Messages

```typescript
// New socket messages in types/socketMessage.type.ts

// Client → Server
interface StartTravelTimeCalibrationMessage {
  type: 'START_TRAVEL_TIME_CALIBRATION';
}

// Server → Client
interface TravelTimeCalibrationStatusMessage {
  type: 'TRAVEL_TIME_CALIBRATION_STATUS';
  status: 'started' | 'complete' | 'partial_failure' | 'error';
  error?: string;  // Error message when status is 'error'
  results?: {
    sorter: number;
    success: boolean;
    error?: string;
  }[];
}
```

### Frontend Components

```typescript
// New component: components/buttons/TravelTimeCalibrationButton.tsx

export function TravelTimeCalibrationButton() {
  const [isCalibrating, setIsCalibrating] = useState(false);
  
  const handleCalibrate = async () => {
    // Check sorters are homed (via socket or store)
    // Emit START_TRAVEL_TIME_CALIBRATION
    // Listen for TRAVEL_TIME_CALIBRATION_STATUS
    // Show toast on completion
  };
  
  return (
    <Button onClick={handleCalibrate} disabled={isCalibrating}>
      {isCalibrating ? 'Calibrating...' : 'Calibrate Travel Times'}
    </Button>
  );
}
```

---

## Implementation Phases

### Phase 1: Settings Schema & Storage
**Files:** `types/settings.type.ts`, `server/components/SettingsManager.ts`

1. Add `TravelTimeCalibrationSchema` to settings schema
2. Add `travelTimeCalibration?: TravelTimeCalibration[]` to positionCalibration (or root)
3. Update settings save/load to handle new field
4. Add default empty array (falls back to hardcoded)

**Verification:**
- [ ] Settings can be saved with calibration data
- [ ] Settings can be loaded with calibration data
- [ ] Missing calibration data doesn't break loading

### Phase 2: SorterManager Calibration Logic
**Files:** `server/components/SorterManager.ts`, `server/components/DeviceManager.ts`

1. Add calibration state tracking (`isCalibrating`, `moveCompleteResolvers`)
2. Implement `waitForMoveComplete(sorter, timeout)` — promise that resolves on MC: or rejects on timeout
3. Implement `timedMove(sorter, bin, timeout)` — send move, await MC:, return timing
4. Implement `calibrateSorter(sorter)`:
   - Calculate middle bin and max bin from gridDimension
   - Execute 3 timed moves
   - Calculate coefficients from measurements
   - Return CalibrationResult
5. Implement `startCalibration()`:
   - Set `isCalibrating = true`
   - Run all 4 calibrations in parallel via `Promise.allSettled`
   - Save successful results to settings
   - Set `isCalibrating = false`
   - Return results array
6. Implement `generateTravelTimesFromCoefficients()` — populate travelTimes array
7. Modify `initialize()` to load calibration from settings and generate travelTimes

**Verification:**
- [ ] Single sorter calibration works (manual test via debug endpoint)
- [ ] Timeout triggers after 15s with no MC:
- [ ] Coefficients calculated correctly
- [ ] travelTimes array generated correctly from coefficients
- [ ] Parallel calibration of 4 sorters works

### Phase 3: Socket Communication
**Files:** `types/socketMessage.type.ts`, `server/components/SocketManager.ts`, `lib/hooks/useSocket.ts`

1. Add `START_TRAVEL_TIME_CALIBRATION` message type
2. Add `TRAVEL_TIME_CALIBRATION_STATUS` message type
3. Handle `START_TRAVEL_TIME_CALIBRATION` in SocketManager/SystemCoordinator:
   - Check sorters are homed (query SorterStateManager)
   - If not homed, emit error status
   - If homed, call `sorterManager.startCalibration()`
   - Emit results via `TRAVEL_TIME_CALIBRATION_STATUS`
4. Add client-side socket event handling

**Verification:**
- [ ] Frontend can trigger calibration via socket
- [ ] Frontend receives completion/failure status
- [ ] Homing precondition is checked

### Phase 4: Frontend UI
**Files:** `components/buttons/TravelTimeCalibrationButton.tsx`, `components/SettingsForm.tsx`

1. Create `TravelTimeCalibrationButton` component:
   - Button with loading state
   - Socket event handling
   - Toast notifications for success/failure
2. Add to Settings page in appropriate calibration section
3. Optional: Show last calibration timestamp if calibration exists

**Verification:**
- [ ] Button appears in Settings page
- [ ] Button shows "Calibrating..." during calibration
- [ ] Success toast appears on completion
- [ ] Warning toast shows partial failures
- [ ] Button re-enables after calibration

### Phase 5: Sorting Lock During Calibration
**Files:** `server/SystemCoordinator.ts` (or relevant orchestrator)

1. Check `sorterManager.isCalibrationInProgress()` before processing parts
2. If calibrating, skip part processing (log warning)
3. Alternative: disable conveyor during calibration (more aggressive)

**Verification:**
- [x] Parts are not processed during calibration
- [x] System resumes normal operation after calibration

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `types/settings.type.ts` | Modify | Add `TravelTimeCalibrationSchema`, add field to settings |
| `server/components/SorterManager.ts` | Modify | Add calibration methods, modify initialize() |
| `server/components/DeviceManager.ts` | Modify | Add calibration callback registration (if needed) |
| `server/components/SocketManager.ts` | Modify | Handle new calibration socket messages |
| `server/SystemCoordinator.ts` | Modify | Check calibration lock before processing |
| `types/socketMessage.type.ts` | Modify | Add calibration message types |
| `components/buttons/TravelTimeCalibrationButton.tsx` | Create | New calibration button component |
| `components/SettingsForm.tsx` | Modify | Add calibration button to form |
| `lib/hooks/useSocket.ts` | Modify | Handle calibration status events (if not using generic handler) |

---

## Edge Cases & Error Handling

### Sorter Not Homed
- **Detection:** Check `SorterStateManager` for current bin === 1 for all sorters
- **Response:** Emit error status, do not start calibration
- **UI:** Show error toast "All sorters must be homed before calibration"

### Move Timeout (15s)
- **Detection:** Promise rejects after 15s with no MC: response
- **Response:** Mark sorter as failed, continue with others
- **UI:** Include in partial failure warning

### Sorter Disconnected
- **Detection:** DeviceManager connection status or timeout
- **Response:** Same as timeout — mark failed, continue with others

### Grid Dimension Changed After Calibration
- **Detection:** Compare `gridDimensionAtCalibration` with current `gridDimension`
- **Response:** Log warning, still use calibration (coefficients are dimension-agnostic)
- **Alternative:** Invalidate calibration if grid changed (stricter)

### No Calibration Data (First Run)
- **Detection:** `travelTimeCalibration` is undefined or empty
- **Response:** Fall back to hardcoded `travelTimes` arrays (current behavior)

### Calibration During Active Sorting
- **Detection:** Check if sorting is active before starting calibration
- **Response:** Option A: Reject with error "Stop sorting before calibrating"
- **Response:** Option B: Auto-pause sorting, calibrate, resume (more complex)
- **Recommendation:** Option A for simplicity

---

## Mathematical Reference

### Bin Position Calculation
```
For grid dimension N, bin b (1-indexed):
  y = floor((b - 1) / N)
  x = (b - 1) mod N
  position = (x, y)

Middle bin: 
  mid_x = floor(N / 2)
  mid_y = floor(N / 2)
  middle_bin = mid_y × N + mid_x + 1

Max bin:
  max_bin = N × N  (position: (N-1, N-1))
```

### Distance Calculation
```
Euclidean distance between bins b1 and b2:
  d = sqrt((x2 - x1)² + (y2 - y1)²)

Distance from bin 1 (0,0) to middle (N/2, N/2):
  D₁ = sqrt((N/2)² + (N/2)²) = (N/2) × sqrt(2)

Distance from bin 1 (0,0) to max (N-1, N-1):
  D₂ = sqrt((N-1)² + (N-1)²) = (N-1) × sqrt(2)
```

### Coefficient Calculation
```
Given: time(0) = 0, time(D₁) = T₁, time(D₂) = T₂
Model: time(d) = a×d² + b×d

From two equations:
  T₁ = a×D₁² + b×D₁
  T₂ = a×D₂² + b×D₂

Solving for a:
  a = (T₂×D₁ - T₁×D₂) / (D₂²×D₁ - D₁²×D₂)
  a = (T₂×D₁ - T₁×D₂) / (D₁×D₂×(D₂ - D₁))

Solving for b:
  b = (T₁ - a×D₁²) / D₁
```

### Example Calculation (12×12 Grid)
```
Grid: N = 12
Middle: (6, 6) → bin 79, D₁ = 6×√2 ≈ 8.49
Max: (11, 11) → bin 144, D₂ = 11×√2 ≈ 15.56

Suppose measurements:
  T₁ (avg of moves 1 & 2) = 1800ms
  T₂ (move 3) = 2800ms

Coefficients:
  a = (2800×8.49 - 1800×15.56) / (8.49×15.56×(15.56 - 8.49))
  a ≈ (23772 - 28008) / (132.1×7.07)
  a ≈ -4236 / 934
  a ≈ -4.53

  b = (1800 - (-4.53)×72.08) / 8.49
  b ≈ (1800 + 326.5) / 8.49
  b ≈ 250.5

Generated array (distance → time):
  0 → 0ms
  1 → round(-4.53 + 250.5) = 246ms
  2 → round(-18.1 + 501) = 483ms
  ...
  8 → round(-290 + 2004) = 1714ms
  9 → round(-367 + 2255) = 1888ms
  ...
  15 → round(-1019 + 3758) = 2739ms
  16 → round(-1160 + 4008) = 2848ms
```

---

## Testing Checklist

### Unit Tests
- [ ] Coefficient calculation with known values
- [ ] Lookup table generation from coefficients
- [ ] Bin position calculations (middle, max)

### Integration Tests
- [ ] Single sorter calibration flow (mock Arduino)
- [ ] Parallel 4-sorter calibration
- [ ] Timeout handling
- [ ] Settings persistence (save → reload → verify travelTimes)

### Manual Tests
- [ ] Full calibration with real hardware
- [ ] Verify measured times are reasonable (compare to hardcoded)
- [ ] Verify sorting works correctly with calibrated values
- [ ] Verify calibration persists across server restart
- [ ] Verify partial failure handling (disconnect one sorter mid-calibration)

---

## Open Questions / Future Enhancements

1. **Re-calibration UX:** Should there be a "Reset to defaults" option to revert to hardcoded values?
2. **Per-sorter re-calibration:** Allow calibrating a single sorter without affecting others?
3. **Calibration validation:** Compare calibrated values to expected range, warn if outliers?
4. **More sample points:** Add option for full sampling (more accurate, slower) vs sparse (current)?
