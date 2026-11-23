# Machines: from a task to a drawing

A machine in rulecad is an assembly with a `task` at the top: the tool, the sheet or volume it works in, how fast and how
accurately. Everything else (the shopping list, the plates, the wiring sheet, the firmware's settings and the step file) is read
from that one assembly, so none of it can disagree with the model. This guide walks a two-link arm with a pen from its task to
a drawing on paper, in commands, starting from nothing. It needs Node.js, a 3D printer, and to order a handful of parts. The
worked example it follows, with every design choice explained, is [Examples chapter 12](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md#12-a-machine-from-its-task-a-scara-arm-that-draws).

## 1. Make the arm, sized from what it is for

```sh
npm create rulecad my-arm --machine arm --sheet a5 --accuracy 0.3
cd my-arm
```

`--sheet` is `a6`, `a5` or `a4`, laid landscape in front of the arm, and `--accuracy` is the worst error you will accept at the
pen, in mm. Given neither, and with no terminal to ask in, it makes the arm for an A5 sheet at 0.3 mm. The link lengths come from
the sheet: the far corner at 88% of full stretch, and the shortest forearm that still folds to the near edge. It writes them, each
with its reason, in `rules/arm.json`, and the sheet and the accuracy in the assembly's `task`. Other sheets are outside what this
arm's links can be printed for on a 256 mm bed.

What comes with it: the whole arm as an assembly (`projects/arm/assemblies/arm.json`), the bought items and the wires in it, a test
drawing that fits the sheet (`projects/arm/drawings/test.svg`), and the streamer for an Uno (`projects/arm/firmware/arm/arm.ino` and
`projects/arm/send.mjs`).

## 2. Read the task, then check it

```sh
npx cad check arm/arm
```

Look for three lines near the end. `task.reach` says whether the pen can reach the whole sheet, with how much to spare in the worst
corner. `task.speed` says the slowest the pen can go anywhere on the sheet against the speed you asked. `task.accuracy` is the error
budget: every joint's play, twist and step stacked to the pen, worst case and root-sum-square, against your figure. It warns on purpose
when it rests on estimates, as it does here: a gearbox's play is a target until a bench measures it. Say so when you report it.

A check also reads every part for printing, every fit, the motors' torque and heat, the driver's trimmer voltage, the supply and
the wires. A `✗` means the design has a mistake; a `!` means something rests on a figure nobody has measured. Nothing here needs a print to find out.

`npx cad preview arm/arm` draws it. Look at the picture: a check knows what it was told to look for, and a person can see what it missed.

## 3. What to buy and print

```sh
npx cad list arm/arm                   # the shopping list: every bought part, the screws, the wire, the grams of print and the hours
npx cad plates arm/arm                 # every printed part laid out on beds, ready to slice
npx cad wires arm/arm                  # each wire's length through the arm's whole range, its gauge and its pins
```

`cad plates` writes plate assemblies you can export with `npx cad export` as you would any part, and checks each bed.

### The screws

Every screwed joint in the arm but the motor mounts is a `fasten` entry in its assembly (the motors' screws are
counted by their `"fastens": true` fits, and come on the same list): the screw named by its thread and head, the parts it
passes through, and the part it ends in. The holes in the printed parts come from `v.fixings` (the
[`@rulecad/fixings`](../fixings/) package bound to the project's printer), so a clearance hole, a pilot, a counterbore and a
countersink are each sized from the thread's rule set and the printer's, and none is typed by hand. `cad check` follows each
screw through the parts as drawn and chooses the shortest sold length that reaches its end with enough thread engaged.
`cad list` then counts what it chose. For the arm made above (A5, 0.3 mm), it lists:

| Count | Fixing | What it holds |
|---|---|---|
| 4 | M2x10 cap | The two home switches, each on its post |
| 1 | M3x3 set | The pen's clamp screw, down through the shuttle's wall |
| 4 | M3x6 cap | The shoulder motor (m1) on the housing |
| 3 | M3x8 cap | The housing on the base's three columns |
| 4 | M3x8 countersunk | The spindle on the output's flange, the heads flush under the bridge |
| 6 | M3x10 cap | The bridge on the housing's posts, and the three clips on their posts |
| 8 | M3x12 cap | The forearm on the elbow's output, and the elbow motor (m2) on the upper arm |
| 1 | M3x16 cap | The upper arm clamped down on the spindle's hexagon |
| 2 | M3x30 cap | The pen holder in the forearm's yoke |
| 2 | M3 hex nut | The ends of the two yoke screws |

That is 35 screws and 2 nuts, 30.4 g of fixings, bought in packs of 10 (one pack of each size covers it). The servo's own
screws come in its bag and are not listed. Every line in the list says which joint it is for, so a length you do not have
in the drawer can be checked against the joint before you substitute one: give that joint's `fasten` entry a `"length"` and run
`npx cad check arm/arm` again, and the check says whether that screw still reaches, still engages and stops short of the
end of its hole.

## 4. Wire it and set the drivers

```sh
npx cad machine arm/arm                # exports/arm/arm.machine.json: steps per degree, rates, homing, and writes the wiring sheet
```

The check says what voltage to set each driver's trimmer to for the current in the assembly. Read the sense resistors on your own
driver boards first: clones differ, and the voltage follows from them. Power the arm only with the shield's jumpers and the firmware
in place, and flash the streamer before connecting the motors.

```sh
# flash projects/arm/firmware/arm/arm.ino to the Uno, with the Arduino IDE or arduino-cli, then:
node projects/arm/send.mjs exports/arm/arm-test.steps.json --machine exports/arm/arm.machine.json --dry-run
```

The dry run prints each line it would send with the answer the streamer would give, without a port, and refuses a block
faster than the streamer takes (8000 steps/s) or than the machine description gives an axis. `projects/arm/STREAMER.md`
writes up the protocol and the streamer's timing.

## 5. Plan the drawing, then watch it first

```sh
npx cad plot arm/arm projects/arm/drawings/test.svg
```

`cad plot` turns the drawing into joint moves and a step file, refusing a stroke that leaves the sheet. The preview in `.preview/arm/`
animates the arm drawing it: watch it before moving anything real. `npx cad plot arm/arm --calibrate` writes the calibration drawing.

## 6. Draw, and measure

Home the arm, send the file with `node projects/arm/send.mjs <the file> --port <your serial port>`, and draw. Then measure the
drawing: is the square square, does the circle close, how far off are the corners?

```sh
npx cad measured arm/arm arm.play_shoulder=0.03 arm.twist_shoulder=0.015
```

`cad measured` writes a measured figure back where the estimate was, with the date and how it was measured, and the ledger of
predicted against measured grows. `npx cad check arm/arm` then gives you the budget that the arm actually has. The figures above are
examples: use what your bench says, not these.

## A machine on a frame

The arm stands on its own base. A machine with axes along beams (a slider, a plotter, a gantry) stands on a frame
instead, and the frame is part of its error budget: the beam the axis runs on sags, is never quite straight, and
twists. Build the frame first, from [the frames guide](../building-frames/), then put the axis and the task on it in
the same assembly. Here, the box from that guide with a rail along its top front beam, a tool's mass on its
carriage and the task, each written by a command that checks it first:

```sh
npx cad new frame/slide --assembly --title "Box frame with an axis" --frame box --inside 300,300,350 --profile 2020-misumi-hfs5 --join blind --feet levelling
npx cad add guide frame/slide --kind rail rail=rail-mgn12 carriage=MGN12H on=x3.top from=25 length=250 nut=drop-in
npx cad add load frame/slide --mass 1 --at g1-carriage-1.top --note "A 1 kg tool on the carriage"
npx cad set frame/slide task.tool=g1-carriage-1.top "task.volume.x=[100,240]" "task.volume.y=[10,10]" "task.volume.z=[421.5,421.5]" task.accuracy=0.5 task.speed=100 task.accel=1000
```

The assembly they write, laid out shorter here:

```json
{
  "title": "Box frame with an axis",
  "kind": "fit",
  "frame": { "kind": "box", "inside": [300, 300, 350], "profile": "2020-misumi-hfs5", "join": "blind", "feet": "levelling" },
  "guides": [{ "kind": "rail", "rail": "rail-mgn12", "carriage": "MGN12H", "on": "x3.top", "from": 25, "length": 250, "nut": "drop-in" }],
  "loads": [{ "mass": 1, "at": "g1-carriage-1.top", "note": "A 1 kg tool on the carriage" }],
  "task": { "tool": "g1-carriage-1.top", "volume": { "x": [100, 240], "y": [10, 10], "z": [421.5, 421.5] }, "accuracy": 0.5, "speed": 100, "accel": 1000 }
}
```

- The guide places the rail on beam `x3`'s top slot, its screws into drop-in nuts (the blind joins close the slot at
  both ends, so slide-in nuts could never get in: `frame.nut` fails them and names the drop-in), and the carriage on a
  sliding joint `g1-1` with its true travel, 204.2 mm here.
- The task names the tool (the carriage's top), the line it must cover, the accuracy, and the moves: 100 mm/s,
  reached at 1000 mm/s².

`npx cad check frame/slide` then reads the frame for the machine:

- `task.reach`: the carriage covers the line, 32.1 mm from the end of its travel at worst.
- `frame.deflection`: the beam under the rail sags 0.013 mm with the joins' springs, held against the task's 0.5 mm
  and against the rail's own running parallelism (0.016 mm over 250 mm).
- `frame.rack`: the side sway is held against the task's accuracy too: 0.308 mm against 0.5 mm.
- `frame.frequency`: the moves ramp to speed in 0.1 s, which shakes the frame at about 10 Hz; its lowest mode, 24.1 Hz,
  is 2.4 times that, where 2 is wanted.
- `task.accuracy` fails: the carriage can be out by 1.456 mm at worst against 0.5 mm, and it names the biggest term,
  the beam's straightness: MISUMI's figure of 4.33 mm a metre, over the 250 mm rail, is 1.083 mm. A stiffer beam
  would not help, since the beam's sag is a hundredth of that; a straighter one would, or a rail fixed to a ground
  plate, or an accuracy the task can live with.
- `task.speed` warns that nothing drives the slide: a `screw` guide with a motor (`{ "kind": "screw", "guide": "g1",
  "motor": { "model": "nema17" } }`) gives it one, and then the motor's torque, heat and speed are checked as the arm's
  are.

Every frame figure here rests on the joins' springs, which are estimates until the joint rig measures one; the check
says so on each line, and so should you. [Examples chapter 16](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md#16-a-frame-beams-joins-and-an-axis)
builds a frame with a lead-screw axis and its motor in full.

## What this does not do

The kit predicts statics, reach, speed, heat and an error budget. It does not predict how a machine shakes, how a print creeps over
months, or what a bought motor really does. That is what measuring is for. Nothing here has been built and measured by rulecad's
authors yet; the arm's figures that rest on estimates say so.

## Formulas

| What | Formula | Where it comes from |
|---|---|---|
| Reach of a two-link arm | `L1 + L2 >= far / 0.88`, the far corner at 88% of stretch | The speed check: near full stretch the elbow must race |
| Fold to the near edge | `sqrt(L1^2 + L2^2 - 2 L1 L2 cos(20°)) <= near` | The elbow's home switch stops it at 160° of fold |
| Torque at a joint | `tau = F x lever`, N m, the lever in metres | Statics |
| Through a gearbox | `T_out = T_motor x ratio x efficiency` | Compound planetary 38:1, about 47%, an estimate until measured |
| Driver current | `Imax = Vref x 2` on a DRV8825 with 0.1 ohm sense resistors | The driver's data sheet |
| Error at the pen | `sum(angle x lever)` worst case, root of sum of squares otherwise | The Jacobian of the arm |
| A beam's straightness under a rail | `straightness per metre x rail length`: 4.33 x 0.25 = 1.083 mm | The profile's tolerance (MISUMI, JIS special grade) |
| What a move excites | `1 / t` Hz for a move ramping to speed in `t = speed / accel` s: 100 / 1000 = 0.1 s, 10 Hz | `frame.frequency` in cad |

## Sources

- [Examples chapter 12](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md): the arm, in full.
- [Examples chapter 14](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md): a leg from the same parts.
- [`@rulecad/robots`](../robots/): kinematics, reach, toolpaths and gaits, the code the checks use.
