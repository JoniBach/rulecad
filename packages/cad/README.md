# @rulecad/cad

The `cad` command: design physical things in [JSCAD](https://github.com/jscad/OpenJSCAD.org) from rules you can trace,
check them for printing and for fit, version them by what fits, share them as links, and export them for the printer
(a 3MF in Bambu Studio's layout with each part on its own filament; an STL from the model's link). Every measurement in a design is a variable,
and every variable says which rule it comes from: the printer, a standard (Cherry MX), or something you measured.

```sh
npm create rulecad my-designs        # a workspace with a soap tray to start from; or by hand:
mkdir my-designs && cd my-designs
npm init -y && npm pkg set type=module
npm install @rulecad/cad @jscad/modeling
npx cad new bathroom/soap-tray       # a design to start from: soap-tray.js (the shape) and .json (its variables)
npx cad check bathroom/soap-tray     # raw numbers in the design, then printability
npx cad preview bathroom/soap-tray   # six views as a PNG in .preview/ (needs Chrome or Chromium)
npx cad export bathroom/soap-tray    # a 3MF for your slicer, in exports/
npx cad link bathroom/soap-tray      # a link that opens the model in a browser (nothing is uploaded)
```

**New here?** [The tutorial](TUTORIAL.md) walks from an empty folder to a part of your own, checked against the thing
it fits, in about twenty minutes. This page is the reference. [The worked examples](EXAMPLES.md) go on from there: parts, variants and a release, a lid on a hinge, a model
measured into rules, an optimised arm, a board, and a mechanism printed flat, each tested as written.

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
npx cad clone <github link to a .kicad_pcb> sea_picro   # a published board's circuit, into rules/, to redraw by rules
npx cad measure cover.3mf --rules cover          # a model from elsewhere, measured into draft rules
npx cad measure beam.stl --profile profile-2020-mine   # a beam's profile from its maker's model or a DXF of its section
npx cad match legion-go/rail cover.3mf           # how closely a design matches that model, both ways
```

The keyboard examples below come from the project rulecad grew out of: a keycap, a switch plate, a case and their
circuit boards.

## Looking into a design, and changing it

```sh
npx cad values bathroom/soap-tray                # its variables, resolved (names after it pick some; --json)
npx cad why bathroom/soap-tray.wall              # what a value reads, down to the rules and their sources
npx cad set bathroom/soap-tray length=120        # change a variable, keeping the file's layout
npx cad set bathroom/soap-tray --new lip=3 --unit mm --rule "A lip to hold the soap"
npx cad add fit bathroom/tray-on-shelf --a tray.body --b shelf.body --min 0.2 --max 1 --note "Tray on its shelf"
npx cad check bathroom/soap-tray --json          # findings as data: each with a level, a code, its numbers
```

`set` and `add` (`fit`, `joint`, `item`, `loop`, `pose`) refuse an edit that leaves the file broken: its JSON, its
schema, or variables that no longer resolve. Options go before or after the names; a misspelt command or option is
refused by name. `cad --version` says which cad this is. Two switches for the tool itself: `CAD_NO_CACHE=1` builds
afresh, and `CAD_TRUST=1` runs designs in the tool's own process (see Sandbox).

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
which version it holds (`keyboard/keycap@0.1.0`, or `+changes` if it isn't a release). The page is `@rulecad/viewer`: host your
own copy anywhere and name it in `viewUrl`.

- **Circuit boards:** a board's link also carries its fab zip, the same one `cad export` writes (Gerbers, drill files,
  parts list, placement; plotted by KiCad where the board needs it). The page offers it as **Download for JLCPCB**. A
  board whose zip can't be made here (one that needs KiCad, without it) goes without, and `cad link` says why.
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
- `v.flexures`: compliant mechanisms (`@rulecad/flexures`): `leaf`, `fixedGuided`, `parallelGuide`, `serpentine`,
  `notchHinge`, `bistable`, `livingHinge` as shapes, each with a `<name>Model(shape, { E })` giving its stiffness and the
  strain at a travel, and `printable(shape, printer, material, model)` for how it prints. Drawn flat: bending along y,
  width up z, so a flexure bends within its layers.
- `v.motors`: motors (`@rulecad/motors`): `motorModel`, `mount` and `bore` for the holes a part needs round a motor and its shaft, `performance` for its torque and speed. In an assembly a motor is an item (see Motors).
- `v.fixings`: screws, nuts and inserts (`@rulecad/fixings`), bound to the project: `hole('M3', { kind: 'pilot', at })`
  for a hole sized by what it is for, `counterbore`, `countersink`, `nutPocket`, `nutTrap`, `squareNutSlot` and
  `insertBoss` for seats, `screw`, `nut`, `washer` and `insert` as light reference solids, `thread` for one cut to
  print, and `engagement`, `seating` and `lengthFor` for first sums. Each reads the workspace's own thread set
  (`rules/m3.json`) before the kit's, the project's printer and (for what a thread is in) its material, so a design
  types no diameter and passes none. `cad check` lists what each call drew and the rule it rests on (`hole.drawn`,
  `counterbore.drawn`, ...). A design may also import `@rulecad/fixings` itself: then it reads the kit's sets only.
- `v.frames`: beams and profiles (`@rulecad/frames`): `profileModel` for a profile's figures, slots and faces
  (`v.frames.profileModel('2020-misumi-hfs5').slots['slot-6-misumi'].opening`, to draw a tab that drops into a slot),
  `slotModel`, `beamModel`, `beam` and `outline`. A profile measured into this workspace's `rules/` (`cad measure
  --profile`) is read before the kit's, with its outline. In an assembly a beam is an item (see Beams).
- `v.gears`: gears (`@rulecad/gears`): `spur`, `rack` and `internal` as shapes, from a module and teeth, each with its
  model (`gearModel`, `rackModel`, `internalModel`) and `printable(model, printer, width)`. Drawn flat: the axis up z,
  the first tooth on +x, the face on the bed. Two gears in an assembly mesh with a joint's `mesh` (see Joints).
- A rule set can also carry `"footprints"` (pad data from @rulecad/pcb's `fromKicad`, with its source), which a
  board's code reads as `v.parts.footprints.usb_c`.
- `cad clone` writes a rule set with a `"circuit"`: a published board's parts, pads, nets, planes and outline, read
  from its `.kicad_pcb` (a file, or a GitHub link: pinned to the commit, with the repository's licence). A board's code
  reads it as `v.sea_picro.circuit` and builds from it with @rulecad/pcb's `clone`. Its rules (`width`, `height`,
  `thickness`, `layers`) are `kind: derived`, with the source and its licence. A reciprocal licence (CERN-OHL-S,
  share-alike) carries over to boards made from it: keep such a rule set apart from your others.
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

**A beam's profile from its maker's model.** `cad measure <beam.stl|beam.3mf|section.dxf> --profile <name>` reads an
aluminium extrusion's section and writes it as a profile rule set, for a beam the kit has no set for:

```sh
npx cad measure hfs5-2020.stl --profile profile-2020-mine --source https://example.com/hfs5-2020 --licence "the maker's terms"
```

| It does | How |
|---|---|
| Takes the section | From a model: across its longest axis (or `--along y`), in the middle of the longest stretch that keeps one cross-section. From a DXF: its LINE, LWPOLYLINE (with bulges), ARC and CIRCLE entities, joined into closed loops; inches, centimetres and metres are turned into mm. A SPLINE, an ELLIPSE or a block is refused by name: export the section as lines and arcs |
| Finds each slot | On every face: the opening at its narrowest, the lip's thickness at its tip, the width under the lips, the depth, the floor's width and the flanks' angle, and a V mouth (`track_width`, `track_angle`) where there is one. An opening with no room under lips is told as a groove, or as the channel of a C section |
| Finds the bores | Round holes at the middles of the cells are the profile's bores; other round holes and hollows are listed, and stay in the outline |
| Names the slot family | The known family (the kit's, or your workspace's) whose opening, lip, width and depth are all within `--tol` (0.1 mm) of what was found; where none is, a new family is drafted as `rules/slot-<opening>-<name>.json` |
| Writes | `rules/<name>.json`, a draft profile with every figure `derived` and carrying the source and licence; `rules/outlines/<name>.json`, the section itself; `.preview/measure/<name>-profile.svg` (and `.png`), the section with each slot and bore marked and listed, to check against the bar in hand |

Then `cad rules check <name>` and `cad rules draw <name>`, which use the measured outline in place of a drawn one, and
add what a model cannot say: the maker, the alloy, a material set for its mass, the thread its bore taps to. The
outline is the model's shape, so it goes into your own workspace and nowhere else: the kit publishes no maker's
outline, and under a non-commercial, no-derivatives or share-alike licence the command says to keep it there.

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
- **Hosts:** the core (resolve, build, check) reads and writes through a host (`lib/host.mjs`): Node's file system
  for the CLI, or `memoryHost(files)`, a workspace in memory (reading the tool's own packages from disk), for tests
  and, later, a browser. `useHost(h)` switches. The model-link building (`lib/links.mjs`) and the joints' data for the
  page (`motionData`) are in the library too, so other programs make the same links without the CLI:
  `import { memoryHost, useHost } from '@rulecad/cad/host'`, and likewise `/design`, `/assembly`, `/links`, `/edit`,
  `/explain`, `/schema`, `/errors`, `/optimise`, `/rules`, `/workspace`, `/versions`, `/layout`, `/preview`, `/targets`, `/threemf`.
- **Engines:** designs get `v.ops` (union, subtract, intersect): JSCAD's booleans by default, Manifold's (faster,
  watertight; `npm install manifold-3d`) with `"engine": "manifold"` in the object's JSON or `CAD_ENGINE=manifold`.
- **Sandbox:** a JSCAD design runs in a separate Node process under Node's permission model. Whatever it does, it
  can't write or delete files, start programs or workers, or load addons, and it reads only the workspace and the
  packages designs use, by their real paths (a `node_modules` link spelled through another link, as macOS spells its
  temporary folders through `/tmp` and `/var`, is refused by name: make the link with the real path). To keep it to making shapes it may import only `@jscad/modeling`, `@rulecad/shapes`,
  `@rulecad/flexures`, `@rulecad/gears`, `@rulecad/motors`, `@rulecad/fixings` and files in its own project (no `node:` modules), `fetch` and its kin are gone, and it is
  started with none of your environment (no tokens). Those shut the ordinary roads to the network, not every one:
  before Node 25 the permission model doesn't cover the network, so a design written to get round them might still
  reach it. Run only designs you trust. It gets its values as data and returns its parts; what it prints
  (`console.log`) comes out on stderr. A workspace that trusts its designs sets `"sandbox": false` in cad.config.json
  (or `CAD_TRUST=1`). Board designs (engine pcb) run in the tool's process, with the board engine.
- **Trust, asked once:** what a workspace's cad.config.json asks to run outside the sandbox (`"sandbox": false`, a
  target that is a module of its own) isn't done until you run `cad trust` in it. That records the folder and what it
  asked for in your own list (`~/.config/rulecad/trusted.json`, or `$CAD_TRUSTED`), so a workspace cloned from
  elsewhere can't turn the sandbox off on its first command; one that later asks for more is asked again.
- **Mistakes are named:** a design that reads a variable that isn't there (`v.widht`) stops with the name it
  probably meant, not a shape drawn from `undefined`; errors in a design carry its file and line.
- **Units:** `cad check` warns where an expression mixes units (millimetres added to degrees, a sine of a length) or
  comes to another unit than its variable says (mm × mm with unit mm). Counts (keys, u, rows) are plain numbers.
- **Progress:** `--progress` shows what a long check or sweep is building; a program passes `progress` to
  `buildAssembly` and `sweep` and gets `{ stage, item | joint, … }` events.
- **Near an anchor:** a fit can name an item's faces near one of its anchors, `"a": "case@pivot"` (with `"within": 6`,
  mm; 10 by default): the pocket round a pivot rather than the whole case. A fit's finding says where its closest gap
  is (`at` in `--json`) and which anchor that's nearest (`… 0.4 mm from link@mount`).
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
- **Screws** join parts with a `fasten` (the next section), which knows the screw: it follows each one through the
  holes as drawn, chooses its length, and puts it on the shopping list. A gap fit can't see holes: a board that rests on
  its bosses passes even when the bosses are in the wrong place. The older **holes fit** follows a board's mounting
  holes into what they screw into, without the screw: `{ "holes": "pcb.board", "into": "case.body", "depth":
  "m2.insert_length" }`, each path clear for `depth` mm and solid within `ring` mm of it (default: the hole's diameter)
  half way down, `"direction": "up"` for screws from below. Where a holes fit and a fit that `fastens` join the same two
  items, `cad check` says the fasten that would stand for both, with the entry to paste (`fasten.suggest`, a note), and
  `cad add fasten <project>/<assembly> --from-fits` puts it in their place (below). A `fasten` with `"holes": "pcb.board"` holds a
  board's holes to its thread's clearance hole as the fab drills it, with nothing added for a printer (EXAMPLES,
  chapter 6).
- `requires` pins versions (`^` same major, at least this version, 0.x included, since a minor release never breaks a
  fit here; `~` same minor); an item can use a release: `"object": "keycap@0.2.1"`, or a variant: `"keycap:oem-r3"`.
- The check names any `estimate` rule an assembly relies on, through its positions or its objects, so guesses get
  measured.
- `check`, `preview` (`--explode` lifts each kind of object above the last: plate, switches, keycaps), `show`, `link` and, for plates, `export` all take
  `<project>/<assembly>`.

### Screwed joints: `fasten`

A joint held by screws is one relation, and it knows the screw:

```json
"fasten": [
  { "screw": "M3 cap", "through": ["bracket"], "into": "base", "at": ["bracket.h1", "bracket.h2"] },
  { "screw": "M3x16 cap", "through": ["cover", "frame"], "into": "frame-back", "holes": "cover.body", "nut": true, "washer": true }
]
```

`screw` names the thread and head as `@rulecad/fixings` reads them (`M3 cap`, `M4 button`, `M3x12 countersunk`,
`6-32 UNC cap`). `through` lists the parts the screw passes, in order from under its head, and `into` is the part it
ends in. The screws' places are given one of two ways: `at`, an anchor on each screw's axis (a point on the hole's
centre line, the anchor's axis along the screw), or `holes`, a part whose own round holes are the places (for a
circuit board, its mounting holes). `nut` (`true`, `hex`, `square` or `lock`) says a nut holds the screw where the
last part does not; `washer` puts a plain washer under the head; `length` gives the length where the name has none;
`torque` gives the tightening torque in N m. A screw across a yoke or a split clamp ends in the part under its head:
name that part first in `through` and again as `into` (`"through": ["fork", "block"], "into": "fork", "nut": true`),
and place each screw with `at`, an anchor whose axis points from the head into the part. Along the axis, the part's
first stretch of material is the side under the head, and the rest is the far side. Add one with `cad add fasten <project>/<assembly> --screw "M3 cap"
--through bracket --into base --at bracket.h1,bracket.h2`.

Nothing about the holes is declared. Each part is read as drawn: along the screw's axis the mesh is sliced, and the
outline round the axis gives the hole's centre, its diameter (across its corners, as it was drawn) and where it
starts and stops. From that the check says:

| Finding | What it checks |
|---|---|
| `fasten.holes` | One axis runs from under the head through every part: a hole 0.05 mm or more off it fails, with the distance |
| `fasten.slot` | Into a beam's slot: each screw over a slot's centre line within its hole's play, square to the face and along the beam (see Fastening into a slot, under Beams) |
| `fasten.clearance` | Each part passed through has a clearance hole for the thread as drawn on this printer, between the close and the loose figure; it says what the hole measures and what it should be |
| `fasten.end` | The far end is a pilot, a hole to tap, a thread drawn to print, an insert's hole or a nut's seat of this thread (a pocket on the far face, or a slot across the screw partway along it, as `v.fixings.nutTrap` cuts), or a clearance hole with `nut`; into a motor, one of its own threaded mounting holes |
| `fasten.length` | The length chosen where none is given: the shortest sold length that fits the stack as measured (into a motor, the longest that stops short of the end of its thread). A given length is checked for reaching the far end, bottoming out in a blind hole (1 mm is kept at the tip) and standing more than a diameter proud |
| `fasten.engagement` | The thread engaged at the far end against the rule for what it is in: the thread's `pilot_depth` or the engagement rule for the project's material, an insert's length, a nut's height; into a motor, its own thread's depth, and at least one diameter (`engagement.steel`, as `motor.mount` holds it). A short one names the length or the depth that would do |
| `fasten.seat` | The head (or its washer) has a flat seat as wide as itself and square to the screw, read under the head from the part; a countersunk head has a countersink of its angle. It says the force and torque the seat takes on the project's material, and with `torque` holds the pressure against the material's strength and names the washer that would bring it within |
| `fasten.access` | A key or driver reaches the head along its axis, in the build pose: a cylinder as wide as the key across its corners, as long as its long arm (both from the `hexkey` set, ISO 2936; a hexagon head's socket adds `hexkey.socket_wall`, an estimate), clear of every other part. A part over the head that goes on after the screw passes, with the step it goes on at: `cad order` puts it after. One that must be there first (it comes earlier in the order, it is one of the joined parts, or it is no step at all) fails by name with how far over the head it is; where a ball-end key tilted up to `hexkey.ball_end_tilt` (25°) clears it, it warns instead |
| `fasten.load` | With `loads` or a motor's torque on the joint: what it holds up (the parts left with no other way to the first item, their masses, the loads hung on them, under the assembly's `gravity`, and the torque of a motor among them), shared between the screws as a group (`screwGroup` of `@rulecad/fixings`: shear by distance from the centroid, pull by a plane through it). The screw that takes the most is held against its proof load, the thread it is in against stripping, and the clamp against slipping, at its preload (`screwLoad`); the margin is how many times the load it holds, and under 2 it warns. With no `torque`, it says the torque that leaves the thread twice the load, within the seat, and `cad order` tightens to that. It names the estimates it rests on (the nut factor, a plastic's shear strength, the friction) |

Every finding has `at` (under the head) and `between` (head to tip), so the viewer points at the screw. The screws,
nuts, washers and inserts are placed as reference parts from `@rulecad/fixings`: faint in previews, lifted along
their own axes by `--explode`, checked for overlap with everything but what they are threaded into, moving with the
part they sit in through every pose, and carried in links. `cad list` counts them and `cad order` names them on the
step. A `fasten` holds its parts as a fit with `"fastens": true` does and lines their holes up as a holes fit does;
both older forms still work, and an assembly with no `fasten` checks as before.

**From the older forms.** A holes fit and a fit with `"fastens": true` between the same two items said apart what one
`fasten` says, and neither knew the screw. `cad check` names the pair in a note (`fasten.suggest`) with the entry to
paste: `{ "screw": "M2 cap", "through": ["pcb.board"], "into": "case.body", "holes": "pcb.board" }`. The screw is
read from the fit's `fastener` (`M2x6`), else from a thread set the holes fit's `depth` names (`m2.insert_length`),
else from the board's holes as drawn: the largest metric thread narrower than the narrowest hole. `cad add fasten
<project>/<assembly> --from-fits` writes it in their place: the holes fit goes, the fit that fastens keeps its gap
range (`min`, `max`) with `fastens`, `fastener` and `count` taken off, or goes too where it had no range. `--screw "M2x8
countersunk"` gives another screw. Screws driven from below (`"direction": "up"`) are left for you to write.

`cad list` counts every fixing (`fasten.count`): each screw, nut, washer and insert a `fasten` placed (a component's
too), a motor's mounting screws where a fit that `fastens` holds it (as many as its holes, at the length its mount
works out for the plate as drawn, taken to a length sold), and a fit that names its `fastener` by hand (pins, a clip:
anything that is not a screw, since a screw is a `fasten`'s, which knows its length). They are
summed by name, which is the thread, length and head (`12 × M3x8 cap`), each with its mass (an estimate from its
outline, from `@rulecad/fixings`) and the line's, and rounded up to whole packs of `packs.pack` (10, an estimate:
set your own in `rules/packs.json`) with the spares said. `--json` gives each line as `{ fastener, qty, kind,
thread, length, head, grams, mass, packs, buy, spare, from }`, the totals add `fixingsGrams` to the machine's mass,
and the build page's list shows the same.

