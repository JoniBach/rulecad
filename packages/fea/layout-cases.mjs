// The layout optimiser (@rulecad/fea/layout) against hand calculations and Michell's closed form, and its refusals.
// Run from test.mjs (so the repository's test command picks it up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, groundStructure, nodeGrid, layoutFrame, layoutJoints } from '@rulecad/fea/layout';
import { statics } from '@rulecad/fea/frame';

const near = (got, want, tol, what) => assert.ok(Math.abs(got / want - 1) <= tol, `${what}: ${got} against ${want}, ${(100 * Math.abs(got / want - 1)).toFixed(4)}% out (allowed ${100 * tol}%)`);
// two bars from a load P down at (L, 0) to pins at (0, ±h)
const twoBar = (o = {}) => ({ nodes: { A: [0, 300], B: [0, -300], C: [400, 0] }, supports: { A: 'pinned', B: 'pinned' }, loads: [{ node: 'C', force: [0, -1000] }], strength: 100, ...o });

test('layout: two bars to two pins, by hand', () => {
  // Each bar is 500 mm long (a 300-400-500 triangle) and at sin α = 300 / 500 to the load's line across: by
  // statics each carries P / (2 sin α) = 1000 / (2 × 0.6) = 833.33 N, the upper in tension and the lower in
  // compression. Areas N / σ = 8.3333 mm², volume 2 × 8.3333 × 500 = 8333.3 mm³ (= P (L² + h²) / (h σ)).
  const r = layout(twoBar());
  near(r.volume, 8333.3333, 1e-7, 'volume');
  assert.equal(r.members.length, 2);
  const up = r.members.find((m) => m.id === 'A-C'), down = r.members.find((m) => m.id === 'B-C');
  near(up.forces[0], 833.3333, 1e-7, 'upper bar, tension'); near(-down.forces[0], 833.3333, 1e-7, 'lower bar, compression');
  near(up.area, 8.33333, 1e-6, 'upper area'); assert.equal(up.kind, 'tension'); assert.equal(down.kind, 'compression');
  assert.ok(r.strain <= 1 + 1e-5, `no candidate past its limit (${r.strain})`);
  assert.equal(r.mass, null, 'no density, no mass');
  // half the compression strength: the squeezed bar doubles, 8.3333 × 500 + 16.667 × 500 = 12500 mm³; and a density
  const weak = layout(twoBar({ strength: { tension: 100, compression: 50 }, density: 7.85 }));
  near(weak.volume, 12500, 1e-7, 'volume, weaker in compression');
  near(weak.members.find((m) => m.id === 'B-C').area, 16.6667, 1e-5, 'the squeezed bar');
  near(weak.mass, (12500 * 7.85) / 1e6, 1e-7, 'mass, kg: mm³ × g/cm³ / 10⁶');
});

