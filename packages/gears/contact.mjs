// The mesh measured, not reckoned: the drawn teeth turned through a pitch, and at each step the driven gear turned
// each way until its outline meets the driver's. The turn between the two meetings is the backlash as drawn (with the
// real fillets, rounds and centre distance); how far the forward meeting is from where the ratio puts it is the
// transmission error; outlines that cross where the ratio puts them interfere. Plain 2D geometry: the outlines'
// edges near the pitch point, tested for crossing.
import { spurProfile, internalProfile, rackProfile, gearModel, internalModel, rackModel, mesh, phase, rackPhase } from './gears.mjs';

const DEG = Math.PI / 180;
const fmt = (x, d = 3) => String(+x.toFixed(d));

// Do two sets of edges cross anywhere? Edge against edge, with a box test first
function cross(A, B) {
  for (const [p, q] of A) {
    const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
    for (const [r, s] of B) {
      if (Math.max(r[0], s[0]) < x0 || Math.min(r[0], s[0]) > x1 || Math.max(r[1], s[1]) < y0 || Math.min(r[1], s[1]) > y1) continue;
      const d1 = (s[0] - r[0]) * (p[1] - r[1]) - (s[1] - r[1]) * (p[0] - r[0]), d2 = (s[0] - r[0]) * (q[1] - r[1]) - (s[1] - r[1]) * (q[0] - r[0]);
      const d3 = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]), d4 = (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}
const turn = (pts, a, [cx, cy] = [0, 0], [dx, dy] = [0, 0]) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [x * c - y * s + cx + dx, x * s + y * c + cy + dy]); };
// Only the loop's edges near a point (the far teeth never meet)
const near = (pts, [px, py], r) => { const by = ([x, y]) => (x - px) ** 2 + (y - py) ** 2 < r * r, out = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if (by(p) || by(q)) out.push([p, q]); } return out; };

/**
 * The mesh of a pair as drawn: backlash, transmission error and interference across one pitch of the driver.
 * a: the driver's parameters (as gearModel takes them); b: the driven's (kind 'internal' for a ring, 'rack' for a rack).
 * @param {object} a @param {object & { kind?: 'external' | 'internal' | 'rack' }} b
 * @param {{ centre?: number, steps?: number }} [o] centre: the axes' distance (default: what they need)
 */
export function contact(a, b, { centre, steps = 24 } = {}) {
  const kind = b.kind ?? 'external';
  const ga = gearModel(a), gb = kind === 'internal' ? internalModel(b) : kind === 'rack' ? rackModel(b) : gearModel(b);
  const m = mesh(ga, gb, centre === undefined ? {} : { centre }), c = centre ?? m.centre, mod = ga.module;
  const A = spurProfile(a).loops[0];
  const B = kind === 'internal' ? internalProfile(b).loops[1] : kind === 'rack' ? rackProfile(b).loops[0] : spurProfile(b).loops[0];
  // where the driven sits, and how it moves: an angle (degrees) about its centre, or along the rack (mm)
  const per = kind === 'rack' ? (Math.PI * ga.pitch) / 360 : m.ratio, r2 = kind === 'rack' ? null : gb.pitch / 2;
  const base = kind === 'rack' ? rackPhase(ga, 0) : phase(ga, gb, kind === 'internal' ? 180 : 0);
  const O2 = kind === 'internal' ? [-c, 0] : kind === 'rack' ? null : [c, 0];
  const P = kind === 'internal' ? [ga.pitch / 2, 0] : kind === 'rack' ? [0, c - ga.pitch / 2] : [ga.pitch / 2, 0], reach = 3.5 * mod;
  const drivenAt = (deg, nudge) => kind === 'rack'
    ? B.map(([x, y]) => [x + per * deg + base + nudge - Math.PI * mod * Math.round(gb.teeth / 2), y]) // the rack under the pinion, its middle under the pitch point
    : turn(B, (m.ratio * deg + base + nudge) * DEG, O2);
  const driverAt = (deg) => turn(A, deg * DEG, kind === 'rack' ? [0, c] : [0, 0]);
  // the turn (degrees, or mm for a rack) each way from the ratio's place to where the outlines first meet
  const span = kind === 'rack' ? Math.PI * mod / 2 : 180 / gb.teeth;
  const meet = (deg, dir) => {
    const D = near(driverAt(deg), P, reach), crosses = (x) => cross(D, near(drivenAt(deg, dir * x), P, reach));
    if (!crosses(span)) return Infinity;
    let lo = 0, hi = span;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (crosses(mid)) hi = mid; else lo = mid; }
    return lo;
  };
  const rows = [];
  for (let i = 0; i < steps; i++) {
    const deg = (i * 360) / ga.teeth / steps, D = near(driverAt(deg), P, reach);
    const clash = cross(D, near(drivenAt(deg, 0), P, reach));
    if (clash) { rows.push({ angle: deg, interferes: true }); continue; }
    // the driven pushed on (it lags until its flank meets the driver's: the driver turning +, the driven its way)
    const ahead = meet(deg, Math.sign(per)), behind = meet(deg, -Math.sign(per));
    const toMm = (x) => (kind === 'rack' ? x : x * DEG * r2);
    rows.push({ angle: deg, backlash: toMm(ahead + behind), error: toMm(behind) });
  }
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const bad = rows.filter((x) => x.interferes);
  const ok = rows.filter((x) => !x.interferes), bl = ok.map((x) => x.backlash), te = ok.map((x) => x.error);
  const least = Math.min(...bl), most = Math.max(...bl), swing = te.length ? Math.max(...te) - Math.min(...te) : 0;
  if (bad.length) f('fail', `the teeth cross where the ratio puts them at ${bad.length} of ${steps} steps (from ${fmt(bad[0].angle, 2)}° of the driver): they interfere, and jam`, 'mesh.interference', { at: bad.map((x) => x.angle) });
  if (ok.length) {
    if (least < 0.02) f('warn', `as drawn, the play falls to ${fmt(least)} mm: printed teeth that come out a little fat will bind`, 'mesh.backlash', { least, most });
    else f('pass', `as drawn, ${fmt(least)}${fmt(most) !== fmt(least) ? ` to ${fmt(most)}` : ''} mm of play at the pitch circle (${fmt(m.backlash)} mm reckoned)`, 'mesh.backlash', { least, most });
    f('info', `transmission error ${fmt(swing * 1000, 0)} µm across a tooth, as drawn (outlines of ${A.length / ga.teeth} points a tooth)`, 'mesh.error', { swing });
  }
  return { rows, backlash: { least, most }, error: swing, reckoned: m.backlash, findings: out };
}
