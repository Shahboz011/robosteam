/* RoboSTEAM compile service.
   - POST /api/compile { code, board: "uno" } -> { ok: true, hex: <base64 Intel HEX>, log } or { ok: false, error }.
   - GET  /api/health -> { ok: true, arduinoCli } (host health checks).
   Compiles with arduino-cli (see README.md).

   Two ways to run it:
   - Local dev (npm start): also serves the static site from the repo root, on 127.0.0.1, so pages and API share
     an origin.
   - Hosted (Dockerfile / render.yaml): API only, on 0.0.0.0. The site on robosteam.uz calls it cross-origin, so
     CORS allows robosteam.uz, www.robosteam.uz, localhost and anything in ALLOWED_ORIGINS.

   Compiling untrusted C++ is only safe with limits, so every sketch is checked first: the one way a sketch can
   read a server file is the preprocessor (#include "/etc/passwd" echoed back in an error) or the assembler
   (.incbin / .include), so only plain library includes are accepted and those directives are rejected.
   Plus: size limit, per-client rate limit, bounded queue, timeout, fresh temp dir per build, and the container
   runs as a non-root user holding no secrets. */
import express from 'express';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
const env = process.env;
const PORT = Number(env.PORT) || 3000;
const HOST = env.HOST || '127.0.0.1';
const SERVE_SITE = env.SERVE_SITE ? env.SERVE_SITE === '1' : existsSync(path.join(SITE, 'simulator.html'));
const BOARDS = { uno: 'arduino:avr:uno' };
const MAX_CODE = 64 * 1024;
const TIMEOUT_MS = Number(env.COMPILE_TIMEOUT_MS) || 30_000;
const MAX_QUEUE = Number(env.MAX_QUEUE) || 10;          // waiting + running compiles before we answer 429
const RATE_PER_MIN = Number(env.RATE_PER_MIN) || 30;    // per client IP (a whole classroom may share one IP)
const ORIGINS = new Set(['https://robosteam.uz', 'https://www.robosteam.uz',
  ...(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)]);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function findCli() {
  if (env.ARDUINO_CLI) return env.ARDUINO_CLI;
  const local = path.join(HERE, '.tools', process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
  return existsSync(local) ? local : 'arduino-cli'; // fall back to PATH
}
const CLI = findCli();

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// ---------- sketch check: only what's needed to build Arduino sketches ----------
// Allowed: #include <Servo.h>, <avr/pgmspace.h> (library/system search paths, no "..", no absolute paths) and
// #include "name.h" (sketch folder only, no slashes). Everything else that can pull a file in is refused.
const SAFE_ANGLE = /^<(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_.+-]*(\/[A-Za-z0-9_][A-Za-z0-9_.+-]*)*>$/;
const SAFE_QUOTE = /^"[A-Za-z0-9_][A-Za-z0-9_.+-]*"$/;
// Returns null, or a gcc-style "sketch.ino:<line>:1: error: ..." message the page already knows how to show.
function checkSketch(code) {
  const lines = code.split(/\r?\n/);
  const refuse = (n, msg) => 'sketch.ino:' + n + ':1: error: ' + msg;
  for (let i = 0; i < lines.length; i++) {
    const start = i + 1;
    let logical = lines[i];
    while (/\\$/.test(logical) && i + 1 < lines.length) logical = logical.slice(0, -1) + lines[++i]; // "\" joins lines
    const line = logical.replace(/\/\*.*?\*\//g, ' ');
    const m = line.match(/^\s*(?:#|%:|\?\?=)\s*(include_next|include|import|embed)\b\s*(.*?)\s*(\/\/.*)?$/);
    if (m && (m[1] !== 'include' || (!SAFE_ANGLE.test(m[2]) && !SAFE_QUOTE.test(m[2])))) {
      return refuse(start, 'include not allowed: only library includes such as #include <Servo.h>');
    }
    if (/\.\s*(incbin|include)\b/i.test(line)) return refuse(start, 'include not allowed: assembler .incbin/.include');
  }
  return null;
}

// ---------- compile ----------
let queue = Promise.resolve(), pending = 0;
function serial(task) {                     // one compile at a time: arduino-cli is CPU heavy
  pending++;
  const next = queue.then(task, task).finally(() => { pending--; });
  queue = next.catch(() => {});
  return next;
}

async function compile(code, fqbn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'robosteam-'));
  const sketchDir = path.join(dir, 'sketch');
  const outDir = path.join(dir, 'out');
  try {
    await mkdir(sketchDir);
    await writeFile(path.join(sketchDir, 'sketch.ino'), code, 'utf8');
    const { err, stdout, stderr } = await run(CLI, ['compile', '--fqbn', fqbn, '--output-dir', outDir, '--no-color', sketchDir]);
    // Show "sketch.ino:5:3: error ..." instead of the temp path.
    const clean = (s) => s.split(sketchDir + path.sep).join('').split(sketchDir).join('sketch').split(dir).join('').trim();
    if (err) {
      if (err.code === 'ENOENT') return { status: 500, body: { ok: false, error: 'arduino-cli not found (' + CLI + '). See compile-service/README.md.' } };
      if (err.killed) return { status: 504, body: { ok: false, error: 'Compilation timed out after ' + TIMEOUT_MS / 1000 + 's.' } };
      return { status: 400, body: { ok: false, error: clean(stderr || stdout).slice(0, 20000) || 'Compilation failed.' } };
    }
    const hex = await readFile(path.join(outDir, 'sketch.ino.hex'));
    return { status: 200, body: { ok: true, hex: hex.toString('base64'), log: clean(stdout) } };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- rate limit: fixed one-minute window per client IP ----------
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.start > 60_000) { hits.set(ip, { start: now, n: 1 }); return false; }
  return ++h.n > RATE_PER_MIN;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.start > 60_000) hits.delete(ip); }, 60_000).unref();

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind the host's load balancer: req.ip is the student's address

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin))) {
    res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600' });
  }
  res.vary('Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

let cliVersion = null;
run(CLI, ['version']).then(({ err, stdout }) => { cliVersion = err ? null : stdout.trim(); });
app.get('/api/health', (req, res) => res.status(cliVersion ? 200 : 503).json({ ok: !!cliVersion, arduinoCli: cliVersion, queue: pending }));

app.post('/api/compile', express.json({ limit: '128kb' }), async (req, res) => {
  const { code, board = 'uno' } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ ok: false, error: 'Missing "code".' });
  if (code.length > MAX_CODE) return res.status(413).json({ ok: false, error: 'Sketch is too large.' });
  const fqbn = BOARDS[board];
  if (!fqbn) return res.status(400).json({ ok: false, error: 'Unknown board "' + board + '". Supported: ' + Object.keys(BOARDS).join(', ') + '.' });
  const refused = checkSketch(code);
  if (refused) return res.status(400).json({ ok: false, error: refused });
  if (limited(req.ip)) return res.status(429).json({ ok: false, error: 'Too many compiles, try again in a minute.' });
  if (pending >= MAX_QUEUE) return res.status(429).json({ ok: false, error: 'Compile queue is full, try again shortly.' });
  try {
    const { status, body } = await serial(() => compile(code, fqbn));
    res.status(status).json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Compile service error.' });
  }
});
app.all('/api/*splat', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

if (SERVE_SITE) {
  // Local dev: the static site. Never serve this folder (toolchain, node_modules) or dotfiles.
  app.use('/compile-service', (req, res) => res.status(404).end());
  app.use(express.static(SITE, { dotfiles: 'ignore', extensions: ['html'] }));
}

app.listen(PORT, HOST, () => {
  console.log('RoboSTEAM compile service on http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT +
    (SERVE_SITE ? '  (site: http://localhost:' + PORT + '/simulator.html)' : '  (API only)'));
  console.log('arduino-cli: ' + CLI);
});
