#include <PID_v1.h>
#include <math.h>

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

// --- PID Speed Controller & Encoder Variables ---
int pulsesPerRevolution = 20; // Default pulses per revolution for the encoder wheel
// Safer, tuned defaults. These are overridden by settings when provided.
double Kp = 1.0, Ki = 0.05, Kd = 0.08;  // PID tuning parameters - balanced speed and stability
double Setpoint, Input, Output;        // PID variables

volatile long pulseCount = 0; // Incremented by encoder interrupt
int currentRPM = 0;           // Calculated current RPM
static float filteredRPM = 0.0; // Smoothed RPM value
unsigned long lastPwmAdjustmentTime = 0;
#define PWM_ADJUSTMENT_INTERVAL 200 // Recalculate PWM every 200ms for faster response
// Tracks last PWM value actually sent to the motor for accurate logging
static int lastSentPWM = 0;
// Higher-resolution pulse timing (reduces quantization vs. fixed-interval counting)
volatile unsigned long lastPulseMicros = 0;
volatile unsigned long latestPulsePeriodMicros = 0; // Updated in ISR
unsigned long lastPulseSeenMillis = 0; // For detecting stoppage

// --- Conveyor Motor Speed Variables ---
int maxConveyorRPM = 60;      // Maximum allowed RPM (from settings)
int minRPM = 30;             // Minimum allowed RPM
int targetRPM = 0;           // Desired RPM, initialized to 0 for safety

// Map targetRPM into the 1.2–2.75 V PWM range (61–140) for your TRIAC board
const int CONV_MAX_PWM = 140;    // ~2.75 V
const int CONV_MIN_PWM = 61;     // ~1.2 V minimum to start motor
const int CONV_FF_MAX_PWM = 135; // Feedforward PWM at max RPM (calibratable)
const float CONV_FF_GAIN = 0.95; // Optional global gain on feedforward baseline (slightly increased)
const int FF_MID_RPM = 72;       // Calibrated mid-point RPM
const int FF_MID_PWM = 112;      // Measured steady PWM at FF_MID_RPM
const int PWM_TRIM_LIMIT = 20;   // Max +/- trim from PID on top of feedforward baseline
const int PWM_SLEW_PER_STEP = 8; // Max PWM change per control step to reduce dithering
const double RPM_DEADBAND = 0.3; // Within +/-0.3 RPM, ignore PID trim
unsigned long lastDebugTime = 0;

// Initialize PID controller (Proportional on Measurement to reduce overshoot/oscillation)
PID myPID(&Input, &Output, &Setpoint, Kp, Ki, Kd, P_ON_M, DIRECT);

// --- Function Prototypes ---
void countPulse();
int getJetPin(int jetNumber);
int computeFeedforwardPWM(int rpm);
int applySlewLimit(int desiredPWM, int previousPWM, int maxStep);


