# Encoder-Based Position Tracking Refactor Plan

## Overview

Refactor the LEGO sorting system from time-based action scheduling to encoder-based position tracking. This document defines a **server-centric architecture** where the server is the "brain" that makes all coordination decisions, and the Arduinos are "muscles" that execute with precise timing.

**Core Principle:** _Centralize decisions, distribute execution._

---

## Physical System Architecture

```
                                    ┌─────────────────────┐
                                    │      Frontend       │
                                    │  (Camera + Vision)  │
                                    └──────────┬──────────┘
                                               │ SORT_PART(pixelPos, bin, sorter)
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SERVER (Brain)                                  │
│  • Pixel → Encoder position translation                                      │
│  • Sorter state tracking (all 4 sorters)                                     │
│  • Part scheduling queue (ring buffer)                                       │
│  • Lead time calculations                                                    │
│  • "Can this part be sorted?" availability logic                             │
│  • Skip logic for unavailable sorters                                        │
└──────┬──────────────────┬──────────────────┬─────────────────┬───────────────┘
       │                  │                  │                 │
       ▼                  ▼                  ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Sorter 0   │  │   Sorter 1   │  │   Sorter 2   │  │   Sorter 3   │
│   Arduino    │  │   Arduino    │  │   Arduino    │  │   Arduino    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

┌─────────────────────────────────┐
│      Conveyor Arduino           │
│  • Encoder position counter     │
│  • Pending jets buffer (simple) │
│  • Motor + PID speed control    │
│  • 4 Jets (fixed positions)     │
└─────────────────────────────────┘
```

---

## State Ownership

| State                              | Owner            | Why                                              |
| ---------------------------------- | ---------------- | ------------------------------------------------ |
| **Encoder position (raw counter)** | Conveyor Arduino | Hardware owns it, increments in ISR              |
| **Encoder position (synced)**      | Server           | Needed for all scheduling calculations           |
| **Pending jet commands**           | Conveyor Arduino | Small buffer for precise timing execution        |
| **Scheduled parts queue**          | Server           | Complex coordination logic, visibility           |
| **Sorter current positions**       | Server           | Aggregated from 4 Arduino `MC:` responses        |
| **Sorter scheduled moves**         | Server           | Needed for lead time / availability calculations |
| **Pixel→Encoder calibration**      | Server           | Configuration data                               |
| **Travel time matrices**           | Server           | Per-sorter configuration                         |

---

## Responsibility Matrix

### Frontend (Detection)

```
Responsibilities:
  ✓ Detect part in camera frame
  ✓ Classify part → determine bin
  ✓ Send to server: (partId, pixelX, timestamp, bin, sorter)
  ✓ Receive encoder position updates for visualization (optional)

Does NOT:
  ✗ Know about encoder positions
  ✗ Know about sorter state
  ✗ Make sorting decisions
```

### Server (Coordinator / Brain)

```
Responsibilities:
  ✓ Translate pixel position → encoder position
  ✓ Track all 4 sorter states (current bin, scheduled moves, completion times)
  ✓ Maintain the part scheduling queue (ring buffer)
  ✓ Decide: "Can this part be sorted?" (sorter availability check)
  ✓ Calculate jet position (detection_pos + fixed_offset)
  ✓ Calculate lead time (how many counts before jet to trigger sorter move)
  ✓ Send jet commands to Conveyor Arduino (position-triggered, sent with lead time)
  ✓ Send move commands to Sorter Arduinos (at the right moment)
  ✓ Skip parts that can't be sorted (no commands sent)
  ✓ Log everything for debugging

Does NOT:
  ✗ Fire jets directly (latency-sensitive action delegated to Arduino)
  ✗ Own the raw encoder counter (just tracks synced value)
```

### Conveyor Arduino (Precise Jet Execution)

```
Responsibilities:
  ✓ Maintain encoder position counter (increment in ISR)
  ✓ Report position to server periodically (every N ticks)
  ✓ Store small buffer of pending jet commands: [(position, jet), ...]
  ✓ Fire jet immediately when position threshold crossed
  ✓ Motor speed control (PID)
  ✓ Confirm jet fired: "JF:<jet>,<position>"

Does NOT:
  ✗ Know about sorters, bins, or part IDs
  ✗ Make scheduling decisions
  ✗ Store complex ring buffer with part metadata
  ✗ Send MOVE requests (server handles sorter coordination)
```

