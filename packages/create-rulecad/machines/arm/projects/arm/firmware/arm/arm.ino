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
//                          (steps/s), its acceleration (steps/s²), and the major steps spent speeding up and slowing down.
//                          "error: rate" if its peak is past MAX_RATE, "error: block" if it moves nothing
//   ?                      prints "q <pos0> <pos1> <pos2> <blocks queued>" (positions in steps, as of the last block finished)
//   !                      stop at once, empty the queue, drivers stay on: answers "ok"
//
// Timing: steps are timed in the main loop from micros(), with serial read between them, so the servo library keeps its
// timer. The step and direction pins are all on the Uno's port D (D2 to D7), so the axes due on a tick are stepped in one
// write, and a step that changes speed costs one division (a step at the cruise none). MAX_RATE is the fastest block it
// takes: on a simulated 16 MHz Uno (scripts/firmware.mjs --simulate, in CI) the loop keeps up with more than that with
// all three axes stepping at once, speeding up and slowing down as well as at the cruise.
// Compiled for the Uno and run on the simulated one in CI; moving hardware is a bench test (the machine's measured milestone).
#include <Servo.h>

#ifndef RATE_LIMIT
#define RATE_LIMIT 8000
#endif
const long MAX_RATE = RATE_LIMIT; // steps/s on a block's major axis; the simulation builds with -DRATE_LIMIT raised to find the loop's own limit
const uint8_t STEP[3] = { 2, 3, 4 }, DIR[3] = { 5, 6, 7 }, LIMIT[3] = { 9, 10, 12 }, ENABLE_PIN = 8, PEN_PIN = 11;
const uint8_t STEP_MASK[3] = { _BV(PD2), _BV(PD3), _BV(PD4) }; // the STEP pins' bits in PORTD
const uint8_t DIR_MASK[3] = { _BV(PD5), _BV(PD6), _BV(PD7) };  // the DIR pins' bits in PORTD
const uint8_t QUEUE = 12;
const long MIN_RATE = 80; // steps/s: slower than this a block would take seconds to start

enum Kind : uint8_t { MOVE, PEN, WAIT };
struct Block { Kind kind; long steps[3]; long major, entry, peak, exit_, accel, up, down; };
Block queue[QUEUE];
uint8_t head = 0, tail = 0;
inline uint8_t count() { return head >= tail ? head - tail : head + QUEUE - tail; }

Servo pen;
long position[3] = { 0, 0, 0 };
// The line being read, taken a character at a time as it arrives, between steps: its command letter, then up to ARGS
// whole numbers, each built up digit by digit. Parsing a whole line at its end (strtol) held the steps up 520 to 600 µs.
const uint8_t ARGS = 9, LINE_MAX = 95;
char cmd = 0;
long arg[ARGS];
uint8_t len = 0, nargs = 0;
bool inNumber = false, negative = false, bad = false;
bool pending = false; // a whole line is waiting for room in the queue

// The block being run
bool running = false;
Block cur;
long done = 0, acc[3];
unsigned long nextAt = 0, waitUntil = 0;
bool waiting = false;
bool chained = false; // the last block ended on a step with the next due one gap after it: the next block keeps that time
float rate = 0, gap = 0; // steps/s, and the µs from this step to the next
// The block's speed figures as floats, worked out once at its start: the acceleration per µs, the peak, the least exit
// rate, and the step from which it slows down
float accelUs = 0, peakF = 0, floorF = 0;
long downFrom = 0;
// A gap shorter than this (faster than 5000 steps/s), µs: the speed is worked out every other step, over both steps' time.
// A speed change costs a float multiply and a division, about half the 125 µs between steps at MAX_RATE, and the loop
// reads the serial line too; done every step the streamer fell behind slowing down from MAX_RATE with lines arriving.
const float FINE_GAP = 200;
bool skipped = false; // the last step in a ramp left its speed change to this one

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 3; i++) { pinMode(STEP[i], OUTPUT); pinMode(DIR[i], OUTPUT); pinMode(LIMIT[i], INPUT_PULLUP); }
  pinMode(ENABLE_PIN, OUTPUT);
  digitalWrite(ENABLE_PIN, HIGH); // off until asked: the shield's enable is active low
  pen.attach(PEN_PIN);
  Serial.println(F("arm ready"));
}

// A STEP pulse on the axes in mask, 3 µs high (delayMicroseconds(3) gave 2.06 µs on the simulated Uno, too near the
// DRV8825's 1.9 µs minimum; the A4988's is 1 µs)
void pulse(uint8_t mask) { PORTD |= mask; delayMicroseconds(4); PORTD &= ~mask; }

bool home(uint8_t axis, int dir, long hz, long back) {
  digitalWrite(DIR[axis], dir > 0 ? HIGH : LOW);
  unsigned long gap = 1000000UL / hz, start = millis();
  while (digitalRead(LIMIT[axis]) == HIGH) {
    if (millis() - start > 60000UL) return false;
    pulse(STEP_MASK[axis]); delayMicroseconds(gap);
  }
  digitalWrite(DIR[axis], dir > 0 ? LOW : HIGH);
  for (long i = 0; i < back; i++) { pulse(STEP_MASK[axis]); delayMicroseconds(gap); }
  position[axis] = 0;
  return true;
}

