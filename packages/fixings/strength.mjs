// Strength and length: whether enough thread is engaged, the load that strips it, the clamp force a tightening torque
// gives, the pressure under a head, and the sold length that fits a stack of parts. Each returns its numbers, what
// they rest on, and findings in the kit's one shape. The strengths of materials come from the kit's material rule
// sets (pla, petg, al6061, al7075, s275, ss304), or one handed in. These are first sums for a printed joint, with
// their estimates named: a joint that matters is tested. Units: mm, N, N·m, MPa.
import pla from '@rulecad/rules/pla.json' with { type: 'json' };
import petg from '@rulecad/rules/petg.json' with { type: 'json' };
import al6061 from '@rulecad/rules/al6061.json' with { type: 'json' };
import al7075 from '@rulecad/rules/al7075.json' with { type: 'json' };
import s275 from '@rulecad/rules/s275.json' with { type: 'json' };
import ss304 from '@rulecad/rules/ss304.json' with { type: 'json' };
import { DEFAULTS, ENGAGEMENT, fixingOf, fixingModel, headOf, nutOf, screwName, figure, cite, rest, finding, positive, oneOf, isNum, shown, mm, r3, a } from './model.mjs';
import { holeModel } from './holes.mjs';

/**
 * @typedef {import('./model.mjs').Fixing} Fixing a fixing's model, as fixingModel gives it
 */

const KIT = { pla, petg, al6061, al7075, s275, ss304 };
/** The materials there are rule sets for in the kit, by name. */
export const MATERIALS = Object.keys(KIT);
/** The classes of material the engagement rules know. */
export const MATERIAL_CLASSES = ['plastic', 'aluminium', 'steel'];
const n1 = (x) => +x.toFixed(1), n2 = (x) => +x.toFixed(2);
const options = (what, o, example) => { if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the second argument is its options (${example}), not ${shown(o)}`); return o; };

// A material from what a function was handed: a kit set's name ('PLA'), the workspace's set of that name (sets), or a
// rule set itself. Its class is told by its stiffness: under 20 GPa a plastic, under 100 GPa an aluminium, else a steel.
function materialOf(what, material, sets) {
  if (material == null) throw new Error(`${what}: give a material, what the thread is in or the head sits on: ${MATERIALS.join(', ')}, or a rule set with a strength ({ name, rules })`);
  let set = null;
  if (typeof material === 'object' && material.rules && typeof material.rules === 'object') set = material;
  else if (typeof material === 'string') {
    const key = material.trim().toLowerCase(), own = sets && typeof sets === 'object' ? (Array.isArray(sets) ? sets.find((s) => s?.name === key) : sets[key]) : null;
    set = own?.rules ? { name: key, ...own } : KIT[key] ?? null;
    if (!set) throw new Error(`${what}: no material "${material}". There are: ${MATERIALS.join(', ')}. For another, hand in its rule set ({ name, rules: { strength, modulus } }), or the workspace's sets with it in`);
  } else throw new Error(`${what}: material is a material's name (${MATERIALS.join(', ')}) or its rule set ({ name, rules }), not ${shown(material)}`);
  const name = set.name ?? 'the material', num = (k) => { const f = set.rules[k]; if (f && !(isNum(f.value) && f.value > 0)) throw new Error(`${what}: ${name}.${k} is a number above 0 (got ${shown(f.value)})`); return f ? { ...f, name: `${name}.${k}` } : null; };
  const strength = num('strength'), across = num('strength_z'), modulus = num('modulus');
  if (!strength) throw new Error(`${what}: ${name} has no strength in its rule set: a tensile or yield strength in MPa is needed`);
  if (!modulus) throw new Error(`${what}: ${name} has no modulus in its rule set, which tells a plastic from a metal`);
  return { name, cls: modulus.value < 20000 ? 'plastic' : modulus.value < 100000 ? 'aluminium' : 'steel', strength, across, modulus };
}
// The class of material an engagement rule is read by: a class by name, or a material's
function classOf(what, material, sets) {
  if (typeof material === 'string' && MATERIAL_CLASSES.includes(material.trim().toLowerCase())) return { cls: material.trim().toLowerCase(), name: null };
  if (material == null) throw new Error(`${what}: give a material: a class (${MATERIAL_CLASSES.join(', ')}) or a material (${MATERIALS.join(', ')})`);
  return materialOf(what, material, sets);
}
// The weaker of a printed material's two strengths, with what it says about itself
function weakest(mat) {
  const f = mat.across && mat.across.value < mat.strength.value ? mat.across : mat.strength;
  const note = mat.cls !== 'plastic' ? '' : mat.across ? ` (${f.name}, the weaker way of the print)` : ` (${mat.name} has no strength across its layers, strength_z: the strength along them is used, and a screw standing across the layers may hold less)`;
  return { f, note };
}

