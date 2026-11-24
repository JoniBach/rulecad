# Changelog: create-rulecad

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release lists every printed size that moved in what
it makes, with its reason. A **fasten** is an entry in an assembly's `"fasten"` list: one screwed joint, naming the
screw by thread and head, the parts it passes through and the part it ends in.

## 0.3.25: the arm's sender says what a gait file is (#199)
### Changed

- The arm's `send.mjs` names a gait's cycles, time and start pose in its dry run's summary, and before it sends one it
  says the leg must stand in that pose. `STREAMER.md` explains how a leg's stand runs on the same streamer.

## 0.3.23: the leg on a 17HS4401 knee and 12 V

### Changed

- `--machine leg` makes the stand on a 17HS4401 at hip and knee, the 12 V bench supply limited to 1.5 A and
  `"have": true` on the motors, drivers, shield and supply, as the worked leg in @rulecad/cad's EXAMPLES chapter 14.
  Its stand steps under `leg.stand_load`, the larger of the robot's share and what rides the rods (`leg.riding`,
  1.01 kg), and the message says which: a 2 kg robot's 1 kg share is under it, a 3 kg robot's 1.5 kg is over.

### Printed sizes

- The thigh: the knee motor's four M3 holes on a 31 mm square (the 17HS4401's), was 26 mm (the NEMA 14's).

## 0.3.22: the arm streams in time (#181)

### Changed

- `--machine arm`'s streamer, `projects/arm/firmware/arm/arm.ino`, refuses a block faster than its `MAX_RATE` (8000
  steps/s) with `error: rate`, steps every axis due on a tick in one write to the Uno's port D, and divides once a step
  instead of twice. It reads a line a character at a time between steps (parsing a whole line at its end held the steps
  520 to 600 µs), a block that follows another keeps its time, and past 5000 steps/s it works out the speed every other
  step. On a simulated Uno its loop now keeps up with 12428 steps/s on three axes at once while slowing down, its
  slowest path (1.55 times MAX_RATE), and 21237 steps/s at a block's cruise, up from 9417. A malformed line is answered
  `error: line`. The simulation in CI measures the loop speeding up and slowing down as well as at the cruise, streams
  the shortest blocks the sender passes, and fails if any ceiling is under MAX_RATE or a stream falls 1% behind.
  Its STEP pulse is 3.06 µs high (it was 6.3 µs), over the DRV8825's 1.9 µs minimum.
- `projects/arm/send.mjs` refuses a block shorter than its line and answer take on the serial line plus 5.1 ms for the
  USB link (`leastBlockTime`: 8.66 ms for a 36-character line), naming the line, and checks the whole file before it
  opens the port. The arm's task gives `"blockTime": 0.011`, so `cad plot` plans no move shorter.
- `projects/arm/send.mjs --dry-run` prints each line it would send with the answer the streamer would give (`--quiet`
  for the summary only), and with `--machine` holds each axis's share of a block's rate to that axis's `maxRate`. It
  takes the protocol's `?` and `!` lines too: `?` answers `q` with the positions summed from the blocks before it.
- `projects/arm/STREAMER.md` writes up the serial protocol, the timing and how the sketch is checked. No printed size
  moved.

## 0.3.21: the arm on a 17HS4401 elbow and 12 V

### Changed

- `--machine arm` makes the arm with a 17HS4401 at the elbow as at the shoulder, on a 12 V supply (an LRS-50-12), so
  one motor and one driver setting cover both joints. Printed sizes moved in `upper`: the elbow motor's four M3 holes
  and their counterbores from the NEMA 14's 26 mm square to the 17HS4401's 31 mm square. `arm.shoulder_torque` goes
  from 0.2 to 0.22 N m for the heavier elbow motor.
- The template's `AGENTS.md` tells an agent to mark what the person has `"have": true` and to give the supply they
  will use, since a stepper's torque at speed follows its volts.

## 0.3.20: the edit commands and belt guides in the agent notes (Frames 4)

### Changed

- The template's `AGENTS.md`, copied from `@rulecad/cad`, tells an agent to make and change projects and assemblies
  with `cad new`, `cad set`, `cad add`, `cad move` and `cad remove` rather than writing their JSON by hand, and how to
  put a belt drive on a beam.

## 0.3.19: pins, magnets and printed bolts in the agent notes (Fixings 4)

### Changed

- The template's `AGENTS.md`, copied from `@rulecad/cad`, tells an agent to name pins and magnets in a fit's
  `fastener` (`{ "pin": "snap pin 4x6", "count": 2 }`, `{ "magnet": "disc magnet 8x3", "count": 2 }`) with their holes
  drawn by `v.fixings`, a printed bolt as a fasten's screw with the word printed, and that snap pins live in
  `v.fixings` now.

### Printed sizes that moved

None: the template's designs are unchanged.

## 0.3.18: a frame to start from (Frames 3)

### Added

