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
  // closer eats the backlash (2 Δa tan α of it): 0.1 closer leaves 0.08 mm, 0.2 closer 0.004 (tight), 0.3 jams
  assert.equal(mesh(a, b, { centre: 29.9 }).findings.find((x) => x.code === 'mesh.centre').level, 'pass');
  assert.match(mesh(a, b, { centre: 29.9 }).findings.find((x) => x.code === 'mesh.centre').text, /0\.1 mm closer than the 30 they need: 0\.08 mm of backlash/);
  assert.equal(mesh(a, b, { centre: 29.8 }).findings.find((x) => x.code === 'mesh.centre').level, 'warn');
  assert.match(mesh(a, b, { centre: 29.7 }).findings.find((x) => x.code === 'mesh.centre').text, /0\.3 mm closer .* more than their 0\.15 mm of backlash allows, and the teeth jam/);
  assert.equal(mesh(a, b, { centre: 29.7 }).findings.find((x) => x.code === 'mesh.centre').level, 'fail');
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
  // odd and even pinions alike (the phase was once half a tooth out for odd ones)
  for (const teeth of [17, 18, 19, 21, 24]) {
    const p = gearModel({ module: 1, teeth }), P = spurProfile({ module: 1, teeth }).loops[0], s1 = rackPhase(p, 30), per1 = (Math.PI * p.pitch) / 360, c1 = mesh(p, k).centre;
    for (let deg = -20; deg <= 20; deg += 5) assert.ok(clear(place(P, (deg * Math.PI) / 180, [30, c1]), K.map(([x, y]) => [x + per1 * deg + s1, y])), `${teeth} teeth on the rack, clear at ${deg}°`);
  }
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
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // (git on Windows checks it out with CRLF)
  const js = readme.match(/```js\n([\s\S]*?)```/)[1], expected = readme.match(/```text\n([\s\S]*?)```/)[1];
  const file = new URL('./.readme-example.mjs', import.meta.url);
  fs.writeFileSync(file, js);
  try { assert.equal(execFileSync(process.execPath, [(await import('node:url')).fileURLToPath(file)], { encoding: 'utf8' }).replace(/\r\n/g, '\n'), expected); } finally { fs.rmSync(file); }
});

test('helical and herringbone: the profile turns z tan β / r up the width, back at the middle for a herringbone; solids close', async () => {
  const { helical, herringbone } = await import('@rulecad/gears');
  const p = { module: 1, teeth: 20, width: 10, helix: 20, chamfer: 0 }, k = Math.tan((20 * Math.PI) / 180) / 10;
  // the angle of the tooth tip nearest +x at a height
  // the angle of the tooth tip nearest an expected angle, at a height
  const tipAngle = (g, z, near0 = 0) => { const vs = jscad.geometries.geom3.toPolygons(g).flatMap((q) => q.vertices).filter((v) => Math.abs(v[2] - z) < 1e-6 && Math.hypot(v[0], v[1]) > 10.99); const a = vs.map((v) => { let d = Math.atan2(v[1], v[0]) - near0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }).filter((x) => Math.abs(x) < Math.PI / 20); return near0 + (Math.min(...a) + Math.max(...a)) / 2; };
  const h = helical(p);
  near(tipAngle(h, 10, 10 * k) - tipAngle(h, 0), 10 * k, 1e-3, 'right hand: anticlockwise up z by w tan β / r');
  near(tipAngle(helical({ ...p, hand: 'left' }), 10, -10 * k) - tipAngle(helical({ ...p, hand: 'left' }), 0), -10 * k, 1e-3, 'left hand: the other way');
  const hb = herringbone(p);
  near(tipAngle(hb, 5, 5 * k) - tipAngle(hb, 0), 5 * k, 1e-3, 'herringbone: to the middle'); near(tipAngle(hb, 10) - tipAngle(hb, 0), 0, 1e-3, 'and back');
  for (const g of [h, hb, helical({ ...p, chamfer: 0.25 }), internal({ module: 1, teeth: 60, width: 6, helix: 15 }), rack({ module: 1, teeth: 8, width: 6, helix: 15 })]) assert.equal(closed(g), 0, 'closed');
  assert.throws(() => helical({ ...p, helix: 0 }), /helical: give a helix angle above 0°/);
  assert.throws(() => gearModel({ module: 1, teeth: 20, helix: 50 }), /helix is a number from 0 to 45°/);
  assert.throws(() => gearModel({ module: 1, teeth: 20, helix: 20, hand: 'up' }), /hand is "right" or "left"/);
  assert.throws(() => gearModel({ module: 1, teeth: 20, herringbone: true }), /a herringbone needs a helix angle/);
});

