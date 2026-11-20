// A profile: a beam's constant section, as a model from its rule set (every figure with how far to trust it and where
// it comes from), its outline as closed loops drawn from the interface dimensions, and what that outline is worth as a
// beam (area, second moments, torsion constant) beside the figures on the maker's sheet.
//
// Every profile, slot family and slot nut is a rule set in @rulecad/rules, so the numbers are open data and live
// there. A section is drawn in x (across, its width) and y (up, its height), with the middle of its envelope at the
// origin; the beam runs along z. Its faces are top (+y), bottom (-y), front (-x) and back (+x). Units: mm, degrees.
import { SETS, FIELDS, OUTLINES } from './catalogue.mjs';
import { polygonSection, torsionConstant, signedArea, gap, inside } from './section.mjs';

export { polygonSection, torsionConstant, signedArea } from './section.mjs';

/**
 * What this release is: `'ready'` from 0.1.0, when the package has functions to call (`'placeholder'` before).
 * @type {Readonly<{ release: 'placeholder' | 'ready', plan: string }>}
 */
export const status = Object.freeze({ release: 'ready', plan: 'https://github.com/JoniBach/rulecad/issues/240' });

/**
 * The rules this package adds to the profiles' own figures, each with what it comes from.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string }>}
 */
export const DEFAULTS = {
  section: { value: 0.05, unit: '', rule: 'How far the area or the mass worked out from the drawn outline may be from the sheet\'s before a check says so. The outline is drawn from a handful of dimensions and leaves out the fillets, ribs and grooves of a real extrusion: on the makers\' sheets read so far, a section whose slot is fully dimensioned comes within this, and one outside it has a dimension wrong or a shape the drawing does not cover', kind: 'estimate' },
  inertia: { value: 0.1, unit: '', rule: 'The same for a second moment of area, which weighs metal by the square of its distance from the middle: what a simple outline gets wrong is at the faces, so it counts about twice', kind: 'estimate' },
  torsion: { value: 0.15, unit: '', rule: 'The same for the torsion constant, which goes with the cube of a wall\'s thickness: three times the allowance', kind: 'estimate' },
  thread: { value: 0.5, unit: '', rule: 'The least share of a full thread\'s height that a bore should leave for a tapped thread: (major diameter - bore) / (1.299 x pitch). A standard tap drill leaves about three quarters. Under half is said (makers do it: a notched bore meant for a thread-forming screw); under a quarter is taken for the wrong thread', kind: 'estimate' },
  outline: { value: 0.2, unit: 'mm', rule: 'How far the envelope of a measured outline may be from the set\'s width and height before a check says so: an extrusion\'s own tolerance on a 20 to 40 mm side is 0.15 to 0.2 mm (item\'s and Rexroth\'s tables), so more than this is another section or another scale', kind: 'estimate' },
  cells: { value: 40000, unit: 'cells', rule: 'Raster cells over a section\'s bounding box when solving for its torsion constant: 0.1 mm cells on a 20 mm section, which settles a solid rectangle to about 1%', kind: 'default' },
};

