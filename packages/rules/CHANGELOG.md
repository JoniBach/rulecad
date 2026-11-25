# Changelog: @rulecad/rules

What changed in each release, for someone upgrading a workspace. A rule set's **values** are the figures designs
read (`m3.clearance`, `x1c.hole_comp`). Each release says whether any value changed, and why.

## 0.3.24: a second maker's sheets, ranges readable
### Added

- A second maker's sheet beside three printed plastics, each in the same rules with its sheet's range:
  `pla-prusament` (Prusament PLA, version 1.0, 2018), `petg-polylite` and `asa-polylite` (Polymaker PolyLite PETG and
  ASA, V5.4). A design reads either maker (`asa_polylite.strength_z`) or sets its material to one. No existing value
  changed. ABS and PA-CF still have one maker each: no second sheet could be read with figures across the layers that
  hold together (Bambu Lab's ABS sheet gives 3800 MPa in tension and 1880 MPa in bending; Polymaker's Fiberon PA6-CF20
  is another nylon, and its density was not readable).

### Changed

- The README says how expressions read a range's ends (`pla.strength.low`). No value changed.

## 0.3.23: ABS, ASA and PA-CF with ranges
### Added

- `abs`, `asa` and `pa_cf`: Polymaker PolyLite ABS (data sheet V5.6), Bambu Lab ASA (V2.0) and Bambu Lab PAHT-CF (V2.0,
  dry and annealed), printed, for analysis: modulus and tensile strength along the layers and across them, density,
  Poisson's ratio (an estimate: no maker publishes one) and, for ASA and PAHT-CF, the softening point.
- A rule may give the range it is found in, `low` and `high` in its unit. The printed plastics carry their data
  sheets' spread: `pla` and `petg` gain `low` and `high` on their moduli and strengths. No value changed.

## 0.3.22: how parts are made
### Added

- `mill-3axis`: 3-axis milling's thinnest walls (metal 0.8 mm, plastic 1.5 mm, and what is feasible), inside corners
  a third of the pocket's depth, pockets at most four times as deep as wide, and holes from 1 mm (community, Protolabs
  Network's CNC design guide).
