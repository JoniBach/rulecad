// Printed beams as solids: a printed beam laid as it prints, its ends' heat-set inserts or captive nuts cut in, and a
// splice that joins two printed halves of a beam longer than the bed.
//
// Lying down, a beam's bottom face is on the bed and its length runs along x from end a at x = 0; its section's x is
// the bed's y and its y is up (z). Standing, end a is on the bed and the beam runs up z, its section as drawn.
//
// A splice is a lap: over the lap, the section is cut upright down its middle, the half toward end a keeping its front
// side and the half toward end b its back side, so both print lying down with every cut face upright and no support.
// In the middle of the lap the cut steps sideways into a key that locks the halves along the beam. Two screws pass
// across the lap, square to the beam, under the slot's floor: a button head in a seat in the front face, a nut in a
// pocket in the back face, each on its side as a teardrop. Units: mm, grams, newtons.
import jscad from '@jscad/modeling';
import { fixingModel, hole, nutTrap, nutTrapModel, nutPocket, nutPocketModel, counterbore, counterboreModel } from '@rulecad/fixings';
import { beamModel, beam } from './beam.mjs';
import { PRINTED_DEFAULTS, printerFigures, printedSection } from './printing.mjs';

const { cuboid } = jscad.primitives, { subtract, union, intersect } = jscad.booleans;
const { translate, rotateX, rotateZ } = jscad.transforms, { measureVolume } = jscad.measurements;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });

const printedModel = (what, m, o) => {
  const b = m?.kind === 'beam' ? m : m?.model?.kind === 'beam' ? m.model : beamModel(m, o);
  if (!b.printed) throw new Error(`${what}: ${b.name} is a bought beam: give one printed (beamModel(profile, { length, printed: true }))`);
  return b;
};
// a beam's frame (x across, y up, z along) to the print's, and its directions, for a piece that starts `shift` along the beam
const placer = (b, shift = 0) => {
  const lying = b.printed.pose === 'lying', H = b.profile.height;
  return {
    point: ([x, y, z]) => (lying ? [z - shift, x, y + H / 2] : [x, y, z - shift]),
    along: (sign) => (lying ? (sign > 0 ? '+x' : '-x') : sign > 0 ? '+z' : '-z'),
    across: (sign) => (lying ? (sign > 0 ? '+y' : '-y') : sign > 0 ? '+x' : '-x'),
    solid: (g) => (lying ? translate([-shift, 0, H / 2], rotateZ(Math.PI / 2, rotateX(Math.PI / 2, g))) : translate([0, 0, -shift], g)),
    lying,
  };
};

// The cutters for a printed end's fixing: a heat-set insert's hole along the beam, or a screw's hole and a nut's slot
// from the front face, at end e of a piece placed by `pl`
function endCutters(b, e, pl) {
  const fix = b.printed.ends[e];
  if (!fix) return [];
  const sign = e === 'a' ? 1 : -1, z0 = e === 'a' ? 0 : b.length, [ex, ey] = fix.at, into = pl.along(sign);
  if (fix.kind === 'insert') return [hole(fix.thread, { kind: 'insert', into, at: pl.point([ex, ey, z0]) })];
  const t = nutTrapModel(fix.thread, { axis: pl.lying ? 'x' : 'z', into: pl.across(1), depth: b.profile.width / 2 + ex });
  const zMid = z0 + sign * (fix.wall + t.gap / 2), deep = fix.wall + t.gap + fixingModel(fix.thread).major;
  return [nutTrap(fix.thread, { axis: pl.lying ? 'x' : 'z', into: pl.across(1), depth: b.profile.width / 2 + ex, at: pl.point([-b.profile.width / 2, ey, zMid]) }), hole(fix.thread, { kind: 'clearance', into, depth: deep, through: false, at: pl.point([ex, ey, z0]) })];
}

