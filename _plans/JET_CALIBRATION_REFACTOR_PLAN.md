# Jet Calibration Refactor Plan

## Overview

Replace the current ad-hoc jet position calibration with an interactive calibration workflow that:

1. Measures the **camera view width in encoder ticks** (for pixel-to-tick translation)
2. Measures **encoder tick distances from camera left edge to each air jet**

**Core Workflow:**

1. User clicks "Start Calibration" → encoder resets to 0, calibration mode begins
2. User places a LEGO part at the **left edge** of camera view (this is encoder position 0)
3. User manually moves conveyor using the physical forward/reverse switch on the motor driver
4. User moves part to **right edge** of camera and clicks "Mark Camera Width" to record camera width in ticks
5. User continues moving part to each jet position and clicks "Mark Jet N" to record each jet offset
6. User clicks "Stop Calibration" → values saved, confirmation displayed

**Key Benefits:**

- Directly measures encoder tick count from camera left edge to each jet
- Enables accurate pixel-to-tick position translation for parts detected anywhere in the camera frame
- Eliminates the need for parts to be detected at a specific position (like center)

**Hardware Note:** Conveyor movement is controlled manually via the physical forward/reverse switch on the motor driver - no software jog control needed.

---

## Position Translation System

### The Problem

When a part is detected, it appears at some pixel position X in the camera frame. To fire the air jet at the correct time, we need to know:

1. How far (in encoder ticks) the part needs to travel to reach the jet
2. This requires translating the part's pixel position to encoder ticks

### The Solution

**Calibration provides:**

- `cameraWidthInTicks` - how many encoder ticks span the full camera view width
- `jetEncoderOffsets[N]` - distance in ticks from camera left edge to each jet

**At detection time, we have:**

- `pixelX` - part's X position in camera pixels (0 = left edge)
- `encoderAtDetection` - encoder value when the image was captured
- `cameraWidthPixels` - camera resolution width (known from camera settings)

**Translation formula:**

```typescript
// Convert pixel position to ticks from camera left edge
const partTicksFromLeftEdge = (pixelX / cameraWidthPixels) * cameraWidthInTicks;

// Calculate remaining distance to jet
const remainingTicks = jetEncoderOffsets[jetIndex] - partTicksFromLeftEdge;

// Fire jet when encoder reaches this value
const triggerEncoder = encoderAtDetection + remainingTicks;
```

### Example

- Camera is 3200 pixels wide
- Camera width calibrated to 100 encoder ticks
- Jet A is 500 ticks from camera left edge
- Part detected at pixel 2400 (75% across the camera)

Calculation:

```
partTicksFromLeftEdge = (2400 / 3200) * 100 = 75 ticks
remainingTicks = 500 - 75 = 425 ticks
triggerEncoder = encoderAtDetection + 425
```

---

## Current System Analysis

### What Exists

1. **Arduino (`conveyor_jets.cpp`):**

   - Encoder position tracking via `encoderPosition` variable
   - Periodic position reporting (`EP:<position>`)
   - Position continues to update even when motor is driven externally
   - Encoder reset command exists

2. **Frontend (`EncoderCalibrationButton.tsx`):**

   - Records camera/jet positions based on current encoder value
   - No camera width calibration

3. **Settings (`positionCalibration`):**

   - `cameraEncoderOffset` - encoder position at camera center (will be repurposed/removed)
   - `jetEncoderOffsets[4]` - encoder position for each jet (will change meaning)

4. **Detection System:**
   - Captures images and groups detections
   - Selects one detection per part (after passing 1/3 of camera)
   - Need to verify: pixel X and encoder timestamp captured together

### Current Limitations

- No camera width calibration for pixel-to-tick translation
- Jet offsets not measured from a consistent reference point
- Part pixel position may not be used correctly in jet trigger calculation

---

## Task Breakdown

### Phase 1: Settings Schema Update

Add camera width field and clarify jet offset meaning.

---

#### Task 1.1: Update Settings Type

**File:** `types/settings.type.ts`

**Description:** Add `cameraWidthInTicks` field to position calibration settings.

**Requirements:**

- Add `cameraWidthInTicks: number` field
- Document that `jetEncoderOffsets` now means "distance from camera left edge"
- Keep `cameraEncoderOffset` for backward compatibility (can deprecate later)

**Code Changes:**

```typescript
interface PositionCalibration {
  /** @deprecated Use cameraWidthInTicks and left-edge-based offsets instead */
  cameraEncoderOffset: number;

  /** Width of camera view in encoder ticks (left edge to right edge) */
  cameraWidthInTicks: number;

  /** Encoder tick distance from camera LEFT EDGE to each jet (indices 0-3 = Jets A-D) */
  jetEncoderOffsets: number[];
}
```

**Acceptance Criteria:**

- [ ] Type updated with new field
- [ ] JSDoc comments clarify meaning
- [ ] Existing code compiles without errors

---

#### Task 1.2: Update Firebase Default Settings

**File:** `server/components/SettingsManager.ts` (or wherever defaults are defined)

**Description:** Add default value for `cameraWidthInTicks`.

**Requirements:**

- Default to 0 (uncalibrated)
- Ensure settings migration doesn't break existing installations

**Acceptance Criteria:**

- [ ] Default value set
- [ ] Existing settings without the field get default value

---

### Phase 2: Backend - Calibration Handlers

Update backend to handle new calibration events.

> **Implementation Note for Coding Agents:** This phase requires coordinated changes across 3 files. Complete each task in order as later tasks depend on earlier ones. All code examples show exact changes - preserve existing code patterns and error handling conventions found in the codebase.

---

#### Task 2.1: Add Camera Width Recording Event Type

**File:** `types/socketMessage.type.ts`

**Description:** Add new event type for recording camera width (replaces deprecated camera position recording).

