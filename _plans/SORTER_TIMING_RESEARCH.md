# Sorter timing: research summary (main vs constant-speed-refactor)

**Goal:** Align current behavior with the intended schedule/skip rules, including buffer time. No code changes yet—research only.

---

## 1. Intended / target behavior (authoritative)

This section states the full intended behavior so a coding agent can implement and verify it.

### 1.1 Physical flow

1. A Lego part travels on the conveyor and passes in front of the camera.
2. The part is detected and classified: part type plus which **sorter** (0–3) and which **bin** in that sorter’s grid it should go to.
3. The frontend sends this to the server; the server must **schedule** or **skip** the part.
4. If scheduled: the server schedules (a) an **air jet** to fire at a specific encoder position (blowing the part off the belt into that sorter’s tube) and (b) a **sorter move** so that sorter’s head is over the target bin when the part lands at the bottom of the tube.
5. If skipped: the server does **not** send a jet command and does **not** send a move command for that part. The part is not sorted.

All timing is driven by the **rotary encoder** (conveyor position in counts/ticks). Speed controls are based on the encoder; scheduling and skip/schedule decisions use encoder positions, not wall-clock time.

### 1.2 When to skip a part

A part must be **skipped** when the sorter **cannot** both finish its previous move (if any) and complete the new move to the target bin **before** the part is blown off the belt and falls down the tube.

More precisely:

- Compute the **earliest encoder position at which the sorter must start moving** so that it can reach the target bin by the time the part lands. Call this the **earliest move start position** (in encoder counts):  
  `earliestMoveStartPosition = requiredByPosition - leadCounts`,  
  where `requiredByPosition` is the encoder position by which the sorter must be in position (see below), and `leadCounts` is the encoder counts needed for the sorter to move from its “from” bin to the target bin (from the travel-time lookup, converted to counts using conveyor velocity).
- The sorter is allowed to **start** a new move only **after** the previous move has **finished** plus a **buffer**. The buffer is a small amount of time (or encoder counts) during which the sorter sits still so the part from the previous sort has time to fully fall out of the tube before the sorter moves again. Call the encoder position at which the sorter becomes allowed to start the next move the **free-after-buffer position**:  
  `freeAfterBufferPosition = lastMoveFinishPosition + bufferCounts`.
- **Skip rule:** If `earliestMoveStartPosition < freeAfterBufferPosition`, then the sorter cannot start the move early enough to arrive in time without violating the buffer. **Skip the part:** do not schedule the jet, do not schedule the move. Emit a skip event (e.g. “Sorter unavailable - cannot reach bin in time” or equivalent).

So: **skip when** (time/position at which the sorter needs to start moving) **is before** (previous move finish + buffer). In encoder space: skip when `requiredByPosition - leadCounts < freePosition + bufferCounts`.

### 1.3 When to schedule a part (just-in-time move)

If the part is **not** skipped:

- Schedule the **jet** to fire at the computed **jet position** (encoder position where the part will be when it should be blown off).
- Schedule the **move** so that it starts **at or after** `freeAfterBufferPosition` and the sorter **arrives** at the target bin by `requiredByPosition` (i.e. just before the part lands).

**Schedule rule:** The move may start only **after** (last move finish + buffer). The **trigger position** (encoder position at which to send the move command) must satisfy:

- `triggerPosition >= freeAfterBufferPosition` (move does not start before buffer has elapsed), and  
- `triggerPosition + leadCounts <= requiredByPosition` (sorter arrives by the deadline), so the earliest allowed trigger is `requiredByPosition - leadCounts`.

So: **triggerPosition = max(freeAfterBufferPosition, requiredByPosition - leadCounts)**. This is “just-in-time”: the sorter moves as late as possible while still arriving in time and respecting the buffer.

### 1.4 Definitions used above

