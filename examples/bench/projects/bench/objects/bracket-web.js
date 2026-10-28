// Bracket bench, bracket A: a back plate (on the bed) the envelope's size, an upright web midway between the bolts
// up to the load boss, and the boss along x, pointed below (a teardrop, so it prints), with the load bolt's hole. The
// web's thickness t comes from the volume: plate + boss + web = target, the web less the boss's lower half, which
// it would otherwise fill twice. The hole is pointed above, so its roof prints. Print coordinates: z up from the bed (out from the wall in use), y up the wall.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { union, subtract } = jscad.booleans
const { translate } = jscad.transforms

export function main (v) {
  const b = v.bench, mid = b.pitch / 2, r = b.boss4, hole = v.hole4
  const plate = b.bracket_w * b.bracket_h * b.plate - Math.PI * v.hole5 * v.hole5 * b.plate * 2
  // The boss's section: a half circle above its axis, a half square (corner down) below, less the hole
  const lowerHalf = r * r * 2 - Math.PI * hole * hole / 2, section = Math.PI * r * r / 2 + lowerHalf - Math.PI * hole * hole / 2
  const t = (v.target - plate - section * b.boss_len) / (b.bracket_h * (b.reach - b.plate) - lowerHalf)
  if (t > b.pitch - b.wrench * 2) throw new Error(`the web would be ${t.toFixed(1)} mm thick: wider than the gap between the bolts' heads`)
  const box = (x0, x1, y0, y1, z0, z1) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], cuboid({ size: [x1 - x0, y1 - y0, z1 - z0] }))
  const upright = (x) => translate([x, 0, b.plate / 2], cylinder({ radius: v.hole5, height: b.plate * 2, segments: v.smooth }))
  const boss = v.shapes.solidRegion({ at: [mid, 0, b.reach], r, length: b.boss_len, axis: 'x', teardrop: '-z' }, v.smooth)
  const body = union(
    box(mid - b.bracket_w / 2, mid + b.bracket_w / 2, 0 - b.bracket_h / 2, b.bracket_h / 2, 0, b.plate),
    box(mid - t / 2, mid + t / 2, 0 - b.bracket_h / 2, b.bracket_h / 2, b.plate, b.reach), boss)
  return subtract(body, upright(0), upright(b.pitch), v.shapes.solidRegion({ at: [mid, 0, b.reach], r: hole, length: b.bracket_w, axis: 'x', teardrop: '+z' }, v.smooth))
}
