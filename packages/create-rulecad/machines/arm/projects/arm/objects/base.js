// A plate with three columns and a post: first layer one square with four holes. Every screw's hole is v.fixings':
// the M5 bolts' clearance, the M3 pilots the housing's screws cut their thread in, and the switch's M2 pilots.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const bolt = v.fixings.holeModel('M5').diameter, pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, switchPilot = v.fixings.holeModel('M2', { kind: 'pilot' }).diameter
  const plate = extrudeLinear({ height: v.foot }, roundedRectangle({ size: [v.side, v.side], roundRadius: v.corner, segments: v.segments }))
  const angles = [v.c1, v.c2, v.c3].map((a) => a * v.rad)
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const columns = angles.map((a) => cylinder({ radius: v.column / 2, height: v.column_top, center: [...at(v.column_r, a), v.column_top / 2], segments: v.segments }))
  const pilots = angles.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.column_r, a), v.column_top - v.pilot_depth / 2], segments: v.segments }))
  const a = v.post_a * v.rad
  const post = translate([...at(v.post_r, a), 0], rotateZ(a, cuboid({ size: [v.post_w, v.post_d, v.post_top], center: [0, 0, v.post_top / 2] })))
  const pads = [-1, 1].map((s) => cylinder({ radius: switchPilot / 2, height: v.switch_depth, center: [...at(v.post_r + s * v.switch_pitch / 2, a), v.post_top - v.switch_depth / 2], segments: v.segments }))
  const holes = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, y]) => cylinder({ radius: bolt / 2, height: v.foot + 1, center: [x * v.bolt_at, y * v.bolt_at, v.foot / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(plate, columns, post), pilots, pads, holes)
}
