# Changelog: create-rulecad

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release lists every printed size that moved in what
it makes, with its reason. A **fasten** is an entry in an assembly's `"fasten"` list: one screwed joint, naming the
screw by thread and head, the parts it passes through and the part it ends in.

## Unreleased: pins, magnets and printed bolts in the agent notes (Fixings 4)

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
