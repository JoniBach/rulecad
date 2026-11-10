// Serial chains as plain data, and what they do: forward kinematics, the Jacobian, inverse kinematics.
//
// A chain places each link the way a rulecad assembly places a jointed item:
//   link i = link i-1 · a · J(q) · inverse(b)
// where a is the joint's anchor on the parent link (z along the axis), b the same anchor on the child, and J turns or
// slides along the anchor's z. Joint values are degrees and millimetres at the surface; radians stay inside.

const D = Math.PI / 180;
const I3 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const num = Number.isFinite;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = norm(a); return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * A refusal: an Error whose code says which rule the input broke.
 * @param {string} code @param {string} text @returns {Error & { code: string }}
 */
export function refuse(code, text) { return Object.assign(new Error(text), { code }); }

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {number[]} Rigid a rigid transform: 12 numbers, three rows of four */
/**
 * @typedef {{ name: string, type: 'revolute' | 'prismatic', origin: Vec3, axis: Vec3, limits: [number, number] | null, a: Rigid, b: Rigid, ratio?: number, follow?: { joint: string, ratio: number, offset: number } }} Joint
 * limits in degrees (revolute) or mm (prismatic); a and b the anchors on the parent and the child; ratio the drive's motor turns per joint turn (kinematics ignore it); follow makes it a slave of another joint
 */
/** @typedef {{ joints: Joint[], tool: Vec3, base: Rigid, dof: number, names: string[] }} Chain a validated chain: plain data, JSON-able */
/**
 * A finding, as across rulecad: level and words, for programs a code and the numbers, and where it is.
 * @typedef {{ level: 'pass' | 'warn' | 'fail' | 'info', text: string, code?: string, values?: Record<string, any>, at?: number[], box?: { lo: number[], hi: number[] }, between?: number[][], refs?: Record<string, any> }} Finding
 */

function mul(m, n) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) o[r * 4 + c] = m[r * 4] * n[c] + m[r * 4 + 1] * n[4 + c] + m[r * 4 + 2] * n[8 + c] + (c === 3 ? m[r * 4 + 3] : 0);
  return o;
}
function inv(m) {
  const t = [m[3], m[7], m[11]], o = [];
  for (let r = 0; r < 3; r++) { const row = [m[r], m[4 + r], m[8 + r]]; o.push(...row, -(row[0] * t[0] + row[1] * t[1] + row[2] * t[2])); }
  return o;
}
const apply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
const rz = (a) => { const c = Math.cos(a * D), s = Math.sin(a * D); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const tz = (d) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, d];
const jointMatrix = (j, v) => (j.type === 'revolute' ? rz(v) : tz(v));