- **requiredByPosition:** Encoder position by which the sorter must be in position at the target bin. The part is blown off at `jetPosition` and falls for a fixed “fall time” in encoder counts; the sorter must be ready before the part lands. So `requiredByPosition = jetPosition - fallTimeInCounts`. (See `PositionTranslator.calculateRequiredByPosition` and settings `fallTimeInCounts`.)
- **jetPosition:** Encoder position at which the jet should fire for this part. Derived from detection position and calibration (camera-to-jet offset in encoder counts).
- **leadCounts:** Encoder counts required for the sorter to move from its current “from” bin to the target bin. Obtained from a **per-sorter travel-time lookup table** (time in ms from bin A to bin B) multiplied by conveyor velocity (counts/ms). (See `SorterManager.getTravelTimeBetweenBins` and `SorterStateManager.calculateLeadCounts`.)
- **lastMoveFinishPosition:** Encoder position when the last move for this sorter completed (or when the sorter will complete its current/last scheduled move). Used to compute when the sorter is “free.”
- **bufferCounts:** Encoder counts the sorter must “sit still” after a move completes before starting the next move, so the previous part has time to fully fall out of the tube. This must be a configurable setting (e.g. in position calibration or sorter settings).

### 1.5 Travel time lookup table

- There must be a **lookup table per sorter** that gives the time (ms) to move from one bin to another (or from a “from” bin index to a “to” bin index, e.g. by distance). The server uses this to compute `leadCounts` (travel time × conveyor velocity, in encoder counts). The codebase has this in `SorterManager`: `travelTimes[sorter][index]` where index is derived from the Euclidean distance between bin positions.

### 1.6 Summary of intended rules (for implementation)

| Rule | Condition | Action |
|------|-----------|--------|
| **Skip** | `earliestMoveStartPosition < freeAfterBufferPosition` (i.e. `requiredByPosition - leadCounts < freePosition + bufferCounts`) | Do not schedule jet; do not schedule move; emit part-skipped. |
| **Schedule** | Otherwise | Schedule jet at `jetPosition`; schedule move with `triggerPosition = max(freeAfterBufferPosition, requiredByPosition - leadCounts)`. |

Current code does **not** include `bufferCounts`: “free” is taken as the raw last-move-finish position (or equivalent), and there is no requirement that the move start only after an additional buffer.

---

## 2. Where the logic lives today (current implementation)

The table below maps each intended concept from section 1 to the current code location. Use it to verify findings and to know where to implement changes.

| Concern | Location | Notes |
|--------|----------|--------|
| **Part arrival / deadline** | `PositionTranslator.calculateRequiredByPosition(jetPosition)` | `requiredByPosition = jetPosition - fallTimeInCounts`. Sorter must be in position by this encoder position. |
| **Jet position** | `PositionTranslator.calculateJetTriggerEncoder(...)` | Uses `encoderAtDetection`, pixel position, calibration. |
| **Detection encoder position** | `SystemCoordinator.buildEncoderPart` | **Current branch:** uses `encoderAtDetection` from frontend. **Main:** used server interpolation (see below). |
| **Can sorter reach bin in time?** | `SorterStateManager.canSorterReachBin(sorter, bin, requiredByPosition)` | Uses `freePosition`, `leadCounts`, then skip if `arrivalPosition > requiredByPosition`; else compute `triggerPosition`. |
| **When is sorter “free”?** | `SorterStateManager.getFreePosition(sorterNum)` | Last scheduled move’s `expectedCompletePosition`, or (if moving) `moveStartPosition + estimatedCounts`, or (if idle) current interpolated position. **No buffer added.** |
| **Travel time (lookup)** | `SorterManager.getTravelTimeBetweenBins({ sorter, fromBin, toBin })` | Uses `travelTimes[sorter][closestTravelTimeIndex]` where index = rounded Euclidean distance between bin positions. Lookup table exists per sorter (initialized in `SorterManager.initialize()`). |
| **Lead counts** | `SorterStateManager.calculateLeadCounts(sorter, fromBin, toBin)` | `travelTimeMs` from SorterManager × velocity → encoder counts (rounded up). |
| **Trigger position** | Inside `canSorterReachBin` | `triggerPosition = Math.max(freePosition, requiredByPosition - leadCounts)` when there’s flexibility; else `freePosition`. **No buffer:** move can start as soon as `freePosition`. |

---

## 3. Differences that matter: main vs current branch

### 3.1 Source of “encoder at detection” (biggest behavioral change)

- **Main (encoder path):**  
  `detectionEncoderPos = this.positionTranslator.getEncoderPositionAtTime(initialTime)` when calibrated (or `pixelToEncoderPosition(initialPosition, initialTime)` when not). So the **server** derived “where was the encoder when this part was detected” from its own encoder snapshot and `initialTime`. Jet position and `requiredByPosition` were therefore based on the server’s view of conveyor position at detection time.

