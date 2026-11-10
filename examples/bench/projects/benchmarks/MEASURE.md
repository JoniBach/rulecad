# Benchmarks for a robot joint

Everything the kit predicts about a printed robot joint rests on figures that nobody has measured on this printer. These
parts measure them, one test each. Every part has a plain, solid first layer. Solid masses are given; a slicer's infill makes them lighter.

**Print in PLA at 0.2 mm layers, four walls, 25% infill.** Keep the same spool for the whole set.

## What to print, in this order

| Print | Parts | Solid mass | Measures |
|---|---|---|---|
| 1. Fit bar | `fit-bar` | 31 g | 3, 4, 5 |
| 2. Gear card | `gear-card`, `card-gears` | 46 g | 1, 2 |
| 3. Motor stand | `stand`, `dial`, `test-arm` | 74 g | 6 to 11 |
| 4. Servo stand (when you need servos) | `servo-stand`, `servo-arm` | 18 g | 19, 20 |
| 5. Mesh rig | `mesh-rig`, `rig-pinion`, `rig-wheel`, `rig-lever` (the stand from 3) | 42 g | 12, part one |
| 6. Shoulder | `shoulder-housing`, `shoulder-sun`, `shoulder-planet` × 3, `shoulder-output`, `shoulder-clip` × 3, `shoulder-arm`, `input-lever` | 117 g | 12 to 18 |

Do 1 and 2 first, and change the parts that follow to the sizes that won: `comp` in `test-arm` and `shoulder-sun`, `bore` and `backlash` in the mesh rig's parts.

## Setting up the stand

G-clamp the foot to a table with the plate's front just past the table's edge, so the arm and the shoulder's round housing (wider than the plate) hang clear of it. The motor goes on the back of the plate; the dial, the mesh rig or the shoulder go on the front, on the same four holes.

## What you need

| | |
|---|---|
| **Electronics** | Arduino Uno; CNC Shield V3; three A4988 drivers with heat sinks; a 24 V supply of at least 5 A; a 5 V supply of at least 2 A for servos; a multimeter; jumper wires |
| **Screws, socket head** | M3 × 8: 2. M3 × 10: 9. M3 × 12: 12. M3 nuts: 4. M3 washers: 2 |
| **Measuring** | Digital calipers; a kitchen scale reading to 1 g; a G-clamp; string or small S-hooks; weights from 10 g to 500 g (coins and water bottles will do); a thermometer that reads a surface |
| **Also** | PTFE grease, for the second round of the efficiency test; a spare print's worth of PLA |

## The measurements

Write the number in the last column and send it back: it replaces the kit's figure, marked as measured.

| # | What | How | The kit assumes | Measured |
|---|---|---|---|---|
| 1 | Backlash that turns freely, at each module | Gears on the card's pins, the dots on top: one for 0.1, two for 0.2, three for 0.3. Note the tightest pair of each module that turns without catching over several turns | 0.15 mm | |
| 2 | Smallest module that keeps its tooth shape | Look at the tips of the card's gears under a light | 0.8 | |
| 3 | D-bore for the 5 mm shaft | Press a shaft into row 2 of the fit bar. Note the smallest that slides on, and the largest that grips | 5.3 mm slide | 5.2 mm drawn slides comfortably, 5.1 mm tight; 5.0 mm too tight, 5.3 mm and up too big (2026-11-10, PLA) |
| 4 | Hole size, printed against drawn | Calipers or drill shanks in row 1: drawn minus measured | 0.1 mm | |
| 5 | M3 pilot | Run an M3 screw into each of row 3. Note the smallest that doesn't split and turns by hand with a driver | 2.9 mm | |
| 6 | Motor dimensions | Calipers on boss, hole spacing, shaft, flat | From the drawing | |
| 7 | Holding torque | Driver on, arm's nub on a kitchen scale: push the arm down onto it with the motor holding until it slips. Grams × 9.81 × 0.11 / 1000, in N m | 0.40 N m | |
| 8 | Detent torque, power off | Driver off: hang a light weight from the 25 mm hole until the arm moves | 0.025 N m, a guess | |
| 9 | Torque at speed | Weight on the 50 mm hole, step up the rate until it misses steps. Try three weights | Modelled | |
| 10 | Case temperature | Ten minutes holding, at your driver's current. Thermometer on the case | 80 °C rise | |
| 11 | The arm's own weight | Weigh it: about half its weight acts at its middle, on top of what you hang | | |
| 12 | Efficiency | No motor. Hang a weight from one lever, and add to the other until it just starts to move, both ways round. Efficiency = (output weight × output radius) / (input weight × input radius × ratio). Do it on the mesh rig (ratio 3) for one mesh, on the shoulder with `input-lever` (ratio 38) for the gearbox. Then again with grease | 0.95 a mesh, 47% through the gearbox | |
| 13 | Does it hold, power off | Shoulder, motor on, driver off. Add weight to the arm's 150 mm hole until it moves | Predicted to hold | |
| 14 | Play at the output | Shoulder, motor holding. Move the arm by hand each way, read the pointer on the dial | Not predicted | |
| 15 | Twist under load | Shoulder, motor holding. Pointer reading with no load, 100 g, 200 g and 500 g at 100 mm | Not predicted | |
| 16 | Tooth failure | Last, on a spare planet set: load the arm until something gives, and note what | 33 MPa at stall | |
| 17 | Repeatability | `r x` command, 20 cycles, at 20 mm/s of pointer travel: read the pointer at each return | Unknown | |
| 18 | Fastest move under load | With 200 g at 100 mm, raise the rate until it misses steps | 8 rpm predicted | |
| 19 | Servo stall torque | Arm's 25 mm hole pressing on the scale | 0.18 N m | |
| 20 | Servo dimensions | Calipers on the tabs, hole spacing and output | Community figures | |
| 21 | Bearing press and slip | Print `seats-coupon` once per filament. Press a 608 into each pocket by hand or in a vice: note the tightest that goes in without cracking, then write it back with `cad measured benchmarks/<assembly> x1c.press=<value>` (and `x1c.slip`) | press 0.05 mm, slip 0.1 mm across | |

Number 11 is a correction to 7 to 9. Take number 16 last: it wrecks the gears.

## Wiring

Stepper drivers go on a CNC Shield V3 on the Uno, one motor to a driver. Set each driver's current before the first
move: on an A4988, the reference voltage is the current × 8 × the sense resistor (R100 is 0.1 Ω; R050 is 0.05 Ω), so 1.0 A on an R100 is 0.8 V.
**Start at 1.0 A.** The motors are rated 1.5 A, and the kit predicts a printed mount will soften if a motor runs that hot for long.

Run servos from their own 5 V supply, not the Uno's 5 V pin, with the grounds joined. The signal goes on the shield's X end-stop pin, which is Arduino pin 9.

`firmware/bench/bench.ino` drives it all from the Serial Monitor at 115200 baud.

## Words used

**Backlash:** the play between meshing teeth. **Detent torque:** what holds a stepper still with no power. **Holding torque:** the most a powered, stopped stepper can resist. **Module:** the tooth size, the pitch diameter over the teeth. **Pilot:** a hole sized for a screw to cut its own thread.