// A frame from a point, its z axis and where its x points, by the same rule as an assembly's anchors
function frame(at, axis, ref) {
  const z = unit(axis), r = ref || (Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const x = unit(r.map((v, k) => v - dot(r, z) * z[k])), y = cross(z, x);
  return [x[0], y[0], z[0], at[0], x[1], y[1], z[1], at[1], x[2], y[2], z[2], at[2]];
}

const validated = new WeakSet(), META = new WeakMap();
const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(num);
const rigid = (m) => {
  if (!Array.isArray(m) || m.length !== 12 || !m.every(num)) return false;
  const c = (k) => [m[k], m[4 + k], m[8 + k]];
  return [0, 1, 2].every((k) => Math.abs(norm(c(k)) - 1) < 1e-6) && Math.abs(dot(c(0), c(1))) < 1e-6 && Math.abs(dot(c(0), c(2))) < 1e-6 && Math.abs(dot(c(1), c(2))) < 1e-6;
};

function fromLinks(links) {
  if (!Array.isArray(links) || !links.length) throw refuse('chain.empty', 'chain: no links: give links: [150, 120] or joints: [{ name, type, origin, axis, limits }, ...]');
  let along = 0;
  const joints = links.map((l, i) => {
    const s = typeof l === 'number' ? { length: l } : l || {};
    if (!num(s.length) || s.length < 0) throw refuse('chain.link', `chain: link ${i + 1} needs a length in mm of 0 or more (got ${JSON.stringify(s.length ?? l)})`);
    const j = { name: s.name ?? `joint${i + 1}`, type: s.type ?? 'revolute', origin: [along, 0, 0], axis: s.axis ?? [0, 0, 1], limits: s.limits, ...(s.ratio != null ? { ratio: s.ratio } : {}) };
    along = s.length;
    return j;
  });
  return { joints, tool: [along, 0, 0] };
}

function resolveFollows(joints) {
  const byName = new Map(joints.map((j, i) => [j.name, i]));
  const rootOf = (i, seen = []) => {
    const j = joints[i];
    if (!j.follow) return [i, 1, 0];
    if (seen.includes(i)) throw refuse('chain.follow', `chain: joints follow each other round: ${[...seen, i].map((k) => joints[k].name).join(', ')}`);
    const lead = byName.get(j.follow.joint);
    if (lead === undefined) throw refuse('chain.follow', `chain: joint "${j.name}" follows "${j.follow.joint}", which is not a joint of this chain (joints: ${joints.map((x) => x.name).join(', ')})`);
    const [root, r, o] = rootOf(lead, [...seen, i]);
    return [root, r * j.follow.ratio, o * j.follow.ratio + j.follow.offset];
  };
  return joints.map((_, i) => rootOf(i));
}

/**
 * A validated chain from links ([150, 120]: revolute about z, each link along x) or joints in the parent link's frame,
 * in order from the base, with a tool point in the last link's frame. Refuses bad input by name. Calling it on a chain
 * (or on a chain that has been through JSON) is safe.
 * @param {{ joints?: object[], links?: (number | object)[], tool?: Vec3, base?: Vec3 | Rigid }} spec
 * @returns {Chain}
 */
export function chain(spec) {
  if (spec && typeof spec === 'object' && validated.has(spec)) return /** @type {Chain} */ (spec);
  if (!spec || typeof spec !== 'object') throw refuse('chain.input', `chain: give { joints: [...], tool } or { links: [...] } (got ${JSON.stringify(spec)})`);
  if (spec.links && spec.joints) throw refuse('chain.input', 'chain: give links or joints, not both');
  const made = spec.links ? fromLinks(spec.links) : { joints: spec.joints, tool: undefined };
  const list = made.joints;
  if (!Array.isArray(list) || !list.length) throw refuse('chain.empty', 'chain: no joints: give joints: [{ name, type, origin, axis, limits }, ...] or links: [...]');
  const tool = spec.tool ?? made.tool ?? [0, 0, 0];
  if (!vec3(tool)) throw refuse('chain.tool', `chain: tool is a point [x, y, z] in the last link's frame (got ${JSON.stringify(tool)})`);
  let base = I3;
  if (spec.base != null) {
    if (vec3(spec.base)) base = [1, 0, 0, spec.base[0], 0, 1, 0, spec.base[1], 0, 0, 1, spec.base[2]];
    else if (rigid(spec.base)) base = [...spec.base];
    else throw refuse('chain.base', `chain: base is a point [x, y, z] or a rigid transform of 12 numbers (got ${JSON.stringify(spec.base)})`);
  }
  const seen = new Set();
  const joints = list.map((j, i) => {
    if (!j || typeof j !== 'object') throw refuse('chain.joint', `chain: joint ${i + 1} is not an object (got ${JSON.stringify(j)})`);
    const who = `joint ${i + 1}${j.name ? ` "${j.name}"` : ''}`;
    if (typeof j.name !== 'string' || !j.name) throw refuse('chain.name', `chain: ${who} needs a name`);
    if (seen.has(j.name)) throw refuse('chain.name', `chain: two joints are named "${j.name}"`);
    seen.add(j.name);
    if (j.type !== 'revolute' && j.type !== 'prismatic') throw refuse('chain.type', `chain: ${who}: type is revolute or prismatic (got ${JSON.stringify(j.type)})`);
    let a = j.a, b = j.b;
    if (a != null || b != null) {
      if (!rigid(a)) throw refuse('chain.anchor', `chain: ${who}: a is a rigid transform of 12 numbers, three rows of four (got ${JSON.stringify(a)})`);
      if (!rigid(b)) throw refuse('chain.anchor', `chain: ${who}: b is a rigid transform of 12 numbers, three rows of four (got ${JSON.stringify(b)})`);
    } else {
      if (!vec3(j.origin)) throw refuse('chain.origin', `chain: ${who}: origin is a point [x, y, z] in the parent link's frame (got ${JSON.stringify(j.origin)})`);
      if (!vec3(j.axis)) throw refuse('chain.axis', `chain: ${who}: axis is a direction [x, y, z] (got ${JSON.stringify(j.axis)})`);
      if (!(norm(j.axis) > 1e-12)) throw refuse('chain.axis', `chain: ${who}: axis has no length`);
      for (const [n, v] of [['ref', j.ref], ['child.at', j.child?.at], ['child.axis', j.child?.axis], ['child.ref', j.child?.ref]]) if (v != null && !vec3(v)) throw refuse('chain.anchor', `chain: ${who}: ${n} is [x, y, z] (got ${JSON.stringify(v)})`);
      if (j.child?.axis && !(norm(j.child.axis) > 1e-12)) throw refuse('chain.axis', `chain: ${who}: child.axis has no length`);
      a = frame(j.origin, j.axis, j.ref);
      b = frame(j.child?.at ?? [0, 0, 0], j.child?.axis ?? j.axis, j.child?.ref ?? j.ref);
    }
    let limits = j.limits;
    if (limits === undefined || limits === null) {
      if (j.type === 'revolute') limits = [-180, 180];
      else if (j.follow) limits = null;
      else throw refuse('chain.limits', `chain: ${who}: a prismatic joint needs limits: [lo, hi] in mm`);
    }
    if (limits) {
      if (!Array.isArray(limits) || limits.length !== 2 || !limits.every(num)) throw refuse('chain.limits', `chain: ${who}: limits are [lo, hi] (got ${JSON.stringify(limits)})`);
      if (limits[0] > limits[1]) throw refuse('chain.limits', `chain: ${who}: limits [${limits}] are the wrong way round (lo is above hi)`);
    }
    if (j.ratio != null && (!num(j.ratio) || j.ratio === 0)) throw refuse('chain.ratio', `chain: ${who}: ratio is the drive's motor turns per joint turn, not zero (got ${JSON.stringify(j.ratio)})`);
    let follow;
    if (j.follow != null) {
      const f = typeof j.follow === 'string' ? { joint: j.follow } : j.follow;
      if (typeof f.joint !== 'string' || !(f.ratio == null || num(f.ratio)) || !(f.offset == null || num(f.offset))) throw refuse('chain.follow', `chain: ${who}: follow is { joint, ratio?, offset? } (got ${JSON.stringify(j.follow)})`);
      follow = { joint: f.joint, ratio: f.ratio ?? 1, offset: f.offset ?? 0 };
    }
    const axis = j.axis && !(j.a != null) ? unit(j.axis) : /** @type {Vec3} */ ([a[2], a[6], a[10]]);
    return { name: j.name, type: j.type, origin: /** @type {Vec3} */ ([a[3], a[7], a[11]]), axis, limits, a: [...a], b: [...b], ...(j.ratio != null ? { ratio: j.ratio } : {}), ...(follow ? { follow } : {}) };
  });
  const rules = resolveFollows(joints);
  const free = joints.map((_, i) => i).filter((i) => !joints[i].follow);
  if (!free.length) throw refuse('chain.follow', 'chain: every joint follows another: at least one must be driven');
  const c = /** @type {Chain} */ ({ joints, tool: [...tool], base, dof: free.length, names: free.map((i) => joints[i].name) });
  META.set(c, { free, rule: rules.map(([root, r, o]) => [free.indexOf(root), r, o]), scale: free.map((i) => (joints[i].type === 'revolute' ? D : 1)) });
  validated.add(c);
  return c;
}

/**
 * Two revolute joints about z, in the XY plane: the plain two-link arm.
 * @param {number} l1 first link, mm @param {number} l2 second link, mm
 * @param {{ names?: [string, string], limits?: [[number, number], [number, number]], base?: Vec3 | Rigid, z?: number, ratios?: [number, number] }} [opts]
 * @returns {Chain}
 */
export function planar2R(l1, l2, opts = {}) {
  for (const [n, v] of [['l1', l1], ['l2', l2]]) if (!num(v) || !(v > 0)) throw refuse('chain.link', `planar2R: ${n} is a link length in mm, above 0 (got ${JSON.stringify(v)})`);
  const names = opts.names ?? ['shoulder', 'elbow'], lim = opts.limits ?? [[-180, 180], [-180, 180]], z = opts.z ?? 0;
  if (!Array.isArray(lim) || lim.length !== 2) throw refuse('chain.limits', `planar2R: limits is [[lo, hi], [lo, hi]] (got ${JSON.stringify(lim)})`);
  return chain({ joints: [
    { name: names[0], type: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], limits: lim[0], ...(opts.ratios ? { ratio: opts.ratios[0] } : {}) },
    { name: names[1], type: 'revolute', origin: [l1, 0, 0], axis: [0, 0, 1], limits: lim[1], ...(opts.ratios ? { ratio: opts.ratios[1] } : {}) }
  ], tool: [l2, 0, z], ...(opts.base != null ? { base: opts.base } : {}) });
}

