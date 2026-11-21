// The cut list: a frame's beams by profile and length, each kind of beam with its mark, and the bars to buy. Beams that
// are the same (one profile, one material, one length and the same operations at the same places) share a mark, A, B,
// C and on, and one cut-and-drill sheet. Each profile's beams are packed into the lengths it is sold in, with the saw's
// kerf taken at every cut and a trim allowance off the first end of every bar: the bars to buy, the cut order on each,
// and what is left of each, the offcut.
//
// The packing is first-fit decreasing, a simple rule that is not always the fewest bars: the longest beam first, each on
// the first bar with room for it, else on a new bar. It is run with each sold length as the length of a new bar (and
// once with the shortest that holds the beam), each bar then cut down to the shortest sold length that holds what is on
// it, and the plan that buys the least metal kept (then the fewest bars). Units: mm, grams.

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const d1 = (x) => Number(x).toFixed(1);
const EPS = 1e-9;
const CHECKED = '2026-11-15';

/**
 * The rules the cut list packs and checks by, each with what it rests on. A workshop that knows its own saw gives its
 * own: cutList(beams, { kerf: 2.4, trim: 5 }).
 * @type {Record<'kerf' | 'trim' | 'tolerance' | 'stock', { value: number, unit: string, rule: string, kind: string, source: string, checked: string }>}
 */
export const CUT_DEFAULTS = {
  kerf: { value: 3, unit: 'mm', rule: 'The width of metal a cut takes, taken at every cut on a bar: a 250 mm carbide blade for aluminium and other non-ferrous metals (80 teeth, 30 mm bore) cuts 3.0 mm on a 2.2 mm plate. A mitre or chop saw for aluminium extrusion commonly takes a blade of this size; give your own saw\'s', kind: 'default', source: 'Popular Tools NF2503080 non-ferrous saw blade, 250 mm x 80T TCG, sold by Carbide Processors, https://carbideprocessors.com/non-ferrous-cutting-saw-blade-250mm-x-80t-tcg-popular-tools-nf2503080', checked: CHECKED },
  trim: { value: 10, unit: 'mm', rule: 'Cut off the first end of every bar to square it before the first beam is measured: a mill end can be bruised, burred or out of square from the extruder\'s saw. A working allowance, not taken from a supplier: no figure for it was found', kind: 'estimate', source: 'workshop practice, not checked against a supplier', checked: CHECKED },
  tolerance: { value: 0.5, unit: 'mm', rule: 'How far a cut length may be from the length asked, either way, where the profile\'s set gives no cut_tolerance: MISUMI\'s for its cut lengths of extrusion, taken for any saw cut against a stop. A hand saw to a pencil line does worse', kind: 'estimate', source: 'MISUMI FA Mechanical Standard Components catalogue 2014, page 2-527, https://my.misumi-ec.com/pdf/fa/2014/p2_527.pdf ("L Dimension Tolerance ±0.5mm"), taken for other saws without a check', checked: CHECKED },
  stock: { value: 6000, unit: 'mm', rule: 'The bar length a profile is packed into where its set gives no lengths and no cut-to-length range: 6 m, the length Bosch Rexroth and item sell their profiles in (their sets in @rulecad/rules). Taken for a generic section without a check: ask your supplier', kind: 'estimate', source: 'the lengths rules of profile-2020-bosch and profile-2020-item-5 in @rulecad/rules, taken for other profiles without a check', checked: CHECKED },
};

const OPTIONS = ['kerf', 'trim', 'tolerance', 'stock'];

// The rules as used: the defaults, or what was given (a workshop's own, so kind measured)
function rulesOf(o, what) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the options are { ${OPTIONS.join(', ')} }, each a number in mm (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!OPTIONS.includes(k)) throw new Error(`${what}: no option "${k}": it takes ${OPTIONS.join(', ')}, each a number in mm`);
  return Object.fromEntries(OPTIONS.map((k) => {
    if (o[k] == null) return [k, { ...CUT_DEFAULTS[k] }];
    const v = o[k], min = k === 'stock' ? EPS : 0;
    if (!(isNum(v) && v >= min)) throw new Error(`${what}: ${k} is a number in mm, ${k === 'stock' ? 'above' : 'at least'} 0 (got ${shown(v)})`);
    return [k, { value: v, unit: 'mm', rule: `${CUT_DEFAULTS[k].rule.split(':')[0]}: given`, kind: 'measured', source: 'given to cutList', checked: CHECKED }];
  }));
}

