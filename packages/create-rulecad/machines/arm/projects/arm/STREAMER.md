# The arm's streamer and its sender

The arm draws with two programs. `firmware/arm/arm.ino` runs on an Arduino Uno under a CNC Shield V3: it takes blocks of
synchronised steps over the USB serial line and moves the motors. `send.mjs` runs on your computer: it reads a step
file that `cad plot` wrote, homes the arm and sends the file to the Uno a line at a time. The Uno knows nothing of the
arm's shape. All the arm's maths happens in `cad plot`.

**Status.** The sketch is compiled for the Uno, and run on a simulated Uno, on every push to the kit (the `firmware`
job of its tests). The simulation homes the arm and streams the worked arm's step file through it. Moving real
hardware is your test: the arm's measured milestone.

## What you need

| | |
|---|---|
| **Board** | Arduino Uno (16 MHz), CNC Shield V3 on top, a step driver (DRV8825 or A4988) in each slot used |
| **On your computer** | Node 20 or later; the Arduino IDE or `arduino-cli` with the `arduino:avr` core and the `Servo` library, to flash the sketch |
| **Wiring** | The shoulder on the shield's X slot, the elbow on Y, a third axis (if any) on Z; the home switches on the X and Y limit pins (D9 and D10), a third axis's on D12; the pen servo's signal on D11 (the Z limit pin on a V3.00 shield). `cad machine` writes the wiring sheet |

## Using it

1. Flash the sketch: `arduino-cli compile --fqbn arduino:avr:uno firmware/arm` then `arduino-cli upload -p <port> --fqbn arduino:avr:uno firmware/arm`, or open `firmware/arm/arm.ino` in the Arduino IDE and upload it.
2. Write the machine description and a step file: `npx cad machine arm/arm` writes `exports/arm/arm.machine.json`, and `npx cad plot arm/arm projects/arm/drawings/test.svg` writes `exports/arm/arm-test.steps.json`. `npx cad plot arm/arm --calibrate` writes the calibration drawing (a 100 mm square and a circle at three places on the sheet).
3. Dry run, with no board: `node projects/arm/send.mjs exports/arm/arm-test.steps.json --machine exports/arm/arm.machine.json --dry-run`. It prints each line it would send with the answer the streamer would give, then a summary. `--quiet` prints the summary only. A dry run has no clock, so it takes each block as finished before the next line: its answer to `?` is the positions summed from the blocks so far, with 0 blocks queued.
4. Draw: `node projects/arm/send.mjs exports/arm/arm-test.steps.json --machine exports/arm/arm.machine.json --port <port>`. It turns the drivers on, homes each axis, sends the file, reports every hundredth line, and turns the drivers off. `--no-home` skips homing.

## The line protocol

115200 baud, 8 data bits, no parity, 1 stop bit. One command a line, ended by a newline. The streamer answers every
line once: `ok` when it has taken the line, or `error: <what>` when it cannot. The sender waits for that answer before
it sends the next line. That is the flow control: a line that finds the queue full is held until a block finishes,
and only then answered, so the 12-block queue never overruns. A line is at most 95 characters. Every number is a whole
number.

| Command | Arguments | What it does | Answers |
|---|---|---|---|
| `e` | | Drivers on: the motors hold | `ok` |
| `d` | | Drivers off: the motors go slack | `ok` |
| `h` | axis, direction, rate, back | Home one axis (0, 1 or 2): step towards direction (1 or -1) at rate steps/s until its switch closes, then step back off it by back steps, and call that position 0. It waits for the queue to empty first | `ok`; `error: endstop` if the switch has not closed after 60 s; `error: home` for a bad axis or rate |
| `p` | degrees, milliseconds | Queue the pen servo to degrees, then a wait of milliseconds before the next block | `ok` |
| `w` | milliseconds | Queue a wait | `ok` |
| `m` | a, b, c, entry, peak, exit, accel, up, down | Queue a block: signed steps on axes 0, 1 and 2; the major axis's rate at entry, at its peak and at exit (steps/s); its acceleration (steps/s²); the major axis's steps spent speeding up, and slowing down. The major axis is the one with the most steps; the others step in proportion | `ok`; `error: block` if it moves nothing or its peak or acceleration is 0; `error: rate` if a rate is past MAX_RATE |
| `?` | | Report | `q <pos0> <pos1> <pos2> <queued>`: positions in steps as of the last step taken, and the blocks waiting |
| `!` | | Stop at once and empty the queue; the drivers stay on | `ok` |
| | | Anything else | `error: command` |

On power-up, and each time the serial port opens (which resets the Uno), the streamer prints `arm ready`. The sender
waits 2.5 s for it.

## Timing

| Figure | Value | Source |
|---|---|---|
| MAX_RATE, the fastest block the streamer takes | 8000 steps/s on the major axis | `RATE_LIMIT` in `arm.ino`, and `MAX_RATE` in `send.mjs` (a test holds them equal) |
| What the worked arm asks | up to 8000 steps/s an axis (`maxRate`: 300 rpm of a 200-step motor at 1/8 microstepping is 300 × 1600 / 60), 7799 steps/s in the test drawing | `cad machine arm/arm` and `cad plot` |
| The loop's own ceiling while speeding up, one, two and three axes stepping at once | 9484, 9227 and 8984 steps/s | measured on a simulated 16 MHz Uno (avr8js), the sketch built with RATE_LIMIT raised |
| The loop's own ceiling while slowing down, one, two and three axes | 9395, 9143 and 8904 steps/s | the same |
| The loop's own ceiling at a block's cruise, one, two and three axes | 24615, 22956 and 21505 steps/s | the same |
| STEP pulse width | 3.06 µs high | measured on the simulated Uno; the DRV8825 needs 1.9 µs, the A4988 1 µs (Pololu's DRV8825 carrier page, product 2133, from TI's datasheet) |
| Uno clock | 16 MHz | Arduino Uno Rev3 |

The slowest of these, three axes slowing down at 8904 steps/s, is the loop's ceiling: 1.11 times MAX_RATE, so the
streamer keeps up with any block it takes, with little to spare. A step that changes speed costs a float multiply and
a division (gap = 1000000 / rate), which is why speeding up and slowing down are slower than the cruise (2.7 times
MAX_RATE), where the gap stays as it is. The simulation fails if any of the nine figures falls under MAX_RATE. A step that
an interrupt (the serial line, the clock, the servo) delays is caught up at once, so the gap between two steps can be
as short as the loop allows: about 40 µs. The simulation runs the compiled program an instruction at a time, each
taking its cycles at 16 MHz. A real board has not yet been timed: your bench test does that.

## How the sketch is checked

`node scripts/firmware.mjs` (in the kit's repository) compiles every sketch for `arduino:avr:uno` and fails on a compile
error. With `--simulate <steps file> --machine <machine file>` it also runs this streamer on a simulated Uno, and fails
when any of these does not hold:

| Check | Held to |
|---|---|
| Every line answered | `ok`, homing included |
| Homing | each axis stops at its switch (placed 300 steps away) and backs off by `back` steps |
| Steps | each axis's step count and its net position equal the step file's sums, and the streamer's own `?` report agrees |
| Keeping up | the moves take no more than 5% longer than `cad plot` planned |
| MAX_RATE | a block 1 step/s past it is answered `error: rate`, a block at it `ok` |
| Ceiling | the loop steps three axes faster than MAX_RATE, and no axis of the machine asks more than MAX_RATE |
| STEP pulse | at least 1.9 µs high |
