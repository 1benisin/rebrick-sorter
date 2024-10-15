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
#define FEEDER_ENABLE_PIN 11  // Ensure this pin is PWM-capable
#define FEEDER_MOTOR_PIN1 8
#define FEEDER_MOTOR_PIN2 7

#define MAX_MESSAGE_LENGTH 64  // Adjust the length as needed

unsigned short length_val = 0;  // Corrected typo from 'lenth_val' to 'length_val'
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
  Serial.begin(9600, SERIAL_8N1);

  pinMode(FEEDER_ENABLE_PIN, OUTPUT);
  pinMode(FEEDER_MOTOR_PIN1, OUTPUT);
  pinMode(FEEDER_MOTOR_PIN2, OUTPUT);

  startMotor();

  pinMode(STOP_PIN, INPUT);  

  engine.init();
  stepper = engine.stepperConnectToPin(STEP_PIN);

  if (stepper) {
    stepper->setDirectionPin(DIR_PIN, true);
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
    settings.hopperActionInterval = (unsigned long)values[1];
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

// Replace enum class with traditional enum
enum FeederState {
  FEEDER_START_MOVING,
  FEEDER_MOVING,
  FEEDER_PART_DETECTED,
  FEEDER_PAUSED,
  FEEDER_SHORT_MOVE
};

FeederState currFeederState = FEEDER_START_MOVING;

void checkFeeder() {
  unsigned long currentMillis = millis();

  switch (currFeederState) {
    case FEEDER_START_MOVING:
      {
        if (FEEDER_DEBUG) Serial.println("moving");
        startMotor(); 
        analogWrite(FEEDER_ENABLE_PIN, settings.motorSpeed);
        feederStartTime = currentMillis;
        currFeederState = FEEDER_MOVING;
        break;
      }

    case FEEDER_MOVING:
      {
        if (FEEDER_DEBUG) Serial.println("still moving");
        if (ReadDistance(depthSensorAddress) < 50) {
          if (FEEDER_DEBUG) Serial.println("part_detected");
          currFeederState = FEEDER_PART_DETECTED;
          previousMillis = currentMillis;
        }
        break;
      }

    case FEEDER_PART_DETECTED:
      {
        if (currentMillis - previousMillis >= delayStoppingInterval) {
          if (FEEDER_DEBUG) Serial.println("paused");
          stopMotor();
          totalFeederRunTime += currentMillis - feederStartTime;
          currFeederState = FEEDER_PAUSED;
          previousMillis = currentMillis;
        }
        break;
      }

    case FEEDER_PAUSED:
      {
        if (currentMillis - previousMillis >= pauseInterval) {
          if (ReadDistance(depthSensorAddress) < 50) { 
            if (FEEDER_DEBUG) Serial.println("short_move");
            startMotor(); 
            analogWrite(FEEDER_ENABLE_PIN, settings.motorSpeed);
            feederStartTime = currentMillis;
            currFeederState = FEEDER_SHORT_MOVE;
            previousMillis = currentMillis;
          } else {
            if (FEEDER_DEBUG) Serial.println("start_moving");
            currFeederState = FEEDER_START_MOVING;
          }
        }
        break;
      }

    case FEEDER_SHORT_MOVE:
      {
        if (currentMillis - previousMillis >= shortMoveInterval) {
          if (FEEDER_DEBUG) Serial.println("paused");
          stopMotor();
          totalFeederRunTime += currentMillis - feederStartTime;
          currFeederState = FEEDER_PAUSED;
          previousMillis = currentMillis;
        }
        break;
      }
  }
}

// Replace enum class with traditional enum
enum HopperState {
  HOPPER_MOVING_DOWN,
  HOPPER_WAITING_BOTTOM,
  HOPPER_MOVING_UP,
  HOPPER_WAITING_TOP
};

HopperState currHopperState = HOPPER_WAITING_TOP;

void checkHopper() {
  unsigned long currentMillis = millis();

  switch (currHopperState) {
    case HOPPER_MOVING_DOWN:
      {
        if (digitalRead(STOP_PIN) == LOW || !stepper->isRunning()) {
          stepper->forceStopAndNewPosition(0);
          prevHopperTime = currentMillis;      
          currHopperState = HOPPER_WAITING_BOTTOM;
          if (HOPPER_DEBUG) Serial.println("waiting_bottom"); 
        }
        break;
      }

    case HOPPER_WAITING_BOTTOM:
      {
        if (currentMillis - prevHopperTime >= hopperWaitTime) {
          stepper->move(settings.hopperStepsPerAction);
          currHopperState = HOPPER_MOVING_UP;
          if (HOPPER_DEBUG) Serial.println("moving_up");
        } 
        break;
      }

    case HOPPER_MOVING_UP:
      {
        if (!stepper->isRunning()) {
          currHopperState = HOPPER_WAITING_TOP;
          if (HOPPER_DEBUG) Serial.println("waiting_top"); 
        } 
        break;
      }

    case HOPPER_WAITING_TOP:
      {
        bool currVibrationExceedsInterval = (currentMillis - feederStartTime) >= settings.hopperActionInterval;
        if (totalFeederRunTime >= settings.hopperActionInterval || currVibrationExceedsInterval) {
          if (currVibrationExceedsInterval) feederStartTime = currentMillis;
          totalFeederRunTime = 0;
          stepper->move(-settings.hopperStepsPerAction - 20);
          currHopperState = HOPPER_MOVING_DOWN;
          if (HOPPER_DEBUG) Serial.println("moving_down");
        } 
        break;
      }

    default:
      {
        if (HOPPER_DEBUG) Serial.print("No Hopper State");
        break;
      }
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

    if (inByte == START_MARKER) {
      capturingMessage = true;
      message_pos = 0;
      checksum = 0;
    }
    else if (inByte == END_MARKER) {
      capturingMessage = false;

      if (message_pos >= 2) {
        // Extract checksum from the last two characters
        receivedChecksum = (message[message_pos - 2] - '0') * 10 + (message[message_pos - 1] - '0');
        message[message_pos - 2] = '\0';  // Null-terminate the message string

        for (unsigned int i = 0; i < message_pos - 2; i++) {
          checksum += message[i];
        }

        if (checksum % 100 == receivedChecksum) {
          processMessage(message);
        } else {
          print("Error: Checksum does not match");
        }
      } else {
        print("Error: Message too short");
      }
    }
    else if (capturingMessage) {
      if (message_pos < MAX_MESSAGE_LENGTH - 1) {
        message[message_pos] = inByte;
        message_pos++;
      } else {
        // Handle message overflow
        capturingMessage = false;
        print("Error: Message too long");
      }
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
  length_val = i2c_rx_buf[0];
  length_val = length_val << 8;
  length_val |= i2c_rx_buf[1];
  return length_val;
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
