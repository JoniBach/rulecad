// @rulecad/versions, live: two versions of a part's variables, and the release they call for
import { compare, satisfies, bump } from '@rulecad/versions'
import { resolve } from '@rulecad/variables'

const el = document.getElementById('demo'), a = el.querySelector('#before'), b = el.querySelector('#after'), out = el.querySelector('#verdict')
function run () {
  try {
    const snap = (t) => { const object = JSON.parse(t); return { object, entries: resolve(object).entries, js: '' } }
    const r = compare(snap(a.value), snap(b.value))
    out.innerHTML = `<b>${r.kind}</b>: 1.4.2 → ${bump('1.4.2', r.kind)}<br>${r.reasons.map((x) => `${x.kind}: ${x.text.replace(/</g, '&lt;')}`).join('<br>') || 'no change'}`
  } catch (e) { out.textContent = e.message }
}
a.addEventListener('input', run); b.addEventListener('input', run); run()
const v = el.querySelector('#v'), range = el.querySelector('#range'), ok = el.querySelector('#ok')
const test = () => { try { ok.textContent = satisfies(v.value, range.value) ? `${v.value} satisfies ${range.value}: it fits` : `${v.value} does not satisfy ${range.value}` } catch (e) { ok.textContent = e.message } }
v.addEventListener('input', test); range.addEventListener('input', test); test()
