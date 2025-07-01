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
  - `start_moving`: Turns the feeder motor on to the speed defined by `FEEDER_VIBRATION_SPEED`.
  - `moving`: The feeder runs until either the part sensor detects an object (`distance < 50`) or a maximum time (`FEEDER_LONG_MOVE_TIME`) elapses. This prevents the feeder from running indefinitely if no parts are flowing. Once stopped, it transitions to `paused`.
  - `paused`: The feeder waits for a configurable duration (`FEEDER_PAUSE_TIME`). After the pause, it checks the sensor again. If a part is still present, it initiates a `short_move`. If no part is detected, it assumes the part has moved onto the conveyor and goes back to `start_moving` to fetch the next one.
  - `short_move`: A very brief vibration (`FEEDER_SHORT_MOVE_TIME`) designed to nudge a waiting part forward without pulling the entire line of parts with it.

### 2.2. `checkHopper()` - The Hopper Agitation State Machine

This function controls the agitation cycle of the main hopper. Instead of running on a fixed timer, its cycle is triggered by the cumulative run-time of the vibratory feeder (`totalFeederVibrationTime`), which serves as a proxy for how many parts have been processed.

- **States (`HopperState`):**
  - `waiting_top`: The default idle state. It continuously checks if `totalFeederVibrationTime` has exceeded the `HOPPER_CYCLE_INTERVAL`.
  - `moving_down`: When the cycle interval is reached, the stepper motor begins moving the hopper mechanism down to its lowest point. This movement is stopped either by the motor completing its steps or by a physical limit switch (`STOP_PIN`) being triggered.
  - `waiting_bottom`: A brief, hardcoded pause (`hopperBottomWaitTime`) at the bottom of the stroke.
  - `moving_up`: The stepper motor moves the mechanism back to its starting (top) position, completing the agitation cycle and resetting for the next one.

### 2.3. Safety and Reliability

- **Watchdog Timer:** The `setup()` function initializes an 8-second watchdog timer. The main `loop()` must call `wdt_reset()` periodically. If the code freezes or gets stuck, the watchdog will automatically reboot the Arduino, preventing a total system stall. Upon reboot, it sends a `"SYSTEM RESET: Watchdog timer initiated system reset."` message to the backend for logging.
- **Non-Blocking Sensor Reads:** The code uses a state machine (`processSensorReading`) to read from the I2C distance sensor without using `delay()`, ensuring the main loop is never blocked waiting for sensor data.

## 3. Backend <-> Arduino Communication Protocol

Communication occurs over a standard Serial (USB) connection. The backend sends single-line commands, and the Arduino responds with status or error messages.

### 3.1. Message Framing

All commands from the backend to the Arduino **must** be framed with start and end markers: `<` and `>`.

- **Example:** `<s,12000,92,1,1000,60,3000>`

The Arduino code in `loop()` captures characters into a buffer only after seeing a `<`. The message is processed when a `>` is received. This framing makes the protocol robust against line noise and incomplete transmissions.

### 3.2. Commands (Backend to Arduino)

The `processMessage()` function parses incoming commands based on the first character.

- **`s` (Settings Update):** This is the most critical command. It must be sent by the backend before any other command will be accepted.

  - **Format:** `s,<HOPPER_CYCLE_INTERVAL>,<FEEDER_VIBRATION_SPEED>,<FEEDER_STOP_DELAY>,<FEEDER_PAUSE_TIME>,<FEEDER_SHORT_MOVE_TIME>,<FEEDER_LONG_MOVE_TIME>`
  - **Action:** The `processSettings()` function parses the 6 integer values and updates the corresponding variables in the firmware. It also resets all state machines to their initial states.
  - **Response:** `"Settings updated successfully"` on success, or an error message.

- **`p` (Pause Time Update):** A specialized command to dynamically adjust the feeder's pause time.

  - **Format:** `p,<new_pause_time>`
  - **Action:** Updates only the `FEEDER_PAUSE_TIME` variable.

- **`o` (Hopper Override):** Manually controls the hopper cycle.
  - **Format:** `o,1` (Start a new cycle) or `o,0` (Stop and reset the hopper).
  - **Action:** Bypasses the normal time-based trigger and either forces an agitation cycle to begin or stops any movement and returns the hopper to its `waiting_top` state.

### 3.3. Responses (Arduino to Backend)

The Arduino sends simple newline-terminated strings back to the backend server.

- `"Ready"`: Sent once at the very end of the `setup()` function. The backend should wait for this message before sending any commands.
- `"Settings not initialized"`: Sent if any command other than `s` is received before the initial settings have been successfully loaded.
- `"Settings updated successfully"`: Confirmation of a successful `s` command.
- `"Error: ..."`: Sent if a command is malformed (e.g., wrong format, missing values).
- Debug Messages: If `HOPPER_DEBUG` or `FEEDER_DEBUG` are enabled in the firmware, additional diagnostic messages will be sent (e.g., `"HOPPER: Starting new cycle..."`).
- Watchdog Reset Message: Informs the backend that the device has recovered from a frozen state.

---

This architecture ensures that the Hopper/Feeder is a resilient, independently functioning module that can be configured and controlled by the central backend server while providing essential feedback on its status.
