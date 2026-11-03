// The launcher's action in line, one flat print: the spring's two arms either side of the pusher, pulling it straight
// along the barrel the way a bow's limbs pull its string, so no force turns a corner through a thin part. Each arm is a
// curve shaped by the beam solver (../shape-inline.mjs) to store the energy at the stroke with the least peak strain.
// The frame is flooded: solid everywhere inside the outline but the room the pusher and the arms sweep, so it is as
// stiff as the outline allows and only the mechanism moves. The pusher's stem runs back through the solid handle to a
// pull ring: the channel it slides in is its barrel. Drawn, a tooth on the stem rides under a sear and is caught; a
// trigger, a solid block in the frame's room above the ring, turns the sear off it, and the pusher throws the disc. Holes in the corners take snap pins, should a
// plate either side ever be wanted.
import jscad from '@jscad/modeling'
import { layout, catchOf } from './inline-layout.mjs'
import { shaped } from './inline-spring.mjs'
import { shaped as hingeShaped } from './inline-hinge.mjs'
const { polygon, circle, roundedRectangle } = jscad.primitives
const { subtract, union } = jscad.booleans

const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, density: v.petg.density, name: 'PETG' }, { safety: v.safety })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const L = layout(v, f)
  // The spring as shaped for this very job: if the layout or the rules have moved since, shape it again
  const job = JSON.stringify({ ...L.job, E: material.E, limit: material.strainLimit })
  if (shaped.job !== job) throw new Error('the spring was shaped for another layout or material: run node examples/bench/projects/launcher/shape-inline.mjs')
  const spring = { ...shaped.params, into: v.into, fillet: v.spring_round }, height = shaped.params.width // printed as tall as the shaping found it must be
  const draw = v.stroke - v.short // drawn a little short of the stroke the arms were shaped for: the frame stops it a sliding gap further

  // The pusher: the bar the arms meet, a nose forward to the disc's edge, a stem back to the pull ring
  const ringAt = L.back - v.stem - v.ring_in - v.ring_wall
  // The catch, over the stem ahead of the ring (inline-layout.mjs): a tooth stands on the stem, its front face hooked
  // back a little. Drawn, it rides under the sear's head, which lifts and drops back behind it; let go, the tooth comes
  // forward on to the head's hooked face. The sear hangs on its hinge, which lies on the line the tooth pushes along, so
  // the spring's pull is the hinge's tension, not a bend, and the catch holds however strong the spring. The hinge is
  // shaped by the beam solver (../shape-hinge.mjs) in the room above the ring, to turn about its middle and stay stiff
  // along that line. The sear is the trigger: a solid block in the frame's room above the ring, its front face hollowed
  // for a finger, which pushes it back from the open room ahead of it; the sear turns, its head lifts off the tooth (a
  // little friction is all it costs), and the pusher is gone at once
  const C = catchOf(v, height), P = C.P, { xs, yc, toothTop, over } = C
  const hingeJob = JSON.stringify({ ...C.job, E: material.E, limit: material.strainLimit })
  if (hingeShaped.job !== hingeJob) throw new Error('the sear\'s hinge was shaped for another layout or material: run node examples/bench/projects/launcher/shape-hinge.mjs')
  const hinge = { ...hingeShaped.params, into: v.into, fillet: v.hinge_round }
  const hookAt = (x0) => (y) => x0 + (y - yc) * (v.sear_drop / v.sear_reach) // a face square to that line
  const stemTop = v.stem_h / 2, toothBack = v.tooth_x - v.tooth_w
  const tooth = polygon({ points: [[toothBack, stemTop - v.round], [hookAt(v.tooth_x)(stemTop - v.round), stemTop - v.round], [hookAt(v.tooth_x)(toothTop), toothTop], [toothBack + v.round, toothTop], [toothBack, toothTop - v.round]] })
  const headLow = toothTop - v.engage, face = hookAt(xs)
  const clearOf = (x) => P[1] + ((x - P[0]) * C.u[1]) / C.u[0] + v.hinge_clear // above the hinge's line, its thickness and room clear
  const rear = C.tip[0] - v.into, top = L.top - v.trigger_clear, fingerAt = [v.trigger_front + v.finger_r - v.scoop, top - v.finger_down]
  const sear = [
    // the trigger: solid from the hinge's line up to the top, back over the hinge, hollowed in front for the finger
    subtract(polygon({ points: [[rear, over], [v.trigger_front, over], [v.trigger_front, top], [v.trigger_back, top], [v.trigger_back, clearOf(v.trigger_back)], [rear, clearOf(rear)]] }), circle({ radius: v.finger_r, center: fingerAt, segments: v.smooth })),
    rect(rear, over, xs + v.head, over + v.sear_foot), // its foot: solid all along the bottom, the hook's root
    polygon({ points: [[face(over), over + v.round], [face(headLow), headLow], [xs + v.head - (over - headLow) / Math.tan(jscad.utils.degToRad(v.ramp)), headLow], [xs + v.head, over + v.round]] }), // the hook: the hooked face behind, a shallow ramp in front for the tooth to ride (it lifts the sear up and forward, so a steep one jams)
  ]
  const finger = [fingerAt[0] - v.finger_r, fingerAt[1]] // where the finger pushes it: the bottom of the hollow
  const pusher = [
    tooth,
    rect(L.back, 0 - L.half, L.nose, L.half),
    rect(L.nose - v.round * 2, 0 - v.nose_w / 2, L.discAt - g, v.nose_w / 2),
    rect(ringAt + v.ring_in + v.ring_wall / 2, 0 - v.stem_h / 2, L.back, v.stem_h / 2), // (from the ring's wall: the hole is the finger's)
    subtract(circle({ radius: v.ring_in + v.ring_wall, center: [ringAt, 0], segments: v.smooth }), circle({ radius: v.ring_in, center: [ringAt, 0], segments: v.smooth })),
  ]
  // The frame: the outline, flooded but for what the pusher and the arms sweep and the disc's slot
  const out = L.top + v.wall, back = ringAt - v.ring_in - v.ring_wall - draw - v.handle, front = L.front + v.wall
  const outline = roundedRectangle({ size: [front - back, out * 2], center: [(front + back) / 2, 0], roundRadius: v.corner, segments: v.smooth })
  // Room for the finger ahead of the trigger, kept open through the frame
  const roomBack = 0 - v.reach - v.room, fingerRoom = rect(v.trigger_front + v.room + g, over + v.finger_floor, roomBack - v.finger_wall, top)
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
  // The stem trapped through the handle: a ridge on its sides in a groove in the frame, from the ring's pocket to the
  // arms' room (where there's frame either side of it)
  const ringFront = ringAt + v.ring_in + v.ring_wall + v.fit
  // The stem trapped through the handle: a ridge on its bottom edge in a groove in the frame, from the ring's pocket to
  // the arms' room (the top edge is the tooth's way); and the trigger's top edge in the frame over it: the sear's one
  // hinge twists easily, so this keeps it in the plane
  const guides = [{ body: 'pusher', shape: rect(ringFront + v.fit, 0 - v.stem_h / 2 - v.fit - v.bridge_foot, roomBack - v.fit, 0), depth: v.guide_depth },
    { body: 'sear', shape: rect(rear - v.bridge_foot, top - v.bridge_foot, v.trigger_front + v.bridge_foot, out), depth: v.guide_depth }]
  return f.lamina({
    height, gap: g, material, printer: { ...printer, bridge: Math.max(v.x1c.bridge, v.roof_span) }, round: v.round,
    flood: { outline, keep: [channel, fingerRoom], clear: { default: v.room, pusher: v.fit }, least: v.least_frame, band: v.band, holes },
    bridges, guides,
    bodies: { pusher, sear },
    joints: {
      spring: { kind: 'curve', params: spring, from: 'ground', to: 'pusher' },
      hinge: { kind: 'curve', params: hinge, from: 'ground', to: 'sear' }, // a spring that is a hinge and a strut
    },
    follows: { hinge: { by: ['pusher'], give: 1 } }, // the tooth lifts the head as it's drawn
    states: { drawn: { spring: 0 - draw }, cocked: { spring: 0 - C.cock }, pulled: { spring: 0 - C.cock, hinge: v.pull }, fired: { hinge: v.pull } },
    sequence: ['rest', 'drawn', 'cocked', 'pulled', 'fired', 'rest'],
    holds: { cocked: [['spring', 'sear']] },
    grips: { hinge: finger },
    physics: { friction: v.friction },
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'pulled', disc: 'disc', most: v.launcher.disc_energy }, // from the moment the trigger lets it go
  })
}
