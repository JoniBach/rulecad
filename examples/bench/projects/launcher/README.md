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
| `frame` | The two trays' outlines grown by a 4 mm skin, rounded, with a palm swell, with a cavity for each, the trigger guard, a notch for the sled's rod and the pins' holes through the skin | on its back plate (or hilt-down: no roof spans a cavity) |
| `sled` | A plate under the magazine on a rod back through the grip to the tab the bow pushes, and on to the cocking ring | flat on its plate |
| `magazine` | Follower, serpentine spring and a cap with two snap hooks, in one piece | flat |
| `pin` | A snap pin with a wide head: six, from the frame's edges through its skin and a tray's wall, barb inside the tray; the holes are teardrops so they print | standing |
| `disc` | 20 × 2 mm, chamfered, a dimple on top | flat, six at a time |

Assembly: the sled into the barrel's slot from its open side; both cartridges into the frame open side first, the
rod out through the notch in the back strap; the pins from the edges; discs and the magazine insert in through the
column's top; the cap clicks into the walls. The disc rolls along the frame's back plate, so it leaves spinning.

## The sizing, from the rules

Energy first: `energy` (0.05 J stored) over `travel` (15 mm) gives the draw, `2E/δ` = 6.7 N for a linear spring, and
the sled's nose leaves with about `efficiency` of it (0.3, a guess), so the 0.8 g disc leaves at about 6 m/s, well
under the 0.08 J a hard projectile may carry (ASTM F963, EN 71-1: over that it needs a resilient tip).

A leaf stores about 38 mJ per cm³ at 1.6% strain in PLA whatever its shape, so the stored energy sets the leaf's
volume and the travel sets its length: `size.leaf({ travel, force: draw, width, material })` walks the whole-line
thicknesses up from two lines and returns the first whose strain at the travel is under 80% of the limit. The
disc's diameter sets the pistol's thickness (it stands across it), and the leaf's length the grip's height, so these
two rules are what size the launcher: 0.2 J and a 30 mm disc made it 170 × 140 × 41 mm; 0.05 J and 20 mm make it
about 115 × 110 × 26 mm.

| flexure | sized by | result | at work |
|---|---|---|---|
| bow | `size.leaf`, 6.7 N at 15 mm, 18 mm wide | 50.5 × 1.68 (4 lines) × 18 mm, 0.44 N/mm | 1.48% strain at full draw |
| sear | `snapHookModel`, 18 × 0.84 (2 lines) × 6.8 mm, 1.2 mm undercut | square back holds the draw in tension | its tip drops 3.1 mm at full pull: 1.22% strain |
| trigger hinge | `size.livingHinge`, 5 mm over a 36 mm arm | 3.65 × 0.84 mm strip, 653 N·mm/rad | 1.60% strain |
| feeder | `serpentineModel`, 20 × 0.84 × 9 mm, 7 turns | squeezed 13.9 mm over a full stack | 1.25% strain |
| cap hooks | `snapHookModel`, 14 × 1.26 × 9 mm, 1.8 mm barb, 30° both faces | 8.4 N each to seat or lift | 1.74% strain |

`node projects/launcher/report.mjs` prints the library's report from the built parts' own values. A notch hinge was
tried for the trigger first: at the turn the finger's travel needs, every notch is over 4% strain.

Bent and squeezed flexures belong to the assembly's poses, never to the parts: `"cocked": { "run": …,
"action.travel": "launcher.travel" }` draws the bow bent there, while `action` itself is printed straight. The
magazine's spring is squeezed the same way.

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
