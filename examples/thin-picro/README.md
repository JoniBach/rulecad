# Thin RP2040 module

A long, thin RP2040 board for keyboards: castellated pins along one long edge and up both ends, and USB-C on the
other long edge. It can sit along a keyboard's back edge, with the cable straight out the back, or under the keyboard's
board behind a row of keys, its end columns of pins coming up between switches.

It is [Sea-Picro](https://github.com/joshajohnson/sea-picro) by Josh Johnson, redrawn: the same circuit, a new shape.
Sea-Picro is a keyboard controller with an RP2040, flash, USB-C, and its pins brought out as castellated
holes with 0.1 in header holes beside them.

## How it's made

1. `cad clone` read Sea-Picro's board file (`hardware/1.0-ext-castellated`, commit `936b138`) into
   `rules/sea_picro.json`: its 52 parts, 58 nets, power planes, outline, and placement rules learnt from its layout
   (which small part sits by which pin).
2. `projects/thin-picro/objects/module.js` redraws it:
   - **The core keeps Sea-Picro's own layout and routing:** the RP2040, flash, crystal, regulator and their small
     parts, turned on their side as one block, with Sea-Picro's own tracks and vias (548 tracks, 69 vias), and the
     start of each track out of the core (the RP2040's escapes).
   - **The edge pins are new:** 20 along the bottom and 8 up each end, with Sea-Picro's pad shapes: a half hole on
     the edge and a 0.1 in header hole in a long pad beside it, for soldering flat or for pin headers.
     - **The end columns slot between keys:** their header holes are 3 key widths apart (57.15 mm, `span` and
       `key_pitch`), across a 2u Backspace and the key beside it, or any three 1u keys, so a module mounted under the
       keyboard's board has its columns in the gaps between switches.
     - **The corners are laid out like Waveshare's RP2040-Zero:** each end's column runs down to the corner, beside the
       bottom row's first pin. The column's lowest pad has its top level with the tips of the bottom row's pads, and
       the bottom row's first pad is at least a pin's usual gap (0.84 mm) past the end of it.
     - **A GND at each end of the bottom row** (`row_gnd: 1`), in the space by the corners: a ground beside the GPIO
       for buttons, an encoder or the link between a split keyboard's halves. They join the GND plane, so they need no
       tracks.
     - **The pins are grouped by job,** each group on the side its signals leave the core (see Pinout): power and USB
       up the left end, the GPIO in number order along the bottom, and an SPI display's header up the right end.
     - **Three pins more than Sea-Picro's:** a second 3V3, so each end has 3V3 by a GND, and the two GND at the ends of
       the bottom row. The checks name them as additions to Sea-Picro's circuit.
     - **Reset, boot and three more GPIO** (10, 11 and 24) can have pins too (`open_pins: 1`), left unjoined: their
       signals start inside Sea-Picro's kept routing round the RP2040, where the autorouter finds no way out for them,
       so their tracks are for drawing by hand in KiCad, moving some of Sea-Picro's aside. They take the bottom row's
       end places, so set `row_gnd: 0` with them. Tried and failed: routing them last, round everything else; and
       letting go of Sea-Picro's tracks near them.
     - `headers: 0` drops the header holes (half holes only, which reach less far in) and makes the board 2 mm
       narrower. That passed its checks in an earlier layout; with this one it's untested.
   - **The USB-C socket** sits on the top edge in the same notch Sea-Picro uses, with its fuse and CC resistors. Its two
     VBUS pads (both its A4) are joined as Sea-Picro joins them: Sea-Picro's own bridge under the socket, on the back,
     with its two vias, moved with the socket. It's laid once the rest is routed, so the router routes as it would
     without it. Its tracks come as near the notch's edge (0.15 mm) as Sea-Picro's do, so the checks say so instead of
     failing them.
   - **Two mounting holes** for M2 screws (2.1 mm, as on a Raspberry Pi Pico), in the clear space between the core and
     the USB-C parts. No track comes within 1.5 mm of either hole's centre. An M2 screw head is 3.8 mm across, so its
     rim sits on solder mask over tracks: use a nylon screw or washer. Wider clear circles crowded the tracks to the
     right-hand pins, and the board stopped routing cleanly.
3. Each part shows in 3D: KiCad's own models for most parts (in `models/`), and boxes the size of the USB-C socket,
   the RP2040 and the fuse, whose own models have no licence. The tallest part is the USB-C socket, 3.18 mm overall.
   The `with-headers` version (`thin-picro/module:with-headers`, or `show_headers: 1`) also shows a pin header in each
   header hole: a square pin and its plastic spacer under the board, as a standard 2.54 mm male header. The board
   itself is the same.
4. The rest is autorouted on 4 layers like Sea-Picro: tracks on the outside, a GND plane and a 3.3 V plane inside.
   The router's vias are 0.3 mm across with a 0.15 mm hole (`via_pad`, `via_hole`: JLCPCB's preferred ring); the
   planes' vias are Sea-Picro's 0.5 mm.
   Then the router's tracks are smoothed (`smooth: true`, [@rulecad/smooth](../../packages/smooth)): their wiggles,
   detours and doubling-backs are pulled straight wherever the straight run keeps its clearance, and sharp bends are
   cut across. Where a routed track carried on from one of Sea-Picro's escapes and turned straight back (the escape
   led towards Sea-Picro's own pin, somewhere else on this board), the escape is cut back to where the track can
   leave cleanly, never into the fan-out from the RP2040's pins. A check confirms the rest of Sea-Picro's tracks and
   vias are exactly where Sea-Picro has them, and names each escape cut back.
   Last, two of JLCPCB's rules that the router doesn't know are met by small repairs, each checked: a track closer
   than 0.2 mm to a via's hole is necked to 0.1 mm where it passes, bowed round the via, or the via nudged; and two
   tracks a hair under 0.1 mm apart are necked where they pass.

The checks prove the result:

- **The circuit is Sea-Picro's:** every net joins the same pins and no others.
- **Every small part is still by the pin it serves:** decoupling capacitors by their power pins, the crystal's
  capacitors by the crystal.
- **Every plane pad reaches its copper.**
- **Clearances and the fab's rules:** JLCPCB's limits, including its rules for castellated holes and for vias (each
  via's hole 0.2 mm from tracks of other nets).
- **KiCad agrees:** where KiCad is installed, `cad check` also runs KiCad's own design-rule check on the board, KiCad
  pouring the planes itself.

Where the board does what Sea-Picro does, such as USB-C pads close to the notch's edge, the checks say so instead of
failing it.

Every size is a variable in `module.json`: the pin counts, where the USB-C socket sits, the board's height.

## Status

59.7 × 21.0 mm. It routes in about 40 minutes (a route is cached once found), and `cad check` passes everything but the finish (below):
- the circuit is Sea-Picro's, plus the added 3V3 and two GND pins
- Sea-Picro's own routing, kept exactly as it was (but for 7 escapes cut back, and its VBUS bridge moved with the socket)
- the placement
- both planes
- JLCPCB's clearances, track widths and gaps, and its rules for vias
- the castellations and the outline
- KiCad 10's design-rule check: no errors

One warning stays: the 34 half holes' copper ring is 0.2 mm, Sea-Picro's, over JLCPCB's least and under the 0.25 mm
it recommends.

0.7.2 is finished for the fab (`finish: true`), after an engineer's review of 0.7.1 flagged sharp track angles and
tracks leaving pads at an angle: tracks crossing an SMD pad's edge at an angle went from 75 to 15 (measured from the
KiCad files), acute corners from 13 to 4. What's left has no room to change without moving other nets' copper: 12
exits and 1 corner in Sea-Picro's own layout round the RP2040 (reported as the source's), and 4 exits and 3 corners on
routed tracks at vias and the USB-C pad, which the finish check fails on and names.