**Current State Analysis:**

- Line 17-18 has existing events: `RECORD_CAMERA_POSITION` and `RECORD_JET_POSITION`
- `RECORD_CAMERA_POSITION` is deprecated - we add `RECORD_CAMERA_WIDTH` alongside it
- Line 69 has `RECORD_CAMERA_POSITION` payload (void) - we keep it for backward compatibility

**Exact Changes Required:**

1. **Add to `FrontToBackEvents` enum** (after line 18, before the closing brace):

```typescript
  /** Record camera view width in encoder ticks (left edge to right edge) */
  RECORD_CAMERA_WIDTH = 'record-camera-width',
```

2. **Add payload type to `EventPayloads` interface** (after line 74, the RECORD_JET_POSITION entry):

```typescript
  /** Record camera width in encoder ticks for pixel-to-tick translation */
  [FrontToBackEvents.RECORD_CAMERA_WIDTH]: {
    /** Camera view width in encoder ticks (from left edge to right edge) */
    widthInTicks: number;
  };
```

**Verification Steps:**

- [ ] `FrontToBackEvents.RECORD_CAMERA_WIDTH` enum value exists
- [ ] Payload type defined with `widthInTicks: number`
- [ ] TypeScript compiles without errors: `npx tsc --noEmit`
- [ ] Existing `RECORD_CAMERA_POSITION` is preserved (not removed)

---

#### Task 2.2: Update Jet Position Event Payload

**File:** `types/socketMessage.type.ts`

**Description:** Update `RECORD_JET_POSITION` payload to accept offset directly from frontend instead of calculating from current encoder position.

**Current State Analysis:**

- Lines 71-74 define the current payload with only `sorter: number`
- The handler in `SystemCoordinator.ts` uses `conveyorManager.getInterpolatedPosition()` to get position
- New approach: frontend sends the offset directly (encoder position at mark time = offset from left edge since encoder was reset to 0)

**Exact Changes Required:**

1. **Replace the `RECORD_JET_POSITION` payload** (lines 71-74):

**Before:**

```typescript
  /** Phase 7: Record current encoder position as jet calibration point for a sorter */
  [FrontToBackEvents.RECORD_JET_POSITION]: {
    /** Sorter index (0-3) to record jet position for */
    sorter: number;
  };
```

**After:**

```typescript
  /** Record jet position as encoder tick offset from camera left edge */
  [FrontToBackEvents.RECORD_JET_POSITION]: {
    /** Sorter index (0-3) to record jet position for */
    sorter: number;
    /** Encoder tick offset from camera left edge to this jet */
    offsetFromLeftEdge: number;
  };
```

**Verification Steps:**

- [ ] Payload now includes `offsetFromLeftEdge: number`
- [ ] JSDoc comment updated to reflect new meaning
- [ ] TypeScript compiles without errors

---

#### Task 2.3: Update Calibration Response Event Type

**File:** `types/socketMessage.type.ts`

**Description:** Update `CALIBRATION_POINT_RECORDED` response to support new `cameraWidth` type.

**Current State Analysis:**

- Lines 154-163 define the response payload
- `type` field is currently `'camera' | 'jet'`
- Need to add `'cameraWidth'` as a valid type

**Exact Changes Required:**

1. **Update the type union in `CALIBRATION_POINT_RECORDED` payload** (line 157):

**Before:**

```typescript
/** Type of calibration point recorded */
type: 'camera' | 'jet';
```

**After:**

```typescript
/** Type of calibration point recorded */
type: 'camera' | 'cameraWidth' | 'jet';
```

**Verification Steps:**

- [ ] `type` field accepts `'cameraWidth'`
- [ ] TypeScript compiles without errors

---

#### Task 2.4: Update SocketManager Handler Config Interface

**File:** `server/components/SocketManager.ts`

**Description:** Add handler callback for the new `RECORD_CAMERA_WIDTH` event.

**Current State Analysis:**

- Lines 26-28 define Phase 7 calibration handler callbacks
- `onRecordCameraPosition` exists but we need `onRecordCameraWidth`
- Keep `onRecordCameraPosition` for backward compatibility

**Exact Changes Required:**

1. **Add to `SocketManagerConfig` interface** (after line 27, before `onRecordJetPosition`):

```typescript
  onRecordCameraWidth: (data: { widthInTicks: number }) => void;
```

2. **Update `onRecordJetPosition` signature** (line 28):

**Before:**

```typescript
  onRecordJetPosition: (data: { sorter: number }) => void;
```

**After:**

```typescript
  onRecordJetPosition: (data: { sorter: number; offsetFromLeftEdge: number }) => void;
```

**Verification Steps:**

- [ ] `onRecordCameraWidth` callback added to interface
- [ ] `onRecordJetPosition` callback signature updated
- [ ] TypeScript compiles without errors (will fail until SystemCoordinator is updated)

---

#### Task 2.5: Add Socket Listener for Camera Width Event

**File:** `server/components/SocketManager.ts`

**Description:** Add socket listener for the new `RECORD_CAMERA_WIDTH` event.

**Current State Analysis:**

- Lines 76-78 set up Phase 7 calibration event listeners
- Need to add listener for the new event

**Exact Changes Required:**

1. **Add socket listener** (after line 77, before `onRecordJetPosition` listener):

```typescript
this.socket.on(FrontToBackEvents.RECORD_CAMERA_WIDTH, this.handlers.onRecordCameraWidth);
```

**Verification Steps:**

- [ ] Socket listener added for `RECORD_CAMERA_WIDTH`
- [ ] Handler is called when event is received

---

#### Task 2.6: Update emitCalibrationPointRecorded Method Signature

**File:** `server/components/SocketManager.ts`

