// Drivers and supplies in an assembly: each stepper's driver is named by the bought item it plugs into, the current it is
// set to is checked and the trimmer's voltage said, and the supply is held against the whole machine's draw.
import { driver as driverModel, setting, powerBudget } from '@rulecad/motors';

const n3 = (x, d = 2) => String(Number(x.toFixed(d)));

function itemById(s, id) { return s.objects.find((o) => o.id === id); }

export function powerChecks(s, f) {
  const drives = s.motion?.drives ?? [], supplies = s.objects.filter((o) => o.bought?.part === 'supply');
  const psu = supplies[0]?.built.values, voltage = psu?.output_voltage, draws = [];
  for (const d of drives) {
    const m = d.model, refs = { item: d.id, ...(d.joint ? { joint: d.joint } : {}) };
    if (m.type === 'stepper') {
      const rated = m.figures.rated_current?.value, current = d.spec.current ?? rated, R = m.figures.resistance?.value;
      draws.push({ name: d.id, current, resistance: R, ...(d.spec.duty != null ? { duty: d.spec.duty } : {}) });
      if (!d.spec.driver) { if (s.task) f('warn', `${d.id} has no "driver": nothing checks the current it's set to (name a bought driver item)`, `${d.id}: no driver`, { code: 'motor.driver', refs }); continue; }
      const o = itemById(s, d.spec.driver);
      if (!o || o.bought?.part !== 'driver') { f('fail', `${d.id}: driver "${d.spec.driver}" isn't a bought driver item`, `${d.id}: no such driver`, { code: 'motor.driver', refs }); continue; }
      const model = driverModel(o.bought.set, { variant: o.bought.variant ?? undefined }), { vref, findings } = setting(model, current, { cooled: !!d.spec.cooled, supply: voltage, microsteps: d.spec.microsteps });
      for (const x of findings) f(x.level, `${d.id}: ${x.text}`, `${d.id}: driver`, { code: x.code, values: x.values, refs });
      if (!findings.some((x) => x.level === 'fail')) f('pass', `${d.id} on ${model.name}: set the trimmer to ${n3(vref, 3)} V for ${n3(current, 2)} A per coil (${model.formula}${model.uart ? `, or set it over UART` : ''}), ${model.sense} ohm sense resistors: read yours before trusting this`, null, { code: 'motor.driver', refs, values: { vref, current, sense: model.sense } });
    } else if (m.type === 'servo') {
      draws.push({ name: d.id, current: 0.7, voltage: m.figures.rated_voltage?.value ?? 5, duty: d.spec.duty ?? 0.2 });
    }
  }
  if (!draws.length || !supplies.length) { if (draws.length && s.task) f('warn', 'there is no "supply" among the bought items: nothing checks the power', 'no supply', { code: 'power.supply' }); return; }
  const o = supplies[0], I = psu.output_current, extra = s.objects.filter((x) => x.bought?.part === 'board').map((x) => ({ name: x.id, current: 0.1, voltage: 5, duty: 1 }));
  const r = powerBudget([...draws, ...extra], { voltage, current: I, margin: s.a.power?.margin ?? 1.25 });
  for (const x of r.findings) f(x.level, `${o.id} (${o.bought.variant ?? o.bought.set}): ${x.text}`, x.level === 'pass' ? null : `${o.id}: too small`, { code: x.code, values: x.values, refs: { item: o.id } });
}
