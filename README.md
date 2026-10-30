# rulecad

A kit for designing physical things you can trace, check, share and print. Small pieces, each useful alone: plain
JavaScript modules with **no dependencies** (shapes uses the JSCAD you already have), the same in a browser and in
Node 20+, no build step, with types for your editor, MIT licensed (the rule data is CC0).

**Documentation:** [a page for each library](https://jonibach.github.io/rulecad/docs/), with live demonstrations of
the ones that run in a browser.

**The tool:** [`@rulecad/cad`](packages/cad) is the `cad` command that puts them together. Design in JSCAD from
rules you can trace, check for printing and fit, version by what fits, share as a link, and export for the printer:

```sh
npm create rulecad my-designs      # a project with a soap tray to start from
cd my-designs
npx cad check home/soap-tray       # printable? and every measurement a variable?
npx cad export home/soap-tray      # a 3MF for your slicer
```

[`@rulecad/viewer`](packages/viewer) is a model page you can host anywhere: it opens model links, or **drop an STL on
it** to see it, check it for printing and get a link to share. Nothing is uploaded. Try it now, with nothing to
install: [jonibach.github.io/rulecad](https://jonibach.github.io/rulecad/).

Every new project gets an `AGENTS.md`: how an AI agent (Claude Code and others) should design there. Rules first,
look at the preview, report fits with numbers. `npx cad agents` adds it to an existing project.

Also [`@rulecad/pcb`](packages/pcb), keyboard circuit boards from rules (Gerbers and a JLCPCB BOM, no framework), and
[`@rulecad/rules`](packages/rules), researched facts (a Bambu Lab X1C, Cherry MX, OEM keycaps, the Raspberry Pi Pico,
materials for analysis) as public-domain data, each value with its source. [`examples/bench`](examples/bench)
has test blocks for the optimiser: levers (2D) and wall brackets (3D) of equal mass to print and load-test.

**The pieces**, each useful alone:

| Package | What it gives you |
|---|---|
| [`@rulecad/printcheck`](packages/printcheck) | Is this mesh printable? Bed fit, flat base, overhangs, bridges, breakaway supports, watertightness, for any FDM printer. |
| [`@rulecad/model-link`](packages/model-link) | Share a model as a link (the model lives in the URL, nothing is uploaded), and write STL or multi-colour Bambu Studio 3MF files. |
| [`@rulecad/variables`](packages/variables) | Design values you can trace: every number says where it comes from; expressions are parsed, never run. |
| [`@rulecad/fit`](packages/fit) | Do these parts fit? The closest gap between two meshes, fast enough for a whole keyboard. |
| [`@rulecad/keyboard-layout`](packages/keyboard-layout) | A plain JSON keyboard layout: rows of keys with widths and any per-key properties. |
| [`@rulecad/versions`](packages/versions) | Semver for physical parts: a change to what other parts fit against is major, so you know when an old print stops fitting. |
| [`@rulecad/shapes`](packages/shapes) | For JSCAD designs: text that prints cleanly, anchors on a face, cuts that leave no hairline gaps. Needs JSCAD (peer). |
| [`@rulecad/flexures`](packages/flexures) | Parts that move by bending: leaf springs, guides, serpentine springs and notch hinges, each with its stiffness, its strain at a travel, and how it prints. Needs JSCAD (peer) |
| [`@rulecad/fea`](packages/fea) | How far a flat part bends under load: finite elements on a grid, in plain JavaScript, checked against beam theory. |
| [`@rulecad/topopt`](packages/topopt) | Topology optimisation for flat parts: the stiffest layout of a fixed amount of material, as outlines ready to extrude. Matches the published 88-line code step for step. |

```sh
npm install @rulecad/printcheck
```

```js
import { check } from '@rulecad/printcheck';

const printer = { bed: 256, overhang: 45, layer: 0.2, bridge: 5 };   // mm and degrees
for (const f of check(triangles, printer)) console.log(f.level, f.text);  // pass / warn / fail, in plain words
```

Or with no install at all, straight from a CDN in a web page:

```html
<script type="module">
  import { check } from 'https://esm.sh/@rulecad/printcheck';
</script>
```

## Why it's free

Everything here was made with the help of language models, and those models were made from what people wrote and
shared in the open. What's made from the commons belongs back in the commons: use it, change it, sell things made
with it, no permission needed. If you improve it, sharing back is welcome, never required.

## Working on it

See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contribution is a measurement: if a rule is wrong for your
printer or parts, the "Correct a rule" issue form takes a minute.

**Releasing:** bump a package's `version` in its package.json and merge to `main`. The publish workflow runs the
tests, then publishes every package whose version isn't on npm yet, with provenance. npm trusts that workflow for
each package (`scripts/trust.sh`, once per package, by a maintainer), so there are no tokens to keep.

```sh
npm install   # links the packages to each other; JSCAD comes in only to make test shapes
npm test      # node:test, no other tools
```

Each package is one `.mjs` file with its documentation at the top. Rules for changes: no dependencies but each other and a CAD kernel as a peer (a test checks),
nothing that only runs in Node, and new behaviour comes with a test.

The kit grew out of a rule-driven design project for 3D printing: a keyboard, its keycaps, case and circuit boards.
