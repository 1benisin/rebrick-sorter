#define JET_0_PIN 11
#define JET_1_PIN 12
#define JET_2_PIN 10
#define JET_3_PIN 9

#define CONV_RPWM_PIN   5
#define CONV_R_EN_PIN   6
#define CONV_ENCODER_A  2
#define CONV_ENCODER_B  3

#define MAX_MESSAGE_LENGTH 40 // longest serial comunication can be


int JET_FIRE_TIMES[4];  // Array to store fire times for each jet
bool jetActive[4] = {false, false, false, false};  // Track if each jet is currently firing
unsigned long jetEndTime[4];  // Store end times for each jet
bool settingsInitialized = false;

volatile bool conveyorOn = false;
volatile long encoderCount = 0;  // New encoder count variable

// Update this value to match the motor's encoder resolution after gearing
#define CONV_ENCODER_PPR 8400  // 64 CPR * 131.25 gear ratio

int maxConveyorRPM = 60;      // Maximum allowed RPM (from settings)
int minRPM = 30;             // Minimum allowed RPM
int targetRPM = 60;          // Desired RPM (can be updated with an 'r' command)
int currentRPM = 0;          // Measured RPM from the encoder
int pwmValue = 0;            // Current PWM value (0-255)
float kp = 2.0;              // Proportional gain (tuned for better response)
float ki = 0.1;              // Integral gain for steady-state error
float integralError = 0;     // Integral of the error
unsigned long lastControlMillis = 0;
const unsigned long controlInterval = 50;  // Reduced interval for more frequent updates (ms)

// New ISR functions
void readEncoderA() {
  if (digitalRead(CONV_ENCODER_A) == digitalRead(CONV_ENCODER_B)) {
    encoderCount++;
  } else {
    encoderCount--;
  }
}

void readEncoderB() {
  if (digitalRead(CONV_ENCODER_A) == digitalRead(CONV_ENCODER_B)) {
    encoderCount--;
  } else {
    encoderCount++;
  }
}

void setup()
{
  Serial.begin(9600);

  pinMode(JET_0_PIN, OUTPUT);
  pinMode(JET_1_PIN, OUTPUT);
  pinMode(JET_2_PIN, OUTPUT);
  pinMode(JET_3_PIN, OUTPUT);
  
  pinMode(CONV_RPWM_PIN, OUTPUT);
  pinMode(CONV_R_EN_PIN, OUTPUT);
  pinMode(CONV_ENCODER_A, INPUT_PULLUP);
  pinMode(CONV_ENCODER_B, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(CONV_ENCODER_A), readEncoderA, CHANGE);
  attachInterrupt(digitalPinToInterrupt(CONV_ENCODER_B), readEncoderB, CHANGE);
  digitalWrite(CONV_R_EN_PIN, LOW);
  analogWrite(CONV_RPWM_PIN, 0);

  Serial.println("Ready");
}

void processSettings(char *message) {
  // Parse settings from message
  // Expected format: 's,<FIRE_TIME_0>,<FIRE_TIME_1>,<FIRE_TIME_2>,<FIRE_TIME_3>,<MAX_RPM>,<MIN_RPM>'
  char *token;
  int values[6]; // Array to hold 4 fire time values, max RPM, and min RPM
  int valueIndex = 0;

  // Skip 's,' and start tokenizing
  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 6) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 6) { // Ensure we have all required settings
    // Store fire times
    for(int i = 0; i < 4; i++) {
      JET_FIRE_TIMES[i] = values[i];
    }
    // Store RPM settings
    maxConveyorRPM = values[4];
    minRPM = values[5];

    // Reset all state variables to their initial values
    for(int i = 0; i < 4; i++) {
      jetActive[i] = false;
      jetEndTime[i] = 0;
    }
    conveyorOn = false;
    encoderCount = 0;
    currentRPM = 0;
    pwmValue = 0;
    integralError = 0;
    lastControlMillis = 0;

    // Stop the conveyor motor
    digitalWrite(CONV_R_EN_PIN, LOW);
    analogWrite(CONV_RPWM_PIN, 0);

    settingsInitialized = true;
    Serial.println("Settings updated");
  } else {
    Serial.println("Error: Not enough settings provided");
  }
}

