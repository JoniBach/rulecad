// @rulecad/fit, live: a peg in a hole. closest() measures the smallest gap between the two meshes; the verdict
// compares it with an X1C's fit rules
import jscad from '@jscad/modeling'
import { closest } from '@rulecad/fit'
import { stage, triangles, slider } from '../view3d.mjs'

const { cuboid, cylinder } = jscad.primitives, { translate } = jscad.transforms, { subtract } = jscad.booleans
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), out = el.querySelector('#gap'), view = stage(el.querySelector('.stage'))
const peg = 5, depth = 8, rules = { fit: 0.2, hole_comp: 0.1 }
let clearance = 0.2, sink = 6
function draw (refit) {
  const hole = peg + clearance * 2
  const block = subtract(translate([0, 0, depth / 2], cuboid({ size: [16, 16, depth] })), translate([0, 0, depth], cylinder({ radius: hole / 2, height: depth * 2 - 2, segments: 48 })))
  const pin = translate([0, 0, depth + 6 - sink], cylinder({ radius: peg / 2, height: 12, segments: 48 }))
  const a = triangles(jscad, pin), b = triangles(jscad, block), gap = clearance < 0 ? 0 : closest(a, b, 3)
  view.show([{ triangles: b }, { triangles: a, ink: 0.55 }], { refit })
  const verdict = clearance < 0 ? 'overlap: a press fit at best, too tight to slide' : gap <= rules.fit / 2 ? 'a press fit: under half the fit rule' : gap <= rules.fit * 1.5 ? 'a slide fit: within the printer\'s fit rule (0.2 mm)' : 'loose: it will rattle'
  out.innerHTML = `closest gap <b>${clearance < 0 ? 'overlapping' : gap.toFixed(3) + ' mm'}</b><br>${verdict}`
}
slider(controls, { label: 'Clearance', min: -0.1, max: 0.6, step: 0.05, value: clearance }, (x) => { clearance = x; draw() })
slider(controls, { label: 'Pushed in', min: 0, max: 6, step: 0.5, value: sink }, (x) => { sink = x; draw() })
draw(true)
