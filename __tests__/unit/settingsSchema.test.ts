// __tests__/unit/settingsSchema.test.ts

import { positionCalibrationSchema, settingsSchema } from '../../types/settings.type';
import { z } from 'zod';

describe('positionCalibrationSchema', () => {
  describe('defaults', () => {
    it('provides correct defaults for empty input', () => {
      const result = positionCalibrationSchema.parse({});

      expect(result.cameraEncoderOffset).toBe(0);
      expect(result.countsPerPixel).toBe(1);
      expect(result.cameraWidthInTicks).toBe(0);
      expect(result.cameraWidthPixels).toBe(1280);
      expect(result.jetEncoderOffsets).toEqual([0, 0, 0, 0]);
      expect(result.fallTimeInCounts).toBe(24);
      expect(result.jetLeadCounts).toBe(100);
    });

    it('preserves provided values while filling defaults for missing', () => {
      const result = positionCalibrationSchema.parse({
        cameraWidthInTicks: 150,
        jetEncoderOffsets: [500, 600, 700, 800],
      });

      expect(result.cameraWidthInTicks).toBe(150);
      expect(result.jetEncoderOffsets).toEqual([500, 600, 700, 800]);
      // Defaults for unprovided fields
      expect(result.cameraWidthPixels).toBe(1280);
      expect(result.fallTimeInCounts).toBe(24);
    });
  });

  describe('coercion', () => {
    it('coerces string numbers to numbers', () => {
      const result = positionCalibrationSchema.parse({
        cameraWidthInTicks: '150',
        cameraWidthPixels: '1920',
        fallTimeInCounts: '30',
        jetLeadCounts: '200',
      });

      expect(result.cameraWidthInTicks).toBe(150);
      expect(result.cameraWidthPixels).toBe(1920);
      expect(result.fallTimeInCounts).toBe(30);
      expect(result.jetLeadCounts).toBe(200);
    });

    it('coerces array string values to numbers', () => {
      const result = positionCalibrationSchema.parse({
        jetEncoderOffsets: ['500', '600', '700', '800'],
      });

      expect(result.jetEncoderOffsets).toEqual([500, 600, 700, 800]);
      // Verify types are numbers, not strings
      expect(typeof result.jetEncoderOffsets[0]).toBe('number');
    });

    it('coerces floating point strings', () => {
      const result = positionCalibrationSchema.parse({
        countsPerPixel: '1.5',
      });

      expect(result.countsPerPixel).toBe(1.5);
    });
  });

  describe('validation', () => {
    it('accepts valid complete calibration', () => {
      const validCalibration = {
        cameraEncoderOffset: 0,
        countsPerPixel: 1.2,
        cameraWidthInTicks: 150,
        cameraWidthPixels: 1280,
        jetEncoderOffsets: [500, 600, 700, 800],
        fallTimeInCounts: 24,
        jetLeadCounts: 100,
      };

      expect(() => positionCalibrationSchema.parse(validCalibration)).not.toThrow();
    });

    it('accepts cameraWidthInTicks > 0 for calibrated sorting', () => {
      const result = positionCalibrationSchema.parse({
        cameraWidthInTicks: 150,
        cameraWidthPixels: 1280,
      });
      expect(result.cameraWidthInTicks).toBe(150);
    });

    it('accepts negative values for cameraEncoderOffset', () => {
      // This is valid - can be negative depending on camera position
      const result = positionCalibrationSchema.parse({
        cameraEncoderOffset: -100,
      });

      expect(result.cameraEncoderOffset).toBe(-100);
    });

    it('accepts arrays of any length for jetEncoderOffsets', () => {
      // Note: Schema doesn't enforce array length - that's business logic in isCalibrated()
      const result = positionCalibrationSchema.parse({
        jetEncoderOffsets: [500, 600],
      });

      expect(result.jetEncoderOffsets).toEqual([500, 600]);
    });

    it('accepts empty array for jetEncoderOffsets (uncalibrated)', () => {
      const result = positionCalibrationSchema.parse({
        jetEncoderOffsets: [],
      });

      expect(result.jetEncoderOffsets).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles zero values', () => {
      const result = positionCalibrationSchema.parse({
        cameraWidthInTicks: 0,
        cameraWidthPixels: 0,
        fallTimeInCounts: 0,
        jetLeadCounts: 0,
      });

      expect(result.cameraWidthInTicks).toBe(0);
      expect(result.cameraWidthPixels).toBe(0);
      expect(result.fallTimeInCounts).toBe(0);
      expect(result.jetLeadCounts).toBe(0);
    });

    it('handles large encoder values', () => {
      const result = positionCalibrationSchema.parse({
        cameraWidthInTicks: 10000,
        jetEncoderOffsets: [50000, 60000, 70000, 80000],
      });

      expect(result.cameraWidthInTicks).toBe(10000);
      expect(result.jetEncoderOffsets).toEqual([50000, 60000, 70000, 80000]);
    });

    it('handles negative jet offsets (edge case)', () => {
      // While unusual, schema allows negative values
      const result = positionCalibrationSchema.parse({
        jetEncoderOffsets: [-100, 600, 700, 800],
      });

      expect(result.jetEncoderOffsets[0]).toBe(-100);
    });
  });
});

describe('settingsSchema', () => {
  describe('positionCalibration nesting', () => {
    it('provides default positionCalibration when not specified', () => {
      const result = settingsSchema.parse({});

      expect(result.positionCalibration).toBeDefined();
      expect(result.positionCalibration.cameraWidthInTicks).toBe(0);
      expect(result.positionCalibration.jetEncoderOffsets).toEqual([0, 0, 0, 0]);
    });

    it('merges partial positionCalibration with defaults', () => {
      const result = settingsSchema.parse({
        positionCalibration: {
          cameraWidthInTicks: 150,
        },
      });

      expect(result.positionCalibration.cameraWidthInTicks).toBe(150);
      expect(result.positionCalibration.cameraWidthPixels).toBe(1280); // default
    });

    it('preserves full positionCalibration when provided', () => {
      const calibration = {
        cameraEncoderOffset: 10,
        countsPerPixel: 1.5,
        cameraWidthInTicks: 200,
        cameraWidthPixels: 1920,
        jetEncoderOffsets: [400, 500, 600, 700],
        fallTimeInCounts: 30,
        jetLeadCounts: 150,
      };

      const result = settingsSchema.parse({
        positionCalibration: calibration,
      });

      expect(result.positionCalibration).toEqual(calibration);
    });
  });

  describe('conveyor settings', () => {
    it('provides correct conveyor defaults', () => {
      const result = settingsSchema.parse({});

      expect(result.maxConveyorRPM).toBe(100);
      expect(result.conveyorPulsesPerRevolution).toBe(20);
      expect(result.conveyorKp).toBe(1.0);
      expect(result.conveyorKi).toBe(0.15);
      expect(result.conveyorKd).toBe(0.0);
    });

    it('validates maxConveyorRPM is non-negative', () => {
      expect(() =>
        settingsSchema.parse({
          maxConveyorRPM: -1,
        }),
      ).toThrow();
    });
  });
});
