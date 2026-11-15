// The fixings coupon: every hole a screw, a nut or an insert needs, at sizes either side of the one the kit draws, so
// one print settles them for this printer and plastic. Each feature stands in its own boss on a thin base, and every
// hole ends above the base (the nut slots' screws come in from an edge, lying down, with a teardrop's roof), so the
// first layer is one plain rectangle and nothing needs a support. Each row is named on the left, and each feature
// carries the figure to write back (MEASURE.md, rows 22 to 28).
// Every size comes from v.fixings; each row steps by the printer's hole compensation either side of it.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, roundedRectangle, circle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms
const { hull } = jscad.hulls
const { offset } = jscad.expansions
const { measureBoundingBox } = jscad.measurements

export function main (v) {
  const f = v.fixings, base = v.base, wall = v.wall, step = v.step, seg = v.segments
  const fig = (x) => String(Number(x.toFixed(2))) // a figure as it is labelled and written back
  const around = (centre, n) => Array.from({ length: n }, (_, i) => centre + (i - (n - 1) / 2) * step)
  const width = (text) => { const [lo, hi] = measureBoundingBox(v.shapes.text({ text, height: v.label, stroke: v.stroke })); return hi[0] - lo[0] }
  const say = (text, x, y, z) => translate([x, y, z], extrudeLinear({ height: v.emboss }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))
  // A plain round hole going down from the top, with the lead-in the kit gives a blind hole, its cutter past the top
  const bore = (d, depth, lead, x, y, top) => v.ops.union(
    translate([x, y, top - depth / 2 + 1 / 2], cylinder({ radius: d / 2, height: depth + 1, segments: seg })),
    translate([x, y, top - lead / 2], cylinderElliptic({ height: lead, startRadius: [d / 2, d / 2], endRadius: [d / 2 + lead, d / 2 + lead], segments: seg })))
  // What a feature stands in, its outline rising from the bed to its top, flared at 45° where it meets the base
  const stand = (outline, top) => v.ops.union(extrudeLinear({ height: top }, outline),
    hull(extrudeLinear({ height: base }, offset({ delta: v.root, corners: 'round', segments: seg }, outline)), extrudeLinear({ height: base + v.root }, outline)))

  // ---------- the features, each { label, across (its footprint, along the row), deep (across it), top, make(x, y) } ----------
  const round = (across, top, cut) => ({ across, deep: across, top, make: (x, y) => ({ solid: stand(circle({ radius: across / 2, center: [x, y], segments: seg }), top), cut: cut(x, y) }) })
  const pilots = (t) => {
    const h = f.holeModel(t, { kind: 'pilot' }), sizes = around(h.diameter, v.pilots)
    return { name: t, items: sizes.map((d) => ({ label: fig(d), ...round(Math.max(...sizes) + 2 * wall, base + h.depth, (x, y) => bore(d, h.depth, h.lead, x, y, base + h.depth)) })) }
  }
  const inserts = (t) => {
    const h = f.holeModel(t, { kind: 'insert' }), sizes = around(h.diameter, v.fits), least = f.fixingModel(t).figures.insert_wall.value
    return { name: `I${t}`, items: sizes.map((d) => ({ label: fig(d), ...round(Math.max(...sizes) + 2 * Math.max(wall, least), base + h.depth, (x, y) => bore(d, h.depth, h.lead, x, y, base + h.depth)) })) }
  }
  // A nut pocket from the top over the screw's clearance hole, as deep again below it so the screw's end passes the nut
  const pockets = (t) => {
    const p = f.nutPocketModel(t), fits = around(p.clearance, v.fits), corner = f.nutPocketModel(t, { fit: Math.max(...fits) }).corner, top = base + 2 * p.depth
    return { name: `N${t}`, items: fits.map((fit) => ({ label: fig(fit), ...round(corner + 2 * wall, top, (x, y) => v.ops.union(f.nutPocket(t, { fit, at: [x, y, top], into: '-z' }), f.hole(t, { depth: top - base, through: false, at: [x, y, top] }))) })) }
  }
  // A cap head's counterbore over its clearance hole, then a pilot: a screw as long as the two seats its head
  const counterbore = (t) => {
    const c = f.counterboreModel(t), p = f.holeModel(t, { kind: 'pilot' }), length = 2 * c.depth, top = base + p.depth + length
    return { name: `C${t}`, items: [{ label: fig(c.diameter), ...round(c.diameter + 2 * wall, top, (x, y) => v.ops.union(f.counterbore(t, { length, at: [x, y, top], into: '-z' }), f.hole(t, { kind: 'pilot', at: [x, y, top - length] }))) }] }
  }
  // A nut slot the nut drops into from the top, across a screw lying along y: the screw comes in through the coupon's
  // back edge, through the nut, and on into the block for its end
  const traps = (t) => {
    const m = f.nutTrapModel(t, { depth: 1, axis: 'y', into: '-z' }), fits = around(m.clearance, v.fits), widest = f.nutTrapModel(t, { depth: 1, axis: 'y', into: '-z', fit: Math.max(...fits) })
    const half = widest.reach - 1, depth = half + wall, axisZ = base + wall + half, top = axisZ + depth, deep = 2 * (wall + m.gap), across = widest.width + 2 * wall
    return { name: `T${t}`, edge: true, items: fits.map((fit) => ({ label: fig(fit), across, deep, top, make: (x, y) => {
      const face = y + deep / 2, slot = face - wall - m.gap / 2 // y is the block's middle; its open face is on the back edge
      return { solid: stand(roundedRectangle({ size: [across, deep], center: [x, y], roundRadius: wall / 2, segments: seg }), top),
        cut: v.ops.union(f.nutTrap(t, { fit, depth, axis: 'y', into: '-z', at: [x, slot, top] }), f.hole(t, { depth: deep - wall, through: false, at: [x, face, axisZ], into: '-y' })) }
    } })) }
  }
  // A printed thread for a bought screw, at three gaps, in the form its flanks are drawn
  const threads = (t, flanks) => {
    const gaps = around(f.holeModel(t, { kind: 'thread', mate: 'bought', flanks }).threaded.clearance, v.fits)
    const made = gaps.map((gap) => f.holeModel(t, { kind: 'thread', mate: 'bought', gap, flanks })), across = Math.max(...made.map((h) => h.diameter)) + 2 * wall
    return { name: `${t}${flanks === 'standard' ? 'S' : 'P'}`, items: gaps.map((gap, i) => ({ label: fig(gap), ...round(across, base + made[i].depth, (x, y) => f.hole(t, { kind: 'thread', mate: 'bought', gap, flanks, at: [x, y, base + made[i].depth] })) })) }
  }

  // ---------- the rows, front to back ----------
  const rows = [[pockets('M3'), pockets('M4')], [pilots('M2'), pilots('M2.5')], [pilots('M3'), inserts('M2')], [pilots('M4'), inserts('M3')], [pilots('M5'), counterbore('M3')],
    [threads('M6', 'printed'), threads('M10', 'printed')], [threads('M8', 'printed'), threads('M8', 'standard')], [traps('M3'), traps('M4')]]
  const solids = [], cuts = [], labels = []
  let y = v.gap, length = 0
  for (const row of rows) {
    const deep = Math.max(...row.flatMap((g) => g.items.map((it) => it.deep))), line = y + v.label / 2, mid = y + v.label + v.gap + deep / 2
    let x = v.gap
    for (const g of row) {
      const nameWidth = width(g.name)
      labels.push(say(g.name, x + nameWidth / 2, mid, base)); x += nameWidth + v.gap
      for (const it of g.items) {
        const pitch = Math.max(it.across, width(it.label) + v.gap), cx = x + pitch / 2, cy = g.edge ? mid + deep / 2 - it.deep / 2 : mid, m = it.make(cx, cy)
        solids.push(m.solid); cuts.push(m.cut); labels.push(say(it.label, cx, line, base)); x += pitch + v.gap
      }
      x += v.gap
    }
    length = Math.max(length, x); y += deep + v.label + v.gap * 2
  }
  const plate = extrudeLinear({ height: base }, roundedRectangle({ size: [length, y], center: [length / 2, y / 2], roundRadius: v.corner, segments: seg }))
  return v.ops.union(v.ops.subtract(v.ops.union(plate, ...solids), ...cuts), ...labels)
}