- **Current branch:**  
  `detectionEncoderPos = encoderAtDetection` from the frontend. No server interpolation. Jet position and `requiredByPosition` are entirely driven by the frontend’s `encoderAtDetection` and pixel position.

**Why this can break timing:** If the frontend’s `encoderAtDetection` is delayed, wrong, or out of sync with the conveyor (e.g. message latency, clock skew, or encoder value captured at a different moment than the server’s conveyor state), then `jetPosition` and `requiredByPosition` will be wrong. The schedule/skip decision in `canSorterReachBin` will then be off even though the logic (compare arrival to required-by, pick trigger) is unchanged.

### 3.2 Time-based path removed

- **Main:** Two paths. If `useEncoderScheduling` → `handleEncoderSortPart` (encoder path). Else `handleTimeSortPart` (time-based) with `buildPart`, `moveTime`, `moveFinishedTime`, `arrivalTimeDelay`, ConveyorManager part queue, SpeedManager, etc. The time-based path explicitly used “previous part’s move finish” and delayed the next part’s move so it started after the previous finished.
- **Current:** Only encoder path. No `buildPart`, no time-based queue, no SpeedManager. So the only scheduling is the encoder path; if that path gets wrong inputs (e.g. from 3.1), timing will be wrong.

### 3.3 SorterStateManager: same availability logic, no buffer on either branch

- **Diff vs main:** Only change in `SorterStateManager` is reconnect handling (skip parts for that sorter when sorter reconnects, and optional chaining for `getInterpolatedPosition()`). `getFreePosition`, `canSorterReachBin`, `calculateLeadCounts`, and trigger position math are **identical** on main and current.
- **Buffer:** Neither main nor current add a “sitter still” buffer (in encoder counts or time) after “last move complete” before the sorter is considered free. So:
  - **Skip condition today:** Effectively “skip if earliest move start position &lt; free position” (i.e. `requiredByPosition - leadCounts < freePosition` → arrival would be late, so we already skip). There is no “free = last move finish + buffer.”
  - **Trigger position today:** Move can start as soon as `freePosition`; no requirement that trigger be ≥ “last move finish + buffer.”

To match your intended behavior we will need to introduce a buffer (e.g. `sorterRestBufferInCounts` or similar) and:
- Define “free to start next move” = last move finish position **+ buffer**.
- Skip when earliest move start &lt; (last move finish + buffer).
- Schedule trigger so the move starts at or after (last move finish + buffer), still just-in-time (e.g. `triggerPosition = max(freePosition + bufferCounts, requiredByPosition - leadCounts)`).

---

## 4. Data flow (current branch)

1. Frontend sends `SortPartDto` with `encoderAtDetection`, `initialPosition`, `initialTime`, `sorter`, `bin`, etc.
2. `SystemCoordinator.handleSortPart` → `handleEncoderSortPart` → `buildEncoderPart(data)`.
3. `buildEncoderPart`:  
   - `detectionEncoderPos = data.encoderAtDetection`  
   - `jetPosition = positionTranslator.calculateJetTriggerEncoder(initialPosition, detectionEncoderPos, sorter, …)`  
   - `requiredByPosition = positionTranslator.calculateRequiredByPosition(jetPosition)` (= `jetPosition - fallTimeInCounts`)  
   - `availability = sorterStateManager.canSorterReachBin(sorter, bin, requiredByPosition)`  
   - If unavailable → return null → part skipped (no jet, no move).  
   - If available → build `EncoderPart` with `moveTriggerPosition = availability.triggerPosition`, `expectedMoveCompletePosition = triggerPosition + leadCounts`.
4. Part is inserted into `ConveyorManager`’s encoder queue and move is scheduled in `SorterStateManager.scheduleMove(...)`.
5. On each encoder update, `ConveyorManager`’s position loop uses `getActionableParts(currentPosition)`: jet when `currentPosition >= part.jetPosition - JET_LEAD_COUNTS`, move when `currentPosition >= part.moveTriggerPosition`. Jets and moves are sent at those positions; `markMoveStarted` is called when a move is sent. Move completion comes from Arduino `MC:` → `handleMoveComplete` → `lastMoveCompletePosition = currentPosition`, etc.

So the only place “last move finish” is used is inside `getFreePosition`: when there are scheduled moves it uses the last one’s `expectedCompletePosition`; when moving it uses `moveStartPosition + estimatedCounts`; when idle it uses current interpolated position. There is no separate “sorter rest buffer” applied to that free position.

