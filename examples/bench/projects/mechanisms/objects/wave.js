// A wave spring printed flat: legs across, stacked a pitch apart, joined by round U-bends that are thicker than the
// legs; its first leg on the base, a plunger capping its last, the whole in a channel. Pressed, the legs close up;
// pressed far enough they meet, and it stacks solid: its own stop.
import jscad from '@jscad/modeling'
const { polygon } = jscad.primitives
const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, density: v.petg.density, name: 'PETG' })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const p = { span: v.span, pitch: v.pitch, turns: v.turns, thickness: v.leg_t, bend: v.bend_t, smooth: v.smooth, fillet: v.round }
  const R = v.pitch / 2, top = (v.turns - 1) * v.pitch, lo = 0 - R - v.bend_t / 2 - v.room, hi = v.span + R + v.bend_t / 2 + v.room
  const end = f.ports('waveSpring', p).end.at
  // The base under the first leg, the channel's walls either side of the bends, the plunger over the last leg
  // The base holds the first leg only, clear of the first bend below; the plunger caps the last leg only, with wings
  // over the last bend that slide in the channel and meet ledges on its walls before the spring is squashed too far
  const floor = 0 - R - v.bend_t / 2 - g * 2, wing = top + R + v.bend_t / 2 + g * 2, ledge = wing - v.stop // the base and the wings a bend's radius clear, so the end legs' rounds meet only the pad and the cap
  const ground = [
    rect(lo - v.wall, floor - v.wall, hi + v.wall, floor), rect(0, floor - v.wall, v.span - R * 2, v.leg_t / 2), // the base, and the pad the first leg grows from, round it (short of its bend)
    rect(lo - v.wall, floor - v.wall, lo, wing + v.cap), rect(hi, floor - v.wall, hi + v.wall, wing + v.cap), // the channel's walls
    rect(lo - v.wall, ledge - v.wall, lo + v.ledge, ledge), rect(hi - v.ledge, ledge - v.wall, hi + v.wall, ledge), // the ledges: the stop
  ]
  const plunger = [rect(R * 2, top - v.leg_t / 2, v.span, wing), rect(lo + g, wing, hi - g, wing + v.cap + v.button)] // the cap round the last leg, starting along it
  return f.lamina({
    height: v.height, gap: g, material, printer, ground, kinematic: false,
    bodies: { plunger },
    joints: { spring: { kind: 'waveSpring', params: p, at: [0, 0], from: 'ground', to: 'plunger' } },
    states: { pressed: { spring: 0 - v.press } },
    sequence: ['rest', 'pressed', 'rest'],
  })
}
