// The sampler's gears, laid out to print: a row a module, a pair at each backlash, each marked on its face with as
// many dots as its backlash's place (one for 0.1, two for 0.2, three for 0.3); then the rack's and ring's pinions.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const modules = [v.module_a, v.module_b, v.module_c, v.module_d], backlashes = [v.backlash_a, v.backlash_b, v.backlash_c]
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
  return parts
}
