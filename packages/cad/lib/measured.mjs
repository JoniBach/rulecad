// A bench exists so measurements replace estimates and the predictions move. cad measured writes a measured value where
// the estimate was (in the workspace's copy of the rule set), or a measurement of something a check predicts (a figure
// no rule holds, like the pen's error at the far corner), runs the assembly's checks either side, says what moved, and
// keeps a ledger of predicted against measured beside prints.jsonl. The rules the fixings coupon measures (a pilot or an
// insert hole per thread, the nut fits, the thread gap and flank form), the slot coupon's fits and a slot nut's hold
// along its slot need no --rule: what each is comes from here; a slot's figures go in the workspace's copy of its set,
// checked as a slot. A drop measured on the joint rig (join.drop's <beam>.drop) also writes the join's spring, worked
// out from it, to the rule the spring came from: the joins set (the workspace's copy, started from @rulecad/frames'
// estimates), a bought fitting's set, or a printed fitting's share of its finite-element figure. The beam coupon's sag
// and the mass it broke at (beam.coupon's <beam>.sag and <beam>.break) write the modulus and strength a printed beam has
// to its plastic's set (beam_modulus, beam_strength; _z standing up). The holds coupon's fits (a snap pin's socket, a
// plain pin's press and slip, a magnet's press, glue and crush ribs, and the snap pins' barb as a record) need no --rule
// either, and each is refused outside what a fit of its kind can be; its pull bolt writes the plastic's strength_z.
import fs from 'node:fs';
import path from 'node:path';
import { setAt } from './jsonedit.mjs';
import { CadError } from './errors.mjs';
import { paths, WS, RULE_DIRS, printerOf } from './workspace.mjs';
import { loadRuleSet, peekRuleSet } from './rules.mjs';
import { buildAssembly, checkAssembly, assemblyPath } from './assembly.mjs';
import { slotModel, JOIN_SET, joinRuleSet } from '@rulecad/frames';
import { fixingsContext } from './design.mjs';
import { fixingsFor, threads } from '@rulecad/fixings';
import { couponFigure } from './frameprint.mjs';