/**
 * The serial chain from the root to a named item, from an assembly's motion ({ items, joints } as cad builds it and
 * model-link carries it), without describing the joints again. Fixed joints fold into their neighbours; anything else
 * that is not revolute or prismatic is refused by name. A gearbox's output whose motor is off the chain is a joint of its own.
 * @param {{ items: any[][], joints: any[] }} motion
 * @param {{ tip: string | number, tool?: Vec3 }} opts tip: the item at the end (id or index); tool: a point in its frame
 * @returns {Chain}
 */
export function chainFromMotion(motion, opts) {
  if (!motion || !Array.isArray(motion.items) || !Array.isArray(motion.joints)) throw refuse('chain.motion', 'chainFromMotion: give an assembly\'s motion, { items, joints }');
  const tipName = opts?.tip;
  const tip = typeof tipName === 'number' ? tipName : motion.items.findIndex((it) => it[0] === tipName);
  if (!(tip >= 0) || tip >= motion.items.length) throw refuse('chain.motion', `chainFromMotion: no item "${tipName}" (items: ${motion.items.map((it) => it[0]).join(', ')})`);
  const by = new Map(motion.joints.map((j) => [j.child, j])), path = [];
  for (let i = tip, n = 0; by.has(i); i = by.get(i).parent, n++) {
    if (n > motion.joints.length) throw refuse('chain.motion', 'chainFromMotion: the joints go round in a loop');
    path.unshift(by.get(i));
  }
  if (!path.length) throw refuse('chain.empty', `chainFromMotion: item "${motion.items[tip][0]}" has no joint: no joints to make a chain from`);
  const root = path[0].parent, base = root < 0 ? I3 : motion.items[root].slice(1, 13);
  if (root >= 0 && base.length !== 12) throw refuse('chain.motion', `chainFromMotion: item "${motion.items[root][0]}" has no place of its own`);
  const joints = []; let carried = I3;
  for (const j of path) {
    if (j.type === 'fixed') { carried = mul(carried, mul(j.a, inv(j.b))); continue; }
    if (j.type !== 'revolute' && j.type !== 'prismatic') throw refuse('chain.type', `chainFromMotion: joint ${j.id} is a ${j.type}: a chain takes revolute, prismatic and fixed joints`);
    const out = { name: j.id, type: j.type, a: mul(carried, j.a), b: j.b, limits: j.limits ?? [j.dofs[0][0], j.dofs[0][1]] };
    // A follower whose leader is on the chain moves with it. A gearbox's output follows a motor's shaft that is off the
    // chain: to the chain that is a joint of its own (the ratio is the drive's business, read through trainFrom)
    if (j.follow && path.some((p) => p.id === j.follow[0])) out.follow = { joint: j.follow[0], ratio: j.follow[1] ?? 1, offset: j.follow[2] ?? 0 };
    joints.push(out); carried = I3;
  }
  if (!joints.length) throw refuse('chain.empty', `chainFromMotion: every joint up to "${motion.items[tip][0]}" is fixed: no joints to make a chain from`);
  const t = opts.tool ?? [0, 0, 0];
  if (!vec3(t)) throw refuse('chain.tool', `chainFromMotion: tool is a point [x, y, z] in the tip's frame (got ${JSON.stringify(t)})`);
  return chain({ joints, tool: apply(carried, t), base });
}

