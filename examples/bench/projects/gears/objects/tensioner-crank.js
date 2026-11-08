// The crank's pinion: a herringbone gear on a shaft that rises past the second stage; the top of the shaft is flatted
// so the arm (tensioner-arm, printed flat) drives it.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const gear = v.gears.herringbone({ module: v.module, teeth: v.teeth, width: v.width, helix: v.helix, bore: v.bore })
  const shaft = cylinder({ radius: v.shaft / 2, height: v.shaft_top - v.width, center: [0, 0, (v.shaft_top + v.width) / 2] })
  const flat = cuboid({ size: [v.shaft, v.shaft, v.drive_length], center: [v.shaft - v.flat, 0, v.shaft_top - v.drive_length / 2] })
  const hole = cylinder({ radius: v.bore / 2, height: v.shaft_top, center: [0, 0, v.shaft_top / 2] })
  return v.ops.subtract(v.ops.union(gear, shaft), flat, hole)
}
