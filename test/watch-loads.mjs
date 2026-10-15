// Watches what Node loads and fails the run if a web framework is among it (React, or tscircuit's core, which is built
// on React). Use: node --import ./test/watch-loads.mjs <script>
import { registerHooks } from 'node:module';
const seen = new Set();
registerHooks({ resolve(specifier, context, next) { const r = next(specifier, context); if (/node_modules\/(react|react-dom|react-reconciler|@tscircuit\/core|tscircuit)\//.test(r.url)) seen.add(r.url.replace(/.*node_modules\//, '').split('/').slice(0, 2).join('/')); return r; } });
process.on('exit', () => { if (seen.size) { console.log(`a web framework was loaded: ${[...seen].join(', ')}`); process.exitCode = 1; } else console.log('no web framework loaded'); });
