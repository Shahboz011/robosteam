/* Circuit canvas (SVG): an Arduino Uno plus the parts a project places (see projects.js), and the wires the
   user draws between pins (click/tap one pin, then another; click a wire to remove it).
   Electrical model is digital only: wires, resistors and pressed buttons join nodes into nets; a net is
   LOW if it touches GND, HIGH if it touches 5V, otherwise whatever an OUTPUT pin on it drives, otherwise
   floating (the input pin then reads its own pull-up, see avr-runner.js). No voltages or currents. */
import { PinState } from './avr-runner.js';

const T = {
  pin: (n) => n + '-pin',
  resistor: 'Rezistor 220 Ω',
  ledA: 'LED anodi (+, uzun oyoq)',
  ledK: 'LED katodi (−, qisqa oyoq)',
  btn: 'Tugma',
  btnLeg: (n) => 'Tugma oyog\'i ' + n,
  wire: (a, b) => 'Sim: ' + a + ' — ' + b + '. O\'chirish uchun bosing',
  pressHint: 'Bosib turing',
  warnNoRes: 'LED rezistorsiz ulangan: haqiqiy LED kuyib qolishi mumkin. Oraga rezistor qo\'ying.',
  warnReverse: 'LED teskari ulangan: uzun oyog\'i (+) pin tomonga, qisqasi (−) GND ga qarashi kerak.',
  warnShort: (p) => 'Qisqa tutashuv: ' + p + ' HIGH berayapti, lekin to\'g\'ridan-to\'g\'ri GND ga ulangan.',
};

// ---------- board geometry (viewBox 0 0 660 380) ----------
const TOP_Y = 55, BOT_Y = 262;
const TOP = [['gnd1', 'GND', 52], ['13', '13', 70], ['12', '12', 88], ['11', '~11', 106], ['10', '~10', 124], ['9', '~9', 142], ['8', '8', 160],
  ['7', '7', 188], ['6', '~6', 206], ['5', '~5', 224], ['4', '4', 242], ['3', '~3', 260], ['2', '2', 278], ['1', 'TX', 296], ['0', 'RX', 314]];
const BOT = [['5v', '5V', 204], ['gnd2', 'GND', 230], ['gnd3', 'GND', 256]];

const BOARD_PINS = {}; // id -> { x, y, label (for people) }
TOP.forEach(([id, , x]) => { BOARD_PINS['uno.' + id] = { x, y: TOP_Y, label: id.startsWith('gnd') ? 'GND' : T.pin(id) }; });
BOT.forEach(([id, text, x]) => { BOARD_PINS['uno.' + id] = { x, y: BOT_Y, label: text }; });
const DIGITAL = Array.from({ length: 14 }, (_, d) => d);
const GND = ['uno.gnd1', 'uno.gnd2', 'uno.gnd3'];
const WIRE_COLORS = ['#3D3BFF', '#FFB020', '#1FBF8F', '#B455E0', '#2FA4E7'];

/* ---------- part types ----------
   pins: name -> [dx, dy, label] relative to the part's (x, y); joined: pin pairs that always conduct (for this
   digital model); draw(id): markup in local coordinates (wrapped in translate(x, y)). */
