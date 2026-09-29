/* Simulator projects: the gallery and each project's circuit and code come from this array.
   Adding a project = one entry here. A ready project needs `parts` (types from circuit.js: resistor, led, button,
   placed in the 660x380 canvas), default `wires` (pin ids "<part id>.<pin>" or "uno.<pin>") and `code`.
   Leave `ready: false` until then: the card is shown dimmed with "Tez orada". */

export const LEVELS = { beginner: "Boshlang'ich", intermediate: "O'rta" };

// ---------- thumbnails (viewBox 0 0 240 140, drawn on the navy card header) ----------
const NAVY = '#0B0826';
const uno = () =>
  '<rect x="8" y="48" width="14" height="22" rx="2" fill="#C9CCD6" stroke="' + NAVY + '" stroke-width="2"/>' +
  '<rect x="16" y="22" width="112" height="96" rx="9" fill="#1F8A8A" stroke="' + NAVY + '" stroke-width="2.5"/>' +
  '<rect x="27" y="28" width="92" height="9" rx="2" fill="' + NAVY + '"/>' +
  [31, 38, 45, 52, 59, 66, 77, 84, 91, 98, 105, 112].map((x) => '<circle cx="' + x + '" cy="32.5" r="1.8" fill="#C9CCD6"/>').join('') +
  '<rect x="64" y="104" width="36" height="8" rx="2" fill="' + NAVY + '"/>' +
  '<rect x="60" y="74" width="54" height="18" rx="3" fill="' + NAVY + '"/>' +
  '<text x="28" y="66" class="t-brand">UNO</text>';
const esp32 = () =>
  '<rect x="30" y="18" width="78" height="106" rx="7" fill="#16123F" stroke="#3D3BFF" stroke-width="2.5"/>' +
  '<rect x="42" y="44" width="54" height="46" rx="3" fill="#C9CCD6"/>' +
  '<path d="M46 26h8v8h8v-8h8v8h8v-8h8" fill="none" stroke="#FFD23F" stroke-width="2.5"/>' +
  '<text x="69" y="72" class="t-chip">ESP32</text>' +
  [26, 112].map((x) => [36, 50, 64, 78, 92, 106].map((y) => '<rect x="' + (x - 3) + '" y="' + y + '" width="6" height="6" rx="1" fill="#C9CCD6"/>').join('')).join('');
const wire = (d, color) => '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
const led = (x, y, color, on) =>
  (on ? '<circle cx="' + x + '" cy="' + y + '" r="20" fill="' + color + '" opacity=".35"/>' : '') +
  '<path d="M' + (x - 9) + ' ' + (y + 12) + 'V' + y + 'a9 9 0 0 1 18 0V' + (y + 12) + 'Z" fill="' + color + '" stroke="' + NAVY + '" stroke-width="2"/>';
const resistor = (x, y) =>
  '<rect x="' + x + '" y="' + (y - 6) + '" width="34" height="12" rx="6" fill="#E8C38A" stroke="' + NAVY + '" stroke-width="2"/>' +
  '<rect x="' + (x + 8) + '" y="' + (y - 6) + '" width="3" height="12" fill="#D7332A"/><rect x="' + (x + 15) + '" y="' + (y - 6) + '" width="3" height="12" fill="#D7332A"/><rect x="' + (x + 22) + '" y="' + (y - 6) + '" width="3" height="12" fill="#7A4A21"/>';
const button = (x, y, color) =>
  '<rect x="' + (x - 13) + '" y="' + (y - 13) + '" width="26" height="26" rx="4" fill="#16123F" stroke="#C9CCD6" stroke-width="1.5"/><circle cx="' + x + '" cy="' + y + '" r="8" fill="' + (color || '#FF6B57') + '"/>';
const svg = (body) => '<svg viewBox="0 0 240 140" aria-hidden="true" focusable="false">' + body + '</svg>';

// ---------- sketches ----------
const BLANK_CODE = `void setup() {
  // bu yerdagi kod bir marta, boshida ishlaydi
}

void loop() {
  // bu yerdagi kod qayta-qayta ishlaydi
}
`;

const BUTTON_LED_CODE = `// RoboSTEAM: tugma + LED
// LED:   13-pin -> rezistor -> LED (+) ... LED (-) -> GND
// Tugma: 2-pin -> tugma -> GND  (INPUT_PULLUP: bosilganda LOW)

const int LED_PIN = 13;
const int BUTTON_PIN = 2;

bool wasPressed = false;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(9600);
  Serial.println("Salom, RoboSTEAM!");
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed != wasPressed) {
    Serial.println(pressed ? "Tugma bosildi: tez miltillaydi" : "Tugma qo'yib yuborildi");
    wasPressed = pressed;
  }

  int wait = pressed ? 100 : 500;  // tugma bosilsa, tezroq
  digitalWrite(LED_PIN, HIGH);
  delay(wait);
  digitalWrite(LED_PIN, LOW);
  delay(wait);
}
`;