### Sorter Arduinos (Move Execution)

```
Responsibilities:
  ✓ Move to commanded bin position
  ✓ Report move complete: "MC:<bin>"

Does NOT:
  ✗ Know about parts, timing, or coordination
  ✗ Queue up multiple moves (one at a time)
```

---

## Data Flow Example

```
1. DETECTION
   Frontend: "Part detected at pixel 1600, bin=45, sorter=2"

2. TRANSLATION (Server)
   Server calculates:
     current_encoder = 12000 (from last Arduino update)
     time_since_update = 15ms
     encoder_velocity = 20 counts/sec
     interpolated_pos = 12000 + (15ms × 0.02 counts/ms) ≈ 12000

     detection_encoder_pos = interpolated_pos + pixel_to_encoder_offset(1600)
                           = 12000 + 800 = 12800

     jet_position = detection_encoder_pos + CAMERA_TO_JET_OFFSET
                  = 12800 + 2000 = 14800

3. SORTER AVAILABILITY CHECK (Server)
   Server checks sorter 2 state:
     current_bin = 30
     scheduled_moves = [(bin=42, completes_at_pos=14200)]

   After scheduled move completes, sorter will be at bin 42.
   Travel time from bin 42 → bin 45 = 400ms ≈ 8 encoder counts

   Latest sorter can start moving = jet_position - fall_time_in_counts
                                  = 14800 - 10 = 14790

   Sorter will be free at position 14200.
   Move takes 8 counts, so sorter arrives at 14200 + 8 = 14208.
   14208 < 14790 ✓ Sorter can make it!

   move_trigger_position = 14200 (when previous move completes, start next)

4. SCHEDULING (Server)
   Server adds to its queue:
     {
       partId: "abc123",
       jetPosition: 14800,
       jet: 2,
       moveTriggerPosition: 14200,
       sorter: 2,
       bin: 45,
       jetCommandSent: false,
       moveCommandSent: false
     }

5. EXECUTION (Server monitors encoder, sends commands)

   When encoder reaches ~14700 (100 counts before jet):
     Server → Conveyor Arduino: "<q2,14800>"  (queue jet 2 at position 14800)

   When encoder reaches 14200:
     Server → Sorter 2 Arduino: "<m045>"  (move to bin 45)

   When encoder crosses 14800:
     Conveyor Arduino fires jet 2 immediately (local threshold check)
     Conveyor Arduino → Server: "JF:2,14800"  (confirmation)

   When sorter 2 arrives:
     Sorter 2 Arduino → Server: "MC:45"

6. SKIP LOGIC (if sorter can't make it)
   If step 3 determined sorter can't reach bin 45 in time:
     Server logs: "Skipping part abc123 - sorter 2 unavailable"
     No jet command sent
     No move command sent
     Part falls off end of conveyor (or into default/reject bin)
```

---

## Communication Protocol

### Server → Conveyor Arduino

| Command          | Format                                                                | Description                                              |
| ---------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Settings         | `s,<jet0_ms>,<jet1_ms>,<jet2_ms>,<jet3_ms>,<max_rpm>,<min_rpm>,<ppr>` | Initialize settings                                      |
| Queue Jet        | `q<jet>,<position>`                                                   | Queue jet to fire at encoder position (e.g., `q2,14800`) |
| Request Position | `e`                                                                   | Request current encoder position                         |
| Reset Encoder    | `r`                                                                   | Reset encoder position to 0                              |
| Buffer Status    | `b`                                                                   | Request pending jets buffer status                       |
| Conveyor On/Off  | `o`                                                                   | Toggle conveyor motor                                    |
| Set RPM          | `c<rpm>`                                                              | Set target RPM (e.g., `c55`)                             |
| Fire Jet Now     | `j<jet>`                                                              | Immediate jet fire (for testing)                         |

### Conveyor Arduino → Server

| Response      | Format                  | Description                                 |
| ------------- | ----------------------- | ------------------------------------------- |
| Ready         | `Ready`                 | Arduino booted and ready                    |
| Position      | `EP:<position>`         | Encoder position report (periodic)          |
| Jet Fired     | `JF:<jet>,<position>`   | Jet fired confirmation with actual position |
| Jet Queued    | `JQ:<jet>,<position>`   | Jet queued confirmation                     |
| Buffer Status | `BS:<count>,<capacity>` | Pending jets buffer status                  |
| Settings OK   | `Settings updated`      | Settings received                           |