const PART_TYPES = {
  resistor: {
    pins: { 1: [0, 0, T.resistor + ' (1)'], 2: [140, 0, T.resistor + ' (2)'] },
    joined: [['1', '2']],
    draw: () => '<g class="part" aria-hidden="true"><line class="leg" x1="0" y1="0" x2="35" y2="0"/><line class="leg" x1="105" y1="0" x2="140" y2="0"/>' +
      '<rect class="res" x="35" y="-12" width="70" height="24" rx="11"/><rect class="band b1" x="48" y="-12" width="6" height="24"/><rect class="band b1" x="62" y="-12" width="6" height="24"/><rect class="band b2" x="76" y="-12" width="6" height="24"/><rect class="band b3" x="90" y="-12" width="4" height="24"/>' +
      '<text class="part-label" x="70" y="34">220 Ω</text></g>',
  },
  led: {
    pins: { a: [-12, 84, T.ledA], k: [12, 72, T.ledK] },
    draw: (id) => '<g class="part led-part" data-led="' + id + '" aria-hidden="true"><circle class="led-glow" cx="0" cy="0" r="56" fill="url(#led-glow)"/>' +
      '<line class="leg" x1="-12" y1="30" x2="-12" y2="84"/><line class="leg" x1="12" y1="30" x2="12" y2="72"/>' +
      '<path class="led-body" d="M-20 32 V4 a20 20 0 0 1 40 0 V32 Z"/><rect class="led-rim" x="-24" y="28" width="48" height="7" rx="2"/>' +
      '<text class="part-label" x="-26" y="96">+</text><text class="part-label" x="26" y="84">−</text><text class="part-label" x="0" y="-30">LED</text></g>',
  },
  button: {
    pins: { 1: [-70, 0, T.btnLeg(1)], 2: [70, 0, T.btnLeg(2)] },
    pressedJoins: [['1', '2']],
    draw: (id) => '<g class="part" aria-hidden="true"><line class="leg" x1="-70" y1="0" x2="-28" y2="0"/><line class="leg" x1="28" y1="0" x2="70" y2="0"/>' +
      '<text class="part-label" x="0" y="42">' + T.btn + '</text></g>' +
      '<g class="btn-part" data-button="' + id + '" tabindex="0" role="button" aria-pressed="false" aria-label="' + T.btn + ' (' + T.pressHint + ')">' +
      '<rect class="btn-base" x="-28" y="-28" width="56" height="56" rx="8"/><circle class="btn-cap" cx="0" cy="0" r="17"/></g>',
  },
};

// ---------- union-find ----------
function nets(ids, pairs) {
  const parent = {};
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  ids.forEach((id) => { parent[id] = id; });
  pairs.forEach(([a, b]) => { parent[find(a)] = find(b); });
  const byRoot = {};
  ids.forEach((id) => { (byRoot[find(id)] = byRoot[find(id)] || []).push(id); });
  const netOf = {};
  Object.values(byRoot).forEach((members) => members.forEach((id) => { netOf[id] = members; }));
  return netOf;
}

function boardMarkup() {
  const topLabels = TOP.map(([, t, x]) => '<text class="hdr-label" x="' + x + '" y="' + (TOP_Y + 22) + '">' + t + '</text>').join('');
  const botLabels = BOT.map(([, t, x]) => '<text class="hdr-label" x="' + x + '" y="' + (BOT_Y - 14) + '">' + t + '</text>').join('');
  return '<g class="uno" aria-hidden="true">' +
      '<rect class="usb" x="6" y="96" width="46" height="54" rx="4"/><rect class="jack" x="6" y="196" width="40" height="46" rx="4"/>' +
      '<rect class="mcu" x="20" y="30" width="340" height="256" rx="14"/>' +
      '<rect class="hdr" x="41" y="' + (TOP_Y - 10) + '" width="130" height="20" rx="3"/><rect class="hdr" x="177" y="' + (TOP_Y - 10) + '" width="148" height="20" rx="3"/>' +
      '<rect class="hdr" x="192" y="' + (BOT_Y - 10) + '" width="76" height="20" rx="3"/>' +
      topLabels + botLabels +
      '<text class="brand" x="86" y="150">UNO</text><text class="brand-sub" x="88" y="168">RoboSTEAM</text>' +
      '<rect class="chip" x="170" y="176" width="150" height="44" rx="4"/><text class="chip-label" x="245" y="203">ATmega328P</text>' +
      '<g class="board-led" data-l><rect x="100" y="98" width="14" height="8" rx="2"/><text class="hdr-label" x="107" y="120">L</text></g>' +
      '<g class="board-led is-power" data-on><rect x="290" y="112" width="14" height="8" rx="2"/><text class="hdr-label" x="297" y="134">ON</text></g>' +
    '</g>';
}

