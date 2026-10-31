// The frame: the two cartridges' outlines, grown by the skin with round corners, a palm swell behind the grip, as a block the depth of the deeper
// cartridge plus the back plate, with each cartridge's cavity cut from the open face to its own depth, the guard
// loop under the receiver block, the muzzle's opening, the notch the sled's rod runs through, and the pins' holes through the skin where
// the cartridges have theirs. No roof over the barrel: its top band and the magazine column stand proud, and the
// back plate rises behind the column to close its open side. Drawn in the cartridges' frame (the open face at z = 0),
// then turned over about x onto its back plate for the printer.
import jscad from '@jscad/modeling'
const { rectangle, cuboid, cylinder } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { offset } = jscad.expansions
const { translate, rotateX, rotateY } = jscad.transforms

export function main (v) {
  const a = v.action, b = v.barrel, s = v.sled, Z = v.depth, f = v.fit
  const rect = (x0, x1, y0, y1) => rectangle({ center: [(x0 + x1) / 2, (y0 + y1) / 2], size: [x1 - x0, y1 - y0] })
  const box = (x0, x1, y0, y1, z0, z1) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0] })
  // The cartridges' outlines: the action's L, the barrel's tube (its column stands proud of the frame)
  const barrelBottom = 0 - (b.slot / 2 + b.rail)
  const trays = [rect(a.case_back, a.grip_front, a.grip_bottom, a.case_top), rect(a.grip_front - a.case_t, a.case_front, a.block_bottom, a.case_top), rect(b.back, b.muzzle, barrelBottom, b.band)]
  // The guard loop under the block, then the outline grown by the skin, rounded, and cut flat at the barrel's top
  const guard = rect(a.grip_front - v.skin, a.case_front + v.skin, a.block_bottom - v.guard_h, a.block_bottom)
  // The palm swell: a rounded bulge behind the grip column, blended into the back strap
  const swell = offset({ delta: v.swell_r, corners: 'round', segments: v.smooth }, rect(a.case_back - v.swell - v.skin + v.swell_r, a.case_back + v.swell_r, v.swell_lo + v.swell_r, v.swell_hi - v.swell_r))
  const outline = jscad.booleans.union(offset({ delta: v.skin, corners: 'round', segments: v.smooth }, jscad.booleans.union(...trays)), guard, swell)
  let frame = jscad.booleans.subtract(extrudeLinear({ height: Z }, outline), box(a.case_back - v.skin - 1, b.muzzle + v.skin + 1, b.band, b.top + v.skin + 1, 0 - 1, Z + 1))
  // The back plate behind the column, closing its open side
  frame = v.ops.union(frame, box(b.col0 - b.case_t - v.skin, b.col1 + b.case_t + v.skin, b.band - v.skin, b.top, b.case_h + f, Z))
  // The cavities, from the open face to each cartridge's depth
  const cavity = (r, depth) => extrudeLinear({ height: depth + 1 }, offset({ delta: f, corners: 'chamfer' }, r))
  const cuts = [translate([0, 0, 0 - 1], cavity(jscad.booleans.union(trays[0], trays[1]), a.case_h + f)), translate([0, 0, 0 - 1], cavity(jscad.booleans.union(trays[2], rect(b.col0 - b.case_t, b.col1 + b.case_t, b.band - 1, b.top + 1)), b.case_h + f))]
  // The guard's hole, open into the gap in the block's bottom wall where the finger goes up to the trigger
  cuts.push(box(a.grip_front - v.skin + v.guard_post, a.case_front + v.skin - v.guard_post, a.block_bottom - v.guard_h + v.guard_bar, a.block_bottom + 1, 0 - 1, Z + 1))
  // The sled's rod, out through the back strap: a notch open to the face, so the barrel cartridge slides in with the sled aboard
  cuts.push(box(a.case_back - v.skin - 1, a.case_back + 1, 0 - b.slot / 2 - f, b.slot / 2 + f, 0 - 1, s.rod_z + s.rod_width + f))
  // The muzzle: the slot's opening through the skin, open to the face (no roof), the disc's full width deep
  cuts.push(box(b.muzzle - 1, b.muzzle + v.skin + 1, 0 - b.slot / 2, b.slot / 2, 0 - 1, b.case_h + f))
  // The pins' holes through the skin, in line with the cartridges' walls' holes
  const r = v.pin / 2 + f, hole = (x, y, z, along) => cuts.push(translate([x, y, z], (along === 'x' ? rotateY : rotateX)(Math.PI / 2, cylinder({ radius: r, height: v.skin + 2, segments: v.smooth }))))
  hole(a.pin_a, a.grip_bottom - v.skin / 2, a.pin_z, 'y'); hole(a.pin_b, a.grip_bottom - v.skin / 2, a.pin_z, 'y')
  hole(a.case_back - v.skin / 2, a.pin_c, a.pin_z, 'x'); hole(a.case_front + v.skin / 2, a.pin_d, a.pin_z, 'x')
  hole(b.back - v.skin / 2, b.pin_y, b.pin_z, 'x'); hole(b.muzzle + v.skin / 2, b.pin_y, b.pin_z, 'x')
  // Turned over to print: the back plate on the bed, the cavities opening upward (the assembly turns it back)
  return translate([0, 0, Z], rotateX(Math.PI, v.ops.subtract(frame, ...cuts)))
}
