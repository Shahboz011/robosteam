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
  compileError: 'Kodda xato bor',
  more: "Ko'proq: kompilyator xabari",
  goToLine: (n) => n + '-qatorga o\'tish',
  line: (n) => n + '-qator',
  errSemicolon: "`;` belgisi yetishmayapti. Buyruq oxiriga nuqtali vergul qo'ying.",
  errParen: "Qavs yopilmagan: `)` yetishmayapti.",
  errMissing: (c) => '`' + c + '` belgisi yetishmayapti.',
  errBraceEnd: "Kod oxirida `}` yetishmayapti: har bir `{` uchun yopuvchi `}` bo'lishi kerak.",
  errUndeclared: (name, guess) => '`' + name + '` degan nom topilmadi. ' +
    (guess ? 'Balki `' + guess + '` demoqchisiz? ' : '') + "Yozilishini tekshiring: katta-kichik harf ham muhim.",
  errType: (name, guess) => '`' + name + "` noma'lum so'z. " + (guess ? 'Balki `' + guess + '` demoqchisiz? ' : '') + 'Yozilishini tekshiring.',
  errUnexpected: "Bu yerda nimadir ortiqcha yoki yetishmayapti: qavslar va nuqtali vergullarni tekshiring.",
  errStray: "Kodda notanish belgi bor (masalan, ‘ ’ yoki “ ” kabi qo'shtirnoq). Oddiy ' va \" belgilaridan foydalaning.",
  errQuote: "Matn yopilmagan: oxiriga `\"` qo'shtirnoq qo'ying.",
  errFuncInside: "Oldingi funksiya yopilmagan: yangi funksiya boshlanishidan oldin `}` qo'ying.",
  errInclude:"Bu `#include` ruxsat etilmagan: faqat kutubxonalarni ulash mumkin, masalan `#include <Servo.h>`.",
  errNoLibrary: (name) => '`' + name + "` kutubxonasi topilmadi. Nomini tekshiring.",
  errOther:"Bu qatorda xato bor. Batafsil ma'lumot pastdagi «Ko'proq» bo'limida.",
  noService: "Kodni hozircha ishga tushirib bo'lmadi. Birozdan so'ng qayta urinib ko'ring.",
  busy: "Hozir juda ko'p urinish bo'ldi. Bir daqiqadan so'ng qayta urinib ko'ring.",
  waking: "Server uyg'onmoqda: birinchi ishga tushirish bir daqiqagacha cho'zilishi mumkin…",
  compiled: (bytes) => 'Tayyor: dastur ' + bytes + ' bayt.',
  confirmReset: "Kod boshlang'ich namunaga qaytarilsinmi? Hozirgi o'zgarishlar o'chib ketadi.",
  soon: 'Tez orada',
  sound: 'Ovoz',
  muted: 'Ovozsiz',
  open: (title) => title + ' loyihasini ochish',
  docTitle: (title) => (title ? title + ' – ' : '') + 'Simulyator – RoboSTEAM',
};
const store = (id) => ({ code: 'robosteam.sim.' + id + '.code', wires: 'robosteam.sim.' + id + '.wires' });
const SERIAL_MAX = 20000;
// Where sketches are compiled: COMPILE_URL in js/config.js (the hosted compile-service), except on localhost,
// where compile-service/server.js serves both the page and /api/compile, so local work never needs the internet.
const LOCAL_DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const COMPILE_BASE = LOCAL_DEV ? '' : ((window.ROBOSTEAM_CONFIG || {}).COMPILE_URL || '').trim().replace(/\/+$/, '');
const COMPILE_URL = COMPILE_BASE ? COMPILE_BASE + '/api/compile' : 'api/compile';
const COMPILE_TIMEOUT_MS = 120000;

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => [...document.querySelectorAll(sel)];
const ui = {
  gallery: $('[data-view="gallery"]'), editorView: $('[data-view="editor"]'), cards: $('[data-gallery]'),
  title: $('[data-project-title]'), level: $('[data-project-level]'),
  svg: $('[data-circuit]'), warnings: $('[data-warnings]'),
  // Run/Stop/status/time exist twice: in the code card and in the phone-only sticky bar (.sim-runbar).
  run: $all('[data-run]'), stop: $all('[data-stop]'), status: $all('[data-status]'), time: $all('[data-time]'),
  canvasWrap: $('.sim-canvas-wrap'), runbar: $('[data-runbar]'),
  code: $('[data-code]'), result: $('[data-result]'),
  serial: $('[data-serial]'), serialClear: $('[data-serial-clear]'),
  example: $('[data-example]'), clear: $('[data-clear]'), resetCode: $('[data-reset-code]'),
  mute: $('[data-mute]'), muteLabel: $('[data-mute-label]'),
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

/* "Did you mean …?" for a misspelled name. avr-gcc 7 rarely suggests one, so compare against the Arduino
   names beginners use most plus every word in the sketch: same letters ignoring case, or up to 2 typos. */
const ARDUINO_NAMES = ('pinMode digitalWrite digitalRead analogRead analogWrite analogReference delay delayMicroseconds millis micros ' +
  'tone noTone pulseIn shiftOut shiftIn attachInterrupt detachInterrupt map constrain random randomSeed abs min max ' +
  'Serial begin print println available read write HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN A0 A1 A2 A3 A4 A5 ' +
  'setup loop void int long float double bool boolean byte char unsigned const String true false return while for if else').split(' ');
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function suggest(name, code) {
  const words = new Set(ARDUINO_NAMES.concat(code.match(/[A-Za-z_]\w*/g) || []));
  words.delete(name);
  let best = null, bestD = 3;
  for (const w of words) {
    const dist = w.toLowerCase() === name.toLowerCase() ? 0.5 : Math.abs(w.length - name.length) > 2 ? 9 : editDistance(w, name);
    if (dist < bestD && (dist <= 1 || name.length > 4)) { best = w; bestD = dist; }
  }
  return best;
}

/* Compiler output -> short Uzbek explanations [{ line, text }] for the mistakes beginners make most.
   gcc reports a missing ';' at the token AFTER the gap; when that token starts its line, the ';' belongs at
   the end of the previous line of code, so that is the line we name. */
function explainErrors(raw, code) {
  const src = code.split('\n');
  const prevCodeLine = (n) => {
    for (let i = n - 1; i >= 1; i--) if (src[i - 1].trim() && !/^\s*\/\//.test(src[i - 1])) return i;
    return n;
  };
  const out = [], seen = new Set();
  for (const m of raw.matchAll(/sketch\.ino:(\d+):(\d+): (?:fatal )?error: ([^\r\n]+)/g)) {
    let line = +m[1];
    const col = +m[2], msg = m[3].trim();
    let k, text;
    if ((k = msg.match(/^expected '([;,)\]}])' before/))) {
      const s = src[line - 1] || '';
      if (col <= s.length - s.trimStart().length + 1) line = prevCodeLine(line);
      text = k[1] === ';' ? T.errSemicolon : k[1] === ')' ? T.errParen : T.errMissing(k[1]);
    } else if (/^expected '}' at end of input/.test(msg)) text = T.errBraceEnd;
    else if ((k = msg.match(/^'([^']+)' was not declared in this scope(?:; did you mean '([^']+)'\?)?/))) text = T.errUndeclared(k[1], k[2] || suggest(k[1], code));
    else if ((k = msg.match(/^'([^']+)' does not name a type(?:; did you mean '([^']+)'\?)?/))) text = T.errType(k[1], k[2] || suggest(k[1], code));
    else if (/^a function-definition is not allowed here/.test(msg)) text = T.errFuncInside;
    else if (/^include not allowed/.test(msg)) text = T.errInclude;
    else if (/^[^:]*: No such file or directory/.test(msg)) text = T.errNoLibrary(msg.split(':')[0]);
    else if (/^stray '/.test(msg)) text = T.errStray;
    else if (/^missing terminating ["'] character/.test(msg)) text = T.errQuote;
    else if (/^expected (primary-expression|unqualified-id|declaration|initializer|'[({]')/.test(msg)) text = T.errUnexpected;
    else text = T.errOther;
    const key = line + '|' + text;
    if (!seen.has(key)) { seen.add(key); out.push({ line, text }); }
  }
  return out.slice(0, 4);
}

let marked = [];
function clearMarks() { if (editor) marked.forEach((l) => editor.removeLineClass(l, 'background', 'cm-error-line')); marked = []; }
function markErrors(items) {
  if (!editor) return;
  clearMarks();
  items.forEach(({ line }) => {
    const h = editor.getLineHandle(line - 1);
    if (h) { editor.addLineClass(h, 'background', 'cm-error-line'); marked.push(h); }
  });
}
function goToLine(n) {
  if (editor) { editor.focus(); editor.setCursor({ line: n - 1, ch: 0 }); editor.scrollIntoView(null, 80); return; }
  const lines = ui.code.value.split('\n'), start = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  ui.code.focus(); ui.code.setSelectionRange(start, start + (lines[n - 1] || '').length);
}
// `code` in a message becomes <code>; everything else is plain text.
function richText(el, s) {
  s.split('`').forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const c = document.createElement('code'); c.textContent = part; el.appendChild(c); } else el.appendChild(document.createTextNode(part));
  });
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

// ---------- sound (buzzer) ----------
// One square-wave oscillator whose pitch follows circuit.sound (the frequency tone() switches the buzzer pin at).
// Quiet on purpose; mute is remembered per browser. ui.mute's data-hz says what is actually playing (0 = silent).
const MUTE_KEY = 'robosteam.sim.muted', VOLUME = 0.04;
const audio = {
  ctx: null, osc: null, gain: null, hz: 0, muted: load(MUTE_KEY) === '1',
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'square';
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
  },
  play(hz) {
    const f = this.muted ? 0 : Math.round(hz);
    if (f === this.hz) return;
    this.hz = f;
    ui.mute.dataset.hz = f;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (f > 0) { this.osc.frequency.setTargetAtTime(f, t, 0.003); this.gain.gain.setTargetAtTime(VOLUME, t, 0.005); }
    else this.gain.gain.setTargetAtTime(0, t, 0.01); // short fade: no click
  },
};
function paintMute() {
  ui.mute.setAttribute('aria-pressed', String(audio.muted));
  ui.muteLabel.textContent = audio.muted ? T.muted : T.sound;
  ui.mute.querySelector('[data-mute-waves]').style.visibility = audio.muted ? 'hidden' : '';
}
ui.mute.addEventListener('click', () => {
  audio.muted = !audio.muted;
  save(MUTE_KEY, audio.muted ? '1' : '0');
  paintMute();
  audio.play(runner ? circuit.sound : 0);
});
paintMute();

