# Backend Architecture: Rebrick Sorter

## 1. Overview

This document provides a detailed technical deep-dive into the backend system of the Rebrick Sorter. The backend is a Node.js application that serves as the central nervous system for the entire sorting operation, orchestrating hardware control, real-time communication, and the core sorting logic.

**Core Principle:** The backend is the "brain" that makes all coordination decisions. Arduinos are "muscles" that execute with precise timing.

## 2. Core Philosophy & Design

### 2.1. Component-Based Architecture

The system is divided into distinct, manageable components (Managers), each with a single, well-defined responsibility. All components extend a `BaseComponent` class with a common lifecycle (`initialize`, `deinitialize`, `reinitialize`) and status management (`UNINITIALIZED`, `INITIALIZING`, `READY`, `ERROR`).

### 2.2. Server-Centric Coordination

All scheduling intelligence lives on the server:

- **Server decides:** When jets fire, when sorters move, which parts to skip
- **Arduinos execute:** Fire jets at positions, move to bins, report completions

This provides debuggability (all state visible), flexibility (no Arduino reflashing for logic changes), and precision (Arduinos handle time-critical execution).

### 2.3. Position-Based Scheduling

The system uses **encoder position** as the source of truth for part location:

- Parts are tracked by encoder position, not time
- Actions trigger when encoder crosses thresholds, not on setTimeout
- Speed changes don't require recalculating schedules

### 2.4. State Management

The backend is the single source of truth for:

- Current encoder position (synced from Arduino)
- Scheduled parts queue (with encoder-based positions)
- All 4 sorter states (current bin, scheduled moves)

## 3. System Startup and Initialization

The application's entry point is `server.ts`. The startup sequence:

1. **Environment Setup:** Load `.env.local`
2. **Next.js Server:** Prepare Next.js application server
3. **HTTP & Socket.IO Server:** Create HTTP server, attach Socket.IO for WebSockets
4. **SystemCoordinator Instantiation:** Create single instance, inject dependencies
5. **Component Initialization:** Initialize in dependent order:
   1. `SocketManager`: Ready for connections
   2. `SettingsManager`: Fetch settings from Firebase
   3. `DeviceManager`: Connect to Arduino hardware
   4. `SorterStateManager`: Initialize sorter tracking
   5. `ConveyorManager`: Initialize encoder tracking and part queue

Once complete, the server listens for HTTP and WebSocket connections.

## 4. Component Deep Dive

### 4.1. `SystemCoordinator`

- **Purpose:** Master controller that ties all components together.
- **Key Methods:**
  - `initializeComponents()`: Manages system startup
  - `handleSortPart(data: SortPartDto)`: Entry point for sorting a part
  - `translatePixelToEncoder()`: Converts frontend pixel position to encoder position
- **Interactions:** Coordinates all manager components

### 4.2. `SettingsManager`

- **Purpose:** Manages all system configuration
- **State:** Current `settings` object
- **Interactions:**
  - Connects to Firebase Firestore
  - Real-time `onSnapshot` listener for changes
  - Notifies components on settings updates
- **Key Methods:**
  - `getSettings()`: Returns current settings
  - `registerSettingsUpdateCallback()`: Subscribe to changes

### 4.3. `DeviceManager`

- **Purpose:** Hardware abstraction layer for Arduino communication
- **State:** Map of connected devices (`DeviceName` → `DeviceInfo`)
- **Key Logic:**
  - Opens `SerialPort` connections to each Arduino
  - Sends initialization settings when Arduino sends `Ready`
  - Formats commands with `<>` markers
  - Parses responses and routes to appropriate handlers
  - Automatic reconnection with exponential backoff

### 4.4. `SocketManager`

- **Purpose:** Real-time communication with frontend
- **Interactions:**
  - **Frontend → Backend:** `SORT_PART`, manual control commands
  - **Backend → Frontend:** `ENCODER_POSITION`, `PART_SORTED`, `PART_SKIPPED`, status updates
- **State:** Active socket instance

### 4.5. `SorterStateManager`

