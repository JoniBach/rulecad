// Frames of beams joined at nodes: how far a frame moves under load, what each beam carries, the load at which it
// buckles and the frequencies it rings at. Three-dimensional beam elements with six freedoms a node (three movements,
// three rotations) and shear deformation (Timoshenko's beam, which becomes Euler-Bernoulli's when shear is stiff).
// Plain numbers in typed arrays, no dependencies: it runs in browsers and Node alike.
//
// Units: millimetres, newtons, MPa (N/mm²), radians for rotations, N·mm for moments, N/mm and N·mm/rad for springs.
// Masses are in kg, densities in g/cm³ (as the kit's material rule sets give them) and gravity in N/kg (the same
// number as m/s²: [0, 0, -9.81]), so a mass times gravity is newtons with no factor. In the modal solve stiffness is
// N/mm and mass kg, and N/mm ÷ kg = 1000 s⁻² (a newton is a kg·m/s² and the lengths are mm), so the angular
// frequency squared is 1000 times the eigenvalue of K against M in kg: frequency = √(1000 λ) / 2π, in Hz.
//
// An element's local axes: x runs from its node `a` to its node `b`; z is the part of `up` square to x (`up` is
// global +Z, or global +X for an element along Z, unless the element gives one); y = z × x. `roll` then turns y and z
// about x, right-handed, in degrees. Iy is the second moment about local y (it resists bending that moves the beam
// along z) and Iz about local z.
//
// Matrices (sources in the README): the stiffness with the shear parameter Φ = 12 E I / (G As L²) is
// Przemieniecki's (1968, eq. 5.116); the geometric stiffness and the consistent mass are integrals of the same
// element's shape functions (Friedman and Kosmatka 1993), which for Φ = 0 are the familiar 6/5, L/10, 2L²/15 and
// 156, 22L, 4L² tables. An end's rotational spring or release is condensed out of the element, K − K_s (K_ss + k)⁻¹
// K_sᵀ, which is exact for the stiffness and the loads; the mass and geometric stiffness are carried through the same
// reduction (Guyan's), so buckling and modes want each member cut into several elements (`subdivide`).

/** @typedef {[number, number, number]} Vec3 */
/**
 * @typedef {object} FrameSection A beam's cross-section, in its local axes
 * @property {number} A area, mm²
 * @property {number} Iy second moment about local y, mm⁴ (bending that moves the beam along local z)
 * @property {number} Iz second moment about local z, mm⁴ (bending that moves the beam along local y)
 * @property {number} J torsion constant, mm⁴
 * @property {number} [Asy] shear area for shear along local y, mm² (left out: no shear deformation that way)
 * @property {number} [Asz] shear area for shear along local z, mm²
 * @property {number} [cy] distance from the centroid to the furthest fibre along local y, mm (for stress)
 * @property {number} [cz] distance to the furthest fibre along local z, mm
 * @property {number} [Wy] section modulus for bending about y, mm³ (Iy / cz, if cz is not given)
 * @property {number} [Wz] section modulus for bending about z, mm³ (Iz / cy)
 */
/**
 * @typedef {object} FrameMaterial
 * @property {number} E Young's modulus, MPa
 * @property {number} [G] shear modulus, MPa (or give nu)
 * @property {number} [nu] Poisson's ratio, for G = E / 2(1 + nu)
 * @property {number} [density] g/cm³ (for gravity and modes; left out: weightless)
 */
/** @typedef {'rigid' | 'free' | number} Fixity how one rotation at an element's end is joined to its node: rigidly, not at all (a hinge), or through a spring of that many N·mm/rad */
/** @typedef {'rigid' | 'pinned' | 'ball' | { rx?: Fixity, ry?: Fixity, rz?: Fixity }} EndJoin 'pinned' frees both bending rotations (ry, rz) and carries twist; 'ball' frees all three; or say each, about the element's local axes */
/**
 * @typedef {object} FrameElement
 * @property {string | number} [id] its name in the results (its place in the list if left out)
 * @property {string | number} a the node it starts at
 * @property {string | number} b the node it ends at
 * @property {FrameSection | string} section the section, or its name in the model's `sections`
 * @property {FrameMaterial | string} material the material, or its name in the model's `materials`
 * @property {number} [roll] degrees about its own axis, turning local y towards local z
 * @property {Vec3} [up] the direction local z leans towards (global +Z, or +X for an element along Z)
 * @property {{ a?: EndJoin, b?: EndJoin }} [ends] how each end is joined to its node ('rigid' if left out)
 * @property {string | number} [of] the member this is a piece of (set by `subdivide`, handed back in the results)
 */
/** @typedef {boolean | number | 'fixed' | 'free'} Hold one freedom of a support: held (true), free, or a spring to ground of that many N/mm (movements) or N·mm/rad (rotations) */
/** @typedef {'fixed' | 'pinned' | { x?: Hold, y?: Hold, z?: Hold, rx?: Hold, ry?: Hold, rz?: Hold }} FrameSupport 'fixed' holds all six freedoms, 'pinned' the three movements */
/** @typedef {{ node: string | number, force?: Vec3, moment?: Vec3 } | { element: string | number, spread: Vec3, axes?: 'global' | 'local' }} FrameLoad a force (N) and moment (N·mm) at a node, in global axes; or a load spread evenly along an element, N per mm of its length, in global axes or its own */
/**
 * @typedef {object} FrameModel
 * @property {Record<string, Vec3> | Vec3[]} nodes each node's position in mm, by name (or a list, named by place: 0, 1, ...)
 * @property {FrameElement[]} elements
 * @property {Record<string, FrameSection>} [sections] sections by name
 * @property {Record<string, FrameMaterial>} [materials] materials by name
 * @property {Record<string, FrameSupport>} supports by node
 * @property {FrameLoad[]} [loads]
 * @property {Vec3} [gravity] N/kg (m/s²), acting on every element's mass and every lumped mass: [0, 0, -9.81]
 * @property {Record<string, number>} [masses] lumped masses by node, kg (weight under gravity, and inertia in modes)
 */
/** @typedef {[number, number, number, number, number, number]} Six x, y, z, then about x, y, z */
/**
 * @typedef {object} ElementResult
 * @property {string | number} id
 * @property {string | number} [of] the member it is a piece of, when the model came from `subdivide`
 * @property {number} length mm
 * @property {[Vec3, Vec3, Vec3]} axes its local x, y and z in global axes
 * @property {{ a: Six, b: Six }} ends the forces (N) and moments (N·mm) its nodes put on each end, in local axes
 * @property {{ x: number[], N: number[], Vy: number[], Vz: number[], T: number[], My: number[], Mz: number[], d: Vec3[] }} along
 *   at each station x (mm from a): axial force (tension positive), shear along local y and z, torque, bending moments
 *   about local y and z (each as the part of the beam beyond x acts on the part before it, so at b they are the end
 *   forces), and the movement there in global axes (mm). The stations are evenly spaced, plus where each moment peaks.
 * @property {{ N: Peak, Vy: Peak, Vz: Peak, T: Peak, My: Peak, Mz: Peak }} peak each one's largest value by size, signed, and where
 * @property {number} axial the mean axial force, N (tension positive): what buckling reads
 * @property {{ peak: number, bending: number, axial: number, x: number }} [stress] MPa, when the section has cy and cz (or
 *   Wy and Wz): the largest |N|/A + |My|/Wy + |Mz|/Wz along the element and where; the largest bending part alone;
 *   and N/A at the peak
 */
/** @typedef {{ value: number, x: number }} Peak */
/**
 * @typedef {object} StaticResult
 * @property {Record<string, Six>} displacements each node's movement (mm) and rotation (rad), in global axes
 * @property {Record<string, Six>} reactions at each supported node: the force (N) and moment (N·mm) its support gives the frame
 * @property {ElementResult[]} elements in the model's order
 * @property {{ most: number, node: string }} deflection the largest movement of any node, and which
 */
