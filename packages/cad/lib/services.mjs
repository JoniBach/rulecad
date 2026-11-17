// A machine's services on its frame (@rulecad/frames' services.mjs): a bought board or supply with "mount" sits on a
// printed mount at an address on a beam's slotted face, its holes read from its own rule set,
//   { "id": "psu", "bought": "supply-24v", "variant": "LRS-50-24", "mount": { "on": "rail.top@200" } }
// and a wire may run along a beam's slot, held by printed cable clips at a pitch,
//   "via": [{ "along": "rail.top", "from": 20, "to": 380, "pitch": 100 }]
// Before the items are built, each mount is added as a fitting item with its fastens (into the slot, and into or
// through the device) and the device placed on it; each run's clips are added at their places along the slot and the
// wire routed through them, so its length follows the beam. Units: mm.
import { beamAnchor, runClips, SERVICE_DEFAULTS } from '@rulecad/frames';
import { beamOf, framesContext } from './beams.mjs';
import { fittingModel } from './fittings.mjs';
import { boughtSets } from './bought.mjs';

const MOUNT_KEYS = ['on', 'turn', 'offset', 'standoff', 'load', 'nut', 'head', 'screw'];
const RUN_KEYS = ['along', 'from', 'to', 'pitch', 'cable'];
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3);

// a slotted place on a beam by its face's name (top, top.2) and the beam's model, refused by name
function slotPlace(what, id, B, name) {
  const q = B.places.find((x) => x.name === name || (x.face === name && x.index === 1));
  if (!q) throw new Error(`${what}: ${id} has no face "${name}": it has ${[...new Set(B.places.map((x) => x.face))].join(', ')}`);
  if (!q.slot) throw new Error(`${what}: ${id}'s ${name} face is closed: a mount or a clip goes into a slot`);
  return q;
}
// the face a fitting is drawn for: top, or top.2 where the face has two slots
const faceOf = (B, q) => (B.places.filter((x) => x.face === q.face).length > 1 ? q.name : q.face);

/**
 * An assembly's mounts and slot runs worked out before its items are built: each bought item with "mount" placed on a
 * printed device mount at its address, the mount's screws into the slot and the device's screws as fastens; each wire's
 * run along a slot as cable clips at a pitch, the wire routed through them. Refused by name: a mount on what is not a
 * bought board or supply, an item with both at and mount, an address that is not on a slotted face of a beam, a run past
 * a beam's end, and what @rulecad/frames refuses.
 * @param {object} a the assembly as read @param {(x: any) => number} num @param {object} [context] framesContext()'s @param {string} [material]
 * @returns {{ a: object, mounts: object[], runs: object[] }}
 */
