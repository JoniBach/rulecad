// Panels in assemblies (@rulecad/frames' panel.mjs and door.mjs): an item with "panel" is a sheet cut to the bay of a
// frame it closes: { "sheet": "acrylic", "thickness": 3, "bay": ["x1", "z1", "x2", "z2"], "out": [0, -1, 0] }. The bay
// is four beams placed by their ends, two each way, their slotted faces that look along "out" in one plane. Before the
// items are built, each panel is worked out: its size from the beams' slots, the item placed on that plane, and its
// printed clips placed at a pitch along each edge, each with a fasten into its beam's slot. With "door" it is a door:
// it stands off the faces on printed hinges along one beam, turns on a revolute joint (poses <id>-shut and <id>-open),
// has a handle and a magnet catch, and the screws through it are fastens with their holes cut in it. Units: mm.
import { panelModel, panel, panelClipModel, hingeModel, latchModel, magnetCatchModel, handleModel, PANEL_DEFAULTS, DOOR_DEFAULTS } from '@rulecad/frames';
import { beamOf, beamPlace, framesContext } from './beams.mjs';
import { givenFor } from './frames.mjs';
import { named } from './parts.mjs';
import { referenceBuilt } from './bought.mjs';
import { ops as booleans } from '@rulecad/shapes';

const KEYS = ['sheet', 'thickness', 'bay', 'out', 'pitch', 'nut', 'load', 'door'];
const DOOR_KEYS = ['hinge', 'open', 'handle', 'catch', 'latch', 'load'];
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const col = (f, k) => [f[k], f[4 + k], f[8 + k]], org = (f) => [f[3], f[7], f[11]];
const world = (f, p) => [0, 1, 2].map((k) => f[4 * k] * p[0] + f[4 * k + 1] * p[1] + f[4 * k + 2] * p[2] + f[4 * k + 3]);
const turn = (f, v) => [0, 1, 2].map((k) => f[4 * k] * v[0] + f[4 * k + 1] * v[1] + f[4 * k + 2] * v[2]);
// a world point and direction in a frame's own coordinates (its rows' transpose)
const local = (f, p) => { const q = sub(p, org(f)); return [0, 1, 2].map((k) => r3(dot(col(f, k), q))); };
const localDir = (f, v) => [0, 1, 2].map((k) => r3(dot(col(f, k), v)));
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** The working figures of panels in assemblies, each with what it rests on. */
export const PANEL_CHECK = {
  plane: { value: 0.05, unit: 'mm', rule: 'A bay\'s four faces lie in one plane when they are within this of each other: a panel lies flat on all four', kind: 'default', source: 'A working figure of @rulecad/cad, the same as a join\'s flush', checked: '2026-11-17' },
  latch_probe: { value: 0.5, unit: '°', rule: 'A door with its latch shut is also swept this far off shut, finer than the sweep\'s steps: the latch\'s tab stands just over the door\'s edge, so the door hits it within its first degree and a coarse step would jump past it', kind: 'default', source: 'A working figure of @rulecad/cad: the panels test sees the hit from 0.5° on a 400 x 300 mm door', checked: '2026-11-17' },
  inset: { value: 2, unit: 'mm', rule: 'A clip or a hinge stands this far clear of the beam that crosses the end of its beam, past that beam\'s half width or the reach of its clips', kind: 'default', source: 'A working figure of @rulecad/cad', checked: '2026-11-17' },
};

/**
 * An assembly's panels worked out before its items are built: each panel item placed on its bay's plane, with its
 * size and holes; its clips (or a door's hinges, handle and catch) added as items with their fastens; a door's joint
 * and its two poses. Refused by name: a bay that is not four beams round a rectangle, faces out of one plane, a
 * beam with no slotted face that looks along "out", and what @rulecad/frames refuses.
 * @param {object} a the assembly as read @param {(x: any) => number} num @param {object} [context] framesContext()'s @param {string} [material]
 * @returns {{ a: object, panels: object[] }}
 */