// A captive nut in a bore's place (a standing print of a profile with a bore): the bore filled from the end to the
// screw's hole's far end, so the screw's hole and the nut's slot are cut in plastic, not lost in the wider bore, and
// the screw's hole runs on into the bore past it (an insert's hole is no narrower than the bore: nothing to fill)
function endPlugs(b, e, pl) {
  const fix = b.printed.ends[e];
  if (!fix?.bore || fix.kind !== 'nut') return [];
  const sign = e === 'a' ? 1 : -1, deep = fix.wall + fix.height + fixingModel(fix.thread).major;
  const [ex, ey] = fix.at, mid = (e === 'a' ? 0 : b.length) + (sign * deep) / 2, [x, y, z] = pl.point([ex, ey, mid]);
  const size = pl.lying ? [deep, fix.bore + 0.2, fix.bore + 0.2] : [fix.bore + 0.2, fix.bore + 0.2, deep];
  return [cuboid({ size, center: [x, y, z] })];
}

/**
 * A printed beam as it prints: lying on its bottom face along x from end a at x = 0, or standing on end a, with its
 * operations cut and each end's heat-set insert hole or captive nut's slot and screw hole. printcheck's check() reads it
 * as it is, the bed at z = 0.
 * @param {object} m a printed beam's model (beamModel with printed), or a profile with { length, printed, ... } as beamModel takes
 * @param {object} [o] beamModel's options, where m is a profile
 * @returns {object} a JSCAD geom3, with .model the beam's
 */
export function printedBeam(m, o = {}) {
  const b = printedModel('printedBeam', m, o), pl = placer(b);
  let g = pl.solid(beam(b, { display: 'preview' }));
  const plugs = [...endPlugs(b, 'a', pl), ...endPlugs(b, 'b', pl)];
  if (plugs.length) g = union(g, ...plugs);
  const cuts = [...endCutters(b, 'a', pl), ...endCutters(b, 'b', pl)];
  if (cuts.length) g = subtract(g, ...cuts);
  return Object.assign(g, { model: b });
}

/**
 * A printed beam in its place, in the beam's own frame as beam() draws it, with each end's heat-set insert hole or
 * captive nut's slot and screw hole cut in (and a bore filled where a fixing takes its place), so a screw into its end
 * finds them, as the fasten checks read a part.
 * @param {object} m a printed beam's model (beamModel with printed) @param {object} [o] beam()'s options (display)
 * @returns {object} a JSCAD geom3, with .model the beam's
 */
export function printedInPlace(m, o = {}) {
  const b = printedModel('printedInPlace', m, {}), pl = { ...placer({ ...b, printed: { ...b.printed, pose: 'standing' } }) };
  let g = beam(b, o);
  const plugs = [...endPlugs(b, 'a', pl), ...endPlugs(b, 'b', pl)];
  if (plugs.length) g = union(g, ...plugs);
  const cuts = [...endCutters(b, 'a', pl), ...endCutters(b, 'b', pl)];
  if (cuts.length) g = subtract(g, ...cuts);
  return Object.assign(g, { model: b });
}

/**
 * A splice for a printed beam longer than the bed, as numbers: where it goes, the lap, the key and the screws, each half's
 * length and grams, and findings (splice.fit, splice.place, splice.strength, splice.screw) in the kit's one shape.
 *
 * Over the lap each half keeps one side of the section, split by an upright cut down the middle, so both print lying
 * down with every cut face upright. At each end of the lap one half carries the whole moment on its half of the
 * section, and between them two screws across the lap pass it from one half to the other as a couple. So the joint
 * carries the least of the two halves' sections (each at the plastic's strength along its layers) and the screws' couple.
 * The lap is sized so the screws are not the weak part: from twice the height, longer until they carry what the joint
 * must, or what the halves' sections can, whichever is less. What it must carry is the moment given, or what the beam
 * itself breaks at there: the beam's design moment times the margin times the share a spread load on a simply supported
 * span puts at the splice (4 z (L - z) / L²). Half a section carries about half of the whole, so a splice passes only
 * where the moment there is about half what the beam can carry or less: give the moment the frame puts there.
 * Placed, unless told, as far from the middle as the bed lets both halves be.
 * @param {object} m a printed beam's model, lying down
 * @param {{ at?: number, moment?: number, thread?: string, printer?: object }} [o] at: the middle of the lap, mm from end a;
 *   moment: N·mm the joint must carry there; thread: the screws' (the largest from M5 down whose head's seat and nut's
 *   pocket fit under the slot); printer: as the beam's
 * @returns {object} { kind: 'splice', beam, at, lap, key, keyLength, screws, halves, pieces, capacity, need, share, findings, ... }
 */
