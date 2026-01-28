# Encoder Calibration and Integration Testing

This document describes the calibration procedures and integration testing scenarios for the encoder-based position tracking system.

## Prerequisites

Before testing, ensure:

- Conveyor Arduino has encoder hardware connected
- Arduino firmware is flashed with encoder support (Phase 1 complete)
- Server components are initialized (Phases 2-4 complete)
- Frontend components are deployed (Phase 5 complete)

## Calibration Procedures

### 1. Encoder Reset Calibration

**Purpose:** Establish a known zero position for the encoder.

**Steps:**

1. Navigate to the Sorter page
2. Expand the "Encoder Calibration" panel
3. Position the conveyor at a known starting point
4. Click "Reset Encoder to 0"
5. Verify the position display shows 0

**Verification:**

- [ ] `EncoderStatusDisplay` shows position = 0
- [ ] Server logs show `[CALIBRATION] Encoder reset complete, new position: 0`
- [ ] Frontend receives `ENCODER_RESET_COMPLETE` event with `success: true`

### 2. Camera Position Calibration

**Purpose:** Record the encoder position where the camera captures parts.

**Steps:**

1. Place a reference part at the exact position where the camera detects it
2. Run the conveyor until the part is centered in the camera view
3. Stop the conveyor
4. Click "Mark Camera Position"
5. Note the recorded position value

**Verification:**

- [ ] `cameraEncoderOffset` is updated in Firebase settings
- [ ] Value appears in the Settings Form under Position Calibration
- [ ] Server logs show `[CALIBRATION] Camera position recorded successfully: <position>`
- [ ] Frontend shows success toast: "Camera position recorded: <position>"

### 3. Jet Position Calibration (Per Sorter)

**Purpose:** Record the encoder position where each jet fires to sort parts.

**Steps (repeat for each sorter A-D):**

1. Place a reference part on the conveyor
2. Run the conveyor until the part is at the jet position for the target sorter
3. Stop the conveyor
4. Click "Mark Jet [A/B/C/D]" for the corresponding sorter
5. Note the recorded position value

**Verification:**

- [ ] `jetEncoderOffsets[sorter]` is updated in Firebase settings
- [ ] Value appears in the Settings Form under Position Calibration
- [ ] Server logs show `[CALIBRATION] Jet position for sorter X recorded successfully: <position>`
- [ ] Frontend shows success toast

### 4. Counts Per Pixel Calibration

**Purpose:** Determine the ratio between camera pixels and encoder counts.

**Steps:**

1. Reset encoder to 0 at a known position
2. Note the pixel X position of a reference point in the camera
3. Run the conveyor a known distance
4. Note the new encoder position and pixel X position
5. Calculate: `countsPerPixel = (encoder_delta) / (pixel_delta)`
6. Enter the calculated value in Settings Form

**Note:** This may be a negative value if the camera is upstream of the detection point and parts move right-to-left in the frame.

---

## Integration Test Scenarios

### Test 1: Single Part Flow

**Objective:** Verify complete part flow from detection through sorting.

**Setup:**

1. Enable `useEncoderScheduling` in Settings
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
- [ ] `ENCODER_PART_SCHEDULED` event emitted with correct positions
- [ ] Sorter moves to target bin before part arrives
- [ ] Jet fires when encoder reaches `jetPosition`
- [ ] `ENCODER_PART_SORTED` event emitted
- [ ] Part lands in correct bin

**Logs to Check:**

```
[ENCODER_SORT] Part <id> scheduled: jetPos=<n>, movePos=<n>, sorter=<n>, bin=<n>
[JET_QUEUED] Jet <n> queued at position <n>
[JET_FIRED] Jet <n> fired at position <n>
```

### Test 2: Multiple Parts in Sequence

**Objective:** Verify ordering and lead time calculations with multiple parts.

**Setup:**

1. Enable `useEncoderScheduling`
2. Home all sorters
3. Reset encoder

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

1. Enable `useEncoderScheduling`
2. Home sorters to bin 1

**Test Steps:**

1. Send first part to sorter A, bin 144 (far corner)
2. Immediately send second part to same sorter A, different bin
3. Observe second part being skipped

**Expected Results:**

- [ ] First part scheduled normally
- [ ] Second part triggers skip logic
- [ ] `ENCODER_PART_SKIPPED` event emitted with reason
- [ ] Server logs: `[ENCODER_SKIP] Part <id> skipped: Sorter unavailable - cannot reach bin in time`
- [ ] No jet fired for skipped part
- [ ] Skipped part continues down conveyor (to reject bin or off end)

### Test 4: Parts Too Close Together

**Objective:** Verify handling of parts that are detected very close together.

**Setup:**

1. Enable `useEncoderScheduling`
2. Home sorters

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

- [ ] Server detects disconnect
- [ ] EncoderStatusDisplay shows "Stale" briefly
- [ ] Arduino reconnects and sends "Ready"
- [ ] Server requests encoder position after reconnect
- [ ] Encoder position resyncs (will be 0 after Arduino reset)
- [ ] Frontend shows "Live" status after recovery
- [ ] Server logs: `[ENCODER] Reconnect detected, syncing encoder state`

### Test 6: Serial Disconnect and Reconnection

**Objective:** Verify graceful handling of serial communication loss.

**Setup:**

1. System running normally

**Test Steps:**

1. Disconnect USB cable from Conveyor Arduino
2. Wait 5 seconds
3. Reconnect USB cable

**Expected Results:**

- [ ] Component status shows error/disconnected
- [ ] No system crash
- [ ] After reconnection, system reinitializes
- [ ] Encoder tracking resumes
- [ ] Pending parts in queue may be skipped (positions now stale)

### Test 7: High-Speed Throughput

**Objective:** Verify system handles maximum part throughput.

**Setup:**

1. Enable `useEncoderScheduling`
2. Set conveyor to maximum safe speed
3. Home all sorters

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

## Troubleshooting

### Encoder Position Not Updating

1. Check Arduino serial connection in DeviceManager logs
2. Verify Arduino is sending `EP:<position>` messages
3. Check `ENCODER_POSITION_UPDATE` events in browser dev tools

### Calibration Values Not Saving

1. Check Firebase connection in browser console
2. Verify user ID matches between client and server
3. Check for validation errors in settings schema

### Parts Always Skipped

1. Verify `jetEncoderOffsets` are calibrated correctly
2. Check if `cameraEncoderOffset` is upstream of jet positions
3. Verify sorter travel times are reasonable
4. Check encoder velocity calculation (smoothing may be too slow)

### Jet Fires at Wrong Position

1. Re-calibrate jet positions
2. Check `jetLeadCounts` value (may need adjustment)
3. Verify encoder velocity is accurate
4. Check for serial communication latency

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
