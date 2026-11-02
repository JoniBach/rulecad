// A lamina mechanism, solved as it would behave: its flexures as beams that bend as far as they bend (beams.mjs), its
// bodies rigid, touching where they meet, and a hand that drives, holds or lets go of each joint as the sequence says.
// What comes out: the force the hand needs along each step (a force curve), where a latch lets go and how hard the
// trigger was pulled then, whether a catch holds when let go of, the strain in each flexure, and the shapes, bent as
// they bend, for an animation.
//
// The hand, step by step (from one state to the next):
//   a joint the next state sets to a new value is driven there (a stiff spring pulls its body's centre along the way
//   the kinematic model moves it), unless the next state is one a catch holds it in: then it's let go of
//   a joint the next state sets to the same value stays held, if the hand had it
//   a joint the next state doesn't set is let go of, if the hand had it
//   everything else moves only as the springs and the contacts make it
// Letting go is gradual: the hand's spring softens to nothing over the step, so the mechanism finds where it rests.
import { beamSystem, equilibrium, shapeOf, energyOf } from './beams.mjs';
import { beamProfile, waveSpringPath } from './flexures.mjs';
import { curveLines } from './curves.mjs';

const HAND = 1000; // N/mm: a hand's grip on a part it holds or drives (stiff beside any spring here)
const SPANS = 24; // spans a shaped beam's profile is sampled in
const LEAP = 1; // mm: a free body jumping further than this in one step has been let go of (a latch released)

// ---------- centrelines ----------
// A flexure's centreline in its own frame (root at the origin, along x), with the thickness of each span; null when
// there isn't one beam theory can follow (a notch, a cartwheel, a shape of your own)
export function centrelines(kind, p) {
  const shaped = !!(p.taper || p.fillet), L = p.length, t = p.thickness;
  const line = (ends, y = 0) => {
    if (!shaped) return { path: [[0, y], [L, y]], thickness: [t] };
    const half = beamProfile(p, ends), xs = Array.from({ length: SPANS + 1 }, (_, i) => (L * i) / SPANS);
    return { path: xs.map((x) => [x, y]), thickness: xs.slice(1).map((x, i) => 2 * half((x + xs[i]) / 2)) };
  };
  switch (kind) {
    case 'leaf': case 'contactLeaf': case 'snapHook': return [line('leaf')];
    case 'fixedGuided': return [line('guided')];
    case 'parallelGuide': { const y = (p.gap + t) / 2; return [line('guided', y), line('guided', -y)]; }
    case 'pivotPair': return p.angles.map((a) => { // each leaf from its root, out along its line, in towards the point
      const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), one = line('guided');
      return { path: one.path.map(([x]) => { const d = p.near + L - x; return [c * d, s * d]; }), thickness: one.thickness };
    });
    case 'waveSpring': return [waveSpringPath(p)];
    case 'curve': return curveLines(p);
    case 'serpentine': {
      const step = p.pitch ?? 3 * t, joint = Math.max(1.5 * t, 1), path = [[0, 0]], th = [];
      for (let i = 0; i < p.turns; i++) {
        const end = i % 2 ? joint / 2 : L - joint / 2, last = i === p.turns - 1;
        path.push([last ? (i % 2 ? 0 : L) : end, i * step]); th.push(t);
        if (!last) { path.push([end, (i + 1) * step]); th.push(joint); }
      }
      return [{ path, thickness: th }];
    }
    default: return null;
  }
}

