// @rulecad/robots, live: drag the pen over a sheet and a two-link arm follows. ik() solves each position in closed
// form, and reach() shades what the arm can get to, in the package's own code.
import { planar2R, ik, fk, manipulability, reach, sheetCorners } from '@rulecad/robots'

const L1 = 150, L2 = 120, sheet = { size: 'a5', landscape: true, at: [0, 165, 0] }
const el = document.getElementById('demo'), svg = el.querySelector('#arm'), out = el.querySelector('#readout'), select = el.querySelector('#elbow')
const arm = planar2R(L1, L2), NS = 'http://www.w3.org/2000/svg'
const add = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e }
// The picture's y runs down the page and the arm's up: flipped here so the drawing reads like the arm from above
const X = (p) => p[0], Y = (p) => -p[1]
svg.setAttribute('viewBox', `${-L1 - L2 - 10} ${-L1 - L2 - 10} ${(L1 + L2) * 2 + 20} ${L1 + L2 + 50}`)
add('circle', { cx: 0, cy: 0, r: L1 + L2, fill: 'none', stroke: '#444', 'stroke-dasharray': '3 4' })
add('circle', { cx: 0, cy: 0, r: L1 - L2, fill: 'none', stroke: '#444', 'stroke-dasharray': '3 4' })
const shade = add('g', {}), corners = sheetCorners(sheet)
add('polygon', { points: corners.map((c) => `${X(c)},${Y(c)}`).join(' '), fill: 'none', stroke: '#fff', 'stroke-width': 1 })
const link1 = add('line', { stroke: '#ddd', 'stroke-width': 7, 'stroke-linecap': 'round', id: 'link1' })
const link2 = add('line', { stroke: '#999', 'stroke-width': 6, 'stroke-linecap': 'round', id: 'link2' })
const joints = [add('circle', { r: 6, fill: '#111', stroke: '#fff', 'stroke-width': 2 }), add('circle', { r: 5, fill: '#111', stroke: '#fff', 'stroke-width': 2 })]
const trail = add('polyline', { fill: 'none', stroke: '#7bd', 'stroke-width': 1.2 })
const pen = add('circle', { r: 7, fill: '#fff', style: 'cursor:grab', id: 'pen' })
add('line', { x1: -10, y1: 0, x2: 10, y2: 0, stroke: '#fff' }); add('line', { x1: 0, y1: -10, x2: 0, y2: 10, stroke: '#fff' })
let target = [40, 200], last = null, track = []

function shadeReach () {
  const elbow = select.value === 'either' ? undefined : select.value
  const step = 7, { samples, summary } = reach(arm, { sheet, step, ...(elbow ? { elbow } : {}) }), cellH = 148 / Math.ceil(148 / step)
  shade.replaceChildren(...samples.map((s) => { const r = document.createElementNS(NS, 'rect'); const v = s.reachable ? Math.min(1, s.margin / 40) : 0
    r.setAttribute('x', X(s.point) - step / 2); r.setAttribute('y', Y(s.point) - cellH / 2); r.setAttribute('width', step); r.setAttribute('height', cellH)
    r.setAttribute('fill', s.reachable ? `rgba(120,190,220,${0.06 + 0.2 * v})` : 'rgba(230,110,90,0.25)'); return r }))
  el.querySelector('#sheet-note').textContent = `A5 sheet, ${summary.reachable} of ${summary.total} samples in reach; the tightest is ${summary.margin.toFixed(1)} mm ${summary.margin >= 0 ? 'inside' : 'outside'} the arm's limit.`
}
function draw () {
  const elbow = select.value === 'either' ? undefined : select.value
  const r = ik(arm, target, { ...(elbow ? { elbow } : {}), ...(last ? { start: last } : {}) })
  const f = fk(arm, r.q), [a, b] = f.frames.map((x) => x.at), tip = f.position
  link1.setAttribute('x1', X(a)); link1.setAttribute('y1', Y(a)); link1.setAttribute('x2', X(b)); link1.setAttribute('y2', Y(b))
  link2.setAttribute('x1', X(b)); link2.setAttribute('y1', Y(b)); link2.setAttribute('x2', X(tip)); link2.setAttribute('y2', Y(tip))
  joints[0].setAttribute('cx', X(a)); joints[0].setAttribute('cy', Y(a)); joints[1].setAttribute('cx', X(b)); joints[1].setAttribute('cy', Y(b))
  pen.setAttribute('cx', X(target)); pen.setAttribute('cy', Y(target)); pen.setAttribute('fill', r.ok ? '#fff' : '#e66')
  if (r.ok) { last = r.q; track.push(`${X(tip)},${Y(tip)}`); if (track.length > 2000) track.shift(); trail.setAttribute('points', track.join(' ')) }
  out.textContent = r.ok
    ? `shoulder ${r.q[0].toFixed(2)}°, elbow ${r.q[1].toFixed(2)}° (${r.elbow}); manipulability ${manipulability(arm, r.q).toFixed(0)} mm²; pen at (${target[0].toFixed(1)}, ${target[1].toFixed(1)})`
    : `out of reach: ${r.reason}`
}
const toPoint = (e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return [p.x, -p.y] }
svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); target = toPoint(e); draw() })
svg.addEventListener('pointermove', (e) => { if (svg.hasPointerCapture(e.pointerId)) { target = toPoint(e); draw() } })
select.addEventListener('change', () => { shadeReach(); draw() })
shadeReach(); draw()
