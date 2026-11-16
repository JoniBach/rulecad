// The motor plate with the fixed ring and posts standing on it. The motor bolts underneath, its shaft up through the middle.
// The screws' holes are v.fixings': an M3 pilot in each post for the bridge, and an M3 clearance hole with its cap
// head's counterbore in each foot, sunk a layer, for the screw down into the base's column.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const motor = v.motors.motorModel('17HS4401')
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), feet = [v.f1, v.f2, v.f3].map((a) => a * v.rad)
  const plate = cylinder({ radius: v.rim / 2, height: v.plate, center: [0, 0, v.plate / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.gear, rim: v.rim }))
  const lobes = [...posts, ...feet].map((a) => cylinder({ radius: v.lobe / 2, height: v.plate, center: [...at(v.post_r, a), v.plate / 2], segments: v.segments }))
  const joins = [...posts, ...feet].map((a) => jscad.transforms.rotateZ(a, jscad.primitives.cuboid({ size: [v.post_r - v.rim / 2 + 2, v.lobe, v.plate], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.plate / 2] })))
  const uprights = posts.map((a) => cylinder({ radius: v.post / 2, height: v.post_high + v.plate, center: [...at(v.post_r, a), (v.post_high + v.plate) / 2], segments: v.segments }))
  const pilots = posts.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.plate + v.post_high - v.pilot_depth / 2], segments: v.segments }))
  const screws = feet.map((a) => cylinder({ radius: screw / 2, height: v.plate + 1, center: [...at(v.column_r, a), v.plate / 2], segments: v.segments }))
  const heads = feet.map((a) => cylinder({ radius: head / 2, height: headDepth, center: [...at(v.column_r, a), v.plate - headDepth / 2], segments: v.segments }))
  // the pocket for the motor's boss would be bridged across: a 45° cone from its roof up through the plate needs no bridge
  const hole = v.motors.mountModel(motor, { plate: v.plate, counterbore: true }), rise = v.plate - hole.pocketDepth
  const roof = cylinderElliptic({ height: rise + 1, startRadius: [hole.pocket / 2, hole.pocket / 2], endRadius: [hole.pocket / 2 - rise - 1, hole.pocket / 2 - rise - 1], center: [0, 0, hole.pocketDepth + (rise + 1) / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(plate, ring, lobes, joins, uprights), v.motors.mount(motor, { plate: v.plate, counterbore: true }, v.ops), pilots, screws, heads, roof)
}