export function expandPanels(a, num, context = framesContext(), material = 'pla') {
  const items = a.items || [], list = items.filter((it) => it.panel);
  if (!list.length) return { a, panels: [] };
  const beams = new Map(items.filter((it) => it.beam).map((it) => [it.id, it])), ids = new Set(items.map((it) => it.id)), models = new Map();
  const modelOf = (id) => { if (!models.has(id)) models.set(id, beamOf(beams.get(id), num, context).model); return models.get(id); };
  const free = (base) => { let n = base, k = 2; while (ids.has(n)) n = `${base}-${k++}`; ids.add(n); return n; };
  const added = [], fasten = [], joints = [], poses = {}, panels = [], replaced = new Map();
  for (const it of list) {
    const what = `item ${it.id}`, P = it.panel;
    if (!P || typeof P !== 'object' || Array.isArray(P)) throw new Error(`${what}: panel is { "sheet": "acrylic", "thickness": 3, "bay": ["x1", "z1", "x2", "z2"], "out": [0, -1, 0] } (got ${shown(P)})`);
    for (const k of Object.keys(P)) if (!KEYS.includes(k)) throw new Error(`${what}: a panel has no "${k}": it takes ${KEYS.join(', ')}`);
    if (it.at != null || it.rotate != null || it.repeat != null) throw new Error(`${what}: a panel is placed by its bay: leave out at, rotate and repeat`);
    const T = typeof P.thickness === 'number' ? P.thickness : num(P.thickness ?? NaN);
    if (!(Array.isArray(P.bay) && P.bay.length === 4)) throw new Error(`${what}: bay is the four beams round it, in order, as ["x1", "z1", "x2", "z2"] (got ${shown(P.bay)})`);
    for (const b of P.bay) if (!beams.has(b)) throw new Error(`${what}: bay names beam items of this assembly, and ${b} is ${items.some((x) => x.id === b) ? 'not a beam' : 'not an item'} (beams: ${[...beams.keys()].join(', ') || 'none'})`);
    if (new Set(P.bay).size !== 4) throw new Error(`${what}: bay is four different beams (got ${shown(P.bay)})`);
    if (!(Array.isArray(P.out) && P.out.length === 3 && Math.hypot(...P.out.map(num)) > 0)) throw new Error(`${what}: out is the way the panel's face looks, [x, y, z], square to the bay (got ${shown(P.out)})`);
    const out = unit(P.out.map(num));
    // each beam: its frame, its slotted face looking along out, that face's plane and its slot's line
    const edges = P.bay.map((id) => {
      const it2 = beams.get(id), f = beamPlace(it2, num), B = modelOf(id);
      if (!f) throw new Error(`${what}: a panel's bay is worked out from where its beams are: place ${id} by its ends (from, to)`);
      const d = col(f, 2);
      if (Math.abs(dot(d, out)) > 1e-6) throw new Error(`${what}: ${id} runs across the bay's plane, not in it: its beams lie square to out`);
      const place = B.places.find((q) => q.slot && dot(turn(f, [...q.normal, 0]), out) > 1 - 1e-6);
      if (!place) throw new Error(`${what}: ${id} has no slotted face that looks along out: turn it with roll so one does`);
      const S = world(f, [place.at[0], place.at[1], 0]);
      return { id, f, B, d, place, S, h: dot(S, out), half: Math.max(B.profile.width, B.profile.height) / 2, profile: B.profile.name, length: B.length };
    });
    const h = edges[0].h, off = edges.find((e) => Math.abs(e.h - h) > PANEL_CHECK.plane.value);
    if (off) throw new Error(`${what}: the bay's faces are not in one plane: ${off.id}'s stands ${mm(Math.abs(off.h - h))} mm ${off.h > h ? 'proud of' : 'below'} ${edges[0].id}'s`);
    const u = edges[0].d, v = cross(out, u), along = (e) => (Math.abs(dot(e.d, u)) > 1 - 1e-6 ? 'u' : Math.abs(dot(e.d, v)) > 1 - 1e-6 ? 'v' : null);
    const us = edges.filter((e) => along(e) === 'u'), vs = edges.filter((e) => along(e) === 'v');
    if (us.length !== 2 || vs.length !== 2) throw new Error(`${what}: a bay is four beams round a rectangle, two each way: ${P.bay.join(', ')} run ${us.length} along ${edges[0].id} and ${vs.length} across it`);
    // each edge: the axis across it (u or v), its slot line's coordinate on that axis, and the way into the bay
    for (const [pair, ax] of [[us, v], [vs, u]]) {
      const c = pair.map((e) => dot(e.S, ax)), lo = c[0] < c[1] ? 0 : 1;
      if (Math.abs(c[0] - c[1]) < 1) throw new Error(`${what}: ${pair[0].id} and ${pair[1].id} lie on one line: a bay has two beams each way, apart`);
      pair.forEach((e, k) => Object.assign(e, { ax, c: c[k], in: k === lo ? 1 : -1 }));
    }
    const span = (e) => { const other = e.ax === v ? vs : us, q = e.ax === v ? u : v, cs = other.map((o) => dot(o.S, q)).sort((x, y) => x - y); return { q, lo: cs[0], hi: cs[1], half: Math.max(...other.map((o) => o.half)) }; };
    const sheet = P.sheet, given = (e) => givenFor(context, e.profile);
    const door = P.door != null ? doorSpec(what, P.door, P.bay, num) : null;
    // where each edge's panel edge goes, from its slot line into the bay
    let clipOf = null, hm = null, edgeIn = {};
    const clipFor = (e) => { try { return panelClipModel(e.profile, { sheet: T, given: given(e), material, ...(P.nut ? { nut: P.nut } : {}), ...(P.load != null ? { load: num(P.load) } : {}) }); } catch (x) { throw new Error(`${what}: ${String(x.message).replace(/^\w+: /, '')}`); } };
    try { panelModel(sheet, T, { size: [1, 1], corner: 0 }); } catch (x) { throw new Error(`${what}: ${String(x.message).replace(/^panelModel: /, '')}`); }
    if (door) {
      const H = edges.find((e) => e.id === door.hinge);
      try { hm = hingeModel(H.profile, { sheet: T, given: given(H), material, ...(door.load != null ? { load: door.load } : {}) }); } catch (x) { throw new Error(`${what}: ${String(x.message).replace(/^\w+: /, '')}`); }
      const probe = latchModel(H.profile, { sheet: T, standoff: hm.standoff, given: given(H), material }), clip = clipFor(H);
      for (const e of edges) edgeIn[e.id] = e.id === door.hinge ? hm.edge : r3(Math.max(clip.edge, probe.edge));
    } else { clipOf = new Map(edges.map((e) => [e.id, clipFor(e)])); for (const e of edges) edgeIn[e.id] = clipOf.get(e.id).edge; }
    // the panel's rectangle in (u, v): between its edges, each set in from its slot line
    const lim = (pair) => { const [p, q] = pair[0].in > 0 ? pair : [pair[1], pair[0]]; return [p.c + edgeIn[p.id], q.c - edgeIn[q.id]]; };
    const [u0, u1] = lim(vs), [v0, v1] = lim(us);
    if (!(u1 - u0 > 1 && v1 - v0 > 1)) throw new Error(`${what}: the bay is too small for a panel held at its edges: ${mm(u1 - u0)} x ${mm(v1 - v0)} mm between them`);
    const lift = door ? hm.standoff : 0, O = add(add(add([0, 0, 0], u, u0), v, v0), out, h + lift), F = { u, v, w: out, O };
    const toPanel = (p) => [r3(dot(sub(p, O), u)), r3(dot(sub(p, O), v)), r3(dot(sub(p, O), out))], dirPanel = (q) => [r3(dot(q, u)), r3(dot(q, v)), r3(dot(q, out))];
    const holes = [], anchors = {}, mine = [];
    // a part on an edge's beam at a distance along it: its address, turned so its y looks into the bay
    const onBeam = (e, at, part) => {
      const dist = r3(dot(sub(at, org(e.f)), e.d)), yIn = e.ax.map((c) => c * e.in), ylocal = cross(out, e.d);
      return { at: `${e.id}.${e.place.name}@${dist}`, ...(dot(ylocal, yIn) > 0 ? {} : { rotate: [0, 0, 180] }), dist, x: dot(ylocal, yIn) > 0 ? e.d : e.d.map((c) => -c), part };
    };
    const pointOn = (e, s) => add(add(add([0, 0, 0], e.ax, e.c), span(e).q, s), out, h); // the slot line at s along the edge
    const record = { id: it.id, sheet, thickness: T, door: !!door, bay: [...P.bay], items: [], fasten: [] };
    if (!door) {
      const pitch = P.pitch != null ? num(P.pitch) : PANEL_DEFAULTS.pitch.value;
      if (!(pitch > 0)) throw new Error(`${what}: pitch is the most between clips along an edge, in mm, above 0 (got ${shown(P.pitch)})`);
      for (const e of edges) {
        const cm = clipOf.get(e.id), sp = span(e), clear = Math.max(sp.half, ...edges.filter((o) => o.ax !== e.ax).map((o) => clipOf.get(o.id).reach)) + cm.width / 2 + PANEL_CHECK.inset.value, lo = sp.lo + clear, hi = sp.hi - clear; // (clear of the beams across its ends and of their clips)
        if (hi < lo) throw new Error(`${what}: ${e.id} is too short for a clip between the beams across its ends`);
        const n = Math.max(2, Math.ceil((hi - lo) / pitch) + 1);
        for (let k = 0; k < n; k++) {
          const s = n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * k) / (n - 1), place = onBeam(e, pointOn(e, s)), id = free(`${it.id}-clip`);
          const spec = { kind: 'panel-clip', profile: e.profile, sheet: T, ...(P.nut ? { nut: P.nut } : {}), ...(P.load != null ? { load: num(P.load) } : {}) };
          added.push({ id, fitting: spec, at: place.at, ...(place.rotate ? { rotate: place.rotate } : {}), panelOf: it.id });
          fasten.push({ screw: `${cm.thread} ${cm.head}`, through: [id], into: `${e.id}.${e.place.name}`, at: [`${id}.b1`], note: `${it.id}: a clip into ${e.id}`, nut: cm.screws[0].nutKind, panelOf: it.id });
          record.items.push(id);
        }
      }
    } else {
      const H = edges.find((e) => e.id === door.hinge), L = edges.find((e) => e.ax === H.ax && e !== H), sp = span(H);
      const axis = cross(H.ax.map((c) => c * H.in), out), lo = sp.lo + sp.half + hm.length / 2 + PANEL_CHECK.inset.value, hi = sp.hi - sp.half - hm.length / 2 - PANEL_CHECK.inset.value;
      if (hi < lo + hm.length) throw new Error(`${what}: ${H.id} is too short for two ${mm(hm.length)} mm hinges between the beams across its ends`);
      const jid = `${it.id}-hinge`, mid = (lo + hi) / 2;
      [lo, hi].forEach((s, k) => {
        const P0 = pointOn(H, s), place = onBeam(H, P0), fid = free(`${it.id}-hinge-${k + 1}`), did = free(`${it.id}-leaf-${k + 1}`);
        added.push({ id: fid, fitting: { kind: 'hinge', profile: H.profile, sheet: T, part: 'frame', ...(door.load != null ? { load: door.load } : {}) }, at: place.at, ...(place.rotate ? { rotate: place.rotate } : {}), panelOf: it.id });
        fasten.push({ screw: `${hm.thread} button`, through: [fid], into: `${H.id}.${H.place.name}`, at: [`${fid}.b1`, `${fid}.b2`], note: `${it.id}: hinge ${k + 1} into ${H.id}`, nut: hm.screws[0].nutKind, panelOf: it.id });
        // the door's leaf on the door, at an anchor of the door where the hinge's frame is: x along the axis, z out
        anchors[`h${k + 1}`] = { at: toPanel(P0), axis: [0, 0, 1], ref: dirPanel(axis) };
        added.push({ id: did, fitting: { kind: 'hinge', profile: H.profile, sheet: T, part: 'door', ...(door.load != null ? { load: door.load } : {}) }, at: `${it.id}.h${k + 1}`, panelOf: it.id });
        const yIn = H.ax.map((c) => c * H.in);
        hm.door.forEach((q, j) => {
          const W = add(add(add(P0, axis, q.at[0]), yIn, q.at[1]), out, q.at[2]), p = toPanel(W);
          holes.push({ thread: hm.screw, at: [p[0], p[1]] });
          anchors[`d${k + 1}${j + 1}`] = { at: p, axis: [0, 0, -1] };
        });
        fasten.push({ screw: `${hm.screw} button`, through: [did], into: it.id, at: hm.door.map((_, j) => `${did}.d${j + 1}`), nut: true, note: `${it.id}: hinge ${k + 1}'s leaf through the door`, panelOf: it.id });
        record.items.push(fid, did);
      });
      // the joint: about the hinges' axis, its parent the hinge beam, the door's anchor "pivot" on it
      const Pax = add(add(add(pointOn(H, mid), H.ax.map((c) => c * H.in), hm.axis[0]), out, hm.axis[1]), [0, 0, 0]);
      anchors.pivot = { at: toPanel(Pax), axis: dirPanel(axis), ref: [0, 0, 1] };
      joints.push({ id: jid, type: 'revolute', parent: { item: H.id, at: local(H.f, Pax), axis: localDir(H.f, axis), ref: localDir(H.f, out) }, child: `${it.id}.pivot`, min: 0, max: door.open, label: `${it.id} opens` });
      poses[`${it.id}-shut`] = { [jid]: 0 }; poses[`${it.id}-open`] = { [jid]: door.open };
      // the handle on the door's outer face, in from the latch side; screwed from inside into its feet
      if (door.handle) {
        const hd = handleModel({ sheet: T, material }), hid = free(`${it.id}-handle`), inward = L.ax.map((c) => c * L.in), at = add(add(pointOn(L, mid), inward, edgeIn[L.id] + 20), out, lift + T), p = toPanel(at);
        const ref = cross(axis, out); // (the handle's x across it, so its y runs along the latch side)
        anchors.handle = { at: p, axis: [0, 0, 1], ref: dirPanel(ref) };
        added.push({ id: hid, fitting: { kind: 'handle', sheet: T }, at: `${it.id}.handle`, panelOf: it.id });
        [-1, 1].forEach((sgn, j) => { const q = add(at, axis, (sgn * hd.span) / 2), pp = toPanel(q); holes.push({ thread: hd.thread, at: [pp[0], pp[1]] }); anchors[`k${j + 1}`] = { at: [pp[0], pp[1], 0], axis: [0, 0, 1] }; });
        fasten.push({ screw: `${hd.thread} button`, through: [it.id], into: hid, at: [`${it.id}.k1`, `${it.id}.k2`], note: `${it.id}: the handle`, panelOf: it.id });
        record.items.push(hid);
      }
      // a magnet catch under the door's edge on the latch beam, and a turn-button latch where asked
      for (const [want, kind] of [[door.catch, 'magnet-catch'], [door.latch, 'latch']]) {
        if (!want) continue;
        const cid = free(`${it.id}-${kind === 'latch' ? 'latch' : 'catch'}`), place = onBeam(L, pointOn(L, kind === 'latch' ? mid + 40 : mid));
        const spec = { kind, profile: L.profile, standoff: hm.standoff, edge: edgeIn[L.id], ...(kind === 'latch' ? { sheet: T } : {}) };
        const cm = kind === 'latch' ? latchModel(L.profile, { sheet: T, standoff: hm.standoff, edge: edgeIn[L.id], given: given(L), material }) : magnetCatchModel(L.profile, { standoff: hm.standoff, edge: edgeIn[L.id], given: given(L), material });
        added.push({ id: cid, fitting: spec, at: place.at, ...(place.rotate ? { rotate: place.rotate } : {}), panelOf: it.id });
        fasten.push({ screw: `${cm.thread} button`, through: [cid], into: `${L.id}.${L.place.name}`, at: [`${cid}.b1`], note: `${it.id}: the ${kind.replace('-', ' ')} into ${L.id}`, nut: cm.screws[0].nutKind, panelOf: it.id });
        record.items.push(cid);
        if (kind === 'latch') Object.assign(record, { joint: jid, latch: cid });
      }
    }
    const pm = panelModel(sheet, T, { size: [r3(u1 - u0), r3(v1 - v0)], holes });
    record.model = pm; record.size = pm.size; panels.push(record);
    const placed = { ...it, panel: { ...P }, _panel: { model: pm, anchors, frame: F } };
    if (!door) joints.push({ id: `${it.id}-bay`, type: 'fixed', parent: { at: O.map(r3), axis: out, ref: u }, child: { item: it.id, at: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] } });
    replaced.set(it.id, placed);
  }
  const first = (a.fasten || []).length;
  const out = { ...a, items: [...items.map((it) => replaced.get(it.id) ?? it), ...added], ...(fasten.length ? { fasten: [...(a.fasten || []), ...fasten] } : {}), joints: [...(a.joints || []), ...joints], poses: { ...(a.poses || {}), ...poses } };
  for (const r of panels) r.fasten = fasten.map((x, k) => (x.panelOf === r.id ? first + k : -1)).filter((k) => k >= 0);
  return { a: out, panels };
}

