# Encoder Calibration and Integration Testing

This document describes the calibration procedures and integration testing scenarios for the encoder-based position tracking system, including the new jet calibration workflow.

## Prerequisites

Before testing, ensure:

- Conveyor Arduino has encoder hardware connected
- Arduino firmware is flashed with encoder support
- Server components are initialized
- Frontend components are deployed

---

## Pre-Flight Checklist

Before any calibration testing, verify:

- [ ] Backend server running (`yarn dev`)
- [ ] Frontend accessible at localhost:3000/sorter
- [ ] Conveyor/Jets Arduino connected and recognized
- [ ] Encoder reporting (check EncoderStatusDisplay shows updates)
- [ ] Motor driver power on (for manual conveyor movement)
- [ ] Firebase connection active (check browser console)

---

## Calibration Procedures

### Jet Position Calibration (New Workflow)

This is the primary calibration workflow for accurate part sorting. It measures:

1. Camera view width in encoder ticks (for pixel-to-tick translation)
2. Encoder tick distances from camera left edge to each air jet

#### Start Calibration

1. [ ] Navigate to Sorter page
2. [ ] Expand the "Jet Position Calibration" panel
3. [ ] Click "Start Jet Calibration" button
4. [ ] Verify: Button shows "Resetting encoder..."
5. [ ] Verify: Encoder display resets to ~0
6. [ ] Verify: Button changes to "Stop Calibration"
7. [ ] Verify: Status indicator shows "In Progress"

**Expected Server Logs:**

```
[CALIBRATION] Resetting encoder position to 0
[CALIBRATION] Encoder reset complete, new position: 0
```

**Expected Socket Events:**

- `ENCODER_RESET_COMPLETE` with `{ success: true, position: 0 }`

#### Camera Width Recording

1. [ ] Place a LEGO part on the conveyor
2. [ ] Position it aligned with the **left edge** of the camera view
3. [ ] Use the **physical switch on the motor driver** to move the conveyor forward
4. [ ] **Important:** Do NOT move the conveyor backwards during calibration
5. [ ] Stop when part reaches the **right edge** of camera view
6. [ ] Click "Mark Camera Width"
7. [ ] Verify: Button shows green checkmark with tick count (e.g., "✓ Camera Width / 150 ticks")
8. [ ] Verify: Jet buttons become enabled
9. [ ] Note: Value is stored locally until "Stop Calibration" is clicked (batched save)

**Expected Behavior:**

- Value stored in local React state (not saved to Firebase yet)
- No server logs or socket events until calibration ends

#### Jet Position Recording

Repeat for each jet (A, B, C, D):

1. [ ] Continue moving conveyor **forward only** from camera position
2. [ ] Stop when part is centered under Jet A nozzle
3. [ ] Click "Jet A" button
4. [ ] Verify: Button shows green with offset value (e.g., "✓ Jet A / 500 ticks")
5. [ ] Verify: Offset value > camera width (warning appears if not)
6. [ ] Repeat for Jets B, C, D

**Expected Behavior:**

- Values stored in local React state (not saved to Firebase yet)
- Validation warning shown in UI if offset ≤ camera width
- No server logs or socket events until calibration ends

#### Stop Calibration

1. [ ] Click "Stop Calibration"
2. [ ] Verify: All calibration data saved to Firebase in single write
3. [ ] Verify: Confirmation message shows all recorded values
4. [ ] Verify: Confirmation auto-dismisses after 5 seconds
5. [ ] Verify: Status indicator shows "✓ Done" briefly

**Expected Server Logs:**

```
[CALIBRATION] Saving all calibration data at once
[CALIBRATION] Camera width: <ticks> ticks
[CALIBRATION] Jet offsets: [<offset0>, <offset1>, <offset2>, <offset3>]
[CALIBRATION] All calibration data saved successfully
```

**Expected Socket Events:**

