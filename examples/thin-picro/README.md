# Thin RP2040 module

A long, thin RP2040 board for keyboards: castellated pins along one long edge and up both ends, and USB-C on the
other long edge. It can sit along a keyboard's back edge, with the cable straight out the back, or under the keyboard's
board behind a row of keys, its end columns of pins coming up between switches.

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
   - **The edge pins are new:** 18 along the bottom and 8 up each end, with Sea-Picro's pad shapes: a half hole on
     the edge and a 0.1 in header hole in a long pad beside it, for soldering flat or for pin headers.
     - **The end columns slot between keys:** their header holes are 3 key widths apart (57.15 mm, `span` and
       `key_pitch`), across a 2u Backspace and the key beside it, or any three 1u keys, so a module mounted under the
       keyboard's board has its columns in the gaps between switches.
     - **The corners are laid out like Waveshare's RP2040-Zero:** each end's column runs down to the corner, beside the
       bottom row's first pin. The column's lowest pad has its top level with the tips of the bottom row's pads, and
       the bottom row's first pad is at least a pin's usual gap (0.84 mm) past the end of it.
     - **The pins are grouped by job,** each group on the side its signals leave the core (see Pinout): power and USB
       up the left end, the GPIO in number order along the bottom, and an SPI display's header up the right end.
     - **One pin more than Sea-Picro's,** a second 3V3, so each end has 3V3 by a GND. The checks name it as an
       addition to Sea-Picro's circuit.
     - **Reset, boot and three more GPIO** (10, 11 and 24) can have pins too (`open_pins: 1`), left unjoined: their
       signals start inside Sea-Picro's kept routing round the RP2040, where the autorouter finds no way out for them,
       so their tracks are for drawing by hand in KiCad, moving some of Sea-Picro's aside. Tried and failed: routing
       them last, round everything else; and letting go of Sea-Picro's tracks near them.
     - `headers: 0` drops the header holes (half holes only, which reach less far in) and makes the board 2 mm
       narrower. That passed its checks in an earlier layout; with this one it's untested.
   - **The USB-C socket** sits on the top edge in the same notch Sea-Picro uses, with its fuse and CC resistors.
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

59.7 × 21.0 mm. It routes in about 15 minutes, and `cad check` passes everything but one spot:
- the circuit is Sea-Picro's, plus the added 3V3 pin
- the placement
- both planes
- the castellations and the outline
- JLCPCB's clearances and track widths, **except one overlap**: the routed tracks to GPIO27 (pin 24) and GPIO22
  (pin 22) touch next to the RP2040's corner. Both are new tracks (none of Sea-Picro's), so it's a short nudge in
  KiCad's router; the autorouter's own repair didn't clear it, and nudging the layout gave worse results.

Before ordering:
- **Fix that overlap in KiCad,** then run KiCad's design-rule check: open `exports/thin-picro/module@0.5.0.kicad_pcb`.
  Don't order from `cad export`'s Gerbers until then: they have the overlap too.
- **Check the pinout** below against your keyboard's wiring.

It hasn't been made yet.

## Pinout

Seen from above, USB-C at the top. Places run up each end from the bottom corner, and along the bottom from the left.
Each pin is labelled on the board: its RP2040 GPIO number, or its power or signal name. Where a pin has no room for its
label beside it, the label sits nearby with a small triangle pointing at the pin. In firmware, use the GPIO (`GP12`).
"Pin" is Sea-Picro's own pin number (35 is the added 3V3).

- **Left end (power and USB):** 5V, 3V3 and two GND at the front, the USB data pair behind (for a socket elsewhere).
  The top two places are empty.
- **Bottom (GPIO in number order):** SWITCH, then GPIO20 to 23 (Sea-Picro's SPI0), 26 to 29 (these four can read
  analog), and 0 to 8 (0 and 1: UART0, the usual pair between a split keyboard's halves).
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
| bottom 1 | 28 | - | SWITCH |  |
| bottom 2 | 21 | GPIO20 | 20_MISO |  |
| bottom 3 | 19 | GPIO21 | 21_nCS |  |
| bottom 4 | 22 | GPIO22 | 22_SCK |  |
| bottom 5 | 20 | GPIO23 | 23_MOSI |  |
| bottom 6 | 23 | GPIO26 | A0 |  |
| bottom 7 | 24 | GPIO27 | A1 |  |
| bottom 8 | 25 | GPIO28 | A2 |  |
| bottom 9 | 26 | GPIO29 | A3 |  |
| bottom 10 | 2 | GPIO0 | 0_TX0 |  |
| bottom 11 | 3 | GPIO1 | 1_RX0 |  |
| bottom 12 | 6 | GPIO2 | 2_SDA1 |  |
| bottom 13 | 7 | GPIO3 | 3_SCL1 |  |
| bottom 14 | 8 | GPIO4 | 4 |  |
| bottom 15 | 9 | GPIO5 | 5 |  |
| bottom 16 | 10 | GPIO6 | 6 |  |
| bottom 17 | 11 | GPIO7 | 7 |  |
| bottom 18 | 12 | GPIO8 | 8 |  |
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

```sh
npx cad check thin-picro/module      # build, route and check (routing takes about 15 minutes)
npx cad preview thin-picro/module:with-headers   # the same board in 3D with pin headers fitted
npx cad export thin-picro/module     # Gerbers, drill files, BOM and placement for JLCPCB
```

When ordering, choose 4 layers and castellated holes. The BOM carries Sea-Picro's LCSC part numbers.

## Licence

Sea-Picro is under the [CERN Open Hardware Licence v2, Strongly Reciprocal](LICENSE), so this board is too.
Share it, and anything you make from it, under the same licence, with its design files. That covers this folder,
including `rules/sea_picro.json`. rulecad's own code is MIT, and its other rule sets (here `rules/jlcpcb.json`, a copy
`cad` keeps) are CC0.