/**
 * What is wrong with a chain, without throwing: findings, a fail for a refusal, a warn for a zero-length step.
 * @param {object} spec @returns {Finding[]}
 */
export function checkChain(spec) {
  let c;
  try { c = chain(/** @type {any} */ (spec)); } catch (e) { return [{ level: 'fail', text: e.message, code: e.code || 'chain.input' }]; }
  const out = [];
  c.joints.forEach((j, i) => { if (j.limits && j.limits[0] === j.limits[1]) out.push({ level: 'warn', text: `joint "${j.name}" cannot move: its limits are equal`, code: 'chain.locked', refs: { joint: j.name }, at: fk(c, zeros(c)).frames[i].at }); });
  if (!out.length) out.push({ level: 'pass', text: `${c.joints.length} joint${c.joints.length === 1 ? '' : 's'}, ${c.dof} driven`, code: 'chain.ok' });
  return out;
}

export const zeros = (c) => new Array(c.dof).fill(0);
const expand = (c, q) => META.get(c).rule.map(([k, r, o]) => q[k] * r + o);

function values(c, q, who) {
  let v;
  if (Array.isArray(q)) {
    if (q.length !== c.dof) throw refuse(`${who}.q`, `${who}: q has ${q.length} value${q.length === 1 ? '' : 's'}, and this chain has ${c.dof} driven joint${c.dof === 1 ? '' : 's'} (${c.names.join(', ')})`);
    v = q;
  } else if (q && typeof q === 'object') {
    v = c.names.map((n) => {
      if (q[n] === undefined) throw refuse(`${who}.q`, `${who}: q has no value for joint "${n}"`);
      return Array.isArray(q[n]) ? q[n][0] : q[n];
    });
  } else throw refuse(`${who}.q`, `${who}: q is a list of ${c.dof} joint values or { name: value } (got ${JSON.stringify(q)})`);
  v.forEach((x, i) => { if (!num(x)) throw refuse(`${who}.q`, `${who}: the value for joint "${c.names[i]}" is not a number (got ${JSON.stringify(x)})`); });
  return v;
}

// Each link's transform, and each joint's anchor in the world
function pose(c, full) {
  let T = c.base;
  const out = [];
  for (let i = 0; i < c.joints.length; i++) {
    const j = c.joints[i], A = mul(T, j.a);
    T = mul(mul(A, jointMatrix(j, full[i])), inv(j.b));
    out.push({ A, T });
  }
  return { links: out, T, tip: apply(T, c.tool) };
}

/**
 * Where the tool is at these joint values, and every link's transform. Limits are not enforced here.
 * @param {Chain | object} c @param {number[] | Record<string, number | number[]>} q degrees or mm, one per driven joint, or by name
 * @returns {{ position: Vec3, rotation: number[][], frames: { name: string, matrix: Rigid, at: Vec3, axis: Vec3 }[] }}
 */
export function fk(c, q) {
  c = chain(/** @type {any} */ (c));
  const p = pose(c, expand(c, values(c, q, 'fk'))), T = p.T;
  return { position: /** @type {Vec3} */ (p.tip), rotation: [[T[0], T[1], T[2]], [T[4], T[5], T[6]], [T[8], T[9], T[10]]],
    frames: p.links.map(({ A, T: M }, i) => ({ name: c.joints[i].name, matrix: M, at: /** @type {Vec3} */ ([A[3], A[7], A[11]]), axis: /** @type {Vec3} */ ([A[2], A[6], A[10]]) })) };
}

// 3 × dof, columns by driven joint; in mm per degree or mm per mm unless perRadian
function jac(c, q, perRadian = false) {
  const m = META.get(c), p = pose(c, expand(c, q));
  const J = [new Array(c.dof).fill(0), new Array(c.dof).fill(0), new Array(c.dof).fill(0)];
  c.joints.forEach((j, i) => {
    const A = p.links[i].A, z = [A[2], A[6], A[10]];
    const col = j.type === 'revolute' ? cross(z, sub(p.tip, [A[3], A[7], A[11]])).map((x) => x * D) : z;
    const [k, r] = m.rule[i];
    for (let row = 0; row < 3; row++) J[row][k] += col[row] * r;
  });
  if (perRadian) for (let k = 0; k < c.dof; k++) for (let row = 0; row < 3; row++) J[row][k] /= m.scale[k];
  return { J, p };
}

/**
 * The positional Jacobian: 3 rows, one column per driven joint, mm of tool per degree (or per mm) of joint.
 * @param {Chain | object} c @param {number[] | Record<string, number | number[]>} q @returns {number[][]}
 */
