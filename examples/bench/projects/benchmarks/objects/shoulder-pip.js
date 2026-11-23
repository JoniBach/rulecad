// The bench shoulder printed in place: the compound planetary in one print, nothing to put together but the motor.
// The parts are drawn in shoulder-pip-parts.js, which the assembly's objects share.
import { pipParts } from './shoulder-pip-parts.js'

export function main (v) { return pipParts({ ...v.pip, ops: v.ops, gears: v.gears, motors: v.motors, fixings: v.fixings }).printed() }
