// The frame solver against closed-form answers, the voxel solver, and its own refusals. Run from test.mjs (so the
// repository's test command picks it up). FRAME_REPORT=1 prints each case's error as a table.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { frame, statics, buckling, modes, subdivide, elementMatrices, sizing } from '@rulecad/fea/frame';
import { grid, analyse } from '@rulecad/fea';

// Aluminium, and a 20 × 30 mm solid bar: 20 along local y, 30 along local z
const alu = { E: 70000, nu: 0.33, density: 2.7 }, G = alu.E / (2 * (1 + alu.nu));
const bar = { A: 600, Iy: (20 * 30 ** 3) / 12, Iz: (30 * 20 ** 3) / 12, J: 0.196 * 30 * 20 ** 3, Asy: 500, Asz: 500, cy: 10, cz: 15 }; // (J = β × long side × short side³ with β = 0.196 for a 3:2 rectangle, Timoshenko and Goodier, Theory of Elasticity, torsion of a rectangular bar; shear areas 5/6 A)
const report = [];
// got against want, within tol (a share): noted for the report, and asserted
const close = (name, got, want, tol = 0.01) => {
  const err = want === 0 ? Math.abs(got) : Math.abs(got / want - 1);
  report.push({ name, got, want, err });
  assert.ok(err <= tol, `${name}: ${got} against ${want}, ${(100 * err).toFixed(3)}% out (allowed ${100 * tol}%)`);
};
after(() => { if (process.env.FRAME_REPORT) console.log(report.map((r) => `${r.name} | ${Number(r.got.toPrecision(6))} | ${Number(r.want.toPrecision(6))} | ${r.err < 5e-7 ? r.err.toExponential(1) : (100 * r.err).toFixed(3) + '%'}`).join('\n')); });

const cantilever = (o = {}) => ({ nodes: { a: [0, 0, 0], b: [o.L ?? 500, 0, 0] }, elements: [{ id: 'beam', a: 'a', b: 'b', section: o.section ?? bar, material: o.material ?? alu, ...(o.element || {}) }], supports: { a: 'fixed' }, ...(o.model || {}) });

test('frame: a cantilever with an end load, with and without shear deformation', () => {
  // Tip deflection P L³ / 3 E I + P L / G As and tip rotation P L² / 2 E I (Roark's Formulas for Stress and Strain,
  // 7th ed., table 8.1, with the shear term of Timoshenko's beam: Cook et al. 2002). The shear
  // term matters on a stout beam, so two lengths: slender (500 mm) and stout (60 mm, twice its depth).
  for (const L of [500, 60]) {
    const P = 100, model = cantilever({ L, model: { loads: [{ node: 'b', force: [0, 0, -P] }] } });
    const bend = (P * L ** 3) / (3 * alu.E * bar.Iy), sheared = (P * L) / (G * bar.Asz), turn = (P * L ** 2) / (2 * alu.E * bar.Iy);
    const stiff = statics(model, { shear: false }), soft = statics(model);
    close(`cantilever ${L} mm, no shear: tip deflection`, -stiff.displacements.b[2], bend, 1e-9);
    close(`cantilever ${L} mm, no shear: tip rotation`, stiff.displacements.b[4], turn, 1e-9);
    close(`cantilever ${L} mm, with shear: tip deflection`, -soft.displacements.b[2], bend + sheared, 1e-9);
    close(`cantilever ${L} mm, with shear: tip rotation`, soft.displacements.b[4], turn, 1e-9);
    // the root: a reaction of P up and a moment of P L, and the bending stress there M c / I
    close(`cantilever ${L} mm: root reaction`, soft.reactions.a[2], P, 1e-9);
    close(`cantilever ${L} mm: root moment`, Math.abs(soft.reactions.a[4]), P * L, 1e-9);
    close(`cantilever ${L} mm: peak bending stress`, soft.elements[0].stress.peak, (P * L * 15) / bar.Iy, 1e-9);
    assert.equal(soft.elements[0].stress.x, 0, 'the stress peaks at the root');
  }
  // shear stiff enough, and Timoshenko's beam is Euler-Bernoulli's
  const model = cantilever({ L: 60, section: { ...bar, Asz: 1e12 }, model: { loads: [{ node: 'b', force: [0, 0, -100] }] } });
  close('cantilever, shear area 1e12: Euler-Bernoulli again', -statics(model).displacements.b[2], (100 * 60 ** 3) / (3 * alu.E * bar.Iy), 1e-6);
});

test('frame: a simply supported beam under a spread load', () => {
  // Mid-span deflection 5 w L⁴ / 384 E I, end reactions w L / 2, mid-span moment w L² / 8 (Roark table 8.1).
  // Twice: two elements with a node at mid-span, and one element read at its middle station.
  const L = 800, w = 1.5, sag = (5 * w * L ** 4) / (384 * alu.E * bar.Iy);
  const supports = { a: { x: true, y: true, z: true, rx: true }, b: { y: true, z: true } }, element = { section: bar, material: alu };
  const two = statics({ nodes: { a: [0, 0, 0], m: [L / 2, 0, 0], b: [L, 0, 0] }, elements: [{ id: 'left', a: 'a', b: 'm', ...element }, { id: 'right', a: 'm', b: 'b', ...element }], supports, loads: [{ element: 'left', spread: [0, 0, -w] }, { element: 'right', spread: [0, 0, -w] }] }, { shear: false });
  close('simply supported, two elements: mid-span deflection', -two.displacements.m[2], sag);
  close('simply supported: end reaction at a', two.reactions.a[2], (w * L) / 2);
  close('simply supported: end reaction at b', two.reactions.b[2], (w * L) / 2);
  close('simply supported: mid-span moment', Math.abs(two.elements[0].ends.b[4]), (w * L * L) / 8);
  const one = statics({ nodes: { a: [0, 0, 0], b: [L, 0, 0] }, elements: [{ id: 'beam', a: 'a', b: 'b', ...element }], supports, loads: [{ element: 'beam', spread: [0, 0, -w] }] }, { shear: false }).elements[0];
  const mid = one.along.x.indexOf(L / 2);
  close('simply supported, one element: deflection at its middle station', -one.along.d[mid][2], sag);
  close('simply supported, one element: peak moment along it', Math.abs(one.peak.My.value), (w * L * L) / 8);
  assert.equal(one.peak.My.x, L / 2, 'the moment peaks at mid-span');
  close('simply supported: peak bending stress', one.stress.peak, ((w * L * L) / 8) * 15 / bar.Iy);
});

test('frame: a fixed-fixed beam under a spread load', () => {
  // End moments w L² / 12, mid-span moment w L² / 24, mid-span deflection w L⁴ / 384 E I (Roark table 8.1)
  const L = 800, w = 1.5, element = { section: bar, material: alu };
  const r = statics({ nodes: { a: [0, 0, 0], m: [L / 2, 0, 0], b: [L, 0, 0] }, elements: [{ a: 'a', b: 'm', ...element }, { a: 'm', b: 'b', ...element }], supports: { a: 'fixed', b: 'fixed' }, loads: [{ element: 0, spread: [0, 0, -w] }, { element: 1, spread: [0, 0, -w] }] }, { shear: false });
  close('fixed-fixed: end moment at a', Math.abs(r.reactions.a[4]), (w * L * L) / 12);
  close('fixed-fixed: end moment at b', Math.abs(r.reactions.b[4]), (w * L * L) / 12);
  close('fixed-fixed: mid-span moment', Math.abs(r.elements[0].ends.b[4]), (w * L * L) / 24);
  close('fixed-fixed: mid-span deflection', -r.displacements.m[2], (w * L ** 4) / (384 * alu.E * bar.Iy));
  // and in one element, where the answer is all in the fixed-end forces and the deflection along it
  const one = statics({ nodes: [[0, 0, 0], [L, 0, 0]], elements: [{ a: 0, b: 1, ...element }], supports: { 0: 'fixed', 1: 'fixed' }, loads: [{ element: 0, spread: [0, 0, -w], axes: 'local' }] }, { shear: false });
  close('fixed-fixed, one element: end moment', Math.abs(one.reactions[0][4]), (w * L * L) / 12);
  close('fixed-fixed, one element: deflection at its middle station', -one.elements[0].along.d[5][2], (w * L ** 4) / (384 * alu.E * bar.Iy));
});

