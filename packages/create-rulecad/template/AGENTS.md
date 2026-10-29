# Designing with rulecad: notes for AI agents

This project designs physical things with the `cad` command (rulecad). Every measurement is a variable, and every
variable says which rule it comes from. Follow these steps; they're what makes a design traceable and printable.
(`npx cad help` lists the commands; the full guide is @rulecad/cad's README.)

## A new part
1. **Rules first.** Find the facts the part depends on: standards, the thing it fits, the printer. Put shared ones in
   `rules/<set>.json` with `kind`, `source` and `checked`. Research them, don't guess. Ask the person to measure what
   can't be looked up, and record it as `"kind": "measured"`; something nobody has published goes in as
   `"kind": "estimate"`, and the check will flag it.
2. `npx cad new <project>/<object>`, then write the variables in the .json and the shape in the .js. No numbers in
   the .js other than 0, 1 and 2: `cad check` fails on any other.
3. `npx cad check`, then `npx cad preview`, and **look at the preview image** before saying it's done. Check the views
   from below for anything that fits onto something else.
4. Mark the variables that matter to the person `show` (six at most, short `label`s), and the ones other parts depend
   on `interface` (versions follow them). Give sensible `tweak` ranges to the ones they may want to change.
5. `npx cad export` for printing; `npx cad link --md` for a link to share.

## Fitting something from elsewhere
- When a part must fit something whose model exists (a maker's CAD, a model site), measure that model:
  `npx cad measure <file> --rules <name> --source <url> --licence "…"`. Look at the drawing in `.preview/measure/`,
  then rename the draft rules for what they are and say in each `rule` what the feature does.
- Model it from those rules, then `npx cad match <project>/<object> <file>`: report the worst places with their numbers,
  and look at the sections picture. A deliberate clearance shows as an even offset; anything else is a finding.
- Don't copy the shape of a model whose licence is non-commercial, no-derivatives or share-alike into a design under
  another licence: take measurements only, and say so.

## Changing a design
1. `npx cad history <project>/<object>` first: read the print log. A failed print is the reason for most changes:
   fix the rule or variable it points at (a measured fit beats a community rule).
2. Change, then check, preview and look, as for a new part. Change values with `npx cad set <project>/<object>
   name=value` and assemblies with `npx cad add fit|joint|item|pose …`: they keep the file's layout and refuse an edit
   that breaks it. `npx cad values` lists an object's numbers; `npx cad why <project>/<object>.<name>` shows what a
   value depends on, down to the rules (estimates marked). `--json` on check, values and why gives data to act on:
   each finding has a code, its numbers and where it is.
3. `npx cad release <project>/<object> -m "what changed, for the person" --dry-run` shows the bump and why. If it's
   major, tell the person which interface values changed: earlier prints may no longer fit.
4. Release only when the person agrees. Don't use `--force` without asking.

## Shapes
- Z is up, the bed is z = 0: model the part in its print orientation, and describe it in `orientation`.
- Walls are whole numbers of print lines (`x1c.line * 3`, or your printer's set), heights whole numbers of layers.
- Holes and slots get the printer's hole compensation; parts that slide together get its fit clearance. Chamfer
  bottom edges.
- An overhang warning means supports: say so in `orientation`, or change the shape or orientation.
- Use the print-aware features in `v.shapes` before drawing your own: `countersink`, `teardropHole`, `nutPocket`,
  `crushRibs`, `wallOpening` print without supports as drawn. Use `v.ops.union/subtract/intersect` for booleans: the
  workspace can switch them to Manifold (faster, watertight) without touching the design.
- Designs run sandboxed: they may import only `@jscad/modeling`, `@rulecad/shapes` and files in their project.
- Something printed under the part and removed afterwards is a named `support` part (`return { cap, pillar }`, both
  described in the .json's `parts`), not part of the shape. Look at `cad preview --explode` too.

## Alternatives, layouts, colours
- To try an alternative, add a **variant** (named inputs in the .json) rather than a copy of the object; `cad compare`
  shows two side by side. Remove trial variants before a release.
- What differs key by key on a keyboard belongs in a **layout file**, read through `per`. `cad import-kle` brings
  one in from keyboard-layout-editor.com.
- A part in another colour is a part with a `filament` from `project.json`: the 3MF puts it on its own AMS slot.
- Fine detail a screen doesn't need goes in `display` settings (fewer segments, no legends).

## Fits
- To check how parts go together, make a `fit` assembly with the thing it fits as a `reference` object, and `fits`
  with ranges from rules. An overlap or gap outside its range is a finding: report it with the numbers, and never
  widen a range to make it pass without saying why.
- Build bigger things from checked assemblies used as items, rather than placing their objects again.
- Things that move are one assembly with joints and poses, not a copy per position: give the objects anchors, join
  them with joints, name the positions in `poses`, and run `cad check --sweep` to find where parts collide on the way.
  See "Joints and poses" in the cad README.
- A part is named in fits as `<item>.<part>`; an object that returns one unnamed shape has one part, `body`.
- A gap fit can't tell whether holes line up. Where a board screws into a part, add a holes fit
  (`{ "holes": "pcb.board", "into": "case.body", "depth": "m2.insert_length" }`).
- A part built around another (a case around its board) reads it: `"uses": ["macropad/pcb"]`, then
  `pcb.board_w` and `v.pcb.board_holes`. Never copy another object's numbers by hand.

## Circuit boards
- `"engine": "pcb"` in the .json; `main(v)` returns a board built with `v.pcb` (see @rulecad/pcb's README).
- Parts come from rule sets where one exists (`v.pcb.xiao`, `qwiic`, `jstph`, `header`), or any standard footprint by
  name (`v.pcb.part('U2', 'soic8', x, y)`). Turn parts in quarter turns with `rotation`, held in a variable.
- Join pins with `nets` (`GND: ['U1.GND', 'J1.GND']`) and let the autorouter draw them; `cad check` runs the fab's
  design rules. Look at the copper preview: connectors should face the edge their plug comes from.

## Optimised parts
- For a flat part that carries load (a lever, a bracket, a pedal arm), describe it as a problem in `problems/`: the
  space it may fill, the bosses to keep, the holes to avoid, the supports and loads (in newtons, each in a case), the
  material's rule set. `npx cad optimise <project>/<problem>` and **look at the picture** in `.preview/`.
- A design reads the result through a `problem` variable and builds it with `v.shapes.optimisedOutline(...)`. Add an
  `analysis` to the object so `cad check` reports its stiffness; report those numbers with their load and material.
- Solid parts (brackets, joints) are 3D problems: regions with a z, a named part as the space if it helps. Set
  `"overhang"` to the way up it will print, so the result needs no supports, and give horizontal bosses and holes a
  `teardrop` (`"down"`, `"up"`). Draw the part as it prints; if that isn't the problem's frame, give its `analysis` a
  `rotate` and `move` back. Build with `v.shapes.optimisedSolid(...)` and `"engine": "manifold"`; look at the four views.
  The result is made printable before it's drawn (hanging cells emptied, tips lifted, loose bits dropped), but a kept
  region is never emptied: if `cad optimise` says part of one has nothing holding it up, give the part more material
  to stand it on, or keep less. `cad check` tests the part for one piece and nothing starting in mid-air.
- Before reporting numbers for a final shape, verify them: give the `analysis` a smaller `cell` (solids: about a
  third of the problem's) and check the stiffness has settled (`fea.settled`). Report the verified numbers, the safety
  factor, and where the peak stress is.
- For a part that must not break (a lever, a pedal), give its problem a `"stress"` limit (the material's strength
  over a safety factor) instead of a `"volume"`: the lightest layout under it. Then verify it on finer cells.
- Mark a problem `"critical": true` if the part could hurt someone if it broke. Say plainly that the analysis is a
  design aid and the material values are data-sheet figures: such a part needs testing, recorded under
  `"verification"`, not just a check.

## Talking to the person
- Give links as one labelled line (`npx cad link <project>/<object> --md`), never a raw URL. If it says
  "(not a release)", say so. If it says the link is too long for chat, don't paste it: tell the person, and offer
  short links (a secret Gist), which upload the model, so ask first.
- Say what the checks found, with numbers. Ask before anything that leaves the computer: releases with `--push`,
  ordering boards, publishing.
- Designs are code: only run designs you or the person trust. Links and rule files are data and never run.