// ---------- run / stop ----------
let runner = null, compiling = null, lastSecond = -1;

function setTime(text) { ui.time.forEach((el) => { el.textContent = text; }); }
function setStatus(state) {
  ui.status.forEach((el) => { el.textContent = T[state]; el.dataset.state = state; });
  ui.run.forEach((b) => { b.disabled = state === 'compiling'; b.setAttribute('aria-busy', String(state === 'compiling')); });
  ui.stop.forEach((b) => { b.disabled = state === 'stopped'; });
}

// kind: 'error' | 'ok' | 'info' | null (hide)
function showResult(kind, title) {
  ui.result.hidden = !kind;
  if (!kind) return;
  ui.result.className = 'form-msg sim-result is-' + kind;
  ui.result.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  ui.result.appendChild(strong);
}

function showCompileErrors(items, raw) {
  showResult('error', T.compileError);
  const list = document.createElement('ul');
  list.className = 'sim-errors';
  (items.length ? items : [{ line: 0, text: T.errOther }]).forEach(({ line, text }) => {
    const li = document.createElement('li');
    if (line) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sim-err-line'; b.textContent = T.line(line); b.title = T.goToLine(line);
      b.addEventListener('click', () => goToLine(line));
      li.appendChild(b);
    }
    const span = document.createElement('span');
    richText(span, text);
    li.appendChild(span);
    list.appendChild(li);
  });
  ui.result.appendChild(list);
  const more = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
  summary.textContent = T.more;
  pre.textContent = raw;
  more.append(summary, pre);
  ui.result.appendChild(more);
}

