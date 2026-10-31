// The action cartridge: a tray (floor and walls) with the bow, the sear and the trigger printed in place, which pins
// into the frame's cavity open side first and is pinned through its walls from the frame's edges. The bow is one leaf standing from the floor's bottom wall with a bead on
// its tip; the sled's tab reaches down to it through the gap in the cartridge's top. The sear is a leaf under that
// gap whose tooth rises out of the cartridge into the barrel's slot; a foot under its tip carries a shelf back for
// the trigger, a lever on a living hinge whose arm presses the shelf down; the finger reaches it through a window in the
// floor. Drawn at rest; cocked bends the leaf to
// full draw, fired pulls the trigger and bends the sear.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ, mirrorY } = jscad.transforms

export function main (v) {
  const f = v.flexures, w = v.width, z0 = v.wall, zTop = v.case_h, material = { E: v.pla.modulus, strainLimit: v.strain_limit }
  const box = (x0, x1, y0, y1, zlo = z0, zhi = z0 + w) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, (zlo + zhi) / 2], size: [x1 - x0, y1 - y0, zhi - zlo] })
  const floorBottom = v.case_top, parts = [], cuts = []

  // The tray: floor, and walls round it; the top wall only behind the tab's run and ahead of the sear
  // An L: the grip column round the leaf, and the receiver block ahead of it round the sear and trigger
  const x0 = v.case_back, x1 = v.case_front, y0 = v.grip_bottom, t = v.case_t, xg = v.grip_front, yb = v.block_bottom
  parts.push(box(x0, xg, y0, floorBottom, 0, z0), box(xg - t, x1, yb, floorBottom, 0, z0)) // the floor
  parts.push(box(x0, x0 + t, y0, floorBottom, 0, zTop), box(x0, xg, y0, y0 + t, 0, zTop), box(xg - t, xg, y0, yb + t, 0, zTop)) // the column's back, bottom and front
  parts.push(box(xg - t, x1, yb, yb + t, 0, zTop), box(x1 - t, x1, yb, floorBottom, 0, zTop)) // the block's bottom and front
  const tabBack = v.bead - v.travel_max, tabFront = v.rest_x + v.sled.tab
  parts.push(box(x0, tabBack - v.fit, floorBottom - t, floorBottom, 0, zTop)) // the top wall behind the tab's run
  parts.push(box(v.tooth_back + v.tooth + v.fit, x1, floorBottom - t, floorBottom, 0, zTop)) // and ahead of the sear's tooth

  // The bow: a leaf for the draw at the travel, the thinnest whole-line thickness that keeps its strain under the limit
  const leaf = f.size.leaf({ travel: v.travel_max, force: v.draw, width: w, material, maxLength: v.max_leaf }, v.x1c)
  if (!leaf) throw new Error(`no leaf up to eight lines thick and ${v.max_leaf} mm long manages ${v.draw} N at ${v.travel_max} mm: widen it or allow a longer one`)
  if (leaf.thickness.toFixed(2) !== v.leaf_t.toFixed(2)) throw new Error(`the rules now size the leaf at ${leaf.thickness} mm thick (${leaf.length} mm long): set leaf_t to match`)
  if (Math.abs(leaf.length - v.leaf_len) > v.overlap) throw new Error(`the rules now size the leaf ${leaf.length} mm long: set leaf_len to match`)
  const root = v.tip_y - v.leaf_len, stood = (s) => rotateZ(Math.PI / 2, s) // drawn along x bending +y; stood up along y, bending -x (back, away from the trigger)
  const drawn = v.travel > 0 ? f.elastica(leaf, material, { travel: v.travel }) : { shortening: 0 }
  parts.push(translate([0, root, z0], stood(v.travel > 0 ? f.leafFlexed(leaf, material, { travel: v.travel }) : f.leaf(leaf))))
  parts.push(cylinder({ radius: v.bead, height: w, center: [-v.travel, v.tip_y - drawn.shortening, z0 + w / 2], segments: v.smooth })) // the bead at the tip, which pushes the tab
  parts.push(box(-v.root_block / 2, v.root_block / 2, y0 + t - v.overlap, root + v.overlap)) // the root block, up from the bottom wall

  // The sear: a leaf just under the cartridge's top beside the tab's path, its tooth up past the top and into the
  // barrel's slot by the undercut, just ahead of the sled's nose when cocked; a foot under its tip carries a shelf back
  const st = v.sear_t, sw = v.sear_w, L = v.sear_len, searY = floorBottom - v.sear_gap - st / 2
  const toothBack = v.tooth_back, searRoot = toothBack - (L - v.tooth)
  const shelfTop = searY - st / 2 - v.foot, armEnd = toothBack + v.tooth - v.foot - v.overlap * 2
  const angle = v.pull / v.finger_arm, drop = Math.max(0, angle * (armEnd - v.trigger_x) - v.fit) // what the arm's end presses the shelf down by
  const tipDrop = drop > 0 ? drop / profile((armEnd - searRoot) / L) : 0
  const beam = { length: L, thickness: st, width: sw }
  const bent = tipDrop > 0 ? f.elastica(beam, material, { travel: tipDrop }) : { shortening: 0, angle: 0 }
  const searBody = tipDrop > 0 ? mirrorY(f.leafFlexed(beam, material, { travel: tipDrop })) : f.leaf(beam)
  const top = v.undercut - v.slot / 2 - searY, ramp = v.undercut / Math.tan(jscad.utils.degToRad(v.lead))
  const tipParts = [ // the tooth (its ramp facing the sled as it comes back), the foot and the shelf, drawn at the straight tip, then carried to the bent one
    extrudeLinear({ height: sw }, polygon({ points: [[L - v.tooth, -st / 2], [L, -st / 2], [L, top - v.undercut], [L - ramp, top], [L - v.tooth, top]] })),
    box(L - v.foot, L, shelfTop - searY, st / 2, 0, sw),
    box(L - v.foot - v.shelf, L, shelfTop - searY - v.foot, shelfTop - searY, 0, sw)
  ]
  const carried = tipParts.map((s) => translate([L - bent.shortening, -tipDrop, 0], rotateZ(-bent.angle, translate([-L, 0, 0], s))))
  // The tooth stands past the tray's edge: its underside there rises at 45° from the floor's top, so it prints on air
  const toothTop = v.undercut - v.slot / 2, ccw = (pts) => (pts.reduce((a, [x, y], i) => a + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0) > 0 ? pts : pts.reverse())
  const wedge = translate([toothBack - 1, 0, z0], rotateZ(Math.PI / 2, jscad.transforms.rotateX(Math.PI / 2, extrudeLinear({ height: v.tooth + 2 }, polygon({ points: ccw([[floorBottom, 0], [floorBottom, 0 - 1], [toothTop + 1, 0 - 1], [toothTop + 1, toothTop + 1 - floorBottom]]) })))))
  parts.push(v.ops.subtract(translate([searRoot, searY, z0], v.ops.union(searBody, ...carried, box(-v.sear_block / 2, v.sear_block / 2, -v.sear_block / 2, v.sear_block / 2, 0, sw))), wedge))
  parts.push(box(searRoot - v.sear_block / 2, searRoot + v.sear_block / 2, searY, floorBottom, z0, z0 + sw)) // the root's post up to the top

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
  const hingeBack = v.trigger_x - hinge.flex / 2 - v.hinge_arms
  parts.push(box(hingeBack, v.trigger_x - hinge.flex / 2, pivotY, floorBottom)) // the hinge's root post up to the top
  const fingerY = pivotY - v.finger_arm, stopY = fingerY + v.post, frontStop = leverStart + v.arm_t + v.fit + v.post
  parts.push(box(leverStart - v.pull_max - v.fit - v.post, leverStart - v.pull_max - v.fit, fingerY, stopY)) // behind: the pull's end
  parts.push(box(frontStop - v.post, frontStop, fingerY, stopY)) // in front: a knock can't swing it forward
  cuts.push(box(frontStop, frontStop + v.finger_room, yb - 1, shelfTop - v.foot - v.post, 0 - 1, z0 + 1)) // the finger's window through the floor, down to the bottom edge
  cuts.push(box(frontStop, frontStop + v.finger_room, yb - 1, yb + t + 1, 0 - 1, zTop + 1)) // and through the bottom wall: the finger comes up into it from the trigger guard

  // The pins' holes through the walls: up through the bottom wall, along x through the back and front walls
  const r = v.pin / 2 + v.fit, hole = (x, y, along) => cuts.push(translate([x, y, v.pin_z], jscad.transforms[along === 'x' ? 'rotateY' : 'rotateX'](Math.PI / 2, cylinder({ radius: r, height: t + 2, segments: v.smooth }))))
  hole(v.pin_a, y0 + t / 2, 'y'); hole(v.pin_b, y0 + t / 2, 'y'); hole(x0 + t / 2, v.pin_c, 'x'); hole(x1 - t / 2, v.pin_d, 'x')
  return v.ops.subtract(v.ops.union(...parts), ...cuts)
}

// A cantilever's deflection at a fraction s of its length, as a share of its tip's: (3s² − s³) / 2
function profile (s) { return (s * s * (1 + 2) - s * s * s) / 2 }