- `SAVE_CALIBRATION_DATA` sent from frontend with `{ cameraWidthInTicks, cameraWidthPixels?, jetEncoderOffsets }`
- `CALIBRATION_POINT_RECORDED` response with `{ type: 'cameraWidth', position: <ticks>, success: true }`

**Firebase Verification:**

- `positionCalibration.cameraWidthInTicks` should equal recorded camera width value
- `positionCalibration.cameraWidthPixels` should match video capture width
- `positionCalibration.jetEncoderOffsets[0-3]` should equal recorded jet offset values

#### Re-marking During Calibration

- [ ] Camera Width can be re-marked by clicking the button again
- [ ] Jet positions can be re-marked by clicking the respective button
- [ ] Values are stored locally and only saved when "Stop Calibration" is clicked (batched save)

---

### Legacy Calibration (Deprecated)

The following procedures use the old calibration system and are being phased out:

#### Encoder Reset Calibration

**Purpose:** Establish a known zero position for the encoder.

**Steps:**

1. Navigate to the Sorter page
2. Expand the "Encoder Calibration" panel (if present)
3. Position the conveyor at a known starting point
4. Click "Reset Encoder to 0"
5. Verify the position display shows 0

**Verification:**

- [ ] `EncoderStatusDisplay` shows position = 0
- [ ] Server logs show `[CALIBRATION] Encoder reset complete, new position: 0`
- [ ] Frontend receives `ENCODER_RESET_COMPLETE` event with `{ success: true, position: 0 }`

#### Camera Position Calibration (Deprecated)

**Note:** This is replaced by the new camera width calibration.

**Purpose:** Record the encoder position where the camera captures parts.

**Steps:**

1. Place a reference part at the exact position where the camera detects it
2. Run the conveyor until the part is centered in the camera view
3. Stop the conveyor
4. Click "Mark Camera Position"
5. Note the recorded position value

---

## Position Translation Verification

After calibration is complete, verify the pixel-to-tick translation works correctly.

### Test Part Detection at Different Positions

With calibration complete and sorting active:

#### Part at Camera Left Edge (pixelX ~ 0)

- [ ] Part should travel maximum distance to jet
- [ ] Jet fires when part reaches jet position
- [ ] Console shows: `[POSITION_TRANSLATOR] Jet trigger calc: pixelX=<small>, partTicks=<small>, remaining=<large>`

#### Part at Camera Center (pixelX ~ 640 for 1280px)

- [ ] Part travels half camera width less distance
- [ ] Jet timing accounts for position
- [ ] Console shows reasonable `remaining` value

#### Part at Camera Right Edge (pixelX ~ 1280)

- [ ] Part travels minimum distance to jet
- [ ] Jet fires earlier relative to detection time
- [ ] Console shows: `[POSITION_TRANSLATOR] Jet trigger calc: pixelX=<large>, partTicks=<near cameraWidthInTicks>, remaining=<small>`

### Timing Accuracy Check

- [ ] Parts consistently hit target bin
- [ ] No systematic early/late firing
- [ ] Check console logs for `[POSITION_TRANSLATOR]` messages

---

## Edge Case Tests

### Re-calibration

- [ ] Can start new calibration after completing one
- [ ] Previous values cleared on new calibration start
- [ ] New values overwrite old values in Firebase

### Error Handling

- [ ] Disconnecting Arduino during calibration shows error in UI
- [ ] Invalid values (negative, NaN) rejected with error message
- [ ] Error message auto-dismisses after 5 seconds

### Page Refresh

- [ ] Calibration values persist after page refresh
- [ ] Can sort correctly with persisted values
- [ ] EncoderStatusDisplay loads persisted position

### Large Encoder Values

- [ ] System works after extended conveyor movement (encoder > 100,000)
- [ ] No overflow issues with large encoder counts
- [ ] Interpolation still accurate at high values

### Video Capture Resolution Mismatch

