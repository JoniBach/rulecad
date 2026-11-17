// Operations on a beam: what is done to a length of a profile once it is cut, each placed by an address on the beam
// and dimensioned from end a. Each is a line on the beam's cut-and-drill sheet and a cut in its solid: a square cut and
// a mitre at an end, a thread tapped in an end bore, holes across it (an access hole for a key, a drilled hole, a seat
// for a head), a milled pocket, a notch in a slot's lips, and deburring. Anything named by a thread takes its sizes
// from @rulecad/fixings (a hole's diameter, a head's seat, the thread to engage in the alloy), drawn as a machine cuts
// it: no hole compensation and no teardrops, which are for printing.
//
// The beam's frame is beam.mjs's: end a at z = 0, end b at z = length, the section in x and y. Units: mm, degrees.
import jscad from '@jscad/modeling';
import { fixingModel, holeModel, counterboreModel, engagement } from '@rulecad/fixings';
import { outline } from './profile.mjs';

const { cylinder, cuboid, polygon, roundedRectangle } = jscad.primitives, { extrudeLinear } = jscad.extrusions;
const { transform, rotateX, translate } = jscad.transforms;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const OUT = 0.1; // how far a cutter starts outside the face it enters by, so no faces lie on each other
const SEGMENTS = 32;
const FACES = ['top', 'bottom', 'front', 'back'];
const CHECKED = '2026-11-15';

/**
 * The operations a beam takes, each with the keys it takes besides op and at. at is an address on the beam: an end
 * (a, b), an end's bore (a.1), or a face's place with a distance from end a (top@120, top@-20 from end b, top@50%).
 * @type {Record<string, { what: string, at: 'end' | 'bore' | 'face', keys: string[] }>}
 */
export const OPS = {
  cut: { what: 'a square cut to length', at: 'end', keys: [] },
  mitre: { what: 'an end cut at an angle, about a named face', at: 'end', keys: ['angle', 'about', 'long'] },
  tap: { what: 'a thread cut in an end bore', at: 'bore', keys: ['thread', 'depth'] },
  access: { what: 'a hole across the beam, in line with a slot, for a key', at: 'face', keys: ['thread', 'head', 'diameter', 'depth', 'through'] },
  drill: { what: 'a hole through one wall or right through, plain or tapped', at: 'face', keys: ['thread', 'kind', 'diameter', 'depth', 'through'] },
  counterbore: { what: 'a seat for a head in a face, with the screw\'s hole through the wall', at: 'face', keys: ['thread', 'head', 'diameter', 'depth'] },
  pocket: { what: 'a milled pocket by outline', at: 'face', keys: ['size', 'outline', 'radius', 'depth'] },
  notch: { what: 'part of a slot\'s lips cut away, to load a nut mid-span', at: 'face', keys: ['length'] },
  deburr: { what: 'named so the sheet asks for it', at: 'end', keys: [] },
};
const DRILL_KINDS = ['clearance', 'close', 'loose', 'tap'];

/**
 * The rules operations are checked and sized by, each with what it rests on.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string, source: string, checked: string }>}
 */
export const OP_DEFAULTS = {
  edge: { value: 1, unit: 'diameters', rule: 'How near an end a hole across the beam may come: its centre at least one diameter from the end, so the metal between its edge and the end is at least half a diameter. A workshop rule of thumb for a hole near an edge in thin metal, not taken from a standard here: a hole nearer may tear out or burst the end under load', kind: 'estimate', source: 'workshop practice, not checked against a standard', checked: CHECKED },
  seat: { value: 0.75, unit: 'mm', rule: 'Room each side of a head in a machined counterbore. DIN 974-1 sets counterbore diameters for socket head screws; this figure is read as about what it gives for M5 (a 10 mm seat round an 8.5 mm head), and was not checked against the standard here', kind: 'estimate', source: 'DIN 974-1 (not checked here)', checked: CHECKED },
  key: { value: 0.5, unit: 'mm', rule: 'Room across an access hole round a hex key\'s corners, where no clearance figure of the thread is wide enough: the hole is the smallest of the thread\'s clearance holes wider than the key across its corners (head_key / cos 30°), else the corners and this', kind: 'estimate', source: 'a working allowance, not a standard', checked: CHECKED },
  radius: { value: 1.5, unit: 'mm', rule: 'The corner radius of a milled pocket where none is given: a 3 mm end mill\'s, a small cutter a workshop commonly has. A milled pocket\'s inside corners are never sharper than its cutter', kind: 'estimate', source: 'workshop practice, not checked against a standard', checked: CHECKED },
};

