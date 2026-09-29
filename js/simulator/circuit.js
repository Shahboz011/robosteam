/* Circuit canvas (SVG): an Arduino Uno plus the parts a project places (see projects.js), and the wires the
   user draws between pins (click/tap one pin, then another; click a wire to remove it).
   Electrical model, kept simple on purpose:
   - Digital: wires, resistors and pressed buttons join nodes into nets; a net is LOW if it touches GND, HIGH if
     it touches 5V, otherwise whatever an OUTPUT pin on it drives, otherwise floating (the input pin then reads
     its own pull-up, see avr-runner.js).
   - LEDs light with the share of time their anode is driven HIGH (so analogWrite() PWM dims them).
   - Analog: A0-A5 read 0 V / 5 V when tied to GND / 5V, and a potentiometer's wiper gives position × 5 V when
     its outer legs go to GND and 5V. No resistance, current or voltage drop is simulated.
   - A buzzer sounds at the frequency its + leg is switched at (tone()), with - on GND. */
import { PinState } from './avr-runner.js';

const T = {
  pin: (n) => n + '-pin',
  resistor: 'Rezistor 220 Ω',
  ledA: (c) => c + ' LED anodi (+, uzun oyoq)',
  ledK: (c) => c + ' LED katodi (−, qisqa oyoq)',
  ledColor: { red: 'Qizil', yellow: 'Sariq', green: 'Yashil' },
  btn: 'Tugma',
  btnLeg: (n) => 'Tugma oyog\'i ' + n,
  pot: 'Potentsiometr',
  potLeg: { 3: 'Potentsiometr chap oyog\'i (5V tomoni)', w: 'Potentsiometr o\'rta oyog\'i (signal)', 1: 'Potentsiometr o\'ng oyog\'i (GND tomoni)' },
  potHint: 'Burash uchun suring yoki strelka tugmalarini bosing',
  buzzer: 'Buzzer',
  buzzerLeg: { p: 'Buzzer + oyog\'i', n: 'Buzzer − oyog\'i' },
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
// Bottom edge, as on a real Uno: power header, then the analog inputs.
const BOT = [['5v', '5V', 184], ['gnd2', 'GND', 212], ['gnd3', 'GND', 240],
  ['a0', 'A0', 272], ['a1', 'A1', 290], ['a2', 'A2', 308], ['a3', 'A3', 326], ['a4', 'A4', 344], ['a5', 'A5', 362]];

const BOARD_PINS = {}; // id -> { x, y, label (for people) }
TOP.forEach(([id, , x]) => { BOARD_PINS['uno.' + id] = { x, y: TOP_Y, label: id.startsWith('gnd') ? 'GND' : T.pin(id) }; });
BOT.forEach(([id, text, x]) => { BOARD_PINS['uno.' + id] = { x, y: BOT_Y, label: text }; });
const DIGITAL = Array.from({ length: 14 }, (_, d) => d);
const ANALOG = [0, 1, 2, 3, 4, 5];
const GND = ['uno.gnd1', 'uno.gnd2', 'uno.gnd3'];
const WIRE_COLORS = ['#3D3BFF', '#FFB020', '#1FBF8F', '#B455E0', '#2FA4E7'];
const LED_COLORS = ['red', 'yellow', 'green'];
const POT_SPAN = 270; // knob turns 270°: -135° (0) … +135° (1)

/* ---------- part types ----------
   pins(part): name -> [dx, dy, label] relative to the part's (x, y) before rotation; joined: pin pairs that
   always conduct (in this digital model); pressedJoins: pairs that conduct while a button is held;
   draw(id, part): markup in local coordinates (wrapped in translate(x, y) rotate(rot)). */
const PART_TYPES = {
  resistor: {
    pins: () => ({ 1: [0, 0, T.resistor + ' (1)'], 2: [140, 0, T.resistor + ' (2)'] }),
    joined: [['1', '2']],
    draw: (id, p) => '<g class="part" aria-hidden="true"><line class="leg" x1="0" y1="0" x2="35" y2="0"/><line class="leg" x1="105" y1="0" x2="140" y2="0"/>' +
      '<rect class="res" x="35" y="-12" width="70" height="24" rx="11"/><rect class="band b1" x="48" y="-12" width="6" height="24"/><rect class="band b1" x="62" y="-12" width="6" height="24"/><rect class="band b2" x="76" y="-12" width="6" height="24"/><rect class="band b3" x="90" y="-12" width="4" height="24"/>' +
      // keep the label upright when the resistor stands vertically
      '<text class="part-label" x="70" y="34"' + (p.rot ? ' transform="rotate(' + -p.rot + ' 70 30)"' : '') + '>220 Ω</text></g>',
  },
  led: {
    pins: (p) => { const c = T.ledColor[p.color || 'red']; return { a: [-12, 84, T.ledA(c)], k: [12, 72, T.ledK(c)] }; },
    draw: (id, p) => {
      const color = LED_COLORS.includes(p.color) ? p.color : 'red';
      return '<g class="part led-part is-' + color + '" data-led="' + id + '" aria-hidden="true"><circle class="led-glow" cx="0" cy="0" r="56" fill="url(#led-glow-' + color + ')"/>' +
        '<line class="leg" x1="-12" y1="30" x2="-12" y2="84"/><line class="leg" x1="12" y1="30" x2="12" y2="72"/>' +
        '<path class="led-body" d="M-20 32 V4 a20 20 0 0 1 40 0 V32 Z"/><path class="led-lit" d="M-20 32 V4 a20 20 0 0 1 40 0 V32 Z"/>' +
        '<rect class="led-rim" x="-24" y="28" width="48" height="7" rx="2"/>' +
        '<text class="part-label" x="-26" y="96">+</text><text class="part-label" x="26" y="84">−</text><text class="part-label" x="0" y="-30">LED</text></g>';
    },
  },
  button: {
    pins: () => ({ 1: [-70, 0, T.btnLeg(1)], 2: [70, 0, T.btnLeg(2)] }),
    pressedJoins: [['1', '2']],
    draw: (id) => '<g class="part" aria-hidden="true"><line class="leg" x1="-70" y1="0" x2="-28" y2="0"/><line class="leg" x1="28" y1="0" x2="70" y2="0"/>' +
      '<text class="part-label" x="0" y="42">' + T.btn + '</text></g>' +
      '<g class="btn-part" data-button="' + id + '" tabindex="0" role="button" aria-pressed="false" aria-label="' + T.btn + ' (' + T.pressHint + ')">' +
      '<rect class="btn-base" x="-28" y="-28" width="56" height="56" rx="8"/><circle class="btn-cap" cx="0" cy="0" r="17"/></g>',
  },
  // Rotary potentiometer, legs along the bottom: 3 (left), w (wiper, middle), 1 (right). Turning clockwise moves
  // the wiper towards leg 3, so with 3 on 5V and 1 on GND, clockwise = higher voltage.
  pot: {
    pins: () => ({ 3: [-30, 58, T.potLeg[3]], w: [0, 58, T.potLeg.w], 1: [30, 58, T.potLeg[1]] }),
    draw: (id) => '<g class="part" aria-hidden="true">' +
      '<line class="leg" x1="-30" y1="22" x2="-30" y2="58"/><line class="leg" x1="0" y1="22" x2="0" y2="58"/><line class="leg" x1="30" y1="22" x2="30" y2="58"/>' +
      '<rect class="pot-body" x="-42" y="-34" width="84" height="60" rx="8"/>' +
      '<text class="part-label" x="0" y="-44">' + T.pot + '</text></g>' +
      '<g class="pot-knob" data-pot="' + id + '" tabindex="0" role="slider" aria-label="' + T.pot + '" aria-valuemin="0" aria-valuemax="100" aria-description="' + T.potHint + '">' +
      '<circle class="pot-hit" cx="0" cy="-4" r="30"/><circle class="pot-cap" cx="0" cy="-4" r="22"/>' +
      '<g data-pot-pointer><line class="pot-pointer" x1="0" y1="-4" x2="0" y2="-22"/></g></g>',
  },
  // Passive buzzer: - (left) and + (right) legs along the bottom.
  buzzer: {
    pins: () => ({ n: [-14, 60, T.buzzerLeg.n], p: [14, 60, T.buzzerLeg.p] }),
    draw: (id) => '<g class="part buzzer-part" data-buzzer="' + id + '" aria-hidden="true">' +
      '<path class="bz-wave" d="M44 -22 a30 30 0 0 1 0 36 M56 -32 a44 44 0 0 1 0 56 M-44 -22 a30 30 0 0 0 0 36 M-56 -32 a44 44 0 0 0 0 56"/>' +
      '<line class="leg" x1="-14" y1="28" x2="-14" y2="60"/><line class="leg" x1="14" y1="28" x2="14" y2="60"/>' +
      '<circle class="bz-body" cx="0" cy="-4" r="34"/><circle class="bz-ring" cx="0" cy="-4" r="22"/><circle class="bz-hole" cx="0" cy="-4" r="6"/>' +
      '<text class="bz-plus" x="24" y="-18">+</text>' +
      '<text class="part-label" x="-24" y="74">−</text><text class="part-label" x="24" y="74">+</text><text class="part-label" x="0" y="-48">' + T.buzzer + '</text></g>',
  },
};
const rotate = ([dx, dy], rot) => (rot === 90 ? [-dy, dx] : rot === 180 ? [-dx, -dy] : rot === 270 ? [dy, -dx] : [dx, dy]);

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
      '<rect class="mcu" x="20" y="30" width="356" height="256" rx="14"/>' +
      '<rect class="hdr" x="41" y="' + (TOP_Y - 10) + '" width="130" height="20" rx="3"/><rect class="hdr" x="177" y="' + (TOP_Y - 10) + '" width="148" height="20" rx="3"/>' +
      '<rect class="hdr" x="172" y="' + (BOT_Y - 10) + '" width="80" height="20" rx="3"/><rect class="hdr" x="261" y="' + (BOT_Y - 10) + '" width="112" height="20" rx="3"/>' +
      topLabels + botLabels +
      '<text class="brand" x="86" y="150">UNO</text><text class="brand-sub" x="88" y="168">RoboSTEAM</text>' +
      '<rect class="chip" x="170" y="176" width="150" height="44" rx="4"/><text class="chip-label" x="245" y="203">ATmega328P</text>' +
      '<g class="board-led" data-l><rect x="100" y="98" width="14" height="8" rx="2"/><text class="hdr-label" x="107" y="120">L</text></g>' +
      '<g class="board-led is-power" data-on><rect x="290" y="112" width="14" height="8" rx="2"/><text class="hdr-label" x="297" y="134">ON</text></g>' +
    '</g>';
}

