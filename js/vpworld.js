// The virtual world for VirtualProdClear: the 3D "location" that the game engine renders onto
// the LED wall. Everything here is our own procedural geometry: a desert canyon with layered
// mesas, a Himalayan-style mountain pass with prayer flags, and a night city street that can
// scroll past for driving shots. It lives in its own THREE.Scene, never drawn directly: the
// LED volume (vp.js) renders it into textures from the tracked camera and from the stage centre.
//
// Units are metres, and the world shares the stage's origin: its ground is at y = 0, the same
// height as the real set floor, so the painted floor and the virtual ground meet at the wall.
import { THREE, clamp, smooth } from './kit.js';

export const DEG = Math.PI / 180;
const lin = (hex) => new THREE.Color(hex);            // three converts hex (sRGB) to linear

// ---------------------------------------------------------------- value noise (our own)
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, oct)); }
let rs = 7;
const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };

// ---------------------------------------------------------------- the sun
// Solar position for a latitude on the equinox (declination 0), from the standard spherical
// astronomy formulas: sin(elev) = sin φ sin δ + cos φ cos δ cos H, with hour angle H = 15°/h.
export function sunAt(hours, lat = 27, decl = 0) {
  const H = 15 * (hours - 12) * DEG, p = lat * DEG, d = decl * DEG;
  const se = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  const e = Math.asin(clamp(se, -1, 1));
  let A = Math.acos(clamp((Math.sin(d) - se * Math.sin(p)) / (Math.cos(e) * Math.cos(p)), -1, 1));
  if (H > 0) A = 2 * Math.PI - A;
  return { elev: e / DEG, az: A / DEG };               // azimuth from north, clockwise
}
// Colour of direct sunlight after the air: Rayleigh optical depth (Hansen & Travis 1974,
// τ = 0.008569 λ⁻⁴ (1 + 0.0113 λ⁻² + 0.00013 λ⁻⁴), λ in µm) plus a light haze (Ångström
// τa = 0.1 (λ/0.55)^-1.3), through the Kasten & Young (1989) air mass.
export function sunColour(elevDeg) {
  const e = Math.max(elevDeg, -0.5);
  const m = 1 / (Math.sin(Math.max(e, 0.01) * DEG) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
  return [0.61, 0.55, 0.465].map((l) => {
    const tr = 0.008569 * Math.pow(l, -4) * (1 + 0.0113 * Math.pow(l, -2) + 0.00013 * Math.pow(l, -4));
    const ta = 0.1 * Math.pow(l / 0.55, -1.3);
    return Math.exp(-(tr + ta) * m);
  });
}

// ---------------------------------------------------------------- the sky dome
const SKY_V = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
varying vec3 vDir;
uniform vec3 uSun, uZen, uHor, uGround, uSunCol; uniform float uDisc, uGlow, uStars;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(uHor, uZen, pow(y, 0.45)) : mix(uHor, uGround, smoothstep(0.0, 0.08, -y));
  float mu = max(dot(d, uSun), 0.0);
  col += uSunCol * uGlow * (0.35 * pow(mu, 6.0) + 0.9 * pow(mu, 60.0)) * smoothstep(-0.05, 0.02, y);
  col += uSunCol * uDisc * smoothstep(0.99990, 0.99996, mu);           // a 0.53° disc
  if (uStars > 0.0 && y > 0.05) { vec3 c = floor(d * 380.0); float s = h(c); col += vec3(step(0.9975, s) * uStars * (0.4 + 0.6 * h(c + 3.1))); }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- terrain
function terrain(size, seg, hFn, colFn) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hFn(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { colFn(c, p.getX(i), p.getY(i), p.getZ(i), n.getY(i)); c.toArray(col, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
}

// A mesa: an eroded, flat-topped butte with coloured rock layers, built from a noisy cylinder.
function mesa(rTop, rBase, h, seed, strata) {
  const g = new THREE.CylinderGeometry(rTop, rBase, h, 28, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (rr < 1e-3) continue;
    const k = 1 + 0.18 * (fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + y * 0.03, 3) - 0.5) * 2;
    const step = 1 + 0.06 * Math.sin((y / h) * 18 + seed);        // ledges
    p.setX(i, x * k * step); p.setZ(i, z * k * step);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { strata(c, p.getY(i), h); c.toArray(col, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
}

function boulder(r, color) {
  const g = new THREE.DodecahedronGeometry(r, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.4 * vnoise(p.getX(i) * 3 + 9, p.getY(i) * 3 + p.getZ(i) * 2); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k); }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- environments
const SAND = 0xc8a07a;           // the desert floor; the real set floor is painted to match
const GRAVEL = 0x8d8479;
const ASPHALT = 0x1d1f24;
export const FLOOR = { canyon: SAND, pass: GRAVEL, city: ASPHALT };

function buildCanyon() {
  const g = new THREE.Group();
  const bands = [lin(0xa9583a), lin(0xc27a4e), lin(0x8e4a30), lin(0xd29a6a)];
  const sand = lin(SAND);
  const hFn = (x, z) => {
    const r = Math.hypot(x, z);
    const mz = (10 * Math.sin(z * 0.012) + 6 * Math.sin(z * 0.031 + 1)) * smooth((-z - 10) / 50);
    const xx = Math.abs(x - mz), w = 26 + 14 * fbm(z * 0.01, 3.3, 3);
    const cliff = smooth((xx - w) / 9);
    let h = cliff * (30 + 26 * fbm(x * 0.012, z * 0.012, 3));
    const t = h / 7; h = (Math.floor(t) + smooth((t - Math.floor(t) - 0.55) / 0.45)) * 7;   // terraces
    h += (1 - cliff) * (0.9 * fbm(x * 0.05, z * 0.05, 3) - 0.45);                          // dunes
    return h * smooth((r - 9) / 8);
  };
  const colFn = (c, x, y, z, ny) => {
    const b = bands[((Math.floor(y / 3.4) % 4) + 4) % 4];
    c.copy(sand).lerp(b, clamp((y - 1.2) / 3, 0, 1) * clamp((0.93 - ny) / 0.25 + 0.3, 0, 1));
    c.multiplyScalar(0.92 + 0.16 * vnoise(x * 0.3, z * 0.3));
  };
  g.add(terrain(900, 220, hFn, colFn));
  const strata = (c, y, h) => { c.copy(bands[Math.floor(y / 4.2) % 4]); if (y > h - 1.5) c.copy(bands[3]).multiplyScalar(0.9); };
  const mesas = [[-78, -210, 34, 46, 58, 1], [95, -300, 40, 56, 84, 2], [-190, -380, 60, 74, 72, 3], [30, -520, 70, 90, 110, 4], [240, -470, 50, 60, 64, 5]];
  const hero = new THREE.Group();
  mesas.forEach(([x, z, rt, rb, h, s], i) => { const m = mesa(rt, rb, h, s, strata); m.position.set(x, -2, z); (i === 0 ? hero : g).add(m); });
  g.add(hero);
  // Near boulders: close enough to show parallax against the far mesas.
  [[-9.5, -11, 1.4], [8.5, -13, 1.1], [-4.5, -18, 0.9], [15, -25, 2.2], [-17, -30, 2.8], [4, -40, 1.8]].forEach(([x, z, r]) => { const b = boulder(r, 0xa2603c); b.position.set(x, r * 0.35, z); g.add(b); });
  return { group: g, hero, floor: SAND, fog: [0xd9b99a, 180, 1400] };
}

function buildPass() {
  const g = new THREE.Group();
  const rock = lin(0x5f574f), scrub = lin(0x8c7650), snow = lin(0xf4f7fb), gravel = lin(GRAVEL);
  const hFn = (x, z) => {
    const r = Math.hypot(x, z);
    const ridge = 1 - Math.abs(fbm(x * 0.0045 + 7, z * 0.0045 - 3, 5) * 2 - 1);
    // A valley runs straight ahead (−z); big ridges rise on both sides of it.
    const valley = smooth((Math.abs(x + 12 * Math.sin(z * 0.004)) - 30) / 140);
    let h = Math.pow(ridge, 1.8) * 420 * smooth((r - 50) / 240) * (0.25 + 0.75 * valley);
    h += 14 * fbm(x * 0.02, z * 0.02, 4) * smooth((Math.abs(x) - 18) / 30);                  // valley sides
    h += (0.8 * fbm(x * 0.08, z * 0.08, 2) - 0.4);
    return h * smooth((r - 9) / 8);
  };
  const colFn = (c, x, y, z, ny) => {
    const sn = y > 85 + 40 * vnoise(x * 0.02, z * 0.02) && ny > 0.45;
    if (sn) c.copy(snow);
    else if (y < 1.5) c.copy(gravel);
    else c.copy(scrub).lerp(rock, clamp((0.95 - ny) * 3 + y / 120, 0, 1));
    c.multiplyScalar(0.9 + 0.2 * vnoise(x * 0.4, z * 0.4));
  };
  g.add(terrain(1400, 230, hFn, colFn));
  // A distant snow peak that the brain bar can move.
  const peakG = new THREE.ConeGeometry(140, 320, 9, 6), pp = peakG.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 0.8 + 0.4 * vnoise(pp.getX(i) * 0.02 + 3, pp.getY(i) * 0.02 + pp.getZ(i) * 0.02); pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
  peakG.translate(0, 150, 0); peakG.computeVertexNormals();
  const pc = new Float32Array(pp.count * 3), c = new THREE.Color();
  for (let i = 0; i < pp.count; i++) { (pp.getY(i) > 150 ? c.copy(snow) : c.copy(rock).multiplyScalar(0.8)).toArray(pc, i * 3); }
  peakG.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const hero = new THREE.Group();
  const peak = new THREE.Mesh(peakG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  peak.position.set(-15, -20, -620); hero.add(peak); g.add(hero);
  // Prayer flags on a line between two poles, and a stone cairn.
  const poleM = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const A = new THREE.Vector3(-11, 4.2, -15), B = new THREE.Vector3(8, 3.4, -21);
  [A, B].forEach((p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, p.y, 8), poleM); m.position.set(p.x, p.y / 2, p.z); g.add(m); });
  const cols = [0x2f6fd6, 0xf2f2ee, 0xd8322b, 0x2e9d4e, 0xf0c419];
  for (let i = 1; i < 26; i++) {
    const t = i / 26, p = A.clone().lerp(B, t); p.y -= Math.sin(t * Math.PI) * 0.9;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.42), new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 0.8, side: THREE.DoubleSide }));
    f.position.copy(p); f.position.y -= 0.23; f.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2; f.rotation.x = 0.1 * Math.sin(i);
    g.add(f);
  }
  for (let i = 0; i < 7; i++) { const b = boulder(0.55 - i * 0.06, 0x8a8178); b.position.set(12, 0.3 + i * 0.3, -13); b.rotation.y = i; g.add(b); }
  [[-9, -12, 1.2], [10, -16, 0.9], [-16, -26, 2.4], [20, -32, 3]].forEach(([x, z, r]) => { const b = boulder(r, 0x7d746c); b.position.set(x, r * 0.3, z); g.add(b); });
  return { group: g, hero, floor: GRAVEL, fog: [0xc4d2e6, 600, 5000] };
}