// A screw's own strength: its tensile stress area, and its proof load from its property class
function proofOf(what, fx, o) {
  if (fx.form === 'plastic') throw new Error(`${what}: ${fx.thread} is a thread-forming screw for plastic, with no property class in its rule set (${fx.set}): its maker's sheet gives what it holds`);
  const kind = oneOf(what, 'screw', o.screw ?? 'steel', ['steel', 'stainless']), name = kind === 'steel' ? 'proof_stress' : 'stainless_proof_stress';
  if (o.proof != null) positive(what, 'proof (the screw\'s proof stress, in MPa)', o.proof);
  const k = fx.form === 'unified' ? 0.9743 : 0.9382, area = (Math.PI / 4) * (fx.major - k * fx.pitch) ** 2, stress = o.proof ?? figure(what, fx, name);
  const cls = o.proof != null ? 'the proof stress given' : kind === 'steel' ? (fx.figures.property_class ? `class ${fx.figures.property_class.value}` : 'alloy steel') : String(fx.figures.stainless_class?.value ?? 'stainless');
  return { area, stress, load: area * stress, says: cls, rests: [rest(cite(fx, 'major_diameter'), fx.figures.major_diameter), rest(cite(fx, 'pitch'), fx.figures.pitch), ...(o.proof != null ? [] : [rest(cite(fx, name), fx.figures[name])])] };
}

/**
 * Whether enough thread is engaged, against the engagement rule for what the thread is in: 1 diameter in steel, 2 in
 * aluminium, 2.5 in plastic (the engagement rule set of @rulecad/rules).
 * @param {Fixing | string} m a fixing's model or name @param {{ depth: number, material: string | object, sets?: object }} o
 *   depth: the length of thread engaged, in mm; material: a class (plastic, aluminium, steel), a material of the kit
 *   (pla, petg, al6061, al7075, s275, ss304) or a material's rule set
 * @returns {{ thread: string, depth: number, need: number, turns: number, diameters: number, class: string, material: string | null, enough: boolean, rests: object[], findings: object[] }}
 *   need: the depth that would do; turns: threads engaged; diameters: the depth in diameters of the screw
 */
export function engagement(m, o = {}) {
  const what = 'engagement';
  options(what, o, '{ depth: 6, material: \'pla\' }');
  const fx = fixingOf(what, m, o), depth = positive(what, 'depth', o.depth), mat = classOf(what, o.material, o.sets), rule = ENGAGEMENT[mat.cls];
  const need = r3(rule.value * fx.major), turns = n1(depth / fx.pitch), enough = depth >= need - 1e-9, into = mat.name ? `${mat.name} (a${mat.cls === 'aluminium' ? 'n' : ''} ${mat.cls})` : mat.cls;
  return { thread: fx.thread, depth, need, turns, diameters: n2(depth / fx.major), class: mat.cls, material: mat.name, enough, rests: [rest(`engagement.${mat.cls}`, rule), rest(cite(fx, 'major_diameter'), fx.figures.major_diameter), rest(cite(fx, 'pitch'), fx.figures.pitch)],
    findings: [finding(enough ? 'pass' : 'warn', `${a(fx.thread)} screw ${mm(depth)} mm into ${into} engages ${mm(turns)} threads, ${mm(n2(depth / fx.major))} diameters: engagement.${mat.cls} asks ${mm(rule.value)} (${mm(need)} mm)${enough ? '' : `, so ${mm(need)} mm would do`}`,
      'engagement.depth', { values: { depth, need, turns }, refs: { thread: fx.thread, rule: `engagement.${mat.cls}`, kind: rule.kind } })] };
}