// One character of a line: the first is the command, then numbers separated by spaces, a minus sign before a negative one
void endNumber() { if (inNumber) { if (negative) arg[nargs] = -arg[nargs]; nargs++; inNumber = false; } }
void take(char c) {
  if (!len++) { cmd = c; nargs = 0; inNumber = false; bad = false; return; }
  if (len > LINE_MAX) { bad = true; return; }
  if (c == ' ') { endNumber(); return; }
  if (!inNumber) {
    if (nargs >= ARGS) { bad = true; return; }
    inNumber = true; negative = c == '-'; arg[nargs] = 0;
    if (negative) return;
  }
  if (c < '0' || c > '9') { bad = true; return; }
  arg[nargs] = arg[nargs] * 10 + (c - '0');
}
long a(uint8_t i) { return i < nargs ? arg[i] : 0; } // a number missing from the end of a line is 0

// True if the line was dealt with; false if it has to wait for room in the queue
bool obey() {
  char c = cmd;
  if (bad) { Serial.println(F("error: line")); return true; }
  if (c == 'e') { digitalWrite(ENABLE_PIN, LOW); Serial.println(F("ok")); return true; }
  if (c == 'd') { digitalWrite(ENABLE_PIN, HIGH); Serial.println(F("ok")); return true; }
  if (c == '!') { head = tail = 0; running = false; waiting = false; chained = false; Serial.println(F("ok")); return true; }
  if (c == '?') { Serial.print(F("q ")); for (uint8_t i = 0; i < 3; i++) { Serial.print(position[i]); Serial.print(' '); } Serial.println(count()); return true; }
  if (c == 'h') {
    if (running || count()) return false; // home only when everything before it is finished
    long axis = a(0), dir = a(1), hz = a(2), back = a(3);
    if (axis < 0 || axis > 2 || hz <= 0) { Serial.println(F("error: home")); return true; }
    Serial.println(home(axis, dir, hz, back) ? F("ok") : F("error: endstop"));
    return true;
  }
  if (c != 'm' && c != 'p' && c != 'w') { Serial.println(F("error: command")); return true; }
  if (count() >= QUEUE - 1) return false;
  Block &b = queue[head];
  if (c == 'm') {
    b.kind = MOVE;
    for (uint8_t i = 0; i < 3; i++) b.steps[i] = a(i);
    b.entry = a(3); b.peak = a(4); b.exit_ = a(5); b.accel = a(6); b.up = a(7); b.down = a(8);
    b.major = max(max(labs(b.steps[0]), labs(b.steps[1])), labs(b.steps[2]));
    if (b.major == 0 || b.peak <= 0 || b.accel <= 0) { Serial.println(F("error: block")); return true; }
    if (b.peak > MAX_RATE || b.entry > MAX_RATE || b.exit_ > MAX_RATE) { Serial.println(F("error: rate")); return true; }
  } else if (c == 'p') { b.kind = PEN; b.major = a(0); b.up = a(1); }
  else { b.kind = WAIT; b.up = a(0); }
  if (++head == QUEUE) head = 0;
  Serial.println(F("ok"));
  return true;
}

void readSerial() {
  if (pending) { if (obey()) pending = false; else return; }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (!len) continue;
      endNumber(); len = 0;
      if (!obey()) pending = true;
      return;
    }
    take(c);
  }
}

void start() {
  cur = queue[tail];
  if (++tail == QUEUE) tail = 0;
  if (cur.kind != MOVE) chained = false;
  if (cur.kind == PEN) { pen.write(cur.major); waitUntil = millis() + cur.up; waiting = true; return; }
  if (cur.kind == WAIT) { waitUntil = millis() + cur.up; waiting = true; return; }
  // the direction pins in one write, and each axis's Bresenham count from half the block (a shift: a long division here
  // cost about 600 cycles an axis between one block's last step and the next block's first)
  uint8_t dirs = 0;
  for (uint8_t i = 0; i < 3; i++) { if (cur.steps[i] >= 0) dirs |= DIR_MASK[i]; acc[i] = cur.major >> 1; }
  PORTD = (PORTD & ~(DIR_MASK[0] | DIR_MASK[1] | DIR_MASK[2])) | dirs;
  rate = max(cur.entry, MIN_RATE); gap = 1000000.0 / rate;
  accelUs = cur.accel * 1e-6f; peakF = cur.peak; floorF = max(cur.exit_, MIN_RATE); downFrom = cur.major - cur.down; skipped = false;
  done = 0; running = true;
  if (!chained) nextAt = micros(); // from rest, its first step now; following a block, one gap after that block's last
  chained = false;
}

void tick() {
  if ((long)(micros() - nextAt) < 0) return;
  uint8_t mask = 0;
  for (uint8_t i = 0; i < 3; i++) {
    acc[i] += labs(cur.steps[i]);
    if (acc[i] >= cur.major) { acc[i] -= cur.major; mask |= STEP_MASK[i]; position[i] += cur.steps[i] < 0 ? -1 : 1; }
  }
  pulse(mask);
  done++;
  if (done >= cur.major) { running = false; nextAt += (unsigned long)gap; chained = true; return; }
  // Constant acceleration: dv = a dt, dt this step's gap (1 / v), or two gaps when the last step left its change to this one
  // (the gap is the same for both: it changes only here). The last step speeding up always changes, so the cruise is at peak.
  bool up = done < cur.up;
  if (up || done >= downFrom) {
    if (gap >= FINE_GAP || skipped || done + 1 == cur.up) {
      float dv = accelUs * (skipped ? gap + gap : gap);
      skipped = false;
      if (up) { rate += dv; if (rate > peakF) rate = peakF; }
      else { rate -= dv; if (rate < floorF) rate = floorF; }
      gap = 1000000.0 / rate;
    } else skipped = true;
  }
  nextAt += (unsigned long)gap;
}

void loop() {
  readSerial();
  if (waiting) { if ((long)(millis() - waitUntil) >= 0) waiting = false; return; }
  if (running) { tick(); return; }
  if (count()) start(); else chained = false; // the queue ran dry: the motors stopped, and the next block starts from rest
}
