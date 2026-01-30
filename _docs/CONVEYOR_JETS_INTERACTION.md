# Conveyor & Jets System: Arduino Logic and Backend Interaction

## 1. Overview

This document explains the functionality of the Conveyor & Jets Arduino controller (`conveyor_jets.cpp`) and its interaction with the backend server. This component is responsible for three critical physical operations in the sorting process:

1. **Conveyor Belt Control:** Drives the main conveyor belt at a precise, constant speed using PID control.
2. **Encoder Position Tracking:** Maintains an absolute position counter that serves as the source of truth for part location on the conveyor.
3. **Part Ejection:** Fires one of four pneumatic air jets to eject identified LEGO parts from the conveyor belt into sorting funnels.

The hardware controlled by this Arduino includes:

- DC motor with quadrature encoder for the conveyor
- Four solenoid valves for the air jets
- Rotary encoder for position tracking (20 pulses per revolution)

## 2. Core Logic in `conveyor_jets.cpp`

The Arduino's main `loop()` manages three primary, non-blocking tasks: maintaining conveyor speed, tracking encoder position, and processing position-triggered jet commands.

### 2.1. Encoder Position Tracking

The encoder serves two purposes: speed measurement (RPM) and absolute position tracking.

- **Position Counter:** A global `encoderPosition` variable (int32_t) tracks the absolute conveyor position in encoder counts.
- **Interrupt Service Routine:** The ISR increments both `pulseCount` (for RPM, reset periodically) and `encoderPosition` (persistent, never auto-reset) on each encoder pulse. Uses `CHANGE` interrupt mode to count both edges, doubling resolution.
- **Periodic Reporting:** The Arduino reports its current position to the server every 100ms via `EP:<position>` messages (configurable via `POSITION_REPORT_INTERVAL`).
- **Pulses Per Revolution:** Configurable via settings (default 20), sent from server on initialization.
- **Position is the source of truth** for when actions should occur, replacing time-based scheduling.

### 2.2. Closed-Loop Conveyor Speed Control

The conveyor belt must maintain a consistent speed. The firmware implements a PID closed-loop control system.

- **Encoder Feedback:** The ISR monitors the motor's encoder, tracking pulses for RPM calculation.
- **RPM Calculation:** Every control interval, the main loop calculates `currentRPM` based on pulse count.
- **PID Control Logic:** Adjusts motor PWM to maintain target RPM despite load variations.

### 2.3. Pending Jets Buffer

Instead of firing jets immediately on command, the Arduino maintains a small buffer of position-triggered jet commands. This enables precise timing without relying on server communication latency.

- **Buffer Structure:** Array of `PendingJet` structs, each containing a target position and jet number.
- **Adding Jets:** Server sends `q<jet>,<position>` to queue a jet fire at a specific encoder position.
- **Processing:** On each loop iteration, the code checks if `encoderPosition >= targetPosition` for any pending jet.
- **Firing:** When the position threshold is crossed, the jet fires immediately and a confirmation is sent.

```cpp
struct PendingJet {
  uint32_t position;  // Fire when encoder >= this
  uint8_t jet;        // Which jet (0-3)
  bool active;        // Is this slot in use
};

#define MAX_PENDING_JETS 16
PendingJet pendingJets[MAX_PENDING_JETS];
```

### 2.4. Non-Blocking Jet Firing

Firing an air jet is handled asynchronously to avoid blocking the main loop.

- When a jet fires (either from pending buffer or immediate command), the pin goes `HIGH`.
- The `jetEndTime` is calculated using the configured `JET_FIRE_TIMES`.
- A `jetActive` flag is set for that jet.
- On each loop iteration, jets are turned `LOW` when their end time is reached.

## 3. Backend <-> Arduino Communication Protocol

### 3.1. Standardization Notes

The interaction between the backend and the Arduino firmware follows these standards:

1. **Serial Message Framing:** All commands from the backend **must** be framed with start and end markers (`<` and `>`). The Arduino ignores any serial data outside of these markers.
2. **'Ready' Handshake:** Upon boot, the Arduino sends `Ready`. The backend should wait for this signal before sending commands.
3. **Mandatory Settings Initialization:** The first command sent must be the settings command (`s`). Other commands will be rejected with `Settings not initialized`.
4. **State Reset on Settings Update:** A valid `s` command resets all internal state and stops the motor.

### 3.2. Commands (Backend to Arduino)

#### Settings Command

- **`s` (Settings Update):**
  - **Format:** `s,<FIRE_TIME_0>,<FIRE_TIME_1>,<FIRE_TIME_2>,<FIRE_TIME_3>,<MAX_RPM>,<MIN_RPM>,<PPR>,<KP_INT>,<KI_INT>,<KD_INT>`
  - **Parameters:**
    - `FIRE_TIME_0..3`: Jet fire durations in milliseconds (one per jet)
    - `MAX_RPM`: Maximum allowed conveyor RPM
    - `MIN_RPM`: Minimum allowed conveyor RPM
    - `PPR`: Pulses per revolution for encoder (default 20)
    - `KP_INT`, `KI_INT`, `KD_INT`: PID gains multiplied by 100 (e.g., Kp=0.30 → 30)
  - **Action:** Configures jet fire durations, RPM bounds, encoder PPR, and PID tuning. Resets device state including motor, PID controller, and pending jets buffer.
  - **Response:** `Settings updated`
  - **Note:** The last 4 parameters (PPR and PID) are optional for backward compatibility.