export function jacobian(c, q) { c = chain(/** @type {any} */ (c)); return jac(c, values(c, q, 'jacobian')).J; }

// The plane the tool can only move in, if there is one: every revolute along n, every prismatic across it
function planeOf(c) {
  const m = META.get(c);
  if ('plane' in m) return m.plane;
  const p = pose(c, expand(c, zeros(c))), axes = c.joints.map((j, i) => ({ type: j.type, z: unit([p.links[i].A[2], p.links[i].A[6], p.links[i].A[10]]) }));
  const rev = axes.filter((a) => a.type === 'revolute'), pri = axes.filter((a) => a.type === 'prismatic');
  let n = null;
  if (rev.length) n = rev[0].z;
  else { for (let i = 0; i < pri.length && !n; i++) for (let k = i + 1; k < pri.length && !n; k++) { const x = cross(pri[i].z, pri[k].z); if (norm(x) > 1e-6) n = unit(x); } }
  const good = n && rev.every((a) => Math.abs(Math.abs(dot(a.z, n)) - 1) < 1e-9) && pri.every((a) => Math.abs(dot(a.z, n)) < 1e-9);
  return (m.plane = good ? n : null);
}

function det(M) {
  const a = M.map((r) => [...r]), n = a.length; let d = 1;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    if (a[p][i] === 0) return 0;
    if (p !== i) { [a[p], a[i]] = [a[i], a[p]]; d = -d; }
    d *= a[i][i];
    for (let r = i + 1; r < n; r++) { const f = a[r][i] / a[i][i]; for (let k = i; k < n; k++) a[r][k] -= f * a[i][k]; }
  }
  return d;
}
const basisOf = (n) => {
  const r = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0], u = unit(r.map((x, k) => x - dot(r, n) * n[k]));
  return [u, cross(n, u)];
};

/**
 * Yoshikawa's measure of how freely the tool can move: the volume of the velocity ellipsoid, with revolute joints in
 * radians. A planar chain is measured in its plane. Zero at a singularity.
 * @param {Chain | object} c @param {number[] | Record<string, number | number[]>} q @returns {number}
 */
export function manipulability(c, q) {
  c = chain(/** @type {any} */ (c));
  let { J } = jac(c, values(c, q, 'manipulability'), true);
  const n = planeOf(c);
  if (n) { const [u, v] = basisOf(n); J = [u, v].map((b) => J[0].map((_, k) => b[0] * J[0][k] + b[1] * J[1][k] + b[2] * J[2][k])); }
  const rows = J.length, cols = c.dof;
  const G = rows <= cols ? J.map((r) => J.map((s) => r.reduce((t, x, k) => t + x * s[k], 0)))
    : Array.from({ length: cols }, (_, a) => Array.from({ length: cols }, (_, b) => J.reduce((t, r) => t + r[a] * r[b], 0)));
  return Math.sqrt(Math.max(0, det(G)));
}

// ---------- planar two-link model ----------
function twoLink(c) {
  const m = META.get(c);
  if ('two' in m) return m.two;
  m.two = null;
  if (c.joints.length !== 2 || c.joints.some((j) => j.type !== 'revolute' || j.follow)) return null;
  const p = pose(c, [0, 0]), [A1, A2] = p.links.map((l) => l.A), z1 = unit([A1[2], A1[6], A1[10]]), z2 = unit([A2[2], A2[6], A2[10]]);
  if (Math.abs(Math.abs(dot(z1, z2)) - 1) > 1e-9) return null;
  const n = z1, [u, v] = basisOf(n), p1 = [A1[3], A1[7], A1[11]], p2 = [A2[3], A2[7], A2[11]];
  const flat = (w) => [dot(w, u), dot(w, v)];
  const [x1, y1] = flat(sub(p2, p1)), [x2, y2] = flat(sub(p.tip, p2)), l1 = Math.hypot(x1, y1), l2 = Math.hypot(x2, y2);
  if (l1 < 1e-9 || l2 < 1e-9) return null;
  return (m.two = { n, u, v, p1, l1, l2, a1: Math.atan2(y1, x1), beta: Math.atan2(y2, x2) - Math.atan2(y1, x1), s2: Math.sign(dot(z1, z2)), height: dot(sub(p.tip, p1), n) });
}

function cartesian(c) {
  const m = META.get(c);
  if ('cart' in m) return m.cart;
  m.cart = null;
  if (c.joints.length < 2 || c.joints.length > 3 || c.joints.some((j) => j.type !== 'prismatic' || j.follow)) return null;
  const p = pose(c, zeros(c)), z = p.links.map((l) => unit([l.A[2], l.A[6], l.A[10]]));
  for (let i = 0; i < z.length; i++) for (let k = i + 1; k < z.length; k++) if (Math.abs(dot(z[i], z[k])) > 1e-9) return null;
  return (m.cart = { z, tip: p.tip });
}

// Bring an angle by whole turns into limits, near a wanted value
function wrapInto(deg, limits, near) {
  const [lo, hi] = limits, c = near ?? 0;
  const k0 = Math.round((c - deg) / 360);
  let best = null;
  for (let k = k0 - 2; k <= k0 + 2; k++) {
    const x = deg + 360 * k;
    if (x >= lo - 1e-9 && x <= hi + 1e-9 && (best == null || Math.abs(x - c) < Math.abs(best - c))) best = x;
  }
  return best;
}
const inLimit = (j, x, s = 1e-9) => !j.limits || (x >= j.limits[0] - s && x <= j.limits[1] + s);
const clampJoint = (j, x) => (j.limits ? Math.min(j.limits[1], Math.max(j.limits[0], x)) : x);

