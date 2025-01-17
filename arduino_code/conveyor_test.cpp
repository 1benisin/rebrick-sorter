#define CONV_RPWM_PIN   5  // PWM pin for speed control
#define CONV_R_EN_PIN   6  // Enable pin
#define CONV_ENCODER_A  2  // Encoder input A
#define CONV_ENCODER_B  3  // Encoder input B

volatile long encoderCount = 0;
bool motorRunning = false;
unsigned long lastDisplayTime = 0;
const unsigned long DISPLAY_INTERVAL = 500; // Display every 500ms

// ISR for encoder inputs
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

void setup() {
  Serial.begin(9600);
  
  // Configure pins
  pinMode(CONV_RPWM_PIN, OUTPUT);
  pinMode(CONV_R_EN_PIN, OUTPUT);
  pinMode(CONV_ENCODER_A, INPUT_PULLUP);
  pinMode(CONV_ENCODER_B, INPUT_PULLUP);
  
  // Attach interrupt handlers for encoder
  attachInterrupt(digitalPinToInterrupt(CONV_ENCODER_A), readEncoderA, CHANGE);
  attachInterrupt(digitalPinToInterrupt(CONV_ENCODER_B), readEncoderB, CHANGE);
  
  // Initialize motor to stopped state
  digitalWrite(CONV_R_EN_PIN, LOW);
  analogWrite(CONV_RPWM_PIN, 0);
  
  Serial.println("Conveyor Test Program");
  Serial.println("Commands:");
  Serial.println("  o - Toggle motor on/off");
  Serial.println("  sXXX - Set speed (50-255)");
  Serial.println("  r - Reset encoder count");
}

void loop() {
  // Display encoder count periodically
  if (millis() - lastDisplayTime >= DISPLAY_INTERVAL) {
    Serial.print("Encoder count: ");
    Serial.println(encoderCount);
    lastDisplayTime = millis();
  }
  
  // Check for serial commands
  if (Serial.available()) {
    char cmd = Serial.read();
    
    switch (cmd) {
      case 'o': // Toggle motor
        motorRunning = !motorRunning;
        digitalWrite(CONV_R_EN_PIN, motorRunning ? HIGH : LOW);
        analogWrite(CONV_RPWM_PIN, motorRunning ? 150 : 0); // Default speed 150
        Serial.println(motorRunning ? "Motor ON" : "Motor OFF");
        break;
        
      case 's': // Set speed
        if (Serial.available()) {
          int speed = Serial.parseInt();
          if (speed >= 50 && speed <= 255) {
            analogWrite(CONV_RPWM_PIN, speed);
            Serial.print("Speed set to: ");
            Serial.println(speed);
          } else {
            Serial.println("Speed must be between 50 and 255");
          }
        }
        break;
        
      case 'r': // Reset encoder count
        encoderCount = 0;
        Serial.println("Encoder count reset to 0");
        break;
    }
  }
}
