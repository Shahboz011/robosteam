/* ATmega328P (Arduino Uno) emulation on avr8js: loads a compiled Intel HEX, runs it in real time on
   requestAnimationFrame, and exposes the Uno pins D0-D13 and A0-A5 (analog inputs, or digital pins 14-19) and the
   Serial (USART0) output. Nothing here is simplified: the CPU executes the real compiled machine code, delay()/millis() come
   from the emulated Timer0 at 16 MHz, analogWrite() is the real timer PWM and tone() the real Timer2 toggle.

   The page redraws ~60 times a second, far too slowly to see a 490 Hz PWM signal or a 440 Hz tone by sampling
   pin levels, so every pin change is recorded with its CPU cycle and sample() turns each frame into
   { duty, freq } per pin: duty = share of the frame the pin was HIGH (LED brightness), freq = its switching
   frequency (buzzer pitch). */
import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
  AVRIOPort, portBConfig, portCConfig, portDConfig, AVRUSART, usart0Config, AVRADC, adcConfig, PinState,
} from '../vendor/avr8js.js';

export { PinState };
export const CLOCK_HZ = 16e6;
const FLASH_BYTES = 0x8000;       // 32 KB
const MAX_FRAME_MS = 50;          // after a stall (background tab, breakpoint) skip ahead instead of catching up
const MAX_PERIOD = CLOCK_HZ / 40; // rises more than 25 ms apart are a pause (between notes), not a period
const MIN_HOLD = CLOCK_HZ / 500;  // a pin quiet for 1.5 periods (at least 2 ms) has stopped oscillating

/* Intel HEX -> flash image. Record types 00 (data), 01 (EOF), 02/04 (segment/linear address). */
export function parseHex(text) {
  const flash = new Uint8Array(FLASH_BYTES);
  let base = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error('Invalid HEX line: ' + line.slice(0, 20));
    const count = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    const type = parseInt(line.substr(7, 2), 16);
    if (type === 0x00) {
      for (let i = 0; i < count; i++) {
        const at = base + addr + i;
        if (at >= FLASH_BYTES) throw new Error('Program does not fit in 32 KB flash');
        flash[at] = parseInt(line.substr(9 + i * 2, 2), 16);
      }
    } else if (type === 0x01) break;
    else if (type === 0x02) base = parseInt(line.substr(9, 4), 16) << 4;
    else if (type === 0x04) base = parseInt(line.substr(9, 4), 16) << 16;
  }
  return new Uint16Array(flash.buffer);
}

/* Uno digital pin number -> [port, bit]. D0-D7 = PORTD, D8-D13 = PORTB, A0-A5 = D14-D19 = PORTC. */
export const PIN_COUNT = 20;
function pinMap(d) { return d < 8 ? ['D', d] : d < 14 ? ['B', d - 8] : ['C', d - 14]; }

export class AVRRunner {
  constructor(hexText) {
    this.cpu = new CPU(parseHex(hexText));
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.adc = new AVRADC(this.cpu, adcConfig); // analogRead(A0..A5) reads adc.channelValues[0..5] in volts
    this.external = new Map(); // digital pin -> level forced by the circuit (absent = floating)
    this.applied = new Map();  // digital pin -> level last fed into the PIN register
    // Per-pin activity for sample(): current level, cycles spent HIGH, rising edges and their spacing.
    this.act = Array.from({ length: PIN_COUNT }, () => ({ level: 0, since: 0, high: 0, lastRise: -1, lastPeriod: 0, periodSum: 0, periods: 0, duty: 0, freq: 0 }));
    this.windowStart = 0;
    this.watch(this.ports.D, 0);
    this.watch(this.ports.B, 8);
    this.watch(this.ports.C, 14);
    this.raf = 0;
    this.last = 0;
    this.onFrame = null;     // called after every frame's worth of cycles
    this.onSerial = null;    // called with each transmitted byte as a 1-char string
    this.usart.onByteTransmit = (b) => { if (this.onSerial) this.onSerial(String.fromCharCode(b)); };
  }

