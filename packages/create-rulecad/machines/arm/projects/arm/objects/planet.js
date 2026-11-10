// A planet in two steps, in one piece, printed with the wider step on the bed.
import jscad from '@jscad/modeling'
const { translate } = jscad.transforms

export function main (v) {
  const high = v.gears.spur({ module: v.module, teeth: v.high, width: v.width })
  const low = translate([0, 0, v.width], v.gears.spur({ module: v.module, teeth: v.low, width: v.width, chamfer: v.low_chamfer }))
  return v.ops.union(high, low)
}