/**
 * The load that strips an internal thread, from its shear area and the strength of what it is cut or formed in,
 * against the screw's own proof load. The shear area is the handbook's for a 60° thread at its basic sizes,
 * 0.875 π d Le; the shear strength is the material's strength over √3, an estimate.
 * @param {Fixing | string} m @param {{ depth: number, material: string | object, screw?: 'steel' | 'stainless', proof?: number, load?: number, sets?: object }} o
 *   depth: the length of thread engaged; material: what the internal thread is in; screw: steel (its property class, the
 *   default) or stainless; proof: another screw's proof stress in MPa (830 for class 10.9); load: the load the joint
 *   carries along the screw, in N, to hold with twice the margin
 * @returns {{ thread: string, depth: number, material: string, area: number, shear: number, strip: number, stressArea: number, proof: number, margin: number, depthFor: number, load: number | null, rests: object[], findings: object[] }}
 *   area: the internal thread's shear area, mm²; shear: the shear strength taken, MPa; strip: the load that strips the thread, N;
 *   proof: the screw's proof load, N; margin: strip over proof (under 1: the thread goes first); depthFor: the depth at which the thread is as strong as the screw
 */
export function stripping(m, o = {}) {
  const what = 'stripping';
  options(what, o, '{ depth: 6, material: \'pla\' }');
  const fx = fixingOf(what, m, o), depth = positive(what, 'depth', o.depth), mat = materialOf(what, o.material, o.sets), screw = proofOf(what, fx, o);
  if (o.load != null) positive(what, 'load (in N)', o.load);
  const { f, note } = weakest(mat), ratio = DEFAULTS.shear_ratio, shear = ratio.value * f.value, area = 0.875 * Math.PI * fx.major * depth, strip = shear * area, margin = strip / screw.load, depthFor = depth / margin;
  const out = [finding('info', `${a(fx.thread)} screw ${mm(depth)} mm into ${mat.name} strips its thread at about ${mm(n1(strip))} N: a shear area of ${mm(n2(area))} mm² (0.875 π d Le) at ${mm(n2(shear))} MPa, ${mm(f.value)} MPa over √3${note}. The shear strength is an estimate from the tensile strength, so halve it for a load that matters, or test it`,
    'stripping.load', { values: { strip: n1(strip), area: n2(area), shear: n2(shear) }, refs: { thread: fx.thread, material: mat.name, kind: 'estimate' } })];
  out.push(finding(margin >= 1 ? 'pass' : 'info', margin >= 1 ? `the thread outlasts the screw: its ${mm(n1(strip))} N is ${mm(n2(margin))} times the screw's proof load of ${mm(n1(screw.load))} N (${screw.says}, ${mm(n2(screw.area))} mm² at ${mm(screw.stress)} MPa)`
    : `the thread strips before the screw yields: ${mm(n1(strip))} N is ${mm(n2(margin))} of the screw's proof load, ${mm(n1(screw.load))} N (${screw.says}, ${mm(n2(screw.area))} mm² at ${mm(screw.stress)} MPa). ${mm(n1(depthFor))} mm of thread would match the screw`,
  'stripping.margin', { values: { strip: n1(strip), proof: n1(screw.load), margin: n2(margin), depthFor: n1(depthFor) } }));
  if (o.load != null) { const k = strip / o.load, want = DEFAULTS.load_margin.value; out.push(finding(k >= want ? 'pass' : k >= 1 ? 'warn' : 'fail', `a load of ${mm(o.load)} N is held ${mm(n2(k))} times over by the thread, where the kit asks ${want} times${k >= want ? '' : `: ${mm(n1(depth * (want / k)))} mm of thread would do`}`, 'stripping.held', { values: { load: o.load, margin: n2(k), want } })); }
  return { thread: fx.thread, depth, material: mat.name, area: n2(area), shear: n2(shear), strip: n1(strip), stressArea: n2(screw.area), proof: n1(screw.load), margin: n2(margin), depthFor: n1(depthFor), load: o.load ?? null,
    rests: [rest(f.name, f), rest('fixings.shear_ratio', ratio), ...screw.rests], findings: out };
}