export class Circuit {
  constructor(svg, { onChange } = {}) {
    this.svg = svg;
    this.onChange = onChange || (() => {});
    svg.setAttribute('viewBox', '0 0 660 380');
    this.bind();
    this.setProject({ parts: [], wires: [] });
  }

  /* Replace the canvas with a project's parts. `wires` is what to show now (saved work or the project's
     default); the project's own `wires` stay the default for resetWires(). */
  setProject(project, wires) {
    this.parts = (project.parts || []).filter((p) => PART_TYPES[p.type]);
    this.defaultWires = project.wires || [];
    this.pins = Object.assign({}, BOARD_PINS);
    this.parts.forEach((p) => {
      Object.entries(PART_TYPES[p.type].pins).forEach(([name, [dx, dy, label]]) => { this.pins[p.id + '.' + name] = { x: p.x + dx, y: p.y + dy, label }; });
    });
    this.wires = [];
    this.pressed = new Set();  // ids of buttons held down
    this.pending = null;       // first pin of a wire being drawn
    this.painted = {};         // last painted state, to touch the DOM only on change
    this.warnings = [];

    const pinG = (id) => {
      const p = this.pins[id];
      return '<g class="pin" data-pin="' + id + '" tabindex="0" role="button" aria-label="' + p.label + '">' +
        '<circle class="pin-hit" cx="' + p.x + '" cy="' + p.y + '" r="11"/><circle class="pin-dot" cx="' + p.x + '" cy="' + p.y + '" r="5"/></g>';
    };
    this.svg.innerHTML =
      '<defs><radialGradient id="led-glow"><stop offset="0" stop-color="#FF4B3A" stop-opacity=".9"/><stop offset=".45" stop-color="#FF6B57" stop-opacity=".45"/><stop offset="1" stop-color="#FF6B57" stop-opacity="0"/></radialGradient></defs>' +
      boardMarkup() +
      this.parts.map((p) => '<g transform="translate(' + p.x + ' ' + p.y + ')">' + PART_TYPES[p.type].draw(p.id) + '</g>').join('') +
      '<g class="wires" data-wires></g>' +
      '<g class="pins">' + Object.keys(this.pins).map(pinG).join('') + '</g>' +
      '<line class="wire-pending" data-pending x1="0" y1="0" x2="0" y2="0" visibility="hidden"/>';
    this.el = {
      wires: this.svg.querySelector('[data-wires]'), pending: this.svg.querySelector('[data-pending]'),
      l: this.svg.querySelector('[data-l]'), on: this.svg.querySelector('[data-on]'),
      leds: Object.fromEntries([...this.svg.querySelectorAll('[data-led]')].map((g) => [g.dataset.led, g])),
      buttons: Object.fromEntries([...this.svg.querySelectorAll('[data-button]')].map((g) => [g.dataset.button, g])),
      pins: Object.fromEntries([...this.svg.querySelectorAll('[data-pin]')].map((g) => [g.dataset.pin, g])),
    };
    this.setWires(wires || this.defaultWires);
  }

