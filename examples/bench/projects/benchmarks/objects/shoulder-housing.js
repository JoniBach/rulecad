// The housing: a plain disc on the bed, thick under the ring and thinner outside it, the ring standing on it, three posts.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  // From v.fixings: the motor's M3 screws' clearance holes and the seats their cap heads sink into, and the pilots the
  // M3 screws from the clips cut their own thread in
  const f = v.fixings, hole = f.holeModel('M3', { depth: v.plate }).diameter, head = f.counterboreModel('M3').diameter, pilot = f.holeModel('M3', { kind: 'pilot' }).diameter
  const disc = (r, h, z0 = 0) => cylinder({ radius: r, height: h, center: [0, 0, z0 + h / 2], segments: v.segments * 2 })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const angles = Array.from({ length: v.third }, (_, k) => (v.start + (2 * v.half_turn * k) / v.third) * Math.PI / v.half_turn), at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const posts = angles.map((a) => cylinder({ radius: v.post / 2, height: v.post_height, center: [...at(a), v.post_height / 2], segments: v.segments }))
  const pilots = angles.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth + 1, center: [...at(a), v.post_height - v.pilot_depth / 2 + 1 / 2], segments: v.segments }))
  const s = v.spacing / 2, holes = [[s, s], [s, 0 - s], [0 - s, s], [0 - s, 0 - s]].flatMap(([x, y]) => [
    cylinder({ radius: hole / 2, height: v.plate + 1, center: [x, y, v.plate / 2], segments: v.segments }),
    cylinder({ radius: head / 2, height: v.sink + 1, center: [x, y, v.plate - v.sink / 2 + 1 / 2], segments: v.segments })])
  return v.ops.subtract(v.ops.union(disc(v.radius, v.thin), disc(v.inner, v.plate), ring, posts), holes, pilots, cylinder({ radius: v.shaft / 2, height: v.plate + 1, center: [0, 0, v.plate / 2], segments: v.segments }))
}
