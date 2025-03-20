import { ArduinoCommands, ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import arduinoDeviceManager from './ArduinoDeviceManager';
import eventHub from './eventHub';
import { AllEvents } from '../types/socketMessage.type';
import { SortPartDto } from '../types/sortPart.dto';
import { getFormattedTime } from '../lib/utils';

interface PartSpeedRequirement {
  partId: string;
  requiredSpeed: number;
  jetPosition: number;
  initialPosition: number;
  initialTime: number;
  estimatedTimeToJet: number;
  status: 'pending' | 'active' | 'completed' | 'skipped';
}

export class ConveyorSpeedManager {
  private static instance: ConveyorSpeedManager;
  private currentSpeed: number = 0;
  private maxSpeed: number = 0;
  private partsOnConveyor: PartSpeedRequirement[] = [];
  private activePart: PartSpeedRequirement | null = null;
  private arduinoPath: string = '';

  private constructor() {
    // Setup event listeners
    eventHub.onEvent(AllEvents.PART_SORTED, this.handlePartSorted);
  }

  static getInstance(): ConveyorSpeedManager {
    if (!ConveyorSpeedManager.instance) {
      ConveyorSpeedManager.instance = new ConveyorSpeedManager();
    }
    return ConveyorSpeedManager.instance;
  }

  public init(maxSpeed: number, arduinoPath: string): void {
    this.maxSpeed = maxSpeed;
    this.currentSpeed = maxSpeed;
    this.arduinoPath = arduinoPath;
    this.partsOnConveyor = [];
    this.activePart = null;
  }

  public handleNewPart(part: SortPartDto): void {
    console.log('--- handleNewPart:', {
      partId: part.partId,
      initialTime: getFormattedTime('min', 'ms', part.initialTime),
      initialPosition: part.initialPosition,
      bin: part.bin,
      sorter: part.sorter,
    });

    // Calculate required speed for this part
    const requiredSpeed = this.calculateRequiredSpeed(part);

    // If speed is below 50% of max speed, mark as skipped
    if (requiredSpeed < this.maxSpeed * 0.5) {
      console.log('--- Part requires speed below 50% threshold, marking as skipped');
      this.partsOnConveyor.push({
        partId: part.partId,
        requiredSpeed,
        jetPosition: this.getJetPosition(part.sorter),
        initialPosition: part.initialPosition,
        initialTime: part.initialTime,
        estimatedTimeToJet: this.calculateTimeToJet(part),
        status: 'skipped',
      });
      return;
    }

    // Add part to queue
    this.partsOnConveyor.push({
      partId: part.partId,
      requiredSpeed,
      jetPosition: this.getJetPosition(part.sorter),
      initialPosition: part.initialPosition,
      initialTime: part.initialTime,
      estimatedTimeToJet: this.calculateTimeToJet(part),
      status: 'pending',
    });

    // Update conveyor speed if this is next part to reach jet
    this.updateConveyorSpeed();
  }

  private handlePartSorted = (partId: string): void => {
    // Mark part as completed
    const part = this.partsOnConveyor.find((p) => p.partId === partId);
    if (part) {
      part.status = 'completed';
    }

    // Find next part to reach jet position
    const nextPart = this.findNextPartToReachJet();

    // Update conveyor speed based on next part
    this.updateConveyorSpeed(nextPart);
  };

  private updateConveyorSpeed(nextPart?: PartSpeedRequirement): void {
    if (!nextPart) {
      nextPart = this.findNextPartToReachJet();
    }

    if (!nextPart) {
      // No parts needing speed control, return to max speed
      this.setConveyorSpeed(this.maxSpeed);
      return;
    }

    // Set speed immediately to required speed for next part
    this.setConveyorSpeed(nextPart.requiredSpeed);
  }

  private calculateRequiredSpeed(part: SortPartDto): number {
    // Calculate time until part reaches jet position
    const timeToJet = (this.getJetPosition(part.sorter) - part.initialPosition) / this.currentSpeed;

    // Calculate minimum required speed based on time to jet
    // This is a simplified calculation - you may need to adjust based on your specific requirements
    const minRequiredSpeed = (this.getJetPosition(part.sorter) - part.initialPosition) / timeToJet;

    return minRequiredSpeed;
  }

  private getJetPosition(sorter: number): number {
    // This should be implemented based on your hardware configuration
    // For now, returning a placeholder value
    return 0;
  }

  private calculateTimeToJet(part: SortPartDto): number {
    return (this.getJetPosition(part.sorter) - part.initialPosition) / this.currentSpeed;
  }

  private findNextPartToReachJet(): PartSpeedRequirement | null {
    const now = Date.now();
    return (
      this.partsOnConveyor
        .filter((part) => part.status === 'pending')
        .sort((a, b) => a.estimatedTimeToJet - b.estimatedTimeToJet)[0] || null
    );
  }

  private setConveyorSpeed(speed: number): void {
    if (speed === this.currentSpeed) return;

    console.log('--- Setting conveyor speed:', speed);
    this.currentSpeed = speed;

    const arduinoDeviceCommand: ArduinoDeviceCommand = {
      arduinoPath: this.arduinoPath,
      command: ArduinoCommands.CONVEYOR_SPEED,
      data: Math.round(speed),
    };
    arduinoDeviceManager.sendCommandToDevice(arduinoDeviceCommand);

    // Emit speed update event
    eventHub.emitEvent(AllEvents.CONVEYOR_SPEED_UPDATE, speed);
  }
}

const conveyorSpeedManager = ConveyorSpeedManager.getInstance();
export default conveyorSpeedManager;
