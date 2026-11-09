// From strokes to joint moves to step blocks: order the drawing, interpolate each stroke in joint space until the tool
// stays on the line, then turn that into synchronised steps a firmware can run.
import { chain, ik, internal, refuse } from './kinematics.mjs';
import { sheetFrame, sheetPoint } from './reach.mjs';

const num = Number.isFinite;
const { planeOf, twoLink, tip } = internal;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const round3 = (x) => Math.round(x * 1000) / 1000;

function normalise(input, who) {
  const list = Array.isArray(input) ? input : input && Array.isArray(input.strokes) ? input.strokes : null;
  if (!list) throw refuse('strokes.input', `${who}: give strokes, a list of { points: [[x, y], ...] } (got ${JSON.stringify(input)?.slice(0, 80)})`);
  if (!list.length) throw refuse('strokes.empty', `${who}: there are no strokes to draw`);
  return list.map((s, i) => {
    const raw = Array.isArray(s) ? { points: s } : s;
    if (!raw || !Array.isArray(raw.points)) throw refuse('strokes.points', `${who}: stroke ${i + 1} has no points`);
    if (raw.points.length < 2) throw refuse('strokes.points', `${who}: stroke ${i + 1} ("${raw.name ?? ''}") needs two points or more`);
    raw.points.forEach((p, k) => { if (!Array.isArray(p) || (p.length !== 2 && p.length !== 3) || !p.every(num)) throw refuse('strokes.points', `${who}: stroke ${i + 1} ("${raw.name ?? ''}"), point ${k + 1} is not [x, y] or [x, y, z] (got ${JSON.stringify(p)})`); });
    return { name: raw.name ?? `stroke${i + 1}`, points: raw.points, closed: !!raw.closed };
  });
}

const travelOf = (strokes, start) => {
  let t = 0, at = start;
  for (const s of strokes) { t += dist(at, s.points[0]); at = s.points[s.points.length - 1]; }
  return t;
};

/**
 * Strokes in an order that cuts the pen-up travel: from the start, always the nearest stroke end next, reversing a
 * stroke when its far end is nearer. If that would not help, the original order stands.
 * @param {object[] | { strokes: object[] }} strokes
 * @param {{ start?: number[] }} [opts] @returns {{ strokes: object[], travel: { before: number, after: number } }}
 */
export function orderStrokes(strokes, opts = {}) {
  const list = normalise(strokes, 'orderStrokes'), start = opts.start ?? [0, 0];
  if (!Array.isArray(start) || start.length < 2 || !start.every(num)) throw refuse('order.start', `orderStrokes: start is [x, y] (got ${JSON.stringify(start)})`);
  const before = travelOf(list, start), left = list.map((s, i) => i), out = [];
  let at = start;
  while (left.length) {
    let best = 0, reverse = false, d = Infinity;
    left.forEach((k, i) => {
      const s = list[k], a = dist(at, s.points[0]), b = dist(at, s.points[s.points.length - 1]);
      if (a < d) { d = a; best = i; reverse = false; }
      if (b < d) { d = b; best = i; reverse = true; }
    });
    const [k] = left.splice(best, 1), s = list[k];
    const chosen = reverse ? { ...s, points: [...s.points].reverse(), reversed: true } : s;
    out.push(chosen); at = chosen.points[chosen.points.length - 1];
  }
  const after = travelOf(out, start);
  return after < before ? { strokes: out, travel: { before, after } } : { strokes: list, travel: { before, after: before } };
}

const segmentDistance = (p, a, b) => {
  const ab = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0)), ap = [0, 1, 2].map((k) => (p[k] ?? 0) - (a[k] ?? 0));
  const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2], t = L > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
};

const MAX_DEPTH = 16;

