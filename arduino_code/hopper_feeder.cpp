
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

// Hopper Variables
int hopperStepsPerAction = 2020; // motor steps it takes to move from top to bottom
bool positionReset = false;
bool movingUp = false;
unsigned long prevHopperTime = 0;  // will store the last time the task was run
const long hopperWaitTime = 10;  // interval at which to run the task (milliseconds)
unsigned long hopperActionInterval = 20000; // 21000 // time between hopper moving down then up

FastAccelStepperEngine engine = FastAccelStepperEngine();
FastAccelStepper *stepper = NULL;
 
 // --- Depth Sensor Variables
unsigned short lenth_val = 0;
unsigned char i2c_rx_buf[16];
// unsigned char device1 = 82; // 82 is factory default
unsigned char depthSensorAddress = 80;
 

// -- Feeder Variables
#define FEEDER_ENABLE_PIN 11
#define FEEDER_MOTOR_PIN1 8
#define FEEDER_MOTOR_PIN2 7
int motorSpeed = 200; // up to 255
unsigned long previousMillis = 0;
const long delayStoppingInterval = 5;
const long pauseInterval = 1000; // time between short move vibrations 1500
const long shortMoveInterval = 250;
// int readDistance;
unsigned long totalFeederRunTime = 0;
unsigned long feederStartTime = 0;



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
  stepper = engine.stepperConnectToPin(STEP_PIN);

  if (stepper) {
    stepper->setDirectionPin(DIR_PIN, true, 2000); // DIR_PIN, dirHighCountsUp = true, dir_change_delay_us = 1000
    if (AUTO_DISABLE) {
      stepper->setEnablePin(ENABLE_PIN, true); // low_active_enables_stepper = false 
      stepper->setAutoEnable(true);
    }
    stepper->setSpeedInUs(SPEED);  // the parameter is us/step !!!
    stepper->setAcceleration(ACCELERATION);

    stepper->move(100);
  }

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

  switch (currFeederState) {
    case FeederState::start_moving: {
      if (FEEDER_DEBUG) Serial.println("moving");
      startMotor(); 
      analogWrite(FEEDER_ENABLE_PIN, motorSpeed);
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
        // if part is still there do a short move
          startMotor(); 
          analogWrite(FEEDER_ENABLE_PIN, motorSpeed);
          feederStartTime = currentMillis;
          currFeederState = FeederState::short_move;
          previousMillis = currentMillis;
        } else {
          if (FEEDER_DEBUG) Serial.println("start_moving");
          // else start full moving again 
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
static HopperState currHopperState = HopperState::waiting_top;

void checkHopper()
{
  unsigned long currentMillis = millis();

  switch (currHopperState)
  {
  case HopperState::moving_down: 
    if ( digitalRead(STOP_PIN) == LOW || !stepper->isRunning()) { // if stepper is down moving or endstop is hit
      stepper->forceStopAndNewPosition(0);
      prevHopperTime = currentMillis;      
      currHopperState = HopperState::waiting_bottom;
      if (HOPPER_DEBUG) Serial.println("waiting_bottom"); 
    }
    break;

  case HopperState::waiting_bottom:
    if (currentMillis - prevHopperTime >= hopperWaitTime) {
      stepper->move(hopperStepsPerAction);
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
    // will start the hopper step cycle over if
    // total feeder run time or the current feeder vibration is logger than the happer action interval
    unsigned long currVibrationExceedsInterval = currentMillis - feederStartTime >= hopperActionInterval;
    if (totalFeederRunTime >= hopperActionInterval || currVibrationExceedsInterval) {
      if (currVibrationExceedsInterval) feederStartTime = currentMillis;
      totalFeederRunTime = 0;
      stepper->move(-hopperStepsPerAction-20);
      currHopperState = HopperState::moving_down;
      if (HOPPER_DEBUG) Serial.println("moving_down");
    } 
    break;

  default:
    if (HOPPER_DEBUG) Serial.print("No Hopper State");
    break;
  }
}

void loop() {
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
    // Serial.println("Reading Distance..."); // Debug line
    SensorRead(0x00, i2c_rx_buf, 2, device);
    lenth_val=i2c_rx_buf[0];
    lenth_val=lenth_val<<8;
    lenth_val|=i2c_rx_buf[1];
    // Serial.println("Distance read: " + String(lenth_val)); // Debug line
    return lenth_val;
}


// CHANGE DEVICE I2C ADDRESS_____________________________________________________________________________


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
