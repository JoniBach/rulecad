// frame.heat: a frame that runs warm. Its beams grow with the air round them by their alloy's expansion, so a frame
// squared and measured at the workshop's temperature is larger when it runs in a warm enclosure; and each printed
// fitting is held to its plastic's softening point (the heat deflection temperature its set gives), at the air's
// temperature or at a heater's where it is within that heater's reach.
//   "frame": { "heat": { "air": 45, "built": 20, "heaters": [{ "name": "bed", "at": [150, 150, 60], "temperature": 60, "reach": 40 }] } }
// Growth: ΔL = α L ΔT, with ΔT = air - built, for each beam and for the frame's extent each way.
import { placeItems } from '@rulecad/model-link';
import { peekRuleSet } from './rules.mjs';

const n3 = (x, d = 3) => String(Number(Number(x).toFixed(d)));
const shown = (v) => JSON.stringify(v) ?? String(v);

/** The working figures of frame.heat, each with what it rests on. */
export const FRAME_HEAT = {
  expansion: { value: 23.4e-6, unit: '1/K', rule: 'How much an aluminium beam grows for each degree it warms, a share of its length, where its alloy\'s set gives no expansion: the figure for 6063, taken for the 6000 series extrusions the profiles are made of', kind: 'community', source: '6063 aluminium alloy, Wikipedia\'s table (2.34e-5 /K); 6063-T5 suppliers\' sheets give 23.4 µm/m °C over 20 to 100 °C (Alliance, Aerospace Metals) and Hydro\'s EN AW-6063 sheet 23.5, found by search and not each opened', checked: '2026-11-17' },
  built: { value: 20, unit: '°C', rule: 'The air a frame is built, squared and measured in, where the assembly does not say', kind: 'default', source: 'A working figure of @rulecad/cad: a room', checked: '2026-11-17' },
  margin: { value: 10, unit: '°C', rule: 'A printed fitting within this many degrees under its plastic\'s softening point is warned of: the heat deflection temperature is measured under a light load (0.45 MPa), and a fitting under its working load creeps sooner', kind: 'estimate', source: 'A working figure of @rulecad/cad, without a test behind it', checked: '2026-11-17' },
};

// frame.heat as written, checked by name: null where it is not given
function heatOf(s) {
  const h = s.a.frame?.heat;
  if (h == null) return null;
  if (typeof h !== 'object' || Array.isArray(h)) throw new Error(`frame.heat is { "air": 45, "built": 20, "heaters": [...] }: degrees C (got ${shown(h)})`);
  for (const k of Object.keys(h)) if (!['air', 'built', 'heaters'].includes(k)) throw new Error(`frame.heat has no "${k}": it takes air, built and heaters`);
  const deg = (v, what) => { const x = s.num(v); if (!(Number.isFinite(x) && x > -100 && x < 500)) throw new Error(`frame.heat.${what} is a temperature in degrees C (got ${shown(v)})`); return x; };
  const air = h.air != null ? deg(h.air, 'air') : null, built = h.built != null ? deg(h.built, 'built') : FRAME_HEAT.built.value;
  if (h.heaters != null && !Array.isArray(h.heaters)) throw new Error(`frame.heat.heaters is a list of { name, at, temperature, reach } (got ${shown(h.heaters)})`);
  const heaters = (h.heaters ?? []).map((x, i) => {
    const what = `frame.heat.heaters ${i + 1}`;
    if (!x || typeof x !== 'object' || !Array.isArray(x.at) || x.at.length !== 3) throw new Error(`${what} is { name, at: [x, y, z], temperature, reach } (got ${shown(x)})`);
    const reach = s.num(x.reach);
    if (!(reach > 0)) throw new Error(`${what}: reach is how far from its middle a part is taken at its temperature, mm above 0 (got ${shown(x.reach)})`);
    return { name: x.name ?? `heater ${i + 1}`, at: x.at.map((v) => s.num(v)), temperature: deg(x.temperature, `heaters ${i + 1}.temperature`), reach };
  });
  if (air == null && !heaters.length) throw new Error('frame.heat gives neither air nor heaters: give the air round the frame when it runs ("air": 45), a heater, or both');
  return { air, built, heaters, airGiven: air != null };
}

// The nearest point of an item's drawn parts to a point, and how far: its bounding box as drawn
function nearest(s, id, P) {
  const tri = s.parts.filter((p) => p.item === id).flatMap((p) => p.triangles ?? []).flat();
  if (!tri.length) return null;
  const lo = [0, 1, 2].map((k) => Math.min(...tri.map((v) => v[k]))), hi = [0, 1, 2].map((k) => Math.max(...tri.map((v) => v[k])));
  return Math.hypot(...[0, 1, 2].map((k) => Math.max(lo[k] - P[k], 0, P[k] - hi[k])));
}

/**
 * frame.heat on a built assembly: the beams' growth from built to running air, and each printed fitting's temperature
 * against its plastic's softening point. Nothing where frame.heat is not given. @param {object} s @param {Function} f
 */
