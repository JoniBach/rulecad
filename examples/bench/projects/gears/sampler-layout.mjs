// Where everything on the gear sampler goes, for the plate (objects/sampler.js) and its mounted assembly
// (assemblies/sampler-mounted.json, written from this by make-sampler.mjs), so the pins and the gears on them can't
// disagree. g is @rulecad/gears; v the plate's variables.
export function layout (v, g) {
  const z = v.teeth, cols = 3, modules = [v.module_a, v.module_b, v.module_c, v.module_d], backlashes = [v.backlash_a, v.backlash_b, v.backlash_c]
  const out = { pins: [], labels: [], rails: [], lip: null, rack: null, ring: null }
  const rowTop = v.label + v.margin, m = 1, pinion = g.gearModel({ module: m, teeth: z })
  // Front row, left: a rack loose on the plate, sliding along a rail behind it, its pinion on a pin
  const rack = g.rackModel({ module: m, teeth: v.rack_teeth, height: v.rack_bar, backlash: v.check_backlash })
  const x0 = v.margin + v.rack_travel, back = rowTop + v.rail_width + v.clear // the rack at rest, its back a clearance off the rail
  const pitchLine = back + v.rack_bar - rack.rootLine
  out.rails.push({ x: v.margin, y: rowTop, length: rack.length + 2 * v.rack_travel })
  out.rack = { x: x0, y: pitchLine, length: rack.length, travel: v.rack_travel }
  out.pins.push({ id: 'rack-pinion', x: x0 + rack.length / 2, y: pitchLine + g.mesh(pinion, rack).centre, module: m, backlash: v.check_backlash, dots: 2 })
  out.labels.push({ text: `RACK M${m} B${v.check_backlash}`, x: v.margin + rack.length / 2 + v.rack_travel, y: v.label })
  // Front row, right: a ring loose inside a lip, its pinion on a pin
  const ring = g.internalModel({ module: m, teeth: v.ring_teeth, backlash: v.check_backlash }), lipIn = ring.rim / 2 + v.clear, lipOut = lipIn + v.lip
  const ringX = v.column * (cols - 1) + v.column / 2, ringY = rowTop + lipOut
  out.lip = { x: ringX, y: ringY, inner: lipIn, outer: lipOut }
  out.ring = { x: ringX, y: ringY }
  out.pins.push({ id: 'ring-pinion', x: ringX + g.mesh(pinion, ring).centre, y: ringY, module: m, backlash: v.check_backlash, dots: 2 })
  out.labels.push({ text: `RING M${m} B${v.check_backlash}`, x: ringX, y: v.label })
  let y = rowTop + Math.max(2 * lipOut, pitchLine - rowTop + g.mesh(pinion, rack).centre + pinion.tip / 2) + v.margin
  // A row a module: a pair at each backlash, the pins the pair's centre distance apart
  for (const mod of modules) {
    const tip = mod * (z + 2), centre = mod * z, at = y + v.label + v.margin + tip / 2
    backlashes.forEach((b, k) => {
      const xa = v.column * k + (v.column - centre) / 2, id = `m${mod}-b${b}`.replace(/\./g, '_')
      out.pins.push({ id: `${id}-a`, x: xa, y: at, module: mod, backlash: b, dots: k + 1 }, { id: `${id}-b`, x: xa + centre, y: at, module: mod, backlash: b, dots: k + 1, meshes: `${id}-a` })
      out.labels.push({ text: `M${mod} B${b}`, x: v.column * k + v.column / 2, y: y + v.label })
    })
    y += v.label + v.margin + tip + v.margin
  }
  out.size = [v.column * cols, y]
  return out
}
