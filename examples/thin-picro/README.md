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
     Each pin sits where its track comes out of the core, so the tracks fan out without crossing. The pins keep
     Sea-Picro's nets; only where they sit changes, so check the pinout before wiring a keyboard to it.
   - **The USB-C socket** sits on the top edge in the same notch Sea-Picro uses, with its fuse and CC resistors.
3. The rest is autorouted on 4 layers like Sea-Picro: tracks on the outside, a GND plane and a 3.3 V plane inside.

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

50.8 × 21.0 mm. It routes in about 6 minutes, and `cad check` passes everything:
- the circuit is Sea-Picro's
- the placement
- both planes
- JLCPCB's clearances and track widths
- the castellations and the outline

`cad export` makes the files JLCPCB needs.

It hasn't been made yet. Before ordering:
- **Open `exports/thin-picro/module@0.1.0.kicad_pcb` in KiCad and run its design-rule check** as a second opinion.
- **Check the pinout.** The pins aren't in Sea-Picro's order: each sits where its track leaves the core.

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
