// A tray printed flat and folded up: a square base and four walls, each wall on an array of lamina-emergent torsion
// joints along its edge (four in series, so each turns a quarter of the fold). Printed flat in PETG in one piece; the
// walls fold up to stand round what the tray holds. Drawn at the fold the variable fold gives (0 as printed): an
// assembly's pose sets it, so a fit can be checked folded. The flexures kit checks the fold itself on the way from
// flat to standing: every joint's strain, and every wall, land and the base clear of each other.
export async function main (v) {
  const f = v.flexures, s = v.base / 2, w = v.wall
  const material = { ...f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG' }), nu: v.petg.poisson }
  const joint = { width: v.joint_w, bar: v.bar, slot: v.slot, bridge: v.bridge, series: v.series }
  const sheet = {
    thickness: v.thickness,
    panels: {
      base: [[0 - s, 0 - s], [s, 0 - s], [s, s], [0 - s, s]],
      east: [[s, 0 - s], [s + w, 0 - s], [s + w, s], [s, s]],
      north: [[s, s], [0 - s, s], [0 - s, s + w], [s, s + w]],
      west: [[0 - s, s], [0 - s - w, s], [0 - s - w, 0 - s], [0 - s, 0 - s]],
      south: [[0 - s, 0 - s], [s, 0 - s], [s, 0 - s - w], [0 - s, 0 - s - w]]
    },
    hinges: [
      { name: 'east', from: 'base', to: 'east', at: [[s, 0 - s], [s, s]], let: joint },
      { name: 'north', from: 'base', to: 'north', at: [[s, s], [0 - s, s]], let: joint },
      { name: 'west', from: 'base', to: 'west', at: [[0 - s, s], [0 - s, 0 - s]], let: joint },
      { name: 'south', from: 'base', to: 'south', at: [[0 - s, 0 - s], [s, 0 - s]], let: joint }
    ]
  }
  const all = (a) => ({ east: a, north: a, west: a, south: a })
  const checked = await f.foldCheck(sheet, material, { poses: { folded: all(v.folded) }, clearance: v.clearance })
  return { parts: { tray: f.foldSheet(sheet, all(v.fold)) }, findings: checked.findings, mechanism: { kind: 'fold', poses: checked.poses, limit: material.strainLimit } }
}