export function spliceModel(m, o = {}) {
  const what = 'spliceModel', b = printedModel(what, m, {});
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: options are { at, moment, thread, printer }, not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!['at', 'moment', 'thread', 'printer'].includes(k)) throw new Error(`${what}: no option "${k}": it takes at, moment, thread and printer`);
  const p = b.profile, L = b.length, W = p.width, H = p.height, P = printerFigures(what, o.printer ?? null), bed = P.n('bed'), line = P.n('line'), fit = P.n('fit');
  if (b.printed.pose !== 'lying') throw new Error(`${what}: ${b.name} prints standing up: a splice joins halves printed lying down (printed: { pose: 'lying' })`);
  if (p.cells[0] !== 1 || p.cells[1] !== 1) throw new Error(`${what}: ${p.name} is ${p.cells.join(' by ')} cells: a splice is drawn for a one-cell section`);
  if (p.faces.bottom.some((q) => q.slot) || p.faces.front.some((q) => q.slot) || p.faces.back.some((q) => q.slot)) throw new Error(`${what}: ${p.name} has a slot where the splice's screws go: a splice is drawn for a section slotted on top only (profile-2020-printed)`);
  if (o.at != null && !(isNum(o.at) && o.at > 0 && o.at < L)) throw new Error(`${what}: at is the middle of the lap, in mm from end a, between 0 and ${mm(L)} (got ${shown(o.at)})`);
  if (o.moment != null && !(isNum(o.moment) && o.moment >= 0)) throw new Error(`${what}: moment is what the joint must carry, in N·mm, 0 or more (got ${shown(o.moment)})`);
  const top = p.faces.top.find((q) => q.slot), yFloor = top ? H / 2 - p.slots[top.slot].cavityDepth : H / 2, g = fit, room = 2 * line;
  const S = b.printed.strength, mat = b.profile.material, sAcross = isNum(mat?.figures?.strength_z?.value) ? mat.figures.strength_z.value : r3(S * PRINTED_DEFAULTS.across.value);
  // ---- the halves over the lap: a keeps x below the cut, b above it, each with walls on its cut face ----
  const secA = printedSection(p, { walls: b.printed.walls, infill: b.printed.infill, line, between: [-Infinity, -g / 2] });
  const secB = printedSection(p, { walls: b.printed.walls, infill: b.printed.infill, line, between: [g / 2, Infinity] });
  const zA = r3(secA.inertiaX / secA.reach[0]), zB = r3(secB.inertiaX / secB.reach[0]), capA = r3(S * zA), capB = r3(S * zB);
  // ---- the screws: across the lap, a button head in a seat in a's front face (-x), a nut in a pocket in b's back face (+x), both
  // lying on their side as teardrops; as low as the head's seat leaves plastic to the bed, and under the slot's floor ----
  const threads = o.thread ? [o.thread] : ['M5', 'M4', 'M3'];
  let pick = null;
  for (const t of threads) {
    const fx = fixingModel(t);
    if (!fx.made.heads.includes('button')) continue;
    const cb = counterboreModel(t, { head: 'button', into: '+y', printer: o.printer ?? undefined }), np = nutPocketModel(t, { into: '-y', printer: o.printer ?? undefined });
    const R = cb.diameter / 2, up = Math.max(R * Math.SQRT2, np.corner / 2); // (a teardrop's point rises r root 2 over its axis)
    const y = r3(Math.min((yFloor - H / 2) / 2, yFloor - room - up));
    if (y - Math.max(R, np.corner / 2) < -H / 2 + room - 1e-9) continue;
    const span = W - cb.depth, stock = (fx.figures.lengths?.value ?? []).filter((x) => x <= span + 1e-9).sort((a, c) => c - a)[0];
    if (!stock) continue;
    const pocket = r3(Math.max(np.depth, span - stock + np.height)), tA = r3(W / 2 - g / 2 - cb.depth), tB = r3(W / 2 - g / 2 - pocket);
    if (tA < room - 1e-9 || tB < room - 1e-9 || stock < W / 2 + g / 2 + np.height - cb.depth) continue;
    pick = { thread: t, fx, cb, np, y, length: stock, pocket, tA, tB };
    break;
  }
  if (!pick) throw new Error(`${what}: ${p.name}: no thread of ${threads.join(', ')} has a button head's seat and a nut's pocket that fit across it under the slot's floor with ${mm(room)} mm of plastic round them: a larger section`);
  const { thread, fx, cb, np, y: ys, pocket, tA, tB } = pick, d = fx.major;
  // ---- what one screw carries across the cut: the plastic of either half crushed under it (bearing, at the strength
  // across the layers, since it pushes up or down through them), torn out to the nearer of the bed and the slot's floor
  // (two planes sheared across the layers at that strength over root 3, von Mises), or the screw sheared ----
  const sb = PRINTED_DEFAULTS.strength_bearing.value * sAcross, e = r3(Math.min(ys + H / 2, yFloor - ys) - cb.hole / 2), tau = sAcross / Math.sqrt(3), tMin = Math.min(tA, tB);
  const bearing = r3(d * tMin * sb), tear = r3(2 * e * tMin * tau), shank = r3(((Math.PI / 4) * (d - 0.9382 * fx.pitch) ** 2 * (fx.figures.proof_stress?.value ?? 580)) / Math.sqrt(3));
  const per = Math.min(bearing, tear, shank);
  // ---- the lap: from twice the height, longer until the screws carry what the joint must or the halves can; placed where the bed lets it be furthest from the middle ----
  const edge = r3(2.5 * d), margin = PRINTED_DEFAULTS.margin.value, failMoment = b.printed.design * margin, halves = Math.min(capA, capB);
  const share = (z) => (4 * z * (L - z)) / (L * L);
  let lap = r3(PRINTED_DEFAULTS.lap.value * H), at = null, need = null, couple = null;
  for (let tries = 0; tries < 400; tries++, lap = r3(lap + line)) {
    const lo = Math.max(L + lap / 2 - bed, lap / 2), hi = Math.min(bed - lap / 2, L - lap / 2);
    if (lo > hi + 1e-9) break;
    at = o.at ?? (Math.abs(lo - L / 2) >= Math.abs(hi - L / 2) ? lo : hi);
    if (o.at != null && (o.at < lo - 1e-9 || o.at > hi + 1e-9)) break;
    need = o.moment != null ? o.moment * margin : share(at) * failMoment; couple = per * (lap - 2 * edge);
    if (couple >= Math.min(need, halves) - 1e-9) break;
  }
  const lo = Math.max(L + lap / 2 - bed, lap / 2), hi = Math.min(bed - lap / 2, L - lap / 2);
  if (lo > hi + 1e-9 || (o.at != null && (o.at < lo - 1e-9 || o.at > hi + 1e-9)) || couple < Math.min(need, halves) - 1e-9) throw new Error(`${what}: ${b.name}: no lap with two ${thread} screws carries ${mm(Math.min(need ?? 0, halves) / 1000)} N·m within ${P.name}'s ${mm(bed)} mm bed${o.at != null ? ` with its middle at ${mm(o.at)} mm` : ''}: splice it in three, give the moment the frame puts there (moment), or a larger section`);
  const cap = Math.min(couple, capA, capB), weakest = cap === couple ? 'screws' : capA <= capB ? 'a' : 'b';
  const zs = [r3(at - lap / 2 + edge), r3(at + lap / 2 - edge)], arm = r3(zs[1] - zs[0]), key = r3(PRINTED_DEFAULTS.cheek.value * line);
  const kz = r3(Math.max(2 * line, Math.min(H, arm - 2 * (cb.diameter / 2 + room)))); // (the key between the screws, clear of their seats)
  const lenA = r3(at + lap / 2), lenB = r3(L - at + lap / 2), gPer = b.mass / L, q = secA.plastic / b.printed.section.plastic;
  const gramsA = r3(gPer * (at - lap / 2) + gPer * lap * q);
  const pieces = [{ name: `${b.name} a`, from: 0, to: lenA, length: lenA, grams: gramsA }, { name: `${b.name} b`, from: r3(at - lap / 2), to: L, length: lenB, grams: r3(b.mass - gramsA) }];
  const out = [], said = `the splice in ${b.name}`, nm = (x) => `${mm(x / 1000)} N·m`;
  out.push(finding(Math.max(lenA, lenB) <= bed + 1e-9 ? 'pass' : 'fail', `${said}: its halves are ${mm(lenA)} and ${mm(lenB)} mm long, each on ${P.name}'s ${mm(bed)} mm bed, lying down with no support (over the lap each keeps one side of the section, cut upright down the middle)`, 'splice.fit', { values: { a: lenA, b: lenB, bed } }));
  out.push(finding('info', o.moment != null ? `${said}: its lap's middle is ${mm(at)} mm from end a, where the frame puts ${nm(o.moment)}` : `${said}: its lap's middle is ${mm(at)} mm from end a, as far from the middle as the bed lets it be: a spread load on a simply supported span puts ${Math.round(share(at) * 100)}% of its greatest moment there (an assumed loading; give the frame's moment where it is known)`, 'splice.place', { values: { at, share: r3(share(at)), lap } }));
  const asked = o.moment != null ? `${margin} times the ${nm(o.moment)} given` : `the ${nm(need)} the beam itself breaks at there (${nm(failMoment)} at its middle, times ${Math.round(share(at) * 100)}%)`;
  const parts = `the half toward a's section over the lap ${nm(capA)} (${mm(zA)} mm³ at ${S} MPa along its layers), the half toward b's ${nm(capB)} (${mm(zB)} mm³), and two ${thread} screws ${mm(arm)} mm apart as a couple ${nm(couple)}, each holding ${mm(per)} N across the cut: the least of the plastic crushed under it (${mm(bearing)} N), torn out to the bed or the slot's floor (${mm(tear)} N), both at ${sAcross} MPa across the layers, and the screw sheared (${mm(shank)} N)`;
  out.push(finding(cap >= need - 1e-9 ? 'pass' : 'fail', cap >= need - 1e-9 ? `${said}: it carries ${nm(cap)}, ${asked}: ${parts}. An estimate, from the halves' printed sections and plastic at its strength`
    : `${said}: it carries ${nm(cap)}, under ${asked}: ${parts}. Over the lap each end of it is carried by half the section, so a splice carries about half what the beam does: give the moment the frame puts there (moment), up to ${nm(cap / margin)}, or splice where the moment is less`,
  'splice.strength', { values: { capacity: r3(cap), need: r3(need), a: capA, b: capB, couple: r3(couple), per: r3(per), bearing, tear, shank, arm, modulusA: zA, modulusB: zB }, refs: { thread, weakest, kind: 'estimate' } }));
  out.push(finding('info', `${said}: ${thread} x ${pick.length} button-head screws across the lap ${mm(ys - -H / 2)} mm over the bed, their heads in seats ${mm(cb.depth)} mm deep in the front face of the half toward a, their nuts in pockets ${mm(pocket)} mm deep in the back face of the half toward b, all on their side as teardrops. A key ${mm(key)} mm deep and ${mm(kz)} mm long steps the cut in the middle of the lap and locks the halves along the beam`, 'splice.screw', { values: { length: pick.length, height: r3(ys + H / 2), seat: cb.depth, pocket, key, keyLength: kz }, refs: { thread } }));
  return { kind: 'splice', beam: b, name: `splice in ${b.name}`, at: r3(at), lap, fit: g, key, keyLength: kz,
    screws: zs.map((z) => ({ thread, head: 'button', length: pick.length, at: [-W / 2 + cb.depth, ys, z], axis: [1, 0, 0], seat: cb.depth, pocket, hole: np.hole })),
    halves: { a: { modulus: zA, capacity: capA, section: secA }, b: { modulus: zB, capacity: capB, section: secB } }, pieces,
    capacity: r3(cap), couple: r3(couple), need: r3(need), share: r3(share(at)), findings: out };
}