// The beams as { id, beam }: a list of those, or of beam models (named 1, 2, 3 in order)
function beamsOf(list, what) {
  if (!Array.isArray(list)) throw new Error(`${what}: give a list of beams, each a beam's model (beamModel) or { id, beam } (got ${shown(list)})`);
  return list.map((x, i) => {
    const b = x?.kind === 'beam' ? x : x?.beam, id = x?.kind === 'beam' ? String(i + 1) : x?.id;
    if (b?.kind !== 'beam') throw new Error(`${what}: beams[${i}] is a beam's model (beamModel) or { id, beam } (got ${shown(x)})`);
    if (typeof id !== 'string' || !id) throw new Error(`${what}: beams[${i}]'s id is a name, such as x1 (got ${shown(id)})`);
    return { id, beam: b };
  });
}

// A, B, ... Z, AA, AB, ...
const letters = (n) => { let s = ''; for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };
// What makes two beams the same: profile, material, length and every operation's line (each says where and how big)
// (the ops in their place along the beam, as the model keeps them, so a mark does not hang on the order its sheet lists them in)
const keyOf = (b) => JSON.stringify([b.profile.name, b.material?.name ?? null, +b.length.toFixed(2), b.ops.map((o) => o.line)]);

/**
 * The beams by mark: beams that are the same (one profile, one material, one length and the same operations at the
 * same places) share one, A, B, C and on, in order of profile and then the longest first.
 * @param {object[]} beams beams' models (beamModel), or { id, beam } with an item's name
 * @returns {{ mark: string, beam: object, items: string[], count: number }[]}
 */
export function beamMarks(beams) {
  const list = beamsOf(beams, 'beamMarks'), by = new Map();
  for (const { id, beam } of list) { const k = keyOf(beam), g = by.get(k) ?? { beam, items: [], key: k }; g.items.push(id); by.set(k, g); }
  return [...by.values()].sort((p, q) => p.beam.profile.name.localeCompare(q.beam.profile.name) || q.beam.length - p.beam.length || p.key.localeCompare(q.key))
    .map((g, i) => ({ mark: letters(i), beam: g.beam, items: g.items, count: g.items.length }));
}

// One plan: first-fit decreasing, new bars of open(piece) long, each then cut down to the shortest sold length that holds it
function firstFit(pieces, sold, open, kerf, trim) {
  const bars = [];
  for (const p of pieces) {
    const need = p.length + kerf;
    let bar = bars.find((b) => b.free >= need - EPS);
    if (!bar) { const L = open(p); bar = { length: L, free: L - trim, cuts: [] }; bars.push(bar); }
    bar.cuts.push(p); bar.free -= need;
  }
  for (const b of bars) { const used = b.length - b.free, L = sold.find((s) => s >= used - EPS); b.free += L - b.length; b.length = L; }
  return bars;
}

/**
 * Pieces packed into bars of the lengths sold, first-fit decreasing: every cut takes a kerf (the last one too, which
 * parts the piece from the offcut), and the first end of each bar is trimmed square. A piece longer than a bar can give
 * is left out, in unpacked.
 * @param {{ length: number }[]} pieces each with its length, and anything else to keep (its mark, its item)
 * @param {number[]} lengths the lengths sold, mm
 * @param {{ kerf?: number, trim?: number }} [o] mm (CUT_DEFAULTS' kerf and trim where left out)
 * @returns {{ bars: { length: number, cuts: object[], offcut: number }[], buy: { length: number, count: number }[], unpacked: object[], bought: number, offcut: number }}
 *   each cut carries at, where it starts from the bar's trimmed end (mm from the bar's first end)
 */
