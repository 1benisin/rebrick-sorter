#include "FastAccelStepper.h"
#include <Wire.h>

// Increase MAX_MESSAGE_LENGTH to accommodate settings message
#define MAX_MESSAGE_LENGTH 60 // Adjusted for longer messages

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

// Homing state machine
enum HomingState {
  NOT_HOMING,
  HOMING_START,
  HOMING_Y_BACKWARD,
  HOMING_X_BACKWARD,
  HOMING_Y_OFFSET,
  HOMING_X_OFFSET,
  HOMING_WAIT_FOR_OFFSET,
  HOMING_COMPLETE,
  HOMING_ERROR
};

HomingState currentHomingState = NOT_HOMING;
unsigned long homingStartMillis = 0;
const unsigned long HOMING_TIMEOUT_MS = 30000; // 30 seconds timeout per axis move
const int HOMING_BACKOFF_STEPS = 100; // Steps to back off after hitting switch

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

  Serial.println("Ready"); // Indicate that the Arduino is ready to receive config init settings message
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
    Serial.println("Settings updated");
  } else {
    Serial.println("Error: Not enough settings provided");
  }
}


void processMessage(char *message) {
  if (!settingsInitialized && message[0] != 's') {
    Serial.println("Settings not initialized");
    return;
  }

  // Prevent most commands during active homing (allow 's' maybe?)
  if (currentHomingState != NOT_HOMING && currentHomingState != HOMING_COMPLETE && currentHomingState != HOMING_ERROR) {
    if (message[0] != 'a') { // Allow trying to home again if in error state
      Serial.println("Busy: Homing in progress.");
      return;
    }
  }

  // If in error state, only allow 'a' to retry
  if (currentHomingState == HOMING_ERROR && message[0] != 'a') {
    Serial.println("Error: Homing failed. Please retry homing ('a').");
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
      binNum = constrain(binNum, 1, settings.GRID_DIMENSION * settings.GRID_DIMENSION);
      
      if (curBin != binNum) {
        curBin = binNum;
        moveToBin(binNum);
        moveCompleteSent = false;
      } else {
        // Already at the bin, send MC immediately if needed
        if (moveCompleteSent) {
          Serial.print("MC: ");
          Serial.println(curBin);
        }
      }
      break;
    }

    // MOVE TO CENTER
    case 'h': { 
      int centerBin = ((settings.GRID_DIMENSION * settings.GRID_DIMENSION) + 1) / 2;
      if (settings.ROW_MAJOR_ORDER) {
        // Adjust center bin for row-major order if necessary
      }
      Serial.print("centerBin: ");
      Serial.println(centerBin);
      moveToBin(centerBin);
      moveCompleteSent = false;
      break;
    }

    // HOMING PROCEDURE
    case 'a': {
      if (currentHomingState != NOT_HOMING && currentHomingState != HOMING_COMPLETE && currentHomingState != HOMING_ERROR) {
        Serial.println("Error: Homing already in progress.");
        break;
      }
      if (!settingsInitialized) {
        Serial.println("Error: Settings not initialized. Cannot home.");
        break;
      }
      if (xStepper->isRunning() || yStepper->isRunning()) {
        Serial.println("Error: Steppers busy. Cannot start homing.");
        break;
      }

      Serial.println("Homing sequence initiated...");
      currentHomingState = HOMING_START;
      break;
    }

    default:
      Serial.println("No matching serial communication");
      break;
  }
}

// Helper function to check endstop with optional debounce
bool checkEndstop(int pin) {
  if (digitalRead(pin) == LOW) {
    // Simple debounce - wait 5ms and check again
    delay(5);
    return digitalRead(pin) == LOW;
  }
  return false;
}

void handleHoming() {
  switch (currentHomingState) {
    case HOMING_START:
      // Start Y axis first
      Serial.println("Homing Y axis...");
      yStepper->setSpeedInUs(settings.HOMING_SPEED);
      yStepper->runBackward();
      homingStartMillis = millis();
      currentHomingState = HOMING_Y_BACKWARD;
      break;

    case HOMING_Y_BACKWARD:
      if (checkEndstop(Y_STOP_PIN)) {
        Serial.println("Y endstop hit.");
        yStepper->forceStop();
        yStepper->move(-HOMING_BACKOFF_STEPS, true); // Back off slowly
        yStepper->setCurrentPosition(0);

        // Now start X axis homing
        Serial.println("Homing X axis...");
        xStepper->setSpeedInUs(settings.HOMING_SPEED);
        xStepper->runBackward();
        homingStartMillis = millis();
        currentHomingState = HOMING_X_BACKWARD;

      } else if (millis() - homingStartMillis > HOMING_TIMEOUT_MS) {
        Serial.println("Error: Homing Y timed out!");
        xStepper->forceStop();
        yStepper->forceStop();
        currentHomingState = HOMING_ERROR;
      }
      break;

    case HOMING_X_BACKWARD:
      if (checkEndstop(X_STOP_PIN)) {
        Serial.println("X endstop hit.");
        xStepper->forceStop();
        xStepper->move(-HOMING_BACKOFF_STEPS, true); // Back off slowly
        xStepper->setCurrentPosition(0);

        // Both axes homed, now move to offsets (non-blocking)
        Serial.println("Moving to offsets...");
        xStepper->setSpeedInUs(settings.SPEED);
        yStepper->setSpeedInUs(settings.SPEED);

        bool xMoveStarted = (xStepper->moveTo(settings.X_OFFSET) == MOVE_OK);
        bool yMoveStarted = (yStepper->moveTo(settings.Y_OFFSET) == MOVE_OK);

        if (xMoveStarted || yMoveStarted) {
          currentHomingState = HOMING_WAIT_FOR_OFFSET;
        } else {
          currentHomingState = HOMING_COMPLETE;
          Serial.println("Homing complete (already at offsets).");
          curBin = 0;
        }

      } else if (millis() - homingStartMillis > HOMING_TIMEOUT_MS) {
        Serial.println("Error: Homing X timed out!");
        xStepper->forceStop();
        yStepper->forceStop();
        currentHomingState = HOMING_ERROR;
      }
      break;

    case HOMING_WAIT_FOR_OFFSET:
      if (!xStepper->isRunning() && !yStepper->isRunning()) {
        Serial.println("Homing complete.");
        currentHomingState = HOMING_COMPLETE;
        curBin = 0;
      }
      break;

    case HOMING_COMPLETE:
      currentHomingState = NOT_HOMING;
      break;

    case HOMING_ERROR:
      // Stay in error state until next homing command
      break;

    case NOT_HOMING:
    default:
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

  // Check to see if anything is available in the serial receive buffer
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

  // Handle the homing state machine
  handleHoming();

  // Check if a non-homing move is complete and send a message if it is
  // Make sure not to send MC during homing offset moves
  if (currentHomingState == NOT_HOMING || currentHomingState == HOMING_COMPLETE) {
    if (!moveCompleteSent && !xStepper->isRunning() && !yStepper->isRunning()) {
      Serial.print("MC: "); // Send message over serial
      Serial.println(curBin);
      moveCompleteSent = true; // Set the flag to indicate that the message has been sent
    }
  }
}

