# @rulecad/robots

Kinematics for serial chains, as plain data. Give an arm or a set of axes as a list of joints and get back where the
tool is, the joint values that put it somewhere, the region it can reach, and an SVG drawing turned into joint moves
and step blocks a firmware can run. No dependencies: it runs in Node and, as it is, in a browser with no build step.
Part of [rulecad](https://github.com/JoniBach/rulecad).

```js
import { planar2R, ik, fk, reach, jacobian, svgToStrokes, orderStrokes, planToolpath, stepBlocks, estimate, replay } from '@rulecad/robots';

const arm = planar2R(150, 120);                  // links in mm; shoulder and elbow turn about z
const right = ik(arm, [200, 50], { elbow: 'right' });
console.log(right.ok, right.q.map((a) => a.toFixed(3)));
console.log(ik(arm, [300, 0]).reason);

const sheet = { size: 'a5', at: [0, 150, 0] };   // a sheet of A5, centred 150 mm out
const r = reach(arm, { sheet, step: 10 });
console.log(r.summary.reachable, r.summary.total, r.summary.margin.toFixed(2));

const svg = `<svg width="148mm" height="210mm" viewBox="0 0 148 210">
  <rect x="24" y="55" width="100" height="100"/><circle cx="74" cy="105" r="35"/></svg>`;
const { strokes } = orderStrokes(svgToStrokes(svg));
const plan = planToolpath(arm, strokes, { sheet, tolerance: 0.1 });
const blocks = stepBlocks(plan, { speed: 40, accel: 300, axes: [
  { name: 'shoulder', stepAngle: 1.8, microsteps: 16, ratio: 8 },
  { name: 'elbow', stepAngle: 1.8, microsteps: 16, ratio: 8 }
] });
const { time, draw } = estimate(blocks);
console.log(blocks.blocks.length, draw.toFixed(1), time.toFixed(1));
```

```text
true [ '-21.063', '81.051' ]
target out of reach by 30.000 mm
352 352 4.48
170 619.9 19.4
```

Every function takes and returns data that survives `JSON.stringify`, and a chain that has been through JSON works as
before. Figures are millimetres; angles are degrees at the surface, radians only inside.

## A chain

```js
chain({ joints: [
  { name: 'shoulder', type: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], limits: [-120, 120], ratio: 8 },
  { name: 'elbow',    type: 'revolute', origin: [150, 0, 0], axis: [0, 0, 1], limits: [-150, 150], ratio: 8 }
], tool: [120, 0, 0] })
```

| Field | Meaning |
|---|---|
| `name` | The joint's name, unique in the chain |
| `type` | `'revolute'` or `'prismatic'` |
| `origin` | The joint's point, in the parent link's frame (mm) |
| `axis` | The direction it turns about or slides along, in the parent link's frame; it need not be a unit vector |
| `limits` | `[lo, hi]`, degrees or mm. A revolute defaults to `[-180, 180]`; a prismatic must give them |
| `ratio` | Optional: motor turns per joint turn. Kinematics ignore it; `stepBlocks` uses it |
| `ref` | Optional: where the anchor's x axis points. Matters only with a `child` anchor |
| `child` | Optional `{ at, axis, ref }`: the same anchor described on the child link, so its frame is offset or tilted from the parent's |
| `a`, `b` | Optional, in place of the above: the parent and child anchors as 12 numbers, three rows of four |
| `follow` | Optional `{ joint, ratio = 1, offset = 0 }`: not driven, this joint's value is the leader's × ratio + offset (a parallelogram, a pair of gears) |

`joints` are in order from the base; `tool` is a point in the last link's frame, and `base` an optional point or
12-number transform placing the first link in the world. `links: [150, 120]` is short for revolute joints about z with
each link along x, and `planar2R(l1, l2, { limits, names, base, ratios, z })` for the common case.

**The convention.** Each link's transform in the world is

```text
link[i] = link[i-1] · a[i] · J(q[i]) · inverse(b[i])
J = turn about z by q (revolute), slide along z by q (prismatic)
```

where `a` is the joint's anchor on the parent (z along the axis) and `b` the same anchor on the child. It is the
placement rulecad assemblies use, so `chainFromMotion(motion, { tip, tool })` turns an assembly's joints into a chain
with nothing described again: fixed joints fold into their neighbours, `follow` carries over, and any other joint type
on the way is refused by name. With only `origin` and `axis` given, `b` has the same axes as `a` at the child's origin,
so at q = 0 the child has the parent's orientation, and the rotation is about the joint's axis through its origin,
right-handed. `fk` returns each link's `matrix` in the same 12 numbers.

## Questions it answers

| Call | Returns |
|---|---|
| `fk(chain, q)` | `{ position, rotation, frames: [{ name, matrix, at, axis }] }`: the tool, and for each joint its world anchor and axis |
| `ik(chain, target, { elbow, start, tolerance, maxIterations, method })` | `{ ok, q, error, miss, iterations, reason, code, method, elbow?, blocked? }` |
| `jacobian(chain, q)` | 3 rows, a column per driven joint: mm of tool per degree, or per mm |
| `manipulability(chain, q)` | Yoshikawa's measure; zero at a singularity |
| `singularityDistance(chain, q)` | For a planar two-link arm: `{ angle, room, stretched }`, degrees from straight or folded and mm of room to the nearest singular circle |
| `reach(chain, { sheet or region or volume, step, elbow })` | `{ samples: [{ point, reachable, q, margin, manipulability, miss }], summary: { worst, margin, corners, reachable, total }, findings }` |
| `sheetFrame`, `sheetPoint`, `sheetCorners` | A sheet's axes, a point on it, and its corners (lower left, lower right, upper right, upper left) |
| `svgToStrokes(text, { tolerance, unit })` | `{ strokes, width, height, findings }`, strokes `{ name, points, closed }` in mm |
| `orderStrokes(strokes, { start })` | `{ strokes, travel: { before, after } }`, nearest next with reversal |
| `planToolpath(chain, strokes, { tolerance, elbow, sheet, transform, zUp, home })` | `{ ok, chain, tolerance, elbow, moves: [{ kind, stroke, name, q, points }], length, findings }` |
| `stepBlocks(plan, { axes, speed, accel, travelSpeed, penUp, penDown, corner })` | The block file (below) |
| `replay(blocks, chain, axes?)` | `{ strokes, travels, steps, q, pen }`, the tool at every step |
| `estimate(blocks)` | `{ time, draw, travel, pen, moves, steps }`: seconds, mm, seconds, and steps per axis |

**Inverse kinematics.** A planar two-link arm (two parallel revolute axes, whatever the offsets, in any plane) and XY or
XYZ axes (two or three mutually square prismatics) solve in closed form; `method` says which was used. Anything else is
solved by damped least squares from `start`, or from a spread of starts when none is named. `method: 'numeric'` forces
the numeric solver, for a chain the closed form would also take.

`elbow` names a branch of a two-link arm: `'right'` puts the elbow to the right of the line from shoulder to target,
seen from the axis's tip, so looking down on an arm whose axes point up. With none named the branch is the one inside
the limits, or nearest `start`.

A target that cannot be met is not an error: `ok` is false, `error` and `miss` are the distance it misses by, `reason`
says why in words, `code` is `'reach'`, `'limits'` or `'stalled'`, and `q` is the closest the arm came. `[x, y]` is
accepted only by a chain that works in the XY plane; any other chain needs `[x, y, z]`.

**Reach.** `sheet` is `{ size: 'a3'..'a6' or [w, h], or width and height, landscape?, at, normal = [0,0,1], u? }`, with
`at` the sheet's centre. `region` is a rectangle `{ x: [lo, hi], y: [lo, hi], z? }` or `{ lo, hi }`; `volume` the same
in three dimensions. Samples fall on a grid no coarser than `step`, always including the corners. `margin` is how far
a sample is from what stops the arm, in mm: exact for a two-link arm's circles and for axes against their stops, joint
room times lever for the limits of other chains, and negative by the miss outside the reach.

**Drawings.** `svgToStrokes` reads paths (M L H V C S Q T A Z, relative too), lines, polylines, polygons, rects (with
`rx`, `ry`), circles and ellipses, through matrix, translate, scale, rotate, skewX and skewY transforms and nested
groups. Text, images and `use` are not drawn, and a finding says so. Lengths follow the SVG rules: a `viewBox` with a
`width` in mm scales to it; without a viewBox a user unit is a CSS pixel; with no size at all a user unit is taken as a
millimetre, and a finding says so (`unit` overrides all of this). Strokes keep the page's coordinates, x right and y
down, from the top left.

`planToolpath` puts a stroke's `(0, 0)` at the sheet's top left corner, x along `u` and y down the sheet, so a drawing
is not mirrored. Without a `sheet` or a `transform`, points are used as they are. Each stroke's segments are solved at
both ends and interpolated in joint space, then split until every sampled point of the joint-space line stays within
tolerance of the straight line. Between strokes the pen travels in joint space, or lifts, moves and plunges when
`zUp` is given to a chain with an axis that leaves the sheet.

`svgToStrokes` and `planToolpath` each spend half of their tolerance, so a curve drawn with the same tolerance through
both stays within it. A move past the reach or a joint limit is refused: the plan comes back `ok: false` with a fail
finding naming the stroke and the point, and `stepBlocks` will not take it.

## The block file

`stepBlocks` returns plain JSON, ready for a firmware or a sender:

```js
{ format: 'rulecad.steps/1',
  axes: [{ name, stepsPerUnit, unit }],   // steps per degree or mm
  start: [0, 0],                           // absolute steps at the first block
  speed, accel, travelSpeed, penUp, penDown, time,
  findings: [],
  blocks: [
    { type: 'pen', state: 'up' | 'down', dwell: 0.15 },  // seconds to wait after moving the pen
    { type: 'move', kind: 'draw', stroke: 0,
      steps: [12, -3],                     // signed steps per axis in this block
      major: 12,                           // the largest |steps|: the block's number of ticks
      length: 0.42,                        // mm of tool
      entry: 0, peak: 40, exit: 12,        // tool speed, mm/s
      rate: { entry: 0, peak: 1143, exit: 343, accel: 8571 }, // step rate of the major axis, steps/s and steps/s^2
      accelSteps: 3, decelSteps: 2,        // major steps spent accelerating and decelerating
      time: 0.012 } ] }
```

An axis takes `stepsPerUnit`, or `stepAngle` and `microsteps` (with the joint's `ratio`, or its own `ratio`, and for a
prismatic the `lead`, mm per turn). `maxRate` (steps/s) slows any block that would exceed it.

To run a block, take the rate up from `entry` for `accelSteps` ticks, hold `peak`, take it down over `decelSteps` to
`exit`. Each tick, for each axis: `acc[k] += abs(steps[k]); if (acc[k] >= major) { acc[k] -= major; step axis k }`,
with `acc[k]` starting at `floor(major / 2)`, so every axis ends exactly on its count. `replay` does just this and
hands each pose to `fk`.

## Refusals and findings

Bad input is refused by name before any maths, as an `Error` with a `code` (`chain.limits`, `ik.target`, `reach.step`,
`strokes.points` and so on): a chain with no joints, limits the wrong way round, a zero axis, a target with the wrong
number of coordinates, a paper size that does not exist. `checkChain(spec)` reports the same as findings, without
throwing.

Findings have the kit's one shape: `{ level: 'pass' | 'warn' | 'fail' | 'info', text, code, values?, at?, box?,
between?, refs? }`, points in mm in the world.

## Formulas

| What | Formula | Source |
|---|---|---|
| Link transform | T[i] = T[i-1] · a[i] · J(q[i]) · b[i]⁻¹; J turns or slides on the anchor's z | Craig ch. 3 (compound transforms); the placement of rulecad assemblies |
| Rotary Jacobian column | z[i] × (p[tool] - p[i]), × π/180 per degree | Craig ch. 5 |
| Slide Jacobian column | z[i] | Craig ch. 5 |
| Two-link inverse | cos φ = (r² - l1² - l2²) / (2 l1 l2); elbow right φ > 0, left φ < 0; θ1 = atan2(y, x) - atan2(l2 sin φ, l1 + l2 cos φ) | Craig ch. 4 (planar example) |
| Two-link reach | abs(l1 - l2) ≤ r ≤ l1 + l2; miss = the amount by which r is outside | Geometry of the two circles |
| Manipulability | w = sqrt(det(J Jᵀ)) with revolute joints in radians (sqrt(det(Jᵀ J)) under-actuated); planar two-link: w = l1 l2 abs(sin φ) | Yoshikawa 1985 |
| Damped least squares | Δq = Jᵀ (J Jᵀ + λ² I)⁻¹ e, λ raised when a step fails and lowered when it succeeds; a joint at its limit and pushing outward leaves the system | Wampler 1986; Nakamura and Hanafusa 1986; Levenberg 1944, Marquardt 1963 |
| Arc from endpoints | SVG's centre parameterisation | SVG 1.1, appendix F.6.5 |
| Arc to cubics | k = (4/3) tan(Δ/4) per piece, Δ ≤ 30° | Goldapp 1991 |
| Curve flatness | dist(B(t), L(t)) ≤ 3t(1-t) · max(dist(P1, L(1/3)), dist(P2, L(2/3))) ≤ (3/4) · that max, with L the chord at uniform parameter: split until below tolerance / 2 | From the Bernstein form of the cubic |
| Synchronised steps | Accumulate abs(steps[k]) per tick and step on reaching major | Bresenham 1965 |
| Junction speed | v² = a δ sin(θ/2) / (1 - sin(θ/2)), θ the angle between the segments, δ `corner` | Jeon, Grbl planner |
| Speed ramps | v² = v0² + 2 a s, a forward and a backward pass over the run, then a trapezoid per block | Standard constant-acceleration planning |

## Sources

- J. J. Craig, *Introduction to Robotics: Mechanics and Control*, 3rd ed., Pearson, 2005.
- T. Yoshikawa, "Manipulability of Robotic Mechanisms", *The International Journal of Robotics Research* 4(2), 1985, 3-9.
- C. W. Wampler, "Manipulator Inverse Kinematic Solutions Based on Vector Formulations and Damped Least-Squares Methods", *IEEE Transactions on Systems, Man, and Cybernetics* 16(1), 1986, 93-101.
- Y. Nakamura, H. Hanafusa, "Inverse Kinematic Solutions With Singularity Robustness for Robot Manipulator Control", *Journal of Dynamic Systems, Measurement, and Control* 108(3), 1986, 163-171.
- K. Levenberg, "A method for the solution of certain non-linear problems in least squares", *Quarterly of Applied Mathematics* 2(2), 1944, 164-168; D. Marquardt, "An algorithm for least-squares estimation of nonlinear parameters", *Journal of SIAM* 11(2), 1963, 431-441.
- W3C, *Scalable Vector Graphics (SVG) 1.1 (Second Edition)*, 2011: chapter 8 (paths), chapter 9 (basic shapes), chapter 7 (coordinate systems, transformations and units), appendix F.6 (elliptical arcs).
- M. Goldapp, "Approximation of circular arcs by cubic polynomials", *Computer Aided Geometric Design* 8(3), 1991, 227-238.
- J. E. Bresenham, "Algorithm for computer control of a digital plotter", *IBM Systems Journal* 4(1), 1965, 25-30.
- S. Jeon, Grbl's motion planner (`planner.c`, junction deviation), [github.com/grbl/grbl](https://github.com/grbl/grbl).

## Legs and gaits

A leg is a chain with a foot. `leg(name, { at, upper, lower, hip, knee })` makes a two-joint leg turning about y, hip at `at` in the body's frame. `gait({ legs, pattern, stride, lift, height, period, mass })` runs a gait through its cycle: in stance the foot is carried back along x under the body; in swing it is lifted and carried forward. Patterns are duty factors and phases: `crawl`, `walk`, `trot` and `tripod`, or your own `{ duty, phase }`.

| Figure | Formula |
|---|---|
| Static margin | the least distance from the centre of mass to the edge of the support polygon, mm; below 0 it tips |
| Load per stance foot | the least-squares spread that balances the weight and its moments |
| Joint torque | τ = Jᵀ F, the Jacobian transposed against the ground's force on the foot |

A crawl's or a walk's body surges along x by `surge` (a quarter of the stride by default), away from each foot as it swings, since a centred body would sit on the line between two feet.

Only static and quasi-static gaits: the body's own acceleration, balance and feedback are not modelled. A trot rests on two feet, so it is reported quasi-static with its torques and no stability claim.

## Not here

Position only: the tool's orientation is not a target, and a redundant chain moves however the solver finds it.
Statics, dynamics and joint-speed limits beyond a step-rate cap are not in the planner. A numeric solution from one
start is local; with no start named, several are tried.

MIT licensed.