// How a machine sizes a hole: the thread's figure as drawn, with no printer's compensation
const MACHINED = { name: 'machining', hole_comp: 0, fit: OP_DEFAULTS.seat.value, layer: 0.01, chamfer: 0 };
const classOf = (mat) => { const E = mat?.modulus; return E == null ? 'aluminium' : E < 20000 ? 'plastic' : E < 100000 ? 'aluminium' : 'steel'; };

// A frame as a 4x4 matrix (JSCAD's, by columns): x along ref, z along axis, from origin
function frameOf({ origin, axis, ref }) {
  const y = [axis[1] * ref[2] - axis[2] * ref[1], axis[2] * ref[0] - axis[0] * ref[2], axis[0] * ref[1] - axis[1] * ref[0]];
  return [...ref, 0, ...y, 0, ...axis, 0, ...origin, 1];
}
// Where a line across the section (from p, along d) is in metal: the spans [t0, t1] along it, from the outline's loops
function spans(loops, p, d) {
  const ts = [];
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const q0 = loop[i], q1 = loop[(i + 1) % loop.length];
    const s0 = d[0] * (q0[1] - p[1]) - d[1] * (q0[0] - p[0]), s1 = d[0] * (q1[1] - p[1]) - d[1] * (q1[0] - p[0]);
    if ((s0 > 0) === (s1 > 0)) continue;
    const k = s0 / (s0 - s1), x = q0[0] + k * (q1[0] - q0[0]), y = q0[1] + k * (q1[1] - q0[1]);
    ts.push((x - p[0]) * d[0] + (y - p[1]) * d[1]);
  }
  ts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i], ts[i + 1]]);
  return out;
}

/**
 * A beam's operations, each checked and worked out: where it is (its distance from end a, its frame), its sizes (from
 * @rulecad/fixings where a thread names it), its line on the sheet, and what to know about it. Bad input is refused
 * by name.
 * @param {object} b a beam's model, before its ops (beamModel calls this)
 * @param {object[]} list the operations: { op, at, ... } as OPS lists
 * @param {(b: object, address: string) => object} anchorOf beamAnchor
 * @returns {{ ops: object[], findings: object[] }}
 */
