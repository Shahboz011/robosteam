/* RoboSTEAM local dev server.
   - Serves the static site from the repo root (same origin as the API, so the pages' CSP "connect-src 'self'" holds).
   - POST /api/compile { code, board: "uno" } -> { ok: true, hex: <base64 Intel HEX>, log } or { ok: false, error }.
   Compiles with arduino-cli (see README.md). Listens on 127.0.0.1 only: compiling arbitrary C++ can read local
   files through #include and echo them in error messages, so this must not be exposed as-is. */
import express from 'express';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const BOARDS = { uno: 'arduino:avr:uno' };
const MAX_CODE = 64 * 1024;
const TIMEOUT_MS = 60_000;

function findCli() {
  if (process.env.ARDUINO_CLI) return process.env.ARDUINO_CLI;
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

// One compile at a time: arduino-cli is CPU heavy and this is a single-user dev server.
let queue = Promise.resolve();
function serial(task) {
  const next = queue.then(task, task);
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
      if (err.killed) return { status: 500, body: { ok: false, error: 'Compilation timed out after ' + TIMEOUT_MS / 1000 + 's.' } };
      return { status: 400, body: { ok: false, error: clean(stderr || stdout) || 'Compilation failed.' } };
    }
    const hex = await readFile(path.join(outDir, 'sketch.ino.hex'));
    return { status: 200, body: { ok: true, hex: hex.toString('base64'), log: clean(stdout) } };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const app = express();
app.disable('x-powered-by');

app.post('/api/compile', express.json({ limit: '128kb' }), async (req, res) => {
  const { code, board = 'uno' } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ ok: false, error: 'Missing "code".' });
  if (code.length > MAX_CODE) return res.status(413).json({ ok: false, error: 'Sketch is too large.' });
  const fqbn = BOARDS[board];
  if (!fqbn) return res.status(400).json({ ok: false, error: 'Unknown board "' + board + '". Supported: ' + Object.keys(BOARDS).join(', ') + '.' });
  try {
    const { status, body } = await serial(() => compile(code, fqbn));
    res.status(status).json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Compile service error: ' + e.message });
  }
});
app.all('/api/*splat', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

// Static site. Never serve this folder (toolchain, node_modules) or dotfiles.
app.use('/compile-service', (req, res) => res.status(404).end());
app.use(express.static(SITE, { dotfiles: 'ignore', extensions: ['html'] }));

app.listen(PORT, HOST, () => {
  console.log('RoboSTEAM dev server: http://localhost:' + PORT + '/simulator.html');
  console.log('arduino-cli: ' + CLI);
});