test('frame: a portal frame with a side load sways as slope-deflection says', () => {
  // Two columns of height h and second moment Ic on fixed feet A and D, a beam of span L and second moment Ib across
  // their tops B and C, rigid corners, a side load P at B. By slope-deflection (the method: Hibbeler, Structural
  // Analysis, the chapter on slope-deflection equations; members do not change length):
  //   the frame is antisymmetric, so both corners turn by θ and both columns lean by ψ = Δ / h.
  //   Column:  M_AB = (2 E Ic / h)(θ − 3ψ),  M_BA = (2 E Ic / h)(2θ − 3ψ).   Beam:  M_BC = (2 E Ib / L)(2θ + θ).
  //   Corner B in balance:  M_BA + M_BC = 0  gives  θ = 3ψ / (2 + 3k),  with k = (Ib / L) / (Ic / h).
  //   Each column carries half the load:  (M_AB + M_BA) / h = −P / 2  gives  6ψ − 3θ = P h² / 4 E Ic.
  //   So the sway is  Δ = P h³ (2 + 3k) / (12 E Ic (1 + 6k)),  the moment at each foot  P h (1 + 3k) / (2 (1 + 6k)),
  //   and at each corner  3 P h k / (2 (1 + 6k)).
  //   Checks: a rigid beam (k → ∞) gives P h³ / 24 E Ic and P h / 4; no beam (k = 0) gives two cantilevers, P h³ / 6 E Ic.
  //   With k = 1: Δ = 5 P h³ / 84 E Ic and a foot moment of 2 P h / 7, the textbook figures for a square portal.
  // The area is made huge so the members keep their lengths, as the hand method assumes.
  const P = 200;
  for (const [h, L, Ic, Ib] of [[400, 400, 20000, 20000], [400, 600, 13333, 45000]]) {
    const k = (Ib / L) / (Ic / h), column = { A: 1e9, Iy: Ic, Iz: Ic, J: 1e4 }, beam = { A: 1e9, Iy: Ib, Iz: Ib, J: 1e4 };
    const r = statics({ nodes: { A: [0, 0, 0], B: [0, 0, h], C: [L, 0, h], D: [L, 0, 0] }, elements: [{ id: 'AB', a: 'A', b: 'B', section: column, material: alu }, { id: 'BC', a: 'B', b: 'C', section: beam, material: alu }, { id: 'DC', a: 'D', b: 'C', section: column, material: alu }],
      supports: { A: 'fixed', D: 'fixed' }, loads: [{ node: 'B', force: [P, 0, 0] }] });
    close(`portal, k = ${k.toFixed(2)}: sway`, r.displacements.B[0], (P * h ** 3 * (2 + 3 * k)) / (12 * alu.E * Ic * (1 + 6 * k)));
    close(`portal, k = ${k.toFixed(2)}: moment at foot A`, Math.abs(r.reactions.A[4]), (P * h * (1 + 3 * k)) / (2 * (1 + 6 * k)));
    close(`portal, k = ${k.toFixed(2)}: moment at foot D`, Math.abs(r.reactions.D[4]), (P * h * (1 + 3 * k)) / (2 * (1 + 6 * k)));
    close(`portal, k = ${k.toFixed(2)}: moment at corner B`, Math.abs(r.elements[1].ends.a[4]), (3 * P * h * k) / (2 * (1 + 6 * k)));
    if (k === 1) close('portal, k = 1: sway is 5 P h³ / 84 E I', r.displacements.B[0], (5 * P * h ** 3) / (84 * alu.E * Ic));
  }
});

test('frame: a portal in one plane on pinned feet, free to sway out of it, is held that way with loose: \'hold\' and sags under a load in its plane as slope-deflection says; a push across it is refused', () => {
  // Columns AB and DC of height h on pinned feet A and D, a beam B-M-C of span L across their tops, rigid corners, all
  // one second moment I, a load P down at the middle M. Out of the frame's plane nothing holds it: both columns lean
  // about their feet together, and the beam goes with them. In its plane, by slope-deflection (the symmetric case:
  // no sway, corner B turns θ, C turns −θ):
  //   column, far end pinned:  M_BA = 3 E I θ / h.   beam, with θ and −θ at its ends:  M_BC = 2 E I θ / L − P L / 8.
  //   Corner B in balance:  3 E I θ / h + 2 E I θ / L = P L / 8,  so the corner moment is
  //   M = (P L / 8) (3 / h) / (3 / h + 2 / L) = (P L / 8) · 3 L / (3 L + 2 h),
  //   and the middle sags  δ = P L³ / 48 E I − M L² / 8 E I  (a simple span less its end moments' hogging).
  //   h = 400, L = 600, P = 100 N, E = 70000, I = 20000:  M = 7500 × 1800 / 2600 = 5192.3 N·mm,
  //   δ = 100 × 600³ / (48 × 1.4e9) − 5192.3 × 600² / (8 × 1.4e9) = 0.32143 − 0.16690 = 0.15453 mm.
  // The area is made huge so the members keep their lengths, as the hand method assumes.
  const h = 400, L = 600, P = 100, I = 20000, sec = { A: 1e9, Iy: I, Iz: I, J: 1e4 }, EI = alu.E * I;
  const portal = { nodes: { A: [0, 0, 0], B: [0, 0, h], M: [L / 2, 0, h], C: [L, 0, h], D: [L, 0, 0] },
    elements: [['AB', 'A', 'B'], ['BM', 'B', 'M'], ['MC', 'M', 'C'], ['DC', 'D', 'C']].map(([id, a, b]) => ({ id, a, b, section: sec, material: alu })),
    supports: { A: 'pinned', D: 'pinned' }, loads: [{ node: 'M', force: [0, 0, -P] }] };
  // refused as it was: a mechanism, unless the model asks for it to be held
  assert.throws(() => statics(portal), (e) => e.code === 'fea.frame.mechanism' && e.loose.length === 1);
  const held = frame({ ...portal, loose: 'hold' });
  assert.equal(held.loose.length, 1, JSON.stringify(held.loose));
  const M = ((P * L) / 8) * (3 * L) / (3 * L + 2 * h), want = (P * L ** 3) / (48 * EI) - (M * L ** 2) / (8 * EI);
  const r = held.statics();
  close('pinned portal held out of its plane: the middle\'s sag', -r.displacements.M[2], want, 1e-4);
  close('pinned portal: the corner moment', Math.abs(r.elements[0].ends.b[4]), M, 1e-4);
  assert.ok(Math.abs(r.displacements.M[1]) < 1e-9, 'nothing moves out of the plane');
  // a push across the plane does work on the free sway: refused by name, with the freedom
  assert.throws(() => held.statics({ loads: [{ node: 'M', force: [0, 10, 0] }] }), (e) => e.code === 'fea.frame.mechanism' && e.driven === true && /the loads move the frame where nothing holds it, at node "[A-Z]" \(r?[xyz]\)/.test(e.message));
  // the same frame with fixed feet needs no hold, and holds nothing
  assert.deepEqual(frame({ ...portal, supports: { A: 'fixed', D: 'fixed' }, loose: 'hold' }).loose, []);
  // a lone beam pinned at both ends spins on its axis: held, it sags as a simple span, P L³ / 48 E I
  const lone = frame({ nodes: { a: [0, 0, 0], m: [L / 2, 0, 0], b: [L, 0, 0] }, elements: [{ id: 'one', a: 'a', b: 'm', section: sec, material: alu }, { id: 'two', a: 'm', b: 'b', section: sec, material: alu }], supports: { a: 'pinned', b: 'pinned' }, loads: [{ node: 'm', force: [0, 0, -P] }], loose: 'hold' });
  assert.ok(lone.loose.some((l) => l.freedom === 'rx'), JSON.stringify(lone.loose));
  close('a beam pinned at both ends, held from spinning: its sag', -lone.statics().displacements.m[2], (P * L ** 3) / (48 * EI), 1e-4);
  assert.throws(() => frame({ ...portal, loose: 'maybe' }), (e) => e.code === 'fea.frame.input' && /loose is "maybe": 'refuse'/.test(e.message));
});

test('frame: a frame held where nothing holds it has modes of 0 Hz there and the rest its own, and tips over (factor 0) when its squeezed members lean it that way', () => {
  // Buckling. The pinned portal again, its posts squeezed by 1000 N at each corner. Out of its plane it turns about
  // the line through its feet with nothing resisting: K v = 0 for that way v, and each post's compression N gives
  // vᵀ B v = N θ² h > 0 for it, so vᵀ (K − λ B) v = −λ N θ² h < 0 for any factor λ above 0: it leans over under any
  // share of its load. Held at a foot's rx it would have buckled at 0.936 of its load, and at the rail's middle at
  // 2.02 (the factor followed the hold); the true factor is 0.
  const h = 400, L = 600, sec = { A: 200, Iy: 20000, Iz: 20000, J: 1e4 };
  const posts = (top) => ({ nodes: { A: [0, 0, h - top], B: [0, 0, top], M: [L / 2, 0, top], C: [L, 0, top], D: [L, 0, h - top] },
    elements: [['AB', 'A', 'B'], ['BM', 'B', 'M'], ['MC', 'M', 'C'], ['DC', 'D', 'C']].map(([id, a, b]) => ({ id, a, b, section: sec, material: alu })), supports: { A: 'pinned', D: 'pinned' }, loose: 'hold' });
  const standing = frame(posts(h)).buckling({ loads: [{ node: 'B', force: [0, 0, -1000] }, { node: 'C', force: [0, 0, -1000] }] });
  assert.deepEqual(standing.factors, [0]);
  assert.equal(standing.tipped.length, 1, JSON.stringify(standing.tipped));
  const M = standing.modes[0].shape.M;
  assert.ok(Math.abs(M[1] - 1) < 1e-9 && Math.abs(M[0]) < 1e-9 && Math.abs(M[2]) < 1e-9, `the rail moves 1 across the plane: ${M}`);
  // The same portal hanging from its pins, its rail pushed in by 100 N at each end: the posts hang in tension, which
  // pulls the frame back as it turns (vᵀ B v < 0), so it does not tip; the figure is with it held, and named so.
  const hanging = frame(posts(0)).buckling({ loads: [{ node: 'B', force: [100, 0, -1000] }, { node: 'C', force: [-100, 0, -1000] }] });
  assert.ok(hanging.factors[0] > 1 && !hanging.tipped, JSON.stringify(hanging.factors));
  assert.equal(hanging.rests.length, 1);
  // A strut pinned at both ends spins on its axis, a way its load leaves alone (B v = 0): held, its factor is Euler's
  // exactly, P = π² E I / L² (Timoshenko and Gere 1961, chapter 2).
  const bar = { A: 200, Iy: 20000, Iz: 10000, J: 1e4 }, Lc = 1000, P = 1000;
  const strut = buckling(subdivide({ nodes: { foot: [0, 0, 0], top: [0, 0, Lc] }, elements: [{ id: 'col', a: 'foot', b: 'top', section: bar, material: alu }], supports: { foot: 'pinned', top: { x: true, y: true } }, loads: [{ node: 'top', force: [0, 0, -P] }], loose: 'hold' }, 8), { shear: false });
  close('a strut pinned at both ends, free to spin: Euler', strut.factors[0] * P, (Math.PI ** 2 * alu.E * bar.Iz) / Lc ** 2);
  assert.ok(!strut.tipped && !strut.rests);

  // Modes. A bar 500 mm long (no density) pinned at a, b on a spring of k = 2 N/mm along z, 0.5 kg at b. Along y, b
  // swings about a with nothing resisting: a mode of 0 Hz. Along z it turns about a as a rigid bar on the spring:
  //   ω² = k / m = 2 N/mm / 0.5 kg = 4000 s⁻²,  f = √4000 / 2π = 10.066 Hz.
  // Along the bar, b on its stiffness E A / L = 70000 × 200 / 500 = 28000 N/mm:  f = √(28000 × 1000 / 0.5) / 2π = 1191.0 Hz.
  // Held at a's rz (where a hold could land), b would have had a cantilever's 3 E I / L³ = 33.6 N/mm along y and a
  // mode of 41.3 Hz that the frame has not.
  const swing = (supports) => frame({ nodes: { a: [0, 0, 0], b: [500, 0, 0] }, elements: [{ id: 'bar', a: 'a', b: 'b', section: sec, material: { E: 70000, nu: 0.33 } }], supports, masses: { b: 0.5 }, loose: 'hold' }).modes({ count: 3 });
  const m = swing({ a: 'pinned', b: { z: 2 } });
  assert.equal(m.frequencies[0], 0); assert.equal(m.modes[0].free, true);
  assert.ok(Math.abs(Math.abs(m.modes[0].shape.b[1]) - 1) < 1e-9, 'the free mode swings b along y');
  close('the swinging bar on its spring', m.frequencies[1], Math.sqrt(4000) / (2 * Math.PI), 1e-6);
  close('the swinging bar along its length', m.frequencies[2], Math.sqrt((28000 * 1000) / 0.5) / (2 * Math.PI), 1e-6);
  assert.ok(!m.modes[1].free && !m.modes[2].free);
  const clamped = swing({ a: { x: true, y: true, z: true, rz: true }, b: { z: 2 } }).frequencies;
  close('held at a\'s rz by hand: the cantilever mode the free bar has not', clamped[1], Math.sqrt((3 * 70000 * 20000 / 500 ** 3) * 1000 / 0.5) / (2 * Math.PI), 1e-6);
});