/** @typedef {{ factor: number, shape: Record<string, Six> }} BucklingMode the loads times `factor` buckle the frame into `shape` (largest movement 1) */
/** @typedef {{ frequency: number, shape: Record<string, Six> }} VibrationMode Hz, and the shape (largest movement 1) */

const FREEDOMS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
/** @returns {never} */
const refuse = (code, text, more) => { throw Object.assign(new Error(text), { code: `fea.frame.${code}`, ...more }); };
const isVec3 = (v) => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
const said = (v) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v) ?? String(v));

// ---- one element, in its own axes: [u, v, w, θx, θy, θz] at a, then the same at b ----

// 4-point Gauss on 0..1: exact to degree 7 (the mass matrix's integrand is degree 6)
const GAUSS = [[0.5 - 0.4305681557970263, 0.1739274225687269], [0.5 - 0.16999052179242816, 0.3260725774312731], [0.5 + 0.16999052179242816, 0.3260725774312731], [0.5 + 0.4305681557970263, 0.1739274225687269]];
const XY = [1, 5, 7, 11], XZ = [2, 4, 8, 10], FLIP = [1, -1, 1, -1]; // bending in the x-y plane (v, θz) and in x-z (w, θy = −dw/dx: its rotations change sign)

// The Timoshenko element's shape functions in one bending plane at ξ = x / L, for [v1, θ1, v2, θ2]: the deflection N,
// and with `all` its slope D and the section's rotation R (Friedman and Kosmatka 1993). Φ = 0 gives the Hermite cubics.
function shape(xi, L, phi, all) {
  const f = 1 / (1 + phi), x2 = xi * xi, x3 = x2 * xi;
  const N = [f * (2 * x3 - 3 * x2 - phi * xi + 1 + phi), f * L * (x3 - (2 + phi / 2) * x2 + (1 + phi / 2) * xi), -f * (2 * x3 - 3 * x2 - phi * xi), f * L * (x3 - (1 - phi / 2) * x2 - (phi / 2) * xi)];
  if (!all) return { N };
  const D = [f * (6 * x2 - 6 * xi - phi) / L, f * (3 * x2 - (4 + phi) * xi + 1 + phi / 2), -f * (6 * x2 - 6 * xi - phi) / L, f * (3 * x2 - (2 - phi) * xi - phi / 2)];
  const R = [f * 6 * (x2 - xi) / L, f * (3 * x2 - (4 + phi) * xi + 1 + phi), -f * 6 * (x2 - xi) / L, f * (3 * x2 - (2 - phi) * xi)];
  return { N, D, R };
}
// ∫ DᵀD (geometric stiffness for a tension of 1), ∫ NᵀN (mass, for 1 a length) and ∫ RᵀR (rotary inertia), each 4 × 4
function planeForms(L, phi) {
  const g = new Float64Array(16), m = new Float64Array(16), r = new Float64Array(16);
  for (const [xi, wt] of GAUSS) {
    const { N, D, R } = shape(xi, L, phi, true), w = wt * L;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g[4 * i + j] += w * D[i] * D[j]; m[4 * i + j] += w * N[i] * N[j]; r[4 * i + j] += w * R[i] * R[j]; }
  }
  return { g, m, r };
}
// One bending plane's stiffness for [v1, θ1, v2, θ2]: Przemieniecki (1968) eq. 5.116
function planeStiffness(EI, L, phi) {
  const c = EI / ((1 + phi) * L ** 3), a = 12 * c, b = 6 * L * c, d = (4 + phi) * L * L * c, e = (2 - phi) * L * L * c;
  return [a, b, -a, b, b, d, -b, e, -a, -b, a, -b, b, e, -b, d];
}
const put = (K, m4, idx, flip, scale) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[idx[i] * 12 + idx[j]] += scale * m4[4 * i + j] * (flip ? FLIP[i] * FLIP[j] : 1); };
const bar = (K, i, j, s, t = -s) => { K[i * 12 + i] += s; K[j * 12 + j] += s; K[i * 12 + j] += t; K[j * 12 + i] += t; };
const shearModulus = (material) => material.G ?? material.E / (2 * (1 + material.nu));

/**
 * One beam element's matrices in its own axes, both ends rigid: 12 × 12, row by row, for [u, v, w, θx, θy, θz] at its
 * start then its end. `k` is its stiffness (N/mm, N, N·mm), `kg` its geometric stiffness for a tension of 1 N, and
 * `m` its consistent mass in kg (kg·mm for the cross terms, kg·mm² for rotations), with rotary inertia.
 * @param {FrameSection} section @param {FrameMaterial} material @param {number} L length, mm
 * @param {{ shear?: boolean }} [o] shear: false ignores the shear areas (Euler-Bernoulli)
 * @returns {{ k: Float64Array, kg: Float64Array, m: Float64Array, phi: [number, number] }} phi: the shear parameters
 *   12 E Iz / (G Asy L²) and 12 E Iy / (G Asz L²)
 */
export function elementMatrices(section, material, L, { shear = true } = {}) {
  const { A, Iy, Iz, J } = section, { E } = material, G = shearModulus(material), rho = (material.density || 0) * 1e-6; // kg/mm³
  const phiY = shear && section.Asy ? (12 * E * Iz) / (G * section.Asy * L * L) : 0, phiZ = shear && section.Asz ? (12 * E * Iy) / (G * section.Asz * L * L) : 0;
  const k = new Float64Array(144), kg = new Float64Array(144), m = new Float64Array(144), fy = planeForms(L, phiY), fz = planeForms(L, phiZ);
  bar(k, 0, 6, (E * A) / L); bar(k, 3, 9, (G * J) / L);
  put(k, planeStiffness(E * Iz, L, phiY), XY, false, 1); put(k, planeStiffness(E * Iy, L, phiZ), XZ, true, 1);
  put(kg, fy.g, XY, false, 1); put(kg, fz.g, XZ, true, 1);
  bar(m, 0, 6, (rho * A * L) / 3, (rho * A * L) / 6); bar(m, 3, 9, (rho * (Iy + Iz) * L) / 3, (rho * (Iy + Iz) * L) / 6);
  put(m, fy.m, XY, false, rho * A); put(m, fy.r, XY, false, rho * Iz); put(m, fz.m, XZ, true, rho * A); put(m, fz.r, XZ, true, rho * Iy);
  return { k, kg, m, phi: [phiY, phiZ] };
}

// The inverse of a small matrix (n ≤ 6) by Gauss-Jordan with pivoting; null if it has none
function invert(A, n) {
  const a = Float64Array.from(A), inv = new Float64Array(n * n);
  let big = 0;
  for (let i = 0; i < n; i++) { inv[i * n + i] = 1; big = Math.max(big, Math.abs(a[i * n + i])); }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r;
    if (!(Math.abs(a[p * n + c]) > 1e-12 * big)) return null;
    if (p !== c) for (let j = 0; j < n; j++) { let t = a[c * n + j]; a[c * n + j] = a[p * n + j]; a[p * n + j] = t; t = inv[c * n + j]; inv[c * n + j] = inv[p * n + j]; inv[p * n + j] = t; }
    const d = a[c * n + c];
    for (let j = 0; j < n; j++) { a[c * n + j] /= d; inv[c * n + j] /= d; }
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r * n + c]; if (f) for (let j = 0; j < n; j++) { a[r * n + j] -= f * a[c * n + j]; inv[r * n + j] -= f * inv[c * n + j]; } }
  }
  return inv;
}
const mul12 = (A, B) => { const C = new Float64Array(144); for (let i = 0; i < 12; i++) for (let k = 0; k < 12; k++) { const a = A[i * 12 + k]; if (a) for (let j = 0; j < 12; j++) C[i * 12 + j] += a * B[k * 12 + j]; } return C; };
const transpose12 = (A) => { const C = new Float64Array(144); for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) C[j * 12 + i] = A[i * 12 + j]; return C; };
const symmetric12 = (A) => { for (let i = 0; i < 12; i++) for (let j = 0; j < i; j++) A[i * 12 + j] = A[j * 12 + i] = (A[i * 12 + j] + A[j * 12 + i]) / 2; return A; };