### Server → Sorter Arduino (unchanged)

| Command | Format   | Description                |
| ------- | -------- | -------------------------- |
| Move    | `m<bin>` | Move to bin (e.g., `m045`) |
| Home    | `a`      | Start homing sequence      |

### Sorter Arduino → Server (unchanged)

| Response      | Format     | Description    |
| ------------- | ---------- | -------------- |
| Move Complete | `MC:<bin>` | Arrived at bin |
| Ready         | `Ready`    | Arduino booted |

---

## Task Breakdown

### Phase 1: Conveyor Arduino - Encoder & Pending Jets Buffer

#### Task 1.1: Add Encoder Position Counter

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Add a persistent encoder position counter that tracks absolute conveyor position.

**Requirements:**

- Add `volatile int32_t encoderPosition = 0` global variable
- Modify ISR to increment `encoderPosition` (in addition to existing pulse counting for RPM)
- Position should persist across speed changes
- Handle potential overflow (wrap at INT32_MAX or use uint32_t)

**Acceptance Criteria:**

- [ ] Encoder position increments correctly on each pulse
- [ ] Position persists when conveyor stops/starts
- [ ] No impact on existing RPM calculation

---

#### Task 1.2: Add Periodic Position Reporting

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Report encoder position to server at regular intervals.

**Requirements:**

- Add configurable report interval (e.g., every 10 ticks or 100ms)
- Send `EP:<position>` message over serial
- Only report when conveyor is running (optional: always report)

**Acceptance Criteria:**

- [ ] Server receives position updates at configured interval
- [ ] Format matches protocol: `EP:12345\n`

---

#### Task 1.3: Add Position Request Command

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Allow server to request current encoder position on demand.

**Requirements:**

- Add `e` command handler in `processMessage()`
- Respond with `EP:<position>`

**Acceptance Criteria:**

- [ ] `<e>` command returns current position immediately

---

#### Task 1.4: Add Encoder Reset Command

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Allow server to reset encoder position to zero.

**Requirements:**

- Add `r` command handler
- Set `encoderPosition = 0`
- Respond with confirmation

**Acceptance Criteria:**

- [ ] `<r>` resets position to 0
- [ ] Confirmation message sent

---

#### Task 1.5: Implement Pending Jets Buffer

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Add a simple buffer for position-triggered jet commands.

**Requirements:**

- Define struct:
  ```cpp
  struct PendingJet {
    uint32_t position;  // Fire when encoder >= this
    uint8_t jet;        // Which jet (0-3)
    bool active;        // Is this slot in use
  };
  ```
- Create array: `PendingJet pendingJets[16]` (~50 bytes)
- Implement `addPendingJet(jet, position)` function
- Implement `processPendingJets()` function called in main loop

**Acceptance Criteria:**

- [ ] Buffer can hold 16 pending jets
- [ ] Jets fire when encoder position crosses threshold
- [ ] Slots marked inactive after firing

---

#### Task 1.6: Add Queue Jet Command

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Add serial command to queue a jet fire at a specific position.

**Requirements:**

- Add `q<jet>,<position>` command handler (e.g., `q2,14800`)
- Parse jet number and position
- Call `addPendingJet()`
- Respond with `JQ:<jet>,<position>` confirmation
- Handle buffer full error

**Acceptance Criteria:**

- [ ] `<q2,14800>` queues jet 2 to fire at position 14800
- [ ] Confirmation sent: `JQ:2,14800`
- [ ] Error if buffer full

---

#### Task 1.7: Add Jet Fired Confirmation

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Send confirmation when a queued jet fires.

**Requirements:**

- When jet fires from pending buffer, send `JF:<jet>,<position>`
- Include actual encoder position at time of firing

**Acceptance Criteria:**

- [ ] `JF:2,14803` sent when jet 2 fires (position may differ slightly from target)

---

#### Task 1.8: Add Buffer Status Command

**File:** `arduino_code/conveyor_jets.cpp`

**Description:** Allow server to query pending jets buffer status.

**Requirements:**

- Add `b` command handler
- Respond with `BS:<active_count>,<capacity>`

