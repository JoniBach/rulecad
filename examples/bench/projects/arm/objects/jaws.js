// The arm's gripper made from the flexures kit's gripperJaws: two jaws, each on a parallel guide (two leaves), resting
// closed on a 2 mm gap and opened by the SG90's double horn turning between their bars. The springs grip; the servo
// only opens, so it holds with the power off. Each guide has a stop both ways (a tongue in a slot in its fork).
// Around the generator: the block in the forearm's yoke (as the hand-built gripper's), a plate joining the two root
// blocks, a spine down the middle under the horn's plane, and two posts up from the bed to the servo's tabs. The
// servo's case sits above the print; its horn turns in the print's plane, 4 mm above the middle (the guides' leaves,
// 16 mm wide, take the small twist that leaves). The front post's side keeps clear of the horn's arm at rest.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, polygon } = jscad.primitives
const { translate, rotateX } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { measureBoundingBox } = jscad.measurements

export function main (v) {
  const W = v.width, box = (x0, x1, y0, y1, z0 = 0, z1 = W) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] })
  const p = { width: W, leaf: { length: v.leaf_l, thickness: v.leaf_t, apart: v.apart, fillet: v.fillet }, bar: { inner: v.bar_in, width: v.bar_w }, horn: { reach: v.reach, tip: v.tip, open: v.open_a }, jaws: { from: v.jaw_from, to: v.jaw_to, gap: v.jaw_gap }, stop: { open: v.stop_open, close: v.stop_close }, base: v.base }
  const jaws = (part) => translate([v.xs, 0, 0], v.flexures.gripperJaws(p, { part }))
  const ground = jaws('ground'), back = measureBoundingBox(ground)[0][0], wide = measureBoundingBox(ground)[1][1]
  if (Math.abs(back - v.block_x) > v.tol) throw new Error(`jaws: the root blocks start at x ${back.toFixed(2)}, not at the yoke block's front ${v.block_x}: set xs to ${(v.xs + v.block_x - back).toFixed(2)}`)
  // A round for an inside corner at (a, b): the r x r square in the empty quarter (sa, sb) less a quarter circle
  const quarter = (a, b, sa, sb, r) => { const pts = [[a, b], [a + sa * r, b]], ca = a + sa * r, cb = b + sb * r; for (let i = 1; i < v.arc; i++) { const t = (Math.PI / 2) * (i / v.arc); pts.push([ca - sa * r * Math.sin(t), cb - sb * r * Math.cos(t)]) } pts.push([a, b + sb * r]); return polygon({ points: sa * sb > 0 ? pts : pts.reverse() }) }
  const plan = (a, b, sa, sb, r, z0, z1) => translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, quarter(a, b, sa, sb, r))) // a vertical corner
  const side = (x, z, sx, r) => translate([0, v.spine_w, 0], rotateX(Math.PI / 2, extrudeLinear({ height: 2 * v.spine_w }, quarter(x, z, sx, 1, r)))) // a corner in elevation, across the spine
  const bolt = v.fixings.holeModel('M3').diameter, pilot = v.motors.mountModel(v.motors.motorModel('sg90'), { plate: v.pilot_d }).holes[0].diameter
  const block = box(-v.block_x, v.block_x, -v.block_y, v.block_y), plate = box(v.block_x - 1, v.block_x + v.base, -wide, wide)
  // the spine: from the plate to the front post, under the horn's plane, carrying only the servo's turn back to the plate
  const spine = box(v.block_x + v.base - 1, v.xs + v.post_f + v.post_x, -v.spine_w, v.spine_w, 0, v.spine_z)
  // the posts: under each tab, from the bed to the servo's face; the front one's side on the horn's arm at rest stays
  // clear by v.clear past the arm's half-width (y <= x tan a - (tip + clear) / cos a)
  const ta = Math.tan(v.rest_a * v.deg), off = (v.tip + v.clear) / Math.cos(v.rest_a * v.deg), x0 = v.post_f, x1 = v.post_f + v.post_x, xc = Math.min(x1, (v.post_y + off) / ta)
  const front = translate([v.xs, 0, 0], extrudeLinear({ height: v.face }, polygon({ points: [[x0, -v.post_y], [x1, -v.post_y], [x1, v.post_y], [xc, v.post_y], [x0, x0 * ta - off]] })))
  const rb = v.xs - v.post_b - v.post_x, rf = v.xs - v.post_b, rear = box(rb, rf, -v.post_y, v.post_y, 0, v.face)
  const rounds = [plan(v.block_x, v.block_y, -1, 1, v.round, 0, W), plan(v.block_x, -v.block_y, -1, -1, v.round, 0, W),
    ...[1, -1].flatMap((s) => [plan(v.block_x + v.base, s * v.spine_w, 1, s, v.round, 0, v.spine_z), plan(rb, s * v.spine_w, -1, s, v.round, 0, v.spine_z), plan(rf, s * v.spine_w, 1, s, v.round, 0, v.spine_z)]),
    plan(v.xs + v.post_f, -v.spine_w, -1, -1, v.round, 0, v.spine_z),
    side(v.block_x + v.base, v.spine_z, 1, v.round), side(rb, v.spine_z, -1, v.round), side(rf, v.spine_z, 1, v.round), side(v.xs + v.post_f, v.spine_z, -1, v.round)]
  const bolts = [-1, 1].map((s) => cylinder({ radius: bolt / 2, height: W + 1, center: [s * v.bolt_x, 0, W / 2], segments: v.segments }))
  const pilots = [v.xs + v.pad_front, v.xs - v.pad_back].map((x) => cylinder({ radius: pilot / 2, height: v.pilot_d + 1, center: [x, 0, v.face - (v.pilot_d - 1) / 2], segments: v.segments }))
  const palm = v.ops.subtract(v.ops.union(ground, block, plate, spine, front, rear, ...rounds), ...bolts, ...pilots)
  const parts = [palm, jaws('upper'), jaws('lower')]
  return v.part ? parts[v.part - 1] : v.ops.union(...parts)
}