- **Purpose:** Centralized tracking of all 4 sorter states
- **State (per sorter):**
  ```typescript
  interface SorterState {
    currentBin: number; // Where sorter is now
    isMoving: boolean; // Currently in motion
    targetBin: number | null; // Where it's heading
    scheduledMoves: ScheduledMove[]; // Queue of upcoming moves
  }
  ```
- **Key Methods:**
  - `canSorterReachBin()`: Check if sorter can reach a bin by deadline
  - `calculateLeadCounts()`: Encoder counts needed for move
  - `scheduleMove()`: Add move to sorter's queue
  - `handleMoveComplete()`: Update state when `MC:` received

### 4.6. `ConveyorManager`

- **Purpose:** Encoder position tracking and part queue management
- **State:**
  ```typescript
  currentEncoderPosition: number;   // Latest from Arduino
  lastEncoderUpdateTime: number;    // For interpolation
  encoderVelocity: number;          // Counts per millisecond
  partQueue: EncoderPart[];         // Scheduled parts
  ```
- **Key Methods:**
  - `getInterpolatedPosition()`: Estimate current position between updates
  - `handleEncoderUpdate()`: Process `EP:` messages from Arduino
  - `scheduleJet()`: Send `q<jet>,<position>` command
  - `processPartQueue()`: Check for parts needing action

### 4.7. `SorterManager`

- **Purpose:** Interface for sorter Arduino commands
- **Key Methods:**
  - `moveSorter()`: Send `m<bin>` command
  - `homeSorter()`: Send `a` command
  - `handleMoveComplete()`: Parse `MC:` responses, update SorterStateManager

### 4.8. `SpeedManager`

- **Purpose:** Manages conveyor belt speed
- **State:** `defaultSpeed`, `currentSpeed`
- **Key Logic:**
  - Converts internal speed (pixels/ms) to hardware (RPM)
  - Sends speed commands via DeviceManager

## 5. The Sorting Process: A Backend Walkthrough

### 5.1. Part Reception

1. `SocketManager` receives `SORT_PART` event with:

   - `partId`: Unique identifier
   - `pixelPosition`: X position in camera frame
   - `detectionTime`: Timestamp when detected
   - `bin`: Target bin number
   - `sorter`: Which sorter (0-3)

2. Calls `SystemCoordinator.handleSortPart()`

### 5.2. Position Translation

1. Get current encoder position from `ConveyorManager`
2. Calculate time elapsed since detection
3. Interpolate encoder position at detection time
4. Apply pixel-to-encoder calibration:
   ```typescript
   detectionEncoderPos = interpolatedPos + pixelPosition * countsPerPixel;
   jetPosition = detectionEncoderPos + cameraToJetOffset[sorter];
   ```

### 5.3. Sorter Availability Check

1. Call `SorterStateManager.canSorterReachBin(sorter, bin, deadline)`
2. Calculate deadline: `jetPosition - fallTimeInCounts`
3. Check sorter's current state and scheduled moves
4. Calculate when sorter will be free
5. Calculate travel time to target bin (from travel time matrix)
6. Determine if sorter can arrive before deadline

### 5.4. Scheduling Decision

**If sorter available:**

1. Calculate `moveTriggerPosition` (when to send move command)
2. Create `EncoderPart` object:
   ```typescript
   {
     partId,
     detectionEncoderPos,
     jetPosition,
     moveTriggerPosition,
     jet: sorter,  // jet index matches sorter
     sorter,
     bin,
     jetCommandSent: false,
     moveCommandSent: false,
     status: 'scheduled'
   }
   ```
3. Insert into `ConveyorManager.partQueue` (sorted by jetPosition)
4. Add to `SorterStateManager.scheduleMove()`

**If sorter unavailable:**

1. Log skip reason
2. Emit `PART_SKIPPED` to frontend
3. Do not add to queue (no commands sent, part falls off conveyor)

### 5.5. Command Execution

The `ConveyorManager` runs a position-check loop on each encoder update:

```typescript
processPartQueue() {
  const currentPos = this.getInterpolatedPosition();

  for (const part of this.partQueue) {
    // Send jet command with lead time
    if (!part.jetCommandSent &&
        currentPos >= part.jetPosition - JET_LEAD_COUNTS) {
      this.deviceManager.sendCommand(
        DeviceName.CONVEYOR_JETS,
        `q${part.jet},${part.jetPosition}`
      );
      part.jetCommandSent = true;
    }

    // Send sorter move command
    if (!part.moveCommandSent &&
        currentPos >= part.moveTriggerPosition) {
      this.sorterManager.moveSorter(part.sorter, part.bin);
      part.moveCommandSent = true;
    }
  }
}
```

