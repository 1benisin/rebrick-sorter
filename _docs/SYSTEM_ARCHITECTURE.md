# System Architecture: Rebrick Sorter

## 1. Overview

This document outlines the system architecture of the Rebrick Sorter, an automated LEGO sorting machine. The goal of this document is to provide a comprehensive understanding of the project's components and their interactions, primarily to serve as a detailed context for an LLM-based code editor to assist in future development.

The system is comprised of three main pillars:

1. **Hardware:** A set of custom-built, Arduino-controlled modules that physically handle and sort LEGO parts.
2. **Backend Server:** A Node.js application that acts as the brain of the operation, orchestrating the hardware components.
3. **Frontend Application:** A web-based interface built with Next.js and React for real-time monitoring, control, and part classification.

## 2. Core Design Principle

**"Centralize decisions, distribute execution."**

The backend server is the "brain" that makes all coordination decisions (what to sort, when, which sorter). The Arduinos are "muscles" that execute physical actions with precise timing. This separation provides:

- **Debuggability:** All scheduling logic is visible on the server
- **Flexibility:** Logic changes don't require Arduino reflashing
- **Precision:** Time-critical actions execute locally on Arduinos

## 3. Core Process Flow: The Journey of a LEGO Part

The primary function of the system is to identify and sort LEGO parts into designated bins. This process involves a coordinated sequence of events across all parts of the system.

### 3.1. Physical Flow

1. **Feeding:** Parts are dispensed from the **Hopper** into a **Vibratory Feeder**.
2. **Singulation:** The Vibratory Feeder arranges parts into a single file line on the **Conveyor Belt**.
3. **Detection:** The conveyor carries parts past two webcams. The frontend runs a TensorFlow.js detection model to identify part locations.
4. **Classification:** Cropped images are sent to the Brickognize API to identify the specific LEGO part.
5. **Scheduling:** The backend calculates when and how to sort the part based on encoder position and sorter availability.
6. **Ejection:** At the precise encoder position, an **Air Jet** fires to blow the part off the conveyor.
7. **Collection:** The part falls into a funnel positioned by the **Sorter** gantry.
8. **Binning:** The funnel deposits the part into the correct bin in a grid.

### 3.2. Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│  1. Camera captures frame                                                    │
│  2. TensorFlow.js detects part at pixel position                            │
│  3. Brickognize API classifies part → bin assignment                        │
│  4. Sends SORT_PART(pixelPos, timestamp, bin, sorter) to server             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND SERVER                                  │
│  5. Translates pixel position → encoder position                            │
│  6. Checks sorter availability (can it reach the bin in time?)              │
│  7. If available: schedules jet command + sorter move                       │
│  8. If unavailable: skips part (logs reason)                                │
│  9. Monitors encoder position, sends commands when thresholds reached       │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                    │
                          ▼                    ▼
              ┌───────────────────┐  ┌───────────────────┐
              │  CONVEYOR ARDUINO │  │  SORTER ARDUINOS  │
              │  10. Queues jet   │  │  11. Moves to bin │
              │  11. Fires at pos │  │  12. Reports done │
              └───────────────────┘  └───────────────────┘
