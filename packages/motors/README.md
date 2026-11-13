# @rulecad/motors

Motors for printed machines. A stepper, a DC gear motor, a servo or a brushless motor comes back from its name as a
model (every figure with how far to trust it and where it comes from), a solid to place in an assembly, the shape a
part subtracts to hold it, and the bore a gear takes for its shaft. One function answers what a design asks of a motor:
at this speed, through this ratio, what torque reaches the output? Its figures live in
[`@rulecad/rules`](https://github.com/JoniBach/rulecad/tree/main/packages/rules) as open data, and this package holds no
numbers of its own for any motor. Needs JSCAD. Part of [rulecad](https://github.com/JoniBach/rulecad).

```js
import { motorModel, motor, mount, mountModel, bore, boreModel, performance } from '@rulecad/motors';

const m = motorModel('nema17');                              // or '17HS4401', '28BYJ-48', 'sg90', …
console.log(m.type, m.shaft.diameter, m.mount.spacing, m.figures.holding_torque.value, m.figures.holding_torque.kind);

const held = mountModel(m, { plate: 5 });                     // what a 5 mm plate needs to hold it
console.log(held.pocket, held.holes[0].diameter, held.screw.thread, held.screwLength);

const hub = boreModel(m, { depth: 8 });                       // the bore a gear takes for its shaft
console.log(hub.diameter, hub.across, hub.findings.length);

const out = performance(m, { speed: 12, ratio: 50, efficiency: 0.8 }); // 12 rpm at the output, through 50:1 gears
console.log(out.output.torque.toFixed(2), out.motor.speed, out.rests.join(', '));

const body = motor(m);                                        // a JSCAD solid, its mounting face at z = 0, shaft up +z
const plate = mount(m, { plate: 5 });                         // subtract this from your part
const gearBore = bore(m, { depth: 8 });                       // and this from your gear
```

```text
stepper 5 31 0.59 spec
22.5 3.5 M3 9
5.2 4.7 0
16.69 600 spec
```

So the 48 mm NEMA 17 gets a 22.5 mm pocket for its boss and 3.5 mm holes for M3 × 9 screws, a D-bore 5.2 mm across and
4.8 mm over its flat, and 16.7 N m at the output of 50:1 gears turning at 12 rpm.

## The motors

| Name | What it is | Output | Torque |
|---|---|---|---|
| `nema17` | Stepper, 48 mm body (`17HS19-2004S1`; `17HS4401` is the 40 mm body) | 5 mm D shaft, four M3 on 31 mm | 0.59 N m holding (0.40 for the 40 mm) |
| `nema14` | Stepper, 34 mm body (`14HS13-0804S`) | 5 mm D shaft, four M3 on 26 mm | 0.18 N m holding |
| `28byj48` | 5 V geared stepper, 1:64 | 5 mm double-flat shaft, two ears 35 mm apart, shaft off-centre | 0.034 N m pull-in, at least (varies between makers) |
| `n20` | Brushed DC gear motor, Pololu's 100:1 HP 6 V | 3 mm D shaft, two M1.6 | 0.167 N m stalled, 310 rpm free (give `ratio` for another gearbox) |
| `sg90` | 9 g servo, plastic gears | Spline: drive it through its horn | 0.18 N m stalled, 180° |
| `mg90s` | 13 g servo, metal gears | Spline: drive it through its horn | 0.18 N m stalled at 4.8 V, 180° |
| `bldc2204` | 2204 brushless gimbal motor, 260 KV | The bell turns | 0.022 N m at 0.6 A |

Hobby motors vary. Unbranded N20s and 28BYJ-48s look identical and differ by a factor of two, so each figure carries
its `kind` (`spec` from a datasheet, `community` as commonly quoted, `estimate` where nobody has published it) and its
`source`, and `performance` says in `rests` which kinds the answer depended on.

**Measure yours and say so.** A figure you've measured replaces the catalogue's:

```js
motorModel('nema17', { holding_torque: { value: 0.52, kind: 'measured', source: 'a known arm and a kitchen scale, 2026-11-09' } })
```

A different body or gearbox is a figure too (`motorModel('n20', { ratio: 50 })`: the torque and speed follow the
ratio, marked `derived`). A motor that isn't listed is a rule set of your own in the same names (see the rules
package's `vocabulary.json`), handed in where the name goes.

## Holding a motor

`mount(model, { plate, printer?, screw?, counterbore?, recess? }, ops?)` is the negative a part subtracts; `mountModel`
gives the same as numbers, with what's wrong (a plate too thin for its screws, a boss pocket as deep as the plate).
Clearances come from the printer's rules (`fit`, `hole_comp`), and screw sizes from the screw rule sets, so a printer
of your own or a screw you've measured carries through.

Where the part goes: on the shaft's side of the mounting face, z from 0 to `plate`, so the boss enters a pocket and the
shaft passes through. A servo goes through the part instead: its body down a slot, its tabs on top, z from `-plate` to 0.

`bore(model, { depth, fit?, printer? }, ops?)` is the hole a gear or hub takes, with the shaft's flat in it. The shaft
goes in from z = 0 with its tip at `depth`: the flat is cut only where the flat is, so a bore deeper than the flat is
round at its mouth and the shaft's round root can pass. `boreModel` warns of a bore that grips too little of the shaft
or misses its flat. A servo's spline is finer than a printer draws: drive it through its horn. A brushless motor drives
through its bell.

Anchors for placing a motor in an assembly are on the model: `face`, `shaft` (where the shaft leaves the motor), `tip`,
`horn` on a servo, and `hole1` onward.

## What it does

`performance(model, { speed, ratio, efficiency, supply })` gives the torque and speed at the output and at the motor,
the fastest the output can go (`limit`), what it rests on (`rests`) and how it was worked out (`how`). A speed past the
motor's limit is a `motor.speed` failure.

| What | Formula | Source |
|---|---|---|
| Stepper, moving | T = T_hold / √2, flat to the corner speed, then T_hold / √2 × n_c / n | Both phases are on at holding, one vector's worth moving; two-part curve as in Geckodrive's *Step Motor Basics* |
| Stepper's corner speed | n_c (rpm) = 60 V / (2 L I N), N the full steps per turn | The windings take L I / V to reach full current, and a step can't be shorter than the rise and fall |
| 28BYJ-48 | The datasheet's pull-in torque, to the rate it starts at | [Datasheet](https://cdn.shopify.com/s/files/1/0015/7571/4865/files/datasheet_28BYJ-48.pdf) |
| DC gear motor | T = T_stall (1 − n / n_free) | The DC motor's straight torque-speed line |
| Servo | Its stall torque, within its range | Datasheet; work it at under half |
| Brushless | T = K_t I, K_t = 60 / (2π KV) | The motor constant in SI units: K_t = K_e |
| Through gears | T_out = T ratio η, n_out = n / ratio | |

`curve(model, { ratio, efficiency, at: { speed, load } })` from `@rulecad/motors/diagram` draws the torque against speed, as an SVG, with a working point and its load marked.

A stepper's real curve is on its datasheet when the maker gives one; the kit doesn't have one for any motor yet, says so
in `how`, and the straight model is on the cautious side of most motors but not all of them. Measure yours.

## Drivers and the power budget

A stepper's current is set on its driver, and the driver's heat and the supply's size follow from it. `driver(name)` reads a driver's rule set; `setting(d, current, { cooled, supply, microsteps })` gives the trimmer voltage and whatever is wrong with the choice; `powerBudget(parts, { voltage, current, margin })` adds up the machine against a supply.

```js
import { driver, setting, powerBudget } from '@rulecad/motors'

setting(driver('a4988'), 1.2).vref                 // 0.653 V, by the module's sense resistor: read yours
powerBudget([{ name: 'shoulder', current: 1.5, resistance: 1.1 }], { voltage: 24, current: 5 })
```

| Figure | Formula | Source |
|---|---|---|
| A4988 current limit | I = Vref / (8 Rs) | Pololu's A4988 carrier page |
| DRV8825 current limit | I = 2 Vref | Pololu's DRV8825 carrier page |
| TMC2209 current (Vref) | Irms = (325 mV / (Rs + 20 mΩ)) (1 / √2) (Vref / 2.5 V) | BigTreeTech and FYSETC module pages |
| A stepper's draw | P = 2 I² R / 0.85, both coils at the set current, through a chopper about 85% efficient | Copper loss; the efficiency is an estimate |

A chopper draws power, not the phase current, so a motor set to 2 A takes much less than 2 A from a 24 V supply. Microsteps add resolution, not accuracy.