// Springs and releases at an element's ends, condensed out. `springs` has a stiffness for each of the 12 freedoms:
// Infinity where the end is rigid, 0 where it is released. With s the sprung freedoms and H = (K_ss + k)⁻¹, the
// beam's own end freedoms follow its nodes' as d_beam = T d + H f_s, with T = I − E_s H K[s, :], and the condensed
// stiffness is K T = K − K_s H K_sᵀ: nothing is subtracted from a large number however stiff the spring.
function condense({ k, kg, m }, springs) {
  const s = [];
  for (let i = 0; i < 12; i++) if (springs[i] !== Infinity) s.push(i);
  if (!s.length) return { k, kg, m, T: null, H: null, s };
  const n = s.length, A = new Float64Array(n * n);
  for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) A[p * n + q] = k[s[p] * 12 + s[q]] + (p === q ? springs[s[p]] : 0);
  const H = invert(A, n);
  if (!H) return null;
  const T = new Float64Array(144);
  for (let i = 0; i < 12; i++) T[i * 13] = 1;
  for (let p = 0; p < n; p++) for (let j = 0; j < 12; j++) { let sum = 0; for (let q = 0; q < n; q++) sum += H[p * n + q] * k[s[q] * 12 + j]; T[s[p] * 12 + j] -= sum; }
  const Tt = transpose12(T);
  return { k: symmetric12(mul12(k, T)), kg: symmetric12(mul12(Tt, mul12(kg, T))), m: symmetric12(mul12(Tt, mul12(m, T))), T, H, s };
}

// Λᵀ K Λ: a 12 × 12 matrix from local to global axes, R's rows being the local axes
function toGlobal(K, R) {
  const t = new Float64Array(144), out = new Float64Array(144);
  for (let i = 0; i < 12; i++) for (let q = 0; q < 12; q += 3) for (let c = 0; c < 3; c++) t[i * 12 + q + c] = K[i * 12 + q] * R[c] + K[i * 12 + q + 1] * R[3 + c] + K[i * 12 + q + 2] * R[6 + c];
  for (let p = 0; p < 12; p += 3) for (let r = 0; r < 3; r++) for (let j = 0; j < 12; j++) out[(p + r) * 12 + j] = R[r] * t[p * 12 + j] + R[3 + r] * t[(p + 1) * 12 + j] + R[6 + r] * t[(p + 2) * 12 + j];
  return out;
}
const toLocal3 = (R, v, o = 0) => [R[0] * v[o] + R[1] * v[o + 1] + R[2] * v[o + 2], R[3] * v[o] + R[4] * v[o + 1] + R[5] * v[o + 2], R[6] * v[o] + R[7] * v[o + 1] + R[8] * v[o + 2]];
const toGlobal3 = (R, v, o = 0) => [R[0] * v[o] + R[3] * v[o + 1] + R[6] * v[o + 2], R[1] * v[o] + R[4] * v[o + 1] + R[7] * v[o + 2], R[2] * v[o] + R[5] * v[o + 1] + R[8] * v[o + 2]];

// ---- the frame's matrix: symmetric, each row kept from its first non-zero column to the diagonal ----

// Nodes in an order that keeps joined nodes close (reverse Cuthill-McKee), so rows are short
function ordering(n, pairs) {
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of pairs) { adj[a].push(b); adj[b].push(a); }
  const seen = new Uint8Array(n), out = [];
  const sweep = (start, mark) => { const q = [start]; mark[start] = 1; for (let h = 0; h < q.length; h++) for (const m of adj[q[h]].filter((v) => !mark[v]).sort((a, b) => adj[a].length - adj[b].length)) { mark[m] = 1; q.push(m); } return q; };
  for (const s of [...adj.keys()].sort((a, b) => adj[a].length - adj[b].length)) {
    if (seen[s]) continue;
    const far = sweep(s, new Uint8Array(n)).at(-1); // start from an end of the frame, not its middle
    out.push(...sweep(far, seen));
  }
  return out.reverse();
}
function profile(first) {
  const n = first.length, start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + i - first[i] + 1;
  return { n, first, start, v: new Float64Array(start[n]) };
}
const multiply = (P, x, y = new Float64Array(P.n)) => {
  const { n, first, start, v } = P;
  y.fill(0);
  for (let i = 0; i < n; i++) { const o = start[i] - first[i], xi = x[i]; let s = 0; for (let j = first[i]; j < i; j++) { s += v[o + j] * x[j]; y[j] += v[o + j] * xi; } y[i] += s + v[o + i] * xi; }
  return y;
};
// Cholesky, L Lᵀ, in the same rows. A pivot that all but vanishes is a freedom nothing holds: it is noted, held,
// and the factorisation goes on, so every loose freedom is found in one pass.
function factorise(P) {
  const { n, first, start } = P, v = Float64Array.from(P.v), loose = [];
  for (let i = 0; i < n; i++) {
    const fi = first[i], ri = start[i] - fi;
    for (let j = fi; j < i; j++) {
      const fj = first[j], rj = start[j] - fj;
      let s = v[ri + j];
      for (let k = fi > fj ? fi : fj; k < j; k++) s -= v[ri + k] * v[rj + k];
      v[ri + j] = s / v[rj + j];
    }
    const a = v[ri + i];
    let d = a;
    for (let k = fi; k < i; k++) d -= v[ri + k] * v[ri + k];
    if (!(d > 1e-11 * a)) { loose.push(i); d = Math.max(a, 1) * 1e20; }
    v[ri + i] = Math.sqrt(d);
  }
  const solve = (b, x = new Float64Array(n)) => {
    for (let i = 0; i < n; i++) { const fi = first[i], ri = start[i] - fi; let s = b[i]; for (let k = fi; k < i; k++) s -= v[ri + k] * x[k]; x[i] = s / v[ri + i]; }
    for (let i = n - 1; i >= 0; i--) { const fi = first[i], ri = start[i] - fi, xi = (x[i] /= v[ri + i]); for (let k = fi; k < i; k++) x[k] -= v[ri + k] * xi; }
    return x;
  };
  return { solve, loose };
}

// Eigenvalues and vectors of a small symmetric matrix by Jacobi rotations (A is used up): values[i] goes with column i of V
function jacobi(A, n) {
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0, all = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = A[i * n + j] * A[i * n + j]; all += a; if (i !== j) off += a; }
    if (!(off > 1e-26 * all)) break; // (the off-diagonal part is under 1e-13 of the whole)
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (apq === 0) continue;
      const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq), t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const kp = A[k * n + p], kq = A[k * n + q]; A[k * n + p] = c * kp - s * kq; A[k * n + q] = s * kp + c * kq; }
      for (let k = 0; k < n; k++) { const pk = A[p * n + k], qk = A[q * n + k]; A[p * n + k] = c * pk - s * qk; A[q * n + k] = s * pk + c * qk; }
      for (let k = 0; k < n; k++) { const kp = V[k * n + p], kq = V[k * n + q]; V[k * n + p] = c * kp - s * kq; V[k * n + q] = s * kp + c * kq; }
    }
  }
  return { values: Float64Array.from({ length: n }, (_, i) => A[i * n + i]), V };
}