**Description:** Update the emit method to accept the new `cameraWidth` type.

**Current State Analysis:**

- Lines 210-222 define `emitCalibrationPointRecorded`
- Type parameter is `'camera' | 'jet'`

**Exact Changes Required:**

1. **Update method signature** (line 210):

**Before:**

```typescript
  public emitCalibrationPointRecorded(
    type: 'camera' | 'jet',
    position: number,
    success: boolean,
    sorter?: number,
  ): void {
```

**After:**

```typescript
  public emitCalibrationPointRecorded(
    type: 'camera' | 'cameraWidth' | 'jet',
    position: number,
    success: boolean,
    sorter?: number,
  ): void {
```

**Verification Steps:**

- [ ] Method accepts `'cameraWidth'` as type parameter
- [ ] TypeScript compiles without errors

---

#### Task 2.7: Add Camera Width Handler to SystemCoordinator

**File:** `server/SystemCoordinator.ts`

**Description:** Implement the handler for `RECORD_CAMERA_WIDTH` event.

**Current State Analysis:**

- Lines 38-42 register Phase 7 handlers in constructor
- Lines 470-493 implement `handleRecordCameraPosition` (deprecated approach)
- Need to add new handler alongside the existing one

**Exact Changes Required:**

1. **Add handler registration in constructor** (after line 40, before `onRecordJetPosition`):

```typescript
      onRecordCameraWidth: this.handleRecordCameraWidth.bind(this),
```

2. **Add handler method** (after `handleRecordCameraPosition` method, around line 494):

```typescript
  /**
   * Handles record camera width request from frontend.
   * Records the camera view width in encoder ticks (left edge to right edge).
   * This is used for pixel-to-tick translation during part detection.
   */
  private async handleRecordCameraWidth(data: { widthInTicks: number }): Promise<void> {
    try {
      const { widthInTicks } = data;

      if (widthInTicks <= 0) {
        throw new Error(`Invalid camera width: ${widthInTicks} (must be positive)`);
      }

      console.log(`[CALIBRATION] Recording camera width: ${widthInTicks} ticks`);

      const currentSettings = this.settingsManager.getSettings();
      if (!currentSettings) {
        throw new Error('Settings not available');
      }

      await this.settingsManager.updateSettings({
        positionCalibration: {
          ...currentSettings.positionCalibration,
          cameraWidthInTicks: widthInTicks,
        },
      });

      this.socketManager.emitCalibrationPointRecorded('cameraWidth', widthInTicks, true);
      console.log(`[CALIBRATION] Camera width recorded successfully: ${widthInTicks} ticks`);
    } catch (error) {
      console.error('[CALIBRATION] Error recording camera width:', error);
      this.socketManager.emitCalibrationPointRecorded('cameraWidth', 0, false);
    }
  }
```

**Verification Steps:**

- [ ] Handler registered in constructor
- [ ] Handler validates `widthInTicks > 0`
- [ ] Handler saves to `positionCalibration.cameraWidthInTicks`
- [ ] Success emits `'cameraWidth'` type with value
- [ ] Error emits `'cameraWidth'` type with `0` and `success: false`
- [ ] Console logging matches existing patterns

---

#### Task 2.8: Update Jet Position Handler

**File:** `server/SystemCoordinator.ts`

**Description:** Update `handleRecordJetPosition` to use the offset directly from the payload instead of reading current encoder position.

**Current State Analysis:**

- Lines 500-534 implement the current handler
- Line 509 reads position from `conveyorManager.getInterpolatedPosition()`
- New approach: use `offsetFromLeftEdge` from payload directly

**Exact Changes Required:**

1. **Replace the entire `handleRecordJetPosition` method** (lines 500-534):

```typescript
  /**
   * Handles record jet position request from frontend.
   * Records the encoder tick offset from camera left edge to a specific jet.
   * The frontend sends the offset directly (encoder position at mark time,
   * which equals offset since encoder was reset to 0 at calibration start).
   */
  private async handleRecordJetPosition(data: { sorter: number; offsetFromLeftEdge: number }): Promise<void> {
    try {
      const { sorter, offsetFromLeftEdge } = data;

      // Validate sorter index
      if (sorter < 0 || sorter > 3) {
        throw new Error(`Invalid sorter index: ${sorter}`);
      }

      // Validate offset value
      if (offsetFromLeftEdge < 0) {
        throw new Error(`Invalid offset: ${offsetFromLeftEdge} (must be non-negative)`);
      }

      console.log(`[CALIBRATION] Recording jet ${sorter}: ${offsetFromLeftEdge} ticks from camera left edge`);

      const currentSettings = this.settingsManager.getSettings();
      if (!currentSettings) {
        throw new Error('Settings not available');
      }

      // Clone the current jet offsets array and update the specific sorter
      const jetEncoderOffsets = [...currentSettings.positionCalibration.jetEncoderOffsets];
      jetEncoderOffsets[sorter] = offsetFromLeftEdge;

      await this.settingsManager.updateSettings({
        positionCalibration: {
          ...currentSettings.positionCalibration,
          jetEncoderOffsets,
        },
      });

      this.socketManager.emitCalibrationPointRecorded('jet', offsetFromLeftEdge, true, sorter);
      console.log(`[CALIBRATION] Jet ${sorter} recorded successfully: ${offsetFromLeftEdge} ticks from left edge`);
    } catch (error) {
      console.error('[CALIBRATION] Error recording jet position:', error);
      this.socketManager.emitCalibrationPointRecorded('jet', 0, false, data.sorter);
    }
  }
```

**Key Changes from Original:**

- Method signature: `data: { sorter: number }` → `data: { sorter: number; offsetFromLeftEdge: number }`
- No longer calls `conveyorManager.getInterpolatedPosition()`
- Uses `offsetFromLeftEdge` from payload directly
- Added validation for non-negative offset
- Updated log messages to clarify "from camera left edge"

