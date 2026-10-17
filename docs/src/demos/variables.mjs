// @rulecad/variables, live: a design's variables resolved against a rule set as you type, and the lint that keeps raw
// numbers out of the shape's code.
import { resolve, lint, fmt } from '@rulecad/variables'

const el = document.getElementById('demo'), src = el.querySelector('#object'), table = el.querySelector('#values'), msg = el.querySelector('#msg')
const x1c = await (await fetch('../assets/data/rules/x1c.json')).json()

function run () {
  try {
    const object = JSON.parse(src.value)
    const { entries } = resolve(object, { sets: { x1c } })
    const own = entries.filter((e) => !e.name.includes('.')), used = entries.filter((e) => e.name.includes('.') && e.used)
    table.innerHTML = `<thead><tr><th>Variable</th><th>Value</th><th>From</th><th>Rule</th></tr></thead><tbody>${[...own, ...used].map((e) =>
      `<tr><td><code>${e.name}</code></td><td>${fmt(e.value)} ${e.unit || ''}</td><td>${e.expr ? `<code>${e.expr}</code>` : ''}</td><td>${(e.rule || '').replace(/</g, '&lt;')}</td></tr>`).join('')}</tbody>`
    msg.textContent = `${own.length} variables, ${used.length} rules they rest on`
  } catch (e) { msg.textContent = e.message }
}
src.addEventListener('input', run); run()

const code = el.querySelector('#code'), flagged = el.querySelector('#lint')
const check = () => { const found = lint(code.value); flagged.textContent = found.length ? found.map((f) => `line ${f.line}: ${f.text} should be a variable`).join('\n') : 'No raw numbers: every measurement comes from a variable.' }
code.addEventListener('input', check); check()
