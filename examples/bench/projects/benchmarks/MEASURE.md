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
| 7. Fixings coupon (once in PLA, once in PETG) | `fixings-coupon` | 55 g, about an hour | 22 to 28 |

Do 1 and 2 first, and change the parts that follow to the sizes that won: `comp` in `test-arm` and `shoulder-sun`, `bore` and `backlash` in the mesh rig's parts.

## Setting up the stand

G-clamp the foot to a table with the plate's front just past the table's edge, so the arm and the shoulder's round housing (wider than the plate) hang clear of it. The motor goes on the back of the plate; the dial, the mesh rig or the shoulder go on the front, on the same four holes.

## What you need

| | |
|---|---|
| **Electronics** | Arduino Uno; CNC Shield V3; three A4988 drivers with heat sinks; a 24 V supply of at least 5 A; a 5 V supply of at least 2 A for servos; a multimeter; jumper wires |
| **Screws, socket head** | M3 × 8: 2. M3 × 10: 9. M3 × 12: 12. M3 nuts: 4. M3 washers: 2 |
| **Measuring** | Digital calipers; a kitchen scale reading to 1 g; a G-clamp; string or small S-hooks; weights from 10 g to 500 g (coins and water bottles will do); a thermometer that reads a surface |
| **For the fixings coupon** | Socket cap screws: M2 × 6, M2.5 × 6, M3 × 6, M3 × 8, M4 × 8, M5 × 16; M3 and M4 hex nuts; CNC Kitchen heat-set inserts, M2 × 3 and M3 × 5.7, and a soldering iron with an insert tip; steel bolts or set screws M6 × 16, M8 × 20 and M10 × 25 or longer; a spanner |
| **Also** | PTFE grease, for the second round of the efficiency test; a spare print's worth of PLA |

## The measurements

Write the number in the last column and send it back: it replaces the kit's figure, marked as measured.

