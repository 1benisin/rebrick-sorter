# Sorter System: Arduino Logic and Backend Interaction

## 1. Overview

This document details the functionality of the Sorter Arduino controller (`sorter.cpp`) and its communication with the backend server. The system has **four identical sorters**, each controlled by its own Arduino. Each sorter is a 2-axis (X and Y) gantry system controlled by two stepper motors. Its sole purpose is to position the collection funnel directly over a specific bin in a grid, ready to receive a part ejected from the conveyor belt.

Precise positioning and a reliable homing mechanism are the two most critical aspects of this component.

## 2. Role in System Architecture

### 2.1. Server-Centric Coordination

The sorter Arduinos are intentionally simple "muscles" that execute commands. All coordination intelligence lives on the server:

- **Server responsibilities:**

  - Track each sorter's current and scheduled positions
  - Determine when to send move commands (based on encoder position)
  - Check if sorter can reach a bin in time for an incoming part
  - Skip parts when sorter unavailable

- **Sorter Arduino responsibilities:**
  - Move to commanded bin position
  - Report when move is complete
  - Handle homing sequence

### 2.2. Why Four Sorters?

With a 30-foot conveyor and multiple parts in transit, a single sorter can't keep up. Four sorters provide:

- Parallelism: Different parts route to different sorters
- Reduced travel time: Each sorter covers a portion of bins
- Redundancy: System can operate with sorter failures

## 3. Core Logic in `sorter.cpp`

### 3.1. Bin-to-Coordinate Calculation

The backend sends a simple, 1-based bin number. The Arduino translates this to stepper coordinates.

- **`moveToBin(int binNum)`:** Core translation logic
  - Uses `GRID_DIMENSION` and `ROW_MAJOR_ORDER` to determine (x, y) index
  - Calculates stepper position: `index × stepsPerBin + offset`
  - Issues non-blocking `moveTo` commands to `FastAccelStepper` library

### 3.2. Homing State Machine

Before accurate movement, the sorter must establish a known zero position via the `handleHoming()` function.

- **Trigger:** `a` command from backend
- **States (`HomingState`):**

  1. `HOMING_START`: Initiates sequence
  2. `HOMING_Y_BACKWARD`: Y-axis moves until endstop triggered
  3. `HOMING_X_BACKWARD`: X-axis moves until endstop triggered
  4. After endstop hit, backs off by `HOMING_BACKOFF_STEPS`, zeros position
  5. `HOMING_WAIT_FOR_OFFSET`: Moves to configured `X_OFFSET` and `Y_OFFSET`
  6. `HOMING_COMPLETE`: Ready for normal operation

- **Safety:** 30-second timeout per axis. Timeout triggers `HOMING_ERROR` state.

### 3.3. Move Complete Detection

The Arduino monitors stepper motor completion and sends `MC: <bin>` when the move finishes. The server uses this to:

- Update the sorter's current position
- Trigger the next scheduled move (if any)
- Confirm the sorter is ready for the incoming part

## 4. Backend <-> Arduino Communication Protocol

### 4.1. Standardization Notes

1. **Serial Message Framing:** Commands wrapped in `<...>` (e.g., `<m045>`)
2. **'Ready' Handshake:** Arduino sends `Ready` on boot; backend waits for this
3. **Mandatory Settings Initialization:** `s` command must be sent first
4. **State Reset on Settings Update:** `s` command stops motors, requires re-homing

### 4.2. Commands (Backend to Arduino)

- **`s` (Settings Update):**

  - **Format:** `s,<GRID_DIMENSION>,<X_OFFSET>,<Y_OFFSET>,<X_STEPS_TO_LAST>,<Y_STEPS_TO_LAST>,<ACCELERATION>,<HOMING_SPEED>,<SPEED>,<ROW_MAJOR_ORDER>`
  - **Action:** Configures grid parameters, calculates `stepsPerBin`
  - **Response:** `Settings updated`

- **`m` (Move to Bin):**

  - **Format:** `m<BIN>` (e.g., `<m045>`) - zero-padded 3-digit bin
  - **Action:** Non-blocking move to specified bin
  - **Response:** `MC: <BIN>` when move completes

- **`h` (Move to Home/Center):**

  - **Format:** `h`
  - **Action:** Move to center of grid
  - **Response:** `MC: <BIN>` when complete

