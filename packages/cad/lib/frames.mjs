// v.frames: @rulecad/frames as a design gets it, reading the workspace's own profile, slot and material sets (a profile
// measured with cad measure --profile, with its outline beside it) before the kit's. No files are read by designFrames:
// framesContext reads them for the build, and the sandbox's runner is handed what it found.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as frames from '@rulecad/frames';

// The workspace's own profile, slot and material sets (cad measure --profile writes a draft profile there, with its
// outline in rules/outlines/), read once per change to the folder
let seen = null;
/**
 * What @rulecad/frames is handed from a workspace: its own rule sets by name, and the measured outlines beside them.
 * @param {string} dir the workspace's rules/ folder
 * @returns {{ sets: Record<string, object>, outlines: Record<string, object>, hash: string }}
 */
export function framesContext(dir) {
  const out = path.join(dir, 'outlines');
  const stamp = (d) => { try { return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => `${f}:${fs.statSync(path.join(d, f)).mtimeMs}`).join('|'); } catch { return ''; } };
  const key = `${dir}|${stamp(dir)}|${stamp(out)}`;
  if (seen?.key === key) return seen.context;
  const sets = {}, outlines = {}, text = [];
  for (const [d, into] of [[dir, sets], [out, outlines]]) {
    let files = []; try { files = fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort(); } catch {}
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(d, f), 'utf8'), s = JSON.parse(raw);
        if (into === sets ? s?.rules && typeof s.rules === 'object' && ['profile', 'slot', 'slot_nut', 'material', 'thread'].includes(s.part) : Array.isArray(s?.loops)) { into[s.name ?? f.slice(0, -5)] = s; text.push(raw); }
      } catch {} // (a broken set is cad rules check's to name)
    }
  }
  const context = { sets, outlines, hash: crypto.createHash('sha256').update(text.join('\n')).digest('hex').slice(0, 24) };
  seen = { key, context };
  return context;
}

// profileModel's third argument for a profile by name: the workspace's sets, and its measured outline if it has one
export const givenFor = (context, profile, given = {}) => {
  const name = typeof profile === 'string' ? (context.sets?.[profile] ? profile : context.sets?.[`profile-${profile}`] ? `profile-${profile}` : null) : null;
  const outline = name && context.outlines?.[name];
  return { ...given, sets: { ...(context.sets || {}), ...(given.sets || {}) }, ...(outline && !given.outline ? { outline } : {}) };
};

/**
 * @rulecad/frames as a design gets it (v.frames): every export, with profileModel, slotModel, beamModel, beam, carrierModel
 * and carrier reading the workspace's own rule sets (a profile measured with cad measure --profile, with its outline, or
 * a slot measured by caliper on the slot coupon) before the kit's.
 * @param {{ sets?: Record<string, object>, outlines?: Record<string, object> }} [context] framesContext()'s
 * @returns {Record<string, any>}
 */
export function designFrames(context = {}) {
  const bound = { ...frames };
  // (a name is looked up in given.sets before the kit's, with or without its profile- prefix)
  bound.profileModel = (which, change = {}, given = {}) => frames.profileModel(which, change, givenFor(context, which, given));
  bound.slotModel = (which, change = {}, given = {}) => frames.slotModel(which, change, { ...given, sets: { ...(context.sets || {}), ...(given.sets || {}) } });
  bound.beamModel = (profile, o = {}) => frames.beamModel(typeof profile === 'string' ? bound.profileModel(profile, {}, o.given) : profile, { ...o, given: givenFor(context, profile, o.given) });
  bound.beam = (m, o = {}) => frames.beam(m?.kind === 'beam' || m?.kind === 'profile' ? m : typeof m === 'string' ? bound.profileModel(m, {}, o.given) : m, o);
  // (a printed carrier drawn from the workspace's slot, as measured by caliper on the slot coupon)
  bound.carrierModel = (where, o = {}) => frames.carrierModel(where, { ...o, given: givenFor(context, where, o?.given) });
  bound.carrier = (m, o = {}) => frames.carrier(m, m?.kind === 'slot-carrier' ? o : { ...o, given: givenFor(context, m, o?.given) });
  return bound;
}

