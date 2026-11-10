// A compliant gripper's grip: a servo through its horn closes two fingers on leaf flexures. What the servo gives, less what
// bending the leaves takes, is the grip; the payload is held by friction against gravity and the arm's acceleration.
//   "grip": { "servo": "gripper_servo", "horn": 12, "leaf": { "length": 30, "thickness": 1.2, "width": 8 }, "travel": 6, "friction": 0.4 }
import { leafModel } from '@rulecad/flexures';
import { peekRuleSet } from './rules.mjs';
import { materialOf } from './list.mjs';

const G = 9.80665, n3 = (x, d = 2) => String(Number(x.toFixed(d)));

export function gripChecks(s, f) {
  const g = s.a.task?.grip; if (!g) return;
  const code = 'tool.grip', d = s.motion.drives.find((x) => x.id === g.servo), payload = s.task.payload ?? 0;
  if (!d) throw new Error(`task.grip: servo "${g.servo}" isn't a motor item (${s.motion.drives.map((x) => x.id).join(', ') || 'none'})`);
  if (d.model.type !== 'servo') throw new Error(`task.grip: ${g.servo} is a ${d.model.type}: the grip is worked out for a servo through its horn`);
  const name = String(g.material ?? materialOf(s.project).name).toLowerCase(), rules = peekRuleSet(name).rules, E = rules.modulus.value, strength = rules.strength.value;
  const horn = s.num(g.horn), travel = s.num(g.travel), lever = g.lever != null ? s.num(g.lever) : 1, mu = s.num(g.friction ?? 0.4), L = { length: s.num(g.leaf.length), thickness: s.num(g.leaf.thickness), width: s.num(g.leaf.width) }, m = leafModel(L, { E });
  const torque = d.model.figures.stall_torque.value * (g.torque_share != null ? s.num(g.torque_share) : 0.6), pull = ((torque * 1000) / horn / 2) * lever, spring = m.stiffness * travel, grip = pull - spring, accel = (s.task.accel ?? 0) / 1000, need = payload * (G + accel);
  const held = 2 * mu * grip, margin = need > 0 ? held / need : Infinity, want = g.margin != null ? s.num(g.margin) : 2, stress = m.stress(travel), strain = stress / strength, values = { grip, pull, spring, held, need, margin, stress };
  if (grip <= 0) f('fail', `the grip: the servo pulls each finger with ${n3(pull)} N and the leaves take ${n3(spring)} N to close: it can't close them. A longer or thinner leaf`, 'grip: too stiff', { code, values });
  else if (margin < 1) f('fail', `the grip: ${n3(grip)} N a finger holds ${n3(held)} N at μ ${mu}, and the payload needs ${n3(need)} N: it drops`, 'grip: drops', { code, values });
  else f(margin < want ? 'warn' : 'pass', `the grip: ${n3(grip)} N a finger (${n3(pull)} N from the servo at ${n3(torque, 3)} N m, less ${n3(spring)} N to bend the leaves) holds ${n3(held)} N at μ ${mu}, against ${n3(need)} N for ${n3(payload * 1000, 0)} g: ${n3(margin, 1)} times over`, margin < want ? `grip: ${n3(margin, 1)}×` : null, { code, values });
  f(strain > 1 ? 'fail' : strain > 0.6 ? 'warn' : 'pass', `the fingers at full close: ${n3(stress, 1)} MPa in a ${name.toUpperCase()} leaf, ${n3(strain * 100, 0)}% of its ${strength} MPa`, strain > 0.6 ? `finger ${n3(strain * 100, 0)}% strength` : null, { code: 'tool.strain', values: { stress, strength } });
}