void setup()
{
  Serial.begin(9600);

  pinMode(JET_0_PIN, OUTPUT);
  pinMode(JET_1_PIN, OUTPUT);
  pinMode(JET_2_PIN, OUTPUT);
  pinMode(JET_3_PIN, OUTPUT);
  
  pinMode(CONV_RPWM_PIN, OUTPUT);
  analogWrite(CONV_RPWM_PIN, 0);

  // Initialize PID controller
  myPID.SetMode(AUTOMATIC);
  // PID will output a trim around a feedforward baseline
  // Increased limits: give PID more authority to reach target
  myPID.SetOutputLimits(-40, 50);
  myPID.SetSampleTime(PWM_ADJUSTMENT_INTERVAL);

  // Setup for encoder interrupt on pin 2
  pinMode(ENCODER_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_PIN), countPulse, RISING);
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
  // Note: PPR = Pulses Per Revolution, Kp/Ki/Kd are sent as integers (e.g., float * 100)
  char *token;
  int values[10]; // Array to hold 4 fire time, max/min RPM, PPR, Kp, Ki, Kd
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
    
    // Check for optional new PID controller settings
    if (valueIndex >= 7) pulsesPerRevolution = values[6];
    if (valueIndex >= 8) Kp = values[7] / 100.0; // Convert from int back to float
    if (valueIndex >= 9) Ki = values[8] / 100.0; // Convert from int back to float
    if (valueIndex >= 10) Kd = values[9] / 100.0; // Convert from int back to float


    Serial.println("--- SETTINGS RECEIVED ---");
    Serial.print("Jet Fire Times: ");
    for(int i=0; i<4; i++) { Serial.print(JET_FIRE_TIMES[i]); Serial.print(","); }
    Serial.println("");
    Serial.print("Max RPM: "); Serial.println(maxConveyorRPM);
    Serial.print("Min RPM: "); Serial.println(minRPM);
    Serial.print("PPR: "); Serial.println(pulsesPerRevolution);
    Serial.print("Kp: "); Serial.println(Kp);
    Serial.print("Ki: "); Serial.println(Ki);
    Serial.print("Kd: "); Serial.println(Kd);
    Serial.println("-------------------------");

    // Reset all state variables to their initial values
    for(int i = 0; i < 4; i++) {
      jetActive[i] = false;
      jetEndTime[i] = 0;
    }
    targetRPM = 0; // Reset speed to 0 for safety
    Setpoint = 0; // Reset PID setpoint
    myPID.SetTunings(Kp, Ki, Kd); // Update PID tunings

    // Stop the conveyor motor
    analogWrite(CONV_RPWM_PIN, 0);

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
      Setpoint = targetRPM; // Update PID setpoint
      break;
    }

    case 'c': { // Set target RPM 
      targetRPM = constrain(actionValue, 0, maxConveyorRPM); // Constrain to safe range between 0 and maxConveyorRPM
      Serial.print("'c' command received. New targetRPM: ");
      Serial.println(targetRPM);
      Setpoint = targetRPM; // Update PID setpoint
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

  // --- Closed-Loop PID Speed Control ---
  if (now - lastPwmAdjustmentTime >= PWM_ADJUSTMENT_INTERVAL) {
    lastPwmAdjustmentTime = now;

    // 1. Calculate RPM using pulse period if available (higher resolution),
    //    otherwise fall back to fixed-interval pulse counting
    double rawRPM = 0.0;
    static double smoothedPulsePeriodMicros = 0.0;
    const double pulsePeriodAlpha = 0.25; // smoothing for pulse period EMA

    noInterrupts();
    unsigned long periodMicrosSnapshot = latestPulsePeriodMicros;
    interrupts();

    if (periodMicrosSnapshot > 0) {
      // Update EMA of pulse period
      if (smoothedPulsePeriodMicros == 0.0) {
        smoothedPulsePeriodMicros = (double)periodMicrosSnapshot;
      } else {
        smoothedPulsePeriodMicros = pulsePeriodAlpha * (double)periodMicrosSnapshot +
                                    (1.0 - pulsePeriodAlpha) * smoothedPulsePeriodMicros;
      }
      // Compute RPM from period
      if (smoothedPulsePeriodMicros > 0.0) {
        rawRPM = (60.0 * 1000000.0) / (smoothedPulsePeriodMicros * (double)pulsesPerRevolution);
      }
    } else {
      // Fallback: fixed-interval counting
      noInterrupts();
      long pulses = pulseCount;
      pulseCount = 0;
      interrupts();
      double intervalSeconds = (double)PWM_ADJUSTMENT_INTERVAL / 1000.0;
      rawRPM = ((double)pulses / (double)pulsesPerRevolution / intervalSeconds * 60.0);
    }
    
    // Apply exponential filter to smooth noisy readings
    const float filterAlpha = 0.25; // Lower = more smoothing; 0.25 for a touch quicker correction
    if (filteredRPM == 0.0) {
      filteredRPM = rawRPM; // Initialize on first reading
    } else {
      filteredRPM = filterAlpha * rawRPM + (1.0 - filterAlpha) * filteredRPM;
    }
    currentRPM = (int)(filteredRPM + 0.5);
    
    // 2. Update PID input with filtered RPM
    Input = filteredRPM;
    
    // 3. Let the PID controller compute the output
    //    Freeze integral action inside deadband by temporarily zeroing error
    double originalSetpoint = Setpoint;
    double errorForDeadband = originalSetpoint - Input;
    if (fabs(errorForDeadband) < RPM_DEADBAND) {
      Setpoint = Input;
    }
    myPID.Compute();
    Setpoint = originalSetpoint;
    
    // 4. Apply the feedforward + PID trim to the motor with deadband and slew limiting
    if (targetRPM == 0) {
      analogWrite(CONV_RPWM_PIN, 0); // Force stop when target is 0
    } else {
      int baselinePWM = computeFeedforwardPWM(targetRPM);
      // Small deadband around setpoint to prevent trim dithering
      double error = Setpoint - Input;
      int trim = (fabs(error) < RPM_DEADBAND) ? 0 : (int)Output;
      int commandedPWM = baselinePWM + trim;
      if (commandedPWM < CONV_MIN_PWM) commandedPWM = CONV_MIN_PWM;
      if (commandedPWM > CONV_MAX_PWM) commandedPWM = CONV_MAX_PWM;
      static int lastCommandedPWM = 0;
      // On first run after start/stop, jump to commanded
      if (lastCommandedPWM == 0) {
        lastCommandedPWM = commandedPWM;
      }
      int slewedPWM = applySlewLimit(commandedPWM, lastCommandedPWM, PWM_SLEW_PER_STEP);
      analogWrite(CONV_RPWM_PIN, slewedPWM);
      lastSentPWM = slewedPWM;
      lastCommandedPWM = slewedPWM;
    }
  }

  // Periodically print debug info to avoid spamming serial
  if (now - lastDebugTime > 1000) {
    lastDebugTime = now;
    Serial.print("[DEBUG] targetRPM: ");
    Serial.print(targetRPM);
    Serial.print(", currentRPM: ");
    Serial.print(currentRPM);
    Serial.print(", pwmValue: ");
    Serial.println(lastSentPWM);
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
  unsigned long now = micros();
  if (lastPulseMicros != 0) {
    latestPulsePeriodMicros = now - lastPulseMicros;
  }
  lastPulseMicros = now;
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

// --- Map desired RPM to an estimated PWM baseline for fast response ---
int computeFeedforwardPWM(int rpm) {
  if (rpm <= 0) return 0;
  if (rpm <= minRPM) return CONV_MIN_PWM;
  if (rpm >= maxConveyorRPM) return CONV_FF_MAX_PWM;
  // Piecewise-linear feedforward using a calibrated midpoint for better accuracy
  if (rpm <= FF_MID_RPM) {
    long num = (long)(rpm - minRPM) * (FF_MID_PWM - CONV_MIN_PWM);
    long den = (long)(FF_MID_RPM - minRPM);
    int pwm = CONV_MIN_PWM + (int)(num / den);
    pwm = (int)(pwm * CONV_FF_GAIN);
    if (pwm < CONV_MIN_PWM) pwm = CONV_MIN_PWM;
    if (pwm > CONV_MAX_PWM) pwm = CONV_MAX_PWM;
    return pwm;
  } else {
    long num = (long)(rpm - FF_MID_RPM) * (CONV_FF_MAX_PWM - FF_MID_PWM);
    long den = (long)(maxConveyorRPM - FF_MID_RPM);
    int pwm = FF_MID_PWM + (int)(num / den);
    pwm = (int)(pwm * CONV_FF_GAIN);
    if (pwm < CONV_MIN_PWM) pwm = CONV_MIN_PWM;
    if (pwm > CONV_MAX_PWM) pwm = CONV_MAX_PWM;
    return pwm;
  }
}

// --- Limit rate-of-change of PWM to reduce chatter ---
int applySlewLimit(int desiredPWM, int previousPWM, int maxStep) {
  int delta = desiredPWM - previousPWM;
  if (delta > maxStep) return previousPWM + maxStep;
  if (delta < -maxStep) return previousPWM - maxStep;
  return desiredPWM;
}
