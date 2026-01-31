# Constant Speed & Encoder-Based Simplification Plan

## Overview

A comprehensive refactor to simplify the LEGO sorting system by:

1. **Removing time-based scheduling entirely** - Only encoder-based scheduling remains
2. **Using encoder ticks for detection matching** - Replace pixels/ms speed calculations
3. **Removing all variable speed code** - Conveyor runs at constant speed always
4. **Requiring calibration** - System needs `cameraWidthInTicks` and `jetEncoderOffsets` to operate

**End State Goal:**
> Parts are tracked entirely in encoder tick space. Detection matching, position prediction, and jet firing all use encoder positions. If a part will arrive before the sorter is ready, it's skipped. No time-based calculations, no speed tracking, no variable conveyor speed.

---

## Quick Reference for Implementation

### What's Being Removed
- **SpeedManager.ts** - entire file deleted
- **Part type** - only EncoderPart remains
- **Time-based scheduling** - setTimeout paths completely removed
- **Speed tracking** - conveyorSpeed, speedLog, conveyorSpeedLog all gone
- **Settings:** conveyorSpeed, minConveyorRPM, constantConveyorSpeed, useEncoderScheduling, jetPositionStart
- **Events:** CONVEYOR_SPEED_UPDATE, PART_SORTED, PART_SKIPPED
- **Functions:** findPositionAtTime(), calibrateConveyorSpeed(), computeTrimmedMean()

### What's Being Added
- **encoderAtCapture** in ImageCaptureType
- **encoderAtDetection** in Detection type and SortPartDto
- **Encoder-based detection matching** using absolute position calculation
- **cameraWidthInTicks/cameraWidthPixels fields** in SettingsForm

### Key Formula
```typescript
absolutePosition = encoderAtDetection - (pixelX / cameraWidthPixels) * cameraWidthInTicks
```
Two detections of the same part will have similar absolutePosition values (within 50 ticks).

### Validation After Each Phase
Always run `npx tsc --noEmit` after completing each phase to catch type errors early.

---

## Key Design Decisions (Favoring Simplicity)

1. **Remove PART_SORTED/PART_SKIPPED events entirely** - These are only used by time-based scheduling. The encoder-based events (ENCODER_PART_SORTED, ENCODER_PART_SKIPPED) replace them.

2. **Make encoderAtDetection required** - No backwards compatibility with old frontends. Clean break.

3. **Remove Part type completely** - Only EncoderPart remains. No dual-type confusion.

4. **Use generous matching threshold** - `Math.max(50, cameraWidthInTicks * 0.20)` to avoid false non-matches.

5. **Remove all debug fetch() calls** - The `#region agent log` blocks are development artifacts.

---

## Current State vs Target State Summary

### Detection Matching

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Position prediction | `findPositionAtTime(speedLog)` calculates where part should be based on elapsed time and speed | `absolutePosition = encoder - pixelToTicks(pixel)` directly from encoder readings |
| Time dependency | Requires accurate `conveyorSpeed` calibration in pixels/ms | Uses encoder ticks only - no speed needed |
| Speed log | `conveyorSpeedLog[]` maintained in store, queried for position prediction | **Removed entirely** |
| Matching threshold | Pixel distance threshold (e.g., `detectDistanceThreshold`) | Encoder tick threshold (e.g., 30 ticks) |

### Part Scheduling

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Scheduling method | `useEncoderScheduling` flag switches between time-based and encoder-based paths | Encoder-only path, flag **removed** |
| Position interpolation | Server calls `getEncoderPositionAtTime(detectionTime)` to interpolate encoder position | Server uses `encoderAtDetection` from frontend **directly** (no interpolation) |
| Speed changes | `SpeedManager` schedules speed adjustments, recalculates arrival times | **Removed** - constant speed only, no adjustments |
| Skip behavior | Complex: slowdown if possible, skip if slowdown insufficient | Simple: skip if sorter unavailable |

### Data Flow

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Frame capture | Returns `{imageBitmaps, timestamp}` | Returns `{imageBitmaps, timestamp, encoderAtCapture}` |
| Detection type | Contains `timestamp` for timing | Contains `timestamp` AND `encoderAtDetection` |
| SORT_PART message | `{partId, pixelX, timestamp, bin, sorter}` | `{partId, pixelX, timestamp, encoderAtDetection, bin, sorter}` |
| Server processing | Interpolates encoder from timestamp | Uses `encoderAtDetection` directly |

### Settings

| Setting | Current State | Target State |
|---------|--------------|--------------|
| `conveyorSpeed` | pixels/ms for time-based calculations | **Removed** |
| `minConveyorRPM` | Minimum speed for slowdown | **Removed** |
| `constantConveyorSpeed` | Flag to disable slowdown | **Removed** (always constant) |
| `useEncoderScheduling` | Flag to enable encoder path | **Removed** (always encoder) |
| `jetPositionStart` (per sorter) | Pixel position for time-based | **Removed** (use `jetEncoderOffsets`) |

---

## Architecture: Before vs After

### Current System (Complex)

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                        │
│  - Captures frames with timestamp                               │
│  - Matches detections using findPositionAtTime(speedLog)        │
│  - Uses conveyorSpeed (pixels/ms) for position prediction       │
│  - Sends SORT_PART { pixelX, timestamp }                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVER                                                          │
│  - Two paths: time-based OR encoder-based (useEncoderScheduling)│
│  - Time-based: setTimeout, speedLog, variable speed             │
│  - SpeedManager: schedules speed changes                        │
│  - Interpolates encoder from timestamp                          │
└─────────────────────────────────────────────────────────────────┘
```

### After Refactor (Simple)

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                        │
│  - Captures frames with timestamp AND encoderPosition           │
│  - Matches detections using encoder delta (no speed needed)     │
│  - Sends SORT_PART { pixelX, timestamp, encoderAtDetection }    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVER                                                          │
│  - Single path: encoder-based only                              │
│  - Uses encoderAtDetection directly (no interpolation)          │
│  - Position translation: pixel → ticks using calibration        │
│  - Skip parts if sorter unavailable, otherwise schedule         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detection Matching: Time-Based vs Encoder-Based

### Current: Time + Speed (being removed)

```typescript
// Predict where the part should be NOW based on time elapsed and speed
const predictedX = findPositionAtTime(
  lastDetection.centroid.x,
  lastDetection.timestamp,
  newDetection.timestamp,
  conveyorSpeedLog,
  defaultSpeed
);
const distance = Math.abs(predictedX - newDetection.centroid.x);
// Match if distance < threshold (in pixels)
```

**Problems:**
- Requires accurate `conveyorSpeed` calibration
- Accumulates timing errors
- Speed log complexity

### After: Encoder Delta (new approach)

```typescript
// Calculate "absolute position" - the encoder value when part crossed camera left edge
const pixelToTicks = (pixelX) => (pixelX / cameraWidthPixels) * cameraWidthInTicks;

const lastAbsolutePos = lastDetection.encoderAtDetection - pixelToTicks(lastDetection.centroid.x);
const newAbsolutePos = newDetection.encoderAtDetection - pixelToTicks(newDetection.centroid.x);

const delta = Math.abs(newAbsolutePos - lastAbsolutePos);
// Match if delta < threshold (in ticks, e.g., ±20-30 ticks)
```

**Benefits:**
- Uses actual encoder readings (ground truth)
- No speed assumptions needed
- No timing error accumulation
- Simpler code

### Why ±50 Ticks (or 20% of Camera Width) Is Needed

Given:
- Camera width: ~100-300 ticks (calibrated)
- Detection jitter in pixel space: ±10-20 pixels
- Encoder update latency: ~100ms at 10Hz updates
- Part wobble on conveyor: ±10 ticks

Sources of error that accumulate:
- Detection bounding box jitter (±10 ticks)
- Encoder/frame timing skew (±15 ticks at typical speeds)
- Part wobble on conveyor (±10 ticks)
- Velocity estimation errors (±10 ticks)

**Formula:** `Math.max(50, cameraWidthInTicks * 0.20)`

For a 150-tick camera width: max(50, 30) = 50 ticks threshold.
For a 300-tick camera width: max(50, 60) = 60 ticks threshold.

---

## Complete Data Flow (After Refactor)

This section shows the complete flow of encoder data from capture to jet firing:

```
1. VideoCaptureService.captureImage()
   ├── Reads encoderPosition from sortProcessStore
   ├── Captures frames
   └── Returns { imageBitmaps, timestamp, encoderAtCapture }
           │
           ▼
2. DetectorService.detect()
   ├── Receives imageCapture with encoderAtCapture
   ├── Runs ML detection
   └── Calls createDetections(timestamp, encoderAtCapture, ...)
           │
           ▼
3. DetectorService.createDetections()
   └── Creates Detection[] with { timestamp, encoderAtDetection, centroid, ... }
           │
           ▼
4. SorterService.matchDetectionsPairsToGroups()
   ├── Uses encoderAtDetection for matching (not speed)
   └── Groups detections by absolute encoder position
           │
           ▼
