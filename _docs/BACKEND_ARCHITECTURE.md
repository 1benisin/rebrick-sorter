# Backend Architecture: Rebrick Sorter

## 1. Overview

This document provides a detailed technical deep-dive into the backend system of the Rebrick Sorter. It is intended to be a comprehensive guide for developers and a rich context for AI-assisted development. The backend is a Node.js application that serves as the central nervous system for the entire sorting operation, orchestrating hardware control, real-time communication, and the core sorting logic.

## 2. Core Philosophy & Design

The backend is built on a component-based architecture, promoting separation of concerns and modularity.

- **Component-Based Architecture:** The system is divided into distinct, manageable components (often called "Managers"), each with a single, well-defined responsibility (e.g., `DeviceManager`, `SettingsManager`). All components extend a `BaseComponent` class, which defines a common lifecycle (`initialize`, `deinitialize`, `reinitialize`) and status management (`UNINITIALIZED`, `INITIALIZING`, `READY`, `ERROR`).
- **Centralized Coordination:** The `SystemCoordinator` class acts as the central orchestrator. It instantiates all other components and wires them together, defining the flow of information and control. It exposes high-level methods that are triggered by events from the frontend.
- **Eager Initialization:** As of the current design, the entire backend system initializes eagerly when the server starts (`server.ts`). The `SystemCoordinator.initializeComponents()` method is called once upon startup, preparing all hardware connections and services before any client connects. This ensures the system is immediately ready for operation.
- **State Management:** The backend is the single source of truth for the physical state of the machine. This includes the current speed of the conveyor, the position of each sorter, and a queue of all parts currently in transit on the conveyor belt.

## 3. System Startup and Initialization

The application's entry point is `server.ts`. The startup sequence is as follows:

1.  **Environment Setup:** The `.env.local` file is loaded.
2.  **Next.js Server:** A standard Next.js application server is prepared.
3.  **HTTP & Socket.IO Server:** A Node.js `httpServer` is created to handle requests for the Next.js app. A `Socket.IO` server is then attached to this HTTP server to handle WebSocket connections.
4.  **SystemCoordinator Instantiation:** A single instance of `SystemCoordinator` is created. In its constructor, it instantiates all its child components (`SocketManager`, `SettingsManager`, `DeviceManager`, etc.), injecting dependencies as needed. For example, `DeviceManager` receives an instance of `SocketManager` and `SettingsManager` to communicate status and retrieve configuration.
5.  **Component Initialization:** `systemCoordinator.initializeComponents()` is called. This triggers the `initialize()` method on each component in a specific, dependent order:
    1.  `SocketManager`: Becomes ready to handle connections.
    2.  `SettingsManager`: Fetches initial settings from Firebase and subscribes to real-time updates. This step is critical as all subsequent components depend on these settings.
    3.  `DeviceManager`: Connects to all Arduino hardware specified in the settings.
    4.  `SpeedManager`: Initializes with default speed values from settings.
    5.  `SorterManager`: Initializes sorter configurations (grid dimensions, travel times) from settings.
    6.  `ConveyorManager`: Initializes its state based on settings.

Once this process completes, the server begins listening for HTTP and WebSocket connections, fully ready to operate.

## 4. Component Deep Dive

### 4.1. `SystemCoordinator`

- **Purpose:** The master controller. It ties all other components together and implements the primary business logic for the sorting process.
- **Key Methods:**
  - `initializeComponents()`: Manages the system startup sequence.
  - `handleSortPart(data: SortPartDto)`: The entry point for the entire sorting process for a single part.
  - `buildPart(data: SortPartDto)`: A crucial factory method that takes raw part data and calculates all necessary timing and position information for its journey.
- **Interactions:** Directly calls methods on all other manager components.

### 4.2. `SettingsManager`

- **Purpose:** Manages all system configuration.
- **State:** Holds the current `settings` object (`SettingsType`).
- **Interactions:**
  - Connects to Google Firebase Firestore (`/settings/dev-user`).
  - Uses a real-time `onSnapshot` listener to detect any changes in the settings document.
  - Maintains a list of callback functions. When settings change, it notifies all registered components (like `DeviceManager`, `ConveyorManager`) so they can reconfigure themselves.
