#include <Wire.h>
#include "FastAccelStepper.h"
#include <limits.h>

#define AUTO_DISABLE true

#define FEEDER_DEBUG false
#define HOPPER_DEBUG false

#define ENABLE_PIN 6
#define DIR_PIN 5
#define STEP_PIN 9

#define STOP_PIN 10

#define ACCELERATION 1000
#define SPEED 1000 

#define RAMP_UP_DURATION 1000 // ms
#define RAMP_START_SPEED 45   // a lower speed to start with

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

enum class SensorReadState : uint8_t {
  IDLE,
  REQUEST_SENT,
  WAITING_FOR_READING
};
SensorReadState currentSensorState = SensorReadState::IDLE;
unsigned long sensorRequestTime = 0;
const unsigned long SENSOR_READ_DELAY_US = 30; // Minimum delay from datasheet
unsigned long sensorWaitStartTime = 0; // for timeout
const unsigned long SENSOR_READ_TIMEOUT_MS = 10;

// -- Feeder Variables
#define FEEDER_RPWM_PIN 11    // Changed from FEEDER_ENABLE_PIN
#define FEEDER_R_EN_PIN 8     // Changed from FEEDER_MOTOR_PIN1
unsigned long lastFeederActionTime = 0;
unsigned long totalFeederVibrationTime = 0;
unsigned long feederVibrationStartTime = 0;

// Settings from server
int HOPPER_CYCLE_INTERVAL = 12000;  // Time between hopper cycles
int FEEDER_VIBRATION_SPEED = 92;   // Speed of feeder vibration
int FEEDER_STOP_DELAY = 1;          // Delay before stopping feeder after part detection
int FEEDER_PAUSE_TIME = 1000;       // Time to pause between feeder movements
int FEEDER_SHORT_MOVE_TIME = 60;   // Duration of short feeder movement
int FEEDER_LONG_MOVE_TIME = 3000;   // Maximum time to run feeder before stopping

// Debug variables
unsigned long lastDebugTime = 0;     // For controlling debug print frequency

// Function declarations
int ReadDistance(unsigned char device);
bool getLatestDistanceReading(unsigned short &reading); // New function to get reading when available

void setup() {
  Serial.begin(9600,SERIAL_8N1); // Initialize serial once at the start

  Wire.begin(); 

  pinMode(FEEDER_RPWM_PIN, OUTPUT);
  pinMode(FEEDER_R_EN_PIN, OUTPUT);

  // Initialize motor control pins
  digitalWrite(FEEDER_R_EN_PIN, LOW);
  analogWrite(FEEDER_RPWM_PIN, 0);

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
  digitalWrite(FEEDER_R_EN_PIN, HIGH);
  analogWrite(FEEDER_RPWM_PIN, FEEDER_VIBRATION_SPEED);
}

void stopMotor() {
  digitalWrite(FEEDER_R_EN_PIN, LOW);
  analogWrite(FEEDER_RPWM_PIN, 0);
}

enum class FeederState : uint8_t {
  start_moving,
  ramp_up_move, // New state for soft start
  moving,
  paused,
  short_move
};

FeederState currFeederState = FeederState::start_moving;

