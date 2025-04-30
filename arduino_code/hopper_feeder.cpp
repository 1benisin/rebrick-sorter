#include <Wire.h>
#include "FastAccelStepper.h"
#include <limits.h>

#define AUTO_DISABLE true

#define FEEDER_DEBUG false
#define HOPPER_DEBUG true

#define ENABLE_PIN 6
#define DIR_PIN 5
#define STEP_PIN 9

#define STOP_PIN 10

#define ACCELERATION 1000
#define SPEED 1000 

#define MAX_MESSAGE_LENGTH 40 // longest serial comunication can be

// Sensor reading configuration
#define SENSOR_READ_INTERVAL 50  // Read sensor every 50ms
#define SENSOR_BUFFER_SIZE 5     // Number of readings to keep for filtering
#define SENSOR_THRESHOLD 50      // Threshold for part detection

// Sensor reading variables
volatile bool newSensorReading = false;
volatile unsigned short sensorReadings[SENSOR_BUFFER_SIZE];
volatile int sensorBufferIndex = 0;
volatile unsigned short filteredDistance = 0;

// Timer interrupt setup
void setupTimer() {
  // Set up Timer1 for sensor reading
  TCCR1A = 0;  // Clear TCCR1A register
  TCCR1B = 0;  // Clear TCCR1B register
  TCNT1 = 0;   // Initialize counter value to 0
  
  // Set compare match register for 50ms interval
  // 16MHz / (prescaler * desired frequency) - 1
  // 16MHz / (1024 * 20Hz) - 1 = 781
  OCR1A = 781;
  
  TCCR1B |= (1 << WGM12);   // Turn on CTC mode
  TCCR1B |= (1 << CS12) | (1 << CS10);  // Set CS12 and CS10 bits for 1024 prescaler
  TIMSK1 |= (1 << OCIE1A);  // Enable timer compare interrupt
}

// Timer interrupt service routine
ISR(TIMER1_COMPA_vect) {
  unsigned short reading = ReadDistance(distanceSensorAddress);
  sensorReadings[sensorBufferIndex] = reading;
  sensorBufferIndex = (sensorBufferIndex + 1) % SENSOR_BUFFER_SIZE;
  
  // Calculate filtered value (simple moving average)
  unsigned long sum = 0;
  for(int i = 0; i < SENSOR_BUFFER_SIZE; i++) {
    sum += sensorReadings[i];
  }
  filteredDistance = sum / SENSOR_BUFFER_SIZE;
  
  newSensorReading = true;
}

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

void setup() {
  Wire.begin(); 
  Serial.begin(9600,SERIAL_8N1);

  // Initialize sensor readings array
  for(int i = 0; i < SENSOR_BUFFER_SIZE; i++) {
    sensorReadings[i] = 0;
  }

  setupTimer();

  pinMode(FEEDER_RPWM_PIN, OUTPUT);
  pinMode(FEEDER_R_EN_PIN, OUTPUT);

  // Initialize motor control pins
  digitalWrite(FEEDER_R_EN_PIN, LOW);
  analogWrite(FEEDER_RPWM_PIN, 0);

  pinMode(STOP_PIN, INPUT);  

  engine.init();
  hopperStepper = engine.stepperConnectToPin(STEP_PIN);

  if (hopperStepper) {
    hopperStepper->setDirectionPin(DIR_PIN, true, 2000);
    if (AUTO_DISABLE) {
      hopperStepper->setEnablePin(ENABLE_PIN, true);
      hopperStepper->setAutoEnable(true);
    }
    hopperStepper->setSpeedInUs(SPEED);
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
  moving,
  paused,
  short_move
};

FeederState currFeederState = FeederState::start_moving;

void checkFeeder() {
  unsigned long currentMillis = millis();
  unsigned long elapsedTime = currentMillis - feederVibrationStartTime;

  // Use filtered sensor reading
  bool partDetected = filteredDistance < SENSOR_THRESHOLD;
  if (FEEDER_DEBUG && partDetected) {
    Serial.println("SENSOR: Part detected in front of sensor");
  }

  switch (currFeederState) {
    case FeederState::start_moving: {
      startMotor(); 
      feederVibrationStartTime = currentMillis;
      currFeederState = FeederState::moving;
      break;
    }

    case FeederState::moving: {
    
      // If FEEDER_PAUSE_TIME is 0, run continuously at FEEDER_VIBRATION_SPEED
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
        totalFeederVibrationTime += elapsedTime;
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
  Serial.println("Settings updated successfully");
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