  watch(port, base) {
    const count = base === 0 ? 8 : 6; // PORTD: D0-D7; PORTB: D8-D13; PORTC: A0-A5
    let last = 0;
    port.addListener((value) => {
      // avr8js has no internal pull-ups: re-evaluate floating pins synchronously whenever the program writes
      // DDR/PORT, so the first digitalRead() after pinMode(INPUT_PULLUP) already sees HIGH.
      for (let b = 0; b < count; b++) this.applyInput(base + b);
      const changed = value ^ last;
      last = value;
      if (!changed) return;
      const t = this.cpu.cycles;
      for (let b = 0; b < count; b++) if ((changed >> b) & 1) this.edge(base + b, (value >> b) & 1, t);
    });
  }

  edge(d, level, t) {
    const a = this.act[d];
    if (a.level) a.high += t - a.since;
    a.since = t;
    a.level = level;
    if (level) {
      const p = a.lastRise >= 0 ? t - a.lastRise : 0;
      if (p > 0 && p <= MAX_PERIOD) { a.periodSum += p; a.periods++; a.lastPeriod = p; }
      else a.lastPeriod = 0; // first rise after a pause
      a.lastRise = t;
    }
  }

  /* Close the current measuring window (normally once per frame) and update every pin's duty and freq. */
  sample() {
    const t = this.cpu.cycles, span = t - this.windowStart;
    for (const a of this.act) {
      if (a.level) a.high += t - a.since;
      a.since = t;
      a.duty = span > 0 ? a.high / span : a.level;
      if (a.periods) a.freq = CLOCK_HZ / (a.periodSum / a.periods);
      if (!a.lastPeriod || t - a.lastRise > Math.max(1.5 * a.lastPeriod, MIN_HOLD)) a.freq = 0;
      a.high = 0; a.periodSum = 0; a.periods = 0;
    }
    this.windowStart = t;
  }

  /* { duty: 0..1, freq: Hz } of an output pin over the last sample() window. */
  activity(d) { const a = this.act[d]; return { duty: a.duty, freq: a.freq }; }

  /* Voltage (0..5 V) the circuit puts on analog input A<ch>. */
  setAnalog(ch, volts) { this.adc.channelValues[ch] = volts; }

  /* Execute until the CPU clock has advanced by `cycles`. */
  runCycles(cycles) {
    const cpu = this.cpu, end = cpu.cycles + cycles;
    while (cpu.cycles < end) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  /* Simulated time in milliseconds since reset. */
  get millis() { return this.cpu.cycles / (CLOCK_HZ / 1000); }

  /* PinState.Low | High | Input | InputPullUp, as the program configured it. */
  pinState(d) {
    const [port, bit] = pinMap(d);
    return this.ports[port].pinState(bit);
  }

  /* What the outside circuit does to a digital pin: true (tied HIGH), false (tied LOW) or null (floating).
     A floating pin reads its internal pull-up: HIGH under INPUT_PULLUP, LOW otherwise. */
  setInput(d, level) {
    if (level === null || level === undefined) this.external.delete(d);
    else this.external.set(d, !!level);
    this.applyInput(d);
  }

  applyInput(d) {
    const ext = this.external.get(d);
    const level = ext !== undefined ? ext : this.pinState(d) === PinState.InputPullUp;
    if (this.applied.get(d) === level) return;
    this.applied.set(d, level);
    const [port, bit] = pinMap(d);
    this.ports[port].setPin(bit, level);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now) => {
      const dt = Math.min(now - this.last, MAX_FRAME_MS);
      this.last = now;
      this.runCycles(Math.round(dt * (CLOCK_HZ / 1000)));
      this.sample();
      if (this.onFrame) this.onFrame(this);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get running() { return this.raf !== 0; }
}
