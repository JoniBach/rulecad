# The streamer and its sender

A machine in the kit moves with two programs. The streamer runs on an Arduino: it takes blocks of synchronised steps
over the USB serial line and moves the motors. `send.mjs` runs on your computer: it reads a step file that `cad plot`
wrote, homes the machine where it has switches and sends the file to the board a line at a time. The board knows
nothing of the machine's shape. All the maths happens in `cad plot`.

The streamer is one sketch, the same in every project: `firmware/arm/arm.ino` in the arm's project and
`firmware/leg/leg.ino` in the leg's. The board it is compiled for picks its pins:

| Board | Axes | For | Pins |
|---|---|---|---|
| Arduino Uno under a CNC Shield V3 | 3 | the arm, the leg's stand | the shield's: STEP on D2 to D4, DIR on D5 to D7, home switches on D9, D10, D12, enable D8 |
| Arduino Mega 2560, a step driver for each axis on its own breakout | 8 | the quadruped | STEP on D22 to D29, DIR on D37 down to D30, home switches on A8 to A15, enable D38 (the `arduino-mega-2560` rule set) |

The machine description says which board a machine has: `cad machine` reads it from the bought board in the assembly
(`cnc-shield-v3` or `arduino-mega-2560`) and writes it as `controller.board`, and `send.mjs` writes its lines for that
board's axes.

**Status.** The sketch is compiled for the Uno and for the Mega, and run on a simulated Uno and a simulated Mega, on
every push to the kit (the `firmware` job of its tests). The simulation homes the arm and streams the worked arm's
step file, the stand's gait and the quadruped's trot through it. Moving real hardware is your test: each machine's
measured milestone.

## What you need

| | |
|---|---|
| **Board** | Arduino Uno (16 MHz), CNC Shield V3 on top, a step driver (DRV8825 or A4988) in each slot used; or an Arduino Mega 2560 (16 MHz) with a DRV8825 on a driver breakout for each axis |
| **On your computer** | Node 20 or later; the Arduino IDE or `arduino-cli` with the `arduino:avr` core and the `Servo` library, to flash the sketch (`--fqbn arduino:avr:uno`, or `arduino:avr:mega` for the Mega) |
| **Wiring** | The shoulder on the shield's X slot, the elbow on Y, a third axis (if any) on Z; the home switches on the X and Y limit pins (D9 and D10), a third axis's on D12; the pen servo's signal on D11 (the Z limit pin on a V3.00 shield). `cad machine` writes the wiring sheet |

## Using it

1. Flash the sketch: `arduino-cli compile --fqbn arduino:avr:uno firmware/arm` then `arduino-cli upload -p <port> --fqbn arduino:avr:uno firmware/arm`, or open `firmware/arm/arm.ino` in the Arduino IDE and upload it.
2. Write the machine description and a step file: `npx cad machine arm/arm` writes `exports/arm/arm.machine.json`, and `npx cad plot arm/arm projects/arm/drawings/test.svg` writes `exports/arm/arm-test.steps.json`. `npx cad plot arm/arm --calibrate` writes the calibration drawing (a 100 mm square and a circle at three places on the sheet).
3. Dry run, with no board: `node projects/arm/send.mjs exports/arm/arm-test.steps.json --machine exports/arm/arm.machine.json --dry-run`. It prints each line it would send with the answer the streamer would give, then a summary. `--quiet` prints the summary only. A dry run has no clock, so it takes each block as finished before the next line: its answer to `?` is the positions summed from the blocks so far, with 0 blocks queued.
4. Draw: `node projects/arm/send.mjs exports/arm/arm-test.steps.json --machine exports/arm/arm.machine.json --port <port>`. It turns the drivers on, homes each axis, sends the file, reports every hundredth line, waits until the last move has run, and turns the drivers off. `--no-home` skips homing.

## A leg on the same streamer

The streamer knows only axes and steps, so a leg runs on it as the arm does. The leg's stand (`projects/leg`, with the
hip's motor on the shield's X slot and the knee's on Y) takes the same sketch, the same drivers and the same sender:

