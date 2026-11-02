// Shape the in-line action's spring: run once after changing the layout or the rules, and it writes
// objects/inline-spring.mjs, which the design reads (shaping takes a minute or two, too long for every build).
//   node examples/bench/projects/launcher/shape-inline.mjs [--watch [port]] [--dry] [--evaluations n]
// --watch: a live view of the search at http://127.0.0.1:8090/ (each round's shapes, the best so far, a stop button);
// --dry: shape it, but don't write it; --evaluations: try this many shapes, not the design's number
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as f from '@rulecad/flexures'
import { layout } from './objects/inline-layout.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(here, '../..')) // the workspace, before cad finds it
const { resolve } = await import('../../../../packages/cad/lib/rules.mjs')
const { locate } = await import('../../../../packages/cad/lib/design.mjs')
const d = locate('launcher/inline'), v = resolve(JSON.parse(fs.readFileSync(d.json, 'utf8'))).values
const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength }, { safety: v.safety })
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true }
const L = layout(v, f), t0 = Date.now(), watch = arg('watch'), dry = !!arg('dry'), evaluations = Number(arg('evaluations')) || v.evaluations
const { liveShape } = watch ? await import('../../../../packages/cad/lib/live-shape.mjs') : {}
const view = watch ? await liveShape({ port: watch === true ? 8090 : Number(watch), title: 'Shaping the in-line action\'s arms', job: L.job }) : null
if (view) console.log(`watching at ${view.url}`)
const r = f.shapeCurve({ ...L.job, material, evaluations, starts: 30, smooth: 4, runs: 2, onRound: view && ((x) => { view.round(x); return view.stopped() }) })
const params = r.params
const summary = `${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.evaluations} tries${r.stopped ? ' (stopped)' : ''}: ${(r.strain * 100).toFixed(2)}% strain, ${r.energy.toFixed(1)} mJ printed ${r.width.toFixed(1)} mm tall`
if (view) { view.close(summary, { hold: 10 * 60e3 }); console.log('the live view shows the result for ten more minutes (Ctrl-C to stop it)') }
if (dry || r.stopped) { console.log(`${summary}${dry ? ' (dry: not written)' : ' (stopped: not written)'}`); if (!view) process.exit(0) } else
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.evaluations} tries: stores ${r.energy.toFixed(1)} mJ printed ${r.width.toFixed(1)} mm tall, at ${(r.strain * 100).toFixed(2)}% strain${r.ok ? '' : `; ${r.why.join('; ')}`}`)
const job = JSON.stringify({ ...L.job, E: material.E, limit: material.strainLimit })
if (!dry && !r.stopped) fs.writeFileSync(path.join(here, 'objects/inline-spring.mjs'), `// Written by ../shape-inline.mjs: the spring's shape for the job below (don't edit; shape it again)
// It stores ${r.energy.toFixed(1)} mJ printed ${r.width.toFixed(1)} mm tall, at the stroke, its peak strain ${(r.strain * 100).toFixed(2)}% by the beam solver.
export const shaped = ${JSON.stringify({ job, params: { ...params, points: params.points.map((p) => p.map((x) => +x.toFixed(3))), thickness: params.thickness.map((x) => +x.toFixed(3)), width: +params.width.toFixed(2), ...(params.start != null ? { start: +params.start.toFixed(2) } : {}) }, energy: +r.energy.toFixed(2), strain: +r.strain.toFixed(5) }, null, 2)}
`)
