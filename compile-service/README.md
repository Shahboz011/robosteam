# RoboSTEAM compile service (local dev server)

`server.js` does two things on **http://localhost:3000**:

- serves the static site from the repo root, so `simulator.html` and `/api/compile` share an origin (the page CSP allows `connect-src 'self'` only);
- `POST /api/compile` compiles an Arduino sketch with **arduino-cli** and returns the Intel HEX.

```
POST /api/compile
{ "code": "void setup() {...} void loop() {...}", "board": "uno" }

200 { "ok": true,  "hex": "<base64 of the .hex file>", "log": "Sketch uses 2312 bytes ..." }
400 { "ok": false, "error": "sketch.ino:3:1: error: expected ';' before '}' token ..." }
```

The browser runs the HEX in [avr8js](https://github.com/wokwi/avr8js) (`js/simulator/avr-runner.js`).

## 1. Install the toolchain (once)

You need Node.js 20+ and arduino-cli with the `arduino:avr` core. arduino-cli brings its own avr-gcc, avr-libc and the Arduino core, so you don't need a separate avr-gcc install.

**Windows** (the way this machine was set up; no admin rights needed):

```bash
cd compile-service
mkdir -p .tools && cd .tools
curl -L -o arduino-cli.zip https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip
unzip arduino-cli.zip && rm arduino-cli.zip
./arduino-cli core update-index
./arduino-cli core install arduino:avr
cd ..
```

`server.js` uses the `ARDUINO_CLI` environment variable if it is set. Otherwise it uses `compile-service/.tools/arduino-cli` (gitignored) if that exists, and otherwise `arduino-cli` from `PATH`.

**macOS:** `brew install arduino-cli`, then `arduino-cli core update-index && arduino-cli core install arduino:avr`

**Linux:** `curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=~/.local/bin sh`, then the same two `core` commands.

The AVR core and its tools (~400 MB with the indexes) go into arduino-cli's data folder (`%LOCALAPPDATA%\Arduino15` on Windows, `~/Library/Arduino15` on macOS, `~/.arduino15` on Linux).

## 2. Run

```bash
cd compile-service
npm install
npm start          # -> http://localhost:3000/simulator.html
```

Sign in, open **Simulyator**, draw the wires (or press **Namuna sxema** to load the example wiring) and press **Ishga tushirish**.

## 3. Test

With the server running, in a second terminal:

```bash
npm test
```

This compiles the starter sketch through `/api/compile`, runs the real HEX in avr8js in Node, and checks the results:

- D13 toggles every 500 ms of simulated time.
- D2 reads HIGH from its pull-up alone.
- Tying D2 LOW (a button press) switches the blink to 100 ms.
- The expected Serial text arrives.

It also checks that compile errors come back with the line number.

## Updating avr8js

The browser can't import `node_modules/avr8js/dist/esm` directly, because its imports have no `.js` extensions. So it is bundled into one file, `js/vendor/avr8js.js`, which is committed. After changing the avr8js version, run:

```bash
npm run vendor
```

## Not production-ready yet (TODO)

- **The site on Vercel has no `/api/compile`**. The simulator page shows "can't reach the compile service" there. To ship it, host this service somewhere that can run arduino-cli (a container or VM, or a Vercel Function bundling arduino-cli and the AVR core) and point the page at it.
- **Before exposing it publicly, sandbox the compiler.** A sketch can `#include` any file the server can read, and the compiler error output would show part of it. This server listens on 127.0.0.1 for that reason. A public service needs a sandbox (container, no secrets, read-only FS), rate limits and auth.
- Compiles run one at a time, which is fine for one developer.
