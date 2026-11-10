// Drivers and the power budget. A stepper's current is set on its driver: the driver's limits and the trimmer's voltage
// follow from it, and the supply's size follows from the whole machine. Figures come from the rule sets; findings are in
// the kit's shape: { level, text, code, values }.
import a4988 from '@rulecad/rules/a4988.json' with { type: 'json' };
import drv8825 from '@rulecad/rules/drv8825.json' with { type: 'json' };
import tmc2209 from '@rulecad/rules/tmc2209.json' with { type: 'json' };

const SETS = { a4988, drv8825, tmc2209 };
const n3 = (x, d = 3) => String(Number(x.toFixed(d)));
/** How much of a supply's power reaches the coils: a chopper driver, about. */
export const DRIVER_EFFICIENCY = 0.85;

/**
 * A driver module from its rule set.
 * @param {string} name a4988, drv8825 or tmc2209
 * @param {{ variant?: string }} [o] a board's variant (an older sense resistor, say)
 * @returns {{ name: string, voltage: number[], logic: number[], bare: number, cooled: number, sense: number, gain: number, formula: string, maxMicrosteps: number, figures: object }}
 */
export function driver(name, { variant } = {}) {
  const set = SETS[String(name).toLowerCase()];
  if (!set) throw new Error(`driver: no driver "${name}" (${Object.keys(SETS).join(', ')})`);
  if (variant != null && !set.variants?.[variant]) throw new Error(`driver: ${set.name} has no variant "${variant}" (${Object.keys(set.variants || {}).join(', ') || 'none'})`);
  const over = variant ? set.variants[variant].values : {}, v = (k) => over[k] ?? set.rules[k]?.value;
  return { name: set.name, variant: variant ?? null, voltage: [v('motor_voltage_min'), v('motor_voltage_max')], logic: [v('logic_voltage_min'), v('logic_voltage_max')], bare: v('current_bare'), cooled: v('current_cooled'), sense: v('sense_resistor'), gain: v('vref_gain'), formula: v('vref_formula'), maxMicrosteps: v('max_microsteps'), figures: set.rules, uart: set.rules.uart_note != null };
}

/**
 * The trimmer voltage for a coil current, and whether the module is fit for it.
 * @param {ReturnType<typeof driver>} d @param {number} current A per coil @param {{ cooled?: boolean, supply?: number, microsteps?: number }} [o]
 * @returns {{ vref: number, findings: object[] }}
 */
export function setting(d, current, { cooled = false, supply, microsteps } = {}) {
  if (!(current > 0)) throw new Error(`setting: current is above 0 A (got ${current})`);
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) }), limit = cooled ? d.cooled : d.bare, vref = current / d.gain;
  if (current > d.cooled) f('fail', `${d.name} carries ${d.cooled} A per coil at most, with cooling, and this asks ${n3(current, 2)} A`, 'motor.driver', { current, limit: d.cooled });
  else if (current > limit) f('warn', `${d.name} carries about ${d.bare} A with no heat sink, and this asks ${n3(current, 2)} A: fit a heat sink and moving air (up to ${d.cooled} A)`, 'motor.driver', { current, limit });
  if (supply != null && (supply < d.voltage[0] || supply > d.voltage[1])) f('fail', `${d.name} takes ${d.voltage[0]} to ${d.voltage[1]} V, and the supply is ${supply} V`, 'motor.driver', { supply, range: d.voltage });
  if (microsteps != null && microsteps > d.maxMicrosteps) f('fail', `${d.name} goes down to 1/${d.maxMicrosteps} of a step, and this asks 1/${microsteps}`, 'motor.driver', { microsteps });
  return { vref, findings: out };
}

/**
 * The power a machine draws, against a supply. Each part is what it draws at its worst, with the duty it runs at; a
 * stepper's is its copper loss, both coils at the set current, since a chopper draws power and not phase current.
 * @param {{ name: string, watts?: number, current?: number, resistance?: number, voltage?: number, duty?: number }[]} parts
 *   current and resistance: a stepper's coil; current and voltage: anything else
 * @param {{ voltage: number, current?: number, margin?: number, duty?: number }} supply current: the supply's rating, to check against
 * @returns {{ watts: number, amps: number, needed: number, parts: object[], findings: object[] }}
 */
export function powerBudget(parts, { voltage, current, margin = 1.25, duty = 1 } = {}) {
  if (!(voltage > 0)) throw new Error(`powerBudget: give the supply's voltage (got ${voltage})`);
  if (!Array.isArray(parts) || !parts.length) throw new Error('powerBudget: give the parts that draw power');
  const rows = parts.map((p) => {
    const d = p.duty ?? duty, full = p.watts ?? (p.resistance != null ? (2 * p.current * p.current * p.resistance) / DRIVER_EFFICIENCY : p.current * (p.voltage ?? voltage));
    if (!(full >= 0) || !Number.isFinite(full)) throw new Error(`powerBudget: ${p.name}: give watts, or a current with a resistance or a voltage`);
    return { name: p.name, watts: full, duty: d, average: full * d };
  });
  const watts = rows.reduce((t, p) => t + p.watts, 0), amps = watts / voltage, needed = amps * margin, findings = [];
  if (current != null) {
    const v = { amps, needed, rating: current, watts };
    if (current < amps) findings.push({ level: 'fail', text: `the machine draws ${n3(amps, 2)} A at ${voltage} V (${n3(watts, 1)} W), and the supply gives ${current} A`, code: 'power.supply', values: v });
    else if (current < needed) findings.push({ level: 'fail', text: `the machine draws ${n3(amps, 2)} A at ${voltage} V (${n3(watts, 1)} W): with ${margin} times in hand it wants ${n3(needed, 2)} A, and the supply gives ${current} A`, code: 'power.supply', values: v });
    else findings.push({ level: 'pass', text: `the machine draws ${n3(amps, 2)} A at ${voltage} V (${n3(watts, 1)} W), and the supply gives ${current} A, ${n3(current / amps, 1)} times over`, code: 'power.supply', values: v });
  }
  return { watts, amps, needed, parts: rows, findings };
}