const FAMILIES = ['t-slot', 'v-slot', 'tube', 'round-tube', 'angle', 'channel', 'bar', 'round-bar', 'custom', 'printed'];
const FACES = ['top', 'bottom', 'front', 'back'];
const RAD = Math.PI / 180;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const r4 = (x) => +x.toFixed(4);
const near = (a, b) => { // edits between two names, to suggest the nearest
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const guess = (name, among) => { const g = among.map((a) => [near(String(name), a), a]).sort((a, b) => a[0] - b[0])[0]; return g && g[0] <= 3 ? ` (did you mean ${g[1]}?)` : ''; };
const ofPart = (part) => Object.values(SETS).filter((s) => s.part === part).map((s) => s.name);

/** @returns {string[]} the names of the profiles in the catalogue */
export const profiles = () => ofPart('profile');
/** @returns {string[]} the names of the slot families in the catalogue */
export const slots = () => ofPart('slot');
/** @returns {string[]} the names of the slot nuts in the catalogue */
export const slotNuts = () => ofPart('slot_nut');

/**
 * @typedef {{ value: number | string | number[], unit?: string, kind: string, source: string, rule?: string, checked?: string }} Figure
 * @typedef {{ name?: string, part?: string, rules: Record<string, any> }} RuleSet
 * @typedef {{ sets?: Record<string, RuleSet>, load?: (name: string) => RuleSet | undefined, outline?: object }} Given rule sets
 *   of your own by name (a slot family, a thread, a material), a function that finds one, and a measured outline
 * @typedef {{ kind: 'slot', name: string, figures: Record<string, Figure>, opening: number, mouth: number, lip: number,
 *   lipAngle: number, cavityWidth: number, cavityDepth: number, floorWidth: number, flankAngle: number, straight: number,
 *   trackWidth: number, trackAngle: number, grooveWidth: number, grooveDepth: number, nutFamily: string }} Slot
 * @typedef {{ face: 'top' | 'bottom' | 'front' | 'back', index: number, slot: string | null, at: [number, number], normal: [number, number], along: [number, number] }} FaceSlot
 * @typedef {{ at: [number, number], diameter: number, thread: string | null, threadSet: string | null, tapDrill: number | null, major: number | null, threadPitch: number | null, where: 'cell' | 'corner' | 'given' }} Bore
 * @typedef {{ at: [number, number], axis: 'x' | 'y', width: number, length: number, depth: number, ends: [number, number], slot: string }} Chamber the
 *   closed hollow between two cells: axis x between cells side by side (its width runs up y), axis y between cells one
 *   above the other (its width runs along x); ends are its half widths toward - and + along that width; depth is how far it reaches each side of the line between the cells
 * @typedef {{ at: [number, number], width: number }} Hollow a closed square hollow in a corner, by its centre and side
 * @typedef {{ loops: number[][][], source: string, licence: string, name?: string }} MeasuredOutline
 * @typedef {{ kind: 'profile', name: string, family: string, series: number, cells: [number, number], absent: [number, number][], pitch: [number, number],
 *   title: string, width: number, height: number, cornerRadius: number, wall: number, figures: Record<string, Figure>,
 *   faces: Record<'top' | 'bottom' | 'front' | 'back', FaceSlot[]>, slots: Record<string, Slot>, bores: Bore[], end: { thread: string, at: [number, number] } | null, chambers: Chamber[], hollows: Hollow[],
 *   sheet: { area: number | null, inertiaX: number | null, inertiaY: number | null, modulusX: number | null, modulusY: number | null, torsion: number | null, massPerMetre: number | null },
 *   material: { name: string, alloy: string | null, density: number | null, modulus: number | null, poisson: number | null, strength: number | null, figures: Record<string, Figure> } | null,
 *   supply: { lengths: number[], cutMin: number | null, cutMax: number | null, cutTolerance: number | null, straightness: number | null, twist: number | null },
 *   measured: MeasuredOutline | null, rests: string[] }} Profile
 */

const finder = (given) => (name) => given.sets?.[name] ?? given.load?.(name) ?? SETS[name];
function figuresOf(what, set, change) {
  const figures = Object.fromEntries(Object.entries(set.rules).map(([n, r]) => [n, { ...r }]));
  for (const [n, c] of Object.entries(change)) {
    // a figure the set has, or one it could have: any name of the vocabulary's, so a typo is still caught
    if (!figures[n] && !FIELDS[n]) throw new Error(`${what}: ${set.name} has no figure "${n}"${guess(n, [...Object.keys(figures), ...Object.keys(FIELDS)])}`);
    const was = figures[n] ?? (FIELDS[n].unit != null ? { unit: FIELDS[n].unit } : {});
    figures[n] = typeof c === 'object' && c && !Array.isArray(c) ? { kind: 'given', source: `given to ${what}`, ...was, ...c } : { ...was, value: c, kind: 'given', source: `given to ${what}` };
    if (figures[n].value == null) throw new Error(`${what}: ${n} needs a value (got ${shown(c)})`);
  }
  return figures;
}
const reader = (what, name, figures) => {
  const v = (n, fallback) => figures[n]?.value ?? fallback;
  const num = (n, fallback) => { const x = v(n, fallback); if (x != null && !isNum(x)) throw new Error(`${what}: ${name}: ${n} is a number (got ${shown(x)})`); return x; };
  const positive = (n) => { const x = v(n); if (!(isNum(x) && x > 0)) throw new Error(`${what}: ${name}: ${n} is a number above 0 (got ${shown(x)})`); return x; };
  return { v, num, positive };
};

/**
 * A slot family by name, from its rule set, or from a rule set of your own in the same names.
 * @param {string | RuleSet} which 'slot-6-misumi', or a rule set with "part": "slot"
 * @param {Record<string, number | string | Figure>} [change] a different or measured figure, by its rule's name
 * @param {Given} [given]
 * @returns {Slot}
 */
export function slotModel(which, change = {}, given = {}) {
  const what = 'slotModel', find = finder(given);
  const set = typeof which === 'string' ? find(which) : which;
  if (typeof which === 'string' && !set) throw new Error(`${what}: no slot family "${which}"${guess(which, slots())}. There are: ${slots().join(', ')}. For another, hand in a rule set of your own in the same names`);
  if (!set || typeof set !== 'object' || !set.rules) throw new Error(`${what}: give a slot family's name (${slots().join(', ')}) or a rule set, not ${shown(which)}`);
  if (set.part && set.part !== 'slot') throw new Error(`${what}: ${set.name} is a ${set.part}, not a slot`);
  const name = set.name ?? 'slot', figures = figuresOf(what, { ...set, name }, change), { num, positive, v } = reader(what, name, figures);
  const opening = positive('opening'), lip = positive('lip_thickness'), cavityWidth = positive('cavity_width'), cavityDepth = positive('cavity_depth');
  const floorWidth = num('floor_width', cavityWidth), flankAngle = num('flank_angle', floorWidth < cavityWidth ? 45 : 90), lipAngle = num('lip_angle', 0), trackWidth = num('track_width', 0), trackAngle = num('track_angle', 90);
  if (!(opening < cavityWidth)) throw new Error(`${what}: ${name}: cavity_width is wider than opening, ${opening} (got ${cavityWidth}), or the slot holds no nut`);
  if (!(lip < cavityDepth)) throw new Error(`${what}: ${name}: cavity_depth is deeper than lip_thickness, ${lip} (got ${cavityDepth})`);
  if (!(floorWidth > 0 && floorWidth <= cavityWidth)) throw new Error(`${what}: ${name}: floor_width is above 0 and at most cavity_width, ${cavityWidth} (got ${shown(floorWidth)})`);
  if (!(flankAngle > 0 && flankAngle <= 90)) throw new Error(`${what}: ${name}: flank_angle is above 0 and at most 90 degrees (got ${shown(flankAngle)})`);
  if (!(lipAngle >= 0 && lipAngle < 90)) throw new Error(`${what}: ${name}: lip_angle is from 0 to under 90 degrees (got ${shown(lipAngle)})`);
  // where the flanks start, from the face: the floor's depth less what the flanks take to close in
  const under = lip + ((cavityWidth - opening) / 2) * Math.tan(lipAngle * RAD), closing = floorWidth < cavityWidth ? ((cavityWidth - floorWidth) / 2) * Math.tan(flankAngle * RAD) : 0, straight = cavityDepth - closing;
  if (straight < under - 1e-9) throw new Error(`${what}: ${name}: its flanks would start above the underside of its lips: closing from ${cavityWidth} to a floor of ${floorWidth} at ${flankAngle} degrees takes ${r4(closing)} of depth, and there is ${r4(cavityDepth - under)} below the lips. A wider floor_width, a deeper cavity_depth or a shallower flank_angle fits`);
  const grooveWidth = num('groove_width', 0), grooveDepth = num('groove_depth', 0);
  if ((grooveWidth > 0) !== (grooveDepth > 0) || grooveWidth < 0 || grooveDepth < 0) throw new Error(`${what}: ${name}: a groove in the floor has both groove_width and groove_depth above 0 (got ${shown(v('groove_width'))} and ${shown(v('groove_depth'))})`);
  if (grooveWidth && !(grooveWidth < floorWidth)) throw new Error(`${what}: ${name}: groove_width is narrower than the floor, ${floorWidth} (got ${grooveWidth}): a groove as wide as the floor is a deeper cavity_depth`);
  if (trackWidth) {
    if (!(trackWidth > opening)) throw new Error(`${what}: ${name}: track_width is wider than opening, ${opening} (got ${trackWidth})`);
    if (!(trackAngle > 0 && trackAngle < 180)) throw new Error(`${what}: ${name}: track_angle is between 0 and 180 degrees (got ${shown(trackAngle)})`);
    const deep = (trackWidth - opening) / 2 / Math.tan((trackAngle / 2) * RAD);
    if (deep > lip + 1e-9) throw new Error(`${what}: ${name}: its V mouth is ${r4(deep)} deep, more than lip_thickness (${lip}): a narrower track_width or a wider track_angle fits`);
  }
  return { kind: 'slot', name, figures, opening, mouth: trackWidth || opening, lip, lipAngle, cavityWidth, cavityDepth, floorWidth, flankAngle, straight, trackWidth, trackAngle, grooveWidth, grooveDepth, nutFamily: String(v('nut_family', name)) };
}

/**
 * A slot's outline as it cuts into a face: points [u, v], u along the face from the slot's centre, v the depth below
 * the face, from the left edge of its mouth round the cavity to the right edge. Open: the face closes it.
 * @param {Slot} slot @returns {number[][]}
 */
export function slotPath(slot) {
  if (!slot || slot.kind !== 'slot') throw new Error(`slotPath: give a slot's model (slotModel), not ${shown(slot)}`);
  const { opening: o, lip: t, cavityWidth: W, cavityDepth: D, floorWidth: f, straight: s, trackWidth: tw, trackAngle, lipAngle } = slot;
  const half = [[-(tw || o) / 2, 0]];
  if (tw) half.push([-o / 2, (tw - o) / 2 / Math.tan((trackAngle / 2) * RAD)]);
  half.push([-o / 2, t], [-W / 2, t + ((W - o) / 2) * Math.tan(lipAngle * RAD)], [-W / 2, s], [-f / 2, D]);
  if (slot.grooveWidth) half.push([-slot.grooveWidth / 2, D], [-slot.grooveWidth / 2, D + slot.grooveDepth]);
  const all = [...half, ...half.map(([u, v]) => [-u, v]).reverse()];
  return all.filter((p, i) => !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-9);
}

// A thread set from how a rule writes it: its set's name (m5), or the thread as written (M5, 1/4-20 UNC)
function threadSet(written, find) {
  if (written == null || written === '') return null;
  const w = String(written), k = w.toLowerCase().replace(/\./g, '_').replace(/[^a-z0-9_]/g, '');
  for (const n of [w, k]) { const s = find(n); if (s?.part === 'thread') return s; }
  return Object.values(SETS).find((s) => s.part === 'thread' && String(s.rules.thread?.value).toLowerCase() === w.toLowerCase()) ?? null;
}
// A face's slots as its rule writes them: one family or "closed" for all of them, or one of either per slot
function faceSlots(what, name, rule, written, count) {
  const each = String(written).split(',').map((s) => s.trim()).filter(Boolean);
  if (each.length !== 1 && each.length !== count) throw new Error(`${what}: ${name}: ${rule} names one slot family (or closed) for the whole face, or ${count}, one for each slot along it (got ${shown(written)})`);
  return Array.from({ length: count }, (_, i) => { const s = each.length === 1 ? each[0] : each[i]; return s === 'closed' || s === 'none' ? null : s; });
}

/**
 * A measured outline held to its format: a name, the source it was measured from and that source's licence, and closed
 * loops of [x, y] points in mm. Comes back with the outside of the metal counter-clockwise and each hole clockwise,
 * whichever way the file ran them (a loop inside an odd number of others is a hole).
 * @param {any} data the file's JSON: { name, source, licence, loops: [[[x, y], ...], ...] }
 * @returns {MeasuredOutline}
 */
export function readOutline(data) {
  const what = 'readOutline';
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${what}: an outline is an object with "source", "licence" and "loops", not ${shown(data)}`);
  for (const k of ['source', 'licence']) if (!(typeof data[k] === 'string' && data[k])) throw new Error(`${what}: an outline says its ${k}: what it was measured from, and the terms that came with it (got ${shown(data[k])})`);
  if (data.unit != null && data.unit !== 'mm') throw new Error(`${what}: an outline is in mm (got unit ${shown(data.unit)})`);
  if (!Array.isArray(data.loops) || !data.loops.length) throw new Error(`${what}: "loops" is a list of closed loops, each a list of [x, y] points (got ${shown(data.loops)})`);
  const loops = data.loops.map((loop, i) => {
    if (!Array.isArray(loop) || loop.length < 3) throw new Error(`${what}: loop ${i + 1} needs at least 3 points`);
    for (const p of loop) if (!(Array.isArray(p) && p.length === 2 && p.every(isNum))) throw new Error(`${what}: loop ${i + 1}: a point is [x, y] in mm (got ${shown(p)})`);
    if (Math.abs(signedArea(loop)) < 1e-9) throw new Error(`${what}: loop ${i + 1} encloses no area`);
    return loop.map(([x, y]) => [x, y]);
  });
  const turned = loops.map((loop, i) => { const depth = loops.filter((other, j) => j !== i && inside(loop[0], other)).length, ccw = signedArea(loop) > 0; return (depth % 2 === 0) === ccw ? loop : loop.slice().reverse(); });
  return { loops: turned, source: data.source, licence: data.licence, ...(data.name ? { name: data.name } : {}) };
}

/**
 * A profile by name, from its rule set and its slot families', or from a rule set of your own (for a section not in
 * the catalogue). Cells are expanded: every slot on every face and every bore has its place.
 * @param {string | RuleSet} which 'profile-2020-misumi-hfs5' (or without the 'profile-'), or a rule set with "part": "profile"
 * @param {Record<string, number | string | number[] | Figure>} [change] a different or measured figure, by its
 *   rule's name: { bore_diameter: 5 } or { area: { value: 161, kind: 'measured', source: 'weighed a metre' } }
 * @param {Given} [given] slot families, threads and materials of your own, and a measured outline to use in place of the drawn one
 * @returns {Profile}
 */
export function profileModel(which, change = {}, given = {}) {
  const what = 'profileModel', find = finder(given);
  let set = which;
  if (typeof which === 'string') {
    set = find(which) ?? find(`profile-${which}`);
    if (!set) throw new Error(`${what}: no profile "${which}"${guess(which.replace(/^profile-/, ''), profiles().map((n) => n.replace(/^profile-/, '')))}. There are: ${profiles().join(', ')}. For another, hand in a rule set of your own in the same names`);
  }
  if (!set || typeof set !== 'object' || !set.rules) throw new Error(`${what}: give a profile's name (${profiles().join(', ')}) or a rule set, not ${shown(which)}`);
  if (set.part && set.part !== 'profile') throw new Error(`${what}: ${set.name} is a ${set.part}, not a profile`);
  const name = set.name ?? 'profile', figures = figuresOf(what, { ...set, name }, change), { v, num, positive } = reader(what, name, figures);
  const family = v('family');
  if (!FAMILIES.includes(family)) throw new Error(`${what}: ${name}: family is one of ${FAMILIES.join(', ')} (got ${shown(family)})`);
  const width = positive('width'), height = positive('height'), round = family === 'round-tube' || family === 'round-bar';
  if (round && width !== height) throw new Error(`${what}: ${name}: a round section's width and height are both its diameter (got ${width} and ${height})`);
  const series = num('series', Math.min(width, height)), cells = [num('cells_across', 1), num('cells_up', 1)];
  for (const [k, c] of [['cells_across', cells[0]], ['cells_up', cells[1]]]) if (!(Number.isInteger(c) && c >= 1)) throw new Error(`${what}: ${name}: ${k} is a whole number of cells, 1 or more (got ${shown(c)})`);
  const pitch = [width / cells[0], height / cells[1]], cornerRadius = num('corner_radius', 0), wall = num('wall', 0);
  // cells of the grid that are not there (a C-beam's two upper middle ones): [across, up] from 1, as the set writes them
  const absent = String(v('cells_absent', '')).split(';').map((p) => p.trim()).filter(Boolean).map((p) => p.split(',').map((x) => Number(x.trim())));
  for (const c of absent) if (!(c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 1 && c[0] <= cells[0] && c[1] >= 1 && c[1] <= cells[1])) throw new Error(`${what}: ${name}: cells_absent is across,up pairs inside the grid of ${cells[0]} by ${cells[1]}, counted from 1, with semicolons between: 2,2; 3,2 (got ${shown(v('cells_absent'))})`);
  if (absent.length >= cells[0] * cells[1]) throw new Error(`${what}: ${name}: cells_absent leaves no cell`);
  const has = (i, j) => i >= 0 && j >= 0 && i < cells[0] && j < cells[1] && !absent.some((c) => c[0] === i + 1 && c[1] === j + 1), centre = (i, j) => [(i - (cells[0] - 1) / 2) * pitch[0], (j - (cells[1] - 1) / 2) * pitch[1]];
  if (!(cornerRadius >= 0 && cornerRadius <= Math.min(width, height) / 2)) throw new Error(`${what}: ${name}: corner_radius is from 0 to half the smaller side, ${Math.min(width, height) / 2} (got ${shown(cornerRadius)})`);
  if (['tube', 'round-tube', 'angle', 'channel'].includes(family) && !(wall > 0 && wall < Math.min(width, height) / (family === 'angle' ? 1 : 2))) throw new Error(`${what}: ${name}: a ${family} needs a wall above 0 and thinner than ${family === 'angle' ? 'its legs' : 'half its smaller side'} (got ${shown(v('wall'))})`);
  // ---- slots: the family on every face, then each face's own ----
  const slotted = !['tube', 'round-tube', 'angle', 'channel', 'bar', 'round-bar'].includes(family), all = v('slot', 'closed');
  for (const f of ['slot', ...FACES.map((n) => `slot_${n}`)]) if (!slotted && figures[f] && !/^(closed|none)$/.test(String(v(f)))) throw new Error(`${what}: ${name}: a ${family} has no slots, so ${f} is closed or left out (got ${shown(v(f))})`);
  const slotsUsed = {}, faces = {}, place = { top: [0, 1, 1, 0], bottom: [0, -1, 1, 0], front: [-1, 0, 0, 1], back: [1, 0, 0, 1] };
  for (const face of FACES) {
    const [nx, ny, ax, ay] = place[face], count = ax ? cells[0] : cells[1], step = ax ? pitch[0] : pitch[1];
    const names = slotted ? faceSlots(what, name, figures[`slot_${face}`] ? `slot_${face}` : 'slot', v(`slot_${face}`, all), count) : Array(count).fill(null);
    for (const slot of names) if (slot && !slotsUsed[slot]) { const s = find(slot); if (!s) throw new Error(`${what}: ${name}: no slot family "${slot}"${guess(slot, slots())}. There are: ${slots().join(', ')}`); slotsUsed[slot] = slotModel(s, {}, given); }
    // one place for every side of a cell that looks this way with no cell beyond it: the outside faces, and the faces a
    // missing cell leaves open. index counts along the face from 1, whichever row or column the side is in
    faces[face] = [];
    for (let k = 0; k < count; k++) for (let q = 0; q < (ax ? cells[1] : cells[0]); q++) {
      const [i, j] = ax ? [k, q] : [q, k];
      if (!has(i, j) || has(i + nx, j + ny)) continue;
      const c = centre(i, j);
      faces[face].push({ face, index: k + 1, slot: names[k], at: [c[0] + (nx * pitch[0]) / 2, c[1] + (ny * pitch[1]) / 2], normal: [nx, ny], along: [ax, ay] });
    }
  }
  // ---- bores: the centre of each cell, corners, or where the set says ----
  const bores = [], boreD = num('bore_diameter', 0), at = String(v('bore_at', 'cells')).trim();
  const thread = (rule) => { const written = v(rule, null), s = threadSet(written, find), n = (k) => (isNum(s?.rules[k]?.value) ? s.rules[k].value : null); return { thread: written == null ? null : String(written), threadSet: s?.name ?? null, tapDrill: n('tap_drill'), major: n('major_diameter'), threadPitch: n('pitch') }; };
  if (boreD > 0 && at !== 'none') {
    const centres = at === 'cells' ? Array.from({ length: cells[0] * cells[1] }, (_, k) => [k % cells[0], Math.floor(k / cells[0])]).filter(([i, j]) => has(i, j)).map(([i, j]) => centre(i, j))
      : at.split(';').map((p) => p.split(',').map((x) => Number(x.trim())));
    for (const c of centres) { if (!(c.length === 2 && c.every(isNum))) throw new Error(`${what}: ${name}: bore_at is cells, none, or x,y pairs with semicolons between: -10,0; 10,0 (got ${shown(at)})`); bores.push({ at: c, diameter: boreD, ...thread('bore_thread'), where: at === 'cells' ? 'cell' : 'given' }); }
  }
  // ---- a printed end's fixing: the thread its insert or captive nut takes, and where it sits ----
  let end = null;
  if (figures.end_thread || figures.end_at) {
    const et = v('end_thread'), ea = String(v('end_at', '0,0')).split(',').map((x) => Number(x.trim()));
    if (!threadSet(et, find)) throw new Error(`${what}: ${name}: end_thread is a thread its rule sets know, as M4 (got ${shown(et)})`);
    if (!(ea.length === 2 && ea.every(isNum) && Math.abs(ea[0]) < width / 2 && Math.abs(ea[1]) < height / 2)) throw new Error(`${what}: ${name}: end_at is x,y inside the section, from its middle: 0,-3.9 (got ${shown(v('end_at'))})`);
    end = { thread: String(et), at: ea };
  }
  const cornerD = num('corner_bore_diameter', 0);
  if (cornerD > 0) { const inset = positive('corner_bore_inset'); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bores.push({ at: [a * (width / 2 - inset), b * (height / 2 - inset)], diameter: cornerD, ...thread('corner_bore_thread'), where: 'corner' }); }
  // ---- a closed square hollow in each corner, where the section has them ----
  const hollows = [], hollowW = num('corner_hollow_width', 0);
  if (hollowW > 0) { const hw = positive('corner_hollow_wall'), c = hw + hollowW / 2; if (!(c + hollowW / 2 < Math.min(width, height) / 2)) throw new Error(`${what}: ${name}: a corner hollow of ${hollowW} behind a wall of ${hw} passes the middle of the section`); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) hollows.push({ at: [a * (width / 2 - c), b * (height / 2 - c)], width: hollowW }); }
  // ---- the closed hollow where two cells' cavities meet back to back ----
  const chambers = [], base = slotted && !/^(closed|none)$/.test(String(all)) ? String(all).split(',')[0].trim() : null;
  if (base && !slotsUsed[base]) slotsUsed[base] = slotModel(find(base) ?? base, {}, given);
  const chamberWidth = num('chamber_width', base ? slotsUsed[base].cavityWidth : 0);
  if (!(chamberWidth >= 0)) throw new Error(`${what}: ${name}: chamber_width is 0 (a solid web between cells) or more (got ${shown(chamberWidth)})`);
  const chamberLength = num('chamber_length', 0);
  if (!(chamberLength >= 0 && chamberLength < Math.min(...pitch))) throw new Error(`${what}: ${name}: chamber_length is from 0 to under a cell's size (got ${shown(chamberLength)})`);
  const chamberDepth = num('chamber_depth', base ? slotsUsed[base].cavityDepth : 0);
  if (figures.chamber_depth && !(chamberDepth > 0 && chamberDepth < Math.min(...pitch) / 2)) throw new Error(`${what}: ${name}: chamber_depth is above 0 and under half a cell's size, ${Math.min(...pitch) / 2} (got ${shown(chamberDepth)})`);
  if (base && chamberWidth > 0) {
    // An end that points at an outside face has chamber_width. An end that points at a place where four cells meet (a
    // grid both ways) has three other hollows for neighbours there, so it keeps to the cavity's own width: the hollows
    // then stand as far apart as two slots do round a cell's corner, which is the web a cell is known to have
    // (an end has its full width only where neither cell beyond it is there: a plain outside face. One cell there is a
    // corner with slots and another hollow round it, as close as where four meet)
    const own = Math.min(chamberWidth, slotsUsed[base].cavityWidth) / 2, end = (a, b) => (has(...a) || has(...b) ? own : chamberWidth / 2);
    for (let j = 0; j < cells[1]; j++) for (let i = 0; i + 1 < cells[0]; i++) if (has(i, j) && has(i + 1, j)) chambers.push({ at: [(i + 1 - cells[0] / 2) * pitch[0], (j - (cells[1] - 1) / 2) * pitch[1]], axis: 'x', width: chamberWidth, length: chamberLength, depth: chamberDepth, ends: [end([i, j - 1], [i + 1, j - 1]), end([i, j + 1], [i + 1, j + 1])], slot: base });
    for (let i = 0; i < cells[0]; i++) for (let j = 0; j + 1 < cells[1]; j++) if (has(i, j) && has(i, j + 1)) chambers.push({ at: [(i - (cells[0] - 1) / 2) * pitch[0], (j + 1 - cells[1] / 2) * pitch[1]], axis: 'y', width: chamberWidth, length: chamberLength, depth: chamberDepth, ends: [end([i - 1, j], [i - 1, j + 1]), end([i + 1, j], [i + 1, j + 1])], slot: base });
  }
  // ---- what the sheet says it is worth, what it is made of, how it is sold ----
  const sheet = { area: num('area', null), inertiaX: num('inertia_x', null), inertiaY: num('inertia_y', null), modulusX: num('section_modulus_x', null), modulusY: num('section_modulus_y', null), torsion: num('torsion_constant', null), massPerMetre: num('mass_per_metre', null) };
  let material = null;
  if (figures.material) {
    const m = find(String(v('material')));
    if (!m) throw new Error(`${what}: ${name}: material names a material's rule set, and there is no "${v('material')}"${guess(v('material'), Object.keys(SETS).filter((n) => SETS[n].rules.density))}`);
    const mv = (k) => (isNum(m.rules[k]?.value) ? m.rules[k].value : null);
    material = { name: m.name, alloy: figures.alloy ? String(v('alloy')) : null, density: mv('density'), modulus: mv('modulus'), poisson: mv('poisson'), strength: mv('strength'), figures: Object.fromEntries(Object.entries(m.rules).map(([n, r]) => [n, { ...r }])) };
  }
  const lengths = v('lengths', []);
  if (!Array.isArray(lengths)) throw new Error(`${what}: ${name}: lengths is a list (got ${shown(lengths)})`);
  const supply = { lengths, cutMin: num('cut_length_min', null), cutMax: num('cut_length_max', null), cutTolerance: num('cut_tolerance', null), straightness: num('straightness_per_metre', null), twist: num('twist_per_metre', null) };
  // a measured outline: the one handed in, or the kit's own beside the set (rules/outlines/<name>.json)
  const drawn = given.outline ?? OUTLINES[name];
  if (family === 'custom' && !drawn) throw new Error(`${what}: ${name}: a custom profile is its outline, and none came with it: hand one in ({ outline: { source, licence, loops } }), or keep it beside the set as rules/outlines/${name}.json`);
  const measured = drawn ? readOutline(drawn) : null;
  const fig = (x) => String(+x.toFixed(2)), size = round ? `Ø${fig(width)}` : `${fig(width)} x ${fig(height)}`, plain = { tube: 'tube', 'round-tube': 'round tube', angle: 'angle', channel: 'channel', bar: 'bar', 'round-bar': 'round bar' }[family];
  const title = plain ? `${size}${wall ? ` x ${fig(wall)}` : ''} ${plain}${figures.material ? `, ${v('material')}` : ''}` : `${size} ${family} (${name})`;
  const kinds = new Set([...Object.values(figures), ...Object.values(slotsUsed).flatMap((s) => Object.values(s.figures))].map((f) => f.kind));
  return { kind: 'profile', name, title, family, series, cells, absent, pitch, width, height, cornerRadius, wall, figures, faces, slots: slotsUsed, bores, end, chambers, hollows, sheet, material, supply, measured, rests: [...kinds] };
}