**Verification Steps:**

- [ ] Handler accepts `offsetFromLeftEdge` in payload
- [ ] Handler validates `offsetFromLeftEdge >= 0`
- [ ] Handler does NOT call `conveyorManager.getInterpolatedPosition()`
- [ ] Handler saves `offsetFromLeftEdge` to `jetEncoderOffsets[sorter]`
- [ ] Success emits with correct offset value and sorter index
- [ ] Error handling preserved

---

#### Phase 2 Completion Checklist

After completing all tasks, verify:

**Type Safety:**

- [ ] Run `npx tsc --noEmit` - no TypeScript errors
- [ ] All new events have proper payload types

**Handler Registration:**

- [ ] `RECORD_CAMERA_WIDTH` event listener registered in SocketManager
- [ ] `handleRecordCameraWidth` registered in SystemCoordinator constructor

**Data Flow:**

- [ ] Frontend sends `RECORD_CAMERA_WIDTH` with `{ widthInTicks: number }`
- [ ] Frontend sends `RECORD_JET_POSITION` with `{ sorter: number, offsetFromLeftEdge: number }`
- [ ] Backend saves to Firebase via `settingsManager.updateSettings()`
- [ ] Backend emits `CALIBRATION_POINT_RECORDED` with success/failure

**Settings Structure:**

- [ ] `cameraWidthInTicks` saved to `positionCalibration`
- [ ] `jetEncoderOffsets[sorter]` updated with offset value

**Backward Compatibility:**

- [ ] `RECORD_CAMERA_POSITION` still exists (deprecated but functional)
- [ ] `handleRecordCameraPosition` still exists (deprecated but functional)
- [ ] Existing `'camera'` type in responses still supported

---

#### File Change Summary

| File                                 | Changes                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `types/socketMessage.type.ts`        | Add `RECORD_CAMERA_WIDTH` event, update `RECORD_JET_POSITION` payload, add `'cameraWidth'` to response type |
| `server/components/SocketManager.ts` | Add `onRecordCameraWidth` callback, add socket listener, update emit method signature                       |
| `server/SystemCoordinator.ts`        | Add `handleRecordCameraWidth` handler, register in constructor, update `handleRecordJetPosition`            |

---

#### Testing the Backend Changes

**Manual Test via Socket (using a test script or browser console):**

1. **Test Camera Width Recording:**

```javascript
socket.emit('record-camera-width', { widthInTicks: 150 });
// Expected: CALIBRATION_POINT_RECORDED with type='cameraWidth', position=150, success=true
```

2. **Test Jet Position Recording:**

```javascript
socket.emit('record-jet-position', { sorter: 0, offsetFromLeftEdge: 500 });
// Expected: CALIBRATION_POINT_RECORDED with type='jet', position=500, sorter=0, success=true
```

3. **Test Invalid Inputs:**

```javascript
socket.emit('record-camera-width', { widthInTicks: -100 });
// Expected: CALIBRATION_POINT_RECORDED with type='cameraWidth', position=0, success=false

socket.emit('record-jet-position', { sorter: 5, offsetFromLeftEdge: 500 });
// Expected: CALIBRATION_POINT_RECORDED with type='jet', position=0, success=false
```

4. **Verify Firebase Updates:**

- Check Firebase console for `settings/dev-user` document
- Verify `positionCalibration.cameraWidthInTicks` is updated
- Verify `positionCalibration.jetEncoderOffsets` array is updated

---

### Phase 3: Frontend - Calibration Panel Component

Create the calibration UI with encoder reset, camera width, and jet marking buttons.

---

#### Task 3.1: Create JetCalibrationPanel Component Structure

**File:** `components/buttons/JetCalibrationPanel.tsx` (new file)

**Description:** Create the main calibration panel component.

**Requirements:**

- Collapsible panel (consistent with existing UI patterns)
- Track calibration state:
  - `isCalibrating: boolean`
  - `cameraWidthRecorded: boolean`
  - `cameraWidthTicks: number | null`
  - `calibratedJets: Map<number, number>` (sorter → offset)
- Include info tooltip with calibration instructions

**Component Structure:**

```typescript
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Info } from 'lucide-react';
import { AllEvents, BackToFrontEvents, EventPayloads } from '@/types/socketMessage.type';

interface CalibrationState {
  isCalibrating: boolean;
  cameraWidthRecorded: boolean;
  cameraWidthTicks: number | null;
  calibratedJets: Map<number, number>;
}

const SORTER_LABELS = ['A', 'B', 'C', 'D'];

const JetCalibrationPanel = () => {
  // ... implementation
};

export default JetCalibrationPanel;
```

**Acceptance Criteria:**

- [ ] Component renders without errors
- [ ] State structure supports calibration workflow
- [ ] Collapsible behavior works

---

#### Task 3.2: Implement Start Calibration Logic

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Handle calibration start with encoder reset.

**Requirements:**

- "Start Calibration" button:
  - Sends encoder reset command (sets encoder to 0)
  - Sets `isCalibrating = true`
  - Clears any previously calibrated values in this session
  - Button changes to "Stop Calibration" when active

**Code Implementation:**

```typescript
const [isOpen, setIsOpen] = useState(false);
const [calibrationState, setCalibrationState] = useState<CalibrationState>({
  isCalibrating: false,
  cameraWidthRecorded: false,
  cameraWidthTicks: null,
  calibratedJets: new Map(),
});

const { socket } = useSocket();

// Get encoder position from store
const encoderPosition = sortProcessStore((state) => state.encoderPosition);

const handleStartCalibration = () => {
  if (!socket) return;

  // Reset encoder to 0 - this sets the left edge of camera as position 0
  socket.emit(AllEvents.RESET_ENCODER);

  setCalibrationState({
    isCalibrating: true,
    cameraWidthRecorded: false,
    cameraWidthTicks: null,
    calibratedJets: new Map(),
  });
};

const handleStopCalibration = () => {
  setCalibrationState((prev) => ({
    ...prev,
    isCalibrating: false,
  }));
  // Values are already saved to Firebase as they were recorded
};
```