// One attempt at the whole drawing, on one elbow
function attempt(c, strokes, opts, elbow) {
  const { tol, world, liftOf, home, ikOpts } = opts;
  const moves = [], findings = [];
  const solve = (p, start) => ik(c, p, { ...(elbow ? { elbow } : {}), ...ikOpts, ...(start ? { start } : {}) });
  const interior = [1, 2, 3, 4, 5, 6, 7].map((k) => k / 8);
  const deviation = (qa, qb, pa, pb) => {
    let worst = 0;
    for (const t of interior) worst = Math.max(worst, segmentDistance(tip(c, lerp(qa, qb, t)), pa, pb));
    return worst;
  };
  // [qa → qb], split until the joint-space line keeps the tool within tol; failure names where
  const subdivide = (qa, pa, qb, pb, depth, out) => {
    if (deviation(qa, qb, pa, pb) <= tol) { out.push({ q: qb, p: pb }); return null; }
    if (depth >= MAX_DEPTH) return { code: 'singular', reason: `the line cannot be followed within ${tol * 2} mm (near a singularity)`, point: pa };
    const m = lerp(pa, pb, 0.5), r = solve(m, lerp(qa, qb, 0.5));
    if (!r.ok) return { code: r.code || 'reach', reason: r.reason, miss: r.miss, point: m };
    return subdivide(qa, pa, r.q, m, depth + 1, out) || subdivide(r.q, m, qb, pb, depth + 1, out);
  };
  const report = (i, s, k, pt, f) => {
    const where = `stroke ${i + 1} ("${s.name}"), point ${k + 1} at (${round3(pt[0])}, ${round3(pt[1])})`;
    findings.push({ level: 'fail', text: `${where}: ${f.reason}`, code: f.code === 'limits' ? 'toolpath.limits' : f.code === 'singular' ? 'toolpath.singular' : 'toolpath.reach', at: pt, refs: { stroke: i, name: s.name, point: k }, values: { miss: f.miss ?? null } });
  };
  // Pen-up joint move between two poses, chopped so tool-space acceleration limits stay honest
  const jointMove = (kind, stroke, name, qa, qb) => {
    const span = Math.max(...qa.map((x, i) => Math.abs(qb[i] - x)), 0), n = Math.max(1, Math.ceil(span / 5));
    if (span < 1e-9) return null;
    const q = [], points = [];
    for (let i = 0; i <= n; i++) { const v = lerp(qa, qb, i / n); q.push(v); points.push(tip(c, v)); }
    return { kind, stroke, name, q, points };
  };
  const straight = (kind, stroke, name, qa, pa, qb, pb, i, s, k) => {
    const out = [], f = subdivide(qa, pa, qb, pb, 0, out);
    if (f) { report(i, s, k, f.point, f); return null; }
    return { kind, stroke, name, q: [qa, ...out.map((w) => w.q)], points: [pa, ...out.map((w) => w.p)] };
  };
  let last = home ? { q: home, p: tip(c, home) } : null;
  strokes.forEach((s, i) => {
    const pts = s.points.map(world);
    let start = solve(pts[0], last?.q);
    if (!start.ok) { report(i, s, 0, pts[0], start); return; }
    if (liftOf) { // lift, travel above the sheet, plunge
      if (last) {
        const up = liftOf(last.p), ru = solve(up, last.q);
        if (!ru.ok) { report(i, s, 0, up, ru); return; }
        const lift = straight('lift', i, s.name, last.q, last.p, ru.q, up, i, s, 0);
        if (!lift) return;
        if (lift.q.length > 1) moves.push(lift);
        last = { q: ru.q, p: up };
      }
      const above = liftOf(pts[0]), ra = solve(above, last?.q ?? start.q);
      if (!ra.ok) { report(i, s, 0, above, ra); return; }
      if (last) { const t = jointMove('travel', i, s.name, last.q, ra.q); if (t) moves.push(t); }
      const plunge = straight('plunge', i, s.name, ra.q, above, start.q, pts[0], i, s, 0);
      if (!plunge) return;
      if (plunge.q.length > 1) moves.push(plunge);
    } else if (last) {
      const t = jointMove('travel', i, s.name, last.q, start.q);
      if (t) moves.push(t);
    }
    const q = [start.q], points = [pts[0]];
    let bad = false;
    for (let k = 1; k < pts.length && !bad; k++) {
      const r = solve(pts[k], q[q.length - 1]);
      if (!r.ok) { report(i, s, k, pts[k], r); bad = true; break; }
      const out = [], f = subdivide(q[q.length - 1], points[points.length - 1], r.q, pts[k], 0, out);
      if (f) { report(i, s, k - 1, f.point, f); bad = true; break; }
      for (const w of out) { q.push(w.q); points.push(w.p); }
    }
    if (bad) return;
    moves.push({ kind: 'draw', stroke: i, name: s.name, q, points });
    last = { q: q[q.length - 1], p: points[points.length - 1] };
  });
  if (liftOf && last && !findings.length) { // finish clear of the sheet
    const up = liftOf(last.p), ru = solve(up, last.q);
    if (!ru.ok) report(strokes.length - 1, strokes[strokes.length - 1], strokes[strokes.length - 1].points.length - 1, up, ru);
    else {
      const lift = straight('lift', -1, 'end', last.q, last.p, ru.q, up, strokes.length - 1, strokes[strokes.length - 1], strokes[strokes.length - 1].points.length - 1);
      if (lift && lift.q.length > 1) moves.push(lift);
      if (lift) last = { q: ru.q, p: up };
    }
  }
  if (home && last && !findings.length) { const t = jointMove('travel', -1, 'home', last.q, home); if (t) moves.push(t); }
  return { moves, findings };
}

