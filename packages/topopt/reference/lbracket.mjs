// The L-bracket, the usual test of stress-limited topology optimisation: a 100 × 100 mm square less its top-right
// 60 × 60, held along the top of its upright arm and pushed down at the end of its lower one. Optimises it twice, the
// stiffest at 40% of the space and the lightest under a stress limit, re-analyses each as it would be made (its
// smoothed outline, on cells half the size), and draws both.
//
//   node packages/topopt/reference/lbracket.mjs [cell=1] [limit=25] [out=lbracket.svg]
//
// Each run on 1 mm cells takes a few minutes for the stiffest and about a quarter of an hour for the lightest.
import fs from 'node:fs';
import { discretise, optimise, outlines, inside } from '@rulecad/topopt';
import { grid, analyse } from '@rulecad/fea';

const [cell = 1, limit = 25] = process.argv.slice(2, 4).map(Number), out = process.argv[4] || 'lbracket.svg';
const problem = (h) => ({
  space: { points: [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]] },
  keep: [{ at: [97.5, 35], size: [5, 10] }],
  supports: [{ at: [20, 100], size: [40, 0.1] }],
  loads: [{ at: [100, 35], size: [0.1, 10], force: [0, -100] }],
  material: { E: 2680, nu: 0.36 }, thickness: 2, cell: h, filter: h * 2.25,
});

// The part as it would be made: its smoothed outline, filled on cells half the size and analysed. Within a cell of
// the support and the load, the cells as optimised (smoothing pulls the outline off the grid's edge).
function asMade(spec, density) {
  const loops = outlines(spec.grid, density, spec.origin), h = cell / 2, fine = discretise({ ...problem(h), volume: 0.5 }), g = grid(fine.grid), nx = fine.grid.nx;
  const filled = new Float64Array(g.cells), n = 3;
  for (let e = 0; e < g.cells; e++) {
    if (fine.passive[e] === -2) continue;
    const i = e % nx, j = Math.floor(e / nx), x = fine.origin[0] + (i + 0.5) * h, y = fine.origin[1] + (j + 0.5) * h;
    if (y > 100 - cell || x > 100 - cell) { filled[e] = density[Math.floor((y - spec.origin[1]) / cell) * spec.grid.nx + Math.floor((x - spec.origin[0]) / cell)] >= 0.5 ? 1 : 0; continue; }
    let c = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const pt = [fine.origin[0] + (i + (a + 0.5) / n) * h, fine.origin[1] + (j + (b + 0.5) / n) * h];
      if (loops.filter((l) => inside({ points: l }, pt)).length % 2) c++;
    }
    filled[e] = c / (n * n);
  }
  const r = analyse({ grid: g, density: filled, material: fine.material, thickness: fine.thickness, fixed: fine.fixed, loads: fine.loads.map((l) => l.force), penal: 1 });
  const touched = new Uint8Array(g.nodes);
  for (let q = 0; q < g.dofs; q++) if (fine.fixed[q] || fine.loads[0].force[q]) touched[q >> 1] = 1;
  let peak = 0, at = null;
  for (let e = 0; e < g.cells; e++) {
    if (filled[e] < 0.5 || [0, 1, 2, 3].some((k) => touched[g.edof[e * 8 + 2 * k] / 2])) continue;
    if (r.stress[0][e] > peak) { peak = r.stress[0][e]; at = [fine.origin[0] + ((e % nx) + 0.5) * h, fine.origin[1] + (Math.floor(e / nx) + 0.5) * h]; }
  }
  return { loops, peak, at, compliance: r.compliance[0] };
}

const runs = [
  { title: 'Stiffest, 40% of the space', spec: discretise({ ...problem(cell), volume: 0.4 }) },
  { title: `Lightest under ${limit} MPa`, spec: discretise({ ...problem(cell), stress: limit }) },
].map(({ title, spec }) => {
  const o = optimise(spec, { method: 'mg' }), made = asMade(spec, o.density);
  const line = `${title}: ${(o.volume * 100).toFixed(1)}% of the space, compliance ${made.compliance.toFixed(0)} N·mm; peak stress ${o.stress ? `${o.stress.peak.toFixed(1)} MPa on its cells, ` : ''}${made.peak.toFixed(1)} MPa as made, at (${made.at.map((v) => v.toFixed(1)).join(', ')}); ${o.steps} steps${o.converged ? '' : ', not settled'}`;
  console.log(line);
  return { title, made, line };
});

// Both, side by side: outlines, the space dashed, the peak as made marked
const S = 3, W = 100 * S, pad = 30, path = (l) => `M${l.map(([x, y]) => `${(x * S).toFixed(1)},${((100 - y) * S).toFixed(1)}`).join('L')}Z`;
const panel = ({ title, made }, k) => `<g transform="translate(${pad + k * (W + pad)},${pad + 20})">
  <text y="-10" font-size="13">${title}</text>
  <path d="M0,0L${40 * S},0L${40 * S},${60 * S}L${W},${60 * S}L${W},${W}L0,${W}Z" fill="none" stroke="#999" stroke-dasharray="4 3"/>
  <path d="${made.loops.map(path).join('')}" fill="#333" fill-rule="evenodd"/>
  <circle cx="${made.at[0] * S}" cy="${(100 - made.at[1]) * S}" r="5" fill="none" stroke="#d22" stroke-width="2"/>
  <text y="${W + 18}" font-size="12">peak ${made.peak.toFixed(1)} MPa as made (circled)</text>
</g>`;
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * W + 3 * pad}" height="${W + 2 * pad + 40}" font-family="sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
${runs.map(panel).join('\n')}
</svg>
`);
console.log(`drawn: ${out}`);
