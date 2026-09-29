# RoboSTEAM compile service: Node + arduino-cli + the Arduino AVR core, API only.
# Build context: this folder (compile-service/). Render builds it from render.yaml at the repo root.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# arduino-cli (brings its own avr-gcc/avr-libc with the core). Set ARDUINO_CLI_VERSION to pin a release.
ARG ARDUINO_CLI_VERSION=
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR=/usr/local/bin sh -s ${ARDUINO_CLI_VERSION}

# Everything below runs as the unprivileged "node" user: the compiler never runs as root.
USER node
WORKDIR /home/node/app

# The AVR core (pinned), then one throwaway build so the compiled Arduino core is cached in the image and the
# first student compile after a deploy is fast.
RUN arduino-cli core update-index \
 && arduino-cli core install arduino:avr@1.8.8 \
 && arduino-cli lib install Servo LiquidCrystal \
 && mkdir -p /tmp/warm/warm \
 && printf 'void setup() {}\nvoid loop() {}\n' > /tmp/warm/warm/warm.ino \
 && arduino-cli compile --fqbn arduino:avr:uno /tmp/warm/warm \
 && rm -rf /tmp/warm

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.js ./

ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 SERVE_SITE=0
EXPOSE 10000
CMD ["node", "server.js"]