/**
 * A splice's two halves as they print, each lying down on the bed from x = 0: over the lap the half toward end a keeps
 * the front side of the section (-x) and the half toward end b the back side, the key a step in the cut, with the screws'
 * holes, the heads' seats and the nuts' pockets on their side as teardrops, and the beam's own ends as printedBeam cuts them.
 * @param {object} s a splice's model (spliceModel) @returns {[object, object]} two JSCAD geom3, each with .model the splice's and .piece its index
 */
export function splice(s) {
  if (s?.kind !== 'splice') throw new Error(`splice: give a splice's model (spliceModel), not ${shown(s)}`);
  const b = s.beam, p = b.profile, W = p.width, H = p.height, L = b.length, g = s.fit;
  // the section's front side (-x) up to x, between z1 and z2
  const frontTo = (x, z1, z2) => translate([(x - W / 2 - 1) / 2, 0, (z1 + z2) / 2], cuboid({ size: [x + W / 2 + 1, H + 2, z2 - z1] }));
  const box = (z1, z2) => translate([0, 0, (z1 + z2) / 2], cuboid({ size: [W + 2, H + 2, z2 - z1] }));
  const z0 = s.at - s.lap / 2, z1 = s.at + s.lap / 2, k0 = s.at - s.keyLength / 2, k1 = s.at + s.keyLength / 2, full = beam(b, { display: 'preview' });
  const keepA = union(box(-1, z0), frontTo(-g / 2, z0 - 0.01, z1 - g), frontTo(s.key - g / 2, k0 + g / 2, k1 - g / 2));
  const keepB = subtract(box(z0 + g, L + 1), union(frontTo(g / 2, z0 - 1, z1), frontTo(s.key + g / 2, k0, k1)));
  return [[intersect(full, keepA), 0, 'a'], [intersect(full, keepB), z0 + g, 'b']].map(([part, shift, end], i) => {
    const pl = placer(b, shift);
    let solid = pl.solid(part);
    const cuts = [...endCutters(b, end, pl)];
    for (const sc of s.screws) { // across the lap: the head's seat and the hole from the front face of a, the nut's pocket and the hole from the back face of b
      const [, y, z] = sc.at;
      if (end === 'a') cuts.push(counterbore(sc.thread, { head: 'button', into: pl.across(1), at: pl.point([-W / 2, y, z]), length: W / 2 + 1 }));
      else cuts.push(hole(sc.thread, { kind: 'clearance', into: pl.across(-1), depth: W / 2 + 1, through: true, at: pl.point([W / 2, y, z]) }), nutPocket(sc.thread, { into: pl.across(-1), at: pl.point([W / 2, y, z]), depth: sc.pocket }));
    }
    solid = subtract(solid, ...cuts);
    return Object.assign(solid, { model: s, piece: i, grams: r3((measureVolume(solid) * (b.printed.section.plastic / b.printed.section.solid.area) * b.material.density) / 1000) });
  });
}
