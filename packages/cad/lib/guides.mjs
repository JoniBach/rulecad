// Guides in assemblies (@rulecad/frames' guide.mjs): linear motion on a beam.
//   "guides": [{ "kind": "rail", "rail": "rail-mgn12", "carriage": "MGN12H", "on": "x1.top", "from": 20, "length": 300, "carriages": 1 }]
//   "guides": [{ "kind": "wheels", "wheel": "v-wheel-solid", "wheels": 4, "on": "x1.top", "from": 0, "length": 400 }]
//   "guides": [{ "kind": "slider", "mode": "over", "size": 30, "on": "x1.top.1", "from": 0, "length": 200 }]
// Before the items are built, each guide is worked out: the rail is a bought item at its place on the face, its
// screws a fasten into the slot at its hole pitch (so the fasten checks choose their length and count them, and the
// slot nuts with them), each carriage a bought item on a sliding joint (<id>-1, <id>-2 ..) whose travel is the rail's
// share less the carriage's length, and two poses put them at either end (<id>-a, <id>-b). Once built, guide.fit says
// whether the rail fits the face, each carriage's loads are held to its ratings (joint.moment), and the rail's terms go
// into the error budget of any task the carriage's joint is in. A wheels guide's carriage is a printed plate (the
// fitting wheel-plate) on its sliding joint over the face "on" names, its wheels bought items held to it, rolling in the
// V tracks either side over the stretch from..from + length; wheels on a face with no V track are refused with why. A
// slider is a printed part (the fitting slider) on its sliding joint along the slot "on" names. Units: mm, N, N m, kg.
import jscad from '@jscad/modeling';
import { railModel, rail, carriage, carriageMargin, guideFit, railTerms, railJigModel, GUIDE_DEFAULTS, vWheel, wheelMargin, rodsLayout, rodMargin, ROD_DEFAULTS } from '@rulecad/frames';
import { beamOf, framesContext } from './beams.mjs';
import { givenFor } from './frames.mjs';
import { named } from './parts.mjs';
import { referenceBuilt } from './bought.mjs';
import { fittingModel } from './fittings.mjs';

const KEYS = { rail: ['id', 'kind', 'rail', 'carriage', 'on', 'from', 'length', 'carriages', 'nut', 'note'], wheels: ['id', 'kind', 'wheel', 'wheels', 'pitch', 'load', 'on', 'from', 'length', 'note'], slider: ['id', 'kind', 'mode', 'size', 'load', 'on', 'from', 'length', 'note'],
  rods: ['id', 'kind', 'rod', 'bearing', 'spacing', 'height', 'load', 'on', 'from', 'length', 'endstop', 'nut', 'note'], screw: ['id', 'kind', 'guide', 'screw', 'nut', 'support', 'coupler', 'motor', 'friction', 'note'] };
const { cylinder } = jscad.primitives, { translate } = jscad.transforms, { subtract, union } = jscad.booleans;
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3), n3 = (x, d = 2) => String(Number(Number(x).toFixed(d)));
const strip = (e) => String(e?.message ?? e).replace(/^(railModel|guideFit|railTerms|railJigModel|wheelsModel|sliderModel|rodsLayout): /, '');
const G = 9.80665;
const SETS_OF = (m) => ({ diameter: r3(2 * (m.seat.axle + m.seat.depth)) });
const SETS_KIND = (L) => `${L.bearing.set}'s ratings as its set gives them: a single bush's moment capacity is worked as a couple along it, an estimate`;

/**
 * An assembly's guides worked out before its items are built: each rail an item on its beam's face with its screws as a
 * fasten, each carriage an item on its own sliding joint with its true travel, and two poses. Refused by name: a guide
 * of a kind not built yet, a face that is not a beam's slotted face, and what @rulecad/frames refuses.
 * @param {object} a the assembly as read @param {(x: any) => number} num @param {object} [context] framesContext()'s
 * @returns {{ a: object, guides: object[] }}
 */
