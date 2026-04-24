# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rebrick Sorter is a LEGO brick sorting system that uses computer vision (TensorFlow.js) to detect parts on a conveyor belt, classifies them via the Brickognize API, and routes them to bins using Arduino-controlled air jets and sorter mechanisms.

**Core Design Principle:** "Centralize decisions, distribute execution" — the Node.js backend makes all coordination decisions while Arduinos execute physical actions with precise timing.

## Common Commands

```bash
# Development
yarn dev                    # Start dev server (TypeScript watch + Next.js)
yarn build                  # Build for production
yarn start                  # Run production server

# Testing
yarn test                   # Run all tests
yarn test:unit              # Unit tests only
yarn test:integration       # Integration tests only
yarn test:watch             # Watch mode
npx jest path/to/file.test.ts  # Run single test file

# Code Quality
yarn lint                   # ESLint
yarn prettier               # Format code
yarn watch                  # TypeScript type checking (no emit)
```

## Architecture

### Encoder-Based Scheduling (Critical Concept)

The system uses encoder ticks as the single source of truth for part position tracking. No time-based scheduling.

- Parts are detected with `encoderAtDetection` (encoder position when frame was captured)
- Detection matching uses absolute encoder position, not time or speed
- Jet firing and sorter moves trigger when encoder crosses position thresholds
- Requires calibration: `cameraWidthInTicks`, `jetEncoderOffsets[4]`, `fallTimeInCounts`

### Backend (Node.js in `server/`)

All components extend `BaseComponent` with `initialize()`/`deinitialize()` lifecycle.

Key managers:
- **SystemCoordinator** — Master orchestrator, handles `SORT_PART` events
- **DeviceManager** — Arduino serial communication (115200 baud conveyor, 9600 sorters)
- **ConveyorManager** — Encoder tracking, maintains `encoderPartQueue`, triggers jets/moves when encoder crosses thresholds
- **SorterStateManager** — Tracks per-sorter state, calculates availability with `canSorterReachBin()`
- **PositionTranslator** — Converts pixel positions to encoder positions using calibration data

### Frontend (Next.js in `app/`, services in `lib/services/`)

All services implement a common lifecycle: `initialize()`, `reinitialize()`, `deinitialize()`, `getState()`.

Key services:
- **VideoCaptureService** — Dual camera capture, returns `{imageBitmaps, timestamp, encoderAtCapture}`
- **DetectorService** — TensorFlow.js detection, returns detections with `encoderAtDetection`
- **ClassifierService** — Brickognize API integration, bin lookup from Firebase catalog
- **SorterService** — Main loop (~500ms), detection matching, emits `SORT_PART` via SocketService

### State Management

- Frontend: Zustand stores (`sortProcessStore`, `alertStore`)
- Backend: In-memory state in managers, Firebase Firestore for persistent settings

### Hardware Communication

Six Arduino devices: 4 Sorters, 1 Conveyor/Jets, 1 Hopper/Feeder. Serial protocol uses `<>` message framing.

## Key Types

- **SortPartDto** (`types/sortPart.dto.ts`) — Part data sent to backend: `partId`, `encoderAtDetection`, `bin`, `sorter`
- **EncoderPart** (`types/part.type.ts`) — Server-side part with `jetPosition`, `moveTriggerPosition`
- **Settings** (`types/settings.type.ts`) — Zod-validated, includes `positionCalibration` with encoder offsets

## Documentation

Detailed architecture docs in `_docs/`:
- `SYSTEM_ARCHITECTURE.md` — End-to-end overview
- `BACKEND_ARCHITECTURE.md` — Server component deep dive
- `FRONTEND_ARCHITECTURE.md` — Client service deep dive
- `CONVEYOR_JETS_INTERACTION.md`, `SORTER_INTERACTION.md`, `HOPPER_FEEDER_INTERACTION.md` — Arduino protocols

## Configuration

- `tsconfig.json` — Frontend (path alias `@/*` → root)
- `tsconfig.server.json` — Backend (CommonJS output to `.dist`)
- Firebase Admin for server-side Firestore, Firebase SDK for client-side real-time listeners