function clampQ(c, q) {
  const m = META.get(c);
  return q.map((x, k) => clampJoint(c.joints[m.free[k]], x));
}
function limitBreach(c, q) {
  const full = expand(c, q);
  for (let i = 0; i < c.joints.length; i++) if (!inLimit(c.joints[i], full[i], 1e-7)) return { joint: c.joints[i].name, value: full[i], limits: c.joints[i].limits };
  return null;
}

function targetOf(c, target) {
  if (!Array.isArray(target) || (target.length !== 2 && target.length !== 3) || !target.every(num)) throw refuse('ik.target', `ik: target is [x, y] or [x, y, z] in mm (got ${JSON.stringify(target)})`);
  if (target.length === 3) return target;
  const n = planeOf(c);
  if (!n || Math.abs(Math.abs(n[2]) - 1) > 1e-9) throw refuse('ik.target', `ik: a target with two numbers needs a chain that works in the XY plane; this one needs [x, y, z]`);
  return [target[0], target[1], pose(c, expand(c, zeros(c))).tip[2]];
}

const fail = (code, reason, q, error, iterations, method, extra = {}) => ({ ok: false, q, error, miss: error, iterations, reason, code, method, ...extra });

function residual(c, q, T) { return norm(sub(T, pose(c, expand(c, q)).tip)); }

function solvePlanar(c, m, T, opts) {
  const tol = opts.tolerance, d = sub(T, m.p1), x = dot(d, m.u), y = dot(d, m.v), h = dot(d, m.n) - m.height, r = Math.hypot(x, y);
  const out = Math.max(r - (m.l1 + m.l2), Math.abs(m.l1 - m.l2) - r, 0), miss = Math.hypot(out, h);
  const nearest = () => {
    // pointing at the target, stretched out (or folded, for a target inside the inner hole)
    const a = Math.atan2(y, x), inner = r < Math.abs(m.l1 - m.l2), phi = inner ? Math.PI : 0;
    const q1 = ((a - m.a1) * 180) / Math.PI, q2 = (m.s2 * (phi - m.beta) * 180) / Math.PI;
    return clampQ(c, [wrapInto(q1, [-1e9, 1e9], opts.start?.[0]), wrapInto(q2, [-1e9, 1e9], opts.start?.[1])]);
  };
  if (miss > tol) return fail('reach', `target out of reach by ${miss.toFixed(3)} mm`, nearest(), miss, 0, 'planar2R');
  const cos = Math.max(-1, Math.min(1, (r * r - m.l1 * m.l1 - m.l2 * m.l2) / (2 * m.l1 * m.l2))), phi = Math.acos(cos);
  const branch = (elbow) => {
    const f = elbow === 'right' ? phi : -phi;
    const t1 = Math.atan2(y, x) - Math.atan2(m.l2 * Math.sin(f), m.l1 + m.l2 * Math.cos(f));
    const q1 = ((t1 - m.a1) * 180) / Math.PI, q2 = (m.s2 * (f - m.beta) * 180) / Math.PI;
    const a = wrapInto(q1, c.joints[0].limits, opts.start?.[0]), b = wrapInto(q2, c.joints[1].limits, opts.start?.[1]);
    return { elbow, q: [a, b], blocked: a === null ? c.joints[0].name : b === null ? c.joints[1].name : null, raw: [q1, q2] };
  };
  const tried = opts.elbow ? [branch(opts.elbow)] : [branch('right'), branch('left')];
  const live = tried.filter((b) => !b.blocked);
  if (live.length) {
    const dist = (b) => (opts.start ? Math.abs(b.q[0] - opts.start[0]) + Math.abs(b.q[1] - opts.start[1]) : 0);
    const pick = live.reduce((a, b) => (dist(b) < dist(a) - 1e-12 ? b : a));
    return { ok: true, q: pick.q, error: residual(c, pick.q, T), miss: 0, iterations: 0, reason: null, code: null, method: 'planar2R', elbow: pick.elbow };
  }
  // both named branches are past a limit; say how far the nearest allowed pose is from the target
  const seed = clampQ(c, tried[0].raw.map((v, i) => (wrapInto(v, [-1e9, 1e9], c.joints[i].limits ? (c.joints[i].limits[0] + c.joints[i].limits[1]) / 2 : 0))));
  const polish = dls(c, T, seed, tol, opts.maxIterations);
  const blocked = tried.map((b) => `${b.elbow}: "${b.blocked}"`).join(', ');
  return fail('limits', `past a joint limit (${blocked}): the nearest allowed pose misses by ${polish.error.toFixed(3)} mm`, polish.q, polish.error, polish.iterations, 'planar2R', { blocked: tried[0].blocked });
}

