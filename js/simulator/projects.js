/* Simulator projects: the gallery and each project's circuit and code come from this array.
   Adding a project = one entry here. A ready project needs `parts` (types from circuit.js, placed in the 660x380
   canvas: resistor [rot: 90 stands it up], led [color: red | yellow | green], button, pot [value 0..1], buzzer),
   default `wires` (pin ids "<part id>.<pin>" or "uno.<pin>", e.g. "uno.a0", "uno.gnd3") and `code`.
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

const TRAFFIC_CODE = `// RoboSTEAM: svetofor
// Har bir LED: pin -> LED (+) ... LED (-) -> rezistor -> GND
//   qizil: 12-pin, sariq: 11-pin, yashil: 10-pin

const int QIZIL = 12;
const int SARIQ = 11;
const int YASHIL = 10;

// Uchta chiroqni birdaniga o'rnatadi: 1 = yoniq, 0 = o'chiq
void chiroqlar(int qizil, int sariq, int yashil) {
  digitalWrite(QIZIL, qizil);
  digitalWrite(SARIQ, sariq);
  digitalWrite(YASHIL, yashil);
}

void setup() {
  pinMode(QIZIL, OUTPUT);
  pinMode(SARIQ, OUTPUT);
  pinMode(YASHIL, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println("Qizil: to'xtang!");
  chiroqlar(1, 0, 0);
  delay(3000);

  Serial.println("Qizil + sariq: tayyorlaning");
  chiroqlar(1, 1, 0);
  delay(1000);

  Serial.println("Yashil: yuring!");
  chiroqlar(0, 0, 1);
  delay(3000);

  Serial.println("Sariq: ehtiyot bo'ling");
  chiroqlar(0, 1, 0);
  delay(1000);
}
`;

const POT_CODE = `// RoboSTEAM: potentsiometr bilan LED yorqinligi
// Potentsiometr: chap oyoq -> 5V, o'rta oyoq -> A0, o'ng oyoq -> GND
// LED: 9-pin -> rezistor -> LED (+) ... LED (-) -> GND
// Dastakni burang: A0 dagi qiymat va LED yorqinligi o'zgaradi.

const int POT_PIN = A0;
const int LED_PIN = 9;   // ~ belgili pinlar (3, 5, 6, 9, 10, 11) analogWrite() bilan ishlaydi

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int qiymat = analogRead(POT_PIN);               // 0 ... 1023
  int yorqinlik = map(qiymat, 0, 1023, 0, 255);   // 0 ... 255
  analogWrite(LED_PIN, yorqinlik);

  Serial.print("Potentsiometr: ");
  Serial.print(qiymat);
  Serial.print("   Yorqinlik: ");
  Serial.println(yorqinlik);
  delay(200);
}
`;

const MELODY_CODE = `// RoboSTEAM: buzzer bilan kuy
// Buzzer: 8-pin -> buzzer (+) ... buzzer (-) -> GND
// tone(pin, chastota, davomiylik) nota chaladi, noTone(pin) to'xtatadi.

const int BUZZER = 8;

// "Kichkina yulduzcha" kuyining boshi: chastotalar (Hz)
int notalar[] = { 262, 262, 392, 392, 440, 440, 392, 349, 349, 330, 330, 294, 294, 262 };
// Har bir notaning uzunligi (millisekund)
int uzunlik[] = { 400, 400, 400, 400, 400, 400, 800, 400, 400, 400, 400, 400, 400, 800 };
const int SONI = sizeof(notalar) / sizeof(notalar[0]);

void setup() {
  pinMode(BUZZER, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println("Kuy boshlandi!");
  for (int i = 0; i < SONI; i++) {
    Serial.print("Nota: ");
    Serial.print(notalar[i]);
    Serial.println(" Hz");
    tone(BUZZER, notalar[i], uzunlik[i] * 9 / 10);  // notalar orasida qisqa tanaffus
    delay(uzunlik[i]);
  }
  noTone(BUZZER);
  delay(1500);  // qaytadan chalishdan oldin dam olamiz
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
    id: 'svetofor', title: 'Svetofor', level: 'beginner', ready: true, board: 'uno',
    description: 'Uchta LED bilan haqiqiy svetofor ketma-ketligi.',
    thumbnail: svg(uno() + '<rect x="166" y="14" width="44" height="112" rx="12" fill="#16123F" stroke="#C9CCD6" stroke-width="2"/>' +
      '<circle cx="188" cy="36" r="12" fill="#FF4B3A"/><circle cx="188" cy="36" r="18" fill="#FF4B3A" opacity=".3"/><circle cx="188" cy="70" r="12" fill="#6B5A1E"/><circle cx="188" cy="104" r="12" fill="#1E5B45"/>' +
      wire('M52 32 C60 4 140 20 166 36', '#FF6B57') + wire('M59 32 C70 50 140 70 166 70', '#FFB020') + wire('M66 32 C80 90 140 104 166 104', '#1FBF8F')),
    // three LEDs in a row; each cathode goes through its own standing resistor to a shared GND line along the bottom
    parts: [
      { type: 'led', id: 'qizil', color: 'red', x: 450, y: 105 },
      { type: 'led', id: 'sariq', color: 'yellow', x: 530, y: 105 },
      { type: 'led', id: 'yashil', color: 'green', x: 610, y: 105 },
      { type: 'resistor', id: 'rq', x: 462, y: 210, rot: 90 },
      { type: 'resistor', id: 'rs', x: 542, y: 210, rot: 90 },
      { type: 'resistor', id: 'ry', x: 622, y: 210, rot: 90 },
    ],
    wires: [['uno.12', 'qizil.a'], ['uno.11', 'sariq.a'], ['uno.10', 'yashil.a'],
      ['qizil.k', 'rq.1'], ['sariq.k', 'rs.1'], ['yashil.k', 'ry.1'],
      ['rq.2', 'uno.gnd3'], ['rs.2', 'rq.2'], ['ry.2', 'rs.2']],
    code: TRAFFIC_CODE,
  },
  {
    id: 'potentsiometr', title: 'Potentsiometr', level: 'beginner', ready: true, board: 'uno',
    description: 'Dastani burab, LED yorqinligini boshqaring.',
    thumbnail: svg(uno() + '<circle cx="176" cy="88" r="24" fill="#3D3BFF" stroke="' + NAVY + '" stroke-width="2"/><circle cx="176" cy="88" r="13" fill="#C9CCD6"/><path d="M176 88 L186 76" stroke="' + NAVY + '" stroke-width="4" stroke-linecap="round"/>' +
      led(210, 34, '#FF6B57', true) + wire('M84 108 C110 124 150 122 158 104', '#FFB020') + wire('M45 32 C60 0 200 6 210 22', '#3D3BFF')),
    parts: [
      { type: 'resistor', id: 'r', x: 420, y: 70 },
      { type: 'led', id: 'led', color: 'red', x: 600, y: 115 },
      { type: 'pot', id: 'pot', x: 480, y: 280, value: 0.5 },
    ],
    wires: [['uno.9', 'r.1'], ['r.2', 'led.a'], ['led.k', 'uno.gnd2'],
      ['pot.3', 'uno.5v'], ['pot.w', 'uno.a0'], ['pot.1', 'led.k']], // pot.1 reaches GND through the LED's GND wire
    code: POT_CODE,
  },
  {
    id: 'buzzer-melodiya', title: 'Buzzer melodiya', level: 'intermediate', ready: true, board: 'uno',
    description: 'Buzzer yordamida kichik kuy chalish.',
    thumbnail: svg(uno() + '<circle cx="180" cy="84" r="28" fill="#16123F" stroke="#C9CCD6" stroke-width="2.5"/><circle cx="180" cy="84" r="6" fill="#C9CCD6"/>' +
      '<path d="M196 22v24a6 6 0 1 1-4-5.6V28l18-5v18a6 6 0 1 1-4-5.6V22z" fill="#FFD23F"/>' + wire('M91 32 C110 10 150 40 160 64', '#1FBF8F')),
    parts: [{ type: 'buzzer', id: 'bz', x: 470, y: 280 }],
    wires: [['uno.8', 'bz.p'], ['bz.n', 'uno.gnd2']],
    code: MELODY_CODE,
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
