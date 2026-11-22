// A module loader without cycle support, as the JSCAD web app's (its require() in hrgdavor/jscadui,
// packages/require/src/require.js, read on 2026-11-22): each ES module is turned into CommonJS, then run, and only put
// in the cache once it has finished. A module that imports itself back, directly or through others, is loaded again
// before it finishes, and again, until the stack runs out: "RangeError: Maximum call stack size exceeded / failed
// loading module ./gears.mjs / failed loading module ./planetary.mjs / ..." (issue #278). Node's own loader links a
// loop and runs it, so the packages' tests never meet this.
//
// load(file, read) gives a module's exports. read(file) gives a file's source, so a test can hand it modules that are
// not on disk. A bare name (@rulecad/fea, @jscad/modeling) is resolved the way Node would from the importing file;
// another @rulecad package goes through this loader too, anything else (JSCAD, Node's built-ins) through Node's own
// require. The ES to CommonJS step is esbuild's, as the web app's is its own transform.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

export function loader(read = (f) => fs.readFileSync(f, 'utf8')) {
  const cache = new Map(), turned = new Map(); // exports once run; each file's CommonJS, made once (only for speed)
  const load = (file, from) => {
    if (cache.has(file)) return cache.get(file);
    if (file.endsWith('.json')) { const data = JSON.parse(read(file)); cache.set(file, data); return data; } // as the web app reads JSON
    if (!turned.has(file)) turned.set(file, transformSync(read(file), { format: 'cjs', loader: 'js', define: { 'import.meta.url': '__moduleUrl', 'import.meta.resolve': '__resolve' }, logLevel: 'silent' }).code);
    const code = turned.get(file);
    const module = { exports: {} };
    const node = createRequire(file), resolve = (id) => pathToFileURL(id.startsWith('.') ? path.resolve(path.dirname(file), id) : node.resolve(id)).href;
    const require = (id) => {
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id), id);
      if (id.startsWith('@rulecad/')) return load(node.resolve(id), id);
      return node(id);
    };
    try { new Function('require', 'exports', 'module', '__moduleUrl', '__resolve', code)(require, module.exports, module, pathToFileURL(file).href, resolve); }
    catch (err) { err.message += ` / failed loading module ${from ?? file}`; throw err; }
    cache.set(file, module.exports); // only now, as the web app does
    return module.exports;
  };
  return (file) => load(path.resolve(file));
}
