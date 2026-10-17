// @rulecad/model-link, live: a model made in this page, packed into a link (nothing uploaded), opened in the viewer,
// and written as STL or 3MF in the browser
import jscad from '@jscad/modeling'
import { slab } from '@rulecad/shapes'
import { fromParts, encode, decode, stl, threemf } from '@rulecad/model-link'
import { stage, triangles, slider } from '../view3d.mjs'

const { cylinder } = jscad.primitives, { translate } = jscad.transforms, { subtract } = jscad.booleans
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), info = el.querySelector('#info'), view = stage(el.querySelector('.stage'))
let size = 60, holes = 3, model
async function draw (refit) {
  const tag = subtract(slab({ width: size, height: size / 2, depth: 4, round: 4, bottom: 0.4, top: 1 }),
    ...Array.from({ length: holes }, (_, i) => translate([(i - (holes - 1) / 2) * (size / (holes + 1)), 0, 2], cylinder({ radius: 2.5, height: 8, segments: 32 }))))
  const tris = triangles(jscad, tag)
  view.show([{ triangles: tris }], { refit })
  model = { title: 'Tag', version: '1.0.0', ...fromParts([{ name: 'tag', triangles: tris }]) }
  const token = await encode(model), back = await decode(token)
  info.innerHTML = `${tris.length} triangles → a link of <b>${(token.length / 1024).toFixed(1)} KB</b>; decoded again: ${back.t.length / 3} triangles`
  el.querySelector('#open').href = `../../#m=${token}`
}
slider(controls, { label: 'Width', min: 30, max: 100, step: 1, value: size }, (x) => { size = x; draw() })
slider(controls, { label: 'Holes', min: 0, max: 6, step: 1, value: holes, unit: '' }, (x) => { holes = x; draw() })
const save = (data, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }
el.querySelector('#stl').addEventListener('click', () => save(stl(model), 'tag.stl', 'model/stl'))
el.querySelector('#mf').addEventListener('click', async () => save(await threemf(model), 'tag.3mf', 'model/3mf'))
controls.append(controls.querySelector('.row'))
draw(true)