---

## 5. Travel time lookup table

- **Where:** `SorterManager.getTravelTimeBetweenBins({ sorter, fromBin?, toBin })`.  
- **How:** Bin positions from `binPositions[sorter]` (grid), Euclidean distance between from/to bins, `moveDist = Math.sqrt(x*x + y*y)`, `closestTravelTimeIndex = Math.round(moveDist)`, then `travelTimes[sorter][closestTravelTimeIndex]` (ms).  
- **Data:** `travelTimes` are fixed arrays per sorter (initialized in `initialize()`), so the lookup table exists and is used by `SorterStateManager.calculateLeadCounts`.

---

## 6. Summary: what to change to align with intended behavior

1. **Buffer (sorter rest after move):**  
   - Add a configurable buffer (e.g. in settings: “sorter rest buffer” in encoder counts or ms, then converted to counts).  
   - In `SorterStateManager`: treat “free to start next move” as (last move finish position + buffer), not just last move finish. Use this in `canSorterReachBin` and in trigger position: skip when earliest start &lt; (free + buffer), and set `triggerPosition = max(freePosition + bufferCounts, requiredByPosition - leadCounts)` when scheduling.

2. **Detection encoder position / jet timing:**  
   - If in practice the frontend’s `encoderAtDetection` is wrong or delayed, consider either restoring server-side interpolation for “encoder at detection” (e.g. from `initialTime` and encoder snapshot) as on main, or ensuring the frontend sends a value that is consistent with the server’s conveyor state. That’s a product/architecture choice; the current diff shows that switching from server interpolation to frontend-only is the main change in how part arrival and required-by are derived.

3. **Skip rule wording in code:**  
   - Implement the explicit rule: “skip if (requiredByPosition - leadCounts) < (freePosition + bufferCounts)” and “schedule only when trigger can be ≥ freePosition + bufferCounts,” so both move and jet are skipped when the sorter couldn’t start after the previous move + buffer.

---

## 7. Files to touch when implementing

- **Buffer and skip/trigger logic:** `server/components/SorterStateManager.ts` (`getFreePosition` or a “free position after buffer” helper, `canSorterReachBin` skip condition and trigger computation).
- **Buffer setting:** `types/settings.type.ts` (e.g. `sorterRestBufferInCounts` or ms and conversion), and any UI for it.
- **Optional (if reverting or blending encoder source):** `server/SystemCoordinator.ts` `buildEncoderPart` (source of `detectionEncoderPos`), and possibly frontend to keep sending `encoderAtDetection` for logging even if server recomputes.

Travel time lookup is already in place in `SorterManager` and is used by `SorterStateManager.calculateLeadCounts`; no change needed there for the intended rules.

---

## 8. Verification guide for a coding agent

Use this section to independently verify the research findings and to implement the intended behavior.

### 8.1 Key file paths (repository root = workspace)

| File | Purpose |
|------|--------|
| `server/SystemCoordinator.ts` | Entry for sort-part: `handleSortPart`, `handleEncoderSortPart`, `buildEncoderPart`. Source of `detectionEncoderPos` (frontend vs server interpolation). |
| `server/components/SorterStateManager.ts` | `getFreePosition`, `canSorterReachBin`, `calculateLeadCounts`, `scheduleMove`, `markMoveStarted`. Handles MC: in `handleSorterData` → `handleMoveComplete`; sets `lastMoveCompletePosition`. |
| `server/components/PositionTranslator.ts` | `calculateRequiredByPosition(jetPosition)`, `calculateJetTriggerEncoder(...)`, `getCalibration()`. Uses `fallTimeInCounts` from settings. |
| `server/components/ConveyorManager.ts` | Encoder queue: `encoderPartQueue`, `insertEncoderPart`, `getActionableParts(currentPosition)`, `processPositionActions`. Sends jets and moves; calls `sorterStateManager.markMoveStarted` when sending move. |
| `server/components/SorterManager.ts` | `getTravelTimeBetweenBins({ sorter, fromBin?, toBin })`, `travelTimes`, `binPositions`. |
| `types/part.type.ts` | `EncoderPart` interface: `moveTriggerPosition`, `expectedMoveCompletePosition`, `jetPosition`, etc. |
| `types/sortPart.dto.ts` | `SortPartDto`, `sortPartSchema`: `encoderAtDetection`, `initialPosition`, `initialTime`, `sorter`, `bin`. |
| `types/settings.type.ts` | `positionCalibration`: `fallTimeInCounts`, `jetLeadCounts`, `cameraWidthInTicks`, `jetEncoderOffsets`. No `sorterRestBufferInCounts` (or similar) today. |