- `--machine frame --size 300x300x350 --profile 2020-misumi-hfs5`: a box frame generated from its inside size, with
  a load on its top, that checks clean on a fresh install in each profile offered (2020-misumi-hfs5 and
  2020-openbuilds joined blind on printed levelling feet, 3030-misumi-hfs6 on printed brackets and feet); `cad kit
  frame/box` writes the folder to build it from. Each profile takes the sizes its box checks clean in (2020: width
  and depth 50 to 1400 mm, height 50 to 600 mm; 3030: 100 to 800 mm, height 100 to 300 mm); a size outside them, or
  a profile it cannot make, is refused before anything is written, and so is a frame's flag on another machine.
  So is a size inside them whose beams' cut lengths (the width's, the depth's and the uprights') lie under 1 mm
  apart and not one length, which two cuts at ±0.5 mm cannot hold apart (358 x 300 x 300 in 2020: 358 mm beams beside
  358.5 mm uprights); cad check warned `frame.cut` there. The 3030 box's feet tap M8 in each upright's middle bore
  alone, where the kit's beam sheets said all five.
- The template's AGENTS.md follows cad's: the kit, plates by material, and the frame template.

## 0.3.17: frames in the agents' notes (Frames 2)

### Changed

- The template's AGENTS.md follows cad's: joins between beams, screws into a slot, fittings, guides, jigs and a
  frame's build.

## 0.3.16: screws through fixings in every template (Fixings 3)

### What reads fixings now

- **The starter workspace** (`npm create rulecad my-project`) gains a second example in `projects/home`: a box with
  its lid screwed on. `box.js` and `lid.js` draw the screws' holes with `v.fixings`, named by the thread (`'M3'`):
  a pilot in each corner post and a clearance hole in the lid, sized from the thread's rule set and the printer's.
  `assemblies/lidded-box.json` holds them together with a fasten. `npx cad list home/lidded-box` buys 4 M3x8 cap
  screws, the length the check chose. The soap tray is unchanged.
- **The arm and leg machines** (`--machine arm`, `--machine leg`) are rebuilt from the repository's migrated bench
  arm and leg: every screw hole from `v.fixings`, an anchor on every screw's axis, and every screwed joint a fasten.
  `cad list arm/arm` now counts the screws: 4 M2x10 cap, 1 M3x3 set, 4 M3x6 cap, 3 M3x8 cap, 4 M3x8 countersunk,
  6 M3x10 cap, 8 M3x12 cap, 1 M3x16 cap, 2 M3x30 cap and 2 M3 hex nuts, 30.4 g in all.
- The template's AGENTS.md says a screwed joint is a fasten, with its holes from `v.fixings`, and a board's mounting
  holes are named by thread (`v.pcb.mount('M2', x, y)`).
- The machines' rules (`rules/arm.json`, `rules/leg.json`) no longer name a thread in a plate's or a flange's
  thickness ("deep enough for the motor's four screws to bite"). No value changed.

### Printed sizes that moved

The starter's soap tray moves nothing; the box and lid are new. In the machines (volumes in mm3):

| Machine | Part | What moved | Volume | Reason |
|---|---|---|---|---|
| arm | base | M5 bolt holes 5.5 to 5.6 mm; home switch M2 pilots 1.8 to 2.1 mm | 76200.62 to 76161.41 | The printer's hole compensation (0.1 mm) is now added to the M5 clearance hole, as to every other. The 1.8 mm pilot was the M2 clearance less 0.6 mm, which is no thread's figure; it is now the M2 pilot (a community figure) |
| arm | upper | home switch M2 pilots 1.8 to 2.1 mm | 100104.83 to 100088.32 | As the base |
| arm | holder | pen clamp pilot 2.8 to 2.9 mm | 25547.38 to 25546.69 | The M3 clearance less 0.6 mm, replaced by the M3 pilot |
| arm, leg | spindle | countersinks 5.5 to 6.82 mm across; disc 46 to 48 mm across | 5729.69 to 6119.54 | 5.5 mm was a cap head's diameter. An ISO 10642 M3 countersunk head needs 6.72 mm, so the heads stood about 0.6 mm proud under the bridge. The disc grew to keep 0.6 mm of edge |
| arm | forearm | boss counterbores sunk 1.5 mm (was 0.2); yoke cheeks made parallel; yoke heads counterbored 3 mm | 25738.92 to 25907.74 | An M3x16 ran 2.7 mm past the elbow output's flange into the planet gears: sunk, an M3x12 engages the whole flange and stops at its face. Tapered cheeks left no flat seat for the heads and nuts. The 28 mm yoke needs an M3x30, which reaches the nut only with the counterbore |
| leg | foot | M5 bolt holes 5.5 to 5.6 mm | 13379.21 to 13351.41 | As the arm's base |
| leg | shin | boss counterbores sunk 1.5 mm (was 0.2) | 34176.92 to 34080.07 | As the forearm: the screws stop short of the knee's planet gears |

Every other part of the machines keeps its sizes. The arm prints 439.4 g (was 438.7 g).

### Findings that changed

- The leg's stand gets two `fasten.access` warnings: the shin's screws 1 and 3 are reached only by a ball-end key in
  the stand's pose. Put the shin on before the leg goes on the stand.
- The stand's two collar clamp screws are not yet a fasten: their heads and nuts sit on the collar's round outside.
  The collar needs flats first.

### What a workspace should change

- A workspace already made from an earlier template keeps its files: nothing here changes them. To take the new
  arm or leg, make a new workspace with `--machine arm` or `--machine leg` and compare, or copy the parts above across.
  Parts already printed from the old files fit the old screws: the arm's spindle and forearm, and the leg's shin, are
  the ones whose new screws need the new holes.
- See `@rulecad/cad`'s changelog for the fasten relation and `cad add fasten --from-fits`, which moves an older
  assembly's screwed joints onto fasten.