### Joints and poses

Things that move (a lid, a hinged screen, a drawer, a ball head) are one assembly with joints, not one assembly per
position. An object names its **anchors** in its .json, as expressions over its own variables: a point, with an axis.

```json
"anchors": { "pivot": { "at": ["width / 2", 0, "height"], "axis": [1, 0, 0] } }
```

A **joint** ties an anchor on its child item to one on its parent item. At value 0 the two anchors lie together, and
the joint's value moves the child from there. A joint's child has no `at` or `rotate`: the joint places it.

```json
"joints": [
  { "id": "lid", "type": "revolute", "parent": "case.pivot", "child": "lid.pivot", "min": -180, "max": 0, "label": "Lid" },
  { "id": "lid_r", "type": "revolute", "parent": "case.pivot_r", "child": "stay.pivot", "follow": "lid" }
],
"poses": { "shut": { "lid": 0 }, "open": { "lid": -110 } }
```

| Type | Values | For |
|---|---|---|
| `fixed` | none | a part bolted on in a set place |
| `revolute` | angle | hinges, pivots |
| `prismatic` | distance | straight rails, drawers |
| `cylindrical` | `[angle, distance]` | a pin that turns and slides in a slot |
| `ball` | `[x, y, z]` angles | ball joints; `"cone": 30` limits how far the child's axis may tip |
| `path` | distance | curved rails: `"path": [[x, y, z], …]`, a polyline in the parent anchor's frame, the child's axis along it |

