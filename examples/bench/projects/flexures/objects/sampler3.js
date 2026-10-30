// The third flexure sampler: things that click, turn and hold, on one rail along x. A folded-beam guide stood off the
// rail (its base bar in the rail, the shuttle moving toward and away from it); a cartwheel pivot with its rim on the
// rail and its arm free; an elliptical notch hinge; two snap-fit hooks, square-backed and sloped, each under the lip
// of a catch post; and a ratchet: a tall leaf pawl off the rail, a boss on a post where the wheel's pin goes, and the
// wheel itself held to the rail by a tab, to snap off and pin on top of the boss so its teeth meet the pawl's upper half.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate, rotateZ, mirrorY } = jscad.transforms

export function main (v) {
  const f = v.flexures, h = v.height, parts = []
  const at = (shape, dx, dy) => parts.push(translate([dx, dy, 0], shape))
  const up = (shape) => rotateZ(Math.PI / 2, shape) // a flexure drawn along x, stood off the rail along y; what pointed +y now points -x
  const bar = (x0, x1, y0, y1, z = h) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, z / 2], size: [x1 - x0, y1 - y0, z] })
  // The folded guide: beams along x, its shuttle moving along y; the base bar sits in the rail
  let x = v.folded_width / 2
  at(f.foldedGuide({ length: v.fold_length, thickness: v.mid, width: h, gap: v.gap, clearance: v.clearance, end: v.end }), x, v.folded_lift)
  x += v.folded_width / 2 + v.spacing + v.wheel_outer
  // The cartwheel: rim in the rail, the arm out along +x
  at(f.cartwheel({ spoke: v.spoke, thickness: v.thin, width: h, hub: v.hub, rim: v.rim, arm: v.arm }), x, v.wheel_outer - v.overlap)
  x += v.wheel_outer + v.arm + v.spacing
  // The elliptical hinge, stood off the rail: its first arm in the rail
  at(up(f.ellipticalHinge({ along: v.along, across: v.across, neck: v.thin, width: h, arms: v.arms })), x, -v.overlap)
  x += v.spacing
  // Two snap hooks facing +x (mirrored before standing up), each under the lip of a catch post: the lip overlaps the hook by the
  // engagement, a gap above the hook's back face; push the leaf's tip away from the post to free it, let go to hear it click back
  for (const back of [v.square, v.sloped]) {
    at(up(mirrorY(f.snapHook({ length: v.hook_length, thickness: v.mid, width: h, undercut: v.undercut, lead: v.lead, back }))), x, -v.overlap)
    const right = x + v.mid / 2 + v.undercut, tip = v.hook_length - v.overlap
    const backY = tip - v.undercut / Math.tan(v.lead / v.degrees) - v.flat - (back >= v.square ? 0 : v.undercut / Math.tan(back / v.degrees)) // where the hook's back meets the beam
    parts.push(bar(right + v.catch_gap, right + v.catch_gap + v.post, -v.rail, backY + v.gap_above + v.lip)) // the catch post, off the rail beside the hook
    parts.push(bar(right - v.engage, right + v.catch_gap + v.post, backY + v.gap_above, backY + v.gap_above + v.lip)) // its lip, over the hook's back
    x += v.hook_pitch
  }
  x += v.spacing - v.hook_pitch + v.post + v.catch_gap + v.undercut
  // The ratchet: the pawl twice the height, so its upper half meets the wheel sitting on the boss; the boss on a post
  at(up(f.ratchetPawl({ length: v.pawl_length, thickness: v.thin, width: 2 * h })), x, -v.overlap)
  const wx = x + v.thin / 2 + v.wheel_radius - v.tooth / 2, wy = v.pawl_length - v.overlap // the wheel's centre: the pawl's tip half a tooth into the teeth
  parts.push(v.ops.subtract(cylinder({ radius: v.boss, height: h, center: [wx, wy, h / 2], segments: v.smooth }), cylinder({ radius: v.pin / 2 + v.pin_fit, height: h + 2, center: [wx, wy, h / 2], segments: v.smooth })))
  parts.push(bar(wx + v.boss - v.overlap, wx + v.boss + v.post, -v.rail, wy)) // the post carrying the boss off the rail
  x = wx + v.boss + v.post + v.spacing + v.wheel_radius
  at(f.ratchetWheel({ teeth: v.teeth, radius: v.wheel_radius, height: v.tooth, width: h, pin: v.pin }), x, v.wheel_radius + v.loose)
  parts.push(bar(x - v.tab / 2, x + v.tab / 2, -v.overlap, v.loose + v.tooth + v.overlap)) // the tab, from inside the rail into the wheel's teeth
  x += v.wheel_radius
  const rail = bar(0, x, -v.rail, 0)
  return v.ops.union(rail, ...parts)
}
