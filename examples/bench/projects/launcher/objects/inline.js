// The launcher's action in line, one flat print: the spring's two arms either side of the pusher, pulling it straight
// along the barrel the way a bow's limbs pull its string, so no force turns a corner through a thin part. Each arm is a
// curve shaped by the beam solver (../shape-inline.mjs) to store the energy at the stroke with the least peak strain.
// The frame is flooded: solid everywhere inside the outline but the room the pusher and the arms sweep, so it is as
// stiff as the outline allows and only the mechanism moves. The pusher's stem runs back through the solid handle to a
// pull ring: the channel it slides in is its barrel. This is the spring pack: the catch and trigger come next.
import jscad from '@jscad/modeling'
import { layout } from './inline-layout.mjs'
import { shaped } from './inline-spring.mjs'
const { polygon, circle, roundedRectangle } = jscad.primitives
const { subtract } = jscad.booleans

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
  const pusher = [
    rect(L.back, 0 - L.half, L.nose, L.half),
    rect(L.nose - v.round * 2, 0 - v.nose_w / 2, L.discAt - g, v.nose_w / 2),
    rect(ringAt + v.ring_in + v.ring_wall / 2, 0 - v.stem_h / 2, L.back, v.stem_h / 2), // (from the ring's wall: the hole is the finger's)
    subtract(circle({ radius: v.ring_in + v.ring_wall, center: [ringAt, 0], segments: v.smooth }), circle({ radius: v.ring_in, center: [ringAt, 0], segments: v.smooth })),
  ]
  // The frame: the outline, flooded but for what the pusher and the arms sweep and the disc's slot
  const out = L.top + v.wall, back = ringAt - v.ring_in - v.ring_wall - draw - v.handle, front = L.front + v.wall
  const outline = roundedRectangle({ size: [front - back, out * 2], center: [(front + back) / 2, 0], roundRadius: v.corner, segments: v.smooth })
  // The disc lies flat in a slot ahead of the drawn nose, out through the front; a roof over the slot from where the nose
  // stops to the front, standing on the frame both sides, ties the front together (it was two prongs, which the arms'
  // pull closed onto the disc like tweezers). The disc slides on the bed's face, under the roof
  const r = v.launcher.disc / 2, slot = r + v.slide, loaded = L.discAt - draw + r
  const channel = rect(L.discAt - draw - g, 0 - slot, front + 1, slot)
  const disc = circle({ radius: r, center: [loaded, 0], segments: v.smooth })
  const over = v.x1c.layer * v.bridge_gap, roofFrom = v.launcher.disc_t + over // the roof stands this far over the bed: the disc and a gap under it
  const bridges = [{ shape: rect(L.discAt, 0 - slot - v.bridge_foot, front + 1, slot + v.bridge_foot), depth: height - roofFrom, gap: over }]
  // The stem trapped through the handle: a ridge on its sides in a groove in the frame, from the ring's pocket to the
  // arms' room (where there's frame either side of it)
  const ringFront = ringAt + v.ring_in + v.ring_wall + v.fit, roomBack = 0 - v.reach - v.room
  const guides = [{ body: 'pusher', shape: rect(ringFront + v.fit, 0 - v.stem_h / 2 - v.fit - v.bridge_foot, roomBack - v.fit, v.stem_h / 2 + v.fit + v.bridge_foot), depth: v.guide_depth }]
  return f.lamina({
    height, gap: g, material, printer: { ...printer, bridge: Math.max(v.x1c.bridge, v.roof_span) }, round: v.round,
    flood: { outline, keep: [channel], clear: { default: v.room, pusher: v.fit }, least: v.least_frame, band: v.band },
    bridges, guides,
    bodies: { pusher },
    joints: { spring: { kind: 'curve', params: spring, from: 'ground', to: 'pusher' } },
    states: { drawn: { spring: 0 - draw } },
    sequence: ['rest', 'drawn', 'rest'],
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'drawn', disc: 'disc', most: v.launcher.disc_energy },
  })
}
