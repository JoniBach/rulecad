// @rulecad/fixings, live: a bolt and its nut with their threads drawn for printing, from the published rule sets, and
// what threadModel says of the thread: its clearance, how its flanks print, how far they overlap. The same calls a
// design makes.
import jscad from '@jscad/modeling'
import { screw, nut, fixingModel } from '@rulecad/fixings'
import { stage, triangles, slider, findingsList } from '../view3d.mjs'

const { translate, rotateX } = jscad.transforms
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), list = el.querySelector('.findings'), count = el.querySelector('#count'), view = stage(el.querySelector('.stage'))
const pick = el.querySelector('#thread'), flanks = el.querySelector('#flanks')
let length = null, input = null

function draw (refit) {
  const fx = fixingModel(pick.value), head = fx.made.heads.includes('hex') ? 'hex' : 'cap', o = { display: 'thread', flanks: flanks.value }
  const bolt = screw(fx, { ...o, length, head, anyLength: true }), itsNut = nut(fx, o), t = bolt.model.threaded
  // the bolt as it prints, standing on its head, and the nut beside it
  const standing = translate([0, 0, bolt.model.top], rotateX(Math.PI, bolt)), beside = translate([bolt.model.headDiameter / 2 + itsNut.model.across / 2 + 4, 0, 0], itsNut)
  const shown = [{ triangles: triangles(jscad, standing) }, { triangles: triangles(jscad, beside), ink: 0.7 }]
  view.show(shown, { refit })
  findingsList(list, t.findings)
  count.textContent = `${bolt.model.name} and ${itsNut.model.name}: ${shown[0].triangles.length + shown[1].triangles.length} triangles. As light solids for an assembly they are under 200.`
}
function setup () {
  const fx = fixingModel(pick.value), sold = fx.figures.lengths.value.filter((x) => x >= 2.5 * fx.major && x <= 5 * fx.major)
  length = sold[Math.floor(sold.length / 2)] ?? 3 * fx.major
  input?.closest('label').remove()
  input = slider(controls, { label: 'Length', min: Math.ceil(2 * fx.major), max: Math.ceil(6 * fx.major), step: 1, value: Math.round(length) }, (x) => { length = x; draw(false) })
  length = Math.round(length)
  controls.append(list, count) // the findings after the controls
  draw(true)
}
pick.addEventListener('change', setup)
flanks.addEventListener('change', () => draw(false))
setup()
