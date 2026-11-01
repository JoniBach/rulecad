// cad clone: a published circuit board (a KiCad .kicad_pcb, a file or a GitHub link) into a rule set, so designs can
// redraw it by rules. The rule set keeps the circuit (parts, pads, nets, planes, outline) with where it came from and
// its licence, and a few numbers designs start from (size, thickness, copper layers), each traced to the source.
// Nothing from the file is ever run: it is read as data.
import fs from 'node:fs';
import path from 'node:path';
const nodePath = path;
import { WS } from './workspace.mjs';
import { pcbEngine } from './design.mjs';

const today = () => new Date().toISOString().slice(0, 10);
// Licences that ask boards made from the source to stay under them (or forbid that use): said when cloning
export const reciprocal = (s) => /CERN-OHL-S|CERN Open Hardware Licence Version 2 - Strongly|GPL|share-?alike|\bSA\b/i.test(String(s || ''));
export const limiting = (s) => /\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(String(s || ''));

// A GitHub file link (github.com/<owner>/<repo>/blob/<ref>/<path>) -> { owner, repo, ref, file }, else null
export function githubFile(link) {
  const m = String(link).match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:blob|raw)\/([^/]+)\/(.+\.kicad_pcb)$/);
  return m ? { owner: m[1], repo: m[2], ref: m[3], file: decodeURIComponent(m[4]) } : null;
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'rulecad' } });
  if (!r.ok) throw new Error(`GitHub said ${r.status} for ${url}`);
  return r.json();
}

// The board's text and what to record about it: from a GitHub link, pinned to the commit the link names (a branch is
// looked up), with the repository's licence; from a file, what --source and --licence say
async function fetchBoard(ref, o) {
  const gh = githubFile(ref);
  if (!gh) {
    if (!fs.existsSync(ref)) throw new Error(`no file ${ref}: give a .kicad_pcb file, or a GitHub link to one (https://github.com/<owner>/<repo>/blob/<branch>/<path>.kicad_pcb)`);
    return { text: fs.readFileSync(ref, 'utf8'), source: o.source || path.basename(ref), licence: o.licence || null, dir: path.dirname(path.resolve(ref)) };
  }
  const base = `https://api.github.com/repos/${gh.owner}/${gh.repo}`;
  const commit = (await getJSON(`${base}/commits/${encodeURIComponent(gh.ref)}`)).sha;
  const raw = await fetch(`https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${commit}/${gh.file.split('/').map(encodeURIComponent).join('/')}`);
  if (!raw.ok) throw new Error(`couldn't download ${gh.file} at ${commit.slice(0, 7)} (${raw.status})`);
  let licence = o.licence || null;
  if (!licence) {
    const l = await getJSON(`${base}/license?ref=${commit}`).catch(() => null);
    const first = l?.content ? Buffer.from(l.content, 'base64').toString('utf8').split('\n').map((s) => s.trim()).find(Boolean) : null;
    licence = l?.license?.spdx_id && l.license.spdx_id !== 'NOASSERTION' ? l.license.spdx_id : first;
  }
  return { text: await raw.text(), source: `https://github.com/${gh.owner}/${gh.repo}/blob/${commit}/${gh.file}`, licence, commit, github: { ...gh, commit } };
}

// ---- the parts' 3D models ----
// KiCad's own library, by the version its path variable names (6 and later name it; older boards say KISYS3DMOD)
const KICAD = { 6: '6.0.11', 7: '7.0.11', 8: '8.0.8' };
const KICAD_LICENCE = 'CC-BY-SA-4.0 with the KiCad libraries exception (designs using the models aren\'t bound by it)';
const fetchText = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.text(); };

