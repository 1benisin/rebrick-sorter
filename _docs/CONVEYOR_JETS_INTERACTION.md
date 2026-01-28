# Conveyor & Jets System: Arduino Logic and Backend Interaction

## 1. Overview

This document explains the functionality of the Conveyor & Jets Arduino controller (`conveyor_jets.cpp`) and its interaction with the backend server. This component is responsible for two critical physical operations in the sorting process:

1.  **Conveyor Belt Control:** It drives the main conveyor belt at a precise, constant speed.
2.  **Part Ejection:** It fires one of four pneumatic air jets to eject an identified LEGO part from the conveyor belt into the sorting funnel.

The hardware controlled by this Arduino includes a DC motor with a quadrature encoder for the conveyor and four solenoid valves for the air jets.

## 2. Core Logic in `conveyor_jets.cpp`

The Arduino's main `loop()` manages two primary, non-blocking tasks: maintaining conveyor speed and controlling jet firing durations.

### 2.1. Closed-Loop Conveyor Speed Control

To ensure accurate timing for part ejection, the conveyor belt must maintain a consistent speed. The firmware implements a Proportional-Integral (PI) closed-loop control system.

- **Encoder Feedback:** Interrupt Service Routines (`readEncoderA`, `readEncoderB`) continuously monitor the motor's encoder, incrementing or decrementing a counter (`encoderCount`) to track its exact rotation.
- **RPM Calculation:** Every 50ms (`controlInterval`), the main loop calculates the `currentRPM` based on the change in `encoderCount`.
- **PI Control Logic:**
  1.  The `currentRPM` is compared to the `targetRPM` to get an `error` value.
  2.  The integral of this error (`integralError`) is accumulated over time to correct for small, steady-state inaccuracies.
  3.  A new motor PWM value is calculated using the proportional (`kp`) and integral (`ki`) gains.
  4.  The new PWM value is written to the motor driver, adjusting its speed.
- This continuous feedback loop ensures the conveyor holds its target speed despite variations in load or friction.

### 2.2. Non-Blocking Jet Firing

To avoid any delays that could affect the PI controller's timing, firing an air jet is handled asynchronously.

- When a `j` command is received, the code immediately turns the corresponding jet pin `HIGH`.
- Instead of using `delay()`, it calculates the `jetEndTime` by adding the current time (`millis()`) and the configured `JET_FIRE_TIMES` for that specific jet.
- A flag, `jetActive`, is set to `true` for that jet.
- On every iteration of the main `loop()`, the code checks if `millis()` has surpassed the `jetEndTime` for any active jet. If it has, the jet's pin is set back to `LOW`, and its `jetActive` flag is cleared.

## 3. Backend <-> Arduino Communication Protocol

The communication protocol for the Conveyor/Jets controller follows a standardized pattern established across all Arduino devices in the system.

### 3.1. Standardization Notes

The interaction between the backend and the Arduino firmware is designed to be consistent and reliable. The following standards are shared with the `hopper_feeder.cpp` and `sorter.cpp` controllers:

1.  **Serial Message Framing:** All commands from the backend **must** be framed with start and end markers (`<` and `>`). The Arduino code ignores any serial data outside of these markers, making the protocol resilient to noise.
2.  **'Ready' Handshake:** Upon power-up and completion of its `setup()` function, the Arduino sends a `Ready` message. The backend server should always wait for this signal before sending any commands.
3.  **Mandatory Settings Initialization:** The first command sent must be the settings command (`s`). The Arduino will not process any other operational commands until its internal configuration has been initialized, responding with `Settings not initialized` if this rule is violated.
4.  **State Reset on Settings Update:** Receiving a valid settings (`s`) command causes the Arduino to reset all its internal state variables (e.g., `conveyorOn`, `jetActive`, `integralError`) and stop the motor. This ensures the system returns to a safe, predictable state whenever its configuration is changed.

### 3.2. Commands (Backend to Arduino)

- **`s` (Settings Update):**

  - **Format:** `s,<FIRE_TIME_0>,<FIRE_TIME_1>,<FIRE_TIME_2>,<FIRE_TIME_3>,<MAX_RPM>,<MIN_RPM>`
  - **Action:** Parses and applies the fire duration (in milliseconds) for each of the four jets, and sets the upper and lower bounds for the conveyor motor's RPM. Resets the device state.
  - **Response:** `Settings updated`

- **`o` (Conveyor On/Off):**

  - **Format:** `o` (This command is a toggle)
  - **Action:** Toggles the conveyor motor's state. If turning on, it resets the PI controller's state variables. If turning off, it immediately cuts power to the motor.
  - **Response:** `conveyor on` or `conveyor off`

- **`c` (Set Conveyor Target RPM):**

  - **Format:** `c<RPM>` (e.g., `c55`)
  - **Action:** Updates the `targetRPM` for the PI controller. The value is automatically constrained between the `minRPM` and `maxConveyorRPM` defined in the settings.
  - **Response:** `RPM updated: <VALUE>` or `RPM constrained to hardware bounds...`

- **`j` (Fire Jet):**
  - **Format:** `j<JET_NUM>` (e.g., `j2` for jet #2)
  - **Action:** Initiates the non-blocking firing sequence for the specified jet.
  - **Response:** `Jet fire: <JET_NUM>`

### 3.3. Responses (Arduino to Backend)

The Arduino sends simple, newline-terminated strings to the backend.

- `Ready`: Sent on successful boot.
- `Settings updated`: Confirmation of a successful `s` command.
- `Settings not initialized`: Sent if an operational command is received before the initial `s` command.
- `Error: ...`: Sent for malformed commands or buffer overflows.
- Status messages corresponding to the command received (e.g., `conveyor on`, `RPM updated: 55`).
