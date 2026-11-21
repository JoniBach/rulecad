// Magnets: a disc or block neodymium magnet pressed or glued into a printed pocket, the seat that holds two parts
// together with no screw (a lid, a door's catch, a tool on a board). A magnet is a model by name (magnetModel: 'disc
// magnet 8x3', 'disc magnet 10x3 N52', 'block magnet 10x5x2'): its pull straight off steel from its seller's figure,
// scaled to its grade and across a gap, and its mass. Its pocket (magnetSeatModel) takes its fit from the printer's
// rules: a press, a glued fit with room for the glue, or crush ribs that take up the magnet's tolerance. The floor under
// the pocket is held to what prints, and the pull that tries to take the magnet out of its pocket is held to what the
// fit grips with. magnetSeat is the pocket to subtract, magnet the magnet's solid. Units: mm, N, MPa, grams.
import jscad from '@jscad/modeling';
import { crushRibs } from '@rulecad/shapes';
import magnetSet from '@rulecad/rules/magnets.json' with { type: 'json' };
import { DEFAULTS, printerOf, rest, finding, positive, oneOf, isNum, shown, mm, r3 } from './model.mjs';
import { along, bore, teardrop, UP, OUT } from './draw.mjs';
import { directionOf, pointOf, optionsOf, said } from './holes.mjs';
import { materialOf } from './strength.mjs';

const { cuboid, cylinder } = jscad.primitives, { union, subtract } = jscad.booleans, { translate } = jscad.transforms;
const MAGNETS = magnetSet.rules;
const n1 = (x) => +x.toFixed(1), n2 = (x) => +x.toFixed(2);
const mrest = (k) => rest(`magnets.${k}`, MAGNETS[k]);

/** The grades of NdFeB magnet there is a remanence for, weakest first. */
export const MAGNET_GRADES = Object.keys(MAGNETS).filter((k) => k.startsWith('remanence_')).map((k) => k.slice('remanence_'.length));
/** The fits a magnet takes in its pocket: press (it grips), glue (room for a film of glue), ribs (crush ribs grip it). */
export const MAGNET_FITS = ['press', 'glue', 'ribs'];
/** The sizes there is a seller's pull for: discs as diameter x thickness, blocks as length x width x thickness. */
export const MAGNET_SIZES = Object.freeze({
  disc: Object.keys(MAGNETS).filter((k) => /^disc_.*_pull$/.test(k)).map((k) => k.slice(5, -5)),
  block: Object.keys(MAGNETS).filter((k) => /^block_.*_pull$/.test(k)).map((k) => k.slice(6, -5))
});
/**
 * The grammar a magnet's name is read by. parseMagnet reads it and nothing else does.
 * @type {string}
 */
export const MAGNET_GRAMMAR = [
  'magnet = shape size [ grade ]                       disc magnet 8x3, disc magnet 10x3 N52, block magnet 10x5x2',
  'shape  = "disc magnet" | "block magnet" | "magnet"  (a magnet alone is a disc; "magnets" is read too)',
  'size   = diameter "x" thickness                     a disc, in mm, magnetised through its thickness',
  '       | length "x" width "x" thickness             a block, in mm, magnetised through its thickness',
  'grade  = "N35" | "N38" | "N40" | "N42" | "N45" | "N48" | "N50" | "N52"   (default magnets.grade, N35)'
].join('\n');

/**
 * A magnet's name read by the grammar.
 * @param {string} name 'disc magnet 8x3', 'magnet 6x2 N52', 'block magnet 10x5x2 N45'
 * @returns {{ shape: 'disc' | 'block', diameter: number | null, length: number | null, width: number | null, thickness: number, grade: string | null }}
 */