// Where a model's file comes from: { url, licence } (or { file } for a board read from a file), or null
async function modelSource(path, got) {
  const kicad = path.match(/^\$\{(?:KICAD(\d+)_3DMODEL_DIR|KISYS3DMOD)\}\/(.+)$/);
  if (kicad) return { url: `https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/${KICAD[kicad[1]] ?? KICAD[6]}/${kicad[2]}`, licence: KICAD_LICENCE, kicad: true };
  const own = path.match(/^\$\{KIPRJMOD\}\/(.+)$/);
  if (!own) return null;
  if (!got.github) return got.dir ? { file: nodePath.resolve(got.dir, own[1]) } : null;
  // In the source's repository, next to its board; a path into a submodule goes on in the submodule's repository
  const { owner, repo, commit, file } = got.github, parts = nodePath.posix.normalize(nodePath.posix.join(nodePath.posix.dirname(file), own[1])).split('/');
  const api = (o, r, x) => getJSON(`https://api.github.com/repos/${o}/${r}/${x}`);
  const top = await api(owner, repo, `contents/${encodeURIComponent(parts[0])}?ref=${commit}`).catch(() => null);
  const licenceOf = async (o, r) => (await api(o, r, 'license').catch(() => null))?.license?.spdx_id;
  if (top?.type === 'submodule') {
    const m = top.submodule_git_url.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (!m) return null;
    const lic = await licenceOf(m[1], m[2]);
    return { url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${top.sha}/${parts.slice(1).join('/')}`, licence: lic && lic !== 'NOASSERTION' ? lic : null };
  }
  return { url: `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${parts.join('/')}`, licence: got.licence };
}

// Each model the circuit's parts name, fetched once into the workspace's models/ (a mesh, where its licence lets it be
// shared and it comes as VRML) or kept as its size (a STEP file, or a shape with no licence): circuit.models[path]
async function fetchModels(circuit, got, { wrlMesh, stepBounds }, notes) {
  const out = {}, paths = [...new Set(circuit.parts.filter((p) => p.model).map((p) => p.model.path))];
  for (const path of paths) {
    try {
      const src = await modelSource(path, got);
      if (!src) { notes.push(`no 3D model for ${path}: its path isn't one cad clone can follow`); continue; }
      const name = path.split('/').pop().replace(/\.(step|stp|wrl)$/i, ''), dir = src.kicad ? `kicad/${path.split('/').slice(-2, -1)[0]}` : 'source';
      const read = (ext) => (src.file ? fs.promises.readFile(src.file.replace(/\.[^.]+$/, ext), 'utf8') : fetchText(src.url.replace(/\.[^./]+$/, ext)));
      if (src.licence || src.file) { // VRML where there is one (KiCad's library has both): a mesh
        const wrl = /\.wrl$/i.test(path) || src.kicad ? await read('.wrl').catch(() => null) : null;
        if (wrl) {
          const triangles = wrlMesh(wrl).map((t) => t.map((v) => v.map((n) => Math.round(n * 1e3) / 1e3)));
          const file = `models/${dir}/${name}.json`;
          fs.mkdirSync(nodePath.join(WS, nodePath.dirname(file)), { recursive: true });
          fs.writeFileSync(nodePath.join(WS, file), JSON.stringify({ source: src.url || src.file, licence: src.licence, triangles }));
          out[path] = { mesh: file, licence: src.licence };
          continue;
        }
      }
      const step = await read(nodePath.extname(path) || '.step').catch(() => read('.step'));
      const box = stepBounds(step);
      if (!box) { notes.push(`no 3D model for ${name}: its file has no points to measure`); continue; }
      out[path] = { box, ...(src.licence ? { licence: src.licence } : {}), size_only: src.licence ? 'a STEP model: drawn as the box round it' : 'no licence: only its size is used, drawn as a box' };
    } catch (e) { notes.push(`no 3D model for ${path.split('/').pop()}: ${e.message}`); }
  }
  return out;
}

/**
 * cad clone <board.kicad_pcb | GitHub link> <name>: writes rules/<name>.json and prints what it found, what boards here
 * can't carry yet, and what the licence asks. o: { source, licence, force }.
 */
