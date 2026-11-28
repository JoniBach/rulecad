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
  project.json             name, title, description, default material, printer, objects, filaments (AMS slots)
                           (schemas/project.schema.json; written by cad new <project>, changed by cad set <project>)
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
npx cad rules draft profile 2020-mine   # a beam's profile to fill from its maker's spec sheet; then cad rules check and draw
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

### Projects and assemblies, by command

Every edit to a project's or an assembly's file has a command that makes it and checks it, so neither file need be
written by hand, and a program (or a graphical front end) can drive the same edits:

```sh
npx cad new bench --title "A bench rig" --material PETG --printer x1c       # projects/bench/project.json
npx cad set bench material=PLA "filaments.legend.slot=2"                    # its own fields
npx cad new bench/rig --assembly --title "The rig"                          # an empty assembly that checks
npx cad new bench/box --assembly --frame box --inside 300,300,350 --profile 2020-misumi-hfs5 --join blind --feet levelling
npx cad add beam bench/rig --id x1 --profile 2020-misumi-hfs5 --from 0,10,10 --to 300,10,10
npx cad add guide bench/box --kind rail rail=rail-mgn12 carriage=MGN12H on=x3.top from=25 length=250
npx cad add load bench/box --mass 5 --at x3.top@50%
npx cad set bench/box frame.join.fitting=printed "frame.inside=[300,300,400]" loads.0.mass=8
npx cad move bench/rig x1 --at 0,10,40                                       # a beam by its ends: both move
npx cad remove bench/rig x1 --with-refs                                      # and the joins that name it
```

| Command | What it writes |
|---|---|
| `cad new <project> [--title] [--description] [--material] [--printer]` | `project.json`, PLA unless told; refused if it is there, or the printer has no rule set |
| `cad set <project> field=value …` | A project's title, description, material, printer or `filaments.<name>.slot`; its objects are kept by `cad new <project>/<object>` |
| `cad new <project>/<assembly> --assembly [--title] [--frame <kind> --inside x,y,z --profile <set> --join … --fitting … --feet … --caps …] [field=value …]` | An assembly, empty or a generated frame, expanded and checked before it is written; its project too, where there is none. A kind other than fit is refused (a mechanism is a fit with joints, a plate is written by `cad plates`) |
| `cad add fit\|joint\|item\|beam\|loop\|pose\|fasten\|join\|guide\|load\|wire <project>/<assembly> --option … [field=value …]` | An entry, any field as `field=value` (`motor.model=nema17` nests); every name it gives checked against the assembly's items, a generated frame's beams included |
| `cad set <project>/<assembly> <address>=<value> …` | A field. An address is an entry's id and a field (`x1.at`, `hinge.max`), an entry by its place (`joins.3.kind`, `fits.0.min`), or a field of the assembly's own (`title`, `frame.join`, `task.speed`); a key with a dot in it goes in brackets and quotes (`frame.supports["z1.a"]`) |
| `cad move <project>/<assembly> <id> --at x,y,z \| --to <address> [--rotate x,y,z]` | An item to a point or an address (a beam placed by its ends moves both ends, as one), or a guide to another face (`--to x4.top`) or along its own (`--at 40`) |
| `cad remove <project>/<assembly> <id \| list.n \| id.field> [--with-refs]` | An entry or a field; refused while other entries name it, listing them, unless `--with-refs` removes them too |

A value is JSON where it is JSON (`8`, `true`, `[300, 300, 400]`, `{"kind": "bracket"}`), a list in brackets
without quotes (`[1515-openbeam, 2020-misumi-hfs5]`), and otherwise text; quote one with brackets or spaces for the
shell. A text standing where an object is asked for is its kind: `"join": "blind"` is `{ "kind": "blind" }`, so
`frame.join.fitting=printed` keeps the blind.

Each command keeps the file's layout, checks the edit against the schema and against what it could break (a
generated frame must still expand; a join's beams, a fit's parts, a fasten's items, a guide's beam, a joint's parent
and child, a pose's joints, a wire's ends and route (its anchors, path joints and runs along a beam's slot), a loop's
anchors, a load's joint and anchor, and a placed or mounted item's address must be there, in the entry changed and in every other entry
that had them before), and refuses a bad one by name with nothing written: `--json` gives the refusal as `{ "error": {
"code", "message", "file", "path", "refs" } }`. `--dry-run` does it all and writes nothing. Done, it prints each change
(`set frame.feet: "levelling" → "foot"`) and the checks; `--json` gives `{ "command", "file", "written", "dryRun",
"changes": [{ "op", "path", "before", "after" }], "findings" }`, the findings in the kit's one shape. A generated
frame's beams are not in the file, so `cad set` and `cad move` refuse them by name (`edit.generated`): change the
frame's own fields, or write it out with `cad frame <ref> --expand` first.

| Refusal | When |
|---|---|
| `project.exists`, `assembly.exists` | `cad new` of one that is there, or a field given to `cad new <project>` or `--material` or `--printer` given to `cad new <project>/<assembly> --assembly` that differs from the project's own (they are the project's: `cad set <project> material=PETG`, as the refusal names). Fields that match it change nothing and pass, so a step can run twice. Where the project is not there, the assembly makes it with them, each checked as `cad new <project>` checks it |
| `project.printer` | A printer with no rule set |
| `project.material` | A material printed fittings cannot be sized from: anything but PLA, PETG or a rule set in `rules/` giving strength, modulus and density. Every frame command reads the project's material as it builds the joins, guides and panels, so one it cannot read would stop them all |
| `edit.kind` | An assembly kind other than `fit` |
| `frame.refused` | A generated frame the generator refuses (a portal with nothing holding its feet, an end-tap join its profile cannot take) |
| `edit.address`, `edit.ambiguous`, `edit.generated` | An address nothing has, an id two lists share, a generated frame's part |
| `edit.part`, `edit.incomplete`, `edit.duplicate` | A name that is not in the assembly, an entry missing what it needs, an id already taken. A name the build makes counts as there only where an entry makes it, by its exact pattern: a repeated item's copies (`key-0`, `key-0-3`), a mounted item's mount (`psu-mount`), a panel's clips, hinges, leaves, handle and catch, a levelling foot's pad, a join's fitting (`y1-x1-bracket`), a wire's clips, a guide's parts (`g1-carriage-1`) and joints (`g1-1`, `door-hinge`). So `rail-3` is no name where `rail` is one beam |
| `edit.referenced` | `cad remove` of what other entries name (each listed in `refs`) |
| `edit.renumber` | `cad remove` of a guide while guides after it have no id of their own: they are named g1, g2 .. by place, so they would be renamed |
| `edit.dangling` | An edit that leaves another entry naming what is no longer there: a beam renamed or removed that a join, a load, a wire or a mount names, a frame changed or removed whose beams a join or a guide uses (each listed in `refs`). A name that was already missing before the edit is left to `cad check` |
| `edit.move` | A move its entry cannot take (a beam placed by its ends sent to an address) |
| `schema` | The edit leaves the file outside its schema |

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