export function parseMagnet(name) {
  const what = 'magnet name', help = 'A magnet is its shape, its size in mm and its grade where it has one: \'disc magnet 8x3\', \'disc magnet 10x3 N52\', \'block magnet 10x5x2\'';
  if (typeof name !== 'string' || !name.trim()) throw new Error(`${what}: give a name, not ${shown(name)}. ${help}`);
  const t = /^\s*(disc\s+magnets?|block\s+magnets?|magnets?)\s+(\d*\.?\d+)\s*[x×*]\s*(\d*\.?\d+)(?:\s*[x×*]\s*(\d*\.?\d+))?\s*(?:mm\b)?\s*(.*)$/i.exec(name);
  if (!t) throw new Error(`${what}: "${name}" is no magnet. ${help}`);
  const block = /^block/i.test(t[1]), sizes = [t[2], t[3], t[4]].filter((x) => x != null).map(Number);
  if (block !== (sizes.length === 3)) throw new Error(`${what}: "${name}": ${block ? 'a block magnet is length x width x thickness (block magnet 10x5x2)' : 'a disc magnet is diameter x thickness (disc magnet 8x3); a block is named "block magnet 10x5x2"'}`);
  if (!sizes.every((x) => x > 0)) throw new Error(`${what}: "${name}": a magnet's sizes are above 0 mm`);
  const words = t[5].trim().split(/[\s,]+/).filter(Boolean), grade = words.length === 1 && /^n\d\d$/i.test(words[0]) ? words[0].toUpperCase() : null;
  if (words.length && !grade) throw new Error(`${what}: "${name}": nothing is called "${words.join(' ')}". After the size comes only a grade: ${MAGNET_GRADES.join(', ')}`);
  if (grade && !MAGNET_GRADES.includes(grade)) throw new Error(`${what}: "${name}": no grade ${grade}. There are: ${MAGNET_GRADES.join(', ')}`);
  return block ? { shape: 'block', diameter: null, length: sizes[0], width: sizes[1], thickness: sizes[2], grade } : { shape: 'disc', diameter: sizes[0], length: null, width: null, thickness: sizes[1], grade };
}
/** Whether a text is a magnet's name, by the grammar. @param {unknown} name @returns {boolean} */
export const isMagnetName = (name) => { try { parseMagnet(/** @type {string} */ (name)); return true; } catch { return false; } };
const sizeOf = (p) => (p.shape === 'disc' ? `${mm(p.diameter)}x${mm(p.thickness)}` : `${mm(p.length)}x${mm(p.width)}x${mm(p.thickness)}`);
const magnetName = (p, grade) => `${p.shape} magnet ${sizeOf(p)} ${grade}`;
const middle = (g) => { const [lo, hi] = MAGNETS[`remanence_${g}`].value; return (lo + hi) / 2; };

/**
 * The flux density on a magnet's axis at a distance from its face, over the density at its face: the formulas of
 * magnets.field_formula. A pull across a gap is taken as the pull touching times this squared, an estimate.
 * @param {{ shape: 'disc' | 'block', diameter?: number | null, length?: number | null, width?: number | null, thickness: number }} p @param {number} z mm
 * @returns {number} B(z) / B(0)
 */
export function fieldShare(p, z) {
  const D = p.thickness;
  if (p.shape === 'disc') { const R = p.diameter / 2, B = (x) => (D + x) / Math.hypot(R, D + x) - (x > 0 ? x / Math.hypot(R, x) : 0); return B(z) / B(0); }
  const L = p.length, W = p.width, B = (x) => (x > 0 ? Math.atan((L * W) / (2 * x * Math.sqrt(4 * x * x + L * L + W * W))) : Math.PI / 2) - Math.atan((L * W) / (2 * (D + x) * Math.sqrt(4 * (D + x) ** 2 + L * L + W * W)));
  return B(z) / B(0);
}

/**
 * @typedef {{ kind: 'magnet', shape: 'disc' | 'block', name: string, said: string, diameter: number | null, length: number | null, width: number | null, thickness: number,
 *   grade: string, made: 'bought', touching: number, gap: number, pull: number, count: number, total: number, load: number | null, margin: number | null,
 *   grams: number, volume: number, rests: object[], findings: object[] }} Magnet
 *   touching: its pull straight off thick steel it touches, N; gap: what lies between it and the steel, mm; pull: across that gap, N;
 *   count: how many share the load; total: their pull together; load and margin: the pull asked of them all, and total over it
 */

