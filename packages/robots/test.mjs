import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chain, planar2R, chainFromMotion, checkChain, fk, ik, jacobian, manipulability, singularityDistance, zeros,
  reach, sheetFrame, sheetCorners, PAPER, svgToStrokes, orderStrokes, planToolpath, stepBlocks, estimate, replay
} from '@rulecad/robots';

const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (±${tol})`);
const nearAll = (a, b, tol, what = '') => { assert.equal(a.length, b.length, what); a.forEach((x, i) => near(x, b[i], tol, `${what}[${i}]`)); };
const D = Math.PI / 180;
const refused = (fn, code, words) => assert.throws(fn, (e) => { assert.equal(e.code, code, e.message); if (words) assert.match(e.message, words); return true; });

// ---------- the worked arm, by hand ----------
test('a 150 + 120 arm reaches (200, 50) both ways, by hand', () => {
  const arm = planar2R(150, 120);
  // cos(elbow) = (200^2 + 50^2 - 150^2 - 120^2) / (2 * 150 * 120) = 5600 / 36000
  const phi = Math.acos(5600 / 36000) / D, toward = Math.atan2(50, 200) / D;
  const lean = Math.atan2(120 * Math.sin(phi * D), 150 + 120 * Math.cos(phi * D)) / D;
  const right = ik(arm, [200, 50], { elbow: 'right' }), left = ik(arm, [200, 50], { elbow: 'left' });
  assert.equal(right.method, 'planar2R'); assert.ok(right.ok && left.ok);
  nearAll(right.q, [toward - lean, phi], 1e-9, 'right'); nearAll(left.q, [toward + lean, -phi], 1e-9, 'left');
  near(right.q[0], -21.06338, 1e-4); near(right.q[1], 81.05098, 1e-4);
  for (const r of [right, left]) { const p = fk(arm, r.q).position; nearAll(p, [200, 50, 0], 1e-9, 'fk'); }
  // seen from above, elbow right sits to the right of the line from shoulder to target
  const elbow = (q) => fk(arm, q).frames[1].at, side = (e) => 200 * e[1] - 50 * e[0];
  assert.ok(side(elbow(right.q)) < 0, 'right is on the right'); assert.ok(side(elbow(left.q)) > 0, 'left is on the left');
});

test('with no elbow named, the branch is the one within limits, or nearest the start', () => {
  const arm = planar2R(150, 120, { limits: [[-180, 180], [-180, 0]] });
  const r = ik(arm, [200, 50]);
  assert.equal(r.elbow, 'left'); assert.ok(r.q[1] < 0);
  const free = planar2R(150, 120);
  assert.equal(ik(free, [200, 50]).elbow, 'right');
  assert.equal(ik(free, [200, 50], { start: [50, -80] }).elbow, 'left');
});

test('the round trip holds to 1e-6 everywhere on an A5 sheet, on both elbows', () => {
  const arm = planar2R(150, 120), s = sheetFrame({ size: 'a5', at: [0, 150, 0] });
  for (let i = 0; i <= 29; i++) for (let j = 0; j <= 42; j++) {
    const x = s.at[0] - 74 + (148 * i) / 29, y = s.at[1] - 105 + (210 * j) / 42;
    for (const elbow of ['left', 'right']) {
      const r = ik(arm, [x, y], { elbow });
      assert.ok(r.ok, `${x}, ${y}`);
      nearAll(fk(arm, r.q).position, [x, y, 0], 1e-6, `${x},${y} ${elbow}`);
    }
  }
});

test('a chain with offsets, opposite axes and a rest angle still solves in closed form', () => {
  const c = chain({ joints: [
    { name: 'a', type: 'revolute', origin: [10, 20, 30], axis: [0, 0, 1], limits: [-170, 170] },
    { name: 'b', type: 'revolute', origin: [90, 40, 5], axis: [0, 0, -1], limits: [-170, 170] }
  ], tool: [60, -30, 7] });
  for (const q of [[20, 40], [-60, 110], [100, -30]]) {
    const p = fk(c, q).position;
    const r = ik(c, p, { start: q });
    assert.ok(r.ok); assert.equal(r.method, 'planar2R');
    nearAll(fk(c, r.q).position, p, 1e-9, 'solved');
    nearAll(r.q, q, 1e-6, 'same branch');
  }
  // the height is part of the target
  const off = ik(c, [150, 20, 99]);
  assert.equal(off.ok, false); near(off.miss, 99 - 42, 1e-9, 'height');
});

test('the numeric solver matches the closed form', () => {
  const arm = planar2R(150, 120);
  for (const t of [[200, 50], [-120, 180], [60, 90], [10, 250]]) for (const elbow of ['left', 'right']) {
    const cf = ik(arm, t, { elbow });
    const nu = ik(arm, t, { method: 'numeric', start: [cf.q[0] + 4, cf.q[1] + 4] });
    assert.ok(nu.ok, `${t}`); assert.equal(nu.method, 'numeric');
    nearAll(nu.q, cf.q, 1e-4, `${t} ${elbow}`);
    assert.ok(nu.error <= 1e-6);
  }
});

test('a target past the reach is refused with the distance it misses by', () => {
  const arm = planar2R(150, 120);
  const out = ik(arm, [300, 0]);
  assert.equal(out.ok, false); near(out.miss, 30, 1e-9); near(out.error, 30, 1e-9); assert.match(out.reason, /30\.000 mm/); assert.equal(out.code, 'reach');
  const inside = ik(arm, [10, 0]);
  assert.equal(inside.ok, false); near(inside.miss, 20, 1e-9, 'inner hole');
  const numeric = ik(arm, [320, 0], { method: 'numeric' });
  assert.equal(numeric.ok, false); near(numeric.miss, 50, 1e-3, 'numeric');
});

test('limits: a pose past them is refused with how far the nearest allowed pose misses', () => {
  const arm = planar2R(150, 120, { limits: [[0, 40], [0, 90]] });
  assert.ok(ik(arm, fk(arm, [20, 60]).position).ok);
  const r = ik(arm, [-100, 150]);
  assert.equal(r.ok, false); assert.equal(r.code, 'limits'); assert.ok(r.miss > 1); assert.match(r.reason, /limit/);
  r.q.forEach((x, i) => { assert.ok(x >= [0, 0][i] - 1e-9 && x <= [40, 90][i] + 1e-9); });
  // the numeric solver honours limits too
  const n = ik(arm, [-100, 150], { method: 'numeric' });
  assert.equal(n.ok, false); near(n.miss, r.miss, 1e-3, 'same closest pose');
  // a target only one elbow reaches, within the limits, is found on that elbow; asking for the other is refused
  const half = planar2R(150, 120, { limits: [[-180, 180], [0, 170]] });
  assert.equal(ik(half, [200, 50]).elbow, 'right');
  const no = ik(half, [200, 50], { elbow: 'left' });
  assert.equal(no.ok, false); assert.equal(no.code, 'limits');
});

test('angles outside (-180, 180] wrap into the limits', () => {
  const arm = planar2R(150, 120, { limits: [[90, 400], [-180, 180]] });
  const p = fk(arm, [370, 30]).position, r = ik(arm, p, { elbow: 'right' });
  assert.ok(r.ok); near(r.q[0], 370, 1e-6);
});

test('XY and XYZ axes are found and solved directly', () => {
  const xy = chain({ joints: [
    { name: 'x', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [0, 200] },
    { name: 'y', type: 'prismatic', origin: [0, 0, 0], axis: [0, 1, 0], limits: [0, 100] }
  ], tool: [5, 5, 2] });
  const r = ik(xy, [105, 55]);
  assert.equal(r.method, 'cartesian'); nearAll(r.q, [100, 50], 1e-12);
  const off = ik(xy, [300, 50]);
  assert.equal(off.ok, false); near(off.miss, 300 - 205, 1e-9, 'past x'); assert.equal(off.blocked, 'x');
  const xyz = chain({ joints: [
    { name: 'x', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [-50, 50] },
    { name: 'y', type: 'prismatic', origin: [0, 0, 0], axis: [0, 1, 0], limits: [-50, 50] },
    { name: 'z', type: 'prismatic', origin: [0, 0, 0], axis: [0, 0, -1], limits: [-50, 50] }
  ] });
  const t = ik(xyz, [10, -20, 30]);
  assert.equal(t.method, 'cartesian'); nearAll(t.q, [10, -20, -30], 1e-12);
  refused(() => ik(xyz, [1, 2]), 'ik.target', /x, y, z|\[x, y, z\]/);
});

test('a spatial arm solves numerically from a named start and reports when it cannot', () => {
  const c = chain({ joints: [
    { name: 'waist', type: 'revolute', origin: [0, 0, 80], axis: [0, 0, 1], limits: [-170, 170] },
    { name: 'shoulder', type: 'revolute', origin: [0, 0, 0], axis: [0, 1, 0], limits: [-120, 120] },
    { name: 'elbow', type: 'revolute', origin: [0, 0, 140], axis: [0, 1, 0], limits: [-150, 150] }
  ], tool: [130, 0, 0] });
  const want = [35, -20, 40], p = fk(c, want).position;
  const r = ik(c, p, { start: [30, -15, 35], tolerance: 1e-8 });
  assert.ok(r.ok); assert.equal(r.method, 'numeric'); assert.ok(r.error <= 1e-8);
  nearAll(fk(c, r.q).position, p, 1e-7, 'position');
  const far = ik(c, [900, 0, 80]);
  assert.equal(far.ok, false); assert.ok(far.miss > 400); assert.ok(['reach', 'limits'].includes(far.code));
});

test('a prismatic and a revolute together: the numeric solver takes mixed units', () => {
  const c = chain({ joints: [
    { name: 'rail', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [0, 300] },
    { name: 'arm', type: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], limits: [-90, 90] }
  ], tool: [80, 0, 0] });
  const p = fk(c, [120, 30]).position, r = ik(c, p, { start: [100, 20] });
  assert.ok(r.ok); nearAll(fk(c, r.q).position, p, 1e-6, 'p');
});

test('a chain from links is a planar arm with its tool at the end', () => {
  const c = chain({ links: [150, 120] });
  assert.deepEqual(c.names, ['joint1', 'joint2']);
  nearAll(fk(c, [0, 0]).position, [270, 0, 0], 1e-12);
  nearAll(fk(c, [90, 0]).position, [0, 270, 0], 1e-9);
  const three = chain({ links: [100, 80, 60] });
  nearAll(fk(three, [90, -90, 90]).position, [80, 100 + 60, 0], 1e-9);
});

test('a chain is plain data: through JSON it still works', () => {
  const c = planar2R(150, 120);
  const again = JSON.parse(JSON.stringify(c));
  nearAll(fk(again, [10, 20]).position, fk(c, [10, 20]).position, 1e-12);
  assert.ok(ik(again, [200, 50]).ok);
});

// The placement cad uses: child = parent · a · J(q) · inverse(b)
const mul = (m, n) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) o.push(m[r * 4] * n[c] + m[r * 4 + 1] * n[4 + c] + m[r * 4 + 2] * n[8 + c] + (c === 3 ? m[r * 4 + 3] : 0)); return o; };
const inv = (m) => { const t = [m[3], m[7], m[11]], o = []; for (let r = 0; r < 3; r++) { const row = [m[r], m[4 + r], m[8 + r]]; o.push(...row, -(row[0] * t[0] + row[1] * t[1] + row[2] * t[2])); } return o; };
const rz = (a) => { const c = Math.cos(a * D), s = Math.sin(a * D); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const tz = (d) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, d];
const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
// A frame with its z along an axis: as an assembly's anchor would be
const about = (at, ax) => {
  const l = Math.hypot(...ax), z = ax.map((v) => v / l), r = Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const d = r[0] * z[0] + r[1] * z[1] + r[2] * z[2], xr = r.map((v, k) => v - d * z[k]), xl = Math.hypot(...xr), x = xr.map((v) => v / xl);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], at[0], x[1], y[1], z[1], at[1], x[2], y[2], z[2], at[2]];
};

test('forward kinematics is the assembly placement: anchors, axes, a base, a fixed joint and a follower', () => {
  const base = translate(5, -3, 2);
  const j1 = { id: 'j1', type: 'revolute', parent: 0, child: 1, a: about([10, 0, 0], [0, 0, 1]), b: about([0, 0, 0], [0, 0, 1]), dofs: [[-90, 90, 0]] };
  const fixed = { id: 'weld', type: 'fixed', parent: 1, child: 2, a: about([30, 0, 0], [0, 0, 1]), b: about([0, 0, 0], [0, 0, 1]), dofs: [] };
  const j2 = { id: 'j2', type: 'revolute', parent: 2, child: 3, a: about([20, 5, 1], [0, 1, 1]), b: about([1, 2, 3], [0, 1, 1]), dofs: [[-120, 120, 0]] };
  const j3 = { id: 'j3', type: 'prismatic', parent: 3, child: 4, a: about([0, 0, 10], [1, 0, 0]), b: about([0, 0, 0], [1, 0, 0]), dofs: [[0, 50, 0]] };
  const j4 = { id: 'j4', type: 'revolute', parent: 4, child: 5, a: about([4, 4, 0], [0, 0, 1]), b: about([0, 0, 0], [0, 0, 1]), dofs: [[-180, 180, 0]], follow: ['j1', 2, 10] };
  const motion = { items: [['root', ...base], ['a'], ['weld'], ['b'], ['c'], ['d']], joints: [j1, fixed, j2, j3, j4] };
  const c = chainFromMotion(motion, { tip: 'd', tool: [3, 2, 1] });
  assert.deepEqual(c.names, ['j1', 'j2', 'j3']);
  assert.equal(c.joints.length, 4, 'the fixed joint folded away');
  const q = [33, -47, 12];
  let T = base;
  const worlds = [];
  for (const [j, v] of [[j1, q[0]], [fixed, null], [j2, q[1]], [j3, q[2]], [j4, q[0] * 2 + 10]]) {
    const M = j.type === 'fixed' ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] : j.type === 'prismatic' ? tz(v) : rz(v);
    T = mul(mul(mul(T, j.a), M), inv(j.b)); worlds.push(T);
  }
  const out = fk(c, q), tip = [3, 2, 1], exp = [T[0] * tip[0] + T[1] * tip[1] + T[2] * tip[2] + T[3], T[4] * tip[0] + T[5] * tip[1] + T[6] * tip[2] + T[7], T[8] * tip[0] + T[9] * tip[1] + T[10] * tip[2] + T[11]];
  nearAll(out.position, exp, 1e-9, 'tool');
  nearAll(out.frames[0].matrix, worlds[0], 1e-9, 'j1');
  nearAll(out.frames[1].matrix, worlds[2], 1e-9, 'j2');
  nearAll(out.frames[3].matrix, worlds[4], 1e-9, 'j4');
  // values by name, as cad holds them
  nearAll(fk(c, { j1: [33], j2: [-47], j3: [12] }).position, exp, 1e-9, 'by name');
});

test('a follower moves with its leader in the Jacobian, and in the solver', () => {
  const c = chain({ joints: [
    { name: 'a', type: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], limits: [-180, 180] },
    { name: 'b', type: 'revolute', origin: [100, 0, 0], axis: [0, 0, 1], limits: [-180, 180], follow: { joint: 'a', ratio: -1 } }
  ], tool: [80, 0, 0] });
  assert.equal(c.dof, 1);
  const q = [25], e = 1e-6, J = jacobian(c, q);
  const f = (v) => fk(c, [v]).position;
  for (let r = 0; r < 3; r++) near(J[r][0], (f(q[0] + e)[r] - f(q[0] - e)[r]) / (2 * e), 1e-5, 'row');
  const target = f(25), r = ik(c, target, { start: [20] });
  assert.ok(r.ok); near(r.q[0], 25, 1e-4);
});

test('the Jacobian is what finite differences say, in mm per degree and mm per mm', () => {
  const c = chain({ joints: [
    { name: 'waist', type: 'revolute', origin: [0, 0, 80], axis: [0, 0, 1], limits: [-170, 170] },
    { name: 'slide', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [0, 300] },
    { name: 'wrist', type: 'revolute', origin: [40, 0, 0], axis: [0, 1, 0], limits: [-120, 120] }
  ], tool: [0, 0, 60] });
  const q = [25, 70, -35], J = jacobian(c, q), h = 1e-6;
  J[0].forEach((_, k) => {
    const up = [...q], dn = [...q]; up[k] += h; dn[k] -= h;
    const a = fk(c, up).position, b = fk(c, dn).position;
    for (let r = 0; r < 3; r++) near(J[r][k], (a[r] - b[r]) / (2 * h), 1e-4, `J[${r}][${k}]`);
  });
  // at q = 0, a straight arm: the shoulder moves the tool 270 mm per radian
  const arm = planar2R(150, 120);
  near(jacobian(arm, [0, 0])[1][0], 270 * D, 1e-12); near(jacobian(arm, [0, 0])[1][1], 120 * D, 1e-12);
});

test('manipulability is l1 l2 |sin q2| for two links, and singularityDistance knows both shapes', () => {
  const arm = planar2R(150, 120);
  near(manipulability(arm, [13, 40]), 150 * 120 * Math.sin(40 * D), 1e-6);
  near(manipulability(arm, [13, 0]), 0, 1e-6);
  const s = singularityDistance(arm, [0, 5]);
  near(s.angle, 5, 1e-9); assert.ok(s.stretched);
  near(s.room, 270 - Math.hypot(150 + 120 * Math.cos(5 * D), 120 * Math.sin(5 * D)), 1e-9);
  const f = singularityDistance(arm, [0, 178]);
  near(f.angle, 2, 1e-9); assert.equal(f.stretched, false);
  refused(() => singularityDistance(chain({ links: [1, 2, 3] }), [0, 0, 0]), 'singularity.chain');
  // a third link in the plane keeps the plane's measure
  const three = chain({ links: [100, 80, 60] });
  assert.ok(manipulability(three, [10, 40, 30]) > 0);
});

// ---------- reach ----------
test('reach over an A5 sheet: samples, corners and the worst of them', () => {
  const arm = planar2R(150, 120), r = reach(arm, { sheet: { size: 'a5', at: [0, 150, 0] }, step: 10, elbow: 'right' });
  assert.equal(r.summary.total, r.samples.length);
  assert.equal(r.summary.reachable, r.samples.length);
  assert.equal(r.findings[0].code, 'reach.ok');
  assert.equal(r.summary.corners.length, 4);
  const farthest = Math.hypot(74, 255);
  near(r.summary.margin, Math.min(270 - farthest, 45 - 30), 1e-9, 'least margin is by hand');
  near(r.summary.worst.margin, r.summary.margin, 0);
  for (const s of r.samples) {
    assert.ok(s.reachable); near(s.miss, 0, 0);
    nearAll(fk(arm, s.q).position, s.point, 1e-6, 'sample');
    near(s.manipulability, manipulability(arm, s.q), 1e-9);
  }
  // corners in order: lower left first, as sheetCorners
  const corners = sheetCorners({ size: 'a5', at: [0, 150, 0] });
  r.summary.corners.forEach((c, i) => nearAll(c.point, corners[i], 1e-9, `corner ${i}`));
});

test('a sheet past the arm is reported at its worst sample, and limits shrink the region', () => {
  const arm = planar2R(150, 120), r = reach(arm, { sheet: { size: 'a4', at: [0, 200, 0] }, step: 20 });
  assert.ok(r.summary.reachable < r.summary.total);
  const f = r.findings[0];
  assert.equal(f.code, 'reach.miss'); assert.equal(f.level, 'fail'); assert.ok(f.box.hi[1] > f.box.lo[1]);
  near(r.summary.worst.miss, Math.hypot(105, 200 + 148.5) - 270, 0.5, 'worst corner, by hand');
  assert.ok(r.summary.margin < 0);
  nearAll(PAPER.a3, [297, 420], 0); assert.deepEqual(sheetFrame({ size: 'A6', landscape: true, at: [0, 0, 0] }).width, 148);
  const narrow = reach(planar2R(150, 120, { limits: [[0, 60], [-180, 180]] }), { region: { x: [-50, 50], y: [100, 150] }, step: 10 });
  assert.ok(narrow.samples.some((s) => s.reachable)); assert.ok(narrow.samples.some((s) => !s.reachable));
  const vol = reach(chain({ joints: [
    { name: 'x', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [0, 100] },
    { name: 'y', type: 'prismatic', origin: [0, 0, 0], axis: [0, 1, 0], limits: [0, 100] },
    { name: 'z', type: 'prismatic', origin: [0, 0, 0], axis: [0, 0, 1], limits: [0, 100] }
  ] }), { volume: { lo: [10, 20, 30], hi: [90, 80, 70] }, step: 40 });
  assert.equal(vol.summary.corners.length, 8); assert.equal(vol.summary.reachable, vol.summary.total);
  near(vol.summary.margin, 10, 1e-9, 'the x axis, 10 mm from its stop');
});

test('a sheet stood upright has its own axes', () => {
  const s = sheetFrame({ width: 100, height: 50, at: [0, 0, 100], normal: [0, -1, 0], u: [1, 0, 0] });
  nearAll(s.v, [0, 0, 1], 1e-12, 'v is up');
  nearAll(sheetCorners({ width: 100, height: 50, at: [0, 0, 100], normal: [0, -1, 0], u: [1, 0, 0] })[0], [-50, 0, 75], 1e-12);
});

// ---------- SVG ----------
const STROKE = (svg, o) => svgToStrokes(svg, { tolerance: 0.01, ...o });
const nearPts = (a, b, tol, what) => { assert.equal(a.length, b.length, `${what}: ${JSON.stringify(a)}`); a.forEach((p, i) => nearAll(p, b[i], tol, `${what}.${i}`)); };

test('every path command, absolute and relative', () => {
  const page = (d) => `<svg width="100mm" height="100mm" viewBox="0 0 100 100"><path d="${d}"/></svg>`;
  const pts = (d) => STROKE(page(d)).strokes[0].points;
  nearPts(pts('M1 2 L3 4 H5 V6 Z'), [[1, 2], [3, 4], [5, 4], [5, 6], [1, 2]], 1e-9, 'absolute');
  nearPts(pts('m1 2 l2 2 h2 v2 z'), [[1, 2], [3, 4], [5, 4], [5, 6], [1, 2]], 1e-9, 'relative');
  nearPts(pts('M1 2 3 4 5 4'), [[1, 2], [3, 4], [5, 4]], 1e-9, 'implicit lines after M');
  nearPts(pts('m1,2 2,2-.5-.5'), [[1, 2], [3, 4], [2.5, 3.5]], 1e-9, 'relative implicit');
  // a quarter circle by cubic and by arc: every point on the radius, both directions of sweep
  const onCircle = (points, c, r, tol) => points.forEach((p) => near(Math.hypot(p[0] - c[0], p[1] - c[1]), r, tol, 'on the circle'));
  const k = (4 / 3) * (Math.SQRT2 - 1) * 10;
  const q1 = pts(`M10 0 C10 ${k} ${k} 10 0 10`);
  nearAll(q1.at(-1), [0, 10], 1e-9); onCircle(q1, [0, 0], 10, 0.03);
  const c2 = pts(`M10 0 c0 ${k} ${k - 10} 10 -10 10`);
  nearAll(c2.at(-1), [0, 10], 1e-9); onCircle(c2, [0, 0], 10, 0.03);
  const arc = pts('M10 0 A10 10 0 0 1 0 10');
  nearAll(arc.at(-1), [0, 10], 1e-9); onCircle(arc, [0, 0], 10, 0.006);
  assert.ok(arc.every((p) => p[0] >= -1e-9 && p[1] >= -1e-9));
  const large = pts('M10 0 A10 10 0 1 0 0 10');
  assert.ok(large.some((p) => p[0] < -5), 'the long way round'); onCircle(large, [0, 0], 10, 0.006);
  const rel = pts('M10 0 a10 10 0 0 1 -10 10');
  nearAll(rel.at(-1), [0, 10], 1e-9); onCircle(rel, [0, 0], 10, 0.006);
  // flags run together, as optimisers write them
  nearAll(pts('M10 0a10 10 0 01-10 10').at(-1), [0, 10], 1e-9);
  nearAll(pts('M10 0A10 10 0 01 0 10').at(-1), [0, 10], 1e-9);
  // Q and T: a parabola and its smooth continuation by reflection
  const q = pts('M0 0 Q5 10 10 0 T20 0');
  nearAll(q.at(-1), [20, 0], 1e-9);
  const y = (x) => 5 - ((x - 5) * (x - 5)) / 5, y2 = (x) => -y(x - 10);
  q.forEach((p) => near(p[1], p[0] <= 10 ? y(p[0]) : y2(p[0]), 0.012, `parabola at ${p[0]}`));
  const qrel = pts('m0 0 q5 10 10 0 t10 0');
  nearAll(qrel.at(-1), [20, 0], 1e-9);
  const sm = pts('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
  nearAll(sm.at(-1), [20, 0], 1e-9);
  const smr = pts('M0 0 c0 10 10 10 10 0 s10 -10 10 0');
  nearAll(smr.at(-1), [20, 0], 1e-9);
  assert.ok(sm.some((p) => p[1] < -5), 'the S reflects its handle');
  // a new subpath after Z, and a relative one after a Z
  const two = STROKE(page('M0 0 L10 0 L10 10 Z m5 5 l1 1')).strokes;
  assert.equal(two.length, 2); nearPts(two[1].points, [[5, 5], [6, 6]], 1e-9, 'relative to the subpath start'); assert.equal(two[0].closed, true);
  assert.equal(two[0].name, 'path1#1');
  // broken data draws what came before and says so
  const broken = STROKE(page('M0 0 L10 0 L oops'));
  assert.equal(broken.strokes.length, 1); assert.equal(broken.findings[0].code, 'svg.path');
});

test('lines, polylines, polygons, rects, rounded rects, circles and ellipses', () => {
  const s = STROKE(`<svg width="200mm" height="200mm" viewBox="0 0 200 200">
    <line x1="0" y1="0" x2="10" y2="0"/>
    <polyline points="0,0 10,10 20,0"/>
    <polygon points="0,0 10,0 10,10"/>
    <rect x="1" y="2" width="30" height="20"/>
    <rect id="soft" x="1" y="2" width="30" height="20" rx="5"/>
    <circle cx="50" cy="60" r="20"/>
    <ellipse cx="50" cy="60" rx="30" ry="10"/>
    <text>skipped</text>
  </svg>`), l = s.strokes;
  assert.equal(l.length, 7);
  assert.deepEqual(l.map((x) => x.closed), [false, false, true, true, true, true, true]);
  nearPts(l[3].points, [[1, 2], [31, 2], [31, 22], [1, 22], [1, 2]], 1e-9, 'rect');
  near(Math.min(...l[4].points.map((p) => p[0])), 1, 1e-9); assert.equal(l[4].name, 'soft');
  assert.ok(l[4].points.length > 12, 'rounded');
  l[5].points.forEach((p) => near(Math.hypot(p[0] - 50, p[1] - 60), 20, 0.006, 'circle'));
  l[6].points.forEach((p) => near(((p[0] - 50) / 30) ** 2 + ((p[1] - 60) / 10) ** 2, 1, 0.004, 'ellipse'));
  assert.equal(s.findings[0].code, 'svg.skipped');
});

test('transforms: every kind, nested groups, in order', () => {
  const one = (t) => STROKE(`<svg width="100mm" height="100mm" viewBox="0 0 100 100"><g transform="${t}"><line x1="1" y1="0" x2="2" y2="0"/></g></svg>`).strokes[0].points;
  nearPts(one('translate(5 7)'), [[6, 7], [7, 7]], 1e-9, 'translate');
  nearPts(one('translate(5)'), [[6, 0], [7, 0]], 1e-9, 'translate x');
  nearPts(one('scale(2)'), [[2, 0], [4, 0]], 1e-9, 'scale');
  nearPts(one('scale(2,3)'), [[2, 0], [4, 0]], 1e-9, 'scale xy');
  nearPts(one('rotate(90)'), [[0, 1], [0, 2]], 1e-9, 'rotate');
  nearPts(one('rotate(90 1 0)'), [[1, 0], [1, 1]], 1e-9, 'rotate about');
  nearPts(one('matrix(1 2 3 4 5 6)'), [[6, 8], [7, 10]], 1e-9, 'matrix');
  const skew = STROKE(`<svg width="100mm" height="100mm" viewBox="0 0 100 100"><line transform="skewX(45)" x1="0" y1="10" x2="0" y2="20"/><line transform="skewY(45)" x1="10" y1="0" x2="20" y2="0"/></svg>`).strokes;
  nearPts(skew[0].points, [[10, 10], [20, 20]], 1e-9, 'skewX'); nearPts(skew[1].points, [[10, 10], [20, 20]], 1e-9, 'skewY');
  // rightmost applies first, and groups nest
  nearPts(one('translate(10 0) scale(2)'), [[12, 0], [14, 0]], 1e-9, 'order');
  const nested = STROKE(`<svg width="100mm" height="100mm" viewBox="0 0 100 100"><g transform="translate(10 0)"><g transform="scale(2)"><line transform="translate(1 0)" x1="0" y1="0" x2="1" y2="0"/></g></g></svg>`).strokes;
  nearPts(nested[0].points, [[12, 0], [14, 0]], 1e-9, 'nested');
  // a circle through a stretching transform is an ellipse, flattened in mm
  const e = STROKE(`<svg width="100mm" height="100mm" viewBox="0 0 100 100"><circle transform="scale(2 1)" cx="0" cy="0" r="10"/></svg>`).strokes[0];
  e.points.forEach((p) => near((p[0] / 20) ** 2 + (p[1] / 10) ** 2, 1, 0.004, 'stretched'));
});

test('units: viewBox and width to millimetres', () => {
  const pts = (attrs, body = '<line x1="0" y1="0" x2="100" y2="0"/>') => STROKE(`<svg ${attrs}>${body}</svg>`).strokes[0].points;
  nearAll(pts('width="50mm" height="50mm" viewBox="0 0 100 100"')[1], [50, 0], 1e-9, 'scaled');
  nearAll(pts('width="10cm" height="10cm" viewBox="0 0 100 100"')[1], [100, 0], 1e-9, 'cm');
  nearAll(pts('width="1in" height="1in" viewBox="0 0 100 100"')[1], [25.4, 0], 1e-9, 'in');
  nearAll(pts('width="100" height="100" viewBox="0 0 100 100"')[1], [100 * 25.4 / 96, 0], 1e-9, 'unitless is px');
  nearAll(pts('width="50mm" height="50mm" viewBox="100 0 100 100"', '<line x1="100" y1="0" x2="200" y2="0"/>')[0], [0, 0], 1e-9, 'viewBox origin');
  nearAll(pts('width="100mm" height="50mm" viewBox="0 0 100 100"')[0], [25, 0], 1e-9, 'centred when the aspect differs');
  nearAll(pts('width="100mm" height="50mm" viewBox="0 0 100 100" preserveAspectRatio="xMinYMin meet"')[1], [50, 0], 1e-9, 'xMin');
  nearAll(pts('width="100mm" height="50mm" viewBox="0 0 100 100" preserveAspectRatio="none"')[1], [100, 0], 1e-9, 'none');
  const noSize = STROKE('<svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="5" y2="0"/></svg>');
  nearAll(noSize.strokes[0].points[1], [5, 0], 1e-9); assert.equal(noSize.findings[0].code, 'svg.units');
  nearAll(STROKE('<svg width="10mm"><line x1="0" y1="0" x2="100" y2="0"/></svg>').strokes[0].points[1], [26.4583333, 0], 1e-6, 'no viewBox: user units are px');
  nearAll(STROKE('<svg width="100mm" viewBox="0 0 100 100"><line x1="0" y1="0" x2="10mm" y2="0"/></svg>').strokes[0].points[1], [10 * 96 / 25.4, 0], 1e-6, 'a length in mm inside a viewBox of user units');
  nearAll(STROKE('<svg viewBox="0 0 100 100"><line x1="0" y1="0" x2="10" y2="0"/></svg>', { unit: 2 }).strokes[0].points[1], [20, 0], 1e-9, 'unit given');
  assert.equal(STROKE('<svg width="10mm" viewBox="0 0 10 10"><defs><line x1="0" y1="0" x2="1" y2="0"/></defs><g display="none"><line x1="0" y1="0" x2="1" y2="0"/></g></svg>').strokes.length, 0);
  // what real files carry around the drawing
  const r = svgToStrokes(`<?xml version="1.0"?>\n<!-- made by hand -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width='100mm' height='100mm' viewBox='0 0 100 100'><svg:rect x="0" y="0" width="1" height="1"/></svg:svg>`);
  assert.equal(r.strokes.length, 1); near(r.width, 100, 1e-9);
});

test('a curve stays within the tolerance of the true circle as it flattens', () => {
  for (const tolerance of [0.5, 0.1, 0.01]) {
    const s = svgToStrokes('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>', { tolerance }).strokes[0];
    let worst = 0;
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1], b = s.points[i], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const p of [a, m]) worst = Math.max(worst, Math.abs(Math.hypot(p[0] - 50, p[1] - 50) - 40));
    }
    assert.ok(worst <= tolerance / 2 + 1e-6, `tolerance ${tolerance}: ${worst}`);
  }
});

test('strokes are ordered to cut the travel, reversed when the far end is nearer', () => {
  const strokes = [
    { name: 'far', points: [[100, 0], [200, 0]] },
    { name: 'near', points: [[20, 0], [10, 0]] },
    { name: 'next', points: [[20, 5], [100, 5]] }
  ];
  const r = orderStrokes(strokes, { start: [0, 0] });
  assert.deepEqual(r.strokes.map((s) => s.name), ['near', 'next', 'far']);
  assert.deepEqual(r.strokes[0].points, [[10, 0], [20, 0]], 'reversed');
  assert.equal(r.strokes[0].reversed, true);
  assert.ok(r.travel.after < r.travel.before);
  near(r.travel.before, 100 + 180 + Math.hypot(10, 5), 1e-9, 'as given, by hand');
  near(r.travel.after, 10 + 5 + 5, 1e-9, 'by hand');
  // never worse than given
  const ok = orderStrokes([{ points: [[0, 0], [1, 0]] }], { start: [0, 0] });
  assert.equal(ok.travel.after, ok.travel.before);
});

// ---------- toolpaths ----------
const inJointSpace = (plan, c, each) => {
  for (const m of plan.moves) for (let i = 1; i < m.q.length; i++) for (let k = 0; k <= 8; k++) {
    const t = k / 8, q = m.q[i - 1].map((x, a) => x + (m.q[i][a] - x) * t);
    each(fk(c, q).position, m);
  }
};
const toSeg = (p, a, b) => {
  const ax = b[0] - a[0], ay = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay)));
  return Math.hypot(p[0] - (a[0] + ax * t), p[1] - (a[1] + ay * t));
};
const toPoly = (p, poly) => { let d = Infinity; for (let i = 1; i < poly.length; i++) d = Math.min(d, toSeg(p, poly[i - 1], poly[i])); return d; };

test('a square stays square after joint-space interpolation on a two-link arm', () => {
  const arm = planar2R(150, 120), a = [50, 110], square = [[a[0], a[1]], [a[0] + 100, a[1]], [a[0] + 100, a[1] + 100], [a[0], a[1] + 100], [a[0], a[1]]];
  for (const tolerance of [0.5, 0.1, 0.02]) {
    const plan = planToolpath(arm, [{ name: 'square', points: square, closed: true }], { tolerance, elbow: 'right' });
    assert.ok(plan.ok, JSON.stringify(plan.findings));
    assert.equal(plan.elbow, 'right');
    let worst = 0;
    inJointSpace(plan, arm, (p, m) => { if (m.kind === 'draw') worst = Math.max(worst, toPoly(p, square)); });
    assert.ok(worst <= tolerance, `tolerance ${tolerance}: ${worst}`);
    assert.ok(plan.moves[0].q.length > 8, 'it really is subdivided');
    near(plan.length.draw, 400, tolerance * 8, 'perimeter');
  }
  // without subdivision the joint-space chord bows out: the fine plan is doing the work
  const coarse = planToolpath(arm, [{ name: 'square', points: square }], { tolerance: 50 });
  let bow = 0;
  inJointSpace(coarse, arm, (p, m) => { if (m.kind === 'draw') bow = Math.max(bow, toPoly(p, square)); });
  assert.ok(bow > 1, `a coarse plan bows ${bow}`);
});

test('a circle is within the tolerance everywhere', () => {
  const arm = planar2R(150, 120), cx = 0, cy = 180, R = 60, tolerance = 0.1, svg = `<svg width="300mm" height="300mm" viewBox="0 0 300 300"><circle cx="${R}" cy="${R}" r="${R}"/></svg>`;
  const { strokes } = svgToStrokes(svg, { tolerance });
  const placed = strokes.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x - R + cx, y - R + cy]) }));
  const plan = planToolpath(arm, placed, { tolerance });
  assert.ok(plan.ok);
  let worst = 0;
  inJointSpace(plan, arm, (p, m) => { if (m.kind === 'draw') worst = Math.max(worst, Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - R)); });
  assert.ok(worst <= tolerance, `circle: ${worst}`);
});

test('a sheet places the drawing: page coordinates, y down, top left at the origin', () => {
  const arm = planar2R(150, 120), plan = planToolpath(arm, [{ points: [[0, 0], [10, 0]] }], { sheet: { size: 'a5', at: [0, 150, 0] } });
  assert.ok(plan.ok);
  nearAll(plan.moves[0].points[0], [-74, 255, 0], 1e-9, 'top left');
  nearAll(plan.moves[0].points.at(-1), [-64, 255, 0], 1e-9, 'x along the page');
});

test('a move past the reach or a limit is refused, naming the stroke and the point', () => {
  const arm = planar2R(150, 120);
  const far = planToolpath(arm, [{ name: 'ok', points: [[100, 100], [120, 100]] }, { name: 'long', points: [[100, 100], [300, 100]] }]);
  assert.equal(far.ok, false);
  const f = far.findings.find((x) => x.level === 'fail');
  assert.equal(f.code, 'toolpath.reach'); assert.match(f.text, /stroke 2 \("long"\), point 2/); assert.match(f.text, /by \d+\.\d+ mm/);
  assert.deepEqual(f.refs, { stroke: 1, name: 'long', point: 1 }); near(f.at[0], 300, 1e-9); assert.ok(f.values.miss > 40);
  refused(() => stepBlocks(far, { axes: [{ name: 'shoulder', stepsPerUnit: 10 }, { name: 'elbow', stepsPerUnit: 10 }], speed: 10, accel: 100 }), 'steps.plan', /stroke 2/);
  const held = planar2R(150, 120, { limits: [[-180, 180], [0, 170]] });
  const l = planToolpath(held, [{ name: 'x', points: [[200, 50], [210, 50]] }], { elbow: 'left' });
  assert.equal(l.ok, false); assert.equal(l.findings[0].code, 'toolpath.limits'); assert.match(l.findings[0].text, /stroke 1 \("x"\), point 1/);
});

test('a line through the hole inside the arm is refused at the point it leaves the reach', () => {
  const arm = planar2R(150, 120);
  const r = planToolpath(arm, [{ name: 'through', points: [[-100, 2], [100, 2]] }], { tolerance: 0.01 });
  assert.equal(r.ok, false);
  const f = r.findings[0];
  assert.match(f.text, /stroke 1 \("through"\)/); assert.ok(['toolpath.reach', 'toolpath.singular'].includes(f.code), f.code);
});

test('pen-up travel in joint space, and zUp lifts on a chain with a Z axis', () => {
  const xyz = chain({ joints: [
    { name: 'x', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [0, 200] },
    { name: 'y', type: 'prismatic', origin: [0, 0, 0], axis: [0, 1, 0], limits: [0, 200] },
    { name: 'z', type: 'prismatic', origin: [0, 0, 0], axis: [0, 0, 1], limits: [0, 50] }
  ] });
  const strokes = [{ points: [[10, 10, 0], [20, 10, 0]] }, { points: [[30, 30, 0], [40, 30, 0]] }];
  const plan = planToolpath(xyz, strokes, { zUp: 5 });
  assert.ok(plan.ok, JSON.stringify(plan.findings));
  assert.deepEqual(plan.moves.map((m) => m.kind), ['plunge', 'draw', 'lift', 'travel', 'plunge', 'draw', 'lift']);
  near(plan.moves.at(-1).points.at(-1)[2], 5, 1e-9, 'ends lifted');
  near(plan.moves[0].points[0][2], 5, 1e-9, 'starts above'); near(plan.moves[2].points.at(-1)[2], 5, 1e-9, 'lifts');
  // a flat arm can only lift with its pen servo
  refused(() => planToolpath(planar2R(150, 120), [{ points: [[100, 100], [110, 100]] }], { zUp: 5 }), 'toolpath.zUp', /pen/);
});

test('step counts: from the steps per unit, or from step angle, microsteps and ratio', () => {
  const arm = planar2R(150, 120, { ratios: [5, 3] }), plan = planToolpath(arm, [{ points: [[100, 100], [101, 100]] }]);
  const b = stepBlocks(plan, { axes: [{ name: 'shoulder', stepAngle: 1.8, microsteps: 16 }, { name: 'elbow', stepAngle: 1.8, microsteps: 16 }], speed: 40, accel: 400 });
  near(b.axes[0].stepsPerUnit, (200 * 16 * 5) / 360, 1e-9, 'shoulder ratio'); near(b.axes[1].stepsPerUnit, (200 * 16 * 3) / 360, 1e-9, 'elbow ratio');
  assert.equal(b.format, 'rulecad.steps/1');
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(b))), JSON.stringify(b), 'plain JSON');
  // a screw-driven axis uses its lead, and a joint's own ratio can be overridden
  const screw = chain({ joints: [{ name: 'z', type: 'prismatic', origin: [0, 0, 0], axis: [1, 0, 0], limits: [0, 100] }, { name: 'w', type: 'prismatic', origin: [0, 0, 0], axis: [0, 1, 0], limits: [0, 100] }] });
  const sp = planToolpath(screw, [{ points: [[1, 1], [2, 1]] }]);
  const made = stepBlocks(sp, { axes: [{ name: 'z', stepAngle: 1.8, microsteps: 8, lead: 8 }, { name: 'w', stepsPerUnit: 100 }], speed: 10, accel: 100 });
  near(made.axes[0].stepsPerUnit, (200 * 8) / 8, 1e-9, 'lead');
});

test('pen commands and dwell bracket each stroke; speed respects the acceleration limit', () => {
  const arm = planar2R(150, 120), strokes = [{ points: [[100, 100], [140, 100]] }, { points: [[140, 140], [100, 140]] }];
  const plan = planToolpath(arm, strokes, { tolerance: 0.1 }), speed = 30, accel = 200;
  const b = stepBlocks(plan, { axes: [{ name: 'shoulder', stepsPerUnit: 71 }, { name: 'elbow', stepsPerUnit: 71 }], speed, accel, penUp: 0.1, penDown: 0.2 });
  const pens = b.blocks.filter((x) => x.type === 'pen');
  assert.deepEqual(pens.map((p) => p.state), ['up', 'down', 'up', 'down', 'up']);
  assert.deepEqual(pens.map((p) => p.dwell), [0.1, 0.2, 0.1, 0.2, 0.1]);
  const moves = b.blocks.filter((x) => x.type === 'move');
  assert.ok(moves.every((m) => Number.isInteger(m.major) && m.steps.every(Number.isInteger)));
  assert.ok(moves.every((m) => m.major === Math.max(...m.steps.map(Math.abs))));
  let last = 0;
  for (const m of b.blocks) {
    if (m.type === 'pen') { assert.equal(last, 0, 'stopped at a pen command'); continue; }
    near(m.entry, last, 1e-6, 'continuous speed');
    assert.ok(m.peak <= speed + 1e-9); assert.ok(m.entry <= m.peak + 1e-9); assert.ok(m.exit <= m.peak + 1e-9);
    assert.ok(m.peak * m.peak - m.entry * m.entry <= 2 * accel * m.length + 1e-6, 'accel within the limit');
    assert.ok(m.peak * m.peak - m.exit * m.exit <= 2 * accel * m.length + 1e-6, 'decel within the limit');
    last = m.exit;
  }
  assert.equal(last, 0, 'ends at rest');
  const e = estimate(b);
  near(e.draw, 80, 0.6, 'draw length'); assert.ok(e.travel > 30);
  // draw at speed with ramps, plus the dwell; the hand sum is a lower bound
  assert.ok(e.time > 80 / speed + 0.1 * 3 + 0.2 * 2); near(e.pen, 0.7, 1e-9);
  assert.ok(e.steps.every((s) => s > 0)); near(b.time, e.time, 0);
});

test('a corner slows to the junction speed; an axis rate limit slows a move and says so', () => {
  const arm = planar2R(150, 120), plan = planToolpath(arm, [{ points: [[100, 100], [140, 100], [140, 140]] }]);
  const b = stepBlocks(plan, { axes: [{ name: 'shoulder', stepsPerUnit: 71 }, { name: 'elbow', stepsPerUnit: 71 }], speed: 100, accel: 500, corner: 0.05 });
  const moves = b.blocks.filter((x) => x.type === 'move' && x.kind === 'draw');
  const corner = Math.sqrt((500 * 0.05 * Math.SQRT1_2) / (1 - Math.SQRT1_2)); // 90 degrees: sin(theta / 2) = sqrt(1/2)
  const at = moves.findIndex((m, i) => i < moves.length - 1 && Math.abs(moves[i + 1].entry - corner) < corner * 0.2 && m.peak > corner);
  assert.ok(at >= 0, 'there is a corner block near the junction speed');
  const slow = stepBlocks(plan, { axes: [{ name: 'shoulder', stepsPerUnit: 71, maxRate: 200 }, { name: 'elbow', stepsPerUnit: 71 }], speed: 100, accel: 500 });
  assert.ok(slow.findings.some((f) => f.code === 'steps.rate'));
  assert.ok(slow.blocks.filter((x) => x.type === 'move').every((m) => m.rate.peak <= 200 * Math.max(1, m.major / Math.abs(m.steps[0] || 1)) * 1.000001 || m.steps[0] === 0));
});

test('an SVG with a 100 mm square and a circle replays from its step blocks within 0.1 mm', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210">
    <rect x="24" y="55" width="100" height="100" id="square"/>
    <circle cx="74" cy="105" r="35" id="circle"/>
  </svg>`;
  const arm = planar2R(150, 120, { ratios: [8, 8] }), sheet = { size: 'a5', at: [0, 150, 0] };
  const drawing = svgToStrokes(svg, { tolerance: 0.05 });
  assert.equal(drawing.strokes.length, 2);
  const ordered = orderStrokes(drawing, { start: [0, 0] });
  const plan = planToolpath(arm, ordered.strokes, { tolerance: 0.05, sheet, elbow: 'right' });
  assert.ok(plan.ok, JSON.stringify(plan.findings));
  const axes = [{ name: 'shoulder', stepAngle: 1.8, microsteps: 16 }, { name: 'elbow', stepAngle: 1.8, microsteps: 16 }];
  const blocks = stepBlocks(plan, { axes, speed: 40, accel: 300 });
  const file = JSON.parse(JSON.stringify(blocks)); // what a firmware or sender would be given
  const r = replay(file, arm);
  assert.equal(r.strokes.length, 2);
  // the ideal shapes in the world
  const c = [0, 150], sq = [[c[0] - 50, c[1] + 50], [c[0] + 50, c[1] + 50], [c[0] + 50, c[1] - 50], [c[0] - 50, c[1] - 50], [c[0] - 50, c[1] + 50]];
  for (const s of r.strokes) {
    const isCircle = Math.abs(Math.hypot(s.points[0][0] - c[0], s.points[0][1] - c[1]) - 35) < 1;
    let worst = 0;
    for (const p of s.points) worst = Math.max(worst, isCircle ? Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - 35) : toPoly(p, sq));
    assert.ok(worst <= 0.1, `${isCircle ? 'circle' : 'square'} replays within ${worst}`);
    if (!isCircle) sq.slice(0, 4).forEach((k) => assert.ok(s.points.some((p) => Math.hypot(p[0] - k[0], p[1] - k[1]) < 0.1), `reaches corner ${k}`));
  }
  assert.equal(r.pen, 'up');
  // the replayed end is the planned end, step for step
  const last = plan.moves.at(-1), want = last.q.at(-1).map((v, k) => Math.round(v * blocks.axes[k].stepsPerUnit));
  assert.deepEqual(r.steps, want);
  // and the estimate is sensible for 400 mm + a 220 mm circle at 40 mm/s
  const est = estimate(blocks);
  near(est.draw, 400 + 2 * Math.PI * 35, 2, 'length'); assert.ok(est.time > 600 / 40);
});

