// Holes by purpose: a design says what a hole is for (a screw passes through it, a screw forms its thread in it, it
// is tapped, an insert melts into it) and the thread's rules and the printer's size it. holeModel gives the numbers
// with what they rest on; hole gives the solid to subtract, which starts at a point on a face (at) and goes into the
// part along a direction (into), as the features of @rulecad/shapes do.
import { teardropHole } from '@rulecad/shapes';
import { fixingOf, printerOf, figure, cite, rest, finding, positive, oneOf, isNum, shown, mm, r3, a, ENGAGEMENT, engagementOf } from './model.mjs';
import { along, bore, DIRECTIONS } from './draw.mjs';

/**
 * @typedef {import('./model.mjs').Fixing} Fixing a fixing's model, as fixingModel gives it
 */

// What each kind of hole is drawn to. printed: the figure is the size the hole must come out, so the printer's hole
// compensation is added once across the diameter; where it is false the rule's own text says the figure is as drawn
// (already sized for printing), and nothing is added. blind: the hole ends in the part unless told it goes through.
const HOLES = {
  clearance: { figure: 'clearance', printed: true, blind: false, says: 'clearance hole' },
  close: { figure: 'clearance_close', printed: true, blind: false, says: 'close clearance hole' },
  loose: { figure: 'clearance_loose', printed: true, blind: false, says: 'loose clearance hole' },
  tap: { figure: 'tap_drill', printed: true, blind: true, says: 'hole to tap' },
  pilot: { figure: 'pilot', printed: false, blind: true, says: 'pilot' },
  insert: { figure: 'insert_hole', printed: false, blind: true, says: 'insert hole' }
};
/** The kinds of hole: what each is for. `thread` is kept for threads modelled to print, and is refused until they arrive. */
export const HOLE_KINDS = [...Object.keys(HOLES), 'thread'];

/**
 * Which way a cutter goes, from `into` (a direction) or `axis` (a hole standing up, z, or lying along x or y).
 * @param {string} what @param {{ into?: string, axis?: string }} o @param {string} [fallback]
 * @returns {{ into: string, axis: 'x' | 'y' | 'z', across: boolean }} across: it lies on its side
 */
