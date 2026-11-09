// A streamer for an arm on an Arduino Uno with a CNC Shield V3: it takes synchronised step blocks over serial and moves.
// Not a general firmware. It knows nothing of the arm: cad plot does the maths and send.mjs sends the result.
// 115200 baud, one command a line. Every line is answered "ok" once it is taken, or "error: ..." if it can't be; send the
// next line only after the answer: that is the flow control, and the buffer can never overrun.
//
//   e                      drivers on (the motors hold)
//   d                      drivers off
//   h <axis> <dir> <rate> <back>   home axis 0, 1 or 2: step towards dir (1 or -1) at rate steps/s until its endstop
//                          closes, then come back off it by back steps. Answers "ok" when done, "error: endstop" if none in 60 s
//   p <deg> <ms>           the pen servo to deg, then wait ms before anything after it
//   w <ms>                 wait
//   m <a> <b> <c> <entry> <peak> <exit> <accel> <up> <down>
//                          a block: signed steps per axis, then the major axis's step rate at entry, peak and exit
//                          (steps/s), its acceleration (steps/s²), and the major steps spent speeding up and slowing down
//   ?                      prints "q <pos0> <pos1> <pos2> <blocks queued>" (positions in steps, as of the last block finished)
//   !                      stop at once, empty the queue, drivers stay on: answers "ok"
//
// Timing: steps are timed in the main loop from micros(), with serial read between them, so the servo library keeps its
// timer. Rates of up to about 8000 steps/s on the major axis are within reach of a 16 MHz Uno. Compiled for the Uno and
// exercised with send.mjs --dry-run here; moving hardware is a bench test (the machine's measured milestone).
#include <Servo.h>

const uint8_t STEP[3] = { 2, 3, 4 }, DIR[3] = { 5, 6, 7 }, LIMIT[3] = { 9, 10, 12 }, ENABLE_PIN = 8, PEN_PIN = 11;
const uint8_t QUEUE = 12;
const long MIN_RATE = 80; // steps/s: slower than this a block would take seconds to start

enum Kind : uint8_t { MOVE, PEN, WAIT };
struct Block { Kind kind; long steps[3]; long major, entry, peak, exit_, accel, up, down; };
Block queue[QUEUE];
uint8_t head = 0, tail = 0;
inline uint8_t count() { return head >= tail ? head - tail : head + QUEUE - tail; }

Servo pen;
long position[3] = { 0, 0, 0 };
char line[96];
uint8_t len = 0;
bool pending = false; // a whole line is waiting for room in the queue

// The block being run
bool running = false;
Block cur;
long done = 0, acc[3];
unsigned long nextAt = 0, waitUntil = 0;
bool waiting = false;
float rate = 0;

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 3; i++) { pinMode(STEP[i], OUTPUT); pinMode(DIR[i], OUTPUT); pinMode(LIMIT[i], INPUT_PULLUP); }
  pinMode(ENABLE_PIN, OUTPUT);
  digitalWrite(ENABLE_PIN, HIGH); // off until asked: the shield's enable is active low
  pen.attach(PEN_PIN);
  Serial.println(F("arm ready"));
}

void pulse(uint8_t axis) { digitalWrite(STEP[axis], HIGH); delayMicroseconds(3); digitalWrite(STEP[axis], LOW); }

bool home(uint8_t axis, int dir, long hz, long back) {
  digitalWrite(DIR[axis], dir > 0 ? HIGH : LOW);
  unsigned long gap = 1000000UL / hz, start = millis();
  while (digitalRead(LIMIT[axis]) == HIGH) {
    if (millis() - start > 60000UL) return false;
    pulse(axis); delayMicroseconds(gap);
  }
  digitalWrite(DIR[axis], dir > 0 ? LOW : HIGH);
  for (long i = 0; i < back; i++) { pulse(axis); delayMicroseconds(gap); }
  position[axis] = 0;
  return true;
}

// Reads longs from a line, space separated
const char *cursor;
long nextLong() { char *end; long v = strtol(cursor, &end, 10); cursor = end; return v; }

