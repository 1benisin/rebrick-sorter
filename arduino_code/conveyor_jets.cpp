// NOTE: Use USB port /dev/cu.usbserial2201 for this Arduino
#include <math.h>
#include <PID_v1.h>

#define CONVEYOR_DEBUG false
#define SYSTEM_DEBUG false

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
double pidKp = 0.3;   // Much more conservative for stability
double pidKi = 0.05;  // Reduced to prevent integral windup
double pidKd = 0.02;  // Reduced to prevent derivative kick
PID conveyorPid(&pidInput, &pidOutput, &pidSetpoint, pidKp, pidKi, pidKd, DIRECT);

// --- Simple Speed Controller & Encoder Variables ---
int pulsesPerRevolution = 20; // Default pulses per revolution for the encoder wheel

volatile long pulseCount = 0; // Incremented by encoder interrupt
volatile int32_t encoderPosition = 0; // Persistent position counter (never auto-resets)
int currentRPM = 0;           // Calculated current RPM
static float filteredRPM = 0.0; // Smoothed RPM value
unsigned long lastSpeedUpdateTime = 0;
#define SPEED_UPDATE_INTERVAL 300 // PID and speed update interval in ms (balanced response)

// --- Position Reporting Configuration ---
#define POSITION_REPORT_INTERVAL 100  // Report position every 100ms
unsigned long lastPositionReportTime = 0;

// --- Conveyor Motor Speed Variables ---
int maxConveyorRPM = 60;      // Maximum allowed RPM (from settings)
int minRPM = 30;             // Minimum allowed RPM
int targetRPM = 0;           // Desired RPM, initialized to 0 for safety

// Simple PWM control - empirically calibrated
const int CONV_MAX_PWM = 160;    // ~3.1 V (increased to reach higher speeds)
const int CONV_MIN_PWM = 61;     // ~1.2 V minimum to start motor

unsigned long lastDebugTime = 0;

// Control refinements
const int DEAD_BAND_RPM = 0;      // Make adjustments for any error (tightest control)
const int PWM_SLEW_STEP = 3;      // Allow faster PWM changes for responsiveness

// --- Controller State ---
static int lastCommandedPWM = 0;       // Last PWM actually written

// --- Pending Jets Buffer for Position-Triggered Firing ---
struct PendingJet {
  uint32_t position;  // Fire when encoder >= this
  uint8_t jet;        // Which jet (0-3)
  bool active;        // Is this slot in use
};

#define PENDING_JETS_CAPACITY 16
PendingJet pendingJets[PENDING_JETS_CAPACITY];

// --- Function Prototypes ---
void countPulse();
int getJetPin(int jetNumber);

