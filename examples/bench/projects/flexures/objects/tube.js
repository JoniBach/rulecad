// A developable mechanism: a tube whose wall is a four-bar. At rest it is a plain tube; press its input link (the
// wall between the first two hinges) and the links turn, the next two standing out of the tube's surface and in. Printed
// standing in PETG in one piece: each hinge is the wall thinned to a web from both faces, its axis up z, so it bends
// within its layers. The flexures kit models the links as the rigid four-bar's, each hinge a torsion spring.
export function main (v) {
  const f = v.flexures
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG', density: v.petg.density })
  const tube = { radius: v.radius, wall: v.wall, height: v.height, joints: [v.joint_a, v.joint_b, v.joint_c, v.joint_d], hinge: { flex: v.flex, thickness: v.web } }
  const model = f.tubeFourBarModel(tube, material)
  const findings = f.tubeFourBarFindings({ ...tube, turn: v.turn }, { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }, material, model, { clearance: v.x1c.fit })
  return {
    parts: { tube: f.tubeFourBar(tube) },
    findings,
    mechanism: { kind: 'developable', turn: v.turn, travel: model.travel, at: model.at(v.turn), grams: model.grams }
  }
}
