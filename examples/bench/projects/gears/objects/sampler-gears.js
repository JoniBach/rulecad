// The sampler's gears, laid out to print: a row a module, a pair at each backlash, each marked on its face with as
// many dots as its backlash's place (one for 0.1, two for 0.2, three for 0.3); then the rack's and ring's pinions, and
// the loose rack and ring.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const modules = [v.module_a, v.module_b, v.module_c], backlashes = [v.backlash_a, v.backlash_b, v.backlash_c]
  const g = v.gears, z = v.teeth, parts = {}
  const gear = (mod, b, dots, x, y) => {
    const ring = (v.bore / 2 + g.gearModel({ module: mod, teeth: z }).root / 2) / 2, step = v.dot_pitch / ring // halfway between the bore and the roots
    const marks = Array.from({ length: dots }, (_, i) => cylinder({ radius: v.dot / 2, height: v.dot_height, center: [ring * Math.cos(i * step), ring * Math.sin(i * step), v.width + v.dot_height / 2] }))
    return translate([x, y, 0], v.ops.union(g.spur({ module: mod, teeth: z, width: v.width, bore: v.bore, backlash: b }), ...marks))
  }
  let y = 0
  for (const mod of [...modules, 1]) {
    const tip = mod * (z + 2), extra = Object.keys(parts).length === modules.length * backlashes.length * 2
    const row = extra ? [[v.extra_backlash, backlashes.indexOf(v.extra_backlash) + 1], [v.extra_backlash, backlashes.indexOf(v.extra_backlash) + 1]] : backlashes.flatMap((b, k) => [[b, k + 1], [b, k + 1]])
    row.forEach(([b, dots], i) => { parts[extra ? `pinion_${i ? 'ring' : 'rack'}` : `m${String(mod).replace('.', '_')}_b${String(b).replace('.', '_')}_${i % 2 ? 'b' : 'a'}`] = gear(mod, b, dots, tip / 2 + i * (tip + v.gap), y + tip / 2) })
    y += tip + v.gap
  }
  // the loose rack and ring, in a row of their own
  const ring = g.internalModel({ module: 1, teeth: v.ring_teeth, backlash: v.extra_backlash })
  parts.rack = translate([0, y - g.rackModel({ module: 1, teeth: v.rack_teeth, height: v.rack_bar }).rootLine + v.rack_bar, 0], g.rack({ module: 1, teeth: v.rack_teeth, width: v.width, height: v.rack_bar, backlash: v.extra_backlash }))
  parts.ring = translate([g.rackModel({ module: 1, teeth: v.rack_teeth }).length + v.gap + ring.rim / 2, y + ring.rim / 2, 0], g.internal({ module: 1, teeth: v.ring_teeth, width: v.width, backlash: v.extra_backlash }))
  return parts
}
