// The launcher's action in line, one flat print: the spring's two arms either side of the pusher, pulling it straight
// along the barrel the way a bow's limbs pull its string, so no force turns a corner through a thin part. Each arm is a
// curve shaped by the beam solver (../shape-inline.mjs) to store the energy at the stroke with the least peak strain.
// The frame is flooded: solid everywhere inside the outline but the room the pusher and the arms sweep, so it is as
// stiff as the outline allows and only the mechanism moves. The pusher's stem runs back through the solid handle to a
// pull ring: the channel it slides in is its barrel. Drawn, a tooth under the ring rides over a sear and is caught; a
// trigger blade turns the sear off it, and the pusher throws the disc. Holes in the corners take snap pins, should a
// plate either side ever be wanted.
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
  // The catch: a tooth under the ring, its front face hooked back a little. Drawn, it rides over the sear's head, which
  // dips and springs up behind it; let go, the tooth comes forward on to the head's hooked face. The sear hangs on one
  // short leaf (its hinge) on the line the tooth pushes along, through the leaf's middle: so the spring's whole pull is
  // the leaf's tension, which a leaf carries easily, and no turn: the catch holds however strong the spring. The
  // trigger is a blade down from the sear: pulled back, the sear turns about the leaf's middle and its head slides down
  // off the tooth (a little friction is all it costs), and the pusher is gone at once
  const ringLow = 0 - v.ring_in - v.ring_wall, toothFront = ringAt + v.tooth_w / 2, toothBack = ringAt - v.tooth_w / 2, toothLow = ringLow - v.tooth
  const cock = draw - v.settle, xs = toothFront - cock, yc = toothLow + v.engage / 2 // the cocked tooth's front, and the middle of where it bears
  const P = [xs - v.sear_reach, yc - v.sear_drop], len = Math.hypot(v.sear_reach, v.sear_drop), u = [v.sear_reach / len, v.sear_drop / len] // the hinge's middle, and the line it pulls along
  const hookAt = (x0) => (y) => x0 - (y - yc) * (v.sear_drop / v.sear_reach) // a face square to that line
  const tooth = polygon({ points: [[toothBack, ringLow + v.ring_wall / 2], [toothBack, toothLow + v.tooth / 2], [toothBack + v.tooth / 2, toothLow], [hookAt(toothFront)(toothLow), toothLow], [hookAt(toothFront)(ringLow + v.ring_wall / 2), ringLow + v.ring_wall / 2]] })
  // The hinge: a straight curve flexure from the frame to the sear along that line, turning about its middle
  const along = jscad.utils.radToDeg(Math.atan2(u[1], u[0])), hingeTip = [P[0] + u[0] * v.hinge / 2, P[1] + u[1] * v.hinge / 2]
  const headTop = toothLow + v.engage, under = toothLow - g - v.room, face = hookAt(xs), hingeRoot = [P[0] - u[0] * v.hinge / 2, P[1] - u[1] * v.hinge / 2]
  const sear = [
    rect(P[0] + v.hinge / 2 - v.into, P[1] - v.sear_body, face(under), under), // the body: from the hinge's tip, forward under the tooth
    polygon({ points: [[face(under), under], [xs + v.head, under], [xs + v.head - (headTop - under), headTop], [face(headTop), headTop]] }), // the head: a ramp in front for the tooth to ride, the hooked face behind
    rect(P[0] + v.blade_back, P[1] - v.blade, P[0] + v.blade_back + v.blade_w, P[1] - v.sear_body), // the trigger blade, down out of the frame
  ]
  const hinge = { points: [hingeRoot, P, hingeTip], thickness: v.least, start: along, end: along, lead: v.hinge_round + v.least, fillet: v.hinge_round, into: v.into, smooth: v.hinge_smooth, moves: 'turn', about: P }
  const finger = [P[0] + v.blade_back + v.blade_w / 2, P[1] - v.blade + v.blade_w / 2] // where the finger pulls it
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
  // A hole through each corner, for snap pins holding a plate either side should it ever need one (it doesn't rely on them)
  const holes = [[back, 1], [front, -1]].flatMap(([x, s]) => [1, -1].map((y) => ({ at: [x + s * v.plate_in, y * (out - v.plate_in)], diameter: v.plate_hole, wall: v.plate_wall })))
  // The disc lies flat in a slot ahead of the drawn nose, out through the front; a roof over the slot from where the nose
  // stops to the front, standing on the frame both sides, ties the front together (it was two prongs, which the arms'
  // pull closed onto the disc like tweezers). The disc slides on the bed's face, under the roof
  const r = v.launcher.disc / 2, slot = r + v.slide, loaded = L.discAt - cock + r // (ahead of the nose where the catch holds it)
  const channel = rect(L.discAt - draw - g, 0 - slot, front + 1, slot)
  const disc = circle({ radius: r, center: [loaded, 0], segments: v.smooth })
  const over = v.x1c.layer * v.bridge_gap, roofFrom = v.launcher.disc_t + over // the roof stands this far over the bed: the disc and a gap under it
  const bridges = [{ shape: rect(L.discAt, 0 - slot - v.bridge_foot, front + 1, slot + v.bridge_foot), depth: height - roofFrom, gap: over }]
  // The stem trapped through the handle: a ridge on its sides in a groove in the frame, from the ring's pocket to the
  // arms' room (where there's frame either side of it)
  const ringFront = ringAt + v.ring_in + v.ring_wall + v.fit, roomBack = 0 - v.reach - v.room
  const guides = [{ body: 'pusher', shape: rect(ringFront + v.fit, 0 - v.stem_h / 2 - v.fit - v.bridge_foot, roomBack - v.fit, v.stem_h / 2 + v.fit + v.bridge_foot), depth: v.guide_depth },
    // and the trigger blade, where it passes down through the frame: the sear's one leaf twists easily, so this keeps it in the plane
    { body: 'sear', shape: rect(P[0] + v.blade_back - v.bridge_foot, 0 - out + v.band, P[0] + v.blade_back + v.blade_w + v.bridge_foot, P[1] - v.sear_body - v.bridge_foot), depth: v.guide_depth }]
  return f.lamina({
    height, gap: g, material, printer: { ...printer, bridge: Math.max(v.x1c.bridge, v.roof_span) }, round: v.round,
    flood: { outline, keep: [channel], clear: { default: v.room, pusher: v.fit }, least: v.least_frame, band: v.band, holes },
    bridges, guides,
    bodies: { pusher, sear },
    joints: {
      spring: { kind: 'curve', params: spring, from: 'ground', to: 'pusher' },
      hinge: { kind: 'curve', params: hinge, from: 'ground', to: 'sear' }, // a spring that is a hinge: turned about its middle
    },
    follows: { hinge: { by: ['pusher'], give: -1 } }, // the tooth rides the head down as it's drawn
    states: { drawn: { spring: 0 - draw }, cocked: { spring: 0 - cock }, pulled: { spring: 0 - cock, hinge: 0 - v.pull }, fired: { hinge: 0 - v.pull } },
    sequence: ['rest', 'drawn', 'cocked', 'pulled', 'fired', 'rest'],
    holds: { cocked: [['spring', 'sear']] },
    grips: { hinge: finger },
    physics: { friction: v.friction },
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'pulled', disc: 'disc', most: v.launcher.disc_energy }, // from the moment the trigger lets it go
  })
}
