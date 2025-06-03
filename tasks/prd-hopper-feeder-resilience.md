# PRD: Hopper Feeder Resilience Enhancement

## 1. Introduction/Overview

This document outlines the requirements for enhancing the resilience of the `hopper_feeder` Arduino system. The primary problem is that the `hopper_feeder` motors and Arduino communication can randomly stop, possibly due to USB/serial link interruptions or firmware hangs. This requires manual intervention to restart and resume operations.

The goal of this enhancement is to make the `hopper_feeder` system significantly more robust by implementing automatic reconnection logic on the server, fault tolerance on the Arduino (watchdog, non-blocking loops, serial buffer protection), and a heartbeat mechanism to proactively detect and recover from communication failures. This will ensure the motors keep running and the system recovers automatically, synchronizing settings and resuming operations with minimal downtime.

## 2. Goals

- **G1:** Implement server-side logic to automatically detect `hopper_feeder` disconnections and attempt reconnections with an exponential backoff strategy.
- **G2:** Implement a periodic port-scanning mechanism on the server to detect if the OS has reassigned the `hopper_feeder`'s serial port and reconnect accordingly.
- **G3:** Ensure the Arduino `hopper_feeder.cpp` firmware never blocks indefinitely in its main loop, particularly in `checkFeeder()` and `checkHopper()` functions.
- **G4:** Implement a watchdog timer on the Arduino to automatically reset the microcontroller if the firmware hangs.
- **G5:** Improve serial communication handling on the Arduino to prevent buffer overflows and gracefully handle overly long messages.
- **G6:** Implement a heartbeat mechanism between the server and the Arduino to quickly detect silent communication failures and trigger recovery actions.
- **G7:** Ensure that upon reconnection, the `hopper_feeder` Arduino is re-initialized with the correct settings from the server.
- **G8:** Resolve linter errors in `hopper_feeder.cpp` related to include paths.
- **G9:** Minimize manual intervention required to keep the `hopper_feeder` operational.

## 3. User Stories

- **US1:** As an operator, I want the hopper feeder to automatically recover from temporary USB disconnections, so I don't have to manually restart or monitor the system constantly.
- **US2:** As an operator, I want the Arduino to automatically reboot if its firmware hangs, so the physical part feeding process doesn't stall indefinitely.
- **US3:** As a developer/maintainer, I want clear logs and status updates regarding connection state (disconnects, errors, reconnect attempts, success/failure) and Arduino operations (e.g., watchdog resets, serial errors), so I can diagnose and troubleshoot problems more effectively.
- **US4:** As an operator, I want the hopper feeder Arduino to keep running without my intervention. If it disconnects from the server backend, I want it to automatically restart, reconnect, sync the right settings, and start running again.

## 4. Functional Requirements

### FR1: Server-Side (DeviceManager.ts) - Reconnect Logic

- **FR1.1:** The `DeviceManager` must listen for serial port 'error' events for the `hopper_feeder` device.
- **FR1.2:** The `DeviceManager` must listen for serial port 'close' events for the `hopper_feeder` device.
- **FR1.3:** Upon an 'error' or 'close' event, a `handleDisconnect` method shall be called.
  - **FR1.3.1:** `handleDisconnect` must remove the device from the active devices list.
  - **FR1.3.2:** `handleDisconnect` must emit a component status update (e.g., `UNINITIALIZED` or `ERROR`) via `SocketManager`, including any error message.
  - **FR1.3.3:** `handleDisconnect` must schedule an automatic reconnection attempt.
- **FR1.4:** Reconnection attempts shall use an exponential backoff strategy.
  - **FR1.4.1:** The initial delay should be short (e.g., 1 second).
  - **FR1.4.2:** Subsequent delays should increase (e.g., `1000 * 2 ** (attempt-1)` milliseconds).
  - **FR1.4.3:** The maximum delay between attempts shall be capped (e.g., 30 seconds).
- **FR1.5:** If reconnection attempts fail persistently for a defined duration (e.g., 5 minutes), the system should stop retrying for that specific disconnection event and log a persistent failure, clearly flagging the `hopper_feeder` device as being in an error state requiring attention.
- **FR1.6:** Upon successful reconnection, the `DeviceManager` shall emit a `READY` status update for the `hopper_feeder` and re-send its configuration settings.

### FR2: Server-Side (DeviceManager.ts) - Periodic Port Scan

- **FR2.1:** The `DeviceManager` shall implement a background task that periodically scans available serial ports (e.g., every 10 seconds).
- **FR2.2:** The scanner shall identify expected devices (like `hopper_feeder`) that are currently disconnected.
- **FR2.3:** If an expected device is missing, the scanner shall attempt to find a port matching the device's known VID/PID or other persistent identifiers (if available/configurable via `SettingsManager`).
- **FR2.4:** If a potential new port for the `hopper_feeder` is identified, the `DeviceManager` shall attempt to connect to it using the `connectDevice` method.
- **FR2.5:** The list of expected devices and their identifiers shall be derived from `SettingsManager`.

### FR3: Arduino-Side (hopper_feeder.cpp) - Non-Blocking Operations

