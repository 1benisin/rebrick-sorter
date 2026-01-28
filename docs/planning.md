## Plan: Frontend-Only - Unify Coordinate System to Rightward Motion

### Problem Statement

The frontend currently has inconsistent coordinate assumptions:

- Physical camera feed shows parts moving leftward (x decreases over time)
- Detection grouping required leftward prediction to work correctly
- But timing calculations and backend integration assume rightward motion
- This causes detection group splitting and timing variance

### Goal

Make the frontend consistently assume rightward motion (x increases over time) throughout the entire pipeline by transforming coordinates at the earliest possible point (camera ingestion boundary).

### Canonical System Definition

- **Direction**: Rightward (x increases to the right over time)
- **Origin**: Left edge of camera view (x = 0)
- **Units**: Camera pixels (px)
- **Speed**: Positive values in px/ms representing rightward motion

---

## Frontend Data Flow (Current State)

1. **VideoCaptureService** → captures raw ImageBitmaps from cameras
2. **DetectorService.detect()** → processes images, runs ML detection
3. **DetectorService.mergeBitmaps()** → merges top + side views (flips side view horizontally)
4. **DetectorService.createDetections()** → creates Detection objects with `centroid.x = box.left + box.width/2`
5. **SorterService.matchDetectionsPairsToGroups()** → groups detections using motion prediction
6. **lib/utils.findPositionAtTime()** → predicts future x position based on speed and time
7. **SorterService.classifyDetections()** → triggers classification when parts reach 1/3 mark
8. **ClassifierService.classify()** → classifies part and emits `initialPosition` to backend
9. **SocketService** → receives conveyor speed updates from backend
10. **sortProcessStore** → stores conveyor speed and speed log

---

## Files to Modify (Frontend Only)

### 1. `lib/services/DetectorService.ts`

**Current state:**

- Line 341: Creates Detection with `centroid.x = pair.topView.box.left + pair.topView.box.width / 2`
- This x comes directly from ML model detection box on merged canvas
- Merged canvas has physical leftward motion (parts move from high x to low x)

**Changes needed:**

- Add coordinate transform at detection creation boundary
- Transform raw x to canonical x: `xCanonical = videoWidth - xRaw`
- Apply transform in `createDetections()` method when setting `centroid.x`
- Log first 5 transformations to validate: `[COORD_TRANSFORM] raw=${xRaw} → canonical=${xCanonical} (width=${videoWidth})`

**Why here:**

- Single source of truth for all Detection objects
- Earliest point where coordinates are assigned
- All downstream code receives canonical coordinates automatically

---

### 2. `lib/utils.ts` - `findPositionAtTime()` function

**Current state:**

- Line 76: `currentPos -= lastSpeed * timeDiff` (leftward motion, temporary fix)
- Line 91: `const distanceMoved = -lastSpeed * remainingTimeDiff` (leftward)
- Debug logs show leftward calculation

**Changes needed:**

- Revert to rightward motion: `currentPos += lastSpeed * timeDiff`
- Change line 91: `const distanceMoved = lastSpeed * remainingTimeDiff`
- Update all comments to indicate rightward motion
- Keep debug logs but update to show rightward calculation
- Remove diagnostic "altPredicted(-x default)" logs from SorterService once validated

**Why:**

- Once detections are in canonical rightward coordinates, prediction must also be rightward
- Speed values are already positive (px/ms), so addition means rightward movement

---

### 3. `lib/services/SorterService.ts`

**Current state:**

- Line 116-122: Calls `findPositionAtTime()` to predict future x position
- Line 124-130: Logs prediction with diagnostic altPredicted(-x default) math
- Uses predicted x to find closest matching detection group

**Changes needed:**

- Remove diagnostic leftward prediction logs (lines 126-130)
- Keep standard prediction logging but simplify to rightward-only
- Update comments to reflect rightward motion assumption
- Validate that detection groups now merge correctly (1 group per part)

**Why:**

- Once utils.findPositionAtTime returns rightward predictions, grouping will work correctly
- Diagnostic logs can be removed after validation

---

### 4. `lib/services/ClassifierService.ts`

**Current state:**

- Line 258: `const backendInitialPosition = initialPosition` (already passing through unchanged)
- Line 260: Logs coordinate mapping showing "no flip, same coordinate system"

**Changes needed:**

- No code changes required
- Validate that log message is accurate after transform
- Keep the coordinate log temporarily to confirm end-to-end correctness

**Why:**

- Already correctly passes canonical x to backend
- Once DetectorService transforms to rightward, this just passes it through

---

### 5. `stores/sortProcessStore.ts`

**Current state:**

- Line 97-107: `setConveyorSpeed()` stores speed as positive px/ms
- Line 101: Adds speed log entry with timestamp
- Already treats speed as rightward magnitude

**Changes needed:**

- No changes required
- Already correct - stores positive speed values

**Why:**

- Speed is already stored as positive rightward velocity

---

### 6. `lib/services/SocketService.ts`

**Current state:**

- Line 50-53: Receives `CONVEYOR_SPEED_UPDATE` from backend, calls `setConveyorSpeed(speed)`
- Speed values are positive px/ms

**Changes needed:**

- No changes required
- Already correct

**Why:**

