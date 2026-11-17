// Printed beams as solids: a printed beam laid as it prints, its ends' heat-set inserts or captive nuts cut in, and a
// splice that joins two printed halves of a beam longer than the bed.
//
// Lying down, a beam's bottom face is on the bed and its length runs along x from end a at x = 0; its section's x is
// the bed's y and its y is up (z). Standing, end a is on the bed and the beam runs up z, its section as drawn.
//
// A splice is a lap: over the lap, the half toward end a keeps a ridge on the bed, a triangle with 45° sides whose apex
// is under the slot, and the half toward end b keeps the rest, its notch open to the bed, so both print lying down with
// no support. In the middle of the lap the ridge rises into a key that locks the halves along the beam. Two screws pass
// across the lap, square to the beam, low down where the notch's cheeks are thickest: a button head sunk in the back face,
// a nut in a pocket in the front face. Units: mm, grams, newtons.
import jscad from '@jscad/modeling';
import { fixingModel, hole, nutTrap, nutTrapModel, nutPocket, nutPocketModel } from '@rulecad/fixings';
import { beamModel, beam } from './beam.mjs';
import { PRINTED_DEFAULTS, printerFigures } from './printing.mjs';

const { cuboid, polygon } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { subtract, union, intersect } = jscad.booleans;
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
  const cuts = [...endCutters(b, 'a', pl), ...endCutters(b, 'b', pl)];
  if (cuts.length) g = subtract(g, ...cuts);
  return Object.assign(g, { model: b });
}

/**
 * A splice for a printed beam longer than the bed, as numbers: where it goes, the lap, the key and the screws, each half's
 * length and grams, and findings (splice.fit, splice.place, splice.strength, splice.screw) in the kit's one shape. The lap
 * is sized from the screws' bearing in the plastic so that the joint carries what the beam carries there, with the
 * margin a printed part is sized to: the moment given, or the beam's own design moment times the share a spread load on
 * a simply supported span puts at the splice (4 z (L - z) / L²). Placed, unless told, as far from the middle as the bed
 * lets both halves be.
 * @param {object} m a printed beam's model, lying down
 * @param {{ at?: number, moment?: number, thread?: string, printer?: object }} [o] at: the middle of the lap, mm from end a;
 *   moment: N·mm the joint must carry there; thread: the screws' (the largest from M5 down whose nut and head fit the cheeks); printer: as the beam's
 * @returns {object} { kind: 'splice', beam, at, lap, apex, key, screws, pieces, capacity, need, share, findings, ... }
 */
