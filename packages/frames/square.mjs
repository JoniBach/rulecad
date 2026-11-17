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
// Joint play is a second source, left to frame.square in the checks of a frame (Frames 3.4, issue 268). Units: mm, degrees.
import { CUT_DEFAULTS } from './cutlist.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r2 = (x) => +x.toFixed(2), r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });

/**
 * The diagonals of a rectangular bay, inside corner to inside corner, and the difference between them to accept: what
 * the cut tolerance of its beams allows when every corner is square, with the lean that difference stands for.
 * @param {number} width the bay's opening one way, inside face to inside face, mm
 * @param {number} height the opening the other way, mm
 * @param {{ tolerance?: number }} [o] tolerance: how far a cut length may be from the length asked, either way, mm
 *   (CUT_DEFAULTS.tolerance where left out, an estimate; give the profile's cut_tolerance where its set has one)
 * @returns {{ width: number, height: number, diagonal: number, accept: number, lean: number, tolerance: number, text: string, rests: object[], findings: object[] }}
 *   diagonal: each diagonal's length as drawn; accept: the most the two may differ by; lean: that difference as an angle from square, degrees
 */
export function squareness(width, height, o = {}) {
  const what = 'squareness';
  for (const [k, v] of [['width', width], ['height', height]]) if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is the bay's opening, inside face to inside face, a number of mm above 0 (got ${shown(v)})`);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the options are { tolerance } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (k !== 'tolerance') throw new Error(`${what}: no option "${k}": it takes tolerance, the cut tolerance in mm`);
  const given = o.tolerance != null, t = given ? o.tolerance : CUT_DEFAULTS.tolerance.value;
  if (!(isNum(t) && t >= 0)) throw new Error(`${what}: tolerance is how far a cut may be from its length either way, a number of mm, 0 or more (got ${shown(o.tolerance)})`);
  const d = Math.hypot(width, height), accept = (2 * t * Math.max(width, height)) / d, lean = ((accept * d) / (2 * width * height)) * (180 / Math.PI);
  const text = `measure both diagonals, inside corner to inside corner: each ${mm(d)} mm across the ${mm(width)} × ${mm(height)} mm opening; accept a difference of up to ${mm(r2(accept))} mm (beams cut to ±${mm(t)} mm, every corner square), about ${mm(r3(lean))}° of lean`;
  return { width, height, diagonal: r2(d), accept: r2(accept), lean: r3(lean), tolerance: t, text,
    rests: [{ name: given ? 'tolerance (given)' : 'frames.cut.tolerance', value: t, unit: 'mm', kind: given ? 'given' : CUT_DEFAULTS.tolerance.kind, rule: given ? 'The cut tolerance given' : CUT_DEFAULTS.tolerance.rule, source: given ? '' : CUT_DEFAULTS.tolerance.source }],
    findings: [finding('info', text, 'frame.square', { values: { diagonal: r2(d), accept: r2(accept), lean: r3(lean), width: r2(width), height: r2(height), tolerance: t } })] };
}
