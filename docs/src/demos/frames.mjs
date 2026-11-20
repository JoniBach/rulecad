// @rulecad/frames, live: a beam from a profile's rule set, a printed carrier in its top slot, and the bought
// slot nut made for its front slot where its maker makes one, with what the carrier says of itself; the same profile's
// section drawn from its rules with its figures beside the sheet's; and a join's parts, a post's end joined to a rail.
// The same calls a design makes.
import jscad from '@jscad/modeling'
import { profileModel, beamModel, beam, carrierModel, carrier, nutFor, slotNut, outline, section, joinModel } from '@rulecad/frames'
import { screw, fixingModel } from '@rulecad/fixings'
import { stage, triangles, slider, findingsList } from '../view3d.mjs'

const { transform } = jscad.transforms
const el = document.getElementById('demo'), controls = el.querySelector('.controls'), list = el.querySelector('.findings'), count = el.querySelector('#count'), view = stage(el.querySelector('.stage'))
const pick = el.querySelector('#profile')
const joinEl = document.getElementById('join-part'), joinView = stage(joinEl.querySelector('.stage')), joinPick = document.getElementById('join'), joinList = document.getElementById('join-parts')
let length = 200

// a beam lies along z from 0; shown along x, its top face up
const lay = (g) => transform([0, -1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], g)
// a part in a slot's frame (x along, y across, z out of the face) into the beam's, at a face place, dz along the beam
const inSlot = (place, dz, g) => transform([0, 0, 1, 0, place.along[0], place.along[1], 0, 0, place.normal[0], place.normal[1], 0, 0, place.at[0], place.at[1], dz, 1], g)
const fig = (x, d = 1) => (x == null ? 'not given' : String(+Number(x).toFixed(d)))

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

// The section from the rules: its loops to scale (metal filled, hollows and slots open), the width and the top slot's
// opening dimensioned, and each section figure beside the sheet's
function drawSection () {
  const p = profileModel(pick.value), { loops } = outline(p), s = section(p), w = p.width, h = p.height, m = Math.max(w, h) * 0.18
  const path = loops.map((l) => `M${l.map(([x, y]) => `${fig(x, 3)} ${fig(-y, 3)}`).join(' L')} Z`).join(' ')
  const slot = p.slots[p.faces.top[0]?.slot]?.figures?.opening?.value, size = Math.max(w, h) / 22
  const svg = document.getElementById('section')
  svg.setAttribute('viewBox', `${-w / 2 - m} ${-h / 2 - m * 1.6} ${w + 2 * m} ${h + m * 3.2}`)
  svg.innerHTML = `<path d="${path}" fill="#c4c8cc" fill-rule="evenodd" stroke="#1a1a1a" stroke-width="${size / 12}"/>` +
    `<line x1="${-w / 2}" y1="${h / 2 + m * 0.7}" x2="${w / 2}" y2="${h / 2 + m * 0.7}" stroke="#1a1a1a" stroke-width="${size / 14}"/>` +
    `<text x="0" y="${h / 2 + m * 0.7 + size * 1.3}" font-size="${size}" text-anchor="middle" fill="#1a1a1a">${fig(w)} wide, ${fig(h)} high</text>` +
    (slot ? `<line x1="${-slot / 2}" y1="${-h / 2 - m * 0.5}" x2="${slot / 2}" y2="${-h / 2 - m * 0.5}" stroke="#1a1a1a" stroke-width="${size / 14}"/><text x="0" y="${-h / 2 - m * 0.5 - size * 0.4}" font-size="${size}" text-anchor="middle" fill="#1a1a1a">${p.faces.top[0].slot}: opening ${fig(slot)}</text>` : '')
  const rows = [['Area, mm²', 'area', 'area', 1], ['Second moment across, mm⁴', 'inertiaX', 'inertiaX', 0], ['Second moment up, mm⁴', 'inertiaY', 'inertiaY', 0], ['Torsion constant, mm⁴', 'torsion', 'torsion', 0], ['Mass per metre, kg', 'massPerMetre', 'massPerMetre', 3]]
  document.querySelector('#figures tbody').innerHTML = rows.map(([label, sheet, made, d]) => {
    const a = p.sheet[sheet], b = s[made], off = a ? (b - a) / a * 100 : null
    return `<tr><td>${label}</td><td>${fig(a, d)}</td><td>${fig(b, d)}</td><td>${off == null ? '' : `${off >= 0 ? '+' : ''}${off.toFixed(1)}%${Math.abs(off) > 5 ? ' (warns)' : ''}`}</td></tr>`
  }).join('')
}