  // ---------- wiring ----------
  setWires(list) {
    this.wires = list.filter(([a, b]) => this.pins[a] && this.pins[b] && a !== b).map((w) => w.slice());
    this.rebuild();
  }
  addWire(a, b) {
    if (a === b || this.wires.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    this.wires.push([a, b]);
    this.rebuild();
  }
  removeWire(i) { this.wires.splice(i, 1); this.rebuild(); }
  clear() { this.cancelPending(); this.setWires([]); }
  resetWires() { this.cancelPending(); this.setWires(this.defaultWires); }

  rebuild() {
    const ids = Object.keys(this.pins);
    const fixed = GND.slice(1).map((g) => [GND[0], g]);                 // the Uno's GND pins are one net
    const joins = [];
    this.parts.forEach((p) => {
      const type = PART_TYPES[p.type];
      (type.joined || []).forEach(([a, b]) => joins.push([p.id + '.' + a, p.id + '.' + b]));
      if (this.pressed.has(p.id)) (type.pressedJoins || []).forEach(([a, b]) => joins.push([p.id + '.' + a, p.id + '.' + b]));
    });
    this.wireNets = nets(ids, fixed.concat(this.wires));                  // wires only: used to spot a missing resistor
    this.nets = nets(ids, fixed.concat(this.wires, joins));
    this.drawWires();
    this.onChange(this);
  }

  drawWires() {
    let colour = 0;
    this.el.wires.innerHTML = this.wires.map(([a, b], i) => {
      const p = this.pins[a], q = this.pins[b];
      const gnd = GND.includes(a) || GND.includes(b), v5 = a === 'uno.5v' || b === 'uno.5v';
      const stroke = gnd ? '' : ' stroke="' + (v5 ? '#FF6B57' : WIRE_COLORS[colour++ % WIRE_COLORS.length]) + '"'; // GND: CSS, follows the theme
      const title = T.wire(p.label, q.label);
      return '<g class="wire" data-wire="' + i + '" tabindex="0" role="button" aria-label="' + title + '"><title>' + title + '</title>' +
        '<line class="wire-hit" x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '"/>' +
        '<line class="wire-line' + (gnd ? ' is-gnd' : '') + '" x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '"' + stroke + '/></g>';
    }).join('');
    Object.entries(this.el.pins).forEach(([id, g]) => {
      g.classList.toggle('is-wired', this.wires.some(([a, b]) => a === id || b === id));
    });
  }

  // ---------- evaluation (every frame while running; once with runner = null when stopped) ----------
  update(runner) {
    const states = DIGITAL.map((d) => (runner ? runner.pinState(d) : PinState.Input));
    const level = (net, skip) => {
      let gnd = false, v5 = false, hi = false, lo = false;
      for (const id of net) {
        if (id === skip) continue;
        if (GND.includes(id)) gnd = true;
        else if (id === 'uno.5v') v5 = true;
        else if (/^uno\.\d+$/.test(id)) {
          const s = states[+id.slice(4)];
          if (s === PinState.High) hi = true; else if (s === PinState.Low) lo = true;
        }
      }
      return { value: gnd ? 0 : v5 ? 1 : hi ? 1 : lo ? 0 : null, hiPin: hi && gnd };
    };

    // Feed input pins with what the circuit ties them to (floating -> null -> the pin's own pull-up).
    if (runner) DIGITAL.forEach((d) => {
      const s = states[d];
      runner.setInput(d, s === PinState.Input || s === PinState.InputPullUp ? level(this.nets['uno.' + d], 'uno.' + d).value : null);
    });

    const warnings = new Set();
    const drives = (net) => net.some((id) => id === 'uno.5v' || /^uno\.\d+$/.test(id));
    this.parts.filter((p) => p.type === 'led').forEach((p) => {
      const a = level(this.nets[p.id + '.a']).value, k = level(this.nets[p.id + '.k']).value;
      const on = runner !== null && a === 1 && k === 0;
      if (runner) {
        if (on && drives(this.wireNets[p.id + '.a']) && this.wireNets[p.id + '.k'].some((id) => GND.includes(id))) warnings.add(T.warnNoRes);
        if (a === 0 && k === 1) warnings.add(T.warnReverse);
      }
      this.paint('led:' + p.id, on, () => this.el.leds[p.id].classList.toggle('is-on', on));
    });
    if (runner) DIGITAL.forEach((d) => {
      if (states[d] === PinState.High && level(this.nets['uno.' + d]).hiPin) warnings.add(T.warnShort(T.pin(d)));
    });

    const lOn = !!runner && states[13] === PinState.High;
    this.paint('l', lOn, () => this.el.l.classList.toggle('is-on', lOn));
    this.paint('on', !!runner, () => this.el.on.classList.toggle('is-on', !!runner));
    DIGITAL.forEach((d) => {
      const high = states[d] === PinState.High;
      this.paint('p' + d, high, () => this.el.pins['uno.' + d].classList.toggle('is-high', high));
    });
    const list = [...warnings], key = list.join('\n');
    if (key !== this.painted.warnings) { this.painted.warnings = key; this.warnings = list; this.onChange(this); }
  }

  paint(key, value, fn) {
    if (this.painted[key] === value) return;
    this.painted[key] = value;
    fn();
  }

  // ---------- input ----------
  point(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  pickPin(id) {
    if (!this.pending) {
      this.pending = id;
      this.el.pins[id].classList.add('is-pending');
      const p = this.pins[id];
      ['x1', 'x2'].forEach((k) => this.el.pending.setAttribute(k, p.x));
      ['y1', 'y2'].forEach((k) => this.el.pending.setAttribute(k, p.y));
      this.el.pending.setAttribute('visibility', 'visible');
      return;
    }
    const first = this.pending;
    this.cancelPending();
    if (first !== id) this.addWire(first, id);
  }

  cancelPending() {
    if (!this.pending) return;
    this.el.pins[this.pending].classList.remove('is-pending');
    this.pending = null;
    this.el.pending.setAttribute('visibility', 'hidden');
  }

  setPressed(id, on) {
    const g = this.el.buttons[id];
    if (!g || this.pressed.has(id) === on) return;
    if (on) this.pressed.add(id); else this.pressed.delete(id);
    g.classList.toggle('is-pressed', on);
    g.setAttribute('aria-pressed', String(on));
    this.rebuild();
  }
  releaseButtons() { [...this.pressed].forEach((id) => this.setPressed(id, false)); }

  // Listeners are delegated from the <svg>, so they survive setProject() replacing its contents.
  bind() {
    const svg = this.svg;
    const buttonOf = (e) => e.target.closest && e.target.closest('[data-button]');
    svg.addEventListener('click', (e) => {
      const pin = e.target.closest('[data-pin]');
      if (pin) { this.pickPin(pin.dataset.pin); return; }
      const wire = e.target.closest('[data-wire]');
      if (wire && !this.pending) { this.removeWire(+wire.dataset.wire); return; }
      if (!buttonOf(e)) this.cancelPending();
    });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.cancelPending(); return; }
      const btn = buttonOf(e);
      if (btn) {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); this.setPressed(btn.dataset.button, true); }
        return;
      }
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Delete' && e.key !== 'Backspace') return;
      const pin = e.target.closest('[data-pin]'), wire = e.target.closest('[data-wire]');
      if (pin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.pickPin(pin.dataset.pin); }
      else if (wire) {
        e.preventDefault();
        const i = +wire.dataset.wire;
        this.removeWire(i);
        const next = this.el.wires.querySelector('[data-wire="' + Math.min(i, this.wires.length - 1) + '"]');
        (next || svg.querySelector('[data-pin]')).focus();
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.pending) return;
      const p = this.point(e);
      this.el.pending.setAttribute('x2', p.x);
      this.el.pending.setAttribute('y2', p.y);
    });

    // Pushbuttons: pressed while the pointer (mouse, finger, pen) or Space/Enter is held down.
    svg.addEventListener('pointerdown', (e) => {
      const btn = buttonOf(e);
      if (!btn) return;
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.setPressed(btn.dataset.button, true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => svg.addEventListener(t, (e) => {
      const btn = buttonOf(e);
      if (btn) this.setPressed(btn.dataset.button, false);
    }));
    svg.addEventListener('keyup', (e) => {
      const btn = buttonOf(e);
      if (btn && (e.key === ' ' || e.key === 'Enter')) this.setPressed(btn.dataset.button, false);
    });
    svg.addEventListener('focusout', (e) => { const btn = buttonOf(e); if (btn) this.setPressed(btn.dataset.button, false); });
    svg.addEventListener('contextmenu', (e) => { if (buttonOf(e)) e.preventDefault(); }); // long-press on touch
  }
}