**Acceptance Criteria:**

- [ ] Start sends encoder reset command
- [ ] Calibration state initialized correctly
- [ ] Button toggles between Start/Stop

---

#### Task 3.3: Implement Camera Width Recording

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Handle camera width recording (right edge of camera).

**Requirements:**

- "Mark Camera Width" button:
  - Records current encoder position as camera width in ticks
  - Sends to backend to save
  - Shows recorded value on button
  - Enables jet marking buttons

**Code Implementation:**

```typescript
const handleMarkCameraWidth = () => {
  if (!socket) return;

  const widthInTicks = encoderPosition; // Current position = distance from left edge (0)

  socket.emit(AllEvents.RECORD_CAMERA_WIDTH, {
    widthInTicks,
  });

  setCalibrationState((prev) => ({
    ...prev,
    cameraWidthRecorded: true,
    cameraWidthTicks: widthInTicks,
  }));
};
```

**Button JSX:**

```tsx
<Button
  onClick={handleMarkCameraWidth}
  disabled={!calibrationState.isCalibrating || calibrationState.cameraWidthRecorded}
  variant={calibrationState.cameraWidthRecorded ? 'default' : 'outline'}
  className={`w-full ${calibrationState.cameraWidthRecorded ? 'bg-green-600 hover:bg-green-700' : ''}`}
>
  {calibrationState.cameraWidthRecorded ? (
    <span className="flex flex-col items-center">
      <span>✓ Camera Width</span>
      <span className="text-xs font-normal">{calibrationState.cameraWidthTicks?.toLocaleString()} ticks</span>
    </span>
  ) : (
    'Mark Camera Width (Right Edge)'
  )}
</Button>
```

**Acceptance Criteria:**

- [ ] Records current encoder position as width
- [ ] Sends to backend
- [ ] Shows recorded value
- [ ] Button disabled after recording (until new calibration started)

---

#### Task 3.4: Implement Jet Mark Buttons

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Create buttons to mark each jet position.

**Requirements:**

- Four buttons labeled "Jet A", "Jet B", "Jet C", "Jet D"
- When clicked:
  - Records current encoder position as offset from left edge
  - Sends `RECORD_JET_POSITION` with offset value
  - Visual feedback: green background + checkmark when marked
- Show offset value on button after marking
- Buttons disabled until camera width is recorded
- Can re-mark jets (overwrite previous value)

**Code Implementation:**

```typescript
const handleMarkJet = (sorterIndex: number) => {
  if (!socket) return;

  const offsetFromLeftEdge = encoderPosition; // Current position = distance from left edge (0)

  socket.emit(AllEvents.RECORD_JET_POSITION, {
    sorter: sorterIndex,
    offsetFromLeftEdge,
  });

  setCalibrationState((prev) => {
    const newCalibrated = new Map(prev.calibratedJets);
    newCalibrated.set(sorterIndex, offsetFromLeftEdge);
    return { ...prev, calibratedJets: newCalibrated };
  });
};
```

**Button JSX:**

```tsx
<div className="grid grid-cols-2 gap-2">
  {SORTER_LABELS.map((label, index) => {
    const isMarked = calibrationState.calibratedJets.has(index);
    const offset = calibrationState.calibratedJets.get(index);

    return (
      <Button
        key={index}
        onClick={() => handleMarkJet(index)}
        disabled={!calibrationState.isCalibrating || !calibrationState.cameraWidthRecorded}
        variant={isMarked ? 'default' : 'outline'}
        className={isMarked ? 'bg-green-600 hover:bg-green-700' : ''}
      >
        <span className="flex flex-col items-center">
          <span>
            {isMarked ? '✓ ' : ''}Jet {label}
          </span>
          {isMarked && <span className="text-xs font-normal">{offset?.toLocaleString()} ticks</span>}
        </span>
      </Button>
    );
  })}
</div>
```

**Acceptance Criteria:**

- [ ] Clicking marks jet position (encoder value = offset from left edge)
- [ ] Visual feedback when jet is marked (green + checkmark)
- [ ] Offset value displayed on button
- [ ] Buttons disabled until camera width recorded
- [ ] Can re-mark jets

---

#### Task 3.5: Add Live Position Display

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Show live encoder position during calibration.

**Requirements:**

- Display current encoder position
- Format numbers with commas
- Clear visual hierarchy

**Code Implementation:**

```tsx
<div className="rounded bg-white p-3 text-center">
  <div className="text-sm text-gray-500">Current Encoder Position</div>
  <div className="font-mono text-xl font-bold">{encoderPosition.toLocaleString()}</div>
  {calibrationState.isCalibrating && <div className="mt-1 text-xs text-gray-400">(Distance from camera left edge)</div>}
</div>
```

**Acceptance Criteria:**

- [ ] Position displays correctly
- [ ] Numbers formatted with commas

---

#### Task 3.6: Add Info Tooltip with Instructions

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Add hover tooltip with calibration instructions.

**Requirements:**

- Info icon (ℹ️) next to panel title
- Hover shows step-by-step instructions
- Clear, concise language

**Code Implementation:**

