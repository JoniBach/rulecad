// The action, printed in place on a test base: the bow (one leaf standing up from its root, sized from the rules for
// the draw at the travel), the barrel slot's floor and ceiling with the slit the sled's tab hangs through, the sear (a
// leaf under the floor whose tooth rises through the floor to catch the sled's nose) and the trigger (a lever on a
// living hinge whose arm presses the sear's shelf down to let go). Drawn at rest; the cocked variant bends the leaf
// to full draw, the fired one pulls the trigger and bends the sear.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ, mirrorY } = jscad.transforms

export function main (v) {
  const f = v.flexures, w = v.width, z0 = v.wall, material = { E: v.pla.modulus, strainLimit: v.strain_limit }
  const box = (x0, x1, y0, y1, zlo = z0, zhi = z0 + w) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, (zlo + zhi) / 2], size: [x1 - x0, y1 - y0, zhi - zlo] })
  const floorTop = -v.slot / 2, floorBottom = floorTop - v.rail, parts = [], cuts = []

  // The bow: a leaf for the draw at the travel, the thinnest whole-line thickness that keeps its strain under the limit
  const leaf = f.size.leaf({ travel: v.travel_max, force: v.draw, width: w, material, maxLength: v.max_leaf }, v.x1c)
  if (!leaf) throw new Error(`no leaf up to eight lines thick and ${v.max_leaf} mm long manages ${v.draw} N at ${v.travel_max} mm: widen it or allow a longer one`)
  if (leaf.thickness.toFixed(2) !== v.leaf_t.toFixed(2)) throw new Error(`the rules now size the leaf at ${leaf.thickness} mm thick (${leaf.length} mm long): set leaf_t to match`)
  const root = v.tip_y - leaf.length, stood = (s) => rotateZ(Math.PI / 2, s) // drawn along x bending +y; stood up along y, bending -x (back, away from the trigger)
  const drawn = v.travel > 0 ? f.elastica(leaf, material, { travel: v.travel }) : { shortening: 0 }
  parts.push(translate([0, root, z0], stood(v.travel > 0 ? f.leafFlexed(leaf, material, { travel: v.travel }) : f.leaf(leaf))))
  parts.push(cylinder({ radius: v.bead, height: w, center: [-v.travel, v.tip_y - drawn.shortening, z0 + w / 2], segments: v.smooth })) // the bead at the tip, which pushes the tab
  parts.push(box(-v.root_block / 2, v.root_block / 2, root - v.root_block, root + v.overlap))

  // The slot's floor and ceiling. The floor is left out over the tab's whole run (a slit's roof would be a bridge far
  // wider than the printer spans): the sled rides the ceiling, its rod the floor behind the gap, so it can't tip in
  const x0 = 0 - v.base_back, x1 = v.base_front
  parts.push(box(x0, x1, floorBottom, floorTop, z0, v.body_z), box(x0, x1, -floorTop, -floorBottom, z0, v.body_z))
  const tabBack = v.bead - v.travel_max, tabFront = v.rest_x + v.sled.tab
  cuts.push(box(tabBack - v.fit, tabFront + v.fit, floorBottom - 1, floorTop + 1, z0, v.body_z + 1))

  // The sear: a leaf under the floor beside the tab's path, its tooth up through the floor's gap and into the slot by
  // the undercut, just ahead of the sled's nose when cocked; a foot under its tip carries a shelf back for the trigger
  const st = v.sear_t, sw = v.sear_w, L = v.sear_len, searY = floorBottom - v.sear_gap - st / 2
  const toothBack = tabBack + v.sled.reach + v.sled.length + v.sled.nose + v.fit, searRoot = toothBack - (L - v.tooth)
  const shelfTop = searY - st / 2 - v.foot, armEnd = toothBack + v.tooth - v.foot - v.overlap * 2
  const angle = v.pull / v.finger_arm, drop = Math.max(0, angle * (armEnd - v.trigger_x) - v.fit) // what the arm's end presses the shelf down by
  const tipDrop = drop > 0 ? drop / profile((armEnd - searRoot) / L) : 0
  const beam = { length: L, thickness: st, width: sw }
  const bent = tipDrop > 0 ? f.elastica(beam, material, { travel: tipDrop }) : { shortening: 0, angle: 0 }
  const searBody = tipDrop > 0 ? mirrorY(f.leafFlexed(beam, material, { travel: tipDrop })) : f.leaf(beam)
  const top = floorTop + v.undercut - searY, ramp = v.undercut / Math.tan(jscad.utils.degToRad(v.lead))
  const tipParts = [ // the tooth (its ramp facing the sled as it comes back), the foot and the shelf, drawn at the straight tip, then carried to the bent one
    extrudeLinear({ height: sw }, polygon({ points: [[L - v.tooth, -st / 2], [L, -st / 2], [L, top - v.undercut], [L - ramp, top], [L - v.tooth, top]] })),
    box(L - v.foot, L, shelfTop - searY, st / 2, 0, sw),
    box(L - v.foot - v.shelf, L, shelfTop - searY - v.foot, shelfTop - searY, 0, sw)
  ]
  const carried = tipParts.map((s) => translate([L - bent.shortening, -tipDrop, 0], rotateZ(-bent.angle, translate([-L, 0, 0], s))))
  parts.push(translate([searRoot, searY, z0], v.ops.union(searBody, ...carried, box(-v.sear_block / 2, v.sear_block / 2, -v.sear_block / 2, v.sear_block / 2, 0, sw))))
  parts.push(box(searRoot - v.sear_block / 2, searRoot + v.sear_block / 2, searY, floorBottom + v.overlap, z0, z0 + sw)) // the root's post up to the floor

  // The trigger: a lever hanging from a living hinge sized for the finger's full travel over the finger arm, its arm
  // reaching forward between the sear's leaf and its shelf; stops either side of the finger arm's end
  const hinge = f.size.livingHinge({ angle: v.pull_max / v.finger_arm, width: w, material }, v.x1c)
  const h = v.hinge_block, pivotY = shelfTop + v.fit + h / 2
  const hingeShape = translate([v.trigger_x - hinge.flex / 2, pivotY, z0], f.livingHinge({ flex: hinge.flex, thickness: hinge.thickness, width: w, arms: v.hinge_arms }))
  const leverStart = v.trigger_x + hinge.flex / 2 + v.hinge_arms - v.overlap
  const leverParts = [
    box(leverStart, leverStart + v.arm_t, pivotY - v.finger_arm, pivotY + h / 2), // the finger arm, down
    box(leverStart, armEnd, pivotY - h / 2, pivotY + h / 2, z0, z0 + sw) // the sear arm, forward between the sear's leaf and its shelf, beside the tab's path
  ]
  const swung = leverParts.map((s) => translate([v.trigger_x, pivotY, 0], rotateZ(-angle, translate([-v.trigger_x, -pivotY, 0], s))))
  parts.push(hingeShape, ...swung)
  parts.push(box(v.trigger_x - hinge.flex / 2 - v.hinge_arms, v.trigger_x - hinge.flex / 2, pivotY, floorBottom + v.overlap)) // the hinge's root post up to the floor
  const fingerY = pivotY - v.finger_arm, stopY = fingerY + v.post
  parts.push(box(leverStart - v.pull_max - v.fit - v.post, leverStart - v.pull_max - v.fit, fingerY, stopY)) // behind: the pull's end
  parts.push(box(leverStart + v.arm_t + v.fit, leverStart + v.arm_t + v.fit + v.post, fingerY, stopY)) // in front: a knock can't swing it forward

  // The base, under everything
  const yLo = root - v.root_block - v.post, yHi = -floorTop + v.rail
  const base = cuboid({ center: [(x0 + x1) / 2, (yLo + yHi) / 2, z0 / 2], size: [x1 - x0, yHi - yLo, z0] })
  return v.ops.subtract(v.ops.union(base, ...parts), ...cuts)
}

// A cantilever's deflection at a fraction s of its length, as a share of its tip's: (3s² − s³) / 2
function profile (s) { return (s * s * (1 + 2) - s * s * s) / 2 }