**Acceptance Criteria:**

- [ ] `<b>` returns buffer status like `BS:3,16`

---

### Phase 2: Server - Encoder Position Tracking

#### Task 2.1: Add Encoder Position State to ConveyorManager

**File:** `server/components/ConveyorManager.ts`

**Description:** Track the current encoder position received from Arduino.

**Requirements:**

- Add properties:
  ```typescript
  private currentEncoderPosition: number = 0;
  private lastEncoderUpdateTime: number = 0;
  private encoderVelocity: number = 0; // counts per millisecond
  ```
- Parse `EP:<position>` messages from Arduino
- Calculate velocity from position deltas

**Acceptance Criteria:**

- [ ] Encoder position tracked and updated
- [ ] Velocity calculated for interpolation

---

#### Task 2.2: Implement Position Interpolation

**File:** `server/components/ConveyorManager.ts`

**Description:** Interpolate encoder position between Arduino updates.

**Requirements:**

- Add method:
  ```typescript
  getInterpolatedPosition(): number {
    const elapsed = Date.now() - this.lastEncoderUpdateTime;
    return this.currentEncoderPosition + (elapsed * this.encoderVelocity);
  }
  ```
- Use for scheduling calculations

**Acceptance Criteria:**

- [ ] Position can be estimated between updates
- [ ] Interpolation accounts for conveyor velocity

---

#### Task 2.3: Add Encoder Position Request Method

**File:** `server/components/ConveyorManager.ts`

**Description:** Method to request current position from Arduino.

**Requirements:**

- Add `requestEncoderPosition()` method
- Send `<e>` command via DeviceManager
- Return promise that resolves when `EP:` response received

**Acceptance Criteria:**

- [ ] Can request and receive position on demand

---

#### Task 2.4: Add Encoder Reset Method

**File:** `server/components/ConveyorManager.ts`

**Description:** Method to reset encoder to zero.

**Requirements:**

- Add `resetEncoderPosition()` method
- Send `<r>` command
- Reset local tracking state

**Acceptance Criteria:**

- [ ] Encoder resets to 0 on Arduino and server

---

#### Task 2.5: Broadcast Encoder Position to Frontend

**File:** `server/components/ConveyorManager.ts`, `server/components/SocketManager.ts`

**Description:** Share encoder position with frontend for visualization.

**Requirements:**

- Add `ENCODER_POSITION` socket event
- Broadcast position at regular intervals (e.g., 4-10 times/sec)
- Include timestamp for frontend interpolation

**Acceptance Criteria:**

- [ ] Frontend receives encoder position updates
- [ ] Updates include timestamp

---

### Phase 3: Server - Sorter State Management

#### Task 3.1: Create SorterStateManager

**File:** `server/components/SorterStateManager.ts` (new file)

**Description:** Centralized tracking of all 4 sorter states.

**Requirements:**

- Track for each sorter:

  ```typescript
  interface SorterState {
    currentBin: number;
    isMoving: boolean;
    targetBin: number | null;
    lastMoveCompletePosition: number; // encoder position when move completed
    scheduledMoves: ScheduledMove[];
  }

  interface ScheduledMove {
    bin: number;
    partId: string;
    triggerPosition: number; // encoder position to send move command
    expectedCompletePosition: number; // estimated completion position
  }
  ```

- Initialize from `SorterManager` current positions

**Acceptance Criteria:**

- [ ] Tracks state for all 4 sorters
- [ ] Supports scheduled moves queue per sorter

---

#### Task 3.2: Implement Sorter Availability Check

**File:** `server/components/SorterStateManager.ts`

**Description:** Determine if a sorter can reach a bin in time.

**Requirements:**

- Add method:
  ```typescript
  canSorterReachBin(
    sorterNum: number,
    targetBin: number,
    requiredByPosition: number, // must arrive by this encoder position
    currentEncoderPosition: number
  ): { available: boolean; triggerPosition: number }
  ```
- Account for current position, scheduled moves, and travel times
- Calculate when sorter will be free
- Calculate if there's enough time to reach target bin

**Acceptance Criteria:**

- [ ] Returns availability and trigger position
- [ ] Accounts for in-flight and scheduled moves

---

#### Task 3.3: Implement Lead Time Calculation

**File:** `server/components/SorterStateManager.ts`

