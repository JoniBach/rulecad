# Changelog: @rulecad/pcb

What changed in each release, for someone upgrading a workspace. A **drilled size** here is a dimension the fab
makes (a hole's diameter in the drill file). Each release says whether any drilled or printed size moved, and why.

## 0.5.5: a footprint for MX or Choc switches, and direct-wired keys

### Added

- `hybridSwitch(name, x, y, mx, choc)`: one footprint that takes a Cherry MX or a Kailh Choc v1 switch, soldered.
  Both switches' pins keep their own holes, a pair per pin (pin1: MX's pin 1 and Choc's pin 1; pin2 likewise), joined
  by a track. The centre hole is MX's 4.0 mm (a Choc post fits it); each side's two pegs, 0.42 mm apart, share one
  hole round both (2.12 mm).
- A switch or diode with more than one pad on a pin draws as one symbol in the schematic, as chips already did.
- Checks: a board whose keys are wired straight to GPIO (`matrix.direct`, `{ K1: 'GP20', ... }`) is checked for no
  GPIO used twice, in place of the row and column check.

### Drilled and printed sizes that moved

None: existing footprints are unchanged.

## 0.5.4: a board's mounting holes named by thread (Fixings 3)

### What reads fixings now

- `mount(thread, x, y, { fit, d, keepout, set, sets })` sizes a board's own mounting hole from the thread's rule set
  through `@rulecad/fixings`: `mount('M2', x, y)` is `m2.clearance`, 2.4 mm, the normal clearance hole of ISO 273. The
  fab drills it, so no printer's compensation is added. `{ fit: 'close' }` and `{ fit: 'loose' }` take ISO 273's other
  two holes.
- `{ d }` keeps a hole the board's maker gives (a Raspberry Pi Pico's 2.1 mm), and refuses one no wider than the thread.
- `mount` refuses a non-thread, a whole screw's name, a hole the screw would not pass, an unknown option or fit.
- The keyboard recipe's corner holes (`mount_holes: 1`) are now `mount('M2', ...)`.
- New dependency: `@rulecad/fixings`.

### Drilled and printed sizes that moved

None. The keyboard recipe's corner holes stay 2.4 mm (`m2.clearance`, as before). The thin-picro module in the
repository keeps the Pico's 2.1 mm holes through `{ d: 2.1 }`, so it fits cases made for a Pico; its fab files are
unchanged.

### What a workspace should change

- A board that typed its mounting hole's diameter can name the thread instead: `holes: [mount('M2', 10, 5)]`. Typed
  holes keep working.
- In cad, a case under a board can read the board's holes (`v.pcb.board_holes`), draw an insert's boss under each
  with `v.fixings.insertBoss('M2', ...)`, and the assembly can screw the board down with a `fasten` through the
  board's own holes (`"holes": "pcb.board"`). cad's EXAMPLES, chapter 6, does this end to end.
