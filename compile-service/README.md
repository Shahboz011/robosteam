# RoboSTEAM compile service

Compiles Arduino sketches for the simulator. The browser then runs the HEX in [avr8js](https://github.com/wokwi/avr8js) (`js/simulator/avr-runner.js`).

```
POST /api/compile
{ "code": "void setup() {...} void loop() {...}", "board": "uno" }

200 { "ok": true,  "hex": "<base64 of the .hex file>", "log": "Sketch uses 2312 bytes ..." }
400 { "ok": false, "error": "sketch.ino:3:1: error: expected ';' before '}' token ..." }
429 { "ok": false, "error": "Too many compiles, try again in a minute." }

GET /api/health  ->  { "ok": true, "arduinoCli": "arduino-cli Version: ..." }
```

It runs in one of two modes:

| | Local dev (`npm start`) | Hosted (Docker on Render) |
|---|---|---|
| Serves the website too | yes, at http://localhost:3000 | no, API only |
| Listens on | 127.0.0.1:3000 | 0.0.0.0:$PORT |
| Page finds it via | same origin (`COMPILE_URL` empty) | `COMPILE_URL` in `js/config.js` |

## Safety

A compiler that anyone on the internet can call has one real risk: making it read files on the server. It could do that through `#include "/etc/passwd"` echoed back in an error, or through assembler `.incbin`/`.include`. So `server.js` checks every sketch before compiling:

- **Includes:** only library includes are allowed, such as `#include <Servo.h>`, `<avr/pgmspace.h>` or `"name.h"`. Absolute paths, `..`, macro includes, `#include_next`, `#embed`, digraph/trigraph `#` and line-continued `#include` are refused.
- **Limits:** 64 KB per sketch, 30 compiles per minute per IP (`RATE_PER_MIN`), at most 10 queued (`MAX_QUEUE`), 30 s timeout (`COMPILE_TIMEOUT_MS`), and a fresh temp folder per build.
- **Container:** it runs as the unprivileged `node` user and holds no secrets.
- **CORS:** only `https://robosteam.uz`, `https://www.robosteam.uz`, `http://localhost:*` and anything in `ALLOWED_ORIGINS` (comma-separated) can call it from a browser.

## 1. Local setup (once)

You need Node.js 20+ and arduino-cli with the `arduino:avr` core. arduino-cli brings its own avr-gcc, avr-libc and the Arduino core, so you don't need a separate avr-gcc install.

**Windows** (no admin rights needed):

```bash
cd compile-service
mkdir -p .tools && cd .tools
curl -L -o arduino-cli.zip https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip
unzip arduino-cli.zip && rm arduino-cli.zip
./arduino-cli core update-index
./arduino-cli core install arduino:avr
./arduino-cli lib install Servo LiquidCrystal
cd ..
```

`server.js` uses the `ARDUINO_CLI` environment variable if it is set. Otherwise it uses `compile-service/.tools/arduino-cli` (gitignored) if that exists, and otherwise `arduino-cli` from `PATH`.

**macOS:** `brew install arduino-cli`, then run the same `core update-index`, `core install` and `lib install` commands.

**Linux:** `curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=~/.local/bin sh`, then the same three commands.

The AVR core and its tools (~400 MB with the indexes) go into arduino-cli's data folder (`%LOCALAPPDATA%\Arduino15` on Windows, `~/Library/Arduino15` on macOS, `~/.arduino15` on Linux).

## 2. Run and test locally

```bash
cd compile-service
npm install
npm start          # -> http://localhost:3000/simulator.html
npm test           # in a second terminal, with the server running
```

`npm test` compiles the "Tugma + LED" sketch through `/api/compile`, runs the real HEX in avr8js in Node, and checks:
- D13 blinks every 500 ms;
- D2 reads HIGH from its pull-up;
- a button press switches the blink to 100 ms;
- the Serial output arrives.

It also checks compile errors, the health check and CORS, and that sketches can't read server files.

## 3. Host it on Render (so robosteam.uz can compile)

The repo contains `render.yaml` (a Render "Blueprint") and `compile-service/Dockerfile`. The Dockerfile builds an image with Node, arduino-cli, the AVR core, Servo and LiquidCrystal, and a pre-compiled Arduino core.

1. Push this repo to GitHub (the website deploy on Vercel ignores `compile-service/` and `render.yaml`).
2. Sign in at https://dashboard.render.com with GitHub.
3. Click **New → Blueprint** and pick the `robosteam` repository. Render reads `render.yaml` and shows one service, **robosteam-compile** (Docker, free plan, Frankfurt). Click **Apply**.
4. Wait for the first build to finish. It downloads the AVR core, which takes a few minutes.
5. Copy the service URL from the top of the service page, e.g. `https://robosteam-compile.onrender.com`. Render appends a suffix if the name is taken, so use the exact URL it shows.
6. Check it: open `<that URL>/api/health` in a browser. It should say `"ok":true`.
7. Point the website at it:
   - `js/config.js` → `COMPILE_URL: 'https://robosteam-compile.onrender.com'` (no trailing slash)
   - `simulator.html` → add the same origin to `connect-src` in the Content-Security-Policy `<meta>`, otherwise the browser blocks the request
8. Commit and push. Vercel redeploys the site; open https://www.robosteam.uz/simulator.html, pick a project and press **Ishga tushirish**.

After that, every push that changes `compile-service/` redeploys the service automatically (`autoDeploy`).

**The free plan sleeps.** After 15 minutes without requests the service sleeps, and the next compile waits about a minute while it wakes up; the page tells students "Server uyg'onmoqda…". Free instances are also slow at compiling. For lessons with a whole class, switch the service to a paid instance in Render (**Settings → Instance type**) so it stays awake and compiles faster.

## Updating avr8js

The browser can't import `node_modules/avr8js/dist/esm` directly, because its imports have no `.js` extensions. So it is bundled into one file, `js/vendor/avr8js.js`, which is committed. After changing the avr8js version, run:

```bash
npm run vendor
```