export function directionOf(what, { into, axis } = {}, fallback = '-z') {
  if (into != null) oneOf(what, 'into', into, DIRECTIONS);
  if (axis != null) oneOf(what, 'axis', axis, ['x', 'y', 'z']);
  if (into != null && axis != null && into[1] !== axis) throw new Error(`${what}: into ${into} runs along ${into[1]} and axis says ${axis}: give one, or make them agree`);
  const dir = into ?? (axis == null ? fallback : axis === 'z' ? '-z' : `+${axis}`);
  return { into: dir, axis: /** @type {'x' | 'y' | 'z'} */ (dir[1]), across: dir[1] !== 'z' };
}
/** A point [x, y, z] in mm, refused by name where it is not one. */
export function pointOf(what, at = [0, 0, 0]) {
  if (!Array.isArray(at) || at.length !== 3 || !at.every(isNum)) throw new Error(`${what}: at is a point on the part's face, [x, y, z] in mm (got ${shown(at)})`);
  return at;
}
/** The options object every function here takes, refused where it is not one. */
export function optionsOf(what, o, example) {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the second argument is its options (${example}), not ${shown(o)}`);
  return o;
}
const HOW = { '-z': 'going down from a top face', '+z': 'going up from the bed', '+x': 'lying along x', '-x': 'lying along x', '+y': 'lying along y', '-y': 'lying along y' };
/** How a direction is said in a finding. */
export const said = (into) => HOW[into];

/**
 * @typedef {{ thread: string, kind: string, diameter: number, nominal: number, comp: number, depth: number | null, through: boolean, into: string,
 *   axis: 'x' | 'y' | 'z', teardrop: boolean, lead: number, point: number, basis: { rule: string, kind: string, source: string },
 *   rests: object[], findings: object[] }} Hole
 *   diameter: as drawn; nominal: the rule's figure; comp: the hole compensation added across it (0 where the figure is as drawn);
 *   depth: null for a clearance hole not told the thickness it passes; teardrop: it lies on its side and gets a 45° roof;
 *   lead: the lead-in chamfer at its mouth; point: the height of the 45° point a blind hole going up from the bed ends in;
 *   basis: the rule the diameter rests on, and how far to trust it; rests: every figure used
 */

/**
 * A hole for a fixing, as numbers, sized by what it is for.
 * @param {Fixing | string} m a fixing's model, or its name ('M3')
 * @param {{ kind?: string, depth?: number, through?: boolean, printer?: object, material?: string, axis?: 'x' | 'y' | 'z', into?: string, lead?: number, sets?: object }} [o]
 *   kind: clearance (the normal hole a screw passes through, the default), close, loose, pilot (the screw forms its own
 *   thread in the plastic), tap (the tap drill), insert (a heat-set insert), or thread (refused for now);
 *   depth: how deep, or the thickness passed through; through: out of the far face (the default for the clearances);
 *   printer: the printer's rule set, or its values (default the kit's X1C); material: the plastic, for a pilot ('PLA',
 *   'PETG'), or what a tapped hole is in ('aluminium'); axis: z for a hole standing up, x or y for one on its side
 *   (or into, a direction: '+x', '-z'); lead: the lead-in chamfer; sets: the workspace's rule sets, where m is a name
 * @returns {Hole}
 */
export function holeModel(m, o = {}) {
  const what = 'hole';
  optionsOf(what, o, '{ kind: \'pilot\', depth: 8 }');
  const fx = fixingOf(what, m, o), kind = oneOf(what, 'kind', o.kind ?? 'clearance', HOLE_KINDS);
  if (kind === 'thread') throw new Error(`${what}: kind "thread" is a thread modelled to print, which arrives with this package's printed threads (thread, threadModel). Until then: 'pilot' (the screw forms its own thread), 'tap' (the tap drill) or 'insert'`);
  const spec = HOLES[kind], pr = printerOf(what, o.printer), dir = directionOf(what, o), out = [], rests = [];
  // The figure the diameter rests on: for a pilot, the printer's measured rule for this thread (and plastic) before the thread's starting figure
  let basis = null;
  const plastic = o.material == null ? null : String(o.material).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (kind === 'pilot') basis = [plastic && `pilot_${fx.set}_${plastic}`, `pilot_${fx.set}`].filter(Boolean).map((k) => pr.figure(k)).find(Boolean) ?? null;
  const own = !!basis;
  if (!basis) {
    if (!fx.figures[spec.figure]) throw new Error(`${what}: ${fx.thread} has no ${spec.figure} in its rule set (${fx.set}), so no ${kind} hole: it has figures for ${Object.keys(HOLES).filter((k) => fx.figures[HOLES[k].figure]).join(', ') || 'none'}`);
    basis = { ...fx.figures[spec.figure], name: cite(fx, spec.figure) };
  }
  if (!(isNum(basis.value) && basis.value > 0)) throw new Error(`${what}: ${basis.name} is a diameter above 0 mm (got ${shown(basis.value)})`);
  const nominal = basis.value, comp = spec.printed ? pr.n('hole_comp') : 0, diameter = r3(nominal + comp);
  rests.push(rest(basis.name, basis));
  if (comp) rests.push(pr.rest('hole_comp'));
  const trust = { measured: 'a measured rule', spec: 'a standard\'s figure', community: 'a community figure', estimate: 'an estimate', given: 'a figure given by hand', default: 'a default', derived: 'a derived figure' }[basis.kind] ?? `a ${basis.kind} figure`;
  let text = `${a(fx.thread)} ${spec.says} drawn ${mm(diameter)} mm: it rests on ${basis.name} (${mm(nominal)} mm), ${trust}`;
  text += spec.printed ? `, plus ${pr.cite('hole_comp')} ${mm(comp)} mm across, since a printed hole comes out small` : ', as drawn (the figure is already sized for printing, so no hole compensation is added)';
  if (kind === 'pilot' && !own) text += `. That is the thread's starting figure: ${pr.name} has no measured pilot_${fx.set}, so measure it on this printer`;
  out.push(finding('info', text, 'hole.drawn', { values: { diameter, nominal, comp }, refs: { thread: fx.thread, set: fx.set, rule: basis.name, kind: basis.kind } }));
  if (comp && pr.rest('hole_comp').borrowed) out.push(finding('info', `${pr.name} has no hole_comp: the X1C's ${mm(comp)} mm is used`, 'hole.printer', { values: { comp } }));
  // a figure that names one plastic, asked for another
  if (kind === 'pilot' && plastic && typeof basis.rule === 'string' && !new RegExp(`\\b${plastic}\\b`, 'i').test(basis.rule) && !basis.name.endsWith(`_${plastic}`)) out.push(finding('warn', `${basis.name} does not name ${o.material}: the pilot was sized in another plastic, so try it before trusting it`, 'hole.material', { refs: { rule: basis.name, material: o.material } }));

  const through = o.through ?? !spec.blind;
  if (typeof through !== 'boolean') throw new Error(`${what}: through is true or false (got ${shown(o.through)})`);
  let depth = o.depth ?? null, need = null;
  const depthFrom = (n) => { rests.push(rest(cite(fx, n), fx.figures[n])); return figure(what, fx, n); };
  if (kind === 'insert') need = depthFrom(through ? 'insert_length' : 'insert_depth');
  else if (kind === 'pilot' && fx.figures.pilot_depth) need = depthFrom('pilot_depth');
  else if (kind === 'pilot' || kind === 'tap') { const e = engagementOf(kind === 'pilot' ? 'plastic' : o.material); rests.push(rest(`engagement.${e}`, ENGAGEMENT[e])); need = r3(ENGAGEMENT[e].value * fx.major); }
  if (depth != null) positive(what, 'depth', depth); else depth = need;
  if (need != null && depth < need - 1e-9) out.push(finding('warn', `${a(fx.thread)} ${spec.says} ${mm(depth)} mm deep is short: ${rests.at(-1).name} asks ${mm(need)} mm${kind === 'insert' && !through ? ' of blind hole' : ' of thread'}`, 'hole.depth', { values: { depth, need } }));

  if (o.lead != null && !(isNum(o.lead) && o.lead >= 0)) throw new Error(`${what}: lead is the lead-in chamfer, 0 mm or more (got ${shown(o.lead)})`);
  if (o.lead > 0 && dir.across) throw new Error(`${what}: a lead-in on a hole lying on its side would overhang at its top: leave lead out (into ${dir.into})`);
  let lead = o.lead ?? (spec.blind && !dir.across ? pr.n('chamfer') : 0);
  if (lead && depth != null) lead = Math.min(lead, depth / 2);
  const point = !through && dir.into === '+z' ? r3(diameter / 2) : 0;
  out.push(finding('pass', dir.across ? `${said(dir.into)}, the hole is a teardrop: a 45° roof, so it prints with no support`
    : point ? `${said(dir.into)}, the hole ends in a 45° point ${mm(point)} mm high, so its end needs no bridge` : `${said(dir.into)}, a round hole prints as drawn`, 'hole.printable', { values: { into: dir.into } }));
  if (kind === 'pilot' && dir.across) out.push(finding('warn', `a pilot lying on its side has a teardrop's roof, and ${basis.name} is for a hole standing upright: the screw has less to bite, so try it`, 'hole.side'));
  return { thread: fx.thread, kind, diameter, nominal, comp, depth, through, into: dir.into, axis: dir.axis, teardrop: dir.across, lead: r3(lead), point,
    basis: { rule: basis.name, kind: basis.kind, source: basis.source }, rests, findings: out };
}

