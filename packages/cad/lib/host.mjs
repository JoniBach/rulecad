// The host: how the core reads and writes, so it runs on more than Node's file system. The core (resolve, build,
// check) does its file work through `host`; the CLI uses Node's (the default). A test, or later a browser, swaps in
// another with useHost: memoryHost(files) keeps a workspace in memory, reading anything outside it (the tool's
// packages, the published rule sets) from disk.
//   host.exists(file)  host.readText(file)  host.writeText(file, text)  host.list(dir)  host.mtime(file)
//   host.remove(file)  host.touch(file)  host.loadModule(file): a design's module (its main)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** Node's file system. */
export const nodeHost = {
  name: 'node',
  exists: (f) => fs.existsSync(f),
  readText: (f) => fs.readFileSync(f, 'utf8'),
  writeText: (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); },
  list: (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []),
  mtime: (f) => fs.statSync(f).mtimeMs,
  remove: (f) => fs.rmSync(f, { force: true }),
  touch: (f) => { const now = new Date(); fs.utimesSync(f, now, now); },
  loadModule: (f) => import(`${pathToFileURL(f).href}?t=${fs.statSync(f).mtimeMs}`), // a fresh copy after each edit
};

let current = nodeHost;
/** The host the core uses now. */
export const host = new Proxy({}, { get: (_, k) => current[k] });
/** Use another host (until the returned function is called). @param {Partial<typeof nodeHost>} h @returns {() => void} */
export function useHost(h) { const before = current; current = { ...nodeHost, ...h }; return () => { current = before; }; }

/**
 * A workspace in memory: { [path]: text } under root. Reads outside root come from disk (the tool, its rule sets);
 * writes stay in memory. A design module is loaded from its text, its imports of @jscad/modeling and @rulecad/shapes
 * pointed at the installed packages.
 * @param {Record<string, string>} files paths relative to root @param {{ root?: string }} [options]
 */
export function memoryHost(files = {}, { root = path.resolve('/rulecad-memory') } = {}) {
  const mem = new Map(Object.entries(files).map(([k, v]) => [path.resolve(root, k), v])), times = new Map();
  const inside = (f) => path.resolve(f).startsWith(root);
  const tick = () => Date.now() + times.size;
  const req = createRequire(import.meta.url);
  const bare = (spec) => pathToFileURL(req.resolve(spec)).href;
  return {
    name: 'memory', root, files: mem,
    exists: (f) => (inside(f) ? mem.has(path.resolve(f)) || [...mem.keys()].some((k) => k.startsWith(path.resolve(f) + path.sep)) : fs.existsSync(f)),
    readText: (f) => { if (!inside(f)) return fs.readFileSync(f, 'utf8'); const t = mem.get(path.resolve(f)); if (t == null) throw Object.assign(new Error(`ENOENT: no such file, '${f}'`), { code: 'ENOENT' }); return t; },
    writeText: (f, text) => { mem.set(path.resolve(f), text); times.set(path.resolve(f), tick()); },
    list: (d) => { if (!inside(d)) return fs.existsSync(d) ? fs.readdirSync(d) : []; const p = path.resolve(d) + path.sep; return [...new Set([...mem.keys()].filter((k) => k.startsWith(p)).map((k) => k.slice(p.length).split(path.sep)[0]))]; },
    mtime: (f) => (inside(f) ? times.get(path.resolve(f)) || 0 : fs.statSync(f).mtimeMs),
    remove: (f) => { mem.delete(path.resolve(f)); },
    touch: (f) => { times.set(path.resolve(f), tick()); },
    loadModule: (f) => {
      const src = (inside(f) ? mem.get(path.resolve(f)) : fs.readFileSync(f, 'utf8'))
        .replace(/from\s+'(@jscad\/modeling|@rulecad\/shapes)'/g, (_, s) => `from '${bare(s)}'`);
      return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
    },
  };
}