1. Flash the streamer to the stand's Uno, as in step 1 above (`firmware/leg` in the leg's project).
2. Write the machine and the gait's step file: `npx cad machine leg/stand` writes `exports/leg/stand.machine.json`, and
   `npx cad plot leg/stand` writes `exports/leg/stand-gait.steps.json`: three cycles of the gait, from the pose the
   assembly shows (`standing`) and back to it. `--cycles 5` plays five, `--pose <name>` starts and ends at another pose,
   and `--period 4` plays a cycle in 4 s. `.preview/leg/stand-gait.svg` draws each axis through the run.
3. Dry run: `node projects/leg/send.mjs exports/leg/stand-gait.steps.json --machine exports/leg/stand.machine.json --dry-run`.
4. Stand the leg in its pose, then send the file with `--port <port>`. The stand has no home switches, so the streamer
   counts from where the motors are when it starts: the file's first block takes the leg from its pose to the cycle, and
   its last brings it back. Once it is back in its pose the drivers go off and the carriage settles on its stop collars.

How the gait becomes blocks:

| | |
|---|---|
| **A block** | The move from one frame of the gait (48 a cycle) to the next, every axis in it, at the rate that keeps to the gait's period |
| **Too fast for a motor** | A block that would step an axis past its `maxRate` (the motor's working speed, from `cad machine`) is slowed to it, and the cycle takes longer. `cad plot` says by how much, with a warning when a cycle takes over 5% longer than the gait's period. The stand's gait asks the knee for 11712 steps/s at its 2 s period, past the 5333 of a 17HS4401 at 200 rpm and 1/8 steps, so a cycle takes 2.89 s on the motors |
| **A joint turning back** | Where a foot lifts off or sets down, a joint reverses. The run slows there so that no axis changes speed by more than its jump at once: an eighth of its `maxRate`, the rate `cad machine` homes it at from rest. It speeds up and slows down at no more than 4 × `maxRate` steps/s², full speed in 0.25 s. Both are estimates: no motor's start-stop rate under load has been measured yet |
| **From the pose and back** | A move from rest to rest at half the axes' fastest |

## Eight axes on a Mega 2560

The quadruped has eight motors, more than the Uno's three. It carries an Arduino Mega 2560, which runs the same
streamer built for eight axes, and a DRV8825 for each motor on its own driver breakout. One board steps every leg in
the same blocks; two Unos kept in step would need a clock shared between them, and each would start its blocks when
its own line arrived. Each motor's wire goes to its breakout's terminals; each breakout's EN, STEP, DIR and GND go to
one of the Mega's slots, `S0` to `S7`, the streamer's axes 0 to 7. `cad machine leg/quadruped` lists them:

| Slot | Axis | STEP | DIR | Home switch |
|---|---|---|---|---|
| S0 | fl_hd, the front left hip | D22 | D37 | A8 |
| S1 | fl_kd, its knee | D23 | D36 | A9 |
| S2 | fr_hd | D24 | D35 | A10 |
| S3 | fr_kd | D25 | D34 | A11 |
| S4 | bl_hd | D26 | D33 | A12 |
| S5 | bl_kd | D27 | D32 | A13 |
| S6 | br_hd | D28 | D31 | A14 |
| S7 | br_kd | D29 | D30 | A15 |

The drivers' EN pins all go to D38. STEP on one port (port A) lets the streamer step every axis due on a tick in one
write, and DIR on another (port C) sets them all in one write at a block's start.

1. Set each breakout's microstep switches to 1/8, as `cad machine` counts them (1600 steps a turn): M0 and M1 on,
   M2 off (the DRV8825's mode table: MODE0 and MODE1 high is 1/8). The breakouts come with every switch on, which is
   1/32: left like that, every joint moves a quarter as far as the file asks. Set each driver's current too, as on the
   stand (its trimmer, Vref = current / 2 at 0.1 ohm).
2. Wire a 12 V supply's 12 V and ground to each breakout's motor terminals. Eight motors take about 6 A, four times
   the stand's 1.5 A for two (an estimate, until measured), past the bench supply: the quadruped lists a Mean Well
   LRS-100-12 (8.5 A) to buy.
3. Flash the streamer for the Mega: `arduino-cli compile --fqbn arduino:avr:mega firmware/leg` then
   `arduino-cli upload -p <port> --fqbn arduino:avr:mega firmware/leg`. It says `streamer ready, 8 axes`.
4. `npx cad machine leg/quadruped` and `npx cad plot leg/quadruped`: three cycles of the trot from the pose `standing`.
5. Dry run: `node projects/leg/send.mjs exports/leg/quadruped-gait.steps.json --machine exports/leg/quadruped.machine.json --dry-run`.
   Without `--machine` the sender writes for the Uno's three axes and refuses the file.
6. Stand the robot in its pose, then send with `--port <port>`. A sender whose lines are for one board refuses to send
   to a streamer that says it was built for the other.

## Homing

The arm homes on switches: each axis steps towards its switch until it closes (`h`). The legs have no switches yet,
so the streamer counts from where the motors stand when it starts, and each gait file starts and ends at a pose you
set by hand. Switches are the way to home here: the DRV8825's current limit is set with its trimmer ("the trimmer
potentiometer on the board can be used to set the current limit", Pololu's DRV8825 carrier page, product 2133), so the
streamer cannot turn the current down to home against a stop, and the driver cannot tell a stall (homing without
switches, as Klipper does it, needs "a stallGuard capable TMC stepper driver", Klipper's TMC drivers page). Against a
stop at the stand's 0.5 A, a 17HS4401 holds about 0.4 x 0.5 / 1.5 = 0.13 N m, through the 38:1 gearbox at 47%
2.4 N m on the printed joint at every homing, five times the 0.48 N m the trot asks of a hip. The streamer and the
sender already home any axis with a switch (`home` on its joint, as the arm's), on the Mega's A8 to A15 as on the
shield's limit pins; the leg's printed parts do not yet carry a switch's post and a flag to press it.

## The line protocol

115200 baud, 8 data bits, no parity, 1 stop bit. One command a line, ended by a newline. The streamer answers every
line once: `ok` when it has taken the line, or `error: <what>` when it cannot. A block's `ok` means it is queued, not that
it has run: up to 12 can still be waiting when the last one is answered. The sender waits for that answer before
it sends the next line. That is the flow control: a line that finds the queue full is held until a block finishes,
and only then answered, so the 12-block queue never overruns. A line is at most 95 characters on the Uno and 127 on the
Mega. Every number is a whole number.

The streamer reads a line a character at a time as it arrives, between steps, so a line costs it no more than its bytes
take on the wire. Because the sender waits for each answer, a block must last at least as long as its own line, the
newline and the 4-byte answer (`ok`, then a carriage return and a line feed) take to cross the serial line, plus the
time the USB link holds them: otherwise the queue runs dry and the motors stop between blocks. `send.mjs` refuses such a
block, naming its line, before it sends anything (see Timing). `cad plot` plans none that short: the arm's task gives
`"blockTime": 0.011`, the least seconds a move lasts, and a shorter move is slowed until it lasts that long.

| Command | Arguments | What it does | Answers |
|---|---|---|---|
| `e` | | Drivers on: the motors hold | `ok` |
| `d` | | Drivers off: the motors go slack. Like `h`, it waits until every block, pen move and wait queued before it has run, so the last moves never run slack | `ok`, once the drivers are off |
| `h` | axis, direction, rate, back | Home one axis (0, 1 or 2 on the Uno, 0 to 7 on the Mega): step towards direction (1 or -1) at rate steps/s until its switch closes, then step back off it by back steps, and call that position 0. It waits for the queue to empty first | `ok`; `error: endstop` if the switch has not closed after 60 s; `error: home` for a bad axis or rate |
| `p` | degrees, milliseconds | Queue the pen servo to degrees, then a wait of milliseconds before the next block | `ok` |
| `w` | milliseconds | Queue a wait | `ok` |
| `m` | a, b, c, entry, peak, exit, accel, up, down | Queue a block: signed steps on each axis (axes 0, 1 and 2 on the Uno; eight numbers, axes 0 to 7, on the Mega); the major axis's rate at entry, at its peak and at exit (steps/s); its acceleration (steps/s²); the major axis's steps spent speeding up, and slowing down. The major axis is the one with the most steps; the others step in proportion | `ok`; `error: block` if it moves nothing or its peak or acceleration is 0; `error: rate` if a rate is past MAX_RATE |
| `?` | | Report | `q <pos0> <pos1> <pos2> <queued>` (eight positions on the Mega): positions in steps as of the last step taken, and the blocks waiting |
| `!` | | Stop at once and empty the queue; the drivers stay on | `ok` |
| | | A line over 95 characters (127 on the Mega), or a number in it that is not a whole number | `error: line` |
| | | Anything else | `error: command` |

On power-up, and each time the serial port opens (which resets the board), the streamer prints
`streamer ready, 3 axes` (`8 axes` on the Mega). The sender waits 2.5 s for it, and refuses to send lines written for
the other board.

**The end of a job.** The sender's last line is `d`. Before it, the sender asks `?` every 100 ms until no block is
queued and no axis has moved since the last answer (`?` counts the blocks waiting, not the one running, so a count of
0 alone can mean the last block is still under way), then sends `d`, which the streamer itself holds until everything
queued has run. So the drivers stay on until the last step, and the final `done` comes when the machine has stopped.
A streamer flashed before November 2026 turned the drivers off the moment `d` arrived, with the last blocks still to
run: the sender's wait keeps such a board safe, but reflash it to be sure (step 1 above).

## Timing

| Figure | Value | Source |
|---|---|---|
| MAX_RATE, the fastest block the streamer takes | 8000 steps/s on the major axis | `RATE_LIMIT` in `arm.ino`, and `MAX_RATE` in `send.mjs` (a test holds them equal) |
| What the worked arm asks | up to 8000 steps/s an axis (`maxRate`: 300 rpm of a 200-step motor at 1/8 microstepping is 300 × 1600 / 60), 7799 steps/s in the test drawing | `cad machine arm/arm` and `cad plot` |
| The loop's own ceiling while speeding up, one, two and three axes stepping at once | 16547, 15288 and 14208 steps/s | measured on a simulated 16 MHz Uno (avr8js), the sketch built with RATE_LIMIT raised: the mean over a long block's middle steps |
| The loop's own ceiling while slowing down, one, two and three axes | 16376, 15142 and 14082 steps/s | the same |
| The loop's own ceiling at a block's cruise, one, two and three axes | 35777, 30370 and 26384 steps/s | the same |
| On the Mega, one to eight axes, speeding up | 15726, 14587, 13601, 12741, 11982, 11309, 10708 and 10167 steps/s | the same, on a simulated 16 MHz Mega 2560 |
| On the Mega, slowing down | 15504, 14395, 13435, 12594, 11853, 11194, 10604 and 10074 steps/s | the same |
| On the Mega, at the cruise | 33135, 28452, 24929, 22183, 19982, 18177, 16672 and 15397 steps/s | the same |
| What the quadruped asks | up to 5333 steps/s an axis (200 rpm at 1/8: 200 x 1600 / 60) | `cad machine leg/quadruped` |
| A byte on the serial line | 86.8 µs | 115200 baud, 10 bits a byte (start, 8 data, stop) |
| A line's cost to the streamer | its bytes, its newline and the 4-byte answer on the wire, and nothing more measurable | measured on the simulated Uno: a 36-character block line and its answer take 3.55 ms there, against 3.56 ms on the wire (before the streamer parsed as it read, 3.87 ms) |
| The USB turnaround | 5.1 ms, an estimate | the Uno's USB chip (an ATmega16U2 running Arduino-usbserial) passes the answer on when its timer 0 overflows, 256 × 256 / 16 MHz = 4.1 ms (`Arduino-usbserial.c` in ArduinoCore-avr, read 2026-11-23); then up to a 1 ms USB frame for the next line. Copies with a CH340 USB chip differ |
| The least time a block lasts | (characters in its line + 1 + 4) × 86.8 µs + 5.1 ms: 8.66 ms for a 36-character line, 70 steps at MAX_RATE | `leastBlockTime` in `send.mjs`, from the three rows above |
| The arm's planned least block time | 0.011 s (`task.blockTime` in `assemblies/arm.json`) | the least time for a 60-character line, 10.74 ms; the worked file's block lines are 34 to 41 characters |
| STEP pulse width | 3.06 µs high | measured on the simulated Uno; the DRV8825 needs 1.9 µs, the A4988 1 µs (Pololu's DRV8825 carrier page, product 2133, from TI's datasheet) |
| Uno clock | 16 MHz | Arduino Uno Rev3 |

The slowest of the Uno's nine ceilings, three axes slowing down at 14082 steps/s, is 1.76 times MAX_RATE; the slowest
of the Mega's twenty-four, eight axes slowing down at 10074 steps/s, is 1.26 times MAX_RATE and 1.89 times the 5333 the
quadruped asks. Each axis's figures are worked out at a block's start (its steps without their sign, the way it steps,
its pin), and only the axes that move are stepped: the Uno's three-axis ceilings rose 13% with that (12428 to 14082
slowing down), and the Mega's eight-axis one from 8115 to 10074. A step that changes
speed costs a float multiply and a division (gap = 1000000 / rate), which is why speeding up and slowing down are slower
than the cruise (3.30 times MAX_RATE on the Uno), where the gap stays as it is. Past 5000 steps/s the speed is worked out every
other step, over both steps' time: done on every step, three axes slowing down reached only 8904 steps/s, and with lines
arriving the streamer fell 8% behind on short blocks. The simulation fails if any of them falls under MAX_RATE.

The ceilings are measured with one long block and no serial traffic, so they do not show what a stream of short blocks
costs. The simulation streams those too: the shortest blocks the sender passes, at MAX_RATE on three axes, cruising
(29 steps, 3.63 ms) and slowing down on every step (32 steps, 4.0 ms), with no USB turnaround since the simulation has no
USB link. Both keep to their planned time (0.2500 s of 0.2500 s, and 0.2519 s of 0.2519 s); the simulation fails if
either is more than 1% behind. On the Mega the same, on eight axes: 39 steps (4.88 ms) cruising and 42 (5.25 ms)
slowing down, 0.2534 s of 0.2534 s and 0.2519 s of 0.2519 s. Before the streamer parsed as it read, the same streams took 8% and 16% longer, and
3-axis blocks of 20 steps at MAX_RATE took 55% longer: such blocks are now refused by the sender.

A step that an interrupt (the serial line, the clock, the servo) or a block's start delays is caught up at once, so one
gap can be as long as about 240 µs and the next as short as about 50 µs; the steps keep to their planned times on
average. The simulation runs the compiled program an instruction at a time, each taking its cycles at 16 MHz. A real
board has not yet been timed: your bench test does that, and the USB turnaround with it.

## How the sketch is checked

`node scripts/firmware.mjs` (in the kit's repository) compiles every sketch for `arduino:avr:uno`, and the streamer for
`arduino:avr:mega` too, and fails on a compile error. With `--simulate <steps file> --machine <machine file>` it also
runs this streamer on a simulated board, the Uno or the Mega as the machine's controller says, and fails when any of
these does not hold. The two flags can be given again for another step file: the kit's tests stream the arm's drawing,
the stand's gait and the quadruped's trot, each with its own machine, and measure the loop's own ceilings once on each
board. On the simulated Mega the trot's 148 lines stream in 14.43 s against 14.52 s planned, every one of its
178596 steps counted and the streamer's own report back at 0 on all eight axes.

| Check | Held to |
|---|---|
| Every line answered | `ok`, homing included |
| Homing | each axis stops at its switch (placed 300 steps away) and backs off by `back` steps |
| Steps | each axis's step count and its net position equal the step file's sums, and the streamer's own `?` report agrees |
| Keeping up | the moves take no more than 5% longer than `cad plot` planned |
| Short blocks | the shortest blocks the sender passes, streamed at MAX_RATE on every axis (three, or eight), cruising and slowing down on every step, take no more than 1% longer than planned |
| MAX_RATE | a block 1 step/s past it is answered `error: rate`, a block at it `ok` |
| Ceiling | the loop steps one to all its axes faster than MAX_RATE at the cruise, speeding up and slowing down (nine figures on the Uno, twenty-four on the Mega), and no axis of the machine asks more than MAX_RATE |
| STEP pulse | at least 1.9 µs high |
| Drivers off | every step of the job comes before the enable pin goes high, the lines sent through `send.mjs`'s own `stream`; `test/firmware-disable.test.mjs` checks the same for the arm and the stand, and that the streamer's `d` and the sender's wait each keep the drivers on alone |
