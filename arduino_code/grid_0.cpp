#include "FastAccelStepper.h"
#include <Wire.h>

#define AUTO_DISABLE true

#define X_ENABLE_PIN 3
#define Y_ENABLE_PIN 4

#define X_DIR_PIN 5
#define Y_DIR_PIN 6

#define X_STEP_PIN 9
#define Y_STEP_PIN 10

#define X_STOP_PIN 11
#define Y_STOP_PIN 12

#define MAX_MESSAGE_LENGTH 12 // longest serial comunication can be

#define GRID_DIMENSION 12 // how many bins in each direction

// Can be figured out by positioning sorter on grid and homing - will print number of steps
#define X_OFFSET 10  // how many steps from end stop to the first row of bins
#define Y_OFFSET 10  // how many steps from end stop to the first row of bins
#define X_STEPS_TO_LAST 6085 // 2190 // how many steps from origin to the last row of bins 
#define Y_STEPS_TO_LAST 6100 // 2170 // how many steps from origin to the last row of bins

#define ACCELERATION  5000 // 6000
#define HOMING_SPEED 1000 // 4000  // lower is faster
#define SPEED 120 // 100   // lower is faster  // max speed // never seem to reach max speed


int xStepsPerBin = (X_STEPS_TO_LAST - X_OFFSET) / (GRID_DIMENSION-1); 
int yStepsPerBin = (Y_STEPS_TO_LAST - Y_OFFSET) / (GRID_DIMENSION-1);
int curBin = 0 ; // current bin number

bool moveCompleteSent = true; // flag to indicate that a move complete "MC" message has been sent
bool homing = false; // flag to indicate that the sorter is currently homing

typedef struct
{
  int x;
  int y;
} binLoc;

binLoc binLocations[GRID_DIMENSION * GRID_DIMENSION] = {};


// ___________________________ STEPPER LIBRARY FUNCTIONS ___________________________

// void setEnablePin(uint8_t enablePin, bool low_active_enables_stepper = true);
// setSpeedInUs(100); 
// setAcceleration(10000);
// void setCurrentPosition(int32_t new_pos);

// int8_t move(int32_t move, bool blocking = false);
// int8_t moveTo(int32_t position, bool blocking = false);

// int8_t runForward();
// int8_t runBackward();
// void forwardStep(bool blocking = false);
// void backwardStep(bool blocking = false);
// int8_t moveByAcceleration(int32_t acceleration, bool allow_reverse = true);

// void stopMove();
// void forceStopAndNewPosition(uint32_t new_pos);
// void forceStop();


// ___________________________ SETUP ___________________________

FastAccelStepperEngine engine = FastAccelStepperEngine();
FastAccelStepper *xStepper = NULL;
FastAccelStepper *yStepper = NULL;

void setup()
{
  Wire.begin(); 
  Serial.begin(9600);
  engine.init();

  // ------- X STEPPER
  xStepper = engine.stepperConnectToPin(X_STEP_PIN);
  if (xStepper) {
    xStepper->setDirectionPin(X_DIR_PIN, true, 2000); // X_DIR_PIN, dirHighCountsUp = true, dir_change_delay_us = 1000
    if (AUTO_DISABLE) {
      xStepper->setEnablePin(X_ENABLE_PIN, true); // low_active_enables_stepper = false 
      xStepper->setAutoEnable(true);
    }
    xStepper->setSpeedInUs(SPEED);  // the parameter is us/step !!!
    xStepper->setAcceleration(ACCELERATION);
  }

  // ------- Y STEPPER
  yStepper = engine.stepperConnectToPin(Y_STEP_PIN);
  if (yStepper) {
    yStepper->setDirectionPin(Y_DIR_PIN, true, 2000); 
    if (AUTO_DISABLE) {
      yStepper->setEnablePin(Y_ENABLE_PIN, true); // low_active_enables_stepper = false 
      yStepper->setAutoEnable(true);
    }
    yStepper->setSpeedInUs(SPEED);  // the parameter is us/step !!!
    yStepper->setAcceleration(ACCELERATION);
  }
  
  pinMode(X_STOP_PIN, INPUT_PULLUP);
  pinMode(Y_STOP_PIN, INPUT_PULLUP);

  // populate bin location array
  int binNum = 1;
  for (int y = 0; y < GRID_DIMENSION; y++) {
    for (int x = 0; x < GRID_DIMENSION; x++) {
        binLocations[binNum-1].x = (x * xStepsPerBin) + X_OFFSET;// -1 because bin numbers start at 1 but array starts at 0
        binLocations[binNum-1].y = (y * yStepsPerBin) + Y_OFFSET;
        binNum++;
    }
  }

  print("setup complete");
}


// ______________________________ FUNCTIONS ______________________________

void moveSorterToPosition(int xPos, int yPos, bool blocking = false) {
  xStepper->moveTo(xPos, blocking);
  yStepper->moveTo(yPos, blocking);
}

