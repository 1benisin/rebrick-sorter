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

The system uses **encoder position** as the source of truth for part location, replacing the previous time-based approach.

### 6.1. Why Position-Based?

| Time-Based (Old)                    | Position-Based (New)             |
| ----------------------------------- | -------------------------------- |
| Sensitive to clock drift            | Position is absolute             |
| Speed changes require recalculation | Position is independent of speed |
| Hard to debug timing issues         | Position is observable/loggable  |
| Tight coupling to speed             | Decoupled from speed variations  |

### 6.2. How It Works

1. **Detection:** Frontend detects part at pixel position, sends to server with timestamp.
2. **Translation:** Server converts pixel position to encoder position using calibration data.
3. **Jet Position:** `jetPosition = detectionEncoderPos + cameraToJetOffset`
4. **Sorter Check:** Server checks if target sorter can reach the bin in time.
5. **Scheduling:** If available, server calculates `moveTriggerPosition` and adds to queue.
6. **Execution:** Server monitors encoder position, sends commands when thresholds reached.
7. **Precision:** Conveyor Arduino fires jet instantly when position crosses threshold.

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

| State            | Component                     | Description                                     |
| ---------------- | ----------------------------- | ----------------------------------------------- |
| Encoder Position | ConveyorManager               | Current conveyor position (synced from Arduino) |
| Part Queue       | ConveyorManager/PartScheduler | Scheduled parts with encoder positions          |
| Sorter States    | SorterStateManager            | Current bin, scheduled moves for all 4 sorters  |
| Calibration      | Settings                      | Pixel-to-encoder mapping, jet offsets           |

### 7.2. Arduino State

| State            | Component        | Description                                 |
| ---------------- | ---------------- | ------------------------------------------- |
| Encoder Position | Conveyor Arduino | Raw counter, source of truth                |
| Pending Jets     | Conveyor Arduino | Small buffer of position-triggered commands |
| Current Position | Sorter Arduinos  | Current bin location                        |

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

System configuration is stored in Firebase Firestore and includes:

- **Serial Ports:** Paths to Arduino devices
- **Sorter Settings:** Grid dimensions, travel times, offsets
- **Jet Settings:** Fire durations per jet
- **Calibration:** Camera position, counts per pixel, jet offsets
- **Speed Settings:** Target RPM, min/max bounds

Changes propagate in real-time via Firestore listeners.