**Description:** Calculate encoder counts needed for sorter to complete move.

**Requirements:**

- Add method:
  ```typescript
  calculateLeadCounts(
    sorterNum: number,
    fromBin: number,
    toBin: number
  ): number
  ```
- Use travel time matrix from settings
- Convert travel time to encoder counts using velocity

**Acceptance Criteria:**

- [ ] Accurately calculates lead counts
- [ ] Uses calibrated travel times

---

#### Task 3.4: Handle Move Complete Events

**File:** `server/components/SorterStateManager.ts`

**Description:** Update state when sorter reports move complete.

**Requirements:**

- Listen for `MC:<bin>` responses (via SorterManager callback)
- Update `currentBin`, clear `isMoving`, record completion position
- Remove from scheduled moves queue

**Acceptance Criteria:**

- [ ] State updates on move complete
- [ ] Scheduled move removed from queue

---

#### Task 3.5: Schedule Sorter Move

**File:** `server/components/SorterStateManager.ts`

**Description:** Add a move to the sorter's schedule.

**Requirements:**

- Add method:
  ```typescript
  scheduleMove(
    sorterNum: number,
    bin: number,
    partId: string,
    triggerPosition: number
  ): void
  ```
- Add to scheduled moves queue
- Sort queue by trigger position

**Acceptance Criteria:**

- [ ] Moves added to queue in order
- [ ] Queue accessible for availability checks

---

### Phase 4: Server - Part Scheduling Refactor

#### Task 4.1: Add Pixel-to-Encoder Translation

**File:** `server/SystemCoordinator.ts` or new `server/components/PositionTranslator.ts`

**Description:** Convert frontend pixel positions to encoder positions.

**Requirements:**

- Add calibration settings:
  ```typescript
  interface PositionCalibration {
    cameraEncoderOffset: number; // encoder position at camera center
    countsPerPixel: number; // encoder counts per camera pixel
    jetEncoderOffsets: number[]; // encoder position of each jet (indexed by sorter)
  }
  ```
- Add translation method:
  ```typescript
  pixelToEncoderPosition(
    pixelX: number,
    detectionTime: number,
    currentEncoderPos: number,
    encoderVelocity: number
  ): number
  ```

**Acceptance Criteria:**

- [ ] Pixel positions accurately translated to encoder positions
- [ ] Accounts for time elapsed since detection

---

#### Task 4.2: Refactor Part Building to Use Encoder Positions

**File:** `server/SystemCoordinator.ts`

**Description:** Replace time-based calculations with position-based.

**Requirements:**

- Modify `buildPart()` or create new `buildEncoderPart()`:
  ```typescript
  interface EncoderPart {
    partId: string;
    detectionEncoderPos: number;
    jetPosition: number;
    jet: number;
    sorter: number;
    bin: number;
    moveTriggerPosition: number;
    jetCommandSent: boolean;
    moveCommandSent: boolean;
    status: 'scheduled' | 'moving' | 'sorted' | 'skipped';
  }
  ```
- Calculate `jetPosition = detectionEncoderPos + cameraToJetOffset`
- Get `moveTriggerPosition` from SorterStateManager

**Acceptance Criteria:**

- [ ] Parts built with encoder positions
- [ ] No time-based calculations for position

---

#### Task 4.3: Implement Server-Side Part Queue

**File:** `server/components/ConveyorManager.ts` or new `server/components/PartScheduler.ts`

**Description:** Replace setTimeout-based scheduling with position-based queue.

**Requirements:**

- Maintain sorted queue of `EncoderPart` objects
- Sort by `jetPosition` (ascending)
- Add method to insert new part
- Add method to get next actionable part

**Acceptance Criteria:**

- [ ] Queue maintained in position order
- [ ] Parts accessible for action checking

---

#### Task 4.4: Implement Position-Based Action Loop

**File:** `server/components/ConveyorManager.ts` or `server/SystemCoordinator.ts`

**Description:** Check for and execute actions based on encoder position.

**Requirements:**

- Run check on each encoder position update (or on interval)
- For each part in queue:
  - If `!jetCommandSent` and `currentPos >= jetPosition - JET_LEAD_COUNTS`:
    - Send `q<jet>,<jetPosition>` to Arduino
    - Set `jetCommandSent = true`
  - If `!moveCommandSent` and `currentPos >= moveTriggerPosition`:
    - Send `m<bin>` to sorter Arduino
    - Set `moveCommandSent = true`
