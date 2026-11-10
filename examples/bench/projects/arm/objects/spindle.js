// A disc on the output's flange and a shaft up through the bearing, a hexagon at its top for the arm.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const plate = cylinder({ radius: v.rim / 2, height: v.disc, center: [0, 0, v.disc / 2], segments: v.segments * 2 })
  const top = v.collar_top + v.width
  const shaft = cylinder({ radius: v.shaft / 2, height: top - 1, center: [0, 0, (top + 1) / 2], segments: v.segments * 2 })
  const collar = v.shapes.shaftShoulder(v.shaft, { shoulder: v.shoulder, height: v.collar_top - v.disc, at: [0, 0, v.collar_top] })
  const hex = cylinder({ radius: v.hex / 2 / v.cos30, height: v.hex_long, center: [0, 0, top + v.hex_long / 2], segments: v.hex_segments })
  const screws = Array.from({ length: v.bolts }, (_, k) => {
    const c = [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.disc]
    return v.shapes.countersink({ hole: v.hole, head: v.head, length: v.disc + 1, at: c, into: '-z' })
  })
  const pilot = cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [0, 0, top + v.hex_long - v.pilot_depth / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(plate, shaft, collar, hex), screws, pilot)
}
