// A bench sketch for an Arduino Uno with a CNC Shield V3 and step drivers, and hobby servos on the shield's end-stop
// pins: type commands in the Serial Monitor at 115200 baud, newline at the end of each.
//
//   e              drivers on (the motors hold)
//   d              drivers off (the motors go slack)
//   m x 200 400    move axis x (or y, z) 200 steps at 400 steps a second; a negative count goes the other way
//   r x 200 400 20 there and back 20 times, for repeatability
//   s 90           the servo on pin 9 to 90 degrees
//   ?              this list
//
// Steps are driver steps: set MICROSTEPS below to match the jumpers under the driver. Moves ramp up and down, so a
// lost step in a move is the motor's limit and not a sudden start.
#include <Servo.h>

const int STEP[] = { 2, 3, 4 }, DIR[] = { 5, 6, 7 }, ENABLE_PIN = 8, SERVO_PIN = 9;
const long START_RATE = 100; // steps a second to begin and end a move at
const long RAMP_STEPS = 200; // steps spent speeding up, and slowing down
Servo servo;

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 3; i++) { pinMode(STEP[i], OUTPUT); pinMode(DIR[i], OUTPUT); }
  pinMode(ENABLE_PIN, OUTPUT);
  digitalWrite(ENABLE_PIN, HIGH); // off until asked: the shield's enable is active low
  servo.attach(SERVO_PIN);
  Serial.println(F("bench ready: ? lists the commands"));
}

void move(int axis, long steps, long rate) {
  digitalWrite(DIR[axis], steps < 0 ? LOW : HIGH);
  long total = labs(steps);
  for (long i = 0; i < total; i++) {
    long edge = min(i, total - 1 - i);
    long now = edge < RAMP_STEPS ? START_RATE + (rate - START_RATE) * edge / RAMP_STEPS : rate;
    if (now < START_RATE) now = START_RATE;
    unsigned long half = 500000UL / now;
    digitalWrite(STEP[axis], HIGH); delayMicroseconds(half);
    digitalWrite(STEP[axis], LOW); delayMicroseconds(half);
  }
}

int axisOf(char c) { return c == 'x' ? 0 : c == 'y' ? 1 : c == 'z' ? 2 : -1; }

void loop() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (!line.length()) return;
  char cmd = line[0], name = 0;
  long a = 0, b = 0, c = 0;
  if (cmd == 'e') { digitalWrite(ENABLE_PIN, LOW); Serial.println(F("on")); }
  else if (cmd == 'd') { digitalWrite(ENABLE_PIN, HIGH); Serial.println(F("off")); }
  else if (cmd == 's') { servo.write(line.substring(1).toInt()); Serial.println(F("servo moved")); }
  else if (cmd == 'm' && sscanf(line.c_str() + 1, " %c %ld %ld", &name, &a, &b) == 3 && axisOf(name) >= 0) { move(axisOf(name), a, b); Serial.println(F("done")); }
  else if (cmd == 'r' && sscanf(line.c_str() + 1, " %c %ld %ld %ld", &name, &a, &b, &c) == 4 && axisOf(name) >= 0) {
    for (long i = 0; i < c; i++) { move(axisOf(name), a, b); delay(200); move(axisOf(name), -a, b); delay(200); }
    Serial.println(F("done"));
  } else Serial.println(F("e, d, m x 200 400, r x 200 400 20, s 90"));
}