const pathLen = (pts) => pts.slice(1).reduce((t, p, i) => t + dist(pts[i], p), 0);

/**
 * Joint moves for a drawing: each stroke interpolated in joint space, subdivided until the tool stays within the
 * tolerance of the straight line. A move past the reach or a limit is refused, naming the stroke and point (ok: false
 * and a fail in findings); stepBlocks will not take a plan that is not ok.
 * @param {object} c
 * @param {object[] | { strokes: object[] }} strokes in mm; page coordinates (y down) when a sheet is given
 * @param {{ tolerance?: number, elbow?: 'left' | 'right', sheet?: object, transform?: number[], zUp?: number, home?: number[], ikTolerance?: number }} [opts] sheet: {size or width/height, at, normal, u?}; transform: 12 numbers, instead of a sheet; zUp: travel this far above the sheet (needs an axis that moves that way); home: start and end there
 * @returns {{ ok: boolean, chain: object, tolerance: number, elbow?: 'left' | 'right', moves: { kind: 'draw' | 'travel' | 'lift' | 'plunge', stroke: number, name: string, q: number[][], points: number[][] }[], length: { draw: number, travel: number }, findings: object[] }}
 */
export function planToolpath(c, strokes, opts = {}) {
  c = chain(/** @type {any} */ (c));
  const list = normalise(strokes, 'planToolpath');
  const { tolerance = 0.1, elbow, sheet, transform, zUp, home, ikTolerance = 1e-6 } = opts;
  if (!num(tolerance) || !(tolerance > 0)) throw refuse('toolpath.tolerance', `planToolpath: tolerance is a distance in mm, above 0 (got ${JSON.stringify(tolerance)})`);
  if (elbow !== undefined && elbow !== 'left' && elbow !== 'right') throw refuse('ik.elbow', `planToolpath: elbow is 'left' or 'right' (got ${JSON.stringify(elbow)})`);
  if (sheet && transform) throw refuse('toolpath.input', 'planToolpath: give sheet or transform, not both');
  if (transform && (!Array.isArray(transform) || transform.length !== 12 || !transform.every(num))) throw refuse('toolpath.transform', `planToolpath: transform is 12 numbers, three rows of four (got ${JSON.stringify(transform)})`);
  if (zUp != null && (!num(zUp) || !(zUp > 0))) throw refuse('toolpath.zUp', `planToolpath: zUp is a height in mm, above 0 (got ${JSON.stringify(zUp)})`);
  if (home != null && (!Array.isArray(home) || home.length !== c.dof || !home.every(num))) throw refuse('toolpath.home', `planToolpath: home is ${c.dof} joint values (got ${JSON.stringify(home)})`);
  const frame = sheet ? sheetFrame(sheet) : null;
  const world = frame ? (p) => sheetPoint(frame, p[0] - frame.width / 2, frame.height / 2 - p[1], p[2] ?? 0)
    : transform ? (p) => { const z = p[2] ?? 0; return [transform[0] * p[0] + transform[1] * p[1] + transform[2] * z + transform[3], transform[4] * p[0] + transform[5] * p[1] + transform[6] * z + transform[7], transform[8] * p[0] + transform[9] * p[1] + transform[10] * z + transform[11]]; }
      : (p) => (p.length === 3 ? p : [p[0], p[1], tip(c, new Array(c.dof).fill(0))[2]]);
  let liftOf = null;
  if (zUp != null) {
    const n = frame ? frame.n : [0, 0, 1], plane = planeOf(c);
    if (plane && Math.abs(plane[0] * n[0] + plane[1] * n[1] + plane[2] * n[2]) > 1 - 1e-9) throw refuse('toolpath.zUp', `planToolpath: zUp needs an axis that moves off the sheet; this chain (${c.names.join(', ')}) stays in one plane: use the pen commands (penUp, penDown) for a servo lift`);
    liftOf = (p) => [p[0] + n[0] * zUp, p[1] + n[1] * zUp, p[2] + n[2] * zUp];
  }
  const ctx = { tol: tolerance / 2, world, liftOf, home, ikOpts: { tolerance: ikTolerance } };
  let run, used = elbow;
  if (!elbow && twoLink(c)) {
    // Hold one elbow for the whole drawing: right if it does, else left if that does better
    const a = attempt(c, list, ctx, 'right');
    const b = a.findings.length ? attempt(c, list, ctx, 'left') : null;
    if (b && b.findings.length < a.findings.length) { run = b; used = 'left'; } else { run = a; used = 'right'; }
  } else run = attempt(c, list, ctx, elbow);
  const out = [...run.findings];
  const draw = run.moves.filter((m) => m.kind === 'draw').reduce((t, m) => t + pathLen(m.points), 0), travel = run.moves.filter((m) => m.kind !== 'draw').reduce((t, m) => t + pathLen(m.points), 0);
  if (!run.findings.length) out.push({ level: 'pass', text: `${list.length} stroke${list.length === 1 ? '' : 's'} reached and within ${tolerance} mm of straight`, code: 'toolpath.ok', values: { draw, travel } });
  return { ok: !run.findings.length, chain: c, tolerance, ...(used ? { elbow: used } : {}), moves: run.moves, length: { draw, travel }, findings: out };
}

