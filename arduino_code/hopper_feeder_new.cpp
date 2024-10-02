#include <Wire.h>
#include "FastAccelStepper.h"

#define AUTO_DISABLE true

#define FEEDER_DEBUG false
#define HOPPER_DEBUG false

#define ENABLE_PIN 6
#define DIR_PIN 5
#define STEP_PIN 9

#define STOP_PIN 10

// Feeder Variables
#define FEEDER_ENABLE_PIN 11
#define FEEDER_MOTOR_PIN1 8
#define FEEDER_MOTOR_PIN2 7

unsigned short lenth_val = 0;
unsigned char i2c_rx_buf[16];
unsigned char depthSensorAddress = 80;

struct DeviceSettings {
  int hopperStepsPerAction;
  unsigned long hopperActionInterval;
  int motorSpeed;
  int ACCELERATION;
  int SPEED;
};

DeviceSettings settings;
bool settingsInitialized = false;

// Hopper Variables
bool positionReset = false;
bool movingUp = false;
unsigned long prevHopperTime = 0;
const long hopperWaitTime = 10;

// Feeder Variables
unsigned long previousMillis = 0;
const long delayStoppingInterval = 5;
const long pauseInterval = 1000;
const long shortMoveInterval = 250;
unsigned long totalFeederRunTime = 0;
unsigned long feederStartTime = 0;

FastAccelStepperEngine engine = FastAccelStepperEngine();
FastAccelStepper *stepper = NULL;

void setup() {
  Wire.begin(); 
  Serial.begin(9600,SERIAL_8N1);

  pinMode(FEEDER_ENABLE_PIN, OUTPUT);
  pinMode(FEEDER_MOTOR_PIN1, OUTPUT);
  pinMode(FEEDER_MOTOR_PIN2, OUTPUT);

  startMotor();

  pinMode(STOP_PIN, INPUT);  

  engine.init();
  stepper = engine.stepperConnectToPin(STEP_PIN);

  if (stepper) {
    stepper->setDirectionPin(DIR_PIN, true, 2000);
    if (AUTO_DISABLE) {
      stepper->setEnablePin(ENABLE_PIN, true);
      stepper->setAutoEnable(true);
    }
  }

  print("Ready");
}

void startMotor() {
  digitalWrite(FEEDER_MOTOR_PIN1, LOW);
  digitalWrite(FEEDER_MOTOR_PIN2, HIGH);
}

void stopMotor() {
  digitalWrite(FEEDER_MOTOR_PIN1, LOW);
  digitalWrite(FEEDER_MOTOR_PIN2, LOW);
  analogWrite(FEEDER_ENABLE_PIN, 0);
}

void processSettings(char *message) {
  // Expected format: 's,<hopperStepsPerAction>,<hopperActionInterval>,<motorSpeed>,<ACCELERATION>,<SPEED>'
  char *token;
  int values[5];
  int valueIndex = 0;

  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 5) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 5) {
    settings.hopperStepsPerAction = values[0];
    settings.hopperActionInterval = (unsigned long) values[1];
    settings.motorSpeed = values[2];
    settings.ACCELERATION = values[3];
    settings.SPEED = values[4];

    if (stepper) {
      stepper->setAcceleration(settings.ACCELERATION);
      stepper->setSpeedInUs(settings.SPEED);
    }

    settingsInitialized = true;
    print("Settings updated");
  } else {
    print("Error: Not enough settings provided");
  }
}

enum class FeederState : uint8_t {
  start_moving,
  moving,
  part_detected,
  paused,
  short_move
};

FeederState currFeederState = FeederState::start_moving;

void checkFeeder() {
  unsigned long currentMillis = millis();

  switch (currFeederState) {
    case FeederState::start_moving: {
      if (FEEDER_DEBUG) Serial.println("moving");
      startMotor(); 
      analogWrite(FEEDER_ENABLE_PIN, settings.motorSpeed);
      feederStartTime = currentMillis;
      currFeederState = FeederState::moving;
      break;
    }

    case FeederState::moving: 
      if (FEEDER_DEBUG) Serial.println("still moving");
      if (ReadDistance(depthSensorAddress) < 50) {
        if (FEEDER_DEBUG) Serial.println("part_detected");
        currFeederState = FeederState::part_detected;
        previousMillis = currentMillis;
      }
      break;
    
    case FeederState::part_detected:
      if (currentMillis - previousMillis >= delayStoppingInterval) {
        if (FEEDER_DEBUG) Serial.println("paused");
        stopMotor();
        totalFeederRunTime += currentMillis - feederStartTime;
        currFeederState = FeederState::paused;
        previousMillis = currentMillis;
      }
      break;

    case FeederState::paused:
      if (currentMillis - previousMillis >= pauseInterval) {
        if (ReadDistance(depthSensorAddress) < 50) { 
          if (FEEDER_DEBUG) Serial.println("short_move");
          startMotor(); 
          analogWrite(FEEDER_ENABLE_PIN, settings.motorSpeed);
          feederStartTime = currentMillis;
          currFeederState = FeederState::short_move;
          previousMillis = currentMillis;
        } else {
          if (FEEDER_DEBUG) Serial.println("start_moving");
          currFeederState = FeederState::start_moving;
        }
      }
      break;

    case FeederState::short_move:
      if (currentMillis - previousMillis >= shortMoveInterval) {
        if (FEEDER_DEBUG) Serial.println("paused");
        stopMotor();
        totalFeederRunTime += currentMillis - feederStartTime;
        currFeederState = FeederState::paused;
        previousMillis = currentMillis;
      }
      break;
  }
}

