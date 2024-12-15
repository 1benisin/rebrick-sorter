#define JET_0_PIN 11
#define JET_1_PIN 12
#define JET_2_PIN 10
#define JET_3_PIN 9

#define C_DIR1_PIN 7
#define C_DIR2_PIN 8
#define C_SPEED_PIN 3

#define MAX_MESSAGE_LENGTH 40 // longest serial comunication can be

int JET_FIRE_TIMES[4];  // Array to store fire times for each jet
bool settingsInitialized = false;

volatile bool conveyorOn = false;

void setup()
{
  Serial.begin(9600);

  pinMode(JET_0_PIN, OUTPUT);
  pinMode(JET_1_PIN, OUTPUT);
  pinMode(JET_2_PIN, OUTPUT);
  pinMode(JET_3_PIN, OUTPUT);
  
  pinMode(C_DIR1_PIN, OUTPUT);
  pinMode(C_DIR2_PIN, OUTPUT);
  pinMode(C_SPEED_PIN, OUTPUT);

  //  digitalWrite(C_DIR1_PIN, LOW); // sets the conveyor going in in the right direction

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

    case 'o': { // converyor on off
      conveyorOn = !conveyorOn;
      if (!conveyorOn) 
      {
        // Set rotation direction pins both to low to turn off motor
        // digitalWrite(C_DIR1_PIN, LOW);
        // digitalWrite(C_DIR2_PIN, LOW);
        analogWrite(C_SPEED_PIN, 0); 
      }
      else {
        analogWrite(C_SPEED_PIN, 250); 
      }
      print(conveyorOn ? "on" : "off");
      break;
    }

    case 'c': { // action value is the speed{
      if (actionValue > 255)
        print("conveyor speed above 250");
      if (actionValue < 50)
        print("conveyor speed below 50");
      analogWrite(C_SPEED_PIN, actionValue);
      print(actionValue);
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
        digitalWrite(jetPin, HIGH);
        delay(JET_FIRE_TIMES[actionValue]);
        digitalWrite(jetPin, LOW);
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
  static unsigned int checksum = 0;
  static unsigned int receivedChecksum = 0;

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
        print("Error: Checksum does not match"); // Report an error if not
      }
    }
    // If we're capturing and the character isn't the end marker
    else if (capturingMessage) {
      // Add the incoming byte to our message
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

