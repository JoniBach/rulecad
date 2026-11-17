// The joint rig's dial arm (MEASURE.md, rows 34 to 36), worked out as it stands on the base beam's top face: z up from
// the face, x along the base beam, y across it, the arm reaching out along -y over a rig beam; then turned over about x
// and lifted to be drawn as it prints, the arm's top face on the bed. Its anchor "foot" is the foot's underside, facing
// down: the assembly holds it there on the face with a fixed joint, which turns it back the right way up. A foot on the face, two M5
// holes over the slot; the arm leaves the foot at the base beam's front face, raised clear of the rig beam's top; at
// its end a clamp for the dial's stem, slit to the tip and pinched by an M4 screw. It prints upside down, so the holes
// across it are teardrops pointing down as it stands, up as it prints. Holes come from v.fixings by the thread.
import jscad from '@jscad/modeling'
const { roundedRectangle, cylinder, cuboid, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, mirrorZ, transform, rotateX } = jscad.transforms
const { union } = jscad.booleans
const { offset } = jscad.expansions

export function main (v) {
  const top = v.gap + v.high, w = v.wide, r = v.round
  // in plan: the foot and the arm as one outline, its inside corners rounded (close: grow, then shrink)
  const plan = union(roundedRectangle({ size: [v.foot, v.face * 2], roundRadius: r, segments: v.segments }),
    translate([0, -(v.tip - v.face) / 2], roundedRectangle({ size: [w, v.tip + v.face], roundRadius: r, segments: v.segments })))
  const closed = offset({ delta: -v.fillet, corners: 'round', segments: v.segments }, offset({ delta: v.fillet, corners: 'round', segments: v.segments }, plan))
  // the foot full height; the arm above the gap; a 45° fill under the arm along the base beam's front face
  const footBody = extrudeLinear({ height: top }, roundedRectangle({ size: [v.foot, v.face * 2], roundRadius: r, segments: v.segments }))
  const armBody = translate([0, 0, v.gap], extrudeLinear({ height: v.high }, closed))
  // (drawn in y, z and laid along x: x from y's, y from z's... a cyclic turn of the axes, so the faces keep their winding)
  const wedge = extrudeLinear({ height: w }, polygon({ points: [[-v.face, v.gap], [-v.face - v.fillet, v.gap], [-v.face, v.gap - v.fillet]] }))
  const fill = translate([-w / 2, 0, 0], transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], wedge))
  const body = union(footBody, armBody, fill)
  // the holes: two M5 down through the foot; the stem's bore and the slit; the M4 across the slit and its nut's pocket
  const m5 = [-1, 1].map((s) => v.fixings.hole('M5', { depth: top, at: [s * v.pitch / 2, 0, top] }))
  const stem = translate([0, -v.reach, top / 2], cylinder({ radius: v.bore / 2, height: top * 2, segments: v.segments }))
  const slit = translate([0, -(v.reach + v.tip) / 2 - 1, top / 2], cuboid({ size: [v.slit, v.tip - v.reach + 2, top * 2] }))
  const hole4 = v.fixings.holeModel('M4', { depth: w }).diameter, pocket = v.fixings.nutPocketModel('M4')
  const z = v.gap + v.high / 2, down = (s) => translate([0, 0, z], mirrorZ(translate([0, 0, -z], s))) // (a teardrop that points up on the bed)
  const across = down(v.shapes.teardropHole({ d: hole4, length: w + 2, at: [-w / 2 - 1, -v.pinch, z], into: '+x' }))
  const nut = down(v.shapes.nutPocket({ flats: pocket.flats, height: pocket.depth, hole: hole4, at: [w / 2, -v.pinch, z], into: '-x' }))
  // drawn as it prints: turned over about x and lifted, the arm's top face on the bed and the foot's underside on top
  return translate([0, 0, top], rotateX(Math.PI, v.ops.subtract(body, ...m5, stem, slit, across, nut)))
}
