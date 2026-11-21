// Generated frames in assemblies (@rulecad/frames' generate.mjs): "frame": { "kind": "box", "inside": [300, 300, 350],
// "profile": "2020-misumi-hfs5", "join": "blind", "feet": "levelling" } at the top of an assembly expands, before
// anything else is worked out, into beam items placed by their ends, joins, the fittings at the ends no join covers,
// panels where asked and, for a gantry, its moving beam on a sliding joint with a pose at each end of its travel. The
// expansion is what the rest of cad sees, so its joins, fastens, cut list and frame checks are a hand-drawn frame's.
// cad frame <project>/<assembly> --expand writes it into the assembly, where it can be edited by hand.
import { frameModel, FRAME_KINDS } from '@rulecad/frames';
import { beamPlace, framesContext } from './beams.mjs';
import { givenFor } from './frames.mjs';

/** The keys of "frame" that ask for a generated frame; the rest (supports, limit, rack ..) say how it is solved. */
export const FRAME_GEN_KEYS = ['kind', 'inside', 'outside', 'profile', 'join', 'feet', 'caps', 'braces', 'panels', 'shelves'];
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const r3 = (x) => +x.toFixed(3);

/**
 * The frame an assembly asks for, worked out: @rulecad/frames' frameModel over its expressions and the workspace's
 * profile sets. Null where "frame" names no kind. Refused by name: generator keys without a kind, and what frameModel
 * refuses. @param {object} a the assembly as read @param {(x: any) => number} num its expressions
 * @returns {object | null}
 */
export function frameOf(a, num, context = framesContext()) {
  const f = a.frame;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  if (f.kind == null) {
    const stray = FRAME_GEN_KEYS.filter((k) => f[k] != null);
    if (stray.length) throw new Error(`frame: ${stray.join(', ')} ask${stray.length === 1 ? 's' : ''} for a generated frame, and it names no kind: give "kind": ${Object.keys(FRAME_KINDS).join(', ')}`);
    return null;
  }
  const o = {};
  for (const k of FRAME_GEN_KEYS.slice(1)) if (f[k] != null) o[k] = f[k];
  for (const k of ['inside', 'outside']) if (o[k] != null) { if (!Array.isArray(o[k])) throw new Error(`frame: ${k} is [width, depth, height] in mm (got ${shown(o[k])})`); o[k] = o[k].map((x) => num(x)); }
  if (o.panels?.thickness != null) o.panels = { ...o.panels, thickness: num(o.panels.thickness) };
  let m;
  try { m = frameModel(f.kind, { ...o, given: givenFor(context, f.profile) }); } catch (e) { throw new Error(`frame: ${String(e.message).replace(/^frameModel: /, '')}`); }
  // a portal lies in one plane: standing on its two feet, a foot holds an upright's end from moving and not from turning,
  // so nothing holds it out of that plane and it tips over sideways under any load. It checks clean once its feet are
  // held down (bolted to a bench or a wall), so where nothing says how it is held, it is refused here, before any check
  if (m.kind === 'portal' && f.supports == null) {
    const feet = m.beams.filter((b) => Math.min(b.from[2], b.to[2]) < 1e-6).map((b) => `"${b.id}.${b.from[2] <= b.to[2] ? 'a' : 'b'}": "fixed"`);
    throw new Error(`frame: a portal stands in one plane (x-z) on its two feet, and a foot stops an upright's end moving but not turning, so nothing holds the portal out of that plane: on its feet alone it tips over sideways (frame.buckling fails it, frame.rack finds it free along y). Say how its feet are held down, bolted to a bench or a wall: "supports": { ${feet.join(', ')} }; or, to stand free, generate a table or a box`);
  }
  return m;
}

/**
 * The items, joins, joint and poses a generated frame adds, in the assembly's own words.
 * @param {object} m frameOf's @param {object} a the assembly @param {(x: any) => number} num
 * A printed foot is screwed into its upright's end: the end tapped (the beam's ops) and a fasten of the foot's screw.
 * @returns {{ items: object[], joins: object[], fasten: object[], joints: object[], poses: Record<string, object> | null }}
 */
