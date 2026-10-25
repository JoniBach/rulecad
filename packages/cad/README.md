# @rulecad/cad

The `cad` command: design physical things in [JSCAD](https://github.com/jscad/OpenJSCAD.org) from rules you can trace,
check them for printing and for fit, version them by what fits, share them as links, and export them for the printer
(STL, or 3MF in Bambu Studio's layout with each part on its own filament). Every measurement in a design is a variable,
and every variable says which rule it comes from: the printer, a standard (Cherry MX), or something you measured.

```sh
mkdir my-designs && cd my-designs
npm init -y && npm pkg set type=module
npm install @rulecad/cad @jscad/modeling
npx cad new bathroom/soap-tray       # a design to start from: soap-tray.js (the shape) and .json (its variables)
npx cad check bathroom/soap-tray     # raw numbers in the design, then printability
npx cad preview bathroom/soap-tray   # six views as a PNG in .preview/ (needs Chrome or Chromium)
npx cad export bathroom/soap-tray    # a 3MF for your slicer, in exports/
npx cad link bathroom/soap-tray      # a link that opens the model in a browser (nothing is uploaded)
```

```
rules/                     shared facts, one file per set: x1c.json (printer), mx.json (Cherry MX). A set from
                           @rulecad/rules is copied here the first time a design uses it: yours to keep and correct
projects/<project>/
  project.json             name, description, default material, printer, objects, filaments (AMS slots)
  objects/<object>.json    variables (value, unit, rule, source, label, show, interface, tweak), variants, parts
  objects/<object>.js      main(v): the shape, from variables only
  layouts/<name>.json      where the keys go, with each key's own properties (@rulecad/keyboard-layout)
  assemblies/<name>.json   objects placed together: to check a fit, or to print together
  CHANGELOG.md, prints.jsonl   release notes, and what was printed
cad.config.json            the workspace: printer, model page, targets
exports/ .preview/ .versions/ .cache/   generated (ignore them in git); .cache/builds holds built parts
```

```sh
npx cad rules bathroom/soap-tray                 # every variable, its rule and source
npx cad check bathroom/soap-tray --set width=60   # change variables that have a tweak range
npx cad variants keyboard/keycap                 # named sets of inputs: keyboard/keycap:legend-f
npx cad compare keyboard/keycap dsa legend-f     # two variants (or releases) side by side
npx cad import-kle layout.json keyboard/mine     # a layout from keyboard-layout-editor.com, into layouts/
npx cad measure cover.3mf --rules cover          # a model from elsewhere, measured into draft rules
npx cad match legion-go/rail cover.3mf           # how closely a design matches that model, both ways
```

The keyboard examples below come from the project rulecad grew out of: a keycap, a switch plate, a case and their
circuit boards.

## The workspace

The workspace is `$CAD_WORKSPACE`, else the nearest folder at or above the current one with a `cad.config.json`,
else the current folder:

```json
{ "printer": "x1c", "viewUrl": "https://…/", "targets": { "show": "targets/show.mjs", "shorten": "gist" } }
```

- `printer`: the rule set prints are checked against (bed, overhang, layer, bridge, support_gap); a project.json's
  `printer` wins.
- `targets`: optional. `show` puts a model on display: a module of yours, exporting `show({ title, ttl, mesh, card })`
  (lib/targets.mjs describes it): a smart mirror, a second screen, a slicer. `shorten` stores a link's data for
  short links (`gist`: a secret Gist, through the `gh` command). Leave one out and `cad show` says so, and links stay
  long.
- Designs are ES modules that import JSCAD themselves, so the workspace needs `"type": "module"` and
  `@jscad/modeling`. Circuit boards need `@rulecad/pcb` as well.
- Previews need Chrome or Chromium: `$CAD_CHROME`, else the usual install paths.
- Designs are code: run only designs you trust. Links and rule files are data and never run.

## Links

`cad link <project>/<object>` (and `cad show`) prints three links to the model page (`viewUrl`; a public one by default):
view the model in a browser, or download its STL or 3MF as soon as the link opens. The model travels in the link's
fragment, which never reaches the web host, so the public page can open private designs. A link records exactly
which version it holds (`keyboard/keycap@0.1.0`, or `+changes` if it isn't a release). The page is to become `@rulecad/viewer`;
`scripts/publish-view.sh "message"` publishes it (only that folder) to the public repo.

- **Rules:** a link carries the model's values and the rules they use (value, source, kind, date checked) for the
  page's Rules panel; estimates are marked there. A rule set with `"private": true` stays out of links, and
  `--no-rules` leaves the list out altogether. Anyone with a link can read what it carries.
- **Short links** (`--short`, and the default for `--md`, once `"shorten": "gist"` is in `cad.config.json`'s
  `targets`): the link's data goes in a secret GitHub Gist (unlisted, but anyone with the link can open it) and the
  link carries only its ID: `…/#s=<id>`. The page fetches it from GitHub's API. The same model reuses its Gist
  (`.cache/links.json`). `npm create rulecad` asks which you want. Without it, links carry the model, and `cad link`
  says when one is too long for chat or email (over 8,000 characters).
- **Boards** travel light: the board drawn from both sides (the page makes the front and back views from its layers)
  and the schematic, with coordinates rounded to what a screen can show.
- **Parts panel:** the page lists parts by kind (keycap ×9), opening to each copy (key-1-1). Each row shows or hides
  its parts and sets their style (solid, wireframe, x-ray, faint); the view has a mode, an explode slider, and
  switches for supports and references. Click a part in the model to select its copy and see its size.
- **Downloads of any parts:** each row has a tick for whether its parts go in a download (all printed parts at first;
  references never). All, None, Shown and Selected set the ticks in one go. Download STL makes one mesh of the
  ticked parts; Download 3MF makes the same Bambu Studio file as `cad export` (an object per printed thing, its parts on
  their AMS slots, which the link carries). The file is named for what was ticked (`staggered-cap-2-4.3mf`). So one
  link covers a whole assembly: `--md` prints a single "View and download" link.
- **Placed shapes:** assemblies send each distinct shape once with where each copy goes, so a 9-key macropad costs
  one keycap, one switch and a plate. `cad show` and the model page both work this way.

## Variables

```json
"slot_arm": { "value": "mx.slot_arm + x1c.hole_comp", "unit": "mm", "rule": "Cross slot arm: spec plus hole compensation",
              "label": "Slot arm", "show": true, "interface": true }
```

- `value`: a number, or arithmetic over numbers and names (`+ - * /`, brackets, `min`, `max`, `round`). Rule sets are
  `<namespace>.<rule>`; the object's own variables are bare names. Parsed, never evaluated as code.
- **Other objects' numbers:** `"uses": ["macropad/pcb"]` reads another object as a rule set named after it:
  `pcb.board_w` in an expression, `v.pcb.board_w` in code. It gets the object's variables and, from a board, its
  outline (`board_x`, `board_y`, `board_w`, `board_d`) and, in code, where each of its parts is (`v.pcb.board_parts`),
  a shaped board's outline (`board_outline`) and its mounting holes (`v.pcb.board_holes`, each
  `{ x, y, d }`). So a case follows its board: change the board and the case rebuilds around it. `"macropad/pcb@^0.2.0"`
  also checks the version; `"macropad/pcb@0.2.0"` reads that release. `cad rules` shows each borrowed number with the
  object and version it came from; two objects can't read each other.
- `show`: on the rules card `cad show` hands its target (six at most). `interface`: other parts depend on it (versioning will compare these).
- `tweak: { min, max }`: may be changed with `--set`. Variables without one are fixed by their rule.
- Inputs that hold names or text, not numbers (the design reads them; expressions can't), all settable with `--set`:
  - `choice: ["dsa", "oem"]`: one of a list.
  - `"type": "text"` (with `max`, characters): free text, e.g. a keycap's `legend`.
  - `"type": "anchor"`: one of 9 places on a face, `tl tc tr / ml mc mr / bl bc br`, for placing a legend.
  - `"type": "layout"` with `choice` and `fields`: a layout file the design builds from (or a built-in like `grid`).
    The design gets `v.layouts[name]`: the file, plus `keys` (each key's centre and properties), `width` and `depth`.
    `fields` names the key properties it reads besides place and width, so a release only counts changes to those:
    the plate reads `["u"]`, so changing a legend in the layout isn't a change to the plate.
- `display`: inputs for the on-screen copy only (`cad show`; `mirror`, its first name, still works), e.g. `{ "smooth": 24, "legend": "" }`: fewer segments, no legends, so a big
  assembly fits a display's face limit. They win over everything; checks, exports and links use the real values.
- `variants`: named sets of inputs, `{ "legend-f": { "profile": "oem", "row": "R3", "legend": "F" } }`, built as
  `keyboard/keycap:legend-f` by any command and in assemblies (`"object": "keycap:legend-f"`). Versions are the design
  over time; variants are alternatives side by side. Adding one is minor; changing or removing one is major.
- `v.shapes`: helpers every design gets: `text({ text, height, stroke })` (JSCAD's single-line font, one scale for all
  text so punctuation stays small, each straight stroke thickened to whole print lines, dots drawn round, and ↑ ↓ ← →
  as arrows), `anchor(face, size, at)` (where something goes on a face, by anchor), and `cut(a, b)` (a subtract that
  only touches a's faces near b; JSCAD's own splits every face along b's planes, which can leave slivers far away).
- A rule set can also carry `"footprints"` (pad data from @rulecad/pcb's `fromKicad`, with its source), which a
  board's code reads as `v.parts.footprints.usb_c`.
- An object or rule set named with a hyphen (`mx-switch`) is read with an underscore in expressions (`mx_switch.housing_top`),
  since a hyphen there is a minus.
- Rules carry `kind`: spec (manufacturer), default (slicer), community (rule of thumb) or measured (your own test
  print, which beats the rest), plus `source` and `checked`.

## Versions

Every object has its own semver version, kept as a git tag (`keyboard/keycap@1.2.0`), so any release can be rebuilt
(`cad export keyboard/keycap@1.0.0`). `cad release` compares the design with its last release and suggests the bump:

- **major**: an earlier print may no longer fit. An `interface` variable changed or went away, including through a
  rule it's built from (a new `x1c.hole_comp` widens the slot, so the keycap's slot changes: major).
- **minor**: something added that doesn't break fits: a new interface variable, a new tweakable option.
- **patch**: everything else: other variables, the shape's code, rules that don't reach the interface.

A lower `--bump` than the changes need is refused (`--force` overrides). Releases are logged in the project's
`CHANGELOG.md`. A project release (`cad release keyboard`) records the version of each object, and its bump is the
biggest of theirs. `cad printed` logs what you printed and how it came out in `prints.jsonl`; `cad history` shows
releases and prints together.

```sh
npx cad status                                     # versions, and what has changed since
npx cad release keyboard/keycap -m "Looser slot" --dry-run    # see the suggested bump
npx cad release keyboard/keycap -m "Looser slot" --push
npx cad release keyboard --all -m "Legends" --push   # every changed object, then the project
npx cad printed keyboard/keycap --result failed --note "slot too tight" --material PETG
npx cad history keyboard/keycap
npx cad diff keyboard/keycap 1.0.0 1.1.0
```

## Parts

`main()` can return named parts instead of one shape, described in the .json:

```json
"parts": { "cap": { "label": "Keycap" }, "pillar": { "role": "support", "label": "Breakaway pillar" } }
```

A `support` part is printed and then removed (a breakaway pillar, a brim tab). Checks, exports and links use every
part; previews and the model page draw supports faint, so what they hold up shows through; `cad show` leaves them
out. `--part cap` works on one part; `cad preview --explode` moves the parts apart.

- `"filament": "legend"`: the part prints in another filament, from `project.json`'s `filaments` (`{ "base": { "slot":
  1 }, "legend": { "slot": 2 } }`, AMS slots). A keycap's inlaid legend is the piece cut from the cap's top, so the two
  fill each other exactly.
- `"display": false`: fine detail the on-screen copy leaves out (or `"mirror": false`). `"optional": true`: main() may leave the part out (a blank key).
- Print files (`cad export`) are written in Bambu Studio's own project layout (copied from a project it saved, and
  checked by loading ours back with its command line): one object per printed thing (a keycap), its parts' meshes in
  `3D/Objects/`, each part's name and AMS slot in `Metadata/model_settings.config`, all on plate 1. So the file opens
  grouped, with legends already on their filament, and nothing to split. It carries no project settings, so your
  printer, process and filament settings are left alone.
- The print check treats parts that print together as one print: an underside resting on another part (a legend on its
  cap) isn't an overhang, and each part must be a closed solid on its own.

## Models from elsewhere

To fit something someone else made (a maker's connector, a part from a model site), measure their model rather than
guessing, then check your design against it.

`cad measure <model.stl|model.3mf>` finds the stretches along the model's longest axis (or `--along y`) where its
cross-section stays the same, numbers the distinct sections (a section seen again gets the same letter), and describes
each one: its extent and its height bands, the heights over which it has the same pieces across, split again at steps.
It draws every distinct section in `.preview/measure/`. `--line 0.6,2.5` reports where a line along the axis is inside
the model (where notches start and stop); `--at 10,50` adds sections there. `--rules <name>` writes the numbers as a
draft rule set, every value `kind: derived` with the file, `--source` and `--licence` it came from: rename the
placeholder names (`stretch3_from`, `sectionB_w`) for what they are before a design uses them. Sections are compared by
shape, within 0.05 mm, so a curve faceted differently along its length is still one section.

`cad match <project>/<object> <model>` lays the model over the design (trying every quarter turn whose size fits, then
shifting it onto the design's surface; `--place "rz90 t1,2,3"` pins it) and samples both surfaces: how far the design is
from the model, and the model from the design, signed (outside: extra material; inside: missing material, or a
clearance you meant). It passes when everything is within `--tol` (the printer's sliding fit by default), warns when
only the worst 5% is past it, and fails otherwise, listing the worst places. The pictures show the model over the
design, and sections through the worst places with the model dashed. Deliberate differences (a clearance on sliding
faces) show up as an even offset: set `--tol` above them.

A model's licence limits what you make from it, not what you learn: measurements are facts, but a non-commercial or
share-alike model's shape shouldn't be copied into a design under another licence. `measure` warns about those.

## Assemblies

`projects/<project>/assemblies/<name>.json` places objects together. Positions are expressions over rules and the
other items' variables, so a keycap can sit exactly where its slot meets the switch stem:

```json
{ "title": "Keycap on an MX switch", "kind": "fit", "uses": ["mx", "x1c"],
  "requires": { "keycap": "^0.2.0" },
  "items": [ { "id": "switch", "object": "mx-switch" },
             { "id": "cap", "object": "keycap", "at": [0, 0, "switch.housing_top - cap.lift"] } ],
  "fits": [ { "a": "cap.cap", "b": "switch.stem", "min": "-x1c.hole_comp", "max": "x1c.fit", "note": "Slot over the stem" } ] }
```

- **fit** assemblies check how parts go together: no overlaps (unless a fit allows a press fit with a negative
  `min`), and the closest gap for each `fit` within its range. Supports are left out: they're snipped off first.
  Objects with `"role": "reference"` (the MX switch) model things you don't print: drawn faint, never exported.
- **plate** assemblies lay objects out on the bed: they're checked as one print and `export` writes one 3MF with an
  object per part. Supports are kept.
- **Turning:** `"rotate": [0, 180, 0]` turns an item (degrees about x, y, z, in that order) about its own origin
  before `at` moves it: a pod on a side mount, or a lid modelled face down as it prints.
- **Components:** an item can be a whole assembly (`"assembly": "keycap-on-switch"`). Its parts, fits and `requires`
  come along, named per copy (`key-1-1.cap.cap`), and its overlaps are still checked inside each copy.
- **Repeats:** `"repeat": { "x": { "count": "plate.cols", "step": "plate.pitch" }, "y": { … } }` places a grid of
  copies, `key-0-0` to `key-2-2`, starting from `at`. Counts and steps are expressions, so the plate decides the grid.
- **Layouts:** `"repeat": { "layout": "staggered-55-arrows", "step": "plate.pitch", "per": { "cap.units": "u",
  "cap.row": "row", "cap.legend": "legend" }, "each": { "cap.profile": "oem" } }` places a copy at each key of a layout
  file (`key-0-0` is the back row's first key). `per` sets a component's inputs from each key's own properties (a key
  without one keeps the default), and `each` sets the same value on every copy, so the layout says what each key is:
  its width, its sculpted row, its legend. (Older forms, `width`, `rows` and `plate/<layout>`, still build.) In a layout,
  `"defaults": { "legend": "@label" }` gives every key its label as its legend; a key's own properties override it.
  A keycap takes a second legend too (`legend2`, at `legend2_anchor`), such as the shifted character above the plain one;
  the two must stay a stroke apart.
- A fit with `*` applies to every copy: `{ "a": "plate", "b": "key-*.switch.bottom", … }`. With `*` on both sides,
  each copy is checked against every other copy near it: `{ "a": "key-*.cap", "b": "key-*.cap", "min": 0.5 }`. Repeated fits are reported
  together: the worst case, and how many of the copies are in range.
- **Holes fits** follow a board's mounting holes into what they screw into: `{ "holes": "pcb.board", "into":
  "case.body", "depth": "m2.insert_length" }`. Each screw's path must be clear for `depth` mm and solid within `ring`
  mm of it (default: the hole's diameter) half way down. A gap fit can't see this: a board that rests on its bosses
  passes even when the bosses are in the wrong place. `"direction": "up"` for screws from below.
- `requires` pins versions (`^` same major, at least this version, 0.x included, since a minor release never breaks a
  fit here; `~` same minor); an item can use a release: `"object": "keycap@0.2.1"`, or a variant: `"keycap:oem-r3"`.
- The check names any `estimate` rule an assembly relies on, through its positions or its objects, so guesses get
  measured.
- `check`, `preview` (`--explode` lifts each kind of object above the last: plate, switches, keycaps), `show`, `link` and, for plates, `export` all take
  `<project>/<assembly>`.

## Boards

A circuit board is an object whose .json says `"engine": "pcb"`. Its `main(v)` returns a
[tscircuit](https://github.com/tscircuit/tscircuit) board (circuits as code, from npm) built with `v.pcb`
(`lib/pcb.mjs`); the build runs it into Circuit JSON, and the bare board, drilled, becomes a part, so
previews, links, `cad show` and fit assemblies work as for printed parts. The copper (tracks, pads, vias) is drawn in the
2D views, not in 3D.

```sh
npx cad check keyboard/macropad-pcb     # tscircuit's design checks, JLCPCB's limits, the matrix
npx cad preview keyboard/macropad-pcb   # the board from above (copper, silkscreen) and in 3D
npx cad export keyboard/macropad-pcb    # <name>-fab.zip for JLCPCB, KiCad files, the matrix
```

- **One layout, three parts:** `v.pcb.fromLayout(v.layouts[v.layout].keys, pitch)` reads the same layout file as the
  plate and keycaps (each row lined up with the widest for its matrix columns), so the board's switches sit exactly
  where the plate cuts its holes. `keyboard/main-pcb` is the staggered 55-key board.
- **Keyboards:** `v.pcb.keyboard(v, keys)` makes a key matrix with a Pico beside it (`controller: beside`, every track
  drawn) or under it (`controller: under`: on header pins, components down, turned so its two pin rows sit in the
  gaps between key rows, clear of every switch housing, its USB out of the `mcu_side` edge; the matrix drawn, the
  Pico's 17 connections autorouted by tscircuit). Footprints come from rules (MX
  switch: `mx.pcb_*`, from KiCad's library; Pico: `pico.pin_*` and its GPIO map; diodes: `sod123`). Nothing is
  autorouted: the keyboard router draws columns on the front copper, rows and SOD-123 diodes on the back, then lanes
  beside the Pico, each a track and a gap (`track`, `clear`) clear of its neighbours.
- **The fab zip:** Gerbers under KiCad's Protel names (`.GTL`, `.GBL`, `.GTS`, `.GBS`, `.GTO`, `.GBO`, `.GTP`, `.GBP`,
  `.GKO`), plated and unplated drill files, a BOM in JLCPCB's columns and a placement file: upload it as it is.
  `.kicad_pcb` and `.kicad_sch` sit beside it, for `kicad-cli pcb drc` or finishing by hand (one way: changes made in
  KiCad don't come back).
- **2D views:** links to a board carry its drawings, made by tscircuit's circuit-to-svg: the board (both sides, front,
  back) and the schematic, laid out like a keyboard's (a switch and diode per key on the matrix grid, the Pico beside
  it with every pin named). The model page shows them in tabs over the 3D view, as images (nothing in them runs), with
  drag to pan, wheel or pinch to zoom, double-click to fit. `cad preview` writes the schematic as a PNG too. An
  assembly's link carries its board's views as well, so one link holds the whole build; picking the board in the 3D
  model (or the list) offers "Board view ›".
- **What a board tells its neighbours:** a built board adds `board_x`, `board_y`, `board_w`, `board_d` and (Pico
  under) `pico_x`, `pico_y` to its values, for assemblies to use.
- **In the case:** `case.controller: pcb` drops the cradle and puts the USB opening where the board's socket is
  (`usb_wall`, `usb_y` along the plate, `usb_drop` below it). `keyboard/staggered-pcb` puts it together: the board
  (with its Pico, `pcb-with-pico`) under a plate thinned by `top_clearance` for the header joints, in a case built
  from the board's numbers, every fit checked (switches on the board, plate over it, board and Pico in the case).
- **The matrix:** `<name>-matrix.json` gives each key's row and column and each line's GPIO, for firmware.
- **Versions:** the npm packages are pinned to exact versions (tscircuit moves fast); `@tscircuit/math-utils` is
  overridden in package.json so every part of it agrees.

### Speed
Fit checks find closest gaps through a grid of triangles (nearest cubes first), and remember overlap volumes between
placed parts in `.cache/overlaps.json`, keyed by each part's build and placement: the staggered keyboards' checks take
about 10 s, and a re-check after an edit measures only what the edit moved. The build cache keeps its 800 most
recently used builds.

### Assemblies: values from other parts
(An object can also read another object directly, outside any assembly: see "Other objects' numbers" under Variables.
That suits a case built around one board; `from` suits values that only mean something where items meet.)
An item's `from` sets inputs from other items' values, in the assembly's names: `"from": { "usb_y":
"board.pcb.pico_y" }`. Every item is built before any is placed, so positions can refer to items listed after them
(the board placed under the case's top while the case is built from the board's Pico position). `"place": false`
builds an item only for its values: the PCB build's print plates (`staggered-pcb-case`, `staggered-pcb-plate`) take
the board's numbers without the board being on the bed. In assemblies a board counts as a reference: checked, drawn
faint, never in a print file.

## Checks

- **Closed solids:** every edge must be matched by faces on the other side. T-junctions (an edge covered by several
  shorter ones) count as closed, and so do hairline seams: a seam within 0.01 mm of another face, which booleans leave
  and no printer can resolve. Anything wider is reported as a hole.

- **Every measurement is a variable**: numbers other than 0, 1 and 2 in a design fail.
- **Fits the bed** (256 mm), **sits on it** (lowest point z = 0, faces flat on it), **overhangs** past 45° (warning:
  supports or another orientation), **closed solid** (warning: JSCAD's booleans can leave small gaps where solids
  touch; slicers usually repair them).

Z is up and the bed is z = 0: a design is built the way it prints.
