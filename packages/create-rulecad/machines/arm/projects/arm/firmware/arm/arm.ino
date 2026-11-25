// A streamer for a machine's stepper axes: it takes synchronised step blocks over serial and moves. The same program runs
// an arm or a leg's stand on an Arduino Uno with a CNC Shield V3 (three axes), and a quadruped's eight axes on an Arduino
// Mega 2560 with a step driver for each on a breakout; the board it is built for picks its pins (see BOARD below).
// Not a general firmware. It knows nothing of the machine: cad plot does the maths and send.mjs sends the result.
// 115200 baud, one command a line. Every line is answered "ok" once it is taken, or "error: ..." if it can't be; send the
// next line only after the answer: that is the flow control, and the buffer can never overrun.
//
//   e                      drivers on (the motors hold)
//   d                      drivers off
//   h <axis> <dir> <rate> <back>   home an axis (0 to AXES - 1): step towards dir (1 or -1) at rate steps/s until its
//                          endstop closes, then come back off it by back steps. Answers "ok" when done, "error: endstop" if none in 60 s
//   p <deg> <ms>           the pen servo to deg, then wait ms before anything after it
//   w <ms>                 wait
//   m <a> <b> <c> <entry> <peak> <exit> <accel> <up> <down>
//                          a block: signed steps for each of the AXES axes (three on the Uno, eight on the Mega), then
//                          the major axis's step rate at entry, peak and exit
//                          (steps/s), its acceleration (steps/s²), and the major steps spent speeding up and slowing down.
//                          "error: rate" if its peak is past MAX_RATE, "error: block" if it moves nothing
//                          (a block must last as long as its line and answer take to cross the serial line: send.mjs
//                          refuses a shorter one, and cad plot plans none shorter than the task's blockTime)
//   ?                      prints "q <pos0> <pos1> ... <blocks queued>", a position for each axis (in steps, as of the last step)
//   !                      stop at once, empty the queue, drivers stay on: answers "ok"
//
// "error: line" if a line is over LINE_MAX characters (95 on the Uno, 127 on the Mega) or a number in it is not a whole number.
//
// Timing: steps are timed in the main loop from micros(), with serial read between them, so the servo library keeps its
// timer. A line is parsed a character at a time as it arrives, so no step waits for a whole line to be read, and a block
// that follows another keeps its time: its first step is one gap after the last block's last. The step pins are all on one
// port (the Uno's port D, D2 to D4; the Mega's port A, D22 to D29), so the axes due on a tick are stepped in one write, and
// so are the direction pins (the Uno's D5 to D7, also port D; the Mega's port C, D37 down to D30). A step that changes
// speed costs a division; past 5000 steps/s that is done every other step, over both steps' time. MAX_RATE is the
// fastest block it takes: on a simulated 16 MHz Uno and Mega (scripts/firmware.mjs --simulate, in CI) the loop keeps up
// with more than that with all its axes stepping at once, speeding up and slowing down as well as at the cruise, and with
// the shortest blocks the sender passes streaming in.
// Compiled for the Uno and the Mega and run on simulated ones in CI; moving hardware is a bench test (the machine's measured
// milestone).
#include <Servo.h>

// BOARD. The pins come from the board the sketch is compiled for. Uno: the CNC Shield V3's (its user guide). Mega 2560:
// chosen so that each set is one port (ArduinoCore-avr's variants/mega/pins_arduino.h): STEP on D22 to D29 (PA0 to PA7),
// DIR on D37 to D30 (PC0 to PC7), the home switches on A8 to A15 (PK0 to PK7), the drivers' shared enable on D38.
#if defined(__AVR_ATmega2560__)
#define AXES 8
#define STEP_PORT PORTA
#define DIR_PORT PORTC
const uint8_t STEP[AXES] = { 22, 23, 24, 25, 26, 27, 28, 29 }, DIR[AXES] = { 37, 36, 35, 34, 33, 32, 31, 30 };
const uint8_t LIMIT[AXES] = { A8, A9, A10, A11, A12, A13, A14, A15 }, ENABLE_PIN = 38, PEN_PIN = 11;
const uint8_t STEP_MASK[AXES] = { _BV(PA0), _BV(PA1), _BV(PA2), _BV(PA3), _BV(PA4), _BV(PA5), _BV(PA6), _BV(PA7) }; // the STEP pins' bits in PORTA
const uint8_t DIR_MASK[AXES] = { _BV(PC0), _BV(PC1), _BV(PC2), _BV(PC3), _BV(PC4), _BV(PC5), _BV(PC6), _BV(PC7) };  // the DIR pins' bits in PORTC
const uint8_t LINE_MAX = 127;
#elif defined(__AVR_ATmega328P__)
#define AXES 3
#define STEP_PORT PORTD
#define DIR_PORT PORTD
const uint8_t STEP[AXES] = { 2, 3, 4 }, DIR[AXES] = { 5, 6, 7 }, LIMIT[AXES] = { 9, 10, 12 }, ENABLE_PIN = 8, PEN_PIN = 11;
const uint8_t STEP_MASK[AXES] = { _BV(PD2), _BV(PD3), _BV(PD4) }; // the STEP pins' bits in PORTD
const uint8_t DIR_MASK[AXES] = { _BV(PD5), _BV(PD6), _BV(PD7) };  // the DIR pins' bits in PORTD
const uint8_t LINE_MAX = 95;
#else
#error "the streamer is written for an Arduino Uno (ATmega328P) under a CNC Shield V3, or an Arduino Mega 2560"
#endif

