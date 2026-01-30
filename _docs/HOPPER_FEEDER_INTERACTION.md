# Hopper/Feeder System: Arduino Logic and Backend Interaction

## 1. Overview

This document details the inner workings of the Hopper/Feeder Arduino controller (`hopper_feeder.cpp`) and its communication protocol with the Node.js backend server. The primary purpose of this system is to deliver a consistent, single-file stream of LEGO parts from a bulk container to the main conveyor belt for sorting.

The system consists of three main hardware components controlled by a single Arduino:

1.  **The Hopper:** A large bin holding unsorted LEGOs. It is attached to a mechanism driven by a stepper motor (`hopperStepper`) that agitates the parts to prevent clumping and ensure they flow into the feeder.
2.  **The Vibratory Feeder:** A channel that vibrates to move parts forward in a line. The vibration intensity is controlled via a PWM signal to a motor driver (`FEEDER_RPWM_PIN`).
3.  **The Part Sensor:** An I2C distance sensor positioned at the end of the feeder channel. It detects when a part is present and ready to be dispensed onto the main conveyor belt.

## 2. Core Logic and State Machines in `hopper_feeder.cpp`

The Arduino code is built around two independent, non-blocking state machines that run continuously in the main `loop()`. This ensures that both the hopper and the feeder can operate responsively.

### 2.1. `checkFeeder()` - The Vibratory Feeder State Machine

This function controls the vibratory motor. Its goal is to move one part to the end of the channel and then pause until that part is clear.

- **States (`FeederState`):**
  - `start_moving`: Initiates a new movement cycle. Records the current time and immediately transitions to `ramp_up_move`.
  - `ramp_up_move`: **Soft start phase.** Gradually ramps motor speed from `RAMP_START_SPEED` (60) to `FEEDER_VIBRATION_SPEED` over `RAMP_UP_DURATION` (1000ms). This prevents mechanical stress and part displacement from sudden starts. If a part is detected or timeout occurs during ramp-up, transitions directly to `paused`. Otherwise, transitions to `moving` when ramp completes.
  - `moving`: The feeder runs at full speed until either the part sensor detects an object (`distance < 20`) or a maximum time (`FEEDER_LONG_MOVE_TIME`) elapses. This prevents the feeder from running indefinitely if no parts are flowing. Once stopped, it transitions to `paused`.
  - `paused`: The feeder waits for a configurable duration (`FEEDER_PAUSE_TIME`). After the pause, it checks the sensor again. If a part is still present, it initiates a `short_move`. If no part is detected, it assumes the part has moved onto the conveyor and goes back to `start_moving` to fetch the next one.
  - `short_move`: A very brief vibration (`FEEDER_SHORT_MOVE_TIME`) designed to nudge a waiting part forward without pulling the entire line of parts with it. Runs at full `FEEDER_VIBRATION_SPEED` without ramp-up.

### 2.2. `checkHopper()` - The Hopper Agitation State Machine

This function controls the agitation cycle of the main hopper. Instead of running on a fixed timer, its cycle is triggered by the cumulative run-time of the vibratory feeder (`totalFeederVibrationTime`), which serves as a proxy for how many parts have been processed.

- **States (`HopperState`):**

  - `waiting_top`: The default idle state. It continuously checks if `totalFeederVibrationTime >= HOPPER_CYCLE_INTERVAL`. When triggered, it resets `totalFeederVibrationTime` to 0 and initiates the down movement.
  - `moving_down`: The stepper motor moves the hopper mechanism down using `hopperStepper->move(-hopperFullStrokeSteps-20)`. Movement stops when either the physical limit switch (`STOP_PIN`) reads LOW or the motor finishes its commanded steps. On stop, calls `forceStopAndNewPosition(0)` to zero the position.
  - `waiting_bottom`: A brief pause at the bottom (`hopperBottomWaitTime = 10ms`). This allows the parts to settle before returning.
  - `moving_up`: The stepper motor moves back up using `hopperStepper->move(hopperFullStrokeSteps)`. When the motor stops running, transitions back to `waiting_top`.

- **Debug Output:** When `HOPPER_DEBUG` is enabled, prints vibration time progress every 5 seconds in `waiting_top` state.

### 2.3. Safety and Reliability

- **Watchdog Timer:** The `setup()` function initializes a **2-second** hardware watchdog timer (`WDTO_2S`). The main `loop()` must call `wdt_reset()` every iteration. If the code freezes or gets stuck (e.g., I2C lockup), the watchdog will automatically hard-reset the Arduino. The watchdog is disabled briefly at startup to prevent reset loops if recovering from a WDT reset.
- **Non-Blocking Sensor Reads:** The code uses a state machine (`processSensorReading`) with states `IDLE`, `REQUEST_SENT`, and `WAITING_FOR_READING` to read from the I2C distance sensor without using `delay()`. Includes a 50ms timeout (`SENSOR_READ_TIMEOUT_MS`) to prevent hangs.
- **I2C Bus Recovery:** If I2C communication fails, the `I2C_ClearBus()` function performs proper bus recovery per I2C spec: generates up to 9 clock pulses on SCL to release any slave holding SDA low, then sends a STOP condition. This handles cases where a ToF sensor gets stuck mid-transaction.
- **Fail-Safe Motor Stop:** On any I2C error, the feeder motor is immediately stopped and state transitions to `paused` to prevent runaway vibration.
- **Speed Limiting:** The `MAX_FEEDER_SPEED` value is latched from the first settings message received after boot. All subsequent speed updates are clamped to this maximum, providing a hardware-side safeguard against accidental over-speed commands.