// ---------- refusals ----------
test('bad input is refused by name, before any maths', () => {
  refused(() => chain(), 'chain.input'); refused(() => chain({}), 'chain.empty'); refused(() => chain({ joints: [] }), 'chain.empty', /no joints/);
  refused(() => chain({ links: [] }), 'chain.empty'); refused(() => chain({ links: [-1] }), 'chain.link', /link 1/);
  const j = { name: 'a', type: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], limits: [-90, 90] };
  refused(() => chain({ joints: [{ ...j, name: '' }] }), 'chain.name');
  refused(() => chain({ joints: [j, j] }), 'chain.name', /two joints/);
  refused(() => chain({ joints: [{ ...j, type: 'ball' }] }), 'chain.type', /ball/);
  refused(() => chain({ joints: [{ ...j, axis: [0, 0, 0] }] }), 'chain.axis', /no length/);
  refused(() => chain({ joints: [{ ...j, axis: [0, 1] }] }), 'chain.axis');
  refused(() => chain({ joints: [{ ...j, origin: [0, 0] }] }), 'chain.origin');
  refused(() => chain({ joints: [{ ...j, limits: [90, -90] }] }), 'chain.limits', /wrong way round/);
  refused(() => chain({ joints: [{ ...j, type: 'prismatic', limits: undefined }] }), 'chain.limits', /prismatic/);
  refused(() => chain({ joints: [{ ...j, ratio: 0 }] }), 'chain.ratio');
  refused(() => chain({ joints: [j], tool: [1, 2] }), 'chain.tool');
  refused(() => chain({ joints: [{ ...j, a: [1, 2, 3], b: [0] }] }), 'chain.anchor');
  refused(() => chain({ joints: [{ ...j, follow: { joint: 'nope' } }] }), 'chain.follow', /nope/);
  refused(() => planar2R(0, 10), 'chain.link', /l1/);
  const arm = planar2R(150, 120);
  refused(() => fk(arm, [1]), 'fk.q', /1 value/); refused(() => fk(arm, [1, NaN]), 'fk.q', /elbow/); refused(() => fk(arm, { shoulder: 1 }), 'fk.q', /elbow/);
  refused(() => jacobian(arm, 'x'), 'jacobian.q');
  refused(() => ik(arm, [1]), 'ik.target', /\[x, y\]/); refused(() => ik(arm, [1, 2, 3, 4]), 'ik.target'); refused(() => ik(arm, [1, 'a']), 'ik.target');
  refused(() => ik(arm, [1, 2], { elbow: 'up' }), 'ik.elbow'); refused(() => ik(arm, [1, 2], { tolerance: 0 }), 'ik.tolerance');
  refused(() => ik(arm, [1, 2], { maxIterations: 0 }), 'ik.iterations'); refused(() => ik(arm, [1, 2], { method: 'magic' }), 'ik.method'); refused(() => ik(arm, [1, 2], { method: 'numeric', elbow: 'left' }), 'ik.elbow', /start/);
  refused(() => ik(arm, [1, 2], { start: [1] }), 'ik.q');
  refused(() => ik(chain({ joints: [j, { ...j, name: 'b' }, { ...j, name: 'c' }] }), [1, 2], { elbow: 'left' }), 'ik.elbow', /two-link/);
  refused(() => reach(arm, { step: 1 }), 'reach.input'); refused(() => reach(arm, { sheet: { size: 'a5', at: [0, 0, 0] } }), 'reach.step');
  refused(() => reach(arm, { sheet: { size: 'b5', at: [0, 0, 0] }, step: 1 }), 'sheet.size', /b5/);
  refused(() => reach(arm, { sheet: { size: 'a5' }, step: 1 }), 'sheet.at'); refused(() => sheetFrame({ size: 'a5', at: [0, 0, 0], normal: [0, 0, 0] }), 'sheet.normal');
  refused(() => reach(arm, { region: { x: [5, 1], y: [0, 1] }, step: 1 }), 'region.range', /wrong way/);
  refused(() => reach(arm, { sheet: { size: 'a4', at: [0, 0, 0] }, step: 0.1 }), 'reach.step', /too many/);
  refused(() => svgToStrokes(''), 'svg.input'); refused(() => svgToStrokes('<div/>'), 'svg.input', /svg/); refused(() => svgToStrokes('<svg/>', { tolerance: 0 }), 'svg.tolerance');
  refused(() => orderStrokes([]), 'strokes.empty'); refused(() => orderStrokes('x'), 'strokes.input'); refused(() => orderStrokes([{ points: [[0, 0]] }]), 'strokes.points', /two points/);
  refused(() => orderStrokes([{ points: [[0, 0], [1]] }]), 'strokes.points', /point 2/);
  refused(() => planToolpath(arm, [{ points: [[1, 1], [2, 2]] }], { tolerance: -1 }), 'toolpath.tolerance');
  refused(() => planToolpath(arm, [{ points: [[1, 1], [2, 2]] }], { sheet: { size: 'a5', at: [0, 0, 0] }, transform: new Array(12).fill(0) }), 'toolpath.input');
  const plan = planToolpath(arm, [{ points: [[100, 100], [110, 100]] }]);
  refused(() => stepBlocks(plan, { axes: [], speed: 1, accel: 1 }), 'steps.axes');
  refused(() => stepBlocks(plan, { axes: [{ name: 'shoulder', stepsPerUnit: 1 }], speed: 1, accel: 1 }), 'steps.axes', /elbow/);
  refused(() => stepBlocks(plan, { axes: [{ name: 'shoulder', stepsPerUnit: 1 }, { name: 'elbow', stepsPerUnit: 1 }], speed: 0, accel: 1 }), 'steps.speed');
  refused(() => stepBlocks(plan, { axes: [{ name: 'shoulder', stepsPerUnit: 0 }, { name: 'elbow', stepsPerUnit: 1 }], speed: 1, accel: 1 }), 'steps.axes');
  refused(() => stepBlocks({}, {}), 'steps.plan'); refused(() => estimate(3), 'steps.input'); refused(() => replay(3, arm), 'steps.input');
  refused(() => chainFromMotion({}), 'chain.motion');
  refused(() => chainFromMotion({ items: [['a']], joints: [] }, { tip: 'b' }), 'chain.motion', /no item "b"/);
  refused(() => chainFromMotion({ items: [['a', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], ['b']], joints: [{ id: 'p', type: 'path', parent: 0, child: 1, a: [], b: [], dofs: [[0, 1, 0]] }] }, { tip: 'b' }), 'chain.type', /path/);
});

