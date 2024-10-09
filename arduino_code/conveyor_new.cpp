#define JET_0_PIN 11
#define JET_1_PIN 12

#define C_DIR1_PIN 7
#define C_DIR2_PIN 8
#define C_SPEED_PIN 3

#define MAX_MESSAGE_LENGTH 60 // Adjusted for longer messages

volatile bool conveyorOn = false;

struct DeviceSettings {
  int JET_FIRE_TIME;
};

DeviceSettings settings;
bool settingsInitialized = false;

void setup()
{
  Serial.begin(9600);

  pinMode(JET_0_PIN, OUTPUT);
  pinMode(JET_1_PIN, OUTPUT);
  
  pinMode(C_DIR1_PIN, OUTPUT);
  pinMode(C_DIR2_PIN, OUTPUT);
  pinMode(C_SPEED_PIN, OUTPUT);

  print("Ready"); // Indicate readiness to receive settings
}

void processSettings(char *message) {
  // Parse settings from message: 's,<JET_FIRE_TIME>'
  char *token;
  int values[1];
  int valueIndex = 0;

  token = strtok(&message[2], ",");
  while (token != NULL && valueIndex < 1) {
    values[valueIndex++] = atoi(token);
    token = strtok(NULL, ",");
  }

  if (valueIndex >= 1) {
    settings.JET_FIRE_TIME = values[0];
    settingsInitialized = true;
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

  int actionValue = atoi(message + 1); 
  switch (message[0]) {
    case 's':
      processSettings(message);
      break;

    case 'o': { // Conveyor on/off
      conveyorOn = !conveyorOn;
      if (!conveyorOn) {
        analogWrite(C_SPEED_PIN, 0); 
      } else {
        analogWrite(C_SPEED_PIN, 250); 
      }
      print(conveyorOn ? "on" : "off");
      break;
    }

    case 'c': { // Set conveyor speed
      if (actionValue > 255)
        print("Conveyor speed above 250");
      if (actionValue < 50)
        print("Conveyor speed below 50");
      analogWrite(C_SPEED_PIN, actionValue);
      print(actionValue);
      break;
    }
    
    case 'j': {  // Fire jet
      print(actionValue);
      if(actionValue == 0) {
        digitalWrite(JET_0_PIN, HIGH);
        delay(settings.JET_FIRE_TIME);
        digitalWrite(JET_0_PIN, LOW);
      }
      else if(actionValue == 1) {
        digitalWrite(JET_1_PIN, HIGH);
        delay(settings.JET_FIRE_TIME);
        digitalWrite(JET_1_PIN, LOW);
      }
      else {
        print("No matching jet number");
      }
      break;
    }

    default: {
      print("No matching serial communication");
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
  static unsigned int checksum = 0;
  static unsigned int receivedChecksum = 0;

  while (Serial.available() > 0) {
    char inByte = Serial.read();

    if(inByte == START_MARKER) {
      capturingMessage = true;
      message_pos = 0;
      checksum = 0;
    }
    else if (inByte == END_MARKER) {
      capturingMessage = false;
      receivedChecksum = (message[message_pos - 2] - '0') * 10 + (message[message_pos - 1] - '0');
      message[message_pos - 2] = '\0';
      
      for (int i = 0; i < message_pos - 2; i++) {
        checksum += message[i];
      }

      if (checksum % 100 == receivedChecksum) {
        processMessage(message);
      } else {
        print("Error: Checksum does not match");
      }
    }
    else if (capturingMessage) {
      message[message_pos] = inByte;
      message_pos++;
    }
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
