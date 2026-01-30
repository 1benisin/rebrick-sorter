// __tests__/unit/socketMessageTypes.test.ts

/**
 * Socket message type safety tests.
 *
 * These tests serve two purposes:
 * 1. Runtime verification that event payloads have expected properties
 * 2. Compile-time verification that TypeScript types are correct
 *
 * If these tests compile successfully, the types are correctly defined.
 * If they fail at runtime, the test implementations match the type definitions.
 */

import { EventPayloads, FrontToBackEvents, BackToFrontEvents, AllEvents } from '../../types/socketMessage.type';

describe('Socket message type safety', () => {
  describe('FrontToBackEvents - Calibration Events', () => {
    it('RESET_ENCODER event is void payload', () => {
      // RESET_ENCODER takes no payload
      const eventName = FrontToBackEvents.RESET_ENCODER;
      expect(eventName).toBe('reset-encoder');

      // Type check: EventPayloads[RESET_ENCODER] is void
      // This is a compile-time check - if it compiles, the type is correct
      const payload: EventPayloads[FrontToBackEvents.RESET_ENCODER] = undefined as void;
      expect(payload).toBeUndefined();
    });

    it('RECORD_CAMERA_WIDTH payload has correct shape', () => {
      const payload: EventPayloads[FrontToBackEvents.RECORD_CAMERA_WIDTH] = {
        widthInTicks: 150,
        cameraWidthPixels: 1280, // optional field
      };

      expect(payload.widthInTicks).toBe(150);
      expect(payload.cameraWidthPixels).toBe(1280);
    });

    it('RECORD_CAMERA_WIDTH allows optional cameraWidthPixels', () => {
      // cameraWidthPixels is optional
      const payload: EventPayloads[FrontToBackEvents.RECORD_CAMERA_WIDTH] = {
        widthInTicks: 150,
      };

      expect(payload.widthInTicks).toBe(150);
      expect(payload.cameraWidthPixels).toBeUndefined();
    });

    it('RECORD_JET_POSITION payload has correct shape', () => {
      const payload: EventPayloads[FrontToBackEvents.RECORD_JET_POSITION] = {
        sorter: 0,
        offsetFromLeftEdge: 500,
      };

      expect(payload.sorter).toBe(0);
      expect(payload.offsetFromLeftEdge).toBe(500);
    });

    it('RECORD_JET_POSITION requires both fields', () => {
      const payload: EventPayloads[FrontToBackEvents.RECORD_JET_POSITION] = {
        sorter: 3,
        offsetFromLeftEdge: 800,
      };

      // Both fields must be present
      expect(payload.sorter).toBeDefined();
      expect(payload.offsetFromLeftEdge).toBeDefined();
    });

    it('RECORD_CAMERA_POSITION event is void (deprecated)', () => {
      const eventName = FrontToBackEvents.RECORD_CAMERA_POSITION;
      expect(eventName).toBe('record-camera-position');

      // Deprecated event - still void payload for backward compatibility
      const payload: EventPayloads[FrontToBackEvents.RECORD_CAMERA_POSITION] = undefined as void;
      expect(payload).toBeUndefined();
    });
  });

  describe('BackToFrontEvents - Calibration Response Events', () => {
    it('ENCODER_RESET_COMPLETE payload has correct shape', () => {
      const payload: EventPayloads[BackToFrontEvents.ENCODER_RESET_COMPLETE] = {
        success: true,
        position: 0,
      };

      expect(payload.success).toBe(true);
      expect(payload.position).toBe(0);
    });

    it('ENCODER_RESET_COMPLETE can indicate failure', () => {
      const payload: EventPayloads[BackToFrontEvents.ENCODER_RESET_COMPLETE] = {
        success: false,
        position: -1,
      };

      expect(payload.success).toBe(false);
      expect(payload.position).toBe(-1);
    });

    it('CALIBRATION_POINT_RECORDED accepts camera type', () => {
      const payload: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED] = {
        type: 'camera',
        position: 1000,
        success: true,
      };

      expect(payload.type).toBe('camera');
      expect(payload.sorter).toBeUndefined();
    });

    it('CALIBRATION_POINT_RECORDED accepts cameraWidth type', () => {
      const payload: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED] = {
        type: 'cameraWidth',
        position: 150,
        success: true,
      };

      expect(payload.type).toBe('cameraWidth');
    });

    it('CALIBRATION_POINT_RECORDED accepts jet type with sorter', () => {
      const payload: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED] = {
        type: 'jet',
        position: 500,
        sorter: 0,
        success: true,
      };

      expect(payload.type).toBe('jet');
      expect(payload.sorter).toBe(0);
    });

    it('CALIBRATION_POINT_RECORDED sorter is optional', () => {
      // sorter is only required for jet type, optional otherwise
      const cameraPayload: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED] = {
        type: 'camera',
        position: 1000,
        success: true,
      };

      expect(cameraPayload.sorter).toBeUndefined();
    });

    it('CALIBRATION_POINT_RECORDED can indicate failure', () => {
      const payload: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED] = {
        type: 'jet',
        position: 0,
        sorter: 2,
        success: false,
      };

      expect(payload.success).toBe(false);
    });
  });

  describe('AllEvents combined enum', () => {
    it('includes all FrontToBackEvents', () => {
      expect(AllEvents.RESET_ENCODER).toBe(FrontToBackEvents.RESET_ENCODER);
      expect(AllEvents.RECORD_CAMERA_WIDTH).toBe(FrontToBackEvents.RECORD_CAMERA_WIDTH);
      expect(AllEvents.RECORD_JET_POSITION).toBe(FrontToBackEvents.RECORD_JET_POSITION);
      expect(AllEvents.RECORD_CAMERA_POSITION).toBe(FrontToBackEvents.RECORD_CAMERA_POSITION);
    });

    it('includes all BackToFrontEvents', () => {
      expect(AllEvents.ENCODER_RESET_COMPLETE).toBe(BackToFrontEvents.ENCODER_RESET_COMPLETE);
      expect(AllEvents.CALIBRATION_POINT_RECORDED).toBe(BackToFrontEvents.CALIBRATION_POINT_RECORDED);
      expect(AllEvents.ENCODER_POSITION_UPDATE).toBe(BackToFrontEvents.ENCODER_POSITION_UPDATE);
    });
  });

  describe('Event name strings', () => {
    it('RESET_ENCODER has correct string value', () => {
      expect(FrontToBackEvents.RESET_ENCODER).toBe('reset-encoder');
    });

    it('RECORD_CAMERA_WIDTH has correct string value', () => {
      expect(FrontToBackEvents.RECORD_CAMERA_WIDTH).toBe('record-camera-width');
    });

    it('RECORD_JET_POSITION has correct string value', () => {
      expect(FrontToBackEvents.RECORD_JET_POSITION).toBe('record-jet-position');
    });

    it('ENCODER_RESET_COMPLETE has correct string value', () => {
      expect(BackToFrontEvents.ENCODER_RESET_COMPLETE).toBe('encoder-reset-complete');
    });

    it('CALIBRATION_POINT_RECORDED has correct string value', () => {
      expect(BackToFrontEvents.CALIBRATION_POINT_RECORDED).toBe('calibration-point-recorded');
    });
  });

  describe('Encoder position events', () => {
    it('ENCODER_POSITION_UPDATE payload has correct shape', () => {
      const payload: EventPayloads[BackToFrontEvents.ENCODER_POSITION_UPDATE] = {
        position: 12345,
        timestamp: Date.now(),
        velocity: 0.5,
      };

      expect(payload.position).toBeDefined();
      expect(payload.timestamp).toBeDefined();
      expect(payload.velocity).toBeDefined();
    });

    it('BUFFER_STATUS_UPDATE payload has correct shape', () => {
      const payload: EventPayloads[BackToFrontEvents.BUFFER_STATUS_UPDATE] = {
        count: 5,
        capacity: 16,
      };

      expect(payload.count).toBe(5);
      expect(payload.capacity).toBe(16);
    });
  });

  describe('Encoder part scheduling events', () => {
    it('ENCODER_PART_SCHEDULED payload has correct shape', () => {
      const payload: EventPayloads[BackToFrontEvents.ENCODER_PART_SCHEDULED] = {
        partId: 'part-123',
        jetPosition: 1500,
        moveTriggerPosition: 1400,
        sorter: 0,
        bin: 5,
      };

      expect(payload.partId).toBe('part-123');
      expect(payload.jetPosition).toBe(1500);
      expect(payload.moveTriggerPosition).toBe(1400);
      expect(payload.sorter).toBe(0);
      expect(payload.bin).toBe(5);
    });

    it('ENCODER_PART_SORTED payload has correct shape', () => {
      const payload: EventPayloads[BackToFrontEvents.ENCODER_PART_SORTED] = {
        partId: 'part-123',
        jetPosition: 1500,
        sorter: 0,
        bin: 5,
      };

      expect(payload.partId).toBeDefined();
      expect(payload.jetPosition).toBeDefined();
    });

    it('ENCODER_PART_SKIPPED payload has correct shape', () => {
      const payload: EventPayloads[BackToFrontEvents.ENCODER_PART_SKIPPED] = {
        partId: 'part-123',
        reason: 'Sorter unavailable',
        sorter: 0,
        bin: 5,
      };

      expect(payload.partId).toBeDefined();
      expect(payload.reason).toBeDefined();
    });
  });
});
