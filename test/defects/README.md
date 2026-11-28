# Seeded defects

A check that passes what it should fail is the hardest fault to see: nothing goes red. This folder holds small cases
that are each wrong in exactly one way, with the finding the check must give for them. `test/defects.test.mjs` runs
every case through its check on every `npm test`, in CI on every system.

Each case has a **good twin**: the same shape made right, which must pass. A fix that simply failed everything would
turn its twin red. Where the fault is a check failing what it should pass (a false failure), the twin is the same
shape truly wrong, which must still fail.

## A case

A case is two files side by side in the folder of its check:

- `<name>.json` or `<name>.mjs`: the input. A `.json` file is the input as it is. An `.mjs` file builds it, for a mesh
  too big to write out by hand: its `export default` is the input, or a function that returns it. Files and folders
  whose names start with `_` are helpers the cases share (`printcheck/_mesh.mjs`), not cases.
- `<name>.expect.json`: what the check must say.

and its twin is `<name>.good.json` (or `.mjs`) with `<name>.good.expect.json`. The runner refuses a case with no twin,
an input with no expectation, and a field it does not know.

## The expectation

| Field | What it says |
|---|---|
| `check` | which check reads the input (the list below) |
| `about` | one plain sentence: what is wrong with the case, or right with the twin; shown when it fails |
| `finding` | the review finding it comes from, if any (`foundations-3`) |
| `code` | the finding code the check must give; a list means any one of them |
| `level` | the level that finding must have; a list means any one of them |
| `text` | optional: words the finding's text must hold (not minding capitals) |
| `must_not` | optional: findings the check must not give. A code alone means that code at any level but `pass`; `{ "code", "level", "text" }` matches on each field given |
| `within_ms` | optional: the most time the check may take, in milliseconds |
| `todo` | the ticket that fixes the fault, `"#123 its title"`, while it is open (never on a twin) |

A case marked `todo` still runs, but a failure does not fail the suite: the fault shows as todo in the test report
until it is fixed. A todo case that passes is listed at the end of the run. The pull request that fixes the fault
takes `todo` out of its `.expect.json`, so the case guards the fix from then on.

## The checks

| `check` | Input | Findings |
|---|---|---|
| `printcheck` | `{ triangles, printer, options }` | `check()`'s own: `print.ledge`, `print.closed`, … with `pass`, `warn` or `fail` |
| `fit` | `{ a, b, reach }`, two solids as faces | `fit.overlap` (`fail`) if they run into each other, else `fit.clear` (`pass`, text `gap <mm> mm`) |
| `versions` | `{ before, after }`, each `{ object, sets, js }` | `versions.release` at the level of the release it needs: `major`, `minor`, `patch`, or `none`; its reasons are the text |
| `variables` | `{ object, sets, set }` for `resolve()` | the error's code (`var.unknown`, …) at `fail` if it refuses, else `var.resolved` (`pass`, the values as text) |
| `lint` | `{ source }`, a design's code | `lint.number` (`fail`, text `line <n>: <number>`) for each raw number, else `lint.clean` (`pass`) |
| `keyboard-layout` | `{ layout }` for `keys()` | `layout.refused` (`fail`) if it refuses the layout, else `layout.keys` (`pass`, each key's place as text) |

The checks are in `checks.mjs`. A new check is a function there from its input to findings `{ level, code, text }`.

## A worked example

printcheck counted a whole flat underside as resting on a breakaway support when the centre of each of its triangles
was over a support. `printcheck/breakaway-centroid.mjs` builds the shape that shows it, a 40 mm slab 0.2 mm above a
14 mm pad:

```js
import { box, printer } from './_mesh.mjs';
export default { triangles: [...box([-20, -20, 10], [20, 20, 12]), ...box([-7, -7, 0], [7, 7, 9.8])], printer };
```

`printcheck/breakaway-centroid.expect.json` says that 13 mm of slab hanging free on each side is a ledge:

```json
{
  "check": "printcheck",
  "about": "a 40 mm slab on a 14 mm breakaway pad hangs 13 mm free each side, so it is a ledge, not wholly supported",
  "finding": "foundations-3",
  "code": "print.ledge",
  "level": "warn",
  "todo": "#407 Hardening 2.50: printcheck judges supports by the area they cover and catches short steep overhangs"
}
```

Its twin, `breakaway-centroid.good.mjs`, puts the same slab over a pad as big as itself, and
`breakaway-centroid.good.expect.json` asks for `print.breakaway` at `pass` with no `print.ledge`. Run the folder
alone with `node --test test/defects.test.mjs`; set `DEFECTS_SHOW=1` to print every finding each check gave.

## The cases

| Case | Fault | Ticket while open |
|---|---|---|
| `printcheck/breakaway-centroid` | a slab on a small pad passes as wholly supported | #407 |
| `printcheck/one-layer-island` | a one-layer breakaway support passes, and the slab on it is also called an island | #407 |
| `printcheck/short-steep-overhang` | a collar leaning 75 degrees over 1.15 mm passes | #407 |
| `printcheck/flipped-face` | one face turned the wrong way round is reported as holes | #407 |
| `fit/coplanar-overlap` | two cubes sharing half their volume on one plane read as touching | fixed by #371 |
| `fit/large-triangle` | a box through a 2 m panel of big triangles takes seconds | #516 |
| `versions/narrowed-tweak` | narrowing an interface tweak range is called a patch | #425 |
| `versions/removed-rule` | a rule set dropped from `uses` is no change at all | #425 |
| `variables/unitless-typo` | a typo in a rule with no unit becomes text without a word | #539 |
| `lint/regex-literal` | a regex holding a quote hides the numbers after it | #414 |
| `lint/regex-quantifier` | the 3 in a regex's `{3}` is flagged as a raw number | #414 |
| `keyboard-layout/text-width` | a key width written as text is joined onto the positions | #547 |
