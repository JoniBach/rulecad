// Slot nuts in a frame: what a fasten into a beam's slot (lib/fasten.mjs) asks of the joins round it. A slide-in nut
// (and a plain square nut) goes into a slot only from an open end of it; a drop-in, roll-in, hammer-head nut or T-bolt
// goes in through the opening anywhere along it. A slot's end is closed by a join that butts on it (the beam's end
// meets another beam), or, for the stretch of slot a nut is in, by a blind join's head sitting in that slot between
// the nut and the end; an item placed at the end (a cap, a foot) closes it too, though it comes off again.
//   frame.nut: the nuts whose stretch of slot joins close at both ends. Once those joins are made a slide-in nut has
//     no way in, so the check fails and names the nut of that thread that goes in through the opening.
//   frame.preload: the nuts with a way in that a join closes and none that stays open (the other end capped): they
//     go into the slot before that join is made. cad order and the build page list them at the step that makes it.
import { nutFor } from '@rulecad/frames';
import { framesContext } from './beams.mjs';
import { givenFor } from './frames.mjs';

const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3);
const EPS = 1e-3; // mm: a closure this near a nut is where the nut is, not beside it
const THROUGH = ['drop-in', 'roll-in', 'hammer', 't-bolt']; // (the kinds that go in through the opening, in the order a stand-in is offered)
const an = (t) => (/^(?:[aeiou8]|M\d)/i.test(String(t)) ? 'an' : 'a');

// Each fasten's nuts in one slot: the relation, the beam and its slot, the nut, and where along the beam each is
function groupsOf(s) {
  const out = new Map();
  for (const rel of s.fastened?.relations ?? []) for (const sc of rel.screws) {
    if (!sc.slot) continue;
    const key = `${rel.index}|${sc.slot.item}|${sc.slot.place}`; // (place: top.1, as joins name it; named: top, as said where the face has one slot)
    if (!out.has(key)) out.set(key, { rel, ...sc.slot, at: [], screws: [] });
    out.get(key).at.push(sc.slot.distance); out.get(key).screws.push(sc);
  }
  return [...out.values()];
}

// What closes a beam's slot, and where along it: joins at its ends, blind joins' heads in that slot, items at its ends
function closuresOf(s, item, place) {
  const L = s.objects.find((o) => o.id === item)?.beam?.length ?? 0, out = [], endAt = (e) => (e === 'a' ? 0 : L);
  for (const j of s.joins ?? []) {
    if (j.items[0] === item) out.push({ at: endAt(j.end[0]), end: j.end[0], join: j });
    if (j.items[1] === item && j.model.b.end) out.push({ at: endAt(j.model.b.end[0]), end: j.model.b.end[0], join: j });
    if (j.items[1] === item && j.kind === 'blind' && j.model.b.place === place) out.push({ at: j.model.b.distance, end: null, join: j, head: true });
  }
  for (const it of s.a.items || []) {
    const m = typeof it.at === 'string' ? /^([\w-]+)\.([ab])(\.|$)/.exec(it.at.trim()) : null;
    if (m && m[1] === item) out.push({ at: endAt(m[2]), end: m[2], item: it.id });
  }
  return out;
}

// The two ways out of a stretch of slot from lo to hi along the beam: the nearest closure toward each end (a join before
// an item where both stand at one place), or null where that way is open
function waysOf(s, item, place, lo, hi) {
  const cs = closuresOf(s, item, place), pick = (list, far) => list.sort((p, q) => (far ? q.at - p.at : p.at - q.at) || (q.join ? 1 : 0) - (p.join ? 1 : 0))[0] ?? null;
  return { a: pick(cs.filter((c) => c.at < lo - EPS), true), b: pick(cs.filter((c) => c.at > hi + EPS), false) };
}
const closerSays = (g, w) => (w.head ? `the head of the ${w.join.label} at ${mm(w.at)} mm` : w.join ? `${g.item}'s end ${w.end} (the ${w.join.label})` : `${g.item}'s end ${w.end} (${w.item} placed there)`);
const nutsSay = (g) => `${g.at.length} ${g.kind} nut${g.at.length > 1 ? 's' : ''} (${g.nut})`;

// The nut of that thread made for the slot that goes in through its opening: a drop-in first, then the other kinds
function throughNut(s, g) {
  const b = s.objects.find((o) => o.id === g.item)?.beam;
  for (const kind of THROUGH) { try { return nutFor(b.profile, g.place, g.thread, { kind, given: givenFor(framesContext(), b.profile.name) }); } catch {} }
  return null;
}

/**
 * The nuts that must be in a slot before a join closes it: slide-in and square nuts whose stretch of slot has no way
 * that stays open, and a way a join closes. @param {object} s a built assembly
 * @returns {{ fasten: number, label: string, item: string, place: string, nut: string, count: number, end: string|null, at: number, join: object, other: object|null, text: string }[]}
 */