Angles are in degrees about the anchor's z axis (its `axis`); distances are in mm along it. A `ball` turns about x,
then y, then z, as `rotate` does.

- **Anchors:** `<item>.<anchor>`, or `<item>.<component item>.<anchor>` inside a component. An anchor can also be
  written in place, in the assembly's names: `{ "item": "case", "at": ["case.width", 0, 0], "axis": [0, 1, 0] }`.
  Without an `item` it is in the world. `ref` sets which way the anchor's x axis points (what angle 0 means), or
  `rotate` turns the anchor as `rotate` turns an item.
- **Limits:** `min`, `max` and `value` (the default) are numbers or expressions, one per value (`[…]` for two or
  three). An angle with no limits goes from -180 to 180. A distance needs both limits, except on a path, which runs
  from 0 to its length.
- **Followers:** `"follow": "lid"` gives a joint another joint's values, times `ratio` (default 1), plus `offset`. Use
  it for the second hinge of a pair, or for gears.
- **Gears:** `"mesh": { "with": "drive", "module": "pinion.module", "teeth": ["pinion.teeth", "wheel.teeth"] }` on a
  revolute makes its gear follow the gear on the joint `with` names, at the ratio of their teeth and in phase: a tooth
  of one sits in a gap of the other at every angle. On a prismatic it is a rack under a pinion (mm a turn); `"ring":
  true` makes it a ring gear round its pinion. `shift` ([the driver's, this one's]), `pressureAngle` and `backlash` are
  as `@rulecad/gears` takes them. Each gear is drawn as `v.gears` draws it (axis up its z, first tooth on +x; a rack
  along its x, teeth up +y) and its joint is anchored at its centre, along its axis. The check gives the ratio, the
  contact ratio and the centre distance (`mesh.centre`: closer than the gears need eats their backlash, and past it they jam; further adds backlash),
  each placed between the two axes, and measures the pair from its drawn teeth (`mesh.backlash`, `mesh.interference`,
  kept in `.cache/gears/`); `--sweep` turns the train and looks for teeth that touch. Both gears' axes sit on
  one part, or on parts held still; planets on a carrier are a `planetary`.
