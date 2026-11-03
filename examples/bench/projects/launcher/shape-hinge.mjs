// Shape the in-line action's sear hinge: run once after changing the catch's layout or the arms (they set the print's
// height), and it writes objects/inline-hinge.mjs, which the design reads.
//   node examples/bench/projects/launcher/shape-hinge.mjs [--watch [port]] [--dry] [--evaluations n]
// The job: a curve from the frame to the sear that turns about the hinge's middle when the trigger is pulled, storing a
// little (to bring the sear back), with the least strain, and giving no more than a hair along the line the tooth pulls
// on under a far stronger spring's pull: a hinge that is also a strut
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as f from '@rulecad/flexures'
import { catchOf } from './objects/inline-layout.mjs'
import { shaped } from './objects/inline-spring.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(here, '../..'))
const { resolve } = await import('../../../../packages/cad/lib/rules.mjs')
const { locate } = await import('../../../../packages/cad/lib/design.mjs')
const d = locate('launcher/inline'), v = resolve(JSON.parse(fs.readFileSync(d.json, 'utf8'))).values
const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength }, { safety: v.safety })
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true }
const C = catchOf(v, shaped.params.width), t0 = Date.now(), watch = arg('watch'), dry = !!arg('dry'), evaluations = Number(arg('evaluations')) || v.hinge_evaluations
const { liveShape } = watch ? await import('../../../../packages/cad/lib/live-shape.mjs') : {}
const view = watch ? await liveShape({ port: watch === true ? 8090 : Number(watch), title: 'Shaping the sear\'s hinge', job: C.job }) : null
if (view) console.log(`watching at ${view.url}`)
const r = f.shapeCurve({ ...C.job, material, evaluations, starts: 30, smooth: 6, runs: 3, onRound: view && ((x) => { view.round(x); return view.stopped() }) })
const held = f.curveSolver({ ...r.params, width: shaped.params.width }, material).loaded(C.job.hold.force, C.job.hold.at)
const summary = `${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.evaluations} tries${r.stopped ? ' (stopped)' : ''}: ${(r.strain * 100).toFixed(2)}% strain at ${v.pull}°, ${r.energy.toFixed(2)} mJ, gives ${held.along.toFixed(3)} mm under ${v.hold_design} N${r.ok ? '' : `; ${r.why.join('; ')}`}`
console.log(summary)
if (view) view.close(summary, { hold: 10 * 60e3 })
const job = JSON.stringify({ ...C.job, E: material.E, limit: material.strainLimit })
const round = (x) => +x.toFixed(3), p = r.params
if (!dry && !r.stopped) fs.writeFileSync(path.join(here, 'objects/inline-hinge.mjs'), `// Written by ../shape-hinge.mjs: the sear hinge's shape for the job below (don't edit; shape it again)
// ${summary}
export const shaped = ${JSON.stringify({ job, params: { ...p, points: p.points.map((q) => q.map(round)), thickness: p.thickness.map(round), start: round(p.start), end: round(p.end) }, energy: round(r.energy), strain: +r.strain.toFixed(5), give: round(held.along) }, null, 2)}
`)