**A beam's profile from its spec sheet.** `cad rules draft profile <name>` writes `rules/<name>.json` with every field
a profile can have, each with a starting value, `"kind": "estimate"`, a rule saying what the field is and a source
that starts `DRAFT`
(`cad rules draft slot <name>` and `slot_nut <name>` do the same for a slot family and a slot nut). Fill each field the
sheet gives (its value, `"kind": "spec"`, the sheet and page as `source`, the date as `checked`) and delete the rest.
`cad rules check <name>` then holds it to the vocabulary, draws the section from its dimensions and its slot
family's, and warns where the sheet's area, second moments or mass per metre differ from the drawn outline's by more
than 5% (`profile.section.*`: check the typed figure first; if it is right the drawing lacks a shape, such as corner
hollows, and the frame checks use the sheet's figures anyway); while any field's source is still the draft's it warns
`rules.draft`, naming each.
`cad rules draw <name>` writes `<name>.svg`, the section to scale with each slot and bore dimensioned, to hold against
the sheet's drawing. [The frames guide](https://jonibach.github.io/rulecad/docs/building-frames/) walks one from a
sheet to a checked box.

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
| `fasten.torque` | A printed bolt given a `torque`: the clamp it is turned to (T = K d F with steel's nut factor, an estimate for a printed thread) held against what the bolt breaks at, about twice over (`fixings.load_margin`); a turn that would break it fails, naming the most to turn it to |
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

### Pins, magnets and printed bolts

Two parts held with no steel screw are a fit with `"fastens": true` whose `fastener` names what holds them, in a form
the schema defines, so it is found, checked and counted as a screw is. Each is sized by `@rulecad/fixings`, which
draws its hole or pocket from the printer's rules:

```json
{ "a": "lid", "b": "box", "fastens": true, "fastener": { "pin": "snap pin 4x6", "count": 2, "pull": 5 } }
{ "a": "lid", "b": "box", "fastens": true, "fastener": { "pin": "dowel 3x12", "count": 2, "fit": "press", "load": 30 } }
{ "a": "lid", "b": "box", "fastens": true, "fastener": { "magnet": "disc magnet 8x3", "count": 2, "load": 10 } }
```

- **Pins** (`fit.pin`): a snap pin, a steel dowel, a length of filament or a printed pin. `cad check` finds round holes
  in part a, standing or lying on their side as teardrops (the roof is left out of the round), whose axis goes on into part b, holds each to the hole fixings draws for that pin (a snap pin's socket, a
  plain pin's press or slip hole), and measures the parts along the axis: a pin too long or too short for its parts
  fails by name, and so do fewer holes than `count`. `load` (across the joint) and `pull` (along the pins) are held
  to about twice the margin.
- **Magnets** (`fit.magnet`): round pockets in either part, each matched to a press, glued or ribbed pocket for that
  magnet; a pocket too shallow, a floor too thin to print or the wrong size fails by name. `load` is held against
  their pull, across `gap` where something lies between.
- **Printed bolts** are a fasten's: `"screw": "M8x20 hex printed"`. Below the printer's smallest thread it is refused
  by name (M5 at 0.2 mm layers names M6); its load is held to the plastic's strength by how it prints, and no wrench
  torque is said, since a printed thread is done up by hand. Its length is any whole millimetre that fits, into a
  slot nut too, where a bought screw is held to the lengths sold. A `torque` given for it is a turn by hand, held to
  what the bolt breaks at (`fasten.torque`), and `cad order` says it as a turn to that torque and no further.

`cad list` lists pins (printed, cut or bought) and magnets (bought) with their grams, and printed bolts among the
printed parts; `cad order` names each on its step. A fastener given as text (`"fastener": "push pin"`) is listed as
written, unchecked. The fits these rest on (`x1c.snap_clearance`, `pin_press`, `pin_slip`, `magnet_press`,
`magnet_glue`, `magnet_crush`, and a plastic's `strength_z`) are estimates until the holds coupon measures them:
`examples/bench/projects/benchmarks/MEASURE.md`, rows 40 to 47, and `cad measured benchmarks/fixings-test
x1c.pin_press=<figure>`, which refuses a figure no fit of its kind can be.

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
  said (`assembly.loose`): a ring gear resting on its case would turn with its planets. A fit that fastens does not
  move a part: one fastened only to a part a joint moves (a table to a carriage), but placed where it stands, stays
  there in every pose and its mass is not carried, so it is said by name (`assembly.fastened`). Place it on the moving
  part by an anchor or an address (`"at": "g1-carriage-1.top"`).
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
- A stepper's torque at speed is worked out at its driver's supply: the volts of the assembly's bought supply item (`supply-12v`, `supply-24v`), or 24 V where it has none. A stepper's torque is flat to its corner speed, 60 V / (2 L I × full steps a turn), and falls as one over the speed past it, so a 17HS4401 at 300 rpm gives 0.269 N m at full current on 12 V against 0.283 on 24 V. `motor.torque` says the volts and the rpm it read (`values.supply`, `values.rpm`).
- `"have": true` on a motor or bought item marks it as in hand: `cad list` lists it under `Bought, in hand`, apart from what is to buy (and leaves it out of the bought cost), the kit's `buy.csv` gives it the kind `in hand`, and its build page a table of its own. A printed item is refused.
- `motor.holds`: with the power on (holding torque, or stall torque) and off (detent torque, a built-in gearbox's friction, a worm that locks, gears under 50% efficient, or `"brake": "a ratchet and pawl"` on the joint). Dropping with the power off is a warning: it may be what you want.
- `motor.mount`: the part a motor is fastened to (a `fasten` into the motor, or a fit that `fastens`), read as drawn: how thick it is at the screw holes against the screws' size, the screws' engagement in the motor's tapped holes (the screws as bought: their length past the plate, held to the motor's `mount_hole_depth`, at least one diameter, `engagement.steel`, or it fails; a motor item's `"screw"` may name a whole screw, `"M3x8 cap"`, to check that one), and the screws' bearing on the plastic under the motor's full torque. Its screws are counted in `cad list` and `cad order` (at the length sold that stays in the motor's thread, with the tool that turns them: a hex key in a cap screw, a socket or spanner on a hexagon head, `"M3x8 hex"`). Then the whole part bent, by FE on the part as drawn (cubes, two across the plate at the screws): the motor's weight at its centre, along `gravity` in the pose it's checked in, and its full torque (the larger of its working and holding torque), both carried into the plate where the screws clamp it. The part is held at the joint that carries it, if one does; else where it meets the printed parts it's fastened to that sit below it; failing both, on its lowest face. It reports how far the shaft's tip moves (against the driven joint's seat, where that is on the same part, since the two move together), against the printer's `fit` clearance (or the motor's `"deflection"` in mm), and the peak stress against the material's `strength`; under 2 times either fails, and says what fixes it: the plate thickness that would do (bending goes with its cube), ribs, or how much stiffer a material would have to be. Cells this coarse read a plate 10 to 20% stiff, and a cell's stress is read at its centre, so the peak is scaled up to the surface; it's an estimate, said as one. Kept in `.cache/mount`.
- `motor.heat`: the motor's case against the softening point of the material the project prints in. Too hot says the current to set the driver to; the motor item's `current` set to it is read (the maker's rise at rated current, scaled by the current squared, as the heat is), so the check then passes.
- A `"shaft": true` fit (or `"press"`) between a motor and what it drives reads the bore from the part as drawn: that it's on the shaft (`shaft.seat`), that its flat is there (`shaft.flat`; the shaft turns to meet it, so where the flat faces doesn't matter), how much of the flat it grips (`shaft.grip`), and, pressed on, the hoop stress in the hub (`shaft.hoop`). `"slide"` holds the bore to a slide fit as printed (`shaft.slide`): the drawn gap less half the printer's `hole_comp` must leave the shaft clear, as a part printed in place needs, since it can't be pressed on.
- `cad preview --check` of an assembly with a motor writes `<assembly>-check.png`: the same six views, with a label at each joint the motor's torque passes through (what reaches it, and at the loaded joint the margin and whether it holds unpowered). The rest view never carries them.
- `cad preview` of an assembly with a motor draws each one at work beside the picture, as SVG: `<assembly>-<motor>-curve.svg`, its torque against speed at the output with the load and the working speed marked, and `<assembly>-<motor>-train.svg`, the torque from its shaft through each stage to the joint with the load, against what the load needs there, and whether it holds with the power on and off. The numbers are the check's.

### Beams

A frame is beams and the joins between them, every beam a profile from a rule set and every join declared, so its
drilling, screws and stiffness follow. [The frames guide](https://jonibach.github.io/rulecad/docs/building-frames/)
walks one from a spec sheet to a checked box; this section is the reference. In commands:

| Command | What it does |
|---|---|
| `cad rules draft profile <name>`, `cad rules check <name>`, `cad rules draw <name>` | A profile from its spec sheet, checked and drawn (Models from elsewhere, above) |
| `cad measure <beam.stl> --profile <name>` (or a DXF) | A profile from the maker's model or a DXF of its section |
| `cad add beam <project>/<assembly> --id x1 --profile 2020-misumi-hfs5 --from 0,0,0 --to 300,0,0` | A beam placed by its ends |
| `cad add join <project>/<assembly> --kind blind --a y1.a --b x1.back@120` | Two beams joined (Joins, below) |
| `cad new <project>/<assembly> --assembly --frame box --inside 300,300,350 --profile 2020-misumi-hfs5` | A generated frame, expanded and checked as it is made (A frame from a size, below) |
| `cad set`, `cad move`, `cad remove` | A frame's fields, a beam moved by its ends, a beam taken out (refused, naming them, while joins use it) (Projects and assemblies, by command, above) |
| `cad frame <project>/<assembly>` | A generated frame's beams and joins (`--expand` writes them out; `--size` chooses the lightest profiles) |
| `cad check <project>/<assembly>` | The joins, screws and nuts, then the frame solved: `frame.deflection`, `frame.stress`, `frame.buckling`, `frame.rack`, `frame.frequency`, `frame.square`, `frame.heat`, `beam.printable`; `--sweep` slides each guide through its travel |
| `cad list`, `cad beams` (`--jigs`), `cad order`, `cad plates`, `cad kit` | The cut list and what to buy, a sheet per beam and the jigs, the build from bars to a square frame, the printed parts on plates, and all of it in one folder (Building it, below) |
| `cad measured <project>/<assembly> frame.square.<bay>=<mm>` | A squared bay's diagonal difference, measured; the joint rig's and the beam coupon's figures the same way |

Guides (rails, V-wheels, rods, a printed slider, a lead screw) put motion on a beam: Guides, below.

An item can be a beam, a length of an aluminium extrusion, a tube or a bar from `@rulecad/frames`:

```json
{ "id": "x1", "beam": { "profile": "2020-misumi-hfs5", "length": 300 }, "from": [0, 0, 0], "to": [300, 0, 0], "roll": 0 }
```

- `"profile"` names the profile (`2020-misumi-hfs5`, `profile-4040-item-8`, or a set in this workspace's `rules/`).
  `"length"` is mm from end `a` to end `b`, a number or an expression (`"x1.length"`). Placed by its ends, the length
  may be left out: it is the distance from `from` to `to`, and a length that disagrees with them is refused with both.
  `"material"` names a material set in place of the profile's alloy. `"printed": true` makes it a printed part
  (`@rulecad/frames` printed beams): drawn solid, weighed on `cad list` by the plastic its walls and infill lay, laid
  on a plate as it prints by `cad plates`, off the cut list. `"printed": { "pose": "standing", "walls": 4, "infill":
  0.6, "end": "nut" }` says how it prints; a tapped end becomes a heat-set insert (or a captive nut). The printable
  profiles (`2020-printed` and its sizes) print lying down; another profile prints standing up, and its findings say
  so where it cannot lie down. Standing up, a metal profile's tapped end takes its screw in its bore's place (an
  insert, or with `"end": "nut"` a captive nut: MISUMI's 2020 takes an M3 nut), and a printed beam in its place is
  drawn with its ends' fixings cut in, so a screw into its end is followed into them. A foot under it names that
  thread (`"fitting": { "kind": "foot", "profile": "2020-misumi-hfs5", "thread": "M3" }`); a screw of another thread
  into a printed end fails `fasten.end` and names the thread to use. EXAMPLES chapter 17 prints a whole case so.
- Placed by its ends, end `a` is at `from` and end `b` at `to`; at roll 0 its top faces up (+z), or +y when it stands
  upright, and `"roll"` turns it about its own axis, in degrees. Or place it with `at` and `rotate` as any item, in its
  own frame: end `a` at the origin, the beam up +z, its top +y. The face names and a picture are in the
  `@rulecad/frames` README ("Face names in an assembly").
- A beam is bought: drawn faint, never on a plate, on `cad list` by profile and length (`2 × profile-2020-misumi-hfs5
  x 300 mm  a beam  150 g each`, weighed by the maker's mass per metre where the sheet gives one), and in the overlap
  check by its envelope, a plain box less any V tracks along it. `cad check` says each beam's mass beside the sheet's, and warns of a length
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
  face (`access Ø5.3 at front.1@120`), sized for the key of the join's own head (an M5 button head's 3 mm key), and
  an `end-tap` join drills a clearance hole right across `b` instead. A beam's own operation at the same place, written
  either way (`front@120` or `front.1@120`), is the same hole, not a second one.
- Its screws join `"fasten"`, so they are followed, checked and counted as any fasten's are (`1 × M5x12 button` on
  `cad list`). A blind join's button head sits inside b's slot under its lips; an end-tap's cap head sits on the lips
  of the slot across b. `fasten.seat` holds the head to the slot (wider than the opening, and inside the slot, no
  wider than the cavity and no taller than the room under the lips), `fasten.end` takes the thread tapped in a's end
  bore, and `fasten.access` follows the key through the access hole. `"screw"` names another screw (`"M5x12 button"`).
- A `mitre` join (`"b": "y1.a"`, an end) cuts both ends at the angle that halves the corner, about the face the corner
  lies in, each beam's length on the outside of the corner, worked out from where the two beams are (both placed by
  their ends). Its corner key or plate comes later.
- Printed fittings are sized from the project's plastic (`material` in project.json): `pla` and `petg` by name.
  Another plastic is read from its own rule set (`rules/abs.json`), which must give `strength`, `modulus` and
  `density`; where there is none, the build is refused by name.
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
    on both sides of a; refused where its arm has no room. Which face follows from the beams' directions; `"face"`
    names the other one of b's two faces square to a (the L turned over), so it can miss a third beam at the corner.
    `"shape"` (`"L"` or `"T"`) asks for one: an L where a T would fit (a generated gantry's top side beams, where a
    T's bar would stand in the moving beam's path), and a T is refused by name where b lacks room on one side or the
    plate is turned over.
  - A splice plate lies across two ends on a face they share.
  - `"brace": true` braces a bracket; `"load"` (N) is the design load it is sized to about twice the margin at
    (default 100); `"nut"` chooses the slot nuts' kind.
- An item may also be a printed fitting by itself: `{ "id": "br", "fitting": { "kind": "bracket", "profile":
  "2020-misumi-hfs5" }, "at": "x1.top@130", "rotate": [90, 0, 0] }`. It is a printed part, joined and cut by Manifold
  where the workspace has it; its anchors `b1`, `a1` (and `b2`, ... on a plate) lie on its screws' axes for a fasten's
  `at`. The overlap check measures its body without its tongues, which stand in the slots.
- The printed parts for panels, doors, beams' ends and services are fitting items too (@rulecad/frames' README,
  Panels and doors, Ends and feet, Services): `"kind"` is `panel-clip`, `panel-corner`, `slot-cover`, `panel-edge`, `gasket-strip`,
  `hinge`, `handle`, `latch`, `magnet-catch`, `end-cap`, `foot`, `levelling-foot`, `castor-plate`,
  `stacking-foot`, `nut-carrier` (a printed block that slides in a slot holding a hex nut or a heat-set insert: `"face"`,
  `"thread"`, `"holds"`, `"load"`; the nut it holds goes on the list) or `rail-jig` (`"rail": "rail-mgn12"`), with the model's own options (`"sheet": 3`, `"length": 200`). A hinge is two items, `"part":
  "frame"` and `"part": "door"`, and a levelling foot's pad is `"part": "pad"`. An end part goes at the end's address
  (`"at": "x1.a"`); its anchor `b1` is its screw's, and its `ops` say the tap the end needs. In a mechanism, hold it
  as anything else is held: a foot by a `fasten` of its screw into the beam (`{ "screw": "M5 cap", "through": ["foot1"],
  "into": "p1", "at": ["foot1.b1"] }`, the beam's end tapped as its `ops` say), and an end cap by a fit that fastens,
  its pegs a press fit (`"min": -5`). The overlap check measures an end cap without its pegs, which stand in the beam,
  and an in-slot panel edge or a slot cover by what stands above the face alone: the rest lies in the slot by design.
  A panel item (below) holds its sheet with clips; a panel corner or an in-slot edge is placed by hand as an item.
- A `bracket`, `gusset`, `splice`, `hidden` or `anchor` join with a bought fitting's set by name (`"fitting":
  "fitting-motedis-bracket-20-b6"`, @rulecad/frames' README, Bought fittings) adds that fitting as an item placed
  where the printed one would go: a reference drawn from its set, listed under Bought with its price. Its screws join
  `"fasten"` into the set's nuts (`2 × M4x8 cap`, `2 × slot-nut-6-motedis-m4-hammer`), so the fasten checks hold them
  as any fasten's; an inner connector's grub screws are part of it, and an anchor connector adds the hole its guide
  needs, drilled across a (on the cut list). `join.stiffness` takes the set's own figures and says what they rest on
  (an estimate in the set, until the joint rig measures it). A set made for another profile size or slot family
  fails `fitting.fit` and places nothing; a set of the wrong kind for the join is refused by name. `"fitting":
  "bought"` alone names the sets there are.
- The other kinds (`cube`, `pivot`, `printed`, and a mitre's key) are checked where they meet and carry their
  stiffness; their fittings come in later releases, and each says so (`join.fitting`).
- A frame's bought fitting is an item too: `{ "id": "cap", "bought": "fitting-motedis-end-cap-20-b6", "at": "x1.b" }`
  (an end cap, a levelling foot, a hinge). At a beam's address it caps the end for `join.end`, and `fitting.fit`
  checks it against that beam's profile: a foot whose stem is not the end bore's thread fails.
- `cad list` prints each bought line's price where its set gives one, and a cost line: the bought items' total (and
  the sets with no price), and the printed parts' plastic at the material's price a kilogram (`pla` and `petg` carry
  one). Fixings and bars are not priced. Swap `"fitting": "printed"` for a bought set and list again to compare.
- `cad check` adds `join.geometry` (the end meets the face square and flush, where `b` says, on the slot's centre line
  where the kind needs a slot: a beam 2 mm off the face fails with `a gap of 2 mm`, and one 5 mm along names the
  address it does meet at), `join.end` (every beam end is joined or capped: an item placed at the end, such as a foot,
  caps it), and `join.stiffness` (the spring each join puts at a's end when the frame is solved, from
  `@rulecad/frames`' `JOIN_STIFFNESS`: every figure an estimate until the joint rig measures it, and the finding says
  which, measured with its date or an estimate).
- `join.drop` predicts a beam held by one join and nothing else, with a `mass` load on it (on the beam or on an item
  at one of its addresses), as a cantilever from that join: its drop is the beam's own bending, F L³ / 3 E I, and the
  join turning on its spring k, F L² / k. It is a prediction `cad measured` takes as `<beam>.drop=<mm>`: the measured
  drop less the beam's own bending gives the join's spring, k = F L² / (drop less F L³ / 3 E I), written as measured
  to the rule the spring came from. That is the kind's figure in the workspace's `rules/joins.json` (part `joins`,
  made from `@rulecad/frames`' estimates the first time: `blind_bending`, `end_tap_twist` and the rest, for a 20 mm
  profile), a printed fitting's share of its own stiffness by finite elements (`bracket_printed_share`), or a bought
  fitting's `bending_stiffness`. Its sentence becomes what was measured, and the drop goes in its source. A drop no
  more than the beam bends by itself is refused, and a refusal of any value writes nothing, not even the joins set's
  first copy. The joint rig in
  `examples/bench/projects/benchmarks` (MEASURE.md, rows 34 to 37) is built for it, and also measures a slot nut's
  hold along its slot, written to the nut's own set as `hold_along`.
- `cad add join <project>/<assembly> --kind blind --a y1.a --b x1.back@120 [--screw "M5 button"] [--fitting printed]`
  adds one.

**The frame solved.** `cad check` solves an assembly that has joins (or a `"frame"`) as a frame of beam elements
(`@rulecad/fea/frame`) and reports six findings:

- `frame.solve` says what the model holds: the beams, the nodes (each beam is cut where a join, a mounted item, a
  load, a named point or a support meets it), where it is held, the poses solved, and each join's spring with what
  it rests on. A join puts the end of `a` on a node at `b`'s axis through a rigid link (the end stands half `b`'s
  width off that axis) and its spring (`join.stiffness`) at that end. It is held where `"frame": { "supports": {
  "z1.a": "pinned", "z2.a": "fixed" } }` says (an empty `"supports": {}` is refused by name: it names nowhere the
  frame is held); else at the beam ends a foot, levelling foot, castor plate or
  stacking foot (printed or bought) is fitted to; else at its lowest beam ends. Feet and lowest ends are pinned: held
  from moving and free to turn, as a foot stands on a floor. Where lowest ends pinned would leave the frame free to
  move (two posts and a rail leaning over out of their plane, a beam on the floor rolling with a post on it), a beam
  lying with both ends lowest rests on its face (held from twisting about its length) and a beam standing on its
  lowest end stands on its end face (fixed). That guess is a support nobody gave, which holds the frame where pinned
  feet would leave it free (the portal tipping over out of its plane, below), so `frame.solve` warns: it names the
  freedoms pinned feet would leave (`refs.free`) and the ends held in their place (`refs.guessed`), says that every
  sag, rack, buckling and frequency figure rests on them, and asks for feet or `"frame": { "supports" }`.
  `frame.rack`, `frame.buckling` and `frame.frequency` each say they rest on the guess (`refs.guessed`). Lowest ends
  guessed and left pinned (a frame they hold) are a guess too: `frame.solve` warns that nothing says where the frame
  stands, names the ends (`refs.guessed`) and asks for feet or supports. Beams no support holds through joins are left out by
  name, and so is what is mounted only on them, as not weighed (`refs.off`). A beam that rides a moving joint (a
  gantry's cross beam on its carriages) is a load on the frame, named as riding (`refs.riding`), not part of it;
  lying across two parallel beams at one level (a gantry's beam on its two side beams), its weight is shared between
  them by the lever rule, though its joint is on one, and `refs.riding` gives each share. Where part of the frame can
  move with nothing resisting it (a frame in one plane on pinned feet sways out of that plane; a beam pinned at both
  ends spins on its own axis) and its loads do not move it that way, it is held there for the sag and the stresses,
  and `frame.solve` says how it moves there (`refs.how`: "the frame tips over along y" where its top moves across
  and its feet stay, "x1 spins on its own axis" where a beam only turns) with the freedoms that show it
  (`refs.held`); `frame.rack` then warns that a push that way finds it
  free. The modes and buckling count it free: `frame.frequency` gives a lowest mode of 0 Hz and warns, and where
  the frame's squeezed beams lean it that way (a portal on pinned feet), `frame.buckling` fails it as tipping over
  before anything buckles, at a factor of 0 (`refs.tipped`).
  Loads that would move it that way leave the frame unsolved, with the freedoms named.
- The loads: each beam's own weight (its sheet's mass per metre), each item mounted on a beam (its mass at its
  centre, as a force and a moment at the node where its chain of mounts meets the beam; a riding beam's sheet weight
  at its middle the same way) and each `mass` in `"loads"`.
  A mass on a moving joint mounted on a beam, such as a carriage on a guide, is solved at each end of its travel
  and at its quarters between (`frame.sweep`, 4 steps), at every named pose and as drawn; the worst is named. A
  carriage's worst place for the sag at a point off a span's middle lies between the point and the middle, which
  the ends alone miss. Two or more such joints are also swept together (`frame.together`, 32 poses at most):
  every combination of their places where that fits, else of their ends and middles, else all at one share of
  their travel at once, so a carriage at the middle of a beam that itself stands at the middle of its travel is
  found. `frame.solve` says which way they were combined (`refs.together`).
  Each `"loads"` entry on a joint (a force on a slide, a torque on a hinge) and a belt guide's push at its
  carriage's acceleration is carried through the joint, held by its motor, into the beam the joint's chain is
  mounted on: a slide's force along its axis through the joint's place, as a force and its moment at that node, a
  hinge's torque as a moment. Nothing says which way such a load acts, so each pose is solved with them one way and
  then the other (`as drawn, joint loads +`, `... joint loads -`), and `frame.solve` names them (`refs.onJoints`).
  A belt's share of its carriage's own weight along the travel is that weight, already on the frame, and is not
  counted again.
  A motor that drives a joint mounted on the frame, the motor itself mounted on a still beam, adds two more:
  - Stalled against a hard stop at each end of the travel, it pushes (or turns) with its holding torque through
    its gearing: a lead screw's 2 pi T efficiency over its lead, a belt's 2 T over its pulley's pitch diameter. The
    stop at the joint's place and the motor's mount take that push equal and opposite, along the joint's line, so
    only the frame between them is loaded (cases `<joint> at <end>, <motor> stalled against its stop`,
    `refs.stalls`). A NEMA 17's 0.59 N m through an 8 mm lead screw at 57% pushes 266 N.
  - Turning a hinge, the torque it turns the arm with (its most at its working speed, through its gearing) is held
    at its own mount, one way and then the other, as a joint load there.
  A motor that rides on what it drives, or is on no beam, is named as not weighed on the frame.
- `frame.deflection`: the sag at each load's point, at each place in `"frame": { "points": ["x2.top@50%"] }` and
  along every guide's travel, with the joins' springs and with the joins rigid, and the load's own share. The first
  rests on the joins' springs, estimates until the joint rig measures them, and the finding says so (`refs.restsOn`:
  `estimate` while any join's spring is one, even where the springs change no figure; `measured` when every join's
  is; `beams` with no joins); the rigid figure is the least the sag can be. The limit is a rail's own parallelism
  under a guide, else `"frame": { "limit": 0.2 }`, else the task's accuracy, else the beam's span over 360. Over it fails.
  A sag is given in mm to three places, or to three figures under 0.1 mm (0.00123 mm, 0.000352 mm).
- `frame.stress`: the largest stress in each beam (axial and bending, from the section moduli) against its alloy's
  strength, and the bending moment at each join against what its printed fitting takes (its design load at its
  screw's distance from the corner, times its margin by finite elements). Under 2 times warns, under 1 fails. A join
  with no strength in the kit (blind, end-tap, a bought fitting) has its largest moment said.
- `frame.buckling`: each beam in compression against Euler's load with both ends pinned, and the whole frame's first
  buckling factor with the joins' springs (each beam cut in four). The first rests on the beam's ends being held from
  moving sideways (a braced bay, fixed feet); a post of a frame free to sway on pinned feet buckles sooner, and the
  second, the whole frame's factor, is the figure that takes that in (`frame.euler`).
- `frame.rack`: each way across the frame (named by the world axis it is nearest), a side push at its top, shared
  among the top corners of its bays, and the sway it causes, with the joins' springs and rigid, as a stiffness in
  N/mm. The push is `"frame": { "rack": { "load": 100 } }` in N, else 20 N (`frame.push`, an estimate: a hand
  steadying it). The limit is `"rack": { "limit" }` in mm, else the task's accuracy, else the height over 400. Then
  each change is solved, in the best open bay that way alone and in every open bay that way: gussets at the bay's
  corners (the gusset join's bending added to each corner join's spring in the bay's plane), one diagonal brace (a
  bar of the bay's lightest beam's section, pinned at both corners), and a 3 mm acrylic panel. Each gives its
  stiffness and how many times the open frame's it is. Over the limit it warns, naming the cheapest change that
  brings it under, in the order gussets, brace, panel, one bay before every bay (`frame.order`), and names it in
  `refs.advise` (null where the frame stands within its limit). Where bracing every
  bay that way makes it ten times stiffer or more, the text calls the open stiffness low: the open bays hold the
  push by their joins' bending alone. A bay is four beams round a rectangle in one plane, each neighbouring pair
  joined to each other or both joined to one beam at one place (the top of a corner-post box, whose rails join the
  posts); its corners are the nodes where their axes cross.
- A panel (not a door) on a bay of the frame is a shear web in the model: one diagonal bar across the bay, free to bend
  at both corners (a ball at one, pinned at the other, so it carries no twist and nothing in it spins free when the
  modes split it into pieces), as stiff along it as the sheet in shear in series with its clips' grip. The clips' grip
  (`frame.clip`, 200 N/mm a clip) is an estimate, and `frame.solve` says so; the panel's weight goes to its bay's
  four corners. A panel whose beams make no bay is no web, and its weight is spread along those of its beams in the
  frame, an equal share on each (`refs.laid`).
- `frame.frequency`: the lowest three modes in each pose, the worst named, with each beam's own mass and every
  carried item's and load's mass at the node it is carried at (its rotary inertia about that node is left out), with
  the joins' springs and rigid. Against what the machine excites: each stepper's full-step rate at its working speed
  (a mode within 20% of it, `frame.band`, rings while the motor runs at that speed: a warning), and the task's moves
  (a move ramping to the task's speed at its accel, else 500 mm/s², shakes the frame at about one over the ramp's
  time; the lowest mode under twice that warns, under it fails). A warning says how many times the stiffness would
  lift the mode clear, or as many times less mass. With no stepper and no task it is information. This is
  `assembly.frequency`'s question asked of the frame: that finding estimates a machine's arm from its tool's
  stiffness, this one solves the frame it stands on.
- A printed beam in the frame (`"printed"` on its beam item, in the plastic its `"material"` names) is solved with the
  figures printing gives it, and its stress is held to its plastic's strength for its pose: along its layers lying
  down, across them standing up (PETG HF: 34 and 23 MPa). `beam.creep` holds its stress, which a frame carries for
  months, to 0.15 of that strength (`PRINTED_DEFAULTS.creep` of `@rulecad/frames`, an estimate).
- `beam.printable`, given `"frame": { "printed": "petg" }` (or `{ "material", "walls", "infill", "pose" }`): each beam
  is tried printed in that plastic, as the kit's printable profile of its size (`profile-2020-printed` for a 20 mm
  square beam; another section stays as it is, by name), lying down (spliced where it is longer than the bed, its
  strength then half the whole beam's, `PRINTED_DEFAULTS.splice_share`) and standing up where it fits the printer's
  height. The frame is solved again with that beam printed and every other as it is, and the beam is held to six
  margins, each 1 where it just holds: every sag the frame checks (each load's point, each named point, each guide)
  and the beam along its length, against the same limits as `frame.deflection`; its stress against its strength with
  twice the margin; Euler's load with twice the margin; its stress against the creep limit; every sag again with the
  beam's modulus at half (`PRINTED_DEFAULTS.creep_modulus`, an estimate), its sag as it creeps; and where the task's
  moves shake the frame, its lowest mode at twice their rate. The least is the beam's margin. Where the frame as drawn
  already misses a sag (`frame.deflection` fails there in the beams' own material), that is no fault of printing: there
  the printed beam is held to the drawn frame's own sag and 2% more, so it misses only where printing it makes that
  sag worse, and the frame's finding names each such point (`refs.missed`). A beam that holds says
  so (pass), with its pose and grams; one that does not says it needs its own material and the margin it misses by,
  `1 / margin`, and on what (info: a design choice, not a fault). It also names the joins that would need changing: a
  blind, end-tap or anchor join screws into the beam's end, where a printed beam has an insert, and a join on a face
  other than the top lands where a printed beam is closed; a bracket or a gusset on its top slot takes either. Then
  the beams that hold alone are printed together and solved once more, any that miss together put back the worst
  first, and one finding lists those that can be printed (`refs.printable`) and those that stay (`refs.metal`). Every
  figure rests on the printed section's walls and infill, its plastic's figures and the creep shares (estimates until
  the beam coupon is measured) and on the joins' springs as they are, which were made for metal beams; the findings
  say so (`refs.restsOn: 'estimate'`). A 250 mm 2020 case of twelve beams with 2 kg on a top beam can be printed in
  PETG whole (its least margin 1.35, its top beam's sag as it creeps); a 400 mm 2020 gantry beam fixed at both ends
  with 2 kg at its middle and 0.1 mm allowed misses by 9.8 times ("beam.printable: every beam of a case-sized frame").
- `beam.coupon`: a printed beam held only by two of `"frame": { "supports" }` (no join on it) with a mass on it is the
  beam coupon. Its sag under each mass, F L³ / 48 E I between two bars, and the mass it breaks at (where its stress
  reaches its strength) are predictions `cad measured` takes as `<beam>.sag=<mm>` and `<beam>.break=<kg>`. The sag
  gives the modulus a printed beam bends at (the solve is linear in it: the modulus taken times the sag predicted
  over the sag measured), the break its strength (its own weight's stress plus the stress a kilogram causes times the
  mass), each written as measured to the workspace's copy of the plastic's set: `beam_modulus` and `beam_strength`
  for one printed lying down, `beam_modulus_z` and `beam_strength_z` standing up. A printed beam then takes them
  before the plastic's own figures, and its creep limit follows the strength. `"resting"` in `frame.supports` holds a
  beam from moving and from twisting about its own length, free to bend, as a beam lying across a round bar is. The
  bench's `beam-test` assembly (MEASURE.md, rows 38 and 39) is the coupon.
- `cad beams` also writes `exports/<project>/<assembly>.frame-sag.svg`, the check view: the frame as drawn in grey
  and the shape it takes in red, from the front and from the side, scaled and saying by how much; and
  `<assembly>.frame-mode.svg`, the lowest mode animated, the frame swinging through the mode's shape and back, its
  largest movement drawn as a tenth of the frame's size, in the two views that hold that movement (it starts at one
  extreme, so a viewer that shows no animation shows the mode at its largest). Both are pictures of the solve, never part of the model.

| Figure | Formula | Source |
|---|---|---|
| Sag limit with nothing tighter | span / 360 | International Building Code, Table 1604.3, floor members under live load (as reproduced in 780 CMR 1604.3) |
| Beam stress | \|N\| / A + \|My\| / Wy + \|Mz\| / Wz | Beam theory; the section moduli from the profile's rule set |
| A beam in compression | P = π² E I / L² (both ends pinned) | Euler's column; Roark's Formulas for Stress and Strain, 7th ed., table 15.1, case 1a |
| A printed fitting's moment | design load × its distance from the corner × its margin | The fitting's own finite-element margin at its design load, scaled linearly |
| The solve | Timoshenko beam elements, end springs condensed out | `@rulecad/fea/frame` (its README lists its sources) |
| Sway limit with nothing tighter | height / 400 | ASCE/SEI 7-22, Commentary to Appendix C, CC.2.2: drift limits in common use are 1/600 to 1/400 of the height |
| Racking stiffness | push / mean sway of the top corners | Definition; each change solved in the model, not estimated |
| A panel's bar along its diagonal d (bay a by h, sheet t) | G t d² / (a h), in series with d² n k_c / (4 (a + h)²) for n clips of k_c each | Shear of a plate, γ = τ / G; the clips by their strain energy under a shear flow F / a round the edges |
| A sheet's G | E / 2(1 + ν): acrylic 3300 MPa, ν 0.37 | Evonik PLEXIGLAS GS technical information (polycarbonate and aluminium: typical figures, marked community) |
| A move's frequency | 1 / t, t = speed / accel | A working figure (`frame.ramp`); the lowest mode wanted at twice it |
| A stepper's full-step rate | rpm / 60 × 360 / step angle | The motor's step angle and its working speed (`workingSpeed`) |
| A beam fixed at both ends, mass M at its middle (the check of the modal solve) | f = (1/2π) √(192 E I / (L³ (M + 0.375 m))) | Blevins, Formulas for Natural Frequency and Mode Shape (1979), table 8-8 |
| A beam fixed at both ends, load P at its middle (the check of a guide's sag in the error budget) | P L³ / (192 E I) | Roark's Formulas for Stress and Strain, table 8.1, case 1d |
| A bay's diagonal difference to accept (frame.square) | Σ t × span / d over the beams that set the opening, plus Σ s × span / d over its joins; root-sum-square beside it | The derivative of d = √(w² + h²) with a side, ∂d/∂w = w / d; stacked as an arm's error budget stacks its joints |
| A join's play s (frame.square) | 0.1 to 0.3 mm by kind; end-tap 0.25 mm | `JOIN_PLAY` in `@rulecad/frames`, estimates; end-tap is half ISO 273's medium clearance for M5 (5.5 mm) |
| A beam's twist at the tool | twist per metre × length × π / 180 × the tool's distance from the beam's axis | The profile's `twist_per_metre` (MISUMI's JIS special grade figure for its 2020 HFS5) |
| A frame's growth (frame.heat) | α L ΔT, α = 23.4e-6 /K | 6063 aluminium (Wikipedia's table; suppliers' 6063-T5 sheets 23.4 to 23.5 µm/m °C), a community figure where the alloy's set gives none |
| A printed beam's creep limit | 0.15 × its strength for its pose | Waseem et al. (2020), Polymers 12, 2962: printed PLA held at 0.3 of its strength broke in 1.2 to 2.3 hours; half that share an estimate |
| A printed beam's sag as it creeps | the frame solved with its modulus × 0.5 | An estimate (`PRINTED_DEFAULTS.creep_modulus`), until a sustained load on the beam coupon measures it |
| The beam coupon's sag, between two bars L apart | F L³ / (48 E I) | Roark's Formulas for Stress and Strain, table 8.1, case 1e (simply supported, load at the middle) |
| The beam coupon's modulus and strength | E × sag predicted / sag measured; stress of its own weight + stress per kg × kg at break | The solve is linear in E and in the load |
| A printed fitting's softening | the plastic's heat deflection temperature, ISO 75 at 0.45 MPa, warned within 10 °C | The plastic's set (`pla.softening` 57 °C, `petg.softening` 69 °C, Bambu's data sheets); the 10 °C an estimate |

A worked check: a 2020 shelf frame, legs 400 mm, a 600 mm front beam joined blind to the legs 390 mm up, 5 kg at its
middle, sags 0.215 mm by hand with the joins rigid (a beam whose ends turn with the corners the legs and the side
beams' twist hold) and 0.310 mm with the blind joins' estimated 1.5 N·m/mrad springs; the solve gives the same to three
figures (`packages/cad/test/frame-checks.test.mjs`, "frame checks: a shelf frame").

Two more: a 2020 gantry beam, 600 mm, fixed at both ends, with 2.01 kg carried at its middle, rings first at 74.2 Hz;
the formula above gives 74.2 Hz (192 E I / L³ = 461.5 N/mm, M + 0.375 m = 2.1225 kg). An open 2020 cube, 420 mm
square and 400 mm tall, two rings of four beams joined blind to its legs, racks at about 63 N/mm under a push at its
top; one diagonal brace makes it about 2.6 times stiffer (the bay across from it still racks, and the rings twist),
a brace in both bays that way about 240 times ("frame checks: an open cube racks").

**Fastening into a slot.** A `fasten` whose `into` is a slot on a beam ends in a slot nut under the slot's lips:

```json
"fasten": [{ "screw": "M4 button", "through": ["plate"], "into": "x1.top", "holes": "plate.body", "nut": "drop-in" }]
```

- `into` is a face with a slot (`x1.top`), one slot of a face with several (`x1.top.2`), or a place on it
  (`x1.top@120`, which places the fasten's screws as a group: the middle of their spread along the slot is held to it,
  within the play their holes give, so two screws at 110 and 130 mm pass `x1.top@120`). The nut is the one made for that slot's nut family and the thread
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
- `frame.nut`: a slide-in or square nut goes in only from an open end of its slot (every fasten's, a guide's too, in
  every pose). A slot is closed by a join that
  butts on its end, and the stretch a nut is in by a blind join's head in that slot too. Every closure on a way counts,
  not only the nearest: a head between the nuts and an end closed further along closes that way as much as the end,
  and the finding names each, with an item placed at that end (`foot1 off until then`). Where joins close both ways,
  the check fails and names the nut of that thread that goes in through the opening (`give "nut": "drop-in"`).
- `frame.preload`: nuts with a way in that a join closes and no way that stays open (the other end capped by an item
  placed there, such as a foot) go in before that join is made. The finding names the beam, the slot, the end, the
  nuts and the join, and `cad order` and the build page list them as the step before the one that makes it
  (`5. Load 2 × slot-nut-6-misumi-m4-slide-in into y1's top slot through its end a, for plate2, before the blind join
  of y1.a to p1.top@170 closes it`).
- `frame.square`: each bay of the frame (four beams joined in a rectangle in one plane), with its two diagonals,
  inside corner to inside corner, and the difference between them to accept, stacked from its parts as an arm's
  error budget stacks its joints (`squareness` in `@rulecad/frames`). Each beam of the bay whose end butts another
  beam of the bay sets the opening along it by its cut length: cut t long or short, it moves one diagonal against the
  other by t × span / d (span the opening along that beam, d the diagonal). Each join of the bay's beams lets the end
  of `a` sit off by its play s along `b` (`JOIN_PLAY`, an estimate for every kind): s × span / d, span the opening
  along `b`. The difference to accept is their sum, the worst case, with their root-sum-square beside it, and the
  finding lists each term. The cut tolerance is the assembly's `"frame": { "cut": { "tolerance": 1 } }` where given
  (this workshop's saw, also taken by the cut list), else the profile's `cut_tolerance`, else 0.5 mm. A 260 × 200 mm
  opening of MISUMI 2020 (d = 328.02 mm) with its two rails butting the posts and four blind joins: 2 × 0.5 × 260 / d
  + 4 × 0.1 × 200 / d = 1.04 mm, 0.57 mm root-sum-square; at ±1 mm it widens by 2 × 0.5 × 260 / d = 0.79 mm, to 1.83.
  Each bay is a prediction: once squared and tightened, measure both diagonals and give their difference to
  `cad measured <project>/<assembly> frame.square.<beams>=<mm>` (the name is in the finding, `frame.square.p1-p2-x1-x3`).
  The ledger keeps it against the prediction, and the finding then says the difference measured: within what the
  cuts and joins allow passes, more warns that the bay leans. The build page's bays carry the same figures.
- `frame.heat`, where the assembly gives `"frame": { "heat": { "air": 45, "built": 20, "heaters": [{ "name": "bed",
  "at": [150, 150, 60], "temperature": 60, "reach": 40 }] } }`: the frame grows from the air it was built in (`built`,
  20 °C where left out) to the air it runs in by its alloy's expansion, ΔL = α L ΔT, for the longest beam and for the
  span of its beams each way (α from the alloy's set where it gives `expansion`, else 23.4e-6 /K for 6063, a community
  figure). A frame of one alloy grows alike every way, so it stays square. Each printed fitting is held to its plastic's
  `softening` (the heat deflection temperature its set gives, ISO 75 at 0.45 MPa) at the air's temperature, or a
  heater's where its drawn parts come within the heater's `reach` of its middle: over it fails, within 10 °C of it
  warns (`FRAME_HEAT.margin`, an estimate), and the rest pass in one finding naming the nearest. Bad input is refused by
  name (`frame.heat.heaters 1: reach is how far ...`).
- A blind or end-tap join's head on a slot's lips: `fasten.seat` gives what the lips take, the head's circle less the
  strip of the opening across it (A = π D² / 4 - 2 (c √(R² - c²) + R² asin(c / R)), R half the head, c half the opening), at the beam alloy's strength, and the torque for that force (T = K d F, the nut
  factor an estimate), or the screw tightened fully where that is less. An M5 button head on a MISUMI 6 mm slot:
  17.9 mm² of al6n01-t5 at 205 MPa takes 3677 N, 3.68 N m. The lips' bending is not counted: an estimate, until the
  joint rig (issue 264) measures one.

### A frame from a size

A frame can be asked for by what it must hold, at the top of an assembly, in place of its beams:

```json
"frame": { "kind": "box", "inside": [300, 300, 350], "profile": "2020-misumi-hfs5", "join": "blind", "feet": "levelling" }
```

Before anything else is worked out, it expands into beam items placed by their ends, joins between them, a fitting
on every end no join covers, and any panels and braces asked for: everything after (the joins' operations and
screws, the cut list, the frame checks, the build page) sees a hand-drawn frame. `cad check` says what it made
(`frame.generated`: the kind, the inside and outside, the beams by length, the joins and the ends).

- `"kind"`: `box` (four upright beams `z1` to `z4` and a ring of four at the bottom and at the top), `portal` (two
  legs and a beam across their tops, in the x-z plane; it lies in one plane, so on its feet alone it tips over out of
  it, and it is refused by name until `"supports"` says its feet are held down, as
  `"supports": { "z1.a": "fixed", "z2.a": "fixed" }` for a portal bolted to a bench or a wall), `table` (four legs and a ring at the top), `gantry` (a box
  without its two top beams across, and a beam `g` lying across the two top side beams, sliding along them on the
  joint `gantry`, with the poses `gantry-front` and `gantry-back`) or `shelf` (a box with `"shelves"` rings between,
  default 1, spacing its height into equal clear bays). Beams across x are `x1`, `x2` .., along y `y1` .., by ring
  from the bottom. The frame's outside starts at the origin.
- `"inside"` is the clear volume it encloses, `[width, depth, height]` in mm; `"outside"` is the volume it must fit
  in. Give one. A portal takes `[width, height]`. A table's height is the clear height under its ring, a gantry's
  under its side beams.
- `"profile"`: one square profile for every beam (2020, 3030, 4040 ..). A profile of two cells (2040) is refused:
  its beams would face differently by how they lie.
- `"join"` sets the corners, as a kind or `{ "kind", "fitting", "screw", "nut" }`. With a join against a face (`blind`,
  `end-tap`, `bracket`, `gusset`, `hidden`, `anchor`) the upright beams run through, top to bottom, and every other
  beam butts against their faces, so it is shorter than the outside span it closes by the profile's width at each
  end. With `cube` every beam butts into a corner node and is as long as the inside it bounds. A box round 300 x 300
  x 350 in 2020 has uprights of 390 mm and eight beams of 300 mm (with no feet: printed feet raise the bottom ring,
  below); in 3030, uprights of 410 mm and the same 300 mm.
  Where an end has several bores, a blind or end-tap join screws into the threaded one in the middle. A printed
  fitting (`"fitting": "printed"` on `bracket` or `gusset`) sits on nuts that go in through the slot's opening: every
  butting beam is shut at both ends by its joins, so a nut that slides in from an end could not reach its place. It
  takes the first of `drop-in`, `roll-in`, `hammer` and `t-bolt` the kit has for the profile's slot (drop-in on
  MISUMI's 2020, roll-in on item's 4040); `"nut"` names one of them, and `slide-in` is refused. A printed gusset lies
  on the face of its upright that looks out of the frame (its join's `"face"`), so it never lands where the corner's
  third beam butts. With no fitting named, each join warns `join.fitting` until one is chosen, as a hand-drawn join
  does.
- A gantry's outside height is its inside plus three widths: the two rings and `g`, which lies on the top side beams
  between the uprights' tops, its top level with theirs.
- `"feet"`: `foot`, `levelling`, `castor` or `stacking` (printed) or a bought foot's set by name, under the upright
  beams' lower ends. A printed foot, levelling foot or stacking foot is screwed into its upright's end: the end is
  tapped as the foot's model says (an M5 tap 18.5 mm deep in 2020) and a `fasten` holds it (an M5x16 cap screw), so
  the tap is on the sheet, the screw on the list and its step in the build. Where the join drills the uprights
  (`blind`, `end-tap`, `hidden`, `anchor`: an access or clearance hole at the bottom ring's centre line), the bottom
  ring rises up the uprights by the tap's depth, so those holes stand clear of the tapped end: the box above has
  uprights of 350 + 2 x 20 + 18.5 = 408.5 mm, its inside still 300 x 300 x 350. A levelling foot's pad is printed
  beside its body (`cad plates`, `cad list`) and screwed in by hand. `"caps"`: the other open ends take printed end caps (`true`, the default), a bought end cap's
  set by name, or nothing (`false`, and `join.end` names them).
- `"braces"`: the upright sides (`front`, `back`, `left`, `right`) whose corners are stiffened against racking: each
  join in that side takes a printed corner bracket on drop-in nuts. `"panels"`: `{ "sheet", "thickness", "sides" }`,
  one sheet over each side named (every side with a bay by default), on drop-in nuts.
- Refused by name, before anything is built: no size or both, a size that leaves no room for the beams, a profile
  that is not square, a join no generator arranges (mitre, splice, pivot, a printed node), a blind join on a profile
  with no bore in its ends, a blind or end-tap screw that does not pass between the slot's lips (M12 in the 10 mm
  slots of MISUMI's and Bosch's 4040), an end-tap join whose clearance hole across the post is wider than the slot's
  opening (below), or a blind join's head that does not fit under them (Bosch's 2020: an M6 button
  head 3.3 mm high under 3 mm lips), a printed fitting or a brace on a slot the kit has no nut for that goes in
  through its opening (item's 3030, MISUMI's and Bosch's 4040), feet with cube corners on a box, a side with no bay,
  and an item of the assembly's own with a name the frame gives.
- `"frame"`'s other keys (`supports`, `limit`, `rack` ..) still say how it is solved.

`cad frame <project>/<assembly>` prints what it expands into; `--expand` writes the expansion into the assembly (its
`"frame"` keeps only how it is solved), to edit by hand from there; `--json` gives either as data. `@rulecad/frames`
has the generators on their own: `box`, `portal`, `table`, `gantry`, `shelf` and `frameModel(kind, o)`.

What a generated box checks to, joined three ways in MISUMI's, Bosch's and item's 2020, 3030 and 4040 (each taken
or refused as above): `blind` checks clean wherever it is taken. `end-tap` takes each ring's beams along y one width
above its beams across x, so no two screws cross inside an upright. Its screw passes a clearance hole drilled across
the upright (ISO 273's medium series for the end thread), through the slot on both sides, and where that hole is wider
than the slot's opening it would break the lips (`beam.op` warns twice a join). So the generator takes end-tap only
where the hole fits: MISUMI's 2020 (M5, 5.5 mm in a 6 mm opening) and OpenBuilds' 2020 (5.5 mm in 6.25 mm), both
clean. It refuses it by name, with both figures and what to use instead, in item's 2020 (5.5 in 5), Bosch's 2020 (M6,
6.6 in 6), item's 3030 (6.6 in 6.2), MISUMI's and Bosch's 3030 and item's 4040 (M8, 9 in 8), and MISUMI's and
Bosch's 4040 (M12, 13.5 in 10); no smaller thread cuts in those end bores. `bracket` with a printed fitting checks clean or warns only `frame.rack`, the frame's sway.
Bosch's 2020 and 4040 L sections also warn `beam.mass`: their drawn outlines leave out hollows the sheet's mass counts, and the frame
is weighed by the sheet's figure.

### The lightest profiles

`"frame": { "size": { ... } }` chooses, for each group of beams that must match, the lightest profile from a list
that meets the frame's own limits, by `@rulecad/fea/frame`'s `sizing` on the frame the checks solve (every pose, the
joins' springs, the loads and mounted items):

```json
"frame": { "kind": "table", "inside": [800, 500, 700], "profile": "2020-misumi-hfs5", "join": "blind",
  "size": { "profiles": ["1010-makerbeam", "1515-openbeam", "2020-misumi-hfs5", "2040-misumi-hfs5", "3030-misumi-hfs6", "4040-misumi-hfs8"] } },
"loads": [{ "mass": 30, "at": "x1.top@50%" }, { "mass": 30, "at": "x2.top@50%" }, { "mass": 10, "at": "y1.top@50%" }, { "mass": 10, "at": "y2.top@50%" }]
```

- `"profiles"`: the sets to choose from (default `FRAME_SIZING.profiles`: MISUMI's HFS5, HFS6 and HFS8 series from
  2020 to 4080). A profile that is not square is tried lying as drawn and turned a quarter about its length ("2040
  turned": standing on edge). The workspace's own sets are read before the kit's.
- `"groups"`: `{ "rails": ["x1", "x2", "y1", "y2"] }`, beams that take one profile together. The rest group by
  themselves: beams of one profile lying the same way whose lengths agree within 0.5 mm (`FRAME_SIZING.match`), so a
  table's four legs are one group and each pair of rails another.
- Joins that fit: a design is only solved where every join of a grouped beam still goes together with the profiles
  chosen. A blind join needs a bore in a's end and a slot in b's face whose opening passes the bore's screw and holds
  its button head under the lips, the head no wider than the slot is under them; an end-tap join a bore in a's end,
  and a cap head wider than the opening of a slot on b's far face; a bought fitting must fit both profiles (its set's
  `fitting.fit`). A printed fitting is drawn for the profiles it joins. A group whose next lighter profile breaks a
  join says so as what set it ("set by a join": with 1515-openbeam, an M5 screw from a 2040's bore does not pass
  OpenBeam's 3.2 mm slot opening).
- Racking: where the assembly gives `"frame": { "rack" }` or `"limits": { "rack": mm }`, each way across the side
  push `frame.rack` uses, alone and with no weight, is a case of its own, and the sway at each top node is held to
  the limit `frame.rack` uses (or `limits.rack`). A way nothing holds the frame (one plane on pinned feet) is said and
  left out: a brace or fixed feet hold it, not a profile. The joins' springs are as drawn and do not grow with the
  profile, so a frame that racks on its joins' bending may meet the limit with no profile in the list: the sizing then
  gives the nearest and says racking is what it misses.
- `"limits"`: in place of the checks' own. Left out, each is the check's: the sag at each load, named point and guide
  as `frame.deflection` holds it (a guide's rail parallelism, `frame.limit`, the task's accuracy, else the span over
  360; a load that moves with a joint anywhere along its beam), each beam's stress with the joins' springs and with
  them rigid against its alloy's strength `frame.margin` (2) times over, the frame's first buckling factor and each
  grouped beam's Euler load (K 1) the same, and the lowest mode at twice the task's moves where it has a task.
  `"deflection"` (mm, at every load, point and guide), `"stress"` and `"buckling"` (margins), `"frequency"` (Hz) and
  `"rack"` (the sway allowed at the top, mm) replace them.
- `"by"`: `mass`. No profile set in the kit gives a price per metre yet, so `cost` is refused by name.

`cad check` gives `frame.size`: each group's profile, its mass, the limit that set it and how many times inside that
limit it stands. `cad frame <project>/<assembly> --size` prints the table:

```
sized: 3.348 kg of grouped beams (drawn 2.74 kg), 14 designs solved (every design ranked by mass)
group | profile | kg | set by | margin
z1, z2, z3, z4 | 2020-misumi-hfs5 | 1.44 | a join: with 1515-openbeam, blind join of x1.a to z1.back@710 does not go together (an M5 screw (2040-misumi-hfs5's bore) does not pass 1515-openbeam's 3.2 mm slot opening) | 7.29x
x1, x2 | 2040-misumi-hfs5 turned (drawn 2020-misumi-hfs5) | 1.408 | deflection: with 2020-misumi-hfs5, the sag at x1@400 breaks its limit 1.96 times over | 2.56x
y1, y2 | 2020-misumi-hfs5 | 0.5 | a join: with 1515-openbeam, blind join of y1.a to z1.top@710 does not go together (an M3 button head, 5.7 mm across, pulls through 2020-misumi-hfs5's 6 mm slot opening) | 3.33x
```

"Set by" is the limit the group's next lighter profile breaks, the other groups as chosen: what stops it being any
lighter, or the join it would not make. A group already at the lightest in the list says so. With `"limits": {
"deflection": 6 }` the long rails drop to 2020 and the grouped beams to 2.74 kg. Without the joins held to fit, the
legs and short rails came out 1515 OpenBeam, whose M3 ends and 3.2 mm slots take neither the 2040 rails' M5 screws
nor a 2020 leg's slot.

`--write` writes the profiles into the assembly: each grouped beam's profile, a quarter `roll` where it was turned,
and its printed end fittings drawn for it. A generated frame is written out expanded, as `--expand` does, since a
generator takes one profile; its rings keep their outer faces (a table's top stays level with its legs' tops). A
beam's end that butts against a face moves with that face as the other beam changes size, and a blind or end-tap
join at an end that now has two bores (a 2040) becomes a join a bore. A drawn beam whose new depth would stand past
the end of the beam it meets (a rail flush with its legs' tops, now a 2060) moves along that beam by as much, so its
face there stays where it was, if the move fits at its other end too; where it does not, nothing is written and the
refusal names the join and the beam. Otherwise beams keep their lines. Check the
written frame: its join checks hold every screw, nut and length, where the sizing held each join's screw and head to
its slot.

What it rests on: the joins' springs are as drawn (an estimate until the joint rig measures them) and do not change
with the profile; the sizing solves the drawn layout, with each beam's line where it is drawn, so a figure on the
written frame differs a little (the table in HFS5, its 2040 rails lowered 10 mm to keep its top level, sags 0.87 mm
at a long rail's middle as sized and 0.83 mm as written). With 512 designs or fewer every one is ranked by mass and the first that meets the limits is the
lightest; with more, the search goes by steps and lands near the lightest. Racking (`frame.rack`) is not a sizing
limit: it is a bay's to brace, not a beam's to thicken.

| What | Formula | Source |
|---|---|---|
| A design's mass | the sum over grouped beams of length × the profile's mass per metre | The profile's set (the maker's sheet) |
| Sag limit (default) | span / 360 | `FRAME_CHECK.sag`: IBC Table 1604.3 |
| Stress | `margin × (abs(N)/A + abs(My)/Wy + abs(Mz)/Wz) ≤ strength`, worst of springs and rigid | `@rulecad/fea/frame`; Roark's, chapter 8 |
| Euler load of a grouped beam | `π² E I / (K L)² ≥ margin × N`, I the lesser second moment, K 1 | Roark's, table 15.1, case 1a |
| Frequency floor (with a task) | `2 × speed / accel` Hz | `frame.frequency`: a move ramping in t seconds shakes the frame at about 1/t |
| What set a group | the limit with the largest use, over 1, when the group takes its next lighter profile | This package |

### Building it

Once an assembly is checked, these say how to make it. They all read the assembly itself, so they can't disagree with it.

- `cad order <project>/<assembly>`: the order it goes together in, each step with the part and what fastens it. A `fasten` names its screws on the step where its parts are both there, with the key that turns them and how tight: its `torque`, or the most the seat under the head takes (`2. bracket goes on: bracket fastened to base (2 × M3x10 cap) with a 2.5 mm hex key, to 0.33 N m at most (what the seat takes)`); `--json` gives each as `{ fit, fastener, count, key, tighten: { torque, given } }`, and the build page shows the same. What is not a screw (pins, a clip) is named on a fit that fastens: `"fastener": "push pin", "count": 2` puts it on the shopping list and the step. `--preview` writes a picture of each step to `.preview/`: what's there, and the new part held off along the way it goes on. The order is found by taking the assembly apart, so a part goes in after what it's fastened into, a bearing before its shaft, and a nut trapped by a wall before the neighbour that traps it. A part goes on along a straight line that clears everything already there; which line comes from the part as drawn.
- `cad order` on a **frame** (an assembly with `joins`) gives its build from bars to a square frame, in numbered steps:
  1. **Cut** the beams: each mark's count and length, the bars to buy and the cuts on each (the cut list).
  2. **Drill and tap** each mark as its cut-and-drill sheet shows (each mark's work and its sheet's file).
  3. **Sides built flat**: each bay that shares no beam with a side already chosen is built on the bench, beam by beam,
     each beam's joins with their screws, key and torque, left snug (`Snug for now: tightened to its torque at step 8,
     once square`), then squared by its diagonals and its joins tightened. Of
     two bays that share a post, the first found is a side and the other is squared once the frame is joined.
  4. **Nuts to load, heads slid in**: every blind join's head and every slot nut needs a way into its slot at the
     step that puts it there: an end of the slot that nothing has closed yet (a join on that end, or an item placed
     there) and nothing already in the slot between it and that end (a head, a nut). A beam going on slides along the
     slots its heads go into, all one way, from whichever end leaves each head its way. A slide-in nut that a join
     would close in is loaded on a step of its own just before the first join made of those on its way
     (`frame.preload`), where that leaves every head its way; else at the first later step where it has a way
     (`7. Load 2 × slot-nut-6-misumi-m4-slide-in into p1's back slot through its end b, for bracket, before cap1 goes
     on`), else earlier. A head with no way as its beam goes on (its slot closed at both ends by then, or running
     across the way the beam goes on) is slid into its slot on its own beforehand, and its join made with it in place
     (`Slide an M5x12 button screw into x3's back slot head first, through its end a, to 130 mm, for the blind join of
     m.a to x3.back@130, ...`). Where no step gives one a way, the build is refused with the slot and what is in the
     way.
  5. **Joins**: the beams in no side go on one at a time in the assembly's order, each joined to what is there. A
     side goes on as one only where it can: the heads of its blind joins to the frame slide along slots that all run
     one way, each with a way in from the end that leads. Where it can't, its beams go on one at a time on the frame
     instead, and the build says why (`The bay of p3, p4, x2 and x4 is built on the frame, not flat: the heads of its
     joins to the frame go into slots that run different ways (...)`).
  6. **Square the frame**: the diagonals of each bay no side squared, then the joins tightened.
  7. **Mount** the rest in the assembly's order, with their fastenings; copies of one thing in a row are one step. A
     part that a beam would stand over the screws of goes on before that beam, once the beams it fastens to are
     there, even in the middle of a side's build.

  Every screw is reached in this order: what stands over a screw (`fasten.access`, or a fit's `access`) goes on
  after the step that drives it. Where a side built flat would break that, the side is built on the frame instead;
  where no build does, it is refused with the screw and what stands over it. It ends with the tightening of each
  kind of join (`blind (16 joins, M5x12 button with a 3 mm hex key): 3.68 N m`). A slide-in nut in a stretch of slot
  that joins close at both ends (`frame.nut`) is shut in by whichever of the two joins is made second, in any order:
  the build is refused, naming the slot, the nuts, the two joins, and the nut that goes in through the opening
  (`frame/box: x1's top slot: 2 slide-in nuts (...) for plate would be shut in between the blind join of x1.a to
  p1.back@30 and the blind join of x1.b to p2.front@30: ...: give "nut": "drop-in"`), and `cad order` exits 1.
  `--json` adds `frame`: `{ steps: [{ n, kind, text, lines, items, joins, shown, now, dir }], sides, notFlat, bays,
  torques, stuck }`, kind one of `cut`, `drill`, `side`, `join`, `load`, `square`, `mount`; `shown` is what is in
  view at that step (the side on the bench, or the frame so far) and `now` what goes on in it. `--preview` draws each
  step that shows something, numbered as the build is. The build page shows the same as "Building the frame", its
  one sequence of steps (each a button that shows that step in the viewer), with the torques and the diagonals as
  tables.
- `assembly.order` is `cad check`'s finding on it, with the count of `cad order`'s steps (a frame's build from bars to
  square where the assembly has joins, failing where that build is refused; `fasten.access` names the same steps, and
  none of a build that is refused): a part no order can reach fails by name, and a part sealed inside another too. A fit can say where a screw is driven from with `"access": "<item>.<anchor>"`, the anchor's z pointing out along the screw: whatever stands on that line goes on after the screw, and if it has to go on first the screw can't be reached at all. Works on an assembly's own items; a component (an assembly used as an item) goes on as one step.
- `cad plates <project>/<assembly>`: every printed part laid out on beds, in its print orientation (as it's drawn), grouped by material and filament so each plate is one plastic and one colour change (a printed beam in its own `"material"`, PETG in a PLA project, goes on a plate named `<assembly>-petg-<filament>-<n>`; `packed.material` in its file), spaced by the first layer's rule (the printer's `print_gap` plus twice its `foot`, up to whole lines; `--gap` for your own). They're written as `kind: "plate"` assemblies called `<assembly>-<filament>-<n>` and checked as prints; `cad export` makes each one's 3MF. Each plate remembers what's on it by its build's hash (`"packed"` in its file): a changed part re-packs only its plate, so the other plates keep their files untouched, and a part too big for the bed is said by name (`plate.bed`). A frame's printed fittings (a join's bracket, a guide's holders and plate, a foot or an end cap) go on as their item's `fitting` with `"pose": "print"`, laid as each prints, and a levelling foot's pad beside its body. A frame's jigs (`cad beams --jigs`, below) are written beside them on plates of their own, in the project's plastic (`--no-jigs` leaves them).
- `cad kit <project>/<assembly>`: one folder to build it from without opening the model, `exports/<project>/<assembly>-kit/`, to hand to someone else: `README.md` (what the checks say, what to buy, what to print with each plate's material, grams and minutes, the jigs and what each is for, the cut list with the cuts on each bar, each mark's drilling and tapping, and the build step by step with its screws, keys, torques and the diagonals to measure), `buy.csv` (the bars, bought parts and fixings in packs), `print/` (each plate's 3MF and the jigs'), `sheets/beam-<mark>.svg` (each mark's sheet, to scale) and, with `--pictures`, `pictures/` (the whole and each step, which needs Chrome). It is written whole each time, and only for an assembly that `cad check` passes with nothing failing: one that fails is refused by name (`kit.check`, with the failures), and so is one with nothing to build from. `--json` lists the files. A frame's step that names a sheet names it by its file in the folder. Laying out the plates reads the printer's rule set (`x1c`), and on a fresh workspace that copies it into `rules/`, as any command that uses a tool's rule set does: the workspace keeps every rule its designs depend on. `cad kit` says which sets it copied (`copied` in `--json`).
- `cad list <project>/<assembly>` lists the beams' **cut list** after the bought parts: each mark (beams that are the same, one profile, length and set of operations, share a mark, A, B, C), its count, grams each and work, then each profile's lengths to cut, the bars to buy in the lengths it is sold in, and the cuts on each bar in order with its offcut. Every cut takes the saw's 3 mm kerf and each bar's first end is trimmed 10 mm (`CUT_DEFAULTS` in `@rulecad/frames`, each with its source); the packing is first-fit decreasing. `cad check` adds the cut list's findings (`frame.cut`): a beam longer than any length sold fails, two lengths nearer than the cut tolerance can hold apart warn, and beams of one mark are reminded to be cut against one stop. Each beam's mark is in its label in the preview (`x1: mark A, profile-2020-misumi-hfs5 x 300 mm`) and in the link, where the parts list groups the beams by it (`mark A: profile-2020-misumi-hfs5 x 300 mm`, x8). The link carries each mark's cut-and-drill sheet as a view of a **Beams** tab, and a beam picked in the model offers its own (`Sheet A ›`).
- `cad frame <project>/<assembly>`: a generated frame (`"frame": { "kind" }`, "A frame from a size" above): its inside and outside, its beams by length, its joins and its ends. `--expand` writes them into the assembly to edit by hand; `--json` gives the same as data.
- `cad beams <project>/<assembly>`: a cut-and-drill sheet for each mark, written to `exports/<project>/<assembly>.beam-<mark>.svg`, in mm so it prints to scale at 100%: the section at end a with each face named and the taps marked, a view of each face with work on it (that face up, end a on the left), every operation dimensioned from end a to 0.1 mm, and the operations in order, each tap with its thread and depth. The build page lists the sheets with the cut list.
- `cad beams <project>/<assembly> --jigs`: the jigs its beams take, made from the assembly and written as a plate, `exports/<project>/<assembly>.jigs.3mf` (`.jigs-2.3mf` and on where one bed is not enough). A **drill guide** for each distinct hole across a beam (an access hole, a drilled hole, a counterbore's hole): it stops on the nearer end, keys into the face's slot and holds a bush for the drill where the sheet dimensions the hole. A **tap guide** for each tapped end, a **cut-length stop** for each length (a block for the saw's fence and a printed gauge as long as the cut), and a **squaring corner** for each pair of profiles and hand a blind or end-tap join takes. A corner is an L whose arm b runs along beam b one way only, so where a beam meets a post near the post's end, only one hand lies on the post: each join gets the corner laid on a pair of faces the two beams share (the outer pair first) and of the hand whose tongues lie whole on both beams, its plate clear of every other beam. A box with beams near both ends of its posts takes both hands. Where no corner fits, a `jig.square` warning says why (how much of a tongue lies past a beam's end, which beam the plate meets): square that join with an engineer's square. Distinct means drawn the same: one guide serves every hole of its size at its distance from an end. Each is marked with the marks it is for (`ABCD`, `E 260`), cut into a face that faces up as it prints, printchecked, and listed with its grams, its margin and what it is for: each hole by mark and sheet number (`A3`), with its bush's distance from end a beside the sheet's figure. A hole too far from both ends for one print gives a `jig.drill` warning in place of a guide; mark it from the sheet. A tapped end no guide can be drawn for gives a `jig.tap` warning in place of its guide. `--json` gives the same, `--preview` a picture of the plate. The jigs are `@rulecad/frames`' (`drillGuideModel`, `tapGuideModel`, `lengthStopModel`, `squareCornerModel`).
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
  nothing collides. With its latch shut, the door hits the latch within its first degree, so the sweep also tries the
  door 0.5° off shut (`latch_probe`), finer than its steps, and fails there by name.
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
- A run along the slot a mount sits on keeps its clips off the mount's plate: one goes each side of it, and
  `wire.run` warns by name that the wire must go round the mount there. A run that lies wholly under a plate is
  refused by name.
- The other service parts are fitting items by kind: `fan-mount` (`"size": 80`), `drag-chain-end` (`"holes"`,
  `"screw"`), `din-rail`, `cable-clip`, `tie-anchor` and `spool-holder`.

**Guides.** `"guides"` puts linear motion on a beam: a miniature rail screwed down on a slotted face and its carriages
(@rulecad/frames' README, Guides):

```json
"guides": [{ "kind": "rail", "rail": "rail-mgn12", "carriage": "MGN12H", "on": "x1.top", "from": 50, "length": 300 }]
```

- The rail is a bought item named by the guide's `id` (`g1`, `g2`, ... by default), placed at `from` mm along the
  face from the beam's end a. Its screws are a fasten into the slot, one in each hole at the rail's pitch, so
  `fasten.length` chooses them, the slot nuts are placed with them (`"nut"` chooses their kind), and `cad list`
  counts both: an MGN12 cut to 300 mm takes twelve M3 cap screws 25 mm apart and twelve M3 slot nuts.
- Where no slot nut is sold for the rail's thread (an MGN7's M2 in a 2020's 6 mm slot), `"nut": "printed"` puts a
  printed carrier strip in the slot under the rail instead: a `nut-carrier` fitting item `<id>-nuts`, one hex nut
  under each hole, slid in from the beam's end. The rail's screws go into its nuts as a fasten, and `cad list` counts
  the strip with its grams and each nut once. An MGN7 cut to 200 mm on a 2020 takes a 189 mm strip of 9.3 g of PLA,
  thirteen M2x8 cap screws and thirteen M2 hex nuts; each nut holds about 936 N straight out of the slot (an estimate
  until tested). Where no carrier fits the slot either, `guide.fit` fails and says why.
- Each carriage (`"carriages"`, 1 by default) is a bought item `<id>-carriage-1`, ... on its own sliding joint
  `<id>-1`, ... along the beam, from 0 to its travel: its share of the rail less its length with its seals. The
  poses `<id>-a` and `<id>-b` put every carriage at the start and the end of its share; `cad check --sweep` slides
  each through its travel. A carriage's anchors are `top` and `t1` to `t4` (its tapped holes, from its top), for a
  table fixed on it.
- `cad check` says `guide.holes` (the holes, their pitch and the end distance; `guide.end` where an end is past half
  the pitch), `guide.travel`, `guide.fit` (the rail on the face, a slot nut for its screws, its ends on the beam and
  clear of a beam joined across its face), `guide.budget` (what it adds to an error budget) and `guide.jig` (a
  printed jig that centres the rail while it is screwed down, as a `rail-jig` fitting item).
- Each carriage's loads are held to its ratings at every pose (`joint.moment`): the weight of all it carries and the
  masses of `"loads"` hung on it, as a force and a moment about its middle on the rail's top, in its own frame.
  Each load over its rating (C0, MR, MP, MY), summed, is how much of the carriage it uses: past 1 it fails and names
  the rating, under 2 times over it warns. How they combine is an estimate, said as one.
- A task whose chain runs through a carriage's joint counts the rail's terms in its error budget (`task.accuracy`):
  its running parallelism and its carriage's play from its rule set (`spec`), the beam's straightness over the rail
  from the profile's, and the beam's sag. Where the frame is solved (the assembly has joins or a `"frame"`), the sag is
  the frame's own figure along the guide's travel, worst over the poses (`frame.deflection`), tagged as the frame's
  figures are (`estimate` while any join's spring is, `measured`, or `derived` with no joins); else it is the rail's
  own estimate, the beam pinned at its ends under its own and its carriages' weight. The beam's twist is a term too:
  the profile's `twist_per_metre` over the guide's length turns the carriage about the beam's axis, which moves the
  tool by that angle times the tool's distance from the axis (3.33° a metre over 500 mm with the tool 23 mm from the
  axis: 1.665° × π / 180 × 23 = 0.668 mm). Wheels and sliders, which run on the beam itself, take its straightness and
  twist the same way; rods and screws span between holders at their ends and take neither. A slide is solved at the
  middle of its travel as well as at its ends, where a carriage between two supports bends its beam most.
- Refused by name: a kind not built yet (a belt), a face that is not a beam's slotted face, `on` with a distance (that
  is `from`), a rail past the beam's end, a carriage its set has not got, and a rail too short for its carriages.

A carriage on V-wheels runs on a V-slot beam's own tracks, and a printed slider in or over a slot:

```json
"guides": [{ "kind": "wheels", "wheel": "v-wheel-solid", "wheels": 4, "on": "x1.top", "from": 50, "length": 400 },
           { "kind": "slider", "mode": "over", "size": 40, "on": "x2.top.1", "from": 100, "length": 200 }]
```

- For wheels, `on` is the face the plate lies over; its wheels run in the V tracks of the two faces either side, and
  `from` and `length` are the stretch of the beam it rolls along. The plate is a printed fitting (`wheel-plate`)
  `<id>-carriage-1` on the sliding joint `<id>-1`, from 0 to the stretch less its length over its wheels; the wheels
  are bought items `<id>-wheel-1`, ... held to the plate at its anchors `w1`, `w2`, ..., the ones on the second side
  on eccentric spacers. `cad list` counts the wheels, the plate's grams, and its screws, lock nuts, washers and
  spacers. The plate's anchor `top` takes what it carries.
- Where each wheel seats comes from the slot's track and the wheel's rim (`guide.fit`, with the axle's distance from
  the face). On a face with no V track (a plain T-slot) the guide is refused, saying why and what guides there
  instead. `guide.seat` compares the seat with the maker's own plate and warns when the eccentrics, on one side only, cannot take up the whole difference, `guide.preload` gives the eccentrics' range,
  and `guide.rating` each wheel's ratings, which rest on its plastic's contact pressure (an estimate).
- Each plate's loads are shared among its wheels at every pose (`joint.moment`), each wheel's radial and axial load
  over its ratings: past 1 it fails and names the most loaded wheel. The sharing is an estimate, said as one.
- A slider is a printed fitting (`slider`) on its sliding joint along the slot `on` names, over it (a shoe and a key,
  the default) or in it (`"mode": "in"`, a block under the lips, put in from the beam's end); `size` is its own
  length. Its clearance a side is the printer's fit, and `guide.friction` says its friction and wear rest on working
  figures until they are measured.
- The overlap check measures a beam by its envelope less its V tracks. A wheel is checked whole: its rim in the track
  is clear, and a rim out of the track, or a part or beam across the track's line (an end cap, a crossing beam), is
  found. A slider's key, which stands in the slot's opening, is left out of the check. `guide.fit` checks the rim's
  seat in the track.

Two smooth rods carry a printed carriage on linear bearings, and a lead screw drives it from a motor; an endstop homes
it. Each is placed by an address: the rods' holders at the ends of the stretch on the face, the motor plate before
it, the switch's mount where its address says:

```json
"guides": [{ "kind": "rods", "on": "x1.top", "from": 60, "length": 101, "endstop": { "at": "x1.front@82" } },
           { "kind": "screw", "guide": "g1", "screw": "t8-screw", "motor": { "model": "28byj48", "microsteps": 1 } }]
```

- A rods guide puts printed holders (`rod-holder`) at `<beam>.<face>@from` and `@from + length` (`<id>-holder-a` and
  `-b`), saddles screwed into the slots of the faces either side, one fasten a leg. The rods (`rod`, default `rod-8`)
  are bought items cut to the stretch, at holder a's anchors `r1` and `r2`; the carriage (`rod-carriage`,
  `<id>-carriage-1`) slides on the joint `<id>-1` with its bearings (`bearing`, default `lm8uu`) at its anchors `lm1`
  and `lm2`. Its travel is the stretch less the two holders, a millimetre's gap at each and the carriage with the
  nut's flange. `spacing` and `height` set the rods' place; their defaults leave room for what goes between and under.
  `"nut"` chooses the kind of slot nut the holders', the motor plate's and the endstop mount's screws go into: on a
  beam whose ends are both joined, a slide-in nut is shut in (`frame.nut` fails), so give `"nut": "drop-in"`.
  The carriage's anchor `top` takes what it carries.
- A screw guide names the rods guide it drives (`guide`). It adds a printed motor plate (`motor-plate`, `<id>-plate`)
  before holder a, the motor (`<id>-motor`, a motor item: give its `model` and any of `microsteps`, `duty`, `speed`,
  `current`, `driver`) at the plate's anchor `motor`, the coupler and the screw at its anchor `coupler`, a ball bearing
  for the screw in each holder (`support`, default `bearing-608`, or null) and the lead nut on the carriage's anchor
  `nut`. The motor drives the carriage's joint with `leadscrew` from the screw's set (its lead and diameter) and
  `friction` (default the set's, an estimate), so `motor.torque`, `motor.speed` and `motor.holds` read the drive's
  ratio as they do any lead screw. `guide.drive` and `guide.coupler` (how far the shaft reaches into the coupler) say
  what was placed. A screw on a rail or wheels is refused: a rail's carriage is driven by a belt.
- An endstop's printed mount (`endstop-mount`) goes at a side face's address (`endstop.at`), the switch (`switch`,
  default `endstop-10t85`) on it; a flag on the carriage's far end meets its lever. Where that happens is the joint's
  lower end and its `home` (`guide.endstop`). A switch the flag cannot reach, or a mount over a holder's leg, is
  refused, naming the address where it trips at the travel's start.
- Each carriage's loads are shared between its bearings at every pose (`joint.moment`) against their static rating;
  a moment on one bush is taken as a couple along it, an estimate, said as one.

A timing belt drives a rail's one carriage: a pulley on a motor at the beam's end a, a toothed idler past the rail's
end, both belt ends in a printed clamp on the carriage. The belt guide names the rail guide and the motor, and places
the rest by addresses (`examples/bench` `axes/x-belt` is one, written by the edit commands):

```json
"guides": [{ "kind": "rail", "rail": "rail-mgn12", "carriage": "MGN12H", "on": "x1.top", "from": 30, "length": 300 },
           { "kind": "belt", "guide": "g1", "motor": { "model": "nema17", "microsteps": 16, "current": 1.2 }, "accel": 3000 }]
```

- It adds a printed motor plate (`belt-plate`, `<id>-plate`) at `<beam>.<face>@0`, its tab screwed into the face's slot
  and the motor (`<id>-motor`) hanging under it past the beam's end; the pulley (`pulley`, default `pulley-gt2-20`;
  `<id>-pulley`) on the motor's shaft; a printed clamp (`belt-clamp`, `<id>-clamp`) at the carriage's `top`, screwed
  into the carriage's own tapped holes; and the idler (`idler`, default `idler-gt2-toothed-20`; `<id>-idler`) on a
  printed block (`belt-idler`, `<id>-idler-block`) past the rail's end, which is the tensioner: its two screws go into
  slot nuts in the beam's slot, so loosened it slides along it. `idlerAt` places the block (default room short of the
  beam's end b), `across` moves the idler's axle off the belt's square line, `tension` sets each span (default 25 N, an
  estimate), `cut` says the length the belt is cut to, `height` raises the belt's middle over the face (the pulley
  further up its shaft), `belt` its set (default `gt2-belt-6`). The rail starts after
  the plate's tab and ends before the block, or the guide is refused naming where to put it.
- The motor drives the carriage's joint with `belt` from the sets (the pulley's teeth, the belt's pitch, stiffness and
  width), so `motor.torque`, `motor.speed` and the step's term in the error budget read 20 × 2 = 40 mm a turn. Its
  load is what the belt pushes: everything the carriage carries at `accel` (the guide's, else the task's, else 1000
  mm/s²), a load on the joint that `motor.holds` leaves out (it is not there at rest). The push goes either way along
  the travel, so on an upright or sloping axis it adds to the weight: 1.04 kg on an upright 2020 at 5000 mm/s² needs
  10.18 + 5.19 = 15.37 N. Its shaft turns square to the travel (`motor.axis`).
- `belt.length` gives the path by the belt's pitch line, the length to cut it (whole teeth that stretch to the path at
  the tension) and to buy, rounded up to whole metres (`cad list` shows `gt2-belt-6 x 1000 mm`). `belt.tension` holds
  each span, with the push and the weight along the travel, between the belt's least static tension and its rated
  tension. `belt.rub` fails a run that rubs the beam, the rail, the carriage, the clamp or anything else on the
  carriage (by its box) anywhere through the travel, naming the run, the part and where; for a part on the carriage it
  gives the `height` that clears it by 1 mm. Its pass says how far the return run passes over the carriage's top
  (3.4 mm for an MGN12H on a 2020), the room a part on the carriage's free holes has under it.
  `belt.line` fails an idler off the pulley's line past 0.25° (an estimate). `belt.tensioner` says where the block
  must slide along its slot to tension the belt as cut, and fails when the slot has no room left there, saying how
  much shorter or longer to cut it. `belt.stretch` gives the belt's stretch under the push, the term `belt stretch` in
  a task's error budget.
- The belt is drawn where the carriage starts its travel and left out of the overlap check: its runs move with the
  carriage, so `belt.rub` holds them through the whole travel. The plate, the clamp and the block each report their
  grams, their margin and how they print, and pass printcheck as drawn.

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

- **The space** is where material may go (a circle `r`, a rectangle `size`, a polygon `points`, in mm, or another
  design's part, `{ "part": "blank.body" }`, taken as its section halfway up, holes open). **Keep**
  regions stay solid (bosses round bolts), **avoid** regions stay empty (the holes, clearances).
- **Supports** hold the material within `r` of a point (a bolt's hole); **loads** push on it, in newtons, each in a load
  case. Cases are optimised together, each by its weight in `cases` (0: analysed, not optimised for).
- **The material** is a rule set with `modulus` (MPa) and `poisson`: `pla`, `petg`, `al6061`, `al7075`, `s275`,
  `ss304`, `ti64` come with rulecad. Printed values vary: measure yours.
- **Settings:** `volume`, the share of the space to fill; `cell`, the grid (smaller is finer and slower: a 140 × 40
  grid takes about half a minute); `filter`, about the thinnest member, in mm. Left out, the filter is a cell and a
  half, and never under two of the project's printer's lines (the thinnest wall it lays solid): on an X1C's 0.42 mm
  lines that is 0.84 mm, which only takes over on cells under 0.56 mm.
- **At a design's anchors:** any region, support or load can take `"anchor": "plate.pivot"` in place of `at`: the
  anchor of another design in the project, where it is as that design is built (x and y of it in a flat problem; a
  cylinder lies along the anchor's axis unless it names one, and an anchor with a `rotate` points along its z turned by
  it, as an assembly reads it). The problem then follows the design: move the plate's
  pivot and the support, the boss round it and the result move with it. A design built from this problem can't be
  named (it would need the result to be built): name the part it is fixed to.
- **In an assembly:** `"in": { "assembly": "bench", "item": "plate" }` places the problem in an assembly of the
  project. Its coordinates are then the item's own, as that item's design draws the result, and two more kinds of
  region open up:
  - `"joint": "hinge"` in place of `at`, on any region, support or load: where the joint is, read the way an anchor
    is. When the item is one end of the joint, it is the item's own anchor for it, the same in every pose; otherwise
    it is where the joint's parent anchor stands in the pose.
  - `{ "sweep": "gate", "through": "swing" }` under `avoid`: an item (or `item.part`) moved through a joint's range,
    the other joints held at the pose, kept clear at every step. By default there are enough steps that no point of
    the part moves more than half a cell between two; `"steps"` sets them. A flat problem keeps clear of all of the
    part that lies within the plate's thickness about its middle plane (`in.z`, by default half the thickness, a plate
    drawn up from z 0): an arm dipping 1 mm into the plate's top is kept clear as surely as one through it. Its
    sections are taken up the plate no more than half a cell apart, and closer where a face leans, so together they
    cover it to half a cell; each distinct one is a region. A part passing over or under the plate, or only touching
    its face, is no obstacle; holes in a section stay open, and the design cuts each exactly.
  The assembly is read in its pose (`in.pose`, default the one it shows). While it is read, the item itself, and any
  other built from this problem, is drawn without a result (its problem variables set to `none`), so its design must
  draw something for `none`: a blank of the space will do. Change the assembly (a joint's range, a part's size) and
  the problem follows it, so the result is optimised again. `cad check <project>/<assembly> --sweep` then shows the
  part built from the result is clear through the swing. Refused by name: a sweep outside `avoid`, a sweep of the
  item itself, a joint that doesn't move the part against the item, a part that never reaches into a flat plate's thickness,
  and more than 360 default steps (give `steps`, or larger cells).
- **Or a stress limit instead of a volume:** `"stress": "pla.strength / 3"` (MPa) finds the lightest layout that keeps
  every cell's von Mises stress under it, which rounds off the sharp inside corners where cracks start. It takes about
  a thousand steps, each with two solves, so it's slower: give it a coarse cell first. Give supports and loads some
  area (a hole's edge, a pad), as stress where a load meets a point has no limit. `cad optimise` reports the peak
  stress against the limit. Check the final part with an `analysis` on a finer `cell`: a sharp corner that's
  within the limit on the optimiser's cells can still be over it on finer ones.
- **Robust:** `"robust": true` optimises the design as made, a little thin and a little thick (eroded and dilated
  copies) together. With a stress or strain limit, the lightest layout that keeps it on all three; a mechanism, the
  layout whose worst copy moves its output furthest, and with a limit, optimised under it. `cad optimise` prints
  the copies' peaks (and a mechanism's copies' travels). About three times the solves. A sharp inside corner of the
  space still stays sharp; topopt's README has the figures.
- **Variants**, picked as `name:variant`, set variables that have a tweak range, as an object's do.

`cad optimise <project>/<problem>` runs it, reports how far each load case moves its load and the stiffness that
gives, and draws the layout in `.preview/`. The result is kept, keyed by everything it's made from, so it's only
worked out again when something it depends on changes. `cad why <project>/<object>.<problem variable>` names what
that is: the problem file, its rule sets and values, the parts and anchors it reads (and the assembly, joints and sweeps), where its filter came from, and
the file the result is kept in.

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

Every run is kept to watch again. `cad optimise` writes `.preview/<project>/<problem>-run.html`: the same page,
reading its steps from the file, so it opens with no server and can be sent to someone. Drag the slider or the chart
to any step. `cad preview <project>/problems/<problem>` (or the file's path) draws the result and writes that page.
A result made without its steps recorded (by building a design that reads it) shows its end and each step's
compliance; `cad preview <project>/problems/<problem> --fresh` runs it again to record the steps, and `--watch`
shows the run live. A 3D run shows its three views; the turning surface needs the live view.

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

A part made another way says so in place of `overhang` (one process to a problem; two are refused by name):
- **Milled:** `"mill": "+z"` (the tool cuts down from above). No undercuts: a cell is as solid as every cell
  between it and the tool. `cad optimise` says `milled from +z: no undercuts`, or counts the cells an avoid region
  or the space's own edge hides behind material. The `mill-3axis` rule set holds the walls, corners and pockets a 3-axis machine manages.
  `"tool": 2` is the end mill's radius (mm, at least a cell): no pocket narrower, every inside corner rounded to it,
  and `cad optimise` counts any cells still too narrow, in the design or in avoid regions (drill those holes). A flat
  (2D) problem milled from `+z` with a tool is a plate's profile cut through by an end mill. `"mill": ["+z", "-z"]`
  mills from several sides, a setup each: a cell stays only where no side's tool reaches it. `"mill"` can also name a
  variable holding `"+z"`, `"+z -z"` or `"none"`, so a variant switches it: the bench's `bench/lever:milled` is the
  lever cut from a 6 mm plate by a 4 mm end mill.
- **Cast or moulded:** `"cast": "+z"` for a mould drawn off one way, or `"cast": { "draw": "z", "parting": 6 }` for
  two halves drawn off both ways from a parting plane (mm along the axis; the space's middle when left out). `"draft": 15`
  (degrees) narrows the part towards the side it is drawn off: a wall steps a cell out every whole number of layers
  in 1 / tan(draft), so at least the draft, and `cad optimise` says the angle made (15° is a step every 3
  layers, 18.43°). A draft too shallow for the grid (3° needs 19 layers) is refused by name: draw it on the finished
  part instead (`mould-injection`: a degree or so).
- **Printed in a metal powder bed:** `"overhang": "+z"` with `"voids": "refused"`. Powder left in an enclosed void
  can't be got out, so `cad optimise` fails with each void's volume and centre: open it with an avoid region (an
  escape hole, `dmls.escape_hole` wide) or allow voids. The `dmls` rule set holds the process's limits.
  `"voids": "prevented"` keeps every pocket open as the part is optimised (a virtual temperature, kept under a cap:
  an enclosed void runs hot); any a keep region walls in are still errors.

Any problem can give `"feature"`, the thinnest member it makes, mm: for a printed part `"x1c.wall_min"`, the
printer's two lines (0.84 mm). Where a cell is as wide, every member already is, and `cad optimise` says the grid
holds it; up to three cells across, members narrower go as it optimises; wider is refused with the cells that would
hold it.

Any of them can also be `"symmetry": { "mirror": "y" }` (mirrored across the grid's middle planes; `"turns": 2` or
`4` about `"axis"` for half or quarter turns) or `"extrude": "x"` (one section all along x, a part cut from a bar).
A mirror or turn that would swap the side the part is made from for its opposite is refused by name (a mould in two
halves parted at the middle may be mirrored across its draw). With a process or a tie, `cad optimise` warns when more
than a tenth of the design is grey (neither empty nor solid): the outline drawn is then a guess. A 2D section milled
or cast across its own plane often comes out so; give the problem in 3D or make it from another side.

`cad optimise` draws the result's four views in `.preview/`. A design builds the result with
`v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops })`, which adds the keep regions and cuts the avoid
regions exactly. The surface is a big mesh, so set the object's `"engine": "manifold"`. With `"overhang"` set, the
surface is also kept within the printer's overhang limit: faces smoothing tipped past it are tipped back. An
`analysis` of a solid part voxelises it on the problem's grid.

The surface is drawn with many small triangles, and `cad optimise` thins them by default: the surface stays within
0.1 mm of where it was drawn (a quarter of an X1C's print line), closed, with no more overhang and no new tips, and
`cad optimise` says how many triangles it had and has. On the bracket bench's printable result that takes 75,592
triangles to 21,124 and 27.808 cm³ to 27.806 cm³ (35.04 g of PLA at 1.26 g/cm³ either way, 0.003 g apart), a quarter
of the size in a file or a link. `"outline": { "reduce": 0.05 }` keeps the surface closer (31,154 triangles on the
bracket), and `"outline": { "reduce": false }` keeps every triangle it was drawn with.

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

## Parts printed in place

An object with `"printInPlace": true` is printed as one, its parts in the pose they're drawn in, and they move apart
once freed with a turn by hand (a gearbox printed whole: @rulecad/gears' `compoundPlanetary({ printInPlace: true })`
draws its teeth for it). Its parts are named (`return { housing, sun, planet_a, output }`), and `cad check` adds three
checks to the print checks:

- `inplace.bed`: each part has a face of its own on the bed, 1 mm² or more. A part that starts on another is printed
  onto it and fuses.
- `inplace.gap`: every two parts stand the printer's `print_gap` apart or more, measured by Manifold (the nearest pair
  and its gap on a pass, each pair too near on a fail). The first layer, where the plastic spreads by the printer's
  `foot`, is printcheck's `print.first-layer`.
- `inplace.first-layer`: on the bed, every two parts stand `print_gap` and twice the printer's `foot` apart, measured
  half a layer up, where the first layer spreads as it is squashed on.
- `inplace.support`: nothing needs a support, since none can come out from between parts that enclose each other. A
  bridge wider than the printer's `bridge`, an underside in mid-air or printed onto the part below, a ledge or an
  island fails here, where a part printed alone gets a warning.

The gaps need `manifold-3d` in the workspace (`"engine": "manifold"` objects have it already). To move the parts in
an assembly, draw each as an object of its own from the same numbers (the bench's `shoulder-pip-*` objects share a
module and read `pip`'s variables) and name them in the assembly's `"printInPlace": [items]`: they came off the bed
together, so the assembly order never takes them apart from each other. `cad order` fits them as one step and
`cad list` gives them one printed row, the one print's grams and minutes.

An assembly with a `gait` (EXAMPLES chapter 14) plays too: `cad animate <project>/<assembly>` writes the cycle as an animated SVG in `.preview/` (a side view of the legs and a plan of the feet and what they stand on) and its data as JSON. The model page plays the same cycle in its Motion panel. `cad machine <project>/<assembly>` on such an assembly describes it as a legged machine, an axis for each motor's shaft in the order its controller's slots are wired, and `cad plot <project>/<assembly>` with no drawing writes the gait as a step file for the streamer: `--cycles` of it (3) from a pose (`--pose`, by default the one shown) and back, every axis in each block, slowed where a motor cannot keep to the gait's period (`--period` to set it) and where a joint turns back, with a picture of each axis through the run in `.preview/`. A motor wired to a slot out of the streamer's order (X, Y, Z on a CNC shield; S0 to S7 on a Mega 2560) fails by name. The machine's `controller` is the bought board the streamer runs on: a `cnc-shield-v3` (an Uno, three axes, and the default) or an `arduino-mega-2560` (eight axes, the quadruped's). A motor on a driver of its own reaches its slot through its wire to the driver's breakout and the breakout's signal wire on to the Mega.

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
