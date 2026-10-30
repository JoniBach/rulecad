// The flexure sampler: two rails along x with flexures standing off them along y, every one bending in the plane of
// the bed. Front rail: leaf springs at three thicknesses with an eye at the tip, a parallel guide, a serpentine
// spring. Back rail: two notch hinges, a bistable beam, two living hinges. Measure each against its prediction in
// README.md.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const f = v.flexures, h = v.height, parts = []
  const at = (shape, dx, dy) => parts.push(translate([dx, dy, 0], shape))
  const eyeAt = (dx, dy) => { // an eye to hang a weight or push with the gauge
    parts.push(translate([dx, dy, 0], v.ops.subtract(cylinder({ radius: v.hook / 2, height: h, center: [0, 0, h / 2], segments: v.smooth }), cylinder({ radius: v.eye / 2, height: h + 2, center: [0, 0, h / 2], segments: v.smooth }))))
  }
  const up = (shape) => rotateZ(Math.PI / 2, shape) // a flexure drawn along x, stood off the rail along y
  // Front rail: leaf springs at three thicknesses, a parallel guide, a serpentine spring
  let x = 0
  for (const t of [v.thin, v.mid, v.thick]) {
    at(up(f.leaf({ length: v.length, thickness: t, width: h })), x, 0)
    eyeAt(x, v.length + v.hook / 2 - v.eye_in)
    x += v.spacing
  }
  x += v.gap / 2
  at(up(f.parallelGuide({ length: v.guide_length, thickness: v.mid, width: h, gap: v.gap })), x, 0)
  x += v.gap / 2 + v.spacing
  const span = (v.turns - 1) * v.pitch
  at(up(f.serpentine({ length: v.serp_length, thickness: v.mid, width: h, turns: v.turns, pitch: v.pitch })), x + span, 0)
  eyeAt(x, v.serp_length + v.hook / 2 - v.eye_in)
  x += span + v.spacing
  const front = x - v.spacing + v.hook
  // Back rail: two notch hinges, a bistable beam across x on two posts, two living hinges
  x = 0
  const y = v.row
  for (const t of [v.thin, v.mid]) {
    at(up(f.notchHinge({ radius: v.notch, neck: t, width: h, arms: v.arms })), x, y)
    x += v.spacing
  }
  const lift = v.rail / 2 + v.post + v.thin + v.rise // the beam's ends off the rail
  at(f.bistable({ length: v.bistable_length, rise: v.rise, thickness: v.thin, width: h, ends: v.post }), x + v.post, y + lift)
  for (const px of [x + v.post / 2, x + v.post + v.bistable_length + v.post / 2]) parts.push(cuboid({ center: [px, y + lift / 2, h / 2], size: [v.post, lift, h] }))
  x += v.bistable_length + 2 * v.post + v.spacing
  for (const l of [v.flex, v.flex * 2]) {
    at(up(f.livingHinge({ flex: l, thickness: v.thin, width: h, arms: v.hinge_arms })), x, y)
    x += v.spacing
  }
  const back = x - v.spacing + v.hook
  const rail = (len, dy) => cuboid({ center: [len / 2 - v.hook, dy - v.rail / 2, h / 2], size: [len, v.rail, h] })
  const spine = cuboid({ center: [v.rail / 2 - v.hook, (y - v.rail) / 2, h / 2], size: [v.rail, y, h] }) // joins the rails
  return v.ops.union(rail(front, 0), rail(back, y), spine, ...parts)
}
