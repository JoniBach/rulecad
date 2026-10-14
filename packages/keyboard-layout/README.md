# @rulecad/keyboard-layout

A keyboard layout as plain JSON that everything else can read: the plate, the keycaps, the case and the circuit board
all take their positions from one file. No dependencies; browsers and Node 18+.

```json
{
  "defaults": { "legend": "@label" },
  "rows": [
    { "row": "R1", "keys": ["Esc", "Q", "W", "E"] },
    { "row": "R2", "keys": [["Tab", 1.5], "A", { "label": "F", "homing": true }] }
  ]
}
```

```js
import { keys, width, depth } from '@rulecad/keyboard-layout';

keys(layout)   // [{ label: 'Esc', u: 1, row: 'R1', legend: 'Esc', x: -1.5, y: 0.5, … }, …]
width(layout)  // 4: the widest row, in key units
depth(layout)  // 2 rows
```

- A key is a label (`"Q"`, 1u wide), `[label, units]`, or an object with `label`, `u` and any other properties.
- A row is a list of keys, or an object whose other properties apply to every key in it. `defaults` apply to every
  key, and a key's own properties win. `"@label"` means the key's own label.
- Rows run back to front and start at the same left edge. `x` and `y` are each key's centre in key units, with the
  layout centred on 0 (x to the right, y to the back). Multiply by your pitch (19.05 mm for Cherry MX).
- `project(layout, fields)` keeps only the fields something reads, so you can tell whether an edit matters to it.