- **Key Methods:**
  - `getSettings()`: Returns the current settings.
  - `registerSettingsUpdateCallback()`: Allows other components to listen for configuration changes.

### 4.3. `DeviceManager`

- **Purpose:** The hardware abstraction layer. It is the only component that communicates directly with the Arduino devices.
- **State:** A `Map` of all connected devices, mapping a `DeviceName` enum to a `DeviceInfo` object containing the `SerialPort` instance and configuration.
- **Interactions:**
  - Receives settings from `SettingsManager` to know which serial ports to connect to.
  - Sends status updates (e.g., `READY`, `ERROR`) to the frontend via `SocketManager`.
- **Key Logic:**
  - **Connection:** Opens `SerialPort` connections to each Arduino. For development, it can use `SerialPortMock`.
  - **Initialization:** When an Arduino sends a `Ready` message, the `DeviceManager` replies with a configuration string (e.g., `s,100,200,50...`) tailored to that device type.
  - **Command Sending:** Provides a `sendCommand` method that formats messages with start/end markers (`<command,data>`) and writes them to the serial port.
  - **Resilience:** Implements robust error handling for device disconnects. It features an automatic reconnection mechanism with exponential backoff and a maximum number of retries. It also periodically scans for disconnected devices that should be connected and attempts to re-establish communication.

### 4.4. `SocketManager`

- **Purpose:** Manages all real-time communication with the frontend client.
- **Interactions:** It is primarily an event hub.
  - **Frontend -> Backend:** Listens for events defined in `FrontToBackEvents` (e.g., `SORT_PART`, `CONVEYOR_ON_OFF`). When an event is received, it calls the corresponding handler method on `SystemCoordinator`.
  - **Backend -> Frontend:** Exposes methods for other components to send messages to the frontend, defined in `BackToFrontEvents` (e.g., `emitComponentStatusUpdate`, `emitPartSorted`).
- **State:** Holds the active `socket` instance for the connected client.

### 4.5. `SpeedManager`

- **Purpose:** Manages the speed of the conveyor belt.
- **State:**
  - `defaultSpeed`: The normal operating speed in pixels/millisecond.
  - `currentSpeed`: The current speed, which may be temporarily adjusted.
- **Key Logic:**
  - **Speed Conversion:** This is the only place that converts the internal speed representation (pixels/ms, used for physics calculations) to the hardware representation (RPM, for the Arduino).
  - `scheduleConveyorSpeedChange()`: Creates a `setTimeout` to change the conveyor speed at a precise future time. It sends the command via `DeviceManager` and updates the internal state. It also dynamically adjusts the `hopper_feeder` pause time based on the new speed to maintain a consistent flow of parts.
  - `computeSlowDownPercent()`: Calculates how much the conveyor needs to slow down to meet a delayed arrival time for a part.

### 4.6. `SorterManager`

- **Purpose:** Manages the state and movement of the 2D sorter mechanisms.
- **State:**
  - `currentPositions`: An array holding the last known bin position for each sorter.
  - `travelTimes`: A 2D array containing pre-calculated travel times between different bin locations. This is an optimization to avoid complex physics calculations in real-time.
- **Key Methods:**
  - `moveSorter()`: Sends a command to the Arduino to move a sorter to a specific bin.
  - `getTravelTimeBetweenBins()`: Looks up the time required to move from one bin to another. This is a critical input for the `SystemCoordinator`'s scheduling logic.
  - `scheduleSorterMove()`: Creates a `setTimeout` to execute a sorter move at a precise future time.

### 4.7. `ConveyorManager`

- **Purpose:** The heart of the part-handling logic. It tracks every part on the conveyor and orchestrates all actions related to them.
- **State:**
  - `partQueue`: A time-sorted array of `Part` objects. This is the central data structure for the sorting process. Each object contains all timing, position, and action information for one LEGO piece.
  - `speedLog`: A log of past speed changes, used for accurate position calculations.