// The largest μ of B x = μ K x (K positive definite and factorised, B symmetric: the mass, or minus the geometric
// stiffness) and their vectors, by subspace iteration (Bathe 2014, section 11.6): a block of vectors is put through
// K⁻¹ B again and again, and the small problem in the block (Rayleigh-Ritz) is solved by Jacobi rotations. The block
// is made orthonormal in K, not in B, so a B of low rank (one lumped mass, one beam in compression) is no trouble:
// vectors the block cannot tell apart are dropped. Only positive μ are wanted, `want` of them; if the block settles
// with fewer (negative ones crowd it: the frame would buckle more readily with its loads reversed), or has not
// settled in 30 steps, it doubles, up to the whole problem, where one step is exact. Buckling starts with a wider
// block than modes do: a frame's columns buckle at loads close together, and close values settle slowly in a
// block that holds only some of them.
function lowest(solveK, B, want, block = Math.max(2 * want, want + 8), tol = 1e-9) {
  const n = B.n;
  let seed = 12345;
  const random = () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1; };
  const fresh = () => multiply(B, Float64Array.from({ length: n }, random));
  let q = Math.min(n, block), Y = Array.from({ length: q }, fresh), last = null, exhausted = false;
  for (let step = 0, since = 1; ; step++, since++) {
    const offered = Y.length;
    let Z = Y.map((y) => solveK(y)), BZ = Z.map((z) => multiply(B, z));
    // each vector's size in K (zᵀ K z = zᵀ y): scaled to 1, or dropped if B gave it nothing
    const keep = [];
    Z.forEach((z, i) => { let e = 0; for (let k = 0; k < n; k++) e += z[k] * Y[i][k]; if (e > 0 && Number.isFinite(e)) { const s = 1 / Math.sqrt(e); for (let k = 0; k < n; k++) { z[k] *= s; BZ[i][k] *= s; Y[i][k] *= s; } keep.push(i); } });
    Z = keep.map((i) => Z[i]); BZ = keep.map((i) => BZ[i]); Y = keep.map((i) => Y[i]);
    const m = Z.length;
    if (!m) return { values: [], vectors: [] };
    const Kr = new Float64Array(m * m), Br = new Float64Array(m * m);
    for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { let a = 0, b = 0; const zi = Z[i], yj = Y[j], bj = BZ[j]; for (let k = 0; k < n; k++) { a += zi[k] * yj[k]; b += zi[k] * bj[k]; } Kr[i * m + j] = Kr[j * m + i] = a; Br[i * m + j] = Br[j * m + i] = b; }
    // an orthonormal basis of the block in K: Kr = V Λ Vᵀ, W = V Λ^-½, leaving out directions the block repeats
    const kr = jacobi(Kr, m), top = Math.max(...kr.values), cols = [...kr.values.keys()].filter((i) => kr.values[i] > 1e-12 * top), r = cols.length;
    const W = new Float64Array(m * r), BW = new Float64Array(m * r), C = new Float64Array(r * r);
    cols.forEach((c, j) => { const s = 1 / Math.sqrt(kr.values[c]); for (let i = 0; i < m; i++) W[i * r + j] = kr.V[i * m + c] * s; });
    for (let i = 0; i < m; i++) for (let j = 0; j < r; j++) { let s = 0; for (let k = 0; k < m; k++) s += Br[i * m + k] * W[k * r + j]; BW[i * r + j] = s; }
    for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) { let s = 0; for (let k = 0; k < m; k++) s += W[k * r + i] * BW[k * r + j]; C[i * r + j] = s; }
    const ritz = jacobi(C, r), by = [...ritz.values.keys()].sort((a, b) => ritz.values[b] - ritz.values[a]);
    // the Ritz vectors (or their B products) from the block: column c = Σ_i S_i (W U)[i][c]
    const mix = (S, count = r) => by.slice(0, count).map((c) => { const x = new Float64Array(n); for (let i = 0; i < m; i++) { let w = 0; for (let j = 0; j < r; j++) w += W[i * r + j] * ritz.V[j * r + c]; if (w) { const si = S[i]; for (let k = 0; k < n; k++) x[k] += w * si[k]; } } return x; });
    const values = by.map((c) => ritz.values[c]), size = Math.max(Math.abs(values[0]), Math.abs(values[r - 1])), wanted = values.filter((v) => v > 1e-12 * size).slice(0, want);
    if (since === 1 && r < offered) exhausted = true; // fresh vectors added nothing new: the block already holds all B can reach
    const settled = !!last && last.length === wanted.length && wanted.every((v, i) => Math.abs(v - last[i]) <= tol * v);
    if (r >= n || (settled && (wanted.length >= want || exhausted || q >= n)) || step >= 400) return { values: wanted, vectors: mix(Z, wanted.length) };
    last = wanted;
    Y = mix(BZ);
    if ((settled || since >= 30) && q < n) { const more = Math.min(n, 2 * q) - q; for (let i = 0; i < more; i++) Y.push(fresh()); q += more; since = 0; last = null; }
  }
}

// ---- the model, read and refused by name ----

