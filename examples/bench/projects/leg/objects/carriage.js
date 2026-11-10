// A round hub for the hip, arms out to two bushing bosses, the hip's face down on the bed.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const arms = cuboid({ size: [v.half_w * 2, v.arm_w, v.plate], center: [0, 0, v.plate / 2] })
  const hub = cylinder({ radius: v.hub, height: v.plate, center: [0, 0, v.plate / 2], segments: v.segments * 2 })
  const bosses = [-1, 1].map((s) => cuboid({ size: [v.boss_x * 2, v.boss_long, v.boss_h], center: [s * v.rod_x, 0, v.boss_h / 2] }))
  const window = extrudeLinear({ height: v.plate + 1 }, roundedRectangle({ size: [v.cut, v.cut], roundRadius: v.corner, segments: v.segments }))
  const feet = [v.a1, v.a2, v.a3].map((a) => a * v.rad).map((a) => cylinder({ radius: v.pilot / 2, height: v.plate + 1, center: [v.feet_r * Math.cos(a), 0 - v.feet_r * Math.sin(a), v.plate / 2], segments: v.segments }))
  const pockets = [-1, 1].map((s) => v.shapes.lm8uuPocket(v.lm8uu, { printer: v.x1c, at: [s * v.rod_x, 0 - v.boss_long / 2, v.rod_y], into: '+y', through: true }))
  return v.ops.subtract(v.ops.union(arms, hub, bosses), window, feet, pockets)
}
