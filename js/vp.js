// Shared models for VirtualProdClear: a working LED volume.
//
// The pipeline is the real in-camera VFX one, in miniature:
//  1. A tracked cinema camera moves on the stage. Its pose is recorded every frame.
//  2. The "engine" renders the virtual world (vpworld.js) twice:
//     - the INNER FRUSTUM: from the tracked camera's exact position, with its lens angle plus some
//       overscan, into a texture. The wall shader then projects that texture onto the curved wall
//       from the camera's eye (projective texturing). For every LED this is the same as an
//       off-axis projection (Kooima, "Generalized Perspective Projection", 2008): the pixel shows
//       what lies behind it along the line from the lens, so from the camera the flat wall looks
//       like a deep 3D world with correct parallax. From anywhere else it looks bent.
//     - the OUTER FRUSTUM: a low-resolution cube map from a fixed point in the volume. It fills
//       the rest of the wall and the ceiling. It is never seen sharp by the camera; its job is light.
//  3. The wall is an emissive surface. A second cube map, captured from the actor's position and
//     seeing only the LEDs, becomes the actor's and props' environment light and reflections. So
//     the set is lit and reflected by exactly the pixels the wall shows.
//  4. A second camera (the film camera) films the stage into a render target with no
//     anti-aliasing, the way a sensor samples the LED grid. That is where moiré comes from.
//
// Numbers: ROE Black Pearl BP2 panels, 2.84 mm pitch, 500 × 500 mm, up to 1,800 nits, about 8 frames
// of latency and ~40% overscan on The Mandalorian (fxguide, "Art of LED wall virtual production,
// part one", 2020). Sensor: ARRI Alexa 35, 27.99 mm wide, 4,608 photosites (ARRI data sheet).
import { THREE, M, box, beam, sphere, tube, canvasTexture, clamp, lerp } from './kit.js';
import { getWorld, FLOOR } from './vpworld.js';

export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const R = 6, H = 4.5;                          // our volume: 12 m across, 4.5 m tall
export const ARC0 = Math.PI / 3, ARCL = (4 * Math.PI) / 3; // 240° of wall, open towards +z
export const CAB = 0.5;                               // cabinet size, m (ROE BP2: 500 × 500 mm)
export const NITS = 1800;                             // BP2 peak brightness, cd/m² (fxguide)
export const FPS = 24;
export const SENSOR = { w: 27.99, px: 4608 };         // ARRI Alexa 35 open gate width, mm, photosites
export const PHOTOSITE_UM = (SENSOR.w / SENSOR.px) * 1000;   // 6.07 µm
export const ASPECT = 16 / 9;
export const SET_LAYER = 1, WALL_LAYER = 2;
export const WALL_AREA = R * ARCL * H;                // m² of curved wall
export const inReel = () => document.body.classList.contains('gb-reel');
export const hfov = (fmm) => 2 * Math.atan(SENSOR.w / (2 * fmm));

// Bessel J1 (Abramowitz & Stegun 9.4.4 and 9.4.6). 2·J1(x)/x is the contrast a round blur spot
// leaves in a fine pattern: the modulation transfer function of a defocused lens.
export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax <= 3) {
    const y = (x / 3) ** 2;
    return x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
  }
  const y = 3 / ax;
  const f = 0.79788456 + y * (0.00000156 + y * (0.01659667 + y * (0.00017105 + y * (-0.00249511 + y * (0.00113653 - y * 0.00020033)))));
  const t = ax - 2.35619449 + y * (0.12499612 + y * (0.0000565 + y * (-0.00637879 + y * (0.00074348 + y * (0.00079824 - y * 0.00029166)))));
  return (Math.sign(x) * f * Math.cos(t)) / Math.sqrt(ax);
}
export const jinc = (x) => (Math.abs(x) < 1e-4 ? 1 : (2 * besselJ1(x)) / x);

// How the LED grid lands on the sensor. pitch in mm, f in mm, dist and focus in metres.
export function moire({ pitch, f, N, focus, dist }) {
  const ip = (pitch * f) / (dist * 1000 - f) * 1000;                   // LED period on the sensor, µm
  const fm = f / 1000;
  const c = ((fm * fm) / (N * Math.max(focus - fm, 1e-4))) * (Math.abs(dist - focus) / dist) * 1e6;   // blur circle, µm
  const contrast = Math.abs(jinc((Math.PI * c) / ip));
  // A Bayer sensor samples each colour on every second photosite, so the finest pattern it can
  // record without aliasing has a period of 4 photosites (two colour samples per cycle).
  const nyq = 4 * PHOTOSITE_UM, ratio = ip / nyq;
  let risk, cls;
  if (contrast < 0.08) { risk = 'none: the grid is blurred away'; cls = 'ok'; }
  else if (ratio < 1.3) { risk = contrast > 0.3 ? 'high: moiré' : 'some moiré'; cls = 'no'; }
  else if (ratio < 2.2) { risk = 'borderline'; cls = 'no'; }
  else { risk = 'LED grid visible'; cls = 'no'; }
  return { ip, c, contrast, ratio, risk, cls };
}

