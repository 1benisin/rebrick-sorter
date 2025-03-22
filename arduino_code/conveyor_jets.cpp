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

int targetRPM = 50;          // Desired RPM (can be updated with an 'r' command)
int currentRPM = 0;          // Measured RPM from the encoder
int pwmValue = 0;            // Current PWM value (0-255)
float kp = 1.0;              // Proportional gain (tune as needed)
unsigned long lastControlMillis = 0;
const unsigned long controlInterval = 100;  // Interval for RPM/control update (ms)

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

  print("Ready");
}

void processSettings(char *message) {
  // Parse settings from message
  // Expected format: 's,<FIRE_TIME_0>,<FIRE_TIME_1>,<FIRE_TIME_2>,<FIRE_TIME_3>'
  char *token;
  int values[4]; // Array to hold 4 fire time values
  int valueIndex = 0;

  // Skip 's,' and start tokenizing
  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 4) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 4) { // Ensure we have all required settings
    // Store fire times
    for(int i = 0; i < 4; i++) {
      JET_FIRE_TIMES[i] = values[i];
    }

    settingsInitialized = true;
    print("Settings updated");
  } else {
    print("Error: Not enough settings provided");
  }
}

void processMessage(char *message) {
  // Add settings check at the start
  if (!settingsInitialized && message[0] != 's') {
    print("Settings not initialized");
    return;
  }

  int actionValue = atoi(message + 1); 
  switch (message[0]) {

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
      } else {
        digitalWrite(CONV_R_EN_PIN, HIGH);
        pwmValue = 100;  // Starting PWM value
        analogWrite(CONV_RPWM_PIN, pwmValue);
        lastControlMillis = millis();
        encoderCount = 0;  // Reset encoder count when starting
      }
      print(conveyorOn ? "on" : "off");
      break;
    }

    case 'c': { // Set target RPM (formerly 'r')
      int previousTargetRPM = targetRPM; //store the value before it is changed
      targetRPM = constrain(actionValue, 10, 60); // Constrain to safe range

      if (actionValue < 10 || actionValue > 60){
        Serial.print("Target RPM outside of bounds [10 - 60],");
      } else {
        Serial.print("Target RPM updated: ");
      }
      
      Serial.println(targetRPM);
      break;
    }
    
    // jet fire
    case 'j': {  // action value is the jet number
      print(actionValue);
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
        print("no matching jet number");
      }
      break;
    }

    default: {
      print("no matching serial communication");
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
        print("Error: Message too long");
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
      
      // Calculate RPM
      currentRPM = (abs(count) * 60000L) / (CONV_ENCODER_PPR * controlInterval);
      
      // Proportional control: adjust PWM based on RPM error
      int error = targetRPM - currentRPM;
      pwmValue += (int)(kp * error);
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

