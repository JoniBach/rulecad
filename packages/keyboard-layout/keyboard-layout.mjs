// Keyboard layouts: where the keys go, as plain JSON that a plate, keycaps, a case and a circuit board can all read:
//   { "title": "…", "note": "…", "defaults": { "anchor": "mc" },
//     "rows": [ { "row": "R1", "keys": ["Esc", ["Tab", 1.25], { "label": "F", "legend": "F", "homing": true }] }, … ] }
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
    let x = -across / 2;
    list.forEach((k, col) => {
      const props = { ...defaults, ...shared, ...key(k) };
      for (const [n, v] of Object.entries(props)) if (v === '@label') props[n] = props.label; // e.g. legend: the key's label
      out.push({ ...props, row: props.row ?? row, index: row, col, units: props.u, x: x + props.u / 2, y: (rows.length - 1) / 2 - row });
      x += props.u;
    });
  });
  return out;
}

// width(layout): the widest row, in key units; depth(layout): the number of rows
/** The widest row, in key units. @param {Layout} layout @returns {number} */
export const width = (layout) => Math.max(...(layout.rows || []).map(rowOf).map((r) => (r.keys || []).reduce((s, k) => s + key(k).u, 0)));
/** The number of rows. @param {Layout} layout @returns {number} */
export const depth = (layout) => (layout.rows || []).length;

// project(layout, fields): only the fields something reads, key by key, so a change to anything else (a legend, when
// only positions matter) isn't a change to it. Positions always count.
/** Only the fields something reads, key by key (positions always). @param {Layout} layout @param {string[]} [fields] @returns {object[]} */
export const project = (layout, fields = []) => keys(layout).map((k) => Object.fromEntries(['index', 'col', 'u', ...fields].map((f) => [f, k[f] ?? null])));