// ---------- the outline ----------
const SEG = 12; // segments to a quarter turn
function isModel(what, m) { if (!m || m.kind !== 'profile') throw new Error(`${what}: give a profile's model (profileModel), not ${shown(m)}`); return m; }
// A circle as a polygon of the same area, so a bore takes away what a round hole does
function circle([cx, cy], d, clockwise) {
  const n = 4 * SEG, r = (d / 2) * Math.sqrt((2 * Math.PI) / (n * Math.sin((2 * Math.PI) / n))), pts = Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
  return clockwise ? pts.reverse() : pts;
}
// A rectangle with round corners, counter-clockwise from the start of its bottom edge
function roundRect(w, h, r) {
  if (!(r > 1e-9)) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const pts = [];
  for (const [cx, cy, a0] of [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]]) for (let i = 0; i <= SEG; i++) { const a = (a0 + (90 * i) / SEG) * RAD; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
// A slot's closed outline in the section, from where it sits on its face
function slotLoop(place, slot) {
  const [nx, ny] = place.normal, [ax, ay] = place.along;
  return slotPath(slot).map(([u, v]) => [place.at[0] + u * ax - v * nx, place.at[1] + u * ay - v * ny]);
}
// The hollow between two cells: both cavities below their lips, back to back across the line between the cells. Toward
// an outside face it keeps its full width for its length, then steps in to the flanks that run down to each cavity's
// floor. Toward a place where four cells meet it is the cavity's own shape (its end there is narrower than its width)
function chamberLoop(ch, slot) {
  const D = ch.depth ?? slot.cavityDepth, far = Math.max(D, slot.cavityDepth), cot = 1 / Math.tan(slot.flankAngle * RAD), ends = ch.ends ?? [ch.width / 2, ch.width / 2];
  const quarter = (half) => { // one end, from the line between the cells down to its floor. The flanks are the cavity's own: a shallower hollow stops short on them
    const f = Math.min(slot.floorWidth / 2, half), meet = far - (half - f) / cot, v1 = Math.min(D, Math.max(half < ch.width / 2 ? 0 : ch.length / 2, meet, 0)), at = (v) => Math.min(half, f + (far - v) * cot); // (meet: where the flanks reach the full width)
    return [[half, v1], [at(v1), v1], [at(D), D]];
  };
  const a = quarter(ends[0]), b = quarter(ends[1]), pts = [...a.map(([u, v]) => [-u, -v]), ...b.map(([u, v]) => [u, -v]).reverse(), ...b, ...a.map(([u, v]) => [-u, v]).reverse()].filter((p, i, all) => Math.hypot(p[0] - all[(i + all.length - 1) % all.length][0], p[1] - all[(i + all.length - 1) % all.length][1]) > 1e-9);
  return pts.map(([u, v]) => (ch.axis === 'y' ? [ch.at[0] + u, ch.at[1] + v] : [ch.at[0] - v, ch.at[1] + u]));
}
const squareLoop = (h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [h.at[0] + (a * h.width) / 2, h.at[1] + (b * h.width) / 2]);

/**
 * A profile's section as closed loops of [x, y] points in mm: the outside of the metal first, counter-clockwise, with
 * every open slot cut into it, then each hole clockwise (bores, the hollows between cells and in corners, a tube's inside). Drawn
 * from the interface values (envelope, corner radius, slots, bores), or the measured outline where the model has one.
 * @param {Profile} model
 * @returns {{ loops: number[][][], measured: boolean, source: string }}
 */
export function outline(model) {
  const m = isModel('outline', model);
  if (m.measured) return { loops: m.measured.loops.map((l) => l.map((p) => [...p])), measured: true, source: m.measured.source };
  const { width: W, height: H, wall: t, cornerRadius: r, family } = m, loops = [], source = 'drawn from the rule set\'s interface dimensions';
  if (family === 'round-bar' || family === 'round-tube') { loops.push(circle([0, 0], W, false)); if (family === 'round-tube') loops.push(circle([0, 0], W - 2 * t, true)); return { loops, measured: false, source }; }
  if (family === 'angle') return { loops: [[[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, -H / 2 + t], [-W / 2 + t, -H / 2 + t], [-W / 2 + t, H / 2], [-W / 2, H / 2]]], measured: false, source };
  if (family === 'channel') return { loops: [[[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [W / 2 - t, H / 2], [W / 2 - t, -H / 2 + t], [-W / 2 + t, -H / 2 + t], [-W / 2 + t, H / 2], [-W / 2, H / 2]]], measured: false, source };
  // The outside of the cells, walked counter-clockwise (the metal on the left) one cell's side at a time, each side's
  // slot cut in as it comes. A corner that turns left is rounded; one that turns right (inside a C) is left square
  const [nx, ny] = m.cells, gone = m.absent ?? [], has = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !gone.some((c) => c[0] === i + 1 && c[1] === j + 1), [px, py] = m.pitch, key = (a, b) => `${a},${b}`, sides = new Map();
  // each open side as a step from one grid point to the next: [from, to, the face's name, the cell]
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (has(i, j)) {
    if (!has(i, j - 1)) sides.set(key(i, j), [[i, j], [i + 1, j], 'bottom', [i, j]]);
    if (!has(i + 1, j)) sides.set(key(i + 1, j), [[i + 1, j], [i + 1, j + 1], 'back', [i, j]]);
    if (!has(i, j + 1)) sides.set(key(i + 1, j + 1), [[i + 1, j + 1], [i, j + 1], 'top', [i, j]]);
    if (!has(i - 1, j)) sides.set(key(i, j + 1), [[i, j + 1], [i, j], 'front', [i, j]]);
  }
  const at = ([a, b]) => [-W / 2 + a * px, -H / 2 + b * py], first = [...sides.values()].sort((p, q) => p[0][1] - q[0][1] || p[0][0] - q[0][0])[0], outer = [];
  let side = first, walked = 0;
  do {
    const [from, to, face, cell] = side, d = [to[0] - from[0], to[1] - from[1]], next = sides.get(key(...to));
    if (!next || ++walked > sides.size) throw new Error(`outline: ${m.name}: its cells do not make one piece with one outside (cells_absent leaves a hole, or cells touching only at a corner)`);
    const c = [(cell[0] - (nx - 1) / 2) * px, (cell[1] - (ny - 1) / 2) * py], place = m.faces[face].find((p) => Math.abs(p.at[0] - (c[0] + (p.normal[0] * px) / 2)) < 1e-9 && Math.abs(p.at[1] - (c[1] + (p.normal[1] * py) / 2)) < 1e-9);
    if (place?.slot) { const pts = slotLoop(place, m.slots[place.slot]); outer.push(...(d[0] * place.along[0] + d[1] * place.along[1] > 0 ? pts : pts.reverse())); }
    const e = [next[1][0] - next[0][0], next[1][1] - next[0][1]], turn = d[0] * e[1] - d[1] * e[0], corner = at(to);
    if (turn > 0 && r > 1e-9) { const cx = corner[0] - r * d[0] + r * e[0], cy = corner[1] - r * d[1] + r * e[1], a0 = Math.atan2(-e[1], -e[0]) / RAD; for (let i = 0; i <= SEG; i++) { const a = (a0 + (90 * i) / SEG) * RAD; outer.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } }
    else if (turn !== 0) outer.push(corner);
    side = next;
  } while (side !== first);
  if (walked !== sides.size) throw new Error(`outline: ${m.name}: its cells do not make one piece with one outside (cells_absent leaves a hole, or cuts the section in two)`);
  loops.push(outer);
  if (family === 'tube') loops.push(roundRect(W - 2 * t, H - 2 * t, Math.max(0, r - t)).reverse());
  for (const ch of m.chambers) loops.push(chamberLoop(ch, m.slots[ch.slot]).reverse());
  for (const h of m.hollows) loops.push(squareLoop(h).reverse());
  for (const b of m.bores) loops.push(circle(b.at, b.diameter, true));
  return { loops, measured: false, source };
}

/**
 * What a profile's section is worth as a beam, worked out from its outline, each figure beside the sheet's: area,
 * centroid, second moments about the centroid's axes, the torsion constant, and mass per metre from the material's
 * density. `sheet` holds, for each figure the sheet gives, { sheet, computed, difference }, the difference as a share
 * of the sheet's figure (0.03 is 3% over).
 * @param {Profile} model
 * @param {{ torsion?: boolean, cells?: number }} [o] torsion: false leaves the torsion constant out (it is the slow
 *   part: a tenth of a second or so); cells: raster cells for it (DEFAULTS.cells)
 * @returns {{ area: number, centroid: [number, number], inertiaX: number, inertiaY: number, inertiaXY: number,
 *   modulusX: number, modulusY: number, torsion: number | null, massPerMetre: number | null, measured: boolean,
 *   sheet: Record<string, { sheet: number, computed: number, difference: number }> }} mm², mm, mm⁴, mm³, kg/m
 */
export function section(model, o = {}) {
  const m = isModel('section', model), { loops, measured } = outline(m), p = polygonSection(loops);
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
  for (const [x, y] of loops[0]) { xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
  const modulusX = p.inertiaX / Math.max(yb - p.centroid[1], p.centroid[1] - ya), modulusY = p.inertiaY / Math.max(xb - p.centroid[0], p.centroid[0] - xa);
  const torsion = o.torsion === false ? null : torsionConstant(loops, { cells: o.cells ?? DEFAULTS.cells.value }).torsion;
  const massPerMetre = m.material?.density != null ? (p.area * m.material.density) / 1000 : null; // (mm² × g/cm³ is g per metre)
  const got = { area: p.area, inertiaX: p.inertiaX, inertiaY: p.inertiaY, modulusX, modulusY, torsion, massPerMetre }, sheet = {};
  for (const [k, s] of Object.entries(m.sheet)) if (s != null && got[k] != null) sheet[k] = { sheet: s, computed: got[k], difference: got[k] / s - 1 };
  return { ...p, modulusX, modulusY, torsion, massPerMetre, measured, sheet };
}

/**
 * The figures to design a beam of this profile with: each one the maker's sheet gives, as the sheet gives it, and each it
 * does not give worked out from the outline. A plain section (tube, angle, bar) has no sheet, so all of its are worked
 * out; a maker's profile mostly has its own. Every figure says which it is.
 * @param {Profile} model
 * @param {{ cells?: number }} [o] raster cells for the torsion constant, solved only where the sheet gives none
 * @returns {Record<'area' | 'inertiaX' | 'inertiaY' | 'modulusX' | 'modulusY' | 'torsion' | 'massPerMetre', { value: number | null, unit: string, kind: string, source: string, from: 'sheet' | 'outline' }>}
 */
export function beamFigures(model, o = {}) {
  const m = isModel('beamFigures', model), s = section(m, { ...o, torsion: m.sheet.torsion == null }), out = {};
  const names = { area: ['area', 'mm²'], inertiaX: ['inertia_x', 'mm⁴'], inertiaY: ['inertia_y', 'mm⁴'], modulusX: ['section_modulus_x', 'mm³'], modulusY: ['section_modulus_y', 'mm³'], torsion: ['torsion_constant', 'mm⁴'], massPerMetre: ['mass_per_metre', 'kg/m'] };
  for (const [k, [rule, unit]] of Object.entries(names)) {
    out[k] = m.sheet[k] != null ? { value: m.sheet[k], unit, kind: m.figures[rule].kind, source: m.figures[rule].source, from: 'sheet' }
      : { value: s[k], unit, kind: 'derived', source: `worked out from the ${s.measured ? 'measured' : 'drawn'} outline of ${m.name}${k === 'massPerMetre' && m.material ? ` and the density of ${m.material.name}` : ''}`, from: 'outline' };
  }
  return out;
}

/**
 * A profile as the choices a frame's sizing takes (@rulecad/fea/frame's sizing): its section in a beam's own axes
 * (Iy the second moment about the section's x, which resists bending across its height; Iz about its y), its alloy
 * (modulus, Poisson's ratio, density and strength) and its mass per metre, the sheet's where it gives one. A profile
 * that is not square comes twice: as drawn, and turned a quarter about its length (roll 90, named "<name> turned"; names without "profile-"), so
 * a 20 x 40 can be tried lying flat and standing on edge. Plain data, so a frame of tubes sized by the same solver
 * reads the same.
 * @param {Profile} model
 * @returns {{ name: string, profile: string, roll: number, section: { A: number, Iy: number, Iz: number, J: number, Wy: number, Wz: number },
 *   material: { E: number, nu: number | undefined, density: number | undefined, strength: number | undefined, name: string | undefined }, mass: number | undefined, title: string }[]}
 *   Refused by name: a profile with no alloy's modulus to bend it by.
 */
export function profileChoices(model) {
  const m = isModel('profileChoices', model), F = beamFigures(m), mat = m.material;
  if (!(mat?.modulus > 0)) throw new Error(`profileChoices: ${m.name} names no material with a modulus, so it cannot be sized: give it one (material: al6063-t5)`);
  const section = { A: F.area.value, Iy: F.inertiaX.value, Iz: F.inertiaY.value, J: F.torsion.value, Wy: F.modulusX.value, Wz: F.modulusY.value };
  const material = { E: mat.modulus, nu: mat.poisson ?? undefined, density: mat.density ?? undefined, strength: mat.strength ?? undefined, name: mat.name };
  const short = m.name.replace(/^profile-/, ''), one = { name: short, profile: short, roll: 0, section, material, mass: F.massPerMetre.value ?? undefined, title: m.title };
  if (Math.abs(m.width - m.height) < 1e-9 && Math.abs(section.Iy - section.Iz) <= 1e-6 * section.Iy) return [one];
  return [one, { ...one, name: `${short} turned`, roll: 90, title: `${m.title}, turned a quarter` }];
}

/**
 * What a check of a profile finds, in the kit's one shape: slots that do not fit inside the section or run into each
 * other, a bore that a slot or a hollow breaks into, a bore too wide or too tight for the thread it is tapped to, and
 * section figures on the sheet that the drawn outline does not bear out. 'fail' is a set that cannot be right, 'warn' one to look at, 'info' something to know (a bore that leaves a thin thread). An empty list is a clean pass.
 * @param {Profile} model
 * @param {{ torsion?: boolean, cells?: number }} [o] as section() takes
 * @returns {{ level: 'fail' | 'warn' | 'info', code: string, text: string, rule?: string, at?: number[], values?: Record<string, number | string> }[]}
 */
export function profileFindings(model, o = {}) {
  const m = isModel('profileFindings', model), out = [], f2 = (x) => String(+x.toFixed(2));
  const say = (level, code, text, extra = {}) => out.push({ level, code, text, ...extra });
  if (!m.measured && !['round-bar', 'round-tube', 'angle', 'channel'].includes(m.family)) {
    const cuts = [...FACES.flatMap((face) => m.faces[face].filter((p) => p.slot).map((p) => ({ name: `the ${face} face's slot${m.faces[face].length > 1 ? ` ${p.index}` : ''}`, at: p.at, loop: slotLoop(p, m.slots[p.slot]), rule: 'cavity_depth' }))),
      ...m.chambers.map((c) => ({ name: `the hollow between cells at ${f2(c.at[0])}, ${f2(c.at[1])}`, at: c.at, loop: chamberLoop(c, m.slots[c.slot]), rule: 'chamber_width' })),
      ...m.hollows.map((h) => ({ name: `the corner hollow at ${f2(h.at[0])}, ${f2(h.at[1])}`, at: h.at, loop: squareLoop(h), rule: 'corner_hollow_width' }))];
    const bores = m.bores.map((b) => ({ name: `the ${b.where === 'corner' ? 'corner ' : ''}bore at ${f2(b.at[0])}, ${f2(b.at[1])}`, at: b.at, loop: circle(b.at, b.diameter, false), rule: b.where === 'corner' ? 'corner_bore_diameter' : 'bore_diameter' }));
    const beyond = (c) => c.loop.some(([x, y]) => Math.abs(x) > m.width / 2 + 1e-9 || Math.abs(y) > m.height / 2 + 1e-9);
    for (const c of [...cuts, ...bores]) if (beyond(c)) say('fail', c.rule.includes('bore') ? 'profile.bore.clear' : 'profile.slot.fit', `${c.name} reaches outside the section (${f2(m.width)} x ${f2(m.height)} mm)`, { rule: c.rule, at: c.at });
    for (let i = 0; i < cuts.length; i++) for (let j = i + 1; j < cuts.length; j++) { const g = gap(cuts[i].loop, cuts[j].loop); if (g <= 0) say('fail', 'profile.slot.fit', `${cuts[i].name} runs into ${cuts[j].name}: no metal is left between them. A shallower or narrower cavity fits`, { rule: 'cavity_width', at: cuts[i].at }); }
    for (const b of bores) for (const c of cuts) { const g = gap(b.loop, c.loop); if (g <= 0) say('fail', 'profile.bore.clear', `${b.name} (Ø${f2(m.bores[bores.indexOf(b)].diameter)}) breaks into ${c.name}: a smaller bore or a shallower cavity clears it`, { rule: b.rule, at: b.at, values: { diameter: m.bores[bores.indexOf(b)].diameter } }); }
    for (let i = 0; i < bores.length; i++) for (let j = i + 1; j < bores.length; j++) if (gap(bores[i].loop, bores[j].loop) <= 0) say('fail', 'profile.bore.clear', `${bores[i].name} runs into ${bores[j].name}`, { rule: bores[i].rule, at: bores[i].at });
  }
  // a bore against the thread it is tapped to: once for the cells' bores, once for the corners'
  for (const where of ['cell', 'given', 'corner']) {
    const b = m.bores.find((x) => x.where === where); if (!b || b.thread == null) continue;
    const rule = where === 'corner' ? 'corner_bore_diameter' : 'bore_diameter', named = `${rule.replace('_diameter', '_thread')} ${b.thread}`;
    if (!b.threadSet || b.tapDrill == null) { say('warn', 'profile.bore.thread', `${named} is no thread set here (or has no tap_drill), so the bore is not checked against its tap drill`, { rule: rule.replace('_diameter', '_thread') }); continue; }
    const major = b.major, pitch = b.threadPitch;
    const values = { bore: b.diameter, tap_drill: b.tapDrill, ...(isNum(major) ? { major_diameter: major } : {}), ...(isNum(pitch) ? { pitch } : {}) };
    if (isNum(major) && b.diameter >= major) say('fail', 'profile.bore.tap', `the bore (Ø${f2(b.diameter)}) is as wide as the ${b.thread} thread it is tapped to (Ø${f2(major)}): no thread is left`, { rule, values });
    else if (isNum(major) && isNum(pitch)) {
      const share = (major - b.diameter) / (1.299 * pitch), thin = `the bore (Ø${f2(b.diameter)}) leaves ${Math.round(share * 100)}% of a full ${b.thread} thread (its tap drill is Ø${f2(b.tapDrill)})`;
      if (share > 1 + 1e-9) say('warn', 'profile.bore.tap', `the bore (Ø${f2(b.diameter)}) is under the root of a ${b.thread} thread (tap drill Ø${f2(b.tapDrill)}): it wants drilling out before it is tapped, or the thread is not this bore's`, { rule, values: { ...values, share } });
      else if (share < DEFAULTS.thread.value / 2) say('warn', 'profile.bore.tap', `${thin}: under ${Math.round(DEFAULTS.thread.value * 50)}% there is hardly a thread, so the thread is probably not this bore's`, { rule, values: { ...values, share } });
      else if (share < DEFAULTS.thread.value) say('info', 'profile.bore.tap', `${thin}: under ${Math.round(DEFAULTS.thread.value * 100)}%, so a screw in its end wants more depth than in a hole drilled to the tap drill`, { rule, values: { ...values, share } });
    }
  }
  // a measured outline against the size the set gives
  if (m.measured) {
    const xs = m.measured.loops.flatMap((l) => l.map((p) => p[0])), ys = m.measured.loops.flatMap((l) => l.map((p) => p[1])), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), mid = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
    if (Math.abs(w - m.width) > DEFAULTS.outline.value || Math.abs(h - m.height) > DEFAULTS.outline.value) say('warn', 'profile.outline.size', `the measured outline is ${f2(w)} x ${f2(h)} mm, and the set says ${f2(m.width)} x ${f2(m.height)}: one of them is another section, or the outline is not in mm`, { rule: Math.abs(w - m.width) > DEFAULTS.outline.value ? 'width' : 'height', values: { outline_width: w, outline_height: h, width: m.width, height: m.height } });
    if (Math.hypot(...mid) > DEFAULTS.outline.value) say('warn', 'profile.outline.middle', `the measured outline's envelope has its middle at ${f2(mid[0])}, ${f2(mid[1])}: an outline is drawn about the middle of its envelope, so slots and bores are found where the set says`, { at: mid });
  }
  // the sheet's section figures against the drawn outline's
  const s = section(m, { ...o, torsion: o.torsion ?? m.sheet.torsion != null }), words = { area: ['area', 'area', 'mm²'], inertiaX: ['inertia_x', 'second moment about x', 'mm⁴'], inertiaY: ['inertia_y', 'second moment about y', 'mm⁴'], torsion: ['torsion_constant', 'torsion constant', 'mm⁴'], massPerMetre: ['mass_per_metre', 'mass per metre', 'kg/m'] };
  for (const [k, [rule, word, unit]] of Object.entries(words)) {
    const c = s.sheet[k], allow = (k === 'torsion' ? DEFAULTS.torsion : k.startsWith('inertia') ? DEFAULTS.inertia : DEFAULTS.section).value;
    if (c && Math.abs(c.difference) > allow) say('warn', `profile.section.${rule}`, `${word}: the sheet says ${+c.sheet.toPrecision(4)} ${unit}, the ${s.measured ? 'measured' : 'drawn'} outline comes to ${+c.computed.toPrecision(4)} (${c.difference > 0 ? '+' : ''}${(c.difference * 100).toFixed(1)}%, more than ${allow * 100}%): a dimension is off, or the section has a shape its interface dimensions do not describe`, { rule, values: { sheet: c.sheet, computed: c.computed, difference: c.difference } });
  }
  return out;
}
