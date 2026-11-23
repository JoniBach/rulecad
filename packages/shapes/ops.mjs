// Boolean operations behind one interface, so a design can say what it means (v.ops.subtract(case, holes)) and the
// workspace chooses the engine: JSCAD's own (the default, exactly as before) or Manifold (manifold-3d, WASM: much
// faster, and always watertight). Each op takes shapes or arrays of them, like JSCAD's. With Manifold, a shape that
// can't be read as a closed solid falls back to JSCAD for that op (counted in stats.fallbacks).
//   const o = await ops('manifold'); o.union(a, b); o.subtract(a, b, c); o.intersect(a, b); o.stats
// and with Manifold, the least distance between two solids: o.gap(a, b, within)
import jscad from '@jscad/modeling';

const { geom3, poly3 } = jscad.geometries;
const flat = (args) => args.flat(Infinity).filter((g) => g != null);

/**
 * Booleans for an engine: { engine, union, subtract, intersect, stats: { ops, fallbacks } }.
 * @param {'jscad' | 'manifold'} [engine]
 */
export async function ops(engine = 'jscad') {
  const stats = { ops: 0, fallbacks: 0 };
  const { union, subtract, intersect } = jscad.booleans;
  // (the gap between two solids needs Manifold: JSCAD has no distance query, so it says so by name)
  const noGap = () => { throw Object.assign(new Error('gap needs the manifold engine: ops(\'manifold\'), with manifold-3d installed'), { code: 'engine.gap' }); };
  if (engine === 'jscad') return { engine, stats, union: (...a) => (stats.ops++, union(...flat(a))), subtract: (...a) => (stats.ops++, subtract(...flat(a))), intersect: (...a) => (stats.ops++, intersect(...flat(a))), gap: noGap };
  if (engine !== 'manifold') throw new Error(`no boolean engine "${engine}" (jscad or manifold)`);
  let wasm;
  try { wasm = await (await import('manifold-3d')).default(); } catch (e) {
    throw Object.assign(new Error('the manifold engine needs manifold-3d: npm install manifold-3d (in the workspace)'), { code: 'engine.missing', cause: e });
  }
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  // JSCAD → Manifold: the shape's faces as triangles, corners shared where they meet
  const toManifold = (g) => {
    const verts = [], tris = [], index = new Map();
    const at = (v) => { const k = `${v[0]},${v[1]},${v[2]}`; if (!index.has(k)) { index.set(k, verts.length / 3); verts.push(v[0], v[1], v[2]); } return index.get(k); };
    for (const p of geom3.toPolygons(g)) { const ids = p.vertices.map(at); for (let i = 1; i < ids.length - 1; i++) tris.push(ids[0], ids[i], ids[i + 1]); }
    const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
    mesh.merge();
    const m = new Manifold(mesh);
    if (m.status() !== 'NoError') { m.delete(); throw new Error(`not a closed solid (${m.status()})`); }
    return m;
  };
  // Manifold → JSCAD: its triangles as faces
  const toGeom = (m) => {
    const { vertProperties: v, triVerts: t, numProp: n } = m.getMesh(), polys = [];
    for (let i = 0; i < t.length; i += 3) polys.push(poly3.create([t[i], t[i + 1], t[i + 2]].map((k) => [v[k * n], v[k * n + 1], v[k * n + 2]])));
    return geom3.create(polys);
  };
  const run = (name, jscadOp, list) => {
    stats.ops++;
    const shapes = flat(list);
    if (shapes.length < 2) return shapes[0] ? jscadOp(...shapes) : geom3.create();
    let made = [];
    try {
      made = shapes.map(toManifold);
      const out = name === 'union' ? Manifold.union(made) : name === 'intersect' ? Manifold.intersection(made)
        : made.slice(1).reduce((a, b) => { const r = a.subtract(b); if (a !== made[0]) a.delete(); return r; }, made[0]);
      const g = toGeom(out);
      if (!made.includes(out)) out.delete();
      return g;
    } catch {
      stats.fallbacks++;
      return jscadOp(...shapes);
    } finally { for (const m of made) m.delete(); }
  };
  // The least distance between two solids' surfaces, by Manifold's minGap, up to `within` mm (beyond it, within is
  // returned: nothing nearer). 0 when they touch or cross.
  const gap = (a, b, within = 1) => {
    if (!(typeof within === 'number' && within > 0)) throw new Error(`gap: within is how far to look, in mm above 0 (got ${JSON.stringify(within)})`);
    let ma = null, mb = null;
    try { ma = toManifold(a); mb = toManifold(b); return Math.max(0, ma.minGap(mb, within)); } finally { ma?.delete(); mb?.delete(); }
  };
  return { engine, stats, union: (...a) => run('union', union, a), subtract: (...a) => run('subtract', subtract, a), intersect: (...a) => run('intersect', intersect, a), gap };
}
