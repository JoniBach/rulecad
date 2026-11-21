// Squaring a frame by its diagonals: a rectangular bay is square when the two diagonals across it are equal. A tape
// from one inside corner to the opposite one, then across the other two, is the measure; the difference between the
// two readings tells how far the bay leans. How small a difference to ask for comes from the beams themselves: each is
// cut to a tolerance t either way, so two opposite sides can differ in length by 2t. With every corner square, that
// alone moves one diagonal against the other by up to 2t × side / diagonal (the derivative of the diagonal's length
// with the side's), the larger side giving the most. A bay whose diagonals differ by more than that leans: loosen its
// joins, push the long diagonal's corners together, tighten and measure again.
//   Difference allowed, accept = 2 t max(w, h) / d, with d = √(w² + h²).
//   The lean it stands for, δ = accept × d / (2 w h) radians: a bay of sides w and h leaning by δ from square has
//   diagonals √(w² + h² ± 2 w h sin δ), which differ by about 2 w h δ / d.
// Joint play is a second source: the end of a beam sitting s off along the beam it meets moves one diagonal by
// s × span / d. The terms stack as an arm's error budget stacks its joints: summed for the worst case, and root-sum-square.
// Units: mm, degrees.
import { CUT_DEFAULTS } from './cutlist.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r2 = (x) => +x.toFixed(2), r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });

/**
 * The diagonals of a rectangular bay, inside corner to inside corner, and the difference between them to accept: what
 * the cut tolerances of its beams and the play of its joins allow with every corner square, stacked as an arm's error
 * budget stacks its joints (each term's share of the difference, summed for the worst case, and root-sum-square), with
 * the lean that difference stands for.
 *   A cut: a beam whose length sets the opening along it, cut t long or short, moves one diagonal against the other by
 *   t × span / d (span the opening along that beam). Two such beams opposite each other give the worst when one is long
 *   and the other short.
 *   A join's play: the end of a sitting s off along the beam it meets moves one corner along that beam, and one
 *   diagonal by s × span / d (span the opening along the beam it meets).
 * @param {number} width the bay's opening one way, inside face to inside face, mm
 * @param {number} height the opening the other way, mm
 * @param {{ tolerance?: number, cuts?: { name: string, along: 'width' | 'height', tolerance?: number, printed?: boolean }[], plays?: { name: string, along: 'width' | 'height', slip: number, kind?: string }[] }} [o]
 *   tolerance: how far a cut length may be from the length asked, either way, mm (CUT_DEFAULTS.tolerance where left
 *   out, an estimate; give the profile's cut_tolerance where its set has one); cuts: the beams whose cut lengths set
 *   the opening, each along the width or the height, with its own tolerance where it differs, and printed: true for a
 *   printed beam, whose length is printed, not cut (left out: two beams along the larger side); plays: each join's play, along the side of the beam it meets, in mm (JOIN_PLAY's)
 * @returns {{ width: number, height: number, diagonal: number, accept: number, rss: number, lean: number, tolerance: number, terms: { term: string, value: number, kind: string, note: string }[], text: string, rests: object[], findings: object[] }}
 *   diagonal: each diagonal's length as drawn; accept: the most the two may differ by (the terms summed); rss: their
 *   root-sum-square; lean: accept as an angle from square, degrees; terms: each one's share of the difference, mm
 */
