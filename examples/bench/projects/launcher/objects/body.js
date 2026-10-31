// The body: the bow (one leaf standing in the grip, sized from the rules for the draw at the travel), the barrel
// slot's floor and ceiling with the gap the sled's tab hangs through, the sear (a leaf under the floor whose tooth
// rises into the slot to catch the sled's nose), the trigger (a lever on a living hinge whose arm presses the sear's
// shelf down to let go), the magazine column with the notches its cap snaps into, the back wall the cocking ring
// rests on, and sockets for the lid's snap pins (a hole the shaft's length over a cavity the barb clicks into): all on a frame the optimiser lays out (the frame variable), or on a plain base
// for the test rig. The regions variant returns instead what the optimiser reads: the mounts to keep, the pockets to
// leave empty, and the outline as the space. Drawn at rest; cocked bends the leaf to full draw, fired pulls the
// trigger and bends the sear.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, cylinderElliptic, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { offset } = jscad.expansions
const { translate, rotateZ, mirrorY } = jscad.transforms

export function main (v) {
  const f = v.flexures, w = v.width, z0 = v.wall, zTop = v.body_z, material = { E: v.pla.modulus, strainLimit: v.strain_limit }
  const box = (x0, x1, y0, y1, zlo = z0, zhi = z0 + w) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, (zlo + zhi) / 2], size: [x1 - x0, y1 - y0, zhi - zlo] })
  const floorTop = -v.slot / 2, floorBottom = floorTop - v.rail, ceiling = -floorBottom
  const mounts = [], flex = [], cuts = [], voids = []

  // The outline: grip, trigger guard, receiver and barrel
  const front = v.col1 + v.wall_t
  const outline = polygon({ points: [[v.back, v.grip_bottom], [v.grip_front, v.grip_bottom], [v.grip_front, v.guard_bottom], [v.guard_front, v.guard_bottom], [v.guard_front, v.receiver_bottom], [front, v.receiver_bottom], [front, 0 - v.barrel_h], [v.muzzle, 0 - v.barrel_h], [v.muzzle, v.barrel_h], [front, v.barrel_h], [front, v.top], [v.back, v.top]] })
  mounts.push(extrudeLinear({ height: z0 }, outline)) // the bed wall, under everything

  // The bow: a leaf for the draw at the travel, the thinnest whole-line thickness that keeps its strain under the limit
  const leaf = f.size.leaf({ travel: v.travel_max, force: v.draw, width: w, material, maxLength: v.max_leaf }, v.x1c)
  if (!leaf) throw new Error(`no leaf up to eight lines thick and ${v.max_leaf} mm long manages ${v.draw} N at ${v.travel_max} mm: widen it or allow a longer one`)
  if (leaf.thickness.toFixed(2) !== v.leaf_t.toFixed(2)) throw new Error(`the rules now size the leaf at ${leaf.thickness} mm thick (${leaf.length} mm long): set leaf_t to match`)
  if (Math.abs(leaf.length - v.leaf_len) > v.overlap) throw new Error(`the rules now size the leaf ${leaf.length} mm long: set leaf_len to match`)
  const root = v.tip_y - v.leaf_len, stood = (s) => rotateZ(Math.PI / 2, s) // drawn along x bending +y; stood up along y, bending -x (back, away from the trigger)
  const drawn = v.travel > 0 ? f.elastica(leaf, material, { travel: v.travel }) : { shortening: 0 }
  flex.push(translate([0, root, z0], stood(v.travel > 0 ? f.leafFlexed(leaf, material, { travel: v.travel }) : f.leaf(leaf))))
  flex.push(cylinder({ radius: v.bead, height: w, center: [-v.travel, v.tip_y - drawn.shortening, z0 + w / 2], segments: v.smooth })) // the bead at the tip, which pushes the tab
  mounts.push(box(-v.root_block / 2, v.root_block / 2, root - v.root_block, root + v.overlap))
  voids.push(box(-v.travel_max - v.bead - v.post, v.bead + v.post, root - 1, floorBottom, z0, zTop + 1)) // the leaf's sweep, up to the floor

  // The slot's floor and ceiling, from the back wall to the muzzle. The floor is left out over the tab's whole run (a
  // slit's roof would be a bridge far wider than the printer spans): the sled rides the ceiling, its rod the floor
  // either side of the gap, so it can't tip in
  const x0 = v.back + v.wall_t
  mounts.push(box(x0 - v.overlap, v.muzzle, floorBottom, floorTop, z0, zTop), box(x0 - v.overlap, v.muzzle, -floorTop, ceiling, z0, zTop))
  voids.push(box(x0, v.muzzle + 1, floorTop, -floorTop, z0, zTop + 1)) // the slot
  const tabBack = v.bead - v.travel_max, tabFront = v.rest_x + v.sled.tab
  cuts.push(box(tabBack - v.fit, tabFront + v.fit, floorBottom - 1, floorTop + 1, z0, zTop + 1))
  voids.push(box(tabBack - v.fit, tabFront + v.fit, floorBottom - v.sled.tab_drop - 2, floorTop + 1, z0, zTop + 1)) // the tab's run
  // The back wall, with the rod's hole; the ring rests against it
  mounts.push(box(v.back, x0, v.grip_bottom, v.top, z0, zTop))
  const rodHole = box(v.back - 1, x0 + 1, floorTop, -floorTop, v.sled.rod_z - v.fit, v.sled.rod_z + v.sled.rod_width + v.fit)
  cuts.push(rodHole); voids.push(rodHole)

  // The sear: a leaf under the floor beside the tab's path, its tooth up through the floor's gap and into the slot by
  // the undercut, just ahead of the sled's nose when cocked; a foot under its tip carries a shelf back for the trigger
  const st = v.sear_t, sw = v.sear_w, L = v.sear_len, searY = floorBottom - v.sear_gap - st / 2
  const toothBack = v.tooth_back, searRoot = toothBack - (L - v.tooth)
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
  flex.push(translate([searRoot, searY, z0], v.ops.union(searBody, ...carried, box(-v.sear_block / 2, v.sear_block / 2, -v.sear_block / 2, v.sear_block / 2, 0, sw))))
  mounts.push(box(searRoot - v.sear_block / 2, searRoot + v.sear_block / 2, searY, floorBottom + v.overlap, z0, z0 + sw)) // the root's post up to the floor
  voids.push(box(searRoot - v.sear_block, toothBack + v.tooth + v.post, shelfTop - v.foot - v.post, floorBottom, z0, z0 + sw + v.fit + 1)) // the sear's room

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
  flex.push(hingeShape, ...swung)
  const hingeBack = v.trigger_x - hinge.flex / 2 - v.hinge_arms
  mounts.push(box(hingeBack, v.trigger_x - hinge.flex / 2, pivotY, floorBottom + v.overlap)) // the hinge's root post up to the floor
  const fingerY = pivotY - v.finger_arm, stopY = fingerY + v.post, frontStop = leverStart + v.arm_t + v.fit + v.post
  mounts.push(box(leverStart - v.pull_max - v.fit - v.post, leverStart - v.pull_max - v.fit, fingerY, stopY)) // behind: the pull's end
  mounts.push(box(frontStop - v.post, frontStop, fingerY, stopY)) // in front: a knock can't swing it forward
  voids.push(box(hingeBack - 1, armEnd + 1, fingerY - v.post, floorBottom, z0, zTop + 1)) // the lever's room
  voids.push(box(frontStop, v.guard_front - v.post, v.guard_bottom + v.post, shelfTop - v.foot - v.post, 0 - 1, zTop + 1)) // the finger's hole, through the bed wall too

  // The magazine column over the mouth: walls with the cap's notches; the mouth cut through the ceiling
  const col0 = v.col0, col1 = v.col1
  mounts.push(box(col0 - v.wall_t, col0, ceiling - v.overlap, v.top, z0, zTop), box(col1, col1 + v.wall_t, ceiling - v.overlap, v.top, z0, zTop))
  voids.push(box(col0, col1, ceiling, v.top + 1, z0, zTop + 1))
  const mouth = box(col0 + v.magazine.ledge, col1 - v.magazine.ledge, floorTop, ceiling + 1, z0, zTop + 1)
  cuts.push(mouth); voids.push(mouth)
  const notch = v.magazine.undercut + v.fit
  for (const n of [box(col0 - notch, col0 + 1, v.notch_y, v.notch_y + v.notch_h, z0, zTop + 1), box(col1 - 1, col1 + notch, v.notch_y, v.notch_y + v.notch_h, z0, zTop + 1)]) { cuts.push(n); voids.push(n) } // open to the lid: a roof over them would be a bridge

  // The lid's sockets: a boss at each, drilled from the top
  for (const [x, y] of [[v.pin_a, v.pin_a_y], [v.pin_b, v.pin_b_y], [v.pin_c, v.pin_c_y], [v.pin_d, v.pin_d_y]]) {
    mounts.push(cylinder({ radius: v.boss, height: zTop - z0, center: [x, y, (z0 + zTop) / 2], segments: v.smooth }))
    cuts.push(cylinder({ radius: v.pin / 2 + v.fit, height: v.pin_depth + 1, center: [x, y, zTop - v.pin_depth / 2 + v.overlap], segments: v.smooth })) // the hole, the shaft's length
    const rc = v.pin / 2 + v.pin_lip + v.fit, cavity = zTop - v.pin_depth // the room under it, where the barb clicks out: its roof a 45° cone, which prints, and which the barb's 45° back seats on
    cuts.push(cylinder({ radius: rc, height: v.pin_room, center: [x, y, cavity - v.pin_room / 2], segments: v.smooth }), cylinderElliptic({ height: rc, startRadius: [rc, rc], endRadius: [v.fit / 2, v.fit / 2], center: [x, y, cavity + rc / 2], segments: v.smooth }))
  }

  const mount = v.ops.union(...mounts)
  if (v.frame === 'none') { // what the optimiser reads: with its supports and loads as regions too
    const straps = v.ops.union(box(v.back, v.back + v.strap, v.grip_bottom + v.post, v.receiver_bottom - v.post, 0, zTop), box(v.grip_front - v.strap, v.grip_front, v.grip_bottom + v.post, v.guard_bottom - v.post, 0, zTop))
    return { mounts: v.ops.subtract(mount, ...cuts), pockets: v.ops.subtract(v.ops.union(...voids), mount), space: extrudeLinear({ height: zTop }, outline), straps,
      bow_root: box(-v.root_block / 2, v.root_block / 2, root - v.root_block, root), sear_post: box(searRoot - v.sear_block / 2, searRoot + v.sear_block / 2, searY, floorBottom, z0, z0 + sw),
      muzzle_end: box(v.muzzle - v.knock_len, v.muzzle, 0 - v.barrel_h, v.barrel_h, 0, zTop), column_top: box(col0 - v.wall_t, col1 + v.wall_t, v.top - v.post, v.top, z0, zTop),
      outside: v.ops.subtract(box(v.back - v.grid, v.muzzle + v.grid, v.grip_bottom - v.grid, v.top + v.grid, 0 - 1, zTop + 1), translate([0, 0, 0 - v.grid], extrudeLinear({ height: zTop + 2 * v.grid }, offset({ delta: 2 * v.grid, corners: 'round', segments: v.smooth }, outline)))) }
  }
  const frame = v.frame === 'optimised' ? v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth }) : mounts[0]
  cuts.push(box(v.back - v.grid, v.muzzle + v.grid, v.grip_bottom - v.grid, v.top + v.grid, zTop, zTop + v.grid * 2)) // nothing above the lid's seat: the optimised surface swells past it a little
  return { body: v.ops.union(v.ops.subtract(v.ops.union(frame, mount), ...voids, ...cuts), ...flex.map((s) => translate([0, 0, -v.overlap], s))) } // the flexures sunk a little into the bed wall, so no faces merely touch
}

// A cantilever's deflection at a fraction s of its length, as a share of its tip's: (3s² − s³) / 2
function profile (s) { return (s * s * (1 + 2) - s * s * s) / 2 }
