// Edits to JSON text that keep everything else as it was: key order, indentation, line breaks and characters (a ×
// stays a ×). A small scanner finds where each value is in the text; an edit replaces that span, or adds a key to an
// object (or an entry to an array) in the indentation already there. Used by cad set and cad add.

// Where every value is: [{ path: ['variables', 'w', 'value'], start, end }], in the order they appear
function spans(text) {
  const out = [];
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const str = () => { const s = i++; while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1; i++; return JSON.parse(text.slice(s, i)); };
  const value = (path) => {
    ws();
    const start = i, c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') i++;
      else for (;;) { ws(); const k = str(); ws(); i++; value([...path, k]); ws(); if (text[i++] === '}') break; }
    } else if (c === '[') {
      i++; ws();
      if (text[i] === ']') i++;
      else for (let n = 0; ; n++) { value([...path, n]); ws(); if (text[i++] === ']') break; }
    } else if (c === '"') str();
    else { while (i < text.length && /[^\s,\]}]/.test(text[i])) i++; }
    out.push({ path, start, end: i });
  };
  value([]);
  return out;
}
const same = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);
const find = (text, path) => spans(text).find((s) => same(s.path, path));
// The indentation of the line a position is on
const indentAt = (text, at) => { const line = text.lastIndexOf('\n', at - 1) + 1; return /^[ \t]*/.exec(text.slice(line))[0]; };
// A value as JSON, laid out like the file (two spaces a level, from the given indentation); short arrays of numbers
// and expressions stay on one line, as people write them
function render(v, indent) {
  if (Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null) && JSON.stringify(v).length <= 80) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
  const inner = `${indent}  `;
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${inner}${render(x, inner)}`).join(',\n')}\n${indent}]` : '[]';
  if (v && typeof v === 'object') { const e = Object.entries(v); return e.length ? `{\n${e.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${render(x, inner)}`).join(',\n')}\n${indent}}` : '{}'; }
  return JSON.stringify(v);
}

/** The value at a path, or undefined. @param {string} text @param {(string | number)[]} path */
export function getAt(text, path) {
  const s = find(text, path);
  return s ? JSON.parse(text.slice(s.start, s.end)) : undefined;
}

/**
 * Set the value at a path: replace it where it is, or add the key at the end of its object.
 * @param {string} text @param {(string | number)[]} path @param {any} value @returns {string}
 */
export function setAt(text, path, value) {
  const s = find(text, path);
  if (s) return text.slice(0, s.start) + render(value, indentAt(text, s.start)) + text.slice(s.end);
  const parent = find(text, path.slice(0, -1));
  if (!parent) throw Object.assign(new Error(`no ${path.slice(0, -1).join('.') || 'top level'} to add ${path.at(-1)} to`), { code: 'edit.path' });
  const body = text.slice(parent.start, parent.end);
  if (body[0] !== '{') throw Object.assign(new Error(`${path.slice(0, -1).join('.')} isn't an object`), { code: 'edit.path' });
  return insert(text, parent, `${JSON.stringify(path.at(-1))}: `, value);
}

/** Add an entry at the end of the array at a path. @param {string} text @param {(string | number)[]} path @param {any} value @returns {string} */
export function appendAt(text, path, value) {
  const s = find(text, path);
  if (!s) throw Object.assign(new Error(`no ${path.join('.')} to add to`), { code: 'edit.path' });
  if (text[s.start] !== '[') throw Object.assign(new Error(`${path.join('.')} isn't a list`), { code: 'edit.path' });
  return insert(text, s, '', value);
}

// Add a member before an object's } or an array's ], after its last one, indented like it
function insert(text, s, key, value) {
  const close = s.end - 1, inner = text.slice(s.start + 1, close);
  const outer = indentAt(text, close), empty = !inner.trim();
  // Its own members (not theirs): the last one is where the new one goes after; the first says how they're indented
  const members = spans(text).filter((x) => x.path.length === s.path.length + 1 && same(x.path.slice(0, -1), s.path)).sort((a, b) => a.start - b.start);
  const last = members.at(-1), multi = empty || inner.includes('\n');
  const first = members.length ? text.lastIndexOf('\n', members[0].start) : -1;
  const indent = empty ? `${outer}  ` : multi ? /^[ \t]*/.exec(text.slice(first + 1))[0] : outer;
  const piece = `${key}${render(value, indent)}`;
  if (empty) return `${text.slice(0, s.start + 1)}\n${indent}${piece}\n${outer}${text.slice(close)}`;
  const after = last.end;
  return multi ? `${text.slice(0, after)},\n${indent}${piece}${text.slice(after)}` : `${text.slice(0, after)}, ${piece}${text.slice(after)}`;
}