// ---------- the list (gallery order) ----------
export const PROJECTS = [
  {
    id: 'bosh-loyiha', title: "Bo'sh loyiha", level: 'beginner', ready: true, board: 'uno',
    description: "Faqat Arduino Uno: g'oyangizni noldan yozing.",
    thumbnail: svg(uno() + '<rect x="146" y="30" width="80" height="80" rx="14" fill="none" stroke="#C9CCD6" stroke-width="3" stroke-dasharray="8 7"/>' +
      '<path d="M186 54v32M170 70h32" stroke="#FFD23F" stroke-width="5" stroke-linecap="round"/>'),
    parts: [], wires: [], code: BLANK_CODE,
  },
  {
    id: 'tugma-led', title: 'Tugma + LED', level: 'beginner', ready: true, board: 'uno',
    description: 'Tugmani bosib turing: LED tezroq miltillaydi.',
    thumbnail: svg(uno() + wire('M31 32 C31 8 150 10 152 40', '#3D3BFF') + resistor(152, 40) + wire('M186 40 H204 V54', '#FFB020') + led(204, 60, '#FF6B57', true) +
      wire('M98 32 C100 90 130 104 172 104', '#1FBF8F') + button(186, 104) + wire('M210 72 V96 M199 104 H222 V72', '#C9CCD6')),
    parts: [
      { type: 'resistor', id: 'r', x: 420, y: 90 },
      { type: 'led', id: 'led', x: 592, y: 166 },
      { type: 'button', id: 'btn', x: 490, y: 330 },
    ],
    wires: [['uno.13', 'r.1'], ['r.2', 'led.a'], ['led.k', 'uno.gnd2'], ['uno.2', 'btn.1'], ['btn.2', 'uno.gnd3']],
    code: BUTTON_LED_CODE,
  },
  {
    id: 'led-blink', title: 'LED blink', level: 'beginner', ready: false,
    description: "Birinchi dastur: LED'ni yoqib-o'chirish.",
    thumbnail: svg(uno() + wire('M36 32 C40 6 150 14 158 60', '#3D3BFF') + resistor(150, 66) + wire('M184 66 H196', '#FFB020') + led(204, 60, '#FFD23F', true) + wire('M88 108 C120 126 204 124 208 72', '#C9CCD6')),
  },
  {
    id: 'svetofor', title: 'Svetofor', level: 'beginner', ready: false,
    description: 'Uchta LED bilan haqiqiy svetofor ketma-ketligi.',
    thumbnail: svg(uno() + '<rect x="166" y="14" width="44" height="112" rx="12" fill="#16123F" stroke="#C9CCD6" stroke-width="2"/>' +
      '<circle cx="188" cy="36" r="12" fill="#FF4B3A"/><circle cx="188" cy="36" r="18" fill="#FF4B3A" opacity=".3"/><circle cx="188" cy="70" r="12" fill="#6B5A1E"/><circle cx="188" cy="104" r="12" fill="#1E5B45"/>' +
      wire('M52 32 C60 4 140 20 166 36', '#FF6B57') + wire('M59 32 C70 50 140 70 166 70', '#FFB020') + wire('M66 32 C80 90 140 104 166 104', '#1FBF8F')),
  },
  {
    id: 'potentsiometr', title: 'Potentsiometr', level: 'beginner', ready: false,
    description: 'Dastani burab, LED yorqinligini boshqaring.',
    thumbnail: svg(uno() + '<circle cx="176" cy="88" r="24" fill="#3D3BFF" stroke="' + NAVY + '" stroke-width="2"/><circle cx="176" cy="88" r="13" fill="#C9CCD6"/><path d="M176 88 L186 76" stroke="' + NAVY + '" stroke-width="4" stroke-linecap="round"/>' +
      led(210, 34, '#FF6B57', true) + wire('M84 108 C110 124 150 122 158 104', '#FFB020') + wire('M45 32 C60 0 200 6 210 22', '#3D3BFF')),
  },
  {
    id: 'buzzer-melodiya', title: 'Buzzer melodiya', level: 'intermediate', ready: false,
    description: 'Buzzer yordamida kichik kuy chalish.',
    thumbnail: svg(uno() + '<circle cx="180" cy="84" r="28" fill="#16123F" stroke="#C9CCD6" stroke-width="2.5"/><circle cx="180" cy="84" r="6" fill="#C9CCD6"/>' +
      '<path d="M196 22v24a6 6 0 1 1-4-5.6V28l18-5v18a6 6 0 1 1-4-5.6V22z" fill="#FFD23F"/>' + wire('M91 32 C110 10 150 40 160 64', '#1FBF8F')),
  },
  {
    id: 'servo', title: 'Servo', level: 'intermediate', ready: false,
    description: 'Servo motorni kerakli burchakka burish.',
    thumbnail: svg(uno() + '<rect x="150" y="62" width="76" height="40" rx="5" fill="#3D3BFF" stroke="' + NAVY + '" stroke-width="2"/><circle cx="170" cy="82" r="10" fill="#fff"/>' +
      '<path d="M170 82 L206 44" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M200 26 a44 44 0 0 1 16 30" fill="none" stroke="#FFD23F" stroke-width="2.5" stroke-dasharray="4 4"/>' +
      wire('M105 32 C130 20 140 60 150 72', '#FFB020')),
  },
  {
    id: 'ultratovush-masofa', title: 'Ultratovush masofa', level: 'intermediate', ready: false,
    description: "HC-SR04 datchigi bilan masofani o'lchash.",
    thumbnail: svg(uno() + '<rect x="142" y="58" width="88" height="40" rx="5" fill="#2FA4E7" stroke="' + NAVY + '" stroke-width="2"/>' +
      '<circle cx="164" cy="78" r="15" fill="#C9CCD6" stroke="' + NAVY + '" stroke-width="2"/><circle cx="208" cy="78" r="15" fill="#C9CCD6" stroke="' + NAVY + '" stroke-width="2"/>' +
      '<path d="M170 44 a26 26 0 0 1 32 0 M162 32 a40 40 0 0 1 48 0" fill="none" stroke="#FFD23F" stroke-width="2.5" stroke-linecap="round"/>' + wire('M84 32 C100 10 130 30 150 58', '#1FBF8F')),
  },
  {
    id: 'lcd-salom', title: 'LCD "Salom"', level: 'intermediate', ready: false,
    description: '16x2 ekranga matn chiqarish.',
    thumbnail: svg(uno() + '<rect x="138" y="44" width="94" height="52" rx="5" fill="#1F8A3A" stroke="' + NAVY + '" stroke-width="2"/><rect x="146" y="52" width="78" height="36" rx="2" fill="#9BE36B"/>' +
      '<text x="185" y="76" class="t-lcd">Salom</text>' + wire('M112 32 C130 10 150 20 160 44', '#B455E0')),
  },
  {
    id: '7-segment-hisoblagich', title: '7-segment hisoblagich', level: 'intermediate', ready: false,
    description: '0 dan 9 gacha sanaydigan raqamli displey.',
    thumbnail: svg(uno() + '<rect x="156" y="26" width="60" height="88" rx="6" fill="#16123F" stroke="#C9CCD6" stroke-width="2"/>' +
      '<path d="M172 40h28M202 44v24M202 74v24M172 102h28M170 74v24M170 44v24M174 71h24" stroke="#FF4B3A" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M170 74v24M170 44v24" stroke="#4A1A1A" stroke-width="6" stroke-linecap="round"/>' + wire('M77 32 C100 10 140 20 156 40', '#FFB020')),
  },
  {
    id: 'simon-says', title: 'Simon Says', level: 'intermediate', ready: false,
    description: "Ranglar ketma-ketligini eslab qolish o'yini.",
    thumbnail: svg(uno() + button(162, 50, '#FF4B3A') + button(206, 50, '#3D3BFF') + button(162, 94, '#1FBF8F') + button(206, 94, '#FFD23F') +
      '<circle cx="206" cy="94" r="16" fill="#FFD23F" opacity=".3"/>'),
  },
  {
    id: 'esp32-wifi-scan', title: 'ESP32 WiFi scan', level: 'intermediate', ready: false, board: 'esp32',
    description: 'Atrofdagi WiFi tarmoqlarini topish.',
    thumbnail: svg(esp32() + '<circle cx="182" cy="96" r="7" fill="#FFD23F"/>' +
      '<path d="M162 76 a28 28 0 0 1 40 0 M150 62 a46 46 0 0 1 64 0 M138 48 a64 64 0 0 1 88 0" fill="none" stroke="#FFD23F" stroke-width="6" stroke-linecap="round"/>'),
  },
];

export const findProject = (id) => PROJECTS.find((p) => p.id === id && p.ready) || null;
