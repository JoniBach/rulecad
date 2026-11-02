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

  // The pusher: the bar the arms meet, a nose forward to the disc (as thick as the disc), a stem back to the pull ring
  const noseH = v.launcher.disc_t / 2, ringAt = L.back - v.stem - v.ring_in - v.ring_wall
  const pusher = [
    rect(L.back, 0 - L.half, L.nose, L.half),
    rect(L.nose - v.round * 2, 0 - noseH, L.discAt - g, noseH),
    rect(ringAt + v.ring_in + v.ring_wall / 2, 0 - v.stem_h / 2, L.back, v.stem_h / 2), // (from the ring's wall: the hole is the finger's)
    subtract(circle({ radius: v.ring_in + v.ring_wall, center: [ringAt, 0], segments: v.smooth }), circle({ radius: v.ring_in, center: [ringAt, 0], segments: v.smooth })),
  ]
  // The frame: the outline, flooded but for what the pusher and the arms sweep (and the disc's way out); the blocks the
  // arms grow from drawn, so they join it however the flood falls
  const out = L.top + v.wall, back = ringAt - v.ring_in - v.ring_wall - draw - v.handle, front = L.front + v.wall
  const outline = roundedRectangle({ size: [front - back, out * 2], center: [(front + back) / 2, 0], roundRadius: v.corner, segments: v.smooth })
  const root = shaped.params.points[0][0], roots = [rect(root - v.wall, L.top, root + v.wall, out), rect(root - v.wall, 0 - out, root + v.wall, 0 - L.top)]
  const channel = rect(L.discAt - draw - g, 0 - (v.launcher.disc_t / 2 + v.slide), front + 1, v.launcher.disc_t / 2 + v.slide) // the disc's way: loaded ahead of the drawn nose, out through the front
  const disc = rect(L.discAt - draw, 0 - v.launcher.disc_t / 2, L.discAt - draw + v.launcher.disc, v.launcher.disc_t / 2) // seen edge on: for the firing, not printed with it
  return f.lamina({
    height, gap: g, material, printer, ground: roots, round: v.round,
    flood: { outline, keep: [channel], clear: { default: g, pusher: v.slide }, least: v.least_frame },
    bodies: { pusher },
    joints: { spring: { kind: 'curve', params: spring, from: 'ground', to: 'pusher' } },
    states: { drawn: { spring: 0 - draw } },
    sequence: ['rest', 'drawn', 'rest'],
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'drawn', disc: 'disc', most: v.launcher.disc_energy },
  })
}
