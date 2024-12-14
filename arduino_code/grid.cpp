#include "FastAccelStepper.h"
#include <Wire.h>

// Increase MAX_MESSAGE_LENGTH to accommodate settings message
#define MAX_MESSAGE_LENGTH 60 // Adjusted for longer messages

#define MAX_GRID_DIMENSION 16 // Maximum grid dimension expected

// Other pin definitions remain the same
#define AUTO_DISABLE true
#define X_ENABLE_PIN 3
#define Y_ENABLE_PIN 4
#define X_DIR_PIN 5
#define Y_DIR_PIN 6
#define X_STEP_PIN 9
#define Y_STEP_PIN 10
#define X_STOP_PIN 11
#define Y_STOP_PIN 12

// Device settings struct
typedef struct {
  int   GRID_DIMENSION;
  int   X_OFFSET;
  int   Y_OFFSET;
  int   X_STEPS_TO_LAST;
  int   Y_STEPS_TO_LAST;
  int   ACCELERATION;
  int   HOMING_SPEED;
  int   SPEED;
  bool  ROW_MAJOR_ORDER; 
} DeviceSettings;

DeviceSettings settings;

int xStepsPerBin = 0;
int yStepsPerBin = 0;
int curBin = 0; // current bin number

bool moveCompleteSent = true; // flag to indicate that a move complete "MC" message has been sent
bool homing = false; // flag to indicate that the sorter is currently homing
bool settingsInitialized = false; // flag to indicate settings have been received

// Remove binLoc struct and binLocations array
// typedef struct {
//   int x;
//   int y;
// } binLoc;

// binLoc binLocations[MAX_GRID_DIMENSION * MAX_GRID_DIMENSION] = {};

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

void setup() {
  Wire.begin(); 
  Serial.begin(9600);
  engine.init();

  // ------- X STEPPER
  xStepper = engine.stepperConnectToPin(X_STEP_PIN);
  if (xStepper) {
    xStepper->setDirectionPin(X_DIR_PIN, true, 2000);
    if (AUTO_DISABLE) {
      xStepper->setEnablePin(X_ENABLE_PIN, true);
      xStepper->setAutoEnable(true);
    }
  }

  // ------- Y STEPPER
  yStepper = engine.stepperConnectToPin(Y_STEP_PIN);
  if (yStepper) {
    yStepper->setDirectionPin(Y_DIR_PIN, true, 2000);
    if (AUTO_DISABLE) {
      yStepper->setEnablePin(Y_ENABLE_PIN, true);
      yStepper->setAutoEnable(true);
    }
  }
  
  pinMode(X_STOP_PIN, INPUT_PULLUP);
  pinMode(Y_STOP_PIN, INPUT_PULLUP);

  print("Ready"); // Indicate that the Arduino is ready to receive settings
}

// ______________________________ FUNCTIONS ______________________________

void moveSorterToPosition(int xPos, int yPos, bool blocking = false) {
  xStepper->moveTo(xPos, blocking);
  yStepper->moveTo(yPos, blocking);
}

void moveToBin(int binNum, bool blocking = false) {
  int xIndex, yIndex;
  if (settings.ROW_MAJOR_ORDER) {
    // Row-major order (rows first)
    xIndex = (binNum - 1) % settings.GRID_DIMENSION;
    yIndex = (binNum - 1) / settings.GRID_DIMENSION;
  } else {
    // Column-major order (columns first)
    xIndex = (binNum - 1) / settings.GRID_DIMENSION;
    yIndex = (binNum - 1) % settings.GRID_DIMENSION;
  }
  int xPos = xIndex * xStepsPerBin + settings.X_OFFSET;
  int yPos = yIndex * yStepsPerBin + settings.Y_OFFSET;
  xStepper->moveTo(xPos, blocking);
  yStepper->moveTo(yPos, blocking);
}


