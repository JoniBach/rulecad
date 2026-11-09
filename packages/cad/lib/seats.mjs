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

// fit.seat: a printed pocket against the bought bearing in it, read from the part as drawn, so a pocket drawn by hand is
// caught as well as one from bearingSeat. { "a": "b1", "b": "housing", "seat": "press" | "slip" | clearance in mm }
export function seatFit(x, s, f, { placeItems, jointValues, mul, seatSize }) {
  const top = (n) => String(n).split(/[.@]/)[0], o = s.objects.find((y) => y.bought?.part === 'bearing' && (y.id === top(x.a) || y.id === top(x.b))), label = x.note || `${x.a} in ${x.b}`, code = 'fit.seat';
  if (!o) return f('fail', `${label}: a seat holds a bought bearing, and neither ${x.a} nor ${x.b} is one`, `${label}: no bearing`, { code });
  const other = top(x.a) === o.id ? top(x.b) : top(x.a), parts = s.parts.filter((p) => p.item === other || p.leaf === other);
  if (!parts.length) return f('fail', `${label}: no part "${other}"`, null, { code });
  const motion = s.motion, ids = motion.items.map((y) => y[0]), W = placeItems(motion, jointValues(motion, motion.pose ?? undefined))[ids.indexOf(o.id)];
  const inv = (p) => { const q = [p[0] - W[3], p[1] - W[7], p[2] - W[11]]; return [W[0] * q[0] + W[4] * q[1] + W[8] * q[2], W[1] * q[0] + W[5] * q[1] + W[9] * q[2], W[2] * q[0] + W[6] * q[1] + W[10] * q[2]]; };
  const tris = parts.flatMap((p) => p.triangles).map((t) => t.map(inv)), v = o.built.values, w = v.width, R = v.outer_diameter / 2, r = v.bore / 2;
  const printer = printerRules(s), want = seatSize(v, { fit: x.seat === true ? 'press' : x.seat, printer }), refs = { item: o.id, part: other };
  const firstWall = (z) => { const segs = sliceAt(tris, z); if (segs.length < 3) return null; const h = []; for (let k = 0; k < RAYS; k++) { const a = rayHits(segs, ((k + 0.37) * 2 * Math.PI) / RAYS); if (!a.length) return null; h.push(a[0]); } return h; };
  const mid = firstWall(w / 2);
  if (!mid) return f('fail', `${label}: halfway along ${o.bought.set}, ${other} doesn't go round it`, `${label}: no seat`, { code, refs });
  const drawn = 2 * Math.max(...mid), diff = drawn - want.pocket, values = { drawn, wanted: want.pocket, difference: diff, comp: want.comp, clearance: want.clearance };
  const inMaterial = 2 * Math.min(...mid) < 2 * r + 0.1;
  if (inMaterial) return f('fail', `${label}: ${other} is solid where the bearing goes (the wall is ${n3(Math.min(...mid), 2)} mm from its axis, inside the ${v.bore} mm bore)`, `${label}: no pocket`, { code, refs, values });
  const say = `${o.bought.set} (${n3(2 * R, 2)} mm) in a pocket drawn ${n3(drawn, 3)} mm`;
  if (Math.abs(diff) > 0.15) f('fail', `${label}: ${say}, and a ${typeof want.fit === 'string' ? want.fit : `${want.fit} mm`} fit on this printer wants ${n3(want.pocket, 3)} mm: ${n3(Math.abs(diff), 2)} mm too ${diff < 0 ? 'small: it will not press in' : 'big: it will rattle'}`, `${label}: seat ${diff < 0 ? 'small' : 'big'}`, { code, refs, values });
  else if (Math.abs(diff) > 0.05) f('warn', `${label}: ${say}, ${n3(diff, 3)} mm from the ${n3(want.pocket, 3)} mm a ${typeof want.fit === 'string' ? want.fit : `${want.fit} mm`} fit wants`, `${label}: seat off`, { code, refs, values });
  else f('pass', `${label}: ${say}, a ${typeof want.fit === 'string' ? want.fit : `${want.fit} mm`} fit (printed about ${n3(want.clearance, 3)} mm)`, null, { code, refs, values });
  // How much of the race the wall holds, and what stops it
  const levels = 9, held = Array.from({ length: levels }, (_, k) => firstWall(w * (k + 0.5) / levels)).filter((h) => h && Math.min(...h) < R + 0.5).length / levels;
  if (held < 0.8) f('warn', `${label}: the pocket holds only ${n3(held * w, 1)} mm of the ${w} mm race: the bearing can tip`, `${label}: shallow`, { code: 'fit.seat', refs, values: { held: held * w, width: w } });
  const ledges = [firstWall(-0.3), firstWall(w + 0.3)].map((h) => (h ? Math.min(...h) : null)).filter((h) => h != null && h < R - 0.1);
  if (!ledges.length) f('warn', `${label}: nothing stops the bearing at either face: draw a lip`, `${label}: no lip`, { code: 'fit.seat', refs });
  else {
    const lip = Math.max(...ledges);
    if (lip < r + (R - r) / 2) f('fail', `${label}: the lip comes in to ${n3(2 * lip, 2)} mm across, onto the inner race (which turns): it wants ${n3(2 * r + (R - r), 2)} mm or more`, `${label}: lip on inner race`, { code: 'fit.seat', refs, values: { lip: 2 * lip } });
    else f('pass', `${label}: a ${n3(R - lip, 2)} mm lip stops the outer race and clears the inner`, null, { code: 'fit.seat', refs, values: { lip: 2 * lip } });
  }
}
