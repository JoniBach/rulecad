// The pawl: a leaf from a root block, its square tip on the ratchet's teeth.
export function main (v) {
  return v.flexures.ratchetPawl({ length: v.length, thickness: v.thick, width: v.width })
}
