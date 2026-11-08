// The crank: a herringbone pinion on a shaft that rises past the second stage to an arm and a handle.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const gear = v.gears.herringbone({ module: v.module, teeth: v.teeth, width: v.width, helix: v.helix, bore: v.bore })
  const shaft = v.ops.subtract(cylinder({ radius: v.shaft / 2, height: v.shaft_top - v.width, center: [0, 0, (v.shaft_top + v.width) / 2] }),
    cylinder({ radius: v.bore / 2, height: v.shaft_top, center: [0, 0, v.shaft_top / 2] }))
  const arm = cuboid({ size: [v.arm, v.bar, v.thick], center: [v.arm / 2, 0, v.shaft_top + v.thick / 2] })
  const handle = cylinder({ radius: v.grip / 2, height: v.handle, center: [v.arm - v.grip / 2, 0, v.shaft_top + v.thick + v.handle / 2] })
  return v.ops.union(gear, shaft, arm, handle)
}