### 5.6. Confirmation Handling

**Jet Fired (`JF:<jet>,<position>`):**

1. Find matching part in queue
2. Mark as `sorted`
3. Emit `PART_SORTED` to frontend
4. Remove from queue

**Move Complete (`MC:<bin>`):**

1. `SorterStateManager` updates sorter state
2. Removes from scheduled moves queue
3. Enables next scheduled move

## 6. Position vs Time: Key Differences

### 6.1. Old Time-Based Approach

```typescript
// Calculate when jet should fire
const jetTime = this.findTimeAfterDistance(initialTime, distance);
const moveTime = jetTime - travelTime;

// Schedule with setTimeout
setTimeout(() => fireJet(), jetTime - Date.now());
setTimeout(() => moveSorter(), moveTime - Date.now());
```

**Problems:**

- Clock drift between server and Arduino
- Speed changes require recalculating all timeouts
- Hard to debug timing issues

### 6.2. New Position-Based Approach

```typescript
// Calculate where jet should fire
const jetPosition = detectionEncoderPos + cameraToJetOffset;
const moveTriggerPosition = previousMoveCompletePosition;

// Add to queue, check position on each encoder update
if (currentPos >= jetPosition - LEAD_COUNTS) {
  sendJetCommand(jet, jetPosition);
}
```

**Benefits:**

- Position is absolute, doesn't drift
- Speed-independent (position always correct)
- Observable and loggable

## 7. Error Handling

### 7.1. Part Skip Scenarios

| Scenario               | Handling                               |
| ---------------------- | -------------------------------------- |
| Sorter unavailable     | Skip part, log reason, notify frontend |
| Parts too close        | Skip later parts, prioritize earlier   |
| Classification failure | Don't schedule (no bin assigned)       |

### 7.2. Hardware Errors

| Error              | Recovery                                |
| ------------------ | --------------------------------------- |
| Arduino disconnect | Auto-reconnect with exponential backoff |
| Arduino reset      | Re-send settings on `Ready` message     |
| Serial timeout     | Retry command, log warning              |

### 7.3. State Recovery

If server restarts:

- Encoder position re-syncs from Arduino
- Sorter positions re-sync from `MC:` queries
- In-flight parts may be lost (acceptable for LEGO sorting)

## 8. Configuration

Settings stored in Firebase Firestore:

```typescript
interface Settings {
  // Serial ports
  conveyorJetsPort: string;
  sorterPorts: string[];
  hopperFeederPort: string;

  // Calibration
  cameraEncoderOffset: number;
  countsPerPixel: number;
  jetEncoderOffsets: number[];
  jetLeadCounts: number;

  // Sorter settings
  sorters: SorterSettings[];

  // Speed settings
  defaultConveyorRPM: number;
  maxConveyorRPM: number;
  minConveyorRPM: number;
}
```

Changes propagate via Firestore `onSnapshot` listeners, triggering component reinitialization.

## 9. Performance Considerations

### 9.1. Encoder Update Frequency

- Arduino reports position every 5-10 ticks (~2-4 times/second)
- Server interpolates between updates
- Higher frequency not needed (parts travel slowly)

### 9.2. Part Queue Size

- Typical max: 50-100 parts in transit
- Memory: ~200 bytes per part
- Processing: O(n) scan on each position update

### 9.3. Serial Communication

- Baud rate: 115200
- Message size: ~10-20 bytes
- Traffic: <1% of bandwidth
- Latency: 1-5ms round trip

## 10. Testing Strategy

### 10.1. Unit Tests

- Position translation accuracy
- Sorter availability logic
- Lead time calculations

### 10.2. Integration Tests

- Single part flow: detect → schedule → fire
- Multiple parts: ordering and skip logic
- Sorter coordination: concurrent moves

### 10.3. Hardware-in-Loop Tests

- Encoder position tracking accuracy
- Jet timing precision
- Recovery from disconnects
