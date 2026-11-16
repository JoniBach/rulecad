// @rulecad/frames, live: a beam from a profile's rule set, a printed carrier in its top slot, and the bought
// slot nut made for its front slot where its maker makes one, with what the carrier says of itself. The same calls a
// design makes.
import jscad from '@jscad/modeling'
import { profileModel, beamModel, beam, carrierModel, carrier, nutFor, slotNut } from '@rulecad/frames'
import { stage, triangles, slider, findingsList } from '../view3d.mjs'

const { transform } = jscad.transforms
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), list = el.querySelector('.findings'), count = el.querySelector('#count'), view = stage(el.querySelector('.stage'))
const pick = el.querySelector('#profile')
let length = 200

// a beam lies along z from 0; shown along x, its top face up
const lay = (g) => transform([0, -1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], g)
// a part in a slot's frame (x along, y across, z out of the face) into the beam's, at a face place, dz along the beam
const inSlot = (place, dz, g) => transform([0, 0, 1, 0, place.along[0], place.along[1], 0, 0, place.normal[0], place.normal[1], 0, 0, place.at[0], place.at[1], dz, 1], g)

function draw (refit) {
  const p = profileModel(pick.value), b = beamModel(p, { length }), shown = [{ triangles: triangles(jscad, lay(beam(b))), ink: 0.55 }]
  // the largest hex nut a carrier takes in the top slot
  let m = null
  for (const thread of ['M5', 'M4', 'M3']) { try { m = carrierModel(p, { face: 'top', thread }); break } catch {} }
  if (m) shown.push({ triangles: triangles(jscad, lay(inSlot(p.faces.top[0], length / 2 - m.total / 2, carrier(m)))) })
  let nut = null
  try { nut = nutFor(p, 'front', m?.thread ?? 'M5'); shown.push({ triangles: triangles(jscad, lay(inSlot(p.faces.front[0], length / 4, slotNut(nut)))), ink: 0.8 }) } catch {}
  view.show(shown, { refit })
  findingsList(list, m ? m.findings : [])
  count.textContent = `${p.title}: ${p.sheet.area ?? '?'} mm² of metal, ${(b.mass).toFixed(0)} g for ${length} mm. ${m ? `In its top slot, ${m.title}.` : 'No carrier fits its top slot.'} ${nut ? `In its front slot, ${nut.title}.` : 'Its maker makes no nut for its front slot in the kit\'s sets: a carrier does instead.'}`
}
slider(controls, { label: 'Length', min: 100, max: 400, step: 10, value: length }, (x) => { length = x; draw(false) })
controls.append(list, count) // the findings after the controls
pick.addEventListener('change', () => draw(true))
draw(true)