test('layout: Michell\'s wheel, a couple carried between two circles, against his closed form', () => {
  // A couple M on an inner circle of radius r carried to an outer one of radius R, both pinned all round: Michell
  // (1904) found the least volume 2 M ln(R / r) / σ, a net of spirals at 45° to the radius. His bound by virtual
  // work: the field u_r = 0, u_θ = c r ln(R / r) has ε_rr = ε_θθ = 0 and ε_rθ = ½ (du_θ/dr − u_θ/r) = −c/2, so
  // its principal strains are ±c/2 at 45°; with c/2 = ε no member anywhere strains more than ε. It vanishes on the
  // outer circle, and the tangential loads (Σ F r = M) do work Σ F u_θ(r) = c M ln(R / r) = 2 ε M ln(R / r). Any
  // frame at stresses up to σ does internal work Σ N δ ≤ Σ |N| l ε = σ ε V, so V ≥ 2 M ln(R / r) / σ.
  // Nodes on rings r e^(jΔ), Δ = 2π / nt, nt to a ring, so the 45° spirals run node to node; then R / r = e^(nr Δ)
  // and the least volume is 2 M nr Δ / σ. With M = 10⁵ N·mm, σ = 100 MPa, nt = 32, nr = 6: Δ = 0.19635,
  // 2 × 10⁵ × 6 × 0.19635 / 100 = 2356.19 mm³. The layout's chords are straight where the spirals curve, so it
  // can only be above, by about Δ² / 6 (0.64% here), falling fourfold each time Δ halves.
  const wheel = (nt, nr) => {
    const nodes = {}, loads = [], supports = {}, d = (2 * Math.PI) / nt, M = 1e5, r = 50;
    for (let j = 0; j <= nr; j++) for (let i = 0; i < nt; i++) nodes[`${j}:${i}`] = [r * Math.exp(j * d) * Math.cos(i * d), r * Math.exp(j * d) * Math.sin(i * d)];
    for (let i = 0; i < nt; i++) { const F = M / (nt * r); loads.push({ node: `0:${i}`, force: [-F * Math.sin(i * d), F * Math.cos(i * d)] }); supports[`${nr}:${i}`] = 'pinned'; }
    return { problem: { nodes, loads, supports, strength: 100 }, exact: (2 * M * nr * d) / 100, d };
  };
  const errors = [];
  for (const [nt, nr] of [[16, 3], [32, 6]]) {
    const { problem, exact, d } = wheel(nt, nr), r = layout(problem), err = r.volume / exact - 1;
    errors.push(err);
    assert.ok(err >= -1e-6, `never under Michell's bound: ${r.volume} against ${exact}`);
    assert.ok(err <= d * d / 5, `within Δ²/5 of it: ${(100 * err).toFixed(3)}% (nt ${nt})`);
    assert.ok(r.strain <= 1 + 1e-5, 'no left-out candidate would lower it');
    assert.ok(r.programme < r.candidates / (nt > 16 ? 20 : 5), `member adding held a small share of the candidates (${r.programme} of ${r.candidates})`);
    // the spirals: every kept member at 45° to the radius (within half a step), tension and compression in equal numbers
    assert.equal(r.members.length, 2 * nt * nr, 'two spirals from every node out to the rim');
    for (const m of r.members) {
      const a = r.nodes[m.a], b = r.nodes[m.b], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], u = [b[0] - a[0], b[1] - a[1]];
      const cos = Math.abs(u[0] * mid[0] + u[1] * mid[1]) / (Math.hypot(...u) * Math.hypot(...mid)), angle = (Math.acos(cos) * 180) / Math.PI;
      assert.ok(Math.abs(angle - 45) < (d * 90) / Math.PI, `member ${m.id} at ${angle.toFixed(2)}° to the radius`);
    }
    assert.equal(r.members.filter((m) => m.kind === 'tension').length, nt * nr);
  }
  near(errors[0] / errors[1], 4, 0.15, 'the excess falls fourfold as the step halves');
  assert.ok(errors[1] < 0.007, `32 to a ring: within 0.7% (${(100 * errors[1]).toFixed(3)}%)`);
});

test('layout: member adding finds the same least volume as every candidate at once', () => {
  // A cantilever: pins at two nodes of a 160 x 80 mm grid's left edge, a load down at the right edge's middle
  const problem = { grid: { from: [0, 0], to: [160, 80], pitch: 20 }, supports: { '0,0': 'pinned', '0,4': 'pinned' }, loads: [{ node: '8,2', force: [0, -100] }], strength: 100 };
  const added = layout(problem), all = layout(problem, { adding: false });
  near(added.volume, all.volume, 1e-6, 'the same volume');
  assert.ok(added.programme < all.programme / 2, `in a programme under half the size (${added.programme} against ${all.programme})`);
  assert.ok(added.rounds >= 2, 'members were added');
  // a joint's cost (Parkes 1975) trades volume for fewer, longer members
  const joined = layout({ ...problem, joint: 100 });
  assert.ok(joined.members.length < added.members.length, `fewer members with joints costed (${joined.members.length} against ${added.members.length})`);
  assert.ok(joined.volume >= added.volume * (1 - 1e-9), 'and never less material');
});

