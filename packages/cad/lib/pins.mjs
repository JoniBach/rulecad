// Pins in an assembly: a fit whose "fastener" names pins, { "pin": "snap pin 4x6", "count": 2, "load": 40 }, is
// checked as a screwed joint is, from the parts as drawn. The pins' holes are found in part a (round holes about the
// pin's size whose axis goes on into part b), each followed through a and into b: the hole in each part is held to the
// one @rulecad/fixings' pinModel draws for the pin and the project's printer (fit.pin), the length the pin has room
// for to its length (a pin too long for its part is refused by name), and the load the fit gives, shared by its pins,
// to what each pin and its printed hole carry. The pins go on the shopping list (lib/list.mjs) and the build step
// (lib/order.mjs) by their names.
import { jscad } from './design.mjs';
import { profile, holesIn, fixingsOf, FASTEN } from './fasten.mjs';

const { vec3 } = jscad.maths;

const mm = (n) => String(Number(Number(n).toFixed(3))), r3 = (x) => +x.toFixed(3);
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const top = (n) => String(n).split(/[.@]/)[0];
/** How far a hole as drawn may be from the pin's hole and still be taken for it (mm across): fasten's own tolerance. */
const TOL = FASTEN.size.value;
/** How far off the pin's hole a round hole may be and still be looked at as one of its places, mm across. */
const LOOK = 0.6;
/** What a fit's pins may say: the assembly schema's $defs.pins. */
const PIN_KEYS = ['pin', 'count', 'fit', 'load', 'pull'];

/**
 * A fit's fastener as the assembly reads it: a name in words ("Two push pins"), kept as it is, or pins by the schema's
 * form ({ pin, count, load, fit }), which become the fit's pin and its fastener's name. Pins fasten the two parts
 * (fastens: true) unless the fit says otherwise.
 * @param {object} x a fit as written @returns {object} the fit, with pin and a fastener's name where it names pins
 */
export function pinOfFit(x) {
  if (!x.fastener || typeof x.fastener !== 'object') return x;
  const p = x.fastener, label = x.note || x.label || `${x.a} / ${x.b}`;
  if (typeof p.pin !== 'string' || !p.pin.trim()) throw new Error(`fit ${label}: fastener as an object names pins: { "pin": "snap pin 4x6", "count": 2 } (got ${JSON.stringify(p)})`);
  const stray = Object.keys(p).filter((k) => !PIN_KEYS.includes(k));
  if (stray.length) throw new Error(`fit ${label}: pins have no "${stray.join('", "')}": a fastener naming pins takes ${PIN_KEYS.join(', ')} (the assembly schema's pins)`);
  if (x.count != null && p.count != null) throw new Error(`fit ${label}: give the pins' count once, in the fastener ({ "pin": ..., "count": 2 })`);
  return { fastens: true, ...x, pin: p, fastener: p.pin.trim(), ...(p.count != null || x.count != null ? { count: p.count ?? x.count } : {}) };
}

/**
 * fit.pin: the pins a fit names, found in the parts as drawn and checked against their models.
 * @param {object} x the fit, with pin (pinOfFit) @param {object} s the built assembly @param {Function} f the findings' sink, as checkAssembly's
 */
