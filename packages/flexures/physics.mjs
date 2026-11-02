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
import { beamSystem, equilibrium, shapeOf } from './beams.mjs';
import { beamProfile } from './flexures.mjs';

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
  for (const [n, p] of Object.entries(parts)) if (p.kind !== 'flexure') {
    const { lo, hi } = boxOf(p.shape);
    centre[n] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    bodies[n] = { at: centre[n], fixed: p.kind === 'ground' };
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
  const poseOf = (n, q) => (bodies[n].fixed ? [0, 0, 0] : [q[sys.body[n].dof], q[sys.body[n].dof + 1], q[sys.body[n].dof + 2]]);
  const toWorld = (n, q, p) => { const [tx, ty, f] = poseOf(n, q), c = centre[n], cs = Math.cos(f), sn = Math.sin(f), rx = p[0] - c[0], ry = p[1] - c[1]; return [c[0] + tx + cs * rx - sn * ry, c[1] + ty + sn * rx + cs * ry, cs * rx - sn * ry, sn * rx + cs * ry]; };
  const toLocal = (n, q, w) => { const [tx, ty, f] = poseOf(n, q), c = centre[n], cs = Math.cos(f), sn = Math.sin(f), dx = w[0] - c[0] - tx, dy = w[1] - c[1] - ty; return [c[0] + cs * dx + sn * dy, c[1] - sn * dx + cs * dy, dx, dy, cs, sn]; };
  const nodeBeam = sys.nodes.map((nd) => ({ nd, joint: beamOf[nd.beam], r: (beams.find((b) => b.name === nd.beam).thickness[0] ?? 1) / 2 }));
  const extra = (q, g, H) => {
    let U = 0;
    const n = sys.dofs;
    // One point (with its dofs and how it moves with them) against body B
    const touch = (w, dw, r, B) => {
      const L = toLocal(B, q, w), bb = boxes[B];
      if (L[0] < bb.lo[0] - r || L[0] > bb.hi[0] + r || L[1] < bb.lo[1] - r || L[1] > bb.hi[1] + r) return;
      const near = nearest(outline[B], [L[0], L[1]]), s = near.inside ? -near.dist : near.dist, pen = r - s;
      if (pen <= 0) return;
      // ∂pen/∂local: away from the foot when inside, towards it outside
      const nx = (near.foot[0] - L[0]) / (near.dist || 1), ny = (near.foot[1] - L[1]) / (near.dist || 1), sg = near.inside ? -1 : 1, dlx = sg * nx, dly = sg * ny;
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
      for (const B of names) {
        if (A === B || (bodies[A].fixed && bodies[B].fixed)) continue;
        // A's points near B (B's box, as it is now, grown a little)
        const [tx, ty] = poseOf(B, q), bb = boxes[B], m0 = 2 + Math.hypot(bb.hi[0] - bb.lo[0], bb.hi[1] - bb.lo[1]) * Math.abs(poseOf(B, q)[2]);
        for (const p of pts[A]) {
          const w = toWorld(A, q, p);
          if (w[0] < bb.lo[0] + tx - m0 || w[0] > bb.hi[0] + tx + m0 || w[1] < bb.lo[1] + ty - m0 || w[1] > bb.hi[1] + ty + m0) continue;
          const dw = bodies[A].fixed ? [] : (() => { const a = sys.body[A].dof; return [[a, 1, 0], [a + 1, 0, 1], [a + 2, -w[3], w[2]]]; })();
          touch(w, dw, 0, B);
        }
      }
    }
    for (const { nd, joint, r } of nodeBeam) {
      const w = [nd.at[0] + q[nd.dof], nd.at[1] + q[nd.dof + 1]], j = joints[joint];
      for (const B of names) if (B !== j.from && B !== j.to) touch(w, [[nd.dof, 1, 0], [nd.dof + 1, 0, 1]], r, B);
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
  let q = equilibrium(sys, { extra }).q, hand = new Set();
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
      const r = equilibrium(sys, { start: last, extra: both(extra, handTerm(now)), iterations: 80 });
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
    out.transitions.push({ from: seq[i], to: seq[i + 1], plan, curve, events, end: Array.from(q) });
  }
  out.sys = sys; out.centre = centre; out.beamOf = beamOf;
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
    // On the beam: the point of the centreline now, and the offset turned as the beam has turned there
    const a = ln.now[i], b = ln.now[i + 1], th = ln.turn[i] + (ln.turn[i + 1] - ln.turn[i]) * u, c = Math.cos(th), s = Math.sin(th), off = normal;
    return [a[0] + (b[0] - a[0]) * u + c * off[0] - s * off[1], a[1] + (b[1] - a[1]) * u + s * off[0] + c * off[1]];
  }));
}
