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
| 7. Fixings coupons (once in PLA, once in PETG) | `fixings-coupon`, and `holds-coupon` behind it on the same plate: a plate and 13 loose pieces (`cad plates benchmarks/fixings-test` lays out both) | 55 g and 40 g, 94 g on one plate, about 105 minutes (`cad plates` estimate) | 22 to 28, 40 to 47 |
| 8. Slot coupon (when you build with aluminium beams) | `slot-coupon` (26 loose pieces) | 40 g, about 45 minutes | 29 to 33 |
| 9. Joint rig (when you build frames of beams) | `joint-hanger` × 3, `joint-gauge`, `nut-puller`, and the rig's printed corner bracket (`cad plates benchmarks/joint-test` lays out all six) | 82 g, about 90 minutes | 34 to 37 |
| 10. Beam coupon (when you print beams for a frame; once in each plastic) | `k1`, a printed 1515 beam lying down, and `k2`, the same standing up (`cad plates benchmarks/beam-test` lays out both) | 79 g, about 2 hours | 38, 39 |

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
| **For the holds coupon** | Steel dowel pins 3 × 12 mm (ISO 8734 or ISO 2338 m6): two; a few 12 mm lengths of 1.75 mm filament, cut square; disc magnets 6 × 3 mm and 8 × 3 mm, N35 or stronger: three 6 × 3 and four 8 × 3 (sold in tens); a steel M8 hex nut and an M8 washer, for the pull bolt; two blocks of wood and a G-clamp; a loop of strong cord; the joint rig's luggage scale (it reads to 50 kg); a vice, or two scraps of wood to press magnets between |
| **For the slot coupon** | An offcut of your own beam, 50 to 100 mm long, cut square at one end; M2.5 hex nuts and M2.5 × 8 screws for slot 6, M5 hex nuts and M5 × 10 screws for slot 8; one of the bought slot nuts made for your beam (slide-in or drop-in) |
| **For the joint rig** | 2020 beam of MISUMI's HFS5 kind (or your own 20 mm beam): one 400 mm length and three of 150 mm, cut square (one metre does: `cad beams benchmarks/joint-test` gives each one's sheet), each short one tapped M5 18.5 mm deep at its outer end and `c1` at both, and `c3` drilled with a 7.1 mm hole through one wall, its centre 10 mm from its inner end, for the HMJ5 (MISUMI's M hole for HFS5: `c3`'s sheet says which face); a 7.1 mm drill; one MISUMI HMJ5 centre joint; M5 slide-in slot nuts for 6 mm slots: five, and one of each kind you want to test; M5 button-head screws: 12 mm × 2, 16 mm × 3, 25 mm × 2; M5 cap screws 12 mm × 2; an M4 × 16 screw and nut for the dial's clamp; a dial indicator reading 0.01 mm with an 8 mm stem; a 2 kg mass that hangs (a 2 litre bottle of water and an S-hook or a loop of cord); a luggage scale reading to 50 kg; two G-clamps |
| **For the beam coupon** | Two round bars about 8 mm across and 60 mm long (M8 bolts or offcuts of rod), laid on the table 220 mm apart, centre to centre; a loop of cord; the joint rig's 2 kg mass, dial indicator and luggage scale |
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
| 25 | Nut slots, rows TM3 and TM4 (the back edge) | Each figure is the clearance across the flats. Drop a nut into the slot from the top, then run a screw in from the coupon's back edge through it and tighten. The best is the tightest the nut drops into by hand, that keeps it when the coupon is turned over, and where it does not turn as the screw tightens. `x1c.nut_slip=<figure>` | 0.1 mm (`x1c.slip`) | |
| 26 | Counterbore, CM3 | Drive an M3 × 8 cap screw in: its head sits wholly under the top face, a hex key reaches it, and it tightens in the pilot under it. If the head rubs, raise `x1c.fit` | `x1c.fit` 0.2 mm each side | |
| 27 | Printed threads, rows M6P, M8P, M10P | Each figure is the gap on the radius between the printed thread and a bought bolt. Turn a bolt into each by hand. The best is the tightest it turns all the way into smoothly, with no binding and no wobble, and that does not strip when tightened firmly with a spanner. Where the sizes differ, take the figure two of the three agree on. `x1c.thread_gap=<figure>` | 0.2 mm, an estimate | |
| 28 | Thread flanks, M8P against M8S | Rows M8P and M8S are the same holes in the two forms a printed thread can take: P has its down-facing flanks laid back to 45° (the kit's default, easy to print, about 51% of the standard's flank overlap at 0.2 mm), S keeps the standard's 60° form (more overlap, 63%, but its down-facing flanks overhang 60°). Compare them at each gap, in this order: it holds (tighten a bolt firmly with a spanner: no stripping, the least wobble), it turns smoothly (no catching all the way in), it prints clean (look into the hole with a light: whole teeth, no drooping or strings on the flanks' undersides). The form that wins the first test wins, and the next test settles a tie. Write 45 for P or 60 for S: `x1c.thread_flank=45`. It records the result; changing the kit's default form is a decision of its own | 45, the printed form | |
| 29 | Tongues, slot 6 and slot 8 | Each tongue's figure is its clearance a side in the beam's opening. Lay the head on the beam's face with the tongue in the slot and push it the beam's length from the square end. The best is the tightest that slides all the way by hand, and does not rattle when the beam is shaken across. `cad measured benchmarks/slot-test x1c.slot_fit=<figure>` | 0.2 mm a side (`x1c.fit`, community) | |
| 30 | Carriers, slot 6 (M2.5) and slot 8 (M5) | Each carrier's figure is its clearance a side all round the slot. Drop its nut into its side (or its end), slide it into the beam from the square end, and run a screw into it through a scrap of plate. The best is the tightest that slides the beam's length by hand, nut in, and that pulls up square when the screw is tightened. Where it is looser than the tongue in 29, write the carrier's figure to `x1c.slot_fit` instead: a part that fills the slot needs the larger | 0.2 mm a side | |
| 31 | Printed slots, slot 6 and slot 8 | Each block's figure is how far its printed slot is opened a side. Slide a bought slot nut for your beam down each from the top. The best is the tightest it runs the length of by hand without catching, and that holds it upright when the block is tipped on its side. `x1c.printed_slot_fit=<figure>` | 0.2 mm a side | |
| 32 | The slot itself, by caliper | On the beam's square end: the opening across the face, the lips' thickness, the cavity's width under the lips and its depth from the face (the depth rod of the calipers). Write each to the slot set your beam's profile names, or to `slot-6` or `slot-8` for an unbranded beam: `cad measured benchmarks/slot-test slot-8.opening=<mm> slot-8.lip_thickness=<mm> slot-8.cavity_width=<mm> slot-8.cavity_depth=<mm>`. They go in your workspace's copy of the set as measured, and cad refuses figures that make no slot | slot 6: opening 6, lips 1.5, cavity 12 wide, 5.5 deep. Slot 8: 8, 2.2, 16.5, 9 (community figures) | |
| 33 | The fit, confirmed | With 29 to 32 written back, print again the carrier whose figure you wrote to `x1c.slot_fit`: `cad export benchmarks/slot-coupon --part slot-8-carrier-<figure>` (or `slot-6-`). It is now drawn from your measured slot. It should slide as that carrier did in 30; a design's own carriers take the same fit with `printer: v.x1c` | | |
| 34 | A blind join's spring (rig beam `c1`) | Clamp the base beam to the table along its edge, its front face over the edge, so the three rig beams stand out into the room. Put the dial arm on the base beam over `c1`'s join (its two screws into slide-in nuts in the top slot), the dial's stem in its clamp, the plunger resting on the hanger's top edge with a few millimetres pressed in. With the hook on and nothing hung from it, set the dial to 0. Hang the 2 kg mass gently, wait 30 seconds and read the dial; lift the mass off and check the dial comes back to 0 within 0.01 mm. Do it three times and write the mean: `cad measured benchmarks/joint-test c1.drop=<mm>`. Weigh the mass first: if it is not 2 kg, change the three loads in `joint-test.json` to what it weighs | 0.344 mm, of which the beam's own bending is 0.044 mm (`joins.blind_bending` 1.5 N·m/mrad, an estimate) | |
| 35 | A printed corner bracket's spring (`c2`) | As 34, the dial arm moved along the slot over `c2`'s join: `cad measured benchmarks/joint-test c2.drop=<mm>`. cad works out the joint's spring from it and writes it as a share of the bracket's own stiffness by finite elements, so every printed bracket of that kind after it is taken at that share | 2.158 mm (the bracket's own 0.213 N·m/mrad, by finite elements, taken whole: `joins.bracket_printed_share` 1, an estimate) | |
| 36 | A bought fitting's spring (`c3`, MISUMI's HMJ5 centre joint) | As 34, over `c3`'s join: `cad measured benchmarks/joint-test c3.drop=<mm>`. The spring goes to `fitting-misumi-hmj5.bending_stiffness`. With another maker's beam, join `c3` with a bought fitting made for its slot, and the spring goes to that fitting's set | 0.269 mm (`fitting-misumi-hmj5.bending_stiffness` 2 N·m/mrad, an estimate) | |
| 37 | A slot nut's hold along its slot | Screw the nut puller onto the slot nut under test in the base beam's top slot, the hook's hole toward the beam's nearer end. Tighten the screw as the nut's maker says, or firmly by hand with the short arm of a hex key. Hook the luggage scale through the hole and pull along the slot, slowly and level, until the nut moves; the scale's peak is the figure. Three times on fresh places along the slot, and write the least: `cad measured benchmarks/joint-test slot-nut-6-misumi-m5-slide-in.hold_along=<N>` (newtons: kilograms × 9.81), naming your nut's set. If it holds at the scale's top, write the top and say so with `--source` | Nothing: no maker publishes it | |
| 38 | A printed beam's stiffness (beam coupon `k1` lying, `k2` standing) | Lay `k1` across the two bars, 10 mm of it past each, its slot up. Rest the dial's plunger on its top at the middle, the dial held on the joint rig's arm on its base beam laid beside it, and set it to 0. Hang the 2 kg mass from a loop of cord round the coupon's middle, wait 30 seconds, read the dial; lift it off and check it comes back to 0 within 0.01 mm. Three times, and write the mean: `cad measured benchmarks/beam-test k1.sag=<mm>` (and `k2.sag`). The modulus a printed beam bends at goes to your copy of the plastic's set as `beam_modulus` (`beam_modulus_z` from `k2`), measured | `k1` 0.579 mm, `k2` 0.718 mm (PLA's data sheet modulus, 2680 and 2160 MPa, and the section from 3 walls and 40% infill: estimates) | |
| 39 | A printed beam's strength | Last, as 38 with the bars on two blocks so the cord hangs clear below: hook the luggage scale in the cord's loop and pull straight down, slowly, until the coupon breaks. The scale's peak is the figure, in kilograms: `cad measured benchmarks/beam-test k1.break=<kg>` (and `k2.break`). The stress it broke at goes to the plastic's set as `beam_strength` (`beam_strength_z`). Wear glasses: PLA snaps | `k1` 26.3 kg, `k2` 15.8 kg (39 MPa along the layers, 23.4 across: the second an estimate) | |
| 40 | Snap pins' barb, the six loose snap pins | Each pin has one, two or three notches down its foot: barb 0.3, 0.4 and 0.5 mm past its peg. Hold the plate over the table's edge so a barb can come out underneath, push each 4 mm pin from the top through the middle socket of row S4, and pull it back by its foot; then the 3 mm pins in S3. The best is the deepest barb that still clicks through by hand and holds when pulled firmly. `cad measured benchmarks/fixings-test x1c.snap_barb=<figure>`. It records the result: pins are still drawn with a 0.4 mm barb unless their name says another (`snap pin 4x6 barb 0.5`) | 0.4 mm | |
| 41 | Snap pin sockets, rows S3 and S4 | Each figure is the gap round the peg, each side, as drawn. Push the pin that won 40 through each socket of its row. The best is the tightest it clicks through by hand, and that does not rock once through. `x1c.snap_clearance=<figure>` | 0.2 mm, an estimate | |
| 42 | Pins pressed, rows D3P and FP | Each figure is how much smaller the hole is drawn than the pin, past the hole compensation. Press a 3 × 12 mm dowel into each hole of D3P by hand or in a vice, and a 12 mm length of filament into each of FP. The best goes in straight without splitting its boss and cannot be pulled out by hand. Where the two rows differ, write the dowel's. `x1c.pin_press=<figure>` | 0.05 mm, an estimate | |
| 43 | Pins slipping, rows D3S and FS | Each figure is how much larger the hole is drawn than the pin, past the hole compensation. Slide a dowel into each hole of D3S by hand and turn it, then a length of filament in FS. The best is the tightest it slides into and turns freely in, without rattling. `x1c.pin_slip=<figure>` | 0.2 mm, an estimate | |
| 44 | Magnet pockets, rows 6x3 and 8x3 | Each figure is how much smaller the pocket is drawn than the magnet, past the hole compensation. Press a magnet into each with a thumb, or in a vice between two scraps of wood. The best goes in flush without splitting the wall, and stays in when the plate is turned over and tapped on the table. Push each out again with a length of filament through the hole under it. `x1c.magnet_press=<figure>`. The glued fit is not printed here: keep `x1c.magnet_glue` unless a glued magnet will not go in, and then raise it by 0.1 | 0.1 mm, an estimate. The kit warns that it stretches a pocket's wall close to PLA's strength (24.6 MPa for 8 × 3, 32.8 MPa for 6 × 3, against 39) | |
| 45 | Crush ribs, row 8x3R | Each figure is how far inside the magnet the ribs' tips stand, past the hole compensation. Press an 8 × 3 magnet into each by hand. The best goes in flush by hand and holds when the plate is turned over and tapped. `x1c.magnet_crush=<figure>` | 0.2 mm, an estimate | |
| 46 | Printed bolts in printed nuts, rows M8N and M10N, and the six loose bolts | Each figure is the thread gap on the radius, half of it drawn in the nut and half in the bolt; each loose bolt has one, two or three notches down its head for the first, second and third figure of its row. Turn each bolt through its own nut by hand. The best is the tightest that turns all the way through smoothly, without binding or wobble, and does not strip when tightened firmly by hand on its head (a printed thread takes no spanner). This is a second reading of the gap in 27: the kit draws a printed pair from the same `x1c.thread_gap`. Where the two differ, write the larger, so both turn | 0.2 mm, an estimate | |
| 47 | A printed bolt's strength across its layers, the pull bolt | Last. Clamp two blocks of wood to the table, 10 mm apart and standing past its edge. Push the pull bolt up through the gap from below, put an M8 washer and a steel M8 nut on its thread, and run the nut down finger tight. Tie a loop of cord round the waist above the head, hook the luggage scale in it and pull straight down, slowly, until the waist breaks. The scale's peak in kilograms, times 9.81, over the waist's 7.07 mm² (3 mm across), is the strength in MPa: kilograms × 1.388. `cad measured benchmarks/fixings-test pla.strength_z=<MPa>` (from the PETG print, `petg.strength_z`). Wear glasses | 28.1 kg (PLA's 39 MPa along its layers: its data sheet gives no figure across them); 16.6 kg for PETG (23 MPa) | |