test('layout: several load cases share one set of areas', () => {
  // Pins at A (0, 0) and B (L, 0), a node C at (0, L), L = 100 mm, σ = 10 MPa, P = 100 N. Down at C alone, the bar
  // A-C carries P: P L / σ = 1000 mm³. Across at C alone (P along x), C-B (L√2 long) carries P√2 and A-C P:
  // (P√2 × L√2 + P L) / σ = 3000 mm³. Both, as two cases: A-C as thick as P / σ = 10 mm² (both cases need it),
  // C-B √2 P / σ = 14.142 mm², 1000 + 2000 = 3000 mm³, not the 4000 of the two summed.
  const nodes = { A: [0, 0], B: [100, 0], C: [0, 100] }, base = { nodes, supports: { A: 'pinned', B: 'pinned' }, strength: 10 };
  near(layout({ ...base, loads: [{ node: 'C', force: [0, -100] }] }).volume, 1000, 1e-7, 'down alone');
  near(layout({ ...base, loads: [{ node: 'C', force: [100, 0] }] }).volume, 3000, 1e-7, 'across alone');
  const both = layout({ ...base, cases: [{ label: 'down', loads: [{ node: 'C', force: [0, -100] }] }, { label: 'across', loads: [{ node: 'C', force: [100, 0] }] }] });
  near(both.volume, 3000, 1e-7, 'both cases');
  assert.deepEqual(both.cases, ['down', 'across']);
  near(both.members.find((m) => m.id === 'B-C').area, 14.1421, 1e-5, 'C-B'); near(both.members.find((m) => m.id === 'A-C').area, 10, 1e-6, 'A-C');
  assert.equal(both.members.find((m) => m.id === 'A-C').forces.length, 2, 'a force for each case');
  // on a grid, members are added for both cases at once: the same volume as every candidate in one programme
  const grid = { grid: { from: [0, 0], to: [120, 60], pitch: 20 }, supports: { '0,0': 'pinned', '0,3': 'pinned' }, strength: 100,
    cases: [{ loads: [{ node: '6,1', force: [0, -100] }] }, { loads: [{ node: '6,1', force: [60, 80] }] }] };
  const added = layout(grid), all = layout(grid, { adding: false });
  near(added.volume, all.volume, 1e-6, 'two cases, members added');
  assert.ok(added.rounds >= 2 && added.strain <= 1 + 1e-5);
});

test('layout: a tripod in space, and a region kept clear', () => {
  // A load P = 900 N down at (0, 0, h), h = 400 mm, three pins at radius c = 300 mm round the origin on z = 0:
  // each leg is l = √(c² + h²) = 500 mm and carries P l / (3 h) = 375 N in compression; V = 3 × 375 × 500 / σ =
  // 5625 mm³ at σ = 100 MPa (= P l² / (h σ)).
  const nodes = { top: [0, 0, 400] };
  for (let k = 0; k < 3; k++) nodes[`foot${k}`] = [300 * Math.cos((2 * Math.PI * k) / 3), 300 * Math.sin((2 * Math.PI * k) / 3), 0];
  const r = layout({ nodes, supports: { foot0: 'pinned', foot1: 'pinned', foot2: 'pinned' }, loads: [{ node: 'top', force: [0, 0, -900] }], strength: 100 });
  assert.equal(r.plane, false); near(r.volume, 5625, 1e-7, 'tripod volume');
  for (const m of r.members) near(-m.forces[0], 375, 1e-6, `${m.id}'s force`);
  // a two-bar's straight members cross a ball kept clear between them: the layout goes round it on grid nodes
  const grid = { from: [0, -300], to: [400, 300], pitch: 50 }, avoid = [{ at: [200, 150], r: 60 }];
  const clear = layout({ ...twoBar(), grid, avoid });
  for (const m of clear.members) {
    const a = clear.nodes[m.a], b = clear.nodes[m.b], d = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((200 - a[0]) * d[0] + (150 - a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2)));
    assert.ok(Math.hypot(a[0] + t * d[0] - 200, a[1] + t * d[1] - 150) >= 60 * (1 - 1e-6), `member ${m.id} keeps out of the ball`);
  }
  assert.ok(clear.volume > 8333.34, `going round costs material (${clear.volume})`);
  // members may pass through a region marked through, which still keeps grid nodes out
  const through = layout({ ...twoBar(), grid, avoid: [{ ...avoid[0], through: true }] });
  near(through.volume, 8333.3333, 1e-6, 'straight through');
  assert.ok(Object.values(nodeGrid(grid)).length > Object.keys(through.nodes).length);
});

test('layout: the ground structure leaves out members through a third node, and beyond reach', () => {
  // three nodes in a row and one above: of the six pairs, the long row member passes through the middle node
  const g = groundStructure({ a: [0, 0], b: [10, 0], c: [20, 0], d: [10, 10] });
  assert.equal(g.members.length, 5);
  assert.ok(!g.members.some((m) => g.ids[m.a] === 'a' && g.ids[m.b] === 'c'));
  assert.equal(groundStructure({ a: [0, 0], b: [10, 0], c: [20, 0], d: [10, 10] }, { reach: 12 }).members.length, 3, 'a-d and c-d are 14.1 mm, out of reach');
  assert.equal(Object.keys(nodeGrid({ from: [0, 0, 0], to: [20, 10, 10], pitch: 10 })).length, 3 * 2 * 2);
});