const today = () => new Date().toISOString().slice(0, 10), n = (x) => String(Number(Number(x).toFixed(4)));
export const ledgerFile = (project) => path.join(paths.project(project), 'ledger.jsonl');
export const readLedger = (project) => { const f = ledgerFile(project); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

const findingsOf = async (ref) => checkAssembly(await buildAssembly(ref));
const keyOf = (x) => `${x.code}|${JSON.stringify(x.refs ?? {})}`;
// A prediction's name, as cad measured takes it: the check's code, and the part or joint it's about if there are several
export const predictionsOf = (findings) => findings.filter((x) => x.predict);

// A rule's set, read and not written: its text as it starts (the workspace's copy, else the kit's, else for the joins
// set @rulecad/frames' estimates), so nothing is written until every value has been checked
function ruleFile(name) {
  const dot = name.indexOf('.');
  if (dot < 1) throw new CadError('measured.name', `"${name}": name a rule as <set>.<rule> (x1c.press), or a prediction by its check's code (task.accuracy)`);
  const set = name.slice(0, dot), rule = name.slice(dot + 1);
  const file = path.join(WS, 'rules', `${set}.json`), from = RULE_DIRS.map((d) => path.join(d, `${set}.json`)).find((f) => fs.existsSync(f));
  // the joins set has no file in the kit: the workspace's copy starts from @rulecad/frames' estimates
  if (set === JOIN_SET && !from) { const text = JSON.stringify(joinRuleSet(), null, 2) + '\n'; return { set, rule, data: JSON.parse(text), file, text, copied: `started rules/${set}.json from @rulecad/frames' estimates: yours to keep and edit` }; }
  const data = peekRuleSet(set); // (the measurement goes in your copy: the tool's set is copied there when it is written)
  return { set, rule, data, file, text: fs.readFileSync(from, 'utf8'), copied: from === file ? null : `copied the ${set} rule set into rules/${set}.json: yours to keep and edit` };
}

// The slot coupon (examples/bench/projects/benchmarks/MEASURE.md, rows 29 to 33): the two fits it measures, which a
// printer's set may not hold yet, each with what it is and what the kit drew before (the printer's fit), so the ledger
// shows predicted against measured; and a slot's own figures, measured by caliper on the person's beam
const SLOT_COUPON = 'the slot coupon (examples/bench/projects/benchmarks/MEASURE.md)';
function slotRule(project, set, key, data) {
  if (set === printerOf(project) && ['slot_fit', 'printed_slot_fit'].includes(key)) {
    const fit = data.rules?.fit, was = typeof fit?.value === 'number' ? fit.value : null;
    return { unit: 'mm', predicted: was, was: `${set}.fit, ${fit?.kind ?? 'none'}`, source: SLOT_COUPON,
      rule: key === 'slot_fit' ? `Clearance each side between a printed part and a bought beam's slot it slides in (a tongue in the opening, a carrier in the cavity): the tightest on ${SLOT_COUPON} that slid the beam's length by hand without rattling. Printed carriers are drawn with it (@rulecad/frames carrierModel) before the general fit`
        : `Clearance each side a slot printed in a part is opened by, so a bought slot nut slides in it: the tightest printed slot on ${SLOT_COUPON} a slide-in nut ran the length of by hand without catching. For printed beams and plates with slots`, kind: 'measured' };
  }
  if (data.part === 'slot' && data.rules?.[key]) return { source: `calipers on your own beam (${SLOT_COUPON}, row 32)` };
  return null;
}

// The joint rig (examples/bench/projects/benchmarks/MEASURE.md, rows 34 to 37): a join's bending spring, written to the
// joins set or a bought fitting's set, and a slot nut's hold along its slot, which no maker publishes, so a nut's set
// has no rule for it until it is measured
const RIG = 'the joint rig (examples/bench/projects/benchmarks/MEASURE.md)';
function rigRule(set, key, data) {
  if (data.part === 'slot_nut' && key === 'hold_along') return { unit: 'N', predicted: null, was: 'no figure: no maker publishes it', source: `${RIG}, a luggage scale`,
    rule: `The pull along its slot at which this nut slips, its screw tightened as its maker says (or firmly by hand with a hex key where it says nothing): the reading on ${RIG}'s luggage scale as the nut moved` };
  // what a spring measured on the rig is, in place of the estimate's sentence ("a working guess ... until the joint rig
  // measures it"); the drop it came from goes in its source
  const how = `measured on ${RIG}: a beam held out by the join, the drop of its end under a hung mass less the beam's own bending (F L² / that)`;
  const turn = (who) => ({ bending: `How stiffly ${who} holds the end of a beam against turning across its axis`, twist: `How stiffly ${who} holds the end of a beam against twisting about its own axis` });
  if (set === JOIN_SET) {
    const j = key.match(/^(.+)_(bending|twist|printed_share)$/), kind = j?.[1].replace(/_/g, '-');
    if (!j) return { source: RIG };
    return { source: RIG, measuredRule: j[2] === 'printed_share' ? `A ${kind} join with a printed fitting, as a share of the fitting's own bending stiffness by finite elements: the join's spring ${how}, over the fitting's figure`
      : `${turn(`a ${kind} join`)[j[2]]}, for a 20 mm series profile: ${how}` };
  }
  if (data.part === 'fitting' && /_stiffness$/.test(key)) { const k = key.replace(/_stiffness$/, ''); return { source: RIG, ...(turn('this fitting')[k] ? { measuredRule: `${turn('this fitting')[k]}, its screws tight: ${how}` } : {}) }; }
  return null;
}

// The beam coupon (examples/bench/projects/benchmarks/MEASURE.md, rows 38 and 39): the modulus a printed beam bends at
// and the stress it breaks at, which no plastic's data sheet gives for a beam of walls and infill, so a plastic's set has
// no rule for them until the coupon is measured
const BEAM_COUPON = 'the beam coupon (examples/bench/projects/benchmarks/MEASURE.md)';
function couponRule(set, key, data) {
  const m = key.match(/^beam_(modulus|strength)(_z)?$/);
  if (!m || data.rules?.density == null) return null;
  const how = m[2] ? 'printed standing up, bent across its layers' : 'printed lying down, its layers along it';
  return { unit: 'MPa', source: BEAM_COUPON, predicted: data.rules?.[m[2] && data.rules[`${m[1]}_z`] ? `${m[1]}_z` : m[1]]?.value ?? null, was: `${set}.${m[1]}${m[2] && data.rules[`${m[1]}_z`] ? '_z' : ''}, the data sheet's`,
    measuredRule: m[1] === 'modulus' ? `The modulus a printed beam of ${set.toUpperCase()} bends at, ${how}, with its section counted from its walls and infill (@rulecad/frames printedSection): the sag of ${BEAM_COUPON} under a hung mass, measured with a dial, and the solve's sag scaled to it. A printed beam takes it before the plastic's own modulus`
      : `The stress a printed beam of ${set.toUpperCase()} breaks at in bending, ${how}, its section counted from its walls and infill: the mass ${BEAM_COUPON} broke at, as the stress the solve gives under it. A printed beam takes it before the plastic's own strength, and its creep limit follows it` };
}

// The printer's rules the fixings read that a printer's set may not hold yet, each measured on the fixings coupon
// (examples/bench/projects/benchmarks/MEASURE.md): what it is, its unit, and what the kit drew before it was measured,
// so the ledger shows predicted against measured. A pilot or an insert hole is per thread, and may name a plastic
// (x1c.pilot_m4, x1c.pilot_m4_petg); the rest are one per printer.
const COUPON = 'the fixings coupon (examples/bench/projects/benchmarks/MEASURE.md)';
function fixingsRule(project, set, key) {
  if (set !== printerName(project)) return null;
  let fx; const f = () => (fx ||= (() => { const { context } = fixingsContext({ project, dir: paths.project(project) }); return { ...fixingsFor({ sets: context.sets, printer: context.printer }), material: context.material }; })());
  const plastic = (p) => (p ?? f().material ?? 'the project\'s plastic').toUpperCase();
  const hole = key.match(/^(pilot|insert)_(.+)$/);
  if (hole) {
    const bySet = new Map(threads().map((t) => [fixingsFor().fixingModel(t).set, t]));
    const [setName, thread] = [...bySet].filter(([k]) => hole[2] === k || hole[2].startsWith(`${k}_`)).sort((a, b) => b[0].length - a[0].length)[0] ?? [];
    if (!thread) return null;
    const own = hole[2].slice(setName.length + 1) || null;
    if (own && !/^[a-z][a-z0-9]*$/.test(own)) return null;
    const h = f().holeModel(thread, { kind: hole[1], ...(own ? { material: own } : {}) });
    return { unit: 'mm', predicted: h.nominal, was: `${h.basis.rule}, ${h.basis.kind}`,
      rule: hole[1] === 'pilot' ? `Hole to draw for ${/^(M|8|11|18)/.test(thread) ? 'an' : 'a'} ${thread} screw to form its own thread in ${plastic(own)}, standing upright: the one on ${COUPON} the screw went into straight and held in, turned by hand. Drawn as it is: no hole compensation`
        : `Hole to draw for ${/^(M|8|11|18)/.test(thread) ? 'an' : 'a'} ${thread} heat-set insert in ${plastic(own)}: the one on ${COUPON} the insert went into straight and flush, and held when a screw was tightened in it. Drawn as it is: no hole compensation`,
      source: COUPON };
  }
  if (key === 'nut_fit') return { unit: 'mm', predicted: f().nutPocketModel('M3').clearance, was: 'snug, no clearance', source: COUPON,
    rule: `Clearance across the flats of a nut pocket let in from a face, on top of hole_comp: the tightest on ${COUPON} a hex nut dropped into by hand and did not turn in as its screw was tightened. A nut pocket's snug fit` };
  if (key === 'nut_slip') { const t = f().nutTrapModel('M3', { depth: 1 }); return { unit: 'mm', predicted: t.clearance, was: t.rests.find((r) => /slip$/.test(r.name))?.name ?? 'slip', source: COUPON,
    rule: `Clearance across the flats of a nut slot a nut slides into from the side, on top of hole_comp: the tightest on ${COUPON} a hex nut slid into by hand, stayed in turned over, and did not turn as its screw was tightened. A nut slot's slip fit` }; }
  // The holds coupon's fits (rows 40 to 45): each the printer's rule a pin, a snap pin's socket or a magnet's pocket is
  // drawn from, read through the model that draws it, so the ledger's prediction is what the kit drew; and the snap
  // pins' barb, a record as the flank form is. Each is held to what a fit of its kind can be, so a slip of the pen
  // (a diameter for a clearance) is refused before anything is written
  const fit = HOLDS[key];
  if (fit) {
    const r = fit.model(f()).rests.find((x) => x.name.endsWith(`.${key}`) || x.name.endsWith(`'s ${key}`));
    return { unit: 'mm', predicted: r?.value ?? fit.kit, was: r ? `${r.name}, ${r.kind}` : fit.was, source: HOLDS_COUPON, measuredRule: fit.rule,
      check: (x) => (x < fit.range[0] || x > fit.range[1] || (fit.above && x === 0) ? `is ${fit.above ? 'above' : 'from'} ${fit.range[0]}${fit.above ? ' and up' : ''} to ${fit.range[1]} mm: ${fit.why}` : null) };
  }
  if (key === 'thread_flank') { const t = f().threadModel('M8', { length: f().holeModel('M8', { kind: 'thread' }).depth, internal: true }); return { unit: '°', predicted: t.overhang.drawn, was: 'flanks: printed, the default', source: COUPON, allowed: [t.overhang.drawn, t.overhang.standard],
    rule: `The down-facing flank of a printed thread standing upright, as an overhang from upright: ${t.overhang.drawn} is the form laid back to the printer's overhang (flanks: 'printed', the kit's default), ${t.overhang.standard} the standard's own form (flanks: 'standard'). The one on ${COUPON} that held, turned smoothly and printed clean. A record for choosing the default: designs still draw flanks: 'printed' unless they say otherwise` }; }
  return null;
}
// The holds coupon's fits: the rule each writes once measured, what bounds it, and the model that draws from it
const HOLDS_COUPON = 'the holds coupon (examples/bench/projects/benchmarks/MEASURE.md)';
const HOLDS = {
  snap_clearance: { range: [0, 0.5], above: true, model: (f) => f.pinModel('snap pin 4x6'), why: 'its gap is drawn with no hole compensation, so at 0 the printed socket comes out smaller than the peg and pinches it: a press, not a snap. Past half a millimetre a pin rocks; the coupon prints 0.1 to 0.3, and never a socket at 0',
    rule: `Gap round a printed snap pin's peg in its socket, each side, as drawn (no hole compensation): the socket on ${HOLDS_COUPON} a snap pin clicked through by hand and then held without rocking` },
  pin_press: { range: [0, 0.3], model: (f) => f.pinModel('dowel 3x12', { fit: 'press' }), why: 'how much smaller a hole is drawn than the pin it grips, past hole_comp, and more than 0.3 mm splits a printed boss; the coupon prints 0 to 0.1',
    rule: `How much smaller across a printed hole is drawn than a plain pin pressed into it, past hole_comp: the hole on ${HOLDS_COUPON} a 3 mm dowel (or 1.75 mm filament) pressed into by hand or in a vice, stood straight, and could not be pulled out by hand` },
  pin_slip: { range: [0, 0.6], model: (f) => f.pinModel('dowel 3x12', { fit: 'slip' }), why: 'how much larger a hole is drawn than the pin that turns in it, past hole_comp, and past 0.6 mm it is a loose hole. At 0 the hole is the pin and hole_comp, the pin\'s own size once printed: a close slip; the coupon prints 0.1 to 0.3, and 0 once it is centred on 0.1',
    rule: `How much larger across a printed hole is drawn than a plain pin that turns in it, past hole_comp: the tightest hole on ${HOLDS_COUPON} a 3 mm dowel (or 1.75 mm filament) slid into by hand and turned freely in` },
  magnet_press: { range: [0, 0.4], model: (f) => f.magnetSeatModel('disc magnet 8x3', { fit: 'press' }), why: 'how much smaller a pocket is drawn than the magnet it grips, past hole_comp, and more than 0.4 mm splits its wall; the coupon prints 0 to 0.2',
    rule: `How much smaller across a printed pocket is drawn than a disc magnet pressed into it, past hole_comp: the pocket on ${HOLDS_COUPON} a 6x3 and an 8x3 magnet went into with a thumb or a vice, flush, without splitting the wall, and stayed in when the plate was turned over and tapped` },
  magnet_glue: { range: [0, 0.6], model: (f) => f.magnetSeatModel('disc magnet 8x3', { fit: 'glue' }), why: 'room for a film of glue across the pocket, past hole_comp, and past 0.6 mm the magnet sits off centre; the coupon\'s press row shows where a magnet drops in',
    rule: `How much larger across a printed pocket is drawn than a magnet glued into it, past hole_comp: the least on ${HOLDS_COUPON} a magnet dropped into freely, which leaves room for glue` },
  magnet_crush: { range: [0, 0.6], model: (f) => f.magnetSeatModel('disc magnet 8x3', { fit: 'ribs' }), why: 'how far inside the magnet the crush ribs\' tips stand, past hole_comp, and past 0.6 mm a rib no longer crushes but splits. At 0 the ribs\' tips stand at the magnet and hole_comp, a light crush once printed; the coupon prints 0.1 to 0.3, and 0 once it is centred on 0.1',
    rule: `With crush ribs, how much smaller across the ribs' tips stand than the magnet, past hole_comp: the ribbed pocket on ${HOLDS_COUPON} an 8x3 magnet pressed into by hand, flush, and held when the plate was turned over and tapped` },
  snap_barb: { range: [0, 1], above: true, kit: 0.4, was: 'barb 0.4, the default', model: () => ({ rests: [] }), why: 'a snap pin\'s barb past its peg, and past a millimetre the halves cannot close enough to let it through; the coupon prints 0.3 to 0.5',
    rule: `A snap pin's barb past its peg: the one on ${HOLDS_COUPON} that clicked through its socket by hand and held when pulled. A record for choosing the default: pins are still drawn with a 0.4 mm barb unless their name says barb N` }
};

// The pull bolt on the holds coupon (row 46): an M8 printed bolt whose waist breaks across its layers, so it measures
// how strongly a plastic holds across its layers, which PLA's data sheet does not give. It goes in the plastic's set
// as strength_z, which a printed bolt standing on its head, and every part pulled across its layers, then reads
function boltRule(set, key, data) {
  if (key !== 'strength_z' || data.rules?.density == null || typeof data.rules?.strength?.value !== 'number') return null;
  const along = data.rules.strength.value, z = data.rules.strength_z;
  return { unit: 'MPa', predicted: z?.value ?? along, was: z ? `${set}.strength_z, ${z.kind}` : `${set}.strength, along the layers: no figure across them`, source: `${HOLDS_COUPON}, the pull bolt broken on a luggage scale`,
    measuredRule: `Tensile strength of ${set.toUpperCase()} across its printed layers: the pull bolt on ${HOLDS_COUPON}, printed standing, broken on a luggage scale at its 3 mm waist (the kilograms × 9.81 over 7.07 mm²). A printed bolt standing on its head, and any part pulled across its layers, takes it before the along-layer strength`,
    check: (x) => (!(x > 0) || x > along ? `is above 0 and no more than ${set}.strength, ${along} MPa: a print holds less across its layers than along them, so read the scale's peak again, and work it as kilograms × 9.81 over the waist's 7.07 mm²` : null) };
}
const printerName = (project) => { try { return fixingsContext({ project, dir: paths.project(project) }).context.printer?.name ?? 'x1c'; } catch { return 'x1c'; } };
// A rule the workspace's copy lacks and the kit's own set of that name holds (a set copied before the rule was added)
function kitRule(set, key) { try { return JSON.parse(fs.readFileSync(path.join(RULE_DIRS.at(-1), `${set}.json`), 'utf8')).rules?.[key] ?? null; } catch { return null; } }

/**
 * Write measurements back.
 * @param {string} ref project/assembly
 * @param {Record<string, number>} values name → measured value
 * @param {{ unit?: string, source?: string, rule?: string, date?: string }} [options]
 * @returns {Promise<{ entries: object[], moved: { from: string, to: string }[] }>}
 */
export async function recordMeasured(ref, values, { unit, source, rule, date = today() } = {}) {
  const [project, name] = String(ref).split('/');
  if (!project || !name || !fs.existsSync(assemblyPath(ref))) throw new CadError('measured.assembly', `no assembly "${ref}": give <project>/<assembly>, the one whose predictions it moves`);
  if (!Object.keys(values).length) throw new CadError('measured.usage', 'usage: cad measured <project>/<assembly> <name>=<value> … [--unit mm] [--source "how it was measured"]');
  const before = await findingsOf(ref), entries = [], predictions = predictionsOf(before);
  const writes = [], slots = new Map(); // (every value is checked before any is written, so a refusal leaves the rule sets as they were)
  // a rule's new value, checked before anything is written (a refusal leaves the rule sets as they were)
  const writeRule = (k, value, { from = null, unit: u = unit } = {}) => {
    const { set, rule: key, data, file, text, copied } = ruleFile(k);
    const old = data.rules?.[key], known = slotRule(project, set, key, data) ?? rigRule(set, key, data) ?? couponRule(set, key, data) ?? boltRule(set, key, data) ?? fixingsRule(project, set, key) ?? (old ? null : kitRule(set, key));
    if (known?.allowed && !known.allowed.includes(value)) throw new CadError('measured.value', `${k} is ${known.allowed.join(' or ')}: the flank forms the coupon prints (got ${value})`);
    const wrong = known?.check?.(value);
    if (wrong) throw new CadError('measured.value', `${k} ${wrong} (got ${value})`);
    if (!old && !rule && !known) throw new CadError('measured.rule', `${set} has no rule "${key}" (and no check here predicts "${k}"): --rule "what it is" to add it (checks: ${[...new Set(predictions.map((x) => x.code))].join(', ') || 'none'})`);
    const had = old ?? known, prior = typeof had?.value === 'number' ? had.value : known?.predicted ?? null;
    if (u && had?.unit && u !== had.unit) throw new CadError('measured.unit', `${k} is in ${had.unit}, and this is in ${u}: give it in ${had.unit}`);
    // its sentence: what was measured, never the estimate's "until it is measured": the one given, else the rig's, else the rule's own
    const entry = { value, unit: u ?? had?.unit ?? '', rule: (from ? null : rule) ?? known?.measuredRule ?? had.rule, kind: 'measured', source: [source || known?.source || 'measured on the bench', from].filter(Boolean).join(': '), checked: date };
    if (data.part === 'slot') slots.set(set, { data, change: { ...slots.get(set)?.change, [key]: value } });
    writes.push({ file, key, entry, text, copied, set });
    entries.push({ date, assembly: name, name: k, figure: entry.rule, unit: entry.unit, predicted: prior, was: old ? old.kind : known?.was ?? known?.kind ?? null, measured: value, ratio: prior ? value / prior : null, ...(source ? { source } : {}) });
  };
  for (const [k, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) throw new CadError('measured.value', `${k}: a measurement is a number (got ${value})`);
    const named = predictions.filter((x) => x.code === k || x.predict.name === k);
    if (named.length) {
      const p = named[0].predict;
      entries.push({ date, assembly: name, name: k, code: named[0].code, figure: p.figure, unit: p.unit, predicted: p.value, measured: value, ratio: p.value ? value / p.value : null, ...(source ? { source } : {}) });
      // a drop on the joint rig: what the beam bends of it is the beam's own; the rest is the join turning, so its spring
      if (p.rig) {
        const r = p.rig, n = (x) => String(Number(Number(x).toFixed(3)));
        if (!(value > r.beam)) throw new CadError('measured.value', `${k}: ${n(value)} mm is no more than the ${n(r.beam)} mm the beam bends by itself under ${n(r.force)} N at ${n(r.arm)} mm, so the join would be stiffer than solid metal: read the drop again, from the dial's reading with the mass hung less its reading without`);
        const spring = (r.force * r.arm * r.arm) / (value - r.beam), figure = Number((spring * r.per).toPrecision(4));
        writeRule(r.rule, figure, { unit: r.unit, from: `${n(value)} mm drop of ${k.replace(/\.drop$/, '')} under ${n(r.force)} N at ${n(r.arm)} mm (${r.join}), less the beam's own ${n(r.beam)} mm, is a spring of ${(spring / 1e6).toFixed(3)} N·m/mrad` });
      }
      // the beam coupon: the modulus from its sag, the strength from the mass it broke at
      if (p.coupon) {
        const c = p.coupon, figure = couponFigure(c, p.value, value);
        if (!(value > 0)) throw new CadError('measured.value', `${k}: a ${c.kind === 'modulus' ? 'sag' : 'mass'} is above 0 (got ${value})`);
        writeRule(c.rule, figure, { unit: c.unit, from: c.kind === 'modulus' ? `${n(value)} mm sag of ${k.replace(/\.sag$/, '')} under ${c.what}, against ${n(p.value)} mm at ${n(c.base)} MPa` : `broke at ${n(value)} kg ${c.what}, ${n(c.perKg)} MPa a kilogram on its own weight's ${n(c.self)} MPa` });
      }
      continue;
    }
    writeRule(k, value);
  }
  // a slot's figures together still make a slot (an opening narrower than its cavity, lips thinner than it is deep)
  for (const [set, { data, change }] of slots) { try { slotModel(data, change); } catch (e) { throw new CadError('measured.value', `${set}: ${e.message.replace(/^slotModel: /, '')}`); } }
  // every value checked: now each set is written, the workspace's copy made from where it started where there is none
  const texts = new Map();
  for (const w of writes) texts.set(w.file, { ...w, text: setAt(texts.get(w.file)?.text ?? w.text, ['rules', w.key], w.entry) });
  for (const [file, w] of texts) {
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, w.text);
    if (w.copied) console.error(w.copied);
  }
  const after = await findingsOf(ref), was = new Map(before.map((x) => [keyOf(x), x])), moved = [];
  for (const x of after) {
    const y = was.get(keyOf(x));
    if (x.predict && y?.predict && Math.abs(x.predict.value - y.predict.value) > 1e-9) moved.push({ code: x.code, figure: x.predict.figure, unit: x.predict.unit, from: y.predict.value, to: x.predict.value });
    else if (y && y.text !== x.text && !x.predict) moved.push({ code: x.code, text: x.text, was: y.text });
  }
  fs.appendFileSync(ledgerFile(project), entries.map((e) => JSON.stringify({ ...e, moved: moved.filter((m) => m.figure) })).join('\n') + '\n');
  return { entries, moved, findings: after };
}

