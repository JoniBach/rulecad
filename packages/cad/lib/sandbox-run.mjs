// The sandbox's runner: reads { js, values, meta } on stdin, runs the design's main(values), and writes its parts'
// faces (and the rules it read) as JSON on stdout. Started by sandbox.mjs, under Node's permission model.
import fs from 'node:fs';
import path from 'node:path';
import * as shapes from '@rulecad/shapes';
import * as flexures from '@rulecad/flexures';
import { named, faces, unpack, watch } from './parts.mjs';
import { lineOf } from './errors.mjs';

for (const k of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'Request', 'Response']) delete globalThis[k];
// and the ways round the import hook that process itself offers: Node's own modules by name, its internals, other
// processes. (sandbox.mjs's header says what this does and doesn't promise.)
const exit = process.exit.bind(process);
for (const k of ['getBuiltinModule', 'binding', '_linkedBinding', 'dlopen', 'kill', '_kill', '_getActiveHandles', '_getActiveRequests', '_debugProcess', '_startProfilerIdleNotifier']) {
  if (k in process) Object.defineProperty(process, k, { value: undefined, configurable: false, writable: false });
}
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const { js, values, meta, engine, optional, stages } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
// A lamina's slow stages: read from the tool's cache (the workspace is readable), and what this run makes handed back
// with the parts for the tool to write (this process can't)
const kept = {}; // (what this run made of them)
if (stages) flexures.laminaCache({ salt: stages.salt, get: (k) => { try { return fs.readFileSync(path.join(stages.dir, `${k}.json`), 'utf8'); } catch { return undefined; } }, put: (k, text) => { kept[k] = text; } });
const stdout = process.stdout, done = (o) => stdout.write(JSON.stringify(o), () => exit(0));
// stdout carries the result, so what a design prints (console.log, to see a value) goes to stderr, which the tool passes on
console.log = console.info = console.debug = (...a) => console.error(...a);
try {
  const mod = await import(js);
  if (typeof mod.main !== 'function') throw Object.assign(new Error('the design has no exported main(v)'), { code: 'design.main' });
  const { v, read } = watch(values, { shapes, flexures, ops: await shapes.ops(engine || 'jscad') }, optional);
  const { shapes: made, mechanism } = unpack(await mod.main(v));
  const parts = named(made, meta).map(({ geometry, ...p }) => ({ ...p, solid: faces(geometry) }));
  done({ parts, read: [...read], ...(mechanism ? { mechanism } : {}), ...(Object.keys(kept).length ? { stages: kept } : {}) });
} catch (e) {
  const line = lineOf(e, js);
  done({ error: { message: e?.message || String(e), ...(line ? { line } : {}), ...(e?.name === 'SyntaxError' ? { syntax: true } : {}), code: e?.code && typeof e.code === 'string' && !/^ERR_/.test(e.code) ? e.code : e?.code === 'ERR_ACCESS_DENIED' ? 'design.sandbox' : 'design.run' } });
}
