#include <math.h>
#include <PID_v1.h>

#define CONVEYOR_DEBUG true
#define SYSTEM_DEBUG true

#define JET_0_PIN 11
#define JET_1_PIN 12
#define JET_2_PIN 10
#define JET_3_PIN 9

#define CONV_RPWM_PIN   6
#define ENCODER_PIN     2     // Encoder uses hardware interrupt 0 on pin 2

#define MAX_MESSAGE_LENGTH 100 // buffer length for incoming serial communication

int JET_FIRE_TIMES[4];  // Array to store fire times for each jet
bool jetActive[4] = {false, false, false, false};  // Track if each jet is currently firing
unsigned long jetEndTime[4];  // Store end times for each jet
bool settingsInitialized = false;

// --- PID Controller State (Arduino PID class) ---
double pidInput = 0.0;
double pidOutput = 0.0;
double pidSetpoint = 0.0;
double pidKp = 0.5;
double pidKi = 0.2;
double pidKd = 0.05;
PID conveyorPid(&pidInput, &pidOutput, &pidSetpoint, pidKp, pidKi, pidKd, DIRECT);

// --- Simple Speed Controller & Encoder Variables ---
int pulsesPerRevolution = 20; // Default pulses per revolution for the encoder wheel

volatile long pulseCount = 0; // Incremented by encoder interrupt
int currentRPM = 0;           // Calculated current RPM
static float filteredRPM = 0.0; // Smoothed RPM value
unsigned long lastSpeedUpdateTime = 0;
#define SPEED_UPDATE_INTERVAL 500 // PID and speed update interval in ms

// --- Conveyor Motor Speed Variables ---
int maxConveyorRPM = 60;      // Maximum allowed RPM (from settings)
int minRPM = 30;             // Minimum allowed RPM
int targetRPM = 0;           // Desired RPM, initialized to 0 for safety

// Simple PWM control - empirically calibrated
const int CONV_MAX_PWM = 140;    // ~2.75 V
const int CONV_MIN_PWM = 61;     // ~1.2 V minimum to start motor

unsigned long lastDebugTime = 0;

// Control refinements
const int DEAD_BAND_RPM = 2;      // Skip adjustments within +/-2 RPM of setpoint
const int PWM_SLEW_STEP = 2;      // Limit PWM change per update to reduce jitter

// --- Controller State ---
static int lastCommandedPWM = 0;       // Last PWM actually written

// --- Function Prototypes ---
void countPulse();
int getJetPin(int jetNumber);

void setup()
{
  Serial.begin(9600);

  pinMode(JET_0_PIN, OUTPUT);
  pinMode(JET_1_PIN, OUTPUT);
  pinMode(JET_2_PIN, OUTPUT);
  pinMode(JET_3_PIN, OUTPUT);
  
  pinMode(CONV_RPWM_PIN, OUTPUT);
  analogWrite(CONV_RPWM_PIN, 0);

  // Setup for encoder interrupt on pin 2
  pinMode(ENCODER_PIN, INPUT_PULLUP);
  // Count both edges to double measurement resolution (ensure PPR in settings reflects this)
  attachInterrupt(digitalPinToInterrupt(ENCODER_PIN), countPulse, CHANGE);
  
  // Initialize PID
  conveyorPid.SetOutputLimits(CONV_MIN_PWM, CONV_MAX_PWM);
  conveyorPid.SetSampleTime(SPEED_UPDATE_INTERVAL);
  conveyorPid.SetMode(AUTOMATIC);

  // Auto-enable settings to allow on/off and speed commands without explicit settings
  settingsInitialized = true;

  Serial.println("Ready");
  Serial.println("Arduino setup complete. Motor speed should be 0.");
}

void processSettings(char *message) {
  // Validate message format
  if (message[0] != 's' || message[1] != ',') {
    if (CONVEYOR_DEBUG) {
      Serial.println("Error: Invalid settings message format");
    }
    return;
  }
  // Parse settings from message
  // Expected format: 's,<FIRE_TIME_0>,<FIRE_TIME_1>,<FIRE_TIME_2>,<FIRE_TIME_3>,<MAX_RPM>,<MIN_RPM>,<PPR>,<KP_INT>,<KI_INT>,<KD_INT>'
  char *token;
  int values[10]; // Array to hold fire times, max/min RPM, PPR, PID ints*100
  int valueIndex = 0;

  // Skip 's,' and start tokenizing
  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 10) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 6) { // Ensure we have at least the original 6 settings
    // Store fire times
    for(int i = 0; i < 4; i++) {
      JET_FIRE_TIMES[i] = values[i];
    }
    // Store RPM settings
    maxConveyorRPM = values[4];
    minRPM = values[5];
    
    // Check for optional settings
    if (valueIndex >= 7) pulsesPerRevolution = values[6];
    if (valueIndex >= 10) {
      pidKp = ((double)values[7]) / 100.0;
      pidKi = ((double)values[8]) / 100.0;
      pidKd = ((double)values[9]) / 100.0;
      conveyorPid.SetTunings(pidKp, pidKi, pidKd);
    }

    Serial.println("--- SETTINGS RECEIVED ---");
    Serial.print("Jet Fire Times: ");
    for(int i=0; i<4; i++) { Serial.print(JET_FIRE_TIMES[i]); Serial.print(","); }
    Serial.println("");
    Serial.print("Max RPM: "); Serial.println(maxConveyorRPM);
    Serial.print("Min RPM: "); Serial.println(minRPM);
    Serial.print("PPR: "); Serial.println(pulsesPerRevolution);
    if (valueIndex >= 10) {
      Serial.print("PID Kp: "); Serial.println(pidKp, 3);
      Serial.print("PID Ki: "); Serial.println(pidKi, 3);
      Serial.print("PID Kd: "); Serial.println(pidKd, 3);
    }
    Serial.println("-------------------------");

    // Reset all state variables to their initial values
    for(int i = 0; i < 4; i++) {
      jetActive[i] = false;
      jetEndTime[i] = 0;
    }
    targetRPM = 0; // Reset speed to 0 for safety

    // Stop the conveyor motor
    analogWrite(CONV_RPWM_PIN, 0);
    // Reset controller state
    lastCommandedPWM = 0;
    pidOutput = 0;
    pidInput = 0;
    pidSetpoint = 0;
    conveyorPid.SetMode(AUTOMATIC);

    settingsInitialized = true;
    Serial.println("Settings updated");
  } else {
    Serial.println("Error: Not enough settings provided");
  }
}

