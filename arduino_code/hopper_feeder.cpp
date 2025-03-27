#include <Wire.h>
#include "FastAccelStepper.h"

#define AUTO_DISABLE true

#define FEEDER_DEBUG false
#define HOPPER_DEBUG false

#define ENABLE_PIN 6
#define DIR_PIN 5
#define STEP_PIN 9

#define STOP_PIN 10

#define ACCELERATION 1000
#define SPEED 1000 

#define MAX_MESSAGE_LENGTH 40 // longest serial comunication can be

// Hopper Variables
int hopperFullStrokeSteps = 2020; // motor steps it takes to move from top to bottom
unsigned long lastHopperActionTime = 0;  // will store the last time the task was run
const long hopperBottomWaitTime = 10;  // interval at which to run the task (milliseconds)
bool settingsInitialized = false;

FastAccelStepperEngine engine = FastAccelStepperEngine();
FastAccelStepper *hopperStepper = NULL;
 
// --- Depth Sensor Variables
unsigned short distanceReading = 0;
unsigned char i2cReceiveBuffer[16];
unsigned char distanceSensorAddress = 80;
 
// -- Feeder Variables
#define FEEDER_ENABLE_PIN 11
#define FEEDER_MOTOR_PIN1 8
#define FEEDER_MOTOR_PIN2 7
unsigned long lastFeederActionTime = 0;
unsigned long totalFeederVibrationTime = 0;
unsigned long feederVibrationStartTime = 0;

// Settings from server
int HOPPER_CYCLE_INTERVAL = 20000;  // Time between hopper cycles
int FEEDER_VIBRATION_SPEED = 200;   // Speed of feeder vibration
int FEEDER_STOP_DELAY = 5;          // Delay before stopping feeder after part detection
int FEEDER_PAUSE_TIME = 1000;       // Time to pause between feeder movements
int FEEDER_SHORT_MOVE_TIME = 250;   // Duration of short feeder movement

