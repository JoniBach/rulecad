# A bicycle frame from a layout optimiser

This example designs a bicycle frame from its loads alone: which tubes go where, how thick each must be, and what
each joint carries. It runs in a few seconds:

```
node examples/bicycle-frame/bicycle.mjs
```

It uses `@rulecad/fea/layout` (the layout), `@rulecad/fea/frame` (sizing the tubes) and `@rulecad/frames` (the tube
sections). The test `test/bicycle-frame.test.mjs` runs it and checks what it prints.

## The problem

The frame is seen from the side, as a flat layout, with the rear axle at the origin, x forward and y up. Its fixed
points have a road frame's proportions:

| Point | Where, mm | What it is |
|---|---|---|
| `rear` | 0, 0 | The rear axle, at the dropouts |
| `bb` | 405, -70 | The bottom bracket: 411 mm chainstays, 70 mm below the axles |
| `seat` | 252, 448 | The seat cluster: a 540 mm seat tube at 73.5 degrees |
| `head` | 833, 338 | The head tube's bottom: a 72 degree head angle, a 370 mm fork with 45 mm offset |
| `bars` | 787, 481 | The head tube's top, 150 mm up it, where the stem and bars bear |
| `front` | 990, 0 | The front axle: a 990 mm wheelbase |

Candidate nodes are added every 75 mm over the frame's side. No node or tube may come within 350 mm of the front
axle (the front tyre). Within 350 mm of the rear axle no node is placed, but tubes may pass, as the stays straddle
the rear wheel. The frame is held at the rear axle (up and down) and at the head tube's bottom (both ways), where
the fork bears on it.

Three load cases, each carried alone:

| Case | Loads |
|---|---|
| Seated | The rider's weight, 785 N (80 kg), seven tenths on the saddle and three tenths on the bars |
| Pedalling | 1000 N down on a pedal, standing; the chain's pull, 1683 N (the pedal's 170 mm crank over a 50-tooth ring's 101 mm pitch radius), back on the bottom bracket and forward on the rear axle; the rest of the rider's weight, 215 N, pulling up on the bars |
| Braking | The seated case with 0.6 g of braking pushing the rider forward on the saddle and bars |

The rider's mass, the pedal force and the braking are estimates, not figures from a standard. The members are steel
(S275, from the kit's rule set `s275`: 275 MPa yield, 210 GPa modulus, 7.85 g/cm³), held to half the yield, and a joint
costs as much as 600 mm of tube, which keeps the layout to a few long tubes.

## What it finds

The layout keeps 11 members out of 1242 candidates, the least volume over all of them (119 g of steel, fully
stressed). Among them are the diamond frame's six tubes: the chainstay (`rear-bb`), the seat stay (`rear-seat`), the
seat tube (`bb-seat`), the top tube (`seat-head`), the down tube (`bb-head`) and the head tube (`head-bars`), with a
node behind the head tube (`4,7`) bracing the front triangle, and a brace from the bottom bracket and the rear axle to
the bars. Two members cross others without meeting them: a flat layout lets them pass, where a real frame would
set them side by side or join them where they cross.

Each tube is then sized from round steel tubes in the inch sizes bicycle tubing is sold in (12.7 to 34.9 mm, walls
0.9 and 1.2 mm: an estimate of what a supplier lists, so check yours), with welded joints, for a stress margin of 2,
each squeezed tube carrying twice its force under Euler's load, and the bottom bracket and bars moving no more than
0.5 and 1 mm. Every tube comes out at the lightest size, 12.7 x 0.9 mm, 1.5 kg in all, with the frame's buckling
the nearest limit at 40% of it. In its own plane a triangulated frame is far stiffer and stronger than these loads
need; real frames are sized by what a flat layout leaves out: the pedal's push to the side of the frame, fatigue,
and dents.

Each of the bottom bracket, the seat cluster and the head tube's bottom is handed on as a problem file for the voxel
optimiser (`cad optimise`), the tubes as stubs carrying the sized frame's forces in each case. Saved as
`problems/seat.json` in a project of a workspace, `cad optimise <project>/seat` shapes that joint (a flat 24 x 24
cell problem, under a second).