export function squareness(width, height, o = {}) {
  const what = 'squareness';
  for (const [k, v] of [['width', width], ['height', height]]) if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is the bay's opening, inside face to inside face, a number of mm above 0 (got ${shown(v)})`);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the options are { tolerance, cuts, plays } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!['tolerance', 'cuts', 'plays'].includes(k)) throw new Error(`${what}: no option "${k}": it takes tolerance (the cut tolerance in mm), cuts and plays`);
  const given = o.tolerance != null, t = given ? o.tolerance : CUT_DEFAULTS.tolerance.value;
  if (!(isNum(t) && t >= 0)) throw new Error(`${what}: tolerance is how far a cut may be from its length either way, a number of mm, 0 or more (got ${shown(o.tolerance)})`);
  const d = Math.hypot(width, height), span = (along) => (along === 'width' ? width : height), side = (x, i, k) => {
    if (!x || typeof x !== 'object' || !['width', 'height'].includes(x.along)) throw new Error(`${what}: ${k} ${i + 1} is { name, along: 'width' or 'height'${k === 'plays' ? ', slip' : ''} } (got ${shown(x)})`);
  };
  for (const k of ['cuts', 'plays']) if (o[k] != null && !Array.isArray(o[k])) throw new Error(`${what}: ${k} is a list (got ${shown(o[k])})`);
  const tk = given ? 'given' : CUT_DEFAULTS.tolerance.kind, big = width >= height ? 'width' : 'height';
  const cuts = o.cuts ?? [{ name: `a beam along the ${big}`, along: big }, { name: `the beam opposite it`, along: big }];
  const terms = cuts.map((c, i) => {
    side(c, i, 'cuts');
    const ti = c.tolerance ?? t;
    if (!(isNum(ti) && ti >= 0)) throw new Error(`${what}: cuts ${i + 1}: tolerance is a number of mm, 0 or more (got ${shown(c.tolerance)})`);
    const made = c.printed ? 'printed' : 'cut';
    return { term: `${c.name ?? `beam ${i + 1}`} ${made}`, value: (ti * span(c.along)) / d, kind: c.tolerance != null ? (c.kind ?? 'given') : tk, note: `${made} to ±${mm(ti)} mm, setting the ${mm(span(c.along))} mm ${c.along}`, tolerance: ti, printed: !!c.printed };
  });
  (o.plays ?? []).forEach((p, i) => {
    side(p, i, 'plays');
    if (!(isNum(p.slip) && p.slip >= 0)) throw new Error(`${what}: plays ${i + 1}: slip is the join's play along the beam it meets, a number of mm, 0 or more (got ${shown(p.slip)})`);
    terms.push({ term: `${p.name ?? `join ${i + 1}`} play`, value: (p.slip * span(p.along)) / d, kind: p.kind ?? 'estimate', note: `${mm(p.slip)} mm along the ${mm(span(p.along))} mm ${p.along}` });
  });
  const worst = terms.reduce((a, x) => a + x.value, 0), rss = Math.sqrt(terms.reduce((a, x) => a + x.value * x.value, 0));
  const accept = worst, lean = ((accept * d) / (2 * width * height)) * (180 / Math.PI), plays = o.plays?.length ?? 0;
  // (a printed beam is not cut: its length is as printed, said so)
  const lengths = terms.filter((x) => x.tolerance != null), cutT = lengths.filter((x) => !x.printed).map((x) => x.tolerance), printT = lengths.filter((x) => x.printed).map((x) => x.tolerance);
  const made = [...(cutT.length || !printT.length ? [`beams cut to ±${mm(cutT.length ? Math.max(...cutT) : t)} mm`] : []), ...(printT.length ? [`beams printed to ±${mm(Math.max(...printT))} mm`] : [])].join(' and ');
  for (const x of terms) { delete x.tolerance; delete x.printed; }
  const why = plays ? `${made} and the play of ${plays} join${plays > 1 ? 's' : ''}, stacked worst case, every corner square; ${mm(r2(rss))} mm root-sum-square` : `${made}, every corner square`;
  const text = `measure both diagonals, inside corner to inside corner: each ${mm(d)} mm across the ${mm(width)} × ${mm(height)} mm opening; accept a difference of up to ${mm(r2(accept))} mm (${why}), about ${mm(r3(lean))}° of lean`;
  const out = terms.map((x) => ({ ...x, value: r3(x.value) }));
  return { width, height, diagonal: r2(d), accept: r2(accept), rss: r2(rss), lean: r3(lean), tolerance: t, terms: out, text,
    rests: [{ name: given ? 'tolerance (given)' : 'frames.cut.tolerance', value: t, unit: 'mm', kind: tk, rule: given ? 'The cut tolerance given' : CUT_DEFAULTS.tolerance.rule, source: given ? '' : CUT_DEFAULTS.tolerance.source }],
    findings: [finding('info', text, 'frame.square', { values: { diagonal: r2(d), accept: r2(accept), rss: r2(rss), lean: r3(lean), width: r2(width), height: r2(height), tolerance: t, terms: out } })] };
}