// ---------- contact ----------
// The nearest point of a shape's outline to p, and whether p is inside (even-odd)
function nearest(loops, p) {
  let inside = false, best = Infinity, foot = null;
  for (const l of loops) for (let k = 0; k < l.length; k++) {
    const a = l[k], b = l[(k + 1) % l.length];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
    const ex = b[0] - a[0], ey = b[1] - a[1], len2 = ex * ex + ey * ey, u = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2)) : 0;
    const fx = a[0] + u * ex, fy = a[1] + u * ey, d = Math.hypot(p[0] - fx, p[1] - fy);
    if (d < best) { best = d; foot = [fx, fy]; }
  }
  return { inside, dist: best, foot };
}
// A shape's signed distance on a grid (negative inside), worked out once: a contact query is then one interpolation,
// and the walls it sees are smooth, which Newton's method likes
function sdfOf(loops, h, margin) {
  const { lo, hi } = boxOf(loops), x0 = lo[0] - margin, y0 = lo[1] - margin, nx = Math.ceil((hi[0] - lo[0] + 2 * margin) / h) + 1, ny = Math.ceil((hi[1] - lo[1] + 2 * margin) / h) + 1;
  const d = new Float32Array(nx * ny), edges = loops.flatMap((l) => l.map((a, k) => [a, l[(k + 1) % l.length]]));
  // Edges in buckets a margin square: a cell only measures to the edges within its margin (further, it reads as the
  // margin: nothing reaches that far)
  const B = margin, bucket = new Map(), key = (i, j) => `${i},${j}`;
  for (const e of edges) {
    const [a, b] = e;
    for (let i = Math.floor(Math.min(a[0], b[0]) / B); i <= Math.floor(Math.max(a[0], b[0]) / B); i++) for (let j = Math.floor(Math.min(a[1], b[1]) / B); j <= Math.floor(Math.max(a[1], b[1]) / B); j++) { const k = key(i, j); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(e); }
  }
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * h, xs = [];
    for (const [a, b] of edges) if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    xs.sort((p, q) => p - q);
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * h, bi = Math.floor(x / B), bj = Math.floor(y / B), list = [];
      for (let a = bi - 1; a <= bi + 1; a++) for (let b = bj - 1; b <= bj + 1; b++) { const l = bucket.get(key(a, b)); if (l) list.push(...l); }
      let best = margin * margin;
      for (const [a, b] of list) {
        const ex = b[0] - a[0], ey = b[1] - a[1], len2 = ex * ex + ey * ey, u = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / len2)) : 0;
        const dx = x - a[0] - u * ex, dy = y - a[1] - u * ey, dd = dx * dx + dy * dy;
        if (dd < best) best = dd;
      }
      let inside = false;
      for (const c of xs) { if (c > x) break; inside = !inside; }
      d[j * nx + i] = inside ? -Math.sqrt(best) : Math.sqrt(best);
    }
  }
  return { x0, y0, nx, ny, h, d };
}
// The signed distance and its gradient at a point (bilinear); null outside the grid (far from the shape)
function sdfAt(g, x, y) {
  const fx = (x - g.x0) / g.h, fy = (y - g.y0) / g.h, i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= g.nx - 1 || j >= g.ny - 1) return null;
  const u = fx - i, v = fy - j, k = j * g.nx + i, a = g.d[k], b = g.d[k + 1], c = g.d[k + g.nx], e = g.d[k + g.nx + 1];
  return { s: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + e * u * v, gx: ((b - a) * (1 - v) + (e - c) * v) / g.h, gy: ((c - a) * (1 - u) + (e - b) * u) / g.h };
}
const boxOf = (loops) => { const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; for (const l of loops) for (const [x, y] of l) { lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); } return { lo, hi }; };
// Points along a shape's outline, `ds` apart
const sample = (loops, ds) => loops.flatMap((l) => l.flatMap((a, k) => { const b = l[(k + 1) % l.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / ds)); return Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]); }));

/**
 * The mechanism, solved through its sequence.
 * @param {object} m lamina's own: { parts, joints, material, height, gap, states, sequence, holds, kinematic (values →
 *   each body's transform, as [a, b, c, d, e, f]) }
 * @param {{ steps?: number, force?: number, contact?: number }} [o] steps along each transition (default 24); the most a
 *   hand pulls or pushes (N, default 50: more and it jams); contact stiffness (N/mm a point)
 */
