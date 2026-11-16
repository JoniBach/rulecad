// A box whose lid (lid.js) is screwed on: a tub with a post in each corner, and a pilot down each post that the screw
// cuts its own thread in. The pilots come from v.fixings, named by the thread: their size is read from the thread's
// rule set and the printer's, so no screw size is typed here or in box.json. Z is up, the bed is z = 0.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

// A block sitting on z = z0, centred on (cx, cy)
const block = (x, y, z0, h, cx = 0, cy = 0) => cuboid({ size: [x, y, h], center: [cx, cy, z0 + h / 2] })

// Where the screws go: one in each corner, inset from the outer faces (the lid reads the same numbers)
export const corners = (w, d, inset) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx * (w / 2 - inset), sy * (d / 2 - inset)])

export function main (v) {
  const post = (v.inset - v.wall) * 2
  const places = corners(v.width, v.depth, v.inset)
  const tub = v.ops.subtract(block(v.width, v.depth, 0, v.height), block(v.width - v.wall * 2, v.depth - v.wall * 2, v.floor, v.height))
  const posts = places.map(([x, y]) => block(post, post, v.floor, v.height - v.floor, x, y))
  const pilots = places.map(([x, y]) => v.fixings.hole('M3', { kind: 'pilot', depth: v.height - v.floor, at: [x, y, v.height] }))
  return v.ops.subtract(v.ops.union(tub, ...posts), ...pilots)
}