function stop() {
  if (compiling) { compiling.abort(); compiling = null; }
  if (runner) { runner.stop(); runner = null; }
  circuit.releaseButtons();
  circuit.update(null);
  audio.play(0);
  lastSecond = -1;
  setStatus('stopped');
}

async function run() {
  audio.unlock(); // browsers only allow sound after a click/key press: Run is one
  if (compiling || !project) return;
  stop();
  setStatus('compiling');
  showResult(null);
  const ctrl = compiling = new AbortController();
  const code = getCode();
  // A sleeping free-tier server can take ~1 min to wake up: say so instead of looking frozen.
  const wakeTimer = setTimeout(() => { if (compiling === ctrl) showResult('info', T.waking); }, 6000);
  const giveUp = setTimeout(() => ctrl.abort('timeout'), COMPILE_TIMEOUT_MS);
  let res, body;
  try {
    res = await fetch(COMPILE_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, board: project.board || 'uno' }), signal: ctrl.signal,
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    clearTimeout(wakeTimer); clearTimeout(giveUp);
    if (ctrl.signal.aborted && ctrl.signal.reason !== 'timeout') return; // stopped by the user
    compiling = null; setStatus('stopped');
    console.warn('[simulator] compile service unreachable at ' + COMPILE_URL + ':', e,
      '\nLocal dev: cd compile-service && npm start. Production: set COMPILE_URL in js/config.js (compile-service/README.md).');
    showResult('error', T.noService);
    return;
  }
  clearTimeout(wakeTimer); clearTimeout(giveUp);
  if (ctrl.signal.aborted) return;
  compiling = null;
  if (res.status === 400 && body && !body.ok) { // the sketch itself doesn't compile
    setStatus('stopped');
    const items = explainErrors(body.error || '', code);
    showCompileErrors(items, body.error || '');
    markErrors(items);
    return;
  }
  if (!res.ok || !body || !body.ok) {             // service trouble: students get plain words, developers the details
    setStatus('stopped');
    console.warn('[simulator] compile service error ' + res.status + ' from ' + COMPILE_URL + ':', body && body.error);
    showResult('error', res.status === 429 ? T.busy : T.noService);
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
    audio.play(circuit.sound);
    flushSerial();
    const s = Math.floor(r.millis / 100) / 10;
    if (s !== lastSecond) { lastSecond = s; setTime(T.simTime(s.toFixed(1))); }
  };
  circuit.update(runner); // tie inputs before the first instruction
  runner.start();
  setStatus('running');
}

