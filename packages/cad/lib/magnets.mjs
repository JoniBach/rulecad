// Magnets in an assembly: a fit whose "fastener" names magnets, { "magnet": "disc magnet 8x3", "count": 2, "load": 10 },
// is checked from the parts as drawn. The magnets' pockets are found in part a or part b (round holes about the size
// @rulecad/fixings' magnetSeatModel draws for the magnet and the project's printer, for any fit or the one asked), each
// measured along its axis: deep enough for the magnet (one standing proud of its face is refused by name), and the floor
// left under it held to what prints. The magnets' pull is said, and held to the fit's load where it gives one. They go on
// the shopping list (lib/list.mjs, bought) and the build step (lib/order.mjs) by their names.
import { jscad } from './design.mjs';
import { profile, holesIn, fixingsOf } from './fasten.mjs';

const { vec3 } = jscad.maths;

const mm = (n) => String(Number(Number(n).toFixed(3))), r3 = (x) => +x.toFixed(3);
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const top = (n) => String(n).split(/[.@]/)[0];
/** How far a pocket as drawn may be from one the magnet's fits draw and still be taken for it, mm across. */
const TOL = 0.06;
/** What a fit's magnets may say: the assembly schema's $defs.magnets. */
export const MAGNET_KEYS = ['magnet', 'count', 'fit', 'load', 'gap'];
const FITS = ['press', 'glue', 'ribs'];

/**
 * A fit's magnets as the assembly reads them: { magnet, count, fit, load, gap }, which become the fit's magnet and its
 * fastener's name, the magnet's in its one spelling ('disc magnet 8x3 N35'). They fasten the two parts unless the fit
 * says otherwise.
 * @param {object} x a fit as written, its fastener an object with "magnet" @param {object} F the project's fixings (fixingsFor)
 * @returns {object} the fit, with magnet and a fastener's name
 */
export function magnetOfFit(x, F) {
  const p = x.fastener, label = x.note || x.label || `${x.a} / ${x.b}`;
  if (typeof p.magnet !== 'string' || !p.magnet.trim()) throw new Error(`fit ${label}: fastener as an object names magnets: { "magnet": "disc magnet 8x3", "count": 2 } (got ${JSON.stringify(p)})`);
  const stray = Object.keys(p).filter((k) => !MAGNET_KEYS.includes(k));
  if (stray.length) throw new Error(`fit ${label}: magnets have no "${stray.join('", "')}": a fastener naming magnets takes ${MAGNET_KEYS.join(', ')} (the assembly schema's magnets)`);
  if (x.count != null && p.count != null) throw new Error(`fit ${label}: give the magnets' count once, in the fastener ({ "magnet": ..., "count": 2 })`);
  if (p.fit != null && !FITS.includes(p.fit)) throw new Error(`fit ${label}: a magnet's fit is ${FITS.join(', ')} (got ${JSON.stringify(p.fit)})`);
  let name;
  try { name = F.magnetModel(p.magnet.trim()).name; } catch (e) { throw new Error(`fit ${label}: ${e.message.replace(/^magnetModel: /, '')}`); }
  return { fastens: true, ...x, magnet: { ...p, magnet: p.magnet.trim() }, fastener: name, ...(p.count != null || x.count != null ? { count: p.count ?? x.count } : {}) };
}

/**
 * fit.magnet: the magnets a fit names, their pockets found in the parts as drawn and checked against the magnet's seat.
 * @param {object} x the fit, with magnet (magnetOfFit) @param {object} s the built assembly @param {Function} f the findings' sink, as checkAssembly's
 */