export function expandGuides(a, num, context = framesContext(), material = 'pla') {
  const list = a.guides;
  if (list == null) return { a, guides: [] };
  if (!Array.isArray(list)) throw new Error(`guides is a list: [{ "kind": "rail", "rail": "rail-mgn12", "on": "x1.top", "length": 300 }] (got ${shown(list)})`);
  const items = a.items || [], beams = new Map(items.filter((it) => it.beam).map((it) => [it.id, it])), ids = new Set(items.map((it) => it.id)), given = { sets: context?.sets ?? {} };
  const added = [], fasten = [], joints = [], poses = {}, guides = [], first = (a.fasten || []).length;
  // a carriage on V-wheels or a printed slider: a printed fitting on its own sliding joint along the beam, through the
  // stretch from..from + length less its own length; a plate's wheels bought items held to it at its anchors
  const rolling = (g, { what, id, bid, B, q, faceName }) => {
    const wheels = g.kind === 'wheels', face = wheels ? q.face : B.places.filter((x) => x.face === q.face).length > 1 ? q.name : q.face;
    if (wheels && faceName.includes('.')) throw new Error(`${what}: on is the face the plate lies over, as ${bid}.${q.face}: its wheels run in the slots either side of it`);
    if (!wheels && !q.slot) throw new Error(`${what}: ${bid}'s ${faceName} face is closed: a slider runs in a slot or keys into one`);
    const spec = wheels ? { kind: 'wheel-plate', profile: B.profile.name, face, ...(g.wheel != null ? { wheel: g.wheel } : {}), ...(g.wheels != null ? { wheels: g.wheels } : {}), ...(g.pitch != null ? { pitch: num(g.pitch) } : {}), ...(g.load != null ? { load: num(g.load) } : {}) }
      : { kind: 'slider', profile: B.profile.name, face, ...(g.mode != null ? { mode: g.mode } : {}), ...(g.size != null ? { length: num(g.size) } : {}), ...(g.load != null ? { load: num(g.load) } : {}) };
    const m = fittingModel(spec, context, material, what), from = g.from != null ? num(g.from) : 0, length = num(g.length), own = wheels ? m.length : m.length, travel = r3(length - own);
    if (!(from >= 0 && from + length <= B.length + 1e-9)) throw new Error(`${what}: its stretch runs from ${mm(from)} to ${mm(from + length)} mm along ${bid}, which is ${mm(B.length)} mm long: move "from" or make it shorter`);
    if (!(travel > 0)) throw new Error(`${what}: its ${wheels ? 'carriage' : 'slider'} is ${mm(own)} mm long${wheels ? ' over its wheels' : ''}, so a ${mm(length)} mm stretch leaves it no travel: make length more than ${mm(own)} mm`);
    const cid = `${id}-carriage-1`, jid = `${id}-1`;
    for (const x of [cid, jid]) if (ids.has(x)) throw new Error(`${what}: ${x} is an item already: give the guide another id`);
    ids.add(cid);
    const P = B.profile, n = q.normal, centre = wheels ? [r3((n[0] * P.width) / 2), r3((n[1] * P.height) / 2)] : q.at;
    added.push({ id: cid, fitting: spec, guideOf: id });
    joints.push({ id: jid, type: 'prismatic', parent: { item: bid, at: [centre[0], centre[1], r3(from + own / 2)], axis: [0, 0, 1], ref: [n[0], n[1], 0] }, child: `${cid}.slide`, min: 0, max: travel, label: `${cid} ${wheels ? 'rolls' : 'slides'} along ${bid}`, _guide: { id, kind: g.kind, carriage: cid, model: m, terms: [] } });
    const record = { id, kind: g.kind, beam: bid, face, from, length, model: m, carriages: [cid], joints: [jid], travel, wheels: [], note: g.note ?? null, fasten: [] };
    if (wheels) m.wheels.forEach((w, k) => {
      const wid = `${id}-wheel-${k + 1}`;
      if (ids.has(wid)) throw new Error(`${what}: ${wid} is an item already: give the guide another id`);
      ids.add(wid); record.wheels.push(wid);
      added.push({ id: wid, bought: m.wheel, _guide: { part: 'wheel', model: m, eccentric: w.eccentric }, at: `${cid}.${w.name}`, guideOf: id });
    });
    poses[`${id}-a`] = { [jid]: 0 }; poses[`${id}-b`] = { [jid]: travel };
    guides.push(record);
  };
  // a lead screw drives a rods guide's carriage: found first, so the rods guide's parts are drawn for it
  const fits = [], screws = new Map();
  list.forEach((g, i) => {
    if (g?.kind !== 'screw') return;
    const what = `guide ${g.id ?? i + 1}`;
    for (const k of Object.keys(g)) if (!KEYS.screw.includes(k)) throw new Error(`${what}: a screw guide has no "${k}": it takes ${KEYS.screw.join(', ')}`);
    const target = list.find((x) => x && (x.id ?? `g${list.indexOf(x) + 1}`) === g.guide);
    if (!target) throw new Error(`${what}: guide names the rods guide whose carriage the screw drives, by its id (got ${shown(g.guide)}; guides: ${list.map((x, k) => x?.id ?? `g${k + 1}`).join(', ')})`);
    if (target.kind !== 'rods') throw new Error(`${what}: a screw drives a rods guide's carriage, and ${g.guide} is a ${target.kind} guide; a belt and screws on rails or wheels are not built yet`);
    if (screws.has(g.guide)) throw new Error(`${what}: ${g.guide} is driven by another screw already: one drive to a carriage`);
    if (!g.motor || typeof g.motor !== 'object' || typeof g.motor.model !== 'string') throw new Error(`${what}: motor is the motor item's spec, as { "model": "28byj48", "microsteps": 1 }: its drives and leadscrew come from the guide (got ${shown(g.motor)})`);
    for (const k of ['drives', 'leadscrew', 'belt']) if (g.motor[k] != null) throw new Error(`${what}: motor.${k} comes from the guide: leave it out`);
    screws.set(g.guide, { g, i, id: g.id ?? `g${i + 1}`, what });
  });
  // two rods along a face in printed holders at the stretch's ends, a printed carriage on linear bearings on its own
  // sliding joint; with a screw, a motor plate, the motor, a coupler and the screw, bearings for it in the holders and the
  // lead nut on the carriage; with an endstop, its mount at the address given and a flag on the carriage
  const rodsGuide = (g, { what, id, bid, B, q, faceName }) => {
    if (faceName.includes('.')) throw new Error(`${what}: on is the face the rods run over, as ${bid}.${q.face}: its holders' legs screw into the slots either side`);
    const P = B.profile, gv = givenFor(context, P.name), sc = screws.get(id), sg = sc?.g;
    const from = g.from != null ? num(g.from) : 0, length = num(g.length), opt = (k, x) => (x != null ? { [k]: typeof x === 'string' ? x : num(x) } : {});
    let L;
    try { L = rodsLayout(P.name, { face: q.face, ...opt('rod', g.rod), ...opt('bearing', g.bearing), ...opt('spacing', g.spacing), ...opt('height', g.height), ...(sg ? { screw: sg.screw ?? 't8-screw', ...opt('nut', sg.nut), ...(sg.support !== undefined ? { support: sg.support } : {}), ...opt('coupler', sg.coupler), motor: sg.motor.model } : {}), given: gv }); }
    catch (e) { throw new Error(`${(sg && /screw|nut|support|coupler|motor/.test(String(e.message)) ? sc.what : what)}: ${strip(e)}`); }
    if (!(from >= 0 && from + length <= B.length + 1e-9)) throw new Error(`${what}: its stretch runs from ${mm(from)} to ${mm(from + length)} mm along ${bid}, which is ${mm(B.length)} mm long: move "from" or make it shorter`);
    const base = { profile: P.name, face: q.face, rod: L.rod.set, bearing: L.bearing.set, spacing: L.spacing, height: L.height, ...(g.load != null ? { load: num(g.load) } : {}) };
    const drive = L.screw ? { screw: L.screw.set, leadNut: L.nut.set, ...(L.support ? { support: L.support.set } : { support: null }) } : {};
    const slotNut = g.nut != null ? { nut: String(g.nut) } : {}; // (the slot nuts' kind for whatever screws into the slots either side: holders, motor plate, endstop mount)
    const hold = (end) => fittingModel({ kind: 'rod-holder', ...base, ...drive, ...slotNut, end }, context, material, what);
    const hA = hold('a'), ids_ = (x) => { if (ids.has(x)) throw new Error(`${what}: ${x} is an item already: give the guide another id`); ids.add(x); return x; };
    const ha = ids_(`${id}-holder-a`), hb = ids_(`${id}-holder-b`), cid = ids_(`${id}-carriage-1`), jid = `${id}-1`, gap = ROD_DEFAULTS.gap.value;
    const n = q.normal, yd = [n[1], -n[0]], F = L.frame, at = (y, z) => [r3(q.at[0] + yd[0] * y + n[0] * z), r3(q.at[1] + yd[1] * y + n[1] * z)];
    // the endstop: its mount at the address given, on a face beside; the flag on the carriage where its lever is
    let es = null, flag = null;
    if (g.endstop != null) {
      const e = g.endstop;
      if (!e || typeof e !== 'object' || typeof e.at !== 'string') throw new Error(`${what}: endstop is { "at": "${bid}.${F.sides[0].name}@40", "switch": "endstop-10t85" }: the switch's mount at a side face's address (got ${shown(e)})`);
      for (const k of Object.keys(e)) if (!['at', 'switch'].includes(k)) throw new Error(`${what}: an endstop has no "${k}": it takes at and switch`);
      const [place, dist] = e.at.split('@'), [ebid, ...ef] = place.split('.'), side = F.sides.find((x) => x.name === ef.join('.') || x.side === ef.join('.'));
      if (ebid !== bid || !side || dist == null) throw new Error(`${what}: endstop.at is an address on a face of ${bid} beside the rods, ${F.sides.map((x) => `${bid}.${x.name}@<mm>`).join(' or ')} (got ${shown(e.at)})`);
      const sq = B.places.find((x) => x.name === side.name || (x.face === side.side && x.index === 1)), sy = [sq.normal[1], -sq.normal[0]], toward = Math.sign(sy[0] * n[0] + sy[1] * n[1]) || 1;
      const spec = { kind: 'endstop-mount', profile: P.name, face: side.name, toward, ...(e.switch ? { switch: e.switch } : {}), ...slotNut }, em = fittingModel(spec, context, material, `${what}: endstop`), d = num(dist.replace(/%$/, '')) * (dist.endsWith('%') ? B.length / 100 : 1), dd = dist.startsWith('-') ? B.length + d : d;
      const fd = ROD_DEFAULTS.flag.value;
      flag = { y: r3(side.y + side.out * em.lever.out), z: r3(side.z + em.lever.reach - fd.engage) };
      es = { spec, model: em, at: e.at, distance: r3(dd), side: side.name, mount: ids_(`${id}-endstop-mount`), sw: ids_(`${id}-endstop`), set: em.switch };
    }
    const cm = fittingModel({ kind: 'rod-carriage', ...base, ...(L.screw ? { screw: L.screw.set, leadNut: L.nut.set } : {}), ...(flag ? { flag } : {}) }, context, material, what);
    const travel0 = r3(length - 2 * hA.thickness - 2 * gap - cm.own), c0 = from + hA.thickness + gap + cm.length / 2;
    if (!(travel0 > 0)) throw new Error(`${what}: its holders (${mm(hA.thickness)} mm each) and carriage (${mm(cm.own)} mm) take ${mm(2 * hA.thickness + 2 * gap + cm.own)} mm of the ${mm(length)} mm stretch, which leaves no travel: make length longer`);
    // where the flag meets the lever: the travel's lower end, and the joint's home
    let lo = 0;
    if (es) {
      const lever = es.distance + es.model.lever.x, face0 = c0 + cm.length / 2 - ROD_DEFAULTS.flag.value.thickness, home = r3(lever - face0);
      const ok = es.distance + es.model.outline[0][0] >= from + hA.legs + gap - 1e-6;
      if (home < 0 || home >= travel0 || !ok) {
        const best = r3(face0 - es.model.lever.x), least = r3(from + hA.legs + gap - es.model.outline[0][0]);
        const place = Math.max(best, least);
        throw new Error(`${what}: endstop at ${es.at}: ${!ok ? `its mount reaches back over ${ha}'s leg (to ${mm(from + hA.legs)} mm along ${bid})` : home < 0 ? `the carriage stops at ${ha} ${mm(-home)} mm before its flag reaches the switch's lever` : `the flag only reaches the lever ${mm(home)} mm along a ${mm(travel0)} mm travel`}: at ${bid}.${es.side}@${mm(place)} it trips ${mm(r3(place - best))} mm from the travel's start`);
      }
      lo = home; es.home = home;
    }
    added.push({ id: ha, fitting: { kind: 'rod-holder', ...base, ...drive, ...slotNut, end: 'a' }, at: `${bid}.${q.name}@${r3(from)}`, guideOf: id });
    added.push({ id: hb, fitting: { kind: 'rod-holder', ...base, ...drive, ...slotNut, end: 'b' }, at: `${bid}.${q.name}@${r3(from + length)}`, guideOf: id });
    const rods = [1, 2].map((k) => { const rid = ids_(`${id}-rod-${k}`); added.push({ id: rid, bought: L.rod.set, set: { length: r3(length) }, at: `${ha}.r${k}`, guideOf: id }); return rid; });
    added.push({ id: cid, fitting: { kind: 'rod-carriage', ...base, ...(L.screw ? { screw: L.screw.set, leadNut: L.nut.set } : {}), ...(flag ? { flag } : {}) }, guideOf: id });
    const lms = [1, 2].map((k) => { const lid = ids_(`${id}-bearing-${k}`); added.push({ id: lid, bought: L.bearing.set, at: `${cid}.lm${k}`, guideOf: id }); return lid; });
    const centre = at(F.yc, L.height), jspec = { id: jid, type: 'prismatic', parent: { item: bid, at: [centre[0], centre[1], r3(c0)], axis: [0, 0, 1], ref: [n[0], n[1], 0] }, child: `${cid}.slide`, min: lo, max: travel0, label: `${cid} slides along ${bid} on ${L.rod.set} rods`, _guide: { id, kind: 'rods', carriage: cid, model: cm, terms: [] } };
    joints.push(jspec);
    // the rods pressed into the holders, run through the bearings; the bearings pressed into the carriage
    for (const r of rods) fits.push({ a: r, b: ha, fastens: true, min: -100, note: 'The rod pressed through its holder' }, { a: r, b: hb, fastens: true, min: -100, note: 'The rod pressed through its holder' }, { a: r, b: cid, min: -100, note: 'The rod runs through the carriage\'s bearing' });
    lms.forEach((x, k) => fits.push({ a: x, b: cid, fastens: true, min: -100, note: 'The bearing pressed into its pocket' }, { a: rods[k], b: x, min: -100, note: 'Rod in bearing' }));
    const record = { id, kind: 'rods', beam: bid, face: q.face, from, length, model: cm, layout: L, holder: hA, carriages: [cid], joints: [jid], travel: r3(travel0 - lo), lo, wheels: [], rods, bearings: lms, note: g.note ?? null, fasten: [] };
    // the holders' legs into the slots either side
    // (a saddle's screws, one fasten a leg: each leg's screws into its side's slot)
    const legFastens = (hid, m, said, gid) => [...new Set(m.screws.map((x) => x.side))].forEach((sd) => {
      const list = m.screws.map((x, k) => [x, k]).filter(([x]) => x.side === sd), x = list[0][0];
      fasten.push({ screw: `${x.thread} ${x.head}`, through: [hid], into: `${bid}.${sd}`, at: list.map(([, k]) => `${hid}.b${k + 1}`), nut: x.nutKind, note: `${said} into ${bid}'s ${sd} slot`, guideOf: gid });
    });
    for (const [hid, m] of [[ha, hA], [hb, hold('b')]]) legFastens(hid, m, `${id}: ${hid}'s leg`, id);
    if (sc) {
      // the motor plate outside holder a, the coupler between, the screw from the coupler to holder b's bearing
      const pspec = { kind: 'motor-plate', profile: P.name, face: q.face, motor: L.motor.set, height: L.height, coupler: { length: L.coupler.length, D: L.coupler.D }, ...slotNut };
      const pm = fittingModel(pspec, context, material, sc.what), cl = L.coupler.length, before = r3(pm.anchors.coupler.at[0] + cl + gap / 2);
      const xm = r3(from - before);
      if (xm < 0) throw new Error(`${sc.what}: the motor plate and ${L.coupler.set} take ${mm(before)} mm before the stretch, and it starts ${mm(from)} mm along ${bid}: give the rods guide a "from" of at least ${mm(before)}`);
      const plate = ids_(`${sc.id}-plate`), mo = ids_(`${sc.id}-motor`), cp = ids_(`${sc.id}-coupler`), sw = ids_(`${sc.id}-screw`), nt = ids_(`${sc.id}-nut`);
      const start = xm + pm.anchors.coupler.at[0], end = r3(from + length - hA.thickness + (L.support ? L.support.width : hA.thickness)), slen = r3(end - start - cl / 2);
      const friction = sg.friction != null ? sg.friction : L.screw.friction ?? 0.2;
      added.push({ id: plate, fitting: pspec, at: `${bid}.${q.name}@${xm}`, guideOf: sc.id });
      added.push({ id: mo, motor: { ...sg.motor, drives: jid, leadscrew: { lead: L.screw.lead, diameter: L.screw.d, friction } }, at: `${plate}.motor`, guideOf: sc.id });
      added.push({ id: cp, bought: L.coupler.set, _guide: { part: 'coupler', set: L.coupler.set, length: cl, D: L.coupler.D, bores: [L.motor.shaft.d, L.screw.d] }, at: `${plate}.coupler`, guideOf: sc.id });
      added.push({ id: sw, bought: L.screw.set, _guide: { part: 'screw', set: L.screw.set, d: L.screw.d, from: cl / 2, length: slen, lead: L.screw.lead }, at: `${plate}.coupler`, guideOf: sc.id });
      added.push({ id: nt, bought: L.nut.set, _guide: { part: 'nut', ...L.nut, d: L.screw.d }, at: `${cid}.nut`, guideOf: sc.id });
      const sup = L.support ? ['a', 'b'].map((e) => { const x = ids_(`${sc.id}-support-${e}`); added.push({ id: x, bought: L.support.set, at: `${e === 'a' ? ha : hb}.s1`, guideOf: sc.id }); return x; }) : [];
      fits.push({ a: mo, b: plate, fastens: true, min: -0.1, note: 'The motor\'s face on its plate' }, { a: mo, b: cp, min: -100, note: 'The motor\'s shaft in the coupler' }, { a: sw, b: cp, min: -100, note: 'The screw in the coupler' },
        { a: sw, b: nt, min: -100, note: 'The screw through its nut' }, { a: sw, b: cid, min: -100, note: 'The screw through the carriage' }, { a: nt, b: cid, fastens: true, min: -100, note: 'The nut in its bore, its flange screwed on' },
        { a: sw, b: ha, min: -100, note: 'The screw through holder a' }, { a: sw, b: hb, min: -100, note: 'The screw into holder b' }, ...sup.flatMap((x, k) => [{ a: x, b: k ? hb : ha, fastens: true, min: -100, note: 'The screw\'s bearing pressed into its holder' }, { a: sw, b: x, min: -100, note: 'The screw in its bearing' }]));
      legFastens(plate, pm, `${sc.id}: the motor plate's leg`, sc.id);
      jspec._guide.screw = sc.id;
      guides.push({ id: sc.id, kind: 'screw', guide: id, beam: bid, plate: pm, motor: mo, items: { plate, coupler: cp, screw: sw, nut: nt, support: sup }, length: slen, lead: L.screw.lead, friction: num(friction), frictionKind: sg.friction != null ? 'given' : L.screw.frictionKind, layout: L, from: xm, carriages: [], joints: [jid], wheels: [], note: sg.note ?? null, fasten: [] });
    }
    if (es) {
      added.push({ id: es.mount, fitting: es.spec, at: es.at, guideOf: id });
      added.push({ id: es.sw, bought: es.set, at: `${es.mount}.switch`, guideOf: id });
      fits.push({ a: es.sw, b: es.mount, fastens: true, min: -0.1, note: 'The switch screwed to its mount' }, { a: es.sw, b: cid, min: -1, note: 'The flag on the lever, at home' });
      es.model.screws.forEach((x, k) => fasten.push({ screw: `${x.thread} ${x.head}`, through: [es.mount], into: `${bid}.${es.side}`, at: [`${es.mount}.b${k + 1}`], nut: x.nutKind, note: `${id}: the endstop's mount into ${bid}'s ${es.side} slot`, guideOf: id }));
      jspec.home = { endstop: `${es.sw}.lever`, direction: -1 };
      record.endstop = { mount: es.mount, switch: es.sw, at: es.at, home: es.home, model: es.model };
    }
    poses[`${id}-a`] = { [jid]: lo }; poses[`${id}-b`] = { [jid]: travel0 };
    guides.push(record);
  };
  list.forEach((g, i) => {
    const what = `guide ${g?.id ?? i + 1}`;
    if (!g || typeof g !== 'object' || Array.isArray(g)) throw new Error(`${what} is { "kind": "rail", "rail": "rail-mgn12", "on": "x1.top", "length": 300 } (got ${shown(g)})`);
    if (!KEYS[g.kind]) throw new Error(`${what}: kind is rail (a miniature linear rail), wheels (a plate on V-wheels in a V-slot's tracks), slider (a printed slider in or over a slot), rods (two rods in printed holders, a printed carriage on linear bearings) or screw (a lead screw and its motor driving a rods guide's carriage); a belt is not built yet (got ${shown(g.kind)})`);
    if (g.kind === 'screw') return; // (worked out with the rods guide it drives)
    for (const k of Object.keys(g)) if (!KEYS[g.kind].includes(k)) throw new Error(`${what}: a ${g.kind} guide has no "${k}": it takes ${KEYS[g.kind].join(', ')}`);
    const id = g.id ?? `g${i + 1}`;
    if (!/^[a-z][\w-]*$/.test(id) || ids.has(id)) throw new Error(`${what}: id ${shown(id)} is ${ids.has(id) ? 'an item already' : 'not a name (letters, digits, - or _)'}`);
    ids.add(id);
    const on = String(g.on ?? ''), dot = on.indexOf('.'), bid = on.slice(0, dot), faceName = on.slice(dot + 1);
    if (dot < 0 || on.includes('@')) throw new Error(`${what}: on is a beam's slotted face, as x1.top; where along it is "from" (got ${shown(g.on)})`);
    if (!beams.has(bid)) throw new Error(`${what}: on names a beam item of this assembly, and ${bid} is ${items.some((x) => x.id === bid) ? 'not a beam' : 'not an item'} (beams: ${[...beams.keys()].join(', ') || 'none'})`);
    const B = beamOf(beams.get(bid), num, context).model, q = B.places.find((x) => x.name === faceName || (x.face === faceName && x.index === 1));
    if (!q) throw new Error(`${what}: ${bid} has no face "${faceName}": it has ${[...new Set(B.places.map((x) => x.face))].join(', ')}`);
    if (g.kind === 'rods') { rodsGuide(g, { what, id, bid, B, q, faceName }); return; }
    if (g.kind !== 'rail') { rolling(g, { what, id, bid, B, q, faceName }); return; }
    if (!q.slot) throw new Error(`${what}: ${bid}'s ${faceName} face is closed: a rail's screws go into slot nuts, so it goes on a slotted face`);
    const from = g.from != null ? num(g.from) : 0, length = num(g.length), face = B.places.filter((x) => x.face === q.face).length > 1 ? q.name : q.face;
    let m;
    try { m = railModel(g.rail, { length, ...(g.carriage != null ? { variant: g.carriage } : {}), ...(g.carriages != null ? { carriages: g.carriages } : {}), given }); } catch (e) { throw new Error(`${what}: ${strip(e)}`); }
    if (!(from >= 0 && from + length <= B.length + 1e-9)) throw new Error(`${what}: the rail runs from ${mm(from)} to ${mm(from + length)} mm along ${bid}, which is ${mm(B.length)} mm long: move "from" or cut it shorter`);
    // what crosses its face: a beam joined to it there, by the join's address
    const keep = [];
    for (const j of a.joins ?? []) {
      const [jb, jat] = String(j?.b ?? '').split('@'), [jbid, ...jf] = jb.split('.'), other = String(j?.a ?? '').split('.')[0];
      if (jbid !== bid || jat == null || ![q.name, q.face].includes(jf.join('.')) || !beams.has(other)) continue;
      const d = /%$/.test(jat) ? (parseFloat(jat) / 100) * B.length : parseFloat(jat) < 0 || String(jat).startsWith('-') ? B.length + parseFloat(jat) : parseFloat(jat), o = beamOf(beams.get(other), num, context).model.profile, half = Math.max(o.width, o.height) / 2;
      keep.push({ from: r3(d - half), to: r3(d + half), what: `${other} joined at ${j.b}` });
    }
    const fit = guideFit(m, B.profile, { face, from, beam: B.length, keep, ...(g.nut ? { nut: g.nut } : {}), given: givenFor(context, B.profile.name) });
    const rid = id, record = { id, beam: bid, face: q.name, from, length, model: m, fit, carriages: [], joints: [], keep, note: g.note ?? null };
    added.push({ id: rid, bought: m.set, _guide: { part: 'rail', model: m }, at: `${bid}.${q.name}@${r3(from)}`, guideOf: id });
    // its screws into the slot, at its holes: only where a nut is made for them (else guide.fit says why)
    if (fit.nut) fasten.push({ screw: `${m.rail.thread} cap`, through: [rid], into: `${bid}.${q.name}`, at: m.screws.map((x) => `${rid}.${x.name}`), nut: g.nut ?? fit.nut.nutKind, note: `${id}: the rail into ${bid}'s ${q.name} slot, a screw every ${mm(m.rail.pitch)} mm`, guideOf: id });
    // the carriages, each on its own slide along the beam, from the start of its share of the rail
    const normal = [q.normal[0], q.normal[1], 0], terms = (() => { try { return railTerms(m, B.profile, { beam: B.length, face, given: givenFor(context, B.profile.name) }); } catch { return m.terms; } })();
    m.lanes.forEach((ln, k) => {
      const cid = `${id}-carriage-${k + 1}`, jid = `${id}-${k + 1}`;
      if (ids.has(cid) || ids.has(jid)) throw new Error(`${what}: ${ids.has(cid) ? cid : jid} is an item already: give the guide another id`);
      ids.add(cid);
      added.push({ id: cid, bought: m.set, variant: m.variant, _guide: { part: 'carriage', model: m }, guideOf: id });
      joints.push({ id: jid, type: 'prismatic', parent: { item: bid, at: [q.at[0], q.at[1], r3(from + ln.rest)], axis: [0, 0, 1], ref: normal }, child: `${cid}.slide`, min: 0, max: ln.travel, label: `${cid} slides along ${bid}`, _guide: { id, carriage: cid, model: m, terms } });
      record.carriages.push(cid); record.joints.push(jid);
    });
    poses[`${id}-a`] = Object.fromEntries(record.joints.map((j) => [j, 0])); poses[`${id}-b`] = Object.fromEntries(record.joints.map((j) => [j, m.travel]));
    record.terms = terms;
    try { record.jig = railJigModel(B.profile, { rail: m.set, face, given: givenFor(context, B.profile.name) }); } catch (e) { record.jig = { error: String(e.message).replace(/^railJigModel: /, '') }; }
    guides.push(record);
  });
  const out = { ...a, items: [...items, ...added], ...(fasten.length ? { fasten: [...(a.fasten || []), ...fasten] } : {}), ...(fits.length ? { fits: [...(a.fits || []), ...fits] } : {}), joints: [...(a.joints || []), ...joints], poses: { ...(a.poses || {}), ...poses } };
  for (const r of guides) r.fasten = fasten.map((x, k) => (x.guideOf === r.id ? first + k : -1)).filter((k) => k >= 0);
  return { a: out, guides };
}

