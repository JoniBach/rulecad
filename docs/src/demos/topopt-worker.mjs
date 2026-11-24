// The MBB beam, optimised by @rulecad/topopt in a worker, so the page stays responsive while it runs. The half beam
// of Andreassen et al. (2011)'s 88-line code: its left edge is the line of symmetry (held across), its bottom right
// corner rests on a roller (held up), and a unit load pushes down on its top left corner. Each step posts the
// densities and the compliance; the end posts the totals. (A worker cannot use the page's import map, so the docs
// build points topopt's own import of @rulecad/fea at the copy beside it.)
import { optimise } from '../lib/topopt.mjs'
import { grid } from '../lib/fea.mjs'

onmessage = ({ data: { nx, ny, volume, filter } }) => {
  const g = grid({ nx, ny, h: 1 }), fixed = new Uint8Array(g.dofs), force = new Float64Array(g.dofs)
  for (let j = 0; j <= ny; j++) fixed[2 * g.node(0, j)] = 1
  fixed[2 * g.node(nx, 0) + 1] = 1
  force[2 * g.node(0, ny) + 1] = -1
  const spec = { grid: { nx, ny, h: 1 }, passive: new Int8Array(nx * ny), fixed, loads: [{ name: 'load', force, weight: 1, size: 1 }],
    material: { E: 1, nu: 0.3 }, thickness: 1, volume, filter, penal: 3, projection: false, steps: 1000 }
  const r = optimise(spec, { onStep: (s) => postMessage({ step: s.step, compliance: s.compliance, change: s.change, density: Float32Array.from(s.density) }) })
  postMessage({ done: true, steps: r.steps, compliance: r.history.at(-1), volume: r.volume, converged: r.converged, seconds: r.seconds })
}
