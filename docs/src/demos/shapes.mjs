// @rulecad/shapes, live: a macropad's case as a shell, its lid (printed face down, shown lifted and turned over) and a
// dovetail rail, remade as the sliders move. The same calls a design makes. The case's screw holes are named by their
// thread, so they come from @rulecad/fixings, which reads the M2 rule set and the printer's and draws through shapes.
import jscad from '@jscad/modeling'
import { shell, lid, dovetail, gabled } from '@rulecad/shapes'
import { countersink } from '@rulecad/fixings'
import { fromParts, encode } from '@rulecad/model-link'
import { stage, triangles, slider } from '../view3d.mjs'

const { translate, rotateX } = jscad.transforms, { extrudeLinear } = jscad.extrusions, { subtract } = jscad.booleans
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), view = stage(el.querySelector('.stage'))
const v = { width: 66, height: 66, depth: 14, round: 4, edge: 1.2, wall: 1.68 } // a case for a 3 × 3 macropad (19.05 mm keys)
const fit = 0.2, line = 0.42, lift = 14, floor = 1.6, screw = 'M2', inset = 4 // four M2 countersunk screws through the floor, a little in from each inside corner

function make () {
  const o = { width: v.width, height: v.height, round: v.round }
  const corner = [v.width / 2 - v.wall - inset, v.height / 2 - v.wall - inset].map((c) => Math.max(c, 0))
  const screws = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => countersink(screw, { length: floor, thickness: floor, at: [sx * corner[0], sy * corner[1], 0], into: '+z' })) // heads flush with the bottom
  const body = subtract(
    shell({ ...o, depth: v.depth, wall: v.wall, floor, bottom: 0.4 }),
    translate([0, -v.height / 2, 0], gabled([-5, 5], [-v.wall - 1, v.wall + 1], [3, 8])), // an opening, gabled so it prints
    ...screws)
  const front = lid({ ...o, thick: 2.4, edge: Math.min(v.edge, 2.3), wall: v.wall, fit, lip: 2, ring: line * 3 })
  const rail = translate([0, v.height / 2, 0], extrudeLinear({ height: v.depth }, dovetail({ base: 6, height: 1.6 })))
  return { body, lid: translate([0, 0, v.depth + lift], rotateX(Math.PI, front)), rail }
}

let parts
function draw (refit) {
  parts = make()
  view.show([{ triangles: triangles(jscad, parts.body) }, { triangles: triangles(jscad, parts.lid), ink: 0.95 }, { triangles: triangles(jscad, parts.rail), ink: 0.6 }], { refit })
}
const rows = [
  ['width', 'Width', 40, 100, 1], ['height', 'Height', 16, 80, 1], ['depth', 'Depth', 10, 40, 1],
  ['round', 'Corners', 0, 12, 0.5], ['edge', 'Front edge', 0, 2.3, 0.1], ['wall', 'Wall', 0.84, 4.2, 0.42]
]
for (const [k, label, min, max, step] of rows) slider(controls, { label, min, max, step, value: v[k] }, (x) => { v[k] = x; draw(k !== 'round' && k !== 'edge' && k !== 'wall') })
controls.append(controls.querySelector('.row')) // the button after the sliders
draw(true)

el.querySelector('#open').addEventListener('click', async () => {
  const lidFlat = translate([v.width + 10, 0, 0], lid({ width: v.width, height: v.height, round: v.round, thick: 2.4, edge: Math.min(v.edge, 2.3), wall: v.wall, fit, lip: 2, ring: line * 3 }))
  const model = { title: 'Macropad case from @rulecad/shapes', version: '0.2.0', ...fromParts([{ name: 'shell', triangles: triangles(jscad, [parts.body, parts.rail]) }, { name: 'lid', triangles: triangles(jscad, lidFlat) }]) }
  window.open(`../../#m=${await encode(model)}`, '_blank', 'noopener')
})