function solveCartesian(c, m, T, tol) {
  const d = sub(T, m.tip), q = m.z.map((z) => dot(d, z)), q2 = clampQ(c, q), err = residual(c, q2, T);
  const j = c.joints.findIndex((x, i) => !inLimit(x, q[i]));
  if (j >= 0) return fail('limits', `joint "${c.joints[j].name}" would need ${q[j].toFixed(3)} mm, past its limits [${c.joints[j].limits}]: misses by ${err.toFixed(3)} mm`, q2, err, 0, 'cartesian', { blocked: c.joints[j].name });
  if (err > tol) return fail('reach', `target out of reach by ${err.toFixed(3)} mm: the axes do not move that way`, q2, err, 0, 'cartesian');
  return { ok: true, q: q2, error: err, miss: 0, iterations: 0, reason: null, code: null, method: 'cartesian' };
}

function solve3(A, b) {
  const a = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    if (Math.abs(a[i][i]) < 1e-30) return null;
    for (let r = 0; r < 3; r++) if (r !== i) { const f = a[r][i] / a[i][i]; for (let k = i; k < 4; k++) a[r][k] -= f * a[i][k]; }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

// Damped least squares with an adaptive damping and an active set at the limits, from one start
function dls(c, T, start, tol, maxIterations) {
  const m = META.get(c), n = c.dof, lim = (k) => c.joints[m.free[k]].limits;
  let q = clampQ(c, start), err = residual(c, q, T), lambda = 1e-3, iterations = 0, stalls = 0;
  while (err > tol && iterations < maxIterations) {
    iterations++;
    const { J, p } = jac(c, q, true), e = sub(T, p.tip), free = new Array(n).fill(true);
    let dq = null;
    for (let pass = 0; pass < 2; pass++) {
      const JJ = [0, 1, 2].map((a) => [0, 1, 2].map((b) => { let s = 0; for (let k = 0; k < n; k++) if (free[k]) s += J[a][k] * J[b][k]; return s; }));
      const tr = (JJ[0][0] + JJ[1][1] + JJ[2][2]) / 3, mu = lambda * Math.max(tr, 1e-9);
      for (let a = 0; a < 3; a++) JJ[a][a] += mu;
      const y = solve3(JJ, e);
      if (!y) break;
      dq = new Array(n).fill(0);
      for (let k = 0; k < n; k++) if (free[k]) dq[k] = (J[0][k] * y[0] + J[1][k] * y[1] + J[2][k] * y[2]) / m.scale[k];
      let changed = false;
      for (let k = 0; k < n; k++) {
        const L = lim(k);
        if (free[k] && L && ((q[k] <= L[0] + 1e-9 && dq[k] < 0) || (q[k] >= L[1] - 1e-9 && dq[k] > 0))) { free[k] = false; dq[k] = 0; changed = true; }
      }
      if (!changed) break;
    }
    if (!dq) break;
    const next = clampQ(c, q.map((x, k) => x + dq[k])), e2 = residual(c, next, T);
    if (e2 < err) {
      stalls = err - e2 < 1e-13 + 1e-12 * err ? stalls + 1 : 0;
      q = next; err = e2; lambda = Math.max(lambda * 0.25, 1e-12);
      if (stalls > 6) break;
    } else {
      lambda *= 5;
      if (lambda > 1e10) break;
    }
  }
  return { q, error: err, iterations };
}

// A fixed spread of starts across the limits (the golden ratio keeps them apart), for when none is named
const seeds = (c, count) => {
  const m = META.get(c), out = [];
  for (let s = 0; s < count; s++) {
    out.push(m.free.map((i, k) => {
      const j = c.joints[i], f = ((s + 1) * 0.6180339887 * (k + 1.31)) % 1;
      if (!j.limits) return (f - 0.5) * 20;
      return j.limits[0] + f * (j.limits[1] - j.limits[0]);
    }));
  }
  return out;
};
const nudged = (c, q, step = 3) => {
  const m = META.get(c);
  return clampQ(c, q.map((x, k) => x + (k % 2 ? -step : step) * (c.joints[m.free[k]].type === 'revolute' ? 1 : 0.5)));
};

function solveNumeric(c, T, opts) {
  const { tolerance: tol, maxIterations: max, start } = opts;
  const attempt = (q0) => {
    let r = dls(c, T, q0, tol, max);
    if (r.error > tol) { // a stall exactly on a singularity has no gradient; one nudge tells it from a true miss
      const again = dls(c, T, nudged(c, r.q), tol, max);
      if (again.error < r.error) r = { ...again, iterations: r.iterations + again.iterations };
    }
    return r;
  };
  let best, used = 0;
  for (const q0 of start ? [start] : [clampQ(c, zeros(c)), ...seeds(c, 8)]) {
    const r = attempt(q0); used += r.iterations;
    if (!best || r.error < best.error) best = r;
    if (best.error <= tol) break;
  }
  const { q, error } = best;
  if (error <= tol) {
    const breach = limitBreach(c, q);
    if (!breach) return { ok: true, q, error, miss: 0, iterations: used, reason: null, code: null, method: 'numeric' };
  }
  const breach = limitBreach(c, q);
  if (breach) return fail('limits', `joint "${breach.joint}" follows past its limits [${breach.limits}]`, q, error, used, 'numeric', { blocked: breach.joint });
  const m = META.get(c), atLimit = m.free.find((i, k) => c.joints[i].limits && (q[k] <= c.joints[i].limits[0] + 1e-6 || q[k] >= c.joints[i].limits[1] - 1e-6));
  if (atLimit !== undefined) return fail('limits', `stopped at the limit of joint "${c.joints[atLimit].name}", ${error.toFixed(3)} mm from the target`, q, error, used, 'numeric', { blocked: c.joints[atLimit].name });
  if (start) return fail('stalled', `did not converge from the start given: the closest it came is ${error.toFixed(3)} mm`, q, error, used, 'numeric');
  return fail('reach', `target out of reach: the closest found is ${error.toFixed(3)} mm away`, q, error, used, 'numeric');
}

/**
 * Joint values that put the tool on a target. Closed forms for a planar two-link arm and plain XY and XYZ axes, damped
 * least squares for any other serial chain. A target that cannot be met comes back ok: false with the distance it
 * misses by (error, miss) and the reason.
 * @param {Chain | object} c
 * @param {[number, number] | Vec3} target mm; two numbers only on a chain that works in the XY plane
 * @param {{ elbow?: 'left' | 'right', start?: number[], tolerance?: number, maxIterations?: number, method?: 'auto' | 'numeric' }} [opts]
 * @returns {{ ok: boolean, q: number[], error: number, miss: number, iterations: number, reason: string | null, code: 'reach' | 'limits' | 'stalled' | null, method: 'planar2R' | 'cartesian' | 'numeric', elbow?: 'left' | 'right', blocked?: string }}
 */
export function ik(c, target, opts = {}) {
  c = chain(/** @type {any} */ (c));
  const T = targetOf(c, target), { elbow, start, tolerance = 1e-6, maxIterations = 200, method = 'auto' } = opts;
  if (elbow !== undefined && elbow !== 'left' && elbow !== 'right') throw refuse('ik.elbow', `ik: elbow is 'left' or 'right' (got ${JSON.stringify(elbow)})`);
  if (!(tolerance > 0)) throw refuse('ik.tolerance', `ik: tolerance is a distance in mm, above 0 (got ${JSON.stringify(tolerance)})`);
  if (!(maxIterations >= 1)) throw refuse('ik.iterations', `ik: maxIterations is 1 or more (got ${JSON.stringify(maxIterations)})`);
  if (method !== 'auto' && method !== 'numeric') throw refuse('ik.method', `ik: method is 'auto' or 'numeric' (got ${JSON.stringify(method)})`);
  const q0 = start == null ? undefined : values(c, start, 'ik');
  const two = twoLink(c);
  if (elbow && !two) throw refuse('ik.elbow', `ik: elbow names a branch of a planar two-link arm, and this chain (${c.names.join(', ')}) is not one`);
  if (elbow && method === 'numeric') throw refuse('ik.elbow', 'ik: elbow belongs to the closed form; for the numeric solver name a start near the branch you want');
  const o = { elbow, start: q0, tolerance, maxIterations };
  if (method === 'auto') {
    if (two) return solvePlanar(c, two, T, o);
    const car = cartesian(c);
    if (car) return solveCartesian(c, car, T, tolerance);
  }
  return solveNumeric(c, T, o);
}

/**
 * For a planar two-link arm: how far a pose is from the two singular shapes, stretched out and folded.
 * @param {Chain | object} c @param {number[] | Record<string, number | number[]>} q
 * @returns {{ angle: number, room: number, stretched: boolean }} angle: degrees from straight or folded; room: mm the wrist can still move toward the nearest singular circle; stretched: nearer straight than folded
 */
export function singularityDistance(c, q) {
  c = chain(/** @type {any} */ (c));
  const m = twoLink(c), v = values(c, q, 'singularityDistance');
  if (!m) throw refuse('singularity.chain', `singularityDistance: a planar two-link arm only (this chain: ${c.names.join(', ')})`);
  const phi = m.beta + m.s2 * v[1] * D, a = (Math.atan2(Math.sin(phi), Math.cos(phi)) * 180) / Math.PI;
  const off = Math.min(Math.abs(a), 180 - Math.abs(a));
  const r = Math.hypot(m.l1 + m.l2 * Math.cos(phi), m.l2 * Math.sin(phi));
  return { angle: off, room: Math.min(m.l1 + m.l2 - r, r - Math.abs(m.l1 - m.l2)), stretched: Math.abs(a) < 90 };
}

// How far a pose can go before the arm stops it, in mm of tool: the exact circles for two links, joint room times lever
export function marginAt(c, q, point) {
  const m = META.get(c), { J } = jac(c, q), two = twoLink(c);
  let least = Infinity;
  m.free.forEach((i, k) => {
    const L = c.joints[i].limits;
    if (!L || (c.joints[i].type === 'revolute' && L[1] - L[0] >= 360)) return;
    const lever = Math.hypot(J[0][k], J[1][k], J[2][k]);
    if (lever > 1e-12) least = Math.min(least, Math.min(q[k] - L[0], L[1] - q[k]) * lever);
  });
  if (two) {
    const d = sub(point, two.p1), r = Math.hypot(dot(d, two.u), dot(d, two.v));
    return Math.min(least, two.l1 + two.l2 - r, r - Math.abs(two.l1 - two.l2));
  }
  if (cartesian(c)) return least;
  const p = pose(c, expand(c, zeros(c))).links.map((l) => [l.A[3], l.A[7], l.A[11]]);
  p.push(pose(c, expand(c, zeros(c))).tip);
  const span = p.slice(1).reduce((t, x, i) => t + norm(sub(x, p[i])), 0);
  return Math.min(least, span - norm(sub(point, p[0])));
}

export const internal = { planeOf, twoLink, limitBreach, expand, tip: (c, q) => pose(c, expand(c, q)).tip };