- **Worms and bevels:** `"worm": true` (or `{ "diameter", "hand" }`) in a mesh makes the driving joint a worm and
  this one its wheel, `teeth` [starts, the wheel's], the axes crossed at right angles; the check says the ratio,
  whether it locks, and the centre distance. `"bevel": true` makes the two bevel gears, their axes meeting at the
  shaft angle; the cones must share their apex (`mesh.bevel`). Both follow in phase, so `--sweep` turns them clean.
- **Planetary gearboxes:** `"planetary": [{ "sun": "sun", "carrier": "carrier", "ring": "ring", "planets": ["p0", "p1",
  "p2"], "drive": "carrier", "module": 1, "teeth": ["sun.teeth", "p0.teeth", "ring.teeth"] }]` names the items. One of
  the sun, carrier and ring is held (no joint, or a fixed one); the one `drive` names turns on its revolute, and the
  third, and each planet on its revolute on the carrier, follow it, in phase. The check says the ratio, each planet's
  centre distance and contact ratio, and fails a planet that can't mesh with the sun and the ring where it is
  (`planetary.phase`: planets go every 360° / n, and (S + R) / n is whole). `planetary()` in `@rulecad/gears` finds
  teeth for a ratio.
- **What holds each part:** in an assembly that moves, every part but the first turns or slides on a joint, or is
  fastened to the first: by a `fasten` where screws do it, or by a fit with `"fastens": true` where pins, a press or a
  clip do (named in the fit's note): `{ "a": "ring", "b": "case", "fastens": true, "note": "Two push pins" }`. A part only placed somewhere is
  said (`assembly.loose`): a ring gear resting on its case would turn with its planets.
- **Onto a shaft:** `{ "a": "arm", "b": "crank", "engage": "arm.thick" }` checks that a part slid onto a shaft, a pin or a
  peg goes that far onto it along the joint between them (`fit.engage`), not just against its end: an arm resting on
  a shaft's end touches it face to face, as a seated one does, and nothing overlaps either way, so only this tells
  them apart. It looks within `radius` (10 mm) of the joint's axis.
- **Loops:** each item has one joint to its parent. Where parts join in a ring (two links between the same two
  parts), let joints place every part, then name the meeting that closes the ring in `loops`. The check measures it
  in every pose: `"loops": [{ "a": "link_l.top", "b": "mount_l.axis", "label": "Left pivot lines up" }]`. Its anchors
  must meet within 0.01 mm (or `tolerance`), with their axes lined up.
- **Poses:** `"poses"` names sets of values. `"pose"` names the one that previews, links and the display show (by
  default, the first). `cad check` checks every pose. What is the same in every pose is reported once; the rest is
  reported under the pose's name. `--pose open` checks, previews, shows or links one pose. A fit that only makes
  sense in some poses names them: `"poses": ["folded"]`.
- **Sweeps:** `cad check <project>/<assembly> --sweep` moves each joint that doesn't follow another through its
  range (`--steps 24`, from the pose, the other joints held still). It names where parts collide or a loop comes
  apart: "sweep lid, -180 to 0° in 24 steps: -180 to -165°: lid.body hits hinge.pin". `--sweep lid` sweeps one joint.
- **Links:** an assembly's link carries its joints. The page shows a slider for each joint, a button for each pose,
  and a quick look for parts pushed into each other when you let a slider go. The quick look can miss parts that cross
  without a corner going in, so `--sweep` is the real check.

### Motors

An item can be a motor instead of a printed object: `{ "id": "drive", "motor": { "model": "nema17", "drives": "elbow" }, "at": […], "rotate": […] }`. It comes from `@rulecad/motors`, is bought and not printed (a reference, in the assembly but never on a plate), and its anchors (`shaft`, `tip`, `face`, `horn`, `hole1` …) work in joints like any other. `set` changes a figure (`{ "holding_torque": { "value": 0.5, "kind": "measured", "source": "…" } }`), `speed` is the motor's speed (rpm), `margin` how many times over the torque must be (2 by default), `duty` the share of the time it runs.

- `"drives"`: the joint it turns, a revolute. The viewer's slider moves in a stepper's steps; a servo brings its range. Whatever follows that joint through a `mesh` or a `planetary` moves with it. `motor.axis` fails if its shaft isn't on the joint's axis.
- `"loads"` at the top of the assembly say what it has to do: `{ "joint": "elbow", "torque": 0.5 }` (N m), `{ "joint": "slide", "force": 12 }` (N), or `{ "mass": 0.2, "at": "forearm.tip" }` (kg, a mass carried at an anchor, whose torque at each joint comes from where the pose puts it; the check runs the motor through its range and reports the worst). `"gravity": [0, -1, 0]` says which way is down, if not `-z`.
- A compound planetary is a `planetary` with `"output": { "ring", "planet", "teeth" }`: a second ring on the planets' second step, following them in phase.
- `motor.torque`: what reaches the joint through the gears, against the load: a fail under 1 times, a warning under the margin. It says what its figures rest on. `motor.speed`: how fast it moves and how long its range takes. Stages pass on `stageEfficiency` of the power (0.95 a mesh, an estimate).
- `motor.holds`: with the power on (holding torque, or stall torque) and off (detent torque, a built-in gearbox's friction, a worm that locks, gears under 50% efficient, or `"brake": "a ratchet and pawl"` on the joint). Dropping with the power off is a warning: it may be what you want.
- `motor.mount`: the part a motor is fastened to (a `fasten` into the motor, or a fit that `fastens`), read as drawn: how thick it is at the screw holes against the screws' size, the screws' engagement in the motor's tapped holes (the screws as bought: their length past the plate, held to the motor's `mount_hole_depth`, at least one diameter, `engagement.steel`, or it fails; a motor item's `"screw"` may name a whole screw, `"M3x8 cap"`, to check that one), and the screws' bearing on the plastic under the motor's full torque. Its screws are counted in `cad list` and `cad order` (at the length sold that stays in the motor's thread, with the key that turns them). Then the whole part bent, by FE on the part as drawn (cubes, two across the plate at the screws): the motor's weight at its centre, along `gravity` in the pose it's checked in, and its full torque (the larger of its working and holding torque), both carried into the plate where the screws clamp it. The part is held at the joint that carries it, if one does; else where it meets the printed parts it's fastened to that sit below it; failing both, on its lowest face. It reports how far the shaft's tip moves (against the driven joint's seat, where that is on the same part, since the two move together), against the printer's `fit` clearance (or the motor's `"deflection"` in mm), and the peak stress against the material's `strength`; under 2 times either fails, and says what fixes it: the plate thickness that would do (bending goes with its cube), ribs, or how much stiffer a material would have to be. Cells this coarse read a plate 10 to 20% stiff, and a cell's stress is read at its centre, so the peak is scaled up to the surface; it's an estimate, said as one. Kept in `.cache/mount`.
- `motor.heat`: the motor's case against the softening point of the material the project prints in. Too hot says the current to set the driver to.
- A `"shaft": true` fit (or `"press"`) between a motor and what it drives reads the bore from the part as drawn: that it's on the shaft (`shaft.seat`), that its flat is there (`shaft.flat`; the shaft turns to meet it, so where the flat faces doesn't matter), how much of the flat it grips (`shaft.grip`), and, pressed on, the hoop stress in the hub (`shaft.hoop`).
- `cad preview --check` of an assembly with a motor writes `<assembly>-check.png`: the same six views, with a label at each joint the motor's torque passes through (what reaches it, and at the loaded joint the margin and whether it holds unpowered). The rest view never carries them.
- `cad preview` of an assembly with a motor draws each one at work beside the picture, as SVG: `<assembly>-<motor>-curve.svg`, its torque against speed at the output with the load and the working speed marked, and `<assembly>-<motor>-train.svg`, the torque from its shaft through each stage to the joint with the load, against what the load needs there, and whether it holds with the power on and off. The numbers are the check's.

### Beams

An item can be a beam, a length of an aluminium extrusion, a tube or a bar from `@rulecad/frames`:

```json
{ "id": "x1", "beam": { "profile": "2020-misumi-hfs5", "length": 300 }, "from": [0, 0, 0], "to": [300, 0, 0], "roll": 0 }
```

- `"profile"` names the profile (`2020-misumi-hfs5`, `profile-4040-item-8`, or a set in this workspace's `rules/`).
  `"length"` is mm from end `a` to end `b`, a number or an expression (`"x1.length"`). Placed by its ends, the length
  may be left out: it is the distance from `from` to `to`, and a length that disagrees with them is refused with both.
  `"material"` names a material set in place of the profile's alloy. `"printed": true` is for printed beams, a later
  release: it is refused by name for now.
- Placed by its ends, end `a` is at `from` and end `b` at `to`; at roll 0 its top faces up (+z), or +y when it stands
  upright, and `"roll"` turns it about its own axis, in degrees. Or place it with `at` and `rotate` as any item, in its
  own frame: end `a` at the origin, the beam up +z, its top +y. The face names and a picture are in the
  `@rulecad/frames` README ("Face names in an assembly").
- A beam is bought: drawn faint, never on a plate, on `cad list` by profile and length (`2 × profile-2020-misumi-hfs5
  x 300 mm  a beam  150 g each`, weighed by the maker's mass per metre where the sheet gives one), and in the overlap
  check by its envelope, a plain box. `cad check` says each beam's mass beside the sheet's, and warns of a length
  longer than the profile is sold in. Its numbers are values: `x1.length`, `x1.width`, `x1.height`, `x1.mass`.
- `"ops"` lists the operations on it, each placed by an address on the beam and dimensioned from end `a`: `cut`,
  `mitre`, `tap`, `access`, `drill`, `counterbore`, `pocket`, `notch` and `deburr`. `{ "op": "tap", "at": "a", "thread":
  "M5" }` taps end a's bore; `{ "op": "access", "at": "top@-10", "thread": "M5" }` drills a hole for an M5 screw's key 10
  mm from end b; `{ "op": "mitre", "at": "b", "angle": 45, "about": "top" }` mitres end b, the length then measured on
  the long side. Numbers may be expressions. Each is cut into the beam's solid (a mitre into its envelope too), and
  `cad check` reports its findings as `beam.op` (a hole into a slot's lips or across a tapped thread, a tap deeper than
  the bore, a hole too near an end) and thread engagement in the alloy. What each takes is in the `@rulecad/frames`
  README ("Operations").
- `cad add beam <project>/<assembly> --id x1 --profile 2020-misumi-hfs5 --from 0,0,0 --to 300,0,0 [--roll 90]` adds one.

Every beam has addresses, taken wherever an anchor is: an item's `at`, a joint's `parent` or `child`, a `loop`, a
fit's `a` or `b`, a fit's `access`, and a load's `at`.

| Address | Where |
|---|---|
| `x1.a`, `x1.b` | The middle of each end, its z out of the end |
| `x1.a.1`, `x1.b.2` | A bore in an end |
| `x1.top`, `x1.top.2` | A face's first and second place (a slot, or the face where it is closed), at the middle of the beam |
| `x1.top@120`, `x1.top@-20`, `x1.top@50%` | 120 mm from end `a`, 20 mm from end `b`, half way along |
| `x1.top.2@120` | The second slot of a face that has more than one |

A face's anchor has its z out of the face and its x along the beam toward `b`. An item placed at an address
(`{ "id": "plate", "object": "plate", "at": "x1.top@50%" }`) puts its own origin there, its z out of the face and its
x along the beam, turned by its `rotate` in that frame; it moves with the beam. A distance past either end is refused
with the beam's length: `"top@320" is past the end of profile-2020-misumi-hfs5 x 300: it is 300 mm long`. In a fit, an
address stands for the faces near it, as `item@anchor` does (`"within"`, 10 mm by default).

**Joins.** `"joins"` says how beams are held to each other. Each names an end of one beam (`a`), a place on another
(`b`: a face with a distance where a's end meets it, or an end for a splice, a mitre or a corner) and its kind:

```json
"joins": [{ "kind": "blind", "a": "y1.a", "b": "x1.back@120" }]
```

- A join puts its operations on both beams before they are built, so they are on the cut list and the sheets: a
  `blind` join taps the end of `a` (`tap M5 x 18.5 at a`) and drills an access hole across `b` from the opposite
  face (`access Ø5.3 at front.1@120`), and an `end-tap` join drills a clearance hole right across `b` instead.
- Its screws join `"fasten"`, so they are followed, checked and counted as any fasten's are (`1 × M5x12 button` on
  `cad list`). A blind join's button head sits inside b's slot under its lips; an end-tap's cap head sits on the lips
  of the slot across b. `fasten.seat` holds the head to the slot (wider than the opening, and inside the slot, no
  wider than the cavity and no taller than the room under the lips), `fasten.end` takes the thread tapped in a's end
  bore, and `fasten.access` follows the key through the access hole. `"screw"` names another screw (`"M5x12 button"`).
- A `mitre` join (`"b": "y1.a"`, an end) cuts both ends at the angle that halves the corner, about the face the corner
  lies in, each beam's length on the outside of the corner, worked out from where the two beams are (both placed by
  their ends). Its corner key or plate comes later.
- A `bracket`, `gusset` or `splice` join with `"fitting": "printed"` adds its printed fitting from `@rulecad/frames`
  (its README, Printed fittings) as an item of its own (`y1-x1-bracket`), placed from where the two beams are (both
  placed by their ends), and a `fasten` for each leg or arm into its beam's slot, with the slot nut the fitting was
  drawn for. So the screws are chosen, checked and counted like any fasten's (`2 × M5x12 cap` and their slot nuts),
  the fitting's grams are on `cad list` under Printed, and `join.stiffness` takes the fitting's own bending stiffness
  by finite elements in place of the estimate (its twist stays an estimate). `cad check` says the fitting's own
  findings of it: `fitting.margin` at its named load, `fitting.screw` (the length sold it was thickened for),
  `fitting.stiffness`, `fitting.mass` and the rest (@rulecad/frames' README lists them).
  - A bracket goes on the side of a with more of b, its base leg on b's face and its upright on a's face that looks
    along b; refused by name where its leg would run past b's end there.
  - A gusset lies on a face of each beam that looks the same way, in one plane: an L at a corner, a T where b runs
    on both sides of a; refused where its arm has no room.
  - A splice plate lies across two ends on a face they share.
  - `"brace": true` braces a bracket; `"load"` (N) is the design load it is sized to about twice the margin at
    (default 100); `"nut"` chooses the slot nuts' kind.
- An item may also be a printed fitting by itself: `{ "id": "br", "fitting": { "kind": "bracket", "profile":
  "2020-misumi-hfs5" }, "at": "x1.top@130", "rotate": [90, 0, 0] }`. It is a printed part, joined and cut by Manifold
  where the workspace has it; its anchors `b1`, `a1` (and `b2`, ... on a plate) lie on its screws' axes for a fasten's
  `at`. The overlap check measures its body without its tongues, which stand in the slots.
- The printed parts for panels, doors, beams' ends and services are fitting items too (@rulecad/frames' README,
  Panels and doors, Ends and feet, Services): `"kind"` is `panel-clip`, `panel-corner`, `slot-cover`, `panel-edge`, `gasket-strip`,
  `hinge`, `handle`, `latch`, `magnet-catch`, `end-cap`, `foot`, `levelling-foot`, `castor-plate` or
  `stacking-foot`, with the model's own options (`"sheet": 3`, `"length": 200`). A hinge is two items, `"part":
  "frame"` and `"part": "door"`, and a levelling foot's pad is `"part": "pad"`. An end part goes at the end's address
  (`"at": "x1.a"`); its anchor `b1` is its screw's, and its `ops` say the tap the end needs.
- The other kinds (`cube`, `hidden`, `anchor`, `pivot`, `printed`, and a bought bracket, gusset or splice) are
  checked where they meet and carry their stiffness; their fittings come in later releases, and each says so
  (`join.fitting`).
- `cad check` adds `join.geometry` (the end meets the face square and flush, where `b` says, on the slot's centre line
  where the kind needs a slot: a beam 2 mm off the face fails with `a gap of 2 mm`, and one 5 mm along names the
  address it does meet at), `join.end` (every beam end is joined or capped: an item placed at the end, such as a foot,
  caps it), and `join.stiffness` (the spring each join puts at a's end when the frame is solved, from
  `@rulecad/frames`' `JOIN_STIFFNESS`: every figure an estimate until the joint rig measures it, and the finding says so).
- `cad add join <project>/<assembly> --kind blind --a y1.a --b x1.back@120 [--screw "M5 button"] [--fitting printed]`
  adds one.

**Fastening into a slot.** A `fasten` whose `into` is a slot on a beam ends in a slot nut under the slot's lips:

```json
"fasten": [{ "screw": "M4 button", "through": ["plate"], "into": "x1.top", "holes": "plate.body", "nut": "drop-in" }]
```

- `into` is a face with a slot (`x1.top`), one slot of a face with several (`x1.top.2`), or a place on it
  (`x1.top@120`, which each screw is then held to). The nut is the one made for that slot's nut family and the thread
  (`nutFor` of `@rulecad/frames`): `"nut"` chooses its kind (`slide-in`, `drop-in`, `roll-in`, `hammer`, `square`,
  `t-bolt`), and left out, the strongest made for the slot. It is placed under the lips as a reference part and
  counted by its rule set's name on `cad list` (`2 × slot-nut-6-misumi-m4-drop-in`).
- `fasten.slot`: each screw lies over a slot's centre line, within the play its hole in the part gives it (half the
  hole less the thread), square to the face, along the beam. A plate drawn for slots 30 mm apart on a face whose slots
  are 20 mm apart fails with the distance, `5 mm off the centre line of x1's top.1 slot`.
- `fasten.length` chooses the shortest sold screw that puts a hexagon nut's height of thread in the slot nut
  (`<thread>.nut_height`, ISO 4032) and stops `FASTEN.floor` (0.3 mm, a working figure) short of the slot's floor.
  The stack is the part, a washer, and the slot's lip. With 3 mm of plate on a 2020 slot an M4 screw has 1.3 mm to
  land in, so `M4x8` fits it and nothing sold fits a 4 mm plate; the finding names the lengths either side.
- `frame.nut`: a slide-in or square nut goes in only from an open end of its slot. A slot is closed by a join that
  butts on its end, and the stretch a nut is in by a blind join's head in that slot too. Where joins close both ways,
  the check fails and names the nut of that thread that goes in through the opening (`give "nut": "drop-in"`).
- `frame.preload`: nuts with a way in that a join closes and no way that stays open (the other end capped by an item
  placed there, such as a foot) go in before that join is made. The finding names the beam, the slot, the end, the
  nuts and the join, and `cad order` and the build page list them on the step that makes it
  (`first, load 2 × slot-nut-6-misumi-m4-slide-in into y1's top slot through its end a, for plate2, before the blind
  join of y1.a to p1.top@170 closes it`).

### Building it

Once an assembly is checked, these say how to make it. They all read the assembly itself, so they can't disagree with it.

- `cad order <project>/<assembly>`: the order it goes together in, each step with the part and what fastens it. A `fasten` names its screws on the step where its parts are both there, with the key that turns them and how tight: its `torque`, or the most the seat under the head takes (`2. bracket goes on: bracket fastened to base (2 × M3x10 cap) with a 2.5 mm hex key, to 0.33 N m at most (what the seat takes)`); `--json` gives each as `{ fit, fastener, count, key, tighten: { torque, given } }`, and the build page shows the same. What is not a screw (pins, a clip) is named on a fit that fastens: `"fastener": "push pin", "count": 2` puts it on the shopping list and the step. `--preview` writes a picture of each step to `.preview/`: what's there, and the new part held off along the way it goes on. The order is found by taking the assembly apart, so a part goes in after what it's fastened into, a bearing before its shaft, and a nut trapped by a wall before the neighbour that traps it. A part goes on along a straight line that clears everything already there; which line comes from the part as drawn.
- `assembly.order` is `cad check`'s finding on it: a part no order can reach fails by name, and a part sealed inside another too. A fit can say where a screw is driven from with `"access": "<item>.<anchor>"`, the anchor's z pointing out along the screw: whatever stands on that line goes on after the screw, and if it has to go on first the screw can't be reached at all. Works on an assembly's own items; a component (an assembly used as an item) goes on as one step.
- `cad plates <project>/<assembly>`: every printed part laid out on beds, in its print orientation (as it's drawn), grouped by filament so each plate is one colour change, spaced by the first layer's rule (the printer's `print_gap` plus twice its `foot`, up to whole lines; `--gap` for your own). They're written as `kind: "plate"` assemblies called `<assembly>-<filament>-<n>` and checked as prints; `cad export` makes each one's 3MF. Each plate remembers what's on it by its build's hash (`"packed"` in its file): a changed part re-packs only its plate, so the other plates keep their files untouched, and a part too big for the bed is said by name (`plate.bed`).
- `cad list <project>/<assembly>` lists the beams' **cut list** after the bought parts: each mark (beams that are the same, one profile, length and set of operations, share a mark, A, B, C), its count, grams each and work, then each profile's lengths to cut, the bars to buy in the lengths it is sold in, and the cuts on each bar in order with its offcut. Every cut takes the saw's 3 mm kerf and each bar's first end is trimmed 10 mm (`CUT_DEFAULTS` in `@rulecad/frames`, each with its source); the packing is first-fit decreasing. `cad check` adds the cut list's findings (`frame.cut`): a beam longer than any length sold fails, two lengths nearer than the cut tolerance can hold apart warn, and beams of one mark are reminded to be cut against one stop. Each beam's mark is in its label in the preview and the link (`x1: mark A, profile-2020-misumi-hfs5 x 300 mm`).
- `cad beams <project>/<assembly>`: a cut-and-drill sheet for each mark, written to `exports/<project>/<assembly>.beam-<mark>.svg`, in mm so it prints to scale at 100%: the section at end a with each face named and the taps marked, a view of each face with work on it (that face up, end a on the left), every operation dimensioned from end a to 0.1 mm, and the operations in order, each tap with its thread and depth. The build page lists the sheets with the cut list.
- `cad wires <project>/<assembly>`: the wiring sheet, printed and written to `exports/<project>/<assembly>.wiring.md` (`cad machine` writes it too): each wire's length through every pose with its service loop, gauge, colour, connectors and board pins. Wires also show faint along their routes in `cad preview` and in the link, moving with the joints, and are never parts: no overlap check sees them.
- `cad link` for such an assembly (or one with a `fasten`) carries the rest of the project with the model. A **Build** button on the page opens, beside it, the shopping list, the beams' cut list and their sheets, the plates drawn on their beds, the wiring sheet, the assembly steps (each shows the model at that step) and the machine's settings. The Rules panel lists **predicted against measured**: the ledger `cad measured` writes, each with its ratio, and what the checks predict that nobody has measured yet.
- A link for an assembly with a `task` lets the page move the machine: see "Things that move" in the viewer's README. It carries the newest step file `cad plot` wrote for this assembly (`--steps <file>` for another, `--no-steps` for none). A step file for other joints is refused by name.

**Panels and doors.** An item with `"panel"` is a sheet cut to the bay of four beams it closes:

```json
{ "id": "front", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["x1", "z2", "x2", "z1"], "out": [0, -1, 0] } }
```

- The bay is four beams placed by their ends, two each way round a rectangle, in order. Each has a slotted face that
  looks along `out`; the four faces lie in one plane. Refused by name: a beam that runs across the plane, faces out
  of one plane, a beam with no such face (turn it with `roll`), a bay that is not two beams each way.
- The panel lies on those faces, its edges 6.5 mm in from each slot's line for an M5 clip on a 2020, and is cut to
  what is left: a 400 x 300 mm bay of 2020 (slot lines 380 x 300 mm apart) takes 367 x 287 mm. `cad list` counts it
  under Bought by its sheet and size (`acrylic sheet, 3 mm cut 367 x 287 mm`) with its mass from the sheet's density.
- Its printed clips go along each edge at no more than `"pitch"` apart (150 mm by default, `PANEL_DEFAULTS.pitch`),
  clear of the beams across the edge's ends and of their clips: each is an item (`front-clip`, `front-clip-2`, ...)
  with a fasten into its beam's slot, so its screw is chosen, checked and counted (14 × M5x10 button and 14 slot
  nuts round a 400 x 300 mm bay). `"nut"` chooses their slot nuts' kind; `"load"` (N) the load each clip is sized for.
- `cad check` says `panel.size` (its sheet, size, mass and how many clips hold it) and `panel.thickness` (a warning
  where the sheet is not commonly stocked in that thickness), with each clip's own findings.
- With `"door": { "hinge": "z1" }` the panel is a door. It stands off the faces by the hinge's frame leaf, a head
  and 1 mm (10.2 mm on a 2020), on two printed hinges along the beam named, each a frame leaf screwed into its slot
  and a door leaf screwed through the door into nuts, an M4 cap screw and lock nut for each pin (on `cad list`). It
  turns on a revolute joint `<id>-hinge` from 0 to `"open"` (120° by default), with poses `<id>-shut` and
  `<id>-open`. A handle (`"handle": false` leaves it off) is screwed from inside into its feet, and a magnet catch
  (`"catch"`) sits on the opposite beam under the door's edge; `"latch": true` adds a turn-button latch, shown shut.
  The holes the screws pass are cut in the door. `cad check --sweep` turns the door through its range: on its own,
  nothing collides; with its latch shut, the door hits the latch within its first degree, so sweep in steps that
  fine to see it.
- In a mechanism, a beam placed by its ends is the frame: what is screwed to it is held (`assembly.loose`).

**Services on a frame.** A bought board or supply with `"mount"` sits on a printed mount at an address on a beam's
slotted face, its holes read from its own rule set (@rulecad/frames' README, Services):

```json
{ "id": "psu", "bought": "supply-24v", "variant": "LRS-50-24", "mount": { "on": "rail.top@-90" } }
```

- The mount is an item `<id>-mount` (a `device-mount` fitting), listed just before the device, and the device goes on
  its anchor `device`: leave out the device's `at` and `rotate`. `"turn"` (0, 90, 180, 270) and `"offset"` (mm across
  the slot) move the device on it; `"standoff"`, `"load"`, `"nut"`, `"head"` and `"screw"` are the model's own.
- Its screws are fastens, so each is chosen, checked and counted: two into the slot past the device's body, and the
  device's own. A supply's go up from under the mount into its tapped holes: `fasten.length` chooses the longest sold
  that goes no further than its maker allows (`mount_hole_reach`, Mean Well's 3 mm), and `fasten.engagement` holds it
  to that. A board's go down through its drilled holes (held to the drilled clearances) into pilots on the mount.
  Refused by name: a mount on what is not a bought board or supply, a set with no `mount_holes`, an address that is
  not on a slotted face, an item with both `at` and `mount`.
- `cad check` says `service.mount` for each, with the mount's own findings (`fitting.device`, `fitting.head`, its
  grams and margin).
- A wire's `via` may hold a run along a slot: `{ "along": "rail.front", "from": 300, "to": 60, "pitch": 100,
  "cable": 6 }`, its ends in mm from the beam's end a. Printed cable clips snap into the slot at each end and no more
  than `pitch` apart (`<wire>-clip`, `<wire>-clip-2`, ...), each held by a fit that fastens, and the wire is routed
  through them, so its length follows the beam. `wire.run` says the run's length and its clips, and `wire.length`
  the part of the wire along the slot and how many clips hold it. A run past the beam's end is refused by name.
- The other service parts are fitting items by kind: `fan-mount` (`"size": 80`), `drag-chain-end` (`"holes"`,
  `"screw"`), `din-rail`, `cable-clip`, `tie-anchor` and `spool-holder`.

## Optimised parts

`cad optimise` finds the stiffest layout of a flat part: where to put a fixed amount of material so the part bends
least under its loads (topology optimisation, by @rulecad/topopt). A problem is a file in the project's `problems/`,
with numbers as expressions like an object's (schema: `schemas/problem.schema.json`):

```json
{
  "title": "A lever",
  "uses": ["m5", "x1c"],
  "material": "pla",
  "thickness": 6, "cell": 1, "volume": 0.5, "filter": 2.5,
  "space": { "at": [60, 0], "size": [140, 40] },
  "keep": [{ "at": [0, 0], "r": 6 }, { "at": [120, 0], "r": 5 }],
  "avoid": [{ "at": [0, 0], "r": "m5.clearance / 2" }, { "at": [120, 0], "r": 2.3 }],
  "supports": [{ "at": [0, 0], "r": "m5.clearance / 2" }],
  "loads": [{ "at": [120, 0], "r": 2.3, "force": [0, -20], "case": "down" }]
}
```

- **The space** is where material may go (a circle `r`, a rectangle `size`, or a polygon `points`, in mm). **Keep**
  regions stay solid (bosses round bolts), **avoid** regions stay empty (the holes, clearances).
- **Supports** hold the material within `r` of a point (a bolt's hole); **loads** push on it, in newtons, each in a load
  case. Cases are optimised together, each by its weight in `cases` (0: analysed, not optimised for).
- **The material** is a rule set with `modulus` (MPa) and `poisson`: `pla`, `petg`, `al6061`, `al7075`, `s275`,
  `ss304`, `ti64` come with rulecad. Printed values vary: measure yours.
- **Settings:** `volume`, the share of the space to fill; `cell`, the grid (smaller is finer and slower: a 140 × 40
  grid takes about half a minute); `filter`, about the thinnest member, in mm.
- **Or a stress limit instead of a volume:** `"stress": "pla.strength / 3"` (MPa) finds the lightest layout that keeps
  every cell's von Mises stress under it, which rounds off the sharp inside corners where cracks start. It takes about
  a thousand steps, each with two solves, so it's slower: give it a coarse cell first. Give supports and loads some
  area (a hole's edge, a pad), as stress where a load meets a point has no limit. `cad optimise` reports the peak
  stress against the limit. Check the final part with an `analysis` on a finer `cell`: a sharp corner that's
  within the limit on the optimiser's cells can still be over it on finer ones.
- **Variants**, picked as `name:variant`, set variables that have a tweak range, as an object's do.

`cad optimise <project>/<problem>` runs it, reports how far each load case moves its load and the stiffness that
gives, and draws the layout in `.preview/`. The result is kept, keyed by everything it's made from, so it's only
worked out again when something it depends on changes.

A 3D result with a build direction is made printable before it's drawn: built up layer by layer from the bed, every
cell that nothing holds up (an icicle, a loose bit, a sheet hanging under an edge: whatever the optimiser's smooth
overhang filter let through) is emptied, with whatever rested on it; a bridge may run out half the printer's span,
in the optimiser's filter and in the cleaning alike, so a flat underside can open into holes that wide.
Kept regions always stay, and the optimiser is made to hold them up: a kept cell with nothing under it costs it as
much as the whole part's compliance. If there wasn't material enough to stand a kept region on, `cad optimise` says
how much of it is left hanging. Then the drawn surface is tipped back to the printer's overhang limit and any tip left
hanging in mid-air is lifted, and only the pieces that touch a support, a load or a kept region are kept (a few grey
cells away from the rest can close into a stray bit). `cad optimise` says how many cells it emptied and pieces it
dropped, and `cad check` tests the part for one piece and nothing starting in mid-air.

`cad optimise <project>/<problem> --watch [port]` runs it afresh and serves a live view at `http://127.0.0.1:8090/`:
the densities as they change (a 3D part as a surface you can turn, and from three sides), a chart of its compliance and how much it still changes, with a scrubber to look back at any earlier step, its run time and time left, the machine it runs on, and a button that stops the run. It shows the end for ten minutes after the run finishes.
It listens on this computer only. To watch from elsewhere, reach it through a private network such as Tailscale.

A design uses it through a variable of type `problem`, which picks a problem by name:

```json
"problem": { "type": "problem", "value": "lever", "choice": ["lever", "lever:both", "none"] }
```

```js
export function main (v) {
  return extrudeLinear({ height: v.thickness }, v.shapes.optimisedOutline(v.problems[v.problem]))
}
```

A variant that sets the problem to `none` builds without optimising (`v.problems` then lacks it): a test rig drawn on a
plain base, or the parts a problem's regions name (`{ "part": "body:regions.mounts" }`), which must not need the problem
they feed.

`optimisedOutline` gives the outline as a 2D shape, its keep regions added and avoid regions cut exactly, so bolt
holes come out true.

### Solid parts (3D)

A problem whose regions have a z is solid. It has no thickness, and takes more kinds of region:
- **A box:** `size`.
- **A cylinder:** `r`, `length` and `axis`. It can be a teardrop: `"teardrop": "down"` for a boss, `"up"` for a
  hole. It gets a 45° point that way, so it prints. Up is the problem's `overhang` (+z when it's free), so the same
  problem prints either way up; `"+y"` and the like point it a fixed way. Along its axis, it has no point.
- **A ball:** `r`.
- **A named part of another design in the project:** `{ "part": "envelope.body" }`.

Supports and loads can be any region; a force has x, y and z. `"overhang": "+z"` keeps only material that prints
without supports standing that way up (a variable holding `"+z"` or `"none"` works too, so a variant can switch it).

`cad optimise` draws the result's four views in `.preview/`. A design builds the result with
`v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops })`, which adds the keep regions and cuts the avoid
regions exactly. The surface is a big mesh, so set the object's `"engine": "manifold"`. With `"overhang"` set, the
surface is also kept within the printer's overhang limit: faces smoothing tipped past it are tipped back. An
`analysis` of a solid part voxelises it on the problem's grid.

A part prints in one orientation and is loaded in another. Draw it as it prints, and turn it back for its analysis:
`"rotate"` (degrees about x, then y, then z, as JSCAD's `rotate`) then `"move"` (mm) put it in the problem's frame.
Both take expressions, so a variant can lie the part down:

```json
"analysis": [{ "problem": "bracket", "rotate": ["0 - 90 * side", 0, 0], "move": [0, "0 - side * bench.bracket_h / 2", 0] }]
```

Grids in 3D are solved by multigrid, with the solver's products shared over the machine's cores. A 16 × 16 × 40 grid
(about 10,000 cubes) takes a second or two a step, a 32 × 32 × 40 one (41,000 cubes) about five seconds on an eight-core
laptop and a 40 × 40 × 48 one (77,000 cubes) about thirteen, so a whole optimisation of a few hundred steps takes from a
few minutes to an hour. Finer cells cost more than their number: each step's solve takes longer to settle too. The
result is kept, so it's worked out once.

### Analysis

Any flat part, optimised or not, can be checked under a problem's supports and loads. An object's `analysis` names
the problem, and optionally a limit:

```json
"analysis": [{ "problem": "lever", "max_deflection": 0.5, "volume": "target", "tolerance": 0.01 }]
```

`cad check` then reports, for each load case, how far the part moves its load, its stiffness (N/mm) and its peak
stress against the material's strength, and the part's volume and weight. With `max_deflection` a case that moves
further fails; with `volume` a part whose volume is further than `tolerance` (a share) from it fails. A picture goes in
`.preview/`. A twist (forces that add to nothing, such as four round a rim) has no direction to move along, so it's
reported as the angle the part turns through, in degrees, under its moment (N·m), and its torsional stiffness (N·m a
degree).

On the problem's own cells the analysis is quick and coarse. A solid part's cubes are filled by the share of each the
part takes up, so a wall between cell centres still counts, but thin walls on big cubes still come out too stiff when
they bend. To check a final shape, give the analysis a smaller `cell`:

```json
"analysis": [{ "problem": "bracket", "cell": 0.8, "min_safety": 3 }]
```

The part is then analysed on those cells and again on cells a quarter bigger. For each load case, `cad check`
reports:
- **Stiffness and its change:** under 5% from the bigger cells and it has settled; more, and the cells are too big.
- **Members too thin for the cells:** a warning when more than 5% of the part lies in members under four cells
  thick (what an opening of two cells takes away), where a cell's stiffness is a rough figure: use a smaller cell.
- **Peak stress, where it is, and the safety factor:** against the material's strength (its weaker one across a
  print's layers, where the rule set has `strength_z`), and its fatigue strength where it has one. With
  `min_safety`, a case below it fails. Peak stress at a sharp inside corner keeps rising as cells shrink, so read it
  with its change.
- **The largest movement anywhere, and where.**

A report goes in `.preview/` (`<object>-report-<problem>.md`, and `.json`), with what the analysis doesn't cover. A
solid's analysis is kept in `.cache/analysis/`, so it runs once.

**Safety-critical parts.** A problem with `"critical": true` (a pedal, a lever, a bracket that holds people) marks
every part analysed under it as unverified, until a test or an independent analysis is recorded in the object:

```json
"verification": [{ "kind": "test", "date": "2026-11-02", "by": "J. Smith", "summary": "20 N straight down, three prints: 0.21 mm, 95 N/mm", "source": "results.json" }]
```

The analysis is a design aid, not engineering sign-off: anything that could hurt someone if it failed needs testing.

## Boards

A circuit board is an object whose .json says `"engine": "pcb"`. Its `main(v)` returns a
[tscircuit](https://github.com/tscircuit/tscircuit) board (circuits as code, from npm) built with `v.pcb`
(`@rulecad/pcb`: `npm install @rulecad/pcb` in the workspace); the build runs it into Circuit JSON, and the bare board, drilled, becomes a part, so
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
- **Versions:** `@rulecad/pcb` pins tscircuit's packages to exact versions (tscircuit moves fast).

### Speed
Fit checks find closest gaps through a grid of triangles (nearest cubes first), and remember overlap volumes between
placed parts in `.cache/overlaps.json`, keyed by each part's build and placement: the staggered keyboards' checks take
about 10 s, and a re-check after an edit measures only what the edit moved. The build cache keeps its 800 most
recently used builds, keyed by what a build is made from: the design's code, its values resolved, its parts' names
and roles, the rule sets and the tool's own code; a rule's words, a label or the version change nothing it builds,
so they don't start one. A lamina mechanism's slow stages (its physics, a flooded frame's probe) are kept apart in
`.cache/stages/`, keyed by their own inputs, so a build that changes only what comes after them (a strap, a check)
takes minutes rather than the twenty a launcher's physics takes; the design's sandbox reads them and hands back what
it made for the tool to write. `CAD_NO_CACHE=1` computes everything afresh (and keeps it).

### Assemblies: values from other parts
(An object can also read another object directly, outside any assembly: see "Other objects' numbers" under Variables.
That suits a case built around one board; `from` suits values that only mean something where items meet.)
An item's `from` sets inputs from other items' values, in the assembly's names: `"from": { "usb_y":
"board.pcb.pico_y" }`. Every item is built before any is placed, so positions can refer to items listed after them
(the board placed under the case's top while the case is built from the board's Pico position). `"place": false`
builds an item only for its values: the PCB build's print plates (`staggered-pcb-case`, `staggered-pcb-plate`) take
the board's numbers without the board being on the bed. In assemblies a board counts as a reference: checked, drawn
faint, never in a print file.

## Mechanisms printed flat

A design whose `main` returns `v.flexures.lamina({ … })` (see @rulecad/flexures, Lamina mechanisms) is a mechanism
drawn in one plane and printed on its side. `cad check` adds its own findings to the print checks: that it prints
free (nothing within the printer's gap of what it isn't joined to), that every step of its sequence is clear, that
nothing jams, that its catches hold, and that every flexure has a hard stop before its strain limit. `cad animate
<project>/<object>` writes the sequence, start to finish, as an animated SVG in .preview/: the frame drawn once, the
moving bodies in blue and the flexures in orange, drawn bent, holding a moment at each state. Under it, each driven step's force against its travel, with a marker that follows the frames; a mechanism that fires adds the shot in slow motion. The printer's
`print_gap` is the gap the checks hold it to.

An assembly with a `gait` (EXAMPLES chapter 14) plays too: `cad animate <project>/<assembly>` writes the cycle as an animated SVG in `.preview/` (a side view of the legs and a plan of the feet and what they stand on) and its data as JSON. The model page plays the same cycle in its Motion panel.

An assembly with a motor, or with gears that follow a joint, plays its drive: `cad animate <project>/<assembly>` writes `<assembly>-drive.svg`, the gears cut across their shafts through their teeth (up to three cuts side by side, a compound planetary's two rings each in its own), each part turning and moving as it does, the part with the load picked out. It turns the drive until the slowest part has moved about 60° (one to six turns; `--turns n` to choose). Each part's outline is drawn once and moved, so a gearbox stays a few hundred kilobytes.

## Checks

- **Closed solids:** every edge must be matched by faces on the other side. T-junctions (an edge covered by several
  shorter ones) count as closed, and so do hairline seams: a seam within 0.01 mm of another face, which booleans leave
  and no printer can resolve. Anything wider is reported as a hole.

- **Every measurement is a variable**: numbers other than 0, 1 and 2 in a design fail.
- **Fits the bed** (256 mm), **sits on it** (lowest point z = 0, faces flat on it), **overhangs** past 45° (warning:
  supports or another orientation), **closed solid** (warning: JSCAD's booleans can leave small gaps where solids
  touch; slicers usually repair them).

Z is up and the bed is z = 0: a design is built the way it prints.
