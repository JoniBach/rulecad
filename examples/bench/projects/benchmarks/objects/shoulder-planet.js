// A planet in two steps, printed with the wider step on the bed, so each layer sits on the one below.
import jscad from '@jscad/modeling'
const { translate } = jscad.transforms

export function main (v) {
  const high = v.gears.spur({ module: v.module, teeth: v.high, width: v.width })
  const low = translate([0, 0, v.width], v.gears.spur({ module: v.module, teeth: v.low, width: v.width, chamfer: 0 }))
  return v.ops.union(high, low)
}