### 8.2 Key functions and what to check

- **`SorterStateManager.getFreePosition(sorterNum)`** (private)  
  Returns the encoder position at which the sorter is “free” to start a new move. Verify: it returns last scheduled move’s `expectedCompletePosition`, or (if moving) `moveStartPosition + estimatedCounts`, or (if idle) `conveyorManager.getInterpolatedPosition()`. No addition of a buffer.

- **`SorterStateManager.canSorterReachBin(sorterNum, targetBin, requiredByPosition)`**  
  Returns `{ available, triggerPosition, reason? }`. Verify: (1) `freePosition = getFreePosition(sorterNum)`; (2) skip when `freePosition + leadCounts > requiredByPosition`; (3) `triggerPosition = Math.max(freePosition, requiredByPosition - leadCounts)` (or freePosition when no slack). No use of a buffer; trigger can equal raw freePosition.

- **`SorterStateManager.calculateLeadCounts(sorterNum, fromBin, toBin)`**  
  Returns encoder counts for travel from `fromBin` to `toBin`. Verify: uses `sorterManager.getTravelTimeBetweenBins` then multiplies by velocity; same on main and current.

- **`SystemCoordinator.buildEncoderPart(data: SortPartDto)`**  
  Returns `EncoderPart | null`. Verify: current branch sets `detectionEncoderPos = data.encoderAtDetection`; on main (see diff) it used `positionTranslator.getEncoderPositionAtTime(initialTime)` when calibrated.

- **`PositionTranslator.calculateRequiredByPosition(jetPosition)`**  
  Returns `jetPosition - calibration.fallTimeInCounts`. No change needed for intended behavior.

### 8.3 Data structures to inspect

- **`SorterState`** (in `SorterStateManager.ts`): `currentBin`, `isMoving`, `targetBin`, `lastMoveCompletePosition`, `moveStartPosition`, `scheduledMoves: ScheduledMove[]`.
- **`ScheduledMove`**: `partId`, `bin`, `triggerPosition`, `expectedCompletePosition`.
- **`EncoderPart`** (in `types/part.type.ts`): `jetPosition`, `moveTriggerPosition`, `expectedMoveCompletePosition`, `sorter`, `bin`, etc.

### 8.4 How to diff against main

From repo root:

```bash
git diff main -- server/SystemCoordinator.ts
git diff main -- server/components/SorterStateManager.ts
git diff main -- server/components/ConveyorManager.ts
git diff main -- lib/services/SorterService.ts
```

Main’s `buildEncoderPart` used `getEncoderPositionAtTime(initialTime)` for `detectionEncoderPos` when calibrated; current uses `encoderAtDetection`. Main had `handleTimeSortPart` and `buildPart`; current does not. SorterStateManager diff is only reconnect handling and optional chaining.

### 8.5 Grep patterns to find usages

- `getFreePosition|canSorterReachBin|calculateLeadCounts` → SorterStateManager.
- `requiredByPosition|calculateRequiredByPosition` → SystemCoordinator, PositionTranslator.
- `encoderAtDetection|getEncoderPositionAtTime` → SystemCoordinator, sortPart.dto.
- `expectedCompletePosition|lastMoveCompletePosition` → SorterStateManager, part.type.
- `fallTimeInCounts` → settings.type, PositionTranslator, tests.
- `travelTimes|getTravelTimeBetweenBins` → SorterManager, SorterStateManager.

### 8.6 Execution trace (current branch)

