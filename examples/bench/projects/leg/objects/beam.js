// A flat bar with two teardrop pilot holes in each end.
// The pilots are v.fixings' M3 pilots, lying on their sides: the side plates' screws cut their thread in them.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot', into: '+x' }).diameter
  const bar = cuboid({ size: [v.long, v.deep, v.wide], center: [0, 0, v.wide / 2] })
  const holes = [1, -1].flatMap((end) => [-1, 1].map((s) => v.shapes.teardropHole({ d: pilot, length: v.pilot_len + 1, at: [end * (v.long / 2 + 1), s * v.screw_y, v.wide / 2], into: end > 0 ? '-x' : '+x' })))
  return v.ops.subtract(bar, holes)
}