- Remove parts when jet fires (on `JF:` confirmation)

**Acceptance Criteria:**

- [ ] Jet commands sent with appropriate lead time
- [ ] Sorter moves triggered at correct position
- [ ] Parts removed after jet fires

---

#### Task 4.5: Implement Skip Logic

**File:** `server/SystemCoordinator.ts`

**Description:** Skip parts when sorter unavailable.

**Requirements:**

- In `handleSortPart()`:
  - Call `sorterStateManager.canSorterReachBin()`
  - If not available, mark part as `skipped`
  - Log skip reason
  - Emit skip event to frontend
- Do not send jet or move commands for skipped parts

**Acceptance Criteria:**

- [ ] Unavailable sorter causes part skip
- [ ] Skip logged and reported to frontend
- [ ] No commands sent for skipped parts

---

#### Task 4.6: Remove setTimeout-Based Scheduling

**File:** `server/components/ConveyorManager.ts`

**Description:** Remove legacy time-based scheduling code.

**Requirements:**

- Remove `scheduleJetFire()` setTimeout usage
- Remove `scheduleSorterMove()` setTimeout usage
- Remove `findTimeAfterDistance()` (or keep for backward compatibility flag)
- Remove speed-change scheduling (conveyor runs at constant speed)

**Acceptance Criteria:**

- [ ] No setTimeout for part actions
- [ ] All scheduling is position-based

---

### Phase 5: Frontend Updates

#### Task 5.1: Add Encoder Position Sync

**File:** `lib/services/SocketService.ts`

**Description:** Receive and track encoder position from server.

**Requirements:**

- Listen for `ENCODER_POSITION` socket event
- Store:
  ```typescript
  private currentEncoderPosition: number = 0;
  private lastEncoderUpdateTime: number = 0;
  ```
- Provide getter for other services

**Acceptance Criteria:**

- [ ] Encoder position tracked on frontend
- [ ] Available for interpolation

---

#### Task 5.2: Update SORT_PART Payload

**File:** `lib/services/SorterService.ts`, `types/sortPart.dto.ts`

**Description:** Include encoder position in sort part request.

**Requirements:**

- Update `SortPartDto`:
  ```typescript
  interface SortPartDto {
    partId: string;
    pixelPosition: number; // Keep for backward compatibility
    detectionTime: number; // Timestamp of detection
    bin: number;
    sorter: number;
  }
  ```
- Server will handle pixel→encoder translation

**Acceptance Criteria:**

- [ ] Detection time included in payload
- [ ] Server can translate position

---

#### Task 5.3: Display Encoder Position in UI (Optional)

**File:** `components/EncoderStatusDisplay.tsx` (new file)

**Description:** Show encoder position and buffer status in UI.

**Requirements:**

- Display current encoder position
- Display pending jets count (from periodic server updates)
- Display sorter states

**Acceptance Criteria:**

- [ ] Real-time encoder position visible
- [ ] Useful for debugging/calibration

---

### Phase 6: Type Updates

#### Task 6.1: Update Socket Message Types

**File:** `types/socketMessage.type.ts`

**Description:** Add new encoder-related message types.

**Requirements:**

- Add types:

  ```typescript
  interface EncoderPositionMessage {
    type: 'ENCODER_POSITION';
    position: number;
    timestamp: number;
    velocity: number;
  }

  interface PartSkippedMessage {
    type: 'PART_SKIPPED';
    partId: string;
    reason: string;
  }
  ```

**Acceptance Criteria:**

- [ ] Types defined for all new messages

---

#### Task 6.2: Update Arduino Command Types

**File:** `types/arduinoCommands.type.ts`

**Description:** Document new conveyor commands.

**Requirements:**

- Add new command types:
  ```typescript
  type ConveyorCommand =
    | 'o' // Toggle on/off
    | `c${number}` // Set RPM
    | `j${number}` // Fire jet now
    | `q${number},${number}` // Queue jet at position
    | 'e' // Request position
    | 'r' // Reset encoder
    | 'b'; // Buffer status
  ```

**Acceptance Criteria:**

- [ ] All commands documented with types

---

#### Task 6.3: Update Part Type

**File:** `types/part.type.ts`