/**
 * A guide's rail or carriage item, built as a bought reference: the rail with its counterbored holes and an anchor on
 * each screw's axis at its head's seat (h1, h2 ..); a carriage with its anchors slide (where its joint holds it), top
 * and t1 to t4 (its tapped holes, from its top). @param {object} it @param {string} id
 */
export function guideBuilt(it, id) {
  const { part, model: m } = it._guide;
  // a screw drive's bought parts, drawn from their sets' figures along their own z: the coupler, the screw, the lead nut
  if (part === 'coupler' || part === 'screw' || part === 'nut') {
    const g = it._guide, rod = (r, z0, z1, seg = 48) => translate([0, 0, (z0 + z1) / 2], cylinder({ radius: r, height: z1 - z0, segments: seg }));
    const body = part === 'coupler' ? subtract(rod(g.D / 2, 0, g.length), rod(g.bores[0] / 2, -1, g.length / 2), rod(g.bores[1] / 2, g.length / 2, g.length + 1))
      : part === 'screw' ? rod(g.d / 2, g.from, g.from + g.length) : subtract(union(rod(g.flange / 2, 0, g.flangeWidth), rod(g.body / 2, g.flangeWidth - g.length, 0.01)), rod(g.d / 2, -g.length - 1, g.flangeWidth + 1));
    const label = part === 'coupler' ? `${g.set} coupler` : part === 'screw' ? `${g.set} x ${mm(g.length)} mm` : `${g.set} lead nut`;
    const parts = named({ body }, { body: { label } }), anchors = { origin: { at: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] } };
    const values = part === 'screw' ? { length: g.length, diameter: g.d, lead: g.lead } : part === 'coupler' ? { length: g.length, diameter: g.D } : { flange: g.flange, length: g.length };
    const mass = part === 'screw' ? r3((Math.PI * (g.d / 2) ** 2 * g.length * 7.85e-6)) : null; // (a steel rod's: an estimate of a screw's mass, 7.85 g/cm³)
    return referenceBuilt({ id, key: `guide-${part}`, objName: `${part}:${g.set}${part === 'screw' ? `:${g.length}` : ''}`, name: g.set, parts, anchors, entries: [], values, extra: { bought: { set: g.set, variant: null, part: part === 'screw' ? 'leadscrew' : part, mass, ...(part === 'screw' ? { length: g.length } : {}) } } });
  }
  if (part === 'wheel') {
    const parts = named({ body: vWheel(m, { eccentric: it._guide.eccentric }) }, { body: { label: `${m.wheel} on ${it._guide.eccentric ? m.eccentric : 'a plain spacer'}` } });
    // (the whole wheel is checked for overlaps: its rim runs in the track, which the beam's envelope leaves open, so a rim
    // that strays out of it, or a beam or part across its track's line, is found)
    const anchors = { axle: { at: [0, 0, 0], axis: [0, 0, 1], ref: [1, 0, 0] } }, values = { diameter: SETS_OF(m).diameter, axle: m.seat.axle, depth: m.seat.depth, radial: m.ratings.radial, axial: m.ratings.axial };
    return referenceBuilt({ id, key: 'guide-wheel', objName: `wheel:${m.wheel}${it._guide.eccentric ? ':eccentric' : ''}`, name: m.wheel, parts, anchors, entries: [], values, extra: { guide: m, bought: { set: m.wheel, variant: null, part: 'wheel', mass: m.kitMass } } });
  }
  if (part === 'rail') {
    const parts = named({ body: rail(m) }, { body: { label: `${m.set} rail x ${mm(m.length)} mm` } });
    const anchors = { a: { at: [0, 0, 0], axis: [-1, 0, 0], ref: [0, 0, 1] }, top: { at: [m.length / 2, 0, m.rail.height], axis: [0, 0, 1], ref: [1, 0, 0] }, ...Object.fromEntries(m.screws.map((x) => [x.name, { at: x.at, axis: x.axis }])) };
    const values = { length: m.length, holes: m.holes.length, pitch: m.rail.pitch, end: m.rail.end, mass: m.rail.mass };
    return referenceBuilt({ id, key: 'guide-rail', objName: `rail:${m.set}`, name: m.set, parts, anchors, entries: [], values, extra: { guide: m, bought: { set: m.set, variant: null, part: 'rail', mass: m.rail.mass, length: m.length } } });
  }
  const c = m.carriage, parts = named({ body: carriage(m) }, { body: { label: `${m.set} carriage ${c.variant ?? ''}`.trim() } });
  const anchors = { slide: { at: [0, 0, 0], axis: [1, 0, 0], ref: [0, 0, 1] }, top: { at: [0, 0, c.height], axis: [0, 0, 1], ref: [1, 0, 0] }, ...Object.fromEntries(c.holes.map(([x, y], k) => [`t${k + 1}`, { at: [x, y, c.height], axis: [0, 0, -1] }])) };
  const values = { length: c.length, width: c.width, height: c.height, travel: m.travel, static_rating: c.ratings.C0, moment_roll: c.ratings.MR, moment_pitch: c.ratings.MP, moment_yaw: c.ratings.MY, ...(c.mass != null ? { mass: c.mass } : {}) };
  return referenceBuilt({ id, key: 'guide-carriage', objName: `carriage:${m.set}:${c.variant}`, name: `${m.set} ${c.variant}`, parts, anchors, entries: [], values, extra: { guide: m, bought: { set: m.set, variant: c.variant, part: 'carriage', mass: c.mass ?? null } } });
}