/**
 * A magnet as a model by name: its pull straight off steel, from its seller's figure (magnets.<size>_pull) scaled to
 * its grade by the square of the remanence, then across a gap by the square of the field on its axis; its mass.
 * Refused by name where its size has no seller's figure, unless the pull is given.
 * @param {string | Magnet} p a magnet's name (see MAGNET_GRAMMAR) or its model (given back as it is, or with options
 *   built again from its name, its own grade, gap, count, load and given pull where the options say none)
 * @param {{ grade?: string, gap?: number, count?: number, load?: number, pull?: number }} [o]
 *   grade: in place of the name's; gap: plastic, paint or air between it and the steel, mm (default 0); count: magnets
 *   sharing the load (default 1); load: the pull asked of them, N, held to fixings.load_margin; pull: a magnet's own
 *   pull touching steel, N, from its maker, for a size the kit holds no figure for
 * @returns {Magnet}
 */
export function magnetModel(p, o = {}) {
  const what = 'magnetModel';
  optionsOf(what, o, '{ count: 2, load: 10 }');
  if (p && typeof p === 'object' && p.kind === 'magnet') { // a model: as it is, or built again from its name with the options given, its own figures where they say none
    if (Object.values(o).every((x) => x === undefined)) return p;
    const given = p.findings?.find((f) => f.code === 'magnet.pull')?.refs?.kind === 'given';
    return magnetModel(p.name, { grade: o.grade ?? p.grade, gap: o.gap ?? p.gap, count: o.count ?? p.count, load: o.load ?? p.load ?? undefined, pull: o.pull ?? (given ? p.touching : undefined) });
  }
  const n = parseMagnet(p), rests = [], out = [], size = sizeOf(n), key = `${n.shape}_${size}`;
  if (o.grade != null && !MAGNET_GRADES.includes(o.grade)) throw new Error(`${what}: grade is one of ${MAGNET_GRADES.join(', ')} (got ${shown(o.grade)})`);
  const grade = o.grade ?? n.grade ?? MAGNETS.grade.value, gap = o.gap ?? 0, count = o.count ?? 1;
  if (!(isNum(gap) && gap >= 0)) throw new Error(`${what}: gap is what lies between the magnet and the steel, 0 mm or more (got ${shown(o.gap)})`);
  if (!(Number.isInteger(count) && count >= 1)) throw new Error(`${what}: count is how many magnets share the load, a whole number from 1 (got ${shown(o.count)})`);
  if (o.grade == null && n.grade == null) rests.push(mrest('grade'));
  let touching, says;
  if (o.pull != null) { touching = positive(what, 'pull (a magnet\'s pull touching steel, in N)', o.pull); says = `${mm(touching)} N touching steel, as given`; }
  else {
    const f = MAGNETS[`${key}_pull`];
    if (!f) throw new Error(`${what}: there is no seller's pull for a ${n.shape} magnet ${size}: the kit holds ${MAGNET_SIZES[n.shape].join(', ')} (magnets.${n.shape}_<size>_pull). For another size, give its maker's pull touching steel ({ pull: 12 }, in N)`);
    const sold = MAGNETS[`${key}_grade`].value, k = (middle(grade) / middle(sold)) ** 2;
    touching = f.value * k; rests.push(mrest(`${key}_pull`), mrest(`${key}_grade`));
    if (grade !== sold) rests.push(mrest(`remanence_${grade}`), mrest(`remanence_${sold}`));
    says = grade === sold ? `${mm(f.value)} N touching steel, its seller's figure (magnets.${key}_pull, ${sold})` : `${mm(n2(touching))} N touching steel: its seller's ${mm(f.value)} N for ${sold} (magnets.${key}_pull) times (${mm(r3(middle(grade)))} / ${mm(r3(middle(sold)))} T)² for ${grade}, the middles of their remanence (magnets.remanence_${grade}, an estimate)`;
  }
  const share = gap > 0 ? fieldShare(n, gap) ** 2 : 1, pull = touching * share;
  if (gap > 0) rests.push(mrest('field_formula'));
  const volume = n.shape === 'disc' ? (Math.PI / 4) * n.diameter ** 2 * n.thickness : n.length * n.width * n.thickness, grams = r3((volume * MAGNETS.density.value) / 1000);
  rests.push(mrest('density'));
  const name = magnetName(n, grade);
  out.push(finding('info', `${name} pulls ${says}${gap > 0 ? `; across a ${mm(gap)} mm gap ${mm(n2(pull))} N, ${mm(n1(share * 100))}% of that (the field on its axis squared, magnets.field_formula: an estimate)` : ''}. A seller's pull is straight off thick mild steel: a thin strike, a slide sideways or a rough face takes less`,
    'magnet.pull', { values: { touching: n2(touching), gap, pull: n2(pull), grade }, refs: { magnet: name, kind: o.pull != null ? 'given' : grade === MAGNETS[`${key}_grade`]?.value ? 'community' : 'estimate' } }));
  const total = pull * count, load = o.load != null ? positive(what, 'load (the pull asked of the magnets, in N)', o.load) : null, want = DEFAULTS.load_margin.value;
  let margin = null;
  if (load != null) {
    margin = n2(total / load); rests.push(rest('fixings.load_margin', DEFAULTS.load_margin));
    out.push(finding(margin >= want ? 'pass' : margin >= 1 ? 'warn' : 'fail', `${count > 1 ? `${count} × ${name} pull ${mm(n2(total))} N together` : `${name} pulls ${mm(n2(pull))} N`}: a pull of ${mm(load)} N is held ${mm(margin)} times over${margin >= want ? '' : margin >= 1 ? `, under the ${mm(want)} times fixings.load_margin asks` : ': it comes apart'}`, 'magnet.hold', { values: { total: n2(total), load, margin, count } }));
  }
  out.push(finding('info', `${name} weighs ${mm(grams)} g (magnets.density ${mm(MAGNETS.density.value)} g/cm³)`, 'magnet.mass', { values: { grams } }));
  return { kind: 'magnet', shape: n.shape, name, said: String(p), diameter: n.diameter, length: n.length, width: n.width, thickness: n.thickness, grade, made: 'bought',
    touching: n2(touching), gap, pull: n2(pull), count, total: n2(total), load, margin, grams, volume: n2(volume), rests, findings: out };
}

