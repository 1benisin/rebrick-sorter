## Relevant Files

- `server/components/DeviceManager.ts` - Contains the core logic for managing device connections, including the `hopper_feeder`.
- `src/server/DeviceManager.test.ts` - Unit tests for `DeviceManager.ts`.
- `arduino_code/hopper_feeder.cpp` - The Arduino firmware for the hopper feeder mechanism.
- `src/server/SocketManager.ts` - Handles WebSocket communication for status updates.
- `src/server/SettingsManager.ts` - Manages device settings and configurations.
- `.vscode/c_cpp_properties.json` - Configuration file for C/C++ intellisense and build settings, relevant for Arduino linter errors.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.

## Tasks

- [x] 1.0 Implement Server-Side Reconnect Logic (FR1)
  - [x] 1.1 [Modify `DeviceManager.ts` to listen for serial port 'error' events for the `hopper_feeder` device (FR1.1)]
  - [x] 1.2 [Modify `DeviceManager.ts` to listen for serial port 'close' events for the `hopper_feeder` device (FR1.2)]
  - [x] 1.3 [Implement `handleDisconnect` method in `DeviceManager.ts` (FR1.3)]
    - [x] 1.3.1 [In `handleDisconnect`, remove the device from active devices list (FR1.3.1)]
    - [x] 1.3.2 [In `handleDisconnect`, emit component status update via `SocketManager` (FR1.3.2)]
    - [x] 1.3.3 [In `handleDisconnect`, schedule automatic reconnection attempt (FR1.3.3)]
  - [x] 1.4 [Implement exponential backoff for reconnection attempts in `DeviceManager.ts` (FR1.4)]
    - [x] 1.4.1 [Set initial reconnection delay (e.g., 1 second) (FR1.4.1)]
    - [x] 1.4.2 [Implement increasing delay for subsequent attempts (FR1.4.2)]
    - [x] 1.4.3 [Cap maximum delay between attempts (e.g., 30 seconds) (FR1.4.3)]
  - [x] 1.5 [Implement logic to stop retrying after persistent failure (e.g., 5 minutes) and log error in `DeviceManager.ts` (FR1.5)]
  - [x] 1.6 [Upon successful reconnection, emit `READY` status and resend configuration settings in `DeviceManager.ts` (FR1.6)]
- [x] 2.0 Implement Server-Side Periodic Port Scan (FR2)
  - [x] 2.1 [Implement a background task in `DeviceManager.ts` to periodically scan serial ports (FR2.1)]
  - [x] 2.2 [Scanner to identify disconnected expected devices (e.g., `hopper_feeder`) (FR2.2)]
- [x] 3.0 Ensure Arduino Non-Blocking Operations (FR3)
  - [x] 3.1 [Review and refactor `checkFeeder()` in `hopper_feeder.cpp` to be non-blocking (FR3.1)]
  - [x] 3.2 [Ensure long operations use state machines or yield control (FR3.2)]
  - [x] 3.3 [Verify no hidden blocking calls or long synchronous delays in existing state machines (FR3.3)]
- [x] 4.0 Implement Arduino Watchdog Timer (FR4)
  - [x] 4.1 [Include `<avr/wdt.h>` in `hopper_feeder.cpp` (FR4.1)]
  - [x] 4.2 [Enable watchdog timer in `setup()` with 8-second timeout (`WDTO_8S`) in `hopper_feeder.cpp` (FR4.2)]
  - [x] 4.3 [Reset watchdog timer at the end of `loop()` using `wdt_reset()` in `hopper_feeder.cpp` (FR4.3)]
  - [x] 4.4 [Implement logging for watchdog system resets in `hopper_feeder.cpp` (FR4.4)]
- [x] 5.0 Implement Arduino Serial Buffer Guard (FR5)
  - [x] 5.1 [In `hopper_feeder.cpp`, when `message_pos` reaches `MAX_MESSAGE_LENGTH`, set `capturingMessage` to `false` (FR5.1.1)]
  - [x] 5.2 [Print "Error: Message too long" (FR5.1.2)]
  - [x] 5.3 [Discard remaining bytes in `Serial.available()` buffer (FR5.1.3)]
- [x] 6.0 Resolve Linter Errors in Arduino Code (FR7)
  - [x] 6.1 [Correct include path issues for `Wire.h` and `FastAccelStepper.h` in `arduino_code/hopper_feeder.cpp` (FR7.1)]
  - [x] 6.2 [Update `c_cpp_properties.json` or build environment configurations if necessary (FR7.1)]
