// A lamina's slow stages kept between builds: the physics, the flood's probe and the frame's finite elements take
// minutes, and a change to a strap, a check or a rule's words doesn't touch what they compute. Each stage is keyed
// by its name, its inputs and a salt (this library's own code, from the tool), and its result kept as JSON. The
// store is the tool's: cad keeps the files in the workspace's cache; in its sandbox a design can't write, so what
// the stages make goes back to the tool with the parts, and the tool writes it. Without a store nothing is kept
// (the tests run every stage).
//   laminaCache({ get: (key) => text | undefined, put: (key, text) => void, salt: string })  (text: the stage's JSON)
let store = null;

/** Where a lamina keeps its slow stages' results (cad sets it; null for none). */
export function laminaCache(s) { store = s; }
export const cacheOn = () => !!store;

// JSON of a stage's inputs and results: typed arrays as arrays (a frame's dofs), anything else as it is
const replacer = (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v);
export const pack = (v) => JSON.stringify(v, replacer);

async function keyOf(name, inputs) {
  const text = `${name}\n${store.salt || ''}\n${pack(inputs)}`;
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `${name}-${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A stage's result, from the store when its inputs were seen before, else computed and kept. `compute` returns what
 * the stage makes, which must survive JSON (`pack`): the result handed back is always the JSON copy, so a hit and a
 * miss give the same shape of thing.
 * @template T @param {string} name @param {unknown} inputs @param {() => T | Promise<T>} compute @returns {Promise<T>}
 */
export async function stage(name, inputs, compute) {
  if (!store) return JSON.parse(pack(await compute())); // (the same copy as a build with a store gets: what it reads back is what it would have kept)
  const key = await keyOf(name, inputs);
  const hit = store.get(key);
  if (hit !== undefined) return JSON.parse(hit);
  const made = await compute(), text = pack(made);
  store.put(key, text);
  return JSON.parse(text);
}