export function magnetFit(x, s, f) {
  const label = x.note || x.label || `${x.a} to ${x.b}`, code = 'fit.magnet', p = x.magnet, refs = { a: x.a, b: x.b, magnet: x.fastener };
  const fail = (text, short, more = {}) => f('fail', `${label}: ${text}`, short ?? `${label}: magnets`, { code, refs, ...more });
  const { F, material } = fixingsOf(s.project);
  const count = x.count != null ? x.num(x.count) : 1, load = p.load != null ? x.num(p.load) : null, gap = p.gap != null ? x.num(p.gap) : 0;
  if (!(Number.isInteger(count) && count >= 1)) return fail(`count is how many magnets, a whole number from 1 (got ${count})`);
  let seats;
  try { seats = (p.fit ? [p.fit] : FITS).map((fit) => F.magnetSeatModel(p.magnet, { fit, material, gap, count, ...(load != null ? { load } : {}) })); } catch (e) { return fail(e.message.replace(/^magnet\w*: /, '')); }
  const m = seats[0].magnet;
  if (m.shape !== 'disc') return fail(`${m.name}: a block magnet's pocket is not round, and only round pockets are found in the parts here; check its pocket with v.fixings.magnetSeatModel`, `${label}: block magnet`);
  const named = (q, n) => q.name === n || q.leaf === n || q.item === n || q.name.startsWith(`${n}.`);
  const sides = [x.a, x.b].map((n) => ({ name: n, parts: s.parts.filter((q) => !q.hardware && named(q, top(n))) }));
  const missing = sides.find((sd) => !sd.parts.length);
  if (missing) return fail(`no part "${missing.name}"`, `${label}: no part`);
  const R = m.diameter / 2 + 2, wants = seats.map((st) => ({ fit: st.fit, d: st.pocket.diameter, rules: st.pocket.rules }));
  // The pockets: round holes about a fit's pocket, measured along their axis: the hole open at one end, its floor at the other
  const found = [], odd = [];
  for (const sd of sides) for (const q of sd.parts) for (const h of holesIn(q)) {
    const want = wants.find((w) => Math.abs(h.d - w.d) <= TOL), near = !want && Math.abs(h.d - m.diameter) <= 0.6;
    if (!want && !near) continue;
    const O = q.m ? vec3.transform([0, 0, 0], h.at, q.m) : h.at, e = q.m ? vec3.transform([0, 0, 0], h.at.map((c, i) => c + h.axis[i]), q.m) : h.at, D = unit(e.map((c, i) => c - O[i]));
    const segs = profile(q.triangles, O, D, R).segs.filter((g) => g.solid || g.hole);
    const holes = segs.filter((g) => g.hole);
    if (!holes.length) continue;
    // the pocket's run: its hole segments side by side (a lead-in's cone is one of its own), and the floor past one end
    const hole = holes.reduce((a, b) => (b.z1 - b.z0 > a.z1 - a.z0 ? b : a));
    let i0 = segs.indexOf(hole), i1 = i0;
    while (segs[i0 - 1]?.hole && Math.abs(segs[i0 - 1].z1 - segs[i0].z0) < 1e-4) i0--;
    while (segs[i1 + 1]?.hole && Math.abs(segs[i1 + 1].z0 - segs[i1].z1) < 1e-4) i1++;
    const before = segs[i0 - 1], after = segs[i1 + 1], run = { z0: segs[i0].z0, z1: segs[i1].z1 };
    const floorSeg = before?.solid && !after ? before : after?.solid && !before ? after : null; // (blind: material on one side only)
    const where = O.map(r3);
    if (near) { odd.push({ part: sd.name, d: r3(h.d), at: where }); continue; }
    found.push({ part: sd.name, fit: want.fit, rules: want.rules, d: r3(h.d), depth: r3(run.z1 - run.z0), floor: floorSeg ? r3(floorSeg.z1 - floorSeg.z0) : null, at: where });
  }
  for (const o of odd) fail(`${o.part}'s pocket at ${o.at.map(mm).join(', ')} is drawn ${mm(o.d)} mm, and ${m.name} wants ${wants.map((w) => `${mm(w.d)} mm ${w.fit === 'ribs' ? 'with ribs' : `for a ${w.fit} fit`} (${w.rules.join(', ')})`).join(' or ')}: ${o.d < Math.min(...wants.map((w) => w.d)) ? 'too small, it will not go in' : 'too big, it will be loose'}`, `${label}: pocket ${o.d < Math.min(...wants.map((w) => w.d)) ? 'small' : 'big'} in ${o.part}`, { at: o.at, values: { part: o.part, drawn: o.d } });
  if (odd.length) return;
  if (found.length < count) return fail(`${count} × ${m.name} wanted, and ${found.length ? `only ${found.length} pocket${found.length > 1 ? 's' : ''} about its ${wants.map((w) => mm(w.d)).join(' or ')} mm ${found.length > 1 ? 'are' : 'is'}` : 'no pocket about its size is'} drawn in ${x.a} or ${x.b}: draw them with v.fixings.magnetSeat`, `${label}: pockets missing`, { values: { count, found: found.length } });
  let bad = 0;
  for (const k of found) {
    if (k.depth < m.thickness - TOL) { bad++; fail(`${k.part}'s pocket at ${k.at.map(mm).join(', ')} is ${mm(k.depth)} mm deep, and ${m.name} is ${mm(m.thickness)} mm thick: it stands ${mm(r3(m.thickness - k.depth))} mm proud of the face`, `${label}: pocket shallow in ${k.part}`, { at: k.at, values: { depth: k.depth, thickness: m.thickness } }); continue; }
    if (k.floor != null) { try { // (the floor held to fixings.magnet_floor by the seat's own refusal)
      F.magnetSeatModel(p.magnet, { fit: k.fit, material, thickness: r3(k.depth + k.floor), recess: Math.max(0, r3(k.depth - m.thickness)) }); } catch (e) { bad++; fail(`${k.part}'s pocket at ${k.at.map(mm).join(', ')}: ${e.message.replace(/^magnetSeatModel: /, '')}`, `${label}: floor thin in ${k.part}`, { at: k.at, values: { floor: k.floor } }); } }
  }
  if (bad) return;
  const fits = [...new Set(found.map((k) => k.fit))], seat = seats.find((st) => st.fit === fits[0]), parts = [...new Set(found.map((k) => k.part))];
  f('pass', `${label}: ${count} × ${m.name} in ${fits.join(' and ')} pockets drawn ${[...new Set(found.map((k) => mm(k.d)))].join(' and ')} mm (${seat.pocket.rules.join(', ')}) in ${parts.join(' and ')}, each deep enough for the magnet`, null, { code, refs, values: { count, pocket: seat.pocket.diameter, grams: m.grams } });
  const pull = seat.findings.find((g) => g.code === 'magnet.pull'), hold = seat.findings.find((g) => g.code === 'magnet.hold');
  f(hold ? hold.level : 'info', `${label}: ${pull.text}${hold ? `. ${hold.text}` : `. Together ${count} pull ${mm(seat.magnet.total)} N: give load to have it checked`}`, hold && hold.level !== 'pass' ? `${label}: magnets weak` : null, { code: 'fit.magnet.load', refs, values: { pull: seat.magnet.pull, total: seat.magnet.total, ...(hold ? hold.values : {}) } });
}