function doorSpec(what, d, bay, num) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`${what}: door is { "hinge": "${bay[0]}", "open": 120 } (got ${shown(d)})`);
  for (const k of Object.keys(d)) if (!DOOR_KEYS.includes(k)) throw new Error(`${what}: a door has no "${k}": it takes ${DOOR_KEYS.join(', ')}`);
  if (!bay.includes(d.hinge)) throw new Error(`${what}: door.hinge is the beam of the bay its hinges go on, one of ${bay.join(', ')} (got ${shown(d.hinge)})`);
  const open = d.open != null ? num(d.open) : DOOR_DEFAULTS.open.value;
  if (!(open > 0 && open <= 180)) throw new Error(`${what}: door.open is how far it opens, in degrees, above 0 and up to 180 (got ${shown(d.open)})`);
  for (const k of ['handle', 'catch', 'latch']) if (d[k] != null && typeof d[k] !== 'boolean') throw new Error(`${what}: door.${k} is true or false (got ${shown(d[k])})`);
  return { hinge: d.hinge, open, handle: d.handle ?? true, catch: d.catch ?? true, latch: d.latch ?? false, ...(d.load != null ? { load: num(d.load) } : {}) };
}

/**
 * An item with "panel", built once expandPanels has worked it out: the sheet as a bought reference (the list counts
 * it by its sheet, thickness and size), its anchors (a door's pivot, hinge, screw and handle places), and its
 * figures as values (door.width, door.height, door.grams). @param {object} it @param {string} id
 */