export function packBars(pieces, lengths, o = {}) {
  const what = 'packBars';
  if (!Array.isArray(pieces) || pieces.some((p) => !(isNum(p?.length) && p.length > 0))) throw new Error(`${what}: pieces is a list of { length }, each above 0 mm (got ${shown(pieces)})`);
  if (!Array.isArray(lengths) || !lengths.length || lengths.some((l) => !(isNum(l) && l > 0))) throw new Error(`${what}: lengths is a list of the lengths sold, each above 0 mm (got ${shown(lengths)})`);
  const r = rulesOf({ ...(o.kerf != null ? { kerf: o.kerf } : {}), ...(o.trim != null ? { trim: o.trim } : {}) }, what), kerf = r.kerf.value, trim = r.trim.value;
  const sold = [...new Set(lengths)].sort((a, b) => a - b), longest = sold.at(-1), room = longest - trim;
  const sorted = [...pieces].sort((a, b) => b.length - a.length), fits = sorted.filter((p) => p.length + kerf <= room + EPS), unpacked = sorted.filter((p) => p.length + kerf > room + EPS);
  let best = [];
  if (fits.length) {
    const opens = [(p) => sold.find((s) => s - trim >= p.length + kerf - EPS), ...sold.map((s) => (p) => (s - trim >= p.length + kerf - EPS ? s : longest))];
    const plans = opens.map((open) => firstFit(fits, sold, open, kerf, trim)), total = (bars) => bars.reduce((t, b) => t + b.length, 0);
    best = plans.reduce((a, b) => (total(b) < total(a) - EPS || (Math.abs(total(b) - total(a)) <= EPS && b.length < a.length) ? b : a));
  }
  // each bar's cut order: the trim, then the longest first, as packed
  const bars = best.sort((a, b) => b.length - a.length || b.cuts.length - a.cuts.length).map((b) => {
    let at = trim;
    const cuts = b.cuts.map((p) => { const c = { ...p, at: +at.toFixed(6) }; at += p.length + kerf; return c; });
    return { length: b.length, cuts, offcut: +(b.length - at).toFixed(6) };
  });
  const buy = sold.map((l) => ({ length: l, count: bars.filter((b) => b.length === l).length })).filter((x) => x.count).reverse();
  return { bars, buy, unpacked, bought: bars.reduce((t, b) => t + b.length, 0), offcut: +bars.reduce((t, b) => t + b.offcut, 0).toFixed(6), kerf, trim };
}

// An operation in a few words for the list
function opWords(o) {
  const at = o.end ? `at ${o.end}` : `at ${o.place}@${d1(o.distance)}`;
  if (o.op === 'mitre') return `mitre ${mm(o.angle)}° about ${o.about} ${at}`;
  if (o.op === 'tap') return `tap ${o.thread} x ${mm(o.depth)} ${at}`;
  if (o.op === 'access' || o.op === 'drill') return `${o.op} ${o.thread && o.kind === 'tap' ? o.thread : `Ø${mm(o.diameter)}`} ${at}`;
  if (o.op === 'counterbore') return `counterbore Ø${mm(o.seat.diameter)} ${at}`;
  if (o.op === 'pocket') return `pocket ${o.size ? `${mm(o.size[0])} x ${mm(o.size[1])}` : 'by outline'} ${at}`;
  if (o.op === 'notch') return `notch ${mm(o.length)} ${at}`;
  return `${o.op} ${at}`;
}

/**
 * A frame's cut list: each mark (beams that are the same) with its count, mass and operations, and for each profile the
 * bars to buy, the cut order on each and its offcut, with the checks frame.cut makes (a beam longer than any sold length,
 * lengths the cut tolerance cannot hold apart, beams that must match). Weighed by the maker's sheet where it gives a mass
 * per metre, else by the drawn section.
 * @param {object[]} beams beams' models (beamModel), or { id, beam } with an item's name
 * @param {{ kerf?: number, trim?: number, tolerance?: number, stock?: number }} [o] mm, a workshop's own; CUT_DEFAULTS' where left out
 *   (a tolerance given is taken before a profile's own cut_tolerance: the maker's figure is for its cut service)
 *   stock: each profile's { profile, supply ('sold', 'cut' by the maker, or 'assumed'), lengths, cuts (each length to cut and how
 *   many), bars, buy, unpacked, bought, offcut, kerf, trim, tolerance }
 * @returns {{ marks: object[], stock: object[], rules: object, totals: { beams: number, grams: number, bars: number, bought: number, offcut: number }, findings: object[] }}
 */