void processMessage(char *message) {
  // Add settings check at the start
  if (!settingsInitialized && message[0] != 's') {
    Serial.println("Settings not initialized");
    return;
  }

  int actionValue = atoi(message + 1); 
  switch (message[0]) {

    case 'h': { // heartbeat
      Serial.println("OK"); // Simple response to heartbeat
      break;
    }

    case 's': {
      processSettings(message);
      break;
    }

    case 'o': { // conveyor on off
      conveyorOn = !conveyorOn;
      if (!conveyorOn) {
        digitalWrite(CONV_R_EN_PIN, LOW);
        analogWrite(CONV_RPWM_PIN, 0);
        pwmValue = 0;
        integralError = 0;  // Reset integral error when stopping
      } else {
        digitalWrite(CONV_R_EN_PIN, HIGH);
        lastControlMillis = millis();
        encoderCount = 0;  // Reset encoder count when starting
        integralError = 0;  // Reset integral error when starting
        targetRPM = maxConveyorRPM;
      }
      Serial.println(conveyorOn ? "conveyor on" : "conveyor off");
      break;
    }

    case 'c': { // Set target RPM 
      targetRPM = constrain(actionValue, minRPM, maxConveyorRPM); // Constrain to safe range between minRPM and maxConveyorRPM

      if (actionValue < minRPM || actionValue > maxConveyorRPM){
        Serial.print("RPM constrained to hardware bounds [");
        Serial.print(minRPM);
        Serial.print(" - ");
        Serial.print(maxConveyorRPM);
        Serial.print("]: ");
      } else {
        Serial.print("RPM updated: ");
      }
      
      Serial.println(targetRPM);
      break;
    }
    
    // jet fire
    case 'j': {  // action value is the jet number
      Serial.print("Jet fire: ");
      Serial.println(actionValue);
      if(actionValue >= 0 && actionValue < 4) {
        int jetPin;
        switch(actionValue) {
          case 0: jetPin = JET_0_PIN; break;
          case 1: jetPin = JET_1_PIN; break;
          case 2: jetPin = JET_2_PIN; break;
          case 3: jetPin = JET_3_PIN; break;
        }
        unsigned long jetStartTime = millis();
        digitalWrite(jetPin, HIGH);
        // Store the jet state and end time in global variables
        jetActive[actionValue] = true;
        jetEndTime[actionValue] = jetStartTime + JET_FIRE_TIMES[actionValue];
      }
      else {
        Serial.println("no matching jet number");
      }
      break;
    }

    default: {
      Serial.println("no matching serial communication");
      break;
    }
  }
}

#define START_MARKER '<'
#define END_MARKER '>'

void loop() {
  static char message[MAX_MESSAGE_LENGTH];
  static unsigned int message_pos = 0;
  static bool capturingMessage = false;

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

  // Closed-Loop Motor Control
  if (conveyorOn) {
    unsigned long currentTime = millis();
    if (currentTime - lastControlMillis >= controlInterval) {
      // Safely read and reset the encoder count
      noInterrupts();
      long count = encoderCount;
      encoderCount = 0;
      interrupts();
      
      // Calculate RPM with improved accuracy
      currentRPM = (abs(count) * 60000L) / (CONV_ENCODER_PPR * controlInterval);
      
      // PI control: adjust PWM based on RPM error
      int error = targetRPM - currentRPM;
      integralError += error;
      integralError = constrain(integralError, -100, 100);  // Anti-windup
      
      // Calculate new PWM value using PI control
      pwmValue += (int)(kp * error + ki * integralError);
      pwmValue = constrain(pwmValue, 0, 255);
      
      // Update motor speed
      analogWrite(CONV_RPWM_PIN, pwmValue);
      lastControlMillis = currentTime;
      
      // Debug info
      // Serial.print("RPM: ");
      // Serial.print(currentRPM);
      // Serial.print(" | Target RPM: ");
      // Serial.print(targetRPM);
      // Serial.print(" | PWM: ");
      // Serial.println(pwmValue);
    }
  }

  // Check if any jets need to be turned off
  for(int i = 0; i < 4; i++) {
    if(jetActive[i] && millis() >= jetEndTime[i]) {
      digitalWrite(getJetPin(i), LOW);
      jetActive[i] = false;
    }
  }
}

int getJetPin(int jetNumber) {
  switch(jetNumber) {
    case 0: return JET_0_PIN;
    case 1: return JET_1_PIN;
    case 2: return JET_2_PIN;
    case 3: return JET_3_PIN;
    default: return -1;
  }
}