export async function cloneBoard(ref, name, o = {}) {
  if (!ref || !/^[a-z][a-z0-9_]*$/.test(name || '')) throw new Error('usage: cad clone <board.kicad_pcb | GitHub link> <name> [--source <link>] [--licence <licence>] [--force]  (name: lower case, digits and _)');
  const to = path.join(WS, 'rules', `${name}.json`);
  if (fs.existsSync(to) && !o.force) throw new Error(`rules/${name}.json already exists (--force to replace it)`);
  const { fromKicadPcb, clone, learnPlacement, wrlMesh, stepBounds } = await pcbEngine();
  if (!learnPlacement) throw new Error('cad clone needs @rulecad/pcb 0.3.8 or later: npm install @rulecad/pcb@latest');
  const got = await fetchBoard(ref, o);
  const circuit = fromKicadPcb(got.text);
  circuit.source = { ...circuit.source, from: got.source, ...(got.commit ? { commit: got.commit } : {}), read: today() };
  circuit.placement = learnPlacement(circuit); // which small parts stay by which pins: edit max to be stricter or freer
  const modelNotes = [];
  if (!o.noModels && wrlMesh) circuit.models = await fetchModels(circuit, got, { wrlMesh, stepBounds }, modelNotes);
  const extra = { kind: 'derived', source: got.source, ...(got.licence ? { licence: got.licence } : {}), checked: today() };
  const rule = (value, unit, text) => ({ value, ...(unit ? { unit } : {}), rule: text, ...extra });
  const rules = {
    width: rule(circuit.width, 'mm', 'The source board\'s width, across its outline'),
    height: rule(circuit.height, 'mm', 'The source board\'s height, across its outline'),
    layers: rule(circuit.layers, null, `Copper layers on the source board (${circuit.copper.join(', ')})`)
  };
  if (circuit.thickness) rules.thickness = rule(circuit.thickness, 'mm', 'The source board\'s thickness');
  const doc = `Cloned from ${got.source} by cad clone: the circuit of a published board (its parts, pads, nets, planes and outline), for @rulecad/pcb's clone() to redraw by rules.${got.licence ? ` Licence: ${got.licence}.` : ' Licence unknown: find it before sharing anything made from this.'}${reciprocal(got.licence) ? ' Boards made from it must be shared under the same licence, with their design files.' : ''}`;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, `${JSON.stringify({ _doc: doc, name, ...(got.licence ? { licence: got.licence } : {}), rules, circuit }, null, 1)}\n`);

  const nets = Object.keys(circuit.nets).length, planes = Object.keys(circuit.planes);
  console.log(`made ${path.relative(process.cwd(), to)}: ${circuit.parts.length} parts, ${nets} nets, ${circuit.width} × ${circuit.height} mm, ${circuit.layers} copper layers${planes.length ? `, planes ${planes.join(' ')}` : ''}`);
  console.log(`  from ${got.source}`);
  console.log(`  placement: ${circuit.placement.length} small parts kept near the pins they serve (circuit.placement: edit max to change how near)`);
  if (circuit.models) {
    const all = Object.values(circuit.models), boxes = all.filter((m) => m.box).length;
    console.log(`  3D models: ${all.length - boxes} as meshes (in models/), ${boxes} as boxes the size of the part${all.some((m) => /no licence/.test(m.size_only || '')) ? ' (some have no licence: only their size is used)' : ''}`);
  }
  for (const n of modelNotes) console.log(`  note: ${n}`);
  if (!circuit.outline) console.log('  note: the outline isn\'t one closed shape: designs get its bounds');
  for (const n of clone(circuit).notes) console.log(`  note: ${n}`);
  if (!got.licence) console.log('  ! no licence given (--licence): find the source\'s licence before sharing anything made from it');
  else if (limiting(got.licence)) console.log(`  ! licence "${got.licence}" limits what you may make from this: read it before using the circuit`);
  else if (reciprocal(got.licence)) console.log(`  ! licence "${got.licence}" is reciprocal: boards made from this must be shared under it too, with their design files. Keep this rule set apart from rules under other licences`);
  console.log(`  use it in a board: clone(v.${name}.circuit) from @rulecad/pcb gives the parts and nets, each where the source put it`);
  return { to, circuit };
}