export function expandServices(a, num, context = framesContext(), material = 'pla') {
  const items = a.items || [], mounted = items.filter((it) => it.mount != null), runs0 = (a.wires || []).some((w) => (w.via ?? []).some((v) => v && typeof v === 'object'));
  if (!mounted.length && !runs0) return { a, mounts: [], runs: [] };
  const beams = new Map(items.filter((it) => it.beam).map((it) => [it.id, it])), ids = new Set(items.map((it) => it.id)), models = new Map();
  const modelOf = (id) => { if (!models.has(id)) models.set(id, beamOf(beams.get(id), num, context).model); return models.get(id); };
  const free = (base) => { let n = base, k = 2; while (ids.has(n)) n = `${base}-${k++}`; ids.add(n); return n; };
  const beamOfAddress = (what, ref, key) => {
    const s = String(ref ?? ''), i = s.indexOf('.');
    if (i < 0) throw new Error(`${what}: ${key} is a beam's slotted face${key === 'on' ? ' and a distance, as rail.top@200' : ', as rail.top'} (got ${shown(ref)})`);
    const id = s.slice(0, i), rest = s.slice(i + 1);
    if (!beams.has(id)) throw new Error(`${what}: ${key} names a beam item of this assembly, and ${id} is ${items.some((x) => x.id === id) ? 'not a beam' : 'not an item'} (beams: ${[...beams.keys()].join(', ') || 'none'})`);
    return { id, rest, B: modelOf(id) };
  };
  const added = [], fasten = [], fits = [], mounts = [], runs = [], plates = [], replaced = new Map(), ahead = new Map();
  for (const it of mounted) {
    const what = `item ${it.id}`, M = it.mount;
    if (!M || typeof M !== 'object' || Array.isArray(M)) throw new Error(`${what}: mount is { "on": "rail.top@200" }, an address on a beam's slotted face (got ${shown(M)})`);
    for (const k of Object.keys(M)) if (!MOUNT_KEYS.includes(k)) throw new Error(`${what}: a mount has no "${k}": it takes ${MOUNT_KEYS.join(', ')}`);
    if (!it.bought) throw new Error(`${what}: mount holds a bought board or supply by the holes its rule set gives: give "bought"`);
    const part = boughtSets().get(it.bought);
    if (!['board', 'supply', 'encoder'].includes(part)) throw new Error(`${what}: mount holds a bought board or supply, and ${it.bought} is ${part ? `a ${part}` : 'no bought part'}`);
    if (it.at != null || it.rotate != null || it.repeat != null) throw new Error(`${what}: a mounted item is placed by its mount: leave out at, rotate and repeat`);
    const { id: bid, rest, B } = beamOfAddress(what, M.on, 'on'), [face, dist] = rest.split('@');
    if (dist == null) throw new Error(`${what}: on is a beam's face and a distance along it, as ${bid}.${face}@200 (got ${shown(M.on)})`);
    try { beamAnchor(B, rest); } catch (e) { throw new Error(`${what}: on: ${String(e.message).replace(/^beamAnchor: /, '')}`); }
    const q = slotPlace(what, bid, B, face), mid = free(`${it.id}-mount`);
    const spec = { kind: 'device-mount', profile: B.profile.name, face: faceOf(B, q), device: it.bought, ...(it.variant != null ? { variant: it.variant } : {}),
      ...(M.turn != null ? { turn: M.turn } : {}), ...(M.offset != null ? { offset: num(M.offset) } : {}), ...(M.standoff != null ? { standoff: num(M.standoff) } : {}), ...(M.load != null ? { load: num(M.load) } : {}),
      ...(M.nut != null ? { nut: M.nut } : {}), ...(M.head != null ? { head: M.head } : {}), ...(M.screw != null ? { screw: M.screw } : {}) };
    const m = fittingModel(spec, context, material, what), D = m.device;
    ahead.set(it.id, { id: mid, fitting: spec, at: `${bid}.${rest}`, mountOf: it.id }); // (listed just before its device: of two parts as near the base, the earlier goes on first)
    fasten.push({ screw: `${m.thread} ${m.head}`, through: [mid], into: `${bid}.${q.name}`, at: m.screws.map((_, k) => `${mid}.b${k + 1}`), nut: m.screws[0].nutKind, note: `${it.id}'s mount into ${bid}`, mountOf: it.id });
    const at = D.holes.map((_, k) => `${mid}.d${k + 1}`);
    fasten.push(m.fix === 'tapped'
      ? { screw: `${D.thread} ${D.head}`, through: [mid], into: it.id, at, note: `${it.id} on its mount, from under it`, mountOf: it.id }
      : { screw: `${D.thread} ${D.head}`, through: [it.id], into: mid, at, note: `${it.id} on its mount`, mountOf: it.id });
    replaced.set(it.id, { ...it, at: `${mid}.device` });
    // the stretch of the slot its plate covers (either way along, as its outline reaches): a run's clips keep off it
    const reachX = Math.max(...m.outline.map((pt) => Math.abs(pt[0]))), d0 = num(dist), at0 = d0 < 0 ? B.length + d0 : d0;
    plates.push({ mount: mid, item: it.id, beam: bid, slot: q.name, lo: r3(at0 - reachX), hi: r3(at0 + reachX) });
    mounts.push({ id: it.id, mount: mid, beam: bid, on: M.on, set: it.bought, variant: it.variant ?? null, fix: m.fix, holes: D.holes.length, thread: D.thread, length: D.length, grams: m.grams, margin: m.margin });
  }
  // wires: each run along a slot becomes clips, and the wire goes through each clip's cable anchor in turn
  const wires = (a.wires || []).map((w, wi) => {
    if (!(w.via ?? []).some((v) => v && typeof v === 'object')) return w;
    const via = [];
    for (const v of w.via) {
      if (!v || typeof v !== 'object') { via.push(v); continue; }
      const what = `wire ${w.id || wi + 1}`;
      if (Array.isArray(v)) throw new Error(`${what}: a run in via is { "along": "rail.top", "from": 20, "to": 380 } (got ${shown(v)})`);
      for (const k of Object.keys(v)) if (!RUN_KEYS.includes(k)) throw new Error(`${what}: a run along a slot has no "${k}": it takes ${RUN_KEYS.join(', ')}`);
      const { id: bid, rest, B } = beamOfAddress(what, v.along, 'along');
      if (rest.includes('@')) throw new Error(`${what}: along names the face (${bid}.${rest.split('@')[0]}); the run's ends are from and to, in mm from end a`);
      const q = slotPlace(what, bid, B, rest);
      if (v.from == null || v.to == null) throw new Error(`${what}: a run along ${v.along} gives from and to, in mm from ${bid}'s end a`);
      const from = num(v.from), to = num(v.to), L = B.length;
      for (const [k, x] of [['from', from], ['to', to]]) if (!(Number.isFinite(x) && x >= 0 && x <= L)) throw new Error(`${what}: a run's ${k} is from 0 to ${mm(L)} mm along ${bid} (got ${shown(v[k])})`);
      let clips;
      try { clips = runClips(Math.abs(to - from), v.pitch != null ? { pitch: num(v.pitch) } : {}); } catch (e) { throw new Error(`${what}: ${String(e.message).replace(/^runClips: /, '')}`); }
      const sgn = to >= from ? 1 : -1, cable = v.cable != null ? num(v.cable) : SERVICE_DEFAULTS.cable.value, list = [];
      // a mount on the same slot: no clip under its plate; one each side of it instead, and the wire said to go round it
      const cw = fittingModel({ kind: 'cable-clip', profile: B.profile.name, face: faceOf(B, q), cable }, context, material, what).width, keep = cw / 2 + SERVICE_DEFAULTS.gap.value;
      const rlo = Math.min(from, to), rhi = Math.max(from, to), round = plates.filter((pl) => pl.beam === bid && pl.slot === q.name && pl.lo - keep < rhi && pl.hi + keep > rlo).map((pl) => ({ ...pl, lo: r3(pl.lo - keep), hi: r3(pl.hi + keep) }));
      let ds = clips.at.map((s) => r3(from + sgn * s));
      if (round.length) {
        ds = ds.filter((d) => !round.some((pl) => d > pl.lo && d < pl.hi));
        for (const pl of round) for (const e of [pl.lo, pl.hi]) if (e >= rlo - 1e-9 && e <= rhi + 1e-9 && !round.some((o) => e > o.lo + 1e-9 && e < o.hi - 1e-9) && !ds.some((d) => Math.abs(d - e) < cw)) ds.push(e);
        ds.sort((x, y) => sgn * (x - y));
        if (!ds.length) throw new Error(`${what}: a run along ${bid}.${q.name} from ${mm(from)} to ${mm(to)} mm lies under ${round.map((pl) => pl.mount).join(' and ')}: no clip has room there; run it along another face`);
      }
      for (const d of ds) {
        const cid = free(`${w.id || `w${wi + 1}`}-clip`);
        added.push({ id: cid, fitting: { kind: 'cable-clip', profile: B.profile.name, face: faceOf(B, q), cable }, at: `${bid}.${q.name}@${d}`, runOf: w.id || `w${wi + 1}` });
        fits.push({ a: cid, b: bid, fastens: true, note: `${cid}: snapped into ${bid}'s ${q.name} slot, its barbs under the lips` }); // (no screw: its barbs hold it)
        via.push(`${cid}.cable`); list.push(cid);
      }
      runs.push({ wire: w.id || `w${wi + 1}`, along: `${bid}.${q.name}`, from, to, length: r3(Math.abs(to - from)), clips: list, count: list.length, pitch: clips.pitch, round: round.map((pl) => ({ mount: pl.mount, item: pl.item, from: pl.lo, to: pl.hi })), most: v.pitch != null ? num(v.pitch) : SERVICE_DEFAULTS.pitch.value, cable });
    }
    return { ...w, via };
  });
  const out = { ...a, items: [...items.flatMap((it) => [...(ahead.has(it.id) ? [ahead.get(it.id)] : []), replaced.get(it.id) ?? it]), ...added], ...(fasten.length ? { fasten: [...(a.fasten || []), ...fasten] } : {}), ...(runs.length ? { wires } : {}), ...(fits.length ? { fits: [...(a.fits || []), ...fits] } : {}) };
  return { a: out, mounts, runs };
}