5. SorterService.classifyDetections()
   ├── Extracts encoderAtDetection from detection
   └── Passes to ClassifierService.classify()
           │
           ▼
6. ClassifierService.classify()
   ├── Classifies part
   ├── Builds SortPartDto with encoderAtDetection
   └── Emits SORT_PART socket message
           │
           ▼
7. SystemCoordinator.handleSortPart()
   └── Calls handleEncoderSortPart() (only path now)
           │
           ▼
8. SystemCoordinator.buildEncoderPart()
   ├── Uses data.encoderAtDetection directly (no interpolation!)
   ├── Calls positionTranslator.calculateJetTriggerEncoder()
   └── Returns EncoderPart with jetPosition
           │
           ▼
9. ConveyorManager.insertEncoderPart()
   └── Adds to encoder queue, sorted by jetPosition
           │
           ▼
10. ConveyorManager.processPositionActions() [called on each encoder update]
    ├── Checks if currentEncoder >= jetPosition - JET_LEAD_COUNTS
    └── Sends jet queue command to Arduino
```

---

## Requirements

### Calibration Required

The system will **require calibration** before sorting can work:

```typescript
// Check before sorting
const { cameraWidthInTicks, jetEncoderOffsets } = settings.positionCalibration;
if (cameraWidthInTicks <= 0) {
  throw new Error('Calibration required: run jet position calibration first');
}
```

This is acceptable because:
1. Calibration is a one-time setup step
2. It's already needed for accurate jet firing
3. UI can show clear "Calibration Required" message

---

## Task Dependencies

Understanding dependencies prevents broken intermediate states:

```
Phase 1 (Frontend - Capture Encoder):
  1.1 (ImageCaptureType) → 1.2 (VideoCaptureService)
  1.3 (Detection type) → 1.4 (DetectorService)
  1.8 (SortPartDto) → 1.7 (ClassifierService)
  1.4 + 1.6a → 1.6b (Detection must have encoder before SorterService passes it)
  1.8 + 1.6b → 1.7 (SortPartDto and SorterService ready before ClassifierService)

Phase 2 (Frontend - Remove Speed):
  2.1 (sortProcessStore) can be done after Phase 1 complete
  2.2 (findPositionAtTime) after 1.5 replaces its usage
  2.3 (SocketService) after 2.1 removes store methods
  2.4 (calibrateConveyorSpeed) independent
  2.5 (SorterService.init) after 2.1

Phase 3 (Server - Remove Time-Based):
  3.1 (Delete SpeedManager) → 3.3 (ConveyorManager references)
  3.2 (SystemCoordinator) depends on SortPartDto having encoderAtDetection
  4.1 (settings.type.ts) → 3.2 (useEncoderScheduling check removal)

Phase 4-6 (Types, UI, Tests):
  Can be done in parallel after Phase 3