test('frame: a torsion bar twists by T L / G J', () => {
  // Roark, chapter 10: the twist of a uniform bar under an end torque
  const L = 300, T = 5000, r = statics(cantilever({ L, model: { loads: [{ node: 'b', moment: [T, 0, 0] }] } }));
  close('torsion bar: twist', r.displacements.b[3], (T * L) / (G * bar.J), 1e-9);
  close('torsion bar: torque along it', r.elements[0].peak.T.value, T, 1e-9);
});

test('frame: Euler buckling of a pinned-pinned and a fixed-free column', () => {
  // P = π² E I / (K L)², K = 1 pinned-pinned and K = 2 fixed-free (Timoshenko and Gere 1961, Theory of Elastic
  // Stability, chapter 2). Eight elements a column; shear deformation off, as Euler's column has none. The column
  // stands along z and buckles about its weaker axis first.
  const L = 1000, P = 1000, euler = (I, K) => (Math.PI ** 2 * alu.E * I) / (K * L) ** 2;
  const column = (supports) => subdivide({ nodes: { foot: [0, 0, 0], top: [0, 0, L] }, elements: [{ id: 'col', a: 'foot', b: 'top', section: bar, material: alu }], supports, loads: [{ node: 'top', force: [0, 0, -P] }] }, 8);
  const pinned = buckling(column({ foot: { x: true, y: true, z: true, rz: true }, top: { x: true, y: true } }), { shear: false, count: 2 });
  close('Euler, pinned-pinned: first load', pinned.factors[0] * P, euler(bar.Iz, 1));
  close('Euler, pinned-pinned: about the stronger axis', pinned.factors[1] * P, euler(bar.Iy, 1));
  const free = buckling(column({ foot: 'fixed' }), { shear: false, count: 2 });
  close('Euler, fixed-free: first load', free.factors[0] * P, euler(bar.Iz, 2));
  close('Euler, fixed-free: about the stronger axis', free.factors[1] * P, euler(bar.Iy, 2));
  // the first shape is a bow: the top moves most, sideways, and not along the column
  const top = free.modes[0].shape.top;
  assert.ok(Math.abs(Math.hypot(top[0], top[1]) - 1) < 1e-6 && Math.abs(top[2]) < 1e-6, `the top moves 1 sideways: ${top}`);
  // how the element count tells: 22% with one element a column, under 1% with two
  const coarse = (n) => buckling(subdivide({ nodes: { foot: [0, 0, 0], top: [0, 0, L] }, elements: [{ a: 'foot', b: 'top', section: bar, material: alu }], supports: { foot: { x: true, y: true, z: true, rz: true }, top: { x: true, y: true } }, loads: [{ node: 'top', force: [0, 0, -P] }] }, n), { shear: false }).factors[0] * P / euler(bar.Iz, 1) - 1;
  assert.ok(Math.abs(coarse(1) - 0.216) < 0.002 && coarse(2) < 0.01 && coarse(4) < 0.001, `one element ${coarse(1)}, two ${coarse(2)}, four ${coarse(4)}`);
  // a stout column buckles sooner with shear: P / (1 + P / G As) (Engesser's formula; Timoshenko and Gere, on the effect of shearing force on the critical load)
  const stout = (shear) => buckling(subdivide({ nodes: { foot: [0, 0, 0], top: [0, 0, 150] }, elements: [{ a: 'foot', b: 'top', section: bar, material: alu }], supports: { foot: 'fixed' }, loads: [{ node: 'top', force: [0, 0, -P] }] }, 8), { shear }).factors[0] * P;
  const pe = (Math.PI ** 2 * alu.E * bar.Iz) / (2 * 150) ** 2;
  close('Euler with shear (Engesser), stout fixed-free', stout(true), pe / (1 + pe / (G * bar.Asy)));
  // Beside a slender tie pulled a hundred times harder, the column still buckles at its own load. With the loads
  // reversed the tie would buckle at a factor thousands of times smaller: those negative factors must neither be
  // taken for the answer nor hide it.
  const wire = { A: 3, Iy: 0.7, Iz: 0.7, J: 1.4 }, tied = buckling(subdivide({ nodes: { a: [0, 0, 0], b: [0, 0, L], c: [500, 0, 0], d: [500, 0, L] }, elements: [{ id: 'col', a: 'a', b: 'b', section: bar, material: alu }, { id: 'tie', a: 'c', b: 'd', section: wire, material: alu }],
    supports: { a: 'fixed', c: 'fixed', d: { x: true, y: true, rz: true } }, loads: [{ node: 'b', force: [0, 0, -P] }, { node: 'd', force: [0, 0, 100 * P] }] }, 8), { shear: false });
  close('Euler, fixed-free, beside a tie in tension', tied.factors[0] * P, euler(bar.Iz, 2));
  assert.ok(tied.statics.elements.some((e) => e.of === 'tie' && e.axial > 0) && Math.abs(tied.modes[0].shape.d[0]) < 1e-6, 'the tie is in tension, and it is the column that bows');
});

test('frame: first bending frequencies, and the units of mass', () => {
  // f = (λ² / 2π) √(E I / ρ A L⁴): λ = 1.8751 for a cantilever, π for a simply supported beam (Blevins 1979, Formulas
  // for Natural Frequency and Mode Shape, table 8-1). The formula is worked in SI units here (Pa, m, kg/m³), so the
  // test also holds the solver's units to account: mm, N, MPa and g/cm³ in, Hz out.
  const L = 600, si = (I, lambda) => (lambda ** 2 / (2 * Math.PI)) * Math.sqrt((alu.E * 1e6 * I * 1e-12) / (alu.density * 1000 * bar.A * 1e-6 * (L / 1000) ** 4));
  const beam = (supports) => subdivide({ nodes: { a: [0, 0, 0], b: [L, 0, 0] }, elements: [{ id: 'beam', a: 'a', b: 'b', section: bar, material: alu }], supports }, 8);
  const fixed = modes(beam({ a: 'fixed' }), { shear: false, count: 4 });
  close('cantilever: first frequency (about the weaker axis)', fixed.frequencies[0], si(bar.Iz, 1.8751040687));
  close('cantilever: first frequency about the stronger axis', fixed.frequencies[1], si(bar.Iy, 1.8751040687));
  close('cantilever: second bending frequency', fixed.frequencies[2], si(bar.Iz, 4.6940911330));
  const simple = modes(beam({ a: { x: true, y: true, z: true, rx: true }, b: { y: true, z: true } }), { shear: false, count: 2 });
  close('simply supported: first frequency', simple.frequencies[0], si(bar.Iz, Math.PI));
  close('simply supported: about the stronger axis', simple.frequencies[1], si(bar.Iy, Math.PI));
});

test('frame: a cantilever with a heavy tip mass rings as one mass on a spring', () => {
  // f = (1 / 2π) √(k / M) with k = 3 E I / L³ (the single-mass formula; in SI, k in N/m and M in kg). With a
  // weightless beam it is exact; with the beam's own mass m, Rayleigh's method adds 33/140 of it to the tip (Thomson,
  // Theory of Vibration with Applications, Rayleigh's method for a beam with an end mass).
  const L = 400, M = 50, k = ((3 * alu.E * bar.Iz) / L ** 3) * 1000; // N/m
  const model = (material) => subdivide({ ...cantilever({ L, material }), masses: { b: M } }, 4);
  close('tip mass on a weightless cantilever', modes(model({ E: alu.E, nu: alu.nu }), { shear: false, count: 1 }).frequencies[0], Math.sqrt(k / M) / (2 * Math.PI), 1e-6);
  const m = alu.density * 1e-6 * bar.A * L; // the beam, kg: 0.648, about 1% of the tip mass
  close('tip mass much heavier than the beam, against the single-mass formula', modes(model(alu), { shear: false, count: 1 }).frequencies[0], Math.sqrt(k / M) / (2 * Math.PI));
  close('tip mass with the beam\'s mass by Rayleigh (33/140)', modes(model(alu), { shear: false, count: 1 }).frequencies[0], Math.sqrt(k / (M + (33 / 140) * m)) / (2 * Math.PI), 1e-4);
  // the same mass under gravity: its weight, M g, hangs from the tip
  const hung = statics({ ...cantilever({ L, material: { E: alu.E, nu: alu.nu } }), masses: { b: M }, gravity: [0, 0, -9.81] }, { shear: false });
  close('a lumped mass under gravity: tip deflection M g L³ / 3 E I', -hung.displacements.b[2], (M * 9.81 * L ** 3) / (3 * alu.E * bar.Iy), 1e-9);
});