#### Motor Control Commands

- **`o` (Conveyor On/Off):**

  - **Format:** `o`
  - **Action:** Toggles the conveyor motor state.
  - **Response:** `conveyor on` or `conveyor off`

- **`c` (Set Conveyor Target RPM):**
  - **Format:** `c<RPM>` (e.g., `c55`)
  - **Action:** Updates the `targetRPM` for the PID controller.
  - **Response:** `RPM updated: <VALUE>`

#### Encoder Commands

- **`e` (Request Encoder Position):**

  - **Format:** `e`
  - **Action:** Returns current encoder position immediately.
  - **Response:** `EP:<position>` (e.g., `EP:12345`)

- **`r` (Reset Encoder Position):**
  - **Format:** `r`
  - **Action:** Resets encoder position to 0 (uses `noInterrupts()` for atomic operation).
  - **Response:** `ER:0`

#### Jet Commands

- **`j` (Fire Jet Immediately):**

  - **Format:** `j<JET_NUM>` (e.g., `j2`)
  - **Action:** Fires the specified jet immediately (for testing/manual control). Jet remains HIGH for the configured `JET_FIRE_TIMES[jet]` duration.
  - **Response:** `Jet fire: <JET_NUM>`

- **`q` (Queue Jet at Position):**

  - **Format:** `q<JET_NUM>,<POSITION>` (e.g., `q2,14800`)
  - **Action:** Queues a jet to fire when encoder position reaches the specified value. The Arduino will fire the jet instantly when `encoderPosition >= position`.
  - **Response:** `JQ:<JET_NUM>,<POSITION>` (e.g., `JQ:2,14800`) - confirms jet was queued
  - **On Fire:** `JF:<JET_NUM>,<ACTUAL_POSITION>` - sent when jet actually fires
  - **Error:** `Error: Jet buffer full` if pending jets buffer (16 slots) is at capacity.

- **`b` (Buffer Status):**
  - **Format:** `b`
  - **Action:** Returns pending jets buffer status.
  - **Response:** `BS:<active_count>,<capacity>` (e.g., `BS:3,16`)

### 3.3. Responses (Arduino to Backend)

| Response                   | Format                     | Description                                                              |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `Ready`                    | `Ready`                    | Sent on successful boot (twice: once for Ready, once for setup complete) |
| `Settings updated`         | `Settings updated`         | Settings command accepted                                                |
| `Settings not initialized` | `Settings not initialized` | Command rejected, send settings first                                    |
| `EP:<pos>`                 | `EP:12345`                 | Encoder position (periodic every 100ms or on `e` request)                |
| `ER:0`                     | `ER:0`                     | Encoder reset confirmation                                               |
| `JF:<jet>,<pos>`           | `JF:2,14803`               | Jet fired confirmation with actual encoder position                      |
| `JQ:<jet>,<pos>`           | `JQ:2,14800`               | Jet queued confirmation                                                  |
| `BS:<count>,<cap>`         | `BS:3,16`                  | Buffer status (active count, capacity=16)                                |
| `Jet fire: <jet>`          | `Jet fire: 2`              | Immediate jet fire confirmation (from `j` command)                       |
| `Error: Jet buffer full`   | `Error: Jet buffer full`   | Pending jets buffer at capacity                                          |
| `Error: ...`               | `Error: ...`               | For malformed commands or other errors                                   |

### 3.4. Position Reporting

The Arduino periodically sends encoder position updates to the server:

- **Interval:** Every 100ms (defined by `POSITION_REPORT_INTERVAL`)
- **Format:** `EP:<position>` (e.g., `EP:12345`)
- **Purpose:** Allows server to track conveyor position for scheduling decisions
- **Thread Safety:** Uses `noInterrupts()`/`interrupts()` around 32-bit position read since AVR doesn't have atomic 32-bit reads

## 4. Architecture Notes

### 4.1. Server-Centric Coordination

The conveyor Arduino is intentionally simple. All scheduling intelligence lives on the server:

- **Server responsibilities:**

  - Track encoder position (from `EP:` messages)
  - Calculate when jets should fire (based on part detection and sorter state)
  - Send jet commands with appropriate lead time
  - Coordinate sorter moves

- **Arduino responsibilities:**
  - Maintain accurate encoder position
  - Report position to server
  - Execute jet fires at precise positions
  - Control conveyor motor speed

### 4.2. Why Pending Jets Buffer?

Direct jet commands from the server would have 5-10ms serial latency. At typical conveyor speeds, this could cause ~0.04 inches of position error. The pending jets buffer eliminates this:

1. Server sends `q2,14800` when part is ~100 counts away
2. Arduino stores this in the pending buffer
3. Arduino fires jet 2 instantly when position crosses 14800
4. Latency from threshold to fire: <1ms

### 4.3. Memory Usage

The Arduino Uno has 2KB SRAM. This implementation uses:

- Pending jets buffer: 16 × 6 bytes = ~96 bytes
- Encoder position: 4 bytes
- Other variables: ~200 bytes
- **Total:** ~300 bytes (leaves ~1.7KB for stack and other operations)

This is much lighter than a full ring buffer implementation (~1.4KB).
