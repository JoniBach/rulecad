// Print files: the 3MF writer the model page uses too (bambu3mf in @rulecad/model-link, which describes the layout), so
// a file from `cad export` and one downloaded from the page are the same kind of file.
//   await threemf([{ name, parts: [{ name, triangles, slot }] }], { centre }) -> Uint8Array (a zip)
export { bambu3mf as threemf, mesh } from '@rulecad/model-link';

// The AMS slot for a part, from the project's filaments ({ "base": { "slot": 1 }, "legend": { "slot": 2 } })
export const slotOf = (filaments = {}, name) => filaments[name || 'base']?.slot || filaments.base?.slot || 1;
