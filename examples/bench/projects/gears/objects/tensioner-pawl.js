// The pawl: a leaf from a root block, its square tip on the ratchet's teeth; two holes through the root for the frame's
// push pins.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const holes = [v.snap_near, v.snap_far].map((x) => cylinder({ radius: v.snap / 2 + v.clear, height: v.width, center: [0 - x, 0, v.width / 2] }))
  return v.ops.subtract(v.flexures.ratchetPawl({ length: v.length, thickness: v.thick, width: v.width, root: v.root }), ...holes)
}