// ---------------------------------------------------------------- the LED wall shader
const WALL_V = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WALL_F = `
varying vec3 vW;
uniform samplerCube uOuter; uniform vec3 uOuterPos;
uniform sampler2D uInner, uPrev; uniform mat4 uInnerVP, uPrevVP;
uniform float uInnerOn, uMode, uGain, uClip, uBorder, uSeams, uZones, uTearY, uRP;
uniform float uGrid, uDisp, uPitch, uF, uN, uFocus; uniform vec3 uCamPos, uCamDir;
uniform vec3 uGreen;
float j1x(float x){ // 2 J1(x) / x, Abramowitz & Stegun 9.4.4 / 9.4.6
  float ax = abs(x);
  if (ax < 1e-3) return 1.0;
  if (ax <= 3.0) { float y = (x / 3.0) * (x / 3.0);
    return 2.0 * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109)))))); }
  float y = 3.0 / ax;
  float f = 0.79788456 + y * (0.00000156 + y * (0.01659667 + y * (0.00017105 + y * (-0.00249511 + y * (0.00113653 - y * 0.00020033)))));
  float t = ax - 2.35619449 + y * (0.12499612 + y * (0.0000565 + y * (-0.00637879 + y * (0.00074348 + y * (0.00079824 - y * 0.00029166)))));
  return 2.0 * f * cos(t) / sqrt(ax) / ax;
}
vec3 inner(sampler2D t, mat4 vp, vec3 p, inout float edge){
  vec4 c = vp * vec4(p, 1.0);
  if (c.w <= 0.0) return vec3(-1.0);
  vec2 n = c.xy / c.w;
  if (abs(n.x) > 1.0 || abs(n.y) > 1.0) return vec3(-1.0);
  edge = max(abs(n.x), abs(n.y));
  return texture2D(t, n * 0.5 + 0.5).rgb;
}
void main(){
  vec3 p = vW, col;
  float edge = 0.0, inside = 0.0;
  if (uMode > 0.5 && uMode < 1.5) col = uGreen;
  else {
    col = textureCube(uOuter, normalize(p - uOuterPos)).rgb;
    if (uMode > 1.5) {
      // Rear projection: one flat, dim screen behind the set; everything else is black drapes.
      float s = step(abs(p.x), uRP) * step(p.z, -3.0) * step(p.y, 3.6) * step(0.3, p.y);
      col *= 0.22 * s;
    } else if (uInnerOn > 0.5) {
      vec3 ic = (uTearY > -1.0 && p.y < uTearY) ? inner(uPrev, uPrevVP, p, edge) : inner(uInner, uInnerVP, p, edge);
      if (ic.x >= 0.0) { col = ic; inside = 1.0; }
      if (uTearY > -1.0) col *= 1.0 - 0.6 * exp(-abs(p.y - uTearY) * 9.0);   // the dark scan band at the switch
    }
    if (uZones > 0.5 && inside < 0.5) col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))), 0.6) * vec3(0.9, 0.95, 1.25);
  }
  col = min(col, vec3(uClip)) * uGain;          // an LED cannot go brighter than its peak
  if (uBorder > 0.5 && inside > 0.5 && edge > 0.975) col = vec3(0.2, 1.6, 2.2);
  // Cabinet seams (seen only from the stage view).
  float ang = atan(-p.x, -p.z);   // measured from the back of the volume, so it is continuous across the wall
  vec2 cab = p.y > ${(H - 0.01).toFixed(2)} ? p.xz / ${CAB.toFixed(2)} : vec2(ang * ${R.toFixed(1)}, p.y) / ${CAB.toFixed(2)};
  vec2 sd = abs(fract(cab) - 0.5);
  col *= 1.0 - uSeams * 0.35 * step(0.485, max(sd.x, sd.y));
  if (uGrid > 0.5) {
    // The film camera sees individual LEDs. Their contrast after the lens is the defocus MTF.
    float d = max(dot(p - uCamPos, uCamDir), uF * 2.0);
    float c = uF * uF / (uN * max(uFocus - uF, 1e-4)) * abs(d - uFocus) / d;
    float ip = uPitch * uF / (d - uF);
    float m = abs(j1x(3.14159265 * c / ip));
    vec2 g = fract(vec2(ang * ${R.toFixed(1)}, p.y) / uDisp);
    float e = step(abs(g.x - 0.5), 0.27) * step(abs(g.y - 0.5), 0.27);
    col *= mix(1.0, e / 0.2916, m);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- the physical volume
// Curved wall, a partial LED ceiling over the back, the steel behind them, and the set floor.
export function makeVolume(uniforms) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WALL_V, fragmentShader: WALL_F, side: THREE.BackSide });
  const wg = new THREE.CylinderGeometry(R, R, H, 160, 6, true, ARC0, ARCL); wg.translate(0, H / 2, 0);
  const wall = new THREE.Mesh(wg, mat);
  const cg = new THREE.RingGeometry(1.2, R, 72, 2, 200 * DEG, 140 * DEG); cg.rotateX(Math.PI / 2); cg.translate(0, H, 0);
  const ceil = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms, vertexShader: WALL_V, fragmentShader: WALL_F, side: THREE.FrontSide }));
  [wall, ceil].forEach((m) => { m.layers.enable(SET_LAYER); m.layers.enable(WALL_LAYER); m.frustumCulled = false; });
  g.add(wall, ceil);
  // Backs of the cabinets and the steel frame.
  const back = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, H + 0.1, 96, 1, true, ARC0, ARCL), M.matte(0x16181d, { side: THREE.FrontSide }));
  back.position.y = H / 2; g.add(back);
  const lid = new THREE.Mesh(cg.clone().translate(0, 0.12, 0), M.matte(0x16181d, { side: THREE.BackSide })); g.add(lid);
  const steel = M.metal(0x4a4f59, { roughness: 0.5 });
  const truss = new THREE.Group();
  for (let i = 0; i <= 16; i++) {
    const a = ARC0 + (ARCL * i) / 16, x = Math.sin(a) * (R + 0.45), z = Math.cos(a) * (R + 0.45);
    truss.add(beam([x, 0, z], [x, H + 0.6, z], 0.05, steel));
  }
  const arcPts = []; for (let i = 0; i <= 48; i++) { const a = ARC0 + (ARCL * i) / 48; arcPts.push([Math.sin(a) * (R + 0.45), H + 0.6, Math.cos(a) * (R + 0.45)]); }
  truss.add(tube(arcPts, 0.05, steel, false, 96)); g.add(truss);
  // Tracking cameras along the top of the wall (infrared, with a red ring of LEDs).
  const trackers = [];
  for (let i = 0; i < 9; i++) {
    const a = ARC0 + 0.15 + ((ARCL - 0.3) * i) / 8, p = new THREE.Vector3(Math.sin(a) * (R - 0.25), H + 0.35, Math.cos(a) * (R - 0.25));
    const t = new THREE.Group(); t.position.copy(p);
    const body = box(0.16, 0.12, 0.2, M.matte(0x22252c)); t.add(body);
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), M.glow(0xff3b30)); lens.position.z = 0.105; t.add(lens);
    t.lookAt(0, 1.4, 0); g.add(t); trackers.push(t);
  }
  // The practical floor, painted to match the virtual ground.
  const floorMat = M.matte(FLOOR.canyon, { roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R - 0.03, 96), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; floor.receiveShadow = true; floor.layers.enable(SET_LAYER);
  g.add(floor);
  return { group: g, wall, ceil, back, lid, truss, trackers, floor, floorMat };
}

// ---------------------------------------------------------------- people and things on the set
const cap = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat); m.castShadow = m.receiveShadow = true; return m; };
// A plain, clearly stylised figure. Faces +z, feet at y = 0. `helmet` adds a chrome helmet.
export function makeFigure({ suit = 0x6e5b44, skin = 0x9c6c4b, trousers = 0x3a342e, helmet = false, sit = false } = {}) {
  const g = new THREE.Group(), mS = M.matte(suit, { roughness: 0.75 }), mK = M.matte(skin, { roughness: 0.6 }), mT = M.matte(trousers);
  const hipY = sit ? 0.5 : 0.95;
  const torso = cap(0.17, 0.36, mS); torso.position.y = hipY + 0.33; torso.scale.set(1, 1, 0.7); g.add(torso);
  const headG = new THREE.Group(); headG.position.y = hipY + 0.7; g.add(headG);
  const head = sphere(0.11, mK); head.scale.set(0.92, 1.06, 1); headG.add(head);
  const parts = { group: g, head: headG, mats: [mS, mK, mT] };
  if (helmet) {
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.06 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.155, 40, 24, 0, TAU, 0, Math.PI * 0.62), chrome);
    dome.castShadow = true; dome.position.y = 0.01; headG.add(dome);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.159, 40, 16, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.38, Math.PI * 0.18), new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.9, roughness: 0.05 }));
    headG.add(visor);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 10, 30), chrome); collar.rotation.x = Math.PI / 2; collar.position.y = -0.13; headG.add(collar);
    const pad = cap(0.07, 0.12, chrome); pad.rotation.z = Math.PI / 2; pad.position.set(0.2, hipY + 0.57, 0); g.add(pad);
    const pad2 = pad.clone(); pad2.position.x = -0.2; g.add(pad2);
    parts.mats.push(chrome, visor.material); parts.helmet = dome;
  }
  const limb = (x, y, r, len, mat) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = cap(r, len, mat); m.position.y = -len / 2 - r * 0.5; p.add(m); g.add(p); return p; };
  const armL = limb(-0.23, hipY + 0.55, 0.05, 0.28, mS), armR = limb(0.23, hipY + 0.55, 0.05, 0.28, mS);
  [armL, armR].forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.12; const f = limb(0, -0.36, 0.045, 0.24, mS); a.add(f); f.position.set(0, -0.36, 0); f.rotation.x = sit ? -1.2 : -0.15; const hnd = sphere(0.05, mK); hnd.position.y = -0.34; f.add(hnd); });
  const legL = limb(-0.1, hipY, 0.075, 0.38, mT), legR = limb(0.1, hipY, 0.075, 0.38, mT);
  [legL, legR].forEach((l) => { const sh = limb(0, -0.45, 0.06, 0.38, mT); l.add(sh); sh.position.set(0, -0.47, 0); const boot = box(0.12, 0.08, 0.24, M.matte(0x221e1a)); boot.position.set(0, -0.47, 0.05); sh.add(boot); if (sit) { l.rotation.x = -Math.PI / 2; sh.rotation.x = Math.PI / 2; } });
  parts.arms = [armL, armR];
  return parts;
}

// Props that stand on the real floor: a rock, a supply crate and some stones.
export function makeProps() {
  const g = new THREE.Group(), mats = [];
  const rockM = M.matte(0xa2603c, { roughness: 0.9, flatShading: true }); mats.push(rockM);
  const rg = new THREE.DodecahedronGeometry(0.75, 1), p = rg.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.35 * Math.sin(p.getX(i) * 7 + p.getY(i) * 5) * Math.cos(p.getZ(i) * 6); p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.8, p.getZ(i) * k); }
  rg.computeVertexNormals();
  const rock = new THREE.Mesh(rg, rockM); rock.position.set(-1.9, 0.35, -2.6); rock.castShadow = rock.receiveShadow = true; g.add(rock);
  [[-1.1, -2.2, 0.2], [1.5, -3.4, 0.28], [2.3, -1.2, 0.16], [-2.6, -1.1, 0.22]].forEach(([x, z, r]) => { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockM); s.position.set(x, r * 0.5, z); s.castShadow = true; g.add(s); });
  const crateM = M.matte(0x5f6a4a, { roughness: 0.7 }), metal = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 1, roughness: 0.18 });
  mats.push(crateM, metal);
  const crate = new THREE.Group(); crate.position.set(1.35, 0, -1.9); crate.rotation.y = -0.4;
  const cb = box(0.9, 0.5, 0.55, crateM); cb.position.y = 0.25; crate.add(cb);
  [-0.3, 0.3].forEach((x) => { const b = box(0.06, 0.52, 0.57, metal); b.position.set(x, 0.25, 0); crate.add(b); });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 32), metal); drum.position.set(0.25, 0.425, -0.75); drum.castShadow = true; crate.add(drum);
  g.add(crate);
  return { group: g, rock, crate, mats };
}

// A generic cinema camera on a pedestal: body, lens, matte box, and a tracking crown of markers.
export function makeRig() {
  const base = new THREE.Group(), head = new THREE.Group();
  const dark = M.matte(0x1d2026, { roughness: 0.5 }), grey = M.metal(0x6b717c), glow = M.glow(0xd9f6ff);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1, 16), grey); col.castShadow = true; base.add(col);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; base.add(beam([0, 0.08, 0], [Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45], 0.025, grey)); const w = sphere(0.05, dark); w.position.set(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45); base.add(w); }
  const body = box(0.16, 0.18, 0.32, dark); body.position.z = 0.05; head.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.22, 24), grey); lens.rotation.x = Math.PI / 2; lens.position.z = -0.2; head.add(lens);
  const mb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.08), dark); mb.position.z = -0.34; head.add(mb);
  const mon = box(0.14, 0.09, 0.01, dark); mon.position.set(-0.14, 0.12, 0.12); mon.rotation.y = 0.5; head.add(mon);
  // Tracking crown: retro-reflective balls in a pattern no two cameras share.
  const crown = new THREE.Group(); crown.position.y = 0.2; head.add(crown);
  crown.add(beam([0, -0.1, 0], [0, 0, 0], 0.01, grey));
  [[0.12, 0.02, 0.05], [-0.1, 0.04, 0.08], [0.02, 0.07, -0.12], [-0.06, 0.0, -0.06], [0.09, 0.05, -0.08]].forEach((q) => { crown.add(beam([0, 0, 0], q, 0.006, grey)); const b = sphere(0.02, glow, 12); b.position.set(...q); crown.add(b); });
  const g = new THREE.Group(); g.add(base, head);
  return { group: g, base, head, col, crown };
}

// A plain four-door car for driving shots (our own shapes: boxes, a cabin and wheels).
export function makeCar() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x8c1d24, metalness: 0.5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1016, metalness: 0.1, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 1, roughness: 0.08 });
  const tyre = M.matte(0x111214, { roughness: 0.8 });
  const bodyG = new THREE.BoxGeometry(1.8, 0.6, 4.5, 6, 2, 12), p = bodyG.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); const k = 1 - 0.1 * Math.pow(Math.abs(z) / 2.25, 4); p.setX(i, p.getX(i) * k); if (y > 0) p.setY(i, y - 0.08 * Math.pow(Math.abs(z) / 2.25, 3)); }
  bodyG.computeVertexNormals();
  const body = new THREE.Mesh(bodyG, paint); body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabG = new THREE.BoxGeometry(1.55, 0.55, 2.3, 4, 2, 6), q = cabG.attributes.position;
  for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) { q.setZ(i, q.getZ(i) * 0.72); q.setX(i, q.getX(i) * 0.9); }
  cabG.computeVertexNormals();
  const cab = new THREE.Mesh(cabG, glass); cab.position.set(0, 1.19, 0.1); g.add(cab);
  const roof = box(1.25, 0.05, 1.5, paint); roof.position.set(0, 1.47, 0.1); g.add(roof);
  [[-0.82, -1.45], [0.82, -1.45], [-0.82, 1.45], [0.82, 1.45]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 28), tyre); w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 20), chrome); hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.34, z); g.add(hub);
  });
  const trim = box(1.82, 0.05, 4.2, chrome); trim.position.y = 0.72; g.add(trim);
  [-0.6, 0.6].forEach((x) => { const hl = box(0.35, 0.1, 0.05, M.glow(0xfff4d6)); hl.position.set(x, 0.78, -2.25); g.add(hl); const tl = box(0.35, 0.1, 0.05, M.glow(0xff2a2a)); tl.position.set(x, 0.78, 2.25); g.add(tl); });
  const driver = makeFigure({ suit: 0x2c3e5c, sit: true }); driver.group.position.set(-0.38, 0.2, 0.25); driver.group.rotation.y = Math.PI; g.add(driver.group);
  return { group: g, mats: [paint, glass, chrome, ...driver.mats], paint };
}

// A floating canvas board facing the viewer.
export function makeBoard(w, h, pxW, draw, { opacity = 1 } = {}) {
  const ct = canvasTexture(pxW, Math.round((pxW * h) / w), draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, opacity, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  m.renderOrder = 5;
  return { mesh: m, redraw: ct.redraw };
}
export function boardBg(g, w, h, title) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8,10,15,.86)'; g.beginPath(); g.roundRect(0, 0, w, h, 26); g.fill();
  g.strokeStyle = 'rgba(142,231,255,.35)'; g.lineWidth = 3; g.stroke();
  if (title) { g.fillStyle = '#8ee7ff'; g.font = '600 34px sans-serif'; g.textBaseline = 'top'; g.fillText(title, 32, 26); }
}

// ---------------------------------------------------------------- film camera view (viewfinder)
const POST_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const POST_F = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tDepth; uniform vec2 uRes; uniform float uNear, uFar;
uniform bool uDof; uniform float uF, uN, uFocus, uSensW, uMaxR, uExp;
float lin(vec2 uv){ float d = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear)); }
float coc(float z){ float f = uF * 0.001; return min(0.5 * (f / uN) * f * abs(z - uFocus) / (z * max(uFocus - f, 1e-4)) / (uSensW * 0.001) * uRes.x, uMaxR); }
vec3 aces(vec3 x){ x *= 0.6; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }  // Narkowicz 2015
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uDof) {
    float zc = lin(vUv), cc = coc(zc), ws = 1.0 / max(cc * cc, 1.0);
    vec3 sum = col * ws;
    for (int i = 0; i < 40; i++) {
      float fi = float(i), r = sqrt((fi + 0.5) / 40.0) * uMaxR, a = fi * 2.39996323;
      vec2 su = vUv + vec2(cos(a), sin(a)) * r / uRes;
      float z = lin(su), cs = coc(z);
      if (z > zc) cs = min(cs, cc + 0.5);
      float w = clamp(cs - r + 1.0, 0.0, 1.0) / max(cs * cs, 1.0);
      sum += texture2D(tColor, su).rgb * w; ws += w;
    }
    col = sum / ws;
  }
  vec2 d = vUv - 0.5; col *= 1.0 - 0.3 * dot(d, d) * 1.6;
  gl_FragColor = vec4(srgb(aces(col * uExp)), 1.0);
}`;

