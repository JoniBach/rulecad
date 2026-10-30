# @rulecad/printcheck

Is this mesh printable on an FDM printer? Hand it triangles and your printer's limits; get back findings in plain
words. No dependencies; browsers and Node 20+.

```js
import { check } from '@rulecad/printcheck';

const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42 };
const findings = check(triangles, printer);
// [{ level: 'pass', text: '20 × 4 × 12 mm, fits the bed' },
//  { level: 'warn', text: 'an underside at z 10 starts in mid-air: needs support …' }, …]
```

`triangles` is `[[[x, y, z], [x, y, z], [x, y, z]], …]` in millimetres, **Z up, the bed at z = 0**: the model is
checked as it will print, so its orientation is part of the design. Any CAD library's output works once
triangulated.

What it checks:

- **Fits the bed** (`bed`, mm) and **sits on it**: lowest point at z = 0, with faces flat on the bed.
- **Overhangs** steeper than `overhang` degrees from vertical.
- **Flat undersides above the bed**: each must start on something. Either it rests on a built-in **breakaway support**
  (one `support_gap` below a surface), or it **bridges** no wider than `bridge` mm. The bridge is the widest circle that
  fits in the underside, measured to the edges held up by material below. An underside held by nothing starts in
  mid-air.
  An underside narrower than a print line (`line`, 0.4 mm unless given) is a sliver the slicer lays nothing on, and
  is not counted.
- **Closed solid**: every edge is matched by a face on the other side. T-junctions count as closed, and so do hairline
  seams narrower than `HAIRLINE` (0.01 mm), which booleans leave and no printer can resolve. Wider gaps are holes.
- **One piece**: a loose piece would print as a stray bit or fall over. A cavity inside a part (its surface faces in)
  isn't a piece.
- **Nothing starting in mid-air**: the lowest point of a tip hanging down (an icicle), with nothing below it to print
  on. Its faces point down, and for a millimetre above it the surface stays narrow. The face-by-face overhang check
  misses a tip like this, because each of its faces may slope at 45° or less. A shallow dip in a smoothed underside
  spreads wide, so it doesn't count.

Several parts printed together (a keycap with an inlaid legend in another colour): pass
`{ parts: [{ triangles, role }] }`. Then one part resting on another isn't an overhang, and each part must be closed on
its own. A part with `role: 'support'` is printed and then removed.

Also exported: `bounds(triangles)` (`{ lo, hi, size }`), `seams(triangles)` (`{ gaps, tjunctions, hairlines }`),
`shape(triangles)` (`{ pieces, tips }`) and `widest(polys, held, under)` (the bridge measurement).