function read(model, { shear = true } = {}) {
  if (!model || typeof model !== 'object') refuse('input', 'a frame is { nodes, elements, supports, loads }: got ' + said(model));
  const { nodes, elements } = model;
  if (!nodes || typeof nodes !== 'object') refuse('input', 'a frame needs nodes: positions in mm by name, { a: [0, 0, 0], b: [0, 0, 300] }, or a list of positions');
  const ids = Array.isArray(nodes) ? nodes.map((_, i) => String(i)) : Object.keys(nodes), at = Array.isArray(nodes) ? nodes : Object.values(nodes), index = new Map(ids.map((id, i) => [id, i]));
  if (!ids.length) refuse('input', 'a frame needs nodes: positions in mm by name, { a: [0, 0, 0], b: [0, 0, 300] }, or a list of positions');
  at.forEach((p, i) => { if (!isVec3(p)) refuse('node', `node ${said(ids[i])} is at ${said(p)}: a node needs a position [x, y, z] in mm`, { node: ids[i] }); });
  if (!Array.isArray(elements) || !elements.length) refuse('input', 'a frame needs elements: a list of { a, b, section, material }, each between two nodes');
  const nodeOf = (name, what) => index.get(String(name)) ?? refuse('node', `${what} names node ${said(name)}, which is not in nodes (there ${ids.length === 1 ? 'is' : 'are'} ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ', ...' : ''})`, { node: name });
  const named = (v, table, what, whose) => (typeof v === 'string' ? table?.[v] ?? refuse(what, `${whose} names ${what} "${v}", which is not in the model's ${what}s${table ? ` (there ${Object.keys(table).length === 1 ? 'is' : 'are'} ${Object.keys(table).join(', ')})` : ''}`) : v);
  const N = ids.length, elementIds = new Map();
  const els = elements.map((e, i) => {
    const id = e?.id ?? i, whose = `element ${said(id)}`;
    if (!e || typeof e !== 'object') refuse('input', `element ${i} is ${said(e)}: an element is { a, b, section, material }`);
    if (elementIds.has(String(id))) refuse('input', `two elements are called ${said(id)}: each needs its own id`);
    elementIds.set(String(id), i);
    const a = nodeOf(e.a, whose), b = nodeOf(e.b, whose), pa = at[a], pb = at[b], dx = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], L = Math.hypot(...dx);
    if (a === b || !(L > 1e-9)) refuse('length', `${whose} has no length: it runs from node ${said(e.a)} to node ${said(e.b)}${a === b ? '' : ', which are at the same place'}. An element joins two nodes some way apart`, { element: id });
    const section = named(e.section, model.sections, 'section', whose), material = named(e.material, model.materials, 'material', whose);
    if (!section || typeof section !== 'object') refuse('section', `${whose} needs a section: { A, Iy, Iz, J } in mm² and mm⁴`, { element: id });
    for (const key of ['A', 'Iy', 'Iz', 'J']) if (!(section[key] > 0) || !Number.isFinite(section[key])) refuse('section', `${whose}'s section has ${key} = ${said(section[key])}: it needs ${key} above 0 (A in mm²; Iy, Iz and J in mm⁴)`, { element: id, property: key });
    for (const key of ['Asy', 'Asz', 'cy', 'cz', 'Wy', 'Wz']) if (section[key] !== undefined && (!(section[key] > 0) || !Number.isFinite(section[key]))) refuse('section', `${whose}'s section has ${key} = ${said(section[key])}: leave it out, or give it above 0`, { element: id, property: key });
    if (!material || typeof material !== 'object') refuse('material', `${whose} needs a material: { E, nu or G, density }`, { element: id });
    if (!(material.E > 0) || !Number.isFinite(material.E)) refuse('material', `${whose}'s material has E = ${said(material.E)}: it needs a Young's modulus above 0, in MPa`, { element: id, property: 'E' });
    if (material.G !== undefined ? !(material.G > 0 && Number.isFinite(material.G)) : !(material.nu > -1 && material.nu < 0.5)) refuse('material', `${whose}'s material has G = ${said(material.G)} and nu = ${said(material.nu)}: it needs a shear modulus G above 0 in MPa, or a Poisson's ratio nu between -1 and 0.5`, { element: id, property: 'G' });
    if (material.density !== undefined && !(material.density >= 0 && Number.isFinite(material.density))) refuse('material', `${whose}'s material has density = ${said(material.density)}: leave it out (weightless), or give it in g/cm³, 0 or more`, { element: id, property: 'density' });
    // local axes
    const x = dx.map((c) => c / L);
    if (e.up !== undefined && !isVec3(e.up)) refuse('axes', `${whose}'s up is ${said(e.up)}: it is a direction [x, y, z] that local z leans towards`, { element: id });
    if (e.roll !== undefined && !Number.isFinite(e.roll)) refuse('axes', `${whose}'s roll is ${said(e.roll)}: it is an angle in degrees about the element's own axis`, { element: id });
    const up = e.up ?? (Math.abs(x[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1]), along = up[0] * x[0] + up[1] * x[1] + up[2] * x[2];
    let z = [up[0] - along * x[0], up[1] - along * x[1], up[2] - along * x[2]];
    const zl = Math.hypot(...z);
    if (!(zl > 1e-6 * Math.hypot(...up))) refuse('axes', `${whose}'s up, ${said(Array.from(up))}, runs along the element, so it does not say which way local z points: give a direction across it`, { element: id });
    z = z.map((c) => c / zl);
    let y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    if (e.roll) { const c = Math.cos((e.roll * Math.PI) / 180), s = Math.sin((e.roll * Math.PI) / 180), y0 = y, z0 = z; y = y0.map((v, k) => c * v + s * z0[k]); z = z0.map((v, k) => c * z0[k] - s * y0[k]); }
    // how each end is joined
    const springs = new Float64Array(12).fill(Infinity);
    for (const [end, o] of [['a', 3], ['b', 9]]) {
      const j = e.ends?.[end] ?? 'rigid', each = j === 'rigid' ? {} : j === 'pinned' ? { ry: 'free', rz: 'free' } : j === 'ball' ? { rx: 'free', ry: 'free', rz: 'free' } : j;
      if (!each || typeof each !== 'object') refuse('join', `${whose}'s end ${end} is joined ${said(j)}: 'rigid', 'pinned' (both bending rotations free), 'ball' (all three free), or { rx, ry, rz } each 'rigid', 'free' or a spring in N·mm/rad`, { element: id });
      for (const [key, f] of Object.entries(each)) {
        const d = ['rx', 'ry', 'rz'].indexOf(key);
        if (d < 0) refuse('join', `${whose}'s end ${end} has "${key}": an end's rotations are rx (twist), ry and rz, about the element's own axes`, { element: id });
        if (f === 'rigid' || f === Infinity || f === undefined) continue;
        if (f !== 'free' && !(f >= 0)) refuse('join', `${whose}'s end ${end} has ${key} = ${said(f)}: 'rigid', 'free', or a spring's stiffness in N·mm/rad, 0 or more`, { element: id });
        springs[o + d] = f === 'free' ? 0 : f;
      }
    }
    const R = Float64Array.of(...x, ...y, ...z), raw = elementMatrices(section, material, L, { shear });
    // free to twist at both ends (a strut on two ball joints): it carries no torque, and its own spin is nobody's business
    if (springs[3] === 0 && springs[9] === 0) { springs[3] = springs[9] = Infinity; for (const i of [3, 9]) for (const j of [3, 9]) raw.k[i * 12 + j] = raw.m[i * 12 + j] = 0; }
    const c = condense(raw, springs);
    if (!c) refuse('join', `${whose}'s end joints leave it loose: carry more of its rotations`, { element: id });
    const G = shearModulus(material), Wy = section.Wy ?? (section.cz ? section.Iy / section.cz : undefined), Wz = section.Wz ?? (section.cy ? section.Iz / section.cy : undefined);
    return { id, of: e.of, a, b, L, R, raw, ...c, phi: raw.phi, EA: material.E * section.A, EIy: material.E * section.Iy, EIz: material.E * section.Iz, GAy: shear && section.Asy ? G * section.Asy : 0, GAz: shear && section.Asz ? G * section.Asz : 0,
      A: section.A, Wy, Wz, perLength: (material.density || 0) * 1e-6 * section.A, K: toGlobal(c.k, R) };
  });
  // supports
  const held = new Uint8Array(6 * N), ground = new Float64Array(6 * N), supported = [];
  if (model.supports !== undefined && (typeof model.supports !== 'object' || !model.supports)) refuse('support', `supports is ${said(model.supports)}: give each supported node 'fixed', 'pinned' or { x, y, z, rx, ry, rz }`);
  for (const [name, s] of Object.entries(model.supports || {})) {
    const n = nodeOf(name, 'a support'), each = s === 'fixed' ? Object.fromEntries(FREEDOMS.map((f) => [f, true])) : s === 'pinned' ? { x: true, y: true, z: true } : s;
    if (!each || typeof each !== 'object') refuse('support', `node ${said(name)}'s support is ${said(s)}: 'fixed' (all six freedoms), 'pinned' (its three movements), or { x, y, z, rx, ry, rz } each true (held), false, or a spring to ground in N/mm or N·mm/rad`, { node: name });
    let any = false;
    for (const [key, h] of Object.entries(each)) {
      const d = FREEDOMS.indexOf(key);
      if (d < 0) refuse('support', `node ${said(name)}'s support has "${key}": a node's freedoms are ${FREEDOMS.join(', ')}`, { node: name });
      if (h === true || h === 'fixed' || h === Infinity) { held[6 * n + d] = 1; any = true; } else if (typeof h === 'number' && h > 0) { ground[6 * n + d] = h; any = true; } else if (!(h === false || h === 'free' || h === 0 || h === undefined)) refuse('support', `node ${said(name)}'s support has ${key} = ${said(h)}: true (held), false (free), or a spring to ground of 0 or more`, { node: name });
    }
    if (any) supported.push(n);
  }
  if (!supported.length) refuse('unheld', 'nothing is held: give at least one node a support (supports: { a: \'fixed\' }), or the frame just moves');
  const span = Math.max(...[0, 1, 2].map((c) => Math.max(...at.map((p) => p[c])) - Math.min(...at.map((p) => p[c]))));
  return { ids, at, index, N, els, elementIds, held, ground, supported, nodeOf, span };
}

