/* Simulator page, two views on one page (the sidebar keeps "Simulyator" highlighted in both):
   - gallery (simulator.html): project cards from projects.js;
   - editor (simulator.html#<project id>): the project's circuit + code editor (CodeMirror 5 from cdnjs, plain
     textarea if it fails to load) -> POST /api/compile (compile-service/, arduino-cli) -> Intel HEX ->
     AVRRunner (avr8js) driving the circuit canvas every frame.
   Each project's code and wires are remembered separately in localStorage. Every user-facing string is in T. */
import { AVRRunner } from './avr-runner.js';
import { Circuit } from './circuit.js';
import { PROJECTS, LEVELS, findProject } from './projects.js';

const T = {
  stopped: "To'xtatilgan",
  compiling: 'Kompilyatsiya qilinmoqda…',
  running: 'Ishlamoqda',
  simTime: (s) => 'Vaqt: ' + s + ' s',
  compileError: 'Kompilyatsiya xatosi',
  noService: "Kompilyatsiya xizmatiga ulanib bo'lmadi. Kompyuteringizda compile-service ishga tushirilganmi? (compile-service/README.md)",
  serviceError: 'Kompilyatsiya xizmatida xato',
  compiled: (bytes) => 'Tayyor: dastur ' + bytes + ' bayt.',
  confirmReset: "Kod boshlang'ich namunaga qaytarilsinmi? Hozirgi o'zgarishlar o'chib ketadi.",
  soon: 'Tez orada',
  open: (title) => title + ' loyihasini ochish',
  docTitle: (title) => (title ? title + ' – ' : '') + 'Simulyator – RoboSTEAM',
};
const store = (id) => ({ code: 'robosteam.sim.' + id + '.code', wires: 'robosteam.sim.' + id + '.wires' });
const SERIAL_MAX = 20000;

const $ = (sel) => document.querySelector(sel);
const ui = {
  gallery: $('[data-view="gallery"]'), editorView: $('[data-view="editor"]'), cards: $('[data-gallery]'),
  title: $('[data-project-title]'), level: $('[data-project-level]'),
  svg: $('[data-circuit]'), warnings: $('[data-warnings]'),
  run: $('[data-run]'), stop: $('[data-stop]'), status: $('[data-status]'), time: $('[data-time]'),
  code: $('[data-code]'), result: $('[data-result]'),
  serial: $('[data-serial]'), serialClear: $('[data-serial-clear]'),
  example: $('[data-example]'), clear: $('[data-clear]'), resetCode: $('[data-reset-code]'),
};