Number 11 is a correction to 7 to 9. Take number 16 last: it wrecks the gears.

The fixings coupon (22 to 28) is one plate with a figure beside every feature, and each row named on its left: a
pilot row by its thread (M4), then I for insert holes, N for nut pockets, T for nut slots, C for the counterbore,
and a printed thread by its size and form (M8P, M8S). The figure beside a feature is the one to write back. Print it
once in PLA and once in PETG, both upright as it is drawn. A pilot or an insert hole is written per plastic: the PLA
figure without a suffix, the PETG one with `_petg`. The nut fits, the thread gap and the flank form are one figure per
printer: write the PLA figure, and note the PETG one in the last column where it differs. `cad history
benchmarks/fixings-test` then shows each against what the kit drew before.

The holds coupon (40 to 47) measures what holds two parts together without a steel screw. It prints beside the fixings
coupon, on the same plate: a plate with a row for each fit, named on its left, and 13 loose pieces. S3 and S4 are
sockets for 3 and 4 mm snap pins, their figure the gap round the peg; D3P and FP are holes a 3 mm dowel or 1.75 mm
filament is pressed into, D3S and FS holes it turns in; 6x3 and 8x3 are pockets disc magnets are pressed into, 8x3R a
pocket with three crush ribs; M8N and M10N are printed nuts, a hex nut's height, for printed bolts. The loose pieces are
the six printed bolts for those nuts, the pull bolt with its waist, and six snap pins, three of each size. A loose piece
says its figure by notches: one, two or three, for the first, second and third figure of its row. The snap sockets go
through the plate, and each magnet pocket has a hole under it to push the magnet out, so its first layer has a few
round holes; everything else stands on a plain first layer. Every feature is drawn from the printer's rules through
@rulecad/fixings, at the kit's figure and a step either side, so the coupon printed again after cad measured is centred
on yours. The fits are one figure per printer: write the PLA figure, and note the PETG one where it differs. The pull
bolt measures the plastic, so it is written per plastic. `cad measured` refuses a figure no fit of its kind can be, and
a strength across the layers above the plastic's strength along them. `cad history benchmarks/fixings-test` then shows
each against what the kit drew before.

