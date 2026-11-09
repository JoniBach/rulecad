// The crank arm: printed flat, a D hole at one end for the shaft's flat, the handle standing up at the other.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const arm = v.ops.union(cuboid({ size: [v.arm, v.bar, v.thick], center: [v.arm / 2, 0, v.thick / 2] }), cylinder({ radius: v.bar / 2, height: v.thick, center: [0, 0, v.thick / 2] }))
  const handle = cylinder({ radius: v.grip / 2, height: v.handle, center: [v.arm - v.grip / 2, 0, v.thick + v.handle / 2] })
  const r = v.shaft / 2 + v.clear
  const hole = v.ops.subtract(cylinder({ radius: r, height: v.thick, center: [0, 0, v.thick / 2] }), cuboid({ size: [v.shaft, v.shaft, v.thick], center: [r + v.shaft / 2 - v.flat - v.clear, 0, v.thick / 2] }))
  return v.ops.subtract(v.ops.union(arm, handle), hole)
}
