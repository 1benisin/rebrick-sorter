# System Architecture: Rebrick Sorter

## 1. Overview

This document outlines the system architecture of the Rebrick Sorter, an automated LEGO sorting machine. The goal of this document is to provide a comprehensive understanding of the project's components and their interactions, primarily to serve as a detailed context for an LLM-based code editor to assist in future development.

The system is comprised of three main pillars:

1.  **Hardware:** A set of custom-built, Arduino-controlled modules that physically handle and sort LEGO parts.
2.  **Backend Server:** A Node.js application that acts as the brain of the operation, orchestrating the hardware components.
3.  **Frontend Application:** A web-based interface built with Next.js and React for real-time monitoring, control, and part classification.

## 2. Core Process Flow: The Journey of a LEGO Part

The primary function of the system is to identify and sort LEGO parts into designated bins. This process involves a coordinated sequence of events across all parts of the system.

1.  **Feeding:** The process begins at the **Hopper**, which holds a bulk supply of unsorted LEGO parts. It slowly dispenses parts into a **Vibratory Feeder**.
2.  **Singulation:** The Vibratory Feeder shakes the parts, arranging them into a single file line as they are deposited onto the **Conveyor Belt**.
3.  **Detection:** The conveyor belt carries the parts past a station with two webcams. The live video streams from these cameras are fed to the frontend application. A client-side TensorFlow.js detection model (`public/detection-model`) running in the browser detects the presence and bounding boxes of LEGO parts on the belt.
4.  **Classification:**
    - For each detected part, the frontend application captures and crops the image from the video stream using the bounding box from the detection model.
    - These cropped images are then sent to a backend API endpoint (`/api/brickognize`).
    - This endpoint forwards the image to a third-party service, **Brickognize**, which identifies the specific LEGO part (e.g., its Part or Mold ID).
5.  **Scheduling & Sorting:**
    - Once a part is successfully classified, the information is sent from the frontend to the backend server via a WebSocket message.
    - The backend's `SorterService` receives the part information and its position on the conveyor. It calculates the precise time the part will reach the designated sorting station.
    - A timeout is scheduled. When the timer expires, the backend sends a command to the corresponding **Air Jet**.
6.  **Ejection & Collection:**
    - The Air Jet fires a short blast of compressed air, precisely timed to blow the identified part off the side of the conveyor belt.
    - The part falls into a collection funnel/tube.
7.  **Binning:**
    - The end of the collection tube is positioned over a 2D grid of bins by a motor-controlled system (the "Sorter").
    - The backend `SorterManager` ensures the tube is moved to the correct bin location for that specific part before it is ejected from the conveyor.

## 3. System Components Deep Dive

### 3.1. Frontend (`/app`, `/components`, `/lib`)

The frontend is a Next.js/React application responsible for the user interface and the initial part detection/classification steps.

- **Framework:** Next.js with the App Router.
- **UI:** Built with React, Tailwind CSS, and `shadcn/ui` components.
- **Key Responsibilities:**
  - **Real-time Monitoring (`/app/sorter/page.tsx`):** Displays video feeds from the two webcams (`DualVideo.tsx`), system status indicators, and logs.
  - **Hardware Control Panel (`/app/sorter/page.tsx`):** Provides buttons for manual operation and calibration of hardware components (e.g., `ConveyorButton.tsx`, `JetButton.tsx`).
  - **Part Detection (`lib/services/DetectorService.ts`):** Loads and runs a local TensorFlow.js object detection model to find LEGOs in the video streams.
  - **Part Classification (`lib/services/ClassifierService.ts`, `app/api/brickognize/route.ts`):** Manages the process of sending cropped images of detected parts to the classification API.
  - **Backend Communication (`lib/services/SocketService.ts`, `hooks/useSocket.ts`):** Maintains a persistent WebSocket connection to the backend server for sending commands (like classified part data) and receiving real-time status updates.
  - **Settings Management (`/app/settings/page.tsx`):** Allows users to configure system settings, such as serial port paths for hardware.

### 3.2. Backend (`/server`, `server.ts`)

The backend is a custom Node.js server that runs using `server.ts`. It is the central authority for all hardware control and business logic.

- **Core Logic (`server/SystemCoordinator.ts`):** The central orchestration class that initializes and manages all other backend services.
- **Key Responsibilities:**
  - **Hardware Abstraction (`server/components/DeviceManager.ts`):** Manages the serial port connections to all Arduino devices. It handles message sending, receiving, and parsing. Each piece of hardware (Conveyor, Sorter) has its own manager class (e.g., `ConveyorManager.ts`, `SorterManager.ts`).
  - **WebSocket Server (`server/components/SocketManager.ts`):** Hosts the WebSocket server that the frontend connects to. It broadcasts system status updates and receives commands from the client.
  - **Sorting Logic (`lib/services/SorterService.ts`):** This service contains the core logic for the sorting process. It takes classified part data, calculates timings, and commands the `DeviceManager` to fire the correct air jet and position the sorter bin.
  - **State Management:** The backend maintains the complete state of the physical machine, including conveyor speed, sorter position, and part locations.

### 3.3. Hardware (`/arduino_code`)

The hardware consists of several modules, each controlled by its own Arduino microcontroller. The Arduinos run C++ code and communicate with the backend server over a serial (USB) connection.

- **`sorter.cpp`:** Code for the main Arduino that likely controls the conveyor belt motor, air jets, and the 2D sorter mechanism.
- **`hopper_feeder.cpp`:** Code for the Arduino controlling the hopper and vibratory feeder assembly.
- **`conveyor_jets.cpp`:** This may be an older or alternative version of the sorter control, or it could be for a dedicated jet controller.

Communication between the backend and the Arduinos is command-based, using a defined set of serial commands (see `types/arduinoCommands.type.ts`).

## 4. Communication Protocols

- **Frontend <-> Backend:** Communication happens primarily over **WebSockets**. This allows for the low-latency, bidirectional communication required for real-time control and status updates. The frontend sends classified part data and manual control commands, while the backend streams status information (e.g., hardware state, alerts).
- **Backend <-> Hardware:** Communication happens over **Serial (USB)** connections. The Node.js backend uses a library like `serialport` to open connections to each Arduino. A text-based command protocol is used to send instructions (e.g., `CONVEYOR_ON`, `FIRE_JET_1`, `MOVE_SORTER_X_Y`).
