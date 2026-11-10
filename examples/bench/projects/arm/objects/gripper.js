// A compliant gripper, printed flat in PETG: a palm with the servo on it, and two fingers, each a rigid jaw on one long
// leaf with rounded ends. A double-arm horn in the leaves' own plane pushes each finger inward at its outer face.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, polygon } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const f = v.flexures, W = v.width, box = (x0, x1, y0, y1, z0 = 0, z1 = W) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] })
  const leaf = (end, y) => translate([end - v.leaf_l, y + v.leaf_t / 2, 0], f.leaf({ length: v.leaf_l, thickness: v.leaf_t, width: W, taper: v.taper, fillet: v.fillet, tip: true, into: v.into }))
  const wedge = (a0, a1, r, h, z0) => extrudeLinear({ height: h }, polygon({ points: [[0, 0], ...Array.from({ length: v.wedge_n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / v.wedge_n) * v.deg; return [r * Math.cos(a), r * Math.sin(a)] })] }))
  const wedgeAt = (a0, a1) => translate([v.xs, 0, v.cavity], wedge(a0, a1, v.reach + v.slack, W, 0))
  // Palm: the block in the forearm's yoke, the stem under the servo and the two arms the leaves grow from
  const block = box(-v.block_x, v.block_x, -v.block_y, v.block_y)
  const stem = v.ops.union(box(v.block_x - 1, v.xs - v.pocket_back, -v.stem_y0, v.stem_y0), box(v.xs - v.pocket_back - 2, v.stem_x1, -v.stem_y, v.stem_y))
  const armUp = box(v.up_root - v.root, v.up_root + v.into, v.arm_y, v.y_in + v.leaf_t), armLow = box(v.low_root - v.root, v.low_root + v.into, -(v.y_in + v.leaf_t), -v.arm_y)
  const pads = [box(v.xs + v.pocket_front + v.pad_gap, v.xs + v.pad_front + v.pad_x, -v.pad_y, v.pad_y, W - v.dip, v.face), box(v.xs - v.pad_back - v.pad_x, v.xs - v.pocket_back - v.pad_gap, -v.pad_y, v.pad_y, W - v.dip, v.face)]
  const pilots = [v.xs + v.pad_front, v.xs - v.pad_back].map((x) => cylinder({ radius: v.pilot / 2, height: v.pilot_d + 1, center: [x, 0, v.face - (v.pilot_d - 1) / 2], segments: v.segments }))
  const bolts = [-1, 1].map((s) => cylinder({ radius: v.bolt / 2, height: W + 1, center: [s * v.bolt_x, 0, W / 2], segments: v.segments }))
  // The servo's case and boss come down into the stem from above; the horn turns in two wedges cut from the stem's top
  const pocket = box(v.xs - v.pocket_back, v.xs + v.pocket_front, -v.pocket_y, v.pocket_y, v.case_z, W + 1)
  const boss = cylinder({ radius: v.boss / 2, height: v.case_z - v.horn_z + 1, center: [v.xs, 0, v.horn_z + (v.case_z - v.horn_z + 1) / 2], segments: v.segments })
  const hub = cylinder({ radius: v.hub / 2, height: W - v.cavity + 1, center: [v.xs, 0, v.cavity + (W - v.cavity + 1) / 2], segments: v.segments })
  const cutPalm = [wedgeAt(v.close_a - v.spare, v.rest_a + v.spare), wedgeAt(v.half_turn + v.close_a - v.spare, v.half_turn + v.rest_a + v.spare), hub, boss, pocket]
  const palm = v.ops.subtract(v.ops.union(block, stem, armUp, armLow, pads), ...cutPalm, bolts, pilots)
  // A finger: leaf, then a stiff back with a flat where the horn presses, then the jaw reaching in
  const finger = (s, end, flatX0, flatX1) => {
    const y0 = s > 0 ? v.y_in : -v.y_out, y1 = s > 0 ? v.y_out : -v.y_in
    const back = box(end - v.overlap, v.jaw_x1, y0, y1)
    const flat = s > 0 ? box(flatX0, flatX1, v.y_flat, v.y_out + 1, -1, W + 1) : box(flatX0, flatX1, -v.y_out - 1, -v.y_flat, -1, W + 1)
    const jaw = s > 0 ? box(v.jaw_x0, v.jaw_x1, v.pad_y, v.y_out) : box(v.jaw_x0, v.jaw_x1, -v.y_out, -v.pad_y)
    return v.ops.subtract(v.ops.union(leaf(end, s > 0 ? v.y_in : -v.y_in - v.leaf_t), back, jaw), flat)
  }
  const up = finger(1, v.up_end, v.xs + v.flat_a, v.xs + v.flat_b), low = finger(-1, v.low_end, v.xs - v.flat_b, v.xs - v.flat_a)
  const parts = [palm, up, low]
  return v.part ? parts[v.part - 1] : v.ops.union(...parts)
}
