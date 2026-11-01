# Thin RP2040 module

A long, thin RP2040 board for keyboards: castellated pins along one long edge and up both ends, and USB-C on the
other long edge. A keyboard's main board can take it along its back edge, with the cable straight out the back.

It is [Sea-Picro](https://github.com/joshajohnson/sea-picro) by Josh Johnson, redrawn: the same circuit, a new shape.
Sea-Picro is a keyboard controller with an RP2040, 16 MB of flash, USB-C, and its pins brought out as castellated
holes with 0.1 in header holes beside them.

## How it's made

1. `cad clone` read Sea-Picro's board file (`hardware/1.0-ext-castellated`, commit `936b138`) into
   `rules/sea_picro.json`: its 52 parts, 58 nets, power planes, outline, and placement rules learnt from its layout
   (which small part sits by which pin).
2. `projects/thin-picro/objects/module.js` redraws it:
   - **The core keeps Sea-Picro's own layout and routing:** the RP2040, flash, crystal, regulator and their small
     parts, turned on their side as one block, with Sea-Picro's own tracks and vias (548 tracks, 69 vias), and the
     start of each track out of the core (the RP2040's escapes).
   - **The edge pins are new:** 19 along the bottom and 6 up each end, with Sea-Picro's pin numbers and pad shapes.
     They're on one 2.54 mm grid: each end's lowest pin sits at the corner, beside the bottom row's first. They're half
     holes only, to solder the module flat on a keyboard's board, so they reach less far in and the board is narrower;
     `headers: 1` in `module.json` adds Sea-Picro's 0.1 in header holes beside them, for pin headers, at 21.0 mm across.
     Each pin sits where its track comes out of the core, so the tracks fan out without crossing. The pins keep
     Sea-Picro's nets; only where they sit changes, so check the pinout before wiring a keyboard to it.
   - **The USB-C socket** sits on the top edge in the same notch Sea-Picro uses, with its fuse and CC resistors.
3. Each part shows in 3D: KiCad's own models for most parts (in `models/`), and boxes the size of the USB-C socket,
   the RP2040 and the fuse, whose own models have no licence. The tallest part is the USB-C socket, 3.18 mm overall.
4. The rest is autorouted on 4 layers like Sea-Picro: tracks on the outside, a GND plane and a 3.3 V plane inside.

The checks prove the result:

- **The circuit is Sea-Picro's:** every net joins the same pins and no others.
- **Every small part is still by the pin it serves:** decoupling capacitors by their power pins, the crystal's
  capacitors by the crystal.
- **Every plane pad reaches its copper.**
- **Clearances and the fab's rules:** JLCPCB's limits, including its rules for castellated holes.

Where the board does what Sea-Picro does, such as USB-C pads close to the notch's edge, the checks say so instead of
failing it.

Every size is a variable in `module.json`: the pin counts, where the USB-C socket sits, the board's height.

## Status

50.8 × 19.0 mm (21.0 mm with header holes). It routes in about 5 minutes, and `cad check` passes everything:
- the circuit is Sea-Picro's
- the placement
- both planes
- JLCPCB's clearances and track widths
- the castellations and the outline

`cad export` makes the files JLCPCB needs.

It hasn't been made yet. Before ordering:
- **Open `exports/thin-picro/module@0.1.0.kicad_pcb` in KiCad and run its design-rule check** as a second opinion.
- **Check the pinout** below against your keyboard's wiring: the pins aren't in Sea-Picro's order.

## Pinout

Seen from above, USB-C at the top. Places run up each end from the bottom corner, and along the bottom from the left;
all are on one 2.54 mm grid, so the lowest end pins sit diagonally beside bottom 1 and bottom 19.
Each pin is labelled on the board: its RP2040 GPIO number, or its power or signal name. In firmware, use the GPIO
(`GP12`). "Pin" is Sea-Picro's own pin number, which these places don't follow: each pin sits where its track leaves
the core. Pad 32, labelled LED5V, inside the board under the USB-C parts, is data for a string of WS2812 LEDs at 5 V:
GPIO25 through a level shifter, as Sea-Picro's documentation describes it.

| Place | Pin | RP2040 | Sea-Picro net |
|---|---|---|---|
| left end 6 | 21 | GPIO20 | 20_MISO |
| left end 5 | 20 | GPIO23 | 23_MOSI |
| left end 4 | 22 | GPIO22 | 22_SCK |
| left end 3 | 23 | GPIO26 | A0 |
| left end 2 | 28 | - | SWITCH |
| left end 1 | 24 | GPIO27 | A1 |
| bottom 1 | 25 | GPIO28 | A2 |
| bottom 2 | 26 | GPIO29 | A3 |
| bottom 3 | 30 | - | +5V |
| bottom 4 | 1 | - | USB+ |
| bottom 5 | 2 | GPIO0 | 0_TX0 |
| bottom 6 | 27 | - | +3V3 |
| bottom 7 | 3 | GPIO1 | 1_RX0 |
| bottom 8 | 6 | GPIO2 | 2_SDA1 |
| bottom 9 | 7 | GPIO3 | 3_SCL1 |
| bottom 10 | 8 | GPIO4 | 4 |
| bottom 11 | 9 | GPIO5 | 5 |
| bottom 12 | 10 | GPIO6 | 6 |
| bottom 13 | 11 | GPIO7 | 7 |
| bottom 14 | 12 | GPIO8 | 8 |
| bottom 15 | 13 | GPIO9 | 9 |
| bottom 16 | 14 | GPIO12 | 12 |
| bottom 17 | 4 | - | GND |
| bottom 18 | 5 | - | GND |
| bottom 19 | 29 | - | GND |
| right end 1 | 15 | GPIO13 | 13 |
| right end 2 | 16 | GPIO14 | 14 |
| right end 3 | 17 | GPIO15 | 15 |
| right end 4 | 31 | - | USB- |
| right end 5 | 18 | GPIO16 | 16 |
| right end 6 | 19 | GPIO21 | 21_nCS |

USB+ and USB- are the USB data lines, for a socket elsewhere. SWITCH is Sea-Picro's SWITCH pin (through R4 to Q1);
its documentation doesn't describe it, so check Sea-Picro's schematic before using it.

## Build it

```sh
npx cad check thin-picro/module      # build, route and check (routing takes a few minutes)
npx cad export thin-picro/module     # Gerbers, drill files, BOM and placement for JLCPCB
```

When ordering, choose 4 layers and castellated holes. The BOM carries Sea-Picro's LCSC part numbers.

## Licence

Sea-Picro is under the [CERN Open Hardware Licence v2, Strongly Reciprocal](LICENSE), so this board is too.
Share it, and anything you make from it, under the same licence, with its design files. That covers this folder,
including `rules/sea_picro.json`. rulecad's own code is MIT, and its other rule sets (here `rules/jlcpcb.json`, a copy
`cad` keeps) are CC0.