// What the kit assumes, as a Markdown table: each rule used that is only an estimate, what measures it, and what it feeds
export async function assumptionsTable(ref) {
  const findings = await findingsOf(ref), estimates = findings.find((x) => x.code === 'rules.estimate')?.refs?.rules ?? [], preds = predictionsOf(findings);
  const rows = estimates.map((name) => {
    let rule = ''; try { const [u, k] = name.split('.'); rule = loadRuleSet(u).rules[k]?.rule ?? ''; } catch {}
    return `| \`${name}\` | ${rule} | estimate | \`cad measured ${ref} ${name}=<value>\` |`;
  });
  const out = ['| What the kit assumes | What it is | Trust | How to settle it |', '|---|---|---|---|', ...rows,
    ...preds.map((x) => `| ${x.predict.figure} | ${n(x.predict.value)} ${x.predict.unit}, predicted by \`${x.code}\` | prediction | \`cad measured ${ref} ${x.predict.name ?? x.code}=<value>\` |`)];
  return out.join('\n');
}
// A table kept in a file, between two markers: the rest of the file stays as written
export const MARK = ['<!-- cad measured: start -->', '<!-- cad measured: end -->'];
export function writeTable(file, table) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', a = text.indexOf(MARK[0]), b = text.indexOf(MARK[1]);
  const block = `${MARK[0]}\n${table}\n${MARK[1]}`;
  fs.writeFileSync(file, a >= 0 && b > a ? text.slice(0, a) + block + text.slice(b + MARK[1].length) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}\n${block}\n`);
}

export const ledgerLines = (entries) => entries.map((e) => `${e.date}  ${e.assembly}  ${e.name}: measured ${n(e.measured)} ${e.unit || ''}`.trimEnd() + (e.predicted != null ? `, predicted ${n(e.predicted)}${e.was ? ` (${e.was})` : ''}${e.ratio != null ? `, ratio ${n(e.ratio)}` : ''}` : '') + (e.source ? `  [${e.source}]` : ''));