#ifndef RATE_LIMIT
#define RATE_LIMIT 8000
#endif
const long MAX_RATE = RATE_LIMIT; // steps/s on a block's major axis; the simulation builds with -DRATE_LIMIT raised to find the loop's own limit
const uint8_t QUEUE = 12;
const long MIN_RATE = 80; // steps/s: slower than this a block would take seconds to start

enum Kind : uint8_t { MOVE, PEN, WAIT };
struct Block { Kind kind; long steps[AXES]; long major, entry, peak, exit_, accel, up, down; };
Block queue[QUEUE];
uint8_t head = 0, tail = 0;
inline uint8_t count() { return head >= tail ? head - tail : head + QUEUE - tail; }

Servo pen;
// The line being read, taken a character at a time as it arrives, between steps: its command letter, then up to ARGS
// whole numbers, each built up digit by digit. Parsing a whole line at its end (strtol) held the steps up 520 to 600 µs.
const uint8_t ARGS = AXES + 6;
char cmd = 0;
long arg[ARGS];
uint8_t len = 0, nargs = 0;
bool inNumber = false, negative = false, bad = false;
bool pending = false; // a whole line is waiting for room in the queue

// The block being run
bool running = false;
Block cur;
long done = 0;
// Each axis as the loop steps it, in one record so a step reaches all of it from one address: its position (steps, as of
// its last step), its Bresenham count, its steps in the block without their sign and the step each takes on the position
// (1 or -1), and its STEP pin's bit. A block's start lists the axes that move, so the Mega's eight in a block that moves
// two cost the loop no more than two.
struct Axis { long position, acc, dist; int8_t sign; uint8_t mask; };
Axis ax[AXES];
Axis *moving[AXES];
uint8_t nMoving = 0;
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
  for (uint8_t i = 0; i < AXES; i++) { pinMode(STEP[i], OUTPUT); pinMode(DIR[i], OUTPUT); pinMode(LIMIT[i], INPUT_PULLUP); }
  pinMode(ENABLE_PIN, OUTPUT);
  digitalWrite(ENABLE_PIN, HIGH); // off until asked: the shield's enable is active low
  pen.attach(PEN_PIN);
  Serial.print(F("streamer ready, ")); Serial.print(AXES); Serial.println(F(" axes"));
}

// A STEP pulse on the axes in mask, 3 µs high (delayMicroseconds(3) gave 2.06 µs on the simulated Uno, too near the
// DRV8825's 1.9 µs minimum; the A4988's is 1 µs)
void pulse(uint8_t mask) { STEP_PORT |= mask; delayMicroseconds(4); STEP_PORT &= ~mask; }

bool home(uint8_t axis, int dir, long hz, long back) {
  digitalWrite(DIR[axis], dir > 0 ? HIGH : LOW);
  unsigned long gap = 1000000UL / hz, start = millis();
  while (digitalRead(LIMIT[axis]) == HIGH) {
    if (millis() - start > 60000UL) return false;
    pulse(STEP_MASK[axis]); delayMicroseconds(gap);
  }
  digitalWrite(DIR[axis], dir > 0 ? LOW : HIGH);
  for (long i = 0; i < back; i++) { pulse(STEP_MASK[axis]); delayMicroseconds(gap); }
  ax[axis].position = 0;
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
  if (c == '?') { Serial.print(F("q ")); for (uint8_t i = 0; i < AXES; i++) { Serial.print(ax[i].position); Serial.print(' '); } Serial.println(count()); return true; }
  if (c == 'h') {
    if (running || count()) return false; // home only when everything before it is finished
    long axis = a(0), dir = a(1), hz = a(2), back = a(3);
    if (axis < 0 || axis >= AXES || hz <= 0) { Serial.println(F("error: home")); return true; }
    Serial.println(home(axis, dir, hz, back) ? F("ok") : F("error: endstop"));
    return true;
  }
  if (c != 'm' && c != 'p' && c != 'w') { Serial.println(F("error: command")); return true; }
  if (count() >= QUEUE - 1) return false;
  Block &b = queue[head];
  if (c == 'm') {
    b.kind = MOVE;
    b.major = 0;
    for (uint8_t i = 0; i < AXES; i++) { b.steps[i] = a(i); if (labs(b.steps[i]) > b.major) b.major = labs(b.steps[i]); }
    b.entry = a(AXES); b.peak = a(AXES + 1); b.exit_ = a(AXES + 2); b.accel = a(AXES + 3); b.up = a(AXES + 4); b.down = a(AXES + 5);
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
  uint8_t dirs = 0, all = 0;
  nMoving = 0;
  for (uint8_t i = 0; i < AXES; i++) {
    all |= DIR_MASK[i]; if (cur.steps[i] >= 0) dirs |= DIR_MASK[i];
    Axis &x = ax[i];
    x.acc = cur.major >> 1; x.dist = labs(cur.steps[i]); x.sign = cur.steps[i] < 0 ? -1 : 1; x.mask = STEP_MASK[i];
    if (x.dist) moving[nMoving++] = &x;
  }
  DIR_PORT = (DIR_PORT & ~all) | dirs;
  rate = max(cur.entry, MIN_RATE); gap = 1000000.0 / rate;
  accelUs = cur.accel * 1e-6f; peakF = cur.peak; floorF = max(cur.exit_, MIN_RATE); downFrom = cur.major - cur.down; skipped = false;
  done = 0; running = true;
  if (!chained) nextAt = micros(); // from rest, its first step now; following a block, one gap after that block's last
  chained = false;
}

void tick() {
  if ((long)(micros() - nextAt) < 0) return;
  uint8_t mask = 0;
  const long major = cur.major;
  for (uint8_t j = 0; j < nMoving; j++) {
    Axis *x = moving[j];
    x->acc += x->dist;
    if (x->acc >= major) { x->acc -= major; mask |= x->mask; x->position += x->sign; }
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
