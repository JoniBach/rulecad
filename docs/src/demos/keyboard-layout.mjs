// @rulecad/keyboard-layout, live: a layout file drawn key by key as you edit it, and a keyboard-layout-editor.com
// layout brought in with fromKLE()
import { keys, width, depth, fromKLE } from '@rulecad/keyboard-layout'

const el = document.getElementById('demo'), src = el.querySelector('#layout'), svg = el.querySelector('#keys'), msg = el.querySelector('#msg')
function draw () {
  try {
    const layout = JSON.parse(src.value), list = keys(layout), w = width(layout), d = depth(layout), u = 40, pad = 4
    svg.setAttribute('viewBox', `${-w * u / 2 - pad} ${-pad} ${w * u + pad * 2} ${d * u + pad * 2}`)
    svg.innerHTML = list.map((k) => `<g><rect x="${(k.x - k.u / 2) * u + 2}" y="${(k.y - 0.5) * u + 2}" width="${k.u * u - 4}" height="${u - 4}" rx="5" fill="#111" stroke="${k.homing ? '#fff' : '#555'}"/><text x="${k.x * u}" y="${k.y * u + 4}" text-anchor="middle" font-size="11" fill="#fff" font-family="-apple-system, sans-serif">${String(k.legend ?? k.label ?? '').replace(/</g, '&lt;')}</text></g>`).join('')
    msg.textContent = `${list.length} keys, ${w} × ${d} key units`
  } catch (e) { msg.textContent = e.message }
}
src.addEventListener('input', draw); draw()
el.querySelector('#kle-go').addEventListener('click', () => {
  try { const r = fromKLE(el.querySelector('#kle').value); src.value = JSON.stringify(r.layout ?? r, null, 1); draw(); if (r.notes?.length) msg.textContent += ` · ${r.notes.join('; ')}` } catch (e) { msg.textContent = e.message }
})