export function opsOf(b, list, anchorOf) {
  const what = `${b.name}: ops`, out = [], findings = [], p = b.profile, L = b.length;
  if (!Array.isArray(list)) throw new Error(`${what} is a list of operations, [{ op: 'tap', at: 'a' }] (got ${shown(list)})`);
  if (list.length && p.family === 'printed') throw new Error(`${what}: ${p.name} is a printed profile: operations on a printed beam become features of the print, a later release (Frames 3.5)`);
  const loops = outline(p).loops, cls = classOf(b.material);
  list.forEach((o, i) => {
    const w = `${what}[${i}]`;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${w} is an operation, { op, at } (got ${shown(o)})`);
    const spec = OPS[o.op];
    if (!spec) throw new Error(`${w}: no operation ${shown(o.op)}: there are ${Object.keys(OPS).join(', ')}`);
    const ow = `${w} (${o.op})`;
    for (const k of Object.keys(o)) if (!['op', 'at', ...spec.keys].includes(k)) throw new Error(`${ow}: no "${k}": ${o.op} takes at${spec.keys.length ? `, ${spec.keys.join(', ')}` : ''}`);
    if (typeof o.at !== 'string') throw new Error(`${ow}: at is an address on the beam: ${spec.at === 'face' ? 'a face with a distance, top@120, top@-20 or top@50%' : spec.at === 'bore' ? 'an end (a, b) or one of its bores (a.1)' : 'an end, a or b'} (got ${shown(o.at)})`);
    const at = o.at.trim(), end = /^[ab](\.|$)/.test(at) ? at[0] : null;
    if (spec.at === 'face' && end) throw new Error(`${ow}: ${o.op} is on a face, not an end: at is a face's place with a distance (top@120), and ${at} is an end`);
    if (spec.at === 'end' && !/^[ab]$/.test(at)) throw new Error(`${ow}: ${o.op} is at an end: at is a or b (got ${shown(o.at)})`);
    if (spec.at === 'bore' && !end) throw new Error(`${ow}: a tap is in an end bore: at is an end (a, b) or a bore (a.1) (got ${shown(o.at)})`);
    const num = (k, { min = 0, open = true, need = false } = {}) => {
      const v = o[k];
      if (v == null) { if (need) throw new Error(`${ow}: give ${k}`); return null; }
      if (!isNum(v) || (open ? v <= min : v < min)) throw new Error(`${ow}: ${k} is a number ${open ? 'above' : 'of at least'} ${min} (got ${shown(v)})`);
      return v;
    };
    const op = { op: o.op, at, end, face: null, place: null, distance: end === 'a' ? 0 : end === 'b' ? L : null };
    if (end) op.anchor = anchorOf(b, end);
    // ---- at an end ----
    if (o.op === 'cut' || o.op === 'deburr') op.line = o.op === 'cut' ? `cut end ${end} square` : `deburr end ${end}`;
    if (o.op === 'mitre') {
      const angle = num('angle', { need: true });
      if (!(angle < 90)) throw new Error(`${ow}: angle is from square, above 0 and under 90 degrees (got ${shown(angle)})`);
      if (!FACES.includes(o.about)) throw new Error(`${ow}: about names the face the angle is seen on: ${FACES.join(', ')} (got ${shown(o.about)})`);
      const across = ['top', 'bottom'].includes(o.about) ? ['front', 'back'] : ['bottom', 'top'], long = o.long ?? across[1];
      if (!across.includes(long)) throw new Error(`${ow}: long is the side the length is measured on, square to ${o.about}: ${across.join(' or ')} (got ${shown(o.long)})`);
      const k = across[0] === 'front' ? 0 : 1, wide = k === 0 ? p.width : p.height, sign = long === across[1] ? 1 : -1;
      Object.assign(op, { angle, about: o.about, long, short: across.find((f) => f !== long), axis: k, sign, wide, cut: r3(wide * Math.tan((angle * Math.PI) / 180)) });
    }
    // ---- a tap in an end bore ----
    if (o.op === 'tap') {
      if (!p.bores.length) throw new Error(`${ow}: ${p.name} has no bore in its ends to tap (no bore_diameter): a tap is cut in an end bore, so this profile takes none. Fasten into a slot, or drill and tap across it`);
      const which = at.length > 1 ? b.bores.filter((x) => x.name === at) : b.bores.filter((x) => x.end === end);
      if (!which.length) throw new Error(`${ow}: ${b.name} has no bore ${at}: it has ${b.bores.map((x) => x.name).join(', ')}`);
      const thread = o.thread ?? which[0].thread;
      if (thread == null) throw new Error(`${ow}: ${p.name}'s bores name no thread (bore_thread): give one, { thread: 'M5' }`);
      if (typeof thread !== 'string') throw new Error(`${ow}: thread is a thread's name, such as M5 (got ${shown(thread)})`);
      let h;
      try { h = holeModel(thread, { kind: 'tap', material: cls, printer: MACHINED, lead: 0 }); } catch (e) { throw new Error(`${ow}: ${String(e.message).replace(/^hole: /, '')}`); }
      const fig = fixFigures(thread);
      const depth = num('depth') ?? h.depth, bore = which[0].diameter;
      if (bore >= fig.major - 1e-9) throw new Error(`${ow}: ${p.name}'s bore is Ø${mm(bore)} mm, as wide as an ${thread} thread (Ø${mm(fig.major)}): no thread can be cut in it. Give a smaller thread, or leave the end cut`);
      Object.assign(op, { thread, bores: which.map((x) => x.name), depth, tapDrill: h.diameter, major: fig.major, pitch: fig.pitch, bore });
      op.line = `tap ${thread} in ${which.length > 1 ? `end ${end}'s bores ${op.bores.join(', ')}` : `bore ${op.bores[0]}`}, ${mm(depth)} mm deep (tap drill Ø${mm(h.diameter)} mm; the bore is Ø${mm(bore)})`;
      if (bore < h.diameter - 0.05) op.line += `: drill to Ø${mm(h.diameter)} first`;
      const e = engagement(thread, { depth: Math.min(depth, L), material: cls });
      op.engagement = { depth: e.depth, need: e.need, enough: e.enough, class: e.class };
      for (const f of e.findings) if (f.level !== 'pass') findings.push({ ...f, text: `${b.name}: the tap at ${at}: ${f.text}`, refs: { ...f.refs, op: i, at } });
      if (depth > L + 1e-9) findings.push({ level: 'fail', code: 'beam.op', text: `${b.name}: the ${thread} tap at ${at} is ${mm(depth)} mm deep, deeper than the bore, which runs the beam's ${mm(L)} mm: tap it shallower, or through`, values: { depth, length: L }, refs: { op: i, at } });
    }
    // ---- on a face ----
    if (spec.at === 'face') {
      const a = anchorOf(b, at), place = b.places.find((x) => x.name === a.name || `${x.face}` === a.name && x.name.endsWith('.1'));
      const z = a.distance ?? L / 2;
      Object.assign(op, { face: place.face, place: place.name, slot: place.slot, distance: z, anchor: { ...a, origin: [a.origin[0], a.origin[1], z] } });
      const d = [-place.normal[0], -place.normal[1]], runs = spans(loops, place.at, d);
      op.walls = runs.map(([t0, t1]) => [r3(t0), r3(t1)]);
      const wall = runs.length ? runs[0][1] : 0, right = runs.length ? runs.at(-1)[1] : 0;
      const sideOf = (x) => (x === 'beam' ? right : wall);
      if (o.op === 'access' || o.op === 'drill' || o.op === 'counterbore') {
        const thread = o.thread ?? null;
        if (thread != null && typeof thread !== 'string') throw new Error(`${ow}: thread is a thread's name, such as M5 (got ${shown(thread)})`);
        if (thread == null && o.diameter == null) throw new Error(`${ow}: give a thread (M5) or a diameter in mm`);
        const through = o.through ?? 'wall';
        if (o.op !== 'counterbore' && !['wall', 'beam'].includes(through)) throw new Error(`${ow}: through is wall (through one wall, the default) or beam (${o.op === 'access' ? 'through every wall on its line, to the slot on the far side, where a blind join\'s head sits' : 'right through'}) (got ${shown(o.through)})`);
        const deep = num('depth') ?? sideOf(o.op === 'counterbore' ? 'wall' : through);
        let diameter = num('diameter'), kind = null, rest = null, key = null, seat = null, fig = null;
        try {
          if (thread != null) fig = fixFigures(thread);
          if (o.op === 'drill') {
            kind = o.kind ?? 'clearance';
            if (!DRILL_KINDS.includes(kind)) throw new Error(`kind is ${DRILL_KINDS.join(', ')} (got ${shown(o.kind)})`);
            if (thread == null && kind !== 'clearance') throw new Error(`a ${kind} hole is sized by its thread: give thread`);
            if (thread != null && diameter == null) { const h = holeModel(thread, { kind, printer: MACHINED, lead: 0, depth: deep, through: true }); diameter = h.diameter; rest = h.basis.rule; }
          } else if (o.op === 'access') {
            const head = o.head ?? 'cap', figure = ACCESS_KEYS[head];
            if (!figure) throw new Error(`head is the screw's head the key turns, ${Object.keys(ACCESS_KEYS).join(', ')} (got ${shown(o.head)})`);
            key = fig ? (isNum(fig.figures[figure]?.value) ? fig.figures[figure].value : null) : null;
            if (diameter == null && key == null) throw new Error(`${thread}'s set names no hex key for a ${head} head (${figure}) to size an access hole for: give a diameter`);
            if (diameter == null) {
              const corners = key / Math.cos(Math.PI / 6), fit = ['clearance_close', 'clearance', 'clearance_loose'].map((n) => [n, fig.figures[n]?.value]).find(([, v]) => isNum(v) && v > corners);
              diameter = fit ? fit[1] : r3(corners + OP_DEFAULTS.key.value); rest = fit ? `${fig.set}.${fit[0]}` : 'OP_DEFAULTS.key';
            }
          } else {
            const c = counterboreModel(thread, { printer: MACHINED, ...(o.head ? { head: o.head } : {}), ...(diameter != null ? { diameter } : {}), ...(o.depth != null ? { depth: o.depth } : {}) });
            seat = { diameter: c.diameter, depth: c.depth, head: c.head }; diameter = c.hole; rest = `${fig.set}.clearance`;
          }
        } catch (e) { throw new Error(`${ow}: ${String(e.message).replace(/^(hole|counterbore): /, '')}`); }
        const depth = o.op === 'counterbore' ? Math.max(wall, seat.depth) : deep;
        Object.assign(op, { thread, kind, diameter: r3(diameter), depth: r3(depth), through: o.op === 'counterbore' ? 'wall' : through, ...(seat ? { seat } : {}), ...(key ? { key } : {}), ...(rest ? { rule: rest } : {}) });
        const from = `${mm(z)} mm from end a${z > L / 2 ? ` (${mm(L - z)} from end b)` : ''}`;
        op.line = o.op === 'access' ? `access hole Ø${mm(diameter)} mm in ${place.name}, ${from}, ${mm(depth)} mm deep${through === 'beam' ? ' (through to the far side)' : ''}${key ? ` for a ${mm(key)} mm key` : ''}`
          : o.op === 'drill' ? `drill Ø${mm(diameter)} mm${kind === 'tap' ? ` and tap ${thread}` : ''} in ${place.name}, ${from}, ${through === 'beam' ? 'right through' : 'through one wall'} (${mm(depth)} mm)`
            : `counterbore Ø${mm(seat.diameter)} x ${mm(seat.depth)} mm for ${thread} ${seat.head} head in ${place.name}, ${from}, with a Ø${mm(diameter)} mm hole through the wall (${mm(depth)} mm)`;
        if (kind === 'tap') {
          const metal = runs.filter(([t0]) => t0 < depth + 1e-9).reduce((s, [t0, t1]) => s + Math.max(0, Math.min(t1, depth) - Math.max(t0, 0)), 0);
          const e = engagement(thread, { depth: Math.max(metal, 1e-3), material: cls });
          op.engagement = { depth: r3(metal), need: e.need, enough: e.enough, class: e.class };
          for (const f of e.findings) if (f.level !== 'pass') findings.push({ ...f, text: `${b.name}: the tapped hole at ${at}: ${f.text}`, refs: { ...f.refs, op: i, at } });
        }
        holeChecks(b, op, i, findings, seat ? seat.diameter : diameter, place);
      }
      if (o.op === 'pocket') {
        const depth = num('depth', { need: true }), radius = o.radius != null ? num('radius', { min: 0, open: false }) : OP_DEFAULTS.radius.value;
        if ((o.size == null) === (o.outline == null)) throw new Error(`${ow}: give size, [along, across] in mm, or outline, points [along, across] about the address`);
        if (o.size != null && !(Array.isArray(o.size) && o.size.length === 2 && o.size.every((v) => isNum(v) && v > 0))) throw new Error(`${ow}: size is [along, across] in mm, each above 0 (got ${shown(o.size)})`);
        if (o.outline != null && !(Array.isArray(o.outline) && o.outline.length >= 3 && o.outline.every((q) => Array.isArray(q) && q.length === 2 && q.every(isNum)))) throw new Error(`${ow}: outline is three or more points [along, across] in mm, about the address (got ${shown(o.outline)})`);
        if (o.size && radius * 2 > Math.min(...o.size) + 1e-9) throw new Error(`${ow}: radius ${mm(radius)} mm is more than half the pocket's narrower side (${mm(Math.min(...o.size))} mm)`);
        const along = o.size ? o.size[0] : Math.max(...o.outline.map((q) => q[0])) - Math.min(...o.outline.map((q) => q[0]));
        Object.assign(op, { depth, ...(o.size ? { size: [...o.size], radius } : { outline: o.outline.map((q) => [...q]) }), along });
        op.line = `pocket ${o.size ? `${mm(o.size[0])} x ${mm(o.size[1])} mm, corners R${mm(radius)},` : 'by outline,'} ${mm(depth)} mm deep in ${place.name}, centred ${mm(z)} mm from end a`;
        nearEnd(b, op, i, findings, along / 2, true);
      }
      if (o.op === 'notch') {
        if (!place.slot) throw new Error(`${ow}: a notch cuts a slot's lips away, and ${place.name} is a closed face: name a face's place with a slot`);
        const s = p.slots[place.slot], length = num('length', { need: true }), depth = r3(s.lip + ((s.cavityWidth - s.opening) / 2) * Math.tan((s.lipAngle * Math.PI) / 180));
        Object.assign(op, { length, width: s.cavityWidth, depth });
        op.line = `notch ${place.name}'s lips ${mm(length)} mm long, ${mm(s.cavityWidth)} mm across and ${mm(depth)} mm deep, centred ${mm(z)} mm from end a`;
        nearEnd(b, op, i, findings, length / 2, true);
      }
    }
    out.push(op);
  });
  // two ops on one end that cannot both be: a mitre with a square cut, two mitres; a tap at each end that meet
  for (const e of ['a', 'b']) {
    const at = out.filter((x) => x.end === e), mitres = at.filter((x) => x.op === 'mitre');
    if (mitres.length > 1 || (mitres.length && at.some((x) => x.op === 'cut'))) throw new Error(`${what}: end ${e} is cut once: one mitre or one square cut`);
    if (mitres.length && at.some((x) => x.op === 'tap')) findings.push({ level: 'warn', code: 'beam.op', text: `${b.name}: end ${e} is mitred and tapped: a screw in a mitred end bears on a slanted face, so its head or its mate sits on one edge`, refs: { end: e } });
  }
  const taps = { a: Math.max(0, ...out.filter((x) => x.op === 'tap' && x.end === 'a').map((x) => x.depth)), b: Math.max(0, ...out.filter((x) => x.op === 'tap' && x.end === 'b').map((x) => x.depth)) };
  if (taps.a && taps.b && taps.a + taps.b > L + 1e-9) findings.push({ level: 'fail', code: 'beam.op', text: `${b.name}: the taps at end a (${mm(taps.a)} mm) and end b (${mm(taps.b)} mm) run into each other in a ${mm(L)} mm beam`, values: { a: taps.a, b: taps.b, length: L } });
  // the length on each side once ends are mitred: the beam's length is its long side's
  const mitres = out.filter((x) => x.op === 'mitre');
  if (mitres.length) {
    const short = L - mitres.reduce((s, m) => s + m.cut, 0);
    if (mitres.length === 2 && mitres[0].axis === mitres[1].axis && mitres[0].long !== mitres[1].long) throw new Error(`${what}: the mitres at a and b are measured on different sides (${mitres[0].long}, ${mitres[1].long}): the length is on one side, the long one, so give both the same long`);
    if (short <= 1e-9) throw new Error(`${what}: mitred so, the short side would be ${mm(short)} mm long: the beam is ${mm(L)} mm on its long side, and the mitres take ${mitres.map((m) => mm(m.cut)).join(' and ')} mm off the other`);
    for (const m of mitres) { m.length = L; m.shortLength = r3(mitres.length === 2 && mitres[0].axis !== mitres[1].axis ? L - m.cut : short); m.line = `mitre end ${m.end} ${mm(m.angle)}° about ${m.about}: the ${m.long} is the long side, ${mm(L)} mm (the length); the ${m.short} is ${mm(m.shortLength)} mm`; }
    findings.push({ level: 'info', code: 'beam.op', text: `${b.name}: its ${mm(L)} mm is measured on the long side, ${mitres[0].long}; mitred, the ${mitres[0].short} is ${mm(mitres[0].shortLength)} mm`, values: { long: L, short: mitres[0].shortLength } });
  }
  // what a hole near an end tap does to the thread, once both are known
  for (const [i, x] of out.entries()) if (x.diameter != null && x.face) for (const t of out.filter((y) => y.op === 'tap')) {
    const zs = t.end === 'a' ? [0, t.depth] : [L - t.depth, L], R = (x.seat?.diameter ?? x.diameter) / 2;
    if (x.distance + R <= zs[0] + 1e-9 || x.distance - R >= zs[1] - 1e-9) continue;
    const pl = b.places.find((q) => q.name === x.place);
    for (const bn of t.bores) {
      const bo = b.bores.find((q) => q.name === bn), off = Math.abs(pl.normal[0] * (bo.at[1] - pl.at[1]) - pl.normal[1] * (bo.at[0] - pl.at[0]));
      const reach = (bo.at[0] - pl.at[0]) * -pl.normal[0] + (bo.at[1] - pl.at[1]) * -pl.normal[1];
      if (off < R + t.major / 2 && reach - t.major / 2 < x.depth) findings.push({ level: 'fail', code: 'beam.op', text: `${b.name}: the ${x.op} at ${x.at} (Ø${mm(2 * R)} mm, ${mm(x.distance)} mm from end a) crosses the ${t.thread} thread tapped ${mm(t.depth)} mm into ${bn}: move it past ${mm(t.end === 'a' ? t.depth + R : L - t.depth - R)} mm, or tap shallower`, values: { distance: x.distance, depth: t.depth }, refs: { op: i, at: x.at, tap: t.at } });
    }
  }
  return { ops: out, findings };
}