## 3. Backend <-> Arduino Communication Protocol

Communication occurs over a standard Serial (USB) connection. The backend sends single-line commands, and the Arduino responds with status or error messages.

### 3.1. Message Framing

All commands from the backend to the Arduino **must** be framed with start and end markers: `<` and `>`.

- **Example:** `<s,12000,2020,92,1,1000,60,3000>`

The Arduino code in `loop()` captures characters into a buffer only after seeing a `<`. The message is processed when a `>` is received. This framing makes the protocol robust against line noise and incomplete transmissions.

### 3.2. Commands (Backend to Arduino)

The `processMessage()` function parses incoming commands based on the first character.

- **`s` (Settings Update):** This is the most critical command. It must be sent by the backend before any other command will be accepted.

  - **Format:** `s,<HOPPER_CYCLE_INTERVAL>,<HOPPER_CYCLE_STEPS>,<FEEDER_VIBRATION_SPEED>,<FEEDER_STOP_DELAY>,<FEEDER_PAUSE_TIME>,<FEEDER_SHORT_MOVE_TIME>,<FEEDER_LONG_MOVE_TIME>`
  - **Parameters:**
    - `HOPPER_CYCLE_INTERVAL`: Feeder vibration time before hopper cycle triggers
    - `HOPPER_CYCLE_STEPS`: Stepper motor steps for full hopper stroke
    - `FEEDER_VIBRATION_SPEED`: PWM value (0-255) for feeder motor
    - `FEEDER_STOP_DELAY`: Delay before stopping after part detection
    - `FEEDER_PAUSE_TIME`: Duration to pause between movements
    - `FEEDER_SHORT_MOVE_TIME`: Duration of short nudge movements
    - `FEEDER_LONG_MOVE_TIME`: Maximum continuous run time
  - **Action:** The `processSettings()` function parses the 7 integer values and updates the corresponding variables in the firmware. It also resets all state machines to their initial states.
  - **Speed Latching:** On the **first** settings message after boot, `MAX_FEEDER_SPEED` is set to the provided `FEEDER_VIBRATION_SPEED`. All subsequent settings updates will clamp the speed to this latched maximum using `min(values[2], MAX_FEEDER_SPEED)`. This prevents accidental over-speed commands.
  - **Response:** `"Settings updated"` on success, or `"Error: Not enough settings provided"` if fewer than 7 values are received.

- **`p` (Pause Time Update):** A specialized command to dynamically adjust the feeder's pause time.

  - **Format:** `p,<new_pause_time>`
  - **Action:** Updates only the `FEEDER_PAUSE_TIME` variable.

- **`o` (Hopper Override):** Manually controls the hopper cycle.
  - **Format:** `o,1` (Start a new cycle) or `o,0` (Stop and reset the hopper).
  - **Action:** Bypasses the normal time-based trigger and either forces an agitation cycle to begin or stops any movement and returns the hopper to its `waiting_top` state.

### 3.3. Responses (Arduino to Backend)

The Arduino sends simple newline-terminated strings back to the backend server.

| Response                                   | Description                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Ready`                                    | Sent once at the end of `setup()`. Backend should wait for this before sending commands.     |
| `Settings not initialized`                 | Command rejected because `s` hasn't been received yet (only sent if `SYSTEM_DEBUG` is true). |
| `Settings updated`                         | Confirmation of successful `s` command.                                                      |
| `Error: Not enough settings provided`      | Settings command had fewer than 7 values.                                                    |
| `Error: Invalid message format`            | Settings command format was malformed.                                                       |
| `Error: Invalid pause time message format` | Pause time command format was malformed.                                                     |

**Debug Messages (when `*_DEBUG` flags are true):**

- `HOPPER: Starting new cycle...` - Hopper cycle triggered
- `HopperSTATE: -> <state>` - Hopper state transitions
- `FeederSTATE: -> <state>` - Feeder state transitions
- `SENSOR: Part detected in front of sensor` - Part detected (distance < 20)
- `HEARTBEAT: Main loop is alive.` - Every 5 seconds when `SYSTEM_DEBUG` is true

**I2C Error Messages:**

- `ERROR: I2C end transmission failed (endResult: X)` - I2C communication error
- `ERROR: I2C requestFrom failed. Attempting I2C recovery.` - I2C read failed
- `ERROR: Sensor read timeout. Attempting I2C recovery.` - Sensor read timed out
- `WARN: I2C SDA stuck low. Attempting bus recovery...` - Bus recovery initiated

---

This architecture ensures that the Hopper/Feeder is a resilient, independently functioning module that can be configured and controlled by the central backend server while providing essential feedback on its status.