test('helical pairs mesh at every height with opposite hands (a ring or rack with the same); the overlap ratio adds to the contact', () => {
  const clear = (A, B) => !A.some((q) => inside(q, B)) && !B.some((q) => inside(q, A));
  const k = (g, hand) => ((hand === 'left' ? -1 : 1) * Math.tan((20 * Math.PI) / 180)) / (g.pitch / 2);
  const p1 = { module: 1, teeth: 18, helix: 20 }, a = gearModel(p1), A = spurProfile(p1).loops[0];
  for (const [hand2, ok] of [['left', true], ['right', false]]) {
    const p2 = { module: 1, teeth: 31, helix: 20, hand: hand2 }, b = gearModel(p2), B = spurProfile(p2).loops[0], m = mesh(a, b), ph = phase(a, b, 0);
    const at = (z, deg) => clear(place(A, (deg * Math.PI) / 180 + k(a, 'right') * z), place(B, ((m.ratio * deg + ph) * Math.PI) / 180 + k(b, hand2) * z, [m.centre, 0]));
    const everywhere = [0, 4, 8].every((z) => [0, 5, 10].every((deg) => at(z, deg)));
    assert.equal(everywhere, ok, `${hand2}-handed mate: ${ok ? 'clear at every height' : 'collides up the width'}`);
    assert.equal(m.findings.some((x) => x.code === 'mesh.helix'), !ok, `${hand2}: said`);
  }
  const m = mesh(a, gearModel({ module: 1, teeth: 31, helix: 20, hand: 'left' }), { width: 8 });
  near(m.overlap, (8 * Math.tan((20 * Math.PI) / 180)) / Math.PI, 1e-12, 'overlap ratio b tan β / π m');
  assert.ok(m.contact > mesh(gearModel({ module: 1, teeth: 18 }), gearModel({ module: 1, teeth: 31 })).contact + 0.9, 'contact grows by the overlap');
  near(m.thrust, Math.tan((20 * Math.PI) / 180), 1e-12, 'thrust per newton');
  assert.equal(mesh(gearModel({ ...p1, herringbone: true }), gearModel({ module: 1, teeth: 31, helix: 20, hand: 'left', herringbone: true })).thrust, 0, 'a herringbone pushes nothing along its axis');
  assert.ok(!mesh(a, internalModel({ module: 1, teeth: 60, helix: 20 })).findings.some((x) => x.code === 'mesh.helix'), 'a ring: the same hand');
  assert.ok(!mesh(a, rackModel({ module: 1, teeth: 9, helix: 20 })).findings.some((x) => x.code === 'mesh.helix'), 'a rack: the same hand');
  assert.equal(mesh(a, gearModel({ module: 1, teeth: 31, helix: 25, hand: 'left' })).findings.find((x) => x.code === 'mesh.helix').level, 'fail', 'angles differ');
  const x1c = { line: 0.42, layer: 0.2, nozzle: 0.4 };
  assert.equal(printable(gearModel({ module: 1, teeth: 20, helix: 43 }), x1c).find((x) => x.code === 'gear.helix').level, 'warn', '43° leans past 45° at the tips');
  assert.equal(printable(gearModel({ module: 1, teeth: 20, helix: 25 }), x1c).find((x) => x.code === 'gear.helix').level, 'pass');
  assert.ok(printable(gearModel({ module: 1, teeth: 20, helix: 25 }), x1c).some((x) => x.code === 'gear.thrust'));
});

