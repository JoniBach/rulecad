// @rulecad/printcheck, live: shapes that print well and shapes that don't, checked against a Bambu X1C's limits
import jscad from '@jscad/modeling'
import { check } from '@rulecad/printcheck'
import { stage, triangles, slider, findingsList } from '../view3d.mjs'

const { cuboid, polygon } = jscad.primitives, { translate } = jscad.transforms, { union } = jscad.booleans, { extrudeLinear } = jscad.extrusions
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), list = el.querySelector('.findings'), view = stage(el.querySelector('.stage'))
const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5 }
const box = (x0, x1, y0, y1, z0, z1) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], cuboid({ size: [x1 - x0, y1 - y0, z1 - z0] }))
const shapes = {
  // A wall leaning out at an angle from vertical: past 45 degrees it needs support
  lean: (a) => { const h = 20, d = h * Math.tan(a * Math.PI / 180); return translate([0, 5, 0], jscad.transforms.rotateX(Math.PI / 2, extrudeLinear({ height: 10 }, polygon({ points: [[0, 0], [8, 0], [8 + d, h], [d, h]] })))) },
  // Two pillars and a slab across them: a bridge, fine up to the printer's span
  bridge: (s) => union(box(-s / 2 - 6, -s / 2, -5, 5, 0, 12), box(s / 2, s / 2 + 6, -5, 5, 0, 12), box(-s / 2 - 6, s / 2 + 6, -5, 5, 12, 14)),
  // A shelf sticking straight out of a wall
  shelf: (s) => union(box(0, 4, -8, 8, 0, 24), box(4, 4 + s, -8, 8, 16, 18))
}
const setting = { lean: ['Angle', 0, 70, 1, 30, '°'], bridge: ['Span', 2, 20, 0.5, 4, 'mm'], shelf: ['Reach', 0.5, 10, 0.5, 1, 'mm'] }
const pick = el.querySelector('#shape')
let input, kind = 'lean'
function draw (value, refit) {
  const tris = triangles(jscad, shapes[kind](value))
  view.show([{ triangles: tris }], { refit }); findingsList(list, check(tris, printer))
}
function setup () {
  kind = pick.value; controls.querySelector('label')?.remove()
  const [label, min, max, step, value, unit] = setting[kind]
  input = slider(controls, { label, min, max, step, value, unit }, (x) => draw(x))
  draw(value, true)
}
pick.addEventListener('change', setup); setup()