test('findings are in the kit\'s shape', () => {
  const f = checkChain({ joints: [] })[0];
  assert.equal(f.level, 'fail'); assert.equal(f.code, 'chain.empty'); assert.match(f.text, /no joints/);
  assert.equal(checkChain(planar2R(1, 1))[0].code, 'chain.ok');
  const locked = checkChain({ joints: [{ name: 'a', type: 'revolute', origin: [5, 0, 0], axis: [0, 0, 1], limits: [10, 10] }] });
  assert.equal(locked[0].code, 'chain.locked'); assert.equal(locked[0].level, 'warn'); assert.deepEqual(locked[0].at, [5, 0, 0]);
  nearAll(zeros(planar2R(1, 1)), [0, 0], 0);
});

test('legs and gaits: a crawl stable with its margin, a trot quasi-static with torque through the cycle, a stride past the leg refused', async () => {
  const { leg, gait, stabilityMargin, footLoads, legTorques, fk } = await import('@rulecad/robots');
  const quad = [['fl', 100, 60], ['fr', 100, -60], ['bl', -100, 60], ['br', -100, -60]].map(([n, x, y]) => leg(n, { at: [x, y, 0], upper: 90, lower: 90 }));
  // By hand: a square of feet, centre of mass in the middle
  assert.ok(Math.abs(stabilityMargin([[0, 0], [100, 0], [100, 100], [0, 100]], [50, 50]) - 50) < 1e-9);
  assert.ok(stabilityMargin([[0, 0], [100, 0], [0, 100]], [90, 90]) < 0, 'outside the triangle');
  assert.ok(Math.abs(stabilityMargin([[-10, 0], [10, 0]], [0, 3]) + 3) < 1e-9, 'a line of feet, off it by 3');
  assert.deepEqual(footLoads([[-100, -60], [100, -60], [100, 60], [-100, 60]], [0, 0], 8).map((x) => +x.toFixed(6)), [2, 2, 2, 2], 'level and centred: an equal share');
  assert.deepEqual(footLoads([[-100, 0], [100, 0]], [50, 0], 10).map((x) => +x.toFixed(6)), [2.5, 7.5], 'the lever rule');
  // A leg's torque, by hand: lower leg straight down from the knee, 4 N up on the foot: hip's lever is the upper link's reach
  const l = leg('t', { at: [0, 0, 0], upper: 100, lower: 100 }), q = [0, 90]; // the upper link along +x, the lower straight down
  const end = fk(l.chain, q).position; assert.ok(Math.hypot(end[0] - 100, end[2] + 100) < 1e-6, `foot at ${end}`);
  const tau = legTorques(l.chain, q, [0, 0, 4]);
  assert.ok(Math.abs(Math.abs(tau[0]) - 0.4) < 1e-6, `hip 0.4 N m, got ${tau[0]}`); assert.ok(Math.abs(tau[1]) < 1e-6, 'the knee is on the line of the force');

  const crawl = gait({ legs: quad, pattern: 'crawl', stride: 40, lift: 15, height: 120, period: 4, mass: 1.5 });
  assert.equal(crawl.ok, true, JSON.stringify(crawl.findings));
  assert.equal(crawl.summary.standing, true); assert.ok(crawl.summary.margin > 1, `crawl's margin ${crawl.summary.margin}`);
  assert.equal(crawl.findings.find((x) => x.code === 'gait.stable').level, 'pass');
  assert.ok(Math.abs(crawl.summary.clearance - 15) < 2, `lifts ${crawl.summary.clearance}`);

  const trot = gait({ legs: quad, pattern: 'trot', stride: 40, lift: 15, height: 120, period: 1.2, mass: 1.5 });
  assert.equal(trot.summary.standing, false); assert.match(trot.findings.find((x) => x.code === 'gait.stable').text, /quasi-static/);
  const halfWeight = 1.5 * 9.80665 / 2, hip = trot.summary.torque['fl.hip'], knee = trot.summary.torque['fl.knee'];
  assert.ok(hip > 0 && knee > 0, 'torque at every joint through the cycle');
  assert.ok(trot.frames.every((f) => Math.abs(f.feet.filter((e) => e.stance).reduce((t, e) => t + e.load, 0) - 2 * halfWeight) < 1e-6), 'the feet carry the weight, at every moment');

  const far = gait({ legs: quad, pattern: 'crawl', stride: 300, lift: 15, height: 150, period: 4, mass: 1.5 });
  assert.equal(far.ok, false); assert.match(far.findings[0].text, /leg \w+ can't reach its foot/); assert.equal(far.findings[0].code, 'gait.reach');
  assert.throws(() => gait({ legs: quad, pattern: 'gallop', stride: 40, lift: 15, height: 120, period: 1, mass: 1 }), /no pattern "gallop"/);
  assert.throws(() => leg('x', { at: [0, 0], upper: 1, lower: 1 }), /at is the hip/);
});
