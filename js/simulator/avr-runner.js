/* ATmega328P (Arduino Uno) emulation on avr8js: loads a compiled Intel HEX, runs it in real time on
   requestAnimationFrame, and exposes Uno digital pins D0-D13 plus the Serial (USART0) output.
   Nothing here is simplified: the CPU executes the real compiled machine code, and delay()/millis() come
   from the emulated Timer0 at 16 MHz. */
import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
  AVRIOPort, portBConfig, portCConfig, portDConfig, AVRUSART, usart0Config, PinState,
} from '../vendor/avr8js.js';

export { PinState };
export const CLOCK_HZ = 16e6;
const FLASH_BYTES = 0x8000;   // 32 KB
const MAX_FRAME_MS = 50;      // after a stall (background tab, breakpoint) skip ahead instead of catching up

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

/* Uno digital pin number -> [port, bit]. D0-D7 = PORTD, D8-D13 = PORTB. */
function pinMap(d) { return d < 8 ? ['D', d] : ['B', d - 8]; }

export class AVRRunner {
  constructor(hexText) {
    this.cpu = new CPU(parseHex(hexText));
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.external = new Map(); // digital pin -> level forced by the circuit (absent = floating)
    this.applied = new Map();  // digital pin -> level last fed into the PIN register
    // avr8js has no internal pull-ups: re-evaluate floating pins synchronously whenever the program writes
    // DDR/PORT, so the first digitalRead() after pinMode(INPUT_PULLUP) already sees HIGH.
    this.ports.D.addListener(() => { for (let d = 0; d < 8; d++) this.applyInput(d); });
    this.ports.B.addListener(() => { for (let d = 8; d < 14; d++) this.applyInput(d); });
    this.raf = 0;
    this.last = 0;
    this.onFrame = null;     // called after every frame's worth of cycles
    this.onSerial = null;    // called with each transmitted byte as a 1-char string
    this.usart.onByteTransmit = (b) => { if (this.onSerial) this.onSerial(String.fromCharCode(b)); };
  }

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