// The night street. Its pieces remember a home z so the whole street can scroll past (driving shots).
function buildCity() {
  const g = new THREE.Group(), movers = [];
  const win = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#0b0d12'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) {
      const r = rnd(); x.fillStyle = r < 0.42 ? (r < 0.3 ? '#ffcf8a' : '#bfe0ff') : '#161a22';
      x.fillRect(i * 32 + 6, j * 16 + 4, 20, 9);
    }
  });
  const road = canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = '#23262c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; x.fillRect(rnd() * w, rnd() * h, 2, 2); }
    x.fillStyle = '#d8d2c0'; for (let y = 0; y < h; y += 128) x.fillRect(w / 2 - 3, y, 6, 64);
    x.fillStyle = '#e8c35a'; x.fillRect(4, 0, 5, h); x.fillRect(w - 9, 0, 5, h);
  });
  road.repeat.set(1, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; g.add(ground);
  const roadM = new THREE.MeshStandardMaterial({ map: road, roughness: 0.35, metalness: 0.1 });
  const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 480), roadM);
  roadMesh.rotation.x = -Math.PI / 2; roadMesh.position.set(0, 0.005, -120); g.add(roadMesh);
  const walk = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.8 });
  [-9.5, 9.5].forEach((x) => { const s = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 480), walk); s.position.set(x, 0.07, -120); g.add(s); });
  const LEN = 360, Z0 = -300;                                      // scroll window: z from -300 to +60
  const bodyCols = [0x2a2d35, 0x33302c, 0x252a33, 0x3a3833, 0x2d3036];
  const add = (obj, z0) => { obj.userData.z0 = z0; movers.push(obj); g.add(obj); };
  for (const side of [-1, 1]) {
    for (let z = Z0; z < Z0 + LEN; ) {
      const w = 14 + rnd() * 10, h = 14 + Math.pow(rnd(), 1.6) * 80, d = 14 + rnd() * 12;
      const geo = new THREE.BoxGeometry(d, h, w);
      const uv = geo.attributes.uv;                                // windows at a real size: 4 m per tile
      for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); const sx = f < 2 ? w : d; const sy = f === 2 || f === 3 ? w : h; uv.setXY(i, uv.getX(i) * sx / 16, uv.getY(i) * sy / 16); }
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: bodyCols[Math.floor(rnd() * 5)], roughness: 0.7, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.9 }));
      m.position.set(side * (12 + d / 2 + rnd() * 3), h / 2, 0);
      add(m, z + w / 2); z += w + 2 + rnd() * 6;
    }
  }
  // Far skyline, fixed.
  for (let i = 0; i < 40; i++) {
    const w = 20 + rnd() * 30, h = 40 + rnd() * 140;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x1a1d24, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.7 }));
    const a = (rnd() - 0.5) * 2.6, r = 420 + rnd() * 200;
    m.position.set(Math.sin(a) * r, h / 2, -Math.cos(a) * r); g.add(m);
  }
  // Street lamps and a few signs.
  const poleM = new THREE.MeshStandardMaterial({ color: 0x3b3f47, metalness: 0.6, roughness: 0.4 });
  const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(6) });
  for (const side of [-1, 1]) for (let z = Z0; z < Z0 + LEN; z += 24) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 7, 8), poleM); pole.position.y = 3.5;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), poleM); arm.position.set(-side * 0.8, 7, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), bulbM); bulb.position.set(-side * 1.5, 6.92, 0);
    lamp.add(pole, arm, bulb); lamp.position.x = side * 7.8;
    add(lamp, z + (side > 0 ? 12 : 0));
  }
  const signs = [['CHAI', '#ff4fa3'], ['HOTEL', '#39d5ff'], ['24/7', '#ffb547'], ['CINEMA', '#8cff6b'], ['NOODLES', '#ff6b3d'], ['PHARMACY', '#5ce1a9']];
  signs.forEach(([t, c], i) => {
    const tex = canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.font = 'bold 84px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = c; x.shadowBlur = 24; x.fillStyle = c; x.fillText(t, w / 2, h / 2 + 4); }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3, 3, 3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const side = i % 2 ? 1 : -1; m.position.set(side * 11.9, 6 + (i % 3) * 3, 0); m.rotation.y = -side * Math.PI / 2;
    add(m, Z0 + 30 + i * 55);
  });
  const layout = (off) => movers.forEach((o) => { o.position.z = Z0 + ((((o.userData.z0 - Z0 + off) % LEN) + LEN) % LEN); });
  layout(0);
  return { group: g, hero: null, floor: ASPHALT, fog: [0x10131c, 60, 700], layout, night: true };
}