1. Client emits sort-part with `SortPartDto` (includes `encoderAtDetection`).
2. `SystemCoordinator.handleSortPart` → parse, validate, then `handleEncoderSortPart(data)`.
3. `buildEncoderPart(data)`: `detectionEncoderPos = data.encoderAtDetection`; `jetPosition = positionTranslator.calculateJetTriggerEncoder(...)`; `requiredByPosition = positionTranslator.calculateRequiredByPosition(jetPosition)`; `availability = sorterStateManager.canSorterReachBin(sorter, bin, requiredByPosition)`.
4. If `!availability.available`, return null → part skipped (jet and move not scheduled).
5. If available: build `EncoderPart` with `moveTriggerPosition = availability.triggerPosition`, insert into ConveyorManager queue, call `sorterStateManager.scheduleMove(sorter, bin, partId, triggerPosition)`.
6. ConveyorManager encoder updates: `processPositionActions(currentPosition)` → `getActionableParts(currentPosition)` → send jet when `currentPosition >= part.jetPosition - JET_LEAD_COUNTS`, send move when `currentPosition >= part.moveTriggerPosition`; on move send, call `sorterStateManager.markMoveStarted(part.sorter, part.bin)`.
7. When sorter Arduino sends `MC:<bin>`, `SorterStateManager.handleSorterData` → `handleMoveComplete` → update `currentBin`, `lastMoveCompletePosition = conveyorManager.getInterpolatedPosition()`, remove completed move from `scheduledMoves`.

### 8.7 What “buffer” is missing

- **Setting:** There is no `sorterRestBufferInCounts` (or similar) in `types/settings.type.ts` or in position calibration. Add one for verification/implementation.
- **Usage:** `getFreePosition` (or a new “free after buffer” value) should expose “free = last move finish **+ bufferCounts**.” `canSorterReachBin` should: (1) skip if `requiredByPosition - leadCounts < freePosition + bufferCounts`; (2) set `triggerPosition = Math.max(freePosition + bufferCounts, requiredByPosition - leadCounts)` when available.

### 8.8 Unit / integration tests to consider

- **PositionTranslator:** `calculateRequiredByPosition` already tested (e.g. `__tests__/unit/PositionTranslator.test.ts`). No change needed for fall time.
- **SorterStateManager:** If tests exist, add or extend cases for: (1) when buffer is non-zero, skip when earliest start < free + buffer; (2) trigger position >= free + buffer and <= requiredBy - leadCounts.
- **SystemCoordinator / ConveyorManager:** Integration tests (e.g. `__tests__/integration/`) could verify that skipped parts never get jet or move commands and that scheduled parts get the correct trigger positions.

### 8.9 Branch and baseline

- **Current branch:** `constant-speed-refactor` (from git status at time of research).
- **Baseline for “used to work”:** `main` before merge of PR #113 (“Rotary Encoder Refactor with Position Tracking and Jet Calibration Foundation”). On main, encoder scheduling used server-derived `detectionEncoderPos`; current branch uses frontend `encoderAtDetection` only.
- **View main’s version of a file:** `git show main:server/SystemCoordinator.ts` (or substitute path). Use to compare `buildEncoderPart` and detection encoder source.

### 8.10 Quick verification checklist

An agent can confirm the research by doing the following:

1. **Intended behavior:** Section 1 is the source of truth. Any implementation must satisfy 1.2 (skip rule), 1.3 (schedule rule), 1.4 (definitions), and 1.6 (summary table).
2. **Buffer missing:** In `SorterStateManager.ts`, search for `getFreePosition` and `canSorterReachBin`. Confirm there is no addition of a buffer to the free position and no `bufferCounts` (or similar) in the skip condition or trigger formula. In `types/settings.type.ts`, confirm there is no `sorterRestBufferInCounts` (or equivalent) in `positionCalibration` or elsewhere.
3. **Encoder-at-detection source:** In `SystemCoordinator.buildEncoderPart`, confirm `detectionEncoderPos` is set from `data.encoderAtDetection`. Run `git show main:server/SystemCoordinator.ts` and search for `getEncoderPositionAtTime` or `detectionEncoderPos` to see main’s server-side interpolation.
4. **Travel time lookup:** In `SorterManager.ts`, confirm `getTravelTimeBetweenBins` exists and uses `travelTimes[sorter][closestTravelTimeIndex]`. In `SorterStateManager.calculateLeadCounts`, confirm it calls `sorterManager.getTravelTimeBetweenBins` and multiplies by velocity.
5. **Required-by and fall time:** In `PositionTranslator.calculateRequiredByPosition`, confirm `return jetPosition - calibration.fallTimeInCounts`. In settings schema, confirm `fallTimeInCounts` exists (e.g. default 24).
6. **Skip/schedule flow:** Trace from `handleSortPart` → `buildEncoderPart` → `canSorterReachBin`. Confirm that when `availability.available` is false, the part is not added to the encoder queue and no move is scheduled; when true, `moveTriggerPosition` is set from `availability.triggerPosition`.