// The loads of one case: forces on every freedom, and each element's spread load in its own axes
function loadCase(f, { loads = [], gravity, masses = {} }) {
  const { N, els, elementIds, nodeOf } = f, nodal = new Float64Array(6 * N), spread = new Float64Array(3 * els.length), lumped = new Float64Array(N);
  if (!Array.isArray(loads)) refuse('load', `loads is ${said(loads)}: a list of { node, force, moment } and { element, spread }`);
  if (gravity !== undefined && !isVec3(gravity)) refuse('load', `gravity is ${said(gravity)}: a direction and size [x, y, z] in N/kg (m/s²), [0, 0, -9.81] for down`);
  if (!masses || typeof masses !== 'object') refuse('mass', `masses is ${said(masses)}: lumped masses in kg by node, { head: 0.4 }`);
  for (const [name, kg] of Object.entries(masses)) {
    const n = nodeOf(name, 'a lumped mass');
    if (!(kg >= 0) || !Number.isFinite(kg)) refuse('mass', `the lumped mass at node ${said(name)} is ${said(kg)}: a mass in kg, 0 or more`, { node: name });
    lumped[n] += kg;
    if (gravity) for (let c = 0; c < 3; c++) nodal[6 * n + c] += kg * gravity[c];
  }
  loads.forEach((l, i) => {
    if (l && l.node !== undefined) {
      const n = nodeOf(l.node, `load ${i + 1}`);
      for (const [key, o] of [['force', 0], ['moment', 3]]) if (l[key] !== undefined) { if (!isVec3(l[key])) refuse('load', `load ${i + 1}'s ${key} is ${said(l[key])}: [x, y, z] in ${o ? 'N·mm' : 'N'}, in global axes`); for (let c = 0; c < 3; c++) nodal[6 * n + o + c] += l[key][c]; }
      if (l.force === undefined && l.moment === undefined) refuse('load', `load ${i + 1}, at node ${said(l.node)}, has neither a force nor a moment`);
    } else if (l && l.element !== undefined) {
      const e = elementIds.get(String(l.element)) ?? refuse('load', `load ${i + 1} names element ${said(l.element)}, which is not in elements`);
      if (!isVec3(l.spread)) refuse('load', `load ${i + 1}'s spread is ${said(l.spread)}: [x, y, z] in N per mm of the element's length`);
      if (l.axes !== undefined && l.axes !== 'global' && l.axes !== 'local') refuse('load', `load ${i + 1}'s axes is ${said(l.axes)}: 'global' or 'local' (the element's own)`);
      const w = l.axes === 'local' ? l.spread : toLocal3(els[e].R, l.spread);
      for (let c = 0; c < 3; c++) spread[3 * e + c] += w[c];
    } else refuse('load', `load ${i + 1} is ${said(l)}: { node, force, moment } or { element, spread }`);
  });
  if (gravity) els.forEach((el, e) => { const w = toLocal3(el.R, gravity); for (let c = 0; c < 3; c++) spread[3 * e + c] += el.perLength * w[c]; });
  return { nodal, spread, lumped };
}
// A spread load's forces at the element's (rigid) ends, in its own axes: w L / 2 each, and moments of w L² / 12
function spreadEnds(L, wx, wy, wz) {
  const fb = new Float64Array(12), h = L / 2, m = (L * L) / 12;
  fb[0] = fb[6] = wx * h; fb[1] = fb[7] = wy * h; fb[2] = fb[8] = wz * h; fb[5] = wy * m; fb[11] = -wy * m; fb[4] = -wz * m; fb[10] = wz * m;
  return fb;
}
const condensedLoad = (el, fb) => { if (!el.T) return fb; const fc = new Float64Array(12); for (let i = 0; i < 12; i++) { const v = fb[i]; if (v) for (let j = 0; j < 12; j++) fc[j] += el.T[i * 12 + j] * v; } return fc; };

/**
 * A frame, read, checked and factorised once, ready for its solves. What is wrong with the model is said here, by
 * name, before any solve: each refusal is an Error with a `code` ("fea.frame." then node, length, section, material,
 * axes, join, support, load, mass, input, unheld or mechanism; buckling adds compression).
 * @param {FrameModel} model
 * @param {{ shear?: boolean }} [o] shear: false ignores the sections' shear areas (Euler-Bernoulli beams)
 * @returns {{
 *   statics: (o?: { loads?: FrameLoad[], gravity?: Vec3, masses?: Record<string, number>, samples?: number }) => StaticResult,
 *   buckling: (o?: { count?: number, loads?: FrameLoad[], gravity?: Vec3, masses?: Record<string, number> }) => { factors: number[], modes: BucklingMode[], statics: StaticResult },
 *   modes: (o?: { count?: number, masses?: Record<string, number> }) => { frequencies: number[], modes: VibrationMode[] },
 *   freedoms: number, nodes: string[] }}
 *   statics, buckling and modes use the model's own loads, gravity and masses unless given others (another load case
 *   on the same factorisation). samples: stations along each element (11). count: how many modes (3 for buckling, 6
 *   for vibration). freedoms: how many unknowns were solved for.
 */
