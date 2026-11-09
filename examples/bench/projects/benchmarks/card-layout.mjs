// Where everything on the gear card goes, for the card, the plate of its gears and the mounted assembly, so they can't
// disagree. g is @rulecad/gears; v the card's variables. Modules run across, backlashes down; each pair is side by side.
export function layout (v, g) {
  const modules = [v.module_a, v.module_b, v.module_c], backlashes = [v.backlash_a, v.backlash_b, v.backlash_c], pins = [], labels = []
  const model = (m, b) => g.gearModel({ module: m, teeth: v.teeth, shift: v.shift, backlash: b })
  const wide = modules.map((m) => { const a = model(m, backlashes[0]); return { tip: a.tip, centre: g.mesh(a, a).centre } })
  const rows = wide.at(-1).tip + v.gap
  let x = v.margin + v.side
  modules.forEach((m, c) => {
    const { tip, centre } = wide[c], x0 = x + tip / 2
    labels.push({ text: `m${m}`, x: x + (centre + tip) / 2, y: v.margin + rows * backlashes.length + v.head / 2 })
    backlashes.forEach((b, r) => {
      const y = v.margin + rows * (backlashes.length - r - 1) + rows / 2, ctr = g.mesh(model(m, b), model(m, b)).centre, id = `g${c}${r}`
      pins.push({ id: `${id}a`, x: x0, y, module: m, backlash: b, dots: r + 1 }, { id: `${id}b`, x: x0 + ctr, y, module: m, backlash: b, dots: r + 1, meshes: `${id}a` })
      if (c === 0) labels.push({ text: `${b}`, x: v.margin + v.side / 2, y })
    })
    x += centre + tip + v.gap
  })
  return { pins, labels, size: [x + v.margin - v.gap, v.margin * 2 + rows * backlashes.length + v.head] }
}
