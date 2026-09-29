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

test('compile error is returned with the line number', async () => {
  const { status, body } = await compile('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n');
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /sketch\.ino:3:\d+: error: expected ';'/);
});

test('rejects unknown boards', async () => {
  const res = await fetch(BASE + '/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'void setup(){} void loop(){}', board: 'mega' }) });
  assert.equal(res.status, 400);
});
