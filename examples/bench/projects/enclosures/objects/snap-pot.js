// A round pot with a lid that clicks on: an annular snap. A bead runs round the outside of the pot's wall just under
// its rim; the lid's skirt has a groove inside it, the bead's shape plus the printer's fit all round, and a lead-in at
// its mouth. Pushed on, the bead spreads the skirt and squeezes the wall; past it, both spring back and the bead sits
// in the groove with no stress left in either. The groove sits 5.8 mm under the lid's top: nearer, the top holds the
// skirt round so it cannot give, and the pot's wall takes the whole snap. The bead's height, the forces and the hoop strain in each part come
// from v.fixings.annularSnapModel (the Bayer snap-fit guide's annular joint), sized from the pull the lid must stay on
// against. The pot prints standing on its floor and the lid on its top: the bead's return face and the groove's mating
// face are the only overhangs, at 45°. Each first layer is one plain disc (the lid's with its tab), its edge chamfered
// against the first layer's spread. Inside corners are rounded: the pot's floor into its wall, the lid's top into its
// skirt, with the pot's rim chamfered more than that round so the two clear. With fingers above 0 (the "slotted" variant)
// the skirt is slotted into that many fingers, each a cantilever from the slots' round-ended roots, which brings the
// push to put the lid on down several times over (v.fixings.snapSlots cuts the slots).
import jscad from '@jscad/modeling'
const { polygon, roundedRectangle } = jscad.primitives
const { extrudeRotate, extrudeLinear } = jscad.extrusions
const { translate, rotateX } = jscad.transforms

export function main (v) {
  const R = v.diameter / 2, seg = v.segments, ch = v.x1c.chamfer
  // The joint's ends: the pot's rim (free) and floor (closed), the skirt's mouth (free) and the lid's top (closed), whose
  // underside sits on the rim, so the groove's top is below_rim less the fit under it. The bead's length comes first
  const joint = { diameter: v.diameter, wall: v.wall, skirt: v.skirt, boxEnd: v.below_rim, lidEnd: v.below_bead, lidTop: v.below_rim - v.x1c.fit, ...(v.fingers > 0 ? { slots: { count: v.fingers, reach: v.slot_reach } } : {}) }
  const length = v.fixings.annularSnapModel(joint, { pull: v.pull }).length
  const snap = v.fixings.annularSnapModel({ ...joint, boxFloor: v.height - v.below_rim - length - v.floor }, { pull: v.pull })
  // the bead's foot, its length (return face, land and lead face) under its top
  const foot = v.height - v.below_rim - snap.length, c = snap.clearance, mouth = foot - c - v.below_bead
  // A quarter round from (x0, y0) to (x1, y1) about (cx, cy): the points of an inside corner's fillet
  const arc = (cx, cy, r, a0, a1, n = v.corner_facets) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] })

  // The pot, in [radius, height]: its floor's edge chamfered, the floor rounded into the wall, the rim's outside chamfered
  const inner = R - v.wall
  const pot = v.ops.union(extrudeRotate({ segments: seg }, polygon({ points: [
    [0, 0], [R - ch, 0], [R, ch], [R, v.height - v.rim], [R - v.rim, v.height], [inner, v.height],
    ...arc(inner - v.fillet, v.floor + v.fillet, v.fillet, 0, -Math.PI / 2), [0, v.floor]] })),
  v.fixings.annularBead(snap, { at: foot, segments: seg }))

  // The lid as it sits on the pot: its top on the rim, its skirt down round the bead, its top rounded into the skirt,
  // and a tab to lift it by (a lid comes off at a tilt, a part of the bead at a time)
  const top = v.height, lidR = R + c + v.skirt, low = mouth
  const lidUp = v.ops.union(extrudeRotate({ segments: seg }, polygon({ points: [
    [0, top], ...arc(R + c - v.fillet, top - v.fillet, v.fillet, Math.PI / 2, 0), [R + c, low], [lidR, low], [lidR, top + v.lid - ch], [lidR - ch, top + v.lid], [0, top + v.lid]] })),
  translate([lidR, 0, top], extrudeLinear({ height: v.lid }, roundedRectangle({ size: [v.tab * 2, v.tab * 2], roundRadius: v.tab / 2, segments: seg }))))
  const cut = [v.fixings.annularGroove(snap, { at: foot, mouth, segments: seg }), ...(v.fingers > 0 ? [v.fixings.snapSlots(snap, { at: foot, mouth })] : [])]
  const lid = v.ops.subtract(lidUp, ...cut)
  // As printed: turned over on to its top
  const lidPrinted = translate([0, 0, top + v.lid], rotateX(Math.PI, lid))
  const parts = [pot, lidPrinted]
  return v.piece ? parts[v.piece - 1] : { pot, lid: translate([v.diameter + v.tab * 2 + v.gap * 2, 0, 0], lidPrinted) }
}
