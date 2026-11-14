// The frame solver against closed-form answers, the voxel solver, and its own refusals. Run from test.mjs (so the
// repository's test command picks it up). FRAME_REPORT=1 prints each case's error as a table.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { frame, statics, buckling, modes, subdivide, elementMatrices } from '@rulecad/fea/frame';
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
