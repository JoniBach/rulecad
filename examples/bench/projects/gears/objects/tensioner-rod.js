import jscad from '@jscad/modeling'

export function main (v) {
  return jscad.primitives.cylinder({ radius: v.diameter / 2, height: v.length, center: [0, 0, v.length / 2] })
}
