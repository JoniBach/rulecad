// Printed bolts: a screw printed with its thread, standing on its head, as a fixing with a strength of its own. Its
// thread is threadModel's (refused below the smallest pitch the printer resolves, naming the smallest that prints), and
// its strength is the plastic's: the bolt breaks in tension across its root, or its teeth shear off in the nut, or its
// head shears off its shank, whichever comes first. A printed bolt goes in a printed nut (or a thread printed in the
// part), each taking half the printer's thread_gap, or in a bought steel nut, the bolt then taking the whole gap. It is
// named as a screw with the word printed: 'M8x20 hex printed'. Units: mm, N, MPa, grams.
import jscad from '@jscad/modeling';
import { DEFAULTS, fixingOf, nutOf, cite, rest, finding, positive, oneOf, mm, r3, a } from './model.mjs';
import { optionsOf } from './holes.mjs';
import { materialOf, weakest } from './strength.mjs';
import { threadModel } from './threads.mjs';
import { screwModel, screw } from './hardware.mjs';

const { translate, rotateX } = jscad.transforms;

const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`; // (a plain word's article: model's a() is for thread names)
const n1 = (x) => +x.toFixed(1), n2 = (x) => +x.toFixed(2);
/** What a printed bolt can go in: a printed nut or a thread printed in the part (half the gap each), or a standard thread, 'steel': a bought nut, a heat-set insert or a tapped hole (the bolt takes the whole gap). */
export const BOLT_NUTS = ['printed', 'steel'];

// The area of a circle of radius r less the segment past a chord f from its centre (a bolt lying on its side, on its flat)
const segmentless = (r, f) => (f == null || f >= r ? Math.PI * r * r : Math.PI * r * r - (r * r * Math.acos(f / r) - f * Math.sqrt(r * r - f * f)));

/**
 * @typedef {{ kind: 'printed-bolt', name: string, thread: string, head: string, length: number, nut: 'printed' | 'steel', axis: 'x' | 'y' | 'z', material: string,
 *   root: number, rootArea: number, engaged: number, tension: { strength: number, load: number, rule: string }, strip: { area: number, shear: number, load: number, nutArea: number | null },
 *   headShear: number | null, breaking: number, governs: 'tension' | 'strip' | 'head', load: number | null, margin: number | null, grams: number, threaded: object, rests: object[], findings: object[] }} PrintedBolt
 *   root: the bolt's root diameter as drawn, mm; rootArea: its section there (less its flat, lying), mm²; engaged: thread in the nut, mm;
 *   tension: the plastic's strength the root is pulled at (across its layers standing, along them lying) and the load it breaks at, N;
 *   strip: the shear area of the bolt's teeth in the nut (and of a printed nut's own), the shear strength and the load they shear at;
 *   headShear: the load that shears the head off the shank; breaking: the least of the three, N, governs: which
 */

/**
 * A printed bolt's strength: the load along it that breaks it, from the plastic's strength by how it prints, and that
 * load against the one it carries. Standing on its head (axis z, the way it prints with no support), the pull goes
 * across its layers; lying on a flat (axis x or y), along them.
 * @param {string | object} m a screw's name or model ('M8x20 hex printed', or 'M8x20 hex'), or a thread with { length, head }
 * @param {{ material?: string | object, printer?: object, nut?: 'printed' | 'steel', depth?: number, axis?: 'x' | 'y' | 'z', load?: number, length?: number, head?: string,
 *   gap?: number, sets?: object }} [o]
 *   material: the plastic (default PLA); nut: printed (a printed nut or a thread printed in the part, the default) or
 *   steel (a standard thread: a bought nut, a heat-set insert or a tapped hole); depth: thread engaged in the nut, mm (default the thread's hex nut height); axis: how it
 *   prints, z standing on its head (the default), or x or y lying on a flat; load: the pull along it, N, held to
 *   fixings.load_margin; gap: in place of the printer's thread_gap
 * @returns {PrintedBolt}
 */
export function printedBoltModel(m, o = {}) {
  const what = 'printedBoltModel';
  optionsOf(what, o, '{ material: \'pla\', load: 100 }');
  const fx = fixingOf(what, m, { ...o, anyLength: true });
  if (!['screw', 'thread'].includes(fx.item)) throw new Error(`${what}: ${fx.name} is ${an(fx.item)}, not a bolt: name a screw ('${fx.thread}x20 hex printed')`);
  const nut = oneOf(what, 'nut', o.nut ?? 'printed', BOLT_NUTS), axis = oneOf(what, 'axis', o.axis ?? 'z', ['x', 'y', 'z']), mat = materialOf(what, o.material ?? 'pla', o.sets);
  if (mat.cls !== 'plastic') throw new Error(`${what}: ${mat.name} is ${an(mat.cls)}, not a plastic: a printed bolt is printed in a plastic (pla, petg, or a plastic's rule set)`);
  const form = o.head ?? fx.head?.form ?? (fx.made.heads.includes('hex') ? 'hex' : fx.made.heads[0]), sc = screwModel(fx, { length: o.length ?? fx.length ?? undefined, head: form, anyLength: true, ...(fx.printed ? { material: o.material ?? 'pla', sets: o.sets } : {}) }); // (a printed name is weighed in its plastic by screwModel)
  const out = [], rests = [];
  // Its thread, as it prints: refused where the printer cannot resolve the pitch, naming the smallest thread that prints
  const shank = r3(sc.length - sc.sink), t = threadModel(fx, { what, length: shank, printer: o.printer, sets: o.sets, mate: nut === 'printed' ? 'printed' : 'bought', gap: o.gap, top: '-z', axis, flat: axis !== 'z' ? true : undefined });
  rests.push(...t.rests); out.push(...t.findings.filter((f) => f.code !== 'thread.overlap'));
  const depth = o.depth != null ? positive(what, 'depth (thread engaged in the nut)', o.depth) : nutOf(what, fx, 'hex').height;
  if (o.depth == null) rests.push(rest(cite(fx, 'nut_height'), fx.figures.nut_height));
  // Tension across the root as drawn: standing, the pull goes across the layers; lying, along them
  const root = t.drawn.minor, rootArea = segmentless(root / 2, t.flat), w = weakest(mat), sTension = axis === 'z' ? w.f : mat.strength, tensionLoad = sTension.value * rootArea;
  rests.push(rest(sTension.name, sTension));
  // The teeth in the nut, on the basic profile: the bolt's at the nut's minor diameter D1 = d - 1.0825 P, a tooth 0.75 P
  // wide there (the nut's crest flat is P/4); a printed nut's own at the bolt's major d, 0.875 P wide (the bolt's crest is P/8)
  const P = fx.pitch, d = fx.major, D1 = d - (5 / 8) * Math.sqrt(3) * P, ratio = DEFAULTS.shear_ratio.value, tau = w.f.value * ratio;
  const boltArea = 0.75 * Math.PI * D1 * depth, nutArea = nut === 'printed' ? 0.875 * Math.PI * d * depth : null, stripArea = Math.min(boltArea, nutArea ?? Infinity), stripLoad = tau * stripArea;
  rests.push(rest(w.f.name, w.f), rest('fixings.shear_ratio', DEFAULTS.shear_ratio));
  // The head off its shank: a cylinder the bolt's diameter, the head's height tall, across the layers
  const headShear = form === 'set' ? null : tau * Math.PI * d * Math.max(sc.headHeight, 1e-9);
  const caps = { tension: tensionLoad, strip: stripLoad, ...(headShear != null ? { head: headShear } : {}) };
  const governs = /** @type {'tension' | 'strip' | 'head'} */ (Object.entries(caps).sort((x, y) => x[1] - y[1])[0][0]), breaking = caps[governs];
  const across = axis === 'z' ? `across its layers (it prints standing on its head)${w.note}` : 'along its layers (it prints lying on a flat)';
  out.push(finding('info', `${a(fx.thread)} printed bolt in ${mat.name} breaks at about ${mm(n1(breaking))} N, ${governs === 'tension' ? 'pulled apart across its root' : governs === 'strip' ? 'its teeth sheared off in the nut' : 'its head sheared off'}: its ${mm(root)} mm root, ${mm(n2(rootArea))} mm², pulled ${across} at ${sTension.name} ${mm(sTension.value)} MPa, ${mm(n1(tensionLoad))} N; ${mm(depth)} mm of thread in a ${nut} nut shears its ${nut === 'printed' ? 'weaker teeth' : 'teeth'} over ${mm(n2(stripArea))} mm² (0.75 π D1 Le${nut === 'printed' ? ', the nut\'s own 0.875 π d Le' : ''}) at ${mm(n2(tau))} MPa, ${mm(n1(stripLoad))} N${headShear != null ? `; its ${mm(sc.headHeight)} mm head shears off at ${mm(n1(headShear))} N` : ''}. Every strength is an estimate: test one that matters`,
    'bolt.strength', { values: { breaking: n1(breaking), tension: n1(tensionLoad), strip: n1(stripLoad), head: headShear != null ? n1(headShear) : null, governs }, refs: { thread: fx.thread, material: mat.name, nut, axis, kind: 'estimate' } }));
  const load = o.load != null ? positive(what, 'load (the pull along the bolt, in N)', o.load) : null, want = DEFAULTS.load_margin.value;
  let margin = null;
  if (load != null) {
    margin = n2(breaking / load); rests.push(rest('fixings.load_margin', DEFAULTS.load_margin));
    out.push(finding(margin >= want ? 'pass' : margin >= 1 ? 'warn' : 'fail', `a pull of ${mm(load)} N on the printed bolt is held ${mm(margin)} times over${margin >= want ? '' : margin >= 1 ? `, under the ${mm(want)} times fixings.load_margin asks` : ': it breaks'} (${governs} first). Do it up by hand: a printed thread takes no wrench's torque`, 'bolt.load', { values: { load, margin, breaking: n1(breaking) } }));
  }
  if (nut === 'steel') out.push(finding('info', `in a standard thread (a bought steel nut, a heat-set insert or a tapped hole), the printed bolt takes the whole of the thread's gap and the nut's teeth hold: the bolt's teeth shear first`, 'bolt.nut', { values: { nut } }));
  // Its mass: the outline screwModel weighs, at the plastic's density
  if (!mat.density) throw new Error(`${what}: ${mat.name} has no density in its rule set, so the bolt cannot be weighed`);
  const grams = fx.printed ? sc.mass : r3((sc.mass / DEFAULTS.steel_density.value) * mat.density.value);
  rests.push(rest(mat.density.name, mat.density));
  const name = fx.printed ? sc.name : `${sc.name} printed`;
  out.push(finding('info', `${name} weighs ${mm(grams)} g of ${mat.name}, an estimate from its outline`, 'bolt.mass', { values: { grams } }));
  return { kind: 'printed-bolt', name, thread: fx.thread, head: form, length: sc.length, nut, axis, material: mat.name, root, rootArea: n2(rootArea), engaged: depth,
    tension: { strength: sTension.value, load: n1(tensionLoad), rule: sTension.name }, strip: { area: n2(stripArea), shear: n2(tau), load: n1(stripLoad), nutArea: nutArea != null ? n2(nutArea) : null },
    headShear: headShear != null ? n1(headShear) : null, breaking: n1(breaking), governs, load, margin, grams, threaded: t, rests, findings: out };
}

/**
 * A printed bolt's solid: the screw with its thread drawn (screw's display: 'thread'), turned over to stand on its head
 * as it prints: the head's top on the bed at z = 0, its tip up.
 * @param {string | object} m as printedBoltModel @param {object} [o] as printedBoltModel @param {{ union: Function, subtract: Function }} [ops]
 * @returns {object} a JSCAD geom3 with .model holding printedBoltModel's numbers
 */
export function printedBolt(m, o = {}, ops) {
  const b = printedBoltModel(m, o), fx = fixingOf('printedBolt', m, { ...o, anyLength: true });
  if (b.axis !== 'z') throw new Error('printedBolt: the solid is drawn standing on its head (axis z); a bolt lying on its flat is thread(..., { axis, flat: true }) with a head of your own');
  const g = screw(fx, { length: b.length, head: b.head, anyLength: true, display: 'thread', printer: o.printer, sets: o.sets, mate: b.nut === 'printed' ? 'printed' : 'bought', gap: o.gap }, ...(ops ? [ops] : []));
  // (turned over onto its head, the head's top on the bed at z = 0 and its tip up)
  return Object.assign(translate([0, 0, g.model.top], rotateX(Math.PI, g)), { model: b, screw: g.model });
}
