// Shape the slide's spring: the curve that brings the pull ring's slide home once the trigger holds the shuttle. Run it
// after changing the layout or the arms (it prints as tall as they do), and it writes objects/inline-slide.mjs.
//   node examples/bench/projects/launcher/shape-slide.mjs [--watch [port]] [--dry] [--evaluations n]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as f from '@rulecad/flexures'
import { slideOf } from './objects/inline-layout.mjs'
import { shaped } from './objects/inline-spring.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(here, '../..'))
const { resolve } = await import('../../../../packages/cad/lib/rules.mjs')
const { locate } = await import('../../../../packages/cad/lib/design.mjs')
const d = locate('launcher/inline'), v = resolve(JSON.parse(fs.readFileSync(d.json, 'utf8'))).values
const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength }, { safety: v.safety })
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true }
const S = slideOf(v, f, shaped.params.width), t0 = Date.now(), watch = arg('watch'), dry = !!arg('dry'), evaluations = Number(arg('evaluations')) || v.slide_evaluations
const { liveShape } = watch ? await import('../../../../packages/cad/lib/live-shape.mjs') : {}
const view = watch ? await liveShape({ port: watch === true ? 8090 : Number(watch), title: 'Shaping the slide\'s spring', job: S.job }) : null
if (view) console.log(`watching at ${view.url}`)
const r = f.shapeCurve({ ...S.job, material, evaluations, starts: 30, smooth: 4, runs: 3, onRound: view && ((x) => { view.round(x); return view.stopped() }) })
const summary = `${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.evaluations} tries${r.stopped ? ' (stopped)' : ''}: ${(r.strain * 100).toFixed(2)}% strain, ${r.energy.toFixed(2)} mJ${r.ok ? '' : `; ${r.why.join('; ')}`}`
console.log(summary)
if (view) view.close(summary, { hold: 10 * 60e3 })
const job = JSON.stringify({ ...S.job, E: material.E, limit: material.strainLimit })
const round = (x) => +x.toFixed(3), p = r.params
if (!dry && !r.stopped) fs.writeFileSync(path.join(here, 'objects/inline-slide.mjs'), `// Written by ../shape-slide.mjs: the slide's spring's shape for the job below (don't edit; shape it again)
// ${summary}
export const shaped = ${JSON.stringify({ job, params: { ...p, points: p.points.map((q) => q.map(round)), thickness: p.thickness.map(round), ...(p.start != null ? { start: round(p.start) } : {}), ...(p.end != null ? { end: round(p.end) } : {}) }, energy: round(r.energy), strain: +r.strain.toFixed(5), ok: r.ok }, null, 2)}
`)
