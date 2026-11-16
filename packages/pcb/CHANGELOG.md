# Changelog: @rulecad/pcb

What changed in each release, for someone upgrading a workspace. A **drilled size** here is a dimension the fab
makes (a hole's diameter in the drill file). Each release says whether any drilled or printed size moved, and why.

## Next release: a board's mounting holes named by thread (Fixings 3)

The version number is set when the release is published.

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
