// The launcher's action as one flat print, the way working printed blasters are made: drawn in one plane (x along
// the barrel, y up) and printed on its side, so every flexure bends within its layers and everything that moves stands
// on the bed. A pusher rides on a two-leaf spring standing up the grip (a parallel guide: it moves straight back and
// stores the energy); a tab at the back cocks it; the trigger is its own sear: a lever on a hanging leaf hinge whose
// arm carries a hook, which the pusher's tooth rides down when cocked and which catches it; pulling the trigger
// lowers the hook. The flexures are sized from the travel (displacement first): the spring's length and thickness
// from the stroke and the strain limit, its force from its width, which is the print's height.
import jscad from '@jscad/modeling'
const { polygon } = jscad.primitives

const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG' }, { safety: v.safety })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }

  // The spring: two leaves up the grip, sized for the stroke and the energy at the print's height
  const shape = { taper: v.taper, fillet: v.spring_round, least: v.least, into: v.into } // tapered leaves with rounded ends
  const spring = f.size.forTravel('parallelGuide', { travel: v.stroke, energy: v.energy, width: v.height, material, shape, margin: v.margin }, printer)
  if (!spring) throw new Error('no two-leaf spring stores the energy within the strain limit: print it taller, or store less')
  const L = spring.length, t = spring.thickness
  const guide = { length: L, thickness: t, gap: v.beam_gap, shuttle: v.block, base: v.block, ...shape }
  const drop = (q) => f.parallelGuideModel({ ...guide, width: v.height }, material).drop(q) // the shuttle sinks a little as it moves
  const half = v.beam_gap / 2 + t + v.spring_round // the leaves' outer faces and their rounds, either side of x = 0
  const under = L - g - drop(v.stroke + v.over) // everything fixed under the pusher bar stays below this, however far it sinks

  // The frame's walls: behind the back leaf, room for the stroke and the stop; in front, a gap
  const rearIn = 0 - half - v.stroke - v.over, rearOut = rearIn - v.wall, frontIn = half + g * 2, frontOut = frontIn + v.wall
  const bottom = 0 - v.block - v.wall

  // The trigger: a leaf hanging from an arm off the front wall, the blade on its tip, and an arm forward and up to the hook
  const hook = v.engage + g, run = hook / v.slope, hookLen = v.flat + run, yh = under // the hook's top, under the bar
  const root = under - v.hanger, tip = root - v.hinge, pivotY = root - (1 - v.gamma) * v.hinge
  const freeTurn = Math.asin((v.engage + g) / v.reach), stopTurn = v.release * freeTurn // how far it must turn to free the tooth, and where it stops
  const bladeDepth = pivotY - (tip - v.blade) // from the pivot down to the blade's bottom
  const xh = frontOut + v.blade_w / 2 + bladeDepth * Math.sin(stopTurn) // the blade's back meets the front wall at the stop
  const xc = xh + v.reach // the hook's catch face
  const trigger = [
    rect(xh - v.blade_w / 2, tip - v.blade, xh + v.blade_w / 2, tip), // the blade, the hinge's tip rounded into its top
    rect(xh, tip - v.arm, xc + hookLen, tip), // the arm forward
    rect(xc, tip - v.arm, xc + hookLen, yh - hook), // the riser
    polygon({ points: [[xc, yh - hook], [xc + hookLen, yh - hook], [xc + v.flat, yh], [xc - hook * v.lean, yh]] }), // the hook: a catch leaning back behind, a ramp in front
  ]

  // The pusher: on the spring's shuttle, a bar forward over the trigger, a tooth under it the stroke ahead of the catch, a tab behind
  // Its front face leans as the catch does, and lies on it when the pusher has moved the stroke back (and sunk with it)
  const toothTop = L + v.overlap, toothBottom = L - (v.engage + g + drop(v.stroke + v.over))
  const face = (y) => xc + v.stroke - (y - drop(v.stroke) - (yh - hook)) * v.lean
  const pusher = [
    rect(0 - half, L, xc + hookLen + v.nose, L + v.bar),
    polygon({ points: [[face(toothTop) - v.tooth, toothTop], [face(toothBottom) - v.tooth, toothBottom], [face(toothBottom), toothBottom], [face(toothTop), toothTop]] }),
    rect(rearOut - v.tab, L + v.block + g + drop(v.stroke + v.over), 0 - half, L + v.bar),
  ]

  // The ground: back wall (the stop), bottom, front wall (the trigger's stop), the hinge's arm, the guard
  const guardTop = tip - v.blade - v.guard, guardFront = xc + hookLen + v.wall * 2
  const ground = [
    rect(rearOut, bottom, rearIn, L + v.block),
    rect(rearOut, bottom, frontOut, v.overlap - v.block), // into the spring's base block, so they join
    rect(frontIn, bottom, frontOut, under),
    rect(frontIn, root, xh + v.hanger, under),
    rect(frontIn, Math.min(bottom, guardTop - v.wall), guardFront, guardTop),
    rect(guardFront - v.wall, Math.min(bottom, guardTop - v.wall), guardFront, tip - v.arm - v.guard),
  ]

  const pulled = 0 - Math.sin(v.pull * stopTurn) * v.gamma * v.hinge // the hinge's tip, a full pull back
  const m = f.lamina({
    height: v.height, gap: g, material, printer, ground, round: v.round,
    bodies: { pusher, trigger },
    joints: {
      spring: { kind: 'parallelGuide', params: guide, at: [0, 0], angle: v.up, from: 'ground', to: 'pusher' },
      hinge: { kind: 'leaf', params: { length: v.hinge, thickness: v.hinge_t, fillet: v.hinge_round, tip: true, into: v.into }, at: [xh, root], angle: v.down, from: 'ground', to: 'trigger' }, // rounded into the arm and the blade
    },
    follows: { hinge: { by: ['pusher'], give: -1 }, spring: { by: ['trigger'], give: 1 } }, // the tooth rides the hook down; the pulled hook presses the pusher back
    states: {
      drawn: { spring: v.stroke + v.draw },
      cocked: { spring: v.stroke },
      pulled: { spring: v.stroke, hinge: pulled },
      fired: { hinge: pulled },
    },
    sequence: ['rest', 'drawn', 'cocked', 'pulled', 'fired', 'rest'],
    holds: { cocked: [['spring', 'trigger']] },
  })
  return m
}