```tsx
<div className="flex items-center gap-2">
  <span>Jet Position Calibration</span>
  <HoverCard>
    <HoverCardTrigger asChild>
      <button className="text-gray-400 hover:text-gray-600">
        <Info size={16} />
      </button>
    </HoverCardTrigger>
    <HoverCardContent className="w-80 text-sm">
      <div className="space-y-2">
        <p className="font-semibold">Calibration Steps:</p>
        <ol className="list-inside list-decimal space-y-1 text-gray-600">
          <li>Click "Start Calibration" (resets encoder to 0)</li>
          <li>
            Place a part on the conveyor aligned with the <strong>left edge</strong> of the camera view
          </li>
          <li>Use the motor driver forward button to move the conveyor</li>
          <li>
            When part reaches the <strong>right edge</strong> of camera, click "Mark Camera Width"
          </li>
          <li>Continue moving to each air jet and click the corresponding jet button</li>
          <li>Click "Stop Calibration" when done</li>
        </ol>
        <p className="mt-2 text-xs text-gray-500">
          This calibration enables accurate position tracking for parts detected anywhere in the camera frame.
        </p>
      </div>
    </HoverCardContent>
  </HoverCard>
</div>
```

**Acceptance Criteria:**

- [ ] Info icon visible
- [ ] Hover displays instructions
- [ ] Instructions are clear and accurate

---

#### Task 3.7: Add Stop Calibration Confirmation

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Show confirmation when calibration is stopped.

**Requirements:**

- Display summary of recorded values after stopping
- Show which values were recorded
- Auto-dismiss after a few seconds or on interaction

**Code Implementation:**

```tsx
const [showConfirmation, setShowConfirmation] = useState(false);

const handleStopCalibration = () => {
  setCalibrationState((prev) => ({
    ...prev,
    isCalibrating: false,
  }));
  setShowConfirmation(true);

  // Auto-dismiss after 5 seconds
  setTimeout(() => setShowConfirmation(false), 5000);
};

// In JSX, after the Stop button:
{
  showConfirmation && !calibrationState.isCalibrating && (
    <div className="rounded border border-green-200 bg-green-50 p-3 text-sm">
      <div className="font-semibold text-green-800">✓ Calibration Complete</div>
      <div className="mt-1 text-green-700">
        {calibrationState.cameraWidthTicks !== null && (
          <div>Camera width: {calibrationState.cameraWidthTicks.toLocaleString()} ticks</div>
        )}
        {Array.from(calibrationState.calibratedJets.entries()).map(([jet, offset]) => (
          <div key={jet}>
            Jet {SORTER_LABELS[jet]}: {offset.toLocaleString()} ticks
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**

- [ ] Confirmation appears after stopping
- [ ] Shows recorded values
- [ ] Auto-dismisses

---

#### Task 3.8: Assemble Complete Panel Layout

**File:** `components/buttons/JetCalibrationPanel.tsx`

**Description:** Combine all elements into the final component.

**Layout:**

```
┌─────────────────────────────────────────┐
│ [▼] Jet Position Calibration  ℹ️        │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Current Encoder Position            │ │
│ │           12,345                    │ │
│ │  (Distance from camera left edge)   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [    Start Jet Calibration    ]         │
│        (or Stop Calibration)            │
│                                         │
│ [  Mark Camera Width (Right Edge)  ]    │
│                                         │
│ ┌───────────┐ ┌───────────┐             │
│ │ ✓ Jet A   │ │   Jet B   │             │
│ │  (2,340)  │ │ (disabled)│             │
│ └───────────┘ └───────────┘             │
│ ┌───────────┐ ┌───────────┐             │
│ │   Jet C   │ │   Jet D   │             │
│ │ (disabled)│ │ (disabled)│             │
│ └───────────┘ └───────────┘             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ✓ Calibration Complete              │ │
│ │ Camera width: 150 ticks             │ │
│ │ Jet A: 2,340 ticks                  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Acceptance Criteria:**

- [ ] All elements render correctly
- [ ] Collapsible behavior works
- [ ] Visual hierarchy is clear
- [ ] Responsive layout

---

### Phase 4: Position Translation Implementation

Implement the pixel-to-tick translation in the sorting logic.

---

#### Task 4.1: Update Part Detection Data Structure

**File:** `types/part.type.ts` (or relevant type file)

**Description:** Ensure part detection captures pixel position and encoder at detection time.

**Requirements:**

- Part/detection type includes:
  - `pixelX: number` - X position in camera pixels
  - `encoderAtDetection: number` - encoder value when image was captured
- These should come from the same detection event

**Code Changes:**

```typescript
interface PartDetection {
  // ... existing fields ...

  /** X position in camera pixels (0 = left edge) */
  pixelX: number;

  /** Encoder value at the moment this image was captured */
  encoderAtDetection: number;
}
```

**Acceptance Criteria:**

- [ ] Type includes pixel position
- [ ] Type includes encoder at detection time

---

#### Task 4.2: Create Position Translator Utility

**File:** `server/components/PositionTranslator.ts` (or update existing)

**Description:** Implement the pixel-to-tick translation logic.

**Requirements:**

- Function to calculate jet trigger encoder value
- Takes part position, jet index, and calibration settings
- Returns encoder value at which to fire jet

**Code Implementation:**