/**
 * A hole for a fixing, to subtract: round standing up, a teardrop lying on its side (through @rulecad/shapes'
 * teardropHole), with its lead-in where it has one, and a 45° point where it ends going up from the bed.
 * @param {Fixing | string} m
 * @param {{ kind?: string, depth?: number, through?: boolean, printer?: object, material?: string, axis?: 'x' | 'y' | 'z', into?: string, lead?: number, sets?: object, at?: number[] }} [o]
 *   as holeModel, and at: the point on the face where the hole starts. A clearance hole needs depth: the thickness it passes
 * @returns {object} a JSCAD geom3 to subtract, with .model holding holeModel's numbers
 */
export function hole(m, o = {}) {
  const h = holeModel(m, o), at = pointOf('hole', o.at);
  if (h.depth == null) throw new Error(`hole: ${a(h.thread)} ${h.kind} hole needs depth, the thickness it passes through, in mm`);
  if (h.teardrop) return Object.assign(teardropHole({ d: h.diameter, length: h.depth, at, into: h.into, through: h.through }), { model: h });
  const r = h.diameter / 2, steps = [...(h.lead ? [[r + h.lead, 0], [r, h.lead]] : []), [r, h.depth], ...(h.point ? [[0, h.depth + h.point]] : [])];
  return Object.assign(along(bore(steps, { through: h.through }), h.into, at), { model: h });
}