test('frame: a semi-rigid joint, and its limits: a stiff spring is rigid, a soft one is a pin', () => {
  // A cantilever joined to its support through a rotational spring k: the root turns by P L / k, which carries the
  // tip a further P L² / k, so the tip moves P L³ / 3 E I + P L² / k (superposition).
  const L = 500, P = 100, k = 2e6, rigid = (P * L ** 3) / (3 * alu.E * bar.Iy);
  const sprung = (ry) => statics(cantilever({ L, element: { ends: { a: { ry } } }, model: { loads: [{ node: 'b', force: [0, 0, -P] }] } }), { shear: false });
  close('semi-rigid joint: tip deflection', -sprung(k).displacements.b[2], rigid + (P * L * L) / k, 1e-9);
  close('semi-rigid joint: the spring carries the root moment', Math.abs(sprung(k).elements[0].ends.a[4]), P * L, 1e-9);
  close('a very stiff spring is a rigid joint', -sprung(1e15).displacements.b[2], rigid, 1e-6);
  assert.deepEqual(sprung('rigid').displacements, sprung(Infinity).displacements);
  // Soft against pinned needs a beam that stands with a pin: propped at b, under a spread load. Rigid at a it is
  // fixed-pinned (a's moment w L² / 8, b's reaction 3 w L / 8); pinned at a it is simply supported (0 and w L / 2).
  const w = 2, propped = (ry) => statics({ nodes: { a: [0, 0, 0], b: [L, 0, 0] }, elements: [{ id: 'beam', a: 'a', b: 'b', section: bar, material: alu, ends: { a: { ry } } }], supports: { a: 'fixed', b: { z: true } }, loads: [{ element: 'beam', spread: [0, 0, -w] }] }, { shear: false });
  close('propped beam, rigid end: fixed-end moment w L² / 8', Math.abs(propped('rigid').reactions.a[4]), (w * L * L) / 8, 1e-9);
  close('propped beam, rigid end: prop reaction 3 w L / 8', propped('rigid').reactions.b[2], (3 * w * L) / 8, 1e-9);
  close('propped beam, stiff spring: as rigid', propped(1e15).reactions.b[2], (3 * w * L) / 8, 1e-6);
  close('propped beam, pinned end: prop reaction w L / 2', propped('free').reactions.b[2], (w * L) / 2, 1e-9);
  close('propped beam, soft spring: as pinned', propped(1e-6).reactions.b[2], (w * L) / 2, 1e-6);
  close('propped beam, soft spring: mid-span sag as simply supported', -propped(1e-6).elements[0].along.d[5][2], (5 * w * L ** 4) / (384 * alu.E * bar.Iy), 1e-6);
  close('propped beam, pinned: the pin carries no moment', propped('free').elements[0].ends.a[4], 0, 1e-6);
  // a spring between the two: the fixed-end moment falls by the share the joint gives way, M = (w L² / 8) / (1 + 3 E I / k L)
  close('propped beam, a spring between: end moment', Math.abs(propped(k).elements[0].ends.a[4]), ((w * L * L) / 8) / (1 + (3 * alu.E * bar.Iy) / (k * L)), 1e-9);
});

test('frame: the same cantilever pointing along every axis, rolled, gives the same answer in its own axes', () => {
  // A load along local z bends it about local y (P L³ / 3 E Iy), a load along local y about local z, whichever way
  // the element points and however it is rolled; and a load along z does not move it along y
  const L = 500, P = 100, s = Math.SQRT1_2;
  for (const to of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.6, 0.48, 0.64], [s, 0, -s]]) for (const roll of [0, 90, 37]) {
    const model = { nodes: { a: [10, 20, 30], b: [10 + L * to[0], 20 + L * to[1], 30 + L * to[2]] }, elements: [{ a: 'a', b: 'b', section: bar, material: alu, roll }], supports: { a: 'fixed' } }, f = frame(model, { shear: false });
    const [x, y, z] = f.statics().elements[0].axes, dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2], cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    assert.ok(Math.abs(dot(x, to) - 1) < 1e-12 && Math.abs(dot(x, y)) < 1e-12 && Math.abs(dot(y, z)) < 1e-12 && Math.hypot(...cross(x, y).map((v, i) => v - z[i])) < 1e-12, `axes along ${to}, rolled ${roll}: x from a to b, right-handed`);
    const alongZ = f.statics({ loads: [{ node: 'b', force: z.map((v) => P * v) }] }).displacements.b, alongY = f.statics({ loads: [{ node: 'b', force: y.map((v) => P * v) }] }).displacements.b;
    close(`pointing ${to.map((v) => +v.toFixed(2))}, rolled ${roll}: bending about local y`, dot(alongZ, z), (P * L ** 3) / (3 * alu.E * bar.Iy), 1e-9);
    close(`pointing ${to.map((v) => +v.toFixed(2))}, rolled ${roll}: bending about local z`, dot(alongY, y), (P * L ** 3) / (3 * alu.E * bar.Iz), 1e-9);
    assert.ok(Math.abs(dot(alongZ, y)) < 1e-9 && Math.abs(dot(alongZ, x)) < 1e-9, 'and nothing across');
  }
  // where the axes point: along +x, z is up and y is global y; rolled 90°, y turns up to where z was; a column's z leans to +x
  const axes = (b, roll) => statics({ nodes: { a: [0, 0, 0], b }, elements: [{ a: 'a', b: 'b', section: bar, material: alu, roll }], supports: { a: 'fixed' } }).elements[0].axes.map((v) => v.map((c) => Math.round(c * 1e9) / 1e9 + 0));
  assert.deepEqual(axes([100, 0, 0], 0), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.deepEqual(axes([100, 0, 0], 90), [[1, 0, 0], [0, 0, 1], [0, -1, 0]]);
  assert.deepEqual(axes([0, 0, 100], 0), [[0, 0, 1], [0, -1, 0], [1, 0, 0]]);
});

test('frame: struts on ball joints make a truss; gravity and spread loads balance; a support may be a spring', () => {
  // Two struts from feet 2a apart to an apex h up, a load P down on the apex: each strut carries P / (2 sin α) and
  // the apex drops P s / (2 E A sin² α), s the strut's length (statics and Castigliano's theorem)
  const a = 300, h = 400, s = 500, P = 1000, sin = h / s, strut = { section: bar, material: alu, ends: { a: 'ball', b: 'ball' } };
  const truss = statics({ nodes: { left: [-a, 0, 0], right: [a, 0, 0], apex: [0, 0, h] }, elements: [{ a: 'left', b: 'apex', ...strut }, { a: 'right', b: 'apex', ...strut }], supports: { left: 'pinned', right: 'pinned', apex: { y: true } }, loads: [{ node: 'apex', force: [0, 0, -P] }] });
  close('two-bar truss: strut force', -truss.elements[0].axial, P / (2 * sin), 1e-9);
  close('two-bar truss: apex drop', -truss.displacements.apex[2], (P * s) / (2 * alu.E * bar.A * sin * sin), 1e-9);
  assert.deepEqual(truss.displacements.apex.slice(3), [0, 0, 0], 'a node no element turns is reported still');
  assert.throws(() => statics({ nodes: { left: [-a, 0, 0], right: [a, 0, 0], apex: [0, 0, h] }, elements: [{ a: 'left', b: 'apex', ...strut }, { a: 'right', b: 'apex', ...strut }], supports: { left: 'pinned', right: 'pinned', apex: { y: true } }, loads: [{ node: 'apex', moment: [0, 50, 0] }] }), (e) => e.code === 'fea.frame.load' && /a moment is put on node "apex" about a direction no element there carries/.test(e.message));
  // A leaning beam under its own weight, and a load spread along it given in its own axes: the supports give back
  // exactly the weight; gravity is in N/kg and density in g/cm³, so the weight is density × 1e-6 × A × L × 9.81
  const lean = { nodes: { a: [0, 0, 0], b: [300, 0, 400] }, elements: [{ id: 'beam', a: 'a', b: 'b', section: bar, material: alu }], supports: { a: 'fixed' } };
  const weight = alu.density * 1e-6 * bar.A * 500 * 9.81, own = statics({ ...lean, gravity: [0, 0, -9.81] });
  close('gravity on a leaning beam: the support carries its weight', own.reactions.a[2], weight, 1e-9);
  close('gravity on a leaning beam: and the moment of it', Math.abs(own.reactions.a[4]), weight * 150, 1e-9);
  const local = statics({ ...lean, loads: [{ element: 'beam', spread: [0, 0, 2], axes: 'local' }] }), z = local.elements[0].axes[2];
  close('a spread load in local axes: reaction along local z', -(local.reactions.a[0] * z[0] + local.reactions.a[2] * z[2]), 2 * 500, 1e-9);
  close('a spread load in global axes is per mm of the beam, not of its shadow', statics({ ...lean, loads: [{ element: 'beam', spread: [0, 0, -2] }] }).reactions.a[2], 2 * 500, 1e-9);
  // a rigid-jointed beam on a spring at its far end: the spring's share is P k / (k + 3 E I / L³)
  const k = 50, kb = (3 * alu.E * bar.Iy) / 500 ** 3, sprung = statics({ ...cantilever(), supports: { a: 'fixed', b: { z: k } }, loads: [{ node: 'b', force: [0, 0, -100] }] }, { shear: false });
  close('a spring support: its reaction', sprung.reactions.b[2], (100 * k) / (k + kb), 1e-9);
  close('a spring support: the movement on it', -sprung.displacements.b[2], 100 / (k + kb), 1e-9);
});

