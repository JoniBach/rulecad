// A bench exists so measurements replace estimates and the predictions move. cad measured writes a measured value where
// the estimate was (in the workspace's copy of the rule set), or a measurement of something a check predicts (a figure
// no rule holds, like the pen's error at the far corner), runs the assembly's checks either side, says what moved, and
// keeps a ledger of predicted against measured beside prints.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { setAt } from './jsonedit.mjs';
import { CadError } from './errors.mjs';
import { paths, WS } from './workspace.mjs';
import { loadRuleSet } from './rules.mjs';
import { buildAssembly, checkAssembly, assemblyPath } from './assembly.mjs';

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
  for (const [k, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) throw new CadError('measured.value', `${k}: a measurement is a number (got ${value})`);
    const named = predictions.filter((x) => x.code === k || x.predict.name === k);
    if (named.length) {
      const p = named[0].predict;
      entries.push({ date, assembly: name, name: k, code: named[0].code, figure: p.figure, unit: p.unit, predicted: p.value, measured: value, ratio: p.value ? value / p.value : null, ...(source ? { source } : {}) });
      continue;
    }
    const { set, rule: key, data, file } = ruleFile(k);
    const old = data.rules?.[key];
    if (!old && !rule) throw new CadError('measured.rule', `${set} has no rule "${key}" (and no check here predicts "${k}"): --rule "what it is" to add it (checks: ${[...new Set(predictions.map((x) => x.code))].join(', ') || 'none'})`);
    if (unit && old?.unit && unit !== old.unit) throw new CadError('measured.unit', `${k} is in ${old.unit}, and this is in ${unit}: give it in ${old.unit}`);
    const entry = { value, unit: unit ?? old?.unit ?? '', rule: rule ?? old.rule, kind: 'measured', source: source || 'measured on the bench', checked: date };
    fs.writeFileSync(file, setAt(fs.readFileSync(file, 'utf8'), ['rules', key], entry));
    entries.push({ date, assembly: name, name: k, figure: entry.rule, unit: entry.unit, predicted: typeof old?.value === 'number' ? old.value : null, was: old?.kind ?? null, measured: value, ratio: typeof old?.value === 'number' && old.value ? value / old.value : null, ...(source ? { source } : {}) });
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
