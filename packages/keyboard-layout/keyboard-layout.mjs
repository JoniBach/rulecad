// Keyboard layouts: where the keys go, as plain JSON that a plate, keycaps, a case and a circuit board can all read:
//   { "title": "…", "note": "…", "defaults": { "anchor": "mc" },
//     "rows": [ { "row": "R1", "keys": ["Esc", ["Tab", 1.25], { "label": "F", "legend": "F", "homing": true }] }, … ] }
// A { "gap": 0.25 } in a row is space between keys (a function row's groups). fromKLE() reads keyboard-layout-editor.com.
// Rows run back to front and start at the same left edge, as on a keyboard. A key is a label (1u), [label, units], or
// an object with label, u and any other properties. A row can be a plain list of keys, or an object whose other
// properties apply to every key in it (row: "R1"); defaults apply to every key. A key's own properties win. A value of
// "@label" is the key's label: "defaults": { "legend": "@label" } gives every key its label as its legend.
// No imports and no file access: the format alone, for browsers and Node alike.

/** @typedef {string | [string, number] | { label: string, u?: number, [property: string]: any }} KeySpec a key: "Q", ["Tab", 1.5] or an object */
/** @typedef {{ rows: (KeySpec[] | { keys: KeySpec[], [property: string]: any })[], defaults?: object, title?: string }} Layout */
/** @typedef {{ label: string, u: number, units: number, row: string | number, index: number, col: number, x: number, y: number, [property: string]: any }} Key */

// A key as { label, u, …properties }
const key = (k) => (typeof k === 'string' ? { label: k, u: 1 } : Array.isArray(k) ? { label: k[0], u: k[1] ?? 1 } : { u: 1, ...k });
const rowOf = (r) => (Array.isArray(r) ? { keys: r } : r);
// A gap between keys: { "gap": 0.5 } in a row, in key units (no key there, but the keys after it move along)
const isGap = (k) => k && typeof k === 'object' && !Array.isArray(k) && k.gap != null && k.label == null;

// keys(layout) -> [{ row, col, label, u, units, x, y, …properties }]: each key's centre in key units, the layout
// centred on 0 (x to the right, y to the back). units is u, under its older name.
/**
 * Each key with its centre in key units (the layout centred on 0, x right, y to the back) and its properties.
 * @param {Layout} layout
 * @returns {Key[]}
 */
export function keys(layout) {
  const rows = (layout.rows || []).map(rowOf), defaults = layout.defaults || {};
  const across = width(layout), out = [];
  rows.forEach((r, row) => {
    const { keys: list = [], ...shared } = r;
    let x = -across / 2, col = 0;
    list.forEach((k) => {
      if (isGap(k)) { x += k.gap; return; }
      const props = { ...defaults, ...shared, ...key(k) };
      for (const [n, v] of Object.entries(props)) if (v === '@label') props[n] = props.label; // e.g. legend: the key's label
      out.push({ ...props, row: props.row ?? row, index: row, col: col++, units: props.u, x: x + props.u / 2, y: (rows.length - 1) / 2 - row });
      x += props.u;
    });
  });
  return out;
}

// width(layout): the widest row, in key units; depth(layout): the number of rows
/** The widest row, in key units. @param {Layout} layout @returns {number} */
export const width = (layout) => Math.max(...(layout.rows || []).map(rowOf).map((r) => (r.keys || []).reduce((s, k) => s + (isGap(k) ? k.gap : key(k).u), 0)));
/** The number of rows. @param {Layout} layout @returns {number} */
export const depth = (layout) => (layout.rows || []).length;

// project(layout, fields): only the fields something reads, key by key, so a change to anything else (a legend, when
// only positions matter) isn't a change to it. Positions always count.
/** Only the fields something reads, key by key (positions always). @param {Layout} layout @param {string[]} [fields] @returns {object[]} */
export const project = (layout, fields = []) => keys(layout).map((k) => Object.fromEntries(['index', 'col', 'u', ...fields].map((f) => [f, k[f] ?? null])));

/**
 * A layout from keyboard-layout-editor.com: its JSON download, or the "Raw data" text. Rows, widths and the gaps
 * between keys come across; what this format has no place for (rotated keys, rows nudged up or down, tall or
 * stepped keys such as ISO Enter) is listed in notes, and those keys keep their place in the row.
 * A key's label is its main legend; a second legend (the shifted symbol, "!" over "1") becomes legend2.
 * @param {string | any[]} kle
 * @returns {{ layout: Layout, notes: string[] }}
 */
export function fromKLE(kle) {
  const data = typeof kle === 'string' ? parseRaw(kle) : kle;
  if (!Array.isArray(data)) throw new Error("this isn't a keyboard-layout-editor layout (a list of rows)");
  const notes = new Set(), rows = [];
  let title;
  for (const row of data) {
    if (!Array.isArray(row)) { if (row && typeof row === 'object') title = row.name; continue; } // the layout's own settings
    const keys = [];
    let next = {};
    for (const item of row) {
      if (item && typeof item === 'object') {
        next = { ...next, ...item };
        if (item.r || item.rx || item.ry) notes.add('rotated keys are placed as if straight');
        if (item.y) notes.add('rows nudged up or down are placed one row apart');
        continue;
      }
      if (next.x) keys.push({ gap: next.x });
      if ((next.h && next.h !== 1) || next.w2 || next.h2 || next.x2 || next.y2) notes.add(`${legendOf(item).label || 'a key'} is tall or stepped: placed as ${next.w || 1}u wide`);
      const { label, legend2 } = legendOf(item), u = next.w || 1;
      keys.push(legend2 ? { label, u, legend2 } : u === 1 ? label : [label, u]);
      next = {};
    }
    rows.push(keys);
  }
  return { layout: { ...(title ? { title } : {}), rows }, notes: [...notes] };
}

// "Raw data" from keyboard-layout-editor.com is JSON with its object keys unquoted and the outer brackets left off
function parseRaw(text) {
  try { return JSON.parse(text); } catch {}
  const quoted = `[${text}]`.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":');
  try { return JSON.parse(quoted); } catch { throw new Error("this isn't keyboard-layout-editor data: paste its Raw data, or use its JSON download"); }
}

// A key's legends: "Q", or "!\n1" (top-left shifted, bottom-left main), up to twelve positions
function legendOf(text) {
  const all = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  return all.length > 1 ? { label: all[all.length - 1], legend2: all[0] } : { label: all[0] || '' };
}
