// A key with a tactile click, printed flat in one piece: a stem on a two-leaf guide (it goes straight down, and the
// guide's leaves are its return spring), a bump on the stem's side that rides past a bump on a leaf standing beside it
// (pushing the leaf aside: the force rises; once the apexes pass, the leaf pushes back: the force drops, the click),
// and a frame it bottoms out on. Drawn in its side view: x across, y up.
import jscad from '@jscad/modeling'
const { polygon } = jscad.primitives
const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

export function main (v) {
  const f = v.flexures, g = v.gap, t = v.guide_t
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG' })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const guide = { length: v.guide_len, thickness: t, gap: v.guide_gap, shuttle: v.block, base: v.block, taper: v.taper, least: v.least, fillet: v.round, into: v.into }
  const half = v.guide_gap / 2 + t + v.round // the guide's blocks reach this far either side of y = 0

  // The stem, over the guide's shuttle: a bump on its right side, the pad on top
  const xs0 = v.guide_len, xs1 = xs0 + v.stem_w, top = v.stem_up, low = 0 - v.stem_down, yc = top - v.bump * 2 // the stem's bump's apex, near its top
  const stem = [
    rect(xs0, low, xs1, top),
    rect(xs1 - v.pad, top, xs1, top + v.pad_t), // the pad, out over the guide, clear of the click leaf on the way down
    polygon({ points: [[xs1 - v.bump, yc - v.bump * 2], [xs1 + v.bump, yc], [xs1 - v.bump, yc + v.bump * 2]] }), // 45° faces
  ]
  // The click leaf: standing up beside the stem, its bump pointing at the stem, its apex click_at below the stem's
  const face = xs1 + v.bump + v.bump - v.engage // the leaf's face: the two bumps overlap by engage (each is a bump high, faces at 45°)
  // The click bump stands off the leaf by a spacer, so the leaf and its rounds keep clear of the stem
  const leafFace = face + v.spacer, xl = leafFace + v.leaf_t / 2, yb = yc - v.click_at, root = yb - v.bump * 2 - v.leaf_len // the leaf ends at the bump body's underside
  const click = polygon({ points: [[face, yb - v.bump * 2], [leafFace + v.leaf_t, yb - v.bump * 2], [leafFace + v.leaf_t, yb + v.bump], [face, yb + v.bump], [face - v.bump, yb]] }) // its top face 45°, so the stem's bump rides down it

  // The frame: a post the guide grows from, a floor the stem bottoms out on, a wall the click leaf stands from
  const floor = low - v.travel, right = leafFace + v.leaf_t + v.wall + v.room
  const ground = [
    rect(0 - v.block - v.wall, floor - v.wall, 0 - v.block + v.into, half + v.wall), // the post, into the guide's base
    rect(0 - v.block - v.wall, floor - v.wall, right, floor), // the floor
    rect(xl - v.leaf_t, floor - v.wall, right, root), // the click leaf's foot
    rect(right - v.wall, floor - v.wall, right, yb + v.bump), // the far wall, under the pad's way down
    rect(leafFace + v.leaf_t + v.engage + g * 2, yb - v.bump * 2 + v.round, right, yb + v.bump), // the click leaf's stop, beside its bump body (the leaf runs into the body's underside, so this is clear of it): it may bend a little further than the bump pushes it
  ]

  return f.lamina({
    height: v.height, gap: g, material, printer, ground, round: v.round, kinematic: false,
    bodies: { stem, click },
    joints: {
      guide: { kind: 'parallelGuide', params: guide, at: [0, 0], from: 'ground', to: 'stem' },
      leaf: { kind: 'leaf', params: { length: v.leaf_len, thickness: v.leaf_t, fillet: v.round, tip: true, into: v.into }, at: [xl, root], angle: v.up, from: 'ground', to: 'click' },
    },
    states: { pressed: { guide: 0 - v.press } },
    sequence: ['rest', 'pressed', 'rest'],
    requires: [{ step: 'rest>pressed', joint: 'guide', peak: [v.peak_least, v.peak_most], click: v.click }],
  })
}
