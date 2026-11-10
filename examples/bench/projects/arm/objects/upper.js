// The upper arm, drawn as it prints: its top face on the bed, the elbow's ring standing on it, the hub's socket opening
// upward. The elbow's NEMA 14 bolts on the bed side, its shaft up through the plate, as chapter 11's housing does.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, cuboid, circle } = jscad.primitives
const { translate, rotateZ } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const motor = v.motors.motorModel('nema14')
  const at = (r, a) => [v.long + r * Math.cos(a), r * Math.sin(a)]
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad)
  const round = (r, c) => translate([c, 0], circle({ radius: r, segments: v.segments }))
  const neck = extrudeLinear({ height: v.thick }, hull(round(v.hub / 2, 0), round(v.neck / 2, v.long)))
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.ring_segments })
  const plate = cylinder({ radius: v.rim / 2, height: v.thick, center: [v.long, 0, v.thick / 2], segments: v.ring_segments })
  const ring = translate([v.long, 0, v.thick], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.gear, rim: v.rim }))
  const lobes = posts.map((a) => cylinder({ radius: v.lobe / 2, height: v.thick, center: [...at(v.post_r, a), v.thick / 2], segments: v.segments }))
  const joins = posts.map((a) => translate([v.long, 0, 0], rotateZ(a, cuboid({ size: [v.post_r - v.rim / 2 + 2, v.lobe, v.thick], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.thick / 2] }))))
  const uprights = posts.map((a) => cylinder({ radius: v.post / 2, height: v.clip_at, center: [...at(v.post_r, a), v.clip_at / 2], segments: v.segments }))
  const pilots = posts.map((a) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.clip_at - v.pilot_depth / 2], segments: v.segments }))
  const collar = cylinder({ radius: v.collar_d / 2, height: v.collar + 1, center: [0, 0, v.thick + (v.collar - 1) / 2], segments: v.segments })
  const socket = cylinder({ radius: (v.hex + v.hex_fit) / 2 / v.cos30, height: v.hex_depth + 1, center: [0, 0, v.floor + (v.hex_depth + 1) / 2], segments: v.hex_segments })
  const through = cylinder({ radius: v.screw / 2, height: v.floor + 1, center: [0, 0, (v.floor - 1) / 2], segments: v.segments })
  const flag = cuboid({ size: [v.flag_wide, v.flag_thick, v.flag_h], center: [v.flag_r, 0, v.thick + v.flag_h / 2] })
  const a = v.switch_a * v.rad
  const switchPost = translate([v.switch_x, v.switch_y, 0], rotateZ(a, cuboid({ size: [v.post_w, v.post_d, v.thick + v.switch_high], center: [0, 0, (v.thick + v.switch_high) / 2] })))
  const switchPilots = [-1, 1].map((s) => cylinder({ radius: v.switch_pilot / 2, height: v.switch_depth, center: [v.switch_x + s * v.switch_pitch / 2 * Math.cos(a), v.switch_y + s * v.switch_pitch / 2 * Math.sin(a), v.thick + v.switch_high - v.switch_depth / 2], segments: v.segments }))
  const bands = [v.bias_1, v.bias_2].map((x) => cylinder({ radius: v.bias_d / 2, height: v.thick + 1, center: [x, 0, v.thick / 2], segments: v.segments }))
  const hole = v.motors.mountModel(motor, { plate: v.thick, counterbore: true }), rise = v.thick - hole.pocketDepth
  const roof = translate([v.long, 0, 0], cylinderElliptic({ height: rise + 1, startRadius: [hole.pocket / 2, hole.pocket / 2], endRadius: [hole.pocket / 2 - rise - 1, hole.pocket / 2 - rise - 1], center: [0, 0, hole.pocketDepth + (rise + 1) / 2], segments: v.segments }))
  const mount = translate([v.long, 0, 0], v.motors.mount(motor, { plate: v.thick, counterbore: true }, v.ops))
  return v.ops.subtract(v.ops.union(neck, hub, plate, ring, lobes, joins, uprights, collar, flag, switchPost), socket, through, pilots, switchPilots, bands, mount, roof)
}
