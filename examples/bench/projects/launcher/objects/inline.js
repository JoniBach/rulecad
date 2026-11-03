// The launcher's action in line, one flat print: the spring's two arms either side of the pusher, pulling it straight
// along the barrel the way a bow's limbs pull its string, so no force turns a corner through a thin part. Each arm is a
// curve shaped by the beam solver (../shape-inline.mjs) to store the energy at the stroke with the least peak strain.
// The frame is flooded: solid everywhere inside the outline but the room the pusher and the arms sweep, so it is as
// stiff as the outline allows and only the mechanism moves. The pusher's stem runs back through the handle; its pull
// ring stands on it, in the room above. Under the stem, the trigger, its own sear (inline-layout.mjs): a tooth under the
// stem is caught by the hook on its top; it hangs on a hinge carrying the spring's pull in tension; the finger pulls it
// back from the crook in front of it, and the hook slides off the tooth. Holes in the corners take snap pins, should a
// plate either side ever be wanted.
import jscad from '@jscad/modeling'
import { layout, catchOf } from './inline-layout.mjs'
import { shaped } from './inline-spring.mjs'
import { shaped as hingeShaped } from './inline-hinge.mjs'
const { polygon, circle, roundedRectangle } = jscad.primitives
const { subtract, union } = jscad.booleans
const { offset } = jscad.expansions

