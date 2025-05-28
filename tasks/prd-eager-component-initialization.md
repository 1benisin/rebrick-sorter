## PRD: Eager Component Initialization

**1. Introduction/Overview**

This document outlines the requirements for changing the server's component initialization strategy. Currently, critical components, including hardware interfaces, are initialized upon the first client socket connection. This change will move the initialization process to occur immediately when the server starts up.

The primary goal is to improve the server's robustness and reliability by ensuring all necessary components, especially hardware, are ready and connected before any client interaction. This change also aims to simplify the architecture, making it easier to diagnose and resolve intermittent hardware connection issues.

**2. Goals**

- Initialize all core server components, including `SocketManager`, `SettingsManager`, `DeviceManager`, `SpeedManager`, `SorterManager`, and `ConveyorManager`, when the server application starts.
- Decouple component initialization from the client socket connection lifecycle.
- Ensure the server actively manages and attempts to connect to hardware (e.g., Arduino devices) at startup, without waiting for a frontend connection.
- Improve the system's stability and make it easier to identify and debug hardware connectivity problems.
- Maintain the correct order of initialization to respect inter-component dependencies.

**3. User Stories**

- **As a System Administrator/Developer,** I want the server to initialize all its components, including connections to hardware, upon startup so that the system is fully operational and ready to accept client connections without delay or initialization failures tied to the first connection.
- **As a Developer,** I want the hardware initialization logic to be centralized and occur at a predictable point (startup) so that I can more easily troubleshoot connection issues with devices like Arduinos.
- **As a System,** I want to attempt to establish hardware connections proactively at startup to ensure they are functional before any operational commands are received.

**4. Functional Requirements**

1.  The `SystemCoordinator.initializeComponents()` method must be made `public` to allow it to be called from outside the `SystemCoordinator` class.
2.  The `server.ts` (or equivalent main server startup file) must call `systemCoordinator.initializeComponents()` immediately after the `SystemCoordinator` instance is created.
3.  The call to `this.initializeComponents()` within the `SystemCoordinator.handleConnection()` method must be removed.
4.  The existing order of component initialization within `initializeComponents()` must be preserved:
    1.  `socketManager.initialize()`
    2.  `settingsManager.initialize()`
    3.  `deviceManager.initialize()`
    4.  `speedManager.initialize()`
    5.  `sorterManager.initialize()`
    6.  `conveyorManager.initialize()`
5.  The system should log the success or failure of the overall component initialization process.
6.  If a critical component (e.g., `DeviceManager` failing to connect to essential hardware as defined by current logic) fails to initialize at startup, this failure should be clearly logged. The system's behavior in such a case needs to be defined (e.g., continue running in a degraded state, or exit).

**5. Non-Goals (Out of Scope)**

- Changing the internal initialization logic of individual components, unless directly necessitated by the change in timing (e.g., to handle settings not being available from a socket).
- Implementing a full auto-reconnect and retry mechanism for hardware connections beyond what `DeviceManager` currently does (though improving this could be a future enhancement).
- Changing the API for client-server communication.

**6. Design Considerations**

- N/A (No UI changes)

**7. Technical Considerations**

- **Error Handling during Startup:**
  - If `initializeComponents()` fails, the server should log the error comprehensively.
  - **Decision needed:** Should the server exit if `initializeComponents` fails, or should it continue running in a state where some functionalities might be unavailable? For instance, if `DeviceManager` fails, the physical sorting cannot occur.
- **Logging:** Enhance logging during the `initializeComponents` sequence to provide clear visibility into each component's startup process and status.
- **Configuration:** Ensure that any configurations required by `initializeComponents` (e.g., serial port names, device settings) are available at server startup (which seems to be the case via `SettingsManager`).

**8. Success Metrics**

- The server successfully initializes all components upon startup, evidenced by logs.
- Hardware (e.g., Arduinos) is connected and responsive (where applicable) after server startup and before any client connects.
- A reduction in intermittent connection/disconnection bugs related to hardware, or at least, an improvement in the ability to diagnose them due to earlier and more direct initialization.
- The first client connection to the server is not delayed by component initialization.

**9. Open Questions**

1.  **Critical Failure Policy:** If `initializeComponents()` encounters an error (e.g., `DeviceManager` cannot connect to a configured hardware device), the server should log a clear, bold red error message to the console detailing what went wrong and then exit the process (e.g., using `process.exit(1)`).
2.  **Rollback Plan:** No specific rollback plan is deemed necessary. Changes are expected to be straightforward enough for manual reversion if required.
3.  **Testing Requirements:**
    1. **Happy Path Test:** Verify that the server starts up successfully, all components initialize in the correct order, and hardware (if connected and configured) becomes ready.
    2. **Critical Component Failure Test:** Simulate a failure in a critical component during initialization (e.g., `DeviceManager` failing to connect to a device). Verify that the server logs a bold red error message and exits as specified in the Critical Failure Policy.
    3. **Non-Critical Component Failure Test (if applicable):** If some components are non-critical for basic operation, simulate their failure and ensure the server still starts (if that's the desired behavior) and logs appropriate warnings. (For this specific PRD, most components seem critical, so this might be less relevant unless `DeviceManager` can partially succeed).
    4. **Configuration Error Test:** Test server startup with invalid or missing configuration for components (e.g., incorrect serial port for a device). Verify appropriate error logging and exit.
    5. **Post-Initialization Functionality Test:** After a successful startup, verify that basic functionalities relying on the initialized components work as expected (e.g., a client can connect, and basic commands that don't depend on unavailable hardware can be processed).