const GLOWS = { red: ['#FF4B3A', '#FF6B57'], yellow: ['#FFD23F', '#FFE27A'], green: ['#3DF2B0', '#6BF7C6'] };
const defs = '<defs>' + Object.entries(GLOWS).map(([c, [a, b]]) =>
  '<radialGradient id="led-glow-' + c + '"><stop offset="0" stop-color="' + a + '" stop-opacity=".9"/><stop offset=".45" stop-color="' + b + '" stop-opacity=".45"/><stop offset="1" stop-color="' + b + '" stop-opacity="0"/></radialGradient>').join('') + '</defs>';

export class Circuit {
  constructor(svg, { onChange } = {}) {
    this.svg = svg;
    this.onChange = onChange || (() => {});
    this.sound = 0; // Hz the buzzer should play right now (0 = silent); read by the page every frame
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
      Object.entries(PART_TYPES[p.type].pins(p)).forEach(([name, [dx, dy, label]]) => {
        const [rx, ry] = rotate([dx, dy], p.rot || 0);
        this.pins[p.id + '.' + name] = { x: p.x + rx, y: p.y + ry, label };
      });
    });
    this.wires = [];
    this.pressed = new Set();  // ids of buttons held down
    this.potValues = Object.fromEntries(this.parts.filter((p) => p.type === 'pot').map((p) => [p.id, p.value ?? 0.5]));
    this.pending = null;       // first pin of a wire being drawn
    this.drag = null;          // potentiometer being turned with the pointer
    this.painted = {};         // last painted state, to touch the DOM only on change
    this.warnings = [];
    this.sound = 0;

    const pinG = (id) => {
      const p = this.pins[id];
      return '<g class="pin" data-pin="' + id + '" tabindex="0" role="button" aria-label="' + p.label + '">' +
        '<circle class="pin-hit" cx="' + p.x + '" cy="' + p.y + '" r="11"/><circle class="pin-dot" cx="' + p.x + '" cy="' + p.y + '" r="5"/></g>';
    };
    this.svg.innerHTML = defs + boardMarkup() +
      this.parts.map((p) => '<g transform="translate(' + p.x + ' ' + p.y + ')' + (p.rot ? ' rotate(' + p.rot + ')' : '') + '">' + PART_TYPES[p.type].draw(p.id, p) + '</g>').join('') +
      '<g class="wires" data-wires></g>' +
      '<g class="pins">' + Object.keys(this.pins).map(pinG).join('') + '</g>' +
      '<line class="wire-pending" data-pending x1="0" y1="0" x2="0" y2="0" visibility="hidden"/>';
    const byData = (attr) => Object.fromEntries([...this.svg.querySelectorAll('[data-' + attr + ']')].map((g) => [g.getAttribute('data-' + attr), g]));
    this.el = {
      wires: this.svg.querySelector('[data-wires]'), pending: this.svg.querySelector('[data-pending]'),
      l: this.svg.querySelector('[data-l]'), on: this.svg.querySelector('[data-on]'),
      leds: byData('led'), buttons: byData('button'), pots: byData('pot'), buzzers: byData('buzzer'), pins: byData('pin'),
    };
    Object.keys(this.potValues).forEach((id) => this.paintPot(id));
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
    const isOut = (d) => states[d] === PinState.High || states[d] === PinState.Low;
    const act = (d) => (runner && runner.activity ? runner.activity(d) : { duty: states[d] === PinState.High ? 1 : 0, freq: 0 });
    const outPins = (net) => net.filter((id) => /^uno\.\d+$/.test(id)).map((id) => +id.slice(4)).filter(isOut);
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
      return { value: gnd ? 0 : v5 ? 1 : hi ? 1 : lo ? 0 : null, hiPin: hi && gnd, gnd, v5 };
    };
    // Share of time a net is HIGH: 5V = 1, GND = 0, else the busiest output pin driving it (PWM-aware).
    const highShare = (net) => {
      const l = level(net);
      if (l.gnd) return 0;
      if (l.v5) return 1;
      const pins = outPins(net);
      return pins.length ? Math.max(...pins.map((d) => act(d).duty)) : 0;
    };

    // Feed input pins with what the circuit ties them to (floating -> null -> the pin's own pull-up).
    if (runner) DIGITAL.forEach((d) => {
      const s = states[d];
      runner.setInput(d, s === PinState.Input || s === PinState.InputPullUp ? level(this.nets['uno.' + d], 'uno.' + d).value : null);
    });

    // Analog inputs: GND / 5V, a potentiometer wiper, or a digital output wired straight in; floating reads 0 V.
    if (runner && runner.setAnalog) ANALOG.forEach((ch) => {
      const net = this.nets['uno.a' + ch];
      let v = 0;
      const l = level(net);
      if (l.gnd) v = 0;
      else if (l.v5) v = 5;
      else {
        const pot = this.parts.find((p) => p.type === 'pot' && net.includes(p.id + '.w'));
        if (pot) v = this.potVolts(pot, level);
        else if (outPins(net).length) v = 5 * highShare(net);
      }
      runner.setAnalog(ch, v);
    });

    const warnings = new Set();
    const drives = (net) => net.some((id) => id === 'uno.5v' || /^uno\.\d+$/.test(id));
    this.parts.filter((p) => p.type === 'led').forEach((p) => {
      const a = level(this.nets[p.id + '.a']).value, k = level(this.nets[p.id + '.k']).value;
      const b = runner && k === 0 ? Math.round(highShare(this.nets[p.id + '.a']) * 20) / 20 : 0; // brightness, 5% steps
      if (runner) {
        if (b > 0 && drives(this.wireNets[p.id + '.a']) && this.wireNets[p.id + '.k'].some((id) => GND.includes(id))) warnings.add(T.warnNoRes);
        if (a === 0 && k === 1) warnings.add(T.warnReverse);
      }
      this.paint('led:' + p.id, b, () => {
        const g = this.el.leds[p.id];
        g.classList.toggle('is-on', b > 0);
        g.style.setProperty('--b', b);
      });
    });
    if (runner) DIGITAL.forEach((d) => {
      if (states[d] === PinState.High && level(this.nets['uno.' + d]).hiPin) warnings.add(T.warnShort(T.pin(d)));
    });

    // Buzzers: pitch of the pin switching the + leg, with - on GND (or a LOW output).
    let sound = 0;
    this.parts.filter((p) => p.type === 'buzzer').forEach((p) => {
      let hz = 0;
      if (runner && level(this.nets[p.id + '.n']).value === 0) {
        for (const d of outPins(this.nets[p.id + '.p'])) hz = Math.max(hz, act(d).freq);
      }
      if (hz < 20 || hz > 20000) hz = 0;
      sound = Math.max(sound, hz);
      const shown = Math.round(hz);
      this.paint('bz:' + p.id, shown, () => {
        const g = this.el.buzzers[p.id];
        g.classList.toggle('is-on', shown > 0);
        g.setAttribute('data-hz', shown);
      });
    });
    this.sound = sound;

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

  // Wiper voltage: position × 5 V with leg 1 on GND and leg 3 on 5V (reversed if swapped); else 0 V.
  potVolts(pot, level) {
    const v = this.potValues[pot.id], one = level(this.nets[pot.id + '.1']), three = level(this.nets[pot.id + '.3']);
    if (one.value === 0 && three.value === 1) return 5 * v;
    if (one.value === 1 && three.value === 0) return 5 * (1 - v);
    return 0;
  }

  setPot(id, value) {
    const v = Math.min(1, Math.max(0, value));
    if (this.potValues[id] === undefined || this.potValues[id] === v) return;
    this.potValues[id] = v;
    this.paintPot(id);
  }
  paintPot(id) {
    const g = this.el.pots[id], v = this.potValues[id];
    g.querySelector('[data-pot-pointer]').setAttribute('transform', 'rotate(' + (v * POT_SPAN - POT_SPAN / 2) + ' 0 -4)');
    g.setAttribute('aria-valuenow', Math.round(v * 100));
    g.setAttribute('aria-valuetext', Math.round(v * 100) + '%');
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
    const potOf = (e) => e.target.closest && e.target.closest('[data-pot]');
    svg.addEventListener('click', (e) => {
      const pin = e.target.closest('[data-pin]');
      if (pin) { this.pickPin(pin.dataset.pin); return; }
      const wire = e.target.closest('[data-wire]');
      if (wire && !this.pending) { this.removeWire(+wire.dataset.wire); return; }
      if (!buttonOf(e) && !potOf(e)) this.cancelPending();
    });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.cancelPending(); return; }
      const btn = buttonOf(e);
      if (btn) {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); this.setPressed(btn.dataset.button, true); }
        return;
      }
      const pot = potOf(e);
      if (pot) {
        const id = pot.dataset.pot, v = this.potValues[id];
        const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
        if (step !== undefined) { e.preventDefault(); this.setPot(id, v + step); }
        else if (e.key === 'Home') { e.preventDefault(); this.setPot(id, 0); }
        else if (e.key === 'End') { e.preventDefault(); this.setPot(id, 1); }
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
      if (this.drag && e.pointerId === this.drag.pointer) {
        // drag right or up to turn clockwise; the whole range is ~160 screen px
        const d = (e.clientX - this.drag.x) - (e.clientY - this.drag.y);
        this.setPot(this.drag.id, this.drag.start + d / 160);
        return;
      }
      if (!this.pending) return;
      const p = this.point(e);
      this.el.pending.setAttribute('x2', p.x);
      this.el.pending.setAttribute('y2', p.y);
    });

    // Pushbuttons: pressed while the pointer (mouse, finger, pen) or Space/Enter is held down.
    // Potentiometers: turned by dragging.
    svg.addEventListener('pointerdown', (e) => {
      const pot = potOf(e);
      if (pot) {
        e.preventDefault();
        pot.setPointerCapture(e.pointerId);
        pot.focus({ preventScroll: true });
        this.drag = { id: pot.dataset.pot, pointer: e.pointerId, x: e.clientX, y: e.clientY, start: this.potValues[pot.dataset.pot] };
        return;
      }
      const btn = buttonOf(e);
      if (!btn) return;
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.setPressed(btn.dataset.button, true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => svg.addEventListener(t, (e) => {
      if (this.drag && e.pointerId === this.drag.pointer) { this.drag = null; return; }
      const btn = buttonOf(e);
      if (btn) this.setPressed(btn.dataset.button, false);
    }));
    svg.addEventListener('keyup', (e) => {
      const btn = buttonOf(e);
      if (btn && (e.key === ' ' || e.key === 'Enter')) this.setPressed(btn.dataset.button, false);
    });
    svg.addEventListener('focusout', (e) => { const btn = buttonOf(e); if (btn) this.setPressed(btn.dataset.button, false); });
    svg.addEventListener('contextmenu', (e) => { if (buttonOf(e) || potOf(e)) e.preventDefault(); }); // long-press on touch
  }
}