export function pinFit(x, s, f) {
  const label = x.note || x.label || `${x.a} to ${x.b}`, code = 'fit.pin', p = x.pin, refs = { a: x.a, b: x.b, pin: x.fastener };
  const fail = (text, short, more = {}) => f('fail', `${label}: ${text}`, short ?? `${label}: pins`, { code, refs, ...more });
  const { F, material } = fixingsOf(s.project);
  const count = x.count != null ? x.num(x.count) : 1, load = p.load != null ? x.num(p.load) : null;
  if (!(Number.isInteger(count) && count >= 1)) return fail(`count is how many pins, a whole number from 1 (got ${count})`);
  let m0;
  try { m0 = F.pinModel(x.fastener, { material, ...(p.fit ? { fit: p.fit } : {}) }); } catch (e) { return fail(e.message.replace(/^pinModel: /, '')); }
  const named = (q, n) => q.name === n || q.leaf === n || q.item === n || q.name.startsWith(`${n}.`);
  const A = s.parts.filter((q) => !q.hardware && named(q, top(x.a))), B = s.parts.filter((q) => !q.hardware && named(q, top(x.b)));
  if (!A.length || !B.length) return fail(`no part "${A.length ? x.b : x.a}"`, `${label}: no part`);
  const R = m0.diameter + 2, wanted = plainHoles(F, x.fastener, material, m0, p.fit);
  // A part measured along a world axis: where its material and its holes lie along it, and the holes' size
  const run = (parts, O, D) => {
    const segs = parts.flatMap((q) => profile(q.triangles, O, D, R).segs).filter((g) => g.solid || g.hole).sort((a, b) => a.z0 - b.z0);
    if (!segs.length) return null;
    const holes = segs.filter((g) => g.hole), size = (g) => (g.a.loop?.shape === 'round' && g.a.loop.d != null ? Math.min(g.a.loop.d, g.b.loop?.d ?? Infinity) : 2 * Math.min(g.a.free, g.b.free));
    return { lo: segs[0].z0, hi: segs.at(-1).z1, segs, hole: holes.length ? Math.min(...holes.map(size)) : null, solidAt: segs.find((g) => g.solid) ?? null };
  };
  // The pins' places: round holes in a about the pin's hole, standing on an axis that goes on into b
  const axes = [];
  for (const q of A) for (const h of holesIn(q)) {
    if (Math.abs(h.d - m0.hole.diameter) > LOOK && !wanted.some((w) => Math.abs(h.d - w.diameter) <= LOOK)) continue;
    const O = q.m ? vec3.transform([0, 0, 0], h.at, q.m) : h.at, e = q.m ? vec3.transform([0, 0, 0], h.at.map((c, i) => c + h.axis[i]), q.m) : h.at.map((c, i) => c + h.axis[i]), D = unit(e.map((c, i) => c - O[i]));
    const a = run(A, O, D), b = run(B, O, D);
    if (!a || !b) continue;
    const flip = (a.lo + a.hi) / 2 > (b.lo + b.hi) / 2; // (along from a into b)
    const Df = flip ? D.map((c) => -c) : D;
    axes.push({ at: O.map(r3), D: Df, a: flip ? run(A, O, Df) : a, b: flip ? run(B, O, Df) : b });
  }
  if (axes.length < count) return fail(`${count} × ${m0.name} wanted, and ${axes.length ? `only ${axes.length} hole${axes.length > 1 ? 's' : ''} about its ${mm(m0.hole.diameter)} mm hole ${axes.length > 1 ? 'lead' : 'leads'}` : `no hole about its ${mm(m0.hole.diameter)} mm hole leads`} from ${x.a} into ${x.b}: draw the holes with v.fixings.pinHole`, `${label}: holes missing`, { values: { count, found: axes.length } });
  let bad = 0;
  const worst = { margin: Infinity, m: null };
  for (const [i, ax] of axes.entries()) {
    const where = `pin ${i + 1} at ${ax.at.map(mm).join(', ')}`, at = ax.at;
    // the holes: each part's held to the pin's
    for (const [part, r] of [[x.a, ax.a], [x.b, ax.b]]) {
      const d = r.hole;
      if (d == null) { bad++; fail(`${where}: ${part} is solid on the pin's axis: it has no hole there for ${m0.name}`, `${label}: no hole in ${part}`, { at, values: { part } }); continue; }
      const hit = (m0.snap ? [{ fit: 'snap', diameter: m0.hole.diameter, rule: m0.hole.rules.at(-1) }] : wanted).find((w) => Math.abs(d - w.diameter) <= TOL);
      if (hit) continue;
      const w = m0.snap ? m0.hole : wanted.find((v) => v.fit === (p.fit ?? 'press')), small = d < Math.min(...(m0.snap ? [m0.hole.diameter] : wanted.map((v) => v.diameter)));
      bad++; fail(`${where}: ${part}'s hole is drawn ${mm(r3(d))} mm, and ${m0.name} wants ${m0.snap ? `${mm(m0.hole.diameter)} mm (${m0.hole.rules.join(' and ')})` : wanted.map((v) => `${mm(v.diameter)} mm for a ${v.fit} fit (${v.rule})`).join(' or ')}: ${small ? 'too small, it will not go in' : 'too big, it will be loose'}`,
        `${label}: hole ${small ? 'small' : 'big'} in ${part}`, { at, values: { part, drawn: r3(d), wanted: w.diameter } });
    }
    // the length: the room from a's outer face to where b closes (a blind hole's floor) or ends
    const end = ax.b.solidAt ? ax.b.solidAt.z0 : ax.b.hi, room = r3(end - ax.a.lo);
    if (m0.snap && ax.b.solidAt) { bad++; fail(`${where}: ${x.b}'s hole is blind ${mm(r3(ax.b.solidAt.z0 - ax.b.lo))} mm deep: a snap pin's barb clicks out past the far face, so its socket goes through`, `${label}: socket blind`, { at }); continue; }
    const grip = r3(Math.max(0.1, Math.min(ax.a.hi - ax.a.lo, end - ax.b.lo)));
    let m;
    try { m = F.pinModel(x.fastener, { material, thickness: room, grip, ...(p.fit ? { fit: p.fit } : {}), ...(load != null ? { load: load / count } : {}), ...(p.pull != null ? { pull: x.num(p.pull) / count } : {}) }); }
    catch (e) { bad++; fail(`${where} in ${x.a} and ${x.b}: ${e.message.replace(/^pinModel: /, '')}`, `${label}: ${/too long/.test(e.message) ? 'pin too long' : /too short/.test(e.message) ? 'pin too short' : 'pin'}`, { at, values: { length: m0.length, room } }); continue; }
    const s1 = m.findings.find((g) => g.code === 'pin.strength');
    if (m.margin != null && m.margin < worst.margin) Object.assign(worst, { margin: m.margin, m, s1, where });
    if (load == null && i === 0) worst.s1 ??= s1;
  }
  if (bad) return;
  const say = m0.snap ? `in sockets drawn ${mm(m0.hole.diameter)} mm (${m0.hole.rules.join(', ')})` : `in holes drawn to ${wanted.map((v) => `${v.fit} ${mm(v.diameter)} mm`).join(' or ')}`;
  f('pass', `${label}: ${count} × ${m0.name} ${say}, each the right length for ${x.a} and ${x.b}`, null, { code, refs, values: { count, hole: m0.hole.diameter, grams: m0.grams } });
  if (worst.m) f(worst.s1.level, `${label}: ${worst.where}: ${worst.s1.text}`, worst.s1.level === 'pass' ? null : `${label}: pins weak`, { code: 'fit.pin.load', refs, values: worst.s1.values });
  else if (worst.s1) f('info', `${label}: ${worst.s1.text}`, null, { code: 'fit.pin.load', refs, values: worst.s1.values });
}
// The holes a plain pin may sit in: press and slip, or the one fit asked; a snap pin's is its socket's
function plainHoles(F, name, material, m0, fit) {
  if (m0.snap) return [{ fit: 'snap', diameter: m0.hole.diameter, rule: m0.hole.rules.join(', ') }];
  return (fit ? [fit] : ['press', 'slip']).map((k) => { const h = F.pinModel(name, { material, fit: k }).hole; return { fit: k, diameter: h.diameter, rule: h.rules.join(', ') }; });
}