- **`a` (Start Homing):**
  - **Format:** `a`
  - **Action:** Initiates homing state machine
  - **Response:** Multiple status messages, ending with `Homing complete.`

### 4.3. Responses (Arduino to Backend)

| Response                   | Format                     | Description                        |
| -------------------------- | -------------------------- | ---------------------------------- |
| `Ready`                    | `Ready`                    | Sent on boot                       |
| `Settings updated`         | `Settings updated`         | Settings received                  |
| `Settings not initialized` | `Settings not initialized` | Command rejected                   |
| `MC: <BIN>`                | `MC: 45`                   | **Move Complete** - arrived at bin |
| `Homing ...`               | Various                    | Status during homing sequence      |
| `Error: ...`               | `Error: ...`               | Malformed command or timeout       |

**The `MC: <BIN>` response is critical.** The server waits for this to:

- Confirm the sorter is in position
- Start the next scheduled move
- Calculate availability for new parts

## 5. Server-Side State Management

### 5.1. SorterStateManager

The server maintains state for each of the 4 sorters:

```typescript
interface SorterState {
  currentBin: number; // Where sorter is now
  isMoving: boolean; // Currently in motion
  targetBin: number | null; // Where it's heading
  lastMoveCompletePosition: number; // Encoder position when move finished
  scheduledMoves: ScheduledMove[]; // Queue of upcoming moves
}

interface ScheduledMove {
  bin: number;
  partId: string;
  triggerPosition: number; // Encoder position to send command
  expectedCompletePosition: number; // Estimated completion position
}
```

### 5.2. Availability Check

Before scheduling a part, the server checks:

```typescript
canSorterReachBin(
  sorterNum: number,
  targetBin: number,
  deadline: number  // Encoder position by which sorter must arrive
): boolean {
  // 1. When will sorter be free? (after current + scheduled moves)
  // 2. From that position, how long to reach targetBin?
  // 3. Will it arrive before deadline?
}
```

### 5.3. Travel Time Matrix

The server stores pre-calculated travel times between bins:

```typescript
travelTimes[sorterNum][fromBin][toBin] = milliseconds;
```

This is converted to encoder counts using current conveyor velocity.

## 6. Timing Considerations

### 6.1. Move Command Timing

The server sends the move command when encoder reaches `triggerPosition`:

```
triggerPosition = previousMoveCompletePosition
```

For the first move, or when sorter is idle:

```
triggerPosition = currentEncoderPosition (send immediately)
```

### 6.2. Part Deadline

The sorter must be in position before the part falls:

```
deadline = jetPosition - fallTimeInCounts
```

Where `fallTimeInCounts` is the time for a part to fall from conveyor to funnel, converted to encoder counts.

### 6.3. Skip Logic

If `arrivalPosition > deadline`, the part is skipped:

- No jet command sent (part stays on conveyor)
- No move command sent (sorter stays put)
- Server logs reason: "Sorter X cannot reach bin Y in time"
- Frontend notified via `PART_SKIPPED` event

## 7. Error Handling

### 7.1. Homing Failure

If endstop not hit within 30 seconds:

- `HOMING_ERROR` state entered
- Motors stopped
- Error reported to backend
- Manual intervention or re-home required

### 7.2. Communication Loss

- `DeviceManager` handles reconnection with exponential backoff
- On reconnect, settings re-sent
- Re-homing required after Arduino reset

### 7.3. Move Timeout

If `MC:` not received within expected time:

- Server can query sorter status
- May need to re-home if position uncertain

## 8. Configuration Parameters

| Parameter                            | Description                        |
| ------------------------------------ | ---------------------------------- |
| `GRID_DIMENSION`                     | Size of bin grid (e.g., 8 for 8×8) |
| `X_OFFSET`, `Y_OFFSET`               | Steps from home to first bin       |
| `X_STEPS_TO_LAST`, `Y_STEPS_TO_LAST` | Steps across full grid             |
| `ACCELERATION`                       | Stepper acceleration (steps/s²)    |
| `SPEED`                              | Normal move speed (steps/s)        |
| `HOMING_SPEED`                       | Slower speed for homing (steps/s)  |
| `ROW_MAJOR_ORDER`                    | Grid layout (true/false)           |

These are stored in Firebase settings and sent to each sorter Arduino on initialization.
