// Chapter 4: the limits of a screen. LED pitch and moiré, why the wall is kept out of focus,
// latency during fast moves, and the brightness and colour a wall cannot reach.
import { THREE } from '../kit.js';
import { VP, makeFigure, makeProps, makeBoard, boardBg, moire, hitVolume, hfov, NITS, FPS, PHOTOSITE_UM, R, DEG } from '../vp.js';

const LENS = 35, STOP = 2.8;
const AMP = 35;                                    // degrees: the whip pan swings ±35°
const SUN_NITS = 1.6e9;                           // luminance of the sun's disc at noon, cd/m² (about 1.6 × 10⁹)

export default {
  id: 'pixels',
  short: 'Pixels, moiré and limits',
  title: 'Keep the wall soft, and don’t move too fast',
  subtitle: 'A wall is made of dots, runs a little late and can’t be the sun.',
  view: { pos: [-4.6, 3.4, 8.6], target: [0.6, 1.7, -2.6] },
  learn: `<p>Up close, an LED wall is a grid of tiny red, green and blue dots on a black face. The gap from one dot to the next is the <b>pixel pitch</b>, around 2.3 to 2.9 mm on film stages. A camera sensor is a grid too. When the two grids line up badly, you get <b>moiré</b>: wavy rainbow stripes that were never there.</p>
    <p>The cure is focus. The actors are sharp and the wall is a few metres behind them, slightly <b>out of focus</b>. The blur washes out the dots before they reach the sensor, so the wall looks like a smooth picture. Focus on the wall itself, or stand too far back with a wide lens, and the dots come back.</p>
    <p>The wall is also a little <b>late</b>. Tracking, drawing and sending pixels to the screens takes several frames (about 8 on early stages). When the camera whips round, the inner frustum trails behind, and <b>overscan</b> must be big enough to hide the lag.</p>
    <p>Last, a wall has <b>limits</b>: about 1,500 to 1,800 nits at most, which is nothing next to the sun, and LEDs make light in three narrow colours, which can make skin and fabrics look slightly off. So hard sunlight and some colours still come from film lights.</p>
    <p class="tip"><b>Try it:</b> pull focus from the actor to the wall and watch stripes appear in the camera picture. Then turn up the pan speed and the latency until the edge of the inner frustum shows.</p>`,
  terms: [
    { t: 'Pixel pitch', d: 'The distance between the centres of two neighbouring LED pixels, in millimetres.' },
    { t: 'Moiré', d: 'False stripes or ripples when two fine grids, like LEDs and a sensor, interfere.' },
    { t: 'Depth of field', d: 'The range of distances that look sharp. Keeping the wall outside it hides the LED grid.' },
    { t: 'Latency', d: 'The delay from the camera moving to the wall showing the new view, counted in frames.' },
    { t: 'Nit', d: 'A unit of brightness: one candela per square metre.' },
    { t: 'Narrow-band light', d: 'Light made of a few pure colours, like RGB LEDs, rather than the smooth rainbow of sunlight.' },
  ],
  defaults: { pitch: 2.84, focus: 4, dist: 7.6, pan: 0, latency: 8, overscan: 0.3 },
  controls: [
    { key: 'focus', type: 'range', label: 'Focus distance', min: 1, max: 12, step: 0.05, ends: ['1 m', '12 m'], fmt: (v) => v.toFixed(1) + ' m' },
    { key: 'pitch', type: 'seg', label: 'LED pixel pitch', options: [{ v: 1.5, label: '1.5 mm' }, { v: 2.3, label: '2.3 mm' }, { v: 2.84, label: '2.84 mm' }, { v: 3.9, label: '3.9 mm' }] },
    { key: 'dist', type: 'range', label: 'Camera distance from the wall', min: 3, max: 9, step: 0.05, ends: ['3 m', '9 m'], fmt: (v) => v.toFixed(1) + ' m' },
    { key: 'pan', type: 'range', label: 'Whip-pan speed', min: 0, max: 120, step: 1, ends: ['still', '120°/s'], fmt: (v) => Math.round(v) + '°/s' },
    { key: 'latency', type: 'range', label: 'System latency', min: 0, max: 10, step: 1, ends: ['0', '10 frames'], fmt: (v) => `${v} frames = ${Math.round((v / FPS) * 1000)} ms` },
    { key: 'overscan', type: 'range', label: 'Overscan', min: 0, max: 0.6, step: 0.01, ends: ['none', '60%'], fmt: (v) => '+' + Math.round(v * 100) + '%' },
  ],
  quiz: [
    { q: 'Why is the LED wall usually kept a little out of focus?', options: ['To save power', 'So the blur hides the grid of LEDs and stops moiré', 'Because actors prefer it', 'LED walls cannot be focused on'], answer: 1, why: 'Defocus blurs each LED into its neighbours before the light reaches the sensor, so there is no fine grid left to clash with the sensor grid.' },
    { q: 'A stage has 8 frames of latency at 24 fps. How long is that?', options: ['8 ms', 'About a third of a second', '8 seconds', 'One minute'], answer: 1, why: '8 ÷ 24 = 0.33 s. In that time a fast pan can turn the camera well past the old inner frustum.' },
    { q: 'Why can’t the wall replace the sun?', options: ['It is the wrong shape', 'Its peak brightness is about a million times lower than the sun’s disc', 'It is too hot', 'It is too far away'], answer: 1, why: 'A wall reaches roughly 1,800 nits; the sun’s disc is about 1.6 billion. Hard sunlight still needs a real lamp.' },
  ],
  reel: [
    { ms: 5200, caption: 'Pull focus onto the wall and its grid of LEDs beats against the sensor: moiré.', set: { pitch: 2.84, dist: 7.6, pan: 0, latency: 8, overscan: 0.3 }, anim: { focus: [4, 7.6] }, view: { pos: [-4.6, 3.4, 8.6], target: [0.6, 1.7, -2.6] }, spin: 0 },
    { ms: 5000, caption: 'The wall runs a few frames late, so a whip pan outruns the inner frustum.', set: { focus: 4, dist: 7.6, latency: 8, overscan: 0.1 }, anim: { pan: [0, 110] }, view: { pos: [3.5, 7.5, 8.5], target: [0, 1.4, -2.4] }, spin: 0 },
  ],

  build({ stage }) {
    const vp = new VP(stage, { env: 'pass', hours: 9, lens: LENS });
    const actor = makeFigure({ suit: 0x7a4a3a }); actor.group.position.set(0, 0, -2.4);
    const props = makeProps();
    stage.root.add(actor.group, props.group);
    vp.addSet(actor.group, actor.mats); vp.addSet(props.group, props.mats);
    // A magnified LED cabinet, so you can see what the camera is looking at.
    const mag = new THREE.Group(); mag.position.set(-3.1, 1.0, -0.6); mag.rotation.y = 0.5; stage.root.add(mag);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.6 })); mag.add(face);
    const dotG = new THREE.CircleGeometry(0.018, 10), cols = [0xff2a2a, 0x2aff5a, 0x3a6bff];
    const dots = cols.map((c) => new THREE.InstancedMesh(dotG, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), toneMapped: false }), 64));
    const o = new THREE.Object3D();
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) cols.forEach((_, k) => { o.position.set(-0.525 + i * 0.15 + (k - 1) * 0.04, -0.525 + j * 0.15, 0.002); o.updateMatrix(); dots[k].setMatrixAt(j * 8 + i, o.matrix); });
    dots.forEach((d) => mag.add(d));
    stage.label('LED grid, magnified', [0, 0.78, 0], mag, 'hot');
    const pLab = stage.label('', [0, -0.75, 0], mag);
    // Brightness and spectrum board.
    const board = makeBoard(2.4, 1.5, 820, (g, w, h) => {
      boardBg(g, w, h, 'Brightness and colour limits');
      g.font = '24px sans-serif'; g.fillStyle = '#a8aebf';
      // log bars of luminance
      const rows = [['LED wall peak', NITS, '#8ee7ff'], ['Blue sky', 8000, '#7aa2ff'], ['Sun’s disc', SUN_NITS, '#ffb547']];
      rows.forEach(([n, v, c], i) => {
        const y = 90 + i * 58, len = ((Math.log10(v) - 2) / 8) * (w - 470);
        g.fillStyle = '#eef0f6'; g.fillText(n, 30, y + 8);
        g.fillStyle = c; g.fillRect(230, y + 4, Math.max(4, len), 28);
        g.fillStyle = '#a8aebf'; g.fillText(v >= 1e6 ? (v / 1e9).toFixed(1) + ' billion nits' : v.toLocaleString('en-IN') + ' nits', 240 + len, y + 8);
      });
      // spectra: RGB LED (three narrow peaks) vs daylight (smooth)
      const x0 = 40, x1 = w - 40, yb = h - 40, ht = 150;
      const X = (l) => x0 + ((l - 400) / 300) * (x1 - x0);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(x0, yb); g.lineTo(x1, yb); g.stroke();
      g.lineWidth = 3; g.strokeStyle = '#ffb547'; g.beginPath();
      for (let l = 400; l <= 700; l += 5) { const v = 0.75 + 0.2 * Math.sin((l - 400) / 60) - 0.0008 * (l - 480) * (l > 480); const y = yb - ht * v * 0.8; l === 400 ? g.moveTo(X(l), y) : g.lineTo(X(l), y); }
      g.stroke();
      g.strokeStyle = '#8ee7ff'; g.beginPath();
      for (let l = 400; l <= 700; l += 2) { const pk = (c, s) => Math.exp(-(((l - c) / s) ** 2) / 2); const v = 0.95 * pk(465, 10) + 0.8 * pk(525, 16) + 0.9 * pk(630, 8); const y = yb - ht * v; l === 400 ? g.moveTo(X(l), y) : g.lineTo(X(l), y); }
      g.stroke();
      g.font = '22px sans-serif'; g.fillStyle = '#ffb547'; g.fillText('daylight: smooth', x0, yb - ht - 34);
      g.fillStyle = '#8ee7ff'; g.fillText('RGB LEDs: three narrow peaks', x0 + 230, yb - ht - 34);
      g.fillStyle = '#a8aebf'; g.fillText('400 nm', x0, yb + 8); g.textAlign = 'right'; g.fillText('700 nm', x1, yb + 8); g.textAlign = 'left';
    });
    board.mesh.position.set(3.3, 3.4, -3.2); board.mesh.lookAt(-4.6, 3.4, 8.6); stage.root.add(board.mesh);
    const info = { m: moire({ pitch: 2.84, f: LENS, N: STOP, focus: 4, dist: 7.6 }), need: 0, phase: 0 };
    return {
      update(dt, s, time) {
        dt = Math.max(0, dt);
        // Camera on the centre line, the given distance from the back wall.
        // A sine swing of ±35° whose peak turning speed is s.pan degrees a second.
        const z = -R + s.dist;
        info.phase = (info.phase || 0) + (s.pan / AMP) * dt;
        const yaw = s.pan > 0 ? AMP * DEG * Math.sin(info.phase) : 0;
        const pos = new THREE.Vector3(0, 1.6, z);
        const tgt = new THREE.Vector3(Math.sin(yaw) * 5, 1.5, z - Math.cos(yaw) * 5);
        vp.aim(pos, tgt);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(vp.quat);
        const dw = hitVolume(pos, dir);
        info.m = moire({ pitch: s.pitch, f: LENS, N: STOP, focus: s.focus, dist: dw });
        const lag = (s.pan * DEG * s.latency) / FPS, hf = hfov(LENS) / 2;
        info.need = Math.tan(Math.min(hf + lag, 1.5)) / Math.tan(hf) - 1;
        const showsEdge = info.need > s.overscan + 0.001 && s.pan > 0;
        vp.update(dt, time, {
          lens: LENS, latency: s.latency, overscan: s.overscan, border: true, dof: true, lines: true,
          grid: { pitch: s.pitch, N: STOP, focus: s.focus },
          hud: { tr: `focus ${s.focus.toFixed(1)} m`, bl: `${LENS} mm · T${STOP}`, br: `${s.pitch} mm LEDs`, warn: info.m.cls === 'no' && info.m.contrast > 0.25 ? 'MOIRÉ RISK' : showsEdge ? 'FRUSTUM EDGE IN SHOT' : '' },
        });
        pLab.element.textContent = `${s.pitch} mm between pixels`;
      },
      readout: (s) => {
        const m = info.m, lagMs = Math.round((s.latency / FPS) * 1000), edge = info.need > s.overscan + 0.001 && s.pan > 0;
        return `<div class="big">Moiré: <span class="${m.cls}">${m.risk}</span></div>
          <div class="row"><span>One LED step on the sensor</span><b>${m.ip.toFixed(1)} µm = ${(m.ip / PHOTOSITE_UM).toFixed(1)} photosites</b></div>
          <div class="row"><span>Blur spot from focus</span><b>${m.c < 1 ? '< 1' : m.c.toFixed(0)} µm</b></div>
          <div class="row"><span>LED grid contrast left</span><b>${Math.round(m.contrast * 100)}%</b></div>
          <div class="row"><span>Delay, ${s.latency} frames</span><b>${lagMs} ms</b></div>
          <div class="row"><span>Overscan needed at ${Math.round(s.pan)}°/s</span><b class="${edge ? 'no' : 'ok'}">${Math.round(info.need * 100)}% (have ${Math.round(s.overscan * 100)}%)</b></div>`;
      },
      dispose() { vp.dispose(); },
    };
  },
};