```typescript
interface PositionTranslatorConfig {
  cameraWidthPixels: number;
  cameraWidthInTicks: number;
  jetEncoderOffsets: number[];
}

export class PositionTranslator {
  private config: PositionTranslatorConfig;

  constructor(config: PositionTranslatorConfig) {
    this.config = config;
  }

  /**
   * Calculate the encoder value at which to trigger a jet for a detected part.
   *
   * @param pixelX - Part's X position in camera pixels (0 = left edge)
   * @param encoderAtDetection - Encoder value when detection image was captured
   * @param jetIndex - Index of jet (0-3)
   * @returns Encoder value at which to fire the jet
   */
  calculateJetTriggerEncoder(pixelX: number, encoderAtDetection: number, jetIndex: number): number {
    const { cameraWidthPixels, cameraWidthInTicks, jetEncoderOffsets } = this.config;

    // Convert pixel position to ticks from camera left edge
    const partTicksFromLeftEdge = (pixelX / cameraWidthPixels) * cameraWidthInTicks;

    // Get jet distance from left edge
    const jetTicksFromLeftEdge = jetEncoderOffsets[jetIndex];

    // Calculate remaining distance to jet
    const remainingTicks = jetTicksFromLeftEdge - partTicksFromLeftEdge;

    // Trigger encoder value
    return Math.round(encoderAtDetection + remainingTicks);
  }

  /**
   * Check if calibration data is valid for position translation.
   */
  isCalibrated(): boolean {
    return (
      this.config.cameraWidthInTicks > 0 &&
      this.config.jetEncoderOffsets.length === 4 &&
      this.config.jetEncoderOffsets.every((offset) => offset > 0)
    );
  }
}
```

**Acceptance Criteria:**

- [ ] Translation formula implemented correctly
- [ ] Handles edge cases (pixel at 0, pixel at max width)
- [ ] Returns rounded integer encoder value

---

#### Task 4.3: Integrate Position Translation into Sorting Logic

**File:** `server/SystemCoordinator.ts` (or wherever jet actions are scheduled)

**Description:** Use position translator when scheduling jet actions for detected parts.

**Requirements:**

- When a part is detected and classified:
  - Get part's `pixelX` and `encoderAtDetection`
  - Use `PositionTranslator` to calculate trigger encoder for target jet
  - Schedule jet action at calculated encoder value

**Code Changes (conceptual):**

```typescript
// When part detection is finalized and target bin determined:
const triggerEncoder = this.positionTranslator.calculateJetTriggerEncoder(
  part.pixelX,
  part.encoderAtDetection,
  targetJetIndex,
);

// Schedule jet action
this.scheduleJetAction(targetJetIndex, triggerEncoder);
```

**Acceptance Criteria:**

- [ ] Position translator used in sorting logic
- [ ] Jet trigger encoder calculated from pixel position
- [ ] Existing sorting flow updated

---

### Phase 5: Integration

Connect calibration panel to sorter page.

---

#### Task 5.1: Integrate Calibration Panel into Sorter Page

**File:** `app/sorter/page.tsx`

**Description:** Add the calibration panel to the sorter page.

**Requirements:**

- Import `JetCalibrationPanel`
- Position panel in sidebar with other controls

**Code Changes:**

```typescript
'use client';
// ... existing imports ...
import JetCalibrationPanel from '@/components/buttons/JetCalibrationPanel';

const SortPage = () => {
  const ppmCount = sortProcessStore((state) => state.ppmCount);

  return (
    <div>
      <div className="grid grid-cols-6">
        <div className="flex flex-col gap-2">
          <SorterControllerButton />
          <ConveyorButton />
          <HomeSorterButton />
          <SorterPositionDisplay />
          <EncoderStatusDisplay />
          <JetCalibrationPanel />
          <div>{`${ppmCount} PPM (last 10min)`}</div>
        </div>
        {/* ... rest unchanged ... */}
      </div>
      {/* ... */}
    </div>
  );
};
```

**Acceptance Criteria:**

- [ ] Calibration panel visible on sorter page
- [ ] Panel positioned appropriately in sidebar
- [ ] No visual conflicts with existing controls

---

#### Task 5.2: Remove or Update Old Encoder Calibration Component

**File:** `components/buttons/EncoderCalibrationButton.tsx`

**Description:** Decide how to handle the old calibration UI.

**Options:**

1. **Remove** - Delete the old component entirely (jet calibration now handled by new panel)
2. **Keep minimal** - Keep only encoder reset functionality if needed elsewhere
3. **Deprecate** - Mark as deprecated, remove in future update

**Recommendation:** Remove or significantly simplify `EncoderCalibrationButton` since:

- Encoder reset is now part of `JetCalibrationPanel`
- Jet position marking is now part of `JetCalibrationPanel`
- Camera position marking is replaced by camera width calibration

**Acceptance Criteria:**

- [ ] Decision documented
- [ ] Old component removed or updated
- [ ] No duplicate functionality

---

### Phase 6: Verification and Code Review

Verify that existing code handles the requirements correctly.

---

#### Task 6.1: Verify Detection Captures Pixel Position

**Files to check:**

- Detection processing code
- Part type definitions
- Detection event payloads

**Verify:**

- [ ] Part pixel X coordinate is captured at detection time
- [ ] Value represents position from left edge (0 = left)
- [ ] Camera width in pixels is known/accessible

---

#### Task 6.2: Verify Encoder Timestamp at Detection

**Files to check:**

- Image capture code
- Detection processing code
- Encoder reporting code

**Verify:**

- [ ] Encoder value is captured at (or very close to) image capture time
- [ ] Not captured at processing completion time (which could be later)
- [ ] Encoder value and pixel position come from the same detection event

---

#### Task 6.3: Verify Camera Orientation

**Files to check:**

- Camera configuration
- Image processing code

**Verify:**

- [ ] Pixel X=0 is the left edge (where parts enter the camera view)
- [ ] Pixel X increases as parts move toward jets (right side of camera)
- [ ] If inverted, update translation formula

---

#### Task 6.4: Verify Sorter Move Action Uses Correct Position

**Files to check:**

- Sorter movement scheduling code

**Verify:**

- [ ] Sorter positioning also uses pixel-to-tick translation if needed
- [ ] Sorter aims at correct bin before part arrives

---

### Phase 7: Testing

---

#### Task 7.1: Manual Testing Checklist

**Test Cases:**