test('planetary: teeth that put together for the ratio asked, nearest first; every planet in phase with the sun and the ring as the carrier turns', async () => {
  const { planetary, planetaryRatio } = await import('@rulecad/gears');
  // known gearboxes
  for (const [spec, teeth, ratio] of [
    [{ module: 1, ratio: 5 }, [18, 27, 72], 5],
    [{ module: 1, ratio: 4, planets: 4 }, [17, 17, 51], 4],
    [{ module: 1, ratio: -3, held: 'carrier', input: 'sun', output: 'ring' }, [18, 18, 54], -3],
  ]) {
    const { best, findings } = planetary(spec);
    assert.deepEqual([best.sun.teeth, best.planet.teeth, best.ring.teeth], teeth, JSON.stringify(spec));
    near(best.ratio, ratio, 1e-12, 'ratio'); assert.equal(findings.find((x) => x.code === 'planetary.ratio').level, 'pass');
    assert.equal(best.ring.teeth, best.sun.teeth + 2 * best.planet.teeth, 'the ring is the sun and two planets across');
    assert.equal((best.sun.teeth + best.ring.teeth) % best.planets.length, 0, 'the planets go in evenly spaced');
  }
  // Willis, every way round: one way is the other's inverse
  const t = { sun: 18, ring: 72 };
  near(planetaryRatio(t, { held: 'ring', input: 'sun', output: 'carrier' }) * planetaryRatio(t, { held: 'ring', input: 'carrier', output: 'sun' }), 1, 1e-12, 'inverse');
  near(planetaryRatio(t, { held: 'sun', input: 'ring', output: 'carrier' }), 90 / 72, 1e-12, 'sun held');
  // asked for what doesn't fit: the nearest that does, said
  const small = planetary({ module: 1, ratio: 2.5, size: 80 });
  assert.equal(small.findings[0].level, 'fail'); assert.match(small.findings[0].text, /16\.8% from the 2\.5 asked: the nearest that puts together/);
  assert.throws(() => planetary({ module: 1, ratio: 5, size: 30 }), /no teeth put together within a rim of 30 mm/);
  assert.throws(() => planetary({ module: 1, ratio: 5, planets: 1 }), /planets is a whole number from 2 to 8/);
  assert.throws(() => planetary({ module: 1, ratio: 5, held: 'ring', input: 'ring' }), /held, input and output are the sun, the carrier and the ring, one each/);
  // in phase: turn the carrier (the ring held) and every planet clears the sun and the ring
  const { best } = planetary({ module: 1, ratio: 5 }), deg = Math.PI / 180;
  const sunP = spurProfile({ module: 1, teeth: best.sun.teeth }).loops[0], planetP = spurProfile({ module: 1, teeth: best.planet.teeth }).loops[0];
  const ringHole = internalProfile({ module: 1, teeth: best.ring.teeth }).loops[1], ring = place(ringHole, best.ring.angle * deg);
  const S = best.sun.teeth, P = best.planet.teeth, R = best.ring.teeth;
  const at = (c, nudge = 0) => {
    const sun = place(sunP, (1 + R / S) * c * deg);
    return best.planets.every((pl, k) => {
      const where = (pl.place + c) * deg, centre = [best.centre * Math.cos(where), best.centre * Math.sin(where)];
      const planet = place(planetP, (pl.angle + (k ? 0 : nudge) + c * (1 - R / P)) * deg, centre);
      return !planet.some((q) => inside(q, sun)) && !sun.some((q) => inside(q, planet)) && planet.every((q) => inside(q, ring)) && !ring.some((q) => inside(q, planet));
    });
  };
  for (let c = 0; c < 20; c += 2.5) assert.ok(at(c), `every planet clear with the carrier at ${c}°`);
  assert.ok(!at(0, 180 / P), 'a planet half a tooth out collides');
});