export class Viewfinder {
  constructor(stage, W = 480) {
    this.stage = stage; this.W = W; this.H = Math.round(W / ASPECT);
    this.cam = new THREE.PerspectiveCamera(30, ASPECT, 0.1, 400);
    this.cam.layers.set(SET_LAYER);
    stage.lights.traverse((o) => o.layers.enable(SET_LAYER));
    this.rtScene = new THREE.WebGLRenderTarget(this.W, this.H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(this.W, this.H) });
    this.rtOut = new THREE.WebGLRenderTarget(this.W, this.H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtOut.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture = this.rtOut.texture;
    this.post = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rtScene.texture }, tDepth: { value: this.rtScene.depthTexture }, uRes: { value: new THREE.Vector2(this.W, this.H) }, uNear: { value: 0.1 }, uFar: { value: 400 }, uDof: { value: false }, uF: { value: 35 }, uN: { value: 2.8 }, uFocus: { value: 4 }, uSensW: { value: SENSOR.w }, uMaxR: { value: 9 }, uExp: { value: 1 } },
      vertexShader: POST_V, fragmentShader: POST_F, depthTest: false, depthWrite: false,
    });
    this.quadScene = new THREE.Scene(); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
  }
  setLens(fmm) { this.f = fmm; this.cam.fov = (2 * Math.atan(Math.tan(hfov(fmm) / 2) / ASPECT)) / DEG; this.cam.updateProjectionMatrix(); this.post.uniforms.uF.value = fmm; }
  shoot(p = {}) {
    const r = this.stage.renderer, prev = r.getRenderTarget();
    Object.entries(p).forEach(([k, v]) => { if (this.post.uniforms[k]) this.post.uniforms[k].value = v; });
    this.cam.updateMatrixWorld(true);
    r.setRenderTarget(this.rtScene); r.clear(); r.render(this.stage.scene, this.cam);
    r.setRenderTarget(this.rtOut); r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(prev);
  }
  dispose() { this.rtScene.depthTexture.dispose(); this.rtScene.dispose(); this.rtOut.dispose(); this.post.dispose(); }
}

