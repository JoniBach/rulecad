// Seats and running fits, read from the parts as drawn: a slice across the axis, rays out from it. Whether a child turns
// freely on its pin (joint.running), and whether a printed pocket is right for the bought bearing in it (fit.seat).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const n3 = (x, d = 3) => String(Number(x.toFixed(d)));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

// Coordinates about an axis: z along it from O, x and y across it
export function axisFrame(O, Z) {
  const z = unit(Z), seed = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], x = unit(cross(seed, z)), y = cross(z, x);
  return (p) => { const q = sub(p, O); return [dot(q, x), dot(q, y), dot(q, z)]; };
}
// A slice across the axis at z, as 2D segments
export function sliceAt(tris, z) {
  const segs = [];
  for (const t of tris) {
    const c = [];
    for (let i = 0; i < 3; i++) { const a = t[i], b = t[(i + 1) % 3]; if ((a[2] - z) * (b[2] - z) < 0) { const u = (z - a[2]) / (b[2] - a[2]); c.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); } }
    if (c.length === 2) segs.push(c);
  }
  return segs;
}
// How far out from the axis a ray crosses the slice's walls
export function rayHits(segs, ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang), out = [];
  for (const [p, q] of segs) {
    const ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (p[0] * ey - p[1] * ex) / den, u = (p[0] * dy - p[1] * dx) / den;
    if (t > 1e-6 && u >= 0 && u < 1) out.push(t);
  }
  return out.sort((a, b) => a - b);
}
const RAYS = 48, FACETS = 0.02; // mm: what a round drawn in facets is short of its true size
// At one slice: is the axis in solid (a pin) or in a space (a bore), and the first wall out, each way round
function round(segs) {
  if (segs.length < 3) return null;
  let solid = 0, bore = 0; const first = [];
  for (let k = 0; k < RAYS; k++) { const h = rayHits(segs, ((k + 0.37) * 2 * Math.PI) / RAYS); if (!h.length) return null; (h.length % 2 ? solid++ : bore++); first.push(h[0]); }
  return { pin: solid > bore, first };
}
const span = (tris, r) => { let lo = Infinity, hi = -Infinity; for (const t of tris) for (const p of t) if (Math.hypot(p[0], p[1]) < r) { lo = Math.min(lo, p[2]); hi = Math.max(hi, p[2]); } return [lo, hi]; };

// The running gap of a revolute: where one side is a pin and the other a bore round it, the least gap each side as drawn
// (over a few slices along the length they share) and how far along it runs. null: nothing there turns on a pin
export function runningGap(aTris, bTris) {
  const reach = 40, [la, ha] = span(aTris, reach), [lb, hb] = span(bTris, reach), lo = Math.max(la, lb), hi = Math.min(ha, hb);
  if (!(hi - lo > 0.2)) return null;
  let least = null, along = 0, step = (hi - lo) / 8;
  for (let k = 0; k < 8; k++) {
    const z = lo + step * (k + 0.5), A = round(sliceAt(aTris, z)), B = round(sliceAt(bTris, z));
    if (!A || !B || A.pin === B.pin) continue;
    const pin = A.pin ? A : B, bore = A.pin ? B : A;
    // A real pin is round about the axis: the widest and narrowest of it agree
    if (Math.max(...pin.first) - Math.min(...pin.first) > 0.5) continue;
    const gap = Math.min(...bore.first.map((r, i) => r - pin.first[i]));
    if (gap > 2) continue; // room, not a running fit
    along += step;
    if (least == null || gap < least.gap) least = { gap, z, pin: Math.max(...pin.first), bore: Math.min(...bore.first), pinOn: A.pin ? 'a' : 'b' };
  }
  return least && { ...least, length: along };
}

// What the project prints on, for the fits to hold a gap against: a rule set the assembly reads, or the kit's default
export function printerRules(s) {
  const pick = (name) => { try { return Object.fromEntries(Object.entries(require(`@rulecad/rules/${name}.json`).rules).map(([k, r]) => [k, r.value])); } catch { return null; } };
  return { ...pick('x1c'), ...(s.values?.x1c && typeof s.values.x1c === 'object' ? s.values.x1c : {}) };
}

// joint.running: for each revolute, the gap where its child turns on a pin or in a bore. A printed bore comes out
// hole_comp smaller across, so half of that comes off the gap each side; what's left is held against the printer's fit
export function runningChecks(s, f, { axisOf, placeItems, jointValues, mul }) {
  const motion = s.motion; if (!motion?.joints?.length) return;
  const worlds = placeItems(motion, jointValues(motion, motion.pose ?? undefined)), ids = motion.items.map((x) => x[0]);
  const P = printerRules(s), fit = P.fit ?? 0.2, comp = P.hole_comp ?? 0.1;
  const refs = new Set(s.objects.filter((o) => o.role === 'reference').map((o) => String(o.id).split('.')[0]));
  const partsOf = (id) => s.parts.filter((p) => p.item === id || p.leaf === id);
  for (const j of motion.joints) {
    if (j.type !== 'revolute' || j.parent < 0) continue;
    const a = ids[j.parent], b = ids[j.child];
    if (refs.has(a) || refs.has(b)) continue; // a bought part's seat is fit.seat's business
    const pa = partsOf(a), pb = partsOf(b);
    if (!pa.length || !pb.length) continue;
    const { O, Z } = axisOf(motion, worlds, j, mul), to = axisFrame(O, Z), g = runningGap(pa.flatMap((p) => p.triangles).map((t) => t.map(to)), pb.flatMap((p) => p.triangles).map((t) => t.map(to)));
    if (!g) continue;
    const printed = g.gap - comp / 2, at = O.map((c, i) => c + unit(Z)[i] * g.z), pin = g.pinOn === 'a' ? a : b, bore = g.pinOn === 'a' ? b : a, refsOut = { joint: j.id, pin, bore };
    const values = { drawn: g.gap, printed, fit, length: g.length }, words = `${bore} on ${pin}'s ${n3(g.pin * 2, 2)} mm pin: ${n3(g.gap)} mm each side as drawn, about ${n3(printed)} mm printed`;
    if (printed <= 0) f('fail', `${j.id}: ${words} (a printed bore comes out ${comp} mm small across): it won't turn. The bore wants ${n3(2 * (g.pin + fit) + comp, 2)} mm`, `${j.id}: no running gap`, { code: 'joint.running', at, refs: refsOut, values });
    else if (printed < fit - FACETS) f('warn', `${j.id}: ${words}, under the printer's ${fit} mm fit: expect it to bind. The bore wants ${n3(2 * (g.pin + fit) + comp, 2)} mm`, `${j.id}: tight on its pin`, { code: 'joint.running', at, refs: refsOut, values });
    else f('pass', `${j.id}: ${words}`, null, { code: 'joint.running', at, refs: refsOut, values });
  }
}
