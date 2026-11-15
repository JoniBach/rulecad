// A bench exists so measurements replace estimates and the predictions move. cad measured writes a measured value where
// the estimate was (in the workspace's copy of the rule set), or a measurement of something a check predicts (a figure
// no rule holds, like the pen's error at the far corner), runs the assembly's checks either side, says what moved, and
// keeps a ledger of predicted against measured beside prints.jsonl. The rules the fixings coupon measures (a pilot or an
// insert hole per thread, the nut fits, the thread gap and flank form) need no --rule: what each is comes from here.
import fs from 'node:fs';
import path from 'node:path';
import { setAt } from './jsonedit.mjs';
import { CadError } from './errors.mjs';
import { paths, WS, RULE_DIRS } from './workspace.mjs';
import { loadRuleSet } from './rules.mjs';
import { buildAssembly, checkAssembly, assemblyPath } from './assembly.mjs';
import { fixingsContext } from './design.mjs';
import { fixingsFor, threads } from '@rulecad/fixings';

const today = () => new Date().toISOString().slice(0, 10), n = (x) => String(Number(Number(x).toFixed(4)));
export const ledgerFile = (project) => path.join(paths.project(project), 'ledger.jsonl');
export const readLedger = (project) => { const f = ledgerFile(project); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

const findingsOf = async (ref) => checkAssembly(await buildAssembly(ref));
const keyOf = (x) => `${x.code}|${JSON.stringify(x.refs ?? {})}`;
// A prediction's name, as cad measured takes it: the check's code, and the part or joint it's about if there are several
export const predictionsOf = (findings) => findings.filter((x) => x.predict);

function ruleFile(name) {
  const dot = name.indexOf('.');
  if (dot < 1) throw new CadError('measured.name', `"${name}": name a rule as <set>.<rule> (x1c.press), or a prediction by its check's code (task.accuracy)`);
  const set = name.slice(0, dot), rule = name.slice(dot + 1);
  const data = loadRuleSet(set); // (copies the tool's set into the workspace, the first time: the measurement goes in your copy)
  return { set, rule, data, file: path.join(WS, 'rules', `${set}.json`) };
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
  if (key === 'thread_flank') { const t = f().threadModel('M8', { length: f().holeModel('M8', { kind: 'thread' }).depth, internal: true }); return { unit: '°', predicted: t.overhang.drawn, was: 'flanks: printed, the default', source: COUPON, allowed: [t.overhang.drawn, t.overhang.standard],
    rule: `The down-facing flank of a printed thread standing upright, as an overhang from upright: ${t.overhang.drawn} is the form laid back to the printer's overhang (flanks: 'printed', the kit's default), ${t.overhang.standard} the standard's own form (flanks: 'standard'). The one on ${COUPON} that held, turned smoothly and printed clean. A record for choosing the default: designs still draw flanks: 'printed' unless they say otherwise` }; }
  return null;
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
  const writes = []; // (every value is checked before any is written, so a refusal leaves the rule set as it was)
  for (const [k, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) throw new CadError('measured.value', `${k}: a measurement is a number (got ${value})`);
    const named = predictions.filter((x) => x.code === k || x.predict.name === k);
    if (named.length) {
      const p = named[0].predict;
      entries.push({ date, assembly: name, name: k, code: named[0].code, figure: p.figure, unit: p.unit, predicted: p.value, measured: value, ratio: p.value ? value / p.value : null, ...(source ? { source } : {}) });
      continue;
    }
    const { set, rule: key, data, file } = ruleFile(k);
    const old = data.rules?.[key], known = fixingsRule(project, set, key) ?? (old ? null : kitRule(set, key));
    if (known?.allowed && !known.allowed.includes(value)) throw new CadError('measured.value', `${k} is ${known.allowed.join(' or ')}: the flank forms the coupon prints (got ${value})`);
    if (!old && !rule && !known) throw new CadError('measured.rule', `${set} has no rule "${key}" (and no check here predicts "${k}"): --rule "what it is" to add it (checks: ${[...new Set(predictions.map((x) => x.code))].join(', ') || 'none'})`);
    const had = old ?? known, prior = typeof had?.value === 'number' ? had.value : known?.predicted ?? null;
    if (unit && had?.unit && unit !== had.unit) throw new CadError('measured.unit', `${k} is in ${had.unit}, and this is in ${unit}: give it in ${had.unit}`);
    const entry = { value, unit: unit ?? had?.unit ?? '', rule: rule ?? had.rule, kind: 'measured', source: source || known?.source || 'measured on the bench', checked: date };
    writes.push([file, key, entry]);
    entries.push({ date, assembly: name, name: k, figure: entry.rule, unit: entry.unit, predicted: prior, was: old ? old.kind : known?.was ?? known?.kind ?? null, measured: value, ratio: prior ? value / prior : null, ...(source ? { source } : {}) });
  }
  for (const [file, key, entry] of writes) fs.writeFileSync(file, setAt(fs.readFileSync(file, 'utf8'), ['rules', key], entry));
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