The autorouter is sensitive here: a shift of a tenth of a millimetre can take a layout from passing to dozens of
clearance errors. This one was found by trying small moves of the core and the mounting holes in turn (the first hole
at `hole_a_x` 8.4 mm, the core at `core_y` 0.15 mm); if you change the layout, expect to try a few nearby values.
Anything new the router has to fit changes the whole route: that's why the VBUS bridge is laid after routing.

`cad export` makes the files JLCPCB needs, and KiCad's own (`module@0.7.1.kicad_pcb` with its project and rules). It
needs KiCad installed: KiCad plots the Gerbers and drill files from the board its design-rule check has just passed,
because this board's rounded pads beside its planes, and the USB-C socket's slotted legs, are more than the other
Gerber writer can draw. Before ordering, **check the pinout** below against your keyboard's wiring.

**Flash:** 8 MB. The board file this module is read from fits a GD25Q64 (64 Mbit, LCSC C395511); the Sea-Picro EXT
sold ready-made has 16 MB.

## Pinout

Seen from above, USB-C at the top. Places run up each end from the bottom corner, and along the bottom from the left.
Each pin is labelled on the board: its RP2040 GPIO number, or its power or signal name. Where a pin has no room for its
label beside it, the label sits nearby with a small triangle pointing at the pin. In firmware, use the GPIO (`GP12`).
"Pin" is Sea-Picro's own pin number (35 is the added 3V3, 39 and 40 the added GNDs).

