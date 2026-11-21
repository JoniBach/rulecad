# @rulecad/frames

Structures built from beams. A beam is a length of a profile: an aluminium extrusion from any maker's spec sheet, a
plain tube or angle, or a beam printed in plastic. Part of [rulecad](https://github.com/JoniBach/rulecad), a kit for
designing physical things where every measurement says which rule it comes from.

It reads a profile, which is everything the rest is built on, makes beams of it, works them, lists what to buy and
cut, and fastens to them:

- **`profileModel`**: a profile as a model from its rule set and its slot family's, every figure with how far to
  trust it and where it comes from, its slots, bores and hollows each in their place.
- **`outline`**: its section as closed loops, drawn from a handful of dimensions, or a measured outline where you
  have one.
- **`section`**: what that outline is worth as a beam (area, centroid, second moments, torsion constant, mass per
  metre), each beside the figure on the maker's sheet.
- **`profileFindings`**: what a check of a profile finds, as `cad rules check` reports it.
- **`beamModel`** and **`beam`**: a length of a profile, with its mass and centre of mass, the anchors an assembly
  places it and its fittings by, and its solid as a light box or the true section.
- **Beams in assemblies**: every place on a beam has an address (`top@120`, `top.2@50%`, `a.1`) that a cad
  assembly places a beam's ends and its fittings by, its face names turning with it.
- **Operations on a beam**: cut, mitre, tap, access, drill, counterbore, pocket, notch and deburr, each placed by an
  address on the beam, dimensioned from end a, checked, and cut into its solid.
- **The cut list and sheets**: beams marked by what makes them alike, packed into the lengths a supplier sells with
  each cut's kerf (`cutList`, `packBars`), and a cut-and-drill sheet for each beam (`beamSheet`).
- **Joins**: how two beams are joined (`joinModel`), by kind: the operations it puts on each beam, the screws that
  hold it, and how stiff it is taken to be when a frame is solved.
- **Slot nuts**: the bought nuts a slot takes (`slotNutModel`, `nutFit`, `slotNut`), the nut for a face and a thread
  (`nutFor`), and a printed carrier for a hex nut or an insert that slides in the slot (`carrierModel`, `carrier`).
- **Printed fittings**: a corner bracket, braced or not (`bracketModel`, `bracket`), and flat plates over a joint, a
  gusset (L, T, cross) or a splice plate (`plateModel`, `plate`), each drawn from the profile's and its slot nuts'
  rules, sized from a named load by finite elements, and reporting its grams, its stiffness and its margin.
- **Guides**: a miniature rail on a slotted face (`railModel`), its holes at its pitch, the slot nut its screws take
  (`guideFit`), each carriage's travel, its carriages' loads against their ratings (`carriageMargin`), what it adds to
  an error budget (`railTerms`), and a printed jig that centres it while it is screwed down (`railJigModel`); a
  carriage on V-wheels in a V-slot's tracks (`wheelsModel`), where each wheel's axle goes from the track and its rim
  (`trackFit`), its eccentrics' preload range and each wheel's load against its rating (`wheelMargin`); and a printed
  slider in or over a slot (`sliderModel`).
- **Printed beams**: a beam printed in plastic in place of one cut from stock (`beamModel`'s `printed`): printable
  profiles that lie down to print with no support (`printedProfile`, published as `profile-1515-printed` to
  `profile-4040-printed`), its figures from its walls and infill (`printedSection`), its ends' heat-set inserts or
  captive nuts, its solid as it prints (`printedBeam`), and a keyed splice for a beam longer than the bed
  (`spliceModel`, `splice`).
- **Jigs**: printed jigs for hand tools from a beam's operations: a drill guide that puts a bush where the sheet
  dimensions a hole (`drillGuideModel`), a tap guide over an end (`tapGuideModel`), a cut-length stop with its gauge
  (`lengthStopModel`) and a squaring corner (`squareCornerModel`).

- **Squaring**: a bay's two diagonals and the difference to accept, stacked from its cuts and its joins' play
  (`squareness`), and the printed squaring corner that holds a join at 90° while it is tightened.
- **Frames from a size**: generators for a box, a portal, a table, a gantry and a shelf (`box`, `portal`, `table`,
  `gantry`, `shelf`, `frameModel`), asked for by the space inside or outside, that expand into beams, joins, feet and
  caps; and each profile as choices for `@rulecad/fea/frame`'s sizing (`profileChoices`), so the lightest profile that
  meets a frame's limits can be chosen beam group by beam group.

A frame is solved as a structure by `@rulecad/fea/frame` (beam elements, each join a spring at the beam's end), and
cad's checks read it: sag, stress, buckling, racking, the lowest modes, heat, squareness, and which beams could be
printed. [The frames guide](https://jonibach.github.io/rulecad/docs/building-frames/) walks a profile from its maker's
spec sheet to a checked box, built square, in commands. A whole frame, a box of 2020 with a motor-driven axis, cut,
drilled, printed on one plate and built in order, is chapter 16 of
[the worked examples](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md), and chapter 17 prints
every beam of a small case. More fittings (a three-way corner, a hidden-corner cover, a printed node) and a belt drive
follow in later releases. The plan is [issue 240](https://github.com/JoniBach/rulecad/issues/240).

```sh
npm install @rulecad/frames @jscad/modeling
```

It depends on `@rulecad/rules`, where the profiles live as open data, `@rulecad/fixings`, which sizes anything an
operation names by a thread, and `@rulecad/fea`, which bends a printed fitting under its load. It takes JSCAD (`@jscad/modeling`, which a
rulecad design already has) as a peer for a beam's solid.

## A profile

```js
import { profileModel, outline, section, profiles } from '@rulecad/frames'

profiles()                                  // ['profile-2020-bosch', 'profile-2020-generic', 'profile-2020-misumi-hfs5', …]
const p = profileModel('2020-misumi-hfs5')  // MISUMI's HFS5-2020, by its set's name with or without 'profile-'

p.width, p.height, p.cornerRadius           // 20, 20, 1
p.faces.top                                 // [{ face: 'top', index: 1, slot: 'slot-6-misumi', at: [0, 10], normal: [0, 1], along: [1, 0] }]
p.slots['slot-6-misumi'].opening            // 6
p.bores[0]                                  // { at: [0, 0], diameter: 4.2, thread: 'M5', threadSet: 'm5', tapDrill: 4.2, … }
p.sheet.area                                // 183: the catalogue's figure, mm²
p.figures.area                              // { value: 183, unit: 'mm²', kind: 'spec', source: 'MISUMI … page 2-529, https://…', … }
p.material.modulus                          // 69972 MPa, from the al6n01-t5 rule set the profile names

const s = section(p)
s.area, s.inertiaX, s.torsion               // 182.5 mm², 7425 mm⁴, 809 mm⁴: from the drawn outline
s.sheet.area                                // { sheet: 183, computed: 182.5, difference: -0.003 }
outline(p).loops                            // [[[x, y], …] the outside, counter-clockwise, then each hole clockwise]
```

A section is drawn in x (across, its width) and y (up, its height) with the middle of its envelope at the origin.
The beam runs along z. Its faces are `top` (+y), `bottom` (-y), `front` (-x) and `back` (+x), and the slots of a face
count from 1 along +x or +y. Lengths are in mm, areas mm², second moments and the torsion constant mm⁴, mass kg/m.

### The model

| Field | What |
|---|---|
| `kind`, `name`, `family` | `'profile'`, the set's name, and what sort of section: `t-slot`, `v-slot`, `tube`, `round-tube`, `angle`, `channel`, `bar`, `round-bar`, `custom`, `printed` |
| `series`, `cells`, `pitch` | The base size, the cells as `[across, up]`, and the size of one cell as `[x, y]` |
| `width`, `height`, `cornerRadius`, `wall` | The envelope, and a tube's, angle's or channel's wall |
| `faces` | `top`, `bottom`, `front`, `back`: each a list with one entry per cell along it, `{ face, index, slot, at, normal, along }`. `slot` is a slot family's name, or `null` where the face is closed there |
| `slots` | The slot families it uses, by name: `{ opening, mouth, lip, lipAngle, cavityWidth, cavityDepth, floorWidth, flankAngle, straight, trackWidth, trackAngle, nutFamily, figures }` |
| `bores` | Each bore: `{ at, diameter, thread, threadSet, tapDrill, major, threadPitch, where }`, `where` being `cell`, `corner` or `given` |
| `title` | A line for a list: `'25 x 25 x 2 tube, al6063-t5'`, `'20 x 20 t-slot (profile-2020-misumi-hfs5)'` |
| `chambers`, `hollows` | The closed hollow where two cells meet (`{ at, axis, width, length, depth, ends, slot }`: `ends` are its half widths toward each end, narrower toward a place where four cells meet), and square hollows in the corners of a lighter section |
| `sheet` | What the sheet says: `{ area, inertiaX, inertiaY, modulusX, modulusY, torsion, massPerMetre }`, `null` where it gives none |
| `material` | The material set it names: `{ name, alloy, density, modulus, poisson, strength, figures }`, or `null` |
| `supply` | `{ lengths, cutMin, cutMax, cutTolerance, straightness, twist }` |
| `figures` | Every rule of the set by name, each `{ value, unit, kind, source, rule, checked }` |
| `measured` | A measured outline, when one was handed in |
| `rests` | The kinds its figures and its slots' rest on: `['spec', 'estimate']` |

`profileModel(which, change, given)` takes a second argument to change a figure (`{ bore_diameter: 5 }`, or
`{ area: { value: 180, kind: 'measured', source: 'weighed a metre' } }`), and a third for what is not in the
catalogue: `{ sets: { 'my-slot': {…} } }` or `{ load: (name) => set }` for a slot family, thread or material of your
own, and `{ outline: {…} }` for a measured outline. A profile of your own is a rule set handed in place of the name.

### Cells and faces

A larger section is cells of its series. A 40 x 20 has `cells_across` 2 and `cells_up` 1 in its rule set, and the
model expands them: two slots on each wide face, one on each end, a bore in the middle of each cell and one closed
hollow where the two cells' slots would have met. Each sold profile is its own rule set with its own sheet's figures.
A face is overridden in the rule set: `"slot_bottom": "closed"` for a smooth face, `"slot_top": "slot-6, closed"` for
one slot of two, another family's name to mix two slots in one section.

A grid need not be full. `cells_absent` names the cells that are not there, as across,up pairs from 1 at the lower
left: OpenBuilds' C-Beam is 4 cells by 2 with `"2,2; 3,2"` absent. `faces` then holds a place for every side of a cell
with no cell beyond it, by the way it looks: `faces.top` of a C-beam has four places, two on top of the arms and two on
the floor of the C lower down, and `faces.back` has the inside of the left arm beside the right-hand outside. `index`
is the place's column (top and bottom) or row (front and back). Where four cells meet, or a cell stands at a corner of
a missing one, the hollows between cells keep to the cavity's own width (`ends`), so they stand clear of each other.

### Outlines

`outline(model)` returns `{ loops, measured, source }`. Each loop is a closed list of `[x, y]` points: the outside of
the metal first, counter-clockwise, with every open slot cut into it, then each hole clockwise (bores, hollows, a
tube's inside). It is drawn from the interface dimensions alone: the envelope and its corner radius, each slot from
its opening, lip, cavity width and depth, floor width and flank angle, and each bore as a circle of the same area. It
leaves out what those dimensions do not say: fillets, the notches round some makers' bores, grooves and ribs.

A measured outline takes its place when you have one: `readOutline(json)` holds a file to its format (a `source`, a
`licence`, and `loops` in mm) and turns every loop the right way round. In a workspace it is the file
`rules/outlines/<set name>.json`. The kit publishes no maker's outline. It draws its own, and a maker's model is
measured in your own workspace.

### Plain sections: a family and a size

Tube, round tube, angle, channel, flat bar and round bar have no maker's sheet. Each is a family with a base set
(`profile-tube`, `profile-round-tube`, `profile-angle`, `profile-channel`, `profile-bar`, `profile-round-bar`) that
holds a starting size, and any other size is the family's name with the figures you have:

```js
const tube = profileModel('tube', { width: 25, height: 25, wall: 2, material: 'al6063-t5' });
tube.title;                                   // '25 x 25 x 2 tube, al6063-t5'
section(tube).area;                           // 184 mm²: 25² less 21²
beamFigures(tube).torsion;                    // { value: 25410, unit: 'mm⁴', kind: 'derived', from: 'outline', source }
profileModel('angle', { width: 40, height: 25, wall: 3, material: 's275' });   // unequal legs, in steel
profileModel('round-bar', { width: 12, height: 12 });                          // a round section's width and height are its diameter
```

| Family | `width` | `height` | `wall` | Also |
|---|---|---|---|---|
| `tube` | Outside, across | Outside, up | The wall, all round | `corner_radius` outside (cold-formed steel tube is rounded by about twice its wall) |
| `round-tube` | Outside diameter | The same | The wall | |
| `angle` | The leg along the bottom | The leg up the side | Both legs' thickness | The legs meet at the lower left |
| `channel` | Across the web | The flanges' height | Web and flanges | The web is along the bottom |
| `bar` | Across | Thickness | none | |
| `round-bar` | Diameter | The same | none | |

`material` is a material set's name (`al6063-t5`, `s275`, or one of your own through `given`), and gives the mass per
metre. A few common sizes are ready sets, named for what they are (`profile-tube-al-25x25x2`,
`profile-angle-steel-30x30x3`): each is its family at that size, for a workspace that wants a name to point at.

`beamFigures(model)` gives the figures to design a beam with, whatever the profile: the sheet's own where the maker
prints one (`from: 'sheet'`, with the sheet's kind and source), and the outline's where it does not (`kind:
'derived'`, `from: 'outline'`). A plain section's are all worked out; MISUMI prints no torsion constant, so that one
figure of an HFS profile is worked out and the rest are the page's.

### A custom section

Family `custom` is any closed outline. A custom profile is its outline: the set gives the family, the envelope and
the material, and the outline comes with it, as `rules/outlines/<set name>.json` in a workspace or handed in:

```js
const hat = { source: 'traced from my own bar', licence: 'my own measurement',
  loops: [[[-20, -10], [-10, -10], [-10, 8], [10, 8], [10, -10], [20, -10], [20, -8], [12, -8], [12, 10], [-12, 10], [-12, -8], [-20, -8]]] };
const mine = profileModel('custom', { width: 40, height: 20, material: 's275' }, { outline: hat });
section(mine).area;                           // 152 mm²
```

`profileModel('custom')` alone is the kit's own example, a 30 x 30 x 3 mm T section drawn for the kit. A custom set
with no outline is refused by name, and a check says where an outline's envelope is not the set's width and height
(`profile.outline.size`) or is not drawn about its own middle (`profile.outline.middle`).
`cad measure <model> --profile <name>` writes the set and the outline from a model or a DXF.

### What a check finds

`profileFindings(model)` returns findings in rulecad's one shape, `{ level, code, text, rule, at, values }`:

| Code | Level | When |
|---|---|---|
| `profile.slot.fit` | fail | A slot or hollow reaches outside the section, or runs into another: no metal is left between them |
| `profile.bore.clear` | fail | A bore breaks into a slot, a hollow or another bore |
| `profile.bore.tap` | fail | The bore is as wide as the thread it is tapped to |
| | warn | The bore is under the thread's root, or leaves under a quarter of its height: probably the wrong thread |
| | info | The bore leaves under half a thread's height, as some makers' bores do |
| `profile.bore.thread` | warn | The thread named is no thread set, so nothing was compared |
| `profile.section.area` and `.mass_per_metre` | warn | The sheet's figure and the outline's differ by more than 5% |
| `profile.section.inertia_x` and `.inertia_y` | warn | By more than 10% |
| `profile.section.torsion_constant` | warn | By more than 15% |
| `profile.outline.size` | warn | A measured outline's envelope is more than 0.2 mm from the set's width or height |
| `profile.outline.middle` | warn | A measured outline is not drawn about the middle of its envelope |

The allowances are in `DEFAULTS`, each with the sentence it rests on. They are estimates: a section drawn from a
fully dimensioned slot comes within them (MISUMI's eight profiles are within 4% on area and 6% on second moments),
and one outside them has a dimension wrong or a shape the dimensions do not describe, such as the L-shaped hollows of
a light 40 mm section. A warning is a reason to look, and the sheet's figure stays the one to design with.

## A beam

A beam is a length of a profile. It lies along z: end `a` at z = 0, end `b` at z = its length, its section in x and y
as the profile draws it.

```js
import { beamModel, beam, beamAnchor, printable } from '@rulecad/frames'

const b = beamModel('2040-misumi-hfs5', { length: 300 })
b.mass                       // 264.3 g: the drawn section's 326.2 mm² x 300 mm x 2.7 g/cm³
b.weight                     // { computed: 264.3, sheet: 264, difference: 0.001 }: the sheet's 0.88 kg/m
b.centreOfMass               // [0, 0, 150]
b.figures.inertiaX           // { value: 13580, unit: 'mm⁴', kind: 'spec', from: 'sheet', source: 'MISUMI …' }
b.anchors['top.2']           // { origin: [10, 10, 150], axis: [0, 1, 0], ref: [0, 0, 1] }
beamAnchor(b, 'top.2@-20')   // the same place 20 mm from end b: origin [10, 10, 280]

beam(b, { display: 'link' })  // a plain 40 x 20 x 300 box: 12 triangles
beam(b)                       // the true section run 300 mm (display: 'preview', the default)
printable(b)                  // [{ level: 'fail', code: 'beam.printable', text: '… is a bought beam …' }]
```

`beamModel(profile, { length, ends, material, given, cells })` takes a profile's model or anything `profileModel`
takes, and:

| Option | What |
|---|---|
| `length` | mm from end `a` to end `b`. Required |
| `ends` | Each end `cut` square (the default) or `tapped`, its bores carrying the profile's `bore_thread`: one word for both, `[a, b]`, or `{ a, b }`. Mitres and drilling are operations on a beam, in a later release |
| `material` | A material set's name in place of the profile's alloy, to weigh the same frame in another metal or a plastic. The sheet's mass is then not compared |
| `given` | `profileModel`'s third argument: slot families, threads and materials of your own |
| `cells` | Raster cells for the torsion constant, where the sheet gives none |

The model:

| Field | What |
|---|---|
| `kind`, `name`, `title` | `'beam'`, `'profile-2040-misumi-hfs5 x 300'`, and a line for a list |
| `profile`, `length`, `ends` | The profile's model, the length, and each end's `{ kind, thread }` |
| `material` | `{ name, density, modulus, given }`, `given` true where the option changed it |
| `area`, `centroid` | The section's, from its outline |
| `mass`, `centreOfMass` | Grams from the section's area, the length and the material's density; the section's centroid at half the length |
| `weight` | `{ computed, sheet, difference }`: the mass beside the sheet's mass per metre times the length |
| `figures` | `beamFigures(profile)`: the figures to design with, the sheet's where it gives one |
| `places` | Every place a face offers, `{ name, face, index, slot, at, normal, along, depth }`: `slot` is `null` on a closed face, `depth` the slot's cavity depth |
| `bores` | Each bore in each end, `{ name, end, at, diameter, thread, tapped }` |
| `anchors` | By name, each `{ origin, axis, ref }` (below) |
| `bought`, `printed` | `true` and `false`: a beam of a profile is cut from stock |
| `findings` | `beam.mass` (info: the mass and how it was worked out; warn: more than 5% from the sheet's), `beam.length` (warn: longer than the profile is sold or cut in, or shorter than the maker cuts) |

### Anchors and addresses

Each anchor is a point (`origin`), the direction out of the beam there (`axis`), and a direction square to it that
fixes the turn about it (`ref`): at an end the beam's up (+y), on a face along the beam toward end `b` (+z).

| Address | Where |
|---|---|
| `a`, `b` | The middle of each end, `axis` out of the end |
| `a.1`, `b.2` | The bores in each end, numbered as `profile.bores` lists them |
| `top`, `top.1`, `top.2` | The places on a face, counted along it (+x for top and bottom, +y for front and back). `top` is the first. A face with one place has `top` and `top.1`. A place's anchor is where it meets the face, at half the length, `axis` out of the face |
| `top@120`, `top@-20`, `top@50%` | With `beamAnchor`: 120 mm from end `a`, 20 mm from end `b`, the middle. A distance past an end is refused with the beam's length |

A section with cells missing (OpenBuilds' C-Beam) has places inside its C on the same faces: they are numbered after
the outside places of the same column or row, and `index` says which column or row each is in. Place by `origin` and
`axis`, never by the number alone.

### Face names in an assembly

![A 2040's section seen from end b with every place named, and the beam from its front with top@120, top@50% and top@-20 marked](https://raw.githubusercontent.com/JoniBach/rulecad/main/packages/frames/faces.svg)

The face names belong to the beam, so they turn with it. In a cad assembly a beam placed by its ends (`"from"`,
`"to"`) has end `a` at `from` and end `b` at `to`. At roll 0 its top faces up (+z), or +y when the beam stands upright
(within 0.1° of z). Looking along the beam from `a` to `b` with its top up, its front is on the right and its back on
the left: a beam run along +x has its front toward -y, facing a viewer in front of it. `"roll"` turns the beam about
the line from `a` to `b` by that many degrees, right-handed, and the faces turn with it: at roll 90 the top of a beam
run along +x faces -y.

In an assembly an address names the item first: `x1.a`, `x1.a.1`, `x1.top@120`, `x1.top.2@-20`, `x1.top@50%`. A place's
anchor has its z out of the face and its x along the beam toward `b`, so a part placed at an address sits on the face
with its own x along the beam. The cad README says where addresses are taken.

### Operations

A beam carries a list of operations, `ops`, each a line on its cut-and-drill sheet and a cut in its solid. Each is
placed by an address on the beam: an end (`a`, `b`), an end's bore (`a.1`), or a face's place with a distance from
end a (`top@120`, `top@-20` from end b, `top@50%`).

```js
const b = beamModel('2020-misumi-hfs5', { length: 300, ops: [
  { op: 'tap', at: 'a', thread: 'M5' },          // M5 in end a's bore, 10 mm deep: 2 diameters for aluminium
  { op: 'access', at: 'top@-10', thread: 'M5' }, // a Ø5.3 mm hole 10 mm from end b, for an M5 cap screw's 4 mm key
] });
b.ops.map((o) => o.line); // 'tap M5 in bore a.1, ...', 'cut end a square', 'access hole Ø5.3 mm in top.1, ...', 'cut end b square'
workOrder(b);             // [1, 3, 2, 0]: the order they are done in, as the sheet numbers them
```

`b.ops` lists the operations in their place along the beam, from end a, and everything that reads a beam (the cut
list's marks and summary, the joins, the checks) reads them so. `workOrder(b)` gives their indexes in the order they
are done, and a beam's sheet numbers them so: each end cut (square or mitred) and deburred, then the holes, pockets and
notches across it from end a, then the taps in its end bores. A jig's label (`C4`) and a guide's warnings use the
sheet's number; `drillGuideModel` and `tapGuideModel` take the index into `b.ops`.

| Operation | What it is | Where | Takes |
|---|---|---|---|
| `cut` | A square cut to length. Each end with no cut or mitre of its own gets one (`implied: true`) | `a`, `b` | |
| `mitre` | An end cut at an angle from square, seen on a named face | `a`, `b` | `angle` (above 0, under 90), `about` (the face), `long` (the side the length is on) |
| `tap` | A thread cut in an end bore. `ends: 'tapped'` is the same | `a`, `b`, `a.1` | `thread` (default the profile's `bore_thread`), `depth` |
| `access` | A hole across the beam, in line with a slot, through its floor, for a key | a face | `thread` (sizes it for that screw's key) and `head` (the head the key turns: `cap`, the default, `button` or `countersunk`), or `diameter`; `depth`, `through` (`wall`, the default, or `beam`: every wall on its line, to the slot on the far side) |
| `drill` | A hole through one wall or right through, plain or tapped | a face | `thread` and `kind` (clearance, close, loose, tap) or `diameter`; `through` (`wall`, the default, or `beam`); `depth` |
| `counterbore` | A seat for a head in a face, with the screw's hole through the wall | a face | `thread`, `head`, `diameter`, `depth` |
| `pocket` | A milled pocket | a face | `size` (`[along, across]`) or `outline` (points about the address), `radius`, `depth` |
| `notch` | Part of a slot's lips cut away, to load a nut mid-span | a face with a slot | `length` |
| `deburr` | Named so the sheet asks for it | `a`, `b` | |

Sizes named by a thread come from `@rulecad/fixings` as a machine cuts them: the thread's figure as drawn, with no
printer's hole compensation and no teardrop roof. An access hole is the smallest of the thread's clearance holes
wider than its hex key across the corners, the key of the head it is for (an M5 cap screw's is 4 mm, an M5 button
head's 3 mm), and no wider than the slot it is drilled in (and, right through, the slot it comes out in). Where no
clearance hole fits, it is the key's corners and `OP_DEFAULTS.key` (0.5 mm), up to the next tenth of a millimetre: an
M8 button head's 5 mm key (5.77 mm across its corners) takes a 6.3 mm hole, inside an 8 mm slot where M8's 8.4 mm
close clearance would cut the lips. A counterbore leaves `OP_DEFAULTS.seat` round the head. A hole through one
wall goes as deep as the first run of metal along its line through the section, worked out from the outline.

Each worked-out operation in `model.ops` keeps its `distance` from end a (0 and the length for the ends), its `face`
and `place` (`top.1`), its frame (`anchor`), its sizes, and `line`, its line on the sheet. They are in order along the
beam. In the solid, a tapped length is drawn over the thread's roots (its major diameter), so a screw drawn whole fits
it; the holes, pockets and notches are cut from the preview, and a mitre from the link as well, since it changes the
envelope an overlap check measures.

**A mitre** is measured on its long side: the beam's `length` is the long side's, and the mitre says so, with the
short side's length (`shortLength`). `{ op: 'mitre', at: 'a', angle: 45, about: 'top' }` on a 2040 cuts end a so that,
seen from the top, the back is the long side (the default; `long: 'front'` for the other way) and the front is 40 mm
shorter.

**What a check finds** (`beam.op`): a hole wider than a slot's opening, which breaks into its lips (and the far slot's,
right through); a hole that cuts into the side of a bore; a tap deeper than the bore runs, or taps from both ends that
meet; a hole that crosses a tapped thread; a hole whose edge leaves less than half its diameter of metal to an end
(`OP_DEFAULTS.edge`, warn), or runs off it (fail). Thread engagement is `@rulecad/fixings`' `engagement` in the beam's
alloy: a thread tapped in a 1.9 mm slot floor gets a warning that aluminium wants 2 diameters. Refused by name: an
operation the kit does not have, a key it does not take, an address of the wrong kind, a tap in a profile with no end
bore, a thread too small for the bore, two cuts at one end, a mitre that leaves no short side, and an operation on a
beam of a printed profile that is not said to be printed. On a printed beam the operations are features of the
print: holes sized by the printer (its hole compensation added), and a hole lying on its side as it prints a teardrop
(see [Printed beams](#printed-beams)).

### The solid

`beam(m, { display })` takes a beam's model, or a profile with the options `beamModel` takes. `display: 'link'` is a
plain box of the section's envelope (a round section is a twelve-sided prism), 12 triangles, for a link and an
overlap check. `'preview'` is the true section, every slot, bore and hollow, run the whole length: 872 triangles for a
2040. `tracks: true` cuts each V track from a link's box along the beam (the V mouth, and the opening under it to the
cavity's depth), so a V-wheel's rim running in its track is clear of it and a rim out of its track is not; on a beam
with no V track it is the plain box. The solid carries `.model` (the beam's model) and `.display`.

### Mass beside the sheet

The mass is worked out from the section and the alloy, so it says what the drawn or measured outline weighs. For a
section whose slots are fully dimensioned it comes within 2% of the sheet. A 300 mm 40 x 20, by maker:

| Profile | Mass, g | Sheet, g | Difference | Ix against the sheet | Iy against the sheet |
|---|---|---|---|---|---|
| MISUMI HFS5-2040 | 264.3 | 264 | +0.1% | +0.9% | 0.0% |
| item Profile 8 40x20 Line 5 | 264.6 | 267 | -0.9% | +0.2% | -0.3% |
| Bosch Rexroth 20x40 | 243.8 | 240 | +1.6% | +1.7% | +4.2% |

Light 40 mm sections (Bosch Rexroth 40x40L, item's light Line 8, Motedis I-type light, generic I-type 4040) have
hollows and hooked lips the dimensions do not describe, and come out 8 to 21% heavy. Their beams say so
(`beam.mass`, warn) and name the sheet's mass to use instead; their `figures` are the sheet's.

`printable(x)` takes a beam's model, its solid or a profile's model. A beam given `printed` gets its `beam.printable`
findings (below); any other beam, and a profile, fails: it is bought and cut, and what prints is the parts that fasten
to it.

## Printed beams

Aluminium is about twenty times as stiff as PLA and does not creep, so a printed beam suits a case, an enclosure or a
light frame, seldom a gantry. A beam given `printed` is a printed part: it has a mass from the plastic laid, it goes on
a plate, and it stays off the cut list.

```js
import { beamModel, printedBeam, spliceModel, splice, nutFor } from '@rulecad/frames';

const b = beamModel('2020-printed', { length: 240, printed: true, ends: 'tapped' });
b.printed.pose;            // 'lying': on its bottom face, its layers along it
b.mass;                    // 61.8 g of PLA at 3 walls and 40% infill
b.ends.a;                  // { kind: 'insert', thread: 'M4' }: a heat-set insert in place of a tap
printedBeam(b);            // the solid as it prints, on the bed from x = 0, for printcheck
nutFor(b.profile, 'top', 'M4', { kind: 'drop-in' }).name; // 'slot-nut-6-misumi-m4-drop-in'
```

`printed` is `true`, or `{ pose, walls, infill, end, pull, printer }`:

| Option | What | Default |
|---|---|---|
| `pose` | `lying`: on its bottom face, the layers along the beam, strong in bending. `standing`: on end a, the section the layer, exact, but bending across its layers | `lying` |
| `walls` | Lines of solid wall round every outline of the section | 3 |
| `infill` | The share of the inside the infill fills, 0 to 1 | 0.4 |
| `end` | What a tapped end becomes: `insert` (a heat-set insert) or `nut` (a captive nut slid in from the front face) | `insert` |
| `pull` | The design pull on a nut in its slot, N | 100 |
| `printer` | A printer's rule set or values | the kit's X1C |

A beam of a metal's profile printed is printed in PLA unless `material` names another plastic.

### Printable profiles

A standard slot does not print lying down. Its lips' undersides hang flat over the cavity when it faces up; facing
the bed its floor is a ceiling wider than a bridge; in a side face the upper lip's edge starts in mid-air. So the kit's
printable profiles have one slot, in the top face, with the undersides of its lips sloped at the printer's overhang
angle, and are solid below it. `printedProfile(series, { nut, printer, pull, material })` works one out:

- **The opening**: the slot family's, or its nuts' widest tongue and a fit, whichever is wider, plus the printer's
  hole compensation.
- **The cavity**: the widest of the family's nuts of that kind and a fit, the walls beside it a whole number of
  lines (the thickest that leave that room). A hex nut is held by its flats, so the cavity stays under its corners.
- **The lips**: the family's thickness in whole layers, thicker where the design pull needs it; their undersides at
  90° less the overhang (45° on the X1C), so a nut seats on its top corners, lower than under flat lips. `nutFit`
  measures its room from there and says so (`slot_nut.seat`).
- **The floor**: under the nut with a fit, its corners chamfered (no square inside corner).
- **The ends**: the largest thread whose heat-set insert, its wall and a line each side, fits under the slot
  (`end_thread`, `end_at`).

| Profile | Its slot takes | Opening | Cavity | Depth | Lip | End |
|---|---|---|---|---|---|---|
| `profile-1515-printed` | OpenBeam's M3 hex nut (`slot-nut-3-openbeam-m3-hex`) | 3.3 | 5.76 | 5.7 | 1.6 | M3 |
| `profile-2020-printed` | MISUMI's 6 mm slot drop-ins (M3, M4) | 6.1 | 10.76 | 7.85 | 2 | M4 |
| `profile-3030-printed` | MISUMI's 8 mm slot drop-ins (M3 to M6) | 8.1 | 15.72 | 11.55 | 2 | M6 |
| `profile-4040-printed` | MISUMI's 8 mm slot drop-ins (M3 to M6) | 8.1 | 15.64 | 11.55 | 2 | M8 |

Every figure in these sets is `derived`, its source naming the nuts and the printer's rules it comes from. Another
printer gives other figures: `printedProfile(20, { printer: { overhang: 50 } })` slopes the lips at 40°.

### A metal's profile printed standing up

A beam that needs a slot in more than its top face prints standing up from any profile, its section exact. A metal's
profile names no printed end, so standing up a tapped end takes its screw in the place of its one threaded bore: the
largest thread whose screw passes up the bore (its major no wider than the bore) and whose fixing fits the plastic
round the bore's middle, the bore itself left out. An insert's hole must be no narrower than the bore, with its wall
round it; a captive nut's corners need a line to spare. MISUMI's 2020 has a 4.2 mm bore and 4 mm of plastic round it:
an M4 insert needs 5.7 / 2 + 2.1 = 4.95 mm and does not fit (`beam.end` fails and says none does), and with
`"end": "nut"` an M3 nut needs 5.5 / cos 30° / 2 + 0.42 = 3.6 mm and does. Under a captive nut the bore is filled from
the end to the screw's hole's far end, so the 3.5 mm hole and the nut's slot are cut in plastic and the screw's hole
runs on into the bore.

A foot under such an end takes its thread: `footModel('2020-misumi-hfs5', { thread: 'M3' })` draws the counterbore
and the screw for M3 and says the screw goes into the printed end's own fixing (refused by name: a thread whose
screw does not pass the bore). `printedInPlace(b)` draws a printed beam in its own frame, as `beam()` does, with its
ends' inserts or nuts cut in: what an assembly checks a screw into its end against.

### What a printed beam is worth

`printedSection(profile, { walls, infill })` lays a shell `walls` lines thick inside every outline of the section and
counts the inside at the infill's share, on a raster of the outline. Its stiffness figures replace the profile's
(`figures`, every one `estimate`), the material's modulus is the one for the pose (`modulus` along the layers,
`modulus_z` across them), and the frame checks solve a printed beam with them. Its findings:

| Finding | What it says |
|---|---|
| `beam.printable` | How it prints and what stops it: a slot in a side face, lips that hang out, a bed slot's floor wider than a bridge, a hollow along it, a length past the bed (splice it) or past the printer's height |
| `beam.mass` | Its grams, the plastic laid by walls and infill, and how much of a solid section's stiffness it keeps |
| `beam.strength` | The moment it is designed to carry: the plastic's strength for its pose over twice the margin, times I over the furthest fibre |
| `beam.slot` | Each slot's hold in plastic on the widest nut made for it: the lips bending at their roots, and sloped lips pushing the side walls apart |
| `beam.end` | Each end's insert or captive nut, against the room round it |

Standing, a beam bends across its layers: on the material's `strength_z`, or 0.6 of its strength where it gives none
(PLA's sheet gives none; PETG's gives 0.68).

A slot's lips and side walls are each checked at the strength the way their bending stress runs. A plate bends with
its stress running from its root out across it. Lying down, a top slot's lips lie flat in the layers, so they bend
along them, and its side walls stand up through the layers, so their stress runs up them, across the layers. The
walls govern the kit's printed slots: `profile-2020-printed` holds 427 N on MISUMI's M4 drop-in in PLA (23.4 MPa
across the layers), 4.3 times a 100 N pull.

### Creep, and the beam coupon's figures

A printed beam in a frame holds its load for months, and plastic creeps under a held load. `beamCreep(b, { stress })`
(or `{ moment }` in N·mm, over the printed section's modulus) holds the sustained stress to `PRINTED_DEFAULTS.creep`,
0.15, of its strength for its pose: 5.1 MPa for PETG lying down, 3.45 MPa standing up. Over it fails `beam.creep`. With
`{ sag, limit }` it also says the sag it creeps to, the short-term sag over `PRINTED_DEFAULTS.creep_modulus` (0.5).
Both shares are estimates and the finding says so: printed PLA held at 0.3 of its strength broke within hours in one
study (Waseem et al., 2020), and the kit takes half that share with no long test behind it.

```js
const b = beamModel('profile-2020-printed', { length: 240, material: 'petg', printed: true });
beamCreep(b, { stress: 2.55 })    // { level: 'pass', code: 'beam.creep', values: { limit: 5.1, margin: 2, ... } }
beamCreep(b, { stress: 1, sag: 0.3, limit: 0.5 })   // fails: 0.3 mm creeps to about 0.6 mm
```

The beam coupon (`cad measured` from the bench's `beam-test`, MEASURE.md rows 38 and 39) measures what a printed beam
of walls and infill is worth. It writes four rules to the plastic's set: `beam_modulus` and `beam_strength` for a beam
printed lying down, `beam_modulus_z` and `beam_strength_z` standing up, each the figure that makes `printedSection`'s
section bend and break as the coupon did. A printed beam takes each before the plastic's own `modulus`, `strength` (or
their `_z`), says so in `beam.mass` (`b.printed.coupon` names the rules it took), and its creep limit follows the
strength measured. Until then its figures are the data sheet's and the section's estimates.

### A splice for a beam longer than the bed

`spliceModel(beam, { at, moment, thread })` joins two halves printed lying down with a lap. Over the lap the section
is cut upright down its middle: the half toward end a keeps its front side, the half toward end b its back side, so
every cut face stands upright and both halves print with no support. In the middle of the lap the cut steps sideways
into a key that locks the halves along the beam. Two screws cross the lap under the slot's floor: button heads in
seats in the front face, nuts in pockets in the back face, all on their side as teardrops, and the slot stays free for
its nuts. `splice(model)` draws the two halves as they print.

At each end of the lap one half carries the whole moment on its half of the section, and it still carries all of it
at its first screw, where the screw's hole and the head's seat (a) or the nut's pocket (b) cut that half section.
Between the screws the two of them pass the moment across as a couple, each pushing on the plastic of both halves. So
the joint carries the least of three things: the half toward a's section net of its holes at its first screw, the
same of the half toward b, each at the plastic's strength along its layers, and the screws' couple. A screw's share is the least of the plastic crushed under it, the plastic torn out to the bed or the
slot's floor (both across the layers, since the screw pushes up or down through them) and the screw sheared. The lap
starts at twice the height and grows until the screws carry what the joint must, or what the halves can if that is
less. The lap goes as far from the middle as the bed lets both halves be.

What the joint must carry is the moment given (`moment`, N·mm) times the margin of 2, or, with none given, what the
beam itself breaks at there: twice its design moment times 4 z (L - z) / L², a spread load on a simply supported span.
Half a section carries about half the whole, so a splice carries about half what the beam does, and with no moment
given `splice.strength` fails and says what moment it does carry. A 400 mm printed 2020 on the X1C: halves of 192.8
and 256 mm, its halves' sections 361 and 364 mm³ between the screws and 354 and 321 mm³ at their first screws (the
whole beam's 718 mm³), 12.5 N·m against the 27.3 N·m the beam breaks at there, so it fails. With 50 N hung in its
middle (5 N·m at most), it passes: M4 x 16 screws, each holding 435 N (torn out to the bed), on a 43.4 mm lap.

Where no splice fits, `spliceModel` refuses by name and says what would: the longest beam two halves hold on the bed
(twice the bed less the shortest lap, twice the height), the range a lap's middle may take, or, where the longest lap
the bed allows is still too weak, what it carries and the moment that fits.

## The cut list

A frame's beams, listed for the saw: `cutList(beams, { kerf?, trim?, tolerance?, stock? })` takes beams' models, or
`{ id, beam }` with each item's name.

```js
import { beamModel, cutList, cutListText, beamSheet } from '@rulecad/frames';

const beams = [300, 300, 260, 260].map((length, i) => ({ id: `x${i + 1}`, beam: beamModel('2020-misumi-hfs5', { length }) }));
const c = cutList(beams);
cutListText(c);              // the marks, then each profile's lengths, bars to buy and the cuts on each
beamSheet(c.marks[0].beam, { mark: 'A', items: c.marks[0].items }).svg; // its cut-and-drill sheet
```

Beams that are the same (one profile, one material, one length, and the same operations at the same places) share a
**mark**, A, B, C and on, by profile and then the longest first. Each mark in `c.marks` has `mark`, `profile`,
`material`, `length` (the long side where an end is mitred) and `shortLength`, `count`, `items`, `grams` each and
`weighedBy` (`sheet` where the maker gives a mass per metre, else `section`: a light 40 mm section is heavy when
weighed from its drawn outline), `ops` (each operation in a few words) and `beam` (the model).

Each profile's beams are packed into the lengths it is sold in (`lengths` in its set). Every cut takes the saw's
**kerf**, the last one on a bar too, as it parts the beam from the offcut. The first end of every bar is **trimmed**
square before the first beam is measured. Where a set gives no lengths but a cut-to-length range, the maker cuts each
beam and no bar is packed (`supply: 'cut'`). Where it gives neither, a 6 m bar is assumed (`supply: 'assumed'`, an
estimate). Each entry in `c.stock` has `cuts` (each length and how many), `buy` (each bar length and how many),
`bars` (each with its `cuts` in order, each cut's `at` measured from the bar's first end, and its `offcut`),
`unpacked`, `bought` and `offcut` in mm.

The packing is **first-fit decreasing**, a simple rule that does not always find the fewest bars: the longest beam
first, each onto the first bar with room for it, else onto a new bar. It runs once with each sold length as the new
bar's length (and once with the shortest that holds the beam), then cuts each bar down to the shortest sold length
that holds what is on it, and keeps the plan that buys the least metal, then the fewest bars. `packBars(pieces,
lengths, { kerf, trim })` is the packing alone. A box of twelve 2020 beams (four each of 300, 260 and 220 mm) buys
one 4000 mm MISUMI bar with an 834 mm offcut: four 1000 mm bars are also 4000 mm of metal, so the one bar wins.

| Rule (`CUT_DEFAULTS`) | Value | Kind | Source |
|---|---|---|---|
| `kerf` | 3 mm | default | A 250 mm, 80-tooth carbide blade for non-ferrous metals (Popular Tools NF2503080) cuts 3.0 mm |
| `trim` | 10 mm | estimate | A working allowance for a bruised or out-of-square mill end; no supplier's figure was found |
| `tolerance` | ±0.5 mm | estimate | MISUMI's for its cut lengths, used where a profile's set gives no `cut_tolerance` |
| `stock` | 6000 mm | estimate | The length Bosch Rexroth and item sell their profiles in, used where a set gives no lengths |

Give your own saw's figures as options (`cutList(beams, { kerf: 2.4 })`); `c.rules` holds the rules used, each with
`value`, `unit`, `rule`, `kind`, `source` and `checked`.

The checks (`c.findings`, code `frame.cut`):

| Level | When |
|---|---|
| fail | A beam longer than any length its profile is sold in, after the trim and one kerf, or than the maker cuts to |
| warn | Two marks of one profile whose lengths differ by less than two cuts' tolerance: they should match, or the saw cannot hold them apart |
| info | Two or more beams of one mark: each is cut to the tolerance, so they can differ by twice it; cut them against one stop where they must match |

### A cut-and-drill sheet

`beamSheet(beam, { mark, items, grams })` draws one SVG sheet for a beam, in mm, so it prints to scale at 100%. The
beam is drawn 1:1, 1:2, 1:5, 1:10 and on, the smallest that keeps it within 200 mm, and its section at end a at 4:1,
2:1 or 1:1. On it: the section seen from end a with top up and each face named, and each tapped bore with its thread
and depth; a view of each face that has work on it, or a mitre seen from it, with that face up and end a on the left,
every slot's centre line, and each operation numbered and dimensioned from end a to 0.1 mm; and the operations in
the order they are done (the ends cut, the holes from end a, the taps), each with its full line. A face only a few mm wide at a small scale is drawn wider across, and the
view says by how much. It returns `{ svg, scale, faces, dimensions }`, `dimensions` being each operation's figure as
the sheet prints it.

## Joins

A join names an end of one beam (`a`) and a place on another (`b`): a face with a distance from b's end a where
a's end meets it (`back@120`), or b's end for beams that meet end to end or at a corner. `joinModel` works out what
each kind of join does to both beams, the screws that hold it, and the stiffness it is taken to have.

```js
import { beamModel, joinModel } from '@rulecad/frames'

const post = beamModel('2020-misumi-hfs5', { length: 200 }), rail = beamModel('2020-misumi-hfs5', { length: 300 })
const j = joinModel('blind', { beam: post, end: 'a' }, { beam: rail, address: 'back@120' })

j.a.ops      // [{ op: 'tap', at: 'a.1', thread: 'M5', depth: 18.5 }]: the post's end bore tapped M5
j.b.ops      // [{ op: 'access', at: 'front.1@120', thread: 'M5', head: 'button', through: 'beam' }]: a hole for the button head's 3 mm key, across the rail
j.screws     // [{ screw: 'M5 button', thread: 'M5', head: 'button', bore: 'a.1' }]
j.stiffness  // { bending: 1500000, twist: 300000, end: { rx: 300000, ry: 1500000, rz: 1500000 }, kind: 'estimate', … }

beamModel(rail.profile, { length: 300, ops: j.b.ops })   // the rail with its access hole: Ø5.3 mm, 14 mm deep
```

In a blind join the screw goes into the tapped end of a, its button head slides into the slot of b, and a hex key
reaches the head through the access hole drilled across b from the opposite face, in line with the screw. The access
hole goes through every wall on its line (`through: 'beam'`) and stops at the slot the head sits in. An end-tap join
drills a clearance hole right across b instead, and the screw's cap head sits on the far face.

| Kind | What it is | `b` | What this release derives |
|---|---|---|---|
| `blind` | A tap in the end of a, a button-head screw in it, the head in a slot of b, an access hole across b | a face with a slot | The tap, the access hole, the screw |
| `end-tap` | A tap in the end of a, a cap screw through a hole drilled across b | a face | The tap, the clearance hole, the screw |
| `bracket` | A corner bracket with its slot nuts and screws | a face with a slot | Printed: nothing here, cad draws it (below); bought: the set's screws, nuts and stiffness (Bought fittings) |
| `gusset` | A flat plate (L, T or cross) over the joint | a face with a slot | Printed: as a bracket; bought: as a bracket |
| `cube` | A three-way corner taking the beam ends | an end | The stiffness; the corner later |
| `hidden` | A bought inner connector in the slots | a face with a slot | Bought: the set's stiffness; its grub screws are part of it |
| `anchor` | A bought anchor connector and its pocket | a face with a slot | Bought: the hole its guide needs, drilled across a, and the set's stiffness |
| `mitre` | Two mitred ends and a corner key or plate | an end | Both mitres, given `options.mitre` (cad works it out from where the beams are); the key later |
| `pivot` | A hinge or pivot, which also moves | a face with a slot | The stiffness; the pivot and its joint later |
| `splice` | Two beams end to end, with a joining plate | an end | Printed: as a bracket; bought: a straight plate's set, as a bracket |
| `printed` | A printed node that sockets the beam ends | a face or an end | The stiffness; the node later |

With `fitting: 'printed'`, a bracket, gusset or splice join has its fitting drawn by this release: `JOINS[kind].printed`
names the generator, `j.fitting.made` is true, and no warning is given. Where the fitting goes depends on where the
beams are, so the caller places it: cad's joins do (its README, Joins). With a bought fitting's set by name
(`fitting: 'fitting-motedis-bracket-20-b6'`), `j.fitting.bought` is that set's model and the stiffness is the set's
(below). A kind whose fitting is not chosen, or comes later, says so in a `join.fitting` warning that names what there
is, and adds no operations or screws. A join that
needs a slot on a closed face is a `join.geometry` failure, with nothing derived. Bad input is refused by name: an
unknown kind, an end with no bore to tap (a tube: join it with a bracket or a gusset), an end with two bores (give a
join for each, `a.1` and `a.2`), `b` the wrong sort of place for the kind, a screw or a fitting the kind does not
take.

The tap is as deep as the thread engagement asks in the beam's metal (two diameters in aluminium, from
`@rulecad/fixings`), with the screw's tip room and one and a half diameters more (`JOIN_TAP`), so that a screw of a
sold length both engages fully and stops short of the bottom. `options.screw` names another screw (`'M5x12 button'`).

That is deeper than a maker's own end tapping: MISUMI cuts M5 15 mm deep in its 2020 and M8 24 mm in its 3030 (the
profile's `bore_thread` rule, from its catalogue), where the kit taps 18.5 and 29 mm. The kit's depth is the one it
sizes from, for a workshop tapping its own ends; the screws it then chooses stop well inside the maker's depth too (a
foot's M5x16 through its 5 mm floor reaches 11 mm into the end, its M8x25 through 8 mm reaches 17 mm), so a beam
bought tapped serves, and `fasten.length` checks the screw against the tap drawn.

A mitre's cuts depend on where the beams are, so they are given: `options.mitre` is `{ angle, a: { about, long }, b:
{ about, long } }`, the angle each end is cut from square (45° for a square corner, 90° less half the angle between
the beams), the face each beam sees the corner on, and the side its length is measured on, the outside of the
corner. In an assembly, cad works these out from the two beams' ends.

### Stiffness

A frame's stiffness is set at its corners, and a joint's stiffness is the honest unknown. Each kind has a bending
and a twist stiffness in N mm/rad for a 20 mm series profile (`JOIN_STIFFNESS`), every one an estimate with its
reasoning in its rule. A profile of another size is scaled by the cube of its width over 20 mm, and a printed fitting
is taken at 0.3 of a bought one's (`JOIN_SCALE`), both estimates too. `joinStiffness(kind, beam, { fitting })` gives
the figures and the end join `@rulecad/fea/frame` takes (`{ rx: twist, ry: bending, rz: bending }`). The joint rig
(issue 264) measures them; until then a check that uses them says it rests on estimates. A bought fitting's set
carries its own `bending_stiffness` and `twist_stiffness`, which `boughtStiffness(kind, beam, fitting)` reads in
their place; no maker publishes one, so each set's is an estimate too, and its rule says where it comes from.

Measured figures live in a workspace's `joins` rule set (`JOIN_SET`, part `joins`). The kit has no file of it:
`joinRuleSet()` gives it as the kit starts it, each kind's `<kind>_bending` and `<kind>_twist` (a kind's hyphen as
an underscore: `end_tap_bending`) from `JOIN_STIFFNESS`, and for each kind a printed fitting can make, its
`<kind>_printed_share`: the joint's stiffness as a share of the fitting's own by finite elements, which leaves out
the slot nuts, the lips and where the faces touch (1, an estimate, until measured). cad measured writes the
workspace's copy from it. `joinStiffness(kind, beam, { given })` takes a figure of `given.sets.joins` before the
kit's, and its `measured` says the date each of bending and twist was measured, or null; `kind` is `measured` only
when both were. `joinModel` hands its `given` on, so a frame's joins take the workspace's figures.

## Bought fittings

A bought fitting is a rule set of part `fitting` in `@rulecad/rules`, read from its maker's drawing and shop page:
what it is (`fitting_kind`), the profile size and slot family it is made for, the screws it is fixed with (thread,
head, length, count) and the slot nut each goes into, where each screw passes into beam a and beam b (`holes_a`,
`holes_b`: x along the beam from the fitting's corner, y across the face), its sizes, a hole a beam needs drilled for
it, its price on the date checked (`cost`), and its stiffness. A join or a mount chooses printed or a bought set by
name; the list, the operations and the stiffness follow the choice.

```js
import { beamModel, joinModel, boughtFittingModel } from '@rulecad/frames'

const post = beamModel('2020-motedis-b6', { length: 200 }), rail = beamModel('2020-motedis-b6', { length: 300 })
const j = joinModel('bracket', { beam: post, end: 'a' }, { beam: rail, address: 'back@120' }, { fitting: 'fitting-motedis-bracket-20-b6' })

j.fitting.bought.screws   // an M4x8 cap into a hammer nut on each leg, 11 mm from the corner
j.stiffness               // { bending: 3000000, twist: 1000000, kind: 'estimate', bought: { set, rule, source }, … }
boughtFittingModel('fitting-motedis-foot-m6-d19', { profile: '2020-misumi-hfs5' }).findings
// fail fitting.fit: its stem is M6, and 2020-misumi-hfs5's end bore is tapped M5
```

| Set | What | Made for | Price |
|---|---|---|---|
| `fitting-motedis-bracket-20-b6` | Motedis' closed cast corner bracket, 18 mm, an M4x8 cap and a hammer nut on each leg | 20 mm, B-type 6 mm slot | 0.36 EUR |
| `fitting-motedis-plate-t-20` | Motedis' laser-cut aluminium T plate, 58 x 58 x 3 mm, five M5x8 caps into hammer nuts | 20 mm, B-type 6 mm slot | 1.21 EUR |
| `fitting-motedis-inner-20-b6` | Motedis' zinc die-cast inner connector, in the slots, two M5x6 grub screws | 20 mm, B-type 6 mm slot | 0.65 EUR |
| `fitting-misumi-hmj5` | MISUMI's centre joint: a post in a's centre bore, its head in b's slot, held by a guide in a 7.1 mm hole drilled across a 10 mm from its end | HFS5, 6 mm slot | not printed |
| `fitting-motedis-hinge-20` | Motedis' light polyamide hinge, 39 x 30 mm, four M4 holes | 20 x 20 | 0.87 EUR |
| `fitting-motedis-end-cap-20-b6` | Motedis' plastic end cap, 20 x 20 mm | 20 mm, B-type 6 mm slot | 0.07 EUR |
| `fitting-motedis-foot-m6-d19` | Motedis' levelling foot, a 19 mm base on an M6 x 40 stem | an end bore tapped M6 | 2.00 EUR |

Prices include 20% VAT, as the seller's page showed them on the date each was checked; screws and nuts are sold apart.

`boughtFittingModel(set, { profile, other })` checks the fitting against the profiles it goes on: their size, the
slot family its lugs and nuts are made for (by the slot's nut family), and a foot's stem against the end bore's
thread. Each mismatch is a `fitting.fit` failure that names what would fit. In a join a fitting that does not fit
places nothing. A set of the wrong kind for the join (a bracket on a `hidden` join), a plate of the wrong shape (a T
on a splice) and a name that is no set are refused by name. `boughtFitting(model, { pose: 'fit' })` draws a reference
solid from the set's figures, in the printed fittings' frames, so one placement serves both. A fitting that lies in
the slots (an inner or anchor connector) is drawn there.

A set of your own is a JSON file of part `fitting` in your workspace's `rules/`, each figure with its rule, kind,
source and date, as the kit's are; `given: { sets }` hands it to these functions. Pivot joins take no bought hinge
yet: the hinge goes on a door as an item.

## Printed fittings

A printed fitting is drawn from the rules of the profile it lies on, so one generator serves every profile: its
width is the face's cell (20 mm on a 2020, 40 on a 4040), its screws are the largest thread a slot nut is made for in
that slot (M5 in MISUMI's 6 mm slot, M8 in item's 8 mm slot), and a tongue on each leg keys into the slot. The
tongue is the slot's opening less the printer's fit on each side, and as deep as the lip less the tallest tongue of
that thread's slot nuts, less the fit, so it never meets the nut. It is broken round each screw, which passes the
opening clear of it.

```js
import { bracketModel, bracket, plateModel } from '@rulecad/frames'

const m = bracketModel('2020-misumi-hfs5')            // 100 N across beam a at its screw, by default
m.thickness, m.leg, m.screwAt                          // 6.4, 24, 18.05 (mm)
m.grams, m.margin, m.stiffness.linear                  // 6.71 g, 4.31 times under PLA's strength, 654 N/mm
m.load.what                                            // '100 N across beam a at the upright's screw, 18.05 mm from the corner, ...'
bracket(m)                                             // its solid, laid on its side to print
bracket(m, { pose: 'fit' })                            // in its fitted frame

bracketModel('4040-item-8')                            // the same generator: 40 mm wide, M8, 8.2 mm thick, 24.4 g
bracketModel('2020-misumi-hfs5', { brace: true })      // a web across its inside corner: about twice as stiff
plateModel('2020-misumi-hfs5', { shape: 'T' })         // a T gusset; 'L', 'cross', or 'splice' for a splice plate
```

How it is sized:

1. **The least thickness.** A leg or plate under a screw's head is no thinner than the thread's major diameter
   (`FITTING_DEFAULTS.least`), so the head's clamp does not dish it.
2. **From the load.** A bracket's design load is a force across beam a at the upright's screw, which opens or closes
   the corner; a plate's is a force in its plane across beam a at its farthest screw. Both default to 100 N
   (`FITTING_DEFAULTS.load`); give the load your frame carries. The part as drawn is bent by finite elements
   (`@rulecad/fea`, cubes at least three across the leg): the leg under the base screw's head is held, the load
   shared over the nodes under the other screw's head. Its thickness grows until the peak stress away from the
   screws is half the plastic's strength or less, and shrinks while it is under a third, so the margin lands at
   about twice (`margin`, `spread`).
3. **For a screw that is sold.** A screw into a slot nut must engage the nut's thread fully and stop short of the
   slot's floor, which leaves a window of a few tenths of a millimetre for its tip. The fitting is thickened, a layer
   at a time, until a length sold lands in that window on every leg (an M5x12 through 6.4 mm on a 2020), as cad's
   fasten check will hold it. The nut's thread is counted from where it seats: under the lips, or lower where they
   slope underneath (the printable profiles' slots: an M4 drop-in nut seats 3.95 mm down in the printable 2020, not 2).
   A plate whose beam a is of another profile (`{ other: '2020-printed' }`, the same face names) keys each arm into
   its own beam's slot and is thickened until a length sold fits both: a T gusset from MISUMI's 2020 onto the
   printable 2020 is 4.6 mm, M4x10 into MISUMI's slot and M4x12 into the printable one.

The finite elements' results are kept in memory, and in a cache handed in (`{ cache: { get, set } }`: cad keeps them
in `.cache/fitting`). Each fitting's findings, in the kit's one shape: `fitting.size`, `fitting.tongue`,
`fitting.screw`, `fitting.margin` (pass or fail at the named load), `fitting.stiffness`, `fitting.nut` and
`fitting.bearing` (a bracket's: each nut's rating and the head's bearing on the plastic, against twice the load),
`fitting.printable` and `fitting.mass`.

A bracket's frame: x along b's face away from a, y up a, z across, the corner line on the slots' centre. It prints
laid on its side: the whole L is its first layer, its screw holes are teardrops with their points cut flat just over
the round (a bridge of about 0.8 of the hole's radius), so a head's seat is whole out to its edge, and each tongue's
lower side leans 45°. A braced bracket fills its inside corner with a web two thicknesses along each leg, with a teardrop pocket
round each head through it for the head and the key, so its screws stand where an unbraced one's do. A plate's frame:
x along b, y along a, its contact face at z = 0. It prints contact face up, its tongues on top, its holes upright.
The inside corners are rounded: a bracket's by its thickness, a gusset's by half its arm's width.

| Stiffness | How it is read |
|---|---|
| `stiffness.linear` (N/mm) | The load over the loaded screw's mean movement along it |
| `stiffness.bending` (N mm/rad) | F s² / δ: the load times the screw's distance from the corner squared, over its movement. It is the fitting's own; the slot nuts, the lips and the screws are not in it, so a joint is softer, and the joint rig (issue 264) measures that |

## Panels and doors

A panel is a sheet of acrylic, polycarbonate or aluminium (`SHEETS`, each with its density from the maker's data
sheet and the thicknesses stockists commonly hold), cut to a size, its corners rounded 1 mm. Its mass is the sheet's
density times its volume less its holes. A thickness no stockist commonly holds is a `panel.thickness` warning.

The printed parts that hold it are drawn from the profile's, the thread's and the printer's rules, as the brackets are:

| Part | What it is | Prints |
|---|---|---|
| `panelClipModel(profile, { sheet })` | A block screwed into a slot nut on the slot's line, keyed by a tongue, reaching over the panel's edge with a step as deep as the sheet. The panel's edge goes `edge` from the slot's line (6.5 mm for M5 on a 2020) | On its side |
| `panelCornerModel(profile, { sheet })` | An L over a panel's corner where two beams meet, a screw into each slot past the crossing, the step's corner rounded where the panel's rounded corner sits | Top face down |
| `panelEdgeModel(profile, { sheet, length })` | A channel in a slot's opening with a groove for a thinner sheet. Refused where the walls would be thinner than two lines (a 5 mm sheet in a 6 mm opening) | Groove up |
| `slotCoverModel(profile, { length })` | A flange on the face, a stem in the opening, a barb under each lip leaning 45° | Flange down |
| `gasketStripModel({ gap, length })` | A hollow triangle of two-line walls leaning 30°, as high as a door's standoff and its squeeze, in PETG | On its base |

A door is a panel that stands off the faces on printed hinges:

| Part | What it is | Prints |
|---|---|---|
| `hingeModel(profile, { sheet })` | The frame's leaf on the hinge beam's face, two screws into slot nuts, its two knuckles risen over the beam's outer edge; the door's leaf on the door's outer face, its knuckle between them, two screws through the door into nuts; an M4 cap screw and lock nut for the pin | The frame's leaf as it lies, the door's face down, the pin's hole a teardrop |
| `handleModel({ sheet })` | A grip between two feet 64 mm apart, screwed from inside the door into a pilot in each foot | On its side |
| `latchModel(profile, { sheet, standoff })` | A turn button: a post screwed into a slot nut, a tab that turns over the door's edge | Tab down |
| `magnetCatchModel(profile, { standoff })` | A block under the door's edge with a disc magnet glued into its tower (its pocket the magnet and the printer's `fit`, its pull from `@rulecad/fixings`' `magnetSeatModel`); a steel washer stuck to the door is the strike | On its side |

The door stands off the faces by the frame's leaf, a button head and 1 mm (10.2 mm for M5 on a 2020), so it passes
over the heads. The hinge's axis lies over the beam's outer edge at the door's outer face, and the door's edge on the
hinge side stops a knuckle and 1 mm from it. Turned about that axis, every point of the door stays at the standoff or
higher from shut to 180°: the door swings out and away from the frame, never into it.

```js
import { panelModel, panelClipModel, hingeModel } from '@rulecad/frames'

panelModel('acrylic', 3, { size: [367, 287] }).grams   // 376.02
const c = panelClipModel('2020-misumi-hfs5', { sheet: 3 })
c.height, c.edge, c.grams, c.margin                    // 4.4 mm, 6.5 mm, 1.53 g, 2.43 at 30 N
const h = hingeModel('2020-misumi-hfs5', { sheet: 3 })
h.standoff, h.axis, h.grams, h.margin                  // 10.2 mm, [-10, 13.2], 10.16 g for both leaves, 13.9 at 50 N
```

Each part is sized from a named load by beam formulas (the formulas below) to about twice the margin, then made thick
enough that a screw sold engages its slot nut and stops short of the slot's floor, as a bracket is. The loads are
working figures (`PANEL_DEFAULTS.load`, 30 N pushing a panel out at one clip; `DOOR_DEFAULTS.load`, 50 N across a
hinge's pin; `DOOR_DEFAULTS.pull`, 100 N on a handle): give the loads your frame carries. The findings are the
brackets': `fitting.size`, `fitting.tongue`, `fitting.screw`, `fitting.margin` (said to be an estimate),
`fitting.printable`, `fitting.mass`, and a hinge's `fitting.pin` and `fitting.swing`.

## Services: cables, boards, supplies and fans

The parts that carry a machine's services on its frame, drawn from the same rules as the brackets:

| Part | What it is | Prints |
|---|---|---|
| `deviceMountModel(profile, { device, variant? })` | A plate for a bought board or supply, its holes read from the device's rule set (`mount_holes`, x then y for each, from its middle). A supply's tapped holes (`mount_hole_thread`, `mount_hole_reach`) take screws up from under the plate, sunk in counterbores, no further into the case than its maker allows. A board's plain holes (`mount_hole_diameter`) take the largest screw whose head sits whole on the board, down through it into pilots on bosses that stand it off its soldered leads. The plate is screwed into slot nuts past the device's body | A supply's top face down; a board's beam side down |
| `fanMountModel(profile, { size })` | A plate beside the beam for a 40, 60, 80, 92 or 120 mm fan (`FANS`), a round opening for the air, the fan's four screws through its corners into pilots | Beam side down |
| `dragChainEndModel(profile, { holes, screw })` | A plate for a drag chain's end bracket, its holes and screws from the chain maker's drawing | Beam side down |
| `dinRailAdapterModel(profile)` | A block that carries a TS35 top-hat rail (`DIN_RAIL`) across the beam, the rail screwed through its middle, the block screwed into the slot each side of it | Beam side down |
| `cableClipModel(profile, { cable })` | A stem through the slot's opening with barbs under its lips, a flange on the face and a ring that opens for the bundle to snap in. No screw: it goes in anywhere along the slot | On its side |
| `tieAnchorModel(profile)` | A block screwed into a slot nut with a tunnel across it beside the screw for a cable tie, its roof pointed so it needs no bridge | On its side |
| `spoolHolderModel(profile, { spool? })` | An arm out from a beam's side that a spool's bore hangs on, a lip at its tip, sized from the full spool's weight twice over | On its side |

`runClips(length, { pitch })` places clips along a run of slot: one at each end and evenly between, no more than the
pitch apart (100 mm by default).

```js
import { deviceMountModel } from '@rulecad/frames'
import supply from '@rulecad/rules/supply-24v.json' with { type: 'json' }
import shield from '@rulecad/rules/cnc-shield-v3.json' with { type: 'json' }

const s = deviceMountModel('2020-misumi-hfs5', { device: supply, variant: 'LRS-50-24' })
s.device.holes, s.device.length, s.grams      // [[-29, -13.85], [26, -13.85]], M3x5 (3 mm in, Mean Well's L), 27.66 g
const b = deviceMountModel('2020-misumi-hfs5', { device: shield })
b.device.thread, b.device.head, b.standoff    // M2.5, cap, 3 mm: an M3's head would overhang the Uno's edge
```

A supply's screws go in from under the plate, so where its holes lie over the beam the device is set to the side
(`offset`) until a key reaches each beside the beam: the LRS-50's holes, 0.5 mm off its middle line, move 13.35 mm
across a 2020. A device's x lies along the slot; `turn` (0, 90, 180, 270) turns it. A board's plate has a window
inside its holes to save plastic, and is checked at the beam's edge with the window out of its section. The parts
report `fitting.device` (the device's screws, their length and engagement), `fitting.head` (a board's screw and why),
and the brackets' `fitting.screw`, `fitting.margin`, `fitting.printable` and `fitting.mass`. A rule set with no
`mount_holes` is refused by name.

## Guides: a rail on a face

A guide puts linear motion on a beam. A miniature rail is a rule set in `@rulecad/rules` (`"part": "rail"`):
`rail-mgn7`, `rail-mgn9`, `rail-mgn12` and `rail-mgn15`, from HIWIN's MG Series catalogue. Each holds the rail (its
width, height, hole pitch, standard end distance, counterbored holes, screw, mass a metre and running parallelism) and
its standard carriage (`MGN12C`), with the long carriage (`MGN12H`) as a variant. A carriage has its length with and
without its seals, its tapped holes, its mass, its load ratings C and C0 and its moment ratings MR (roll about the
rail), MP (pitch, end over end) and MY (yaw, across the rail).

```js
import { railModel, guideFit, carriageMargin, railTerms, railJigModel } from '@rulecad/frames'

const m = railModel('rail-mgn12', { length: 300, variant: 'MGN12H' })
m.holes.length, m.rail.end, m.travel        // 12 holes 25 mm apart, 12.5 mm from each end; 254.2 mm of travel
guideFit(m, '2020-misumi-hfs5', { face: 'top', from: 50, beam: 400 }).nut.name   // slot-nut-6-misumi-m3-slide-in
carriageMargin(m, { force: [0, 0, -20], moment: [0, 40, 0] }).level              // 'fail': 40 N m against MP 36.26
railTerms(m, '2020-misumi-hfs5', { beam: 400 })   // parallelism, play, the beam's straightness and its sag, in mm
railJigModel('2020-misumi-hfs5', { rail: 'rail-mgn12' }).grams                    // 7.65 g of PLA
```

- **Holes.** A rail cut to a length keeps as many holes as leave each end at least the counterbore's radius and
  1 mm (`GUIDE_DEFAULTS.endLeast`), the rest shared between its two ends. Where an end comes out more than half the
  pitch from its hole, `guide.end` warns, as HIWIN advises, and names the two lengths that give the standard end.
- **Travel.** Each carriage rides its own share of the rail: the rail's length over the number of carriages. Its
  travel is that share less the carriage's length with its seal lips (`carriage_length_max`). A rail too short for
  its carriages is refused by name.
- **Fit.** `guideFit` says whether the rail bridges the slot's opening and sits within the face, whether a slot nut
  is made for that slot in the rail's thread (the nut, or the threads there are), and whether its ends are on the beam
  and clear of what crosses its face (`keep`, with `GUIDE_DEFAULTS.clear` between). Each is a `guide.fit` finding.
- **Loads.** `carriageMargin` holds a carriage's loads to its ratings: the force across the rail over C0 and each
  moment over its own rating, summed. The sum's inverse is the margin: under 1 it fails, under 2 it warns. The force
  along the rail is the drive's to take.
- **Error budget.** `railTerms` gives what a rail adds along its travel: its running parallelism for its length and
  its carriage's play, from its rule set; the beam's straightness over the rail, from the profile's; and the beam's
  sag under its own weight and the rail's, an estimate.
- **The jig.** `railJigModel` is a printed saddle that snaps over the beam, a key into the slot of each side face,
  with a channel over the rail that holds it on the beam's middle while its screws are tightened. Its keys are as
  deep as snapping it on allows at twice the margin, and it is as long as a 20 N push on the rail needs at twice
  the margin. It prints on its side with no supports.

A rail's frame: x along it from its end a, y across, z out of the face (0 on the face). A carriage's: its middle over
the rail on that face, x along the rail, z up. `rail(m)` and `carriage(m)` draw them; `railJig(m, { pose })` draws
the jig on its side to print, or fitted.

## Guides: wheels in a V-slot, and a printed slider

V-Slot's slots have a V mouth: a track a V-wheel runs on. A slot's rule set gives it as `track_width` (across the V at
the face) and `track_angle`. A wheel is a rule set too (`"part": "wheel"`): `v-wheel-solid` and `v-wheel-mini`,
OpenBuilds' Delrin wheels read off its drawings, each naming the bearings it runs on (`bearing-625`, `bearing-mr105`)
and the eccentric spacer that sets its preload (`eccentric-6-openbuilds`, `eccentric-mini-6-openbuilds`).

```js
import { trackFit, wheelsModel, wheelMargin, sliderModel } from '@rulecad/frames'

trackFit('2040-openbuilds', 'front', 'v-wheel-solid').seat     // { depth: 1.63, axle: 10.32, contact: [0, 1.455], ... }
const m = wheelsModel('2040-openbuilds', { wheel: 'v-wheel-solid', face: 'top', wheels: 4 })
m.wheels.map((w) => [w.x, w.y])   // [-20, -30.32], [20, -30.32] fixed; [-20, 30.32], [20, 30.32] on eccentrics
m.length, m.gap, m.grams          // 63.9 mm over its wheels; the plate 1.5 mm over the face; 24.5 g of PLA
wheelMargin(m, { force: [0, 0, -19.6], moment: [0, 0, 0] }).level   // 'pass': 2 kg, a quarter along each axle
wheelsModel('2040-misumi-hfs5', {})   // refused: its front face has slot-6-misumi, a plain T-slot with no V track ...
sliderModel('2020-misumi-hfs5', { mode: 'in', material: 'petg' })   // a block under the lips, 0.2 mm clear a side
```

- **The seat.** A wheel's flat tip enters the track until its flanks lie on the track's: the tip goes
  (track − flat) / 2 / tan(half the V) deep, and the axle stands the wheel's radius less that from the face.
  `trackFit` checks the tip clears the opening under the V and the flanks meet within it, and says where; each is a
  `guide.fit` finding. A face whose slot has no track (a plain T-slot), a closed face, or a V of another angle fails
  with why, and `wheelsModel` refuses it, naming what guides there instead (a rail or a slider).
- **The carriage.** A printed plate lies over the face `face` names; its wheels run in the slots of the two faces
  either side, of each the slot nearest the plate. Two wheels on one side turn on plain spacers; one or two on the
  other turn on eccentrics, drawn at mid-turn, where the wheel just seats. Turning an eccentric moves its wheel twice
  its offset (1.58 mm), which is the preload's range (`guide.preload`). The plate sits on the spacers, its gap over
  the face the spacer's height and half the wheel's bearings less the tracks' depth; a plate that would sit in the
  beam is refused. Its thickness is sized from its load (50 N unless given) at twice the margin, as a beam across
  between the rows of wheels; it prints upside down, its top the first layer. Its screws, lock nuts, washers and
  spacers are its `hardware`.
- **Beside the maker's plate.** `guide.seat` compares the seat with where OpenBuilds' own plate puts the axles across a
  20 mm rail. The wheels on one side are fixed, so the eccentrics on the other take up the whole difference, each up
  to its offset (0.79 mm) either way from mid-turn. For the mini wheel the seat is 31.85 mm against the plate's 31.9,
  0.05 mm, well within. For the solid wheel it is 40.64 mm against 39.7 mm, 0.94 mm, more than an eccentric can take
  up, so `guide.seat` warns: the rail's track (9.16 on its drawing) and the mini wheel agree, so the difference is in
  the solid wheel or its plate. Measure the track and the wheel across its rim before printing a plate for it.
- **Ratings.** Each wheel is rated from its plastic: the rim on the track by Hertz line contact at its allowed
  pressure (Delrin's compressive stress at 1% deformation), both flanks across the beam and one along the axle, under
  its bearings' static rating. `wheelMargin` shares a carriage's force and moment among its wheels
  (`WHEEL_DEFAULTS.share`) and holds each to its ratings, radial over radial plus axial over axial: under 1 it fails,
  under 2 it warns.
- **A slider.** `sliderModel` is a printed slider over a slot (a shoe on the face and a key in the opening) or in it
  (a block under the lips, a neck through the opening, put in from the beam's end). Its clearance a side is the
  printer's fit, its plastic the one named. Its friction (μ 0.3) and its pressure limit for wear (a tenth of its
  plastic's strength) are working figures, not measurements, and `guide.friction` says so.

A carriage's frame: x along the beam, y across, z out of the face the plate lies over (0 on it), its origin on the
face's middle line at the middle of the plate. A wheel's: z along its axle toward the plate, x toward the face it runs
on. `wheelPlate(m, { pose })` and `vWheel(m, { eccentric, collide })` draw them; `slider(m, { pose, tongues })` the slider.

## Guides: rods, a lead screw and an endstop

Two smooth rods along a beam's face carry a printed carriage on linear bearings; a lead screw between them drives it
from a motor at one end. Every part comes from a rule set: the rods (`rod-8`), the bearings (`lm8uu`, `lm8luu`), the
screw and its nut (`t8-screw`, `t8-nut`), the ball bearing the screw turns in (`bearing-608`), the coupler
(`coupler-5-8`), the motor (`28byj48`, `nema14`, `nema17`) and the switch (`endstop-10t85`).

```js
import { rodsLayout, rodHolderModel, motorPlateModel, rodCarriageModel, endstopMountModel, rodMargin } from '@rulecad/frames'

const L = rodsLayout('2020-misumi-hfs5', { screw: 't8-screw', motor: '28byj48' })
L.spacing, L.height                // 40 mm apart, 13 mm over the face: set by the 608 in a holder
rodHolderModel('2020-misumi-hfs5', { spacing: 40, height: 13, screw: 't8-screw', support: 'bearing-608', end: 'a' })
motorPlateModel('2020-misumi-hfs5', { motor: '28byj48', height: 13 })   // M4 through its ears, 6 mm thick, a coupler recess
motorPlateModel('2040-openbuilds', { motor: 'nema17' })                 // M3 into its thread on its 31 mm square
rodCarriageModel('2020-misumi-hfs5', { spacing: 40, height: 13, screw: 't8-screw', flag: { y: -24.4, z: -2 } })
endstopMountModel('2020-misumi-hfs5', { face: 'front' }).lever          // { x: 12.4, out: 14.4, reach: 12, width: 4 }
```

- **The layout.** The rods stand far enough apart for two bearing pockets with the lead nut's flange between them and
  1.5 mm of plastic each side (`ROD_DEFAULTS.web`), or close over the face where there is no screw. Their height over
  the face is the least that clears whatever needs most room under them: the carriage under its bearings, the nut's
  flange, the screw's ball bearing in a holder, the coupler and the motor's body (`L.needs` lists each). A spacing or
  height given that leaves too little room is refused, naming what needs it.
- **Saddles.** A holder and a motor plate stand across the beam, their legs down both side faces, a screw through
  each leg into that face's slot. The face the rods run over stays clear for the carriage, the coupler and the screw.
  The inside corners over the beam's corners have a round relief cut in them. A leg's thickness is what a sold screw
  takes into its slot nut; a holder is as thick along the beam as a rod's diameter or the ball bearing and a wall,
  and sized from a load along the beam at the rods' height (50 N unless given) to twice the margin. At end b the same
  holder is turned to face a (`end: 'b'`).
- **The motor plate.** The motor's mount is cut from its own rules: its mounting holes as clearance holes for the
  thread they take (a geared motor's plain ears take the largest metric screw that passes them, to a nut), the boss's
  pocket and the shaft's hole. The plate is at least half as thick again as those screws, as @rulecad/motors asks.
  Where the shaft would reach less than its diameter (or its flat) into a coupler past the plate, a recess in the
  inner face takes the coupler in. A longer shaft (a NEMA 17's 24 mm) goes half the coupler in and no further, the
  coupler standing clear of the plate, so the shaft stops short of the screw coming in from its other end. Two
  screws a leg hold the motor's torque by shear. It prints on its outer face,
  the boss's pocket ending in a 45° cone.
- **The carriage.** Two bearings press into pockets from its inner end over a 3 mm floor; the lead nut's body sits in
  a bore through its middle, its flange screwed to the far end into pilots, the screw the shortest sold that engages
  the plastic. With an endstop it has a flag at its far end that hangs beside the beam to just under the end of the
  switch's lever. It prints on its far end, the pockets opening up and the flag on the bed.
- **The endstop's mount.** A block on a side face's slot, the switch screwed to it through its own holes, its lever
  facing along the beam toward b, and the block's own screw ahead of the lever, its head sunk so the flag passes over.
- **The bearings' loads.** `rodMargin` shares a carriage's force across the rods between its two bearings, a roll as a
  couple across their spacing, and pitch and yaw as a couple along each bush half its length long
  (`ROD_DEFAULTS.couple`, an estimate); each bearing's radial load against its static rating.

Every part reports its grams, its margin at its load (`fitting.margin`), how it prints and its screws, and passes
printcheck as drawn. A part's frame is a mount's: x along the beam, y across, z out of the face (0 on it).

## Guides: a belt drive

A timing belt drives a rail's carriage along a beam: a pulley on a motor at end a, a toothed idler past the rail's
far end, and both ends of the belt held in a printed clamp on the carriage. Every part comes from a rule set: the
belt (`gt2-belt-6`, Gates's figures), the pulley (`pulley-gt2-20`, `pulley-gt2-16`), the idler
(`idler-gt2-toothed-20`) and the motor (`nema14`, `nema17`).

```js
import { beltLayout, beltRub, railModel } from '@rulecad/frames'

const m = railModel('rail-mgn12', { length: 300, variant: 'MGN12H' }), c = m.carriage, lane = m.lanes[0]
const L = beltLayout('2020-misumi-hfs5', { beam: 400, rail: { from: 30, length: 300, width: 12, height: 8 },
  carriage: { top: c.height, width: c.width, length: c.lengthMax, clearance: c.clearance, holes: c.holes, thread: c.thread, depth: c.depth, rest: lane.rest, travel: lane.travel } })
L.height, L.mmPerTurn                 // the belt 19.4 mm over the face; 40 mm of travel a turn
L.length, L.cut, L.buy                // a 810.3 mm path; cut 808 mm (404 teeth); buy 1000 mm
L.plate.grams, L.clamp.grams, L.block.grams   // 17.4, 4.4 and 18.6 g of PLA
beltRub(L).rubs                       // [] : the runs clear the beam, the rail, the carriage and the clamp
```

- **The layout.** The belt lies flat, its two runs side by side at one height over the face, clear over the
  carriage. The working run lies in the clamp's channel, beside the heads of the carriage's own tapped holes on one
  side; the pulley's and the idler's middles are half a pitch circle off it, so both runs are square to the travel.
  The belt's height is the least that leaves the clamp a 2 mm floor under its channel.
- **The motor's plate.** A flat plate on the face: its tab over the beam screws into the face's slot (two screws
  along it, as far apart as a slot nut is long), its far part past the beam's end holds the motor under it by its
  four tapped holes, the boss through a hole. It is as thick as the motor's screws ask (1.5 × their thread), as the
  bend at the beam's end asks (both spans pulling the pulley at the belt's height, and the motor's weight), and as the
  belt's height asks, then a thickness a sold slot screw suits. The pulley stands 1 mm over it on the shaft, its
  toothed band at its far end (`BELT_DEFAULTS.flange`, an estimate). It prints flat, every hole upright.
- **The clamp.** A block on the carriage's top, screwed through counterbores into two of the carriage's tapped holes
  with the shortest sold screw that goes the depth steel asks into the thread and no deeper than the thread is. Its
  channel is open on top, toothed on the wall the belt's teeth face, its floor rounded. Each belt end meshes at least
  `BELT_DEFAULTS.mesh` teeth, and as many as take its span's tension in shear at twice the margin. It prints as it sits.
- **The idler's block, the tensioner.** The idler turns on an M5 axle screwed into a heat-set insert, on a 1 mm ring
  under its inner race; behind it two screws go into slot nuts in the face's own slot. Loosened, the block slides along
  the slot: that slot is the tensioner's travel. It wants room each way for half the belt's stretch at its tension and
  half a pitch (the belt is cut to whole teeth), twice over; by default it is placed that far short of the beam's end.
  Where no sold screw length suits the block's height, their heads sit in counterbores. It prints as it sits.
- **The belt's length.** `beltPath` follows the belt's pitch line: the working runs from the clamp's ends to the
  pulley's and the idler's tops, half round each (exactly, by the outer tangent, where the two differ), the return run,
  and the ends inside the clamp. The belt is cut to whole teeth short enough that at its tension it stretches to the
  path with the block a little toward the rail, and bought by the metre (`BELT_DEFAULTS.sold`). A cut length given
  (`cut`) says where the block must sit, which cad's `belt.tensioner` holds to the room either side.
- **Rubbing.** `beltRub` takes each run as a band (the belt's thickness across it, its width over the face) at 21
  places along the carriage's travel, against the beam, the rail, the carriage and the clamp; a run that overlaps a
  part rubs it. The working runs end at the clamp, so they are not held against it.

Refused by name: a smooth idler inside the belt smaller than its maker's least (Gates's 25.4 mm for a smooth idler
on the teeth), a pulley whose bore is not the motor's shaft, a motor that is not square-bodied with four tapped
holes, a rail that starts under the plate, and an idler block that meets the rail or runs past the beam's end.

## Ends and feet

| Part | What it is | Prints |
|---|---|---|
| `endCapModel(profile)` | A plate the beam's outline, pegs pushed into each slot's opening and the bore, their roots chamfered 45°; `endCap(m, { tongues: false })` is the plate alone, as an overlap check measures it | Plate down |
| `footModel(profile)` | A pad 2 mm past the beam each way, screwed into the end's tapped bore through a counterbore in its underside | As it stands |
| `levellingFootModel(profile, { stud? })` | A body screwed into the end's bore and a pad that screws up and down a printed thread (10 mm of travel, one diameter always engaged): the first of `END_DEFAULTS.studs` (M12, Tr16x4, Tr20x4, Tr24x5) whose bore passes the end screw's head, so M12 on a 20 series (M5) and Tr20x4 on a 30 or 40 series (M8, a 13 mm head); `stud: 'Tr24x5'` names one. Or, with `stud: 'M8'`, an M8 nut sunk in the body for a bought foot's stud | As they stand, threads upright |
| `castorPlateModel(profile, { holes, thread })` | A plate for a castor whose hole spacing (from its maker's drawing) and bolts are given, screwed into the end's bore. Refused where the castor's bolts' heads would sit under the beam | Beam side down |
| `stackingFootModel(profile)` | A plate on the end with a socket under it that fits over the end of the same profile below | Beam side down |

A part screwed into the end says the tap the end needs (`ops`: `{ op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }`,
as a join's tap) and the screw sold that engages the aluminium and stops inside it. Where the end has several bores
it taps the threaded one alone, by its number (MISUMI's 3030: `a.1`, the 6.8 mm M8 bore, not its four 4.2 mm corner
holes); a tap op at a whole end does the same, taking every bore only where none is named for a thread. Each part's frame is the end's
address on the beam (`x1.a`): z out of the end, x along the beam's top. Seen from outside end a the section lies
mirrored, so a section's point (x, y) is at (y, x) there and at (y, −x) at end b.

## Jigs

A hand drill, a tap and a saw meet a drawing through a jig. Each jig here is drawn from a beam's operations, the
profile's rules and the printer's, prints without supports on a plain first layer, and reports its grams and its
margin at a named load (`JIG_DEFAULTS.load`, 20 N: a hand pressing it on, or a tool pushing sideways).

```js
import { beamModel, drillGuideModel, drillGuide, tapGuideModel, lengthStopModel, squareCornerModel } from '@rulecad/frames'

const b = beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'access', at: 'front@30', thread: 'M5', through: 'beam' }, { op: 'tap', at: 'a' }] })
const g = drillGuideModel(b, b.ops.findIndex((x) => x.op === 'access'))
g.bush             // { drill: 5.3, diameter: 5.5, length: 10.6, at: [0, 30], within: 0.05, lean: 0.54, sheet: 30 }
g.grams            // 11.96 g of PLA, 6.66 times under its load
drillGuide(g, { pose: 'fit' })   // on the beam, in the beam's frame: its bore 30 mm from end a, where the sheet puts the hole
tapGuideModel(b, b.ops.find((x) => x.op === 'tap')).lean            // 0.57°: the most the tap leans in its 10 mm bore
lengthStopModel('2020-misumi-hfs5', 300).gauge                       // 2 pieces of 150 mm
squareCornerModel({ profile: '2020-misumi-hfs5' }, { profile: '2020-misumi-hfs5' }).square   // 0.17°
squareCornerModel({ profile: '2020-misumi-hfs5', end: 'b', length: 260 }, { profile: '2020-misumi-hfs5' }, { hand: 'left' }).name   // square-corner-2020-misumi-hfs5-left
```

| Jig | What it is | Prints |
|---|---|---|
| `drillGuideModel(beam, op, { from? })` | For a hole across a beam (access, drill, counterbore): a plate on the drilled face with a stop on the nearer end (or `from`), a tongue in the face's slot, and a bush for the drill at the sheet's dimension on the slot's centre line. Refused where the face is closed, or the hole is too far from both ends for the bed | Outer face down, the stop and tongue standing up, the bush upright |
| `tapGuideModel(beam, op, { shank? })` | For a tapped end: a cap over the end, a sleeve round the section, and a bore over each tapped bore that holds the tap square | Outer face down, the sleeve standing up |
| `lengthStopModel(profile, length)` | For one length: a block a spring clamp holds against the saw's fence or a mitre box's back, and a gauge as long as the cut, in pieces no longer than the bed takes, that sets the block from the blade's near side | Flat, every edge on the table chamfered by the printer's `chamfer` |
| `squareCornerModel(a, b, { hand? })` | For two beams meeting square: an L on a face of each in one plane, a tongue in each slot, that holds them square while the join is tightened. Its arm b runs along b one way only: right-handed along n x u (n: a's face's outward normal; u: along a, away from b), left-handed the other way. Where a meets b near b's end, only one hand lies on b, so choose the hand whose arm runs along b | Outer face down, the tongues on top |

`drillGuide`, `tapGuide`, `lengthStop` (`{ part: 'block' \| 'gauge' }`) and `squareCorner` draw them, each in its
print pose; each but the length stop also `{ pose: 'fit' }`, on the beam in the beam's frame (a squaring corner on
beam a, from the end given as `a.end`, with `a.length` where that end is b). Each takes a
`mark`, a 2D outline cut 0.4 mm into a face that faces up as it prints, so a jig says which beam it is for. The
print frames are in the header of `jig.mjs`.

Sizes come from the rules. A bush is the drill (or the tap's shank) plus the printer's `slip` and `hole_comp`, and
guides it over `JIG_DEFAULTS.bush` (2) diameters. A tongue is the slot's opening less the printer's `slip`, and its
lip less the `fit` deep. A drill guide's stop is as thick as keeps it from bending more than `JIG_DEFAULTS.within`
(0.05 mm) under the load. @rulecad/cad generates the whole set from an assembly: `cad beams <project>/<assembly>
--jigs`.

## Squaring a frame

A rectangular bay is square when its two diagonals are equal. A tape from one inside corner to the opposite one, then
across the other two, measures it, and the difference between the two readings says how far the bay leans.
`squareness(width, height, { tolerance? })` gives the diagonal of an opening (inside face to inside face) and the
difference to accept: what the cut tolerance of the beams allows with every corner square. Two opposite sides cut to
±t can differ by 2t, which moves one diagonal against the other by up to 2t times that side over the diagonal; the
longer side gives the most.

```js
import { squareness } from '@rulecad/frames'

const q = squareness(260, 200)   // a 260 × 200 mm opening, beams cut to ±0.5 mm (CUT_DEFAULTS.tolerance)
q.diagonal   // 328.02 mm, each
q.accept     // 0.79 mm: the most the two may differ by
q.lean       // 0.143°: a bay leaning by that much has diagonals that differ by 0.79 mm
squareness(260, 200, { tolerance: 0.1 }).accept   // 0.16 mm, for a saw that holds 0.1 mm
```

A bay whose diagonals differ by more than `accept` leans: loosen its joins, push the corners at the ends of the long
diagonal together, tighten and measure again.

The terms stack as an arm's error budget stacks its joints. `cuts` names the beams whose cut lengths set the opening,
each along the width or the height: a beam cut t long moves one diagonal against the other by t × span / d. `plays`
names each join's play s along the beam it meets (`JOIN_PLAY[kind].value`, an estimate for every kind), which moves a
corner along that beam, s × span / d. `accept` is their sum, the worst case, and `rss` their root-sum-square; `terms`
lists each one's share.

```js
import { squareness, JOIN_PLAY } from '@rulecad/frames'

const slip = JOIN_PLAY.blind.value   // 0.1 mm
const cuts = [{ name: 'x1', along: 'width' }, { name: 'x3', along: 'width' }]
const plays = ['width', 'width', 'height', 'height'].map((along, i) => ({ name: `j${i + 1}`, along, slip }))
const q = squareness(260, 200, { cuts, plays })
q.accept   // 1.07 mm: 2 × 0.5 × 260 / d + 2 × 0.1 × 260 / d + 2 × 0.1 × 200 / d, d = 328.02
q.rss      // 0.58 mm
squareness(260, 200, { cuts, plays, tolerance: 1 }).accept   // 1.87 mm: the cut terms double, 0.79 mm more
```

@rulecad/cad finds every bay of an assembly (four beams joined in a rectangle in one plane), names the beams whose
ends butt the bay's others as its cuts and the joins between them as its plays, and puts its diagonals on the frame's
build (`cad order`) and in `frame.square`.

| Figure | Formula | Source |
|---|---|---|
| A diagonal | d = √(w² + h²) | Pythagoras |
| A side's share of the diagonal difference | x × side / d for a change x in that side | ∂d/∂w = w / d |
| The lean a difference stands for | δ = difference × d / (2 w h) | Diagonals √(w² + h² ± 2 w h sin δ) of a bay leaning by δ |
| A join's play | 0.1 to 0.3 mm by kind; end-tap 0.25 | `JOIN_PLAY`: estimates; end-tap is half ISO 273's medium clearance for M5 (5.5 mm) |

## Slot nuts

A slot nut is a rule set in `@rulecad/rules` (`"part": "slot_nut"`), one for each maker, slot, thread and kind:
`slot-nut-6-misumi-m5-slide-in`, `slot-nut-8-bosch-m6-drop-in`, `slot-nut-6-openbuilds-m5-drop-in`. The kinds are
`slide-in` (a block slid in from an open end), `drop-in` (put in through the opening and turned), `roll-in` (tipped in
and rolled flat, often on a spring or a sprung ball), `hammer` (turns itself as the screw is tightened), `square` (a
plain plate) and `t-bolt` (a bolt with a T head). Published so far, for the 6 mm slot of the 20 mm series and the 8 mm
slot of the 30 and 40 mm series, M3 to M8 where they are made: MISUMI's, Bosch Rexroth's, Motedis' and OpenBuilds'.

A nut's frame is its slot's: x along the slot, y across it, z out of the face, the face at z = 0. It is drawn pulled up
under the lips, as it sits once its screw is tight.

| Export | What |
|---|---|
| `slotNutModel(name, change?, given?)` | A nut's model: `slot`, `thread`, `nutKind`, `entry`, `length` (along the slot), `width` (across), `height` (the body under the lips), `tongueWidth` and `tongueHeight` (the step up into the opening), `boltLength`, `hold` (the figure, newtons), `holdAlong` (the pull along the slot at which it slips, tightened, from the set's `hold_along`: no maker publishes it, so only a set measured on the joint rig has it), `torque`, `material`, `volume`, `mass` (grams), `figures`, `findings` |
| `nutFit(nut, slot)` | How it sits: `slot_nut.fit` fail where it is wider than the cavity (a turned nut may be as wide: it turns until it jams), no wider than the opening, taller than the room under the lips, or its tongue wider than the opening; warn where its tongue stands proud of the face. `slot_nut.entry` warn where a turned nut is longer than the opening is wide |
| `slotNut(nut, { at?, display? })` | Its reference solid: body, tongue, the thread's hole; a T-bolt's shank. `display: 'link'` is the body alone |
| `nutFor(profile, face, thread, { kind?, given? })` | The nut for that face: one made for the slot's nut family (a slot's `nut_family`), of that thread and kind (any kind where none is asked), that fits; the strongest first. Its `others` name the rest that would do. Refused by name where there is none, naming the nuts made for that slot, and other families' nuts that fit it by their sizes |

```js
nutFor('profile-2020-openbuilds', 'top', 'M5', { kind: 'drop-in' }).name; // 'slot-nut-6-openbuilds-m5-drop-in'
nutFor('profile-2020-openbuilds', 'top', 'M8');
// throws: nutFor: no M8 nut is made for profile-2020-openbuilds's top face (slot-6-openbuilds, nut family
// slot-6-openbuilds). Made for it: M5 drop-in (slot-nut-6-openbuilds-m5-drop-in). ...
```

`NUT_KINDS` lists the kinds as a nut set's `nut_kind` takes them. A nut's `entry` says how it goes in: `end` (a
slide-in or square nut, only from an open end of the slot) or `anywhere` (through the opening). In an assembly,
`@rulecad/cad` reads a `fasten` into a slot (`"into": "x1.top"`) through `nutFor`, holds each screw to a slot's centre
line, and fails a nut whose entry is `end` in a slot closed at both ends by joins (`frame.nut`), or lists it to load
before the join that closes its way in (`frame.preload`).

**What a nut holds.** `hold` is the pull straight out of the slot. Bosch Rexroth rates its nuts (Fmax: 1700 N for the
6 mm T-nut, 3000 N for the 6 mm sliding block with M5, 4000 N for the 8 mm T-nut and T-bolt, 6000 N for the 8 mm
sliding block with M8, 2200 N for the 8 mm swivel-in block): those are `spec`. MISUMI gives a tightening torque, and
Motedis and OpenBuilds give nothing, so their nuts carry an `estimate`: Rexroth's figure for the same kind in the same
slot (a hammer nut as a T-nut, whose shape it has; a roll-in as Rexroth's share of a roll-in to a sliding block; a thin
plate as half a sliding block), and never more than the screw's proof load. Each says so in its rule, until Frames
2.13 tests them.

**Mass.** A nut's mass is its drawn block (body, tongue, less the thread's hole) at steel's density, or stainless
steel's: a list's grams. A nut with a shaped underside (a sprung or rolled nut) weighs less than its block.

### A printed carrier

`carrierModel(where, { thread, holds?, face?, length?, count?, pitch?, load?, printer?, material? })` is a block that
slides along a slot like a slide-in nut, printed, holding a hex nut or a heat-set insert. `where` is a slot, or a profile
with its `face`. It is drawn from the slot's own rules: the cavity offset in by the printer's `slot_fit` where it has one (measured on
the slot coupon, below) or else its `fit` (0.2 mm on the X1C), the corners met where the cavity's corner is convex and rounded about the corner where it is re-entrant, so it
stands that far clear of every point of the slot and its inside corners at the tongue are round. It lies floor down to
print: its flanks face down at the slot's flank angle (45° in every published slot), within the printer's overhang, and
its first layer is one solid piece.

- **A nut** (`holds: 'nut'`, the default) slides into a slot across the screw from the side, cut by
  `@rulecad/fixings`' `nutTrap` (its slip and the printer's bridge, its roof rising at 45° where it spans more), its
  corners across the slot, as low as it goes with 3 layers of floor under it, one line of plastic beside it and two
  over it. Where the carrier is too narrow for that, one carrier takes its nut from its end, flats across. The screw's
  clearance hole runs right through.
- **An insert** (`holds: 'insert'`) is pressed in from below, into `fixings`' insert hole, so the screw's pull drives it
  further in; refused where the plastic round it is thinner than the insert's `insert_wall`.
- **A strip**: `count` carriers in one piece, `pitch` mm apart.
- **Sized from the load**: with `load` (N, on each nut) the length grows until it holds twice the load
  (`CARRIER_DEFAULTS.margin`), and `carrier.hold` fails where no length does (the plastic over the nut decides).

Its model has `section` (in the slot's frame), `cavity`, `clearance`, `least` (its nearest approach to the slot),
`levels` (depths below the face: top, bottom, shoulder, the nut's or insert's), `length`, `total`, `at`, `hold`
(`{ value, punch, shoulders, shear }`), `margin`, `volume`, `grams`, `overhang` and its findings: `carrier.fit`,
`carrier.printable`, `carrier.first-layer`, `carrier.hold`, `carrier.mass`, and the nut trap's `nutTrap.printable`.
`carrier(m, { pose })` is its solid in the slot's frame, or laid on the bed with `pose: 'print'`.

| Carrier | Length | Clear of the slot | Holds (estimate) | Grams (PLA) |
|---|---|---|---|---|
| M5 nut in MISUMI's 8 mm slot (HFS6-3030) | 13 mm | 0.2 mm | 624 N (the 1 mm over the nut) | 0.94 |
| M4 nut in Rexroth's 8 mm slot (30x30) | 12 mm | 0.2 mm | 1802 N | 1.05 |
| M3 nut in MISUMI's 6 mm slot (HFS5-2020), from its end | 11 mm | 0.2 mm | 794 N | 0.39 |
| M3 insert in MISUMI's 8 mm slot | 12 mm | 0.2 mm | 618 N | 1.51 |
| Four M5 nuts at 20 mm in MISUMI's 8 mm slot | 73 mm | 0.2 mm | 624 N each | 6.63 |

An M5 nut does not fit a carrier in a 6 mm slot (8 mm across its flats in a slot 5.6 mm deep once clear of it): it is
refused, naming a smaller thread, an insert or a larger slot.

### Your own slot, measured

Slots of the same name differ between makers by tenths of a millimetre, and an unbranded beam's figures are only
`community` ones. The [slot coupon](https://github.com/JoniBach/rulecad/tree/main/examples/bench/projects/benchmarks) (`slot-coupon`,
with its steps in that folder's `MEASURE.md`, rows 29 to 33) is one print of loose pieces for slot 6 and slot 8: five
tongues and five carriers at 0.1 to 0.3 mm a side, and three short printed slots. Slide each into your own beam, measure
the slot by caliper, and `cad measured` writes the results back: the fit to the printer's rule set as `slot_fit` (and
`printed_slot_fit` for a slot printed in a part), the slot's figures to your workspace's copy of its set, each marked
`measured`. A carrier is then drawn from them: hand the printer in (`{ printer: v.x1c }` in a design), and
`carrierModel` takes its `slot_fit` before its `fit`; a design's `v.frames` reads the workspace's slot sets before the
kit's.

## Frames from a size

A frame can be asked for by the volume it encloses or the one it must fit in. Each generator gives plain data: its
beams placed by their ends, the joins between them, the fittings for the ends no join covers, and any panels, so
the result can be built, checked, written out and edited by hand.

```js
import { box } from '@rulecad/frames';
const m = box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', join: 'blind', feet: 'levelling' });
m.outside;  // [340, 340, 408.5]: the bottom ring raised 18.5 mm, clear of the feet's taps (below)
m.lengths;  // [{ length: 408.5, count: 4, ids: ['z1', 'z2', 'z3', 'z4'] }, { length: 300, count: 8, ids: ['x1', ..] }]
m.joins[0]; // { kind: 'blind', a: 'x1.a', b: 'z1.back@28.5' }
m.ends[0];  // { id: 'foot-z1', at: 'z1.a', fitting: 'levelling-foot', role: 'foot', tap: { op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }, screw: 'M5 cap' }
```

| Generator | What it is | Size |
|---|---|---|
| `box(o)` | Four upright beams (`z1` to `z4`) and a ring of four beams at the bottom and at the top | `[width, depth, height]` |
| `portal(o)` | Two legs and a beam across their tops, standing in the x-z plane. It lies in one plane, so it stands only with its feet held down (bolted to a bench or a wall); cad refuses a generated portal until `frame.supports` says so | `[width, height]` |
| `table(o)` | Four legs and a ring at the top; the height is the clear height under the ring | `[width, depth, height]` |
| `gantry(o)` | A box without its top beams across, and a beam `g` lying across the two top side beams, riding along y (`moving`: its track, direction and travel) | `[width, depth, height]` |
| `shelf(o)` | A box with `shelves` rings between (default 1), spacing its height into equal clear bays | `[width, depth, height]` |

`frameModel(kind, o)` is any of them by name. The options: `inside` or `outside` (one of them), `profile` (square:
2020, 3030, 4040), `join` (a kind, or `{ kind, fitting, screw, nut }`), `feet` (`foot`, `levelling`, `castor`, `stacking`,
or a bought set's name), `caps` (`true`, `false` or a bought set's name), `braces` and `panels.sides` (the upright
sides `front`, `back`, `left`, `right`), `panels` (`{ sheet, thickness, sides }`), `shelves`, and `given` (other rule
sets, as `profileModel` takes them).

The corners follow the join (`FRAME_JOINS`):

- A join against a face (blind, end-tap, bracket, gusset, hidden, anchor): the upright beams run the whole height and
  every other beam butts against their faces. The outside is the inside plus the profile's width `p` on each side,
  `inside + 2p`, and a butting beam is its outside span less `p` at each end, the inside. A box round 300 x 300 x 350
  in 2020 has uprights of 350 + 2 x 20 = 390 mm and butting beams of 300 mm; in 3030, 410 and 300 mm. Each join meets
  its upright's face on the beam's centre line, `p / 2` from the frame's outside.
- An end-tap join: its screw passes a clearance hole drilled right across the upright (ISO 273's medium series for the
  end thread), which comes out through the slot on both sides. Where the hole is wider than the slot's opening it
  breaks the lips (`beam.op` warns twice a join), so the generators refuse end-tap there by name, with both figures
  and the joins to use instead. Of the kit's profiles, MISUMI's 2020 (M5, 5.5 mm in a 6 mm opening) and OpenBuilds'
  2020 (5.5 mm in 6.25 mm) take it; item's 2020 (5.5 in 5), Bosch's 2020 (M6, 6.6 in 6), item's 3030 (6.6 in 6.2),
  MISUMI's and Bosch's 3030 and item's 4040 (M8, 9 in 8), and MISUMI's and Bosch's 4040 (M12, 13.5 in 10) do not, and
  no smaller thread cuts in their end bores. Its screw runs right across the upright, so two at one height (one from
  a beam across, one from a beam along) would cross inside it. Each ring's beams along y stand one width above its beams across x (a table's one
  width below), and each ring takes `2p` of the height: a box round 400 x 250 x 300 in 2020 stands 300 + 4 x 20 = 380
  mm high.
- A cube join: every beam butts into a corner node, so each is as long as the inside it bounds, and the node takes
  the `p` x `p` x `p` corner.
- A table adds `p` to the height (its ring), a gantry `3p` (both rings and its moving beam), a portal `2p` to the
  width and `p` to the height.

Where an end has several bores (`3030-misumi-hfs6`), a blind or end-tap join screws into the threaded one nearest the
middle (`x1.a.1`). A gantry's moving beam stops `FRAME_GEN.clear` (2 mm, a working figure) short of the uprights at
each end of its travel; it lies on the top side beams between the uprights' tops, which run one width above the side
beams, so its top is the outside height. A printed fitting (`{ kind: 'bracket', fitting: 'printed' }`, or a gusset)
sits on nuts that go in through the slot's opening, since every butting beam is shut at both ends by its joins and a
slide-in nut could not reach its place: the first of drop-in, roll-in, hammer and t-bolt the kit has for the slot
(drop-in on MISUMI's 2020, roll-in on item's 4040). `nut` names one of those; slide-in, a kind the kit has none of for
the slot, or a nut with no printed fitting is refused. A printed gusset's join names the upright's face that looks out
of the frame (`face`), so the plate never lands on the face where the corner's third beam butts. On a gantry's top
side beams it also names `shape: 'L'`: the uprights run one width above those beams, room for a T's bar, but the
inside round between that bar and the arm along the side beam would stand where the moving beam's end and end cap
pass at either end of its travel. Braces put a printed
corner bracket, on the same nuts, at each join of the sides named; a panel is one sheet over a side, from its lowest
beam to its highest.

A printed foot (`foot`, `levelling`, `stacking`) is screwed into its upright's end bore: its end carries the `tap`
the foot's own model asks for and the `screw` that holds it, for the assembly to tap and fasten. A join that drills
the uprights where a butting beam meets them (blind, end-tap, hidden, anchor: an access or clearance hole across the
upright, on the ring's centre line) would cross that tap at the bottom ring, so the bottom ring rises up the uprights
by the tap's depth (`lift`), and every ring with it. The inside stays as asked; the outside height grows by `lift`.
In 2020 on levelling feet: the tap is M5, 18.5 mm deep; the bottom ring's centre line moves from 10 to 28.5 mm up,
so its Ø5.3 access holes span 25.85 to 31.15 mm, clear of the tap; the uprights are 350 + 2 x 20 + 18.5 = 408.5 mm.
A bracket or gusset on slot nuts drills nothing in the uprights, and its bottom ring stays at `p / 2`. A bought foot
says its own tap, and lifts nothing.

A slot nut's solid (`slotNut`) is its block cut back to its slot's cavity: its sides are shaped to the flanks it sits
on, so two nuts at one height in neighbouring slots of a beam stand apart, as they do in the aluminium. Its mass stays
the whole block's, up to 12 % heavy.

Refused by name: an unknown kind or option, no size or both, a size that leaves no room inside, a profile that is not
square, a join no generator arranges, a blind or end-tap join on a profile with no bore in its ends, a blind or
end-tap screw wider than the slot's opening (M12 in the 10 mm slots of MISUMI's and Bosch's 4040), an end-tap
screw whose clearance hole across the post (ISO 273's medium series) is wider than the slot's opening (see below), a
`join.screw`
whose thread is no wider than the end bore it is cut in (M8 in MISUMI's 10.5 mm bore, M4 in item's 4.3 mm one), a
blind join's head that does not go into the slot's cavity or under its lips (Bosch's 2020: an M6 button head 3.3 mm
high under 3 mm lips), a printed fitting or braces on a slot the kit has no nut for that goes
in through its opening (item's 3030), feet on a box, shelf or gantry with cube corners (no upright end reaches the
floor), braces with cube corners, and a side with no bay.

Each refusal names what is left: the screws from M3 to M12 that would fit (as `join.screw`), and the other joins the
generator takes for that profile, each one that checks clean: a screw or an end-tap join is named only where its
clearance hole across the post fits the slot's opening. Some profiles have none of those. In MISUMI's and Bosch's 4040 no thread both cuts in
the end bore (10.5 and 10 mm) and passes the 10 mm opening, so they take no blind or end-tap join, and the kit has no
slot nut for their 10 mm slots, so no printed fitting either. What is left there: a bracket or gusset with no fitting,
taken and checked by its estimate (`join.fitting` warns that no fitting is drawn for it), or a slot nut set of your own
in `given.sets` with a printed bracket or gusset.

### Profiles as choices for sizing

`profileChoices(profileModel('2040-misumi-hfs5'))` gives a profile as the choices `@rulecad/fea/frame`'s `sizing`
takes, so a frame's beams can be given the lightest profiles that meet its limits (cad does this for
`"frame": { "size" }`):

```js
const [flat, edge] = profileChoices(profileModel('2040-misumi-hfs5'));
flat;  // { name: '2040-misumi-hfs5', roll: 0, section: { A: 324, Iy: 13580, Iz: 51300, J, Wy, Wz }, material: { E: 69972, nu: 0.33, density: 2.7, strength: 205 }, mass: 0.88 }
edge;  // the same, named '2040-misumi-hfs5 turned', roll: 90: standing on edge
```

The section is in a beam's own axes: `Iy` is the profile's `inertia_x`, which resists bending across its height (a
beam's top is the section's +y), `Iz` its `inertia_y`. The mass per metre is the sheet's where it gives one. A
profile that is not square comes twice, as drawn and turned a quarter about its length; a square one once. A plain
tube or bar comes the same way, its figures worked out from its outline, so a frame of tubes is sized by the same
solver. Refused by name: a profile whose material gives no modulus.

## Formulas

| What | Formula | Source |
|---|---|---|
| Area of a loop | A = ½ Σ (xᵢ yᵢ₊₁ − xᵢ₊₁ yᵢ), summed over loops with holes running the other way | Green's theorem; the "shoelace" formula |
| Centroid | x̄ = Σ (xᵢ + xᵢ₊₁) cᵢ / 6A, with cᵢ = xᵢ yᵢ₊₁ − xᵢ₊₁ yᵢ, and the same in y | Bourke, "Calculating the area and centroid of a polygon" (1988) |
| Second moments about the origin's axes | Iₓ = Σ (yᵢ² + yᵢ yᵢ₊₁ + yᵢ₊₁²) cᵢ / 12, I_y the same in x, I_xy = Σ (xᵢ yᵢ₊₁ + 2 xᵢ yᵢ + 2 xᵢ₊₁ yᵢ₊₁ + xᵢ₊₁ yᵢ) cᵢ / 24 | Steger, "On the calculation of arbitrary moments of polygons" (1996) |
| Moved to the centroid | I about the centroid = I about the origin − A d² | The parallel axis theorem |
| Section modulus | W = I / the distance from the centroid to the furthest fibre | Beam theory |
| A printed beam's creep limit | 0.15 × its strength for its pose (`PRINTED_DEFAULTS.creep`) | An estimate: Waseem et al. (2020), Multi-Response Optimization of Tensile Creep Behavior of PLA 3D Printed Parts, Polymers 12, 2962, table 3: printed PLA held at 15 MPa (0.3 of its filament's 50 MPa) broke in 1.2 to 2.3 hours at 25 °C |
| A printed beam's sag as it creeps | short-term sag / 0.5 (`PRINTED_DEFAULTS.creep_modulus`) | An estimate, with no measurement behind it |
| A spliced beam's strength | 0.5 × the whole beam's (`PRINTED_DEFAULTS.splice_share`) | `splice()`: each half keeps about half the section over the lap (361.5 and 363.9 mm³ of a printed 2020's 717.6 mm³; 353.6 and 320.7 mm³ net of a screw's hole and its seat or pocket) |
| A half's section at its first screw | Z = I / c of the half section less the screw's hole (a teardrop, r below the axis and r √2 above) and its seat or pocket, each with walls round it | Beam theory, the net section through the holes; the teardrop's 45° roof |
| A printed part's plastic | cost = grams / 1000 × the material's `cost` (EUR/kg) | The material's rule set (Bambu Lab's EU store for `pla` and `petg`) |
| Torsion constant | Solve ∇²φ = −2 in the metal with φ = 0 on the outside and φ constant over each hole, the constant fixed by ∮ ∂φ/∂n ds = −2 A_hole round it. Then J = 2 ∫φ dA over metal and holes | Prandtl's stress function: Timoshenko and Goodier, *Theory of Elasticity*, the chapter on torsion |
| The solve | Square cells over the section (about 40 000), the five-point Laplacian with the wall half a cell from a cell's centre, one unknown for each hole, conjugate gradients | A finite-difference scheme; checked against the closed forms below |
| Solid circle, for checking | J = π d⁴ / 32 | The polar moment of a circle, which is its torsion constant |
| Solid rectangle a × b, for checking | J = a b³ (1/3 − (64 b / π⁵ a) Σ tanh(n π a / 2b) / n⁵), n odd | Timoshenko and Goodier, the chapter on torsion |
| Thin closed tube, for checking | J = 4 A_m² t / s (A_m inside the wall's mid-line, s its length), plus s t³ / 3 for the wall itself | Bredt's formula |
| Mass per metre | area × density (mm² × g/cm³ is grams a metre) | |
| A beam's mass | m = A × L × ρ / 1000, in grams from mm², mm and g/cm³ | A prism's volume is its section's area times its length |
| Room a bar gives | bar length − trim − Σ (each beam's length + kerf) ≥ 0, the offcut being what is left | Each cut takes a kerf; the trim squares the bar's first end |
| A mitre's short side | L − w tan θ for each mitred end, w the section's side across the cut and θ the angle from square | Trigonometry |
| Tap depth, by default | 2 × the major diameter in aluminium (1 in steel, 2.5 in plastic) | The engagement rule set in `@rulecad/rules`, through `@rulecad/fixings` |
| A join's tap depth | engagement + tip room + 1.5 × the major diameter (M5 in aluminium: 10 + 1 + 7.5 = 18.5 mm) | `engagement` and `tip_room` from `@rulecad/fixings`; `JOIN_TAP`, a working figure |
| A printed section | shell: the cells within walls x line of the outline count 1, the rest the infill's share (a cell the shell's edge crosses in part); I = Σ w (y - ȳ)² dA about the stiffness-weighted centroid | A rule of mixtures on a raster; an estimate until a printed coupon is bent |
| A printed beam's design moment | M = (S / 2) I / c, S the plastic's strength for its pose (strength along the layers, strength_z or 0.6 x strength across them) | Beam theory; the kit's twice margin |
| A printed lip's hold | flat lips: σ = 6 (F / 2) a / (b t²), a from the lip's root to the middle of the nut's bearing; sloped lips also push the wall out by (F / 2) tan θ, σ = 6 (F / 2) tan θ h / (b w²); b = nut length + 2 lips; each at the strength its stress runs in (lying down, a top slot's lips along the layers, its walls across them) | Cantilever bending; the spread a working figure |
| A splice screw's hold, across the cut | the least of d t S_z (bearing), 2 e t S_z / √3 (torn out to the nearer of the bed and the slot's floor, e from the hole's edge) and A_s S_proof / √3 (the screw sheared); t the thinner half's plastic beside the head's seat or the nut's pocket, S_z the strength across the layers | Bearing and tear-out of a pinned plate; von Mises' shear yield; ISO 898-1 for the proof stress |
| A splice's capacity | M = least of S Z_a, S Z_b and F (lap - 2 x 2.5 d), Z the half's printed section modulus over the lap (`printedSection` with `between`), against 2 x the moment given, or 2 x the design moment x 4 z (L - z) / L² | Each half alone at its end of the lap; two screws as a couple; a spread load on a simply supported span |
| A join's stiffness for another size | k = k₂₀ × (w / 20)³, w the profile's larger side in mm | `JOIN_SCALE.size`, an estimate |
| A join's spring from the joint rig | k = F L² / (d − F L³ / 3 E I): d the measured drop of a beam held out by the join, F the weight hung at L from the face it meets, E I the beam's across the load | A cantilever's tip deflection, F L³ / 3 E I, plus its root turning on a spring, F L / k, times L (Euler-Bernoulli beam theory; the beam's shear left out, under 1% of the drop of the rig's 150 mm beams) |
| A beam's centre of mass | (x̄, ȳ, L / 2): the section's centroid, half way along | A prism of constant section and one material |
| A fitting's first thickness | t = √(2 × 6 F s × 1.5 / (w S)), F the load, s the screw's distance from the corner, w the width, S the strength, 1.5 a stress raiser | Beam theory for a leg bent at its root (σ = 6M / w t²); only a start, the finite elements decide |
| A fitting's margin | S / σ_peak, σ_peak the largest von Mises stress at a cell's centre away from the screws, times k / (k − 1) for k cells across the leg | `@rulecad/fea`; the lift reads a cell's centre out to the surface, as cad's motor mount check does |
| A fitting's bending stiffness | k = F s² / δ | A force F at distance s turns the joint by δ / s |
| A screw's tip window in a slot nut | lip − nut tongue + min(nut's thread, hex nut height) ≤ L − t ≤ slot depth − 0.3 | The nut's thread from its tongue down; ISO 4032's nut height; `FITTING_DEFAULTS.floor`, as cad's `FASTEN.floor` |
| A clip's or a latch's least reach over the sheet | t = √(6 M k / (b S)), M = F × the lever, b the part's width, k the margin asked (2) | Beam theory for a cantilever bent at its root (σ = 6M / b t²) |
| A hinge's risers | σ = 6 F z_a / (2 l (2R)²), F across the pin at height z_a, two risers each l long and 2R deep | The same, two risers sharing the load |
| A handle's grip | σ = 6 (F s / 4) / (b h²), F at the middle of a grip s between its feet | A simply supported beam with a load at its middle: M = F s / 4 |
| A levelling foot's stem | σ = 32 (F / 10) L / (π d_r³), d_r = 0.8 × an M thread's major diameter, d - P for a trapezoidal one | A round stem bent at its root by a side push of a tenth of the load, an estimate of uneven ground |
| A levelling foot's stud | the first of M12, Tr16x4, Tr20x4, Tr24x5 with d_r ≥ the end screw's head + 2 × the printer's fit | DIN 103's internal minor diameters D1 = d - P (12, 16, 19 mm); an M8 cap head is 13 mm, so Tr20x4 |
| A foot's bearing | p = F / A, A the pad less the counterbore | |
| A gasket's wall strain | ε = 3 t δ / (2 L²), against S / E | A cantilever pushed δ at its tip, its strain at the root |
| A panel's mass | m = (a b − (4 − π) r² − Σ holes) × T × ρ / 1000 | A rounded rectangle's area, times its thickness and density |
| The door clears the frame | z_a + Δy sin θ + Δz cos θ ≥ z_a − T for every point of the door, Δy ≥ 0 and −T ≤ Δz ≤ 0 from the axis, 0 ≤ θ ≤ 180° | A point turned about the hinge's axis; with the axis at the door's outer face and its edge past the axis, nothing comes below the door's inner face |
| A head's bearing on a fitting | p = F / (π/4 (d_k² − d_h²)) | The head's ring over the clearance hole |
| A screw's proof load | F = S_p × A_s, A_s = π/4 (d − 0.9382 P)² | ISO 898-1: proof stress S_p (580 MPa for class 8.8) on the stress area of the thread |
| Plastic's shear strength | τ = σ / √3 | The von Mises estimate, `@rulecad/fixings`' `shear_ratio` |
| A carrier's hold, through its top | F = τ × 2√3 s × t, s the nut's flats, t the plastic over its slot (π D t for an insert of knurl diameter D) | Punching shear round the hexagon's perimeter |
| A carrier's hold, at its shoulders | F = τ × 2 (L h − w g), h the carrier's depth below the lips at the opening's edge, w × g the nut's slot | Two shear planes up the sides of the opening |
| A nut's mass | m = V ρ / 1000, V its drawn block's volume in mm³ | |
| Share of a full thread a bore leaves | (major diameter − bore) / (1.299 × pitch) | The 60° thread's height is H = 0.866 pitch, and "percent of thread" counts 3/4 H a side: 1.299 pitch on the diameter |
| A mount plate's margin | S / (6 F a / (b t²)), F at the farthest hole a past the beam's face, b the plate's length (less a window's), t its thickness | Beam theory for a plate bent where it leaves the beam's face |
| A supply's screw | the shortest sold with L − reach ≥ three lines of floor: the floor is L − reach, the head sunk in the rest | The maker's reach (Mean Well's L) as the limit |
| A board's screw | the largest whose clearance passes the hole and whose head's radius ≤ the holes' least distance from the board's edges | A head that sits whole bears on the board, not on its edge |
| A board's standoff | ≥ engagement + tip room + a layer + three lines − t, and ≥ `SERVICE_DEFAULTS.standoff` | The pilot's depth, from `@rulecad/fixings`' engagement in plastic |
| A clip's hold | σ = F / (w × min(stem, 2 × ring wall)) | The stem and the ring in tension, an estimate |
| A tie anchor's roof | σ = 6 (F t_w / 8) / (b h²) | A beam across the tie's width, both ends held, its load at the middle |
| A spool holder's arm | σ = 6 F (2 + w_s / 2) / (b t²), F = 2 m g | A cantilever with the spool's weight at its middle |
| Clips along a run | n = max(2, ⌈L / pitch⌉ + 1), L / (n − 1) apart | One at each end, evenly between |
| A rail's holes | n = ⌊(L − 2 e) / P⌋ + 1, e = D / 2 + 1; the ends E = (L − (n − 1) P) / 2 | HIWIN MG catalogue 2-4-17, L = (n − 1) P + 2E; `GUIDE_DEFAULTS.endLeast`, an estimate |
| A carriage's travel | L / n − L_max, n carriages on a rail L long | Each its own share of the rail |
| A carriage's margin | 1 / (F / C0 + \|M_R\| / MR + \|M_P\| / MP + \|M_Y\| / MY), F the force square to the face and across | HIWIN's ratings, each load alone; summed, `GUIDE_DEFAULTS.combine`, an estimate |
| A beam's sag under a guide | δ = 5 w L⁴ / (384 E I) + P L³ / (48 E I) | Simply supported beam, spread and middle loads (Roark's Formulas for Stress and Strain, table 8.1) |
| A jig's keys | δ = 2 (S / 2) l² / (3 E t), l the leg to the key, t its wall | A cantilever pushed δ at its tip, its stress 3 E t δ / (2 l²) at the root |
| A jig's length | w = 6 F l / (t² S / 2) | A leg bent at its root by the push on the rail |
| A drill guide's stop | t = ∛(4 F h³ / (E W δ)), and t ≥ √(2 · 6 F h / (W S)) | A cantilever h long (`JIG_DEFAULTS.stop` of the beam's depth), W wide, bent no more than δ (`JIG_DEFAULTS.within`) by F, at twice the margin |
| A bush and the tool's lean | d = D + slip + hole_comp; lean = atan(slip / l), l = 2 D | The printer's `slip` and `hole_comp` (x1c), the bush `JIG_DEFAULTS.bush` diameters long, an estimate |
| A tap guide's sleeve | w = √(2 · 6 F h / (B S)) | A wall B wide and h deep bent by F at its rim |
| A squaring corner's square | atan(slip / l_a) + atan(slip / l_b) | Each tongue's play over its length, held to `JIG_DEFAULTS.square` (0.5°, cad's `JOIN_CHECK.square`) |
| A bay's diagonals | d = √(w² + h²); accept = 2 t max(w, h) / d; lean δ = accept d / (2 w h) | Diagonals √(w² + h² ± 2 w h sin δ) of a bay leaning δ; t the cut tolerance, `CUT_DEFAULTS.tolerance` (MISUMI's ±0.5 mm, an estimate for other saws) or the profile's `cut_tolerance` |
| A length gauge | n = ⌈L / (bed − 2 e)⌉ pieces of L / n, within ±n × 0.1 mm | `JIG_DEFAULTS.edge` and `.gaugeError`, an estimate: check it with a rule |
| A V-wheel's seat | d = (T − f) / 2 / tan(θ / 2); the axle R − d from the face, T the track's width, f the rim's flat, θ the V | The wheel's flanks lying on the track's |
| A wheel's flank load | N = π r l p² / E*, E* = E / (1 − ν²); radial 2 N cos(θ / 2), axial N sin(θ / 2) | Hertz line contact, a cylinder on a flat (Roark's Formulas for Stress and Strain, table 14.1, case 2b); r the radius at the contact's middle, l the flank's slant length, the track rigid: `WHEEL_DEFAULTS.curvature`, an estimate |
| A wheel's margin | 1 / max over wheels (radial / radial rating + axial / axial rating) | `WHEEL_DEFAULTS.combine` and `.share`, estimates |
| A wheel plate's thickness | t = √(6 M · 2 / (b S)), M = F s / 4 | A plate b long across the s between its rows of wheels, its load F at the middle, at twice the margin |
| A holder's or motor plate's thickness | t = √(6 M · 2 / (b S)), M = F h | A plate b wide bent where it stands on the face by F along the beam at the height h of the rods or the shaft, at twice the margin |
| The rods' spacing | s = 2 (D / 2 + F_d / 2 + w), rounded up to 0.5 mm | D the bearing's outside diameter, F_d the lead nut's flange, w `ROD_DEFAULTS.web` |
| A belt's travel a turn | teeth × pitch | 20 × 2 = 40 mm for `pulley-gt2-20` (Gates's sprocket table) |
| A belt's path (equal pulley and idler) | L = 2 C - g + π d | C the pulley's middle to the idler's, g the gap between the ends in the clamp, d the pitch diameter (teeth × pitch / π) |
| The return run (unequal pulley and idler) | √(C² - (r₁ - r₂)²), the wraps π ± 2 asin((r₁ - r₂) / C) | The outer tangent of two circles |
| The length to cut | ⌊L / (1 + T / k) / p⌋ p | T each span's tension, k the belt's stiffness (Gates: tension per unit strain), p its pitch: whole teeth |
| The block's place for a cut | (c (1 + T / k) - L) / 2 | Moving the idler by d lengthens the path by 2 d |
| The block's room each way | 2 (e / 2 + p / 2), e = L T / k | Half the stretch and half a pitch, twice over |
| The belt's stretch under a push | F a b / ((a + b) k) | The motor holds the pulley: the carriage hangs on two spans a and b long, in parallel |
| A clamp's teeth | n ≥ 2 T / (τ p / 2 · w), τ = 0.5 S | Each tooth's root half a pitch along, across the belt's width w, in shear (`BELT_DEFAULTS.shear`, an estimate) |
| A belt plate's thickness | 6 M / (b t²) ≤ S / 2, M = 2 T (t / 2 + h) + m g x | Bent at the beam's end by both spans at the band's height h over the plate, and the motor's weight x past the end |
| A linear bearing's load | R = √((|F_y| / 2 + |M_z| / 2a)² + (|F_z| / 2 ± M_x / s + |M_y| / 2a)²), a = 0.5 L | Forces shared, a roll as a couple across the spacing s, pitch and yaw as a couple along the bush of length L (`ROD_DEFAULTS.couple`, an estimate); margin = static rating / R |
| Where the endstop trips | home = (the switch's address + its lever's 12.4 mm) − (the flag's face at the travel's start) | The lever's place as @rulecad/cad draws a switch (`ROD_DEFAULTS.lever`, an estimate) |
| A slider's pressure | p = F / A, held to 0.1 S | `WHEEL_DEFAULTS.pressure`, an estimate |

Why the torsion constant is solved for and not taken from the polar moment: a slotted section is open. MISUMI's
HFS5-2020 has a polar moment of 14 850 mm⁴ and a torsion constant of 809 mm⁴ by this solve, eighteen times less,
and Bosch Rexroth prints 800 mm⁴ for its own 20 mm section. A closed hollow carries the stress function across
itself and an open slot does not, which is the whole difference between a tube and a channel.

The tests hold the solve to within 1% of the solid circle, 2% of the rectangle and 3% of the tube, and a slit tube
to within 10% of the open-section figure s t³ / 3.

## What it rests on

Every profile, slot family, bought fitting, rail and material is a rule set in `@rulecad/rules`, each value with its source and the date
it was read. A printed fitting's working figures (`FITTING_DEFAULTS`) say what each rests on: the margin and load are
the kit's defaults, the least thickness, the round, the brace and the end distance are estimates until the print
tests (Frames 2.13) check them, and a fitting's stiffness and margin are finite elements on cubes about a third of
its thickness, which read a part 10 to 20% stiffer than it is. A dimension the maker prints is `spec`. One scaled off the maker's drawing because no figure is printed
(the width of a slot's floor) is an `estimate`. A figure taken from the section a profile is made to match, or from
a seller of unbranded stock, is `community`. `model.rests` and each figure's `kind` say which you are standing on.

A bought fitting's sizes are its maker's drawing (`spec`); a screw's place along a leg that the drawing shows but does
not dimension is an `estimate`. Its price is the seller's on the date checked. Its stiffness is a working guess,
the same as `JOIN_STIFFNESS` for its kind, until the joint rig (issue 264) measures it: no maker publishes one. So
until then a set gives the same stiffness as a join with `"fitting": "bought"`, and its rule and its
`fitting.stiffness` finding say so. Stiffness is written in N mm/rad, the rule sets' unit, throughout.

Panels' densities are the makers' (Evonik's PLEXIGLAS GS, Covestro's Makrolon GP, Aalco's 5754 sheet); the
thicknesses stocked are `community`. The panel parts' loads, a clip's grip, the barb, the squeeze, a hinge's
clearance, the handle's room for the fingers and the magnet's size are working figures or estimates
(`PANEL_DEFAULTS`, `DOOR_DEFAULTS`, `END_DEFAULTS` say which); their margins are by beam formulas. The magnet's
pocket is the magnet and the printer's `fit`; its pull across the half millimetre to the strike is `@rulecad/fixings`' `magnetSeatModel`'s: a seller's
figure for the six disc sizes its `magnets` rule set holds, scaled to N35 and across the gap (estimates); another size's
pull is not checked.

The service parts read a device's holes from its rule set: Mean Well's LRS specification sheets give each supply's
base holes, thread and screw reach (`spec`); Arduino's UNO R3 datasheet gives the Uno's four holes under the CNC
shield, three dimensioned and one read off its drawing (`community`). Fan hole spacings are ARCTIC's drawings for 40
and 80 mm (`spec`), a secondary source for 92 and 120 mm (`community`) and an estimate for 60 mm. A TS35 rail is
Weidmüller's data sheet. A board's standoff, the clip's barb and snap, a tie's band, a spool's size and the load
figures are working figures or estimates (`SERVICE_DEFAULTS` says which); every margin is by beam formulas.

A rail's figures are HIWIN's MG Series catalogue (2025, G99TE24-2410), all `spec`: the dimension table for the rail
and carriages, the rail lengths, the running parallelism of the normal class, the preload classes (a light clearance
carriage's play, 4 to 10 µm) and the radial stiffness (at very light preload). Other makers' MGN rails share the
rail's size and hole pitch, and their carriages' ratings differ: give a variant with theirs. The least end distance,
the jig's key and how a carriage's loads combine are estimates (`GUIDE_DEFAULTS` says which); the beam's sag assumes
pinned ends, the worse case.

The jigs rest on the printer's rule set for their fits (`slip`, `hole_comp`, `fit`, `chamfer`, `bed`) and on
`JIG_DEFAULTS`: the 20 N load, the bush's length, a tap's shank and the gauge's error are estimates, and each says
so; the stop's depth and its 0.05 mm bend, the sleeve, the block and the gauge's section are working figures. Their
margins are by beam formulas.

A V-wheel's rim, bearing seats and kit, the eccentric spacers and the plain spacers are read off OpenBuilds' drawings
(`spec`). Its plastic's modulus and allowed contact pressure are Delrin 150's, from two data sheets, `community`
because OpenBuilds does not name the grade; Poisson's ratio is an estimate. Where a wheel seats rests on the slot's
`track_width` and `track_angle` (9.16 mm and 90 degrees, printed on OpenBuilds' rail drawing: `spec`) and the wheel's
diameter and flat: a clone's track can differ, so measure your rail's track before trusting a plate drilled to it. How a carriage's loads are shared among its wheels and combined, the Hertz contact's radius, and
a slider's friction and wear limit are working figures (`WHEEL_DEFAULTS` says which). The eccentrics' preload is not
in the ratings.

A rod's diameter, a linear bearing's size and ratings, the T8 screw and nut, the coupler and the switch are each
set's figures (`community`, from sellers' sheets); the 608's are SKF's (`spec`); the motors' mounting holes are their
sets' (the 28BYJ-48's and NEMA 17's `spec`, the 28BYJ-48's ear thickness an estimate). How tight a printed pocket holds
a bearing (`ROD_DEFAULTS.press`), how a bush takes a moment, where a switch's lever is and the switch's hole spacing
are estimates, said in each finding: measure them. Every margin is by beam formulas.

Published so far: MISUMI's HFS series in 20, 30, 40 and 45 mm, Bosch Rexroth, item (Lines 5, 6 and 8, standard and
light), Motedis (B-type and I-type), OpenBuilds' V-Slot and C-Beam, MakerBeam, MakerBeamXL and OpenBeam, 80/20's
inch series, generic stock in 20, 30 and 40 mm, and plain tube, angle, channel and bar in any size. `profiles()`
lists them.

A printed beam's figures are estimates: its walls and infill are the kit's defaults (`PRINTED_DEFAULTS`), the
infill is taken to carry load in proportion to how much of it there is, a nut's pull is spread one lip's thickness
beyond it, and plastic across its layers is 0.6 of its strength along them where the material gives no figure. A beam
coupon bent between two supports (`cad measured`) is how they get replaced. The printable profiles' sets are worked
out from the nuts' sizes and the X1C's rules, so they are `derived` and as good as those.

A belt drive rests on Gates's figures for its belt (pitch, stiffness, least and rated tension, least idlers: `spec`)
and pulley, and on estimates the kit names in `BELT_DEFAULTS`: the tension set (25 N), the belt's thickness and tooth
height (hobby sellers' figures), where a hobby pulley's band is (`flange`), the least teeth in a clamp (`mesh`), the
printed teeth's shear strength (`shear`), how square the belt must lie (`line`, 0.25°) and how open belt is sold
(`sold`). The hobby pulley's and idler's own sizes are `community` figures from their sellers.

## Exports

| Export | What |
|---|---|
| `profileModel(which, change?, given?)` | A profile's model |
| `slotModel(which, change?, given?)`, `slotPath(slot)` | A slot family's model, and its outline as it cuts into a face |
| `outline(model)`, `readOutline(json)` | The section as loops; a measured outline held to its format |
| `section(model, { torsion?, cells? })` | Section figures from the outline, beside the sheet's |
| `beamFigures(model, { cells? })` | The figures to design a beam with: the sheet's where it gives one, the outline's where it does not |
| `profileChoices(model)` | The profile as choices for `@rulecad/fea/frame`'s `sizing`: section, alloy, mass per metre; turned a quarter too where it is not square |
| `profileFindings(model, { torsion?, cells? })` | What a check finds |
| `polygonSection(loops)`, `torsionConstant(loops, { cells?, tolerance? })`, `signedArea(loop)` | The formulas on plain loops |
| `profiles()`, `slots()`, `slotNuts()` | The names in the catalogue |
| `slotNutModel`, `nutFit`, `slotNut`, `nutFor`, `NUT_KINDS` | A bought slot nut, how it sits in a slot, its solid, the one for a face, and the kinds (above) |
| `carrierModel(where, options)`, `carrier(m, { pose?, ...options })`, `CARRIER_DEFAULTS` | A printed carrier for a nut or an insert, its solid, and the margins it is drawn with |
| `bracketModel(profile, { other?, face?, otherFace?, thread?, head?, nut?, brace?, load?, width?, printer?, material?, cache? })`, `bracket(m, { pose?, tongues?, ops? })` | A printed corner bracket's model and its solid |
| `plateModel(profile, { shape?, other?, face?, thread?, head?, nut?, count?, load?, width?, printer?, material?, cache? })`, `plate(m, { pose?, tongues?, ops? })` | A printed gusset (L, T, cross) or splice plate, and its solid |
| `FITTINGS`, `FITTING_DEFAULTS`, `fittingFE(o)` | The kinds of printed fitting; the margins and working figures they are drawn with; the finite elements on a part |
| `SHEETS`, `PANEL_DEFAULTS`, `panelModel(sheet, thickness, { size, corner?, holes? })`, `panel(m, { ops? })` | Sheets by material, the panel parts' working figures, a panel's model and its solid |
| `panelClipModel`, `panelClip`, `panelCornerModel`, `panelCorner`, `panelEdgeModel`, `panelEdge`, `slotCoverModel`, `slotCover`, `gasketStripModel`, `gasketStrip` | The printed parts that hold a panel, each a model and its solid (`{ pose: 'print' \| 'fit' }`) |
| `DOOR_DEFAULTS`, `hingeModel`, `hinge(m, { part: 'frame' \| 'door', pose? })`, `handleModel`, `handle`, `latchModel`, `latch`, `magnetCatchModel`, `magnetCatch` | A door's printed parts |
| `SERVICE_DEFAULTS`, `FANS`, `DIN_RAIL`, `deviceMountModel(profile, { device, variant?, turn?, offset?, standoff?, screw? })`, `deviceMount`, `fanMountModel`, `fanMount`, `dragChainEndModel`, `dragChainEnd`, `dinRailAdapterModel`, `dinRailAdapter`, `cableClipModel`, `cableClip`, `tieAnchorModel`, `tieAnchor`, `spoolHolderModel`, `spoolHolder`, `runClips(length, { pitch? })` | The parts that carry services on a frame, each a model and its solid (`{ pose: 'print' \| 'fit' }`), and clips along a run |
| `GUIDE_KINDS`, `GUIDE_DEFAULTS`, `rails()`, `railModel(set, { length, variant?, carriages?, given? })`, `rail(m)`, `carriage(m)`, `guideFit(m, profile, { face?, from?, beam?, nut?, keep?, given? })`, `carriageMargin(m, { force, moment })`, `railTerms(m, profile, { beam, carried?, face? })`, `railJigModel(profile, { rail, face?, length?, load? })`, `railJig(m, { pose?, tongues? })` | Guides: a rail's model (holes, screws, carriages' shares and travel), its solids, whether it fits a face, a carriage's loads against its ratings, its error terms, and the printed jig that centres it |
| `WHEEL_DEFAULTS`, `wheels()`, `trackFit(profile, face, wheel)`, `wheelsModel(profile, { wheel?, face?, wheels?, pitch?, load?, printer?, material? })`, `wheelPlate(m, { pose? })`, `vWheel(m, { eccentric?, collide? })`, `wheelMargin(m, { force, moment })`, `sliderModel(profile, { face?, mode?, length?, load?, printer?, material? })`, `slider(m, { pose?, tongues? })` | Guides on the beam itself: where a V-wheel seats in a track (or why it cannot), a carriage on V-wheels (its plate, wheels, eccentrics' range, ratings and hardware), each wheel's load against its rating, and a printed slider in or over a slot |
| `BELT_DEFAULTS`, `beltLayout(profile, { face?, beam, rail, carriage, motor?, pulley?, idler?, belt?, tension?, across?, idlerAt?, cut?, ... })`, `beltPlateModel(profile, { motor?, pulley?, across?, least?, tension?, ... })`, `beltPlate(m)`, `beltClampModel({ carriageHoles, carriageDepth?, thread, width, length, rise, tension?, ... })`, `beltClamp(m)`, `beltIdlerModel(profile, { idler?, rise, across?, stretch?, tension?, ... })`, `beltIdler(m)`, `beltPath(g)`, `beltRub(layout)` | A belt drive on a rail's carriage: the layout from the sets, a printed motor plate, a clamp for the belt's ends, the idler's block that is its tensioner, the belt's path and length, and where its runs rub through the travel |
| `ROD_DEFAULTS`, `rodsLayout(profile, { face?, rod?, bearing?, spacing?, height?, screw?, nut?, support?, coupler?, motor? })`, `rodHolderModel(profile, { end?, spacing?, height?, screw?, leadNut?, support?, load?, ... })`, `rodHolder(m, { pose? })`, `motorPlateModel(profile, { motor, height?, coupler?, load?, ... })`, `motorPlate(m, { pose? })`, `rodCarriageModel(profile, { spacing?, height?, screw?, leadNut?, flag?, load?, ... })`, `rodCarriage(m, { pose? })`, `endstopMountModel(profile, { face, switch?, toward?, load?, ... })`, `endstopMount(m)`, `rodMargin(m, { force, moment })` | Rod guides and their drive: the layout from the sets, printed rod holders (with the screw's bearing), a motor plate for any catalogue motor, a carriage with its bearings, lead nut and endstop flag, an endstop's mount, and the bearings' loads against their rating |
| `JIG_KINDS`, `JIG_DEFAULTS`, `drillGuideModel(beam, op, { from?, load? })`, `drillGuide(m, { pose?, mark? })`, `tapGuideModel(beam, op, { shank?, load? })`, `tapGuide(m, { pose?, mark? })`, `lengthStopModel(profile, length, { load? })`, `lengthStop(m, { part?, mark? })`, `squareCornerModel({ profile, face?, end?, length? }, { profile, face?, edge? }, { hand?, load? })`, `squareCorner(m, { pose?, mark? })` | Jigs for hand tools: a drill guide and a tap guide from a beam's operations, a cut-length stop with its gauge, and a squaring corner; each takes `printer` and `material` too |
| `FRAME_KINDS`, `FRAME_JOINS`, `FRAME_FEET`, `FRAME_GEN`, `frameModel(kind, o)`, `box(o)`, `portal(o)`, `table(o)`, `gantry(o)`, `shelf(o)` | Frames from a size: the kinds, the joins and feet a generator takes, its working figures, and each generator's beams, joins and ends (Frames from a size) |
| `squareness(width, height, { tolerance?, cuts?, plays? })` | A bay's two diagonals, inside corner to inside corner, and the difference between them to accept, stacked from its cuts and its joins' play, with the lean it stands for |
| `END_DEFAULTS`, `endCapModel`, `endCap`, `footModel`, `foot`, `levellingFootModel`, `levellingFoot(m, { part: 'body' \| 'pad' })`, `castorPlateModel`, `castorPlate`, `stackingFootModel`, `stackingFoot` | The printed parts for a beam's end |
| `beamModel(profile, { length, ends?, ops?, material?, given?, cells?, printed? })` | A beam's model: mass, centre of mass, figures, places, anchors, operations; printed, a printed part |
| `printedProfile(series, { nut?, printer?, pull?, material? })`, `PRINTED_SERIES` | A printable profile and its slot as rule sets, and the nut each size is drawn round |
| `printedSection(profile, { walls?, infill?, line?, between? })`, `PRINTED_DEFAULTS`, `printerFigures(what, printer)` | A printed section's figures from its walls and infill (`between: [x0, x1]`: the part between two upright cuts, as a splice's half); the working figures printed beams use; a printer's figures |
| `printedBeam(m)` | A printed beam's solid as it prints, its ends' inserts or nuts cut in |
| `printedInPlace(m)` | A printed beam's solid in its own frame, as `beam()` draws one, with its ends' fixings cut in |
| `beamCreep(b, { stress, sag?, limit? })`, `PRINTED_CHECKED` | A printed beam held for months: its stress against the creep limit, and its sag as it creeps (`beam.creep`); the date the printed figures were checked |
| `spliceModel(beam, { at?, moment?, thread?, printer? })`, `splice(model)` | A splice for a printed beam longer than the bed, and its two halves as they print |
| `OPS`, `OP_DEFAULTS` | The operations and what each takes; the allowances they are checked and sized by |
| `joinModel(kind, { beam, end }, { beam, address }, { screw?, fitting?, mitre?, given? })` | A join: the operations on each beam, its screws, its fitting (printed, or a bought set by name), its stiffness, what to know |
| `BOUGHT_KINDS`, `boughtFittings(given?)`, `boughtFittingModel(set, { profile?, other?, join?, given? })`, `boughtFitting(m, { pose? })`, `boughtStiffness(kind, beam, m)`, `printedCost(grams, material)` | Bought fittings: the kinds and the join kinds that take each, the sets, one set's model (screws, holes, price, stiffness, fit), its reference solid, a join's stiffness with it, and a printed part's plastic beside its price |
| `JOINS`, `JOIN_STIFFNESS`, `JOIN_PLAY`, `JOIN_SCALE`, `JOIN_TAP`, `joinStiffness(kind, beam, { fitting?, given? })` | The kinds; each kind's stiffness and its play once tightened (mm), all estimates; the scales and the tap depth; one join's stiffness as an end join, a workspace's measured figure first |
| `JOIN_SET`, `joinRuleSet()` | The name of the rule set measured joins go in (`joins`), and that set as the kit starts it |
| `beam(m, { display?, tracks?, ...beamModel's })` | A beam's solid, `link` or `preview`; a link with its V tracks cut (`tracks`) |
| `beamAnchor(beam, address)` | An anchor by its address, with a distance along a face |
| `cutList(beams, { kerf?, trim?, tolerance?, stock? })`, `cutListText(c)` | The cut list: marks, the bars to buy, the cut order and offcut on each, `frame.cut` findings |
| `packBars(pieces, lengths, { kerf?, trim? })`, `beamMarks(beams)` | The packing alone; the beams by mark |
| `CUT_DEFAULTS` | The kerf, trim, cut tolerance and assumed stock length, each with what it rests on |
| `workOrder(beam)` | A beam's operations' indexes in the order they are done, as its sheet numbers them |
| `beamSheet(beam, { mark?, items?, grams? })` | A beam's cut-and-drill sheet, SVG to scale |
| `printable(x)` | A printed beam's `beam.printable` findings; a bought beam or a profile, one failure |
| `DEFAULTS` | The allowances a check uses, each with what it rests on |
| `status` | `{ release: 'ready', plan }` |

It is called frames because "extrusion" also means filament leaving a nozzle.

## Licence

MIT.
