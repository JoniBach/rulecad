// Short links through a secret GitHub Gist (unlisted: only people with the link find it), made with the gh command.
import { execFileSync } from 'node:child_process';

export async function shorten(data, { desc }) {
  const out = execFileSync('gh', ['gist', 'create', '--filename', 'model.txt', '--desc', desc, '-'], { input: data, encoding: 'utf8' }).trim();
  return out.split('/').pop();
}