export async function panelBuilt(it, id) {
  if (!it._panel) throw new Error(`item ${id}: a panel is worked out from its bay before it is built`);
  let ops = null; try { ops = await booleans('manifold'); } catch {} // (cut by Manifold where installed, so the overlap check reads it exactly)
  const { model: m, anchors } = it._panel, parts = named({ body: (() => { try { return panel(m, ops ? { ops } : {}); } catch { return panel(m); } })() }, { body: { label: m.title } });
  const values = { width: m.size[0], height: m.size[1], thickness: m.thickness, grams: m.grams };
  return referenceBuilt({ id, key: 'panel', objName: `panel:${m.name}`, name: m.name, parts, anchors, entries: [], values,
    extra: { panel: m, bought: { set: `${m.sheet} sheet, ${mm(m.thickness)} mm`, variant: null, part: 'panel', mass: m.grams / 1000, size: m.size } } });
}

/**
 * A built assembly's panel findings: panel.size for each (its sheet, size and mass, and the clips or door parts that
 * hold it), and panel.thickness where the sheet is not commonly stocked. @param {object} s @param {Function} f
 */
export function panelFindings(s, f) {
  for (const r of s.panels ?? []) {
    const held = r.items.length;
    for (const x of r.model.findings) f(x.level, `${r.id}: ${x.text}${x.code === 'panel.size' ? `; ${r.door ? `a door on ${r.items.filter((k) => /-hinge-\d+$/.test(k)).length} hinges` : `held by ${held} clips`}` : ''}`, x.level === 'warn' || x.level === 'fail' ? `${r.id}: ${x.code}` : null, { code: x.code, values: { ...(x.values ?? {}), ...(x.code === 'panel.size' ? { items: r.items } : {}) }, refs: { item: r.id } });
  }
}