void checkFeeder() {
  unsigned long currentMillis = millis();

  // Add sensor reading debug
  int distance = ReadDistance(distanceSensorAddress);
  bool partDetected = distance < 20;
  if (FEEDER_DEBUG && partDetected) {
    Serial.println("SENSOR: Part detected in front of sensor");
  }

  switch (currFeederState) {
    case FeederState::start_moving: {
      // This state now initiates the ramp-up for a long move.
      feederVibrationStartTime = currentMillis;
      currFeederState = FeederState::ramp_up_move;
      // Motor is started within ramp_up_move state
      break;
    }

    case FeederState::ramp_up_move: {
      unsigned long elapsedTime = currentMillis - feederVibrationStartTime;

      if (partDetected) {
        stopMotor();
        totalFeederVibrationTime += elapsedTime;
        currFeederState = FeederState::paused;
        lastFeederActionTime = currentMillis;
        break; // Exit immediately
      }

      if (elapsedTime >= FEEDER_LONG_MOVE_TIME) { // Also check for total timeout during ramp
        stopMotor();
        totalFeederVibrationTime += elapsedTime;
        currFeederState = FeederState::paused;
        lastFeederActionTime = currentMillis;
        break;
      }
      
      if (elapsedTime < RAMP_UP_DURATION) {
        // Still ramping up
        int currentSpeed = map(elapsedTime, 0, RAMP_UP_DURATION, RAMP_START_SPEED, FEEDER_VIBRATION_SPEED);
        digitalWrite(FEEDER_R_EN_PIN, HIGH);
        analogWrite(FEEDER_RPWM_PIN, currentSpeed);
      } else {
        // Ramp-up finished, transition to full-speed moving
        startMotor(); // Set to full speed
        currFeederState = FeederState::moving;
      }
      break;
    }

    case FeederState::moving: {
      unsigned long elapsedTime = currentMillis - feederVibrationStartTime;
    
      // Motor is already at full speed. We just check for stop conditions.
      if (FEEDER_PAUSE_TIME == 0) {
        return;
      }
      
      // Check both conditions: part detection or long move time elapsed
      if (partDetected || (elapsedTime >= FEEDER_LONG_MOVE_TIME)) {
        //  update total vibration time
        totalFeederVibrationTime += elapsedTime;
        stopMotor();
        currFeederState = FeederState::paused;
        lastFeederActionTime = currentMillis;
      }
      break;
    }
    
    case FeederState::paused: {
      if (currentMillis - lastFeederActionTime >= FEEDER_PAUSE_TIME) {
        
        if (partDetected) { 
          startMotor(); 
          feederVibrationStartTime = currentMillis;
          currFeederState = FeederState::short_move;
          lastFeederActionTime = currentMillis;
        } else {
          currFeederState = FeederState::start_moving;
        }
      }
      break;
    }

    case FeederState::short_move: {
      if (currentMillis - lastFeederActionTime >= FEEDER_SHORT_MOVE_TIME || !partDetected) {
        stopMotor();
        // Correctly account for the vibration time of the short move
        totalFeederVibrationTime += (currentMillis - lastFeederActionTime);
        currFeederState = FeederState::paused;
        lastFeederActionTime = currentMillis;
      }
      break;
    }
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
    case HopperState::waiting_top: 
    if (HOPPER_DEBUG) {
      if (currentMillis - lastDebugTime >= 5000) {  // Print every 5 seconds
        Serial.print("HOPPER: Current vibration time: ");
        Serial.print(totalFeederVibrationTime);
        Serial.print(" / ");
        Serial.print(HOPPER_CYCLE_INTERVAL);
        Serial.print(" (");
        Serial.print((totalFeederVibrationTime * 100) / HOPPER_CYCLE_INTERVAL);
        Serial.println("%)");
        lastDebugTime = currentMillis;
      }
    }
    if (totalFeederVibrationTime >= HOPPER_CYCLE_INTERVAL) {
      if (HOPPER_DEBUG) {
        Serial.print("HOPPER: Starting new cycle - moving down. Total vibration time: ");
        Serial.println(totalFeederVibrationTime);
      }
      totalFeederVibrationTime = 0;
      hopperStepper->move(-hopperFullStrokeSteps-20);
      currHopperState = HopperState::moving_down;
    } 
    break;

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

    case 'p': { // pause time update
      // Format: 'p,<new_pause_time>'
      if (message[1] != ',') {
        Serial.println("Error: Invalid pause time message format");
        return;
      }
      
      char *token = strtok(&message[2], ",");
      if (!token) {
        Serial.println("Error: Missing pause time value");
        return;
      }
      
      FEEDER_PAUSE_TIME = atoi(token);
      
      if (FEEDER_DEBUG) {
        Serial.print("Pause time updated to: ");
        Serial.println(FEEDER_PAUSE_TIME);
      }
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
  // Expected format: 's,<HOPPER_CYCLE_INTERVAL>,<FEEDER_VIBRATION_SPEED>,<FEEDER_STOP_DELAY>,<FEEDER_PAUSE_TIME>,<FEEDER_SHORT_MOVE_TIME>,<FEEDER_LONG_MOVE_TIME>'
  // Note: The 's' character is the command identifier, followed by 6 comma-separated settings values
  
  // Validate message format
  if (message[0] != 's' || message[1] != ',') {
    Serial.println("Error: Invalid message format");
    return;
  }

  char *token;
  int values[6]; // Array to hold 6 setting values
  int valueIndex = 0;
  bool parseError = false;

  // Skip 's,' and start tokenizing
  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 6) {
    values[valueIndex] = atoi(token);
    valueIndex++;  // Increment the index after assigning the value
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 6) {
    // Apply settings if all validations pass
    HOPPER_CYCLE_INTERVAL = values[0];
    FEEDER_VIBRATION_SPEED = values[1];
    FEEDER_STOP_DELAY = values[2];
    FEEDER_PAUSE_TIME = values[3];
    FEEDER_SHORT_MOVE_TIME = values[4];
    FEEDER_LONG_MOVE_TIME = values[5];

    // Reset all state variables to their initial values
    currFeederState = FeederState::start_moving;
    currHopperState = HopperState::waiting_top;
    totalFeederVibrationTime = 0;
    lastFeederActionTime = 0;
    feederVibrationStartTime = 0;
    lastHopperActionTime = 0;
    lastDebugTime = 0;

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

  // Process sensor reading periodically
  processSensorReading(distanceSensorAddress); 

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

// Non-blocking sensor read function
// Returns true if a new reading was initiated or is in progress, false if I2C is busy from a previous call
// The actual reading is obtained via getLatestDistanceReading
bool initiateDistanceRead(unsigned char deviceAddr) {
  if (currentSensorState != SensorReadState::IDLE) {
    // Already processing a read
    return true; 
  }

  Wire.beginTransmission(deviceAddr); 
  Wire.write(byte(0x00));      // sets distance data address (addr)
  Wire.endTransmission();      // stop transmitting
  
  sensorRequestTime = micros(); // Use micros for finer delay control
  currentSensorState = SensorReadState::REQUEST_SENT;
  return true;
}

// Call this periodically to process the sensor reading stages
// Returns true if a new reading is available in distanceReading global
bool processSensorReading(unsigned char deviceAddr) {
  if (currentSensorState == SensorReadState::REQUEST_SENT) {
    if (micros() - sensorRequestTime >= SENSOR_READ_DELAY_US) {
      currentSensorState = SensorReadState::WAITING_FOR_READING;
      Wire.requestFrom(deviceAddr, (unsigned char)2); // request 2 bytes
      sensorWaitStartTime = millis(); // Start timeout timer
    }
    return false; // Reading not yet available
  }

  if (currentSensorState == SensorReadState::WAITING_FOR_READING) {
    if (Wire.available() >= 2) {
      i2cReceiveBuffer[0] = Wire.read();
      i2cReceiveBuffer[1] = Wire.read();
      distanceReading = i2cReceiveBuffer[0];
      distanceReading = distanceReading << 8;
      distanceReading |= i2cReceiveBuffer[1];
      currentSensorState = SensorReadState::IDLE; // Reset for next read
      return true; // New reading is available
    }
    
    // Timeout check
    if (millis() - sensorWaitStartTime > SENSOR_READ_TIMEOUT_MS) {
        Serial.println("Error: Sensor read timeout. Defaulting to part detected.");
        distanceReading = 0; // Default to a value that indicates a part is detected
        currentSensorState = SensorReadState::IDLE; // Reset for next attempt
        return true; // Return true as we've "handled" it by providing a default.
    }
    
    // Optional: Add a timeout here if Wire.available() never gets to 2
    return false; // Reading not yet available
  }
  return false; // Not in a state to process readings
}

// Wrapper to maintain similar old behavior for checkFeeder, but now it's non-blocking
// It will return the last successful reading, or 0 if a read is in progress or never completed.
// It also initiates a new read if the sensor is idle.
int ReadDistance(unsigned char device) {
  initiateDistanceRead(device); // Try to start a new read if idle
  // processSensorReading will be called in loop() to update distanceReading
  // For now, checkFeeder will use the last known distanceReading
  // This might mean it operates on slightly stale data if a read is in progress
  return distanceReading; 
}

// New function for a more robust way to get the latest reading
// Returns true if 'reading' is updated with a fresh value, false otherwise.
bool getLatestDistanceReading(unsigned short &reading) {
    if (processSensorReading(distanceSensorAddress)) {
        reading = distanceReading;
        return true;
    }
    return false;
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