test('frame: element matrices are the textbook ones', () => {
  // With no shear the geometric stiffness is (P / L) [6/5, L/10, 2L²/15, −L²/30] and the consistent mass
  // (m L / 420) [156, 22L, 54, −13L, 4L², −3L²] (the mass: Przemieniecki 1968, chapter 11; the geometric stiffness:
  // McGuire, Gallagher and Ziemian 2000, chapter 9; both in Cook et al. 2002), here without rotary inertia by a section with no second moment to speak of
  const L = 200, thin = { A: 600, Iy: 1e-9, Iz: 1e-9, J: 1 }, { k, kg, m } = elementMatrices(thin, alu, L), at = (M, i, j) => M[i * 12 + j], mass = alu.density * 1e-6 * 600 * L;
  for (const [i, j, want] of [[1, 1, 6 / (5 * L)], [1, 5, 1 / 10], [5, 5, (2 * L) / 15], [5, 11, -L / 30], [1, 7, -6 / (5 * L)], [2, 4, -1 / 10], [4, 4, (2 * L) / 15]]) close(`geometric stiffness [${i}][${j}]`, at(kg, i, j), want, 1e-12);
  for (const [i, j, want] of [[1, 1, 156], [1, 5, 22 * L], [1, 7, 54], [1, 11, -13 * L], [5, 5, 4 * L * L], [5, 11, -3 * L * L], [2, 4, -22 * L], [0, 0, 140], [0, 6, 70]]) close(`consistent mass [${i}][${j}]`, at(m, i, j), (want * mass) / 420, 1e-9);
  // and the stiffness with shear: 12 E I / ((1 + Φ) L³) and (4 + Φ) E I / ((1 + Φ) L), Φ = 12 E I / (G As L²) (Przemieniecki eq. 5.116)
  const e = elementMatrices(bar, alu, L), phi = (12 * alu.E * bar.Iz) / (G * bar.Asy * L * L);
  close('shear parameter Φ', e.phi[0], phi, 1e-12);
  close('stiffness with shear [1][1]', at(e.k, 1, 1), (12 * alu.E * bar.Iz) / ((1 + phi) * L ** 3), 1e-12);
  close('stiffness with shear [5][5]', at(e.k, 5, 5), ((4 + phi) * alu.E * bar.Iz) / ((1 + phi) * L), 1e-12);
  close('stiffness with shear [5][11]', at(e.k, 5, 11), ((2 - phi) * alu.E * bar.Iz) / ((1 + phi) * L), 1e-12);
  for (let i = 0; i < 12; i++) for (let j = 0; j < i; j++) assert.ok(Math.abs(at(k, i, j) - at(k, j, i)) <= 1e-12 * Math.abs(at(k, i, i)), 'symmetric');
});