export function preloadOf(s) {
  const out = [];
  for (const g of groupsOf(s)) {
    if (g.entry !== 'end') continue;
    const w = waysOf(s, g.item, g.place, Math.min(...g.at), Math.max(...g.at));
    if (!w.a || !w.b || (w.a.join && w.b.join) || (!w.a.join && !w.b.join)) continue; // (a way stays open; or joins close both: frame.nut's; or only items placed at the ends do, which go on after the nuts)
    const by = w.a.join ? w.a : w.b, other = by === w.a ? w.b : w.a, from = by.end ? `through its end ${by.end}` : `from end ${by === w.a ? 'a' : 'b'}, past ${mm(by.at)} mm`;
    out.push({ fasten: g.rel.index, label: g.rel.label, item: g.item, place: g.place, nut: g.nut, count: g.at.length, end: by.end, at: by.at, join: by.join, other,
      text: `load ${g.at.length} × ${g.nut} into ${g.item}'s ${g.named} slot ${from}, for ${g.part}, before the ${by.join.label} closes it${other.item ? ` (or through end ${other.end} before ${other.item} goes on)` : ''}` });
  }
  return out;
}

/**
 * frame.nut and frame.preload, in the assembly's findings shape. @param {object} s a built assembly @param {Function} f the findings' sink
 */
export function slotNutChecks(s, f) {
  const groups = groupsOf(s);
  if (!groups.length) return;
  for (const g of groups) {
    const lo = Math.min(...g.at), hi = Math.max(...g.at), where = `${g.item}'s ${g.named} slot`, first = g.screws[0];
    const refs = { fasten: g.rel.index, item: g.item, place: g.place, nut: g.nut, kind: g.kind, along: g.at };
    if (g.entry !== 'end') { f('pass', `${g.rel.label}: ${nutsSay(g)} go${g.at.length > 1 ? '' : 'es'} into ${where} through its opening, anywhere along it`, null, { code: 'frame.nut', at: first.at.map(r3), refs }); continue; }
    const w = waysOf(s, g.item, g.place, lo, hi);
    if (w.a?.join && w.b?.join) {
      const alt = throughNut(s, g), joins = [w.a.join.index, w.b.join.index];
      f('fail', `${g.rel.label}: ${nutsSay(g)} go${g.at.length > 1 ? '' : 'es'} into ${where} at ${g.at.map(mm).join(' and ')} mm, between ${closerSays(g, w.a)} and ${closerSays(g, w.b)}, which close it at both ends: a ${g.kind} nut goes in only from an open end. ${alt ? `${alt.name} (${an(alt.thread)} ${alt.thread} ${alt.nutKind} nut) goes in through the opening anywhere: give "nut": "${alt.nutKind}"` : `No ${g.thread} nut made for ${g.slot} goes in through its opening: load these before the later of the two joins, or move them to a slot with an open end`}`,
        `${g.rel.label}: nut`, { code: 'frame.nut', at: first.at.map(r3), values: { nuts: g.at.length }, refs: { ...refs, joins, ...(alt ? { alternative: alt.name, kind_needed: alt.nutKind } : {}) } });
      continue;
    }
    const open = !w.a ? 'a' : !w.b ? 'b' : null;
    f('pass', `${g.rel.label}: ${nutsSay(g)} go${g.at.length > 1 ? '' : 'es'} into ${where} ${open ? `from its end ${open}, which nothing closes` : `before ${closerSays(g, w.a.join ? w.a : w.b)} closes it (frame.preload)`}`, null, { code: 'frame.nut', at: first.at.map(r3), refs });
  }
  const pre = preloadOf(s);
  for (const p of pre) f('info', `${p.label}: ${p.text}`, null, { code: 'frame.preload', values: { nuts: p.count }, refs: { fasten: p.fasten, item: p.item, place: p.place, nut: p.nut, join: p.join.index, end: p.end } });
  if (!pre.length) f('pass', 'no slot nut has to be in its slot before a join closes it', null, { code: 'frame.preload' });
}

/**
 * The order of assembly with the nuts to load first: each preload at the step that makes the join that closes its slot
 * (the step its later item goes on in), as that step's load. @param {object} s a built assembly @param {object} r orderOf's
 * @returns {object} r, its steps copied with load: string[] where there are nuts to load before them
 */
export function withPreload(s, r) {
  if (!r?.steps?.length) return r;
  const pre = preloadOf(s);
  if (!pre.length) return r;
  const steps = r.steps.map((st) => ({ ...st })), stepOf = (id) => steps.findIndex((st) => st.items.includes(id));
  for (const p of pre) {
    const i = Math.max(0, ...p.join.items.map(stepOf));
    (steps[i].load ||= []).push(p.text);
  }
  return { ...r, steps };
}