/**
 * The clamp force a tightening torque gives, or the torque for a clamp force: T = K d F, with the nut factor K an
 * estimate (0.2 unless given). Give torque or force.
 * @param {Fixing | string} m @param {{ torque?: number, force?: number, K?: number, screw?: 'steel' | 'stainless', proof?: number, sets?: object }} o
 *   torque: in N·m; force: the clamp force (preload) wanted, in N; K: another nut factor (a lubricated thread's is lower)
 * @returns {{ thread: string, torque: number, force: number, K: number, proof: number, share: number, full: { force: number, torque: number }, rests: object[], findings: object[] }}
 *   share: the force as a share of the screw's proof load; full: the force and torque of a screw tightened to three quarters of its proof load
 */
export function preload(m, o = {}) {
  const what = 'preload';
  options(what, o, '{ torque: 0.5 }');
  const fx = fixingOf(what, m, o), rule = DEFAULTS.nut_factor, K = o.K ?? rule.value;
  if ((o.torque == null) === (o.force == null)) throw new Error(`${what}: give torque (N·m), to get the clamp force, or force (N), to get the torque for it: one of the two (got ${shown({ torque: o.torque, force: o.force })})`);
  if (!(isNum(K) && K > 0)) throw new Error(`${what}: K is the nut factor, a number above 0 (0.2 for plain steel threads) (got ${shown(o.K)})`);
  const screw = proofOf(what, fx, o), d = fx.major, torque = o.torque != null ? positive(what, 'torque (in N·m)', o.torque) : (K * d * positive(what, 'force (in N)', o.force)) / 1000, force = o.force ?? (torque * 1000) / (K * d), share = force / screw.load;
  const full = DEFAULTS.preload_share.value * screw.load, out = [finding('info', `${mm(r3(torque))} N·m on ${a(fx.thread)} screw gives a clamp force of about ${mm(n1(force))} N (T = K d F, K = ${mm(K)}${o.K == null ? ', an estimate: a torque wrench scatters the force by a quarter to a third' : ', as given'})`,
    'preload.force', { values: { torque: r3(torque), force: n1(force), K }, refs: { thread: fx.thread, kind: o.K == null ? 'estimate' : 'given' } })];
  out.push(finding(share <= 0.9 + 1e-9 ? 'pass' : share <= 1 + 1e-9 ? 'warn' : 'fail', `that is ${mm(n1(share * 100))}% of the screw's proof load, ${mm(n1(screw.load))} N (${screw.says})${share > 1 ? ': the screw yields first' : share > 0.9 ? ': past the 90% a permanent joint is taken to' : ''}. A screw tightened fully, to ${mm(DEFAULTS.preload_share.value * 100)}% of proof, carries ${mm(n1(full))} N at ${mm(r3((K * d * full) / 1000))} N·m`,
    'preload.proof', { values: { share: r3(share), proof: n1(screw.load) } }));
  return { thread: fx.thread, torque: r3(torque), force: n1(force), K, proof: n1(screw.load), share: r3(share), full: { force: n1(full), torque: r3((K * d * full) / 1000) },
    rests: [...(o.K == null ? [rest('fixings.nut_factor', rule)] : []), rest('fixings.preload_share', DEFAULTS.preload_share), ...screw.rests], findings: out };
}
/**
 * The tightening torque for a clamp force: preload the other way round.
 * @param {Fixing | string} m @param {{ force: number, K?: number, screw?: 'steel' | 'stainless', proof?: number, sets?: object }} o
 * @returns {{ thread: string, torque: number, force: number, K: number, proof: number, share: number, full: { force: number, torque: number }, rests: object[], findings: object[] }}
 */
export function torqueFor(m, o = {}) {
  options('torqueFor', o, '{ force: 500 }');
  if (o.torque != null) throw new Error('torqueFor: give force (N), the clamp force wanted: for the force a torque gives, use preload');
  return preload(m, o);
}

