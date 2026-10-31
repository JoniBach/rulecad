// The pinch pin: the library's snap pin with a wide foot. Pushed through a cartridge's floor into the frame's
// socket, the barb clicks out in the cavity beyond and the foot pinches the floor to the frame.
export function main (v) {
  return v.flexures.snapPin({ diameter: v.diameter, length: v.length, lip: v.lip, slot: v.slot, gap: v.gap, head: v.head })
}
