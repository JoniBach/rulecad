// v.fixings: @rulecad/fixings as a design gets it, bound to its project. Every function is fixingsFor's, so it reads
// the workspace's own thread sets before the kit's, the project's printer, and the design's booleans (v.ops); where a
// call names no material, the project's is taken for what a thread is in or a head sits on (a hole, engagement,
// stripping, seating: never a screw's own steel). What each call found is kept, so cad check says what every hole
// and seat was drawn to. No files are read here: the sandbox's runner uses it as the build does.
import { fixingsFor } from '@rulecad/fixings';

// The functions whose material is the part's (the plastic a pilot is formed in, what a thread or a head bears on)
const IN_PART = ['hole', 'holeModel', 'engagement', 'stripping', 'seating'];
const isOptions = (o) => o && typeof o === 'object' && !Array.isArray(o);

/**
 * @rulecad/fixings bound to a design's project, with what its calls found.
 * @param {{ sets?: object, printer?: object, material?: string | null, ops?: object }} context sets: the workspace's rule
 *   sets by name (threads, materials); printer: the printer's rule set ({ name, rules }); material: the project's; ops: v.ops
 * @returns {{ fixings: Record<string, Function>, found: () => object[], used: () => boolean }} fixings: v.fixings;
 *   found: the findings of every model made, each said once (values.count where it came up again); used: whether the design called any of it
 */
export function designFixings({ sets, printer, material, ops } = {}) {
  const bound = fixingsFor({ ...(sets && Object.keys(sets).length ? { sets } : {}), ...(printer ? { printer } : {}), ...(ops ? { ops } : {}) });
  const found = new Map(); let calls = 0;
  const keep = (r) => {
    const list = Array.isArray(r) ? r : (r?.model ?? r)?.findings;
    if (Array.isArray(list)) for (const x of list) {
      if (!x || typeof x.text !== 'string' || typeof x.level !== 'string') continue;
      const k = `${x.level}|${x.code}|${x.text}`, had = found.get(k);
      if (had) had.values = { ...had.values, count: (had.values?.count ?? 1) + 1 }; else found.set(k, { ...x });
    }
    return r;
  };
  const fixings = {};
  for (const [k, f] of Object.entries(bound)) {
    if (typeof f !== 'function') { fixings[k] = f; continue; }
    const lead = k === 'lengthFor' ? 2 : 1; // (lengthFor takes the stack first: its options come third)
    fixings[k] = (...a) => {
      calls++;
      if (material && IN_PART.includes(k) && (a[lead] === undefined || isOptions(a[lead])) && a[lead]?.material == null) a[lead] = { material, ...a[lead] };
      return keep(f(...a));
    };
  }
  return { fixings, found: () => [...found.values()], used: () => calls > 0 };
}
