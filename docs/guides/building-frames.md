# Frames: from a spec sheet to a checked box

A frame in rulecad is beams and the joins between them. A beam is a length of a profile (an aluminium extrusion, a
tube, or a beam printed in plastic), and a profile is a rule set: every figure on the maker's sheet, with the sheet as
its source. A join says how one beam's end meets another beam, and its drilling, tapping, screws and nuts follow from
that. The checks then solve the frame as a structure, and the build page says how to cut it, drill it and put it
together square.

This guide adds a profile of your own from its maker's spec sheet, builds a box from it, reads what the checks say,
and writes the kit to build it from. It needs Node.js and nothing else: no printer or saw until you build it. Each
step was followed in a fresh workspace as written, and the figures quoted are what that gave. The worked examples go
further: [chapter 16](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md#16-a-frame-beams-joins-and-an-axis)
draws a frame by hand with a moving axis, and chapter 17 prints every beam of a small case.

## 1. A workspace

```sh
npm create rulecad my-frame
cd my-frame
```

That makes a workspace with the kit installed: `rules/` for your own rule sets (made the first time you write one),
`projects/` for designs. `npm create rulecad my-frame --machine frame --size 300x300x350 --profile 2020-misumi-hfs5`
makes the same box this guide builds, in a profile the kit already has, if you would rather start from a working one.

## 2. Choosing a profile

Choose the profile family first, by what has to fasten to it, then the size, by what the frame carries.

| Family | Examples in the kit | Choose it when |
|---|---|---|
| Metric T-slot | `2020-misumi-hfs5`, `3030-bosch`, `4040-item-8`, Motedis, 80/20, unbranded | Most frames: slot nuts take parts anywhere along a face |
| V-slot | `2020-openbuilds` to `2080-openbuilds`, `4080-openbuilds-cbeam` | Wheels run on the beam's own faces (a cheap axis) |
| Small beams | `1010-makerbeam`, `1515-makerbeam-xl`, `1515-openbeam` | Small, light things on M3 hardware |
| Plain sections | `profile-tube-al-20x20x2`, `profile-angle-al-25x25x3`, `profile-round-bar-al-10` | No slots: parts bolt through drilled holes |
| Printed | `profile-2020-printed` to `profile-4040-printed` | A case or an enclosure, printed whole (chapter 17) |
| Custom | Any closed outline you give | A section none of these describe |

A profile names its slot family (`slot-6-misumi`, `slot-8-bosch` ...), and the slot decides which nuts, brackets and
rails fit it. Two makers' 2020 profiles may take different nuts: buy a frame's beams, nuts and fittings from one
family, so its joins fit each other. Choose a size from the load, not by eye: give the checks a list and they choose
(section 6).

The kit's profiles are listed with their figures and sources on the [rules page](../rules/) (filter for `profile`).

## 3. Adding a profile from its spec sheet

The kit has no set for the profile you want? Write one from the maker's sheet. Here it is called `2020-acme`; give
yours the maker's name and part number.

```sh
npx cad rules draft profile 2020-acme
```

This writes `rules/2020-acme.json` with every field a profile can have, each with a starting value, `"kind":
"estimate"`, a rule that says what the field is, and a source that starts `DRAFT`. Open it beside the sheet and, for
each field:

- the sheet gives the figure: put in the value, change `kind` to `spec`, write the sheet's name, its page and its
  address in `source`, and today's date in `checked`. The rule can stay as the draft wrote it, or say what the sheet
  says;
- the sheet has no figure for it: delete the field. The model works out what it needs from the rest (the corner
  bores, the hollows and the section figures are optional). A section drawn with closed hollows in its corners is the
  exception: keep `corner_hollow_width` and `corner_hollow_wall`, scaled off the drawing, with `kind` `estimate` and
  a rule that says so, or its drawn outline is solid where the real one is hollow;
- you measured it yourself with calipers: `kind` is `measured`, and `source` says how.

What a spec sheet usually gives, and the field each goes in:

| On the sheet | Field |
|---|---|
| The drawing: width, height, corner radius | `width`, `height`, `corner_radius` |
| The slot, by its series (slot 6, slot 8) | `slot`: the name of a slot family set, such as `slot-6-misumi`. None fits? `npx cad rules draft slot <name>` and fill it the same way |
| The centre bore and the thread it taps to | `bore_diameter`, `bore_thread` |
| The table of section figures | `area` (mm²), `inertia_x`, `inertia_y` (mm⁴), `mass_per_metre` (kg/m) |
| The alloy and temper | `alloy` (as printed), `material` (the kit's set for it, such as `al6063-t5`, for its stiffness and strength) |
| How it is sold | `lengths`, `cut_length_min`, `cut_length_max`, `cut_tolerance` |
| Tolerances | `straightness_per_metre`, `twist_per_metre` |

In the walk this guide was written from, the figures came from MISUMI's catalogue page for HFS5-2020 (page 2-529): 20
by 20 mm, corner R1, slot 6, a 4.2 mm bore tapped M5, 183 mm² of area, 7420 mm⁴ each way, 0.5 kg a metre, alloy
A6N01SS-T5, sold in 1000 and 4000 mm, cut to ±0.5 mm. The fields the page has no figure for (the wall, the chamber,
the corner bores, the section moduli and the torsion constant) were deleted. Then:

```sh
npx cad rules check 2020-acme
npx cad rules draw 2020-acme
```

`cad rules check` holds the set to the vocabulary (every value with its unit, rule, kind, source and date), builds
the profile's model, draws its section from the dimensions, and works out the section's area and second moments from
that outline. Where the sheet's figure differs from the outline's by more than 5% (10% for a second moment, 15% for
the torsion constant), it warns: a dimension is off, or the section has a shape its dimensions do not describe.
First hold the typed figure against the sheet: a slip of a digit or a unit (cm⁴ typed as mm⁴) is the usual cause. If
it is right, the drawing lacks a shape: add the corner hollows the drawing shows, as estimates, or measure the maker's
section from its DXF (`npx cad measure section.dxf --profile <name>`) for the true outline. A warning left after that
is the drawing's shortfall, and harmless: the frame checks take the area, second moments, torsion constant and mass
from the sheet wherever it gives them, and the drawn outline only for the figures it does not. The kit's own Bosch
Rexroth 30 x 30 set keeps two such warnings (area +6.1%, torsion constant +36.9%: its bore's notches and inner webs
are not drawn). The walk's set passes: the drawn section comes to 182.49 mm²
against the sheet's 183. Had the area been typed as 250, it would say:

```
2020-acme: passes, 1 to know
  WARN  area: the sheet says 250 mm², the drawn outline comes to 182.5 (-27.0%, more than 5%): ...  (profile.section.area)
```

A field whose source still starts `DRAFT` is a warning too (`rules.draft`), naming each, so a set half filled is never
taken for a finished one. A slot family that does not exist fails, and names the ones that do.

`cad rules draw` writes `2020-acme.svg`: the section to scale with every slot and bore dimensioned, and the figures
beside it. Hold it against the sheet's drawing: anything that does not match is a figure typed wrong.

Have the maker's 3D model or a DXF of the section in place of a sheet? `npx cad measure <file> --profile 2020-acme
--source <url> --licence "the maker's terms"` reads the section, finds the slots and bores, and writes the draft from
them (the cad README, "A beam's profile from its maker's model").

## 4. A box from its size

A frame for a size is asked for by what it must hold, and a generator works out the beams. Make a project with an
assembly in it, `projects/frame/project.json`:

```json
{ "name": "frame", "description": "A box frame", "material": "PLA", "objects": [] }
```

and `projects/frame/assemblies/box.json`:

```json
{
  "title": "Box frame",
  "kind": "fit",
  "frame": { "kind": "box", "inside": [300, 300, 350], "profile": "2020-acme", "join": "blind", "feet": "levelling" },
  "loads": [{ "mass": 5, "at": "x3.top@50%", "note": "5 kg on the middle of the top front beam" }]
}
```

- `"inside"` is the clear space it encloses, width, depth and height in mm (`"outside"` is the space it must fit in).
- `"profile"` names a set in your `rules/` or the kit's.
- `"join"` is how its corners are held (section 5). `"feet"` are printed levelling feet screwed into the uprights' ends.
- `"loads"` say what it carries, at an address on a beam: `x3.top@50%` is the middle of beam x3's top face.

Other kinds are `portal`, `table`, `gantry` and `shelf`. `npx cad frame frame/box` says what it expands into:

```
frame/box: a box of 2020-acme (20 mm), joined blind: the upright beams run through and the rest butt against their faces
inside 300 x 300 x 350 mm, outside 340 x 340 x 408.5 mm; the bottom ring stands 18.5 mm up the uprights, so its joins' holes clear the feet's tapped ends
  4 x 408.5 mm: z1, z2, z3, z4
  8 x 300 mm: x1, x2, y1, y2, x3, x4, y3, y4
16 joins (blind); 8 end fittings (levelling-foot, end-cap)
```

The uprights are 350 + 2 × 20 + 18.5 = 408.5 mm: the inside height, a beam's width at the top and at the bottom, and
the depth of the feet's tapped ends, which the bottom ring rises clear of. `--expand` writes the beams and joins into
the assembly, to edit by hand from there.

Then check it:

```sh
npx cad check frame/box
```

It took 15 seconds, and passed with nothing failing and nothing to warn of. Section 6 says what each line means.

## 5. Joins, and when to use each

A join names the end of one beam (`a`) and the place on another where that end meets it (`b`):

```json
"joins": [{ "kind": "blind", "a": "y1.a", "b": "x1.back@120" }]
```

`npx cad add join frame/box --kind blind --a y1.a --b x1.back@120` writes one. Never draw a join's holes or screws
yourself: the join puts its operations on both beams (on the cut list and each beam's sheet), its screws on the
shopping list and into the screw checks, and its stiffness into the frame's solution.

| Kind | What it is | Use it when |
|---|---|---|
| `blind` | A screw in a's tapped end, its head in b's slot, tightened through an access hole across b | A clean outside and a stiff corner, and you can tap and drill |
| `end-tap` | A screw through a hole across b into a's tapped end | The simplest machined corner; its head shows on b's far face. A generated frame sets each ring's beams along one width above its beams across, so the two screws across an upright miss each other. On a 30 mm profile with an M8 bore in an 8 mm slot, the 9 mm hole cuts the slot's lips (a warning): use blind there |
| `bracket` | A corner bracket on slot nuts, printed (`"fitting": "printed"`) or bought (a set's name) | No machining, and a corner you can move along the slot |
| `gusset` | A flat plate (L, T or cross) over the joint | Stiffening a bay against racking |
| `splice` | Two beams end to end, joined by a plate | A beam longer than you can buy or print |
| `hidden`, `anchor` | A bought connector inside the slots, or in a milled pocket | A neat corner from a maker's system |
| `cube` | A three-way corner node | Every beam the same length as the inside it bounds |
| `mitre` | Two mitred ends | Looks; the weakest corner |
| `pivot`, `printed` | A hinge; a printed node | Later releases draw these |

How stiff each is decides how much a frame sways, and nobody publishes those figures: every join's stiffness is an
estimate (a blind join in 2020, 1.5 N·m per milliradian in bending; a printed bracket's own, worked out by finite
elements, is far softer) until the joint rig measures one (`cad measured`). Every check that rests on one says so;
pass that on when you report a figure.

Try `"join": { "kind": "bracket", "fitting": "printed" }` (and `"feet": "foot"`) in the box above: it checks, but warns
that it racks 3.407 mm under a 20 N push at the top, against 0.95 mm, and works out what would cure it. The cheapest
is one diagonal brace, which brings it to 0.825 mm.

## 6. What the checks say

Each line starts `✓` (passes), `!` (a warning: look at it, or it rests on a figure nobody has measured) or `✗` (a
mistake to fix). `--json` gives each as data with its code. For the box above:

| Code | What it says | The box |
|---|---|---|
| `join.geometry`, `join.end` | Each beam's end meets its face square and flush; every end is joined or capped | 24 ends |
| `fasten.*` | Each join's screw followed through the parts: its length chosen from what is sold, its thread engaged, its head's seat, its key's way in | 16 × M5x12 button, 10 mm into each tapped end |
| `join.stiffness` | What each join's spring is taken to be, and that it is an estimate | 1.50 N·m/mrad bending, 0.30 twist |
| `frame.deflection` | The sag at each load and named point, with the joins' springs and with them rigid, against a limit | 0.047 mm (0.035 rigid) against 0.833 mm, the span over 360 |
| `frame.stress`, `frame.buckling` | Each beam's worst stress and its buckling load, with twice the margin asked | 4.46 MPa against 205 MPa; 277.6 times from buckling |
| `frame.rack` | How far a 20 N push at the top sways it each way, and what a gusset, a brace or a panel would do | 0.308 mm against 0.996 mm, its height over 400 |
| `frame.frequency` | The lowest modes, against what the machine's moves and motors excite | 13.9 Hz; nothing here excites it |
| `frame.square` | Each bay's two diagonals, and the difference to accept when building | 460.98 mm each, accept 0.95 mm |
| `frame.cut` | Lengths against what is sold, the saw's kerf and the cut tolerance | 8 beams of 300 mm: cut them against one stop |
| `frame.nut`, `frame.preload` | A slot nut that could never get into its slot, and nuts to load before a join closes the slot | None here |

Fix a failure in the design, never in the check: move a beam to fix `join.geometry`, change a nut's kind for
`frame.nut`, choose a bigger profile or a brace for a sag or a sway. A figure that rests on an estimate (a join's
spring, the 20 N push) is a prediction to measure, never one to tune.

The sag by hand, as a sense check: 5 kg is 49.03 N; a 300 mm beam of 7420 mm⁴ in an alloy of 69,972 MPa sags
P L³ / (48 E I) = 49.03 × 300³ / (48 × 69972 × 7420) = 0.053 mm with its ends pinned, and a quarter of that, 0.013 mm,
with them fixed (Roark's Formulas for Stress and Strain, table 8.1). The check's 0.046 mm from the load alone lies
between, near the pinned figure, because a blind join holds the end only a little.

To let the kit choose the size, give it a list: `"frame": { ..., "size": { "profiles": ["1515-openbeam",
"2020-misumi-hfs5", "3030-misumi-hfs6"] } }`, then `npx cad frame frame/box --size` says the lightest that meets each
limit, beam group by beam group, and the limit that set it; `--size --write` writes it in.

## 7. Nuts, and parts on a beam

A part screwed onto a beam is a `fasten` into a slot:

```json
"fasten": [{ "screw": "M4 button", "through": ["plate"], "into": "x1.top", "holes": "plate.body", "nut": "drop-in" }]
```

The screw ends in a slot nut under the slot's lips, chosen for that slot and thread. The kinds are `slide-in` (in
from an open end), `drop-in`, `roll-in` and `hammer` (in through the opening, anywhere), `t-bolt`, and a plain
`square` or `hex` nut where the slot takes one. Two checks catch what people meet too late:

- `frame.nut`: a slide-in nut needs an open end, and joins at both ends close it. The check names the drop-in nut that
  would do. Putting a rail on the box's top beam with slide-in nuts fails just so: "a slide-in nut goes in only from an
  open end ... give "nut": "drop-in"".
- `frame.preload`: the nuts that must be in a slot before a join closes it. `cad order` puts them on the step before.

`fasten.slot` fails a hole that is not over a slot's centre line, with the distance: a plate drawn for 20 mm between
slots on a profile with 30.

## 8. Guides: motion along a beam

A guide puts linear motion on a beam: `rail` (a miniature rail and carriage), `wheels` (V-wheels in a V-slot),
`rods` (two smooth rods and bearings), `slider` (a printed slider in the slot) and `screw` (a lead screw and its
motor, driving another guide). Each places its parts by address, picks its slot nuts, and gives its carriage a sliding
joint with its true travel:

```json
"guides": [{ "kind": "rail", "rail": "rail-mgn12", "carriage": "MGN12H", "on": "x3.top", "from": 25, "length": 250, "nut": "drop-in" }]
```

Run `npx cad check frame/box --sweep` to slide it through its travel. On the box above, this rail's MGN12H carriage
travels 204.2 mm, and the sweep finds nothing in its way. Putting a whole machine on a frame (a task, its
error budget and the frequencies its moves excite) is in [the machines guide](../machines/).

## 9. Building it square

```sh
npx cad list frame/box          # bars to buy, cut list, screws in packs, printed parts in grams
npx cad beams frame/box         # a cut-and-drill sheet for each mark of beam, to scale
npx cad beams frame/box --jigs  # printed jigs: drill guides, tap guides, length stops, squaring corners
npx cad order frame/box         # the build, from bars to a square frame
npx cad kit frame/box           # all of it in one folder to build from
```

The box's build is 26 steps: cut, drill and tap each mark from its sheet, build each side flat on the bench with its
joins snug, square it, tighten, then join the sides. To square a side, measure both diagonals inside corner to inside
corner. For a 300 by 350 mm opening each is √(300² + 350²) = 460.98 mm. Push the corners of the longer one together
until the two differ by no more than the check allows (0.95 mm here: each of the two cross beams' ±0.5 mm cuts gives
0.5 × 300 / 460.98 = 0.33 mm, and each of the four joins' play of 0.1 mm, an estimate, 0.1 × 350 / 460.98 = 0.08 mm),
then tighten each join to its torque (3.68 N m for these). The printed squaring corners hold a join at 90° while you
do.

Once built, write what you measured back:

```sh
npx cad measured frame/box frame.square.z1-z2-x1-x3=0.4 --source "tape, inside corners"
```

and the check then says the bay was measured within what its cuts and joins allow. `cad kit` writes
`exports/frame/box-kit/`: the build page (`README.md`), `buy.csv`, the printed parts' and jigs' 3MF files, and each
mark's sheet. It refuses a design whose check fails.

## Where this stops

- Every join's stiffness and play is an estimate until the joint rig measures it: the sway, the frequencies and the
  diagonals to accept all rest on them, and say so.
- A spec sheet's section figures are taken as printed; the outline the kit draws is from the interface dimensions, so
  a section with webs or hollows the sheet does not dimension comes out different (a warning past 5%), and the checks
  use the sheet's figures. Only a measured outline (`cad measure`) is the true shape.
- The kit draws a generated frame's corners for `blind`, `end-tap`, `bracket`, `gusset`, `hidden`, `anchor` and
  `cube` joins; a mitred, spliced, pivoting or printed-node corner is drawn by hand (`cad frame --expand`).

## Formulas

| What | Formula | Source |
|---|---|---|
| Section figures from an outline | Area and second moments by the polygon formulas; the torsion constant by solving the stress function over the section | `@rulecad/frames` README, Formulas |
| Sag of a beam with a load at its middle | P L³ / (48 E I) pinned, P L³ / (192 E I) fixed | Roark's Formulas for Stress and Strain, table 8.1 |
| Default sag limit | span / 360 | IBC Table 1604.3 |
| A bay's diagonal | √(width² + height²) | Pythagoras |
| A cut's share of the diagonal difference | tolerance × the side it lengthens / the diagonal | `squareness` in `@rulecad/frames` |
| Racking limit (default) | height / 400 | `frame.sway` in cad |

## Glossary

- **Profile**: the shape of a beam's section, as a rule set.
- **Slot family**: the shape of a T-slot (its opening, lips and cavity), which decides the nuts and fittings it takes.
- **Join**: how one beam's end is held to another beam.
- **Racking**: a rectangular bay leaning over into a parallelogram under a side push.
- **Mark**: a letter for beams cut and drilled alike, which share one sheet.

## Sources

- MISUMI FA Mechanical Standard Components catalogue 2014, page 2-529: HFS5-2020's figures, used in the walk.
- Roark's Formulas for Stress and Strain, table 8.1: beam deflections.
- [`@rulecad/frames`](../frames/): profiles, beams, joins, fittings and the formulas behind them.
- [`@rulecad/cad`](../cad/): the commands and every check, in full.