The slot coupon (29 to 33) is 26 loose pieces, each with its figure, the clearance a side, on top: in the front row
five tongues for slot 6 and five for slot 8 (a T-shaped key, its head on the face and its tongue in the opening), in
the middle row five carriers for each (a block that slides in the slot holding a hex nut), and at the back three short
printed slots for each, standing on end. The slot 8 pieces are the larger. Slot 6 is the slot of 20 mm beams, slot 8
of 30 and 40 mm beams. Every piece is drawn from the slot's rule set, so once 32 is written back the coupon prints from
your own slot. `cad history benchmarks/slot-test` then shows each figure against what the kit drew before.

The joint rig (34 to 37) measures what every frame prediction rests on: how far a join lets a beam's end turn. A
base beam clamped to the table holds three short beams out from its front face, each by one kind of join: a blind
join (`c1`), a printed corner bracket (`c2`) and a bought fitting (`c3`, MISUMI's HMJ5 centre joint). A printed
hanger on each one's free end carries the mass on a hook under the beam, in line with the plate's middle, and its top
edge is flush with the beam's top for the dial's plunger. `cad check benchmarks/joint-test` predicts each drop
(join.drop): the beam's own bending, F L³ / 3 E I from its profile's sheet, and the join turning on its spring k,
F L² / k. The drop is mostly the join, so the reading measures the join. Written back, cad takes the beam's own
bending off it and writes the join's spring, k = F L² / (drop less the beam's own), into the rule the estimate was
in, as measured with the date: the kind's figure in your workspace's `rules/joins.json` (made from the kit's
estimates the first time), the printed bracket's share of its own stiffness by finite elements, or the bought
fitting's set. Every frame's check then says its joins were measured, and when, and its drops move to match. The
dial arm stands on the base beam beside the join it reads, so the base beam twisting under the load turns the arm
and the rig beam together and reads nothing. The arm itself sags 0.12 mm for each newton the plunger presses up, and
the plunger's spring changes by a small part of a newton over a reading of a few millimetres, so the arm adds a few
hundredths of a millimetre at most to the printed bracket's reading and less to the others. Only bending is measured
here: a join's twist stays an estimate. The nut puller (37) is the same base beam's other use: the load along the
slot at which a tightened slot nut slips, which no maker publishes. It goes in the nut's own set as `hold_along`,
and the nut says it wherever it is used. `cad history benchmarks/joint-test` then shows each figure against what the
kit drew before.

