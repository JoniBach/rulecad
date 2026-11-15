// The slot coupon: what a printed part needs to slide in a bought beam's slot, for the two slot families most hobby
// beams have (slot 6 on 20 mm beams, slot 8 on 30 and 40 mm beams). For each: five tongues, the part of a printed
// fitting that keys into the slot's opening; five printed carriers (@rulecad/frames' carrier, a block holding a hex nut
// that slides along the slot like a slide-in nut); and three short printed slots, standing on end, that a bought slot
// nut slides into. Every piece lies loose on the bed with its figure, the clearance a side, on top. Each is drawn from
// the slot's rule set (v.frames.slotModel): print it again once the slot is measured, and it is drawn from yours.
// Each piece is a part of its own. Everything stands on a plain first layer and nothing needs a support (MEASURE.md, rows 29 to 33).
import jscad from '@jscad/modeling'
const { cuboid, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ } = jscad.transforms
const { offset } = jscad.expansions
const { measureBoundingBox } = jscad.measurements

// The families, each with the thread its carriers hold: the largest hex nut a carrier takes in that slot at every
// clearance tried (an M3 nut leaves too little plastic under it in slot 6 at 0.3 mm a side)
const FAMILIES = [['slot-6', 'M2.5'], ['slot-8', 'M5']]

export function main (v) {
  const fig = (x) => String(Number(x.toFixed(2))) // a figure as it is labelled and written back
  const around = (centre, n, step) => Array.from({ length: n }, (_, i) => centre + (i - (n - 1) / 2) * step)
  const width = (text) => { const [lo, hi] = measureBoundingBox(v.shapes.text({ text, height: v.label, stroke: v.stroke })); return hi[0] - lo[0] }
  const say = (text, x, y, z) => translate([x, y, z], extrudeLinear({ height: v.emboss }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))
  const box = (lo, hi) => translate(lo.map((a, i) => (a + hi[i]) / 2), cuboid({ size: lo.map((a, i) => hi[i] - a) }))
  const wordy = Math.max(...around(v.fit, v.fits, v.step).map((c) => width(fig(c))))

  // ---------- the pieces, each drawn with its length along x from 0 and centred on y = 0, on the bed ----------
  // A tongue: a head that lies on the beam's face, and under it (printed on top) a tongue as deep as the slot's lips,
  // narrower than the opening by the clearance each side. A V-groove at each side of its root, so no inside corner is
  // square; the head runs on past the tongue to carry its figure
  const tongue = (slot, c) => {
    const w = slot.opening - 2 * c, head = slot.opening + 2 * v.wall, long = v.key + v.gap * 2 + wordy, top = v.base + slot.lip
    const solid = v.ops.union(box([0, -head / 2, 0], [long, head / 2, v.base]), box([0, -w / 2, v.base - v.root], [v.key, w / 2, top]))
    const cut = [1, -1].map((s) => groove(s, w / 2, v.base, v.root, v.key))
    return { long, across: head, solid: v.ops.subtract(solid, ...cut), label: say(fig(c), v.key + v.gap + wordy / 2, 0, v.base) }
  }
  // A carrier for a hex nut, as frames draws it with the clearance as the printer's slot fit, long enough that its
  // figure fits beside the screw's hole
  const carrier = (slot, thread, c) => {
    const printer = { ...v.x1c, slot_fit: c }, m0 = v.frames.carrierModel(slot, { thread, printer })
    const length = Math.ceil(Math.max(m0.length, m0.screwHole + 2 * (wordy + v.gap * 2)))
    const m = v.frames.carrierModel(slot, { thread, printer, length }), high = m.levels.bottom - m.levels.top
    return { long: m.total, across: Math.max(...m.section.map(([y]) => Math.abs(y))) * 2, solid: v.frames.carrier(m, { pose: 'print', printer }), label: say(fig(c), (m.total + m.screwHole) / 2 + v.gap + wordy / 2, 0, high), model: m }
  }
  // A short printed slot standing on end: the slot's outline, opened by the clearance each side (its inside corners
  // round by as much), cut down into a block from the top to a floor, the slot's face on the block's side (y = 0)
  const printed = (slot, c) => {
    const path = v.frames.slotPath(slot).map(([u, d]) => [u, -d]), void2 = polygon({ points: [[path[0][0], v.wall], ...path, [path[path.length - 1][0], v.wall]] })
    const open = offset({ delta: c, corners: 'round', segments: v.segments }, void2), across = slot.cavityWidth + 2 * c + 2 * v.wall, deep = slot.cavityDepth + c + v.wall + v.label + v.gap * 2
    const block = box([-across / 2, -deep, 0], [across / 2, 0, v.tall]), cut = translate([0, 0, v.base], extrudeLinear({ height: v.tall }, open))
    return { long: across, across: deep, centre: -deep / 2, solid: v.ops.subtract(block, cut), label: say(fig(c), 0, -deep + v.gap + v.label / 2, v.tall) }
  }

  // ---------- the rows, front to back: tongues, carriers, printed slots; slot 6 on the left, slot 8 on the right ----------
  const groups = FAMILIES.map(([name, thread]) => {
    const slot = v.frames.slotModel(name)
    return {
      name,
      tongues: around(v.fit, v.fits, v.step).map((c) => ({ c, ...tongue(slot, c) })),
      carriers: around(v.fit, v.fits, v.step).map((c) => ({ c, ...carrier(slot, thread, c) })),
      slots: around(v.fit, v.slots, v.slot_step).map((c) => ({ c, ...printed(slot, c) }))
    }
  })
  const out = {} // each piece a part of its own, named for its family, what it is and its clearance: slot-6-tongue-0.15
  let y = v.gap
  for (const row of ['tongues', 'carriers', 'slots']) {
    let x = v.gap, deep = 0
    for (const g of groups) {
      for (const p of g[row]) {
        // tongues and carriers turned to run along y, side by side in x; a printed slot stands as it is
        const turned = row !== 'slots', span = turned ? p.across : p.long, reach = turned ? p.long : p.across
        const place = (s) => turned ? translate([x + span / 2, y, 0], rotateZ(Math.PI / 2, s)) : translate([x + span / 2, y + reach, 0], s)
        out[`${g.name}-${row.slice(0, -1)}-${fig(p.c)}`] = v.ops.union(place(p.solid), place(p.label))
        x += span + v.gap * 2; deep = Math.max(deep, reach)
      }
      x += v.gap * 2
    }
    y += deep + v.gap * 2
  }
  return out
}

// The V-groove beside a tongue's root, along x: a triangle in y, z with its point down, cut into the head's top beside
// the tongue's side at y = s × edge
function groove (s, edge, base, root, key) {
  const tri = s > 0 ? [[edge, base - root], [edge + root, base], [edge, base]] : [[-edge, base - root], [-edge, base], [-edge - root, base]]
  // drawn in x, y as (y, z), extruded along z for the tongue's length, then turned so the extrusion runs along x
  return jscad.transforms.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], extrudeLinear({ height: key }, polygon({ points: tri })))
}