- **Key Logic:**
  - `insertPart()`: This method inserts a new part into the `partQueue`, ensuring the queue remains sorted by the part's default arrival time. This is the primary entry point for adding a part to the system.
  - `schedulePartActions()`: For a given part, it schedules all necessary future actions by creating timeouts for the sorter move (`SorterManager.scheduleSorterMove`), the jet fire (`scheduleJetFire`), and the conveyor speed change (`SpeedManager.scheduleConveyorSpeedChange`).
  - `updateAllFutureParts()`: This is the most complex piece of logic. If a newly inserted part requires a slowdown (because the sorter needs more time to move), it creates a "traffic jam". This method cancels the scheduled actions for all subsequent parts in the queue, rebuilds them using the new timeline, and re-inserts them into the queue. This ensures the entire system adapts dynamically to delays.
  - `findTimeAfterDistance()`: A sophisticated prediction function. Given a start time and a distance, it calculates the arrival time by accounting for all historical speed changes (`speedLog`) and all scheduled future speed changes (from the `partQueue` and any pending return to default speed).

## 5. The Sorting Process: A Backend Walkthrough

This section details the journey of a single part from the moment it's classified by the frontend to the moment it's sorted.

1.  **Event Reception:** The `SocketManager` receives a `SORT_PART` event, which includes the `partId`, `initialTime`, `initialPosition`, `bin`, and `sorter`. It calls `SystemCoordinator.handleSortPart()`.
2.  **Part Building:** The `SystemCoordinator.buildPart()` method is called. This is a pure calculation step:
    - It gets the sorter's jet position from `ConveyorManager`.
    - It calculates the `defaultArrivalTime` assuming a constant, default conveyor speed.
    - It uses `ConveyorManager.findTimeAfterDistance()` to predict the _actual_ `jetTime`, accounting for any current speed variations.
    - It asks `SorterManager` for the `travelTimeFromPreviousBin` for the required sorter movement.
    - It calculates the `moveTime`—the latest possible moment the sorter can _start_ moving to arrive just in time.
    - It calculates the `arrivalTimeDelay`, which is the amount of time the conveyor must be slowed down if the required sorter move is longer than the available time. This is a critical calculation to prevent parts from arriving at the jet before the sorter is in position.
    - It creates the final `Part` object with all these calculated properties.
3.  **Handling Delays:** Back in `handleSortPart`, if `part.arrivalTimeDelay` is greater than zero:
    - The system calculates the new, slower `conveyorSpeed` required to absorb the delay.
    - It checks if this new speed is within the hardware's capabilities (above `minConveyorRPM`). If not, the part is skipped.
    - The part's `moveTime` and `jetTime` are pushed back by the delay amount.
4.  **Insertion & Scheduling:** The `SystemCoordinator` calls `conveyorManager.insertPart(part)`.
    - The `ConveyorManager` finds the correct place for the part in its `partQueue`.
    - It calls `schedulePartActions()`, which sets three critical `setTimeout` calls:
      - `SorterManager.scheduleSorterMove()`: To move the sorter gantry.
      - `scheduleJetFire()`: To fire the air jet.
      - `SpeedManager.scheduleConveyorSpeedChange()`: To set the conveyor speed for the _next_ part in the queue.
5.  **Dynamic Rescheduling:** If the newly inserted part created a delay (`arrivalTimeDelay > 0`), the `ConveyorManager` identifies a "collision". It triggers `updateAllFutureParts()`. This method iterates through all subsequent parts, cancels their previously scheduled timeouts, and re-runs the `buildPart` -> `insertPart` logic for each one, creating a cascading update that ensures all timings remain perfectly synchronized.
6.  **Execution:** As time progresses, the `setTimeout` functions execute, calling the respective managers (`DeviceManager`, `SorterManager`) to send the final commands to the Arduino hardware at the precise, calculated milliseconds.
7.  **Cleanup:** When a jet fires for a part, that part is marked as `completed`, an event is sent to the frontend, and it is removed from the `partQueue`.

This dynamic, forward-looking scheduling system allows the backend to manage a high-throughput stream of parts, adapting in real-time to the physical constraints of the hardware.
