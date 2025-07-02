# PRD: Feeder Settings Update Synchronization

### Introduction/Overview

This document outlines the requirements to fix a bug where settings for the Hopper/Feeder module, updated via the web UI, are not being synchronized with the `hopper_feeder` Arduino device. Currently, when an operator modifies a setting like "Feeder Vibration Speed" and saves it, the change is saved to the central settings store (Firebase) but is not propagated to the hardware. The goal is to ensure that any change to Hopper/Feeder settings in the UI takes immediate effect on the physical device, just as it does for the Sorter and Conveyor/Jets modules.

### Goals

- To restore the expected real-time settings update functionality for the Hopper/Feeder module.
- To ensure the system is robust by implementing validation for settings at the UI, backend, and firmware levels.
- To provide clear and immediate feedback to the user that the settings have been successfully applied to the hardware.

### User Stories

- **As a system operator, I want to update the feeder's vibration speed in the settings UI and have the change take effect on the hardware immediately, so I can fine-tune the part flow in real-time.**

### Functional Requirements

1.  The system **must** detect when any setting related to the `hopper_feeder` device is modified and saved.
2.  Upon detection of a settings change, the backend **must** construct and send the complete settings command (`s,...`) to the `hopper_feeder` Arduino via its serial port.
3.  The `hopper_feeder` Arduino **must** correctly parse the incoming settings command and update its internal configuration variables.
4.  After successfully updating its configuration, the `hopper_feeder` Arduino **must** send the `Settings updated` confirmation message back to the backend.
5.  The system **must** log the confirmation message from the Arduino, making it visible in the UI console for operator verification.

### Non-Goals (Out of Scope)

- This fix will not introduce new settings for the Hopper/Feeder module.
- This fix will not change the fundamental communication protocol (i.e., the format of the `s` command).
- This fix will not address settings updates for any other module unless they are found to be part of the same root cause.

### Design Considerations

- **UI Validation:** The input fields on the `/settings` page for numeric feeder values (e.g., vibration speed) should include basic browser-level validation (`type="number"`, `min`, `max`) to prevent trivial user entry errors.

### Technical Considerations

- **Investigation Point:** The primary area of investigation should be the `DeviceManager` and its interaction with the `SettingsManager`. The logic that listens for settings updates and dispatches commands to the appropriate device appears to be failing or incomplete for the `hopper_feeder`.
- **Backend Validation:** Before sending the settings command to the Arduino, the backend (`DeviceManager` or a related component) should perform validation to ensure the values are within a safe and logical range. If validation fails, it should log an error and prevent the invalid command from being sent.
- **Firmware Clamping:** As a final safeguard, the Arduino firmware (`hopper_feeder.cpp`) should "clamp" any received numerical setting to its own predefined hardware limits. For example, if it receives a vibration speed of 300 but its physical maximum is 255, it should use 255. This makes the hardware resilient to incorrect configuration from the backend.

### Success Metrics

The fix will be considered successful when the following criteria are met:

1.  When an operator changes the "Feeder Vibration Speed" (or any other `hopper_feeder` setting) on the settings page and clicks save, the change is correctly applied.
2.  The backend correctly sends the `s,<HOPPER_CYCLE_INTERVAL>,<FEEDER_VIBRATION_SPEED>,...` command to the `hopper_feeder` Arduino.
3.  The backend receives a `Settings updated` message from the `hopper_feeder` Arduino, which is visible in the UI's log/console.
4.  The physical vibration intensity of the feeder visibly changes to match the newly configured speed.

### Open Questions

- None at this time.
