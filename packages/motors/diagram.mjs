// A motor's curve as a drawing: torque against speed, what it does at each speed, and where an assembly works it.
import { performance } from './motors.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fig = (x) => String(+Number(x).toFixed(2));

/**
 * Torque against speed, as an SVG: the curve performance() gives, with the working point marked and what it rests on.
 * @param {import('./motors.mjs').Motor} m a motorModel
 * @param {{ supply?: number, ratio?: number, efficiency?: number, at?: { speed: number, load?: number }, width?: number, height?: number }} [o]
 *   ratio and efficiency: of the gears after it (the curve is the output's); at: an output speed (rpm) and load (N m) to mark
 * @returns {string} an SVG
 */
export function curve(m, o = {}) {
  const { supply, ratio = 1, efficiency = 1, at, width = 640, height = 380 } = o;
  const ask = (speed) => performance(m, { speed, ratio, efficiency, ...(supply != null ? { supply } : {}) });
  const first = ask(0), limit = first.limit, N = 120, pts = [];
  for (let i = 0; i <= N; i++) { const s = (limit * i) / N; pts.push([s, ask(s).output.torque]); }
  const yMax = Math.max(first.output.torque, ...pts.map((p) => p[1]), at?.load ?? 0) * 1.1, L = 76, B = height - 56, R = width - 24, T = 40;
  const X = (s) => L + ((R - L) * s) / limit, Y = (t) => B - ((B - T) * t) / yMax, out = [];
  out.push(`<rect width="100%" height="100%" fill="#fff"/><text x="${L}" y="24" font-size="15" font-family="system-ui, sans-serif" fill="#1a1a1a">${esc(m.name)}${ratio !== 1 ? `, through ${fig(ratio)}:1` : ''}: torque against speed</text>`);
  for (let i = 0; i <= 4; i++) {
    const t = (yMax * i) / 4, s = (limit * i) / 4;
    out.push(`<line x1="${L}" x2="${R}" y1="${fig(Y(t))}" y2="${fig(Y(t))}" stroke="#e4e4e4"/><text x="${L - 8}" y="${fig(Y(t) + 4)}" text-anchor="end" font-size="11" font-family="system-ui, sans-serif" fill="#555">${fig(t)}</text>`);
    out.push(`<line x1="${fig(X(s))}" x2="${fig(X(s))}" y1="${T}" y2="${B}" stroke="#e4e4e4"/><text x="${fig(X(s))}" y="${B + 16}" text-anchor="middle" font-size="11" font-family="system-ui, sans-serif" fill="#555">${fig(s)}</text>`);
  }
  out.push(`<polyline fill="none" stroke="#2266cc" stroke-width="2.2" points="${pts.map(([s, t]) => `${fig(X(s))},${fig(Y(t))}`).join(' ')}"/>`);
  out.push(`<text x="${(L + R) / 2}" y="${height - 22}" text-anchor="middle" font-size="12" font-family="system-ui, sans-serif" fill="#333">output speed, rpm</text><text transform="translate(18 ${(T + B) / 2}) rotate(-90)" text-anchor="middle" font-size="12" font-family="system-ui, sans-serif" fill="#333">output torque, N m</text>`);
  if (at) {
    const here = ask(at.speed).output.torque, x = X(at.speed);
    out.push(`<circle cx="${fig(x)}" cy="${fig(Y(here))}" r="5" fill="#2266cc"/><text x="${fig(x + 9)}" y="${fig(Y(here) - 8)}" font-size="12" font-family="system-ui, sans-serif" fill="#1a1a1a">${fig(here)} N m at ${fig(at.speed)} rpm</text>`);
    if (at.load != null) out.push(`<line x1="${L}" x2="${R}" y1="${fig(Y(at.load))}" y2="${fig(Y(at.load))}" stroke="#cc3322" stroke-dasharray="6 4" stroke-width="1.4"/><text x="${R}" y="${fig(Y(at.load) - 6)}" text-anchor="end" font-size="12" font-family="system-ui, sans-serif" fill="#cc3322">the load, ${fig(at.load)} N m</text>`);
  }
  out.push(`<text x="${R}" y="24" text-anchor="end" font-size="11" font-family="system-ui, sans-serif" fill="#888">rests on ${esc(first.rests.join(', '))} figures</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${out.join('')}</svg>\n`;
}
