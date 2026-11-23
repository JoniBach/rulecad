// The print-in-place shoulder's sun, alone at the origin for the assembly: as shoulder-pip prints it, from its numbers.
import { pipParts } from './shoulder-pip-parts.js'

export function main (v) { return pipParts({ ...v.pip, ops: v.ops, gears: v.gears, motors: v.motors, fixings: v.fixings }).sun() }