function resolveAxes(c, axes) {
  if (!Array.isArray(axes) || !axes.length) throw refuse('steps.axes', `stepBlocks: axes is a list of { name, stepsPerUnit }, one per driven joint (${c.names.join(', ')})`);
  return c.names.map((name, k) => {
    const a = axes.find((x) => x && x.name === name);
    if (!a) throw refuse('steps.axes', `stepBlocks: no axis for joint "${name}" (axes given: ${axes.map((x) => x?.name).join(', ')})`);
    const j = c.joints.find((x) => x.name === name);
    let spu = a.stepsPerUnit;
    if (spu == null) {
      if (!num(a.stepAngle) || !(a.stepAngle > 0) || !num(a.microsteps) || !(a.microsteps > 0)) throw refuse('steps.axes', `stepBlocks: axis "${name}" needs stepsPerUnit, or stepAngle and microsteps`);
      const ratio = a.ratio ?? j.ratio ?? 1, perMotorTurn = (360 / a.stepAngle) * a.microsteps;
      if (j.type === 'prismatic') {
        if (!num(a.lead) || !(a.lead > 0)) throw refuse('steps.axes', `stepBlocks: prismatic axis "${name}" needs lead, the mm moved by one turn of its screw or pulley`);
        spu = (perMotorTurn * ratio) / a.lead;
      } else spu = (perMotorTurn * ratio) / 360;
    }
    if (!num(spu) || !(spu > 0)) throw refuse('steps.axes', `stepBlocks: axis "${name}" stepsPerUnit is steps per ${j.type === 'revolute' ? 'degree' : 'mm'}, above 0 (got ${JSON.stringify(spu)})`);
    return { name, stepsPerUnit: spu, unit: j.type === 'revolute' ? 'deg' : 'mm', ...(a.maxRate != null ? { maxRate: a.maxRate } : {}), k };
  });
}

/**
 * Synchronised step blocks for a plan: integer steps per axis (run with Bresenham), a trapezoidal speed profile whose
 * acceleration is limited at the tool, and pen commands with their dwell. Plain JSON: see the README for the format.
 * @param {object} plan a plan from planToolpath, ok: true
 * @param {{ axes: { name: string, stepsPerUnit?: number, stepAngle?: number, microsteps?: number, ratio?: number, lead?: number, maxRate?: number }[], speed: number, accel: number, travelSpeed?: number, penUp?: number, penDown?: number, corner?: number }} opts speed mm/s, accel mm/s², penUp and penDown seconds, corner the junction deviation in mm
 * @returns {{ format: string, axes: object[], start: number[], speed: number, accel: number, blocks: object[], findings: object[], time: number }}
 */