/**
 * A built assembly's guide findings: guide.holes, guide.end and guide.travel from the rail's model, guide.fit (on the
 * face, its nuts, its ends), guide.budget (what it adds to an error budget) and guide.jig (the printed jig that
 * centres it, and how to print one). @param {object} s a built assembly @param {Function} f the findings' sink
 */
export function guideFindings(s, f) {
  for (const r of s.guides ?? []) {
    if (r.kind === 'rods') {
      const m = r.model, L = r.layout, refs = { guide: r.id, beam: r.beam, carriages: r.carriages, rods: r.rods, bearings: r.bearings };
      f('info', `${r.id}: two ${L.rod.set} rods ${mm(L.spacing)} mm apart, ${mm(L.height)} mm over ${r.beam}'s ${r.face} face, in printed holders from ${mm(r.from)} to ${mm(r.from + r.length)} mm along it; a printed carriage on two ${L.bearing.set} (${mm(m.own)} mm long with what it carries) slides ${mm(r.travel)} mm${r.lo ? `, from its home ${mm(r.lo)} mm along` : ''}`, null, { code: 'guide.travel', values: { from: r.from, length: r.length, own: m.own, travel: r.travel, home: r.lo, spacing: L.spacing, height: L.height }, refs });
      f('info', `${r.id}: the rods are ${mm(r.length)} mm of ${L.rod.set}, cut to length; each ${L.bearing.set} is rated ${mm(L.bearing.C0)} N static and ${mm(L.bearing.C)} N dynamic (${SETS_KIND(L)})`, null, { code: 'guide.rating', values: { static: L.bearing.C0, dynamic: L.bearing.C }, refs });
      if (r.endstop) f('info', `${r.id}: ${r.endstop.switch} on its printed mount at ${r.endstop.at}; the carriage's flag meets its lever ${mm(r.endstop.home)} mm along the travel, where the joint homes (the lever's place is an estimate: measure your switch's lever and its pretravel)`, null, { code: 'guide.endstop', values: { home: r.endstop.home, lever: r.endstop.model.lever }, refs: { ...refs, switch: r.endstop.switch, mount: r.endstop.mount } });
      continue;
    }
    if (r.kind === 'screw') {
      const L = r.layout, refs = { guide: r.id, drives: r.guide, motor: r.motor, ...r.items };
      f('info', `${r.id}: ${L.motor.set} on a printed plate ${mm(r.from)} mm along ${r.beam}, through ${L.coupler.set} to ${mm(r.length)} mm of ${L.screw.set} (a ${mm(r.lead)} mm lead${L.support ? `, in a ${L.support.set} at each holder` : ''}), the ${L.nut.set} on ${r.guide}'s carriage; the lead and the nut's friction μ ${n3(r.friction, 3)} (${r.frictionKind ?? 'default'}) go to the motor's checks as a lead screw`, null, { code: 'guide.drive', values: { lead: r.lead, length: r.length, friction: r.friction, engaged: r.plate.engaged }, refs });
      const engaged = r.plate.engaged, want = L.motor.shaft.d;
      f(engaged >= want - 1e-9 ? 'pass' : 'warn', `${r.id}: the motor's shaft reaches ${mm(engaged)} mm into ${L.coupler.set} (the plate ${mm(r.plate.thickness)} mm${r.plate.recess ? `, the coupler ${mm(r.plate.recess.depth)} mm into it` : ''}), ${engaged >= want - 1e-9 ? 'at least' : 'less than'} its ${mm(want)} mm diameter${engaged >= want - 1e-9 ? '' : ': a thinner plate at the shaft, or a motor with a longer shaft'}`, engaged >= want - 1e-9 ? null : `${r.id}: shaft short`, { code: 'guide.coupler', values: { engaged, want }, refs });
      continue;
    }
    if (r.kind === 'wheels' || r.kind === 'slider') {
      const m = r.model, refs = { guide: r.id, beam: r.beam, carriages: r.carriages, ...(r.wheels.length ? { wheels: r.wheels } : {}) };
      f('info', `${r.id}: ${r.kind === 'wheels' ? `a plate on ${m.count} ${m.wheel} wheels over ${r.beam}'s ${r.face} face, ${mm(m.length)} mm long over its wheels, rolls` : `a printed slider ${mm(m.length)} mm long in ${r.beam}'s ${r.face} slot slides`} from ${mm(r.from)} to ${mm(r.from + r.length)} mm along ${r.beam}: travel ${mm(r.travel)} mm`, null, { code: 'guide.travel', values: { from: r.from, length: r.length, own: m.length, travel: r.travel }, refs });
      continue;
    }
    const refs = { guide: r.id, beam: r.beam, rail: r.model.set, carriages: r.carriages };
    for (const x of r.model.findings) f(x.level, `${r.id}: ${x.text}`, x.level === 'warn' || x.level === 'fail' ? `${r.id}: ${x.code}` : null, { code: x.code, values: x.values ?? {}, refs });
    for (const x of r.fit.findings) f(x.level, `${r.id}: ${x.text}`, x.level === 'fail' ? `${r.id}: fit` : null, { code: x.code, values: x.values ?? {}, refs: { ...refs, ...(x.refs ?? {}) } });
    const t = r.terms ?? [];
    if (t.length) f('info', `${r.id}: along its travel it adds ${t.map((x) => `${x.term} ${n3(x.value, 3)} mm (${x.kind})`).join(', ')} to the error budget: ${n3(t.reduce((a, x) => a + x.value, 0), 3)} mm at worst. The beam's sag is an estimate (${GUIDE_DEFAULTS.sag.rule.split(':')[0].toLowerCase()})`, null, { code: 'guide.budget', values: { terms: t, worst: t.reduce((a, x) => a + x.value, 0) }, refs });
    if (r.jig?.error) f('info', `${r.id}: no printed jig: ${r.jig.error}`, null, { code: 'guide.jig', refs });
    else if (r.jig) f('info', `${r.id}: a printed jig centres the rail on ${r.beam} while its screws are tightened: ${n3(r.jig.grams)} g, ${n3(r.jig.margin)}× its load. Print one as an item: { "fitting": { "kind": "rail-jig", "profile": "${r.jig.profile.replace(/^profile-/, '')}", "rail": "${r.model.set}" } }`, null, { code: 'guide.jig', values: { grams: r.jig.grams, margin: r.jig.margin }, refs });
  }
}

