export function main (v) {
  return v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, backlash: v.backlash })
}
