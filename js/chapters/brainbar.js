// Chapter 5: the brain bar. The crew who run the engine, the tracking and the sync, and change the
// world live: move the sun, move a mountain, swap the location.
import { THREE, M, box } from '../kit.js';
import { VP, makeFigure, makeProps, makeBoard, boardBg, FPS, H } from '../vp.js';
import { sunAt } from '../vpworld.js';

const DESK = new THREE.Vector3(-6.3, 0, 4.6);
const SHUTTER = 180;                         // degrees: open for half of each frame
const LED_HZ = 60;                           // an unsynced wall refreshing on its own 60 Hz clock
const fmtH = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

export default {
  id: 'brainbar',
  short: 'The brain bar',
  title: '“Can we move that mountain?”',
  subtitle: 'A team at a desk runs the engine and changes the world between takes.',
  view: { pos: [-6.4, 5.0, 14.4], target: [-1.2, 1.3, 0.2] },
  learn: `<p>Just off the stage sits the <b>brain bar</b>: a row of desks and screens where engine operators run the virtual world. They are the stage’s crew for everything that isn't physical.</p>
    <p>If the director says “move that mountain left” or “give me the sunset again”, an <b>engine operator</b> drags the mountain or turns the sun, and the wall changes in seconds. The world itself was built weeks earlier by the <b>virtual art department</b> (VAD): artists who model, texture and light the locations, often from photos and scans of real places, and check them in VR before the shoot.</p>
    <p>Other seats run the <b>tracking system</b> (where the camera is) and the <b>LED processors</b> that feed the screens. Everything must tick together. <b>Genlock</b> is a shared timing pulse, so the camera shutter, the engine and every LED panel start each frame at the same instant. Without it, the wall can change picture while the shutter is open, and a <b>tear</b> or dark band rolls through the shot.</p>
    <p class="tip"><b>Try it:</b> drag the time of day and the sun direction, and move the mountain. Then switch genlock off and watch the camera picture.</p>`,
  terms: [
    { t: 'Brain bar', d: 'The control desk beside an LED stage where engine, tracking and screen operators work.' },
    { t: 'Virtual art department', d: 'The artists who build the 3D locations before the shoot.' },
    { t: 'Engine operator', d: 'The person who runs the game engine on set and makes live changes to the world.' },
    { t: 'Genlock', d: 'A shared timing signal that makes cameras, computers and screens start every frame together.' },
    { t: 'Tearing', d: 'A line through the picture where the top shows one frame and the bottom the next.' },
    { t: 'Digital twin', d: 'A 3D copy of a real place, used as the virtual location.' },
  ],
  defaults: { hours: 16.5, heading: 0, mountain: 0, env: 'canyon', genlock: true },
  controls: [
    { key: 'hours', type: 'range', label: 'Time of day', min: 5.8, max: 18.4, step: 0.01, ends: ['dawn', 'dusk'], fmt: (v) => fmtH(v) },
    { key: 'heading', type: 'range', label: 'Turn the sun', min: -120, max: 120, step: 1, ends: ['left', 'right'], fmt: (v) => (v > 0 ? '+' : '') + Math.round(v) + '°' },
    { key: 'mountain', type: 'range', label: 'Move that mountain', min: -160, max: 160, step: 1, ends: ['left', 'right'], fmt: (v) => (v > 0 ? '+' : '') + Math.round(v) + ' m' },
    { key: 'env', type: 'seg', label: 'Location (built by the VAD)', options: [{ v: 'canyon', label: 'Desert canyon' }, { v: 'pass', label: 'Himalayan pass' }] },
    { key: 'genlock', type: 'toggle', label: 'Genlock on' },
  ],
  quiz: [
    { q: 'What does the virtual art department do?', options: ['Paints the real set', 'Builds the 3D locations before the shoot', 'Operates the camera', 'Writes the script'], answer: 1, why: 'The VAD models, textures and lights the virtual places weeks before filming.' },
    { q: 'What does genlock do?', options: ['Locks the stage doors', 'Makes camera, engine and screens start every frame together', 'Stops the camera moving', 'Makes the LEDs brighter'], answer: 1, why: 'A shared timing pulse keeps every device in step, so the wall never changes picture mid-exposure.' },
    { q: 'The director wants the sunset to last all day. What happens?', options: ['They must wait for the real sun', 'The operator keeps the virtual sun where it is', 'They switch to green screen', 'It is impossible'], answer: 1, why: 'The sun is just a setting in the engine. It can stay at golden hour for every take.' },
  ],
  reel: [
    { ms: 5400, caption: 'At the brain bar, operators turn the sun and move mountains: golden hour can last all day.', set: { env: 'canyon', genlock: true, heading: 0 }, anim: { hours: [11, 17.9], mountain: [0, 110] }, view: { pos: [-6.4, 5.0, 14.4], target: [-1.2, 1.3, 0.2] }, spin: 0 },
  ],

  build({ stage }) {
    const vp = new VP(stage, { env: 'canyon', hours: 16.5 });
    const actor = makeFigure({ helmet: true }); actor.group.position.set(0, 0, -1.8); actor.group.rotation.y = 0.3;
    const props = makeProps();
    stage.root.add(actor.group, props.group);
    vp.addSet(actor.group, actor.mats); vp.addSet(props.group, props.mats);
    // The desk, its monitors and three operators.
    const bar = new THREE.Group(); bar.position.copy(DESK); bar.rotation.y = Math.atan2(-DESK.x, -DESK.z); stage.root.add(bar);   // operators face the stage
    const top = box(3.6, 0.06, 0.9, M.matte(0x2a2e36)); top.position.y = 0.76; bar.add(top);
    [-1.7, 1.7].forEach((x) => { const l = box(0.06, 0.76, 0.8, M.matte(0x1c1f25)); l.position.set(x, 0.38, 0); bar.add(l); });
    const screens = [];
    for (let i = 0; i < 4; i++) {
      const x = -1.35 + i * 0.9;
      const bezel = box(0.82, 0.5, 0.04, M.matte(0x0d0f13)); bezel.position.set(x, 1.12, 0.3); bezel.rotation.y = Math.PI; bar.add(bezel);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.43), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      scr.position.set(x, 1.12, 0.275); scr.rotation.y = Math.PI; bar.add(scr); screens.push(scr);
    }
    [-1.0, 0, 1.0].forEach((x) => { const f = makeFigure({ sit: true, suit: [0x3a4a5e, 0x5e3a3a, 0x3a5e46][Math.round(x + 1)] }); f.group.position.set(x, 0, -0.55); bar.add(f.group); });
    const chairM = M.matte(0x22252c);
    [-1.0, 0, 1.0].forEach((x) => { const c = box(0.5, 0.08, 0.5, chairM); c.position.set(x, 0.46, -0.6); bar.add(c); });
    // Screen 1: the inner frustum render, straight from the engine. Screens 2 to 4: canvases.
    const st = { h: 16.5, e: 0, a: 0, genlock: true, x: 0, y: 0, z: 0, phase: 0 };
    const mkScreen = (draw) => { const ct = makeBoard(0.76, 0.43, 480, draw); return ct; };
    const scTrack = mkScreen((g, w, h) => {
      g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h); g.fillStyle = '#5ce1a9'; g.font = '600 26px monospace'; g.fillText('TRACKING  OK', 20, 40);
      g.font = '22px monospace'; g.fillStyle = '#cfe8ff';
      [['X', st.x], ['Y', st.y], ['Z', st.z]].forEach(([k, v], i) => g.fillText(`${k} ${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(3)} m`, 20, 90 + i * 34));
      g.fillText('LENS 35 mm  T2.8', 20, 200); g.fillText(`${FPS} fps`, 20, 234);
    });
    const scSync = mkScreen((g, w, h) => {
      g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
      g.font = '600 24px monospace'; g.fillStyle = st.genlock ? '#5ce1a9' : '#ff6b5e'; g.fillText(st.genlock ? 'GENLOCK  LOCKED' : 'GENLOCK  OFF', 20, 36);
      // shutter open windows (amber) and wall picture changes (ticks)
      const x0 = 20, x1 = w - 20, T = 3 / FPS, X = (t) => x0 + (t / T) * (x1 - x0);
      g.fillStyle = '#a8aebf'; g.font = '18px monospace'; g.fillText('camera shutter', 20, 78); g.fillText('wall picture changes', 20, 168);
      for (let k = 0; k < 3; k++) { g.fillStyle = '#ffb547'; g.fillRect(X(k / FPS), 90, X((SHUTTER / 360) / FPS) - x0, 40); }
      g.strokeStyle = st.genlock ? '#5ce1a9' : '#ff6b5e'; g.lineWidth = 4;
      const period = st.genlock ? 1 / FPS : 1 / LED_HZ, off = st.genlock ? (SHUTTER / 360) / FPS + 0.2 / FPS : (st.phase % 1) * (1 / LED_HZ);
      for (let t = off; t < T; t += period) { g.beginPath(); g.moveTo(X(t), 180); g.lineTo(X(t), 225); g.stroke(); }
    });
    const scScene = mkScreen((g, w, h) => {
      g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h); g.fillStyle = '#8ee7ff'; g.font = '600 24px monospace'; g.fillText('SCENE', 20, 36);
      g.font = '22px monospace'; g.fillStyle = '#cfe8ff';
      g.fillText(`TIME     ${fmtH(st.h)}`, 20, 84); g.fillText(`SUN ELEV ${st.e.toFixed(1)}°`, 20, 118); g.fillText(`SUN AZ   ${Math.round(st.a)}°`, 20, 152); g.fillText(`MESA X   ${st.m >= 0 ? '+' : ''}${Math.round(st.m || 0)} m`, 20, 186);
    });
    [scTrack, scSync, scScene].forEach((b, i) => { const s = screens[i + 1]; s.material.dispose(); s.material = b.mesh.material; });
    const L = (t, p, cls) => stage.label(t, p, bar, cls);
    L('Brain bar', [0, 2.15, 0], 'hot');
    L('Engine view', [-1.35, 1.5, 0.3]); L('Genlock / sync', [0.45, 1.5, 0.3]);
    L('Engine operators', [1.2, 0.3, -1.2]);
    let tick = 0;
    return {
      update(dt, s, time) {
        dt = Math.max(0, dt);
        vp.setEnv(s.env);
        vp.world.setSun(s.hours, s.heading); vp.world.setHero(s.mountain);
        const pos = new THREE.Vector3(0.9 * Math.sin(time * 0.4), 1.5, 2.6);
        vp.aim(pos, new THREE.Vector3(-0.2, 1.7, -3));
        // Without genlock the wall's own 60 Hz refresh drifts through each exposure, and the line
        // where the new picture starts rolls through the frame.
        st.phase += dt * 0.7;
        const tear = s.genlock ? -2 : 0.2 + (H - 0.4) * (1 - (st.phase % 1));
        vp.update(dt, time, { tearY: tear, hud: { tr: s.genlock ? 'GENLOCK' : 'NO SYNC', bl: fmtH(s.hours), br: s.mountain ? `mesa ${s.mountain > 0 ? '+' : ''}${Math.round(s.mountain)} m` : '' , warn: s.genlock ? '' : 'TEARING' } });
        screens[0].material.map = vp.U.uInner.value; screens[0].material.needsUpdate = screens[0].material.map !== st.lastMap; st.lastMap = screens[0].material.map;
        const sun = sunAt(s.hours);
        Object.assign(st, { h: s.hours, e: sun.elev, a: (sun.az + s.heading + 360) % 360, genlock: s.genlock, m: s.mountain, x: pos.x, y: pos.y, z: pos.z });
        if (time - tick > 0.15) { tick = time; scTrack.redraw(); scSync.redraw(); scScene.redraw(); }
      },
      readout: (s) => {
        const sun = sunAt(s.hours);
        return `<div class="big">${fmtH(s.hours)} on the wall</div>
          <div class="row"><span>Sun height (27° N, equinox)</span><b>${sun.elev.toFixed(1)}°</b></div>
          <div class="row"><span>Sun direction</span><b>${Math.round((sun.az + s.heading + 360) % 360)}° from north</b></div>
          <div class="row"><span>Mountain moved</span><b>${s.mountain > 0 ? '+' : ''}${Math.round(s.mountain)} m</b></div>
          <div class="row"><span>Engine time per frame at ${FPS} fps</span><b>${(1000 / FPS).toFixed(1)} ms</b></div>
          <div class="row"><span>Sync</span><b class="${s.genlock ? 'ok' : 'no'}">${s.genlock ? 'genlocked' : 'free-running, tearing'}</b></div>`;
      },
      dispose() { vp.dispose(); },
    };
  },
};
