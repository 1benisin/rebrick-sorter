// __tests__/unit/settingsSchema.test.ts

import {
  positionCalibrationSchema,
  settingsSchema,
  travelTimeCalibrationSchema,
  TravelTimeCalibrationType,
} from '../../types/settings.type';
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
      expect(result.fallTimeInCounts).toBe(5);
      expect(result.jetLeadCounts).toBe(100);
      expect(result.sorterRestBufferInCounts).toBe(85);
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
      expect(result.fallTimeInCounts).toBe(5);
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

    it('enforces exactly 4 elements for jetEncoderOffsets tuple', () => {
      // Schema uses z.tuple() which enforces exactly 4 elements (jets A, B, C, D)
      expect(() =>
        positionCalibrationSchema.parse({
          jetEncoderOffsets: [500, 600], // Only 2 elements - should fail
        }),
      ).toThrow();

      expect(() =>
        positionCalibrationSchema.parse({
          jetEncoderOffsets: [], // Empty - should fail
        }),
      ).toThrow();

      // Exactly 4 elements should work
      const result = positionCalibrationSchema.parse({
        jetEncoderOffsets: [500, 600, 700, 800],
      });
      expect(result.jetEncoderOffsets).toEqual([500, 600, 700, 800]);
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
        sorterRestBufferInCounts: 25,
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

  describe('travelTimeCalibration nesting', () => {
    it('provides default empty array when not specified', () => {
      const result = settingsSchema.parse({});

      expect(result.travelTimeCalibration).toBeDefined();
      expect(result.travelTimeCalibration).toEqual([]);
    });

    it('preserves empty array when explicitly provided', () => {
      const result = settingsSchema.parse({
        travelTimeCalibration: [],
      });

      expect(result.travelTimeCalibration).toEqual([]);
    });

    it('preserves single valid calibration entry', () => {
      const calibration: TravelTimeCalibrationType = {
        a: 1.5,
        b: 250,
        gridDimensionAtCalibration: 12,
      };

      const result = settingsSchema.parse({
        travelTimeCalibration: [calibration],
      });

      expect(result.travelTimeCalibration).toHaveLength(1);
      expect(result.travelTimeCalibration[0]).toEqual(calibration);
    });

    it('preserves multiple calibration entries with optional calibratedAt', () => {
      const calibrations: TravelTimeCalibrationType[] = [
        { a: 1.5, b: 250, gridDimensionAtCalibration: 12 },
        { a: 2.0, b: 200, calibratedAt: '2025-01-15T10:30:00Z', gridDimensionAtCalibration: 12 },
        { a: 1.8, b: 225, calibratedAt: '2025-01-15T10:31:00Z', gridDimensionAtCalibration: 10 },
        { a: 1.2, b: 275, gridDimensionAtCalibration: 12 },
      ];

      const result = settingsSchema.parse({
        travelTimeCalibration: calibrations,
      });

      expect(result.travelTimeCalibration).toHaveLength(4);
      expect(result.travelTimeCalibration).toEqual(calibrations);
    });

    it('rejects invalid element in array (missing required field)', () => {
      expect(() =>
        settingsSchema.parse({
          travelTimeCalibration: [{ a: 1.5, gridDimensionAtCalibration: 12 }], // missing 'b'
        }),
      ).toThrow();
    });

    it('backward compatibility: missing calibration data does not break loading', () => {
      // Simulates loading existing settings that don't have travelTimeCalibration
      const existingSettings = {
        maxConveyorRPM: 100,
        positionCalibration: {
          cameraWidthInTicks: 150,
        },
        // Note: no travelTimeCalibration field
      };

      const result = settingsSchema.parse(existingSettings);

      expect(result.travelTimeCalibration).toBeDefined();
      expect(result.travelTimeCalibration).toEqual([]);
      // Verify other fields are still parsed correctly
      expect(result.maxConveyorRPM).toBe(100);
      expect(result.positionCalibration.cameraWidthInTicks).toBe(150);
    });

    it('accepts null elements in array (sparse calibration data)', () => {
      // This supports partial calibration where some sorters succeed and others fail
      const calibrations: (TravelTimeCalibrationType | null)[] = [
        { a: 1.5, b: 250, gridDimensionAtCalibration: 12 },
        null, // Sorter 1 failed calibration
        { a: 1.8, b: 225, gridDimensionAtCalibration: 10 },
        null, // Sorter 3 has no calibration
      ];

      const result = settingsSchema.parse({
        travelTimeCalibration: calibrations,
      });

      expect(result.travelTimeCalibration).toHaveLength(4);
      expect(result.travelTimeCalibration[0]).toEqual({ a: 1.5, b: 250, gridDimensionAtCalibration: 12 });
      expect(result.travelTimeCalibration[1]).toBeNull();
      expect(result.travelTimeCalibration[2]).toEqual({ a: 1.8, b: 225, gridDimensionAtCalibration: 10 });
      expect(result.travelTimeCalibration[3]).toBeNull();
    });

    it('preserves index mapping with null elements for sorter identification', () => {
      // Verifies that null elements don't shift indices (important for sorter mapping)
      const calibrations: (TravelTimeCalibrationType | null)[] = [
        null,
        { a: 2.0, b: 200, calibratedAt: '2025-01-15T10:30:00Z', gridDimensionAtCalibration: 12 },
        null,
        { a: 1.2, b: 275, gridDimensionAtCalibration: 12 },
      ];

      const result = settingsSchema.parse({
        travelTimeCalibration: calibrations,
      });

      // Index 1 should have sorter 1's calibration
      expect(result.travelTimeCalibration[1]).toEqual({
        a: 2.0,
        b: 200,
        calibratedAt: '2025-01-15T10:30:00Z',
        gridDimensionAtCalibration: 12,
      });
      // Index 3 should have sorter 3's calibration
      expect(result.travelTimeCalibration[3]).toEqual({
        a: 1.2,
        b: 275,
        gridDimensionAtCalibration: 12,
      });
    });
  });
});