export function stepBlocks(plan, opts) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.moves) || !plan.chain) throw refuse('steps.plan', 'stepBlocks: give a plan from planToolpath');
  if (!plan.ok) throw refuse('steps.plan', `stepBlocks: the plan was refused: ${plan.findings.find((f) => f.level === 'fail')?.text ?? 'see its findings'}`);
  if (!opts || typeof opts !== 'object') throw refuse('steps.input', 'stepBlocks: give { axes, speed, accel }');
  const c = chain(plan.chain), { speed, accel, penUp = 0.15, penDown = 0.15, corner = 0.05 } = opts, travelSpeed = opts.travelSpeed ?? speed;
  for (const [n, v] of [['speed', speed], ['accel', accel], ['travelSpeed', travelSpeed]]) if (!num(v) || !(v > 0)) throw refuse(`steps.${n}`, `stepBlocks: ${n} is above 0 (got ${JSON.stringify(v)})`);
  for (const [n, v] of [['penUp', penUp], ['penDown', penDown], ['corner', corner]]) if (!num(v) || v < 0) throw refuse(`steps.${n}`, `stepBlocks: ${n} is 0 or more (got ${JSON.stringify(v)})`);
  const axes = resolveAxes(c, opts.axes), N = axes.length;
  if (!plan.moves.length) throw refuse('steps.plan', 'stepBlocks: the plan has no moves');
  const toSteps = (q) => q.map((v, k) => Math.round(v * axes[k].stepsPerUnit));
  const out = [], findings = [];
  const start = toSteps(plan.moves[0].q[0]);
  let pos = [...start], pen = null, clipped = 0;
  const addPen = (state) => { out.push({ type: 'pen', state, dwell: state === 'down' ? penDown : penUp }); pen = state; };
  // A run of lines between pen commands starts and stops at rest
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const n = run.length;
    const vMax = run.map((b) => b.vLimit), L = run.map((b) => b.length), dirs = run.map((b) => b.dir);
    const junction = new Array(n + 1).fill(0);
    for (let i = 1; i < n; i++) {
      const cos = -(dirs[i - 1][0] * dirs[i][0] + dirs[i - 1][1] * dirs[i][1] + dirs[i - 1][2] * dirs[i][2]);
      let v2 = Infinity;
      if (cos > 0.999999) v2 = 0;
      else if (cos > -0.999999) { const s = Math.sqrt(0.5 * (1 - cos)); v2 = (accel * corner * s) / (1 - s); }
      junction[i] = Math.min(v2, vMax[i - 1] ** 2, vMax[i] ** 2);
    }
    for (let i = n - 1; i > 0; i--) junction[i] = Math.min(junction[i], junction[i + 1] + 2 * accel * L[i]);
    for (let i = 1; i < n; i++) junction[i] = Math.min(junction[i], junction[i - 1] + 2 * accel * L[i - 1]);
    run.forEach((b, i) => {
      const e2 = junction[i], x2 = junction[i + 1], a = accel, v2Cap = vMax[i] ** 2;
      let p2 = (2 * a * L[i] + e2 + x2) / 2;
      if (p2 > v2Cap) p2 = v2Cap;
      p2 = Math.max(p2, e2, x2);
      const e = Math.sqrt(e2), x = Math.sqrt(x2), p = Math.sqrt(p2), d1 = (p2 - e2) / (2 * a), d3 = (p2 - x2) / (2 * a), cruise = Math.max(0, L[i] - d1 - d3);
      const time = (p - e) / a + (p > 0 ? cruise / p : 0) + (p - x) / a;
      const rate = b.major / L[i];
      out.push({ type: 'move', kind: b.kind, stroke: b.stroke, steps: b.steps, major: b.major, length: L[i], entry: e, peak: p, exit: x, rate: { entry: e * rate, peak: p * rate, exit: x * rate, accel: a * rate }, accelSteps: Math.round((b.major * d1) / L[i]), decelSteps: Math.round((b.major * d3) / L[i]), time });
    });
    run = [];
  };
  addPen('up');
  for (const m of plan.moves) {
    const wantDown = m.kind === 'draw';
    if (wantDown && pen !== 'down') { flush(); addPen('down'); }
    if (!wantDown && pen !== 'up') { flush(); addPen('up'); }
    let i0 = 0;
    for (let i = 1; i < m.q.length; i++) {
      const target = toSteps(m.q[i]), steps = target.map((s, k) => s - pos[k]);
      const major = Math.max(...steps.map(Math.abs));
      if (!major) continue;
      const pa = m.points[i0], pb = m.points[i], chord = dist(pa, pb), len = Math.max(chord, 1e-3);
      const dir = chord > 1e-12 ? [(pb[0] - pa[0]) / chord, (pb[1] - pa[1]) / chord, (pb[2] - pa[2]) / chord] : [1, 0, 0];
      let vLimit = wantDown ? speed : travelSpeed;
      for (let k = 0; k < N; k++) if (axes[k].maxRate && steps[k]) {
        const v = (axes[k].maxRate * len) / Math.abs(steps[k]);
        if (v < vLimit) { vLimit = v; clipped++; }
      }
      run.push({ kind: m.kind, stroke: m.stroke, steps, major, length: len, dir, vLimit });
      pos = target; i0 = i;
    }
  }
  flush();
  if (pen !== 'up') addPen('up');
  if (clipped) findings.push({ level: 'info', text: `${clipped} move${clipped === 1 ? '' : 's'} slowed by an axis step-rate limit`, code: 'steps.rate', values: { clipped } });
  const header = { format: 'rulecad.steps/1', axes: axes.map(({ k, ...a }) => a), start, speed, accel, travelSpeed, penUp, penDown, blocks: out, findings };
  return { ...header, time: estimate(header).time };
}

