# Rebrick Sorter — Documentation Index

This folder contains technical documentation for the Rebrick Sorter project. Use this index to get a complete picture of the system and find the right doc for each topic. The root [ARCHITECTURE.md](../ARCHITECTURE.md) provides a high-level overview and service-initialization flows; it points here for authoritative backend/frontend/hardware detail.

## Quick Start for Agents

- **New to the project?** Start with [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) for the big picture, then [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) and [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).
- **Working on hardware interaction?** Use [CONVEYOR_JETS_INTERACTION.md](./CONVEYOR_JETS_INTERACTION.md), [SORTER_INTERACTION.md](./SORTER_INTERACTION.md), or [HOPPER_FEEDER_INTERACTION.md](./HOPPER_FEEDER_INTERACTION.md).
- **Calibration or integration tests?** See [CALIBRATION_TESTING.md](./CALIBRATION_TESTING.md).

## Document Map

| Document | Purpose |
|----------|---------|
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | End-to-end system: components, data flow, position-based scheduling, communication protocols |
| [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) | Node.js server: SystemCoordinator, managers (Socket, Settings, Device, SorterState, Conveyor, Sorter), sorting process, position translation |
| [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) | Next.js/React app: services (Settings, Socket, VideoCapture, Detector, Classifier, Sorter), stores, detection/classification pipeline, encoder-based matching |
| [CONVEYOR_JETS_INTERACTION.md](./CONVEYOR_JETS_INTERACTION.md) | Conveyor/Jets Arduino: encoder tracking, PID speed control, pending jets buffer, serial protocol |
| [SORTER_INTERACTION.md](./SORTER_INTERACTION.md) | Sorter Arduinos (×4): bin-to-coordinate, homing, move complete, serial protocol, server state |
| [HOPPER_FEEDER_INTERACTION.md](./HOPPER_FEEDER_INTERACTION.md) | Hopper/Feeder Arduino: feeder state machine, hopper agitation, serial protocol |
| [CALIBRATION_TESTING.md](./CALIBRATION_TESTING.md) | Jet position calibration workflow, position translation checks, integration test scenarios |

## Core Design (Post–Constant-Speed Refactor)

- **Scheduling:** Encoder-based only. Parts are tracked in encoder tick space; detection matching, position prediction, and jet firing all use encoder positions. No time-based scheduling, no speed tracking, no variable conveyor speed.
- **Data flow:** Frontend captures frames with `encoderAtCapture`, creates detections with `encoderAtDetection`, matches by absolute encoder position, and sends `SORT_PART` with `encoderAtDetection`. Server uses `encoderAtDetection` directly (no interpolation) and translates pixel → jet position via calibration (`cameraWidthInTicks`, `jetEncoderOffsets`).
- **Removed:** SpeedManager, time-based scheduling, `conveyorSpeed`/speed log, `findPositionAtTime`, `useEncoderScheduling`, and related settings/events. See `_plans/CONSTANT_SPEED_SIMPLIFICATION_PLAN.md` for the refactor plan.

## Key Types and Locations

- **SortPartDto:** `types/sortPart.dto.ts` — `partId`, `initialPosition`, `initialTime`, `encoderAtDetection`, `bin`, `sorter`, `cameraWidthPixels?`
- **ImageCaptureType:** `types/imageCapture.d.ts` — `imageBitmaps`, `timestamp`, `encoderAtCapture`
- **Detection:** `types/types.ts` — `encoderAtDetection`, `centroid`, `timestamp`, etc.
- **Settings / positionCalibration:** `types/settings.type.ts` — `cameraWidthInTicks`, `cameraWidthPixels`, `jetEncoderOffsets`, `fallTimeInCounts`, `jetLeadCounts`, `sorterRestBufferInCounts`
- **EncoderPart:** `types/part.type.ts` — server-side part with `jetPosition`, `moveTriggerPosition`, etc.