export function frameParts(m, a, num) {
  const profile = m.profile, items = [], fasten = [];
  for (const b of m.beams) items.push({ id: b.id, beam: { profile }, from: b.from, to: b.to });
  for (const e of m.ends) {
    items.push(e.fitting ? { id: e.id, fitting: { kind: e.fitting, profile }, at: e.at } : { id: e.id, bought: e.bought, at: e.at });
    if (!e.tap) continue;
    const [beamId] = e.at.split('.'), bi = items.find((x) => x.id === beamId);
    bi.beam.ops = [...(bi.beam.ops ?? []), { ...e.tap }];
    fasten.push({ screw: e.screw, through: [e.id], into: beamId, at: [`${e.id}.b1`], note: `${e.id} screwed into ${beamId}'s end ${e.tap.at}` });
  }
  for (const p of m.panels) items.push({ id: p.id, panel: { sheet: p.sheet, thickness: p.thickness, bay: p.bay, out: p.out, nut: p.nut } });
  const joints = [];
  let poses = null;
  if (m.moving) {
    // the moving beam on a sliding joint from its track's top face: both anchors where g's bottom meets the track at the
    // start of its travel, z along the travel, x up, so g lies with its top up and its length across
    const g = m.moving, track = items.find((x) => x.id === g.track), F = beamPlace(track, num), h = m.width / 2;
    const col = (k) => [F[k], F[4 + k], F[8 + k]], o = [F[3], F[7], F[11]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const local = (v, point = true) => { const d = point ? v.map((c, k) => c - o[k]) : v; return [0, 1, 2].map((k) => r3(dot(col(k), d))); };
    const meet = [track.from[0], g.from[1], g.from[2] - h];
    items.splice(m.beams.length, 0, { id: g.id, beam: { profile, length: g.length } });
    joints.push({ id: 'gantry', type: 'prismatic', parent: { item: track.id, at: local(meet), axis: local(g.along, false), ref: local([0, 0, 1], false) }, child: { item: g.id, at: [0, -h, r3(track.from[0] - g.from[0])], axis: [1, 0, 0], ref: [0, 1, 0] }, min: 0, max: g.travel, label: 'Gantry' });
    poses = { 'gantry-front': { gantry: 0 }, 'gantry-back': { gantry: g.travel } };
  }
  return { items, joins: m.joins.map((j) => ({ ...j })), fasten, joints, poses };
}

/**
 * An assembly with its generated frame expanded: the frame's items before its own, its joins before its own, a
 * gantry's joint and poses, and "frame" left with only how it is solved. Refused by name: an item of the assembly's
 * own with a name the frame gives (z1, x1, cap-z1-b ..).
 * @param {object} a @param {(x: any) => number} num
 * @returns {{ a: object, frame: object | null }} the assembly as expanded, and frameOf's model
 */
export function expandFrame(a, num, context = framesContext()) {
  const m = frameOf(a, num, context);
  if (!m) return { a, frame: null };
  const parts = frameParts(m, a, num), own = new Set((a.items || []).map((it) => it?.id));
  const clash = parts.items.filter((it) => own.has(it.id)).map((it) => it.id);
  if (clash.length) throw new Error(`frame: the ${m.kind} names its parts ${parts.items.slice(0, 3).map((x) => x.id).join(', ')} .., and this assembly already has ${clash.join(', ')}: rename ${clash.length > 1 ? 'them' : 'it'}, or write the frame out (cad frame --expand) and edit it there`);
  if (parts.joints.length && (a.joints || []).some((j) => j.id === 'gantry')) throw new Error('frame: a gantry\'s moving beam slides on a joint named gantry, and this assembly already has one: rename it');
  const rest = Object.fromEntries(Object.entries(a.frame).filter(([k]) => !FRAME_GEN_KEYS.includes(k)));
  const out = { ...a, items: [...parts.items, ...(a.items || [])], joins: [...parts.joins, ...(a.joins || [])] };
  if (parts.fasten.length) out.fasten = [...parts.fasten, ...(a.fasten || [])];
  if (parts.joints.length) out.joints = [...parts.joints, ...(a.joints || [])];
  if (parts.poses && !a.poses) out.poses = parts.poses;
  if (Object.keys(rest).length) out.frame = rest; else delete out.frame;
  return { a: out, frame: m };
}

/** The frame in words: its size, its beams by length, its joins and its ends. @param {object} m frameOf's @returns {string[]} */
export function frameText(m) {
  const s = (v) => v.map((x) => +x.toFixed(2)).join(' x ');
  const size = m.kind === 'portal' ? (v) => s([v[0], v[2]]) : s;
  const lines = [`a ${m.kind} of ${m.profile} (${m.width} mm), joined ${m.join.kind}${m.join.fitting ? ` (${m.join.fitting})` : ''}: ${m.arrangement === 'face' ? 'the upright beams run through and the rest butt against their faces' : 'every beam butts into a corner node'}`,
    `inside ${size(m.inside)} mm, outside ${size(m.outside)} mm${m.shelves ? `; ${m.shelves} shelves, each bay ${+m.bay.toFixed(2)} mm clear` : ''}${m.lift ? `; the bottom ring stands ${+m.lift.toFixed(2)} mm up the uprights, so its joins' holes clear the feet's tapped ends` : ''}`];
  for (const l of m.lengths) lines.push(`  ${l.count} x ${+l.length.toFixed(2)} mm: ${l.ids.join(', ')}`);
  lines.push(`${m.joins.length} joins (${[...new Set(m.joins.map((j) => j.kind))].join(', ')}); ${m.ends.length} end fittings${m.ends.length ? ` (${[...new Set(m.ends.map((e) => e.fitting ?? e.bought))].join(', ')})` : ''}${m.panels.length ? `; ${m.panels.length} panels` : ''}${m.moving ? `; g rides ${m.moving.track} through ${m.moving.travel} mm on the joint gantry` : ''}`);
  return lines;
}