- **Left end (power and USB):** 5V, 3V3 and two GND at the front, the USB data pair behind (for a socket elsewhere).
  The top two places are empty.
- **Bottom (GPIO in number order):** GND, SWITCH, then GPIO20 to 23 (Sea-Picro's SPI0), 26 to 29 (these four can read
  analog), and 0 to 8 (0 and 1: UART0, the usual pair between a split keyboard's halves), then GND.
- **Right end (an SPI display's header):** GND, VCC (3V3), SCL, SDA, RES, DC, CS, BLK, front to back, on the RP2040's
  SPI1 (GPIO14 clock, 15 data, 13 chip select). A 7-pin SSD1322 OLED or an 8-pin ST7789 LCD (BLK: its backlight, on
  GPIO9, dimmable by PWM) plugs straight in. `display_gnd_front: 0` turns the order round for a display facing the
  other way. Check your firmware drives the display's controller: QMK's Quantum Painter has ST7789, not SSD1322 or
  SH1122; ZMK (Zephyr) has SSD1322.

Pad 32, labelled LED5V, inside the board under the USB-C parts, is data for a string of WS2812 LEDs at 5 V: GPIO25
through a level shifter, as Sea-Picro's documentation describes it.

| Place | Pin | RP2040 | Sea-Picro net | Use |
|---|---|---|---|---|
| left end 6 | 1 | - | USB+ |  |
| left end 5 | 31 | - | USB- |  |
| left end 4 | 29 | - | GND |  |
| left end 3 | 5 | - | GND |  |
| left end 2 | 35 | - | +3V3 (added) |  |
| left end 1 | 30 | - | +5V |  |
| bottom 1 | 39 | - | GND (added) |  |
| bottom 2 | 28 | - | SWITCH |  |
| bottom 3 | 21 | GPIO20 | 20_MISO |  |
| bottom 4 | 19 | GPIO21 | 21_nCS |  |
| bottom 5 | 22 | GPIO22 | 22_SCK |  |
| bottom 6 | 20 | GPIO23 | 23_MOSI |  |
| bottom 7 | 23 | GPIO26 | A0 |  |
| bottom 8 | 24 | GPIO27 | A1 |  |
| bottom 9 | 25 | GPIO28 | A2 |  |
| bottom 10 | 26 | GPIO29 | A3 |  |
| bottom 11 | 2 | GPIO0 | 0_TX0 |  |
| bottom 12 | 3 | GPIO1 | 1_RX0 |  |
| bottom 13 | 6 | GPIO2 | 2_SDA1 |  |
| bottom 14 | 7 | GPIO3 | 3_SCL1 |  |
| bottom 15 | 8 | GPIO4 | 4 |  |
| bottom 16 | 9 | GPIO5 | 5 |  |
| bottom 17 | 10 | GPIO6 | 6 |  |
| bottom 18 | 11 | GPIO7 | 7 |  |
| bottom 19 | 12 | GPIO8 | 8 |  |
| bottom 20 | 40 | - | GND (added) |  |
| right end 1 | 4 | - | GND | display GND |
| right end 2 | 27 | - | +3V3 | display VCC |
| right end 3 | 16 | GPIO14 | 14 | display SCL |
| right end 4 | 17 | GPIO15 | 15 | display SDA |
| right end 5 | 18 | GPIO16 | 16 | display RES |
| right end 6 | 14 | GPIO12 | 12 | display DC |
| right end 7 | 15 | GPIO13 | 13 | display CS |
| right end 8 | 13 | GPIO9 | 9 | display BLK |

USB+ and USB- are the USB data lines, for a socket elsewhere. SWITCH is Sea-Picro's SWITCH pin (through R4 to Q1);
its documentation doesn't describe it, so check Sea-Picro's schematic before using it.

## Build it

Board designs run in the tool's own process, with the board engine, not in the design sandbox, so cad asks you once to
trust this workspace: read the designs in `projects/thin-picro/objects/`, then run `npx cad trust` here.

```sh
npx cad trust                        # once: this workspace's board designs may run (kept in your own list)
npx cad check thin-picro/module      # build, route and check (routing takes about 40 minutes)
npx cad preview thin-picro/module:with-headers   # the same board in 3D with pin headers fitted
npx cad export thin-picro/module     # Gerbers, drill files, BOM and placement for JLCPCB
```

When ordering, choose 4 layers and castellated holes. The BOM carries Sea-Picro's LCSC part numbers.

## Macropads to test it on

`thin-picro/macropad` is a 3 × 4 macropad for trying the module out, a through-hole build, in two variants, each with
an assembly (`assemblies/macropad-front.json`, `macropad-rear.json`) showing it built. Both have twelve keys on a
footprint that takes either a Cherry MX or a Kailh Choc v1 switch (soldered: `hybridSwitch` in @rulecad/pcb, Choc's
holes from `rules/choc.json`), in a 4-row × 3-column matrix with a 1N4148 (DO-35, `rules/do35.json`) per key, lying in
the gap beside its switch on the front, its cathode down. M2 holes sit where four keys meet, below rows 1 and 2. The
module's pins come from `rules/thin_picro_pins.json`, read from the module's KiCad board by `scripts/module-pins.mjs`,
so the macropads build without routing the module. Nothing on them is for JLCPCB to place: order bare boards and
solder the switches, diodes, sockets and module yourself. Both are finished for the fab: every track leaves its pad
square, no tracks meet at an acute angle.

- **`macropad:front`**, 67.6 × 105.7 mm: the module on top, above the keys, on one long pad per pin. Each pad takes the
  module either way: soldered flat by its castellated edges (the pad reaches 1 mm past the module's edge for the
  fillet), or on 0.1 in pin headers in sockets, so one module can move between boards. At the module's right end, an
  8-pin socket in its display order (GND VCC SCL SDA RES DC CS BLK, GPIO 14 15 16 12 13 9), set so a 2.0 in ST7789
  display (`rules/st7789_2in.json`, sellers' sizes: measure yours) plugs in and lies flat over the module, clear of
  the keys; it reaches up past the board's top edge, so the board has a tab there for the socket. At the left end, a
  4-pin I2C socket (GND VCC SCL SDA on GPIO 3 and 2: SSD1306 OLEDs). The assembly shows MX switches with DSA keycaps
  and the display plugged in.
- **`macropad:rear`**, 59.7 × 76.9 mm, no bigger than the keys and the module: the module under the top row of keys,
  parts facing down, on pin headers. Its bottom row of pins comes up through the gap between the top two rows of keys,
  and its end columns up the board's two sides (three key widths apart: what `span` is for). The top row's outer
  gaps hold those pins, so one of its diodes sits in the row below. Trim the switches' legs and the diodes' leads
  before fitting the module (MX legs reach about 1.7 mm below a 1.6 mm board, Choc's about 1.4 mm, against a standard
  header's 2.5 mm spacer). The assembly shows Choc switches with low-profile keycaps.

Matrix (both boards, `-matrix.json` in the export for firmware): rows GP26 27 28 29 (top to bottom), columns GP20 21
22 (left to right as seen on the front board), diodes from each switch to its row (COL2ROW).

```sh
npx cad check thin-picro/macropad:front    # and :rear
npx cad check thin-picro/macropad-front    # the assembly: switches, keycaps, module, display
npx cad export thin-picro/macropad:front
```

## Licence

Sea-Picro is under the [CERN Open Hardware Licence v2, Strongly Reciprocal](LICENSE), so this board is too.
Share it, and anything you make from it, under the same licence, with its design files. That covers this folder,
including `rules/sea_picro.json`. rulecad's own code is MIT, and its other rule sets (here `rules/jlcpcb.json`, a copy
`cad` keeps) are CC0.
