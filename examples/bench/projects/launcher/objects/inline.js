// The launcher's action in line, one flat print: the spring's two arms either side of the pusher, pulling it straight
// along the barrel the way a bow's limbs pull its string, so no force turns a corner through a thin part (the flat
// action's spring stood up the grip, its trigger hung down, and its pusher went along: everything bent). Each arm is a
// curve shaped by the beam solver (../shape-inline.mjs) to store the energy at the stroke with the least peak strain,
// thick where it bends least and thin where the strain would pile up, with no straight runs and no corners. This is
// the spring pack alone: the pusher, its arms, the frame with the stops, and the disc.
import jscad from '@jscad/modeling'
import { layout } from './inline-layout.mjs'
import { shaped } from './inline-spring.mjs'
const { polygon } = jscad.primitives

const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })
const both = (r) => [r, jscad.transforms.mirrorY(r)] // the frame's parts above the axis, and below

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, density: v.petg.density, name: 'PETG' }, { safety: v.safety })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const L = layout(v, f)
  // The spring as shaped for this very job: if the layout or the rules have moved since, shape it again
  const job = JSON.stringify({ ...L.job, E: material.E, limit: material.strainLimit })
  if (shaped.job !== job) throw new Error('the spring was shaped for another layout or material: run node examples/bench/projects/launcher/shape-inline.mjs')
  const spring = { ...shaped.params, into: v.into, fillet: v.spring_round }, height = shaped.params.width // printed as tall as the shaping found it must be

  // The pusher: the bar the arms meet, a tab out through the back wall to cock it
  // and a nose forward between the rails to the disc (as thick as the disc, so it fits where the disc slides)
  const noseH = v.launcher.disc_t / 2
  const pusher = [rect(L.back, 0 - L.half, L.nose, L.half), rect(L.rear - v.wall - v.tab, 0 - v.tab_h / 2, L.back, v.tab_h / 2), rect(L.nose - v.round * 2, 0 - noseH, L.discAt - g, noseH)]
  // The frame: back wall (a slot for the tab), top and bottom, front wall (an opening for the disc); stops off the back
  // wall either side of the tab; rails either side of the disc, which are also the bar's forward stop
  const out = L.top + v.wall, rail = v.launcher.disc_t / 2 + v.slide, ground = [
    ...both(rect(L.rear - v.wall, v.tab_h / 2 + g, L.rear, out)),
    ...both(rect(L.rear - v.wall, L.top, L.front + v.wall, out)),
    ...both(rect(L.front, rail, L.front + v.wall, out)),
    ...both(rect(L.rear - g, v.tab_h / 2 + g, L.stop, L.half + v.stop_h)),
    // (their inner back corners cut away clear of the round where the pusher's nose meets its bar)
    ...both(polygon({ points: [[L.railAt + v.round * 2 + g, rail], [L.front, rail], [L.front, rail + v.rail], [L.railAt, rail + v.rail], [L.railAt, noseH + v.round * 2 + g]] })),
  ]
  // The disc, seen edge on, loaded in front of the drawn-back nose so it rides the whole stroke: for the firing, not
  // printed with it
  const disc = rect(L.discAt - v.stroke, 0 - v.launcher.disc_t / 2, L.discAt - v.stroke + v.launcher.disc, v.launcher.disc_t / 2)
  return f.lamina({
    height, gap: g, material, printer, ground, round: v.round,
    bodies: { pusher },
    joints: { spring: { kind: 'curve', params: spring, from: 'ground', to: 'pusher' } },
    states: { drawn: { spring: 0 - v.stroke } },
    sequence: ['rest', 'drawn', 'rest'],
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'drawn', disc: 'disc', most: v.launcher.disc_energy },
  })
}