| # | What | How | The kit assumes | Measured |
|---|---|---|---|---|
| 1 | Backlash that turns freely, at each module | Gears on the card's pins, the dots on top: one for 0.1, two for 0.2, three for 0.3. Note the tightest pair of each module that turns without catching over several turns | 0.15 mm | |
| 2 | Smallest module that keeps its tooth shape | Look at the tips of the card's gears under a light | 0.8 | |
| 3 | D-bore for the 5 mm shaft | Press a shaft into row 2 of the fit bar. Note the smallest that slides on, and the largest that grips | 5.3 mm slide | 5.2 mm drawn slides comfortably, 5.1 mm tight; 5.0 mm too tight, 5.3 mm and up too big (2026-11-10, PLA) |
| 4 | Hole size, printed against drawn | Calipers or drill shanks in row 1: drawn minus measured | 0.1 mm | |
| 5 | M3 pilot | Run an M3 screw into each of row 3. Note the smallest that doesn't split and turns by hand with a driver | 2.9 mm | 2.9 mm and 3.0 mm both good; smaller holes send the screw in at an angle (2026-11-10, PLA) |
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
| 22 | Pilots, rows M2, M2.5, M3, M4, M5 | Each figure is the hole as drawn. Drive a screw of that size into each by hand with a driver. The best is the smallest the screw goes into straight, without splitting the boss, that turns with an even drag and cannot be pulled out by hand. `cad measured benchmarks/fixings-test x1c.pilot_m4=<figure>` (and `pilot_m2`, `pilot_m2_5`, `pilot_m3`, `pilot_m5`; from the PETG print, `x1c.pilot_m4_petg`) | M2 2.1, M2.5 2.5, M3 2.9, M4 3.75, M5 4.7 mm | |
| 23 | Insert holes, rows IM2, IM3 | Each figure is the hole as drawn. Set an insert in each with the iron. The best goes in straight and flush, pushes no ring of plastic up round it, and does not turn when a screw is tightened in it. `x1c.insert_m2=<figure>`, `x1c.insert_m3=<figure>` (`_petg` from the PETG print) | 3.2 and 4.0 mm, the insert maker's | |
| 24 | Nut pockets, rows NM3, NM4 | Each figure is the clearance across the flats. Press a nut in with a thumb, then drive a screw into it from the top. The best is the tightest the nut goes into by hand and does not turn in as the screw is driven. `x1c.nut_fit=<figure>` | 0 mm (a snug fit) | |
| 25 | Nut slots, rows TM3 (front edge) and TM4 (back edge) | Each figure is the clearance across the flats. Drop a nut into the slot from the top, then run a screw in from the edge through it and tighten. The best is the tightest the nut drops into by hand, that keeps it when the coupon is turned over, and where it does not turn as the screw tightens. `x1c.nut_slip=<figure>` | 0.1 mm (`x1c.slip`) | |
| 26 | Counterbore, CM3 | Drive an M3 × 8 cap screw in: its head sits wholly under the top face, a hex key reaches it, and it tightens in the pilot under it. If the head rubs, raise `x1c.fit` | `x1c.fit` 0.2 mm each side | |
| 27 | Printed threads, rows M6P, M8P, M10P | Each figure is the gap on the radius between the printed thread and a bought bolt. Turn a bolt into each by hand. The best is the tightest it turns all the way into smoothly, with no binding and no wobble, and that does not strip when tightened firmly with a spanner. Where the sizes differ, take the figure two of the three agree on. `x1c.thread_gap=<figure>` | 0.2 mm, an estimate | |
| 28 | Thread flanks, M8P against M8S | Rows M8P and M8S are the same holes in the two forms a printed thread can take: P has its down-facing flanks laid back to 45° (the kit's default, easy to print, about 51% of the standard's flank overlap at 0.2 mm), S keeps the standard's 60° form (more overlap, 63%, but its down-facing flanks overhang 60°). Compare them at each gap, in this order: it holds (tighten a bolt firmly with a spanner: no stripping, the least wobble), it turns smoothly (no catching all the way in), it prints clean (look into the hole with a light: whole teeth, no drooping or strings on the flanks' undersides). The form that wins the first test wins, and the next test settles a tie. Write 45 for P or 60 for S: `x1c.thread_flank=45`. It records the result; changing the kit's default form is a decision of its own | 45, the printed form | |

Number 11 is a correction to 7 to 9. Take number 16 last: it wrecks the gears.

The fixings coupon (22 to 28) is one plate with a figure beside every feature, and each row named on its left: a
pilot row by its thread (M4), then I for insert holes, N for nut pockets, T for nut slots, C for the counterbore,
and a printed thread by its size and form (M8P, M8S). The figure beside a feature is the one to write back. Print it
once in PLA and once in PETG, both upright as it is drawn. A pilot or an insert hole is written per plastic: the PLA
figure without a suffix, the PETG one with `_petg`. The nut fits, the thread gap and the flank form are one figure per
printer: write the PLA figure, and note the PETG one in the last column where it differs. `cad history
benchmarks/fixings-test` then shows each against what the kit drew before.

## Wiring

Stepper drivers go on a CNC Shield V3 on the Uno, one motor to a driver. Set each driver's current before the first
move: on an A4988, the reference voltage is the current × 8 × the sense resistor (R100 is 0.1 Ω; R050 is 0.05 Ω), so 1.0 A on an R100 is 0.8 V.
**Start at 1.0 A.** The motors are rated 1.5 A, and the kit predicts a printed mount will soften if a motor runs that hot for long.

Run servos from their own 5 V supply, not the Uno's 5 V pin, with the grounds joined. The signal goes on the shield's X end-stop pin, which is Arduino pin 9.

`firmware/bench/bench.ino` drives it all from the Serial Monitor at 115200 baud.

## Words used

**Backlash:** the play between meshing teeth. **Detent torque:** what holds a stepper still with no power. **Holding torque:** the most a powered, stopped stepper can resist. **Module:** the tooth size, the pitch diameter over the teeth. **Pilot:** a hole sized for a screw to cut its own thread.