export function simulate(m, { steps = 24, force = 50, contact } = {}) {
  const { parts, joints, material, height } = m, missing = Object.entries(joints).filter(([, j]) => !j.kind || !centrelines(j.kind, j.params)).map(([n]) => n);
  if (missing.length) return { skipped: missing };
  // Bodies: the ground and each rigid body, about its box's centre
  const bodies = {}, outline = {}, centre = {};
  const loose = m.loose || {}; // parts that aren't joined to anything (a disc): they move only when pushed, and fire
  for (const [n, p] of [...Object.entries(parts).filter(([, p]) => p.kind !== 'flexure'), ...Object.entries(loose)]) {
    const { lo, hi } = boxOf(p.shape);
    centre[n] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    bodies[n] = { at: centre[n], fixed: p.kind === 'ground', loose: !!loose[n] };
    outline[n] = p.shape;
  }
  // Beams: each joint's centrelines, placed
  const place = (j, [x, y]) => [j.place[0] * x + j.place[1] * y + j.place[2], j.place[3] * x + j.place[4] * y + j.place[5]];
  const beams = [], beamOf = {};
  for (const [n, j] of Object.entries(joints)) centrelines(j.kind, j.params).forEach((c, i) => {
    const name = `${n}#${i}`;
    beamOf[name] = n;
    beams.push({ name, path: c.path.map((p) => place(j, p)), thickness: c.thickness, width: height, E: material.E, from: j.from, to: j.to });
  });
  const sys = beamSystem({ bodies, beams, segments: 20 });

  // Contact: each moving body's outline points against every other body, and each beam's nodes against every body but
  // its own two; a penalty spring on how far each goes in
  const gap = m.gap, k = contact ?? 50 * material.E * height * 1e-3, ds = Math.max(0.2, gap);
  const names = Object.keys(bodies), pts = Object.fromEntries(names.map((n) => [n, sample(outline[n], ds)])), boxes = Object.fromEntries(names.map((n) => [n, boxOf(outline[n])]));
  // A fixed body's outline points, in buckets 5 mm square, so only those near a moving body are tested
  const BUCKET = 5, buckets = Object.fromEntries(names.filter((n) => bodies[n].fixed).map((n) => { const map = new Map(); for (const p of pts[n]) { const k = `${Math.floor(p[0] / BUCKET)},${Math.floor(p[1] / BUCKET)}`; if (!map.has(k)) map.set(k, []); map.get(k).push(p); } return [n, map]; }));
  const near = (A, lo, hi) => { if (!buckets[A]) return pts[A]; const out = []; for (let i = Math.floor(lo[0] / BUCKET); i <= Math.floor(hi[0] / BUCKET); i++) for (let j = Math.floor(lo[1] / BUCKET); j <= Math.floor(hi[1] / BUCKET); j++) { const b = buckets[A].get(`${i},${j}`); if (b) out.push(...b); } return out; };
  const t0 = Date.now(), reach = 2 + Math.max(...beams.map((b) => Math.max(...b.thickness))), sdfs = Object.fromEntries(names.map((n) => [n, sdfOf(outline[n], Math.min(0.12, gap / 2.5), reach)]));
  if (process.env.PHYS_DEBUG) console.error('sdfs', Date.now() - t0, 'ms', Object.fromEntries(names.map((n) => [n, sdfs[n].nx * sdfs[n].ny])), 'dofs', sys.dofs);
  const poseOf = (n, q) => (bodies[n].fixed ? [0, 0, 0] : [q[sys.body[n].dof], q[sys.body[n].dof + 1], q[sys.body[n].dof + 2]]);
  const toWorld = (n, q, p) => { const [tx, ty, f] = poseOf(n, q), c = centre[n], cs = Math.cos(f), sn = Math.sin(f), rx = p[0] - c[0], ry = p[1] - c[1]; return [c[0] + tx + cs * rx - sn * ry, c[1] + ty + sn * rx + cs * ry, cs * rx - sn * ry, sn * rx + cs * ry]; };
  const toLocal = (n, q, w) => { const [tx, ty, f] = poseOf(n, q), c = centre[n], cs = Math.cos(f), sn = Math.sin(f), dx = w[0] - c[0] - tx, dy = w[1] - c[1] - ty; return [c[0] + cs * dx + sn * dy, c[1] - sn * dx + cs * dy, dx, dy, cs, sn]; };
  const nodeBeam = sys.nodes.map((nd) => ({ nd, joint: beamOf[nd.beam], r: (beams.find((b) => b.name === nd.beam).thickness[0] ?? 1) / 2 }));
  // Self-contact: each flexure's free nodes against its own elements further along it than a few thicknesses (a wave
  // spring's legs meeting as it stacks solid, a serpentine's folds)
  const selfs = Object.keys(joints).map((jn) => {
    const els = sys.elements.filter((e) => beamOf[e.beam] === jn && e.a.dof != null && e.b.dof != null);
    let run = 0;
    const arc = new Map();
    for (const e of sys.elements.filter((e) => beamOf[e.beam] === jn)) { if (e.a.dof != null && !arc.has(e.a)) arc.set(e.a, run); run += e.L0; if (e.b.dof != null) arc.set(e.b, run); }
    const tmax = Math.max(0, ...els.map((e) => e.t));
    return { els: els.map((e) => ({ e, s: (arc.get(e.a) + arc.get(e.b)) / 2 })), nodes: [...arc.keys()].map((nd) => ({ nd, s: arc.get(nd), t: els.find((e) => e.a === nd || e.b === nd)?.t ?? tmax })), skip: 3 * tmax + 1 };
  });
  let withLoose = false; // loose parts (a disc) only touch anything when firing
  const extra = (q, g, H) => {
    let U = 0;
    const n = sys.dofs;
    // One point (with its dofs and how it moves with them) against body B
    const touch = (w, dw, r, B) => {
      const L = toLocal(B, q, w), bb = boxes[B];
      if (L[0] < bb.lo[0] - r || L[0] > bb.hi[0] + r || L[1] < bb.lo[1] - r || L[1] > bb.hi[1] + r) return;
      const at = sdfAt(sdfs[B], L[0], L[1]);
      if (!at) return;
      const pen = r - at.s;
      if (pen <= 0) return;
      const gl = Math.hypot(at.gx, at.gy) || 1, dlx = -at.gx / gl, dly = -at.gy / gl; // ∂pen/∂local: down the distance's slope, into the shape
      const cs = L[4], sn = L[5], dwx = cs * dlx - sn * dly, dwy = sn * dlx + cs * dly; // ∂pen/∂w = R(φ_B) ∂pen/∂local
      const J = new Map(), add = (d, v) => J.set(d, (J.get(d) || 0) + v);
      for (const [d, ax, ay] of dw) add(d, dwx * ax + dwy * ay);
      if (!bodies[B].fixed) { const b = sys.body[B].dof; add(b, -dwx); add(b + 1, -dwy); add(b + 2, dlx * (-sn * L[2] + cs * L[3]) + dly * (-cs * L[2] - sn * L[3])); }
      U += 0.5 * k * pen * pen;
      for (const [d, v] of J) g[d] += k * pen * v;
      if (H) for (const [a, va] of J) for (const [b, vb] of J) H[a * n + b] += k * va * vb;
    };
    for (const A of names) {
      if (bodies[A].fixed && names.every((B) => B === A || bodies[B].fixed)) continue;
      if (bodies[A].loose && !withLoose) continue;
      for (const B of names) {
        if (A === B || (bodies[A].fixed && bodies[B].fixed) || (bodies[B].loose && !withLoose)) continue;
        // A's points near B (B's box, as it is now, grown a little)
        const [tx, ty] = poseOf(B, q), bb = boxes[B], m0 = 2 + Math.hypot(bb.hi[0] - bb.lo[0], bb.hi[1] - bb.lo[1]) * Math.abs(poseOf(B, q)[2]);
        for (const p of near(A, [bb.lo[0] + tx - m0, bb.lo[1] + ty - m0], [bb.hi[0] + tx + m0, bb.hi[1] + ty + m0])) {
          const w = toWorld(A, q, p);
          if (w[0] < bb.lo[0] + tx - m0 || w[0] > bb.hi[0] + tx + m0 || w[1] < bb.lo[1] + ty - m0 || w[1] > bb.hi[1] + ty + m0) continue;
          const dw = bodies[A].fixed ? [] : (() => { const a = sys.body[A].dof; return [[a, 1, 0], [a + 1, 0, 1], [a + 2, -w[3], w[2]]]; })();
          touch(w, dw, 0, B);
        }
      }
    }
    for (const { els, nodes, skip } of selfs) for (const { nd, s: si, t: ti } of nodes) {
      const px = nd.at[0] + q[nd.dof], py = nd.at[1] + q[nd.dof + 1];
      for (const { e, s: se } of els) {
        if (Math.abs(se - si) < skip + e.L0 / 2) continue;
        const ax = e.a.at[0] + q[e.a.dof], ay = e.a.at[1] + q[e.a.dof + 1], bx = e.b.at[0] + q[e.b.dof], by = e.b.at[1] + q[e.b.dof + 1];
        const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey, u = l2 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2)) : 0;
        const fx = ax + u * ex, fy = ay + u * ey, d = Math.hypot(px - fx, py - fy), pen = (ti + e.t) / 2 - d;
        if (pen <= 0 || d < 1e-9) continue;
        const nx = (px - fx) / d, ny = (py - fy) / d, J = [[nd.dof, -nx], [nd.dof + 1, -ny], [e.a.dof, nx * (1 - u)], [e.a.dof + 1, ny * (1 - u)], [e.b.dof, nx * u], [e.b.dof + 1, ny * u]];
        U += 0.5 * k * pen * pen;
        for (const [di, v] of J) g[di] += k * pen * v;
        if (H) for (const [a, va] of J) for (const [b, vb] of J) H[a * n + b] += k * va * vb;
      }
    }
    for (const { nd, joint, r } of nodeBeam) {
      const w = [nd.at[0] + q[nd.dof], nd.at[1] + q[nd.dof + 1]], j = joints[joint];
      for (const B of names) if (B !== j.from && B !== j.to && (withLoose || !bodies[B].loose)) touch(w, [[nd.dof, 1, 0], [nd.dof + 1, 0, 1]], r, B);
    }
    return U;
  };

  // The hand: a spring on a body's centre, along a direction, to a target; its stiffness can fade (letting go)
  const handTerm = (grips) => (q, g, H) => {
    let U = 0;
    for (const { body, u, target, stiff } of grips) {
      if (!stiff) continue;
      const d = sys.body[body].dof, off = q[d] * u[0] + q[d + 1] * u[1] - target, n = sys.dofs;
      U += 0.5 * stiff * off * off;
      g[d] += stiff * off * u[0]; g[d + 1] += stiff * off * u[1];
      if (H) { H[d * n + d] += stiff * u[0] * u[0]; H[d * n + d + 1] += stiff * u[0] * u[1]; H[(d + 1) * n + d] += stiff * u[0] * u[1]; H[(d + 1) * n + d + 1] += stiff * u[1] * u[1]; }
    }
    return U;
  };
  const both = (a, b) => (q, g, H) => a(q, g, H) + b(q, g, H);
  // Where the kinematic model puts a joint's body's centre for a set of joint values
  const centreAt = (jn, values) => { const b = joints[jn].to, T = m.kinematic(values)[b], c = centre[b]; return [T[0] * c[0] + T[1] * c[1] + T[2] - c[0], T[3] * c[0] + T[4] * c[1] + T[5] - c[1]]; };

  const seq = m.sequence, out = { transitions: [], frames: [], findings: [], strain: {} };
  if (!seq.length) return out;
  const still = new Map(Object.keys(loose).flatMap((n) => [0, 1, 2].map((k) => [sys.body[n].dof + k, 0]))); // loose parts stay put while a hand works it
  let q = equilibrium(sys, { extra, held: still }).q, hand = new Set();
  const stateOf = (s) => m.states[s] || {};
  const mark = (sh, label) => { for (const [b, s] of Object.entries(sh.strain)) out.strain[beamOf[b]] = Math.max(out.strain[beamOf[b]] || 0, s); };
  for (let i = 0; i + 1 < seq.length; i++) {
    const A = stateOf(seq[i]), B = stateOf(seq[i + 1]), caught = new Set((m.holds?.[seq[i + 1]] || []).map(([jn]) => jn));
    const plan = {};
    for (const jn of Object.keys(joints)) {
      if (jn in B && B[jn] !== (A[jn] ?? 0)) plan[jn] = caught.has(jn) ? (hand.has(jn) ? 'let go' : 'free') : 'drive';
      else if (jn in B) plan[jn] = hand.has(jn) ? 'hold' : 'free';
      else plan[jn] = hand.has(jn) ? 'let go' : 'free';
    }
    // The grips: a driven joint along the way its body's centre goes; a held or let-go one where it is
    const start = Float64Array.from(q), dofOf = (jn) => sys.body[joints[jn].to].dof, grips = [];
    for (const [jn, what] of Object.entries(plan)) {
      if (what === 'free') continue;
      const d = dofOf(jn), here = [start[d], start[d + 1]];
      if (what === 'drive') {
        const end = centreAt(jn, { ...A, ...B }), from = centreAt(jn, A), dir = [end[0] - from[0], end[1] - from[1]], len = Math.hypot(...dir);
        const u = len > 1e-9 ? [dir[0] / len, dir[1] / len] : [1, 0];
        grips.push({ jn, what, body: joints[jn].to, u, from: here[0] * u[0] + here[1] * u[1], to: here[0] * u[0] + here[1] * u[1] + len });
      } else for (const u of [[1, 0], [0, 1]]) { // the hand holds it where it is, both ways
        const at = here[0] * u[0] + here[1] * u[1];
        grips.push({ jn, what, body: joints[jn].to, u, from: at, to: at });
      }
    }
    const curve = grips.filter((gr) => gr.what === 'drive').map((gr) => ({ joint: gr.jn, points: [] })), events = [];
    let last = q;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, now = grips.map((gr) => ({ ...gr, target: gr.from + (gr.to - gr.from) * t, stiff: gr.what === 'let go' ? HAND * (1 - t) ** 3 : HAND }));
      const t0 = Date.now(), r = equilibrium(sys, { start: last, extra: both(extra, handTerm(now)), iterations: 80, held: still });
      if (process.env.PHYS_DEBUG) console.error('step', seq[i], '>', seq[i + 1], s, 'iterations', r.iterations, 'converged', r.converged, Date.now() - t0, 'ms');
      // The hand's force on each driven joint, along its way
      for (const c of curve) {
        const gr = now.find((x) => x.jn === c.joint), d = dofOf(c.joint), at = r.q[d] * gr.u[0] + r.q[d + 1] * gr.u[1];
        c.points.push([+(at - gr.from).toFixed(4), +(gr.stiff * (gr.target - at)).toFixed(4)]);
      }
      // A free body leaping: a release
      if (s) for (const b of Object.keys(sys.body)) {
        if (bodies[b].fixed || grips.some((gr) => gr.body === b && gr.what !== 'let go')) continue;
        const d = sys.body[b].dof, jump = Math.hypot(r.q[d] - last[d], r.q[d + 1] - last[d + 1]);
        if (jump > LEAP) events.push({ body: b, t, jump, hand: curve.map((c) => ({ joint: c.joint, travel: c.points.at(-1)[0], force: c.points.at(-1)[1] })) });
      }
      mark(r);
      out.frames.push({ from: seq[i], to: seq[i + 1], t, q: Array.from(r.q), shape: shapeOf(sys, r.q) });
      last = r.q;
    }
    q = last;
    for (const gr of grips) if (gr.what === 'drive' || gr.what === 'hold') hand.add(gr.jn); else hand.delete(gr.jn);
    out.transitions.push({ from: seq[i], to: seq[i + 1], plan, curve, events, end: Array.from(q), hand: [...hand] }); // hand: what it holds at the end of the step
  }
  out.sys = sys; out.centre = centre; out.beamOf = beamOf;
  // Firing: from where a state left it, let go of everything at once and step through time
  withLoose = true;
  if (m.fire) {
    // The finger stays: each joint in hold is kept where the state, with hold's values, puts its body's centre
    const from = stateOf(m.fire.from), grips = Object.entries(m.fire.hold || {}).flatMap(([jn, val]) => {
      const c = centreAt(jn, { ...from, [jn]: val });
      return [[1, 0], [0, 1]].map((u, k) => ({ body: joints[jn].to, u, target: c[k], stiff: HAND }));
    });
    // First, still held where the state left it (each body the hand had, kept where it is), the finger pulls; then
    // the hand lets go and the finger stays
    const into = out.transitions.find((tr) => tr.to === m.fire.from);
    let start = into?.end;
    if (start && grips.length) {
      const q0 = Float64Array.from(start), keep = into.hand.filter((jn) => !(jn in (m.fire.hold || {}))).flatMap((jn) => { const d = sys.body[joints[jn].to].dof; return [[1, 0], [0, 1]].map((u, k) => ({ body: joints[jn].to, u, target: q0[d + k], stiff: HAND })); });
      for (let k = 1; k <= 8; k++) { // the finger pulls in steps, so contact follows it
        const part = grips.map((g) => { const d = sys.body[g.body].dof; return { ...g, target: q0[d + (g.u[0] ? 0 : 1)] + (g.target - q0[d + (g.u[0] ? 0 : 1)]) * (k / 8) }; });
        start = equilibrium(sys, { start, extra: both(extra, handTerm([...keep, ...part])), iterations: 80, held: still }).q;
      }
    }
    out.fire = fire({ sys, extra: grips.length ? both(extra, handTerm(grips)) : extra, centre, outline, bodies, loose, material, height, beams, start, ...m.fire });
  }
  return out;
}