function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function save(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: work just isn't remembered */ } }

// Before projects existed, the one circuit was saved under these keys: hand that work to "Tugma + LED".
(function migrate() {
  const to = store('tugma-led');
  [['robosteam.sim.code', to.code], ['robosteam.sim.wires', to.wires]].forEach(([from, key]) => {
    const v = load(from);
    if (v !== null && load(key) === null) save(key, v);
    try { localStorage.removeItem(from); } catch (e) { /* ignore */ }
  });
})();

let project = null; // the open project (null in the gallery)

// ---------- gallery ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
ui.cards.innerHTML = PROJECTS.map((p) => {
  const inner =
    '<span class="proj-thumb">' + p.thumbnail + '</span>' +
    '<span class="proj-body">' +
      '<span class="proj-tags"><span class="lvl is-' + p.level + '">' + LEVELS[p.level] + '</span>' + (p.ready ? '' : '<span class="proj-soon">' + T.soon + '</span>') + '</span>' +
      '<h3 class="proj-title">' + esc(p.title) + '</h3>' +
      '<span class="proj-desc">' + esc(p.description) + '</span>' +
    '</span>';
  return '<li>' + (p.ready
    ? '<a class="proj-card" href="#' + p.id + '" aria-label="' + esc(T.open(p.title)) + '">' + inner + '</a>'
    : '<div class="proj-card is-soon" aria-disabled="true">' + inner + '</div>') + '</li>';
}).join('');

// ---------- editor ----------
let editor = null;
if (window.CodeMirror) {
  editor = window.CodeMirror.fromTextArea(ui.code, {
    mode: 'text/x-c++src', theme: 'robo', lineNumbers: true, indentUnit: 2, tabSize: 2,
    matchBrackets: true, autoCloseBrackets: true, viewportMargin: Infinity,
    extraKeys: { 'Ctrl-Enter': () => run(), 'Cmd-Enter': () => run() },
  });
  editor.on('change', () => { if (project) save(store(project.id).code, editor.getValue()); clearMarks(); });
} else {
  ui.code.addEventListener('input', () => { if (project) save(store(project.id).code, ui.code.value); });
  ui.code.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
}
const getCode = () => (editor ? editor.getValue() : ui.code.value);
function setCode(v) {
  if (editor) { editor.setValue(v); editor.clearHistory(); } else ui.code.value = v;
  if (project) save(store(project.id).code, v);
}

let marked = [];
function clearMarks() { marked.forEach((l) => editor.removeLineClass(l, 'background', 'cm-error-line')); marked = []; }
function markErrors(text) {
  if (!editor) return;
  clearMarks();
  for (const m of text.matchAll(/sketch\.ino:(\d+):\d+: (?:fatal )?error/g)) {
    const line = editor.getLineHandle(+m[1] - 1);
    if (line) { editor.addLineClass(line, 'background', 'cm-error-line'); marked.push(line); }
  }
}

// ---------- circuit ----------
const circuit = new Circuit(ui.svg, {
  onChange(c) {
    if (project) save(store(project.id).wires, JSON.stringify(c.wires));
    ui.warnings.hidden = !c.warnings.length;
    ui.warnings.innerHTML = '';
    c.warnings.forEach((w) => { const li = document.createElement('li'); li.textContent = w; ui.warnings.appendChild(li); });
  },
});

ui.example.addEventListener('click', () => { circuit.resetWires(); circuit.update(runner); });
ui.clear.addEventListener('click', () => { circuit.clear(); circuit.update(runner); });
ui.resetCode.addEventListener('click', () => { if (getCode() === project.code || confirm(T.confirmReset)) setCode(project.code); });

// ---------- serial monitor ----------
let serialBuf = '', serialDirty = false;
function flushSerial() {
  if (!serialDirty) return;
  serialDirty = false;
  const el = ui.serial, atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  if (serialBuf.length > SERIAL_MAX) serialBuf = serialBuf.slice(-SERIAL_MAX);
  el.textContent = serialBuf;
  if (atBottom) el.scrollTop = el.scrollHeight;
}
ui.serialClear.addEventListener('click', () => { serialBuf = ''; serialDirty = true; flushSerial(); });

// ---------- run / stop ----------
let runner = null, compiling = null, lastSecond = -1;

function setStatus(state) {
  ui.status.textContent = T[state];
  ui.status.dataset.state = state;
  ui.run.disabled = state === 'compiling';
  ui.run.setAttribute('aria-busy', String(state === 'compiling'));
  ui.stop.disabled = state === 'stopped';
}

function showResult(kind, title, body) {
  ui.result.hidden = !kind;
  if (!kind) return;
  ui.result.className = 'form-msg sim-result ' + (kind === 'error' ? 'is-error' : 'is-ok');
  ui.result.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  ui.result.appendChild(strong);
  if (body) { const pre = document.createElement('pre'); pre.textContent = body; ui.result.appendChild(pre); }
}

function stop() {
  if (compiling) { compiling.abort(); compiling = null; }
  if (runner) { runner.stop(); runner = null; }
  circuit.releaseButtons();
  circuit.update(null);
  lastSecond = -1;
  setStatus('stopped');
}

async function run() {
  if (compiling || !project) return;
  stop();
  setStatus('compiling');
  showResult(null);
  const ctrl = compiling = new AbortController();
  let res, body;
  try {
    res = await fetch('api/compile', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: getCode(), board: project.board || 'uno' }), signal: ctrl.signal,
    });
    body = await res.json();
  } catch (e) {
    if (ctrl.signal.aborted) return;
    compiling = null; setStatus('stopped');
    showResult('error', T.noService);
    return;
  }
  if (ctrl.signal.aborted) return;
  compiling = null;
  if (!body || !body.ok) {
    setStatus('stopped');
    const error = (body && body.error) || res.status + ' ' + res.statusText;
    showResult('error', res.status === 400 ? T.compileError : T.serviceError, error);
    markErrors(error);
    return;
  }
  const hex = atob(body.hex);
  const bytes = (body.log.match(/Sketch uses (\d+) bytes/) || [])[1];
  showResult(bytes ? 'ok' : null, bytes ? T.compiled(bytes) : '');

  serialBuf = ''; serialDirty = true;
  runner = new AVRRunner(hex);
  runner.onSerial = (ch) => { serialBuf += ch; serialDirty = true; };
  runner.onFrame = (r) => {
    circuit.update(r);
    flushSerial();
    const s = Math.floor(r.millis / 100) / 10;
    if (s !== lastSecond) { lastSecond = s; ui.time.textContent = T.simTime(s.toFixed(1)); }
  };
  circuit.update(runner); // tie inputs before the first instruction
  runner.start();
  setStatus('running');
}

ui.run.addEventListener('click', run);
ui.stop.addEventListener('click', stop);
window.addEventListener('pagehide', stop);

// ---------- views (#<project id> = editor, anything else = gallery) ----------
function openProject(p) {
  project = null; // don't save into the old project while swapping
  const keys = store(p.id), savedCode = load(keys.code), savedWires = load(keys.wires);
  let wires = null;
  try { wires = savedWires === null ? null : JSON.parse(savedWires); } catch (e) { /* corrupt: use the default */ }
  circuit.setProject(p, wires || p.wires);
  project = p;
  setCode(savedCode === null ? p.code : savedCode);
  ui.title.textContent = p.title;
  ui.level.textContent = LEVELS[p.level];
  ui.level.className = 'lvl is-' + p.level;
  serialBuf = ''; serialDirty = true; flushSerial();
  showResult(null);
  ui.time.textContent = T.simTime('0.0');
  circuit.update(null);
}

function route(focus) {
  stop();
  const p = findProject(decodeURIComponent(location.hash.slice(1)));
  if (p && p !== project) openProject(p);
  if (!p) project = null;
  ui.gallery.hidden = !!p;
  ui.editorView.hidden = !p;
  document.title = T.docTitle(p && p.title);
  if (p && editor) editor.refresh(); // CodeMirror measures itself; it was hidden until now
  if (focus) {
    window.scrollTo(0, 0);
    (p ? ui.title : ui.gallery.querySelector('h1')).focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', () => route(true));
route(false);