/**
 * The pressure under a screw's head against what it sits on, and the washer that would bring it within. The head
 * bears on the ring between its own diameter and the clearance hole as drawn; the limit is the material's strength.
 * @param {Fixing | string} m @param {{ head?: string, material: string | object, force?: number, torque?: number, K?: number, hole?: string, printer?: object, screw?: 'steel' | 'stainless', proof?: number, sets?: object }} o
 *   head: cap, button, hex, countersunk or pan (default the model's, else cap); material: what the head sits on;
 *   force: the clamp force in N, or torque: the tightening torque in N·m (default a screw tightened fully, to three
 *   quarters of its proof load); hole: clearance (the default), close or loose
 * @returns {{ thread: string, head: string, material: string, force: number, area: number, pressure: number, limit: number, within: boolean,
 *   washer: { diameter: number, area: number, pressure: number, within: boolean } | null, most: { force: number, torque: number, washerForce: number | null, washerTorque: number | null }, rests: object[], findings: object[] }}
 *   area: the bearing ring under the head, mm²; pressure and limit in MPa; washer: the same under the thread's plain washer;
 *   most: the greatest clamp force the seat takes and the torque for it, bare and on the washer
 */
export function seating(m, o = {}) {
  const what = 'seating';
  options(what, o, '{ head: \'cap\', material: \'pla\' }');
  const fx = fixingOf(what, m, o), form = o.head ?? fx.head?.form ?? (fx.made.heads.includes('cap') ? 'cap' : fx.made.heads[0]);
  if (form === 'set') throw new Error(`${what}: a set screw has no head to bear on anything: it presses with its point`);
  const head = headOf(what, fx, form), mat = materialOf(what, o.material, o.sets), kind = oneOf(what, 'hole', o.hole ?? 'clearance', ['clearance', 'close', 'loose']), h = holeModel(fx, { kind, printer: o.printer });
  if (o.force != null && o.torque != null) throw new Error(`${what}: give force (N) or torque (N·m), not both`);
  const K = o.K ?? DEFAULTS.nut_factor.value, screw = proofOf(what, fx, o), given = o.force != null || o.torque != null;
  if (!(isNum(K) && K > 0)) throw new Error(`${what}: K is the nut factor, a number above 0 (got ${shown(o.K)})`);
  const force = o.force != null ? positive(what, 'force (in N)', o.force) : o.torque != null ? (positive(what, 'torque (in N·m)', o.torque) * 1000) / (K * fx.major) : DEFAULTS.preload_share.value * screw.load;
  const across = head.flats ?? head.diameter, ring = (D) => (Math.PI / 4) * (D * D - h.diameter ** 2), area = ring(across), { f } = weakest(mat), limit = f.value, pressure = force / area, within = pressure <= limit + 1e-9;
  if (!(area > 0)) throw new Error(`${what}: ${a(fx.thread)} ${form} head ${mm(across)} mm across has no seat round a ${mm(h.diameter)} mm hole`);
  const torqueOf = (F) => r3((K * fx.major * F) / 1000), w = fx.made.washer ? { diameter: figure(what, fx, 'washer_diameter') } : null;
  if (w) { w.area = n2(ring(w.diameter)); w.pressure = n1(force / ring(w.diameter)); w.within = force / ring(w.diameter) <= limit + 1e-9; }
  const most = { force: n1(limit * area), torque: torqueOf(limit * area), washerForce: w ? n1(limit * ring(w.diameter)) : null, washerTorque: w ? torqueOf(limit * ring(w.diameter)) : null };
  const load = given ? `${mm(n1(force))} N` : `${mm(n1(force))} N, a screw tightened fully (${mm(DEFAULTS.preload_share.value * 100)}% of its proof load)`;
  const text = `${a(fx.thread)} ${form} head, ${mm(across)} mm across${head.flats ? ' its flats' : ''} on a ${mm(h.diameter)} mm hole, bears on ${mm(n2(area))} mm²: at ${load}, ${mm(n1(pressure))} MPa on ${mat.name}, whose strength is ${mm(limit)} MPa (${f.name}, taken as what it bears: an estimate)`;
  const out = [within ? finding('pass', `${text}: within`, 'seating.pressure', { values: { pressure: n1(pressure), limit, force: n1(force), area: n2(area) } })
    : w?.within ? finding('warn', `${text}: too much for the bare seat. The ${fx.thread} washer, ${mm(w.diameter)} mm across, brings it to ${mm(w.pressure)} MPa, within`, 'seating.pressure', { values: { pressure: n1(pressure), limit, force: n1(force), area: n2(area), washer: w.pressure } })
      : finding('fail', `${text}: too much${w ? `, and the ${fx.thread} washer, ${mm(w.diameter)} mm across, only brings it to ${mm(w.pressure)} MPa` : ', and the thread has no washer in its rule set'}. The seat takes ${mm(most.force)} N bare (${mm(most.torque)} N·m)${w ? ` and ${mm(most.washerForce)} N on the washer (${mm(most.washerTorque)} N·m)` : ''}: tighten to that, or spread the load wider`,
      'seating.pressure', { values: { pressure: n1(pressure), limit, force: n1(force), area: n2(area), ...(w ? { washer: w.pressure } : {}) } })];
  return { thread: fx.thread, head: form, material: mat.name, force: n1(force), area: n2(area), pressure: n1(pressure), limit, within, washer: w, most,
    rests: [...head.figures.map((k) => rest(cite(fx, k), fx.figures[k])), ...h.rests, rest(f.name, f), ...(w ? [rest(cite(fx, 'washer_diameter'), fx.figures.washer_diameter)] : []), ...(given ? [] : [rest('fixings.preload_share', DEFAULTS.preload_share), ...screw.rests]), ...(o.torque != null && o.K == null ? [rest('fixings.nut_factor', DEFAULTS.nut_factor)] : [])], findings: out };
}