export function frame(model, o = {}) {
  const f = read(model, o), { ids, N, els, held, ground } = f;
  // free freedoms, numbered node by node in an order that keeps the matrix's rows short
  const free = new Int32Array(6 * N).fill(-1), back = [];
  for (const n of ordering(N, els.map((e) => [e.a, e.b]))) for (let d = 0; d < 6; d++) if (!held[6 * n + d]) { free[6 * n + d] = back.length; back.push(6 * n + d); }
  const n = back.length, first = Int32Array.from({ length: n }, (_, i) => i);
  for (const el of els) {
    el.dofs = Int32Array.from({ length: 12 }, (_, i) => free[6 * (i < 6 ? el.a : el.b) + (i % 6)]);
    let lo = n;
    for (const d of el.dofs) if (d >= 0 && d < lo) lo = d;
    for (const d of el.dofs) if (d >= 0 && lo < first[d]) first[d] = lo;
  }
  const assemble = (matrix, scale) => {
    const P = profile(first), { start, v } = P;
    els.forEach((el, e) => { const s = scale ? scale[e] : 1, G = matrix(el), dofs = el.dofs; if (s) for (let i = 0; i < 12; i++) { const di = dofs[i]; if (di >= 0) for (let j = 0; j < 12; j++) { const dj = dofs[j]; if (dj >= 0 && dj <= di) v[start[di] + dj - first[di]] += s * G[i * 12 + j]; } } });
    return P;
  };
  const diagonal = (P, i) => P.start[i] + i - P.first[i];
  const K = assemble((el) => el.K);
  for (let i = 0; i < n; i++) K.v[diagonal(K, i)] += ground[back[i]];
  // A rotation of a node that no element end there carries (every end at it pinned that way) leaves the matrix
  // singular though nothing is wrong with the frame: nothing turns the node, and nothing depends on it. Such a
  // rotation is held still (and reported as 0); a moment put on it is refused, as nothing would carry it.
  const idle = [], turn = new Float64Array(9 * N), stiff = new Float64Array(N);
  for (const el of els) for (const [p, o] of [[el.a, 3], [el.b, 9]]) for (let i = 0; i < 3; i++) { stiff[p] = Math.max(stiff[p], el.raw.k[(o + i) * 13]); for (let j = 0; j < 3; j++) turn[9 * p + 3 * i + j] += el.K[(o + i) * 12 + o + j]; }
  for (let p = 0; p < N; p++) {
    const fr = [3, 4, 5].filter((d) => !held[6 * p + d]), m = fr.length;
    if (!m || !(stiff[p] > 0)) continue;
    const S = Float64Array.from({ length: m * m }, (_, q) => { const i = Math.floor(q / m), j = q % m; return turn[9 * p + 3 * (fr[i] - 3) + fr[j] - 3] + (i === j ? ground[6 * p + fr[i]] : 0); }), { values, V } = jacobi(S, m);
    for (let c = 0; c < m; c++) if (values[c] < 1e-9 * stiff[p]) {
      const v = [0, 0, 0];
      fr.forEach((d, i) => { v[d - 3] = V[i * m + c]; });
      idle.push({ node: p, v });
      for (const di of fr) for (const dj of fr) { const a = free[6 * p + di], b = free[6 * p + dj]; if (b <= a) K.v[K.start[a] + b - first[a]] += stiff[p] * v[di - 3] * v[dj - 3]; }
    }
  }
  const factor = n ? factorise(K) : { solve: (b) => new Float64Array(0), loose: [] };
  if (factor.loose.length) {
    const loose = factor.loose.map((i) => ({ node: ids[Math.floor(back[i] / 6)], freedom: FREEDOMS[back[i] % 6] }));
    const by = new Map(); for (const l of loose) by.set(l.node, [...(by.get(l.node) || []), l.freedom]);
    const list = [...by].slice(0, 8).map(([node, fr]) => `node ${said(node)} (${fr.join(', ')})`).join('; ');
    refuse('mechanism', `the frame is a mechanism: it can still move with nothing resisting, at ${list}${by.size > 8 ? `, and ${by.size - 8} more nodes` : ''}. Hold those freedoms with a support, or join the elements there more stiffly (a pinned end frees its bending rotations and still carries twist, so a strut pinned at both ends can spin: make one end 'ball')`, { loose });
  }
  const shapeOf = (x) => { // a vector over the free freedoms as each node's six: its largest movement 1, and that one positive
    const u = new Float64Array(6 * N);
    for (let i = 0; i < n; i++) u[back[i]] = x[i];
    let most = 0, lead = 0;
    for (let p = 0; p < N; p++) most = Math.max(most, Math.hypot(u[6 * p], u[6 * p + 1], u[6 * p + 2]));
    const moves = most > 0; // (a shape that only turns, such as a shaft's twist, is scaled by its largest rotation)
    for (let i = 0; i < 6 * N; i++) if ((!moves || i % 6 < 3) && Math.abs(u[i]) > Math.abs(lead) * (1 + 1e-9)) lead = u[i];
    const scale = (lead < 0 ? -1 : 1) / ((moves ? most : Math.abs(lead)) || 1);
    return Object.fromEntries(ids.map((id, p) => [id, /** @type {Six} */ (Array.from(u.subarray(6 * p, 6 * p + 6), (v) => v * scale))]));
  };
  const caseOf = (c = {}) => ({ loads: c.loads ?? model.loads, gravity: c.gravity ?? model.gravity, masses: c.masses ?? model.masses });

  function statics(c = {}) {
    const samples = c.samples ?? 11;
    if (!(Number.isInteger(samples) && samples >= 2)) refuse('input', `samples is ${said(samples)}: a whole number of stations along each element, 2 or more`);
    const { nodal, spread } = loadCase(f, caseOf(c)), p = Float64Array.from(nodal);
    for (const { node, v } of idle) { const m = [nodal[6 * node + 3], nodal[6 * node + 4], nodal[6 * node + 5]]; if (Math.abs(m[0] * v[0] + m[1] * v[1] + m[2] * v[2]) > 1e-9 * Math.hypot(...m)) refuse('load', `a moment is put on node ${said(ids[node])} about a direction no element there carries (every end at it is pinned that way): join an end to it rigidly or through a spring, or hold that rotation with a support`, { node: ids[node] }); }
    const ends = els.map((el, e) => {
      const fb = spreadEnds(el.L, spread[3 * e], spread[3 * e + 1], spread[3 * e + 2]), fc = condensedLoad(el, fb);
      for (let q = 0; q < 4; q++) { const g = toGlobal3(el.R, fc, 3 * q), at = 6 * (q < 2 ? el.a : el.b) + 3 * (q % 2); for (let k = 0; k < 3; k++) p[at + k] += g[k]; }
      return { fb, fc };
    });
    const x = factor.solve(Float64Array.from(back, (d) => p[d])), u = new Float64Array(6 * N), residual = Float64Array.from(nodal, (v) => -v);
    for (let i = 0; i < n; i++) u[back[i]] = x[i];
    for (const { node, v } of idle) { const o = 6 * node + 3, along = u[o] * v[0] + u[o + 1] * v[1] + u[o + 2] * v[2]; for (let c = 0; c < 3; c++) u[o + c] = held[o + c] || Math.abs(v[c]) === 1 ? 0 : u[o + c] - along * v[c]; }
    let most = 0, mostAt = 0;
    for (let q = 0; q < N; q++) { const d = Math.hypot(u[6 * q], u[6 * q + 1], u[6 * q + 2]); if (d > most) { most = d; mostAt = q; } }
    if (!x.every(Number.isFinite) || most > 1e6 * (f.span || 1)) refuse('mechanism', 'the frame is barely held: under this load it moves many times its own size. Add supports, or join its elements more stiffly', { loose: [] });
    const elements = els.map((el, e) => {
      const { L, R } = el, { fb, fc } = ends[e], w = [spread[3 * e], spread[3 * e + 1], spread[3 * e + 2]], d = new Float64Array(12), F = new Float64Array(12);
      for (let q = 0; q < 4; q++) d.set(toLocal3(R, u, 6 * (q < 2 ? el.a : el.b) + 3 * (q % 2)), 3 * q);
      for (let i = 0; i < 12; i++) { let s = -fc[i]; for (let j = 0; j < 12; j++) s += el.k[i * 12 + j] * d[j]; F[i] = s; }
      for (let q = 0; q < 4; q++) { const g = toGlobal3(R, F, 3 * q), at = 6 * (q < 2 ? el.a : el.b) + 3 * (q % 2); for (let k = 0; k < 3; k++) residual[at + k] += g[k]; }
      // the beam's own end freedoms, behind any springs: d_beam = T d + H f_s
      let db = d;
      if (el.T) { db = new Float64Array(12); for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += el.T[i * 12 + j] * d[j]; db[i] = s; } el.s.forEach((sp, a) => { el.s.forEach((sq, b) => { db[sp] += el.H[a * el.s.length + b] * fb[sq]; }); }); }
      // N, V and M as polynomials in x, from the forces on end a and the spread load between
      const poly = { N: [-F[0], -w[0], 0], Vy: [-F[1], -w[1], 0], Vz: [-F[2], -w[2], 0], T: [-F[3], 0, 0], My: [-F[4], -F[2], -w[2] / 2], Mz: [-F[5], F[1], w[1] / 2] };
      const value = (c, s) => c[0] + s * (c[1] + s * c[2]), inside = (s) => s > 1e-9 * L && s < L * (1 - 1e-9);
      const xs = Array.from({ length: samples }, (_, i) => (L * i) / (samples - 1));
      for (const c of [poly.My, poly.Mz]) if (c[2] !== 0 && inside(-c[1] / (2 * c[2]))) xs.push(-c[1] / (2 * c[2]));
      xs.sort((a, b) => a - b);
      const along = { x: xs, N: [], Vy: [], Vz: [], T: [], My: [], Mz: [], d: [] }, peak = {};
      for (const key of ['N', 'Vy', 'Vz', 'T', 'My', 'Mz']) { along[key] = xs.map((s) => value(poly[key], s)); let b = 0; along[key].forEach((v, i) => { if (Math.abs(v) > Math.abs(along[key][b])) b = i; }); peak[key] = { value: along[key][b], x: xs[b] }; }
      along.d = xs.map((s) => {
        const xi = s / L, ny = shape(xi, L, el.phi[0]).N, nz = shape(xi, L, el.phi[1]).N, bend = (s * s * (L - s) * (L - s)) / 24, sh = (s * (L - s)) / 2;
        const local = [(1 - xi) * db[0] + xi * db[6] + (w[0] * sh) / el.EA,
          ny[0] * db[1] + ny[1] * db[5] + ny[2] * db[7] + ny[3] * db[11] + (w[1] * bend) / el.EIz + (el.GAy ? (w[1] * sh) / el.GAy : 0),
          nz[0] * db[2] - nz[1] * db[4] + nz[2] * db[8] - nz[3] * db[10] + (w[2] * bend) / el.EIy + (el.GAz ? (w[2] * sh) / el.GAz : 0)];
        return /** @type {Vec3} */ (toGlobal3(R, local));
      });
      const result = { id: el.id, ...(el.of !== undefined ? { of: el.of } : {}), length: L, axes: /** @type {[Vec3, Vec3, Vec3]} */ ([0, 3, 6].map((o) => Array.from(R.subarray(o, o + 3)))),
        ends: { a: /** @type {Six} */ (Array.from(F.subarray(0, 6))), b: /** @type {Six} */ (Array.from(F.subarray(6, 12))) }, along, peak: /** @type {ElementResult['peak']} */ (peak), axial: value(poly.N, L / 2) };
      if (el.Wy && el.Wz) {
        // |N|/A + |My|/Wy + |Mz|/Wz is a quadratic wherever no term changes sign: its peak is at an end, where a
        // moment peaks (both already stations), or where one of the signed sums is level
        const terms = [[poly.N, 1 / el.A], [poly.My, 1 / el.Wy], [poly.Mz, 1 / el.Wz]], at = (s) => terms.reduce((sum, [c, k]) => sum + Math.abs(value(c, s)) * k, 0), tries = [...xs];
        for (const sy of [1, -1]) for (const sz of [1, -1]) { const c1 = poly.N[1] / el.A + (sy * poly.My[1]) / el.Wy + (sz * poly.Mz[1]) / el.Wz, c2 = (sy * poly.My[2]) / el.Wy + (sz * poly.Mz[2]) / el.Wz; if (c2 !== 0 && inside(-c1 / (2 * c2))) tries.push(-c1 / (2 * c2)); }
        let best = 0, bending = 0;
        for (const s of tries) { if (at(s) > at(best)) best = s; bending = Math.max(bending, Math.abs(value(poly.My, s)) / el.Wy + Math.abs(value(poly.Mz, s)) / el.Wz); }
        result.stress = { peak: at(best), bending, axial: value(poly.N, best) / el.A, x: best };
      }
      return result;
    });
    const six = (v, q) => /** @type {Six} */ (Array.from(v.subarray(6 * q, 6 * q + 6)));
    return { displacements: Object.fromEntries(ids.map((id, q) => [id, six(u, q)])), reactions: Object.fromEntries(f.supported.map((q) => [ids[q], six(residual, q).map((v, d) => (held[6 * q + d] || ground[6 * q + d] ? v : 0))])),
      elements, deflection: { most, node: ids[mostAt] } };
  }

  function buckling(c = {}) {
    const count = c.count ?? 3;
    if (!(Number.isInteger(count) && count >= 1)) refuse('input', `count is ${said(count)}: how many buckling modes, a whole number from 1`);
    const s = statics(c), axial = s.elements.map((e) => e.axial), size = Math.max(...axial.map(Math.abs));
    if (!axial.some((a) => a < -1e-9 * Math.max(size, 1e-300))) refuse('compression', 'no element is in compression under these loads, so nothing can buckle: buckling needs a load that squeezes at least one element along its length');
    const B = assemble((el) => toGlobal(el.kg, el.R), axial.map((a) => -a)), { values, vectors } = lowest(factor.solve, B, count, 2 * count + 16);
    const modes = values.map((mu, i) => ({ factor: 1 / mu, shape: shapeOf(vectors[i]) }));
    return { factors: modes.map((m) => m.factor), modes, statics: s };
  }

  function modes(c = {}) {
    const count = c.count ?? 6;
    if (!(Number.isInteger(count) && count >= 1)) refuse('input', `count is ${said(count)}: how many modes, a whole number from 1`);
    const { lumped } = loadCase(f, { masses: c.masses ?? model.masses });
    if (!els.some((el) => el.perLength > 0) && !lumped.some((m) => m > 0)) refuse('mass', 'nothing in the frame has mass, so it has no frequencies: give the materials a density (g/cm³), or lump masses (kg) at nodes');
    const M = assemble((el) => toGlobal(el.m, el.R));
    for (let i = 0; i < n; i++) if (back[i] % 6 < 3) M.v[diagonal(M, i)] += lumped[Math.floor(back[i] / 6)];
    const { values, vectors } = lowest(factor.solve, M, count);
    // K in N/mm against M in kg: ω² = 1000 / μ (a newton is a kg·m/s², and the lengths are mm)
    const found = values.map((mu, i) => ({ frequency: Math.sqrt(1000 / mu) / (2 * Math.PI), shape: shapeOf(vectors[i]) }));
    return { frequencies: found.map((m) => m.frequency), modes: found };
  }

  return { statics, buckling, modes, freedoms: n, nodes: ids };
}