export function spliceModel(m, o = {}) {
  const what = 'spliceModel', b = printedModel(what, m, {});
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: options are { at, moment, thread, printer }, not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!['at', 'moment', 'thread', 'printer'].includes(k)) throw new Error(`${what}: no option "${k}": it takes at, moment, thread and printer`);
  const p = b.profile, L = b.length, W = p.width, H = p.height, P = printerFigures(what, o.printer ?? null), bed = P.n('bed'), line = P.n('line'), fit = P.n('fit');
  if (b.printed.pose !== 'lying') throw new Error(`${what}: ${b.name} prints standing up: a splice joins halves printed lying down (printed: { pose: 'lying' })`);
  if (p.cells[0] !== 1 || p.cells[1] !== 1) throw new Error(`${what}: ${p.name} is ${p.cells.join(' by ')} cells: a splice is drawn for a one-cell section`);
  if (p.faces.bottom.some((q) => q.slot) || p.faces.front.some((q) => q.slot) || p.faces.back.some((q) => q.slot)) throw new Error(`${what}: ${p.name} has a slot where the splice's ridge, notch or screws go: a splice is drawn for a section slotted on top only (profile-2020-printed)`);
  if (o.at != null && !(isNum(o.at) && o.at > 0 && o.at < L)) throw new Error(`${what}: at is the middle of the lap, in mm from end a, between 0 and ${mm(L)} (got ${shown(o.at)})`);
  if (o.moment != null && !(isNum(o.moment) && o.moment >= 0)) throw new Error(`${what}: moment is what the joint must carry, in N·mm, 0 or more (got ${shown(o.moment)})`);
  const top = p.faces.top.find((q) => q.slot), yFloor = top ? H / 2 - p.slots[top.slot].cavityDepth : H / 2;
  const cheek = r3(PRINTED_DEFAULTS.cheek.value * line), hb = W / 2 - cheek, apex = r3(-H / 2 + hb), over = r3(yFloor - apex), key = r3(Math.min(cheek / 2, over / 2)); // (the key's base keeps half a cheek on the bed beside it)
  if (!(over >= 2 * cheek - 1e-9)) throw new Error(`${what}: ${p.name}: the slot's floor is ${mm(over)} mm over the ridge's apex, under the ${mm(2 * cheek)} mm a key needs: a shallower slot or a larger section`);
  // ---- the screws: upright through the lap, the largest thread whose button head passes the slot's opening to sit on its
  // floor, and whose nut's pocket, open to the bed under the ridge, leaves plastic over it; a length sold that reaches
  // through the nut from the slot's floor without standing out of the bed ----
  const opening = top ? p.slots[top.slot].opening : Infinity, floorW = top ? p.slots[top.slot].floorWidth : W;
  const threads = o.thread ? [o.thread] : ['M5', 'M4', 'M3'], tau = b.printed.strength / Math.sqrt(3), tB = r3(yFloor - apex);
  let pick = null;
  for (const t of threads) {
    const fx = fixingModel(t);
    if (!fx.made.heads.includes('button')) continue;
    const dk = fx.figures.button_head.value, np = nutPocketModel(t, { into: '+z' }), high = yFloor + H / 2;
    if (dk >= opening || dk > floorW) continue;
    const stock = (fx.figures.lengths?.value ?? []).filter((x) => x <= high + 1e-9).sort((a, c) => c - a)[0];
    if (!stock) continue;
    const pocket = r3(Math.max(np.depth, high - stock + np.height)), tA = r3(apex - np.flats / 2 - (-H / 2 + pocket + np.roof));
    if (tA < 2 * line) continue;
    pick = { thread: t, fx, np, dk, length: stock, pocket, tA };
    break;
  }
  if (!pick) throw new Error(`${what}: ${p.name}: no thread of ${threads.join(', ')} has a button head that passes its slot's ${mm(opening)} mm opening and a nut whose pocket under the ridge leaves ${mm(2 * line)} mm over it: a larger section`);
  const { thread, fx, np, dk, pocket, tA } = pick, d = fx.major, hole_ = np.hole;
  // ---- what one screw carries in tension: its head pulling through the plastic over the notch, its nut pulling out
  // of the ridge (each a cylinder sheared at the plastic's strength over root 3, von Mises), or its own proof load ----
  const headOut = r3(Math.PI * dk * tB * tau), nutOut = r3(Math.PI * np.flats * tA * tau), shank = r3((Math.PI / 4) * (d - 0.9382 * fx.pitch) ** 2 * (fx.figures.proof_stress?.value ?? 580));
  const per = Math.min(headOut, nutOut, shank);
  // ---- the lap: from twice the height, longer until two screws carry the moment there; placed where the bed lets it be furthest from the middle ----
  const edge = r3(2.5 * d), margin = PRINTED_DEFAULTS.margin.value, failMoment = b.printed.design * margin;
  const share = (z) => (4 * z * (L - z)) / (L * L);
  let lap = r3(PRINTED_DEFAULTS.lap.value * H), at = null, need = null, cap = null, tries = 0;
  for (; tries < 400; tries++, lap = r3(lap + line)) {
    const lo = Math.max(L + lap / 2 - bed, lap / 2), hi = Math.min(bed - lap / 2, L - lap / 2);
    if (lo > hi + 1e-9) break;
    at = o.at ?? (Math.abs(lo - L / 2) >= Math.abs(hi - L / 2) ? lo : hi);
    if (o.at != null && (o.at < lo - 1e-9 || o.at > hi + 1e-9)) break;
    need = o.moment != null ? o.moment * margin : share(at) * failMoment; cap = per * (lap - 2 * edge);
    if (cap >= need - 1e-9) break;
  }
  const lo = Math.max(L + lap / 2 - bed, lap / 2), hi = Math.min(bed - lap / 2, L - lap / 2);
  if (lo > hi + 1e-9 || (o.at != null && (o.at < lo - 1e-9 || o.at > hi + 1e-9)) || cap < need - 1e-9) throw new Error(`${what}: ${b.name}: no lap with two ${thread} screws carries ${mm((need ?? 0) / 1000)} N·m within ${P.name}'s ${mm(bed)} mm bed${o.at != null ? ` with its middle at ${mm(o.at)} mm` : ''}: splice it in three, give the moment the frame puts there (moment), or a larger section`);
  const zs = [r3(at - lap / 2 + edge), r3(at + lap / 2 - edge)], kz = r3(Math.max(2 * line, Math.min(H, zs[1] - zs[0] - 2 * (np.corner / 2 + 2 * line)))), arm = r3(zs[1] - zs[0]);
  const lenA = r3(at + lap / 2), lenB = r3(L - at + lap / 2), area = b.printed.section.solid.area, q = (hb * hb) / area, gPer = b.mass / L;
  const pieces = [{ name: `${b.name} a`, from: 0, to: lenA, length: lenA, grams: r3(gPer * (at - lap / 2) + gPer * lap * q) }, { name: `${b.name} b`, from: r3(at - lap / 2), to: L, length: lenB, grams: r3(b.mass - (gPer * (at - lap / 2) + gPer * lap * q)) }];
  const out = [], said = `the splice in ${b.name}`;
  out.push(finding(Math.max(lenA, lenB) <= bed + 1e-9 ? 'pass' : 'fail', `${said}: its halves are ${mm(lenA)} and ${mm(lenB)} mm long, each on ${P.name}'s ${mm(bed)} mm bed, lying down with no support (the half toward a keeps the ridge, the half toward b the notch, open to the bed)`, 'splice.fit', { values: { a: lenA, b: lenB, bed } }));
  out.push(finding('info', o.moment != null ? `${said}: its lap's middle is ${mm(at)} mm from end a, where the frame puts ${mm(o.moment / 1000)} N·m` : `${said}: its lap's middle is ${mm(at)} mm from end a, as far from the middle as the bed lets it be: a spread load on a simply supported span puts ${Math.round(share(at) * 100)}% of its greatest moment there (an assumed loading; give the frame's moment where it is known)`, 'splice.place', { values: { at, share: r3(share(at)), lap } }));
  out.push(finding(cap >= need - 1e-9 ? 'pass' : 'fail', `${said}: two ${thread} screws ${mm(arm)} mm apart across a ${mm(lap)} mm lap carry ${mm(cap / 1000)} N·m, ${o.moment != null ? `${margin} times the ${mm(o.moment / 1000)} N·m given` : `the ${mm(need / 1000)} N·m the beam itself breaks at there (${mm(failMoment / 1000)} N·m at its middle, times ${Math.round(share(at) * 100)}%), so the joint is as strong as the beam it joins`}: each screw holds ${mm(per)} N, the least of its nut pulling out of the ${mm(tA)} mm of ridge over it (${mm(nutOut)} N), its head pulling through the ${mm(tB)} mm over the notch (${mm(headOut)} N) and its proof load (${mm(shank)} N). An estimate: plastic sheared at its strength over root 3`, 'splice.strength', { values: { capacity: r3(cap), need: r3(need), per: r3(per), nut: nutOut, head: headOut, shank, arm }, refs: { thread, kind: 'estimate' } }));
  out.push(finding('info', `${said}: ${thread} x ${pick.length} button-head screws dropped through the slot's opening, their heads on its floor, upright through the lap into nuts in pockets ${mm(pocket)} mm deep in the ridge's underside, open to the bed with a 45° roof. The key rises ${mm(key)} mm over ${mm(kz)} mm in the middle of the lap and locks the halves along the beam; the slot's nuts cannot pass over the screws' heads`, 'splice.screw', { values: { length: pick.length, pocket, key, keyLength: kz }, refs: { thread } }));
  return { kind: 'splice', beam: b, name: `splice in ${b.name}`, at: r3(at), lap, apex, cheek, key, keyLength: kz, fit,
    screws: zs.map((z) => ({ thread, head: 'button', length: pick.length, at: [0, yFloor, z], axis: [0, -1, 0], pocket, hole: hole_ })), floor: r3(yFloor), pieces,
    capacity: r3(cap), need: r3(need), share: r3(share(at)), findings: out };
}