describe('travelTimeCalibrationSchema', () => {
  describe('valid inputs', () => {
    it('parses minimal valid object with required fields', () => {
      const result = travelTimeCalibrationSchema.parse({
        a: 1.5,
        b: 250,
        gridDimensionAtCalibration: 12,
      });

      expect(result.a).toBe(1.5);
      expect(result.b).toBe(250);
      expect(result.gridDimensionAtCalibration).toBe(12);
      expect(result.calibratedAt).toBeUndefined();
    });

    it('parses full object including optional calibratedAt', () => {
      const timestamp = '2025-01-15T10:30:00Z';
      const result = travelTimeCalibrationSchema.parse({
        a: -4.53,
        b: 250.5,
        calibratedAt: timestamp,
        gridDimensionAtCalibration: 12,
      });

      expect(result.a).toBe(-4.53);
      expect(result.b).toBe(250.5);
      expect(result.calibratedAt).toBe(timestamp);
      expect(result.gridDimensionAtCalibration).toBe(12);
    });

    it('accepts negative coefficients', () => {
      const result = travelTimeCalibrationSchema.parse({
        a: -10,
        b: -50,
        gridDimensionAtCalibration: 8,
      });

      expect(result.a).toBe(-10);
      expect(result.b).toBe(-50);
    });

    it('accepts zero coefficients', () => {
      const result = travelTimeCalibrationSchema.parse({
        a: 0,
        b: 0,
        gridDimensionAtCalibration: 12,
      });

      expect(result.a).toBe(0);
      expect(result.b).toBe(0);
    });

    it('accepts floating point coefficients', () => {
      const result = travelTimeCalibrationSchema.parse({
        a: 1.23456789,
        b: 987.654321,
        gridDimensionAtCalibration: 12,
      });

      expect(result.a).toBe(1.23456789);
      expect(result.b).toBe(987.654321);
    });
  });

  describe('invalid inputs', () => {
    it('rejects missing required field: a', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          b: 250,
          gridDimensionAtCalibration: 12,
        }),
      ).toThrow();
    });

    it('rejects missing required field: b', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          a: 1.5,
          gridDimensionAtCalibration: 12,
        }),
      ).toThrow();
    });

    it('rejects missing required field: gridDimensionAtCalibration', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          a: 1.5,
          b: 250,
        }),
      ).toThrow();
    });

    it('rejects wrong type for a (string)', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          a: '1.5',
          b: 250,
          gridDimensionAtCalibration: 12,
        }),
      ).toThrow();
    });

    it('rejects wrong type for b (string)', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          a: 1.5,
          b: '250',
          gridDimensionAtCalibration: 12,
        }),
      ).toThrow();
    });

    it('rejects wrong type for gridDimensionAtCalibration (string)', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          a: 1.5,
          b: 250,
          gridDimensionAtCalibration: '12',
        }),
      ).toThrow();
    });

    it('rejects null values', () => {
      expect(() =>
        travelTimeCalibrationSchema.parse({
          a: null,
          b: 250,
          gridDimensionAtCalibration: 12,
        }),
      ).toThrow();
    });

    it('rejects empty object', () => {
      expect(() => travelTimeCalibrationSchema.parse({})).toThrow();
    });
  });
});
