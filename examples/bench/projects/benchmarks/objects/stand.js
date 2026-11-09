// A stand: the plate flat on the bed (its front face down, a plain rectangle with five small holes), the foot rising
// from one edge, a gusset each side. The motor goes on top in this view, its shaft down through the plate.
import jscad from '@jscad/modeling'
const { cuboid, roundedRectangle, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateX, rotateY } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('17HS4401')
  const plate = extrudeLinear({ height: v.plate }, roundedRectangle({ size: [v.width, v.height], roundRadius: v.corner, segments: v.segments }))
  const foot = cuboid({ size: [v.width, v.wall, v.foot], center: [0, 0 - v.height / 2 + v.wall / 2, v.foot / 2] })
  const rib = (x) => translate([x, 0 - v.height / 2 + v.wall, v.plate], rotateY(0 - Math.PI / 2, rotateX(0, extrudeLinear({ height: v.rib_wide }, polygon({ points: [[0, 0], [v.rib, 0], [0, v.rib]] })))))
  // mount() has the motor's face at z = 0 and the plate above it: turned over, so the boss's pocket is on top here
  const cuts = translate([0, 0, v.plate], rotateX(Math.PI, v.motors.mount(motor, { plate: v.plate }, v.ops)))
  return v.ops.subtract(v.ops.union(plate, foot, rib(0 - v.width / 2 + v.rib_wide), rib(v.width / 2)), cuts)
}