const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, density: v.petg.density, name: 'PETG' }, { safety: v.safety })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const L = layout(v, f)
  // Each spring as shaped for this very job: if the layout or the rules have moved since, shape it again
  const same = (s, j, script) => { if (s.job !== JSON.stringify({ ...j, E: material.E, limit: material.strainLimit })) throw new Error(`a spring was shaped for another layout or material: run node examples/bench/projects/launcher/${script}`) }
  same(shaped, L.job, 'shape-inline.mjs')
  const spring = { ...shaped.params, into: v.into, fillet: v.spring_round }, height = shaped.params.width // printed as tall as the shaping found it must be
  const C = catchOf(v, height), draw = C.draw // drawn a little short of the stroke the arms were shaped for: the frame stops it a sliding gap further
  same(hingeShaped, C.hingeJob, 'shape-hinge.mjs')
  const hinge = { ...hingeShaped.params, into: v.into, fillet: v.hinge_round }

  // The pusher: the bar the arms meet, a nose forward to the disc's edge, a stem back to the pull ring, which stands on
  // the stem at the front of the room above it, just behind the arms (the room under the stem is the trigger's)
  const R = v.ring_in + v.ring_wall, ringAt = [v.ring_x, v.stem_h / 2 + v.ring_in + v.ring_wall / 2], stemEnd = ringAt[0] - R
  const hookAt = (x0) => (y) => x0 - (y - C.yc) * (v.sear_drop / v.sear_reach) // a face square to the pull's line
  const toothBack = v.tooth_x - v.tooth_w
  const tooth = polygon({ points: [[toothBack, C.stemLow + v.round], [toothBack, C.toothLow + v.tooth / 2], [toothBack + v.tooth / 2, C.toothLow], [hookAt(v.tooth_x)(C.toothLow) - v.chamfer, C.toothLow], [hookAt(v.tooth_x)(C.toothLow + v.chamfer), C.toothLow + v.chamfer], [hookAt(v.tooth_x)(C.stemLow + v.round), C.stemLow + v.round]] })
  const pusher = [
    rect(L.back, 0 - L.half, L.nose, L.half),
    rect(L.nose - v.round * 2, 0 - v.nose_w / 2, L.discAt - g, v.nose_w / 2),
    rect(stemEnd, 0 - v.stem_h / 2, L.back, v.stem_h / 2),
    // the ring, its back filled out solid down to the stem: one full contour from the ring's back to the stem's end
    subtract(union(circle({ radius: R, center: ringAt, segments: v.smooth }), rect(stemEnd, 0, ringAt[0], ringAt[1])), circle({ radius: v.ring_in, center: ringAt, segments: v.smooth })),
    tooth, // the catch's tooth, under the stem, its front face hooked back a little
  ]

  // The trigger: one solid part, its own sear. Its top carries the hook under the tooth (the hooked face behind, a ramp in
  // front for the tooth to ride as it's drawn); its body curves down and back to a heel near the frame's bottom; the
  // finger sits in the crook in front of it. It hangs on the hinge from its back, by the hinge's tip
  const out = L.top + v.wall, bottom = 0 - out + v.band - v.room, face = hookAt(C.xs), headTop = C.toothLow + v.engage
  const rear = C.tip[0] - v.into, along = (x) => C.tip[1] + (x - C.tip[0]) * (C.u[1] / C.u[0]) // the hinge's line
  const neck = [v.trigger_front, C.under - v.trigger_neck], toe = [v.trigger_toe, bottom], heel = [v.trigger_heel, bottom]
  // the crook: a hollow for the finger, bowed back from the straight line between the neck and the toe
  const crook = Array.from({ length: v.crook_steps + 1 }, (_, i) => { const t = i / v.crook_steps, ex = toe[0] - neck[0], ey = toe[1] - neck[1], l = Math.hypot(ex, ey), b = v.crook * Math.sin(Math.PI * t); return [neck[0] + ex * t - (ey / l) * b * -1, neck[1] + ey * t - (ex / l) * b]; })
  const outlineOf = polygon({ points: [[rear, C.under], [v.trigger_front, C.under], ...crook, heel, [v.trigger_heel, bottom + v.heel_h], [rear - v.trigger_waist, along(rear - v.trigger_waist) - v.hinge_clear], [rear, along(rear) - v.hinge_clear]] }) // (up the back to under the hinge, then up to the top by its tip)
  const trigger = offset({ delta: v.trigger_round, corners: 'round', segments: v.smooth }, offset({ delta: 0 - v.trigger_round, corners: 'round', segments: v.smooth }, outlineOf)) // every outside corner rounded
  const sear = [
    trigger,
    polygon({ points: [[face(C.under), C.under], [v.trigger_front - v.round, C.under], [C.xs + v.head, headTop], [face(headTop) + v.chamfer, headTop], [face(headTop - v.chamfer), headTop - v.chamfer]] }), // the hook: its hooked face behind (its corner taken off, as the tooth's is, so they slide past each other), a flat top, and a long ramp down to the trigger's front for the tooth to ride, solid all through
  ]
  const finger = [toe[0] + (neck[0] - toe[0]) * v.finger_at, toe[1] + (neck[1] - toe[1]) * v.finger_at] // where the finger pulls it, on the crook's face

  // The frame: the outline, flooded but for what moves and the disc's slot; the crook kept open for the finger
  const back = stemEnd - draw - v.handle, front = L.front + v.wall // (behind the drawn ring, the handle)
  const outline = roundedRectangle({ size: [front - back, out * 2], center: [(front + back) / 2, 0], roundRadius: v.corner, segments: v.smooth })
  const roomBack = 0 - v.reach - v.room, fingerBox = polygon({ points: [[neck[0] - v.finger_round, neck[1]], [roomBack - v.finger_wall, neck[1]], [roomBack - v.finger_wall, bottom], [toe[0] - v.finger_round * 2, bottom]] }) // from into the crook (the trigger's own room) to the frame before the arms, right down past the toe
  const fingerRoom = offset({ delta: v.finger_round, corners: 'round', segments: v.smooth }, offset({ delta: 0 - v.finger_round, corners: 'round', segments: v.smooth }, fingerBox)) // its corners rounded
  // A hole through each corner, for snap pins holding a plate either side should it ever need one (it doesn't rely on them)
  const holes = [[back, 1], [front, -1]].flatMap(([x, s]) => [1, -1].map((y) => ({ at: [x + s * v.plate_in, y * (out - v.plate_in)], diameter: v.plate_hole, wall: v.plate_wall })))
  // The disc lies flat in a slot ahead of the drawn nose, out through the front; a roof over the slot from where the nose
  // stops to the front, standing on the frame both sides, ties the front together (it was two prongs, which the arms'
  // pull closed onto the disc like tweezers). The disc slides on the bed's face, under the roof
  const r = v.launcher.disc / 2, slot = r + v.slide, loaded = L.discAt - C.cock + r // (ahead of the nose where the catch holds it)
  const channel = rect(L.discAt - draw - g, 0 - slot, front + 1, slot)
  const disc = circle({ radius: r, center: [loaded, 0], segments: v.smooth })
  const roofGap = v.x1c.layer * v.bridge_gap, roofFrom = v.launcher.disc_t + roofGap // the roof stands this far over the bed: the disc and a gap under it
  const bridges = [{ shape: rect(L.discAt, 0 - slot - v.bridge_foot, front + 1, slot + v.bridge_foot), depth: height - roofFrom, gap: roofGap }]
  // Trapped in the plane: the ring's top in a groove in the frame over it, and the trigger's heel in the frame under it (a
  // body on one hinge twists easily)
  const guides = [
    { body: 'pusher', shape: rect(stemEnd - draw - v.fit, ringAt[1] + R - v.bridge_foot, ringAt[0] + R, ringAt[1] + R + v.fit + v.bridge_foot), depth: v.guide_depth },
    { body: 'sear', shape: rect(v.trigger_heel - v.bridge_foot, bottom - v.room - v.bridge_foot, v.trigger_toe, bottom + v.bridge_foot), depth: v.guide_depth },
  ]
  return f.lamina({
    height, gap: g, material, printer: { ...printer, bridge: Math.max(v.x1c.bridge, v.roof_span) }, round: v.round,
    flood: { outline, keep: [channel, fingerRoom], clear: { default: v.room, pusher: v.fit, sear: v.trigger_room, spring: v.spring_clear }, least: v.least_frame, band: v.band, holes },
    bridges, guides,
    bodies: { pusher, sear },
    joints: {
      spring: { kind: 'curve', params: spring, from: 'ground', to: 'pusher' },
      hinge: { kind: 'curve', params: hinge, from: 'ground', to: 'sear' }, // a spring that is a hinge and a strut
    },
    follows: { hinge: { by: ['pusher'], give: -1 } }, // the tooth rides the hook down as it's drawn
    states: { drawn: { spring: 0 - draw }, cocked: { spring: 0 - C.cock }, pulled: { spring: 0 - C.cock, hinge: 0 - v.pull }, fired: { hinge: 0 - v.pull } },
    sequence: ['rest', 'drawn', 'cocked', 'pulled', 'fired', 'rest'],
    holds: { cocked: [['spring', 'sear']] },
    grips: { hinge: finger },
    physics: { friction: v.friction },
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'pulled', disc: 'disc', most: v.launcher.disc_energy }, // from the moment the trigger lets it go
  })
}