/** What a screw can end in, for lengthFor. */
export const ENDS = ['pilot', 'tap', 'thread', 'insert', 'nut'];
// The far end of a joint: how much thread the screw must engage there, and how much room it has before it bottoms out
function endOf(what, fx, into, o) {
  const e = typeof into === 'string' ? { kind: into } : into;
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`${what}: into is what the screw ends in: ${ENDS.map((k) => `'${k}'`).join(', ')}, or { kind, depth, material } (got ${shown(into)})`);
  const kind = oneOf(what, 'into', e.kind, ENDS), through = e.through ?? false, rests = [];
  if (typeof through !== 'boolean') throw new Error(`${what}: into.through is true or false (got ${shown(e.through)})`);
  if (e.depth != null) positive(what, 'into.depth', e.depth); if (e.room != null) positive(what, 'into.room', e.room);
  const use = (m, n) => { rests.push(rest(cite(m, n), m.figures[n])); return figure(what, m, n); };
  if (kind === 'insert') {
    const ins = fixingModel(`${fx.thread} ${e.length != null ? `x ${positive(what, 'into.length', e.length)} mm ` : ''}insert`, {}, { sets: o.sets }), long = use(ins, 'insert_length'), rule = DEFAULTS.insert_engagement;
    rests.push(rest('fixings.insert_engagement', rule));
    return { kind, says: `${a(fx.thread)} insert ${mm(long)} mm long`, need: r3(Math.min(rule.value * fx.major, long)), room: through ? Infinity : e.room ?? long, tip: 0, ends: 'bottom out', why: `the insert's ${mm(long)} mm: the hole's extra millimetre under it is left for the plastic the insert pushes ahead`, rests };
  }
  if (kind === 'nut') {
    const nut = nutOf(what, fx, e.nut ?? 'hex'); rests.push(...nut.figures.map((n) => rest(cite(fx, n), fx.figures[n])));
    return { kind, says: `${a(fx.thread)} ${nut.kind === 'hex' ? '' : `${nut.kind} `}nut ${mm(nut.height)} mm high`, need: nut.height, room: e.room ?? Infinity, tip: 0, ends: 'stand proud', why: 'the room given past the nut\'s seat', rests };
  }
  const tip = through ? 0 : DEFAULTS.tip_room.value; let need;
  if (kind === 'pilot' && fx.figures.pilot_depth) need = use(fx, 'pilot_depth');
  else { const cls = kind === 'pilot' ? 'plastic' : classOf(what, e.material ?? 'plastic', o.sets).cls; rests.push(rest(`engagement.${cls}`, ENGAGEMENT[cls])); need = r3(ENGAGEMENT[cls].value * fx.major); }
  if (!through) rests.push(rest('fixings.tip_room', DEFAULTS.tip_room));
  const says = kind === 'pilot' ? 'a pilot it forms its own thread in' : kind === 'tap' ? 'a tapped hole' : 'a printed thread';
  return { kind, says: `${says}${e.depth != null ? ` ${mm(e.depth)} mm deep` : ''}`, need, room: through ? Infinity : e.depth ?? Infinity, tip, ends: 'bottom out', why: `the hole's ${mm(e.depth ?? 0)} mm less ${mm(tip)} mm at its tip`, rests };
}

