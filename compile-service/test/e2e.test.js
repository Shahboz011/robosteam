/* End-to-end check with no browser: POST the "Tugma + LED" project sketch to a running server's /api/compile, load the
   returned HEX into the same emulator module the page uses, and verify the real program's behaviour.
   Run: npm start (in another terminal), then npm test. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVRRunner, PinState } from '../../js/simulator/avr-runner.js';
import { PROJECTS } from '../../js/simulator/projects.js';

const starter = PROJECTS.find((p) => p.id === 'tugma-led').code;

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MS = 16000; // cycles per millisecond at 16 MHz

async function compile(code) {
  const res = await fetch(BASE + '/api/compile', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, board: 'uno' }),
  });
  return { status: res.status, body: await res.json() };
}

/* Run `ms` of simulated time in 1 ms steps; return the times (ms) at which D13 changed level. */
function edges(runner, ms) {
  const out = [];
  let prev = runner.pinState(13);
  for (let i = 0; i < ms; i++) {
    runner.runCycles(MS);
    const s = runner.pinState(13);
    if (s !== prev) { out.push(Math.round(runner.millis)); prev = s; }
  }
  return out;
}

test('Tugma + LED sketch compiles, blinks D13 at 500 ms, button on D2 speeds it up, Serial works', async () => {
  const { status, body } = await compile(starter);
  assert.equal(status, 200, body.error);
  const runner = new AVRRunner(Buffer.from(body.hex, 'base64').toString('ascii'));
  let serial = '';
  runner.onSerial = (c) => { serial += c; };

  runner.runCycles(10 * MS); // setup()
  assert.equal(runner.pinState(13), PinState.High, 'LED on after setup');
  assert.equal(runner.pinState(2), PinState.InputPullUp, 'D2 configured as INPUT_PULLUP');
  // no external drive on D2: the internal pull-up alone must make it read HIGH (button released)

  const slow = edges(runner, 2000);
  const slowGaps = slow.slice(1).map((t, i) => t - slow[i]);
  assert.ok(slowGaps.length >= 2 && slowGaps.every((g) => Math.abs(g - 500) <= 2), 'released: ~500 ms per half-period, got ' + slowGaps);

  runner.setInput(2, false); // press: D2 shorted to GND
  // the loop only re-reads D2 after the current 500 ms HIGH + 500 ms LOW finish
  const fast = edges(runner, 1600).slice(2);
  const fastGaps = fast.slice(1).map((t, i) => t - fast[i]);
  assert.ok(fastGaps.length >= 4 && fastGaps.every((g) => Math.abs(g - 100) <= 2), 'pressed: ~100 ms per half-period, got ' + fastGaps);

  runner.runCycles(50 * MS); // let the UART shift out the last line
  assert.match(serial, /Salom, RoboSTEAM!\r\n/);
  assert.match(serial, /Tugma bosildi/);
});

// Run a project's own sketch for `ms` of simulated time in page-sized frames, calling onFrame after each.
async function runProject(id, ms, onFrame, setup) {
  const { status, body } = await compile(PROJECTS.find((p) => p.id === id).code);
  assert.equal(status, 200, body.error);
  const runner = new AVRRunner(Buffer.from(body.hex, 'base64').toString('ascii'));
  let serial = '';
  runner.onSerial = (c) => { serial += c; };
  if (setup) setup(runner);
  const frame = 16000000 / 60;
  for (let t = 0; t < ms; t += 1000 / 60) { runner.runCycles(frame); runner.sample(); if (onFrame) onFrame(runner, t); }
  return { runner, serial: () => serial };
}

test('Svetofor: red 3 s, red+yellow 1 s, green 3 s, yellow 1 s, repeat', async () => {
  const seq = [];
  await runProject('svetofor', 8500, (r, t) => {
    const s = [12, 11, 10].map((d) => (r.pinState(d) === PinState.High ? 1 : 0)).join('');
    if (!seq.length || seq[seq.length - 1].s !== s) seq.push({ s, t });
  });
  const states = seq.map((x) => x.s).filter((x, i) => i > 0 || x !== '000'); // ignore the instant before setup()
  assert.deepEqual(states.slice(0, 5), ['100', '110', '001', '010', '100']);
  const at = (s) => seq.find((x) => x.s === s).t;
  assert.ok(Math.abs(at('110') - at('100') - 3000) < 40, 'red for 3 s');
  assert.ok(Math.abs(at('001') - at('110') - 1000) < 40, 'red+yellow for 1 s');
  assert.ok(Math.abs(at('010') - at('001') - 3000) < 40, 'green for 3 s');
});