void setup() {

  Wire.begin(); 
  Serial.begin(9600,SERIAL_8N1);

  pinMode(FEEDER_ENABLE_PIN, OUTPUT);
  pinMode(FEEDER_MOTOR_PIN1, OUTPUT);
  pinMode(FEEDER_MOTOR_PIN2, OUTPUT);

  // set motor direction
  startMotor();

  pinMode(STOP_PIN, INPUT);  


  engine.init();
  hopperStepper = engine.stepperConnectToPin(STEP_PIN);

  if (hopperStepper) {
    hopperStepper->setDirectionPin(DIR_PIN, true, 2000); // DIR_PIN, dirHighCountsUp = true, dir_change_delay_us = 1000
    if (AUTO_DISABLE) {
      hopperStepper->setEnablePin(ENABLE_PIN, true); // low_active_enables_stepper = false 
      hopperStepper->setAutoEnable(true);
    }
    hopperStepper->setSpeedInUs(SPEED);  // the parameter is us/step !!!
    hopperStepper->setAcceleration(ACCELERATION);

    hopperStepper->move(100);
  }
  Serial.println("Ready"); 
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

  // Add sensor reading debug
  int distance = ReadDistance(distanceSensorAddress);
  if (FEEDER_DEBUG && distance < 50) {
    Serial.println("SENSOR: Part detected in front of sensor");
  }

  switch (currFeederState) {
    case FeederState::start_moving: {
      startMotor(); 
      analogWrite(FEEDER_ENABLE_PIN, FEEDER_VIBRATION_SPEED);
      feederVibrationStartTime = currentMillis;
      currFeederState = FeederState::moving;
      break;
    }

    case FeederState::moving: 
      if (distance < 50) {
        currFeederState = FeederState::part_detected;
        lastFeederActionTime = currentMillis;
      }
      break;
    
    case FeederState::part_detected:
      if (currentMillis - lastFeederActionTime >= FEEDER_STOP_DELAY) {
        stopMotor();
        totalFeederVibrationTime += currentMillis - feederVibrationStartTime;
        currFeederState = FeederState::paused;
        lastFeederActionTime = currentMillis;
      }
      break;

    case FeederState::paused:
      if (currentMillis - lastFeederActionTime >= FEEDER_PAUSE_TIME) {
        if (ReadDistance(distanceSensorAddress) < 50) { 
          startMotor(); 
          analogWrite(FEEDER_ENABLE_PIN, FEEDER_VIBRATION_SPEED);
          feederVibrationStartTime = currentMillis;
          currFeederState = FeederState::short_move;
          lastFeederActionTime = currentMillis;
        } else {
          currFeederState = FeederState::start_moving;
        }
      }
      break;

    case FeederState::short_move:
      if (currentMillis - lastFeederActionTime >= FEEDER_SHORT_MOVE_TIME) {
        stopMotor();
        totalFeederVibrationTime += currentMillis - feederVibrationStartTime;
        currFeederState = FeederState::paused;
        lastFeederActionTime = currentMillis;
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
static HopperState currHopperState = HopperState::waiting_top;

void checkHopper()
{
  unsigned long currentMillis = millis();

  switch (currHopperState)
  {
  case HopperState::moving_down: 
    if (digitalRead(STOP_PIN) == LOW || !hopperStepper->isRunning()) {
      hopperStepper->forceStopAndNewPosition(0);
      lastHopperActionTime = currentMillis;      
      currHopperState = HopperState::waiting_bottom;
    }
    break;

  case HopperState::waiting_bottom:
    if (currentMillis - lastHopperActionTime >= hopperBottomWaitTime) {
      hopperStepper->move(hopperFullStrokeSteps);
      currHopperState = HopperState::moving_up;
    } 
    break;

  case HopperState::moving_up:
    if (!hopperStepper->isRunning()) {
      currHopperState = HopperState::waiting_top;
    } 
    break;

  case HopperState::waiting_top: 
    unsigned long timeSinceLastVibration = currentMillis - feederVibrationStartTime >= HOPPER_CYCLE_INTERVAL;
    if (totalFeederVibrationTime >= HOPPER_CYCLE_INTERVAL || timeSinceLastVibration) {
      if (HOPPER_DEBUG) {
        Serial.println("HOPPER: Starting new cycle - moving down");
      }
      if (timeSinceLastVibration) feederVibrationStartTime = currentMillis;
      totalFeederVibrationTime = 0;
      hopperStepper->move(-hopperFullStrokeSteps-20);
      currHopperState = HopperState::moving_down;
    } 
    break;
  }
}

void processMessage(char *message) {
  // Add settings check at the start
  if (!settingsInitialized && message[0] != 's') {
    Serial.println("Settings not initialized");
    return;
  }

  switch (message[0]) {
    case 's': {
      processSettings(message);
      break;
    }

    case 'o': { // hopper on/off
      if (message[1] == '1') {
        // Start hopper cycle
        if (HOPPER_DEBUG) {
          Serial.println("HOPPER: Starting new cycle - moving down");
        }
        hopperStepper->move(-hopperFullStrokeSteps-20);
        currHopperState = HopperState::moving_down;
      } else {
        // Stop hopper
        hopperStepper->forceStop();
        currHopperState = HopperState::waiting_top;
      }
      Serial.println(message[1] == '1' ? "hopper on" : "hopper off");
      break;
    }

    default: {
      Serial.println("no matching serial communication");
      break;
    }
  }
}

void processSettings(char *message) {
  // Parse settings from message
  // Expected format: 's,<HOPPER_CYCLE_INTERVAL>,<FEEDER_VIBRATION_SPEED>,<FEEDER_STOP_DELAY>,<FEEDER_PAUSE_TIME>,<FEEDER_SHORT_MOVE_TIME>'
  char *token;
  int values[5]; // Array to hold 5 setting values
  int valueIndex = 0;

  // Skip 's,' and start tokenizing
  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 5) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 5) { // Ensure we have all required settings
    HOPPER_CYCLE_INTERVAL = values[0];
    FEEDER_VIBRATION_SPEED = values[1];
    FEEDER_STOP_DELAY = values[2];
    FEEDER_PAUSE_TIME = values[3];
    FEEDER_SHORT_MOVE_TIME = values[4];

    settingsInitialized = true;
    Serial.println("Settings updated");
  } else {
    Serial.println("Error: Not enough settings provided");
  }
}

#define START_MARKER '<'
#define END_MARKER '>'

void loop() {
  static char message[MAX_MESSAGE_LENGTH];
  static unsigned int message_pos = 0;
  static bool capturingMessage = false;

  // Check for serial messages
  while (Serial.available() > 0) {
    char inByte = Serial.read();

    if(inByte == START_MARKER) {
      capturingMessage = true;
      message_pos = 0;
    }
    else if (inByte == END_MARKER) {
      capturingMessage = false;
      message[message_pos] = '\0';  // Null terminate the string
      processMessage(message);
    }
    else if (capturingMessage) {
      message[message_pos] = inByte;
      message_pos++;
      if (message_pos >= MAX_MESSAGE_LENGTH) {
        capturingMessage = false;
        Serial.println("Error: Message too long");
      }
    }
  }

  checkFeeder();
  checkHopper();
}

void SensorRead(unsigned char addr, unsigned char* datbuf, unsigned int cnt, unsigned char deviceAddr) 
{
  unsigned short result=0;
  // step 1: instruct sensor to read echoes

  Wire.beginTransmission(deviceAddr); // transmit to device address, factory default #82 (0x52)
  Wire.write(byte(addr));      // sets distance data address (addr)
  Wire.endTransmission();      // stop transmitting
  // step 2: wait for readings to happen
  delay(1);                   // datasheet suggests at least 30uS
  // step 3: request reading from sensor
  Wire.requestFrom(deviceAddr, cnt);    // request cnt bytes from slave device #82 (0x52)
  // step 5: receive reading from sensor
  if (cnt <= Wire.available()) { // if two bytes were received
    *datbuf++ = Wire.read();  // receive high byte (overwrites previous reading)
    *datbuf++ = Wire.read(); // receive low byte as lower 8 bits
  }
}
 
int ReadDistance(unsigned char device){
    SensorRead(0x00, i2cReceiveBuffer, 2, device);
    distanceReading=i2cReceiveBuffer[0];
    distanceReading=distanceReading<<8;
    distanceReading|=i2cReceiveBuffer[1];
    return distanceReading;
}


// HOW TO CHANGE DEPTH SENSOR DEVICE I2C ADDRESS_____________________________________________________________________________

// the address specified in the datasheet is 164 (0xa4)
// but i2c adressing uses the high 7 bits so it's 82
// 164 # 82  default
// 168 # 84
// 160 # 80

//// ---- this section of code will just output distance to serial monitor
//// ---- if middle two wires of sensor are hooked to RX and TX pins
//// ---- To change sensors I2C address type command in serial monitor:
////s7-168#
////s7- = register for the slave address
////168 = address to change it to between 0-254
////# = end command
//
//void setup()
//{
//
//  Serial.begin(9600);
//
//
//}
//
//void loop()
//{
//  delay(3000);
//  Serial.print("s7-168#"); 
//  // 164 # 82  // factory default
//  // 168 # 84
//  // 160 # 80
//  delay(60000);
//}
// _____________________________________________________________________________