The beam coupon (38 and 39) measures what a printed beam in a frame rests on: how stiff and how strong a beam of walls
and infill is, which no plastic's data sheet gives. Two printed 1515 beams 240 mm long, one printed lying down (its
layers along it) and one standing up (its layers across it), each lie across two round bars 220 mm apart with 2 kg
hung from the middle. `cad check benchmarks/beam-test` predicts each sag (beam.coupon): F L³ / 48 E I, the plastic's
modulus for the way it printed and the section counted from its walls and infill. Written back, cad scales the modulus
by the sag predicted over the sag measured and writes it to your copy of the plastic's set as `beam_modulus`
(`beam_modulus_z` standing up), measured with the date. The break (39) gives the stress it broke at, `beam_strength`
(`beam_strength_z`). Every printed beam in that plastic after it takes these before the data sheet's figures, its creep
limit follows the strength, and `beam.printable` in a frame says it rests on them. A 1515 coupon breaks within the
luggage scale's reach; its figures stand for any printed beam with the same walls and infill (3 and 40%), as the
section is counted the same way for every size. For PETG, change both beams' `material` in `beam-test.json` to
`petg` and print it again. `cad history benchmarks/beam-test` then shows each figure against the prediction.

## Wiring

Stepper drivers go on a CNC Shield V3 on the Uno, one motor to a driver. Set each driver's current before the first
move: on an A4988, the reference voltage is the current × 8 × the sense resistor (R100 is 0.1 Ω; R050 is 0.05 Ω), so 1.0 A on an R100 is 0.8 V.
**Start at 1.0 A.** The motors are rated 1.5 A, and the kit predicts a printed mount will soften if a motor runs that hot for long.

Run servos from their own 5 V supply, not the Uno's 5 V pin, with the grounds joined. The signal goes on the shield's X end-stop pin, which is Arduino pin 9.

`firmware/bench/bench.ino` drives it all from the Serial Monitor at 115200 baud.

## Words used

**Backlash:** the play between meshing teeth. **Detent torque:** what holds a stepper still with no power. **Holding torque:** the most a powered, stopped stepper can resist. **Module:** the tooth size, the pitch diameter over the teeth. **Pilot:** a hole sized for a screw to cut its own thread.
