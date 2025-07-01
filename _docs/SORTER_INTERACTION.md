# Sorter System: Arduino Logic and Backend Interaction

## 1. Overview

This document details the functionality of the Sorter Arduino controller (`sorter.cpp`) and its communication with the backend server. The sorter is a 2-axis (X and Y) gantry system controlled by two stepper motors. Its sole purpose is to position the collection funnel directly over a specific bin in a grid, ready to receive a part ejected from the conveyor belt.

Precise positioning and a reliable homing mechanism are the two most critical aspects of this component.

## 2. Core Logic in `sorter.cpp`

The Arduino's logic is centered around moving the gantry to calculated coordinates and managing a state machine for its homing sequence.

### 2.1. Bin-to-Coordinate Calculation

The backend doesn't command the sorter with raw stepper motor positions. Instead, it sends a simple, 1-based bin number. The Arduino firmware is responsible for translating this bin number into the correct X and Y stepper motor coordinates.

- **`moveToBin(int binNum)`:** This function contains the core logic for the translation.
  - It uses the configured `GRID_DIMENSION` and `ROW_MAJOR_ORDER` settings to determine the target (x, y) index within the grid.
  - It then calculates the final stepper position by multiplying the index by the steps-per-bin (`xStepsPerBin`, `yStepsPerBin`) and adding the base `X_OFFSET` and `Y_OFFSET`.
  - Finally, it issues non-blocking `moveTo` commands to the `FastAccelStepper` library for both axes.

### 2.2. Homing State Machine

Before the sorter can move to any bin accurately, it must first establish a known zero position. This is handled by the `handleHoming()` function, which implements a multi-step, non-blocking state machine.

- **Trigger:** The homing sequence is initiated by an `a` command from the backend.
- **States (`HomingState`):**
  1.  `HOMING_START`: Initiates the sequence.
  2.  `HOMING_Y_BACKWARD`: Moves the Y-axis backward at a slow `HOMING_SPEED` until its endstop switch is triggered.
  3.  `HOMING_X_BACKWARD`: Once the Y-axis is home, it does the same for the X-axis.
  4.  After hitting an endstop, each axis backs off by a small, hardcoded amount (`HOMING_BACKOFF_STEPS`) and then has its position zeroed using `setCurrentPosition(0)`.
  5.  `HOMING_WAIT_FOR_OFFSET`: Once both axes are zeroed, they both move to the configured `X_OFFSET` and `Y_OFFSET` positions. This becomes the new "home" position, representing the corner of the grid.
  6.  `HOMING_COMPLETE`: The sequence is finished, and the sorter is ready for normal operation. `NOT_HOMING` is then set.
- **Safety:** The homing process includes a 30-second timeout (`HOMING_TIMEOUT_MS`) for each axis movement. If an endstop is not hit within this time, the process enters a `HOMING_ERROR` state, preventing any further movement until a new homing command (`a`) is received.

## 3. Backend <-> Arduino Communication Protocol

The sorter's communication adheres to the same robust, standardized protocol used by the other Arduino modules in the system.

### 3.1. Standardization Notes

1.  **Serial Message Framing:** Commands are wrapped in `<...>` for integrity.
2.  **'Ready' Handshake:** The Arduino sends `Ready` on boot, which the backend must wait for.
3.  **Mandatory Settings Initialization:** The `s` command must be sent first. The firmware will respond with `Settings not initialized` to any other command if it hasn't been configured.
4.  **State Reset on Settings Update:** A successful `s` command resets all internal states, stops all motors, and prepares the device for a fresh start, requiring a new homing sequence.

### 3.2. Commands (Backend to Arduino)

- **`s` (Settings Update):**

  - **Format:** `s,<GRID_DIMENSION>,<X_OFFSET>,<Y_OFFSET>,<X_STEPS_TO_LAST>,<Y_STEPS_TO_LAST>,<ACCELERATION>,<HOMING_SPEED>,<SPEED>,<ROW_MAJOR_ORDER>`
  - **Action:** Configures all physical parameters of the sorter grid. The firmware uses these values to calculate `xStepsPerBin` and `yStepsPerBin`. It also updates the stepper motor speed and acceleration settings.
  - **Response:** `Settings updated`

- **`m` (Move to Bin):**

  - **Format:** `m<BIN>` (e.g., `<m001>`, `<m012>`). The bin number is a zero-padded, 3-digit string.
  - **Action:** Commands the sorter to move to the specified bin number. The movement is non-blocking.
  - **Response:** The Arduino sends a move complete message (`MC: <BIN>`) _after_ the move is finished.

- **`h` (Move to Home/Center):**

  - **Format:** `h`
  - **Action:** Calculates and moves to the bin located at the center of the grid.
  - **Response:** `MC: <BIN>` upon completion.

- **`a` (Start Homing):**
  - **Format:** `a`
  - **Action:** Initiates the homing state machine.
  - **Response:** The Arduino sends multiple status messages throughout the homing process (e.g., `Homing sequence initiated...`, `Homing Y axis...`, `Y endstop hit.`, `Homing complete.`).

### 3.3. Responses (Arduino to Backend)

- `Ready`: Sent on boot.
- `Settings updated`: Confirms settings were received.
- `Settings not initialized`: Error if not configured.
- `Error: ...`: For malformed commands, timeouts, or other issues.
- `Homing ...`: Various status messages during the homing sequence.
- **`MC: <BIN>`**: **M**ove **C**omplete. This is the most important response during operation. It signifies that the sorter has successfully arrived at the requested bin and is ready for the next command. The backend should wait for this message before assuming a move is finished.