- [ ] Warning shown if video capture dimensions differ from calibrated `cameraWidthPixels`
- [ ] Sorting still works (may have reduced accuracy)
- [ ] Console warns: `Camera width mismatch: calibration=<x>px, actual=<y>px`

---

## Integration Test Scenarios

### Test 1: Single Part Flow with New Calibration

**Objective:** Verify complete part flow from detection through sorting using the new calibration system.

**Setup:**

1. Complete jet position calibration using new workflow
2. Home all sorters to bin 1
3. Reset encoder to 0
4. Start conveyor

**Test Steps:**

1. Place a part on the conveyor upstream of the camera
2. Wait for detection (observe DetectionPairDisplay)
3. Wait for classification (observe bin assignment)
4. Observe sorter movement to target bin
5. Observe jet fire at correct position

**Expected Results:**

- [ ] Part detected with correct pixel position
- [ ] `ENCODER_PART_SCHEDULED` socket event emitted with correct positions
- [ ] Console shows pixel-to-tick translation: `[POSITION_TRANSLATOR] Jet trigger calc: ...`
- [ ] Sorter moves to target bin before part arrives
- [ ] Jet fires when encoder reaches `jetPosition`
- [ ] `ENCODER_PART_SORTED` socket event emitted
- [ ] Part lands in correct bin

**Logs to Check:**

```
[POSITION_TRANSLATOR] Jet trigger calc: pixelX=<n>, encoder=<n>, jet=<n>, partTicks=<n>, jetOffset=<n>, remaining=<n>, trigger=<n>
[ENCODER_PART] Built encoder part: {partId, detectionEncoderPos, jetPosition, ...}
[ENCODER_SORT] Part <id> scheduled: jetPos=<n>, movePos=<n>, sorter=<n>, bin=<n>
```

### Test 2: Multiple Parts in Sequence

**Objective:** Verify ordering and lead time calculations with multiple parts.

**Setup:**

1. Home all sorters
2. Reset encoder

**Test Steps:**

1. Place 3-5 parts on conveyor with 2-3 second spacing
2. Observe each part being detected and scheduled
3. Verify parts are sorted in order

**Expected Results:**

- [ ] Parts scheduled in detection order
- [ ] Sorter moves timed correctly for each part
- [ ] No parts missed or out of order
- [ ] Buffer status shows pending jets (should increase then decrease)

### Test 3: Sorter Unavailable (Skip Logic)

**Objective:** Verify parts are skipped when sorter cannot reach target bin in time.

**Setup:**

1. Home sorters to bin 1

**Test Steps:**

1. Send first part to sorter A, bin 144 (far corner)
2. Immediately send second part to same sorter A, different bin
3. Observe second part being skipped

**Expected Results:**

- [ ] First part scheduled normally
- [ ] Second part triggers skip logic
- [ ] `ENCODER_PART_SKIPPED` socket event emitted with `{ partId, reason, sorter, bin }`
- [ ] Server logs: `[ENCODER_SKIP] Part <id> skipped: Sorter unavailable - cannot reach bin in time`
- [ ] No jet fired for skipped part

### Test 4: Parts Too Close Together

**Objective:** Verify handling of parts that are detected very close together.

**Setup:**

1. Home sorters

**Test Steps:**

1. Place two parts touching or nearly touching on conveyor
2. Observe detection and scheduling

**Expected Results:**

- [ ] Both parts detected (may be merged depending on detection logic)
- [ ] Second part may be skipped if sorter cannot move fast enough
- [ ] System remains stable, no crashes or hangs
- [ ] Clear logging of what happened to each part

### Test 5: Arduino Reset Recovery

**Objective:** Verify system recovers from Arduino disconnect/reset.

**Setup:**

1. System running with encoder updates flowing
2. Parts being sorted normally

**Test Steps:**

1. Note current encoder position
2. Press reset button on Conveyor Arduino (or disconnect/reconnect USB)
3. Observe system recovery

