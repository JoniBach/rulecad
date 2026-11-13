// Headless Chrome for the browser tests, started the same way for each: its own profile, software GL where asked
// (a CI machine has no GPU, and Chrome no longer falls back to software unasked), and a wait for it that allows a
// cold machine's first start. What Chrome says is kept, so a test that fails can show it.
//   const chrome = await startChrome({ profile, size: '1200,800' }); ... finally { await chrome.stop(); }
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export const CHROME = process.env.CAD_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((f) => fs.existsSync(f));

// A first start on a fresh CI machine reads Chrome from a cold disk: up to half a minute there, against a second or two
// once warm. Two minutes is ample, and a Chrome that dies first says so at once.
const START = 120000;

export async function startChrome({ profile, size = '1200,800', softwareGL = true }) {
  const t0 = Date.now();
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', `--window-size=${size}`,
    ...(softwareGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let said = '';
  chrome.stderr.on('data', (d) => { said += d; if (said.length > 100000) said = said.slice(-50000); });
  const exited = () => chrome.exitCode !== null || chrome.signalCode !== null;
  const gone = (ms) => (exited() ? Promise.resolve(true) : Promise.race([new Promise((r) => chrome.once('exit', () => r(true))), new Promise((r) => setTimeout(() => r(false), ms).unref())]));
  // Stopped for sure: it can ignore a polite stop, and while its output pipe is open Node can't finish
  const stop = async () => {
    chrome.kill();
    if (!(await gone(3000))) { chrome.kill('SIGKILL'); await gone(3000); }
    chrome.stderr.destroy();
  };
  const tail = (n = 1500) => said.slice(-n).trim();
  try {
    const wsUrl = await new Promise((res, rej) => {
      const look = () => { const m = said.match(/ws:\/\/\S+/); if (m) res(m[0]); };
      chrome.stderr.on('data', look);
      chrome.once('error', rej);
      chrome.once('exit', (code, signal) => rej(new Error(`Chrome stopped before it started (${signal || `exit ${code}`}). It said:\n${tail()}`)));
      setTimeout(() => rej(new Error(`Chrome did not start within ${START / 1000} s. It said:\n${tail()}`)), START).unref();
    });
    return { chrome, wsUrl, startedIn: Date.now() - t0, said: tail, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
