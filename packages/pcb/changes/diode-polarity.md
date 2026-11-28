---
title: diodes are wired the right way round, with pad 1 as the cathode
bump: minor
---
### Fixed

- A net or track joined to a diode's `cathode` now reaches the diode's cathode. The board engine used to name a diode's two ports by the order of its pads, the first one the anode, whatever the pads said they were. On a DO-35 diode (`do35()`) the first pad is the square cathode pad, so every net joined to `D.cathode` went to the round anode pad instead, against the band printed on the board. A pad named `cathode` or `anode` (or `K`, `A`) is now that end; a diode whose pads are only numbered has pad 1 as its cathode, as KiCad and assemblers number a diode's pads.
- A diode's cathode is now its pin 1 in every file the board makes: the KiCad board and schematic, and the placement file. The keyboard's SOD-123 diodes (`keyboard()`) are turned half round on the back so that pad 1, the cathode, is on the row's side. Their copper and the bar printed by each one do not move; the KiCad files and the placement file change (each diode is placed at 180° rather than 0°).
- A diode with other than two pads, or with both pads at the same end, is refused with a message saying how to name them.

### Changed

- A diode's ports are `pin1` (also `cathode`, `neg`, `K`, `1`) and `pin2` (also `anode`, `pos`, `A`, `2`). The names `left` and `right`, which meant the first and second pad, are gone: use `cathode` and `anode`.

### Boards made before this change

- **thin-picro macropads** (`examples/thin-picro`, `macropad:front` and `macropad:rear`), and any other board with `do35()` diodes: every diode was wired backwards. Fitted by the band on the board, no key reads with COL2ROW firmware. To tell: on the old board, the row's track (the one running along to the next diode in the row) goes to the round pad. A board already made works if each diode is fitted with its band at the round pad, the opposite of the band printed on the board, or with firmware set to ROW2COL.
- **Keyboards made with `keyboard()`**, hand-soldered by the printed bar: these were right, and still are. Assembled by a fab from the old placement file, or drawn from the old KiCad files, every diode may be reversed, because those files gave the anode as pad 1. To tell: in the old KiCad board, each diode's pad 1 is on its switch's net. Check an assembled board's diodes: the band (cathode) should be on the side of the row track; if it is on the switch's side, set the firmware to ROW2COL.
- Build the boards again to get new Gerbers, KiCad files and placement files. The macropads' tracks to their diodes move; no printed size moves.
