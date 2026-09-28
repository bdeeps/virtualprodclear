// Chapter 1: the LED volume. A curved wall and ceiling of LEDs around a small real set, showing a
// 3D location. Compared with a green screen stage.
import { THREE } from '../kit.js';
import { VP, makeFigure, makeProps, makeBoard, boardBg, R, H, ARCL, CAB, NITS, WALL_AREA } from '../vp.js';
import { ENVS } from '../vpworld.js';

const CEIL_AREA = (140 / 360) * Math.PI * (R * R - 1.2 * 1.2);   // our partial ceiling, m²

export default {
  id: 'volume',
  short: 'The LED volume',
  title: 'A room made of screens',
  subtitle: 'A curved LED wall shows a 3D place around a small real set.',
  view: { pos: [6.8, 3.6, 11.5], target: [0.4, 1.9, -1.2] },
  learn: `<p>In <b>virtual production</b> the actors stand on a small real set, and the rest of the world is shown around them on a giant curved wall of <b>LED screens</b>, plus a screen ceiling. This room of screens is called an <b>LED volume</b>. The picture on it is a real 3D place, built by artists and drawn live by a <b>game engine</b> such as Unreal Engine (see CGIClear for how real-time rendering works).</p>
    <p>The trick is at the <b>seam</b>. Real sand, rocks and props on the floor are painted to match the ground on the wall, so the camera can't tell where the set ends and the screen begins. The camera films it all at once: what you see through the lens is the final shot, which is why this is also called <b>in-camera VFX</b>.</p>
    <p>The older way is a <b>green screen</b> (see VFXClear): film the actor in front of flat green, then replace the green with the world months later. It is cheaper and flexible, but the actor sees nothing, the light is wrong, and green light spills onto skin and shiny things. An LED wall gives <b>real light</b>, <b>real reflections</b> and a world the actors can react to, but everything must be built and decided <b>before</b> the shoot.</p>
    <p class="tip"><b>Try it:</b> switch between the LED volume and the green screen and watch the chrome helmet and the camera picture. Then lift the ceiling to see the steel and the tracking cameras.</p>`,
  terms: [
    { t: 'LED volume', d: 'A stage surrounded by LED screens (walls and often a ceiling) that show a live 3D world.' },
    { t: 'In-camera VFX', d: 'Getting the finished effect straight through the camera lens on set, instead of adding it later.' },
    { t: 'Game engine', d: 'Software that draws a 3D world many times a second, such as Unreal Engine or Unity.' },
    { t: 'Cabinet', d: 'One LED panel of the wall, often 50 × 50 cm, bolted to its neighbours with no visible gap.' },
    { t: 'Green screen', d: 'A plain green backdrop that software later replaces with another picture.' },
    { t: 'Spill', d: 'Coloured light bouncing off a green or blue screen onto the actor and props.' },
  ],
  defaults: { env: 'canyon', stage: 'led', lift: 0 },
  controls: [
    { key: 'stage', type: 'seg', label: 'Stage', options: [{ v: 'led', label: 'LED volume' }, { v: 'green', label: 'Green screen' }] },
    { key: 'env', type: 'seg', label: 'Location on the wall', options: [{ v: 'canyon', label: 'Desert canyon' }, { v: 'pass', label: 'Himalayan pass' }] },
    { key: 'lift', type: 'range', label: 'Lift the ceiling', min: 0, max: 1, step: 0.01, ends: ['closed', 'lifted'], fmt: (v) => Math.round(v * 100) + '%' },
  ],
  quiz: [
    { q: 'What is an LED volume?', options: ['A loudspeaker for film sets', 'A stage surrounded by LED screens showing a live 3D world', 'A very bright film light', 'A kind of camera lens'], answer: 1, why: 'The walls (and often the ceiling) are LED screens that a game engine fills with a 3D place around a small real set.' },
    { q: 'Why is the real floor painted to match the ground on the wall?', options: ['To save paint', 'So the camera cannot see where the real set ends and the screen begins', 'So actors do not slip', 'Because LEDs need a coloured floor'], answer: 1, why: 'The seam between real props and the screen is hidden when the colours and textures match.' },
    { q: 'Which of these does an LED wall give that a green screen does not?', options: ['A cheaper shoot', 'Freedom to change the background months later', 'Real light and reflections from the world on the actor', 'No need for a camera'], answer: 2, why: 'The screen glows with the world, so it lights the actor and shows up in shiny surfaces. A green screen only throws green light.' },
  ],
  reel: [
    { ms: 5200, caption: 'Virtual production puts a small real set inside a curved wall of LED screens.', set: { env: 'canyon', stage: 'led', lift: 0 }, anim: {}, view: { pos: [7.6, 3.9, 12.5], target: [0.4, 1.9, -1.2] }, spin: 0.5 },
  ],

  build({ stage }) {
    const vp = new VP(stage, { env: 'canyon', hours: 10 });
    const actor = makeFigure({ helmet: true }); actor.group.position.set(0, 0, -1.5); actor.group.rotation.y = 0.35;
    const props = makeProps();
    stage.root.add(actor.group, props.group);
    vp.addSet(actor.group, actor.mats); vp.addSet(props.group, props.mats);
    const L = (t, p, cls) => stage.label(t, p, stage.root, cls);
    L('Curved LED wall', [-3.6, H + 0.2, -4.7], 'hot');
    L('LED ceiling', [2.2, H + 0.3, -3.8]);
    L('Real rock (a prop)', [-2.4, 1.1, -2.6]);
    L('Actor', [0.2, 2.05, -1.5]);
    L('Tracked camera', [0.9, 2.3, 2.6]);
    L('Real floor meets the screen', [2.6, 0.2, -5.3]);
    L('Tracking cameras', [4.9, H + 0.6, -2.6]);

    const board = makeBoard(3.0, 1.97, 900, (g, w, h) => {
      boardBg(g, w, h, 'LED volume vs green screen');
      const rows = [['Light on the actor', 'from the world', 'green spill'], ['Reflections', 'real, in camera', 'fixed in post'], ['What actors see', 'the place itself', 'a green wall'], ['Decisions made', 'before the shoot', 'after the shoot'], ['Cost to set up', 'high', 'low']];
      g.font = '600 26px sans-serif'; g.fillStyle = '#a8aebf';
      g.fillText('LED', 470, 88); g.fillText('Green', 690, 88);
      rows.forEach(([a, b, c], i) => {
        const y = 140 + i * 88;
        g.fillStyle = 'rgba(255,255,255,.06)'; if (i % 2 === 0) g.fillRect(20, y - 16, w - 40, 76);
        g.fillStyle = '#eef0f6'; g.font = '26px sans-serif'; g.fillText(a, 34, y + 8);
        g.fillStyle = i === 4 ? '#ff8a7a' : '#5ce1a9'; g.fillText(b, 470, y + 8);
        g.fillStyle = i === 4 ? '#5ce1a9' : '#ff8a7a'; g.fillText(c, 690, y + 8);
      });
    });
    board.mesh.position.set(6.6, 2.7, 3.6); board.mesh.lookAt(6.8, 3.6, 11.5); stage.root.add(board.mesh);

    const ceil = [vp.vol.ceil, vp.vol.lid];
    return {
      update(dt, s, time) {
        dt = Math.max(0, dt);
        vp.setEnv(s.env);
        ceil.forEach((m) => { m.position.y = s.lift * 2.6; });
        const x = 0.35 + 0.35 * Math.sin(time * 0.35);
        vp.aim(new THREE.Vector3(x, 1.5, 2.6), new THREE.Vector3(-0.1, 1.45, -3));
        actor.head.rotation.y = 0.25 * Math.sin(time * 0.5);
        vp.update(dt, time, { mode: s.stage === 'green' ? 1 : 0, hud: { tr: s.stage === 'green' ? 'GREEN SCREEN' : ENVS[s.env].toUpperCase(), bl: '35 mm · T2.8', br: '24 fps' } });
      },
      readout: (s) => {
        const cabs = Math.round(WALL_AREA / (CAB * CAB)) + Math.round(CEIL_AREA / (CAB * CAB));
        const px = (WALL_AREA + CEIL_AREA) / (0.00284 * 0.00284) / 1e6;
        return `<div class="big">${s.stage === 'green' ? 'Green screen stage' : 'LED volume'}</div>
          <div class="row"><span>Wall</span><b>${Math.round((ARCL * 180) / Math.PI)}°, ${2 * R} m across, ${H} m tall</b></div>
          <div class="row"><span>Screen area, wall + ceiling</span><b>${Math.round(WALL_AREA + CEIL_AREA)} m²</b></div>
          <div class="row"><span>LED cabinets (50 cm)</span><b>about ${cabs}</b></div>
          <div class="row"><span>Pixels at 2.84 mm pitch</span><b>${px.toFixed(0)} million</b></div>
          <div class="row"><span>Peak brightness</span><b>${NITS.toLocaleString('en-IN')} nits</b></div>`;
      },
      dispose() { vp.dispose(); },
    };
  },
};