void moveToBin(int binNum, bool blocking = false) {
  int xPos = binLocations[binNum-1].x; // -1 because bin numbers start at 1 but array starts at 0
  int yPos = binLocations[binNum-1].y;
  xStepper->moveTo(xPos, blocking);
  yStepper->moveTo(yPos, blocking);
}

void processMessage(char *message) {
  // check action char of message
  switch (message[0]) {

    // MOVE SORTER
    case 'm': {
      char buffer[4];
      buffer[0] = message[1];
      buffer[1] = message[2];
      buffer[2] = message[3];
      buffer[3] = '\0';

      int binNum = atoi(buffer);
      binNum = constrain(binNum, 1, GRID_DIMENSION * GRID_DIMENSION); // prevent out of bounds bin number
      
      if (curBin != binNum) { // if not at bin already 
        // make move
        curBin = binNum;
        moveToBin(binNum);
      }
      moveCompleteSent = false;
      break;
    }

    // MOVE TO CENTER
    case 'h': {
      int centerBin = GRID_DIMENSION * GRID_DIMENSION / 2 -  GRID_DIMENSION / 2;
      Serial.print("centerBin: ");
      print(centerBin);
      moveToBin(centerBin);
      break;
    }

    // HOMING PROCEDURE
    case 'a': { // homing procedure    
      homing = true;
      xStepper->setSpeedInUs(HOMING_SPEED);
      xStepper->runBackward();
      yStepper->setSpeedInUs(HOMING_SPEED);
      yStepper->runBackward();
      break;
    }

    case 'b': {
      // yStepper->move(4000);
      xStepper->move(-4000);
      break;
    }
    
    case 'f': {
      // yStepper->move(-4000);
      xStepper->move(4000);
      break;
    }

    // DEFAULT
    default:
      print("no matching serial communication");
      break;
  }
}


// ___________________________ MAIN LOOP ___________________________
#define START_MARKER '<'
#define END_MARKER '>'

void loop() {
  static char message[MAX_MESSAGE_LENGTH];
  static unsigned int message_pos = 0;
  static bool capturingMessage = false;
  static unsigned int checksum = 0;
  static unsigned int receivedChecksum = 0;

  // Check to see if anything is available in the serial receive buffer
  while (Serial.available() > 0) {
    // Read the next available byte in the serial receive buffer
    char inByte = Serial.read();

    // Start capturing if we receive the start marker
    if(inByte == START_MARKER) {
      capturingMessage = true;
      message_pos = 0;
      checksum = 0;
    }
    // Stop capturing if we receive the end marker
    else if (inByte == END_MARKER) {
      capturingMessage = false;
      // The last two characters of the message will be the checksum
      receivedChecksum = (message[message_pos - 2] - '0') * 10 + (message[message_pos - 1] - '0');
      message[message_pos - 2] = '\0';  // Set the end of the message before the checksum
      
      // Calculate the checksum now, after the message part is complete
      for (int i = 0; i < message_pos - 2; i++) {
        checksum += message[i];
      }

      // Check if the calculated checksum matches the received one
      if (checksum % 100 == receivedChecksum) { // Checksum can be 2 digits
        processMessage(message); // Process the message if it's correct
      } else {
        Serial.println("Error: Checksum does not match"); // Report an error if not
        Serial.println(message); // Report an error if not
        Serial.println(checksum); // Report an error if not
        Serial.println(receivedChecksum); // Report an error if not
      }
    }
    // If we're capturing and the character isn't the end marker
    else if (capturingMessage) {
      // Add the incoming byte to our message
      message[message_pos] = inByte;
      message_pos++;
    }
  }

  // Check if the move is complete, MC command is sent over serial, used for move time calibration
  if (!moveCompleteSent && !xStepper->isRunning() && !yStepper->isRunning()) {
    print("MC"); // Send message over serial
    moveCompleteSent = true; // Set the flag to indicate that the message has been sent
  }

  // Check X-axis endstop if homing
  if (homing && !digitalRead(X_STOP_PIN)) {
    xStepper->forceStop();
    xStepper->setCurrentPosition(0);
    xStepper->setSpeedInUs(SPEED);
    xStepper->moveTo(X_OFFSET, true);
    // if other motor is done moving home, set homing to false
    if (!yStepper->isRunning()) {
      homing = false;
    }
  }

  // Check Y-axis endstop if homing
  if (homing && !digitalRead(Y_STOP_PIN)) {
    yStepper->forceStop();
    yStepper->setCurrentPosition(0);
    yStepper->setSpeedInUs(SPEED);
    yStepper->moveTo(Y_OFFSET, true);
    // if other motor is done moving home, set homing to false
    if (!xStepper->isRunning()) {
      homing = false;
    }
  }
}

void print(String a) { 
  Serial.print("0: ");
  Serial.println(a);
}
void print(int a) { 
  Serial.print("0: ");
  Serial.println(a);
}
void print(char *a) { 
  Serial.print("0: ");
  Serial.println(a);
}
void print(float a) { 
  Serial.print("0: ");
  Serial.println(a);
}
void print(bool a) { 
  Serial.print("0: ");
  Serial.println(a);
}
void print(int32_t a) { 
  Serial.print("0: ");
  Serial.println(a);
}