/**
 * The sold length of screw that passes through a stack of parts and engages enough at the far end, without bottoming
 * out or standing proud: the shortest that does. Refused by name where no sold length fits, with the nearest.
 * @param {number | number[]} stack the thicknesses the screw passes through under its head, in order, in mm (a countersunk
 *   screw's length includes its head, so its stack does too)
 * @param {Fixing | string} m a thread or a screw ('M3', 'M3 button'): its head form is the model's, else cap
 * @param {{ into: string | { kind: string, depth?: number, room?: number, through?: boolean, material?: string, nut?: string, length?: number }, head?: string, washer?: boolean, sunk?: number, sets?: object }} o
 *   into: what the screw ends in: 'pilot', 'tap', 'thread' (a printed one), 'insert' or 'nut', or the same with its
 *   depth (a blind hole's), room (how far the screw may go past where its thread starts), through (it may come out
 *   the far side), material (a tapped or printed thread's), nut (hex, square, lock) or length (another insert's);
 *   washer: a plain washer under the head; sunk: how far the head's seat lies under the first face (a counterbore's depth)
 * @returns {{ name: string, thread: string, head: string, length: number, grip: number, engaged: number, need: number, room: number | null, spare: number | null, depth: number | null, into: string,
 *   lengths: { length: number, name: string, engaged: number, fits: 'short' | 'fits' | 'long' }[], rests: object[], findings: object[] }}
 *   grip: what the screw passes before its thread engages; engaged: thread in the far end; room: how far it may go (null: no limit);
 *   spare: room left past its tip; depth: for a blind hole not given a depth, the depth to draw; lengths: every sold length with its verdict
 */
