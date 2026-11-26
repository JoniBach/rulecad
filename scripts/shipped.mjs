// The modules a package ships: its package.json "files" entries that name .mjs files, a pattern (*.mjs) read against
// the package's folder, less the entries npm leaves out ("!test.mjs"). Dot-files are never a package's modules.
import fs from 'node:fs';
import path from 'node:path';

const toRegex = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);

/** @param {string} dir the package's folder @returns {string[]} module paths relative to it, sorted */
export function shippedModules(dir) {
  const { files = [] } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const out = new Set(), drop = files.filter((f) => f.startsWith('!')).map((f) => toRegex(f.slice(1)));
  for (const f of files.filter((f) => !f.startsWith('!') && f.endsWith('.mjs'))) {
    if (!f.includes('*')) { out.add(f); continue; }
    const sub = path.posix.dirname(f), re = toRegex(path.posix.basename(f)), at = path.join(dir, sub);
    if (fs.existsSync(at)) for (const n of fs.readdirSync(at)) if (re.test(n) && !n.startsWith('.')) out.add(sub === '.' ? n : `${sub}/${n}`);
  }
  return [...out].filter((f) => !drop.some((re) => re.test(f))).sort();
}