- **FR3.1:** All functions within the main `loop()`, specifically `checkFeeder()` and `checkHopper()`, must be non-blocking.
- **FR3.2:** Long operations (e.g., waiting for stepper moves, I2C communication) should be managed via state machines or yield control periodically (e.g., by calling `yield()` if appropriate, or simply returning to `loop()` quickly).
- **FR3.3:** Review existing state machines in `checkFeeder()` and `checkHopper()` to ensure they do not contain hidden blocking calls or excessively long synchronous delays.

### FR4: Arduino-Side (hopper_feeder.cpp) - Watchdog Timer

- **FR4.1:** Include the `<avr/wdt.h>` library.
- **FR4.2:** Enable the watchdog timer in `setup()` with a timeout period of 8 seconds (`WDTO_8S`).
- **FR4.3:** The watchdog timer must be reset at the end of each `loop()` iteration by calling `wdt_reset()`.
- **FR4.4:** Log watchdog system resets if possible (e.g., by checking a reset flag in `setup()` and sending a specific message via Serial).

### FR5: Arduino-Side (hopper_feeder.cpp) - Serial Buffer Guard

- **FR5.1:** When receiving serial messages, if `message_pos` reaches `MAX_MESSAGE_LENGTH`:
  - **FR5.1.1:** Set `capturingMessage` to `false`.
  - **FR5.1.2:** Print an "Error: Message too long" message.
  - **FR5.1.3:** Read and discard all remaining bytes currently in the `Serial.available()` buffer to prevent them from corrupting the next message.

### FR6: Heartbeat Mechanism

- **FR6.1: Server-Side (`DeviceManager.ts`)**
  - **FR6.1.1:** Periodically (e.g., every 5 seconds) send a simple heartbeat message (e.g., `<h>`) to the `hopper_feeder` Arduino.
  - **FR6.1.2:** Track the timestamp of the last received heartbeat reply from the Arduino.
  - **FR6.1.3:** If a configured number of heartbeats (e.g., 2) are missed in a row (i.e., no reply received within the expected interval), trigger the `handleDisconnect` process for the `hopper_feeder` as if a port error or closure occurred.
- **FR6.2: Arduino-Side (`hopper_feeder.cpp`)**
  - **FR6.2.1:** In `processMessage()`, handle the heartbeat message (e.g., 'h').
  - **FR6.2.2:** Upon receiving a heartbeat message, immediately reply with a confirmation message (e.g., `HB` or `<HB>`). This reply should bypass standard message processing if it's simpler and faster.

### FR7: Linter Error Resolution

- **FR7.1:** Correct the include path issues in `arduino_code/hopper_feeder.cpp` causing errors for `Wire.h` and `FastAccelStepper.h`. This may involve updating `c_cpp_properties.json` or build environment configurations for Arduino projects.

### FR8: Logging

- **FR8.1: Server-Side:**
  - Log all disconnection events (source: error, close, missed heartbeat).
  - Log all reconnection attempts (port, attempt number, delay).
  - Log reconnection success/failure.
  - Log persistent reconnection failures after timeout.
  - Log port scanning activities and found/attempted ports.
  - Log sent and received heartbeat messages.
- **FR8.2: Arduino-Side:**
  - Tag all `Serial.println` statements with a timestamp or millis() prefix for easier debugging if feasible (e.g., `Serial.print(millis()); Serial.print(": "); Serial.println(...)`).
  - Log watchdog system resets upon startup.
  - Log "Error: Message too long" events.
  - Log received heartbeat ('h') and sent reply ('HB').

## 5. Non-Goals (Out of Scope)

- Changes to the fundamental motor control logic or feeding algorithms, other than ensuring they are non-blocking.
- New features unrelated to system resilience, connectivity, or stability.
- Fundamental changes to the serial communication protocol beyond adding the heartbeat message and ensuring robust parsing.

## 6. Design Considerations (Optional)

- UI changes for displaying detailed reconnection status or error states will be handled as a separate task/iteration. For now, existing status update mechanisms (`UNINITIALIZED`, `READY`, `ERROR`) will be used.

## 7. Technical Considerations (Optional)

- **Server (`DeviceManager.ts`):**
  - The `connectDevice` method in `DeviceManager.ts` will be reused for reconnection attempts.
  - The `SettingsManager` will be the source for expected devices and their configurations, including serial port names.
  - VID/PID matching for port scanning might require platform-specific considerations or additions to how `SerialPort.list()` data is used.
- **Arduino (`hopper_feeder.cpp`):**
  - The implementation of `yield()` or non-blocking delays needs to be carefully considered to not adversely affect timing-sensitive operations. Existing state machines are preferred.
  - Ensure sufficient serial buffer size on the Arduino if not already adequate. `MAX_MESSAGE_LENGTH` should be appropriate for current and heartbeat messages.

## 8. Success Metrics

- **SM1:** Reduction in reported incidents of `hopper_feeder` stalling or requiring manual restart by >90%.
- **SM2:** The `hopper_feeder` system successfully recovers from transient USB disconnections and resumes operation within 1 minute without manual intervention.
- **SM3:** The Arduino firmware automatically recovers via watchdog reset in case of a software hang, resuming operation and communication.
- **SM4:** Logs clearly show disconnection events, reconnection attempts, and recovery actions, aiding in diagnostics.

## 9. Open Questions

- None at this time.
