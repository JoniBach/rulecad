// @rulecad/rules, browsable: every published rule set, filtered as you type
const el = document.getElementById('demo'), q = el.querySelector('#q'), body = el.querySelector('#rules tbody'), count = el.querySelector('#count')
const sets = await (await fetch('../assets/data/rulesets.json')).json()
const rows = sets.flatMap((s) => Object.entries(s.rules).map(([name, r]) => ({ set: s.name, name, ...r })))
const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const link = (s) => /^https?:\/\//.test(s) ? `<a href="${esc(s)}">${esc(s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>` : esc(s)
function draw () {
  const t = q.value.toLowerCase(), hit = rows.filter((r) => !t || `${r.set}.${r.name} ${r.rule} ${r.source}`.toLowerCase().includes(t))
  body.innerHTML = hit.map((r) => `<tr><td><code>${esc(r.set)}.${esc(r.name)}</code></td><td>${typeof r.value === 'object' ? '…' : esc(r.value)} ${esc(r.unit)}</td><td>${esc(r.rule)}</td><td>${esc(r.kind)}</td><td>${link(r.source)}</td></tr>`).join('')
  count.textContent = `${hit.length} of ${rows.length} rules in ${sets.length} sets`
}
q.addEventListener('input', draw); draw()