void processSettings(char *message) {
  // Parse settings from message
  // Expected format: 's,<GRID_DIMENSION>,<X_OFFSET>,<Y_OFFSET>,<X_STEPS_TO_LAST>,<Y_STEPS_TO_LAST>,<ACCELERATION>,<HOMING_SPEED>,<SPEED>,<ROW_MAJOR_ORDER>'
  char *token;
  int values[10]; // Adjusted for 9 settings
  int valueIndex = 0;

  // Skip 's,' and start tokenizing
  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 10) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 9) { // Ensure we have all required settings
    settings.GRID_DIMENSION = values[0];
    settings.X_OFFSET = values[1];
    settings.Y_OFFSET = values[2];
    settings.X_STEPS_TO_LAST = values[3];
    settings.Y_STEPS_TO_LAST = values[4];
    settings.ACCELERATION = values[5];
    settings.HOMING_SPEED = values[6];
    settings.SPEED = values[7];
    settings.ROW_MAJOR_ORDER = (values[8] != 0); // Convert to boolean

    // Recalculate steps per bin
    xStepsPerBin = (settings.X_STEPS_TO_LAST - settings.X_OFFSET) / (settings.GRID_DIMENSION -1);
    yStepsPerBin = (settings.Y_STEPS_TO_LAST - settings.Y_OFFSET) / (settings.GRID_DIMENSION -1);

    // Update stepper settings
    xStepper->setAcceleration(settings.ACCELERATION);
    yStepper->setAcceleration(settings.ACCELERATION);
    xStepper->setSpeedInUs(settings.SPEED);
    yStepper->setSpeedInUs(settings.SPEED);

    settingsInitialized = true; // Settings have been received and processed
    print("Settings updated");
  } else {
    print("Error: Not enough settings provided");
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

    // MOVE SORTER
    case 'm': {
      char buffer[4];
      buffer[0] = message[1];
      buffer[1] = message[2];
      buffer[2] = message[3];
      buffer[3] = '\0';

      int binNum = atoi(buffer);
      binNum = constrain(binNum, 1, settings.GRID_DIMENSION * settings.GRID_DIMENSION); // prevent out of bounds bin number
      
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
      int centerBin = ((settings.GRID_DIMENSION * settings.GRID_DIMENSION) + 1) / 2;
      if (settings.ROW_MAJOR_ORDER) {
        // Adjust center bin for row-major order if necessary
      }
      Serial.print("centerBin: ");
      print(centerBin);
      moveToBin(centerBin);
      break;
    }


    // HOMING PROCEDURE
    case 'a': {
      homing = true;
      xStepper->setSpeedInUs(settings.HOMING_SPEED);
      xStepper->runBackward();
      yStepper->setSpeedInUs(settings.HOMING_SPEED);
      yStepper->runBackward();
      break;
    }
    default:
      print("No matching serial communication");
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
      if (message_pos >= MAX_MESSAGE_LENGTH) {
        capturingMessage = false; // Prevent buffer overflow
        print("Error: Message too long");
      }
    }
  }

  // Check if the move is complete and send a message if it is
  if (!moveCompleteSent && !xStepper->isRunning() && !yStepper->isRunning()) {
    print("MC"); // Send message over serial
    print(curBin);
    moveCompleteSent = true; // Set the flag to indicate that the message has been sent
  }

  // Check X-axis endstop if homing
  if (homing && !digitalRead(X_STOP_PIN)) {
    xStepper->forceStop();
    xStepper->setCurrentPosition(0);
    xStepper->setSpeedInUs(settings.SPEED);
    xStepper->moveTo(settings.X_OFFSET, true);
    // if other motor is done moving home, set homing to false
    if (!yStepper->isRunning()) {
      homing = false;
    }
  }

  // Check Y-axis endstop if homing
  if (homing && !digitalRead(Y_STOP_PIN)) {
    yStepper->forceStop();
    yStepper->setCurrentPosition(0);
    yStepper->setSpeedInUs(settings.SPEED);
    yStepper->moveTo(settings.Y_OFFSET, true);
    // if other motor is done moving home, set homing to false
    if (!xStepper->isRunning()) {
      homing = false;
    }
  }
}

void print(String a) { 
  Serial.print("1: ");
  Serial.println(a);
}
void print(int a) { 
  Serial.print("1: ");
  Serial.println(a);
}
void print(char *a) { 
  Serial.print("1: ");
  Serial.println(a);
}
void print(float a) { 
  Serial.print("1: ");
  Serial.println(a);
}
void print(bool a) { 
  Serial.print("1: ");
  Serial.println(a);
}
void print(int32_t a) { 
  Serial.print("1: ");
  Serial.println(a);
}
