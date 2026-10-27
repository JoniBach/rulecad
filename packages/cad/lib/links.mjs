// Model links: a design or an assembly as the model page's data (@rulecad/model-link): its parts (each on its filament
// slot), the rules card and sheet, a board's 2D views, an assembly's joints. Used by cad link and cad show.
import path from 'node:path';
import { fromParts, fromShapes, encode, check as checkLink, expand } from '@rulecad/model-link';
import { fmt } from './rules.mjs';
import { paths, config } from './workspace.mjs';
import { host } from './host.mjs';
import { pcbEngine } from './design.mjs';
import { shapes, motionData } from './assembly.mjs';
import { slotOf } from './threemf.mjs';

/** The project's filaments: { base: { slot: 1, … }, legend: { slot: 2, … } } in project.json. @param {string} project */
export const filaments = (project) => JSON.parse(host.readText(path.join(paths.project(project), 'project.json'))).filaments || {};
/** The filaments in AMS slot order, for the print file: [{ colour }, …], slot 1 first. */
export const slots = (fil) => { const out = []; for (const f of Object.values(fil)) out[(f.slot || 1) - 1] = f; return Array.from(out, (f) => f || {}); };

export const VIEW = process.env.CAD_VIEW_URL || config.viewUrl;
/** A link to the model page; one the page would turn away is an error here, not when someone opens it. */
export async function linkTo(model) {
  const errors = checkLink(model.shapes ? expand(model) : model);
  if (errors.length) throw new Error(`no link: ${errors[0]}`);
  return `${VIEW}#m=${await encode(model)}`;
}

// The rules sheet: each object's variables, then the rules they use (once each)
export function sheet(objects, { noRules = false } = {}) {
  if (noRules) return {};
  const rows = [], seen = new Set(), trim = (r) => { while (r.length && (r[r.length - 1] === '' || r[r.length - 1] == null)) r.pop(); return r; };
  for (const [obj, entries] of objects) for (const e of entries) {
    if (!e.name.includes('.')) rows.push(trim([obj, e.label || e.name, fmt(e.value), e.unit || '', e.rule || '', e.expr || '']));
  }
  for (const [, entries] of objects) for (const e of entries) {
    if (!e.name.includes('.') || !e.used || e.private || seen.has(e.name)) continue;
    seen.add(e.name);
    const [set, name] = e.name.split('.');
    rows.push(trim([set, name, fmt(e.value), e.unit || '', e.rule || '', e.expr || '', e.kind || '', e.source || '', e.checked || '']));
  }
  return rows.length ? { sheet: rows } : {};
}

const triangles = (polys) => polys.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]]));

/** A built design as a model: full print precision (triangles), the rules card and sheet, exactly which version it is. */
export async function objectModel(b, { title, version, src, set, filaments: fil = {}, noRules = false }) {
  return {
    title, version, src, ...(set ? { set } : {}),
    material: b.object.material, orientation: b.object.orientation,
    rules: b.entries.filter((e) => e.show).map((e) => [e.label || e.name, fmt(e.value), e.unit || '']),
    ...sheet([[b.object.name, b.entries]], { noRules }),
    ...(b.circuit ? { views: await (await pcbEngine()).views(b.circuit) } : {}), // boards: the 2D board and schematic
    ...fromParts(b.parts.map((p) => ({ name: p.name, role: p.role, label: p.label, slot: slotOf(fil, p.filament), triangles: triangles(p.triangles) }))),
  };
}

/** A built assembly as a model: each shape once and placed (nine keys cost one keycap), its boards' views, its joints. */
export async function assemblyModel(s, { title, versions, filaments: fil = {}, noRules = false }) {
  const model = {
    title, version: versions, src: `${s.project}/${s.name}`, // object versions are in version: the file name stays short
    rules: [],
    ...sheet([...new Map(s.objects.filter((o) => o.built?.entries).map((o) => [o.objName, o.built.entries])).entries()], { noRules }),
    // Its boards' 2D views (copper, schematic), so one link holds the whole build: tabs over the 3D model
    ...(await (async () => {
      const boards = [...new Map(s.objects.filter((o) => o.built?.circuit).map((o) => [o.objName, o])).values()];
      if (!boards.length) return {};
      const pcb = await pcbEngine(), views = [];
      for (const o of boards) for (const [n, svg] of await pcb.views(o.built.circuit)) views.push([boards.length > 1 ? `${o.objName} ${n}` : n, svg]);
      return { views };
    })()),
    ...fromShapes(shapes(s.parts).shapes.length ? (() => {
      const placed = shapes(s.parts);
      return placed.place.map(([i, ...m], n) => { const p = placed.shapes[i].part; return { shape: i, role: p.role, label: p.object || p.label, slot: slotOf(fil, p.filament), triangles: triangles(placed.shapes[i].triangles), matrix: m, name: s.parts[n].name }; });
    })() : []),
  };
  return Object.assign(model, motionData(s));
}