export function lengthFor(stack, m, o = {}) {
  const what = 'lengthFor';
  options(what, o, '{ into: \'insert\' }');
  const parts = Array.isArray(stack) ? stack : [stack];
  if (!parts.length || !parts.every((t) => isNum(t) && t > 0)) throw new Error(`${what}: the stack is the thicknesses the screw passes through, each above 0 mm: 6 or [3, 6] (got ${shown(stack)})`);
  const fx = fixingOf(what, m, { ...o, anyLength: true });
  if (!['thread', 'screw'].includes(fx.item)) throw new Error(`${what}: ${fx.name} is ${a(fx.item)}, not a screw: give the thread or the screw ('${fx.thread}', '${fx.thread} button')`);
  const form = o.head ?? fx.head?.form ?? (fx.made.heads.includes('cap') ? 'cap' : fx.made.heads[0]);
  if (form === 'set') throw new Error(`${what}: a set screw clamps nothing between a head and a thread: its length is the hole's`);
  headOf(what, fx, form);
  if (o.into == null) throw new Error(`${what}: give into, what the screw ends in: ${ENDS.map((k) => `'${k}'`).join(', ')}, or { kind, depth, material }`);
  const end = endOf(what, fx, o.into, o), rests = [...end.rests];
  if (o.sunk != null && !(isNum(o.sunk) && o.sunk >= 0)) throw new Error(`${what}: sunk is how far the head's seat lies under the first face, 0 mm or more (got ${shown(o.sunk)})`);
  if (o.washer != null && typeof o.washer !== 'boolean') throw new Error(`${what}: washer is true or false (got ${shown(o.washer)})`);
  let washer = 0; if (o.washer) { if (!fx.made.washer) throw new Error(`${what}: ${fx.thread} has no washer in its rule set (${fx.set})`); washer = figure(what, fx, 'washer_thickness'); rests.push(rest(cite(fx, 'washer_thickness'), fx.figures.washer_thickness)); }
  const total = parts.reduce((s, t) => s + t, 0), grip = r3(total + washer - (o.sunk ?? 0));
  if (!(grip > 0)) throw new Error(`${what}: a seat sunk ${mm(o.sunk)} mm is deeper than the ${mm(total)} mm stack it is in: nothing is left under the head`);
  const sold = fx.figures.lengths?.value;
  if (!Array.isArray(sold) || !sold.every(isNum)) throw new Error(`${what}: ${fx.thread} lists no lengths in its rule set (${fx.set}), so none can be chosen: the length wanted is between ${mm(r3(grip + end.need))} mm${Number.isFinite(end.room) ? ` and ${mm(r3(grip + end.room - end.tip))} mm` : ' and as long as you like'}`);
  rests.push(rest(cite(fx, 'lengths'), fx.figures.lengths));
  const most = end.room - end.tip, verdict = (L) => (L - grip < end.need - 1e-9 ? 'short' : L - grip > most + 1e-9 ? 'long' : 'fits'), name = (L) => screwName(fx, L, form);
  const lengths = sold.map((L) => ({ length: L, name: name(L), engaged: r3(Math.max(L - grip, 0)), fits: verdict(L) })), pick = lengths.find((l) => l.fits === 'fits'), below = lengths.filter((l) => l.fits === 'short').at(-1), above = lengths.find((l) => l.fits === 'long');
  if (most < end.need - 1e-9) throw new Error(`${what}: ${end.says} leaves ${mm(r3(most))} mm of room for the screw (${end.why}) where ${mm(end.need)} mm of thread is asked: no length can do both. Deepen the far end to ${mm(r3(end.need + end.tip))} mm or more`);
  const short = (l) => (l.length <= grip ? `${l.name} does not reach through the ${mm(grip)} mm stack` : `${l.name} would engage ${mm(l.engaged)} mm where ${mm(end.need)} mm is asked`), long = (l) => `${l.name} would ${end.ends}: ${mm(l.engaged)} mm into ${mm(r3(most))} mm of room (${end.why})`;
  const job = `${mm(grip)} mm of stack into ${end.says}`;
  if (!pick) {
    const miss = (l) => r3(l === below ? grip + end.need - l.length : l.length - grip - most), nearest = !below ? above : !above ? below : miss(below) <= miss(above) ? below : above;
    throw new Error(`${what}: no ${fx.thread} ${form} screw that is sold fits ${job}: ${[below && short(below), above && long(above)].filter(Boolean).join(', and ')}. The nearest is ${nearest.name}: change the stack or the far end by ${mm(miss(nearest))} mm, or use a length of ${mm(r3(grip + end.need))} mm${Number.isFinite(most) ? ` to ${mm(r3(grip + most))} mm` : ' or more'} from another list (fixingModel's { anyLength: true })`);
  }
  const out = [finding('pass', `${pick.name} fits ${job}: it engages ${mm(pick.engaged)} mm where ${mm(end.need)} mm is asked${Number.isFinite(most) ? `, with ${mm(r3(most - pick.engaged))} mm to spare before it would ${end.ends}` : ''}`, 'lengthFor.chosen', { values: { length: pick.length, grip, engaged: pick.engaged, need: end.need }, refs: { thread: fx.thread, screw: pick.name, into: end.kind } })];
  if (above) out.push(finding('info', long(above), 'lengthFor.longer', { values: { length: above.length, engaged: above.engaged, room: r3(most) } }));
  if (below) out.push(finding('info', short(below), 'lengthFor.shorter', { values: { length: below.length, engaged: below.engaged, need: end.need } }));
  const blind = ['pilot', 'tap', 'thread'].includes(end.kind) && !Number.isFinite(end.room) && !(typeof o.into === 'object' && o.into.through), depth = blind ? r3(pick.engaged + DEFAULTS.tip_room.value) : null;
  if (blind) out.push(finding('info', `draw its blind hole ${mm(depth)} mm deep or more: the ${mm(pick.engaged)} mm the screw goes in and ${mm(DEFAULTS.tip_room.value)} mm at its tip`, 'lengthFor.depth', { values: { depth } }));
  return { name: pick.name, thread: fx.thread, head: form, length: pick.length, grip, engaged: pick.engaged, need: end.need, room: Number.isFinite(most) ? r3(most) : null, spare: Number.isFinite(most) ? r3(most - pick.engaged) : null, depth, into: end.kind, lengths, rests, findings: out };
}