// True if the line was dealt with; false if it has to wait for room in the queue
bool obey() {
  char c = line[0];
  cursor = line + 1;
  if (c == 'e') { digitalWrite(ENABLE_PIN, LOW); Serial.println(F("ok")); return true; }
  if (c == 'd') { digitalWrite(ENABLE_PIN, HIGH); Serial.println(F("ok")); return true; }
  if (c == '!') { head = tail = 0; running = false; waiting = false; Serial.println(F("ok")); return true; }
  if (c == '?') { Serial.print(F("q ")); for (uint8_t i = 0; i < 3; i++) { Serial.print(position[i]); Serial.print(' '); } Serial.println(count()); return true; }
  if (c == 'h') {
    if (running || count()) return false; // home only when everything before it is finished
    long axis = nextLong(), dir = nextLong(), hz = nextLong(), back = nextLong();
    if (axis < 0 || axis > 2 || hz <= 0) { Serial.println(F("error: home")); return true; }
    Serial.println(home(axis, dir, hz, back) ? F("ok") : F("error: endstop"));
    return true;
  }
  if (c != 'm' && c != 'p' && c != 'w') { Serial.println(F("error: command")); return true; }
  if (count() >= QUEUE - 1) return false;
  Block &b = queue[head];
  if (c == 'm') {
    b.kind = MOVE;
    for (uint8_t i = 0; i < 3; i++) b.steps[i] = nextLong();
    b.entry = nextLong(); b.peak = nextLong(); b.exit_ = nextLong(); b.accel = nextLong(); b.up = nextLong(); b.down = nextLong();
    b.major = max(max(labs(b.steps[0]), labs(b.steps[1])), labs(b.steps[2]));
    if (b.major == 0 || b.peak <= 0 || b.accel <= 0) { Serial.println(F("error: block")); return true; }
  } else if (c == 'p') { b.kind = PEN; b.major = nextLong(); b.up = nextLong(); }
  else { b.kind = WAIT; b.up = nextLong(); }
  head = (head + 1) % QUEUE;
  Serial.println(F("ok"));
  return true;
}

void readSerial() {
  if (pending) { if (obey()) pending = false; else return; }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (!len) continue;
      line[len] = 0; len = 0;
      if (!obey()) pending = true;
      return;
    }
    if (len < sizeof(line) - 1) line[len++] = c;
  }
}

void start() {
  cur = queue[tail];
  tail = (tail + 1) % QUEUE;
  if (cur.kind == PEN) { pen.write(cur.major); waitUntil = millis() + cur.up; waiting = true; return; }
  if (cur.kind == WAIT) { waitUntil = millis() + cur.up; waiting = true; return; }
  for (uint8_t i = 0; i < 3; i++) { digitalWrite(DIR[i], cur.steps[i] < 0 ? LOW : HIGH); acc[i] = cur.major / 2; }
  rate = max(cur.entry, MIN_RATE);
  done = 0; running = true; nextAt = micros();
}

void tick() {
  if ((long)(micros() - nextAt) < 0) return;
  for (uint8_t i = 0; i < 3; i++) {
    acc[i] += labs(cur.steps[i]);
    if (acc[i] >= cur.major) { acc[i] -= cur.major; pulse(i); position[i] += cur.steps[i] < 0 ? -1 : 1; }
  }
  done++;
  if (done >= cur.major) { running = false; return; }
  // Constant acceleration: dv = a dt, dt = 1 / v
  if (done < cur.up) { rate += (float)cur.accel / rate; if (rate > cur.peak) rate = cur.peak; }
  else if (done >= cur.major - cur.down) { rate -= (float)cur.accel / rate; float floor_ = max(cur.exit_, MIN_RATE); if (rate < floor_) rate = floor_; }
  nextAt += (unsigned long)(1000000.0 / rate);
}

void loop() {
  readSerial();
  if (waiting) { if ((long)(millis() - waitUntil) >= 0) waiting = false; return; }
  if (running) { tick(); return; }
  if (count()) start();
}