export function frameHeatChecks(s, f) {
  let h;
  try { h = heatOf(s); } catch (e) { f('fail', e.message, 'frame.heat: refused', { code: 'frame.heat' }); return; }
  if (!h) return;
  // the beams grow
  const beams = s.objects.filter((o) => o.beam && !o.unplaced);
  if (beams.length && h.airGiven) {
    const placed = placeItems(s.motion, s.jointValues), at = Object.fromEntries(s.motion.items.map((x, i) => [x[0], placed[i]])), dT = h.air - h.built, ends = [];
    const rows = beams.map((o) => {
      const W = at[o.id], m = o.beam.material ?? o.beam.profile.material, own = m?.figures?.expansion?.value, alpha = typeof own === 'number' ? own : FRAME_HEAT.expansion.value;
      if (W) { const A = [W[3], W[7], W[11]], d = [W[2], W[6], W[10]]; ends.push(A, A.map((x, k) => x + d[k] * o.beam.length)); }
      return { id: o.id, length: o.beam.length, alpha, from: typeof own === 'number' ? `${m.name}.expansion` : 'FRAME_HEAT.expansion', grows: alpha * o.beam.length * dT };
    });
    const alpha = Math.max(...rows.map((x) => x.alpha)), size = [0, 1, 2].map((k) => (ends.length ? Math.max(...ends.map((p) => p[k])) - Math.min(...ends.map((p) => p[k])) : 0)), grows = size.map((x) => alpha * x * dT);
    const most = rows.reduce((a, b) => (Math.abs(b.grows) > Math.abs(a.grows) ? b : a)), kinds = [...new Set(rows.map((x) => x.from))];
    f('info', `at ${n3(h.air, 1)} °C the frame is ${n3(Math.abs(dT), 1)} °C ${dT >= 0 ? 'warmer' : 'cooler'} than the ${n3(h.built, 1)} °C it was built in, so it ${dT >= 0 ? 'grows' : 'shrinks'} by ${size.map((x, k) => (x > 1e-6 ? `${n3(Math.abs(grows[k]), 3)} mm over the ${n3(x, 0)} mm its beams span in ${'xyz'[k]}` : null)).filter(Boolean).join(', ')}; the longest beam, ${most.id} (${n3(most.length, 0)} mm), by ${n3(Math.abs(most.grows), 3)} mm. A frame of one alloy grows alike every way, so it stays square; a rail or rod of another metal on it grows by its own figure, and the difference bows or slides it`,
      null, { code: 'frame.heat', values: { air: h.air, built: h.built, change: dT, expansion: alpha, size: size.map((x) => +x.toFixed(2)), grows: grows.map((x) => +x.toFixed(4)), beams: rows.map((x) => ({ id: x.id, grows: +x.grows.toFixed(4) })) }, refs: { expansion: kinds, built: s.a.frame.heat.built != null ? 'frame.heat.built' : 'FRAME_HEAT.built' } });
  }
  // each printed fitting against its plastic's softening point
  const rows = [];
  for (const o of s.objects) {
    if (!o.fitting || o.unplaced || o.fitting.bought) continue;
    const mat = o.fitting.material ?? 'pla';
    let soft = null; try { soft = peekRuleSet(mat).rules?.softening ?? null; } catch {}
    let temp = h.air ?? h.built, by = h.airGiven ? 'the air' : 'the room', near = null;
    for (const x of h.heaters) { const d = nearest(s, o.id, x.at); if (d != null && d <= x.reach && x.temperature > temp) { temp = x.temperature; by = `${x.name}, ${n3(d, 1)} mm away`; near = x.name; } }
    rows.push({ id: o.id, fitting: o.fitting.name, mat, soft, temp, by, near });
  }
  const margin = FRAME_HEAT.margin.value, out = [];
  for (const r of rows) {
    if (typeof r.soft?.value !== 'number') { f('info', `${r.id}: ${r.mat} gives no softening point, so ${n3(r.temp, 1)} °C (${r.by}) is not checked against it: give its set a softening rule`, null, { code: 'frame.heat', refs: { item: r.id, material: r.mat } }); continue; }
    const spare = r.soft.value - r.temp, level = spare <= 0 ? 'fail' : spare < margin ? 'warn' : 'pass';
    const x = { ...r, spare, level };
    if (level === 'pass') { out.push(x); continue; }
    f(level, `${r.id} (${r.fitting}, ${r.mat.toUpperCase()}) works at ${n3(r.temp, 1)} °C (${r.by}), ${level === 'fail' ? `${n3(-spare, 1)} °C over` : `only ${n3(spare, 1)} °C under`} its ${n3(r.soft.value, 1)} °C softening point (${r.soft.rule.split(':')[0]}): it ${level === 'fail' ? 'softens and creeps under its load' : 'creeps under its load sooner than the figure says'}. Print it in a plastic that softens higher, or move it from the heat`,
      `${r.id}: ${level === 'fail' ? 'too hot' : 'near softening'}`, { code: 'frame.heat', values: { temperature: r.temp, softening: r.soft.value, spare: +spare.toFixed(2), margin }, refs: { item: r.id, material: r.mat, heater: r.near, softening: `${r.mat}.softening`, rule: r.soft.kind } });
  }
  if (out.length) {
    const low = out.reduce((a, b) => (b.spare < a.spare ? b : a));
    f('pass', `${out.length === rows.length ? (out.length > 1 ? 'every printed fitting' : 'its printed fitting') : `${out.length} printed fitting${out.length > 1 ? 's' : ''}`} stay${out.length > 1 && out.length !== rows.length ? '' : 's'} at least ${margin} °C under its plastic's softening point: the nearest is ${low.id} (${low.mat.toUpperCase()}), ${n3(low.temp, 1)} °C (${low.by}) against ${n3(low.soft.value, 1)} °C`, null,
      { code: 'frame.heat', values: { fittings: out.length, spare: +low.spare.toFixed(2), margin }, refs: { item: low.id, items: out.map((x) => x.id), softening: `${low.mat}.softening` } });
  }
}
