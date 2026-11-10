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

## 4. Wire it and set the drivers

```sh
npx cad machine arm/arm                # exports/arm/arm.machine.json: steps per degree, rates, homing, and writes the wiring sheet
```

The check says what voltage to set each driver's trimmer to for the current in the assembly. Read the sense resistors on your own
driver boards first: clones differ, and the voltage follows from them. Power the arm only with the shield's jumpers and the firmware
in place, and flash the streamer before connecting the motors.

```sh
# flash projects/arm/firmware/arm/arm.ino to the Uno, with the Arduino IDE or arduino-cli, then:
node projects/arm/send.mjs exports/arm/arm-test.steps.json --dry-run
```

The dry run checks the step file against the streamer's protocol and says what it would send, without a port.

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

## Sources

- [Examples chapter 12](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md): the arm, in full.
- [Examples chapter 14](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md): a leg from the same parts.
- [`@rulecad/robots`](../robots/): kinematics, reach, toolpaths and gaits, the code the checks use.