// The hex key of each head an access hole is for, by its figure in the thread's set: a cap screw's (head_key), a
// button head's (button_key, a size smaller from M4 up), a countersunk head's
const ACCESS_KEYS = { cap: 'head_key', button: 'button_key', countersunk: 'countersunk_key' };
// A thread's figures through fixings: its set, major diameter, pitch, hex key and clearance figures
function fixFigures(thread) {
  const fx = fixingModel(thread), v = (n) => (isNum(fx.figures[n]?.value) ? fx.figures[n].value : null);
  return { set: fx.set, figures: fx.figures, major: fx.major, pitch: fx.pitch, key: v('head_key') };
}

// A hole across the beam: too near an end, past the slot's lips, into the side of a bore
function holeChecks(b, op, i, findings, D, place) {
  const p = b.profile, r = D / 2;
  nearEnd(b, op, i, findings, r);
  if (place.slot) {
    const s = p.slots[place.slot];
    if (D > s.opening + 1e-9) findings.push({ level: 'warn', code: 'beam.op', text: `${b.name}: the ${op.op} at ${op.at} (Ø${mm(D)} mm) is wider than ${place.name}'s slot opening (${mm(s.opening)} mm): it breaks into the slot's lips, and a nut there loses its grip. A smaller hole, or a notch if that is meant`, values: { diameter: D, opening: s.opening }, refs: { op: i, at: op.at, slot: place.slot } });
  }
  if (op.through === 'beam') {
    const far = b.places.find((q) => q.slot && Math.abs(q.normal[0] + place.normal[0]) < 1e-9 && Math.abs(q.normal[1] + place.normal[1]) < 1e-9 && Math.abs(place.normal[0] * (q.at[1] - place.at[1]) - place.normal[1] * (q.at[0] - place.at[0])) < 1e-6);
    if (far && op.diameter > p.slots[far.slot].opening + 1e-9) findings.push({ level: 'warn', code: 'beam.op', text: `${b.name}: the ${op.op} at ${op.at} runs right through and comes out in ${far.name}'s slot (opening ${mm(p.slots[far.slot].opening)} mm) at Ø${mm(op.diameter)} mm: it breaks into that slot's lips`, values: { diameter: op.diameter, opening: p.slots[far.slot].opening }, refs: { op: i, at: op.at, slot: far.slot } });
  }
  for (const bo of p.bores) {
    const off = Math.abs(place.normal[0] * (bo.at[1] - place.at[1]) - place.normal[1] * (bo.at[0] - place.at[0])), reach = (bo.at[0] - place.at[0]) * -place.normal[0] + (bo.at[1] - place.at[1]) * -place.normal[1];
    if (reach - bo.diameter / 2 > op.depth || off >= op.diameter / 2 + bo.diameter / 2 - 1e-9 || off < 1e-6) continue;
    findings.push({ level: 'warn', code: 'beam.op', text: `${b.name}: the ${op.op} at ${op.at} (Ø${mm(op.diameter)} mm) breaks into the side of the bore at ${mm(bo.at[0])}, ${mm(bo.at[1])} (Ø${mm(bo.diameter)}), ${mm(off)} mm off its centre: line the hole up with the bore, or keep it clear`, values: { offset: r3(off), diameter: op.diameter, bore: bo.diameter }, refs: { op: i, at: op.at } });
  }
}
// The end a cut nearest it: how much metal is left between its edge and the end
function nearEnd(b, op, i, findings, half, plain = false) {
  const L = b.length, z = op.distance, gaps = [['a', z - half], ['b', L - z - half]], least = OP_DEFAULTS.edge.value * half;
  for (const [e, g] of gaps) {
    if (g < -1e-9) findings.push({ level: 'fail', code: 'beam.op', text: `${b.name}: the ${op.op} at ${op.at} runs off end ${e}: its edge is ${mm(-g)} mm past it. Move it ${mm(-g)} mm or more toward the middle`, values: { gap: r3(g) }, refs: { op: i, at: op.at, end: e } });
    else if (!plain && g < least - 1e-9) findings.push({ level: 'warn', code: 'beam.op', text: `${b.name}: the ${op.op} at ${op.at} leaves ${mm(g)} mm of metal to end ${e}, under the ${mm(least)} mm (half its diameter) a hole near an end wants: it may tear out. Move its centre ${mm(2 * half * OP_DEFAULTS.edge.value)} mm or more from the end`, values: { gap: r3(g), least }, rule: 'OP_DEFAULTS.edge', refs: { op: i, at: op.at, end: e } });
  }
}

