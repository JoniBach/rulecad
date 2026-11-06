// A push-push latch printed flat in one piece, from two modules: a plunger on a guide with a pin hanging from it on a
// soft leaf, and a heart-shaped track the pin runs round. The track is drawn as the path the pin's centre may take,
// and its walls are the frame less that path, grown by the pin and a gap: in at the top, sent right by the roof, down
// the right side and along the floor to under the cleft; let go, up into the cleft (held); pressed again, out of the
// cleft down to the left; let go, up the left side and home. The physics says where the pin goes.
import jscad from '@jscad/modeling'
const { polygon, circle } = jscad.primitives
const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

// The plunger: on a guide from a post on the left, a button up, the leaf and pin hanging down. Its port is the pin's
// rest place
function plunger (v, f) {
  const half = v.guide_gap / 2 + v.guide_t + v.round, x0 = v.guide_len, x1 = x0 + v.plunger_w, mid = (x0 + x1) / 2
  const low = 0 - half - v.wall, pinY = low - v.leaf_len - v.pin
  return {
    ground: [rect(0 - v.block - v.wall, 0 - half - v.wall, 0 - v.block + v.into, half + v.wall)],
    bodies: { plunger: rect(x0, low, x1, half + v.wall + v.button), pin: circle({ center: [mid, pinY], radius: v.pin, segments: v.smooth }) },
    joints: {
      guide: { kind: 'parallelGuide', params: { length: v.guide_len, thickness: v.guide_t, gap: v.guide_gap, shuttle: v.block, base: v.block, taper: v.taper, least: v.guide_t, fillet: v.round, into: v.into }, at: [0, 0], from: 'ground', to: 'plunger' },
      leaf: { kind: 'leaf', params: { length: v.leaf_len, thickness: v.leaf_t, fillet: v.round, tip: true, into: v.into }, at: [mid, low], angle: 0 - v.up, from: 'plunger', to: 'pin' },
    },
    ports: { pin: { at: [mid, pinY], body: 'pin' } },
  }
}

// The track round the heart, in the pin's own place (0, 0 its rest): the paths its centre may take, each point moved
// across by the guide's drift (its shuttle sinks towards its base as it travels), so the track follows the pin
function track (v, f, drift) {
  const s = v.side, c = v.cleft, d = v.stroke, l = v.lean, w = v.band
  const raw = [
    [[0, w], [0, 0 - v.roof]], // in
    [[0, 0 - v.roof], [s, 0 - v.roof - v.drop]], // the roof sends it right
    [[s, 0 - v.roof - v.drop], [s, 0 - d + v.drop]], // down the right side
    [[s, 0 - d + v.drop], [l, 0 - d]], // along the floor to under the cleft
    [[l, 0 - d], [l * v.one_third, 0 - c]], // up into the cleft
    [[0 - l * v.one_third, 0 - c], [0 - s, 0 - d]], // pressed again: out of the cleft, down to the left
    [[0 - s, 0 - d], [0 - s, 0 - v.roof - v.drop]], // up the left side
    [[0 - s, 0 - v.roof - v.drop], [0 - l, 0 - w]], // home
    [[l * v.one_third, 0 - c], [0 - l * v.one_third, 0 - c]], // the cleft itself
  ]
  const paths = raw.map((seg) => seg.map(([x, y]) => [x - drift(0 - y), y]))
  const band = (a, b) => jscad.hulls.hull(circle({ center: a, radius: w, segments: v.smooth }), circle({ center: b, radius: w, segments: v.smooth }))
  const way = jscad.booleans.union(paths.map(([a, b]) => band(a, b)))
  const room = jscad.expansions.expand({ delta: v.pin + v.gap, corners: 'round', segments: v.smooth }, way)
  const outer = rect(0 - s - v.wall * 2, 0 - d - v.pin - v.wall * 2, s + v.wall * 2, 0 - v.pin - v.gap - w) // the walls start under the pin at rest: it hangs free
  const posts = [-1, 1].map((k) => rect(k * (s + v.pin + v.gap + w) - (k < 0 ? v.wall : 0), 0 - v.pin - v.gap - w, k * (s + v.pin + v.gap + w) + (k > 0 ? v.wall : 0), v.pin)) // beside the pin at rest: its leaf's stops
  return { ground: [jscad.booleans.subtract(outer, room), ...posts] }
}

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG' })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const p = f.place(plunger(v, f), { name: 'p' })
  const guideModel = f.parallelGuideModel({ length: v.guide_len, thickness: v.guide_t, width: v.height, gap: v.guide_gap, taper: v.taper, least: v.guide_t, fillet: v.round }, material)
  const cam = f.place(track(v, f, (q) => guideModel.drop(q)), { name: 'cam', at: p.ports.pin.at })
  const press = { 'p.guide': 0 - v.stroke }
  return f.lamina(f.combine([p, cam], {
    height: v.height, gap: g, material, printer, round: v.round, kinematic: false,
    states: { pressed: press, held: { 'p.guide': 0 - v.cleft }, again: press },
    sequence: ['rest', 'pressed', 'held', 'again', 'rest'],
    holds: { held: [['p.guide', 'ground']] }, // let go after the first press, the cleft keeps it down
    requires: [{ step: 'rest>pressed', joint: 'p.guide', peak: [0, v.press_most] }, { step: 'held>again', joint: 'p.guide', peak: [0, v.press_most] }],
  }))
}