/**
 * How far a frame moves under its loads, and what each element carries. The same as `frame(model).statics()`.
 * @param {FrameModel} model @param {{ shear?: boolean, samples?: number }} [o]
 * @returns {StaticResult}
 */
export const statics = (model, o = {}) => frame(model, o).statics(o);
/**
 * The factors by which a frame's loads must grow to buckle it, lowest first, and the shapes it buckles into: linear
 * buckling, from the geometric stiffness of each element's axial force in the static solve.
 * @param {FrameModel} model @param {{ shear?: boolean, count?: number }} [o] count: how many modes (3)
 * @returns {{ factors: number[], modes: BucklingMode[], statics: StaticResult }}
 */
export const buckling = (model, o = {}) => frame(model, o).buckling(o);
/**
 * A frame's lowest natural frequencies, in Hz, and their shapes, from the elements' consistent mass and the lumped masses.
 * @param {FrameModel} model @param {{ shear?: boolean, count?: number }} [o] count: how many modes (6)
 * @returns {{ frequencies: number[], modes: VibrationMode[] }}
 */
export const modes = (model, o = {}) => frame(model, o).modes(o);

/**
 * The same frame with every element cut into `pieces` equal lengths, for buckling and modes: one element cannot bow
 * between its own ends, so a column's Euler load is 22% out with one element, 0.8% with two and 0.05% with four. New
 * nodes are named "<element>/<k>" (or added to the end of a list of nodes), new elements "<element>/<k>" with `of`
 * naming the element they came from; end joints stay at the member's own ends, and spread loads follow their pieces.
 * @param {FrameModel} model @param {number} [pieces] 4
 * @returns {FrameModel}
 */
export function subdivide(model, pieces = 4) {
  if (!(Number.isInteger(pieces) && pieces >= 1)) refuse('input', `pieces is ${said(pieces)}: a whole number of pieces for each element, 1 or more`);
  if (!model || typeof model !== 'object' || !model.nodes || !Array.isArray(model.elements)) refuse('input', 'a frame is { nodes, elements, supports, loads }');
  const list = Array.isArray(model.nodes), nodes = list ? [...model.nodes] : { ...model.nodes }, parts = new Map();
  const elements = model.elements.flatMap((e, i) => {
    const id = e.id ?? i, pa = model.nodes[e.a], pb = model.nodes[e.b];
    for (const [end, p] of [[e.a, pa], [e.b, pb]]) if (!isVec3(p)) refuse('node', `element ${said(id)} names node ${said(end)}, which is not in nodes`, { node: end });
    const mid = Array.from({ length: pieces - 1 }, (_, k) => { const t = (k + 1) / pieces, p = /** @type {Vec3} */ (pa.map((v, c) => v + t * (pb[c] - v))); if (list) return nodes.push(p) - 1; nodes[`${id}/${k + 1}`] = p; return `${id}/${k + 1}`; });
    const made = Array.from({ length: pieces }, (_, k) => ({ ...e, id: pieces === 1 ? id : `${id}/${k + 1}`, of: e.of ?? id, a: k ? mid[k - 1] : e.a, b: k < pieces - 1 ? mid[k] : e.b,
      ends: { a: k ? 'rigid' : e.ends?.a ?? 'rigid', b: k < pieces - 1 ? 'rigid' : e.ends?.b ?? 'rigid' } }));
    parts.set(String(id), made.map((m) => m.id));
    return made;
  });
  const loads = (model.loads || []).flatMap((l) => (l && 'element' in l && parts.has(String(l.element)) ? parts.get(String(l.element)).map((element) => ({ ...l, element })) : [l]));
  return { ...model, nodes, elements, ...(model.loads ? { loads } : {}) };
}