/**
 * @typedef {{ kind: 'magnet-seat', magnet: Magnet, fit: 'press' | 'glue' | 'ribs', facing: 'open' | 'floor',
 *   pocket: { shape: 'round' | 'rect', diameter: number | null, size: number[] | null, nominal: number[], comp: number, clearance: number, depth: number, lead: number,
 *     into: string, axis: 'x' | 'y' | 'z', teardrop: boolean, ribs: { count: number, tips: number, radius: number, protrude: number } | null, relief: number | null, rules: string[] },
 *   floor: number | null, thickness: number | null, hold: number | null, holdMargin: number | null, rests: object[], findings: object[] }} MagnetSeat
 *   pocket: what to draw (diameter of a round pocket, or [length, width] of a block's, as drawn; nominal: the magnet's;
 *   comp: hole compensation added; clearance: added across past that, under 0 for a press; lead: the chamfer at its
 *   mouth; ribs: crush ribs, their tips on a circle `tips` across; relief: a block pocket's corner reliefs' radius);
 *   floor: what is left under it in a part `thickness` thick; hold: what the fit grips the magnet with against its pull out, N
 */

/**
 * A magnet's pocket as a model: its size from the printer's rules for the fit (press: the magnet plus hole_comp less
 * x1c.magnet_press; glue: plus x1c.magnet_glue; ribs: a glue pocket with three crush ribs whose tips stand
 * x1c.magnet_crush inside the magnet), its depth (the magnet's thickness, and any recess), the floor left under it held
 * to fixings.magnet_floor, and the magnet's pull out of it against what the fit grips with. Refused by name where it
 * would not print: a pocket opening on the bed wider than the printer bridges, a block's pocket or crush ribs lying on
 * their side, a floor too thin.
 * @param {string | Magnet} p a magnet's name or model
 * @param {{ fit?: 'press' | 'glue' | 'ribs', printer?: object, material?: string | object, sets?: object, into?: string, axis?: 'x' | 'y' | 'z',
 *   recess?: number, thickness?: number, facing?: 'open' | 'floor', grade?: string, gap?: number, count?: number, load?: number, pull?: number }} [o]
 *   fit: press, glue or ribs (the default: ribs for a disc standing in its pocket; glue for a disc lying on its side,
 *   where ribs would hang from the roof, and for a block, whose press splits its wall); material: the part's plastic (default PLA); into or axis: the pocket's way
 *   (default down from a top face); recess: how far under the face the magnet sits, mm; thickness: the part's along
 *   the pocket, for its floor; facing: where the magnet's steel is, past the pocket's open face (the default) or
 *   through its floor, which is then the gap; grade, gap, count, load, pull: magnetModel's
 * @returns {MagnetSeat}
 */
