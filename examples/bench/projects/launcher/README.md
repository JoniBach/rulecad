# The disc launcher

A toy pistol that throws 30 mm printed discs, built to show `@rulecad/flexures` doing real work: the spring, the
sear, the trigger's pivot, the magazine feeder and the magazine's cap are all printed flexures, each sized from one
rule set (`rules/launcher.json`) by the library's sizing functions, and the frame round them is left to the
optimiser. Five printed parts: the body (everything in place), the sled, the magazine insert, the lid, and discs.

`npx cad check launcher/launcher` checks the whole thing in both poses (cocked, rest); `npx cad export` each object for
the printer. The body's default build optimises its frame (`problems/frame.json`), which takes a while the first time;
`launcher/body:rig` is the same mechanism on a plain base, for testing the action before printing the body.

## How it works

Print coordinates throughout: x along the barrel, y up, z off the bed (towards the lid). The body lies on its bed
wall, so every flexure bends within its layers.

- **The bow** is one leaf standing in the grip, root at the bottom, tip just under the barrel's floor, with a round
  bead along its tip. Pulling the cocking ring draws the sled back; the sled's tab, hanging through a gap in the
  floor, presses the bead and bends the leaf back into the grip's pocket.
- **The sled** is a plate in the barrel slot under the magazine, on a rod that runs back through the grip's top to the
  tab, and on out of the back wall to the ring. Only its nose, on the bed side of the slot, touches the disc: pushed
  off its centre line, the disc rolls along the lid and leaves spinning, so it flies flat (the Nerf Vortex's trick).
- **The sear** is a leaf under the floor whose tooth rises into the slot just ahead of the sled's nose at full draw.
  Cocking, the sled's rear edge rides up the tooth's ramp and over; cocked, the nose rests against the tooth's square
  back. The tooth's foot carries a shelf back towards the trigger.
- **The trigger** is a lever hanging from a living hinge, its finger arm down into the guard and its other arm
  forward between the sear's leaf and its shelf. Pulling it presses the shelf down, the tooth drops out of the slot,
  and the leaf throws the sled forward. Stops either side of the finger arm bound the hinge's turn.
- **The magazine** is a column over the slot. Discs drop in from the top; the insert (follower, serpentine spring,
  cap) goes in after them, and the cap's two snap hooks click into notches in the column walls. The spring presses
  the stack down onto the sled's plate; when the sled is drawn back the bottom disc drops into the slot in front of
  its nose, and the plate blocks the next until the sled is back again.
- **The lid** closes the slot, the column and the pockets, on four snap pins.

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
| bow | `size.leaf`, 16 N at 25 mm, 28 mm wide | 77 × 2.52 (6 lines) × 28 mm, 0.64 N/mm | 1.56% strain at full draw; the tip drops 4.6 mm as it bends, which the tab's bite allows for |
| sear | `snapHookModel`, 25 × 1.26 (3 lines) × 11.3 mm, 1.5 mm undercut | 1.2 N to deflect; square back holds the 16 N | 0.95% strain at the trigger's 4.3 mm lift |
| trigger hinge | `size.livingHinge`, 6 mm over a 50 mm arm (0.12 rad) | 3.15 × 0.84 mm strip, 1177 N·mm/rad | about 3 N of the pull is the hinge, the rest lifts the sear |
| feeder | `serpentineModel`, 30 × 0.84 × 14 mm, 7 turns | 0.12 N/mm: 0.9 N on the last disc, 2 N on a full stack | 0.7% strain full |
| cap hooks | `snapHookModel`, 20 × 1.26 × 14 mm, 2.4 mm barb, 30° both faces | 12 N to press in or pull out: well over the spring's push | 1.1% strain |

`node projects/launcher/report.mjs` prints the library's report for the set. A notch hinge was tried for the
trigger first: at 0.12 rad every notch is over 4% strain, hence the living hinge.

The frame: `problems/frame.json` takes the body's outline as its space, the bed wall and every mount (the leaf's
root block, the slot's walls, the posts the sear and the hinge grow from, the stops, the column walls, the back
wall, the lid's bosses) as kept, and the flexures' sweeps, the slot, the column and the trigger's room as empty
(all three are parts of `body:regions`). It is held at the grip's straps and loaded by the bow at full draw, a
knock on the muzzle sideways and downward, and a knock on the magazine, printable in +z.

## Decisions worth knowing

- The floor of the slot is left out over the sled's whole run: a slit's roof would be a bridge far wider than the
  printer spans. The sled rides the ceiling, its rod the floor either side of the gap.
- The leaf stands behind the trigger, in the grip, and bends away from it: in front of the trigger it clashed with
  the guard at full draw and made a deep block under the barrel.
- The bead at the leaf's tip: a leaning leaf would otherwise touch a vertical tab below its tip, and the draw would
  not be the tip's travel.
- The assembly's sweep (`--sweep`) reports the sled hitting the sear's tooth along its run: it does, and rides over
  it; a rigid sweep can't know.
- `strain_limit` is 2%, the working guess until the flexure bench's plates are measured. Don't leave the launcher
  cocked: PLA creeps.