/**
 * A splice's two halves as they print, each lying down on the bed from x = 0: the half toward end a with its ridge and
 * key, the half toward end b with its notch, both with the screws' teardrop holes, the heads' seats and the nuts'
 * pockets, and the beam's own ends as printedBeam cuts them.
 * @param {object} s a splice's model (spliceModel) @returns {[object, object]} two JSCAD geom3, each with .model the splice's and .piece its index
 */
export function splice(s) {
  if (s?.kind !== 'splice') throw new Error(`splice: give a splice's model (spliceModel), not ${shown(s)}`);
  const b = s.beam, p = b.profile, W = p.width, H = p.height, L = b.length, g = s.fit, drop = (g / 2) * Math.SQRT2, e = 0.5;
  const tri = (top, z1, z2) => { const h = top + H / 2 + e; return translate([0, 0, z1], extrudeLinear({ height: z2 - z1 }, polygon({ points: [[-h, -H / 2 - e], [h, -H / 2 - e], [0, top]] }))); };
  const box = (z1, z2) => translate([0, 0, (z1 + z2) / 2], cuboid({ size: [W + 2, H + 2, z2 - z1] }));
  const z0 = s.at - s.lap / 2, z1 = s.at + s.lap / 2, k0 = s.at - s.keyLength / 2, k1 = s.at + s.keyLength / 2, full = beam(b, { display: 'preview' });
  const keepA = union(box(-1, z0), tri(s.apex - drop, z0 - 0.01, z1 - g), tri(s.apex + s.key - drop, k0 + g / 2, k1 - g / 2));
  const keepB = subtract(box(z0 + g, L + 1), union(tri(s.apex, z0 - 1, z1), tri(s.apex + s.key, k0, k1)));
  return [[intersect(full, keepA), 0, 'a'], [intersect(full, keepB), z0 + g, 'b']].map(([part, shift, end], i) => {
    const pl = placer(b, shift);
    let solid = pl.solid(part);
    const cuts = [...endCutters(b, end, pl)];
    for (const sc of s.screws) { // upright: down from the slot's floor through the half toward b, up from the bed through the ridge with the nut's pocket
      const z = sc.at[2];
      if (end === 'b') cuts.push(hole(sc.thread, { kind: 'clearance', into: '-z', depth: s.floor - s.apex + 1, through: true, at: pl.point([0, s.floor, z]) }));
      else cuts.push(hole(sc.thread, { kind: 'clearance', into: '+z', depth: s.apex + H / 2 + 1, through: true, at: pl.point([0, -H / 2, z]) }), nutPocket(sc.thread, { into: '+z', at: pl.point([0, -H / 2, z]), depth: sc.pocket }));
    }
    solid = subtract(solid, ...cuts);
    return Object.assign(solid, { model: s, piece: i, grams: r3((measureVolume(solid) * (b.printed.section.plastic / b.printed.section.solid.area) * b.material.density) / 1000) });
  });
}