- Backend already sends speed as positive px/ms value

---

### 7. `lib/services/VideoCaptureService.ts`

**Current state:**

- Captures raw ImageBitmaps from cameras
- Line 133: Returns ImageBitmaps without transformation
- Line 142-151: Has `flipImageBitmap()` helper (not currently used)

**Changes needed:**

- No changes required
- Keep raw capture as-is; transformation happens in DetectorService

**Why:**

- Better to transform at Detection creation (single point) than at capture (multiple consumers)

---

## Implementation Steps (In Order)

### Step 1: Add coordinate transform to DetectorService

```typescript
// In lib/services/DetectorService.ts, modify createDetections():

private createDetections(
  timestamp: number,
  canvas: HTMLCanvasElement,
  cropCanvas: HTMLCanvasElement,
  predictionsPairs: PredictionsPair[],
): [Detection, Detection][] {
  const videoWidth = canvas.width;

  return predictionsPairs.map((pair, index) => {
    // ... existing cropping code ...

    // Calculate raw x from ML detection box (physical leftward motion)
    const xRaw = pair.topView.box.left + pair.topView.box.width / 2;

    // Transform to canonical rightward coordinates
    const xCanonical = videoWidth - xRaw;

    // Log first 5 transformations for validation
    if (index < 5) {
      console.log(`[COORD_TRANSFORM] detection ${index}: raw=${xRaw.toFixed(1)} → canonical=${xCanonical.toFixed(1)} (width=${videoWidth})`);
    }

    const topViewDetection: Detection = {
      view: 'top',
      imageURI: topViewDetectionImageURI,
      timestamp,
      centroid: {
        x: xCanonical, // Use canonical x instead of raw x
        y: pair.topView.box.top + pair.topView.box.height / 2,
      },
      box: pair.topView.box,
    };

    // ... rest of detection creation ...
  });
}
```

### Step 2: Revert findPositionAtTime to rightward motion

```typescript
// In lib/utils.ts, change lines 76 and 91:

// Line 76: Change from -= to +=
currentPos += lastSpeed * timeDiff; // Parts move right: x increases over time

// Line 91: Change from negative to positive
const distanceMoved = lastSpeed * remainingTimeDiff;
currentPos += distanceMoved; // Continue rightward motion

// Update debug logs to reflect rightward
console.log(`[findPositionAtTime] seg: ... -> dx=${(lastSpeed * timeDiff).toFixed(1)} ...`);
```

### Step 3: Clean up diagnostic logs in SorterService

```typescript
// In lib/services/SorterService.ts, remove lines 124-130:
// Remove the temporary diagnostic leftward calculation
// Remove: const predictedXLeftwardAssumption = ...
// Remove: const distanceIfLeftward = ...
// Remove: console.log altPredicted(-x default)

// Keep only the standard prediction log:
console.log(
  `    Group ${i}: predicted=${predictedX.toFixed(1)}, actual=${unmatchedDetection.centroid.x.toFixed(1)}, distance=${distanceBetweenDetections.toFixed(1)}, threshold=${closestDistance}, MATCH=${distanceBetweenDetections < closestDistance}`,
);
```

### Step 4: Validate with single part test

- Run the sorter with one part
- Check logs:
  - `[COORD_TRANSFORM]` should show transformation (e.g., raw=2000 → canonical=1840 for width=3840)
  - `[findPositionAtTime]` should show positive dx values
  - Detection groups should show 1 group created (not 2)
  - `predicted` vs `actual` should be close (within threshold)
  - `[COORDINATE] Frontend x → Backend x` should show canonical value

### Step 5: Remove temporary diagnostic logs

- Remove `[COORD_TRANSFORM]` logs from DetectorService after validation
- Remove verbose `[findPositionAtTime]` logs from utils.ts
- Keep only essential production logging

---

## Validation Checklist

- [ ] Single part creates exactly 1 detection group (not 2+)
- [ ] Predicted x values are close to actual x values (within 300px threshold)
- [ ] Detection x values decrease over time in logs (rightward motion with origin at left)
- [ ] Backend receives consistent initialPosition values
- [ ] Jet timing variance is reduced (validation via backend logs)
- [ ] No regression in classification or sorting accuracy

---

## Rollback Plan

If issues arise:

1. Revert DetectorService coordinate transform (remove `videoWidth - xRaw`)
2. Revert findPositionAtTime back to leftward (`currentPos -= ...`)
3. System returns to previous working state (with 2 groups per part but functional)

---

## Why This Approach

**Single transformation point:**

- Transforming at Detection creation means all downstream code works with canonical coordinates
- No scattered transforms throughout the codebase
- Easy to understand and maintain

**Minimal changes:**

- Only 3 files need actual code changes
- Other files are already correct
- Low risk of introducing new bugs

**Proper layering:**

- Raw camera → DetectorService (transform here) → canonical coordinates everywhere else
- Clear boundary between physical and logical coordinate systems

---

## Notes

- The side view image is already flipped horizontally in `mergeBitmaps()` but this doesn't affect top view detections
- Top view detections drive the x coordinate used for timing and sorting
- Speed values are already stored as positive px/ms (rightward)
- Backend distance calculation uses `Math.abs()` so it's direction-agnostic