/**
 * Time and travel for a set of step blocks.
 * @param {object} blocks stepBlocks' result
 * @returns {{ time: number, draw: number, travel: number, pen: number, moves: number, steps: number[] }}
 */
export function estimate(blocks) {
  const list = Array.isArray(blocks) ? blocks : blocks?.blocks;
  if (!Array.isArray(list)) throw refuse('steps.input', 'estimate: give what stepBlocks returned');
  let time = 0, draw = 0, travel = 0, pen = 0, moves = 0;
  let steps = null;
  for (const b of list) {
    if (b.type === 'pen') { time += b.dwell; pen += b.dwell; continue; }
    time += b.time; moves++;
    if (b.kind === 'draw') draw += b.length; else travel += b.length;
    if (!steps) steps = new Array(b.steps.length).fill(0);
    b.steps.forEach((s, k) => { steps[k] += Math.abs(s); });
  }
  return { time, draw, travel, pen, moves, steps: steps ?? [] };
}

/**
 * Runs step blocks through forward kinematics, step by step, as the Bresenham a firmware would run.
 * @param {object} blocks stepBlocks' result
 * @param {object} c the chain @param {object[]} [axes] overrides the axes the blocks carry
 * @returns {{ strokes: { points: number[][] }[], travels: { points: number[][] }[], steps: number[], q: number[], pen: string }}
 */
export function replay(blocks, c, axes) {
  c = chain(/** @type {any} */ (c));
  if (!blocks || !Array.isArray(blocks.blocks)) throw refuse('steps.input', 'replay: give what stepBlocks returned');
  const ax = axes ? resolveAxes(c, axes) : c.names.map((name) => {
    const a = blocks.axes.find((x) => x.name === name);
    if (!a) throw refuse('steps.axes', `replay: the blocks have no axis for joint "${name}"`);
    return a;
  });
  const spu = ax.map((a) => a.stepsPerUnit), pos = [...blocks.start];
  const at = () => tip(c, pos.map((s, k) => s / spu[k]));
  const strokes = [], travels = [];
  let pen = 'up', current = null;
  const open = () => { current = { points: [at()] }; (pen === 'down' ? strokes : travels).push(current); };
  open();
  for (const b of blocks.blocks) {
    if (b.type === 'pen') { if (b.state !== pen) { pen = b.state; open(); } continue; }
    const acc = b.steps.map(() => b.major >> 1), abs = b.steps.map(Math.abs), sgn = b.steps.map(Math.sign);
    for (let n = 0; n < b.major; n++) {
      for (let k = 0; k < abs.length; k++) { acc[k] += abs[k]; if (acc[k] >= b.major) { acc[k] -= b.major; pos[k] += sgn[k]; } }
      current.points.push(at());
    }
  }
  return { strokes, travels, steps: pos, q: pos.map((s, k) => s / spu[k]), pen };
}