```

## 4. System Components Deep Dive

### 4.1. Frontend (`/app`, `/components`, `/lib`)

The frontend is a Next.js/React application responsible for the user interface and the initial part detection/classification steps.

- **Framework:** Next.js with the App Router.
- **UI:** Built with React, Tailwind CSS, and `shadcn/ui` components.
- **Key Responsibilities:**
  - **Real-time Monitoring (`/app/sorter/page.tsx`):** Displays video feeds, system status, and encoder position.
  - **Hardware Control Panel:** Provides buttons for manual operation and calibration.
  - **Part Detection (`lib/services/DetectorService.ts`):** Runs local TensorFlow.js object detection.
  - **Part Classification (`lib/services/ClassifierService.ts`):** Manages Brickognize API calls.
  - **Backend Communication (`lib/services/SocketService.ts`):** WebSocket connection for commands and status.
  - **Encoder Position Display:** Shows current conveyor position for debugging/calibration.

### 4.2. Backend (`/server`, `server.ts`)

The backend is a Node.js server that serves as the central authority for all hardware control and coordination logic.

- **Core Logic (`server/SystemCoordinator.ts`):** Central orchestration class.
- **Key Responsibilities:**
  - **Position Translation:** Converts pixel positions to encoder positions.
  - **Sorter State Management (`server/components/SorterStateManager.ts`):** Tracks all 4 sorters' current and scheduled positions.
  - **Part Scheduling:** Maintains queue of parts with encoder-based trigger positions.
  - **Availability Logic:** Determines if a sorter can reach a bin in time.
  - **Skip Logic:** Skips parts that can't be sorted (sorter unavailable).
  - **Command Dispatch:** Sends jet and move commands at appropriate encoder positions.
  - **Hardware Abstraction (`server/components/DeviceManager.ts`):** Serial communication with Arduinos.
  - **WebSocket Server (`server/components/SocketManager.ts`):** Real-time frontend communication.

### 4.3. Hardware (`/arduino_code`)

The hardware consists of several modules, each controlled by its own Arduino microcontroller.

#### Conveyor/Jets Arduino (`conveyor_jets.cpp`)

Controls the main conveyor belt and part ejection system.

- **Encoder Position Tracking:** Maintains absolute position counter (source of truth)
- **Position Reporting:** Sends `EP:<position>` to server periodically
- **Pending Jets Buffer:** Stores position-triggered jet commands
- **Motor Control:** PID speed control for constant belt speed
- **Jet Firing:** Executes queued jets when position thresholds crossed

See: [CONVEYOR_JETS_INTERACTION.md](./CONVEYOR_JETS_INTERACTION.md)

#### Sorter Arduinos (`sorter.cpp`) × 4

Four identical sorters, each controlling a 2-axis gantry system.

- **Bin Positioning:** Moves collection funnel over target bin
- **Homing:** Establishes zero position on startup
- **Move Reporting:** Sends `MC:<bin>` when move completes

See: [SORTER_INTERACTION.md](./SORTER_INTERACTION.md)

#### Hopper/Feeder Arduino (`hopper_feeder.cpp`)

Controls part feeding into the conveyor.

- **Hopper Agitation:** Prevents part clumping
- **Vibratory Feeder:** Singulates parts into single file
- **Part Sensing:** Detects when part ready to dispense

See: [HOPPER_FEEDER_INTERACTION.md](./HOPPER_FEEDER_INTERACTION.md)

## 5. Communication Protocols

### 5.1. Frontend ↔ Backend (WebSocket)

Real-time bidirectional communication via Socket.IO.

**Frontend → Backend:**

- `SORT_PART`: Classified part data (pixelPos, timestamp, bin, sorter)
- Manual control commands (conveyor on/off, jet fire, etc.)

**Backend → Frontend:**

- `ENCODER_POSITION`: Current conveyor position for visualization
- `PART_SORTED`: Confirmation when part sorted
- `PART_SKIPPED`: Notification when part couldn't be sorted
- Hardware status updates

### 5.2. Backend ↔ Hardware (Serial USB)

Text-based command protocol with `<>` framing.

**Conveyor Arduino:**

- Settings, motor control, encoder commands
- Position-triggered jet commands (`q<jet>,<position>`)
- Position reports (`EP:<position>`)
- Jet fired confirmations (`JF:<jet>,<position>`)

**Sorter Arduinos:**

- Move commands (`m<bin>`)
- Move complete reports (`MC:<bin>`)
- Homing commands

**Hopper/Feeder Arduino:**

- Settings, pause control, hopper override

## 6. Position-Based Scheduling

The system uses **encoder position** as the source of truth for part location. This can be toggled via the `useEncoderScheduling` feature flag in settings - when false, the legacy time-based scheduling is used.

### 6.1. Why Position-Based?

| Time-Based (Old)                    | Position-Based (New)             |
| ----------------------------------- | -------------------------------- |
| Sensitive to clock drift            | Position is absolute             |
| Speed changes require recalculation | Position is independent of speed |
| Hard to debug timing issues         | Position is observable/loggable  |
| Tight coupling to speed             | Decoupled from speed variations  |

### 6.2. How It Works

1. **Detection:** Frontend detects part at pixel position, sends `SORT_PART` to server with timestamp.
2. **Translation:** `PositionTranslator` converts pixel position to encoder position using calibration data:
   - Interpolates encoder position at detection time based on current position and velocity
   - Converts pixel position to ticks: `partTicksFromLeftEdge = (pixelX / cameraWidthPixels) * cameraWidthInTicks`
   - Calculates remaining distance to jet: `remainingTicks = jetEncoderOffsets[sorter] - partTicksFromLeftEdge`
3. **Jet Position:** `jetPosition = encoderAtDetection + remainingTicks`
4. **Required-By Position:** `requiredByPosition = jetPosition - fallTimeInCounts` (sorter must arrive before this)
5. **Sorter Availability Check:** `SorterStateManager.canSorterReachBin()` determines:
   - When the sorter will be free (after current + scheduled moves)
   - How many encoder counts to travel from effective position to target bin
   - Whether it can arrive before the deadline
6. **Scheduling:** If available, creates `EncoderPart` with `jetPosition` and `moveTriggerPosition`, inserts into sorted queue.
7. **Execution:** On each encoder update, `ConveyorManager.processPositionActions()`:
   - Sends jet queue commands (`q<jet>,<position>`) when `position >= jetPosition - JET_LEAD_COUNTS`
   - Sends sorter move commands when `position >= moveTriggerPosition`
8. **Precision:** Conveyor Arduino fires jet instantly when `encoderPosition >= targetPosition` (~<1ms latency).

### 6.3. Position Calibration Settings

Stored in `settings.positionCalibration`:

```typescript
{
  cameraEncoderOffset: number;   // @deprecated - use cameraWidthInTicks instead
  countsPerPixel: number;        // @deprecated - replaced by cameraWidthInTicks/cameraWidthPixels ratio
  cameraWidthInTicks: number;    // Width of camera view in encoder ticks (left edge to right edge)
  cameraWidthPixels: number;     // Camera resolution width in pixels (default 1280)
  jetEncoderOffsets: number[];   // Encoder tick distance from camera LEFT EDGE to each jet (indices 0-3 = Jets A-D)
  fallTimeInCounts: number;      // Encoder counts for part to fall from jet to sorter
  jetLeadCounts: number;         // How far ahead to send jet commands to Arduino (default 100)
}
```

**Calibration workflow:** The new jet calibration panel resets the encoder to 0 at the camera left edge, then measures distances to the camera right edge (for `cameraWidthInTicks`) and to each air jet (for `jetEncoderOffsets`).

### 6.3. Sorter Availability

Before scheduling a part, the server checks:

1. Where is the sorter now? (current bin)
2. What moves are already scheduled? (pending queue)
3. When will the sorter be free? (in encoder counts)
4. How long to reach target bin? (travel time → encoder counts)
5. Can it arrive before the part? (deadline = jetPosition - fallTime)

If the sorter can't make it, the part is **skipped** (no jet fires, falls off conveyor end).

## 7. State Management

### 7.1. Server State

| State              | Component          | Description                                                          |
| ------------------ | ------------------ | -------------------------------------------------------------------- |
| Encoder Position   | ConveyorManager    | Current position, timestamp, velocity (synced from Arduino EP: msgs) |
| Encoder Part Queue | ConveyorManager    | `EncoderPart[]` sorted by jetPosition (position-based scheduling)    |
| Part Queue         | ConveyorManager    | `Part[]` for legacy time-based scheduling                            |
| Sorter States      | SorterStateManager | Per-sorter: currentBin, isMoving, targetBin, scheduledMoves queue    |
| Settings           | SettingsManager    | All configuration from Firebase with real-time sync                  |
| Device Connections | DeviceManager      | Connected Arduinos, reconnection state, handshake tracking           |

### 7.2. Arduino State

| State            | Component        | Description                                                |
| ---------------- | ---------------- | ---------------------------------------------------------- |
| Encoder Position | Conveyor Arduino | `int32_t encoderPosition` - raw counter, never auto-resets |
| Pulse Count      | Conveyor Arduino | For RPM calculation, reset each interval                   |
| Pending Jets     | Conveyor Arduino | `PendingJet[16]` buffer of position-triggered commands     |
| Jet Active Flags | Conveyor Arduino | `bool[4]` and end times for non-blocking jet firing        |
| PID State        | Conveyor Arduino | Input, output, setpoint for speed control                  |
| Current Bin      | Sorter Arduino   | `curBin` - last commanded bin position                     |
| Homing State     | Sorter Arduino   | `HomingState` enum for homing state machine                |
| Feeder State     | Hopper Arduino   | `FeederState` enum including ramp_up_move                  |
| Hopper State     | Hopper Arduino   | `HopperState` enum for agitation cycle                     |
| Max Feeder Speed | Hopper Arduino   | Latched maximum speed from first settings message          |

## 8. Error Handling and Recovery

### 8.1. Part Skip Scenarios

- **Sorter unavailable:** Previous move won't complete in time
- **Parts too close:** Sorter can't move fast enough between bins
- **Classification failure:** Part not identified

Skipped parts are logged and reported to frontend.

### 8.2. Hardware Recovery

- **Arduino disconnect:** DeviceManager reconnects with exponential backoff
- **Arduino reset:** Re-sends settings on `Ready` message
- **Encoder drift:** Periodic reset or calibration available

## 9. Configuration

System configuration is stored in Firebase Firestore (schema defined in `types/settings.type.ts`) and includes:

- **Serial Ports:** `conveyorJetsSerialPort`, `hopperFeederSerialPort`, per-sorter `serialPort`
- **Sorter Settings:** Grid dimensions, step offsets, acceleration, speed, row/column order
- **Jet Settings:** Fire durations per jet (`jetDuration`), pixel positions (`jetPositionStart`)
- **Hopper/Feeder:** Vibration speed, pause times, cycle intervals
- **Conveyor Motor:** Max/min RPM, PID tuning (Kp, Ki, Kd), pulses per revolution
- **Position Calibration:** `positionCalibration` object with encoder offsets and counts per pixel
- **Feature Flags:** `useEncoderScheduling` (true = position-based, false = time-based)
- **Detection/Classification:** Thresholds, camera positions, video stream IDs

Changes propagate in real-time via Firestore `onSnapshot` listeners, triggering component reinitialization as needed.