void processMessage(char *message) {
  // Debug: Print the received message
  if (SYSTEM_DEBUG) {
    Serial.print("SYSTEM: Processing message: '");
    Serial.print(message);
    Serial.print("', first char: '");
    Serial.print(message[0]);
    Serial.println("'");
  }
  
  // Add settings check at the start
  if (!settingsInitialized && message[0] != 's') {
    Serial.println("Settings not initialized");
    return;
  }

  int actionValue = atoi(message + 1); 
  switch (message[0]) {

    case 's': {
      processSettings(message);
      break;
    }

    case 'o': { // conveyor on off - toggles speed between 0 and max
      if (targetRPM > 0) {
        targetRPM = 0;
      } else {
        targetRPM = maxConveyorRPM;
      }
      Serial.print("'o' command received. New targetRPM: ");
      Serial.println(targetRPM);
      // Reset controller if stopping
      if (targetRPM == 0) {
        lastCommandedPWM = 0;
        pidOutput = 0;
        conveyorPid.SetMode(AUTOMATIC);
      }
      break;
    }

    case 'c': { // Set target RPM 
      targetRPM = constrain(actionValue, 0, maxConveyorRPM); // Constrain to safe range between 0 and maxConveyorRPM
      Serial.print("'c' command received. New targetRPM: ");
      Serial.println(targetRPM);
      if (targetRPM == 0) {
        lastCommandedPWM = 0;
        pidOutput = 0;
        conveyorPid.SetMode(AUTOMATIC);
      }
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
  unsigned long now = millis();

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

  // --- PID Speed Control ---
  if (now - lastSpeedUpdateTime >= SPEED_UPDATE_INTERVAL) {
    // Calculate actual time interval for precision
    unsigned long actualInterval = now - lastSpeedUpdateTime;
    lastSpeedUpdateTime = now;

    // Calculate RPM from pulse count
    noInterrupts();
    long pulses = pulseCount;
    pulseCount = 0;
    interrupts();
    
    double intervalSeconds = (double)actualInterval / 1000.0;
    double rawRPM = ((double)pulses / (double)pulsesPerRevolution / intervalSeconds * 60.0);
    
    // Apply simple exponential filter to smooth noisy readings
    const float filterAlpha = 0.25; // Slightly stronger smoothing
    if (filteredRPM == 0.0) {
      filteredRPM = rawRPM; // Initialize on first reading
    } else {
      filteredRPM = filterAlpha * rawRPM + (1.0 - filterAlpha) * filteredRPM;
    }
    currentRPM = (int)(filteredRPM + 0.5);

    // Update PID state
    pidInput = (double)currentRPM;
    pidSetpoint = (double)targetRPM;

    if (targetRPM == 0) {
      analogWrite(CONV_RPWM_PIN, 0);
      pidOutput = 0;
    } else {
      // Deadband: hold PWM when close enough to setpoint
      int rpmErrorAbs = abs(targetRPM - currentRPM);
      if (rpmErrorAbs <= DEAD_BAND_RPM) {
        analogWrite(CONV_RPWM_PIN, lastCommandedPWM);
      } else {
        conveyorPid.Compute();
        int outputPWM = (int)constrain((int)pidOutput, CONV_MIN_PWM, CONV_MAX_PWM);
        // Slew limit: constrain change per cycle
        int delta = outputPWM - lastCommandedPWM;
        if (delta > PWM_SLEW_STEP) outputPWM = lastCommandedPWM + PWM_SLEW_STEP;
        else if (delta < -PWM_SLEW_STEP) outputPWM = lastCommandedPWM - PWM_SLEW_STEP;
        lastCommandedPWM = outputPWM;
        analogWrite(CONV_RPWM_PIN, outputPWM);
      }
    }
  }

  // Periodically print debug info  
  if (now - lastDebugTime > 1500) {
    lastDebugTime = now;
    Serial.print("[DEBUG] targetRPM: ");
    Serial.print(targetRPM);
    Serial.print(", currentRPM: ");
    Serial.print(currentRPM);
    Serial.print(", pwmValue: ");
    Serial.println(lastCommandedPWM);
  }

  // Check if any jets need to be turned off
  for(int i = 0; i < 4; i++) {
    if(jetActive[i] && now >= jetEndTime[i]) {
      digitalWrite(getJetPin(i), LOW);
      jetActive[i] = false;
    }
  }
}

// --- Interrupt Service Routine for Encoder ---
void countPulse() {
  pulseCount++;
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

// No longer using custom step controller