enum class HopperState : uint8_t {
  moving_down,
  waiting_bottom,
  moving_up,
  waiting_top,
};

HopperState currHopperState = HopperState::waiting_top;

void checkHopper() {
  unsigned long currentMillis = millis();

  switch (currHopperState) {
    case HopperState::moving_down: 
      if ( digitalRead(STOP_PIN) == LOW || !stepper->isRunning()) {
        stepper->forceStopAndNewPosition(0);
        prevHopperTime = currentMillis;      
        currHopperState = HopperState::waiting_bottom;
        if (HOPPER_DEBUG) Serial.println("waiting_bottom"); 
      }
      break;

    case HopperState::waiting_bottom:
      if (currentMillis - prevHopperTime >= hopperWaitTime) {
        stepper->move(settings.hopperStepsPerAction);
        currHopperState = HopperState::moving_up;
        if (HOPPER_DEBUG) Serial.println("moving_up");
      } 
      break;

    case HopperState::moving_up:
      if (!stepper->isRunning()) {
        currHopperState = HopperState::waiting_top;
        if (HOPPER_DEBUG) Serial.println("waiting_top"); 
      } 
      break;

    case HopperState::waiting_top: 
      unsigned long currVibrationExceedsInterval = currentMillis - feederStartTime >= settings.hopperActionInterval;
      if (totalFeederRunTime >= settings.hopperActionInterval || currVibrationExceedsInterval) {
        if (currVibrationExceedsInterval) feederStartTime = currentMillis;
        totalFeederRunTime = 0;
        stepper->move(-settings.hopperStepsPerAction - 20);
        currHopperState = HopperState::moving_down;
        if (HOPPER_DEBUG) Serial.println("moving_down");
      } 
      break;

    default:
      if (HOPPER_DEBUG) Serial.print("No Hopper State");
      break;
  }
}

#define START_MARKER '<'
#define END_MARKER '>'

void loop() {
  if (!settingsInitialized) {
    processSerialMessages();
    return;
  }
  checkFeeder();
  checkHopper();
  processSerialMessages();
}

void processSerialMessages() {
  static char message[MAX_MESSAGE_LENGTH];
  static unsigned int message_pos = 0;
  static bool capturingMessage = false;
  static unsigned int checksum = 0;
  static unsigned int receivedChecksum = 0;

  while (Serial.available() > 0) {
    char inByte = Serial.read();

    if(inByte == START_MARKER) {
      capturingMessage = true;
      message_pos = 0;
      checksum = 0;
    }
    else if (inByte == END_MARKER) {
      capturingMessage = false;
      receivedChecksum = (message[message_pos - 2] - '0') * 10 + (message[message_pos - 1] - '0');
      message[message_pos - 2] = '\0';

      for (int i = 0; i < message_pos - 2; i++) {
        checksum += message[i];
      }

      if (checksum % 100 == receivedChecksum) {
        processMessage(message);
      } else {
        print("Error: Checksum does not match");
      }
    }
    else if (capturingMessage) {
      message[message_pos] = inByte;
      message_pos++;
    }
  }
}

void processMessage(char *message) {
  if (!settingsInitialized && message[0] != 's') {
    print("Settings not initialized");
    return;
  }

  switch (message[0]) {
    case 's':
      processSettings(message);
      break;

    default:
      print("No matching serial communication");
      break;
  }
}

void SensorRead(unsigned char addr, unsigned char* datbuf, unsigned int cnt, unsigned char deviceAddr) {
  Wire.beginTransmission(deviceAddr);
  Wire.write(byte(addr));
  Wire.endTransmission();
  delay(1);
  Wire.requestFrom(deviceAddr, cnt);
  if (cnt <= Wire.available()) {
    *datbuf++ = Wire.read();
    *datbuf++ = Wire.read();
  }
}
 
int ReadDistance(unsigned char device) {
  SensorRead(0x00, i2c_rx_buf, 2, device);
  lenth_val = i2c_rx_buf[0];
  lenth_val = lenth_val << 8;
  lenth_val |= i2c_rx_buf[1];
  return lenth_val;
}

void print(String a) { 
  Serial.print("Main: ");
  Serial.println(a);
}
void print(int a) { 
  Serial.print("Main: ");
  Serial.println(a);
}
void print(char *a) { 
  Serial.print("Main: ");
  Serial.println(a);
}
void print(float a) { 
  Serial.print("Main: ");
  Serial.println(a);
}
void print(bool a) { 
  Serial.print("Main: ");
  Serial.println(a);
}
