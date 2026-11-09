// The arm, printed on its side: a flat bar on the bed with a hub rising at one end (the bore closed at its floor, its
// mouth up) and a pointer rising at the other. Turned over, it goes on the motor's shaft with the pointer towards the dial.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, roundedRectangle, sphere } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateX } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('17HS4401'), span = v.length + v.beyond + v.hub / 2
  const bar = translate([(v.length + v.beyond - v.hub / 2) / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [span, v.bar], roundRadius: v.corner, segments: v.segments })))
  const hub = cylinder({ radius: v.hub / 2, height: v.hub_height, center: [0, 0, v.hub_height / 2], segments: v.segments })
  const pointer = cylinderElliptic({ height: v.pointer_top, startRadius: [v.pointer / 2, v.pointer / 2], endRadius: [v.point / 2, v.point / 2], center: [v.pointer_r, 0, v.pointer_top / 2], segments: v.segments })
  const nub = cylinder({ radius: v.nub / 2, height: v.thick, center: [v.length + v.beyond, 0, v.thick / 2], segments: v.segments })
  const holes = [v.r1, v.r2, v.r3, v.r4].map((r) => cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [r, 0, v.thick / 2], segments: v.segments }))
  const bore = translate([0, 0, v.hub_height], rotateX(Math.PI, v.motors.bore(motor, { depth: v.depth, tip: v.tip, printer: { hole_comp: v.comp } }, v.ops)))
  return v.ops.subtract(v.ops.union(bar, hub, pointer, nub), holes, bore)
}