test('Potentsiometr: A0 voltage -> analogRead -> PWM duty on pin 9 -> serial', async () => {
  for (const volts of [0, 1.25, 5]) {
    const expected = Math.round(volts / 5 * 1023);
    let duty = 0;
    const { serial } = await runProject('potentsiometr', 700, (r) => { duty = r.activity(9).duty; }, (r) => r.setAnalog(0, volts));
    const m = serial().match(/Potentsiometr: (\d+)\s+Yorqinlik: (\d+)/);
    assert.ok(m, serial());
    assert.ok(Math.abs(+m[1] - expected) <= 1, `analogRead ${m[1]} for ${volts} V`);
    const bright = Math.round(+m[1] * 255 / 1023);
    assert.ok(Math.abs(+m[2] - bright) <= 1);
    assert.ok(Math.abs(duty - bright / 255) < 0.03, `duty ${duty} for brightness ${bright}`);
  }
});

test('Buzzer melodiya: pin 8 plays the melody at the right pitches', async () => {
  const heard = [];
  const { serial } = await runProject('buzzer-melodiya', 2500, (r) => {
    const hz = Math.round(r.activity(8).freq);
    if (hz && (!heard.length || Math.abs(heard[heard.length - 1] - hz) > 3)) heard.push(hz);
  });
  // first notes: 262 262 392 392 440 440 392 — repeated notes merge; brief gaps between notes read 0 and are skipped
  const want = [262, 392, 440, 392];
  want.forEach((hz, i) => assert.ok(Math.abs(heard[i] - hz) <= 2, `note ${i}: heard ${heard[i]} Hz, want ${hz}`));
  assert.match(serial(), /Kuy boshlandi!\r\nNota: 262 Hz/);
});

test('compile error is returned with the line number', async () => {
  const { status, body } = await compile('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n');
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /sketch\.ino:3:\d+: error: expected ';'/);
});

test('health check reports arduino-cli', async () => {
  const res = await fetch(BASE + '/api/health');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.arduinoCli, /arduino-cli/i);
});

test('CORS: robosteam.uz is allowed, other sites are not', async () => {
  for (const origin of ['https://robosteam.uz', 'https://www.robosteam.uz']) {
    const pre = await fetch(BASE + '/api/compile', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
  }
  const evil = await fetch(BASE + '/api/compile', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('sketches cannot read server files', async () => {
  const cases = [
    ['#include "/etc/passwd"\nvoid setup(){}\nvoid loop(){}', 1],
    ['void setup(){}\n#include <../../../../etc/passwd>\nvoid loop(){}', 2],
    ['#\\\ninclude "/etc/hostname"\nvoid setup(){}\nvoid loop(){}', 1],
    ['%:include "/etc/passwd"\nvoid setup(){}\nvoid loop(){}', 1],
    ['#define F "/etc/passwd"\n#include F\nvoid setup(){}\nvoid loop(){}', 2],
    ['void setup(){}\nvoid loop(){}\nasm(".incbin \\"/etc/passwd\\"");', 3],
  ];
  for (const [code, line] of cases) {
    const { status, body } = await compile(code);
    assert.equal(status, 400, code);
    assert.match(body.error, new RegExp('^sketch\\.ino:' + line + ':1: error: include not allowed'), code);
  }
  // normal library includes still build
  const ok = await compile('#include <Servo.h>\n#include <avr/pgmspace.h>\nServo s;\nvoid setup(){ s.attach(9); }\nvoid loop(){}');
  assert.equal(ok.status, 200, ok.body.error);
});

test('rejects unknown boards', async () => {
  const res = await fetch(BASE + '/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'void setup(){} void loop(){}', board: 'mega' }) });
  assert.equal(res.status, 400);
});
