# A graphical front end for rulecad: a proposal

rulecad designs are JSON files in a workspace, changed today by `cad` commands typed in a terminal or run by an agent.
This proposal is for a graphical front end in the spirit of Onshape, a CAD system that runs in a web browser: a
screen split into **workspaces** (a project, an object, an assembly, a frame, a machine, the build, the releases),
each with a **tool palette**, where every tool changes the workspace's JSON by running the same checked edit a
command runs. Picking a beam and dragging it along a slot is `cad move`; ticking a fit is `cad add fit`. The JSON
stays the one record, so the terminal, an agent and the front end can work on the same files.

It is a document to read and comment on: nothing here is built. Written against rulecad on main at `afebcf1`
(2026-11-23: `@rulecad/cad` 0.7.65, `@rulecad/viewer` 0.3.13, `@rulecad/model-link` 0.3.2, `@rulecad/frames`
0.1.11). Timings were measured on the owner's Mac with Node 24.21.0 on the same day; sizes of work are estimates
and are marked so.

Three things it is meant to be, from the request: a set of workspaces and tools, as Onshape's are; tools that
manipulate the workspace's JSON directly; and something other than a form over the JSON or a text editor on it.

## 1. What there is to build on

### 1.1 Edit commands that a program can drive

Frames 4 ([#291](https://github.com/JoniBach/rulecad/pull/291)) gave every edit to a project's or an assembly's
file a command that makes it and checks it. These are the front end's verbs:

| Command | What it changes |
|---|---|
| `cad new <project>` | `project.json`: title, description, material, printer |
| `cad new <project>/<assembly> --assembly [--frame …]` | An empty assembly, or a generated frame, expanded and checked before it is written |
| `cad set <project>/<assembly> <address>=<value> …` | Any field of an entry, by its id (`x1.at`) or its place (`joins.3.kind`), or a top-level field (`frame.inside`) |
| `cad add fit\|joint\|item\|beam\|loop\|pose\|fasten\|join\|guide\|load\|wire` | An entry, with every name it gives checked against the assembly's items |
| `cad move <project>/<assembly> <id> --at x,y,z \| --to <address>` | An item to a point or to an address on a beam (`x1.top@50%`), or a guide along its face |
| `cad remove <project>/<assembly> <address> [--with-refs]` | An entry or a field; refused by name while others name it |
| `cad set <project>/<object> name=value [--new …]` | An object's variables, refused if they stop resolving or leave their tweak range |

Each one keeps the file's layout (key order, indentation, line endings: `lib/jsonedit.mjs`), checks the result against
the schema and against everything it could break, and refuses a bad edit by name with nothing written. With `--json`
it answers in one shape:

```
{ "command": "set", "file": "projects/frame/assemblies/box.json", "written": false, "dryRun": true,
  "changes": [{ "op": "set", "path": "frame.inside", "before": [300, 300, 350], "after": [300, 300, 400] }],
  "findings": [{ "level": "pass", "text": "matches the assembly schema", "code": "schema" }, …] }
```

and a refusal as `{ "error": { "code", "message", "file", "path", "refs" } }`. `--dry-run` does everything but write.
That is most of what a front end needs from its back end: a preview of any edit before it is made, its exact
changes (so it can be undone), and the findings to show.

### 1.2 The model page (`@rulecad/viewer`)

The page that `cad link` opens is already an interactive 3D view, written as static files (three.js, no build step):

- a parts panel by kind, with show, hide and four styles; click a part in the model to select its copy (a
  three.js raycaster, raising a `cad:select` event with the part's name and label);
- a Motion panel: a slider per joint, a button per pose, a quick look for parts pushed into each other;
- for machines, dragging the pen on the sheet with the joints following by inverse kinematics (`@rulecad/robots`
  in the page), playback of a step file, a margins strip, and the build page;
- for frames, each beam by its mark and its cut-and-drill sheet in a Beams tab;
- a Slice panel that steps up through the layers and checks for islands off the page's thread (a web worker);
- STL and 3MF downloads made in the page, and a phone layout with the model and a pane sharing the screen.

### 1.3 The link format (`@rulecad/model-link`)

A model, its parts (each named `item.part`, so a part names the item it belongs to), its placed copies, its motion
(items, joints, poses, which item each part moves with), its rules, a machine's task, steps, wires and build page, all
as checked data. Pages read it and never run it. It is a ready-made format for the back end to send a built model
to the page.

### 1.4 The documentation site's packages in the browser

`docs/build.mjs` copies these packages into the site and runs them in the page, with JSCAD's browser build and an
import map: `@rulecad/robots`, `variables`, `shapes`, `fit`, `printcheck`, `keyboard-layout`, `model-link`,
`versions`, `fea`, and the whole of `fixings`, `frames` and `flexures`, reading the published rule sets as JSON
modules. So a beam, a printed carrier, a slot nut, a screw's hole or a flexure can already be drawn and checked in a
browser by the same code `cad` uses.

### 1.5 The rest of `cad`

- `lib/host.mjs`: the core (resolve, build, check) reads and writes through a swappable `host`. `memoryHost(files)`
  keeps a workspace in memory; its own comment names a browser as a later host.
- `cad optimise --watch` and the flexure shaping view (`lib/live.mjs`, `lib/live-shape.mjs`): a local web server in a
  worker thread, serving a page that updates as a long job runs, with a stop button. That is the pattern for a
  front end served from the workspace.
- `cad check --json`: every finding in the kit's one shape (`level`, `text`, `code`, and `at`, `box`, `between`,
  `values`, `refs` where they apply), so findings can be drawn on the model where they happen.
- `cad link`, `cad preview` (six views by headless Chrome), `cad export` (3MF), `cad release`, `history`, `diff`,
  `compare`, `variants`, and the build outputs (`list`, `beams`, `order`, `kit`, `plates`, `machine`, `plot`).
- The JSON schemas in `packages/cad/schemas/` (project, object, assembly, layout, rules, problem, outline), published
  at `jonibach.github.io/rulecad/schemas/`: what each entry may hold, for building a tool's options.

### 1.6 Measured: how fast each piece is today

A 300 × 300 × 350 mm box frame of MISUMI 2020, joined blind, on levelling feet (the frames guide's box), on this
Mac on 2026-11-23:

| Step | Time | What it means for a front end |
|---|---|---|
| One `cad set … --dry-run --json` as its own process | 1.24 s | Too slow to follow a drag; most of it is starting Node and loading modules |
| The same edit called in one long-lived process (`setInAssembly`), first call | 579 ms (after a 421 ms import) | Paid once a session |
| The same, later calls | 4 to 6 ms | Fast enough to preview every step of a drag |
| `cad check --json` as its own process | 13.6 s | 268 findings: 178 passes, 90 notes |
| `buildAssembly` in one process, three runs | 12.4 s, then 10.9 s and 11.0 s | 40 parts; the build, not the check, is the slow part |
| `checkAssembly` on a built assembly | 443 ms, then 312 ms and 270 ms | Fast once built |

The scripts are in the proposal's scratch folder (`time-edit.mjs`, `time-check.mjs`); they import the library and
time it, nothing more.

## 2. Onshape's ideas, in rulecad's terms

Onshape describes its assemblies as built from "high-level kinematic relationships" (mates) placed with mate
connectors, and its advice is to "design parts where they will live" ([Onshape Assemblies](https://www.onshape.com/en/features/assemblies),
read 2026-11-23). It runs in a web browser, with phone apps, and its features can be written in a language of their
own, FeatureScript ([Onshape on Wikipedia](https://en.wikipedia.org/wiki/Onshape), read 2026-11-23). Most of its
ideas have a counterpart in rulecad already:

| Onshape | rulecad | Where it differs |
|---|---|---|
| Document, with tabs | A project (`projects/<name>/`), with objects and assemblies | Files in a folder under git, not a database |
| Part Studio and its feature list | An object: `<object>.js` (the shape, as code) and `<object>.json` (its variables) | The shape is a program; its steps are not a list a tool can reorder |
| Variable table, configurations | Variables (each with a rule and a source), tweak ranges, variants | Every rulecad value says why it is what it is |
| Assembly, mates, mate connectors | An assembly: items, fits, joints, poses, fastens; addresses on a beam (`x1.top@50%`) | Fits check a gap; joints carry limits and drive the checks |
| Named positions | Poses | The same |
| Versions and branches | `cad release`, `history`, `diff`, git | Released by what fits, not by time |
| Bill of materials, drawings | `cad list`, `cad beams` sheets, `cad order`, `cad kit` | Generated, never drawn by hand |
| FeatureScript | A design's `main(v)` in JSCAD, run in a sandbox | The same idea: shapes from code |

So the front end is less a modeller than an **assembler and checker**: it places, joins, fastens, moves, sizes and
checks, and it changes variables. Drawing new shapes is the open question in section 7.

## 3. The screen

```
+--------------------------------------------------------------------------------------+
| bench / box        [Project] [Object] [Assembly] [Frame] [Machine] [Build] [Release]   |
+------------+-------------------------------------------------------+-----------------+
| Tree       |  Tool palette: Beam  Join  Guide  Load  Fasten  Move ...  | Findings        |
|  items     |                                                       |  x 0 fail       |
|   x1 beam  |                                                       |  ! 2 warn       |
|   x2 beam  |                 3D view (the model page's own)        |  i 90 notes     |
|  joins     |                                                       |  . 178 pass     |
|  guides    |                                                       |                 |
|  loads     |                                                       | The tool's      |
|  poses     |                                                       | options, and    |
|            |                                                       | its dry run     |
+------------+-------------------------------------------------------+-----------------+
| Journal: cad add load frame/box --mass 5 --at x3.top@50%   (undo) (copy as command)   |
+--------------------------------------------------------------------------------------+
```

- **Tabs** are the workspaces. Each shows its own palette and the parts of the tree that matter to it.
- **The tree** is the assembly's entries by list, each named by its id: click one to select it in the view, and the
  reverse.
- **The view** is the model page's 3D view, with picks that name the address under the pointer: `x1`, `x1.top`,
  `x1.top@142`.
- **The right pane** holds the findings (each one clickable to show where it is) and, while a tool is open, the few
  options the tool needs, with its dry run: the changes it would make and the checks it would pass or fail.
- **The journal** lists every edit made in the session as the command that makes it, with undo, and a button to copy
  it, so whatever is done by hand can be done again by a script or an agent.

The options pane is small by design: the pick in the view supplies the names and places, and the pane asks only for
what a pick cannot say (a mass, a screw, a gap range). The values come from the schema and the rule sets: a profile is
picked from the profiles in `rules/`, a screw from the fixings sets.

## 4. The tool palette, mapped to commands

Each tool is one command. A tool's picks fill its arguments; its options pane fills the rest.

| Workspace | Tool | You do | Command it runs |
|---|---|---|---|
| Project | New project | Type a name, pick material and printer | `cad new <p> --title … --material … --printer …` |
| Project | Project fields | Change title, material, printer, AMS slots | `cad set <p> material=PETG "filaments.legend.slot=2"` |
| Project | New object | Name it | `cad new <p>/<o>` |
| Project | New assembly | Name it, or pick a frame kind and inside size | `cad new <p>/<a> --assembly [--frame box --inside … --profile … --join …]` |
| Object | Variable | Drag a slider inside its tweak range, or type a value | `cad set <p>/<o> name=value` |
| Object | New variable | Name, value, unit, and the rule it comes from | `cad set <p>/<o> --new name=value --unit mm --rule "…"` |
| Object | Why | Click a value | `cad why <p>/<o>.<name>` (read only) |
| Assembly | Insert | Pick an object, then a point or a beam's face | `cad add item --id … --object … --at x,y,z \| x1.top@50%` |
| Assembly | Move | Drag an item; it snaps to beam faces and along slots | `cad move <p>/<a> <id> --at … \| --to … [--rotate …]` |
| Assembly | Fit | Pick two parts, give the gap range | `cad add fit --a … --b … --min … --max …` |
| Assembly | Joint | Pick parent and child, a type, the limits | `cad add joint --id … --type revolute --parent … --child … --min … --max …` |
| Assembly | Pose | Set the joint sliders, name the pose | `cad add pose --name open hinge=90` |
| Assembly | Fasten | Pick the part screwed through and the one screwed into; pick a screw | `cad add fasten --screw "M3 cap" --through … --into … --holes …` |
| Assembly | Fastens from fits | One button on an assembly with holes fits | `cad add fasten --from-fits` |
| Assembly | Properties | Change one field of the selected entry | `cad set <p>/<a> <address>=<value>` |
| Assembly | Delete | Delete the selection; the refusal lists what names it, and offers "with these" | `cad remove <p>/<a> <address> [--with-refs]` |
| Frame | Beam | Click two points (snapping to beam ends and faces) | `cad add beam --id … --profile … --from … --to …` |
| Frame | Join | Pick a beam end and the face it meets | `cad add join --kind blind --a y1.a --b x1.back@120` |
| Frame | Guide | Pick a face and drag the run's length | `cad add guide --kind rail rail=… carriage=… on=x3.top from=25 length=250` |
| Frame | Load | Click where it bears, type the mass | `cad add load --mass 5 --at x3.top@50%` |
| Frame | Frame size | Change the generated frame's inside size, join, feet | `cad set <p>/<a> "frame.inside=[300,300,400]" frame.feet=foot` |
| Frame | Lightest profiles | Pick the profiles to try | `cad set … "frame.size.profiles=[…]"`, then `cad frame <ref> --size` |
| Frame | Write out | Turn a generated frame into beams that can each be edited | `cad frame <ref> --expand` |
| Machine | Task, motor, wire | Pick the tool's anchor and the sheet; a joint's motor; a wire's ends | `cad set … task.…`, `cad add wire …` |
| Machine | Plot | Drop an SVG | `cad plot …` |
| Every one | Check | Always on: runs after each edit | `cad check <ref> --json [--sweep]` |
| Build | Lists and sheets | Open the shopping list, cut list, sheets, jigs, order, plates | `cad list`, `beams [--jigs]`, `order`, `plates`, `kit` |
| Build | Measured | Type what the tape says beside what was predicted | `cad measured <ref> field=value --source …` |
| Release | Release, history, compare | Write the release note; pick two versions | `cad release -m …`, `history`, `diff`, `compare` |
| Release | Share and print | Get a link, a 3MF, a picture | `cad link`, `cad export`, `cad preview` |

## 5. How a session works

1. **Open.** `cad studio` (a name to decide) in the workspace starts a server on `127.0.0.1` and opens the page. It
   loads the edit and check modules once (about 1 s, from section 1.6), builds the open assembly and sends the page
   the model as link data, with the findings.
2. **Pick.** The user picks in the view or the tree. The page knows each part's name (`item.part`), and so its item.
   A pick on a beam's face is turned into an address by projecting the hit point on the beam's axis and choosing the
   face whose outward direction is nearest the surface's (`x1.top@142`).
3. **Edit.** The user chooses a tool and gives what it needs. As they do, each change of an option or each step of a
   drag sends a dry run (`dryRun: true`). At about 5 ms a dry run, the pane shows the changes and the checks as the
   pointer moves, and the view shows where the item would go. A refusal shows in place of the changes, by its code,
   with what would be accepted.
4. **Commit.** On release of the drag, or "Apply", the same request goes again without `dryRun`; the file is written,
   and the journal gets the command line.
5. **Check.** The server rebuilds and checks. Findings with `at`, `box` or `between` are drawn on the model; one with
   `refs` selects those entries when clicked. Today the rebuild of the box frame takes about 11 s, so until that is
   faster (phase 4), the page shows the edit at once on the parts it already has (a moved item moved, a new beam drawn
   as a plain bar of its profile's size) and marks the view "building" until the real parts arrive.
6. **Undo.** Each journal entry holds the edit's `changes` (`before` and `after` at each path). Undo is the inverse
   edit through the same commands (`set` back to `before`, `remove` what was added, `add` back what was removed), so
   it is checked like any other. It is refused if the file has changed under it since.
7. **Share.** At any point: a link, a 3MF, a release. The session never needs to be "saved": the files are always the
   design, and git holds their history.

Edits made outside the page, by a terminal or an agent, are seen by watching the workspace's files: the page reloads
the assembly and says what changed. An agent could also send a dry run for the user to accept in the page.

## 6. What runs in the browser, and what needs Node

| Piece | Today | In the plan |
|---|---|---|
| The 3D view, picking, parts panel, motion, slicing, STL and 3MF downloads | Browser (the model page) | Browser, reused |
| Beams, carriers, slot nuts, holes, flexures, kinematics, the beam solver | Browser and Node (the docs site runs them) | Browser, for instant previews of a new beam or a join's parts |
| Link data in and out | Browser and Node | The format the server sends built models in |
| Edits (`lib/edit.mjs`, `lib/jsonedit.mjs`) | Node: `edit.mjs` writes with `fs` directly, and `schema.mjs` reads the schemas from disk | Node in phases 1 to 6; the browser in phase 7, once both go through `host` |
| Building an object or an assembly | Node: designs run in a sandbox, a separate Node process under Node's permission model | Node. In a browser a design would run in a web worker with its network taken away (phase 7) |
| Checks (`checkAssembly`) | Node (reads rule sets through `host`, other parts with `fs`) | Node; browser in phase 7 |
| Pictures (`cad preview`) | Node, driving headless Chrome | Node; the page can take its own picture of its view |
| Short links (Gists), board fab files (KiCad), releases (git) | Node, with programs installed | Node |

So the front end starts as a page served by a small Node server on the user's own machine, which runs the edits and
builds in one long-lived process. The browser draws, picks and previews. A version that runs entirely in a browser,
with nothing installed, is the last phase, not the first.

## 7. The gaps

1. **No session server.** Commands run one process each (1.24 s an edit). The argument handling that turns `--at`,
   `field=value` and lists into an entry lives in `bin/cad.mjs`, mixed with printing. A function that takes a command
   as data and returns the `--json` answer, shared by the command line and the server, is the first piece of work.
2. **Object edits answer in another shape.** `cad set <project>/<object>` returns `{ file, changed }`, with no
   `--dry-run` and no `changes` or `findings`. It needs the assembly edits' shape so the Object workspace can preview
   and undo.
3. **No command yet** for an object's parts and anchors, rule sets, problems or variants (listed as follow-ups in
   [#291](https://github.com/JoniBach/rulecad/pull/291)). A tool for each needs its command first, so the terminal
   and the page stay equal.
4. **Picks name parts, not addresses.** The page can say "x1.body"; it cannot yet say `x1.top@142`, `joins.3` or
   `y1-x1-bracket`'s join. `@rulecad/frames` turns an address into a place (`beamAnchor`) but not a place into an
   address; the link would need each beam's axis and faces, and which entry made each generated part.
5. **Rebuilds are slow for frames.** 11 s for a 40-part box, every time. A cache per item, keyed on the item's
   entry, its profile's rule set and what it joins, would rebuild only what an edit touched.
6. **No handles in the view.** The page turns the camera; it has no drag handles for moving an item along an axis or
   a slot, or for turning it. three.js has these, but they need snapping to addresses and limits.
7. **Undo across sessions.** The journal lives in the page. Git is the long-term record; whether each applied edit is
   a commit is a question below.
8. **Two writers.** The page and an agent can edit the same file. Each edit reads the file afresh, so edits do not
   overwrite each other, but an undo after someone else's edit must be refused, and the page must reload on change.
9. **Safety of a local server.** Any web page in the same browser can send requests to `127.0.0.1`. The server must
   bind to `127.0.0.1` only and require a token that only the page it opened holds, as a long random value in the
   address it opens. Designs keep running in the sandbox.
10. **The model page is one large file.** `site/view.mjs` is 84 kB. The front end needs its view, picking and panels
    as modules it can import, without breaking the page as it is published.
11. **New shapes have no tools.** An object's shape is a program. A front end can change its variables, but not add a
    fillet or a hole by pointing, unless objects gain a second form: a list of features as JSON (open question 2).

## 8. A plan in phases

Sizes are estimates for one person working with the kit's usual checks and tests: **S** about a day, **M** two to
four days, **L** a week or more. Each phase is useful on its own, and each is a pull request with tests.

| Phase | What it gives | Size (estimate) |
|---|---|---|
| 1. One runner | Every edit command callable as data, `{ command, ref, args, dryRun }` in, the `--json` answer out, used by `bin/cad.mjs` itself; object variable edits in the same shape with `--dry-run` (gaps 1 and 2) | M |
| 2. Studio, read only | `cad studio`: the server (127.0.0.1, a token), the page with tabs, tree, the model page's view and findings drawn on the model; rebuilds when files change (gaps 8, 9, 10) | M |
| 3. Studio, editing | The palette for the Assembly and Frame workspaces as in section 4, dry runs while choosing, apply, the journal with undo and copy as command | L |
| 4. Picks and handles | Picks as addresses, beams drawn by two clicks, items dragged along slots with snapping, handles to turn (gaps 4 and 6) | L |
| 5. Fast rebuilds | A build cache per item; instant stand-in parts while the real ones build (gap 5) | L |
| 6. Object, Machine, Build, Release | Variables with sliders and their rules, variants, the task and wires, the build outputs, releases and compare | M |
| 7. The missing commands | Parts and anchors, rule sets, problems, variants as commands, then as tools (gap 3) | M to L |
| 8. In the browser alone | `edit.mjs`, `schema.mjs` and the checks through `host`; a workspace from a folder the browser is given or kept in the browser; designs built in a worker; a "try it" on the docs site | L, at least |

Phases 1 and 2 could be done in about a week and would already let the user watch an agent's edits land on a model
with its findings; phase 3 is when the user can build a frame without typing.

## 9. Questions for the user

1. **Server first?** A page served from your Mac by `cad studio`, reachable from your phone over Tailscale as the
   live views are, with a browser-only version last. Or is a browser-only version (nothing installed) the point?
2. **New shapes.** Should objects stay code, with the front end changing their variables only, or should there be a
   second kind of object made of features as JSON (a sketch, an extrusion, a hole by its thread, a fillet) that tools
   can write, as Onshape's feature list? The second is a large piece of work and a new schema.
3. **Which workspace first?** Frames and assemblies are where the commands are complete. Is that where you would
   use it first, or the arm and its machine?
4. **The phone.** Full editing on the phone, or view, check and small changes (a value, a pose) there and building
   on a larger screen?
5. **Agents in the loop.** Should an agent's edits arrive as proposals (dry runs) you accept or refuse in the page,
   or land directly and show in the journal?
6. **Git.** A commit for each applied edit, one for each session, or only at `cad release`?
7. **Name.** `cad studio`, `cad gui`, `cad open`, or something else?
8. **Look.** The model page's own style, or a denser desktop CAD layout with toolbars?

## Glossary

- **Address:** a place named by text, such as `x1.top@50%` (half way along beam x1's top face) or `joins.3.kind`.
- **Assembly:** a JSON file placing objects together, with the fits, joints, joins and fastenings between them.
- **Dry run:** an edit done in full, checks included, without writing the file.
- **Finding:** one result of a check, with a level (fail, warn, info, pass), a text, a code and where it applies.
- **Host:** the layer through which `cad` reads and writes files, so it can run on something other than a disk.
- **Model page:** the web page that opens a model link and draws the model (`@rulecad/viewer`).
- **Model link:** a web address carrying a model as data in its fragment, the part after `#`.
- **Object:** one designed thing: a JavaScript file for its shape and a JSON file for its variables.
- **Pick:** choosing something in the 3D view by clicking it.
- **Refusal:** an edit or input turned down by name, with nothing written.
- **Sandbox:** the separate, restricted Node process in which a design's code runs.
- **Workspace:** the folder holding a user's projects, rule sets and `cad.config.json`; in a front end, also one tab
  of tools for one kind of work.

## Sources

- rulecad on main at `afebcf1`, read 2026-11-23: `packages/cad/README.md` ("Projects and assemblies, by command"),
  `packages/cad/lib/edit.mjs`, `lib/jsonedit.mjs`, `lib/host.mjs`, `lib/live.mjs`, `bin/cad.mjs`,
  `packages/viewer/README.md`, `packages/model-link/model-link.mjs`, `docs/build.mjs`.
- [Frames 4, pull request #291](https://github.com/JoniBach/rulecad/pull/291): the edit commands, their `--json` and
  `--dry-run`, and the follow-ups.
- Timings in section 1.6: measured 2026-11-23 on the owner's Mac (Node 24.21.0) on a box frame made by the frames
  guide's commands.
- [Onshape Assemblies](https://www.onshape.com/en/features/assemblies), Onshape, read 2026-11-23.
- [Onshape](https://en.wikipedia.org/wiki/Onshape), Wikipedia, read 2026-11-23.
