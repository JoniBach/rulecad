import { test } from 'node:test';
import assert from 'node:assert/strict';
import jscad from '@jscad/modeling';
import { DEFAULTS, gearModel, internalModel, rackModel, spurProfile, internalProfile, rackProfile, spur, internal, rack, mesh, phase, rackPhase, printable } from '@rulecad/gears';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (±${tol})`);
const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
const inside = ([x, y], pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const place = (pts, angle, [dx, dy] = [0, 0]) => { const c = Math.cos(angle), s = Math.sin(angle); return pts.map(([x, y]) => [x * c - y * s + dx, x * s + y * c + dy]); };
// The angles at which the outline crosses a circle, near +x (tooth 0)
const crossings = (pts, rho, within = 0.5) => {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], rp = Math.hypot(...p), rq = Math.hypot(...q);
    if ((rp - rho) * (rq - rho) < 0) { const t = (rho - rp) / (rq - rp), x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]); const a = Math.atan2(y, x); if (Math.abs(a) < within) out.push(a); }
  }
  return out.sort((a, b) => a - b);
};
// Every edge of a solid used once each way: closed, nothing left open
const closed = (g) => {
  const key = (v) => v.map((x) => x.toFixed(5)).join(','), edges = new Map();
  for (const p of jscad.geometries.geom3.toPolygons(g)) for (let i = 0; i < p.vertices.length; i++) { const k = `${key(p.vertices[i])}>${key(p.vertices[(i + 1) % p.vertices.length])}`; edges.set(k, (edges.get(k) || 0) + 1); }
  return [...edges.keys()].filter((k) => { const [a, b] = k.split('>'); return !edges.has(`${b}>${a}`); }).length;
};

test('a spur gear\'s numbers are the textbook\'s: module 2, 20 teeth', () => {
  const g = gearModel({ module: 2, teeth: 20, backlash: 0 });
  assert.equal(g.pitch, 40);
  near(g.base, 40 * Math.cos((20 * Math.PI) / 180), 1e-12, 'base circle d cos α');
  assert.equal(g.tip, 44); assert.equal(g.root, 35);
  near(g.thickness, Math.PI, 1e-12, 'tooth on the pitch circle πm/2');
  // the tip's width from the involute: s_a = d_a (s / d + inv α − inv α_a), cos α_a = d_b / d_a
  const inv = (a) => Math.tan(a) - a, aa = Math.acos(g.base / g.tip), sa = g.tip * (Math.PI / 40 + inv((20 * Math.PI) / 180) - inv(aa));
  near(g.topLand, 2 * (g.tip / 2) * Math.sin(sa / g.tip), 1e-9, 'top land');
  // a shift moves the tip and root out by x m and thickens the tooth by 2 x m tan α
  const s = gearModel({ module: 2, teeth: 20, shift: 0.5, backlash: 0 });
  assert.equal(s.tip, 46); assert.equal(s.root, 37);
  near(s.thickness - g.thickness, 2 * 0.5 * 2 * Math.tan((20 * Math.PI) / 180), 1e-12, 'shift thickens');
  // backlash: each gear takes half
  near(gearModel({ module: 2, teeth: 20, backlash: 0.2 }).thickness, Math.PI - 0.1, 1e-12, 'half the backlash off each');
});

test('the drawn flanks are involutes: every flank normal touches the base circle, and the tooth is as thick as it should be', () => {
  for (const [m, z, shift] of [[1, 17, 0], [2, 20, 0], [1.5, 40, 0.2], [1, 12, 0.3], [0.8, 80, 0]]) {
    const { loops: [pts], model: g } = spurProfile({ module: m, teeth: z, shift }), rb = g.base / 2;
    // the flank of tooth 0 below +x: points between a little over the root and a little under the tip
    const lo = Math.max(g.root / 2 + 0.4 * m, rb * 1.01), hi = g.tip / 2 - 0.25 * m;
    const flank = pts.filter((p) => { const r = Math.hypot(...p); return p[1] < 0 && Math.abs(Math.atan2(p[1], p[0])) < Math.PI / z && r > lo && r < hi; });
    assert.ok(flank.length >= 5, `${z} teeth: ${flank.length} flank points`);
    for (let i = 1; i < flank.length - 1; i++) {
      const [a, b, c] = [flank[i - 1], flank[i], flank[i + 1]], t = [c[0] - a[0], c[1] - a[1]], n = [-t[1], t[0]], len = Math.hypot(...n);
      // the line along the normal through b passes rb from the centre
      near(Math.abs(b[0] * n[1] - b[1] * n[0]) / len, rb, 0.004 * rb, `${z} teeth, normal at r ${Math.hypot(...b).toFixed(2)}`);
    }
    const [a1, a2] = crossings(pts, g.pitch / 2, Math.PI / z);
    near((a2 - a1) * (g.pitch / 2), g.thickness, 0.005 * m, `${z} teeth: thickness on the pitch circle`);
  }
});

test('a spur gear is a closed solid, as big as its outline, chamfered at the bed and no further', () => {
  const p = { module: 1.5, teeth: 24, width: 8, bore: 5, flat: 0.5 }, g = spur(p);
  assert.equal(closed(g), 0, 'every edge matched by one running the other way');
  const { loops } = spurProfile(p), full = loops.reduce((s, l) => s + area(l), 0), c = 0.3;
  const thin = spurProfile(p, -c).loops.reduce((s, l) => s + area(l), 0), v = jscad.measurements.measureVolume(g);
  assert.ok(v < full * 8 && v > full * (8 - c) + thin * c - 1, `volume ${v.toFixed(1)} between ${(thin * c + full * (8 - c)).toFixed(1)} and ${(full * 8).toFixed(1)}`);
  const atBed = jscad.geometries.geom3.toPolygons(g).flatMap((q) => q.vertices).filter((v) => Math.abs(v[2]) < 1e-9);
  near(Math.max(...atBed.map((v) => Math.hypot(v[0], v[1]))), 0.5 * (24 * 1.5 + 3) - c, 0.01, 'the bed face is the tip less the chamfer');
  assert.ok(closed(internal({ module: 1, teeth: 60, width: 6 })) === 0 && closed(rack({ module: 1, teeth: 10, width: 6 })) === 0, 'ring and rack closed too');
});

test('fewer than 17 teeth at 20° are refused as undercut, naming the shift; with it they draw', () => {
  assert.throws(() => gearModel({ module: 1, teeth: 12 }), /12 teeth at 20° are undercut .* profile shift of at least 0\.30 \(shift: 0\.30\), or 17 teeth or more/);
  assert.doesNotThrow(() => gearModel({ module: 1, teeth: 17 }), '17 at 20°, as tables have it');
  assert.throws(() => gearModel({ module: 1, teeth: 16 }), /undercut/);
  const g = gearModel({ module: 1, teeth: 12, shift: 0.3 });
  assert.ok(spurProfile({ module: 1, teeth: 12, shift: 0.3 }).loops[0].length > 0 && g.tip === 14.6, 'shifted, it draws, its tip out by 0.3 m');
  assert.ok(gearModel({ module: 1, teeth: 10, pressureAngle: 25, shift: 0.3 }).teeth === 10, 'a larger pressure angle needs less');
  assert.throws(() => gearModel({ module: 1, teeth: 20, shift: 1.4 }), /come to a point/);
});

test('a rack: straight flanks at the pressure angle, a circular pitch apart; a ring: its spaces as wide as a tooth of its mate', () => {
  const { loops: [pts], model: k } = rackProfile({ module: 2, teeth: 5, backlash: 0 });
  // the left flank of the first tooth, between its fillet and its round
  const flank = pts.filter(([x, y]) => x > 0 && x < k.circularPitch / 2 && y > -1 && y < 1.4).sort((a, b) => a[1] - b[1]);
  const slope = (flank.at(-1)[0] - flank[0][0]) / (flank.at(-1)[1] - flank[0][1]);
  near(Math.atan(slope) * (180 / Math.PI), 20, 0.05, 'flank angle from vertical');
  const widthAt0 = (x0) => { const ys = pts.filter(([x, y]) => Math.abs(y) < 0.3 && x > x0 && x < x0 + k.circularPitch).map(([x]) => x); return Math.max(...ys) - Math.min(...ys); };
  assert.ok(Math.abs(widthAt0(0) - widthAt0(k.circularPitch)) < 0.05, 'every tooth the same');
  near(k.length, 5 * Math.PI * 2, 1e-12, 'length');
  const r = internalModel({ module: 1, teeth: 60, backlash: 0 }), { loops: [, hole] } = internalProfile({ module: 1, teeth: 60, backlash: 0 });
  near(r.space, Math.PI / 2, 1e-12, 'space on the pitch circle');
  // the ring's tooth 0 on +x: its width on the pitch circle
  const xs = crossings(hole, 30), mid = xs.filter((a) => Math.abs(a) < Math.PI / 60 + 0.01);
  near((mid.at(-1) - mid[0]) * 30, r.thickness, 0.01, 'ring tooth on the pitch circle');
  assert.ok(r.tip < r.pitch && r.root > r.pitch, 'teeth point inwards');
});

test('mesh: centre distance, ratio and contact ratio as the formulas give them; a wrong centre is said', () => {
  const a = gearModel({ module: 1, teeth: 20 }), b = gearModel({ module: 1, teeth: 40 });
  const m = mesh(a, b);
  near(m.centre, 30, 1e-9, 'centre'); assert.equal(m.ratio, -0.5);
  near(m.contact, 1.635, 0.002, 'contact ratio of 20 on 40 at module 1 (worked by hand: 1.635)');
  assert.match(mesh(a, b, { centre: 29.9 }).findings.find((x) => x.code === 'mesh.centre').text, /0\.1 mm closer .* jam/);
  assert.equal(mesh(a, b, { centre: 29.9 }).findings.find((x) => x.code === 'mesh.centre').level, 'fail');
  assert.equal(mesh(a, b, { centre: 30.5 }).findings.find((x) => x.code === 'mesh.centre').level, 'warn', 'half a mm out: loose');
  assert.equal(mesh(a, b, { centre: 30.05 }).findings.find((x) => x.code === 'mesh.centre').level, 'pass');
  // shifted pair: the working centre from the working pressure angle
  const s = mesh(gearModel({ module: 1, teeth: 12, shift: 0.4 }), gearModel({ module: 1, teeth: 30, shift: 0 }));
  assert.ok(s.centre > 21 && s.centre < 21.4, `shifted pair moves apart: ${s.centre}`);
  // a ring: the same way round, centres the difference apart
  const ring = internalModel({ module: 1, teeth: 60 }), ri = mesh(a, ring);
  near(ri.centre, 20, 1e-9, 'ring centre'); assert.equal(ri.ratio, 1 / 3); assert.ok(ri.contact > 1.6, `ring contact ${ri.contact}`);
  near(mesh(ring, a).ratio, 3, 1e-12, 'the other way round, the inverse');
  assert.equal(mesh(gearModel({ module: 1, teeth: 52 }), ring).findings.find((x) => x.code === 'mesh.interference').level, 'fail', '8 teeth apart fouls');
  // a rack: π d mm a turn
  const k = mesh(a, rackModel({ module: 1, teeth: 20 }));
  near(k.ratio, Math.PI * 20, 1e-12, 'rack travel a turn'); near(k.centre, 10, 1e-9, 'rack centre');
  assert.ok(k.contact > 1.5, `rack contact ${k.contact}`);
  // what doesn't mesh
  assert.equal(mesh(a, gearModel({ module: 1.5, teeth: 20 })).findings[0].code, 'mesh.module');
  assert.throws(() => mesh(ring, internalModel({ module: 1, teeth: 70 })), /one of them is an outer gear/);
});

test('the phase puts a tooth in a gap: at every angle the teeth clear; half a pitch out, they collide', () => {
  const clear = (A, B, ring = false) => (ring ? A.every((p) => inside(p, B)) : !A.some((p) => inside(p, B))) && !B.some((p) => inside(p, A));
  const pair = (p1, p2, profile2, line) => {
    const a = gearModel(p1), b = profile2 === internalProfile ? internalModel(p2) : gearModel(p2), m = mesh(a, b);
    const A = spurProfile(p1).loops[0], B = profile2(p2).loops.at(profile2 === internalProfile ? 1 : 0), ph = phase(a, b, line);
    const at = [m.centre * Math.cos((line * Math.PI) / 180), m.centre * Math.sin((line * Math.PI) / 180)];
    return (deg, extra = 0) => clear(place(A, (deg * Math.PI) / 180), place(B, ((m.ratio * deg + ph + extra) * Math.PI) / 180, at), profile2 === internalProfile);
  };
  for (const [p1, p2, prof, line] of [
    [{ module: 1, teeth: 20 }, { module: 1, teeth: 31 }, spurProfile, 0],
    [{ module: 1, teeth: 17 }, { module: 1, teeth: 17 }, spurProfile, 37],
    [{ module: 2, teeth: 12, shift: 0.3 }, { module: 2, teeth: 40, shift: 0.3 }, spurProfile, -110],
    [{ module: 1, teeth: 18 }, { module: 1, teeth: 60 }, internalProfile, 25],
  ]) {
    const turn = pair(p1, p2, prof, line), what = `${p1.teeth} on ${p2.teeth}${prof === internalProfile ? ' (ring)' : ''}`;
    for (let deg = 0; deg < 40; deg += 2.5) assert.ok(turn(deg), `${what}: teeth clear at ${deg}°`);
    assert.ok(!turn(0, 180 / p2.teeth), `${what}: half a pitch out, they collide`);
  }
  // a rack under a pinion
  const g = gearModel({ module: 1, teeth: 20 }), k = rackModel({ module: 1, teeth: 30 }), A = spurProfile({ module: 1, teeth: 20 }).loops[0], K = rackProfile({ module: 1, teeth: 30 }).loops[0];
  const at = 47, s0 = rackPhase(g, at), per = (Math.PI * g.pitch) / 360;
  const rackClear = (deg, extra = 0) => { const P = place(A, (deg * Math.PI) / 180, [at, mesh(g, k).centre]), R = K.map(([x, y]) => [x + per * deg + s0 + extra, y]); return clear(P, R); };
  for (let deg = -30; deg < 30; deg += 2.5) assert.ok(rackClear(deg), `rack clears at ${deg}°`);
  assert.ok(!rackClear(0, Math.PI / 2), 'half a pitch out, the rack collides');
});

test('what isn\'t a gear is refused by name, before any maths', () => {
  const rows = [
    [() => gearModel({ module: -1, teeth: 20 }), /gearModel: module is a size above 0 \(got -1\)/],
    [() => gearModel({ module: NaN, teeth: 20 }), /module is a size above 0 \(got null\)/],
    [() => gearModel({ module: '1', teeth: 20 }), /module is a size above 0 \(got "1"\)/],
    [() => gearModel({ module: 1, teeth: 4.5 }), /gearModel: teeth is a whole number of 6 or more \(got 4\.5\)/],
    [() => gearModel({ module: 1, teeth: 5 }), /teeth is a whole number of 6 or more/],
    [() => gearModel({ module: 1 }), /teeth is a whole number of 6 or more \(got nothing\)/],
    [() => gearModel({ module: 1, teeth: 20, pressureAngle: 45 }), /pressureAngle is a number from 10 to 35°/],
    [() => gearModel({ module: 1, teeth: 20, backlash: -0.1 }), /backlash is 0 or more/],
    [() => gearModel({ module: 1, teeth: 20, backlash: 4 }), /leaves no tooth/],
    [() => gearModel(null), /give the gear's parameters as an object/],
    [() => internalModel({ module: 1, teeth: 8 }), /internalModel: teeth is a whole number of 12 or more/],
    [() => internalModel({ module: 1, teeth: 40, rim: 30 }), /rim is the ring's outer diameter/],
    [() => rackModel({ module: 1, teeth: 0 }), /rackModel: teeth is a whole number of 1 or more/],
    [() => rackModel({ module: 1, teeth: 5, shift: 0.2 }), /a rack has no profile shift/],
    [() => spur({ module: 1, teeth: 20 }), /spur: width is a size above 0 \(got nothing\)/],
    [() => spur({ module: 1, teeth: 20, width: 5, bore: 20 }), /a bore of 20 mm leaves under two modules/],
    [() => spur({ module: 1, teeth: 20, width: 5, bore: 5, flat: 3 }), /flat is how deep the bore's flat cuts/],
    [() => spur({ module: 1, teeth: 20, width: 5, chamfer: 0.5 }), /a chamfer over a quarter module \(0\.25 mm\)/],
    [() => spur({ module: 1, teeth: 20, width: 5, chamfer: 'big' }), /chamfer is a size in mm/],
    [() => mesh(gearModel({ module: 1, teeth: 20 }), { teeth: 20 }), /mesh: b is a gear's model/],
    [() => mesh(gearModel({ module: 1, teeth: 20 }), gearModel({ module: 1, teeth: 20 }), { centre: '20' }), /centre is a distance in mm/],
    [() => printable(gearModel({ module: 1, teeth: 20 }), { line: 0 }), /the printer needs a line and a layer/],
  ];
  for (const [f, re] of rows) assert.throws(f, re);
});

test('printable: the module against the nozzle, lines at the root, the tip, the width in layers', () => {
  const x1c = { line: 0.42, layer: 0.2, nozzle: 0.4, wall_min: 0.84 };
  const fine = printable(gearModel({ module: 0.5, teeth: 30 }), x1c, 5);
  const m = fine.find((x) => x.code === 'gear.module');
  assert.equal(m.level, 'fail'); assert.match(m.text, /module 0\.8 or more/);
  assert.ok(Array.isArray(m.at) && m.at.length === 3, 'placed on the first tooth');
  const good = printable(gearModel({ module: 1, teeth: 30 }), x1c, 6);
  assert.ok(good.every((x) => x.level !== 'fail'), good.map((x) => x.text).join('; '));
  assert.match(good.find((x) => x.code === 'gear.root').text, /lines/);
  assert.equal(printable(gearModel({ module: 1, teeth: 30 }), x1c, 5.1).find((x) => x.code === 'gear.layers').level, 'warn');
  assert.ok(printable(rackModel({ module: 1, teeth: 10 }), x1c).length && printable(internalModel({ module: 1, teeth: 60 }), x1c).length, 'racks and rings too');
});

test('every default names its rule and what kind of fact it is', () => {
  for (const [k, d] of Object.entries(DEFAULTS)) assert.ok(typeof d.value === 'number' && d.rule.length > 20 && ['spec', 'estimate', 'measured', 'default', 'community'].includes(d.kind), k);
});

test('the diagram: the pair in phase and the mesh close up, with its numbers, for a pair, a ring and a rack', async () => {
  const { diagram } = await import('@rulecad/gears/diagram');
  for (const [a, b, says] of [
    [{ module: 2, teeth: 18 }, { module: 2, teeth: 30 }, /18 teeth on 30, module 2.*centre distance 48 mm.*0\.6 turns of the second.*contact ratio 1\.592/s],
    [{ module: 1, teeth: 18 }, { module: 1, teeth: 60, kind: 'internal' }, /\(a ring\).*the same way/s],
    [{ module: 1.5, teeth: 16, shift: 0.1 }, { module: 1.5, teeth: 14, kind: 'rack' }, /a rack of 14.*mm of rack a turn/s],
  ]) {
    const svg = diagram(a, b);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, says);
    assert.ok(!/NaN|Infinity|undefined/.test(svg), 'every number a number');
    assert.match(svg, /path of contact: [\d.]+ mm/);
    assert.equal((svg.match(/<path /g) || []).length, 4, 'both gears, in both panels');
  }
});

test('the README\'s example runs as written and prints what the README says', async () => {
  const fs = await import('node:fs'), { execFileSync } = await import('node:child_process');
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  const js = readme.match(/```js\n([\s\S]*?)```/)[1], expected = readme.match(/```text\n([\s\S]*?)```/)[1];
  const file = new URL('./.readme-example.mjs', import.meta.url);
  fs.writeFileSync(file, js);
  try { assert.equal(execFileSync(process.execPath, [(await import('node:url')).fileURLToPath(file)], { encoding: 'utf8' }), expected); } finally { fs.rmSync(file); }
});