**Expected Results:**

- [ ] Server detects disconnect via serial port error/close event
- [ ] `COMPONENT_STATUS_UPDATE` emitted with `ERROR` status
- [ ] EncoderStatusDisplay shows "Stale" (data older than 1000ms)
- [ ] DeviceManager initiates reconnection with exponential backoff
- [ ] Arduino reconnects and sends "Ready"
- [ ] Encoder position resyncs (will be 0 after Arduino reset)
- [ ] `COMPONENT_STATUS_UPDATE` emitted with `READY` status
- [ ] Frontend shows "Live" status after recovery

### Test 6: High-Speed Throughput

**Objective:** Verify system handles maximum part throughput.

**Setup:**

1. Set conveyor to maximum safe speed
2. Home all sorters

**Test Steps:**

1. Feed parts as fast as the system can handle
2. Monitor for missed parts, timing errors, or crashes
3. Run for 5-10 minutes continuously

**Expected Results:**

- [ ] Parts sorted correctly under load
- [ ] No buffer overflow on Arduino (check BS: messages)
- [ ] No memory leaks on server (monitor process)
- [ ] Encoder position doesn't drift or overflow
- [ ] Consistent sorting accuracy

---

## Automated Test Suite

The following tests can be run without hardware using Jest:

```bash
# Run all tests
yarn test

# Run unit tests only
yarn test:unit

# Run integration tests only
yarn test:integration

# Run with coverage
yarn test:coverage
```

### Unit Tests (No Hardware Required)

| Test File                    | Coverage                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| `PositionTranslator.test.ts` | `calculateJetTriggerEncoder`, `isCalibrated`, helper methods |
| `settingsSchema.test.ts`     | Schema validation, defaults, coercion                        |
| `socketMessageTypes.test.ts` | Type safety for socket events                                |

### Integration Tests (Mocked Dependencies)

| Test File                     | Coverage                                                                   |
| ----------------------------- | -------------------------------------------------------------------------- |
| `calibrationHandlers.test.ts` | `handleRecordCameraWidth`, `handleRecordJetPosition`, `handleResetEncoder` |

---

## Troubleshooting

### Encoder Position Not Updating

1. Check Arduino serial connection in DeviceManager logs
2. Verify Arduino is sending `EP:<position>` messages
3. Check `ENCODER_POSITION_UPDATE` events in browser dev tools

### Calibration Values Not Saving

1. Ensure you clicked "Stop Calibration" to trigger the batched save
2. Check Firebase connection in browser console
3. Verify user ID matches between client and server
4. Check for validation errors in settings schema
5. Check server logs for `[CALIBRATION] Error saving calibration data:` messages

### Parts Always Skipped

1. Verify `jetEncoderOffsets` are calibrated correctly (must be > camera width)
2. Check if calibration was completed (all 4 jets + camera width)
3. Verify sorter travel times are reasonable
4. Check encoder velocity calculation (smoothing may be too slow)

### Jet Fires at Wrong Position

1. Re-calibrate jet positions using new workflow
2. Check `jetLeadCounts` value (may need adjustment)
3. Verify encoder velocity is accurate
4. Check for serial communication latency
5. Verify `cameraWidthInTicks` is accurate

### "Camera width mismatch" Warning

1. Video capture resolution changed since calibration
2. Recalibrate with current video capture settings
3. Or update `cameraWidthPixels` in Firebase manually

---

## Performance Metrics

Track these metrics during testing:

| Metric               | Target                        | Method                                   |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Sorting accuracy     | >99%                          | Count correct vs total parts             |
| Jet timing precision | ±5 encoder counts             | Compare target vs actual in JF: messages |
| Sorter ready time    | Before part arrival           | Check move complete vs jet fire times    |
| Skip rate            | <5% (under normal conditions) | Count ENCODER_PART_SKIPPED events        |
| Recovery time        | <5 seconds                    | Time from disconnect to operational      |