export function cutList(beams, o = {}) {
  const what = 'cutList', rules = rulesOf(o, what), marks = beamMarks(beamsOf(beams, what)), findings = [];
  const kerf = rules.kerf.value, trim = rules.trim.value;
  const lines = marks.map(({ mark, beam: b, items, count }) => {
    const mitre = b.ops.find((x) => x.op === 'mitre' && x.shortLength != null), grams = b.weight?.sheet ?? b.mass;
    return { mark, profile: b.profile.name, material: b.material?.name ?? null, length: b.length, ...(mitre ? { shortLength: Math.min(...b.ops.filter((x) => x.op === 'mitre').map((x) => x.shortLength)) } : {}),
      count, items, grams: grams != null ? +grams.toFixed(1) : null, weighedBy: b.weight?.sheet != null ? 'sheet' : b.mass != null ? 'section' : null,
      ops: b.ops.filter((x) => !x.implied).map(opWords), beam: b }; // (along the beam, from end a)
  });
  const profiles = [...new Set(lines.map((l) => l.profile))], stock = [];
  for (const name of profiles) {
    const ls = lines.filter((l) => l.profile === name), p = ls[0].beam.profile, s = p.supply, tol = o.tolerance != null ? rules.tolerance.value : s.cutTolerance ?? rules.tolerance.value; // (a workshop's own, given, before the maker's cut service)
    const tolRule = o.tolerance != null ? 'tolerance (given)' : s.cutTolerance != null ? 'cut_tolerance' : 'cut tolerance (CUT_DEFAULTS)';
    const pieces = ls.flatMap((l) => l.items.map((item) => ({ mark: l.mark, item, length: l.length })));
    let entry;
    if (s.lengths.length || s.cutMax == null) {
      const sold = s.lengths.length ? s.lengths : [rules.stock.value], r = packBars(pieces, sold, { kerf, trim });
      entry = { profile: name, supply: s.lengths.length ? 'sold' : 'assumed', lengths: [...sold].sort((a, b) => a - b), tolerance: tol, ...r };
      const room = Math.max(...sold) - trim - kerf;
      for (const u of r.unpacked) findings.push({ level: 'fail', code: 'frame.cut', text: `${u.item}: ${mm(u.length)} mm of ${name} is longer than any length it is ${s.lengths.length ? 'sold' : 'taken to come'} in (${entry.lengths.map(mm).join(', ')} mm): a bar gives ${mm(room)} mm after a ${mm(trim)} mm trim and a ${mm(kerf)} mm cut. Join two lengths along it, or buy it cut to length`, values: { length: u.length, room }, refs: { item: u.item, mark: u.mark, profile: name, rule: s.lengths.length ? 'lengths' : 'stock' } });
    } else {
      // no sold lengths, but the maker cuts to length: each beam is bought at its length, no saw of ours
      const bars = pieces.filter((x) => x.length <= s.cutMax + EPS).map((x) => ({ length: x.length, cuts: [{ ...x, at: 0 }], offcut: 0 })), unpacked = pieces.filter((x) => x.length > s.cutMax + EPS);
      const buy = [...new Set(bars.map((b) => b.length))].sort((a, b) => b - a).map((l) => ({ length: l, count: bars.filter((b) => b.length === l).length }));
      entry = { profile: name, supply: 'cut', lengths: [], cutMin: s.cutMin, cutMax: s.cutMax, tolerance: tol, bars, buy, unpacked, bought: bars.reduce((t, b) => t + b.length, 0), offcut: 0, kerf: 0, trim: 0 };
      for (const u of unpacked) findings.push({ level: 'fail', code: 'frame.cut', text: `${u.item}: ${mm(u.length)} mm of ${name} is longer than the ${mm(s.cutMax)} mm the maker cuts it to: join two lengths along it`, values: { length: u.length, cutMax: s.cutMax }, refs: { item: u.item, mark: u.mark, profile: name, rule: 'cut_length_max' } });
    }
    // the lengths to cut, longest first, however many marks share one
    entry.cuts = [...new Set(pieces.map((x) => +x.length.toFixed(2)))].sort((a, b) => b - a).map((l) => ({ length: l, count: pieces.filter((x) => Math.abs(x.length - l) < 0.005).length }));
    stock.push(entry);
    // lengths the cut tolerance cannot hold apart: two marks nearer than two cuts' tolerance
    const byLength = [...ls].sort((a, b) => a.length - b.length);
    for (let i = 0; i + 1 < byLength.length; i++) {
      const a = byLength[i], b = byLength[i + 1], gap = b.length - a.length;
      if (gap > 1e-6 && gap < 2 * tol - EPS) findings.push({ level: 'warn', code: 'frame.cut', text: `${name}: mark ${a.mark} (${a.items.join(', ')}) at ${mm(a.length)} mm and mark ${b.mark} (${b.items.join(', ')}) at ${mm(b.length)} mm differ by ${mm(gap)} mm, less than two cuts at ±${mm(tol)} mm can hold apart: make them one length if they should match, or cut them against one stop`, values: { a: a.length, b: b.length, gap, tolerance: tol }, refs: { marks: [a.mark, b.mark], profile: name, rule: tolRule } });
    }
    for (const l of ls) if (l.count > 1 && tol > 0) findings.push({ level: 'info', code: 'frame.cut', text: `mark ${l.mark} (${l.items.join(', ')}): ${l.count} beams of ${mm(l.length)} mm, each cut to ±${mm(tol)} mm, may differ by up to ${mm(2 * tol)} mm: where they must match (opposite sides of a frame), cut them against one stop`, values: { length: l.length, count: l.count, tolerance: tol }, refs: { mark: l.mark, items: l.items, profile: name, rule: tolRule } });
  }
  const totals = { beams: lines.reduce((t, l) => t + l.count, 0), grams: +lines.reduce((t, l) => t + (l.grams ?? 0) * l.count, 0).toFixed(1), bars: stock.reduce((t, s) => t + s.bars.length, 0), bought: stock.reduce((t, s) => t + s.bought, 0), offcut: +stock.reduce((t, s) => t + s.offcut, 0).toFixed(3) };
  return { marks: lines, stock, rules, totals, findings };
}