// ---------- the cuts ----------
// A wedge that takes an end off at a mitre, in the beam's frame
function wedge(b, m) {
  const L = b.length, w = m.wide, E = Math.max(b.profile.width, b.profile.height) + 2, t = m.cut / w, H = E;
  // z of the cut at s across the section (s along x for a mitre about top or bottom, along y about front or back)
  const za = (s) => (w / 2 - m.sign * s) * t, M = (w / 2 + E) * t + 1;
  let g = extrudeLinear({ height: H }, polygon({ points: [[-E, -M], [E, -M], [E, za(E)], [-E, za(-E)]] }));
  g = translate([0, H / 2, 0], rotateX(Math.PI / 2, g)); // (x, z) in the beam, across y
  if (m.axis === 1) g = transform([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], g); // across x instead: swap x and y
  if (m.end === 'b') g = transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, L, 1], g); // (a mirror: JSCAD turns the faces back out)
  return g;
}

/**
 * The cutters a beam's operations take out of its solid, in the beam's frame. Mitres alone where only the envelope
 * matters (a link's box); every hole, pocket and notch for a preview.
 * @param {object} b a beam's model, with its ops @param {{ envelope?: boolean }} [o]
 * @returns {object[]} JSCAD geom3s to subtract
 */
export function opCutters(b, { envelope = false } = {}) {
  const out = [];
  for (const op of b.ops ?? []) {
    if (op.op === 'mitre') { out.push(wedge(b, op)); continue; }
    if (envelope) continue;
    if (op.op === 'tap') for (const bn of op.bores) { // the tapped length, drawn over the thread's roots (its major diameter), as a screw drawn whole fits it
      const bo = b.bores.find((x) => x.name === bn), d = Math.min(op.depth, b.length);
      out.push(cylinder({ radius: op.major / 2, height: d + OUT, segments: SEGMENTS, center: [bo.at[0], bo.at[1], op.end === 'a' ? (d - OUT) / 2 : b.length - (d - OUT) / 2] }));
    }
    const f = op.anchor && op.face ? frameOf(op.anchor) : null;
    if (!f) continue;
    const down = (r, depth) => cylinder({ radius: r, height: depth + OUT, segments: SEGMENTS, center: [0, 0, (OUT - depth) / 2] });
    if (op.op === 'access' || op.op === 'drill') out.push(transform(f, down(op.diameter / 2, op.depth)));
    if (op.op === 'counterbore') out.push(transform(f, down(op.seat.diameter / 2, op.seat.depth)), transform(f, down(op.diameter / 2, op.depth)));
    if (op.op === 'pocket') {
      const face = op.size ? roundedRectangle({ size: op.size, roundRadius: Math.min(op.radius, Math.min(...op.size) / 2 - 1e-3), segments: SEGMENTS }) : polygon({ points: op.outline });
      out.push(transform(f, translate([0, 0, -op.depth], extrudeLinear({ height: op.depth + OUT }, face))));
    }
    if (op.op === 'notch') out.push(transform(f, cuboid({ size: [op.length, op.width, op.depth + OUT], center: [0, 0, (OUT - op.depth) / 2] })));
  }
  return out;
}
