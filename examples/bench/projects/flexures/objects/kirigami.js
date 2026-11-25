// A kirigami panel: a PETG sheet cut into rotating squares, printed flat in one piece. Pulled by two opposite sides,
// its squares turn, alternately one way and the other, about the necks that join them, so the sheet grows both ways at
// once (a Poisson's ratio of -1) and is far softer than the plate it was cut from. The flexures kit models each neck
// from its own finite elements, and the sheet from its squares' turn: its stiffness, the strain the necks see at the
// design pull, and the stretch at the necks' limit.
export function main (v) {
  const f = v.flexures
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG', density: v.petg.density })
  const sheet = { pitch: v.pitch, neck: v.neck, slot: v.slot, depth: v.depth, across: v.across, rows: v.rows }
  const model = f.rotatingSquaresModel(sheet, material)
  const stretch = model.stretchFor(v.load) // the stretch the design pull gives, from the model's force curve
  const findings = f.kirigamiFindings({ ...sheet, stretch }, { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }, material, model)
  return {
    parts: { sheet: f.rotatingSquares(sheet) },
    findings,
    mechanism: { kind: 'kirigami', stiffness: model.stiffness, stretch, limit: model.limit.stretch, modulus: model.E, poisson: model.poisson, grams: model.grams }
  }
}