export function magnetSeatModel(p, o = {}) {
  const what = 'magnetSeatModel';
  optionsOf(what, o, '{ fit: \'press\', thickness: 5 }');
  const pr = printerOf(what, o.printer), dir = directionOf(what, o, '-z'), out = [], rests = [];
  const model = typeof p === 'object' && p?.kind === 'magnet', n = model ? p : parseMagnet(p);
  // The fit by default: crush ribs for a disc standing in its pocket, glue for one lying on its side (ribs would hang
  // from its roof) and for a block. A press grips well, but its hoop stress splits a thin wall: an 8x3 disc in PLA at
  // x1c.magnet_press is stretched 24.6 MPa round its hoop against 39 / 2, a 10x5x2 block 39.4 MPa against 39
  const fit = oneOf(what, 'fit', o.fit ?? (n.shape === 'disc' && !dir.across ? 'ribs' : 'glue'), MAGNET_FITS), facing = oneOf(what, 'facing', o.facing ?? 'open', ['open', 'floor']);
  const recess = o.recess ?? 0;
  if (!(isNum(recess) && recess >= 0)) throw new Error(`${what}: recess is how far under the face the magnet sits, 0 mm or more (got ${shown(o.recess)})`);
  const mat = materialOf(what, o.material ?? 'pla', o.sets);
  const layer = pr.n('layer'), least = r3(DEFAULTS.magnet_floor.value * layer), depth = r3(n.thickness + recess);
  // The floor: what the part leaves under the pocket, and (facing the floor) the gap the pull goes across
  let floor = null, thickness = null;
  if (o.thickness != null) {
    thickness = positive(what, 'thickness', o.thickness); floor = r3(thickness - depth);
    if (floor < least - 1e-9) throw new Error(`${what}: a pocket ${mm(depth)} mm deep in a part ${mm(thickness)} mm thick there leaves a floor of ${mm(floor)} mm under the magnet, under fixings.magnet_floor's ${DEFAULTS.magnet_floor.value} layers (${mm(least)} mm at ${pr.cite('layer')} ${mm(layer)} mm): too thin to print whole, and the magnet pulls through it. Make the part ${mm(r3(depth + least))} mm thick there, or the pocket shallower`);
    rests.push(rest('fixings.magnet_floor', DEFAULTS.magnet_floor), pr.rest('layer'));
  } else if (facing === 'floor') throw new Error(`${what}: facing 'floor' pulls through the floor under the pocket: give thickness, the part's along the pocket, so the floor is known`);
  // (a model handed in is built again with these options, so its pull is taken across this floor and held to this load)
  const m = magnetModel(p, { grade: o.grade, gap: (facing === 'floor' ? floor : 0) + (o.gap ?? (model ? p.gap : 0)), count: o.count, load: o.load, pull: o.pull });
  rests.push(...m.rests); out.push(...m.findings);
  // The pocket: the magnet, plus hole_comp as any printed hole, less magnet_press or plus magnet_glue
  const comp = pr.n('hole_comp'), k = fit === 'press' ? 'magnet_press' : 'magnet_glue', c = pr.n(k), clearance = r3(fit === 'press' ? -c : c);
  rests.push(pr.rest('hole_comp'), pr.rest(k));
  const disc = m.shape === 'disc', nominal = disc ? [m.diameter] : [m.length, m.width], drawn = nominal.map((x) => r3(x + comp + clearance)), rules = [pr.cite('hole_comp'), pr.cite(k)];
  let ribs = null, relief = null;
  if (fit === 'ribs') {
    if (!disc) throw new Error(`${what}: crush ribs are for a round pocket: a block magnet's pocket is pressed or glued`);
    if (dir.across) throw new Error(`${what}: crush ribs lying on their side (${said(dir.into)}) hang from the pocket's roof: stand the pocket up, or press or glue the magnet`);
    const crush = pr.n('magnet_crush'), tips = r3(m.diameter + comp - crush), line = pr.n('line'), protrude = r3((drawn[0] - tips) / 2);
    ribs = { count: 3, tips, radius: r3(Math.max(line / 2, protrude)), protrude }; rules.push(pr.cite('magnet_crush')); rests.push(pr.rest('magnet_crush'), pr.rest('line'));
  }
  if (!disc) {
    if (dir.across) throw new Error(`${what}: a block magnet's pocket lying on its side (${said(dir.into)}) has a flat roof hanging over it: stand the pocket up (into -z, down from a top face)`);
    relief = r3(pr.n('line')); rests.push(pr.rest('line'));
  }
  if (dir.into === '+z') {
    const span = disc ? drawn[0] : Math.min(...drawn), bridge = pr.n('bridge');
    if (span > bridge + 1e-9) throw new Error(`${what}: a pocket going up from the bed ${mm(span)} mm across has its floor printed over it as a bridge, wider than ${pr.cite('bridge')} ${mm(bridge)} mm: print the part with the pocket opening upward (into -z)`);
    rests.push(pr.rest('bridge'));
  }
  const lead = fit === 'glue' || dir.across || !disc ? 0 : r3(Math.min(pr.n('chamfer'), depth / 3));
  if (lead) rests.push(pr.rest('chamfer'));
  const pocket = { shape: disc ? 'round' : 'rect', diameter: disc ? drawn[0] : null, size: disc ? null : drawn, nominal, comp, clearance, depth, lead, into: dir.into, axis: dir.axis, teardrop: disc && dir.across, ribs, relief, rules };
  const across = disc ? `${mm(drawn[0])} mm across` : `${mm(drawn[0])} x ${mm(drawn[1])} mm`;
  out.push(finding('info', `${m.name}'s ${fit === 'ribs' ? 'ribbed' : fit} pocket drawn ${across}, ${mm(depth)} mm deep${recess ? ` (the magnet ${mm(recess)} mm under the face)` : ''}: the magnet's ${nominal.map(mm).join(' x ')} mm, plus ${pr.cite('hole_comp')} ${mm(comp)} mm since a printed hole comes out small, ${fit === 'press' ? 'less' : 'plus'} ${pr.cite(k)} ${mm(c)} mm (${pr.rest(k).kind})${ribs ? `, with ${ribs.count} crush ribs whose tips stand ${mm(ribs.tips)} mm across (${pr.cite('magnet_crush')} ${mm(pr.n('magnet_crush'))} mm inside the magnet and hole_comp)` : ''}${relief ? `, its corners relieved by ${mm(relief)} mm round cuts so the block's square corners go in and no inside corner is square` : ''}${lead ? `, a ${mm(lead)} mm lead-in at its mouth` : ''}`,
    'magnet.pocket', { values: { diameter: pocket.diameter, size: pocket.size, depth, clearance }, refs: { magnet: m.name, fit, rule: pr.cite(k), kind: pr.rest(k).kind } }));
  if (fit === 'press') out.push(finding('info', `a magnet is sold within ±${mm(MAGNETS.tolerance.value)} mm (magnets.tolerance), as much as the ${mm(c)} mm press: a small one may drop in loose and a large one split the pocket. Crush ribs (fit 'ribs') take up the spread`, 'magnet.tolerance', { values: { tolerance: MAGNETS.tolerance.value, press: c } }));
  out.push(finding('pass', `${said(dir.into)}, the pocket ${dir.across ? 'is a teardrop: a 45° roof, so it prints with no support' : dir.into === '+z' ? `opens on the bed, its floor a ${mm(disc ? drawn[0] : Math.min(...drawn))} mm bridge` : 'opens upward, so it prints as drawn'}${floor != null ? `; it leaves a ${mm(floor)} mm floor, ${DEFAULTS.magnet_floor.value} layers or more (fixings.magnet_floor)` : ''}`, 'magnet.printable', { values: { into: dir.into, floor } }));
  // The pull out of the pocket: facing the open face, the magnet's own pull on its steel draws it out against the fit
  let hold = null, holdMargin = null;
  const want = DEFAULTS.load_margin.value, mu = DEFAULTS.clamp_friction.value, wall = disc ? Math.PI * m.diameter * m.thickness : 2 * (m.length + m.width) * m.thickness;
  if (facing === 'floor') out.push(finding('pass', `the steel is past the floor, so the magnet's pull holds it down in its pocket: it cannot pull out (the ${mm(floor)} mm floor is its gap)`, 'magnet.pullout', { values: { floor } }));
  else if (fit === 'glue') out.push(finding('info', `glued, the magnet stays in its pocket by its glue, whose strength is its maker's and not checked here: it is pulled out with ${mm(m.pull)} N, so the glue must hold ${mm(n1(want * m.pull))} N (fixings.load_margin times the pull) over ${mm(n1(wall))} mm² of wall`, 'magnet.pullout', { values: { pull: m.pull, area: n1(wall) } }));
  else {
    let says;
    if (fit === 'press') { // a rigid magnet in a hole in a wide plate: p = E (i / d) / (1 + ν), held by friction over its wall
      const E = mat.modulus.value, nu = mat.poisson?.value ?? 0.35, p0 = (E * (c / (disc ? m.diameter : Math.min(m.length, m.width)))) / (1 + nu);
      hold = n1(mu * p0 * wall); rests.push(rest(mat.modulus.name, mat.modulus), ...(mat.poisson ? [rest(mat.poisson.name, mat.poisson)] : []), rest('fixings.clamp_friction', DEFAULTS.clamp_friction));
      says = `a ${mm(c)} mm press in ${mat.name} grips at about ${mm(n2(p0))} MPa (p = E i / d / (1 + ν), ${mat.modulus.name} ${mm(E)} MPa, ν ${mm(nu)}${mat.poisson ? '' : ', taken for a plastic with none in its rule set'}), ${mm(hold)} N over its ${mm(n1(wall))} mm² wall at fixings.clamp_friction ${mm(mu)}: an estimate, which a plastic loses some of as it creeps`;
    } else { // crush ribs crushed: each presses at the plastic's strength over a line's width
      const S = mat.strength.value, w = pr.n('line'), area = ribs.count * w * m.thickness;
      hold = n1(mu * S * area); rests.push(rest(mat.strength.name, mat.strength), rest('fixings.clamp_friction', DEFAULTS.clamp_friction));
      says = `${ribs.count} crush ribs, crushed, press at ${mat.name}'s ${mm(S)} MPa over ${mm(n2(area))} mm² (a ${mm(w)} mm line by the magnet's ${mm(m.thickness)} mm each), ${mm(hold)} N at fixings.clamp_friction ${mm(mu)}: an estimate`;
    }
    if (fit === 'press') { // the pocket's wall, round a rigid magnet in a wide plate, is stretched round its hoop by the same pressure
      const p0 = (mat.modulus.value * (c / (disc ? m.diameter : Math.min(m.length, m.width)))) / (1 + (mat.poisson?.value ?? 0.35)), S = mat.strength.value;
      out.push(finding(p0 <= S / want + 1e-9 ? 'pass' : p0 <= S + 1e-9 ? 'warn' : 'fail', `the press stretches the pocket's wall round its hoop at about ${mm(n2(p0))} MPa, against ${mat.strength.name} ${mm(S)} MPa${p0 <= S / want + 1e-9 ? '' : p0 <= S ? `: under ${mm(want)} times over, so a magnet at the top of its tolerance may split a thin wall. Crush ribs (fit 'ribs') press far less` : ': it splits the wall. Use crush ribs (fit \'ribs\') or glue'}`, 'magnet.wall', { values: { hoop: n2(p0), strength: S } }));
    }
    holdMargin = n2(hold / m.pull);
    out.push(finding(holdMargin >= want ? 'pass' : holdMargin >= 1 ? 'warn' : 'fail', `the magnet is pulled out of its pocket with its own ${mm(m.pull)} N: ${says}, ${mm(holdMargin)} times the pull${holdMargin >= want ? '' : holdMargin >= 1 ? `, under the ${mm(want)} times fixings.load_margin asks: glue it as well` : ': it comes out, so glue it'}`,
      'magnet.pullout', { values: { hold, pull: m.pull, margin: holdMargin } }));
  }
  return { kind: 'magnet-seat', magnet: m, fit, facing, pocket, floor, thickness, hold, holdMargin, rests, findings: out };
}