// The camera's picture pinned in a corner of the stage view (bottom right when wide, along the
// bottom when tall), with a canvas overlay for the monitor's text. Labels under it are hidden.
export class Hud {
  constructor(stage, texture, { wide = 0.4, tall = 0.62, title = 'CAMERA A' } = {}) {
    this.stage = stage; this.wide = wide; this.tall = tall; this.title = title;
    this.group = new THREE.Group();
    const flat = (map, color = 0xffffff) => new THREE.MeshBasicMaterial({ map, color, toneMapped: false, depthTest: false, depthWrite: false, transparent: true });
    this.frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(null, 0x0b0d12));
    this.video = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(texture));
    this.ov = canvasTexture(960, 540, (g, w, h, lines) => this.draw(g, w, h, lines || {}));
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(this.ov.tex));
    [this.frame, this.video, this.overlay].forEach((m, i) => { m.renderOrder = 997 + i; m.frustumCulled = false; this.group.add(m); });
    stage.root.add(this.group);
    this.rect = [0, 0, 0, 0]; this._v = new THREE.Vector3(); this._t = 0;
  }
  draw(g, w, h, { tl = '', tr = '', bl = '', br = '', warn = '' }) {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3;
    const L = 30, cx = 26, cy = 26;
    [[cx, cy, 1, 1], [w - cx, cy, -1, 1], [cx, h - cy, 1, -1], [w - cx, h - cy, -1, -1]].forEach(([x, y, sx, sy]) => { g.beginPath(); g.moveTo(x + sx * L, y); g.lineTo(x, y); g.lineTo(x, y + sy * L); g.stroke(); });
    g.font = '600 26px ui-monospace, monospace'; g.textBaseline = 'top';
    const pill = (text, x, y, right, col = '#fff') => { if (!text) return; const tw = g.measureText(text).width, px = right ? x - tw - 18 : x; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(px, y, tw + 18, 38); g.fillStyle = col; g.fillText(text, px + 9, y + 6); };
    pill(this.title + (tl ? '  ' + tl : ''), 14, 12, false, '#8ee7ff');
    pill(tr, w - 14, 12, true); pill(bl, 14, h - 52, false); pill(br, w - 14, h - 52, true);
    if (warn) { g.font = '700 30px sans-serif'; const tw = g.measureText(warn).width; g.fillStyle = 'rgba(200,30,30,.8)'; g.fillRect(w / 2 - tw / 2 - 16, 64, tw + 32, 46); g.fillStyle = '#fff'; g.fillText(warn, w / 2 - tw / 2, 72); }
  }
  redraw(lines) { this.ov.redraw(lines); }
  update() {
    const cam = this.stage.camera, d = 1;
    const hv = 2 * d * Math.tan((cam.fov * DEG) / 2), wv = hv * cam.aspect;
    const wide = cam.aspect >= 1.0, vw = (wide ? this.wide : this.tall) * wv, vh = vw / ASPECT, m = 0.03 * hv;
    // Account for the stage's view offset (setShift), so the inset stays in the corner.
    const vo = cam.view && cam.view.enabled ? cam.view : null;
    const ox = vo ? (vo.offsetX / vo.fullWidth) * wv : 0, oy = vo ? -(vo.offsetY / vo.fullHeight) * hv : 0;
    const x = (wide ? wv / 2 - vw / 2 - m : 0) + ox, y = -hv / 2 + vh / 2 + m + oy;
    this.group.position.copy(cam.position); this.group.quaternion.copy(cam.quaternion);
    for (const o of [this.video, this.overlay]) { o.position.set(x, y, -d); o.scale.set(vw, vh, 1); }
    const b = 0.01 * hv; this.frame.position.set(x, y, -d); this.frame.scale.set(vw + 2 * b, vh + 2 * b, 1);
    this.rect = [(x - ox - vw / 2 - b) / (wv / 2), (x - ox + vw / 2 + b) / (wv / 2), (y - oy - vh / 2 - b) / (hv / 2), (y - oy + vh / 2 + b) / (hv / 2)];
    this.group.updateMatrixWorld(true);
    const now = performance.now();
    if (now - this._t > 150) { this._t = now; this.hideLabels(); }
  }
  hideLabels() {
    const [x0, x1, y0, y1] = this.rect, cam = this.stage.camera;
    this.stage.root.traverse((o) => {
      if (!o.isCSS2DObject) return;
      o.getWorldPosition(this._v).project(cam);
      o.element.style.opacity = this._v.x > x0 && this._v.x < x1 && this._v.y > y0 && this._v.y < y1 ? '0' : '';
    });
  }
}