test('layout: refused by name', () => {
  const code = (fn, want) => assert.throws(fn, (e) => e.code === `fea.layout.${want}`);
  code(() => layout({ ...twoBar(), sizes: 1 }), 'input');
  code(() => layout(twoBar(), { keeps: 1 }), 'input');
  code(() => layout({ ...twoBar(), strength: 0 }), 'strength');
  code(() => layout({ ...twoBar(), strength: { tension: 100 } }), 'strength');
  code(() => layout({ ...twoBar(), supports: { Z: 'pinned' } }), 'support');
  code(() => layout({ ...twoBar(), supports: { A: 'fixed' } }), 'support');
  code(() => layout({ ...twoBar(), loads: [{ node: 'Z', force: [0, 1] }] }), 'load');
  code(() => layout({ ...twoBar(), cases: [{ loads: [{ node: 'C', force: [0, 1] }] }] }), 'input');
  code(() => layout({ ...twoBar(), nodes: { A: [0, 300], B: [0, 300], C: [400, 0] } }), 'node');
  code(() => layout({ ...twoBar(), plane: true, nodes: { A: [0, 300, 0], B: [0, -300, 0], C: [400, 0, 5] } }), 'input');
  code(() => layout({ ...twoBar(), avoid: [{ at: [400, 0], r: 10 }] }), 'node');
  // nodes in a row pushed across it: no frame of them stands
  code(() => layout({ nodes: { a: [0, 0], b: [10, 0], c: [20, 0] }, supports: { a: 'pinned', c: 'pinned' }, loads: [{ node: 'b', force: [0, -1] }], strength: 1 }), 'unstable');
  code(() => layoutFrame({}, {}), 'input');
  code(() => layoutJoints(layout(twoBar()), {}), 'input');
});

test('layout: handed on as a frame to solve, and as joints to optimise', () => {
  // The two bars as a frame of round bars of their areas, pinned: statics gives the layout's forces back (the
  // frame is statically determinate), and a bar's stress is σ = 100 MPa
  const r = layout(twoBar()), f = layoutFrame(r, { material: { E: 200000, nu: 0.3 }, ends: 'pinned' });
  assert.equal(f.model.supports.A.z, true, 'a flat layout is held out of its plane');
  const s = statics(f.model);
  for (const e of s.elements) near(e.axial, r.members.find((m) => m.id === e.id).forces[0], 1e-6, `${e.id}'s force in the frame`);
  near(Math.abs(s.elements[0].axial) / f.model.elements[0].section.A, 100, 1e-6, 'stress at the strength');
  // the loaded node C as a joint: the two stubs, A-C held (the larger force; they tie, so the first), B-C loaded with
  // its force along it, the outside load at the node; and the joint stands: Σ forces + the load = 0
  const [j] = layoutJoints(r, { material: 'pla' });
  assert.equal(j.node, 'C'); assert.equal(j.members.length, 2);
  const sum = [0, 1].map((d) => j.members.reduce((t, e) => t + e.direction[d] * e.forces[0], 0) + [0, -1000][d]);
  assert.ok(Math.hypot(...sum) < 1e-3, `the joint is in balance (${sum})`);
  const p = j.problem;
  for (const k of ['material', 'cell', 'space', 'supports', 'loads']) assert.ok(k in p, `the problem has ${k}`);
  assert.equal(p.thickness, j.members[0].diameter, 'flat: as thick as the widest member');
  assert.equal(p.loads.length, 2, 'the other stub, and the outside load');
  near(Math.hypot(...p.loads[0].force), 833.333, 1e-5, 'the stub\'s load is its force');
  // the frame's own forces in place of the layout's, refused when they do not fit
  assert.deepEqual(layoutJoints(r, { material: 'pla', forces: { 'A-C': [800], 'B-C': [-800] } })[0].members.find((e) => e.id === 'B-C').forces, [-800]);
  assert.throws(() => layoutJoints(r, { material: 'pla', forces: { 'A-C': [1, 2] } }), (e) => e.code === 'fea.layout.input');
});
