// The force inverter, the usual first test of compliant-mechanism synthesis (Sigmund 1997): a 40 × 20 mm block held
// at its left corners, pushed to the right at the middle of its left edge against a spring; the output, the middle of
// its right edge, should move to the left, against its own spring. Optimises it, reports the travel, and draws it.
//
//   node packages/topopt/reference/inverter.mjs [cell=0.5] [volume=0.3] [spring=0.1] [out=inverter.svg]
import fs from 'node:fs';
import { discretise, optimise, outlines } from '@rulecad/topopt';

const [cell = 0.5, volume = 0.3, k = 0.1] = process.argv.slice(2, 5).map(Number), out = process.argv[5] || 'inverter.svg';
const spec = discretise({
  space: { at: [20, 10], size: [40, 20] }, cell, volume, filter: cell * 3, material: { E: 2680, nu: 0.36 }, thickness: 4,
  supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
  loads: [{ at: [0.5, 10], size: [1, 2], force: [10, 0] }], input_spring: k * 2680 / 1000,
  output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: k * 2680 / 1000 }, steps: 400,
});
const r = optimise(spec, { onStep: (s) => { if (s.step % 50 === 0) console.log(`step ${s.step}: output ${s.travel.toFixed(4)} mm, change ${s.change.toFixed(3)}, sharpness ${s.beta}`); } });
console.log(`${r.steps} steps${r.converged ? '' : ', not settled'}: the output moves ${r.mechanism.travel.toFixed(3)} mm its way for ${r.mechanism.input.toFixed(3)} mm of push (advantage ${r.mechanism.advantage.toFixed(3)}), ${(r.volume * 100).toFixed(1)}% of the space, ${r.seconds.toFixed(0)} s`);
const loops = outlines(spec.grid, r.density, spec.origin), S = 12, W = 40 * S, H = 20 * S, pad = 30;
const path = (l) => `M${l.map(([x, y]) => `${(x * S).toFixed(1)},${((20 - y) * S).toFixed(1)}`).join('L')}Z`;
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2 * pad}" height="${H + 2 * pad + 50}" font-family="sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
<g transform="translate(${pad},${pad + 20})">
  <text y="-8" font-size="14">The force inverter: pushed right at the left, the right end moves left (${r.mechanism.travel.toFixed(2)} mm for ${r.mechanism.input.toFixed(2)} mm of push)</text>
  <rect width="${W}" height="${H}" fill="none" stroke="#999" stroke-dasharray="4 3"/>
  <g fill="#bbb">${Array.from(r.density, (d, e) => (d >= 0.3 ? `<rect x="${((e % spec.grid.nx) * cell * S).toFixed(1)}" y="${((20 - (Math.floor(e / spec.grid.nx) + 1) * cell) * S).toFixed(1)}" width="${(cell * S).toFixed(1)}" height="${(cell * S).toFixed(1)}"/>` : '')).join('')}</g>
  <path d="${loops.map(path).join('')}" fill="#333" fill-rule="evenodd"/>
  <path d="M-20,${H / 2}L-4,${H / 2}" stroke="#d22" stroke-width="3" marker-end="url(#a)"/>
  <path d="M${W + 20},${H / 2}L${W + 4},${H / 2}" stroke="#28d" stroke-width="3" marker-end="url(#b)"/>
  <defs><marker id="a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#d22"/></marker><marker id="b" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#28d"/></marker></defs>
  <text y="${H + 18}" font-size="12">red: the push; blue: how the output moves; grey: cells at least 30% full (the hinges, thinner than the outline keeps). ${(r.volume * 100).toFixed(0)}% of the space, ${spec.grid.nx} × ${spec.grid.ny} cells of ${cell} mm, ${r.steps} steps</text>
</g>
</svg>
`);
console.log(`drawn: ${out}`);