1. **Start Calibration**

   - [ ] Click "Start Calibration" resets encoder to 0
   - [ ] Calibration state initialized (camera width and jets cleared)
   - [ ] Button changes to "Stop Calibration"
   - [ ] Position display shows 0 (or close to 0)

2. **Camera Width Recording**

   - [ ] Move conveyor forward, encoder position increases
   - [ ] Click "Mark Camera Width" records current position
   - [ ] Button shows green checkmark and recorded value
   - [ ] Jet buttons become enabled
   - [ ] Value saved to Firebase

3. **Jet Marking**

   - [ ] Clicking jet button marks position (current encoder value)
   - [ ] Marked jet shows green background + checkmark
   - [ ] Offset value displayed on button (formatted with commas)
   - [ ] Value is saved to Firebase
   - [ ] Can mark jets in any order
   - [ ] Can re-mark same jet (overwrites previous value)

4. **Stop Calibration**

   - [ ] Click "Stop Calibration" ends calibration mode
   - [ ] Confirmation message shows recorded values
   - [ ] Confirmation auto-dismisses after 5 seconds

5. **Info Tooltip**

   - [ ] Info icon visible next to panel title
   - [ ] Hover displays calibration instructions
   - [ ] Instructions are accurate and complete

6. **Position Translation (Integration)**

   - [ ] Run sorting with newly calibrated values
   - [ ] Parts detected at different pixel positions trigger jets correctly
   - [ ] Parts detected on left side of camera fire jets at correct time
   - [ ] Parts detected on right side of camera fire jets at correct time

7. **Edge Cases**
   - [ ] Works after page refresh
   - [ ] Multiple calibration sessions work correctly
   - [ ] Works with large encoder values

---

## Potential Issues to Verify in Code

These are potential issues that may already be handled correctly in the codebase. Each should be verified during implementation.

### Issue 1: Encoder Timestamp Accuracy

**Concern:** The encoder value must be captured at the moment the image was taken, not when detection processing completes. If there's latency between image capture and processing, using the "current" encoder at processing time will cause position errors.

**What to verify:**

- How is encoder value associated with detections?
- Is it captured at image capture time or processing time?
- What is the typical latency between capture and processing?

**Files to check:** Detection service, video capture service, encoder reporting

---

### Issue 2: Detection Grouping and Position Selection

**Concern:** The system groups multiple detections and picks one "once it passes 1/3 of the camera." The selected detection must include both `pixelX` and `encoderAtDetection` from the same detection event, not mixed from different events.

**What to verify:**

- How does detection grouping work?
- Which detection's position data is used for the "canonical" detection?
- Are pixel position and encoder value from the same source?

**Files to check:** Detection grouping logic, detection service

---

### Issue 3: Camera Pixel Orientation

**Concern:** The translation assumes pixel X=0 is the side where parts enter (upstream/left) and X increases as parts move toward jets. If the camera is mounted differently, the formula needs adjustment.

**What to verify:**

- What is the camera's pixel coordinate system?
- Does X=0 correspond to left edge (part entry side)?

**Files to check:** Camera configuration, video capture setup

---

### Issue 4: Sorter Move Timing

**Concern:** The sorter needs to move to the correct bin position before the part arrives. This timing may also depend on part position. Ensure sorter move actions use consistent position translation.

**What to verify:**

- How is sorter move timing calculated?
- Does it use the same position reference as jet timing?

**Files to check:** Sorter scheduling logic, sorter manager

---

### Issue 5: Calibration Persistence

**Concern:** Calibration values must persist across server restarts and be available when needed.

**What to verify:**

- Are calibration values saved to Firebase correctly?
- Are they loaded on server startup?
- Is `PositionTranslator` initialized with current calibration values?

**Files to check:** Settings manager, Firebase integration, server initialization

---

## Summary

This plan has **20+ tasks across 7 phases**:

| Phase | Tasks | Description                                            |
| ----- | ----- | ------------------------------------------------------ |
| 1     | 2     | Settings: Add cameraWidthInTicks field                 |
| 2     | 4     | Backend: Calibration event handlers                    |
| 3     | 8     | Frontend: JetCalibrationPanel component                |
| 4     | 3     | Position Translation: Pixel-to-tick logic              |
| 5     | 2     | Integration: Wire up to sorter page                    |
| 6     | 4     | Verification: Check existing code handles requirements |
| 7     | 1     | Testing: Manual testing checklist                      |

**Key changes from original plan:**

- No camera overlay needed
- Encoder resets to 0 at calibration start (left edge = position 0)
- Camera width calibration added (left edge to right edge)
- Position translation system implemented
- Jet offsets now mean "distance from camera left edge"

**No Arduino changes required** - the encoder already reports position and supports reset.

---

## Appendix: Calibration Workflow

### Step-by-Step Instructions (also in UI tooltip)

1. **Start Calibration**

   - Click "Start Calibration" button
   - This resets the encoder to 0

2. **Position Part at Left Edge**

   - Place a LEGO part on the conveyor belt
   - Position it aligned with the **left edge** of the camera view
   - This position is encoder 0

3. **Mark Camera Width**

   - Use the motor driver forward button to move the conveyor
   - Stop when part is aligned with the **right edge** of the camera view
   - Click "Mark Camera Width" → records camera view width in ticks

4. **Mark Each Jet**

   - Continue moving conveyor forward
   - Stop when part is centered under Jet A
   - Click "Jet A" button → turns green with offset value
   - Continue to Jet B, C, D

5. **Finish**
   - Click "Stop Calibration"
   - Confirmation shows all recorded values
   - Values are automatically saved

### Tips

- Move slowly for precise positioning
- You can re-mark a jet if you make a mistake
- Jet buttons are disabled until camera width is recorded
- The offset value shows encoder ticks from camera left edge to jet
- Larger offset = further from camera