// A post's end joined to the middle of a rail's back face: the rail along z, the post out along +x from that face,
// both drawn with the join's operations cut in, and its screw where it goes
function drawJoin (refit) {
  const p = profileModel(pick.value), kind = joinPick.value, at = 80
  // a blind or end-tap join screws into one bore; with several, the middle one, as cad's generators choose
  const bore = Math.max(0, p.bores.findIndex((x) => Math.hypot(x.at[0], x.at[1]) < 1e-6)), end = p.bores.length > 1 ? `a.${bore + 1}` : 'a'
  let j
  try { j = joinModel(kind, { beam: beamModel(p, { length: 100 }), end }, { beam: beamModel(p, { length: 160 }), address: `back@${at}` }) } catch (e) {
    joinView.show([]); findingsList(joinList, [{ level: 'fail', text: e.message }]); return
  }
  const rail = beam(beamModel(p, { length: 160, ops: j.b.ops })), post = beam(beamModel(p, { length: 100, ops: j.a.ops })), half = p.width / 2
  // the post's own x, y, z into the rail's frame: x to -z, y stays up, z out of the rail's back face (+x)
  const placed = transform([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, half, 0, at, 1], post)
  const fx = fixingModel(j.screws[0].thread), lip = p.slots[p.faces.back[0].slot]?.figures?.lip_thickness?.value ?? 0
  // the screw's seat: under the back slot's lips (blind), or on the rail's front face (end-tap); its shank runs +x,
  // two diameters into the post's tapped end
  const seat = kind === 'blind' ? half - lip : -half, long = half - seat + 2 * fx.major
  const bolt = transform([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, seat, 0, at, 1], screw(fx, { length: long, head: j.screws[0].head, anyLength: true }))
  joinView.show([{ triangles: triangles(jscad, lay(rail)), ink: 0.55 }, { triangles: triangles(jscad, lay(placed)), ink: 0.55 }, { triangles: triangles(jscad, lay(bolt)) }], { refit })
  const ops = (side, o) => o.map((x) => `${x.op} ${x.thread ?? ''}${x.depth ? ` x ${x.depth}` : ''} at ${x.at}`.replace(/\s+/g, ' ')).join('; ') || 'nothing'
  const k = j.stiffness
  findingsList(joinList, [
    { level: 'info', text: `The post (a): ${ops('a', j.a.ops)}` },
    { level: 'info', text: `The rail (b): ${ops('b', j.b.ops)}` },
    { level: 'info', text: `Held by ${j.screws.map((x) => `1 × ${x.screw}`).join(', ')}; cad check chooses its sold length (${Math.round(long)} mm drawn)` },
    { level: 'warn', text: `Taken as ${fig(k.bending / 1e6, 2)} N·m/mrad in bending and ${fig(k.twist / 1e6, 2)} in twist: ${k.kind === 'estimate' ? 'an estimate, until the joint rig measures it' : k.kind}` },
    ...j.findings
  ])
}

slider(controls, { label: 'Length', min: 100, max: 400, step: 10, value: length }, (x) => { length = x; draw(false) })
controls.append(list, count) // the findings after the controls
pick.addEventListener('change', () => { draw(true); drawSection(); drawJoin(true) })
joinPick.addEventListener('change', () => drawJoin(true))
draw(true)
drawSection()
drawJoin(true)