// ---------------------------------------------------------------- geometry helpers
// Where a ray from inside the volume meets the wall, the floor or the ceiling height.
export function hitVolume(o, d) {
  const a = d.x * d.x + d.z * d.z, b = 2 * (o.x * d.x + o.z * d.z), c = o.x * o.x + o.z * o.z - R * R;
  let t = Infinity;
  if (a > 1e-9) { const disc = b * b - 4 * a * c; if (disc >= 0) { const r = (-b + Math.sqrt(disc)) / (2 * a); if (r > 0) t = r; } }
  if (d.y < -1e-6) t = Math.min(t, -o.y / d.y);
  if (d.y > 1e-6) t = Math.min(t, (H - o.y) / d.y);
  return t;
}

// ---------------------------------------------------------------- the volume, running
// Owns the world, the wall, the tracked camera, the render targets and the viewfinder.
export class VP {
  constructor(stage, { env = 'canyon', hours = 10, lens = 35, set = true, insetW = 480, lightAt = [0, 1.3, -1.5], hudTitle = 'CAMERA A' } = {}) {
    this.stage = stage;
    this.world = getWorld(); this.world.setEnv(env); this.world.setSun(hours, 0, true); this.world.setHero(0); this.world.setOffset(0);
    const hdr = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    // Inner frustum: two targets so the previous engine frame is still there (for tearing).
    this.rtInner = [new THREE.WebGLRenderTarget(768, 432, hdr), new THREE.WebGLRenderTarget(768, 432, hdr)];
    this.innerCam = new THREE.PerspectiveCamera(30, ASPECT, 0.3, 4000);
    this.outerRT = new THREE.WebGLCubeRenderTarget(128, hdr);
    this.outerCam = new THREE.CubeCamera(0.3, 4000, this.outerRT); this.outerCam.position.set(0, 1.7, 0);
    this.world.scene.add(this.outerCam);
    // What the LEDs shine on the set: a cube seen from the actor that sees only the wall.
    this.lightRT = new THREE.WebGLCubeRenderTarget(64, hdr);
    this.lightCam = new THREE.CubeCamera(0.05, 60, this.lightRT); this.lightCam.position.set(...lightAt);
    this.lightCam.children.forEach((c) => c.layers.set(WALL_LAYER));
    stage.scene.add(this.lightCam);
    this.U = {
      uOuter: { value: this.outerRT.texture }, uOuterPos: { value: this.outerCam.position.clone() },
      uInner: { value: this.rtInner[0].texture }, uPrev: { value: this.rtInner[1].texture }, uInnerVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uInnerOn: { value: 1 }, uMode: { value: 0 }, uGain: { value: 1 }, uClip: { value: 1 }, uBorder: { value: 0 }, uSeams: { value: 1 }, uZones: { value: 0 }, uTearY: { value: -2 }, uRP: { value: 2.6 },
      uGrid: { value: 0 }, uDisp: { value: 0.01 }, uPitch: { value: 0.00284 }, uF: { value: 0.035 }, uN: { value: 2.8 }, uFocus: { value: 4 }, uCamPos: { value: new THREE.Vector3() }, uCamDir: { value: new THREE.Vector3() },
      uGreen: { value: new THREE.Color(0.02, 0.62, 0.12) },
    };
    this.vol = makeVolume(this.U); stage.root.add(this.vol.group);
    this.vol.floorMat.color.set(FLOOR[env]);
    this.setMats = [];
    this.addSet(this.vol.floor, [this.vol.floorMat], 1.2);
    this.rig = makeRig(); stage.root.add(this.rig.group);
    this.vf = new Viewfinder(stage, insetW); this.vf.setLens(lens);
    this.hud = new Hud(stage, this.vf.texture, { title: hudTitle });
    this.pos = new THREE.Vector3(0, 1.55, 2.6); this.quat = new THREE.Quaternion(); this._dummy = new THREE.Object3D();
    this.hist = []; this.frozen = null; this.lastFr = -1; this.lastLight = -1; this.lastOuter = -1; this.outerVer = -1; this.cur = 0;
    this.lightGain = 1; this.state = {};
    this.lens = lens; this.overscan = 0.3; this.latency = 0; this.tracking = true;
    this.frustumLines = this.makeFrustumLines(); stage.root.add(this.frustumLines);
    this.shootOpts = {};
    this.hudLines = {};
    // Dim the stage's own lights so the LED light reads; chapters can change it.
    this.stageLights = []; stage.lights.traverse((o) => { if (o.isLight) this.stageLights.push([o, o.intensity]); });
    this.setStageLight(0.45);
  }
  setStageLight(k) { this.stageLights.forEach(([l, i]) => { l.intensity = i * k; }); }
  // Materials of things on the set: lit and reflected by the wall.
  addSet(obj, mats, intensity = 1.6) {
    obj.traverse((o) => { o.layers.enable(SET_LAYER); });
    (mats || []).forEach((m) => { m.envMap = this.lightRT.texture; m.envMapIntensity = intensity; m.needsUpdate = true; this.setMats.push(m); });
  }
  setEnvIntensity(k) { this.setMats.forEach((m) => { m.envMapIntensity = k; }); }
  setEnv(name) { if (this.world.name !== name) { this.world.setEnv(name); this.vol.floorMat.color.set(FLOOR[name]); } }
  // Where the film camera is and what it looks at.
  aim(pos, target) {
    this._dummy.position.copy(pos); this._dummy.lookAt(target);
    // Object3D.lookAt points +z at the target; a camera looks down −z, so turn it round.
    this._dummy.rotateY(Math.PI);
    this.pos.copy(pos); this.quat.copy(this._dummy.quaternion);
  }
  poseAt(t) {
    const h = this.hist;
    if (!h.length) return { p: this.pos.clone(), q: this.quat.clone() };
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
      return { p: a.p.clone().lerp(b.p, k), q: a.q.clone().slerp(b.q, k) };
    }
    return h[h.length - 1];
  }
  get hf() { return hfov(this.lens); }
  makeFrustumLines() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * (4 + 4 * 16)), 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8ee7ff, transparent: true, opacity: 0.85, toneMapped: false }));
    l.frustumCulled = false; l.visible = false; return l;
  }
  updateFrustumLines() {
    const l = this.frustumLines; if (!l.visible) return;
    const a = l.geometry.attributes.position, ty = Math.tan((this.vf.cam.fov * DEG) / 2), tx = ty * ASPECT;
    const o = this.pos, q = this.quat, v = new THREE.Vector3();
    const P = (sx, sy) => { v.set(sx * tx, sy * ty, -1).applyQuaternion(q).normalize(); const t = hitVolume(o, v); return o.clone().addScaledVector(v, Math.min(t, 30)); };
    let k = 0; const put = (p) => { a.setXYZ(k++, p.x, p.y, p.z); };
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y]) => { put(o); put(P(x, y)); });
    const edge = (x0, y0, x1, y1) => { for (let i = 0; i < 16; i++) { put(P(lerp(x0, x1, i / 16), lerp(y0, y1, i / 16))); put(P(lerp(x0, x1, (i + 1) / 16), lerp(y0, y1, (i + 1) / 16))); } };
    edge(-1, -1, 1, -1); edge(1, -1, 1, 1); edge(1, 1, -1, 1); edge(-1, 1, -1, -1);
    a.needsUpdate = true;
  }
  // o: { tracking, overscan, latency, border, zones, mode, gain, grid:{pitch,N,focus}, dof, genlock, shoot:{} }
  update(dt, time, o = {}) {
    dt = Math.max(0, dt);
    const r = this.stage.renderer, U = this.U;
    this.lens = o.lens ?? this.lens; if (this.vf.f !== this.lens) this.vf.setLens(this.lens);
    // The rig follows the camera pose.
    this.rig.base.position.set(this.pos.x, 0, this.pos.z);
    this.rig.col.scale.y = Math.max(0.2, this.pos.y - 0.12); this.rig.col.position.y = (this.pos.y - 0.12) / 2;
    this.rig.head.position.copy(this.pos); this.rig.head.quaternion.copy(this.quat);
    this.vf.cam.position.copy(this.pos); this.vf.cam.quaternion.copy(this.quat);
    this.hist.push({ t: time, p: this.pos.clone(), q: this.quat.clone() });
    while (this.hist.length > 2 && this.hist[0].t < time - 1.2) this.hist.shift();
    const tracking = o.tracking ?? true;
    if (!tracking && !this.frozen) this.frozen = { p: this.pos.clone(), q: this.quat.clone() };
    if (tracking) this.frozen = null;
    U.uMode.value = o.mode ?? 0; U.uGain.value = o.gain ?? 1; U.uZones.value = o.zones ? 1 : 0;
    U.uInnerOn.value = o.inner === false ? 0 : 1;
    this.frustumLines.visible = !!o.lines; this.updateFrustumLines();
    const w = this.world;
    const sm = r.shadowMap.autoUpdate;
    const fr = Math.floor(time * FPS);
    if (fr !== this.lastFr || o.force) {
      this.lastFr = fr;
      const prevRT = r.getRenderTarget();
      r.shadowMap.autoUpdate = false;
      // 1. the inner frustum, from where the engine believes the camera is
      const pose = this.frozen || (o.latency ? this.poseAt(time - o.latency / FPS) : { p: this.pos, q: this.quat });
      const ic = this.innerCam, ov = 1 + (o.overscan ?? 0.3);
      ic.position.copy(pose.p); ic.quaternion.copy(pose.q);
      ic.fov = (2 * Math.atan(Math.tan((this.vf.cam.fov * DEG) / 2) * ov)) / DEG; ic.aspect = ASPECT; ic.updateProjectionMatrix(); ic.updateMatrixWorld(true);
      this.cur ^= 1;
      const rt = this.rtInner[this.cur];
      U.uPrev.value = U.uInner.value; U.uPrevVP.value.copy(U.uInnerVP.value);
      if (U.uMode.value === 0) { r.setRenderTarget(rt); r.render(w.scene, ic); }
      U.uInner.value = rt.texture;
      U.uInnerVP.value.multiplyMatrices(ic.projectionMatrix, ic.matrixWorldInverse);
      // 2. the outer frustum, only when the world changed
      if (w.version !== this.outerVer && time - this.lastOuter > (o.outerEvery ?? 0)) { this.outerVer = w.version; this.lastOuter = time; this.outerCam.update(r, w.scene); }
      // 3. the light the wall throws on the set
      if (time - this.lastLight > (o.lightEvery ?? 0.12) || o.force) { this.lastLight = time; this.lightCam.update(r, this.stage.scene); o.onLight?.(); }
      // 4. the film camera takes its frame
      const g = o.grid;
      U.uSeams.value = 0; U.uBorder.value = 0;
      U.uTearY.value = o.tearY ?? -2;
      if (g) {
        U.uGrid.value = 1; U.uPitch.value = g.pitch / 1000; U.uF.value = this.lens / 1000; U.uN.value = g.N; U.uFocus.value = g.focus;
        // Our preview is only insetW pixels wide, so the grid is drawn coarser by the same factor
        // (4,608 / 2 colour samples ÷ insetW) to be sampled the way a real sensor samples it.
        U.uDisp.value = (g.pitch / 1000) * (SENSOR.px / 2 / this.vf.W);
        U.uCamPos.value.copy(this.pos); U.uCamDir.value.set(0, 0, -1).applyQuaternion(this.quat);
      }
      this.vf.shoot({ uDof: !!o.dof, uFocus: g?.focus ?? 4, uN: g?.N ?? 2.8, uExp: o.exp ?? 1 });
      U.uGrid.value = 0; U.uTearY.value = -2;
      r.setRenderTarget(prevRT);
      r.shadowMap.autoUpdate = sm;
      this.hud.redraw(o.hud || {});
    }
    U.uSeams.value = o.seams === false ? 0 : 1; U.uBorder.value = o.border ? 1 : 0;
    this.hud.visible = o.hudOn !== false; this.hud.group.visible = this.hud.visible;
    if (this.hud.visible) this.hud.update();
  }
  // Illuminance (lux) the wall gives a surface with normal n, at the light probe. Reads a small
  // cube of the LEDs back from the GPU, and adds up L·cosθ·dΩ over every texel (1.0 = NITS).
  measure(normals) {
    const r = this.stage.renderer, N = 16;
    if (!this.mRT) {
      this.mRT = new THREE.WebGLCubeRenderTarget(N, { type: THREE.UnsignedByteType });
      this.mCam = new THREE.CubeCamera(0.05, 60, this.mRT); this.mCam.children.forEach((c) => c.layers.set(WALL_LAYER));
      this.stage.scene.add(this.mCam); this.mBuf = new Uint8Array(N * N * 4);
    }
    this.mCam.position.copy(this.lightCam.position); this.mCam.updateMatrixWorld(true);
    const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    this.mCam.update(r, this.stage.scene); r.shadowMap.autoUpdate = sm;
    const out = normals.map(() => ({ E: 0, rgb: [0, 0, 0] })), v = new THREE.Vector3();   // the target holds linear values
    this.mCam.children.forEach((cam, f) => {
      r.readRenderTargetPixels(this.mRT, 0, 0, N, N, this.mBuf, f);
      cam.updateMatrixWorld(true);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = ((x + 0.5) / N) * 2 - 1, w = ((y + 0.5) / N) * 2 - 1;
        v.set(u, w, 0.5).unproject(cam).sub(this.mCam.position).normalize();
        const dO = (2 / N) ** 2 / Math.pow(1 + u * u + w * w, 1.5);
        const i = (y * N + x) * 4, cr = this.mBuf[i] / 255, cg = this.mBuf[i + 1] / 255, cb = this.mBuf[i + 2] / 255;
        const L = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) * NITS;
        normals.forEach((n, k) => { const c = Math.max(0, v.x * n[0] + v.y * n[1] + v.z * n[2]); out[k].E += L * c * dO; out[k].rgb[0] += cr * c * dO; out[k].rgb[1] += cg * c * dO; out[k].rgb[2] += cb * c * dO; });
      }
    });
    return out;
  }
  dispose() {
    this.setStageLight(1);
    this.world.scene.remove(this.outerCam); this.stage.scene.remove(this.lightCam);
    if (this.mCam) { this.stage.scene.remove(this.mCam); this.mRT.dispose(); }
    this.rtInner.forEach((t) => t.dispose()); this.outerRT.dispose(); this.lightRT.dispose(); this.vf.dispose();
    this.setMats.forEach((m) => { m.envMap = null; });
  }
}

export const fmtLux = (E) => (E >= 10000 ? Math.round(E / 1000) + 'k' : E >= 100 ? Math.round(E / 10) * 10 : E.toFixed(0)) + ' lux';