- `mould-injection`: draft for injection moulding: a degree per inch of depth, 0.5 at least, 3 at a shutoff and for a
  light texture, 5 for a heavy one (community, Protolabs' draft guidelines).
- `dmls`: metal powder bed printing: overhangs at 45 degrees (316L: 55), 2.032 mm bridges, holes from 0.635 mm,
  features from 0.3048 mm (community, Protolabs' DMLS guide), and powder escape holes from 2 mm (community, Xometry).

No existing value changed.

## 0.3.20: MISUMI slot 10 nuts
### Added

- `slot-nut-10-misumi-m4-slide-in` to `-m8-slide-in` and `-m4-drop-in` to `-m8-drop-in` (issue 308): MISUMI's 8 series
  (10 mm slot) HNTT8 and HNTF8 nuts in M4, M5, M6 and M8, their sizes, heights and tongues from the 2014 catalogue's
  pages 2-669 to 2-672 (spec). MISUMI gives a tightening torque and no pull, so each `hold` is an estimate: Rexroth's
  8 mm slot figures (sliding block 6000 N, T-nut 4000 N), or the screw's proof load where that is less (M4, 5092 N).
  MISUMI makes no M3 for this series and no M2 for its 5 series: the catalogue lists none, so no set is added for them.

### Values

- None changed.

## 0.3.19: pins, magnets and the printer's new fits (Fixings 4)

### Added

- `pins`: steel dowel diameters and lengths sold to ISO 8734 (community, a seller's listing), its m6 tolerance, a
  dowel's shear strength (estimate: S275's yield over √3, which understates a hardened pin), and 1.75 mm filament's
  diameter (Bambu Lab's PLA Basic data sheet) and its ±0.03 mm (community).
- `magnets`: six disc magnets (6 x 2, 6 x 3, 8 x 3, 10 x 2, 10 x 3, 12 x 3) and two blocks, each with its seller's
  pull straight off steel and the grade it was sold in (community, supermagnete's product pages), the remanence of
  each grade N35 to N52, the default grade N35, the size tolerance, the density, and the on-axis field formula.
- `x1c`: `snap_clearance` (0.2 mm), `pin_press` (0.05 mm), `pin_slip` (0.2 mm), `magnet_press` (0.1 mm),
  `magnet_glue` (0.1 mm) and `magnet_crush` (0.2 mm), all estimates until the holds coupon measures them
  (examples/bench/projects/benchmarks/MEASURE.md, rows 40 to 47).

No existing value changed.

## 0.3.18: Kailh Choc v1, DO-35 diodes

### Added

- `do35`: DO-35 axial diodes (the 1N4148): lead pitch, pads and drill from KiCad's footprint, body and lead sizes.
- `choc`: the Kailh Choc v1 (PG1350) PCB footprint (pins, centre post, pegs) from ergogen's widely used footprint,
  its housing and height from Kailh's drawing, and MX key spacing for boards that take both.

### Values that changed

None.

## 0.3.17: printed beams (Frames 3)

### Added

- `profile-1515-printed`, `profile-2020-printed`, `profile-3030-printed`, `profile-4040-printed` and their slots
  (`slot-3-printed-1515`, `slot-6-printed-2020`, `slot-8-printed-3030`, `slot-8-printed-4040`): beams to print lying
  down, worked out by `@rulecad/frames` `printedProfile` from their nuts and the X1C's rules (every value `derived`).
- `slot-nut-3-openbeam-m3-hex`: the plain M3 nut OpenBeam's slot captures.
- Vocabulary: `end_thread` and `end_at`, a printed profile's end fixing.

No existing value changed.

## 0.3.16: fittings, rails, wheels and the joint rig (Frames 2)

### Added

- Vocabulary: `fitting`, `rail`, `wheel` and `eccentric` parts; `mount_holes` as points; stiffness in N mm/rad.
- Sets: seven bought fittings from makers' drawings with their prices; HIWIN MGN7 to MGN15 rails and carriages;
  OpenBuilds' V-wheels and eccentric spacers; mounting holes in the supply and shield sets; plastics' price per
  kilogram; and the joint rig's estimates (`joins`).

No existing value changed.

## 0.3.15: old thread names kept and checked (Fixings 3)

### What reads fixings now

This package holds data only and reads nothing. Its thread sets (`m1_6` to `m12`, `unc_4_40` to `unc_3_8_16`) are what
`@rulecad/fixings` reads for every screw in the kit, so through fixings they now size every screw hole in cad's
designs (`v.fixings`), motors' mounts and pcb's board holes.

### Changed

- A test holds that every thread name a design in the repository reads (its examples, the create-rulecad templates
  and machines, and cad's worked examples) is in the kit's set, that each old name is the vocabulary's own name for
  its figure, and that each alias a set lists in `"interface"` (`screw_clearance` is `clearance`) names a vocabulary
  field and a rule the set has.
- The README says which names designs read stay, and what happens to a workspace's own copy of a set after an
  upgrade: it is read as it is, and `cad rules check m3` lists what the kit's set has that the copy lacks.

### Values that changed

None. No rule's value, unit or kind changed in this release.

### What a workspace should change

- A workspace that keeps its own copy of a thread set (`rules/m3.json`, made before the sets were widened) keeps
  working, and reads its copy first. Run `npx cad rules check` to see what the kit's set has that the copy lacks (a
  pilot, nut flats, insert hole, sold lengths): copy those across, or delete the copy to read the kit's. A copy that
  holds only some figures makes a design read its clearances from the copy and its pilots and lengths from the kit,
  so a later kit release could move a printed part without the copy changing.