void setup()
{
  Serial.begin(115200);

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

  // Initialize pending jets buffer
  for (int i = 0; i < PENDING_JETS_CAPACITY; i++) {
    pendingJets[i].active = false;
  }

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
    // Reset PID to clear any accumulated integral term
    conveyorPid.SetMode(MANUAL);
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
      // Reset controller if stopping or starting
      if (targetRPM == 0) {
        lastCommandedPWM = 0;
        pidOutput = 0;
        conveyorPid.SetMode(MANUAL);
        conveyorPid.SetMode(AUTOMATIC);
      } else {
        // Reset PID when starting from stopped to prevent windup
        conveyorPid.SetMode(MANUAL);
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
        conveyorPid.SetMode(MANUAL);
        conveyorPid.SetMode(AUTOMATIC);
      } else {
        // Reset PID when changing speed to prevent windup
        conveyorPid.SetMode(MANUAL);
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

    case 'e': { // Request encoder position
      Serial.print("EP:");
      Serial.println(getEncoderPosition());
      break;
    }

    case 'r': { // Reset encoder position
      noInterrupts();
      encoderPosition = 0;
      interrupts();
      Serial.println("ER:0");
      break;
    }

    case 'q': { // Queue jet at position: q<jet>,<position>
      // Parse: "q2,14800" -> jet=2, position=14800
      int jet = message[1] - '0';
      if (jet < 0 || jet > 3) {
        Serial.println("Error: Invalid jet number");
        break;
      }
      
      // Find comma and parse position
      char* commaPos = strchr(message + 2, ',');
      if (commaPos == NULL) {
        Serial.println("Error: Invalid queue format");
        break;
      }
      
      uint32_t position = strtoul(commaPos + 1, NULL, 10);
      
      if (addPendingJet(jet, position)) {
        Serial.print("JQ:");
        Serial.print(jet);
        Serial.print(",");
        Serial.println(position);
      } else {
        Serial.println("Error: Jet buffer full");
      }
      break;
    }

    case 'b': { // Buffer status
      int activeCount = 0;
      for (int i = 0; i < PENDING_JETS_CAPACITY; i++) {
        if (pendingJets[i].active) activeCount++;
      }
      Serial.print("BS:");
      Serial.print(activeCount);
      Serial.print(",");
      Serial.println(PENDING_JETS_CAPACITY);
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
    const float filterAlpha = 0.2; // More smoothing to reduce oscillations
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
      conveyorPid.SetMode(MANUAL); // Reset integral term
      conveyorPid.SetMode(AUTOMATIC);
    } else {
      // Deadband: hold PWM when close enough to setpoint
      int rpmErrorAbs = abs(targetRPM - currentRPM);
      if (rpmErrorAbs <= DEAD_BAND_RPM) {
        analogWrite(CONV_RPWM_PIN, lastCommandedPWM);
      } else {
        // Reset PID if error is very large (prevents windup during startup)
        if (rpmErrorAbs > 20) {
          conveyorPid.SetMode(MANUAL);
          conveyorPid.SetMode(AUTOMATIC);
        }
        
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
  if (CONVEYOR_DEBUG && (now - lastDebugTime > 1000)) {
    lastDebugTime = now;
    Serial.print("[DEBUG] targetRPM: ");
    Serial.print(targetRPM);
    Serial.print(", currentRPM: ");
    Serial.print(currentRPM);
    Serial.print(", encoderPos: ");
    Serial.print(getEncoderPosition());
    Serial.print(", error: ");
    Serial.print(targetRPM - currentRPM);
    Serial.print(", pwmValue: ");
    Serial.print(lastCommandedPWM);
    Serial.print(", pidOut: ");
    Serial.println((int)pidOutput);
  }

  // --- Periodic Position Reporting ---
  if (now - lastPositionReportTime >= POSITION_REPORT_INTERVAL) {
    lastPositionReportTime = now;
    Serial.print("EP:");
    Serial.println(getEncoderPosition());
  }

  // --- Process Pending Jets ---
  processPendingJets();

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
  pulseCount++;       // For RPM calculation (reset periodically)
  encoderPosition++;  // Persistent position (never auto-reset)
}

// Thread-safe read of encoder position (32-bit reads are not atomic on AVR)
int32_t getEncoderPosition() {
  noInterrupts();
  int32_t pos = encoderPosition;
  interrupts();
  return pos;
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

// Add a jet to the pending buffer. Returns true on success, false if buffer full.
bool addPendingJet(uint8_t jet, uint32_t position) {
  for (int i = 0; i < PENDING_JETS_CAPACITY; i++) {
    if (!pendingJets[i].active) {
      pendingJets[i].jet = jet;
      pendingJets[i].position = position;
      pendingJets[i].active = true;
      return true;
    }
  }
  return false;  // Buffer full
}

// Check pending jets and fire any that have reached their position
void processPendingJets() {
  int32_t currentPos = getEncoderPosition();
  for (int i = 0; i < PENDING_JETS_CAPACITY; i++) {
    if (pendingJets[i].active && currentPos >= (int32_t)pendingJets[i].position) {
      uint8_t jet = pendingJets[i].jet;
      if (jet < 4) {
        // Only fire if jet is not already active
        if (!jetActive[jet]) {
          int jetPin = getJetPin(jet);
          digitalWrite(jetPin, HIGH);
          jetActive[jet] = true;
          jetEndTime[jet] = millis() + JET_FIRE_TIMES[jet];

          // Send confirmation with actual position
          Serial.print("JF:");
          Serial.print(jet);
          Serial.print(",");
          Serial.println(currentPos);
        } else {
          // Jet already active - log but don't overwrite timing
          Serial.print("JF:"); // Still confirm firing happened
          Serial.print(jet);
          Serial.print(",");
          Serial.println(currentPos);
        }
      }
      pendingJets[i].active = false;
    }
  }
}