**Description:** Update Part interface for encoder-based tracking.

**Requirements:**

- Update or add:
  ```typescript
  interface EncoderPart {
    partId: string;
    detectionEncoderPos: number;
    jetPosition: number;
    moveTriggerPosition: number;
    jet: number;
    sorter: number;
    bin: number;
    jetCommandSent: boolean;
    moveCommandSent: boolean;
    status: 'scheduled' | 'moving' | 'sorted' | 'skipped';
  }
  ```

**Acceptance Criteria:**

- [ ] Part type uses encoder positions

---

### Phase 7: Calibration & Testing

#### Task 7.1: Add Calibration Settings

**File:** `types/settings.type.ts`, Firebase settings document

**Description:** Add position calibration settings.

**Requirements:**

- Add to settings:
  ```typescript
  interface PositionCalibrationSettings {
    cameraEncoderOffset: number;
    countsPerPixel: number;
    jetEncoderOffsets: number[]; // Per-sorter jet positions
    jetLeadCounts: number; // How far ahead to send jet commands
  }
  ```

**Acceptance Criteria:**

- [ ] Calibration settings stored in Firebase
- [ ] Accessible from server

---

#### Task 7.2: Add Calibration UI

**File:** `components/buttons/EncoderCalibrationButton.tsx` (new file)

**Description:** UI for calibrating encoder positions.

**Requirements:**

- Button to reset encoder to 0
- Button to mark current position as camera position
- Button to mark current position as jet position (per sorter)
- Display current encoder position during calibration

**Acceptance Criteria:**

- [ ] Can reset encoder
- [ ] Can record calibration points
- [ ] Values saved to settings

---

#### Task 7.3: Integration Testing

**Description:** Test complete part flow with encoder-based system.

**Test Scenarios:**

1. Single part flow: detect → classify → schedule → move → fire
2. Multiple parts in sequence: verify ordering and lead times
3. Sorter unavailable: verify skip logic
4. Parts too close together: verify handling
5. Arduino reset: verify recovery
6. Serial disconnect: verify reconnection and state recovery

**Acceptance Criteria:**

- [ ] All scenarios pass
- [ ] No regressions from time-based system

---

## Migration Strategy

1. **Phase 1-2**: Arduino changes + Server position tracking (can be tested independently)
2. **Phase 3**: Sorter state management (builds on Phase 2)
3. **Phase 4**: Part scheduling refactor (depends on Phase 1-3)
4. **Phase 5-6**: Frontend + Types (can be done alongside Phase 4)
5. **Phase 7**: Calibration and testing (after all phases complete)

**Feature Flag:** Add `USE_ENCODER_SCHEDULING: boolean` to settings to toggle between old and new systems during transition.

---

## Memory and Performance

### Conveyor Arduino (Uno)

- 2KB SRAM, 32KB Flash
- Pending jets buffer: 16 slots × 6 bytes = ~96 bytes
- Encoder position: 4 bytes
- Plenty of headroom compared to original 1.4KB ring buffer plan

### Communication

- Position reports: ~10 bytes × 10/sec = 100 bytes/sec
- Jet commands: ~15 bytes × occasional
- Well under 1% of serial bandwidth at 115200 baud

### Server

- Part queue: ~200 bytes per part × 120 max = ~24KB
- Sorter state: ~500 bytes per sorter × 4 = ~2KB
- Minimal memory footprint

---

## Appendix: Why This Architecture

### vs. Full Arduino Ring Buffer

The original plan had the Arduino storing full part metadata and sending MOVE requests. This new architecture is simpler because:

1. **Arduino code is trivial** - just encoder + simple jet buffer
2. **All coordination visible on server** - easier debugging
3. **No Arduino reflash to change logic** - scheduling changes are server-side
4. **Less Arduino memory pressure** - 96 bytes vs 1.4KB

### vs. Server Sending Every Jet Command in Real-Time

Sending jet commands from server at the exact moment has 5-10ms latency. At 4 inches/second, that's ~0.04 inches of error. While probably acceptable, the pending jets buffer eliminates this entirely with minimal Arduino complexity.

### The Hybrid Approach

This architecture gets the best of both worlds:

- **Server-side intelligence** for coordination and debugging
- **Arduino-side execution** for precise timing
- **Minimal communication** overhead
- **Simple, maintainable code** on both sides