/**
 * The cut list as lines of text: the marks, then each profile's bars to buy and the cuts on each.
 * @param {ReturnType<typeof cutList>} c @returns {string[]}
 */
export function cutListText(c) {
  const out = [];
  for (const l of c.marks) out.push([`  ${l.mark.padEnd(3)}${String(l.count).padStart(3)} ×`, `${l.profile} x ${mm(l.length)} mm${l.shortLength != null ? ` (short side ${mm(l.shortLength)})` : ''}`, l.grams != null ? `${mm(l.grams)} g each` : 'mass not given', l.ops.length ? l.ops.join('; ') : 'cut square', l.items.join(', ')].join('  '));
  for (const s of c.stock) {
    out.push(`  ${s.profile}: ${s.cuts.length} length${s.cuts.length === 1 ? '' : 's'}, ${s.cuts.map((x) => `${x.count} × ${mm(x.length)}`).join(', ')} mm`);
    if (s.supply === 'cut') { out.push(`  ${s.profile}: cut to length by the maker (${mm(s.cutMin ?? 0)} to ${mm(s.cutMax)} mm): ${s.buy.map((b) => `${b.count} × ${mm(b.length)} mm`).join(', ')}`); continue; }
    out.push(`  ${s.profile}: buy ${s.buy.map((b) => `${b.count} × ${mm(b.length)} mm`).join(', ')}${s.supply === 'assumed' ? ` (no sold length in its set: ${mm(s.lengths[0])} mm assumed)` : ''}; kerf ${mm(s.kerf)}, trim ${mm(s.trim)}; ${mm(s.offcut)} mm left over`);
    s.bars.forEach((b, i) => out.push(`    bar ${i + 1}, ${mm(b.length)} mm: trim ${mm(s.trim)}, ${b.cuts.map((x) => `${x.mark} ${mm(x.length)} (${x.item})`).join(', ')}; offcut ${mm(b.offcut)}`));
  }
  return out;
}