```

---

## Detailed Task Breakdown

### Phase 1: Frontend - Capture Encoder with Frames

#### Task 1.1: Update ImageCaptureType

**File:** `types/imageCapture.d.ts`

**Current:**
```typescript
export type ImageCaptureType = { imageBitmaps: [ImageBitmap, ImageBitmap]; timestamp: number };
```

**After:**
```typescript
export type ImageCaptureType = {
  imageBitmaps: [ImageBitmap, ImageBitmap];
  timestamp: number;
  encoderAtCapture: number;  // NEW - encoder position when frames were captured
};
```

---

#### Task 1.2: Update VideoCaptureService.captureImage()

**File:** `lib/services/VideoCaptureService.ts`

**Current (lines 114-139):**
```typescript
public async captureImage(): Promise<ImageCaptureType> {
  // ... validation ...
  const captureTime = Date.now();
  const [imageBitmap1, imageBitmap2] = await Promise.all([
    this.imageCapture1.grabFrame(),
    this.imageCapture2.grabFrame(),
  ]);
  return { imageBitmaps: [imageBitmap1, imageBitmap2], timestamp: captureTime };
}
```

**After:**
```typescript
public async captureImage(): Promise<ImageCaptureType> {
  if (!this.imageCapture1 || !this.imageCapture2) {
    const message = 'An ImageCapture not initialized';
    console.error(message);
    alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
    throw new Error(message);
  }

  try {
    // Capture encoder position at the same moment as the frames
    // Read BEFORE async operations to minimize timing skew
    const encoderAtCapture = sortProcessStore.getState().encoderPosition;
    const captureTime = Date.now();
    
    // Warn if encoder data seems stale (no updates in last 2 seconds)
    const encoderTimestamp = sortProcessStore.getState().encoderTimestamp;
    if (encoderTimestamp > 0 && Date.now() - encoderTimestamp > 2000) {
      console.warn('[VIDEO_CAPTURE] Encoder data may be stale - last update was', Date.now() - encoderTimestamp, 'ms ago');
    }
    
    const [imageBitmap1, imageBitmap2] = await Promise.all([
      this.imageCapture1.grabFrame(),
      this.imageCapture2.grabFrame(),
    ]);

    return { 
      imageBitmaps: [imageBitmap1, imageBitmap2], 
      timestamp: captureTime,
      encoderAtCapture  // NEW
    };
  } catch (error) {
    const message = 'Error taking photos: ' + error;
    console.error(message);
    alertStore.getState().addAlert({ type: 'error', message, timestamp: Date.now() });
    throw new Error(message);
  }
}
```

**Note:** `sortProcessStore` is already imported at line 5 of this file.

---

#### Task 1.3: Update Detection Type

**File:** `types/types.ts`

**Current (lines 35-46):**
```typescript
export type Detection = {
  view: 'top' | 'side';
  timestamp: number;
  centroid: { x: number; y: number };
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  imageURI: string;
};
```

**After:**
```typescript
export type Detection = {
  view: 'top' | 'side';
  timestamp: number;
  encoderAtDetection: number;  // NEW - encoder position when frame was captured
  centroid: { x: number; y: number };
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  imageURI: string;
};
```

---

#### Task 1.4: Update DetectorService to Pass Encoder Through

**File:** `lib/services/DetectorService.ts`

**Step 1: Update detect() method (around line 249-316)**

Find the call to `createDetections()` and update it:

**Current:**
```typescript
const DetectionPairs = this.createDetections(
  imageCapture.timestamp,
  mergedCanvas,
  cropCanvas,
  scaledPredictionPairs,
);
```

**After:**
```typescript
const DetectionPairs = this.createDetections(
  imageCapture.timestamp,
  imageCapture.encoderAtCapture,  // NEW parameter
  mergedCanvas,
  cropCanvas,
  scaledPredictionPairs,
);
```

**Step 2: Update createDetections() method signature and implementation (around line 326-371)**

**Current:**
```typescript
private createDetections(
  timestamp: number,
  canvas: HTMLCanvasElement,
  cropCanvas: HTMLCanvasElement,
  predictionsPairs: PredictionsPair[],
): [Detection, Detection][] {
```

**After:**
```typescript
private createDetections(
  timestamp: number,
  encoderAtDetection: number,  // NEW parameter
  canvas: HTMLCanvasElement,
  cropCanvas: HTMLCanvasElement,
  predictionsPairs: PredictionsPair[],
): [Detection, Detection][] {
  const videoWidth = canvas.width;

  return predictionsPairs.map((pair, index) => {
    const topViewDetectionImageURI = this.getCroppedImageURI(canvas, cropCanvas, pair.topView.box);
    const sideViewDetectionImageURI = this.getCroppedImageURI(canvas, cropCanvas, pair.sideView.box);

    const centroidX = pair.topView.box.left + pair.topView.box.width / 2;

    if (index < 5) {
      console.log(`[DETECTION] detection ${index}: x=${centroidX.toFixed(1)}, encoder=${encoderAtDetection}`);
    }

    const topViewDetection: Detection = {
      view: 'top',
      imageURI: topViewDetectionImageURI,
      timestamp,
      encoderAtDetection,  // NEW field
      centroid: {
        x: centroidX,
        y: pair.topView.box.top + pair.topView.box.height / 2,
      },
      box: pair.topView.box,
    };

    const sideViewDetection: Detection = {
      view: 'side',
      imageURI: sideViewDetectionImageURI,
      timestamp,
      encoderAtDetection,  // NEW field
      centroid: {
        x: pair.sideView.box.left + pair.sideView.box.width / 2,
        y: pair.sideView.box.top + pair.sideView.box.height / 2,
      },
      box: pair.sideView.box,
    };

    return [topViewDetection, sideViewDetection];
  });
}
```

---

#### Task 1.5: Update SortPartDto

**File:** `types/sortPart.dto.ts`

**Current:**
```typescript
export const sortPartSchema = z.object({
  partId: z.string(),
  initialTime: z.number(),
  initialPosition: z.number(),
  cameraWidthPixels: z.number().optional(),
  bin: z.number(),
  sorter: z.number(),
});
```

**After:**
```typescript
export const sortPartSchema = z.object({
  /** Unique identifier for this part */
  partId: z.string(),

  /**
   * Timestamp when part was detected (ms since epoch).
   * Kept for logging/debugging.
   */
  initialTime: z.number(),

  /**
   * Pixel X position in camera frame where part was detected.
   * Used with encoderAtDetection for jet position calculation.
   */
  initialPosition: z.number(),

  /**
   * Encoder position (ticks) when the detection frame was captured.
   * This is the ground truth position - no interpolation needed on server.
   */
  encoderAtDetection: z.number(),

  /**
   * Camera width in pixels at the time of detection (optional).
   * Used to verify consistency with calibration settings.
   */
  cameraWidthPixels: z.number().optional(),

  /** Destination bin number determined by classifier */
  bin: z.number(),

  /** Which sorter should handle this part (0-3) */
  sorter: z.number(),
});

export type SortPartDto = z.infer<typeof sortPartSchema>;
```

---

#### Task 1.6a: Update SorterService.classifyDetections() to Pass Encoder

**File:** `lib/services/SorterService.ts`

Find the `classifyDetections()` method (around line 158-208) and update the call to `classifier.classify()`:

**Current (around line 176-186):**
```typescript
classifier
  .classify({
    imageURI1: lastDetectionPair[0].imageURI,
    imageURI2: lastDetectionPair[1].imageURI,
    initialTime: lastDetectionPair[0].timestamp,
    initialPosition: lastDetectionPair[0].centroid.x,
    detectionDimensions: { width: lastDetectionPair[0].box.width, height: lastDetectionPair[0].box.height },
    classificationThresholdPercentage: settings.classificationThresholdPercentage,
    maxPartDimensions: settings.sorters.map((s) => s.maxPartDimensions),
    videoCaptureDimensions,
  })
```

**After:**
```typescript
classifier
  .classify({
    imageURI1: lastDetectionPair[0].imageURI,
    imageURI2: lastDetectionPair[1].imageURI,
    initialTime: lastDetectionPair[0].timestamp,
    initialPosition: lastDetectionPair[0].centroid.x,
    encoderAtDetection: lastDetectionPair[0].encoderAtDetection,  // NEW
    detectionDimensions: { width: lastDetectionPair[0].box.width, height: lastDetectionPair[0].box.height },
    classificationThresholdPercentage: settings.classificationThresholdPercentage,
    maxPartDimensions: settings.sorters.map((s) => s.maxPartDimensions),
    videoCaptureDimensions,
  })
```

---

#### Task 1.6b: Update ClassifierService.classify() Signature and Usage

**File:** `lib/services/ClassifierService.ts`

**Step 1: Update the classify() method signature (around line 179-197)**

**Current:**
```typescript
public async classify({
  imageURI1,
  imageURI2,
  initialTime,
  initialPosition,
  detectionDimensions,
  classificationThresholdPercentage,
  maxPartDimensions,
  videoCaptureDimensions,
}: {
  imageURI1: string;
  imageURI2: string;
  initialTime: number;
  initialPosition: number;
  detectionDimensions: { width: number; height: number };
  classificationThresholdPercentage: number;
  maxPartDimensions: { width: number; height: number }[];
  videoCaptureDimensions: { width: number; height: number };
}): Promise<{ classification: ClassificationItem; reason?: SkipSortReason; error?: string }> {
```

**After:**
```typescript
public async classify({
  imageURI1,
  imageURI2,
  initialTime,
  initialPosition,
  encoderAtDetection,  // NEW
  detectionDimensions,
  classificationThresholdPercentage,
  maxPartDimensions,
  videoCaptureDimensions,
}: {
  imageURI1: string;
  imageURI2: string;
  initialTime: number;
  initialPosition: number;
  encoderAtDetection: number;  // NEW
  detectionDimensions: { width: number; height: number };
  classificationThresholdPercentage: number;
  maxPartDimensions: { width: number; height: number }[];
  videoCaptureDimensions: { width: number; height: number };
}): Promise<{ classification: ClassificationItem; reason?: SkipSortReason; error?: string }> {
```

**Step 2: Update the SortPartDto creation (around line 264-276)**

**Current:**
```typescript
const data: SortPartDto = {
  partId: combinedResult.id,
  initialPosition: backendInitialPosition,
  initialTime,
  bin: resolvedPosition.bin,
  sorter: resolvedPosition.sorter,
  cameraWidthPixels: videoCaptureDimensions.width > 0 ? videoCaptureDimensions.width : undefined,
};
```

**After:**
```typescript
const data: SortPartDto = {
  partId: combinedResult.id,
  initialPosition: backendInitialPosition,
  initialTime,
  encoderAtDetection,  // NEW - pass encoder position to server
  bin: resolvedPosition.bin,
  sorter: resolvedPosition.sorter,
  cameraWidthPixels: videoCaptureDimensions.width > 0 ? videoCaptureDimensions.width : undefined,
};
```

---

#### Task 1.7: Update SorterService Detection Matching

**File:** `lib/services/SorterService.ts`

Replace the `matchDetectionsPairsToGroups()` method (around line 65-155) with encoder-based matching:

**After:**
```typescript
private matchDetectionsPairsToGroups(detectionPairs: [Detection, Detection][]): void {
  // Get calibration settings for encoder-based matching
  const settingsService = serviceManager.getService(ServiceName.SETTINGS);
  const settings = settingsService.getSettings();
  const { cameraWidthInTicks, cameraWidthPixels } = settings.positionCalibration;
  const { width: videoWidth } = sortProcessStore.getState().videoCaptureDimensions;
  
  // Use video width or calibrated width
  const pixelWidth = videoWidth || cameraWidthPixels || 1280;
  
  console.log('=== matchDetectionsPairsToGroups START (encoder-based) ===');
  console.log(`  Incoming detection pairs: ${detectionPairs.length}`);
  console.log(`  Existing groups: ${this.detectionPairGroups.length}`);
  console.log(`  cameraWidthInTicks: ${cameraWidthInTicks}, pixelWidth: ${pixelWidth}`);
  
  // Check if calibration is available for encoder-based matching
  if (!cameraWidthInTicks || cameraWidthInTicks <= 0) {
    console.warn('[MATCH] Calibration required - falling back to creating new groups for each detection');
    // Without calibration, just create new groups (no cross-frame matching)
    for (const detectionPair of detectionPairs) {
      const newGroup: DetectionPairGroup = { id: uuid(), detectionPairs: [detectionPair] };
      this.detectionPairGroups.unshift(newGroup);
      sortProcessStore.getState().addDetectionPairGroup(newGroup);
    }
    return;
  }
  
  // Helper: convert pixel position to ticks from camera left edge
  const pixelToTicks = (pixelX: number) => (pixelX / pixelWidth) * cameraWidthInTicks;
  
  // Helper: calculate "absolute encoder position" (encoder value when part crossed camera left edge)
  const getAbsolutePos = (detection: Detection) => 
    detection.encoderAtDetection - pixelToTicks(detection.centroid.x);
  
  // Matching threshold in encoder ticks (~20% of camera width, minimum 50)
  const MATCH_THRESHOLD_TICKS = Math.max(50, cameraWidthInTicks * 0.20);
  
  for (const detectionPair of detectionPairs) {
    const newDetection = detectionPair[0]; // Use top view for matching
    const newAbsolutePos = getAbsolutePos(newDetection);
    
    console.log(`\n  Processing detection: x=${newDetection.centroid.x.toFixed(1)}, encoder=${newDetection.encoderAtDetection}, absolutePos=${newAbsolutePos.toFixed(1)}`);
    
    let closestGroupIndex: number | null = null;
    let closestDelta = MATCH_THRESHOLD_TICKS;
    
    for (let i = 0; i < this.detectionPairGroups.length; i++) {
      const group = this.detectionPairGroups[i];
      const lastPair = group.detectionPairs[group.detectionPairs.length - 1];
      const lastDetection = lastPair?.[0];
      
      if (!lastDetection || lastDetection.encoderAtDetection === undefined) {
        console.log(`    Group ${i}: No encoder data, skipping`);
        continue;
      }
      
      const lastAbsolutePos = getAbsolutePos(lastDetection);
      const delta = Math.abs(newAbsolutePos - lastAbsolutePos);
      
      console.log(`    Group ${i}: lastAbsolutePos=${lastAbsolutePos.toFixed(1)}, delta=${delta.toFixed(1)}, threshold=${closestDelta.toFixed(1)}, MATCH=${delta < closestDelta}`);
      
      if (delta < closestDelta) {
        closestDelta = delta;
        closestGroupIndex = i;
      }
    }
    
    if (closestGroupIndex !== null) {
      // Match found - add to existing group
      console.log(`  ✓ MATCHED to group ${closestGroupIndex} (id: ${this.detectionPairGroups[closestGroupIndex].id}), delta: ${closestDelta.toFixed(1)} ticks`);
      this.detectionPairGroups[closestGroupIndex].detectionPairs.push(detectionPair);
      sortProcessStore
        .getState()
        .addDetectionPairToGroup(this.detectionPairGroups[closestGroupIndex].id, detectionPair);
    } else {
      // No match - create new group
      const newGroup: DetectionPairGroup = { id: uuid(), detectionPairs: [detectionPair] };
      console.log(`  ✗ NO MATCH - Creating new group (id: ${newGroup.id})`);
      this.detectionPairGroups.unshift(newGroup);
      sortProcessStore.getState().addDetectionPairGroup(newGroup);
    }
  }
  
  console.log(`=== matchDetectionsPairsToGroups END - Total groups: ${this.detectionPairGroups.length} ===\n`);
}
```

---

#### Task 1.8: Update markOffscreenDetections()

**File:** `lib/services/SorterService.ts`

Replace the `markOffscreenDetections()` method (around line 229-246) with encoder-based calculation:

**After:**
```typescript
private markOffscreenDetections(): void {
  const settingsService = serviceManager.getService(ServiceName.SETTINGS);
  const settings = settingsService.getSettings();
  const { cameraWidthInTicks, cameraWidthPixels, jetEncoderOffsets, jetLeadCounts } = settings.positionCalibration;
  const { width: videoWidth } = sortProcessStore.getState().videoCaptureDimensions;
  const currentEncoder = sortProcessStore.getState().encoderPosition;
  
  // Use video width or calibrated width
  const pixelWidth = videoWidth || cameraWidthPixels || 1280;
  
  // Skip if no calibration
  if (!cameraWidthInTicks || cameraWidthInTicks <= 0) {
    return;
  }
  
  // Use the furthest jet as the "off-screen" boundary
  const maxJetOffset = Math.max(...jetEncoderOffsets.filter(o => o > 0));
  if (maxJetOffset <= 0) {
    return; // No valid jet offsets
  }
  
  const pixelToTicks = (pixelX: number) => (pixelX / pixelWidth) * cameraWidthInTicks;
  
  // Buffer: use jetLeadCounts (when jet command is sent) as a reasonable off-screen threshold
  const offscreenBuffer = jetLeadCounts || 100;
  
  for (const group of this.detectionPairGroups) {
    if (group.offScreen) continue;
    
    const lastPair = group.detectionPairs[group.detectionPairs.length - 1];
    const lastDetection = lastPair[0];
    
    if (lastDetection.encoderAtDetection === undefined) continue;
    
    // Calculate absolute position (encoder value when part crossed camera left edge)
    const absolutePos = lastDetection.encoderAtDetection - pixelToTicks(lastDetection.centroid.x);
    
    // Part is off-screen when encoder has passed beyond the part's jet position + buffer
    const partJetPosition = absolutePos + maxJetOffset;
    
    if (currentEncoder > partJetPosition + offscreenBuffer) {
      group.offScreen = true;
    }
  }
}
```

---

### Phase 1 Validation Checklist

After completing Phase 1, verify:
- [ ] `npx tsc --noEmit` passes with no type errors
- [ ] Detection objects logged in console show `encoderAtDetection` values
- [ ] SORT_PART messages (check Network tab or console) include `encoderAtDetection`
- [ ] Detection matching still works (parts track across multiple frames)
- [ ] Parts are correctly grouped together based on encoder position

---

### Phase 2: Frontend - Remove Speed-Related Code

#### Task 2.1: Update sortProcessStore

**File:** `stores/sortProcessStore.ts`

**Remove these from the state type and implementation:**

```typescript
// REMOVE from SortProcessState type (around line 31-33):
conveyorSpeed: number;
conveyorSpeedLog: { time: number; speed: number }[];
setConveyorSpeed: (speed: number) => void;

// REMOVE from store implementation (around line 106-118):
conveyorSpeed: 0,
conveyorSpeedLog: [],
setConveyorSpeed: (speed: number) => {
  console.log(`[sortProcessStore.setConveyorSpeed] Setting speed to: ${speed}`);
  set((state) => {
    const now = Date.now();
    const speedLog = [...state.conveyorSpeedLog, { time: now, speed }].filter((log) => now - log.time < 60 * 1000);
    console.log(
      `[sortProcessStore.setConveyorSpeed] New speedLog entry added at t=${now}, total entries: ${speedLog.length}`,
    );
    return { conveyorSpeed: speed, conveyorSpeedLog: speedLog };
  });
},
```

**Keep these (encoder state):**
```typescript
encoderPosition: number;
encoderTimestamp: number;
encoderVelocity: number;
setEncoderState: (position: number, timestamp: number, velocity: number) => void;
```

---

#### Task 2.2: Remove findPositionAtTime Utility

**File:** `lib/utils.ts`

**Remove SpeedLogEntry type (line 39):**

```typescript
// REMOVE:
export type SpeedLogEntry = { time: number; speed: number };
```

**Remove findPositionAtTime function (lines 41-115):**

```typescript
// REMOVE entire function (~75 lines):
export const findPositionAtTime = (
  startPos: number,
  startTime: number,
  endTime: number,
  speedLog: SpeedLogEntry[],
  defaultSpeed: number,
): number => {
  // ... entire function body ...
};
```

**After removal, the file should only contain:**
- `cn()` function (Tailwind class merging)
- `absoluteUrl()` function  
- `getFormattedTime()` function
- `getSorterLetter()` function

---

#### Task 2.3: Remove Obsolete Socket Event Listeners

**File:** `lib/services/SocketService.ts`

**Remove CONVEYOR_SPEED_UPDATE listener (around line 50-53):**

```typescript
// REMOVE:
this.socket.on(AllEvents.CONVEYOR_SPEED_UPDATE, (speed: number) => {
  console.log('CONVEYOR_SPEED_UPDATE: ', speed);
  sortProcessStore.getState().setConveyorSpeed(speed);
});
```

**Remove PART_SORTED listener (around line 59-61):**

```typescript
// REMOVE:
this.socket.on(AllEvents.PART_SORTED, () => {
  sortProcessStore.getState().handlePartSorted();
});
```

**Note:** The `handlePartSorted()` is now called by the ENCODER_PART_SORTED listener, which already exists at line 82-85.

---

#### Task 2.4: Remove calibrateConveyorSpeed Method and Helper

**File:** `lib/services/DetectorService.ts`

**Remove the entire calibrateConveyorSpeed method (around line 108-209):**

```typescript
// REMOVE entire method (~100 lines):
async calibrateConveyorSpeed(): Promise<number> {
  // ... implementation ...
}
```

**Remove computeTrimmedMean helper method (around line 239-246):**

```typescript
// REMOVE - only used by calibrateConveyorSpeed:
private computeTrimmedMean(values: number[], trimFraction: number): number {
  if (values.length === 0) return 0;
  const n = values.length;
  const k = Math.floor(n * trimFraction);
  const trimmed = values.slice(k, Math.max(k, n - k));
  const sum = trimmed.reduce((acc, v) => acc + v, 0);
  return sum / Math.max(1, trimmed.length);
}
```

**KEEP computeIoU method** - it's used by `tagPredictions()` for detection pairing.

---

#### Task 2.5: Remove Speed Initialization from SorterService.init()

**File:** `lib/services/SorterService.ts`

**Remove these lines from init() (around line 42-51):**

```typescript
// REMOVE:
// Initialize conveyor speed in the store from settings
const initialSpeed = settingsService.getSettings().conveyorSpeed;
console.log(`[SorterService.init] Setting initial conveyor speed from settings: ${initialSpeed}`);
sortProcessStore.getState().setConveyorSpeed(initialSpeed);

// Verify it was set
const { conveyorSpeed, conveyorSpeedLog } = sortProcessStore.getState();
console.log(
  `[SorterService.init] After init - conveyorSpeed: ${conveyorSpeed}, speedLog entries: ${conveyorSpeedLog.length}`,
);
```

**Also remove the import of findPositionAtTime at the top of the file (line 12):**
```typescript
// REMOVE:
import { findPositionAtTime } from '../utils';
```

---

### Phase 2 Validation Checklist

After completing Phase 2, verify:
- [ ] `npx tsc --noEmit` passes (all speed references removed from frontend)
- [ ] `conveyorSpeed` and `conveyorSpeedLog` don't appear in React DevTools store state
- [ ] No console errors about missing speed functions or properties
- [ ] Frontend still compiles and loads without errors

---

### Phase 3: Server - Remove Time-Based Scheduling

#### Task 3.1: Delete SpeedManager.ts

**File:** `server/components/SpeedManager.ts`

**Action:** Delete the entire file.

---

#### Task 3.2: Update SystemCoordinator - Remove Time-Based Path

**File:** `server/SystemCoordinator.ts`

**Step 1: Remove SpeedManager import and property**

```typescript
// REMOVE import (line 8):
import { SpeedManager } from './components/SpeedManager';

// REMOVE from class properties (line 24):
private speedManager: SpeedManager;

// REMOVE from constructor (lines 53-57):
this.speedManager = new SpeedManager({
  deviceManager: this.deviceManager,
  socketManager: this.socketManager,
  settingsManager: this.settingsManager,
});

// REMOVE speedManager from ConveyorManager config (line 69):
speedManager: this.speedManager,

// REMOVE buildPart from ConveyorManager config (line 71):
buildPart: this.buildPart.bind(this),

// REMOVE from initializeComponents() (lines 115-117):
console.log('Initializing SpeedManager...');
await this.speedManager.initialize();
console.log('SpeedManager initialized successfully.');
```

**Step 2: Simplify handleSortPart() (replace lines 139-158)**

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
      console.error('[SORT] Missing encoderAtDetection in SORT_PART message');
      this.socketManager.emitEncoderPartSkipped(data.partId, 'Missing encoder data from frontend', data.sorter, data.bin);
      return;
    }

    // Check calibration
    const { cameraWidthInTicks, jetEncoderOffsets } = settings.positionCalibration;
    if (cameraWidthInTicks <= 0 || jetEncoderOffsets.every(o => o === 0)) {
      console.error('[SORT] Calibration required - cannot sort part');
      this.socketManager.emitEncoderPartSkipped(data.partId, 'Calibration required', data.sorter, data.bin);
      return;
    }

    // Encoder-based scheduling only
    this.handleEncoderSortPart(data);
  } catch (error) {
    console.error('Error handling sort part:', error);
  }
}
```

**Step 3: Remove handleTimeSortPart() method entirely (lines 218-264)**

```typescript
// REMOVE entire method:
private handleTimeSortPart(
  data: SortPartDto,
  settings: NonNullable<ReturnType<typeof this.settingsManager.getSettings>>,
): void {
  // ... entire method body ...
}
```

**Step 4: Remove buildPart() method entirely (lines 266-335)**

```typescript
// REMOVE entire method:
private buildPart(data: SortPartDto): Part {
  // ... entire method body ...
}
```

**Step 5: Simplify buildEncoderPart() to use encoderAtDetection directly (around line 348-438)**

The key simplification: no more interpolation. The frontend provides the exact encoder position.

**Replace the entire buildEncoderPart method with this simplified version:**

```typescript
/**
 * Builds an EncoderPart for position-based scheduling.
 * Returns null if the sorter is unavailable (part should be skipped).
 */
private buildEncoderPart(data: SortPartDto): EncoderPart | null {
  const { partId, initialPosition, initialTime, encoderAtDetection, bin, sorter, cameraWidthPixels: providedCameraWidth } = data;

  // Get calibration settings
  const calibration = this.positionTranslator.getCalibration();
  
  // Determine effective camera width: prefer provided value from frontend
  let effectiveCameraWidthPixels = calibration.cameraWidthPixels;
  if (providedCameraWidth && providedCameraWidth > 0) {
    if (calibration.cameraWidthPixels !== providedCameraWidth) {
      console.warn(
        `[ENCODER_PART] Camera width mismatch: calibration=${calibration.cameraWidthPixels}px, ` +
          `actual=${providedCameraWidth}px. Using actual value.`,
      );
    }
    effectiveCameraWidthPixels = providedCameraWidth;
  }

  // Use encoderAtDetection directly from frontend - no interpolation needed!
  const detectionEncoderPos = encoderAtDetection;

  // Calculate jet fire position using calibration
  const jetPosition = this.positionTranslator.calculateJetTriggerEncoder(
    initialPosition,           // pixelX from detection
    detectionEncoderPos,       // encoder at detection (from frontend directly)
    sorter,                    // jet index
    effectiveCameraWidthPixels,
  );

  // Calculate the position by which the sorter must be ready
  const requiredByPosition = this.positionTranslator.calculateRequiredByPosition(jetPosition);

  // Check if sorter can reach the bin in time
  const availability = this.sorterStateManager.canSorterReachBin(sorter, bin, requiredByPosition);

  if (!availability.available) {
    console.log(`[ENCODER_PART] Part ${partId} - sorter ${sorter} unavailable: ${availability.reason}`);
    return null;
  }

  // Get the effective "from bin" for lead count calculation
  const fromBin = this.sorterStateManager.getEffectiveFromBin(sorter);
  const leadCounts = this.sorterStateManager.calculateLeadCounts(sorter, fromBin, bin);

  // Build the encoder part
  const encoderPart: EncoderPart = {
    partId,
    detectionEncoderPos,
    jetPosition,
    jet: sorter,
    sorter,
    bin,
    moveTriggerPosition: availability.triggerPosition,
    expectedMoveCompletePosition: availability.triggerPosition + leadCounts,
    jetCommandSent: false,
    moveCommandSent: false,
    status: 'scheduled',
    detectionTime: initialTime,
    pixelPosition: initialPosition,
  };

  console.log('[ENCODER_PART] Built encoder part:', {
    partId,
    detectionEncoderPos,
    jetPosition,
    sorter,
    bin,
  });

  return encoderPart;
}
```

**Also remove these now-unused items from buildEncoderPart:**
- `isCalibrated` check - calibration is now required (validated in handleSortPart)
- `getEncoderPositionAtTime()` call - no interpolation needed
- `pixelToEncoderPosition()` call - legacy method
- `calculateJetPosition()` call - legacy method

---

#### Task 3.3: Update ConveyorManager - Remove Speed Code and useEncoderScheduling Checks

**File:** `server/components/ConveyorManager.ts`

**Step 0: Remove useEncoderScheduling checks**

These checks gate encoder functionality behind the flag. Since encoder-based is now the only path, remove them:

**In handleJetFired() (around line 624-626) - REMOVE this check:**
```typescript
// REMOVE this entire block:
const settings = this.settingsManager.getSettings();
if (!settings?.useEncoderScheduling) {
  return;
}
```

**In processPositionActions() (around line 813) - REMOVE this check:**
```typescript
// REMOVE this entire block (including the #region agent log around it):
if (!settings?.useEncoderScheduling) {
  // Log only occasionally to avoid spam (every 5 seconds)
  if (!this._lastEncoderSkipLog || Date.now() - this._lastEncoderSkipLog > 5000) {
    // ... all the fetch logging ...
  }
  return;
}
```

Also **REMOVE** the `_lastEncoderSkipLog` property (line 914):
```typescript
// REMOVE:
private _lastEncoderSkipLog?: number;
```

**Step 1: Remove from interface (lines 21-30)**

```typescript
// REMOVE from ConveyorManagerConfig interface:
speedManager: SpeedManager;
buildPart: (part: SortPartDto) => Part;
```

**Step 2: Remove import**

```typescript
// REMOVE import (line 7):
import { SpeedManager } from './SpeedManager';

// REMOVE Part import if no longer needed (line 5):
// Change: import { Part, EncoderPart } from '../../types/part.type';
// To: import { EncoderPart } from '../../types/part.type';
```

**Step 3: Remove class properties (around lines 33-45)**

```typescript
// REMOVE:
private speedManager: SpeedManager;
private buildPart: (part: SortPartDto) => Part;
private partQueue: Part[] = [];
private speedLog: { time: number; speed: number }[] = [];
private returnToDefaultConveyorSpeed: ReturnToDefaultSpeed | null = null;

// ALSO REMOVE the ReturnToDefaultSpeed interface at top of file (lines 15-19):
interface ReturnToDefaultSpeed {
  time: number;
  speed: number;
  ref: NodeJS.Timeout;
}
```

**Step 4: Remove from constructor (lines 109-116)**

```typescript
// REMOVE:
this.speedManager = config.speedManager;
this.buildPart = config.buildPart;
```

**Step 5: Remove from initialize() (lines 135-138)**

```typescript
// REMOVE:
this.partQueue = [];
this.speedLog = [];
```

**Step 6: Remove from deinitialize() (lines 173-186)**

```typescript
// REMOVE all Part queue cleanup:
this.partQueue.forEach((part) => {
  if (part.moveRef) clearTimeout(part.moveRef);
  if (part.jetRef) clearTimeout(part.jetRef);
  if (part.conveyorSpeedRef) clearTimeout(part.conveyorSpeedRef);
});
if (this.returnToDefaultConveyorSpeed) {
  clearTimeout(this.returnToDefaultConveyorSpeed.ref);
  this.returnToDefaultConveyorSpeed = null;
}
this.partQueue = [];
this.speedLog = [];
```

**Step 7: Remove time-based methods entirely:**

Remove these methods completely:
- `getCurrentSpeed()` (line 194-196)
- `getJetPosition()` (line 198-200)
- `findPreviousSorterPart()` (line 202-207)
- `findPreviousConveyorPart()` (line 209-214)
- `findNextConveyorPart()` (line 216-218)
- `trimSpeedLog()` (line 220-231)
- `addSpeedToLog()` (line 233-236)
- `findTimeAfterDistance()` (line 238-318)
- `scheduleJetFire()` (line 320-326)
- `scheduleReturnToDefaultSpeed()` (line 328-348)
- `insertPart()` (line 350-371)
- `updateNextPart()` (line 373-395)
- `updateAllFutureParts()` (line 397-440)
- `schedulePartActions()` (line 442-458)
- `cancelPartActions()` (line 460-466)
- `markPartSorted()` (line 468-476)
- `filterQueue()` (line 478-484)
- `getPartQueue()` (line 486-488)

**KEEP these methods:**
- All encoder-based methods (lines 490+)
- `toggleConveyor()`
- `handleConveyorData()`
- `updateEncoderPosition()`
- `handleJetFired()`
- `getInterpolatedPosition()`
- `isEncoderDataStale()`
- `getCurrentEncoderPosition()`
- `getEncoderVelocity()`
- `getEncoderSnapshot()`
- `insertEncoderPart()`
- `removeEncoderPart()`
- `getActionableParts()`
- `getEncoderPartQueue()`
- `clearEncoderPartQueue()`
- `setSorterStateManager()`
- `processPositionActions()`
- `queueJetFire()`
- `sendMoveCommand()`
- `requestEncoderPosition()`
- `resetEncoderPosition()`
- `notifyStatusChange()`

---

#### Task 3.4: Remove Speed and Time-Based Methods from SocketManager

**File:** `server/components/SocketManager.ts`

**Remove emitConveyorSpeedUpdate (lines 177-179):**

```typescript
// REMOVE:
public emitConveyorSpeedUpdate(speed: number): void {
  this.socket?.emit(BackToFrontEvents.CONVEYOR_SPEED_UPDATE, speed);
}
```

**Remove emitPartSorted (lines 125-128):**

```typescript
// REMOVE:
public emitPartSorted(part: Part): void {
  if (!this.socket) return;
  this.socket.emit(BackToFrontEvents.PART_SORTED, { part });
}
```

**Remove emitPartSkipped (lines 130-133):**

```typescript
// REMOVE:
public emitPartSkipped(part: Part): void {
  if (!this.socket) return;
  this.socket.emit(BackToFrontEvents.PART_SKIPPED, { part });
}
```

**Update imports at top of file (line 5):**

```typescript
// CHANGE from:
import { Part, EncoderPart } from '../../types/part.type';
// TO:
import { EncoderPart } from '../../types/part.type';
```

---

#### Task 3.5: Update PositionTranslator - Remove Interpolation Methods

**File:** `server/components/PositionTranslator.ts`

The `getEncoderPositionAtTime()` method is no longer needed since the frontend provides `encoderAtDetection` directly. However, we should keep it for now as a fallback, but mark it as deprecated.

**Add deprecation notice to getEncoderPositionAtTime() (around line 115):**

```typescript
/**
 * @deprecated No longer used - frontend now provides encoderAtDetection directly.
 * Kept for backwards compatibility during transition.
 * 
 * Gets the raw encoder position at a specific point in time...
 */
public getEncoderPositionAtTime(detectionTime: number): number {
  // ... existing implementation ...
}
```

**Also add deprecation to pixelToEncoderPosition() (around line 59):**

```typescript
/**
 * @deprecated Use calculateJetTriggerEncoder() instead.
 * This method uses the old calibration system (cameraEncoderOffset, countsPerPixel).
 * ...
 */
public pixelToEncoderPosition(pixelX: number, detectionTime: number): number {
  // ... existing implementation ...
}
```

---

### Phase 3 Validation Checklist

After completing Phase 3, verify:
- [ ] `npx tsc --noEmit` passes (server compiles without errors)
- [ ] Server starts without errors (`npm run dev` or equivalent)
- [ ] No references to SpeedManager in imports
- [ ] `useEncoderScheduling` flag check is removed from handleSortPart
- [ ] Parts are scheduled using encoder positions
- [ ] Jets fire at correct positions (test with actual hardware)

---

### Phase 4: Settings & Types Cleanup

#### Task 4.1: Update settings.type.ts

**File:** `types/settings.type.ts`

**Remove these from settingsSchema (around lines 81-122):**

```typescript
// REMOVE:
conveyorSpeed: z.coerce.number().min(0, { message: 'Conveyor speed must be a non-negative number' }).default(1),
minConveyorRPM: z.coerce
  .number()
  .min(0, { message: 'Minimum conveyor RPM must be a non-negative number' })
  .default(50),
constantConveyorSpeed: z.boolean().default(false),
useEncoderScheduling: z.boolean().default(false),
```

**KEEP these:**
```typescript
maxConveyorRPM: z.coerce
  .number()
  .min(0, { message: 'Maximum conveyor RPM must be a non-negative number' })
  .default(100),
conveyorPulsesPerRevolution: z.coerce.number().min(0).default(20),
conveyorKp: z.coerce.number().min(0).default(1.0),
conveyorKi: z.coerce.number().min(0).default(0.15),
conveyorKd: z.coerce.number().min(0).default(0.0),
```

**Remove from sorterSettingsSchema (lines 48-76):**

```typescript
// REMOVE (keep other sorter settings):
jetPositionStart: z.coerce
  .number()
  .min(0, { message: 'Start jet position must be a non-negative number' })
  .max(99999, { message: 'Start jet position exceeds maximum allowed value' })
  .default(0),
```

**Note:** Firebase settings may still contain the removed fields. Zod will ignore them when parsing, which is safe.

---

#### Task 4.2: Update part.type.ts

**File:** `types/part.type.ts`

**Remove the entire Part interface (lines 5-23):**

```typescript
// REMOVE entire interface:
export interface Part {
  partId: string;
  sorter: number;
  bin: number;
  initialPosition: number;
  initialTime: number;
  jetTime: number;
  jetRef?: NodeJS.Timeout;
  moveTime: number;
  moveRef?: NodeJS.Timeout;
  moveFinishedTime: number;
  defaultArrivalTime: number;
  arrivalTimeDelay: number;
  conveyorSpeed: number;
  conveyorSpeedTime: number;
  conveyorSpeedRef?: NodeJS.Timeout;
  status: 'pending' | 'completed' | 'skipped';
}
```

**Keep EncoderPart (lines 25-74).**

---

#### Task 4.3: Update socketMessage.type.ts

**File:** `types/socketMessage.type.ts`

**Remove Part import (line 4):**

```typescript
// REMOVE this import entirely:
import { Part } from './part.type';
```

**Remove from BackToFrontEvents enum:**

```typescript
// REMOVE these three lines:
CONVEYOR_SPEED_UPDATE = 'conveyor-speed-update',
PART_SORTED = 'part-sorted',
PART_SKIPPED = 'part-skipped',
```

**Remove from EventPayloads:**

```typescript
// REMOVE these three entries:
[BackToFrontEvents.CONVEYOR_SPEED_UPDATE]: number;
[BackToFrontEvents.PART_SORTED]: { part: Part };
[BackToFrontEvents.PART_SKIPPED]: { part: Part };
```

**Note:** The encoder-based events (ENCODER_PART_SORTED, ENCODER_PART_SKIPPED) replace these.

---

### Phase 5: Settings Form UI Updates

#### Task 5.1: Update SettingsForm.tsx - Remove Obsolete Fields

**File:** `components/SettingsForm.tsx`

**Remove these FormField blocks:**

1. **Conveyor Speed field (lines 57-69):**
```tsx
// REMOVE entire FormField for "conveyorSpeed"
<FormField
  control={form.control}
  name="conveyorSpeed"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Conveyor Speed</FormLabel>
      // ...
    </FormItem>
  )}
/>
```

2. **Minimum Conveyor RPM field (lines 83-95):**
```tsx
// REMOVE entire FormField for "minConveyorRPM"
```

3. **Constant Conveyor Speed checkbox (lines 149-176):**
```tsx
// REMOVE entire HoverCard containing "constantConveyorSpeed" checkbox
```

4. **Enable Encoder-Based Scheduling checkbox (lines 364-390):**
```tsx
// REMOVE entire HoverCard containing "useEncoderScheduling" checkbox
```

5. **Start Jet Position per sorter (lines 529-541):**
```tsx
// REMOVE entire FormField for "sorters.${index}.jetPositionStart"
```

6. **Camera Encoder Offset (deprecated) (lines 394-406):**
```tsx
// REMOVE or mark as "Legacy" - the positionCalibration.cameraEncoderOffset field
```

7. **Counts Per Pixel (deprecated) (lines 408-420):**
```tsx
// REMOVE or mark as "Legacy" - the positionCalibration.countsPerPixel field
```

---

#### Task 5.2: Add Missing Calibration Fields to SettingsForm.tsx

**File:** `components/SettingsForm.tsx`

**Add these fields to the Position Calibration section (inside the grid around line 392):**

```tsx
{/* Camera Width in Ticks */}
<FormField
  control={form.control}
  name="positionCalibration.cameraWidthInTicks"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Camera Width (ticks)</FormLabel>
      <FormControl>
        <Input type="number" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>

{/* Camera Width in Pixels */}
<FormField
  control={form.control}
  name="positionCalibration.cameraWidthPixels"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Camera Width (pixels)</FormLabel>
      <FormControl>
        <Input type="number" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

### Phase 6: Tests & Documentation Updates

#### Task 6.1: Update Test Mocks

**File:** `__tests__/mocks/mockSettingsManager.ts`

**Remove from mock settings:**
```typescript
// REMOVE:
conveyorSpeed: 1,
minConveyorRPM: 50,
constantConveyorSpeed: false,
useEncoderScheduling: false,
```

**Ensure mock includes:**
```typescript
positionCalibration: {
  cameraWidthInTicks: 150,
  cameraWidthPixels: 1280,
  jetEncoderOffsets: [500, 600, 700, 800],
  fallTimeInCounts: 24,
  jetLeadCounts: 100,
  cameraEncoderOffset: 0,  // Legacy, can be 0
  countsPerPixel: 1,       // Legacy, can be 1
},
```

---

#### Task 6.1b: Fix Mock Detection in detectionPairs.d.ts

**File:** `types/detectionPairs.d.ts`

The mock Detection objects (lines 46-52) don't match the actual type. **Replace the mock data section (lines 43-93):**

```typescript
// --- Mock Data ---

// Mocking a Detection object
const mockDetection: Detection = {
  view: 'top',
  timestamp: Date.now(),
  encoderAtDetection: 5000,
  centroid: { x: 640, y: 360 },
  box: { left: 600, top: 320, width: 80, height: 80 },
  imageURI: 'data:image/jpeg;base64,mock',
};

// Mocking a BrickognizeResponse object
const mockBrickognizeResponse: BrickognizeResponse = {
  listing_id: 'resp123',
  bounding_box: {
    left: 0,
    upper: 0,
    right: 100,
    lower: 100,
    image_width: 299,
    image_height: 299,
    score: 0.95,
  },
  items: [
    {
      id: '3001',
      score: 0.95,
      name: '2x4 Brick',
      img_url: 'https://example.com/brick.jpg',
      external_sites: [],
      category: 'Basic Brick',
      type: 'brick',
    },
  ],
};

// Mocking a ClassificationItem object
const mockClassificationItem: ClassificationItem = {
  type: 'brick',
  score: 0.95,
  id: '3001',
  name: '2x4 Brick',
  img_url: 'https://example.com/brick.jpg',
  external_sites: [],
  category: 'Basic Brick',
  bin: 5,
  sorter: 1,
};

// Creating a DetectionPairGroup with fake data
export const mockDetectionPairGroup: DetectionPairGroup = {
  id: 'group123',
  detectionPairs: [[mockDetection, { ...mockDetection, view: 'side' }]],
  offScreen: false,
  indexUsedToClassify: 0,
  classificationResult: mockClassificationItem,
};
```

---

#### Task 6.2: Update Settings Schema Tests

**File:** `__tests__/unit/settingsSchema.test.ts`

**Remove or update tests for:**
- `conveyorSpeed` validation
- `minConveyorRPM` validation
- `constantConveyorSpeed` default value
- `useEncoderScheduling` default value
- `jetPositionStart` per sorter

**Add tests for:**
- `cameraWidthInTicks` validation (must be > 0 for sorting to work)
- `cameraWidthPixels` validation
- `jetEncoderOffsets` array validation

---

#### Task 6.3: Update Documentation

**Files to update:**
- `_docs/BACKEND_ARCHITECTURE.md`
- `_docs/FRONTEND_ARCHITECTURE.md`
- `_docs/SYSTEM_ARCHITECTURE.md`
- `_docs/CALIBRATION_TESTING.md`

**Remove all references to:**
- Variable conveyor speed
- `conveyorSpeed` setting (pixels/ms)
- `speedLog` / `conveyorSpeedLog`
- Time-based scheduling path
- `SpeedManager` class
- `findPositionAtTime()` function
- `useEncoderScheduling` flag (it's now always encoder-based)
- `Part` type (only `EncoderPart` exists now)
- `PART_SORTED` / `PART_SKIPPED` events

**Add/Update documentation for:**
- Encoder-based detection matching algorithm
- `encoderAtDetection` flow from capture to jet firing
- Calibration requirements (`cameraWidthInTicks`, `jetEncoderOffsets`)
- The simplified data flow (no time-based path)
- Encoder-only events (`ENCODER_PART_SORTED`, `ENCODER_PART_SKIPPED`)

---

#### Task 6.4: Remove Debug Logging (Required)

**Remove all `#region agent log` blocks** - These are development artifacts that add unnecessary HTTP calls.

**Files with debug fetch calls to remove:**
- `server/components/ConveyorManager.ts` - Multiple `fetch('http://127.0.0.1:7242/ingest/...')` blocks
- `server/components/PositionTranslator.ts` - Debug fetch calls
- `server/SystemCoordinator.ts` - Debug fetch calls

**How to find them:** Search for `#region agent log` and remove the entire block from `// #region` to `// #endregion`.

Example of what to remove:
```typescript
// #region agent log
fetch('http://127.0.0.1:7242/ingest/77bec187-a61d-4074-85de-e8b63550bba7',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({...})
}).catch(()=>{});
// #endregion
```

**Total locations:** Approximately 6-8 blocks across the three files.

---

## Migration Checklist

### Before Starting

- [ ] Create a git branch for this refactor (e.g., `refactor/constant-speed-simplification`)
- [ ] Ensure calibration data exists in Firebase (or system will error on sort)
- [ ] Backup Firebase settings document
- [ ] Run `npx tsc --noEmit` to verify clean starting state
- [ ] Note current behavior for comparison testing

### Phase 1: Frontend (Encoder Capture)

- [ ] 1.1: Update `ImageCaptureType` in `types/imageCapture.d.ts`
- [ ] 1.2: Update `VideoCaptureService.captureImage()` in `lib/services/VideoCaptureService.ts`
- [ ] 1.3: Update `Detection` type in `types/types.ts`
- [ ] 1.4: Update `DetectorService` to pass encoder in `lib/services/DetectorService.ts`
- [ ] 1.5: Update `SortPartDto` in `types/sortPart.dto.ts`
- [ ] 1.6a: Update `SorterService.classifyDetections()` to pass encoder
- [ ] 1.6b: Update `ClassifierService.classify()` signature and usage
- [ ] 1.7: Update `SorterService.matchDetectionsPairsToGroups()` - encoder-based matching
- [ ] 1.8: Update `SorterService.markOffscreenDetections()` - encoder-based
- [ ] **Validation**: `npx tsc --noEmit` passes, detections show `encoderAtDetection` in console

### Phase 2: Frontend (Remove Speed)

- [ ] 2.1: Update `sortProcessStore` - remove speed state
- [ ] 2.2: Remove `findPositionAtTime()` and `computeTrimmedMean()` from `lib/utils.ts`
- [ ] 2.3: Remove `CONVEYOR_SPEED_UPDATE` and `PART_SORTED` listeners from `SocketService.ts`
- [ ] 2.4: Remove `calibrateConveyorSpeed()` from `DetectorService.ts`
- [ ] 2.5: Remove speed initialization from `SorterService.init()`
- [ ] **Validation**: `npx tsc --noEmit` passes, no `conveyorSpeed` in React DevTools store

### Phase 3: Server (Remove Time-Based)

- [ ] 3.1: Delete `SpeedManager.ts`
- [ ] 3.2: Update `SystemCoordinator` - remove time path, add encoderAtDetection validation
- [ ] 3.3: Update `ConveyorManager` - remove time-based code AND useEncoderScheduling checks
- [ ] 3.4: Remove `emitConveyorSpeedUpdate`, `emitPartSorted`, `emitPartSkipped` from `SocketManager.ts`
- [ ] 3.5: Add deprecation notices to `PositionTranslator` legacy methods
- [ ] **Validation**: Server starts without errors, `useEncoderScheduling` not referenced

### Phase 4: Types & Settings

- [ ] 4.1: Update `settings.type.ts` - remove obsolete settings
- [ ] 4.2: Update `part.type.ts` - remove Part interface entirely
- [ ] 4.3: Update `socketMessage.type.ts` - remove CONVEYOR_SPEED_UPDATE, PART_SORTED, PART_SKIPPED
- [ ] **Validation**: `npx tsc --noEmit` passes

### Phase 5: UI

- [ ] 5.1: Remove obsolete fields from `SettingsForm.tsx`
- [ ] 5.2: Add `cameraWidthInTicks` and `cameraWidthPixels` fields to `SettingsForm.tsx`
- [ ] **Validation**: Settings form renders without errors, can save settings

### Phase 6: Tests & Docs

- [ ] 6.1: Update test mocks in `__tests__/mocks/mockSettingsManager.ts`
- [ ] 6.1b: Fix mock Detection in `types/detectionPairs.d.ts`
- [ ] 6.2: Update settings schema tests in `__tests__/unit/settingsSchema.test.ts`
- [ ] 6.3: Update documentation files
- [ ] 6.4: Remove all `#region agent log` debug blocks
- [ ] **Validation**: `npm test` passes (or tests are updated)

### After Completion

- [ ] Run TypeScript compiler (`npx tsc --noEmit`) - should pass with no errors
- [ ] Start server and verify no errors in console
- [ ] Start frontend and verify no errors in browser console
- [ ] Test that uncalibrated system shows clear error messages
- [ ] Test calibration flow works (reset encoder → mark camera → mark jets)
- [ ] Test detection matching works (parts group correctly across frames)
- [ ] Test part sorting end-to-end with hardware
- [ ] Test skip behavior when sorter unavailable
- [ ] Verify no references to removed code (`grep -r "conveyorSpeed\|SpeedManager\|findPositionAtTime\|useEncoderScheduling"`)
- [ ] Commit and create PR

---

## Risk Analysis

### Low Risk

| Change | Why Low Risk |
|--------|--------------|
| Remove `SpeedManager` | Isolated class, clear dependencies |
| Remove speed state from store | Only used for matching (being replaced) |
| Remove `findPositionAtTime()` | Single-use utility being replaced |
| Remove `Part` type | TypeScript will catch all references |
| Remove PART_SORTED/PART_SKIPPED events | Encoder events already replace them |

### Medium Risk

| Change | Mitigation |
|--------|-----------|
| Detection matching algorithm change | Generous threshold (50+ ticks), test thoroughly |
| Data flow changes (encoderAtDetection) | Validation at server entry point |
| Remove debug logging | No functional impact, just less visibility |

### Higher Risk

| Change | Mitigation |
|--------|-----------|
| Requiring calibration | Clear error messages at sort time, skip part gracefully |
| Removing time-based path entirely | This is a clean break - no fallback. Test thoroughly. |
| buildEncoderPart using frontend encoder directly | Validate encoderAtDetection is present and reasonable |

### Rollback Strategy

If critical issues arise post-deployment:
1. **Immediate:** Revert git commit
2. **Partial:** Re-add `useEncoderScheduling` flag temporarily (would require keeping both paths)

**Recommendation:** Given the clean-break approach, prefer full revert over partial rollback.

---

## Rollback Plan

**Primary approach:** Full git revert

```bash
git revert <commit-hash>  # If single commit
# OR
git revert --no-commit HEAD~N..HEAD && git commit  # If multiple commits
```

**Note:** Given the clean-break approach (no backwards compatibility), partial rollback is not recommended. Either the new encoder-only system works, or revert to the previous time+encoder dual-path system.

---

## Files Changed Summary

### Files to DELETE (1 file)
- `server/components/SpeedManager.ts`

### Frontend Files to MODIFY (9 files)
- `types/imageCapture.d.ts` - Add encoderAtCapture field
- `types/types.ts` - Add encoderAtDetection to Detection
- `types/sortPart.dto.ts` - Add encoderAtDetection field
- `lib/services/VideoCaptureService.ts` - Capture encoder with frame
- `lib/services/DetectorService.ts` - Pass encoder, remove calibrateConveyorSpeed
- `lib/services/SorterService.ts` - Encoder-based matching, remove speed init
- `lib/services/ClassifierService.ts` - Pass encoderAtDetection to SortPartDto
- `lib/services/SocketService.ts` - Remove CONVEYOR_SPEED_UPDATE and PART_SORTED listeners
- `stores/sortProcessStore.ts` - Remove conveyorSpeed state
- `lib/utils.ts` - Remove findPositionAtTime and SpeedLogEntry

### Server Files to MODIFY (4 files)
- `server/SystemCoordinator.ts` - Remove time path, SpeedManager, buildPart
- `server/components/ConveyorManager.ts` - Remove time-based code, useEncoderScheduling checks
- `server/components/SocketManager.ts` - Remove speed/part emit methods
- `server/components/PositionTranslator.ts` - Add deprecation notices

### Type Files to MODIFY (3 files)
- `types/settings.type.ts` - Remove obsolete settings
- `types/part.type.ts` - Remove Part interface
- `types/socketMessage.type.ts` - Remove obsolete events

### UI Files to MODIFY (1 file)
- `components/SettingsForm.tsx` - Remove obsolete fields, add calibration fields

### Test/Mock Files to MODIFY (2 files)
- `__tests__/mocks/mockSettingsManager.ts` - Remove obsolete settings
- `types/detectionPairs.d.ts` - Fix mock Detection object

### Documentation Files to UPDATE (4 files)
- `_docs/BACKEND_ARCHITECTURE.md`
- `_docs/FRONTEND_ARCHITECTURE.md`
- `_docs/SYSTEM_ARCHITECTURE.md`
- `_docs/CALIBRATION_TESTING.md`

### Debug Code to REMOVE (locations in 3 files)
- `server/SystemCoordinator.ts` - 1-2 `#region agent log` blocks
- `server/components/ConveyorManager.ts` - 4-5 `#region agent log` blocks
- `server/components/PositionTranslator.ts` - 2 `#region agent log` blocks

**Total: 1 file deleted, ~24 files modified**

---

## Summary

| Category | Items Removed | Items Modified | Items Added |
|----------|---------------|----------------|-------------|
| Settings | 5 (`conveyorSpeed`, `minConveyorRPM`, `constantConveyorSpeed`, `useEncoderScheduling`, `jetPositionStart`) | 1 (positionCalibration) | 0 |
| Server files | 1 deleted (`SpeedManager.ts`) | 5 (SystemCoordinator, ConveyorManager, SocketManager, PositionTranslator, SettingsManager) | 0 |
| Frontend files | 0 | 9 (VideoCaptureService, DetectorService, SorterService, ClassifierService, SocketService, sortProcessStore, utils, SettingsForm, types) | 0 |
| Types | 2 interfaces (`Part`, `SpeedLogEntry`) | 5 (Detection, SortPartDto, ImageCaptureType, settings.type, socketMessage.type) | 1 field (`encoderAtDetection`) |
| Utilities | 2 functions (`findPositionAtTime`, `computeTrimmedMean`) | 0 | 0 |
| Events | 3 (`CONVEYOR_SPEED_UPDATE`, `PART_SORTED`, `PART_SKIPPED`) | 0 | 0 |
| Store state | 3 (`conveyorSpeed`, `conveyorSpeedLog`, `setConveyorSpeed`) | 0 | 0 |
| Debug code | ~8 `#region agent log` blocks | 0 | 0 |

**Net effect:** Significant code reduction and simplification. The system becomes purely encoder-based with no time-dependent calculations. Approximately 500+ lines of code removed.

---

## Appendix: Detection Matching Math

### The Core Formula

For a part detected at pixel position `P` when encoder is at `E`:

```
absolutePosition = E - (P / cameraWidthPixels) * cameraWidthInTicks
```

This gives the encoder value at which the part crossed the camera's left edge.

For two detections of the **same part**:
- Detection 1: `abs1 = E1 - pixelToTicks(P1)`
- Detection 2: `abs2 = E2 - pixelToTicks(P2)`
- Delta: `|abs1 - abs2|` should be near 0 for the same part

### Ideal Example (No Noise)

Camera: 1280px = 150 ticks
Part moves rightward in camera (pixel X increases as encoder increases)

**Detection 1:**
- P1 = 600px (part on left side of camera), E1 = 5000 ticks
- pixelToTicks(600) = (600/1280) * 150 = 70.31 ticks
- abs1 = 5000 - 70.31 = **4929.69**

**Detection 2 (same part, next frame, moved right):**
- Part moved 200px rightward in camera (600→800)
- Encoder advanced by pixelToTicks(200) = (200/1280) * 150 = 23.44 ticks
- E2 = 5000 + 23.44 = 5023.44 ticks, P2 = 800px
- pixelToTicks(800) = (800/1280) * 150 = 93.75 ticks
- abs2 = 5023.44 - 93.75 = **4929.69**
- **Delta = |4929.69 - 4929.69| = 0** ✓ (the formula cancels perfectly)

### Real-World Example (With Noise)

In practice, errors accumulate:
- Bounding box jitter: ±10 pixels = ±1.17 ticks
- Encoder timing skew: encoder read is ~50ms before/after frame capture
- At 0.5 ticks/ms velocity: ±25 ticks timing error
- Part wobble: ±5 ticks

**Realistic Detection 2 (with accumulated errors):**
- Ideal: P2=800px, E2=5023.44 → abs2=4929.69
- Actual pixel: 790px (10px bounding box jitter)
- Actual encoder: 5050 ticks (encoder read ~50ms late at 0.5 ticks/ms = +26 ticks)
- pixelToTicks(790) = (790/1280) * 150 = 92.58 ticks
- abs2 = 5050 - 92.58 = **4957.42**
- **Delta = |4929.69 - 4957.42| = 27.73 ticks**

This 28-tick error comes from:
- 10px jitter = ~1.2 ticks
- 50ms timing skew = ~26 ticks at typical velocity

With both detections having similar noise, deltas of 40-60 ticks are common.

### Threshold Recommendation

Based on this analysis, the threshold should accommodate:
- Best case: 0-10 ticks
- Typical case: 20-40 ticks  
- Worst case (still same part): 50-80 ticks

**Formula:** `Math.max(50, cameraWidthInTicks * 0.20)`

This gives:
- 150-tick camera: threshold = 50 ticks
- 300-tick camera: threshold = 60 ticks

This is generous enough to avoid false negatives (missing matches) while tight enough to avoid false positives (matching different parts).
