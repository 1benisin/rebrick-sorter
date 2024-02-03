// Conveyor.ts
import { Detection } from "./sortProcessCtrl";

export class Conveyor {
  private detections: Detection[] = [];
  private velocityChanges: { timeStamp: number; velocity: number }[] = [];

  constructor(private conveyorVelocity: number) {}

  matchDetections(currentDetection: Detection, timestamp: number): void {
    // Logic to match currentDetection to previous ones in this.detections
    // based on this.conveyorVelocity and the timestamp
  }
}
