# The disc launcher

A toy pistol that throws 30 mm printed discs, built to show `@rulecad/flexures` doing real work: the spring, the
sear, the trigger's pivot, the magazine feeder and the magazine's cap are all printed flexures, each sized from one
rule set (`rules/launcher.json`) by the library's sizing functions. Like a real pistol it is a set of modules: two
cartridges that pin into a frame.

`npx cad check launcher/launcher` checks the whole thing in both poses (cocked, rest), with every pin's press fit;
`npx cad export` each object for the printer.

## The parts

| Part | What it is | Printed |
|---|---|---|
| `action` | A tray with the bow (one leaf standing from its bottom wall, a bead on its tip), the sear (a leaf under the tray's top whose tooth rises out of it) and the trigger (a lever on a living hinge) printed in place; a window in its floor and a gap in its bottom wall for the finger | flat, open side up |
| `barrel` | A tray whose bottom wall is the slot's floor, with the slot's ceiling, a hollow for the pins' barbs, and the magazine column standing over the mouth with the cap's notches in its walls | flat, open side up |
| `frame` | The two trays' outlines grown by a 6 mm skin, rounded, with a cavity for each, the trigger guard, a notch for the sled's rod and the pins' holes through the skin | on its back plate (or hilt-down: no roof spans a cavity) |
| `sled` | A plate under the magazine on a rod back through the grip to the tab the bow pushes, and on to the cocking ring | flat on its plate |
| `magazine` | Follower, serpentine spring and a cap with two snap hooks, in one piece | flat |
| `pin` | A snap pin with a wide head: six, from the frame's edges through its skin and a tray's wall, barb inside the tray | standing |
| `disc` | 30 × 2 mm, chamfered, a dimple on top | flat, six at a time |

Assembly: the sled into the barrel's slot from its open side; both cartridges into the frame open side first, the
rod out through the notch in the back strap; the pins from the edges; discs and the magazine insert in through the
column's top; the cap clicks into the walls. The disc rolls along the frame's back plate, so it leaves spinning.

## The sizing, from the rules

Energy first: `energy` (0.2 J stored) over `travel` (25 mm) gives the draw, `2E/δ` = 16 N for a linear spring, and
the sled's nose leaves with about `efficiency` of it (0.3, a guess: the sled and the leaf's moving share weigh about
three times the disc), under the 0.08 J a hard projectile may carry (ASTM F963, EN 71-1: over that it needs a
resilient tip, which a PLA disc has not).

A leaf stores about 38 mJ per cm³ at 1.6% strain in PLA whatever its shape, so the stored energy sets the leaf's
volume and the travel sets its length: `size.leaf({ travel, force: draw, width, material })` walks the whole-line
thicknesses up from two lines and returns the first whose strain at the travel is under 80% of the limit:

| flexure | sized by | result | at work |
|---|---|---|---|
| bow | `size.leaf`, 16 N at 25 mm, 28 mm wide | 77 × 2.52 (6 lines) × 28 mm, 0.64 N/mm | 1.57% strain at full draw; the tip drops 4.6 mm as it bends, which the tab's bite allows for |
| sear | `snapHookModel`, 25 × 1.26 (3 lines) × 11.3 mm, 1.5 mm undercut | 1.2 N to deflect; square back holds the 16 N | 1.3% strain at the trigger's 4.3 mm lift |
| trigger hinge | `size.livingHinge`, 6 mm over a 50 mm arm (0.12 rad) | 3.15 × 0.84 mm strip, 1177 N·mm/rad | about 3 N of the pull is the hinge, the rest lifts the sear |
| feeder | `serpentineModel`, 30 × 0.84 × 14 mm, 7 turns | 0.12 N/mm: 0.9 N on the last disc, 2 N on a full stack | 0.6% strain full |
| cap hooks | `snapHookModel`, 20 × 1.26 × 14 mm, 2.4 mm barb, 30° both faces | 12 N to press in or pull out: well over the spring's push | 1.1% strain |
| pins | `snapPinModel`, 4 mm, 6.2 mm shaft, 0.4 mm barb | click through 6 mm of skin and wall | |

`node projects/launcher/report.mjs` prints the library's report for the set. A notch hinge was tried for the
trigger first: at 0.12 rad every notch is over 4% strain, hence the living hinge.

## Decisions worth knowing

- The first design was one body on an optimised frame with a lid: it relied on plates, the cocking rod could not be
  fitted through a closed hole, and the grip was a box. The cartridges came from that (see the archive's write-up).
- The floor of the slot is left out over the sled's whole run: a slit's roof would be a bridge far wider than the
  printer spans. The sled rides the ceiling, its rod the floor either side of the gap.
- The leaf stands in the grip behind the trigger and bends away from it: it is the grip's spine.
- The bead at the leaf's tip: a leaning leaf would otherwise touch a vertical tab below its tip.
- The sear's tooth stands past the tray's edge, so its underside there is cut at 45° to print.
- Pins go through walls, not floors: a tray's floor faces outward, so a pin through it would point into air.
- `strain_limit` is 2%, the working guess until the flexure bench's plates are measured. Don't leave the launcher
  cocked: PLA creeps.

## Still to do

- An ergonomic grip: the frame's skin is rounded only in plan; the grip wants a palm swell and rounded edges.
- The optimiser on the frame's back plate and skin, with the cavities kept empty.
- Print the action cartridge first and measure the draw, the sear's click and the trigger's pull.