/**
 * Each carriage's loads against its ratings, at every pose the machine is in (its named poses, the guide's two ends among
 * them, and as drawn): the weight of everything it carries and the masses the assembly's loads hang on it, as a force
 * and a moment about the carriage's middle on the rail's top, in the carriage's frame. joint.moment fails past its
 * ratings (frames' carriageMargin). @param {object} s @param {Function} f
 * @param {{ placeItems: Function, jointValues: Function }} helpers @param {{ masses: object[], beyond: Function, poses: object[] }} known
 */
export function carriageChecks(s, f, helpers, { masses, beyond, poses }) {
  const motion = s.motion, { placeItems } = helpers, ids = motion.items.map((x) => x[0]), g = motion.gravity || [0, 0, -1], gl = Math.hypot(...g), down = g.map((x) => x / gl);
  const specs = new Map((s.a.joints || []).filter((j) => j._guide).map((j) => [j.id, j]));
  for (const j of motion.joints) {
    const spec = specs.get(j.id); if (!spec || spec._guide.kind === 'slider') continue;
    const m = spec._guide.model, wheels = spec._guide.kind === 'wheels', rods = spec._guide.kind === 'rods', ci = ids.indexOf(spec._guide.carriage), hang = (motion.loads || []).filter((l) => l.mass != null).map((l) => ({ kg: l.mass, item: typeof l.item === 'number' ? l.item : ids.indexOf(l.item), frame: l.frame }));
    const o = rods ? m.anchors.slide.at : wheels ? [0, 0, 0] : [0, 0, m.rail.height]; // (about the carriage's middle: a rail's on its top, a wheel plate's on the face, a rod carriage's on its rods' line)
    let worst = null;
    for (const p of poses) {
      const W = placeItems(motion, p.values), C = W[ci], O = [0, 1, 2].map((k) => C[4 * k] * o[0] + C[4 * k + 1] * o[1] + C[4 * k + 2] * o[2] + C[4 * k + 3]);
      let F = [0, 0, 0], M = [0, 0, 0], kg = 0;
      const add = (mass, X) => { const fo = down.map((x) => x * mass * G), r = [X[0] - O[0], X[1] - O[1], X[2] - O[2]]; F = F.map((x, k) => x + fo[k]); M = [M[0] + (r[1] * fo[2] - r[2] * fo[1]) / 1000, M[1] + (r[2] * fo[0] - r[0] * fo[2]) / 1000, M[2] + (r[0] * fo[1] - r[1] * fo[0]) / 1000]; kg += mass; };
      for (const q of masses) if (q.item === ci || beyond(motion, j, q.item)) { const Wq = W[q.item]; add(q.kg, [0, 1, 2].map((k) => Wq[4 * k] * q.centre[0] + Wq[4 * k + 1] * q.centre[1] + Wq[4 * k + 2] * q.centre[2] + Wq[4 * k + 3])); }
      for (const l of hang) if (l.item === ci || beyond(motion, j, l.item)) { const Wq = W[l.item], at = [l.frame[3], l.frame[7], l.frame[11]]; add(l.kg, [0, 1, 2].map((k) => Wq[4 * k] * at[0] + Wq[4 * k + 1] * at[1] + Wq[4 * k + 2] * at[2] + Wq[4 * k + 3])); }
      const local = (v) => [0, 1, 2].map((k) => C[k] * v[0] + C[4 + k] * v[1] + C[8 + k] * v[2]); // (the carriage's axes, as rows of its frame's transpose)
      const load = { force: local(F), moment: local(M) }, r = rods ? rodMargin(m, load) : wheels ? wheelMargin(m, load) : carriageMargin(m, load);
      if (!worst || r.margin < worst.r.margin) worst = { r, load, p, kg, O };
    }
    if (!worst) continue;
    const { r, load, p, kg, O } = worst, [, Fy, Fz] = load.force, [Mx, My, Mz] = load.moment;
    if (rods) {
      const b = r.bearings.find((x) => x.name === r.worst);
      const text = `${spec._guide.carriage} on ${spec._guide.id}: ${n3(kg * 1000, 0)} g carried, worst ${p.label}: ${n3(Math.hypot(Fy, Fz), 1)} N across the rods, roll ${n3(Mx, 3)}, pitch ${n3(My, 3)} and yaw ${n3(Mz, 3)} N m; its most loaded bearing, ${r.worst}, takes ${n3(b.radial, 1)} N against ${m.bearing}'s ${n3(r.rating, 0)} N static rating: ${n3(r.margin, 1)} times over${r.level === 'fail' ? ', past its rating' : ''} (a moment on a bush as a couple along it: an estimate)`;
      f(r.level, text, r.level === 'pass' ? null : `${j.id}: bearings ${n3(r.margin, 1)}×`, { code: 'joint.moment', at: O, refs: { joint: j.id, carriage: spec._guide.carriage, guide: spec._guide.id, bearing: m.bearing }, values: { force: load.force, moment: load.moment, bearings: r.bearings, worst: r.worst, margin: r.margin, carried: kg, pose: p.label, rating: r.rating } });
      continue;
    }
    if (wheels) {
      const w = r.wheels.find((x) => x.name === r.worst), rt = m.ratings;
      const text = `${spec._guide.carriage} on ${spec._guide.id}: ${n3(kg * 1000, 0)} g carried, worst ${p.label}: ${n3(Math.hypot(Fy, Fz), 1)} N on the plate, roll ${n3(Mx, 3)}, pitch ${n3(My, 3)} and yaw ${n3(Mz, 3)} N m; its most loaded wheel, ${r.worst}, takes ${n3(w.radial, 1)} N across and ${n3(w.axial, 1)} N along its axle against ${n3(rt.radial, 1)} and ${n3(rt.axial, 1)} N: ${n3(r.margin, 2)} times over${r.level === 'fail' ? ', past its rating' : ''} (each wheel's rating from its plastic's contact pressure, and the loads shared out among the wheels: estimates)`;
      f(r.level, text, r.level === 'pass' ? null : `${j.id}: wheels ${n3(r.margin, 1)}×`, { code: 'joint.moment', at: O, refs: { joint: j.id, carriage: spec._guide.carriage, guide: spec._guide.id, wheel: m.wheel }, values: { force: load.force, moment: load.moment, wheels: r.wheels, worst: r.worst, margin: r.margin, carried: kg, pose: p.label, ratings: { radial: rt.radial, axial: rt.axial } } });
      continue;
    }
    const c = m.carriage.ratings;
    const text = `${spec._guide.carriage} (${m.carriage.variant}) on ${spec._guide.id}: ${n3(kg * 1000, 0)} g carried, worst ${p.label}: ${n3(Math.hypot(Fy, Fz), 1)} N across the rail, roll ${n3(Mx, 3)}, pitch ${n3(My, 3)} and yaw ${n3(Mz, 3)} N m, against C0 ${c.C0} N, MR ${c.MR}, MP ${c.MP} and MY ${c.MY} N m: ${n3(r.margin, 2)} times over${r.level === 'fail' ? `, past its ${r.worst} rating` : ''} (each load over its rating, summed: an estimate of how they combine)`;
    f(r.level, text, r.level === 'pass' ? null : `${j.id}: carriage ${n3(r.margin, 1)}×`, { code: 'joint.moment', at: O, refs: { joint: j.id, carriage: spec._guide.carriage, guide: spec._guide.id, rail: m.set }, values: { force: load.force, moment: load.moment, ratios: r.ratios, margin: r.margin, carried: kg, pose: p.label, ratings: c } });
  }
}