/**
 * A built assembly's service findings: service.mount for each mounted device (its set, its holes and screws, the
 * mount's grams and margin) and wire.run for each run along a slot (its length and its clips at their pitch).
 * @param {object} s a built assembly @param {Function} f the findings' sink
 */
export function serviceFindings(s, f) {
  for (const m of s.mounts ?? []) f('info', `${m.id}: on a printed mount (${m.mount}) at ${m.on}, held by its ${m.holes} ${m.fix === 'tapped' ? `tapped ${m.thread} holes from ${m.set}'s rule set, screwed up from under the mount` : `holes from ${m.set}'s rule set, ${m.thread} screws down into the mount`}; the mount ${mm(m.grams)} g, ${mm(m.margin)}× its load`, null, { code: 'service.mount', refs: { item: m.id, mount: m.mount, beam: m.beam, set: m.set }, values: { holes: m.holes, length: m.length, grams: m.grams, margin: m.margin } });
  for (const r of s.runs ?? []) f('info', `${r.wire}: ${mm(r.length)} mm along ${r.along} from ${mm(r.from)} to ${mm(r.to)} mm, held by ${r.count} cable clip${r.count > 1 ? 's' : ''} ${r.count > 1 ? (r.round?.length ? `no more than ${mm(r.most)} mm apart, and one each side of ${r.round.map((x) => x.mount).join(' and ')},` : `${mm(r.pitch)} mm apart (no more than ${mm(r.most)})`) : ''} for a ${mm(r.cable)} mm bundle`.trimEnd(), null, { code: 'wire.run', refs: { wire: r.wire, along: r.along, clips: r.clips }, values: { length: r.length, clips: r.count, pitch: r.pitch } });
  // a run under a mount's plate: its clips are set either side, and the wire cannot lie in the slot under the plate
  for (const r of s.runs ?? []) for (const x of r.round ?? []) f('warn', `${r.wire}: its run along ${r.along} passes ${x.mount} (${x.item}'s mount) from ${mm(x.from)} to ${mm(x.to)} mm: no clip goes under the plate, so one is set each side of it, and the wire must go round the mount there: run it along another face, or end the run before the mount`, `${r.wire}: round ${x.mount}`, { code: 'wire.run', refs: { wire: r.wire, along: r.along, mount: x.mount, item: x.item }, values: { from: x.from, to: x.to } });
}
