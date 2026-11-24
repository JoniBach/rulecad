// A lattice spring block: re-entrant honeycomb cells between two solid plates, printed flat in PETG in one piece.
// Pressed between its plates it is a soft spring, and its sides draw in instead of bulging out (the cells' walls lean
// inwards, so the block has a negative Poisson's ratio). The flexures kit solves the block as a frame of its walls:
// its stiffness, the strain its walls see at the design load, and the force at which they buckle.
export function main (v) {
  const f = v.flexures
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG', density: v.petg.density })
  const block = { slant: v.slant, upright: v.upright, angle: v.angle, thickness: v.thickness, depth: v.depth, across: v.across, rows: v.rows, plate: v.plate }
  const model = f.latticeBlockModel(block, material)
  const travel = v.load / model.stiffness
  const findings = f.latticeFindings({ ...block, travel }, { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }, material, model)
  return {
    parts: { block: f.latticeBlock(block) },
    findings,
    mechanism: { kind: 'lattice', stiffness: model.stiffness, travel, limit: model.travel(material.strainLimit), buckles: model.buckling.force, poisson: model.poisson, grams: model.grams }
  }
}