/**
 * A flexure's outline, bent: each point of its outline at rest goes with the nearest point of its centreline (its
 * offset kept, turned with the beam there), or with the body it's on, past the beam's ends.
 * @param {number[][][]} shape the flexure's outline at rest @param {{ rest: number[][], now: number[][], turn: number[], from: number[] | null, to: number[] | null }[]} lines
 *   each beam of it: its centreline at rest and now, each node's turn, and its end bodies' transforms
 */
export function bend(shape, lines) {
  return shape.map((loop) => loop.map((p) => {
    let best = null;
    for (const ln of lines) {
      for (let i = 0; i + 1 < ln.rest.length; i++) {
        const a = ln.rest[i], b = ln.rest[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey, l = Math.sqrt(l2);
        const u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2, uc = Math.max(0, Math.min(1, u)), fx = a[0] + uc * ex, fy = a[1] + uc * ey, d = Math.hypot(p[0] - fx, p[1] - fy);
        if (!best || d < best.d) best = { d, ln, i, u: uc, raw: u, normal: [p[0] - fx, p[1] - fy], first: i === 0, last: i + 2 === ln.rest.length };
      }
    }
    const { ln, i, u, raw, normal } = best;
    // Past an end, onto that end's body: move with it
    if ((best.first && raw < 0 && ln.from) || (best.last && raw > 1 && ln.to)) { const T = raw < 0 ? ln.from : ln.to; return [T[0] * p[0] + T[1] * p[1] + T[2], T[3] * p[0] + T[4] * p[1] + T[5]]; }
    // On the beam: the point of the centreline now, along the cubic through its two nodes with their turns (so it bends
    // smoothly between them), and the offset turned as the beam has turned there
    const a = ln.now[i], b = ln.now[i + 1], r0 = ln.rest[i], r1 = ln.rest[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = Math.atan2(r1[1] - r0[1], r1[0] - r0[0]);
    const ta = [Math.cos(dir + ln.turn[i]), Math.sin(dir + ln.turn[i])], tb = [Math.cos(dir + ln.turn[i + 1]), Math.sin(dir + ln.turn[i + 1])];
    const h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
    const at = [h00 * a[0] + h10 * l * ta[0] + h01 * b[0] + h11 * l * tb[0], h00 * a[1] + h10 * l * ta[1] + h01 * b[1] + h11 * l * tb[1]];
    const th = ln.turn[i] + (ln.turn[i + 1] - ln.turn[i]) * u, c = Math.cos(th), s = Math.sin(th), off = normal;
    return [at[0] + c * off[0] - s * off[1], at[1] + s * off[0] + c * off[1]];
  }));
}

// ---------- firing ----------
// Polygon area and its second moment about the centroid, for a body's mass and turning inertia
function massOf(loops, h, rho) {
  let A = 0, cx = 0, cy = 0, Ixx = 0, Iyy = 0;
  for (const l of loops) for (let k = 0; k < l.length; k++) {
    const [x0, y0] = l[k], [x1, y1] = l[(k + 1) % l.length], c = x0 * y1 - x1 * y0;
    A += c / 2; cx += ((x0 + x1) * c) / 6; cy += ((y0 + y1) * c) / 6; Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12; Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12;
  }
  cx /= A; cy /= A;
  const J = Ixx + Iyy - A * (cx * cx + cy * cy); // polar, about the centroid
  return { mass: rho * h * Math.abs(A), inertia: rho * h * Math.abs(J) };
}
/**
 * Let go and step through time (explicit, a semi-implicit Euler step a few microseconds long): every body and beam
 * node with its mass (the material's density; a loose part's own mass), the springs' and contacts' forces, a little
 * damping. Units: mm, N, kg, s (so an acceleration is 1000 F / m in mm/s²).
 * @returns {{ frames: { t: number, q: number[] }[], speeds: Record<string, number>, exit: { body: string, speed: number, energy: number } | null, stored: number }}
 */
function fire({ sys, extra, outline, bodies, loose, material, height, beams, start, duration = 0.02, dt = Number(process.env.FIRE_DT || 3e-6), damping = 10, disc, every = 100 }) {
  if (!start) return null;
  const rho = (material.density ?? 1.25) * 1e-6, n = sys.dofs, mass = new Float64Array(n);
  for (const [name, b] of Object.entries(sys.body)) {
    if (b.fixed) continue;
    const mi = loose[name]?.mass != null ? { mass: loose[name].mass / 1000, inertia: (loose[name].mass / 1000) * 10 } : massOf(outline[name], height, rho);
    mass[b.dof] += mi.mass; mass[b.dof + 1] += mi.mass; mass[b.dof + 2] += Math.max(mi.inertia, mi.mass * 1e-2);
  }
  for (const e of sys.elements) { // half an element's mass to each end, and a share of its turning inertia
    const me = rho * e.w * e.t * e.L0, Ie = (me * e.L0 * e.L0) / 12;
    for (const end of [e.a, e.b]) {
      if (end.dof != null) { mass[end.dof] += me / 2; mass[end.dof + 1] += me / 2; mass[end.dof + 2] += Ie / 2; }
      else if (!end.body.fixed) { mass[end.body.dof] += me / 2; mass[end.body.dof + 1] += me / 2; mass[end.body.dof + 2] += Ie / 2 + (me / 2) * (end.o[0] ** 2 + end.o[1] ** 2); }
    }
  }
  // Mass scaling, by Gershgorin: no mode is faster than a row of the stiffness (contacts included) over its mass allows,
  // so each unknown gets at least the mass that keeps ω dt under 1.6 with dt, twice over for contacts that start
  // mid-shot. It lands on the lightest flexure nodes; the bodies that matter are far heavier already
  let added = 0;
  const real = Object.values(sys.body).filter((b) => !b.fixed).reduce((a, b) => a + mass[b.dof], 0) + sys.nodes.reduce((a, nd) => a + mass[nd.dof], 0);
  const H = energyOf(sys, Float64Array.from(start), { hessian: true, extra }).hessian, need = 2 * 1000 * (dt / 1.6) ** 2;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let k = 0; k < n; k++) row += Math.abs(H[i * n + k]);
    const m0 = row * need;
    if (mass[i] < m0) { if (i % 3 !== 2) added += (m0 - mass[i]) / 2; mass[i] = m0; }
  }
  const q = Float64Array.from(start), v = new Float64Array(n), frames = [{ t: 0, q: Array.from(q) }], speeds = {};
  const stored = energyOf(sys, q, { hessian: false }).energy / 1000; // J
  let exit = null, touched = false;
  const steps = Math.round(duration / dt);
  const tStart = Date.now();
  if (process.env.PHYS_DEBUG) console.error('fire: steps', steps, 'dt', dt, 'stored', stored, 'mass total', mass.reduce((a, x) => a + x, 0));
  for (let k = 1; k <= steps; k++) {
    if (process.env.PHYS_DEBUG && k % 10 === 0) {
      let at = 0; for (let i = 0; i < n; i++) if (Math.abs(v[i]) > Math.abs(v[at])) at = i; // (the fastest unknown, for debugging)
      const who = Object.values(sys.body).find((b) => b.dof >= 0 && at >= b.dof && at < b.dof + 3)?.name || `node of ${sys.nodes.find((nd) => at >= nd.dof && at < nd.dof + 3)?.beam}`;
      console.error('fire step', k, Date.now() - tStart, 'ms', 'max v', Math.abs(v[at]).toExponential(2), 'at', who, 'dof', at % 3, 'mass', mass[at].toExponential(2));
    }
    const r = energyOf(sys, q, { hessian: false, extra });
    for (let i = 0; i < n; i++) { if (!mass[i]) continue; v[i] += (dt * 1000 * -r.grad[i]) / mass[i] - dt * damping * v[i]; }
    for (let i = 0; i < n; i++) q[i] += dt * v[i];
    for (const [name, b] of Object.entries(sys.body)) if (!b.fixed) speeds[name] = Math.max(speeds[name] || 0, Math.hypot(v[b.dof], v[b.dof + 1]) / 1000); // m/s
    if (disc) { // the disc leaves once it's moving and nothing touches it: its speed then is the exit speed
      const d = sys.body[disc].dof, sp = Math.hypot(v[d], v[d + 1]) / 1000;
      if (sp > 0.05) touched = true;
      if (touched && !exit && k % 50 === 0) {
        const g = new Float64Array(n); extra(q, g, null);
        if (Math.hypot(g[d], g[d + 1]) < 1e-6) exit = { body: disc, speed: sp, energy: 0.5 * mass[d] * sp * sp, t: k * dt };
      }
    }
    if (k % every === 0) frames.push({ t: k * dt, q: Array.from(q) });
    if (exit && k * dt > exit.t + 0.002) break;
  }
  return { frames, speeds, exit, stored, scaled: real > 0 ? added / real : 0 };
}
