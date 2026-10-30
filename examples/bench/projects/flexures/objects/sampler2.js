// The second flexure sampler: mechanisms, on one rail along x. A compound parallel guide stood off the rail along y (push
// its shuttle: it should move with no drop); a LET joint lying flat beyond the rail, its outer panel free to fold up out of
// the bed; and a constant-force mechanism: the coupler leaf stood off the rail with its slider block on the rail, a
// ground boss on the rail on the slider's line, and the crank printed loose beside them, to pin with two bits of filament.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const f = v.flexures, h = v.height, parts = []
  const at = (shape, dx, dy) => parts.push(translate([dx, dy, 0], shape))
  const up = (shape) => rotateZ(Math.PI / 2, shape) // a mechanism drawn along x, stood off the rail along y
  // The compound guide: its base's back sits on the rail, so the base block overlaps the rail
  let x = v.guide_width / 2
  at(up(f.compoundGuide({ length: v.guide_length, thickness: v.mid, width: h, gap: v.gap, clearance: v.clearance })), x, v.base_depth) // its back bar in the rail
  x += v.guide_width / 2 + v.spacing
  // The constant-force mechanism: the slider block on the rail, the leaf rising along y to its boss; the ground boss further along the same line
  const cfm = { leaf: v.leaf, thickness: v.cfm_thickness, width: h, crank: v.crank, pin: v.pin, boss: v.boss }
  at(up(f.constantForce(cfm)), x, 0) // its slider block in the rail; the leaf up along y to its boss at y = leaf
  const ground = v.leaf + v.reach, gx = x + v.offset // the ground pin: the crank's reach up the line at rest, and a little beside it, so the leaf is straight
  parts.push(v.ops.subtract(cylinder({ radius: v.boss, height: h, center: [gx, ground, h / 2], segments: v.smooth }), cylinder({ radius: v.pin / 2 + v.pin_fit, height: h + 2, center: [gx, ground, h / 2], segments: v.smooth })))
  parts.push(cuboid({ center: [gx + v.boss + v.post / 2, (ground - v.rail) / 2, h / 2], size: [v.post, ground + v.rail, h] })) // a post carrying the ground boss off the rail
  x += v.offset + v.boss + v.post + v.spacing
  at(f.constantForceCrank(cfm), x, v.boss + v.loose) // the crank, beside the rail, held by a tab to snap off
  parts.push(cuboid({ center: [x, (v.loose - v.overlap) / 2, h / 2], size: [v.tab, v.loose + v.overlap + v.overlap, h] })) // the tab: from inside the rail into the boss
  x += v.crank + 2 * v.boss + v.spacing
  // The LET joint: flat, its inner panel on the rail, its axis along x so the outer panel folds up away from the rail
  const joint = f.letJoint({ width: v.let_width, thickness: v.let_thickness, bar: v.bar, slot: v.slot, bridge: v.bridge, panel: v.panel })
  at(rotateZ(Math.PI / 2, joint), x + v.let_width / 2, v.let_half - v.overlap) // the inner panel's edge in the rail
  x += v.let_width + v.spacing
  const rail = cuboid({ center: [(x - v.spacing) / 2, -v.rail / 2, h / 2], size: [x - v.spacing, v.rail, h] })
  return v.ops.union(rail, ...parts)
}