test('frame: agrees with the voxel solver on a short stout cantilever, within what the voxel mesh justifies', () => {
  // A cantilever 24 long, 8 deep and 4 wide in cubes of 1 mm, against one beam element with shear (shear area 5/6 A).
  // The voxel beam is the stiffer for two reasons that are its own: 8 cubes through the depth are about 1% too stiff
  // (this package's README, "How fine a grid"), and its root is clamped over the whole face, which stops the
  // section narrowing and warping there. Measured: the voxel tip moves 2.7% less than the beam element's. So the
  // tolerance is 4%, and the test also asks that shear shows: without it the beam element would be 5% the other way.
  const L = 24, H = 8, W = 4, F = 10, material = { E: 2000, nu: 0.3 }, g = grid({ nx: L, ny: W, nz: H, h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs), n = (W + 1) * (H + 1);
  for (let k = 0; k <= H; k++) for (let j = 0; j <= W; j++) { for (let d = 0; d < 3; d++) fixed[3 * g.node(0, j, k) + d] = 1; f[3 * g.node(L, j, k) + 2] = -F / n; }
  const u = analyse({ grid: g, density: new Float64Array(g.cells).fill(1), material, fixed, loads: [f] }).u[0];
  let voxel = 0;
  for (let k = 0; k <= H; k++) for (let j = 0; j <= W; j++) voxel -= u[3 * g.node(L, j, k) + 2] / n; // the end face's mean movement
  const section = { A: W * H, Iy: (W * H ** 3) / 12, Iz: (H * W ** 3) / 12, J: 0.229 * H * W ** 3, Asy: (5 / 6) * W * H, Asz: (5 / 6) * W * H };
  const model = { nodes: [[0, 0, 0], [L, 0, 0]], elements: [{ a: 0, b: 1, section, material }], supports: { 0: 'fixed' }, loads: [{ node: 1, force: [0, 0, -F] }] };
  const beam = -statics(model).displacements[1][2], slender = -statics(model, { shear: false }).displacements[1][2];
  close('voxel solver against the beam element with shear (24 × 8 × 4 mm cantilever)', voxel, beam, 0.04);
  assert.ok(voxel > slender * 1.03, `shear shows in the voxels too: ${voxel} against ${slender} with no shear`);
});

// A box of bays × bays × storeys bays of 300 mm in 20 × 30 bar, its feet fixed, a diagonal brace in each outer bay of
// the bottom storey, under its own weight, a side load at one top corner and a mass on the top's middle
function box(bays = 2, storeys = 2) {
  const nodes = {}, elements = [], name = (i, j, k) => `n${i}${j}${k}`, element = (a, b) => elements.push({ id: `${a}-${b}`, a, b, section: bar, material: alu });
  for (let k = 0; k <= storeys; k++) for (let j = 0; j <= bays; j++) for (let i = 0; i <= bays; i++) {
    nodes[name(i, j, k)] = [300 * i, 300 * j, 300 * k];
    if (k) element(name(i, j, k - 1), name(i, j, k));
    if (k && i) element(name(i - 1, j, k), name(i, j, k));
    if (k && j) element(name(i, j - 1, k), name(i, j, k));
  }
  for (let i = 0; i < bays; i++) for (const j of [0, bays]) { element(name(i, j, 0), name(i + 1, j, 1)); element(name(j, i, 0), name(j, i + 1, 1)); }
  const supports = {};
  for (let j = 0; j <= bays; j++) for (let i = 0; i <= bays; i++) supports[name(i, j, 0)] = 'fixed';
  return { nodes, elements, supports, gravity: [0, 0, -9.81], masses: { [name(bays >> 1, bays >> 1, storeys)]: 5 }, loads: [{ node: name(bays, bays, storeys), force: [150, 0, 0] }] };
}

test('frame: a frame of fifty beams is in balance, and solves statically in milliseconds', () => {
  const model = box(), f = frame(model), r = f.statics();
  assert.equal(model.elements.length, 50);
  // balance: the supports give back every load (the side load, and the weight of the beams and the mass)
  const sum = [0, 0, 0], weight = model.elements.reduce((w, e) => w + alu.density * 1e-6 * bar.A * Math.hypot(...model.nodes[e.a].map((v, c) => v - model.nodes[e.b][c])) * 9.81, 0) + 5 * 9.81;
  for (const six of Object.values(r.reactions)) for (let c = 0; c < 3; c++) sum[c] += six[c];
  close('fifty-beam frame: reactions carry the side load', -sum[0], 150, 1e-9);
  close('fifty-beam frame: reactions carry the weight', sum[2], weight, 1e-9);
  assert.ok(Math.abs(sum[1]) < 1e-6 && r.deflection.most > 0 && r.deflection.most < 1, `it moves a little: ${r.deflection.most} mm at ${r.deflection.node}`);
  // time: reading, assembling, factorising, solving and every element's forces, after warming up. Under 20 ms is
  // what is asked of it on a desk machine (it takes about 3 ms); the limit here is 250 ms, for a slow shared runner.
  for (let i = 0; i < 30; i++) frame(model).statics();
  const times = Array.from({ length: 40 }, () => { const t = performance.now(); frame(model).statics(); return performance.now() - t; }).sort((a, b) => a - b), median = times[20];
  report.push({ name: `fifty-beam frame (${f.freedoms} freedoms): static solve, ms (median of 40)`, got: median, want: 20, err: 0 });
  assert.ok(median < 250, `a static solve of 50 beams took ${median.toFixed(2)} ms`);
  // and its buckling and modes run, on members cut in two
  const fine = frame(subdivide(model, 2)), b = fine.buckling({ count: 2 }), m = fine.modes({ count: 3 });
  assert.ok(b.factors[0] > 1 && b.factors[1] >= b.factors[0] && m.frequencies[0] > 1 && m.frequencies[2] >= m.frequencies[0], `buckling factors ${b.factors}, frequencies ${m.frequencies}`);
});

test('frame: what is wrong with a model is said by name, before any maths', () => {
  const good = () => ({ nodes: { a: [0, 0, 0], b: [500, 0, 0] }, elements: [{ id: 'beam', a: 'a', b: 'b', section: { ...bar }, material: { ...alu } }], supports: { a: 'fixed' }, loads: [{ node: 'b', force: [0, 0, -100] }] });
  const bad = (change, code, text) => { const m = good(); change(m); assert.throws(() => statics(m), (e) => { assert.equal(e.code, `fea.frame.${code}`, e.message); assert.match(e.message, text); return true; }); };
  bad((m) => { delete m.supports; }, 'unheld', /nothing is held: give at least one node a support/);
  bad((m) => { m.supports = { a: { x: false } }; }, 'unheld', /nothing is held/);
  bad((m) => { m.elements[0].b = 'c'; }, 'node', /element "beam" names node "c", which is not in nodes \(there are a, b\)/);
  bad((m) => { m.supports.z = 'fixed'; }, 'node', /a support names node "z"/);
  bad((m) => { m.loads[0].node = 'q'; }, 'node', /load 1 names node "q"/);
  bad((m) => { m.nodes.b = [0, 0]; }, 'node', /node "b" is at \[0,0\]: a node needs a position \[x, y, z\] in mm/);
  bad((m) => { m.nodes.b = [0, 0, 0]; }, 'length', /element "beam" has no length: it runs from node "a" to node "b", which are at the same place/);
  bad((m) => { m.elements[0].b = 'a'; }, 'length', /element "beam" has no length/);
  for (const key of ['A', 'Iy', 'Iz', 'J']) for (const value of [0, -1, NaN, undefined]) bad((m) => { m.elements[0].section[key] = value; }, 'section', new RegExp(`element "beam"'s section has ${key} = .*: it needs ${key} above 0`));
  bad((m) => { m.elements[0].section.Asz = 0; }, 'section', /Asz = 0: leave it out, or give it above 0/);
  bad((m) => { m.elements[0].section = '2020'; }, 'section', /names section "2020", which is not in the model's sections/);
  bad((m) => { m.elements[0].material.E = 0; }, 'material', /E = 0: it needs a Young's modulus above 0, in MPa/);
  bad((m) => { delete m.elements[0].material.nu; }, 'material', /a shear modulus G above 0 in MPa, or a Poisson's ratio nu between -1 and 0.5/);
  bad((m) => { m.elements[0].material.density = -1; }, 'material', /density = -1/);
  bad((m) => { m.elements[0].up = [1, 0, 0]; }, 'axes', /up, \[1,0,0\], runs along the element/);
  bad((m) => { m.elements[0].ends = { a: 'welded' }; }, 'join', /end a is joined "welded": 'rigid', 'pinned'/);
  bad((m) => { m.elements[0].ends = { b: { ry: -5 } }; }, 'join', /end b has ry = -5/);
  bad((m) => { m.supports.a = { up: true }; }, 'support', /support has "up": a node's freedoms are x, y, z, rx, ry, rz/);
  bad((m) => { m.loads[0] = { element: 'post', spread: [0, 0, 1] }; }, 'load', /load 1 names element "post"/);
  bad((m) => { m.loads[0].force = [0, 0, NaN]; }, 'load', /load 1's force is/);
  bad((m) => { m.gravity = 9.81; }, 'load', /gravity is 9.81: a direction and size \[x, y, z\] in N\/kg/);
  bad((m) => { m.masses = { b: -2 }; }, 'mass', /the lumped mass at node "b" is -2/);
  bad((m) => { m.elements = []; }, 'input', /a frame needs elements/);
  // a mechanism: held, yet free to move. A beam on a pin can swing; the loose freedoms are named
  bad((m) => { m.supports.a = 'pinned'; }, 'mechanism', /the frame is a mechanism: it can still move with nothing resisting, at node "[ab]" \(/);
  try { const m = good(); m.supports.a = 'pinned'; statics(m); } catch (e) { assert.ok(e.loose.length === 3 && e.loose.every((l) => ['a', 'b'].includes(l.node) && ['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(l.freedom)), `three ways to swing about a pin: ${JSON.stringify(e.loose)}`); }
  // a pinned end on a cantilever is a hinge with nothing beyond it to hold the beam up
  bad((m) => { m.elements[0].ends = { a: 'pinned' }; }, 'mechanism', /the frame is a mechanism/);
  // buckling with nothing in compression; modes with nothing that has mass
  assert.throws(() => buckling({ ...good(), loads: [{ node: 'b', force: [100, 0, 0] }] }), (e) => e.code === 'fea.frame.compression' && /no element is in compression under these loads, so nothing can buckle/.test(e.message));
  assert.throws(() => modes({ ...good(), elements: [{ a: 'a', b: 'b', section: bar, material: { E: 70000, nu: 0.33 } }] }), (e) => e.code === 'fea.frame.mass' && /nothing in the frame has mass/.test(e.message));
  // the good one is good, and sections and materials may be named
  const named = { ...good(), sections: { bar }, materials: { alu }, elements: [{ id: 'beam', a: 'a', b: 'b', section: 'bar', material: 'alu' }] };
  assert.deepEqual(statics(named).displacements, statics(good()).displacements);
});

test('frame: subdivide keeps the answer, the joints and the loads; the module is dependency-free and browser-safe', () => {
  const model = { nodes: { a: [0, 0, 0], b: [600, 0, 0] }, elements: [{ id: 'beam', a: 'a', b: 'b', section: bar, material: alu, ends: { b: 'pinned' } }], supports: { a: 'fixed', b: 'pinned' }, loads: [{ element: 'beam', spread: [0, 0, -1] }] };
  const cut = subdivide(model, 4), whole = statics(model), parts = statics(cut);
  assert.deepEqual(Object.keys(cut.nodes), ['a', 'b', 'beam/1', 'beam/2', 'beam/3']);
  assert.deepEqual(cut.elements.map((e) => [e.id, e.of, e.a, e.b, e.ends.a, e.ends.b]), [['beam/1', 'beam', 'a', 'beam/1', 'rigid', 'rigid'], ['beam/2', 'beam', 'beam/1', 'beam/2', 'rigid', 'rigid'], ['beam/3', 'beam', 'beam/2', 'beam/3', 'rigid', 'rigid'], ['beam/4', 'beam', 'beam/3', 'b', 'rigid', 'pinned']]);
  assert.equal(cut.loads.length, 4);
  close('subdivide: the same reaction', parts.reactions.b[2], whole.reactions.b[2], 1e-9);
  close('subdivide: a new node moves as the whole element says at that station', parts.displacements['beam/2'][2], whole.elements[0].along.d[5][2], 1e-9);
  assert.equal(parts.elements[0].of, 'beam');
  assert.equal(subdivide({ ...model, nodes: [[0, 0, 0], [600, 0, 0]], elements: [{ a: 0, b: 1, section: bar, material: alu }], supports: { 0: 'fixed' }, loads: [] }, 3).nodes.length, 4, 'a list of nodes grows at its end');
  // Its own path, with nothing imported and no reach for Node (test/zero-deps.test.mjs leaves a package's extra
  // paths out, as fea's other one is Node-only: this one is held to the rule here)
  const src = fs.readFileSync(new URL('./frame.mjs', import.meta.url), 'utf8'), pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.ok(!/^\s*(?:import|export)\b[^'\n]*\bfrom\s+['"]/m.test(src) && !/\bimport\s*\(/.test(src.replace(/^\s*(\*|\/\/).*$/gm, '')), 'frame.mjs imports nothing');
  assert.ok(!/\brequire\(|\bprocess\.|['"`]node:/.test(src), 'frame.mjs does not reach for Node');
  assert.deepEqual(pkg.exports['./frame'], { types: './frame.d.mts', default: './frame.mjs' });
  assert.ok(pkg.files.includes('frame.mjs') && pkg.files.includes('frame.d.mts'));
  assert.ok(!/frame\.mjs/.test(fs.readFileSync(new URL('./fea.mjs', import.meta.url), 'utf8')), 'the main entry does not load it');
});

// Sizing: square solid aluminium bars of side b as the choices (I = b⁴ / 12, W = b³ / 6, 2.7 g/cm³, strength 205 MPa)
const strong = { ...alu, strength: 205 };
const square = (b) => ({ name: `bar ${b}`, section: { A: b * b, Iy: b ** 4 / 12, Iz: b ** 4 / 12, J: 0.141 * b ** 4, cy: b / 2, cz: b / 2 }, material: strong }); // (J = 0.141 b⁴ for a square, Roark's table 10.1)

test('frame sizing: a beam is given the lightest bar that keeps its sag and stress in their limits, the limit that set it named; a looser limit gives a lighter bar', () => {
  // A 1000 mm beam on two supports, 1000 N at its middle, in two elements of one member. Hand: sag = P L³ / 48 E I
  // (Roark's, table 8.1, case 1e), so a 2 mm limit wants I ≥ 1000 x 1000³ / (48 x 70000 x 2) = 148 810 mm⁴: bar 30
  // (67 500) sags 1000e9 / (48 x 70000 x 67 500) = 4.409 mm, 2.20 times over; bar 40 (213 333) sags 1.395 mm. Loosened to
  // 5 mm it wants I ≥ 59 524: bar 30 (4.409 mm, 1.13 times inside), and bar 20 (13 333) sags 22.32 mm, 4.46 times over.
  const model = { nodes: { a: [0, 0, 0], m: [500, 0, 0], b: [1000, 0, 0] }, elements: [{ id: 'l', of: 'beam', a: 'a', b: 'm', section: square(20).section, material: strong }, { id: 'r', of: 'beam', a: 'm', b: 'b', section: square(20).section, material: strong }],
    supports: { a: { x: true, y: true, z: true, rx: true }, b: { y: true, z: true } }, loads: [{ node: 'm', force: [0, 0, -1000] }] };
  const choices = [40, 20, 50, 30].map(square); // (in any order: they are ranked by mass)
  const run = (limit, margin = 2) => sizing(model, { groups: { beam: ['beam'] }, choices, limits: { deflection: [{ node: 'm', limit }], stress: { margin } } });
  const tight = run(2), loose = run(5);
  assert.ok(tight.ok && loose.ok);
  const [t] = tight.groups, [l] = loose.groups;
  assert.deepEqual([t.choice, t.lighter, t.governs.limit, t.governs.where, l.choice, l.lighter, l.governs.limit], ['bar 40', 'bar 30', 'deflection', 'm', 'bar 30', 'bar 20', 'deflection']);
  close('sizing: bar 40 sags P L³ / 48 E I', t.governs.value, 1e12 / (48 * 70000 * 40 ** 4 / 12));
  close('sizing: bar 30 is 2.20 times over 2 mm', t.governs.broken, 1e12 / (48 * 70000 * 30 ** 4 / 12) / 2);
  close('sizing: bar 40 is 1.43 times inside 2 mm', t.margin, 2 / (1e12 / (48 * 70000 * 40 ** 4 / 12)));
  close('sizing: bar 20 is 4.46 times over 5 mm', l.governs.broken, 1e12 / (48 * 70000 * 20 ** 4 / 12) / 5);
  // mass: 1 m of bar 40 at 2.7 g/cm³ is 1600 mm² x 1000 mm x 2.7e-6 kg/mm³ = 4.32 kg; of bar 30, 2.43 kg
  close('sizing: the mass of bar 40', tight.total, 4.32, 1e-9);
  assert.ok(loose.total < tight.total, 'a looser limit gives a lighter beam');
  // Stress sets it where the margin asks more: M = P L / 4 = 250 000 N·mm; bar 30 (W = 4500 mm³) carries 55.6 MPa, which
  // a margin of 4 puts 4 x 55.6 / 205 = 1.084 times over; bar 40 (W = 10 667) carries 23.4 MPa
  const st = run(5, 4).groups[0];
  assert.deepEqual([st.choice, st.governs.limit, st.governs.where], ['bar 40', 'stress', 'beam']);
  close('sizing: bar 30 at 4 times its stress', st.governs.broken, 4 * (250000 / 4500) / 205);
  // nothing in the list meets it: the nearest, and by how much it misses
  const none = sizing(model, { groups: { beam: ['beam'] }, choices: [20, 30].map(square), limits: { deflection: [{ node: 'm', limit: 2 }] } });
  assert.deepEqual([none.ok, none.groups[0].choice, none.worst.limit], [false, 'bar 30', 'deflection']);
  close('sizing: the nearest misses by its sag over the limit', none.worst.ratio, 1e12 / (48 * 70000 * 30 ** 4 / 12) / 2);
  // a member's sag along it: the worst station is the middle, the same as the node's
  const along = sizing(model, { groups: { beam: ['beam'] }, choices, limits: { deflection: [{ member: 'beam', limit: 2 }] } });
  assert.equal(along.groups[0].choice, 'bar 40');
  close('sizing: a member\'s worst sag along it', along.checks.find((c) => c.where === 'beam').value, 1e12 / (48 * 70000 * 40 ** 4 / 12));
});

test('frame sizing: a table\'s long rails are given a heavier bar than its legs, each group by the limit that set it; steps come near the lightest with fewer solves', () => {
  // Legs 700 mm on pinned feet, a top ring of rails 600 (x) and 400 (y) joined rigidly, 20 kg (196.2 N) at the middle
  // of each long rail, its own weight too. Limits: the long rails' middles sag no more than 600 / 360 mm, each member
  // twice under its strength and twice under Euler's load (K 1), the frame's first buckling factor 2 or more, and the
  // lowest mode, with the 40 kg ringing on the rails, 2 Hz or more (a table on pinned feet sways on its legs' bending)
  const s0 = square(20).section, W = 600, D = 400, H = 700;
  const nodes = { f1: [0, 0, 0], f2: [W, 0, 0], f3: [0, D, 0], f4: [W, D, 0], t1: [0, 0, H], t2: [W, 0, H], t3: [0, D, H], t4: [W, D, H], m1: [W / 2, 0, H], m2: [W / 2, D, H] };
  const el = (id, of, a, b) => ({ id, of, a, b, section: s0, material: strong });
  const model = { nodes, elements: [el('z1', 'z1', 'f1', 't1'), el('z2', 'z2', 'f2', 't2'), el('z3', 'z3', 'f3', 't3'), el('z4', 'z4', 'f4', 't4'), el('x1a', 'x1', 't1', 'm1'), el('x1b', 'x1', 'm1', 't2'), el('x2a', 'x2', 't3', 'm2'), el('x2b', 'x2', 'm2', 't4'), el('y1', 'y1', 't1', 't3'), el('y2', 'y2', 't2', 't4')],
    supports: { f1: 'pinned', f2: 'pinned', f3: 'pinned', f4: 'pinned' }, gravity: [0, 0, -9.81], loads: [{ node: 'm1', force: [0, 0, -196.2] }, { node: 'm2', force: [0, 0, -196.2] }] };
  const o = (limit, search) => ({ groups: { legs: ['z1', 'z2', 'z3', 'z4'], long: ['x1', 'x2'], short: ['y1', 'y2'] }, choices: [10, 12, 15, 20, 25, 30, 35, 40].map(square), search,
    limits: { deflection: [{ node: 'm1', limit }, { node: 'm2', limit }], stress: { margin: 2 }, buckling: { factor: 2, euler: 1 }, frequency: { Hz: 2 } }, cases: [{ label: 'two 20 kg', inertia: { m1: 20, m2: 20 } }] });
  const every = sizing(model, o(W / 360, 'every')), steps = sizing(model, o(W / 360, 'steps'));
  const pick = (r) => Object.fromEntries(r.groups.map((g) => [g.name, g.choice]));
  assert.ok(every.ok && steps.ok);
  // every design ranked by mass is the lightest; steps, a design no lighter, here within a fifth of it, from fewer solves
  assert.deepEqual(pick(every), { legs: 'bar 15', long: 'bar 20', short: 'bar 15' });
  assert.ok(steps.total >= every.total - 1e-9 && steps.total < 1.2 * every.total && steps.tried < every.tried, `steps: ${steps.total} kg from ${steps.tried} designs; every: ${every.total} kg from ${every.tried}`);
  const g = Object.fromEntries(every.groups.map((x) => [x.name, x]));
  assert.ok(g.long.mass / g.long.length > g.legs.mass / g.legs.length, `the long rails' bar (${g.long.choice}) is heavier a metre than the legs' (${g.legs.choice})`);
  for (const x of every.groups) assert.ok(x.governs && x.governs.broken > 1 && x.margin >= 1, `${x.name}: ${x.choice} is set by a limit its next lighter bar breaks`);
  assert.deepEqual([g.legs.governs.limit, g.long.governs.limit, g.long.governs.where, g.short.governs.limit], ['frequency', 'deflection', 'm1', 'frequency']);
  // every check the design passes, each within its limit
  assert.ok(every.checks.every((c) => c.ratio <= 1) && every.checks.some((c) => c.limit === 'buckling' && c.where === 'frame') && every.checks.some((c) => c.limit === 'buckling' && c.where === 'z1 (Euler)'));
  // a frequency floor halved lightens the frame
  const soft = sizing(model, { ...o(W / 360, 'every'), limits: { ...o(W / 360).limits, frequency: { Hz: 1 } } });
  assert.ok(soft.ok && soft.total < every.total, `${soft.total} kg against ${every.total} kg`);
});

test('frame sizing: steps pass over a heavier choice that is weaker this way, to the lightest that meets the limits, as every design does', () => {
  // The 1000 mm beam on two supports, 1000 N at its middle, its sag held to 5 mm. Three choices by mass: bar 20 (400 mm²,
  // I 13 333 mm⁴), a 60 x 10 plate lying flat (600 mm², I = 60 x 10³ / 12 = 5000 mm⁴) and bar 30 (900 mm², I 67 500).
  // Hand, P L³ / 48 E I (Roark's, table 8.1, case 1e): bar 20 sags 1e12 / (48 x 70000 x 13 333) = 22.32 mm, the plate
  // 1e12 / (48 x 70000 x 5000) = 59.52 mm (heavier, and weaker), bar 30 4.409 mm, inside 5. A search that only steps
  // to the next choice by mass stops at bar 20, as the plate does not help, and wrongly finds nothing that meets it
  const model = { nodes: { a: [0, 0, 0], m: [500, 0, 0], b: [1000, 0, 0] }, elements: ['a', 'm'].map((a, i) => ({ id: `beam${i + 1}`, of: 'beam', a, b: ['m', 'b'][i], section: square(20).section, material: strong })),
    supports: { a: { x: true, y: true, z: true, rx: true }, b: { y: true, z: true } }, loads: [{ node: 'm', force: [0, 0, -1000] }] };
  const plate = { name: 'plate 60 x 10', section: { A: 600, Iy: (60 * 10 ** 3) / 12, Iz: (10 * 60 ** 3) / 12, J: 0.291 * 60 * 10 ** 3, cy: 30, cz: 5 }, material: strong }; // (J = 0.291 b t³ at b/t 6, Roark's table 10.1)
  const o = (search) => ({ groups: { beam: ['beam'] }, choices: [square(20), plate, square(30)], search, limits: { deflection: [{ node: 'm', limit: 5 }] } });
  const steps = sizing(model, o('steps')), every = sizing(model, o('every'));
  assert.deepEqual([steps.ok, steps.groups[0].choice, every.groups[0].choice], [true, 'bar 30', 'bar 30']);
  close('sizing: bar 30 sags 4.409 mm', 5 / steps.groups[0].margin, 1e12 / (48 * 70000 * 30 ** 4 / 12));
  // the limit that set it names the next lighter choice, the plate, and how far over it goes
  assert.equal(steps.groups[0].governs.lighter, 'plate 60 x 10');
  close('sizing: the plate is 11.9 times over 5 mm', steps.groups[0].governs.broken, 1e12 / (48 * 70000 * 5000) / 5);
});

test('frame sizing: a frequency floor sets a cantilever\'s bar as one mass on a spring says; every model given is held to the stress limit', () => {
  // A 500 mm cantilever with 2 kg at its tip that rings and does not weigh (inertia). Hand: k = 3 E I / L³ and, by
  // Rayleigh, the beam adds 33/140 of its own mass at the tip (Blevins 1979, table 8-8), f = √(1000 k / m) / 2π.
  // Bar 30: k = 3 x 70000 x 67 500 / 500³ = 113.4 N/mm; m = 2 + 0.2357 x 1.215 = 2.286 kg; f = 35.4 Hz.
  // Bar 20: k = 22.40 N/mm; m = 2 + 0.2357 x 0.54 = 2.127 kg; f = 16.3 Hz. A floor of 30 Hz takes bar 30.
  const model = { nodes: { a: [0, 0, 0], b: [500, 0, 0] }, elements: [{ id: 'arm', a: 'a', b: 'b', section: square(20).section, material: strong }], supports: { a: 'fixed' } };
  const r = sizing(model, { groups: { arm: ['arm'] }, choices: [20, 30, 40].map(square), limits: { frequency: { Hz: 30 } }, cases: [{ inertia: { b: 2 } }] });
  const [g] = r.groups, hz = (b) => { const I = b ** 4 / 12, k = (3 * 70000 * I) / 500 ** 3, m = 2 + (33 / 140) * (b * b * 500 * 2.7e-6); return Math.sqrt((1000 * k) / m) / (2 * Math.PI); };
  assert.deepEqual([g.choice, g.governs.limit], ['bar 30', 'frequency']);
  close('sizing: bar 30 rings as a mass on a spring', g.governs.value, hz(30), 0.01);
  close('sizing: bar 20 falls short of 30 Hz', g.governs.broken, 30 / hz(20), 0.01);
  // The stress limit holds in every model given, the first and the rest (a frame with its joins' springs, and the same
  // frame with them rigid, where a join's moment is larger). Here the second carries twice the first's tip load: the
  // root moment P L is 100 000 N·mm in the first, so bar 20 (W 1333 mm³) carries 75 MPa, under 205 / 2; in the second
  // 150 MPa, over it, which sets bar 30 (66.7 MPa there)
  const one = { ...model, loads: [{ node: 'b', force: [0, 0, -200] }] }, two = { ...model, loads: [{ node: 'b', force: [0, 0, -400] }] };
  const o = { groups: { arm: ['arm'] }, choices: [20, 30, 40].map(square), limits: { stress: { margin: 2 } } };
  assert.equal(sizing(one, o).groups[0].choice, 'bar 20');
  const both = sizing([one, two], o).groups[0];
  assert.deepEqual([both.choice, both.governs.limit], ['bar 30', 'stress']);
  close('sizing: bar 20 under the second model is over half its strength', both.governs.broken, 2 * (200000 / (20 ** 3 / 6)) / 205);
});

test('frame sizing: steps go on where two groups tie for the worst; a group at its lightest choice keeps the sag on its own nodes in its margin; the nearest design when nothing fits is ranked by every limit', () => {
  // 1. Two identical beams, 1000 mm simply supported, 1000 N at each middle, in two groups. With bar 20 each sags
  // P L³ / 48 E I = 1000 × 1000³ / (48 × 70000 × 13333.3) = 22.32 mm against 5 mm: both 4.46 times over, a tie. No
  // single group stepping up lowers the worst (the other still has it), so the search stalled on bar 20, bar 20.
  // Bar 30: I = 67500, 4.409 mm, 0.882 of the limit; bar 25 (I = 32552, 9.14 mm) fails. Both groups need bar 30.
  const nodes = { a1: [0, 0, 0], m1: [500, 0, 0], b1: [1000, 0, 0], a2: [0, 100, 0], m2: [500, 100, 0], b2: [1000, 100, 0] };
  const elements = [['a1', 'm1', 'p'], ['m1', 'b1', 'p'], ['a2', 'm2', 'q'], ['m2', 'b2', 'q']].map(([a, b, of], i) => ({ id: `e${i}`, of, a, b, section: square(20).section, material: strong }));
  const twin = { nodes, elements, supports: { a1: { x: true, y: true, z: true, rx: true }, b1: { y: true, z: true }, a2: { x: true, y: true, z: true, rx: true }, b2: { y: true, z: true } }, loads: [{ node: 'm1', force: [0, 0, -1000] }, { node: 'm2', force: [0, 0, -1000] }] };
  const tie = sizing(twin, { groups: { p: ['p'], q: ['q'] }, choices: [20, 25, 30, 35].map(square), search: 'steps', limits: { deflection: [{ node: 'm1', limit: 5 }, { node: 'm2', limit: 5 }] } });
  assert.ok(tie.ok, JSON.stringify(tie.worst));
  assert.deepEqual(tie.groups.map((g) => g.choice), ['bar 30', 'bar 30']);
  close('sizing: tied twins, the sag with bar 30', tie.checks.find((c) => c.where === 'm1').value, 1e12 / (48 * 70000 * 30 ** 4 / 12));
  // 2. One of them alone, 500 N at its middle, bar 20 the lightest choice: it sags 500 × 1000³ / (48 × 70000 ×
  // 13333.3) = 11.16 mm against 12 mm (0.930 of it), and its stress is (P L / 4) / (b³ / 6) = 125000 / 1333.3 =
  // 93.75 MPa against 205 (0.457 of it). Its margin is the nearer, 12 / 11.16 = 1.075, not the stress's 2.19.
  const one = { ...twin, nodes: { a1: nodes.a1, m1: nodes.m1, b1: nodes.b1 }, elements: elements.slice(0, 2), supports: { a1: twin.supports.a1, b1: twin.supports.b1 }, loads: [{ node: 'm1', force: [0, 0, -500] }] };
  const lone = sizing(one, { groups: { p: ['p'] }, choices: [20, 25].map(square), limits: { deflection: [{ node: 'm1', limit: 12 }], stress: { margin: 1 } } });
  assert.equal(lone.groups[0].choice, 'bar 20');
  close('sizing: a lightest group\'s margin from the sag at its own node', lone.groups[0].margin, 12 / (500e9 / (48 * 70000 * 20 ** 4 / 12)));
  // 3. A cantilever 500 mm with 100 N at its tip may be "light" (I = 39683 mm⁴, 0.5 kg/m) or "heavy" (I = 54113,
  // 40 kg/m). Tip sag F L³ / 3 E I = 1.25e10 / (2.1e5 I): light 1.500 mm, heavy 1.100 mm, against 1 mm. Their lowest
  // modes, 1.875² / 2π √(E I / m L⁴): light about 166 Hz, heavy about 21.7 Hz, against 70 Hz: heavy 3.23 times under.
  // Neither fits; the nearer is light (1.5 times over at worst), though heavy is nearer by the sag alone (1.1).
  const ch = (name, I, mass) => ({ name, section: { A: 100, Iy: I, Iz: I, J: I }, material: alu, mass });
  const arm = { nodes: { a: [0, 0, 0], b: [500, 0, 0] }, elements: [{ id: 'arm', a: 'a', b: 'b', section: ch('x', 1000).section, material: alu }], supports: { a: 'fixed' }, loads: [{ node: 'b', force: [0, 0, -100] }] };
  const none = sizing(arm, { groups: { arm: ['arm'] }, choices: [ch('light', 39683, 0.5), ch('heavy', 54113, 40)], search: 'every', limits: { deflection: [{ node: 'b', limit: 1 }], frequency: { Hz: 70 } } });
  assert.equal(none.ok, false);
  assert.equal(none.groups[0].choice, 'light');
  close('sizing: the nearest design, by every limit', none.worst.ratio, 1.25e10 / (2.1e5 * 39683), 1e-3);
});

test('frame sizing: what is wrong with a request is said by name, before any solve', () => {
  const model = { nodes: { a: [0, 0, 0], b: [500, 0, 0] }, elements: [{ id: 'arm', a: 'a', b: 'b', section: square(20).section, material: strong }], supports: { a: 'fixed' }, loads: [{ node: 'b', force: [0, 0, -10] }] };
  const ok = { groups: { arm: ['arm'] }, choices: [square(20)], limits: { stress: { margin: 2 } } };
  const bad = (change, code, text) => assert.throws(() => sizing(model, { ...ok, ...change }), (e) => { assert.equal(e.code, `fea.frame.${code}`, e.message); assert.match(e.message, text); return true; });
  bad({ shape: 1 }, 'input', /sizing has no option "shape"/);
  bad({ groups: {} }, 'input', /groups is \{ name: \[members\] \}/);
  bad({ groups: { arm: ['leg'] } }, 'input', /group "arm" names member "leg", and no element is it or a piece of it/);
  bad({ groups: { arm: ['arm'], also: ['arm'] } }, 'input', /member "arm" is in group "arm" and in group "also"/);
  bad({ choices: [] }, 'input', /choices is a list/);
  bad({ choices: [{ name: 'x', section: { A: 1, Iy: 0, Iz: 1, J: 1 } }] }, 'section', /choice "x"'s section has Iy = 0/);
  bad({ choices: [square(20), square(20)] }, 'input', /choice "bar 20" is listed twice/);
  bad({ limits: {} }, 'input', /limits is \{ deflection, stress, buckling, frequency \}/);
  bad({ limits: { sag: 1 } }, 'input', /limits has no "sag"/);
  bad({ limits: { deflection: [{ node: 'q', limit: 1 }] } }, 'node', /names node "q"/);
  bad({ limits: { deflection: [{ node: 'b', limit: 0 }] } }, 'input', /limits.deflection 1's limit \(mm\) is above 0/);
  bad({ limits: { frequency: { Hz: -1 } } }, 'input', /limits.frequency.Hz is above 0/);
  bad({ by: 'cost' }, 'input', /sizing by cost, and choice "bar 20" gives no cost per metre/);
  bad({ only: { arm: ['bar 99'] } }, 'input', /only.arm names "bar 99", which is not a choice/);
  bad({ search: 'all' }, 'input', /search is 'every'/);
  // by cost where every choice gives one: the cheaper, though heavier
  const r = sizing(model, { ...ok, by: 'cost', choices: [{ ...square(20), cost: 9 }, { ...square(30), cost: 4 }] });
  assert.deepEqual([r.by, r.groups[0].choice, r.total], ['cost', 'bar 30', 2]);
  // a choice turned a quarter: a 20 x 40 bar standing on edge is stiffer that way, at the same mass, and is chosen
  const flat = { name: 'flat', section: { A: 800, Iy: (40 * 20 ** 3) / 12, Iz: (20 * 40 ** 3) / 12, J: 0.229 * 40 * 20 ** 3, cy: 20, cz: 10 }, material: strong };
  const t = sizing(model, { groups: { arm: ['arm'] }, choices: [flat, { ...flat, name: 'on edge', roll: 90 }], limits: { deflection: [{ node: 'b', limit: 0.05 }] } });
  assert.equal(t.groups[0].choice, 'on edge');
  assert.equal(t.model.elements[0].roll, 90);
});