test('strength by Lewis: σ = F / b m Y, the torque at a safety factor, helical teeth in their normal section', async () => {
  const { strength, lewisFactor } = await import('@rulecad/gears');
  assert.equal(lewisFactor(18), 0.309); assert.equal(lewisFactor(Infinity), 0.485);
  near(lewisFactor(25), (0.337 + 0.346) / 2, 1e-12, 'between rows, along a line');
  const pla = { strength: 39, name: 'PLA' }, g = gearModel({ module: 1, teeth: 18 });
  const s = strength(g, { width: 6, material: pla, torque: 500 });
  near(s.stress, 500 / 9 / (6 * 1 * 0.309), 1e-9, 'by hand: 55.6 N over 6 × 1 × 0.309');
  assert.equal(s.findings[0].level, 'warn', '1.3× is under the 2× asked'); assert.match(s.findings[0].text, /1\.3× under PLA's 39 MPa, under the 2× asked/);
  assert.equal(strength(g, { width: 6, material: pla, torque: 2000 }).findings[0].level, 'fail', 'past the strength: they break');
  near(strength(g, { width: 6, material: pla, safety: 2 }).torque, (39 / 2) * 6 * 1 * 0.309 * 9, 1e-9, 'the torque it carries at 2×');
  // helical: the normal module and the virtual teeth, a little weaker per tooth than the transverse numbers suggest
  const h = strength(gearModel({ module: 1, teeth: 18, helix: 30 }), { width: 6, material: pla, torque: 500 });
  near(h.Y, lewisFactor(18 / Math.cos(Math.PI / 6) ** 3), 1e-12, 'virtual teeth z / cos³β');
  near(h.stress, 500 / 9 / (6 * Math.cos(Math.PI / 6) * h.Y), 1e-9, 'normal module');
  assert.ok(strength(g, { width: 6, material: pla, torque: 500, speed: 600 }).stress > s.stress, 'speed adds Barth\'s factor');
  assert.throws(() => strength(g, { width: 6, material: {} }), /the material needs a strength above 0 MPa/);
  assert.throws(() => strength(rackModel({ module: 1, teeth: 9 }), { width: 6, material: pla, torque: 100 }), /a rack takes a force, not a torque/);
});

test('contact: the mesh measured from the drawn teeth agrees with the reckoning, and finds interference where it is', async () => {
  const { contact } = await import('@rulecad/gears');
  const p18 = { module: 1, teeth: 18 }, p30 = { module: 1, teeth: 30 };
  const nominal = contact(p18, p30);
  assert.ok(nominal.backlash.least > 0.145 && nominal.backlash.most < 0.16, `0.15 mm drawn: ${JSON.stringify(nominal.backlash)}`);
  assert.ok(nominal.error < 0.005, `transmission error under 5 µm: ${nominal.error}`);
  // apart: the play grows by about 2 Δa tan α
  const apart = contact(p18, p30, { centre: 24.2 });
  near(apart.backlash.least, 0.15 + 2 * 0.2 * Math.tan((20 * Math.PI) / 180), 0.01, 'further apart');
  // closer: the play goes, then the teeth cross
  assert.equal(contact(p18, p30, { centre: 23.8 }).findings.find((x) => x.code === 'mesh.backlash').level, 'warn', '0.2 closer: tight');
  assert.equal(contact(p18, p30, { centre: 23.7 }).findings[0].code, 'mesh.interference', '0.3 closer: they cross');
  // a ring and a rack, measured as drawn
  for (const [b, what] of [[{ module: 1, teeth: 60, kind: 'internal' }, 'ring'], [{ module: 1, teeth: 30, kind: 'rack' }, 'rack']]) {
    const r = contact(p18, b);
    assert.ok(r.backlash.least > 0.14 && r.backlash.most < 0.16, `${what}: ${JSON.stringify(r.backlash)}`);
  }
  // no backlash drawn: the play is all but gone, and said
  assert.equal(contact({ ...p18, backlash: 0 }, { ...p30, backlash: 0 }).findings.find((x) => x.code === 'mesh.backlash').level, 'warn');
});

test('a tooth by finite elements: the root of its loaded side, settled, about 1.3× Lewis (the fillet\'s concentration)', async () => {
  const { toothStress } = await import('@rulecad/gears');
  const pla = { E: 2680, nu: 0.36, strength: 39, name: 'PLA' };
  const r = toothStress({ module: 1, teeth: 18 }, { width: 6, torque: 400, material: pla });
  // AGMA's geometry factor for 18 teeth loaded at the tip (J ≈ 0.24 against Y 0.309) puts the concentration near 1.3
  assert.ok(r.ratio > 1.15 && r.ratio < 1.5, `${r.ratio}× Lewis`);
  assert.ok(Math.abs(r.change) < 0.05, `settled: ${r.change}`);
  assert.ok(Math.hypot(...r.at) - 7.75 < 0.5, `at the root: ${r.at}`);
  assert.equal(r.findings[0].code, 'gear.fe'); assert.equal(r.findings[0].level, 'warn', '400 N·mm on a 6 mm module 1 pinion of PLA: under 2×');
  assert.match(toothStress({ module: 1, teeth: 18 }, { width: 6, torque: 600, material: pla }).findings[0].text, /over PLA's 39 MPa, it breaks/);
  assert.throws(() => toothStress({ module: 1, teeth: 18 }, { width: 6, torque: 400, material: {} }), /needs a modulus E/);
});

test('worms: the thread\'s axial section is the basic rack\'s tooth, one lead a turn; the wheel\'s numbers, locking and efficiency', async () => {
  const { wormModel, worm, wormWheel, wormMesh } = await import('@rulecad/gears');
  const w = wormModel({ module: 1 });
  near(w.leadAngle, Math.atan(1 / 10) / (Math.PI / 180), 1e-9, 'lead angle: atan(lead / π d)');
  assert.equal(w.locks, true, 'a single start at μ 0.25 locks');
  const s = worm({ module: 1, length: 12, chamfer: 0 });
  assert.equal(closed(s), 0, 'closed');
  // along +x (angle 0), the radius up the axis: crests a pitch apart, at the tip radius, the space centres at the root
  const onAxis = jscad.geometries.geom3.toPolygons(s).flatMap((q) => q.vertices).filter((v) => Math.abs(v[1]) < 0.05 && v[0] > 0);
  const crest = onAxis.filter((v) => v[0] > 5.95).map((v) => v[2]);
  assert.ok(crest.length > 3, `crests along +x: ${crest.length}`);
  const pitch = Math.PI, phaseOf = (z) => ((z % pitch) + pitch) % pitch;
  // the rack's teeth are centred half a pitch from its spaces: the crests at z ≡ π/2 (mod π) at angle 0
  for (const z of crest) assert.ok(Math.abs(phaseOf(z) - pitch / 2) < 0.6, `a crest at z ${z.toFixed(2)}: ${phaseOf(z).toFixed(2)} into the pitch`);
  assert.ok(onAxis.some((v) => v[0] < 3.8), 'the roots reach the root radius');
  assert.equal(closed(wormWheel({ module: 1 }, { teeth: 30, width: 6 })), 0, 'the wheel closes');
  const m = wormMesh({ module: 1 }, { teeth: 30 });
  assert.equal(m.centre, 20); near(m.ratio, 1 / 30, 1e-12, 'one tooth a turn');
  assert.equal(wormMesh({ module: 1, starts: 3, diameter: 8 }, { teeth: 30 }).locks, false, 'three starts on a thin worm: back-drivable');
  assert.throws(() => wormModel({ module: 1, starts: 5 }), /starts is a whole number from 1 to 4/);
  assert.throws(() => wormModel({ module: 1, diameter: 5 }), /leaves under two modules of core/);
});

test('bevel gears: cone angles that add to the shaft angle, Tredgold\'s virtual teeth, a closed solid, and refusals', async () => {
  const { bevelModel, bevel, bevelMesh } = await import('@rulecad/gears');
  const a = bevelModel({ module: 1.5, teeth: 20, mate: 30 }), b = bevelModel({ module: 1.5, teeth: 30, mate: 20 });
  near(a.pitchAngle, Math.atan(20 / 30) / (Math.PI / 180), 1e-9, 'tan δ1 = z1 / z2 at 90°'); near(a.pitchAngle + b.pitchAngle, 90, 1e-9, 'they add to the shaft angle');
  near(a.coneDistance, 15 / Math.sin(a.pitchAngle * (Math.PI / 180)), 1e-9, 'R = r / sin δ'); near(a.virtualTeeth, 20 / Math.cos(a.pitchAngle * (Math.PI / 180)), 1e-9, 'z / cos δ');
  const at60 = bevelModel({ module: 1, teeth: 20, mate: 20, shaftAngle: 60 }); near(at60.pitchAngle, 30, 1e-9, 'a 1:1 pair at 60°: 30° cones');
  const s = bevel({ module: 1.5, teeth: 20, mate: 30, bore: 4 });
  assert.equal(closed(s), 0, 'closed');
  const [lo, hi] = jscad.measurements.measureBoundingBox(s); near(hi[2], a.width * Math.cos(a.pitchAngle * (Math.PI / 180)), 1e-6, 'as tall as the face width along the axis');
  assert.equal(bevelMesh({ module: 1.5, teeth: 20 }, { module: 1.5, teeth: 30 }).ratio, 2 / 3);
  assert.throws(() => bevelModel({ module: 1.5, teeth: 20, mate: 30, width: 12 }), /over a third of the cone distance/);
  assert.throws(() => bevelModel({ module: 1, teeth: 10, mate: 40 }), /undercut \(as [\d.]+ on their back cone\)/);
  assert.throws(() => bevelModel({ module: 1, teeth: 20 }), /mate is a whole number of 6 or more/);
});

test('a stage passes on its share of the power: per mesh, two in a planetary, a worm by its own lead', async () => {
  const { stageEfficiency, wormModel } = await import('@rulecad/gears');
  assert.equal(stageEfficiency('spur'), 0.95); assert.equal(stageEfficiency('rack'), 0.95);
  near(stageEfficiency('planetary'), 0.9025, 1e-9, 'two meshes');
  assert.equal(stageEfficiency('spur', { efficiency: 0.9 }), 0.9);
  const w = wormModel({ module: 1, starts: 1 }); assert.equal(stageEfficiency('worm', { worm: w }), w.efficiency);
  assert.throws(() => stageEfficiency('worm'), /needs its model/);
  assert.throws(() => stageEfficiency('chain'), /no kind of stage "chain"/);
  assert.throws(() => stageEfficiency('spur', { efficiency: 2 }), /from 0 to 1/);
});