ui.run.forEach((b) => b.addEventListener('click', run));
ui.stop.forEach((b) => b.addEventListener('click', stop));
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
  ui.mute.hidden = !p.parts.some((x) => x.type === 'buzzer');
  serialBuf = ''; serialDirty = true; flushSerial();
  showResult(null);
  setTime(T.simTime('0.0'));
  circuit.update(null);
}

// Phones: the circuit is wider than the card and scrolls sideways. Start where the parts are (right of the
// board), so the LED is in view; a board-only project starts at the left.
const PHONE = window.matchMedia('(max-width: 639px)');
function revealParts() {
  const w = ui.canvasWrap;
  w.scrollLeft = PHONE.matches && project && project.parts.length ? w.scrollWidth - w.clientWidth : 0;
}

function route(focus) {
  stop();
  const p = findProject(decodeURIComponent(location.hash.slice(1)));
  if (p && p !== project) openProject(p);
  if (!p) project = null;
  ui.gallery.hidden = !!p;
  ui.editorView.hidden = !p;
  ui.runbar.hidden = !p;
  document.title = T.docTitle(p && p.title);
  if (p && editor) editor.refresh(); // CodeMirror measures itself; it was hidden until now
  if (p) revealParts();         // needs the editor view visible to measure
  if (focus) {
    window.scrollTo(0, 0);
    (p ? ui.title : ui.gallery.querySelector('h1')).focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', () => route(true));
route(false);