// ---------------------------------------------------------------- the world
export const ENVS = { canyon: 'Desert canyon', pass: 'Himalayan pass', city: 'City at night' };

export class World {
  constructor() {
    const sc = (this.scene = new THREE.Scene());
    this.skyU = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uDisc: { value: 40 }, uGlow: { value: 1 }, uStars: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.renderOrder = -1; sky.frustumCulled = false; sc.add(sky);
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.position.set(0, 100, 0); sc.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6b4a33, 0.6); sc.add(this.hemi);
    this.envs = { canyon: buildCanyon(), pass: buildPass(), city: buildCity() };
    Object.values(this.envs).forEach((e) => { e.group.visible = false; sc.add(e.group); });
    this.name = ''; this.hours = 10; this.heading = 0; this.offset = 0; this.heroX = 0;
    this.setEnv('canyon');
    this.version = 0;
  }
  setEnv(name) {
    if (name === this.name) return;
    this.name = name;
    Object.entries(this.envs).forEach(([k, e]) => { e.group.visible = k === name; });
    const e = this.envs[name];
    this.scene.fog = new THREE.Fog(e.fog[0], e.fog[1], e.fog[2]);
    this.setSun(this.hours, this.heading, true);
  }
  get env() { return this.envs[this.name]; }
  // Time of day in hours, and the heading that turns the whole sky (a brain-bar dial).
  setSun(hours, heading = 0, force = false) {
    if (!force && hours === this.hours && heading === this.heading) return;
    this.hours = hours; this.heading = heading;
    const U = this.skyU, e = this.env;
    let elev, az;
    if (e.night) { elev = 32; az = 250; } else ({ elev, az } = sunAt(hours));
    this.elev = elev; this.az = az;
    // West (azimuth 270°) is straight ahead of the camera (−z), so sunsets sit in the background.
    const a = (az - 270 + heading) * DEG, ce = Math.cos(elev * DEG);
    const dir = new THREE.Vector3(Math.sin(a) * ce, Math.sin(elev * DEG), -Math.cos(a) * ce);
    U.uSun.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(300);
    if (e.night) {
      U.uZen.value.setRGB(0.004, 0.006, 0.016); U.uHor.value.setRGB(0.05, 0.035, 0.05); U.uGround.value.setRGB(0.01, 0.01, 0.012);
      U.uSunCol.value.setRGB(0.5, 0.55, 0.7); U.uDisc.value = 3; U.uGlow.value = 0.03; U.uStars.value = 0.25;
      this.sun.color.setRGB(0.55, 0.62, 0.9); this.sun.intensity = 0.12;
      this.hemi.color.setRGB(0.25, 0.28, 0.5); this.hemi.groundColor.setRGB(0.25, 0.14, 0.08); this.hemi.intensity = 0.35;
      this.version++; return;
    }
    const T = sunColour(elev), day = smooth((elev + 6) / 16), lowSun = 1 - smooth(elev / 25);
    const sc = new THREE.Color(T[0], T[1], T[2]);
    U.uSunCol.value.copy(sc);
    U.uDisc.value = 60 * smooth((elev + 0.8) / 1.6); U.uGlow.value = 0.25 + 0.9 * lowSun; U.uStars.value = 0.2 * (1 - day);
    U.uZen.value.setRGB(0.1, 0.24, 0.62).multiplyScalar(0.12 + 0.88 * day).lerp(new THREE.Color(0.01, 0.012, 0.03), 1 - day);
    const hz = new THREE.Color(0.62, 0.72, 0.86).lerp(new THREE.Color(1.0, 0.55, 0.28).multiply(sc.clone().addScalar(0.3)), lowSun * 0.85);
    U.uHor.value.copy(hz).multiplyScalar(0.08 + 0.92 * day);
    U.uGround.value.setRGB(0.3, 0.24, 0.2).multiplyScalar(0.1 + 0.9 * day);
    this.sun.color.copy(sc); this.sun.intensity = 2.3 * smooth((elev + 1) / 6);
    this.hemi.color.copy(U.uZen.value).lerp(U.uHor.value, 0.4).multiplyScalar(1.3);
    this.hemi.groundColor.setRGB(0.45, 0.33, 0.24).multiplyScalar(day);
    this.hemi.intensity = 0.25 + 0.75 * day;
    this.scene.fog.color.copy(U.uHor.value);
    this.version++;
  }
  setHero(x) { if (this.env.hero && x !== this.heroX) { this.heroX = x; this.env.hero.position.x = x; this.version++; } }
  setOffset(z) { if (this.env.layout && z !== this.offset) { this.offset = z; this.env.layout(z); this.version++; } }
}

let shared = null;
// The world is built once and shared by every chapter (it is never added to the stage).
export function getWorld() { if (!shared) shared = new World(); return shared; }
