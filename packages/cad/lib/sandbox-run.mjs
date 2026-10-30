// The sandbox's runner: reads { js, values, meta } on stdin, runs the design's main(values), and writes its parts'
// faces (and the rules it read) as JSON on stdout. Started by sandbox.mjs, under Node's permission model.
import * as shapes from '@rulecad/shapes';
import * as flexures from '@rulecad/flexures';
import { named, faces } from './parts.mjs';

for (const k of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'Request', 'Response']) delete globalThis[k];
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const { js, values, meta, engine } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const done = (o) => process.stdout.write(JSON.stringify(o), () => process.exit(0));
try {
  const mod = await import(js);
  if (typeof mod.main !== 'function') throw Object.assign(new Error('the design has no exported main(v)'), { code: 'design.main' });
  // Rules the code reads directly (v.mx.housing_top) count as used too
  const read = new Set(), watched = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v && typeof v === 'object'
    ? new Proxy(v, { get: (t, r) => { if (typeof r === 'string' && r in t) read.add(`${k}.${r}`); return t[r]; } }) : v]));
  watched.shapes = shapes; watched.flexures = flexures; watched.ops = await shapes.ops(engine || 'jscad');
  const made = await mod.main(watched);
  const parts = named(made, meta).map(({ geometry, ...p }) => ({ ...p, solid: faces(geometry) }));
  done({ parts, read: [...read] });
} catch (e) {
  done({ error: { message: e?.message || String(e), code: e?.code && typeof e.code === 'string' && !/^ERR_/.test(e.code) ? e.code : e?.code === 'ERR_ACCESS_DENIED' ? 'design.sandbox' : 'design.run' } });
}
