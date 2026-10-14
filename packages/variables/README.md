# @rulecad/variables

Design values you can trace. Every measurement is a variable, and every variable can say where it comes from: a
printer's spec, a standard, a community figure, or something you measured (`kind`: spec, community, measured or
estimate, with its `source`). Expressions are parsed, never `eval`'d, so a JSON file can't run code. No dependencies;
browsers and Node 18+.

```js
import { resolve } from '@rulecad/variables';

const printer = { name: 'printer', rules: {
  line: { value: 0.42, unit: 'mm', kind: 'spec', source: 'Bambu Lab wiki' },
  wall: { value: 'line * 3' },
} };
const tray = {
  uses: ['printer'],
  variables: {
    wall:   { value: 'printer.wall', label: 'Wall' },
    length: { value: 120, unit: 'mm', tweak: { min: 80, max: 160 } },
    inner:  { value: 'length - 2 * wall' },
  },
};

const { values, entries } = resolve(tray, { sets: { printer }, set: { length: 140 } });
values.inner          // 137.48
entries               // every variable and rule with its value, source and whether anything used it
```

- **Expressions:** `+ - * /`, brackets, `min`, `max`, `round(x, step)`, and `sind`/`cosd`/`tand` in degrees, over
  numbers and names. `evaluate(src, lookup)` runs one on its own.
- **Rule sets** are handed in through `sets`, or fetched by name with `load: (name) => …` (from files, a URL, anywhere).
- **Tweaks:** only variables with a `tweak` range can be set, and only within it. Errors say which variable and why.
- **Names, not numbers:** `choice: [...]`, `type: 'text'` or `type: 'anchor'` (one of `ANCHORS`: tl tc tr / ml mc
  mr / bl bc br) hold names, and they're checked too.
- **display:** values for a lighter on-screen copy (fewer segments, no fine detail). They aren't checked and they
  don't change what prints.