/**
 * A magnet's pocket, to subtract: round (a teardrop lying on its side) with crush ribs where asked, or a block's with
 * its corners relieved, the size magnetSeatModel gives it, from the point at on the face going into the part.
 * @param {string | Magnet} p @param {object} [o] as magnetSeatModel, and at: the point on the face where the pocket starts
 * @returns {object} a JSCAD geom3 with .model holding magnetSeatModel's numbers
 */
export function magnetSeat(p, o = {}) {
  const what = 'magnetSeat', s = magnetSeatModel(p, optionsOf(what, o, '{ fit: \'ribs\', at: [0, 0, 5] }')), at = pointOf(what, o.at), q = s.pocket;
  let g;
  if (q.shape === 'round') {
    const r = q.diameter / 2, steps = q.lead ? [[r + q.lead, 0], [r, q.lead], [r, q.depth]] : [[r, q.depth]];
    g = q.teardrop ? teardrop(steps, UP[q.into]) : bore(steps);
    if (q.ribs) {
      const { count, radius, protrude } = q.ribs, a = Array.from({ length: count }, (_, i) => (2 * Math.PI * i) / count + Math.PI / 2);
      g = subtract(g, crushRibs({ at: a.map((t) => [r * Math.cos(t), r * Math.sin(t)]), into: a.map((t) => [-Math.cos(t), -Math.sin(t)]), z: [-q.depth - OUT, q.lead ? -q.lead : OUT], radius, protrude }));
    }
  } else {
    const [L, W] = q.size, h = q.depth + OUT, box = translate([0, 0, OUT - h / 2], cuboid({ size: [L, W, h] }));
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => translate([(sx * L) / 2, (sy * W) / 2, OUT - h / 2], cylinder({ radius: q.relief, height: h, segments: 16 })));
    g = union(box, ...corners);
  }
  return Object.assign(along(g, q.into, at), { model: s });
}

/**
 * A magnet's solid, standing on z = 0, for an assembly: a disc or a block. @param {string | Magnet} p @param {object} [o] as magnetModel
 * @returns {object} a JSCAD geom3 with .model
 */
export function magnet(p, o = {}) {
  const m = magnetModel(p, o);
  const g = m.shape === 'disc' ? cylinder({ radius: m.diameter / 2, height: m.thickness, center: [0, 0, m.thickness / 2], segments: 32 }) : cuboid({ size: [m.length, m.width, m.thickness], center: [0, 0, m.thickness / 2] });
  return Object.assign(g, { model: m });
}
