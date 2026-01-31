// __tests__/unit/PositionTranslator.test.ts

import { PositionTranslator } from '../../server/components/PositionTranslator';
import {
  createMockSettingsManager,
  createNullSettingsManager,
  defaultPositionCalibration,
  uncalibratedPositionCalibration,
} from '../mocks/mockSettingsManager';
import { createMockConveyorManager, createUninitializedConveyorManager } from '../mocks/mockConveyorManager';

describe('PositionTranslator', () => {
  describe('calculateJetTriggerEncoder', () => {
    describe('basic calculation', () => {
      it('calculates correct trigger for part at left edge (pixel 0)', () => {
        // Part at left edge needs full distance to jet
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // With cameraWidthInTicks=150, cameraWidthPixels=1280, jet0=500
        // At pixel 0: partTicksFromLeftEdge = 0
        // remainingTicks = 500 - 0 = 500
        // trigger = 1000 (encoder at detection) + 500 = 1500
        const trigger = translator.calculateJetTriggerEncoder(0, 1000, 0, 1280);

        expect(trigger).toBe(1500);
      });

      it('calculates correct trigger for part at center (pixel 640)', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // At pixel 640 (center of 1280px): partTicksFromLeftEdge = (640/1280) * 150 = 75
        // remainingTicks = 500 - 75 = 425
        // trigger = 1000 + 425 = 1425
        const trigger = translator.calculateJetTriggerEncoder(640, 1000, 0, 1280);

        expect(trigger).toBe(1425);
      });

      it('calculates correct trigger for part at right edge (pixel 1280)', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // At pixel 1280: partTicksFromLeftEdge = (1280/1280) * 150 = 150
        // remainingTicks = 500 - 150 = 350
        // trigger = 1000 + 350 = 1350
        const trigger = translator.calculateJetTriggerEncoder(1280, 1000, 0, 1280);

        expect(trigger).toBe(1350);
      });

      it('uses different jet offsets for different sorters', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Same position, different jets (offsets: [500, 600, 700, 800])
        const trigger0 = translator.calculateJetTriggerEncoder(0, 1000, 0, 1280);
        const trigger1 = translator.calculateJetTriggerEncoder(0, 1000, 1, 1280);
        const trigger2 = translator.calculateJetTriggerEncoder(0, 1000, 2, 1280);
        const trigger3 = translator.calculateJetTriggerEncoder(0, 1000, 3, 1280);

        expect(trigger0).toBe(1500); // 1000 + 500
        expect(trigger1).toBe(1600); // 1000 + 600
        expect(trigger2).toBe(1700); // 1000 + 700
        expect(trigger3).toBe(1800); // 1000 + 800
      });

      it('returns rounded integer values', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Use a pixel value that would create a non-integer result
        // pixelX = 100: partTicks = (100/1280) * 150 = 11.71875
        const trigger = translator.calculateJetTriggerEncoder(100, 1000, 0, 1280);

        expect(Number.isInteger(trigger)).toBe(true);
      });

      it('uses encoder position at detection time correctly', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Different encoder positions at detection
        const trigger1 = translator.calculateJetTriggerEncoder(0, 0, 0, 1280);
        const trigger2 = translator.calculateJetTriggerEncoder(0, 5000, 0, 1280);

        expect(trigger1).toBe(500); // 0 + 500
        expect(trigger2).toBe(5500); // 5000 + 500
      });
    });

    describe('edge cases', () => {
      it('clamps negative pixelX to 0', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Negative pixel should be treated as 0
        const trigger = translator.calculateJetTriggerEncoder(-100, 1000, 0, 1280);

        // Should equal result for pixel 0
        const triggerAt0 = translator.calculateJetTriggerEncoder(0, 1000, 0, 1280);
        expect(trigger).toBe(triggerAt0);
      });

      it('clamps pixelX exceeding camera width', () => {
        const mockSettings = createMockSettingsManager();
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Pixel beyond camera width should be clamped
        const trigger = translator.calculateJetTriggerEncoder(2000, 1000, 0, 1280);

        // Should equal result for pixel 1280
        const triggerAtMax = translator.calculateJetTriggerEncoder(1280, 1000, 0, 1280);
        expect(trigger).toBe(triggerAtMax);
      });

      it('handles part already past jet (negative remaining ticks)', () => {
        // Create settings where jet is very close to camera
        const mockSettings = createMockSettingsManager({
          cameraWidthInTicks: 150,
          jetEncoderOffsets: [50, 600, 700, 800], // Jet 0 is only 50 ticks from left edge
        });
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Part at pixel 1280: partTicksFromLeftEdge = 150
        // remainingTicks = 50 - 150 = -100
        // trigger = 1000 + (-100) = 900
        const trigger = translator.calculateJetTriggerEncoder(1280, 1000, 0, 1280);

        expect(trigger).toBe(900); // Still returns valid position
      });

      it('uses fallback when cameraWidthInTicks is 0 (uncalibrated)', () => {
        const mockSettings = createMockSettingsManager({
          cameraWidthInTicks: 0, // Uncalibrated
          jetEncoderOffsets: [500, 600, 700, 800],
        });
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Should fall back to: encoderAtDetection + jetOffset
        const trigger = translator.calculateJetTriggerEncoder(640, 1000, 0, 1280);

        // Fallback: 1000 + 500 = 1500
        expect(trigger).toBe(1500);
      });

      it('uses fallback when cameraWidthPixels is 0', () => {
        const mockSettings = createMockSettingsManager({
          cameraWidthPixels: 0, // Invalid
        });
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Should fall back when effective camera width pixels is invalid
        const trigger = translator.calculateJetTriggerEncoder(640, 1000, 0, 0);

        // Fallback: 1000 + 500 = 1500
        expect(trigger).toBe(1500);
      });

      it('uses provided cameraWidthPixels over calibration value', () => {
        const mockSettings = createMockSettingsManager({
          cameraWidthPixels: 1280, // Default in calibration
        });
        const mockConveyor = createMockConveyorManager();
        const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

        // Provide 1920px camera - should use this value
        // At pixel 960 (center of 1920): partTicks = (960/1920) * 150 = 75
        // Same result as pixel 640 in 1280px camera
        const triggerWith1920 = translator.calculateJetTriggerEncoder(960, 1000, 0, 1920);
        const triggerWith1280 = translator.calculateJetTriggerEncoder(640, 1000, 0, 1280);

        expect(triggerWith1920).toBe(triggerWith1280);
      });
    });
  });

  describe('isCalibrated', () => {
    it('returns true when all calibration values are valid', () => {
      const mockSettings = createMockSettingsManager();
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.isCalibrated()).toBe(true);
    });

    it('returns false when cameraWidthInTicks is 0', () => {
      const mockSettings = createMockSettingsManager({
        cameraWidthInTicks: 0,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.isCalibrated()).toBe(false);
    });

    it('returns false when cameraWidthPixels is 0', () => {
      const mockSettings = createMockSettingsManager({
        cameraWidthPixels: 0,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.isCalibrated()).toBe(false);
    });

    it('returns false when any jetEncoderOffset is 0', () => {
      const mockSettings = createMockSettingsManager({
        jetEncoderOffsets: [500, 0, 700, 800], // One zero
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.isCalibrated()).toBe(false);
    });

    it('returns false when jetEncoderOffsets has missing values', () => {
      const mockSettings = createMockSettingsManager({
        jetEncoderOffsets: [500, 600, 0, 0] as [number, number, number, number], // Missing last 2 jets
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.isCalibrated()).toBe(false);
    });

    it('returns false for completely uncalibrated settings', () => {
      const mockSettings = createMockSettingsManager(uncalibratedPositionCalibration);
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.isCalibrated()).toBe(false);
    });
  });

  describe('getCalibration', () => {
    it('returns calibration from settings manager', () => {
      const mockSettings = createMockSettingsManager();
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      const calibration = translator.getCalibration();

      expect(calibration.cameraWidthInTicks).toBe(150);
      expect(calibration.cameraWidthPixels).toBe(1280);
      expect(calibration.jetEncoderOffsets).toEqual([500, 600, 700, 800]);
    });

    it('returns defaults when settings are null', () => {
      const mockSettings = createNullSettingsManager();
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      const calibration = translator.getCalibration();

      // Should return default values
      expect(calibration.cameraWidthInTicks).toBe(0);
      expect(calibration.cameraWidthPixels).toBe(1280);
      expect(calibration.jetEncoderOffsets).toEqual([1000, 1000, 1000, 1000]);
    });
  });

  describe('calculateRequiredByPosition', () => {
    it('subtracts fallTimeInCounts from jetPosition', () => {
      const mockSettings = createMockSettingsManager({
        fallTimeInCounts: 24,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      const requiredBy = translator.calculateRequiredByPosition(1000);

      expect(requiredBy).toBe(976); // 1000 - 24
    });

    it('handles different fallTimeInCounts values', () => {
      const mockSettings = createMockSettingsManager({
        fallTimeInCounts: 50,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      const requiredBy = translator.calculateRequiredByPosition(1000);

      expect(requiredBy).toBe(950); // 1000 - 50
    });
  });

  describe('getJetLeadCounts', () => {
    it('returns jetLeadCounts from calibration', () => {
      const mockSettings = createMockSettingsManager({
        jetLeadCounts: 100,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.getJetLeadCounts()).toBe(100);
    });

    it('returns different values when configured', () => {
      const mockSettings = createMockSettingsManager({
        jetLeadCounts: 200,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.getJetLeadCounts()).toBe(200);
    });
  });

  describe('getFallTimeInCounts', () => {
    it('returns fallTimeInCounts from calibration', () => {
      const mockSettings = createMockSettingsManager({
        fallTimeInCounts: 24,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.getFallTimeInCounts()).toBe(24);
    });

    it('returns different values when configured', () => {
      const mockSettings = createMockSettingsManager({
        fallTimeInCounts: 30,
      });
      const mockConveyor = createMockConveyorManager();
      const translator = new PositionTranslator(mockConveyor as any, mockSettings as any);

      expect(translator.getFallTimeInCounts()).toBe(30);
    });
  });

});
