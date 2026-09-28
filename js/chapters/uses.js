// Chapter 6: where it's used. Driving shots with a car on the stage and a street scrolling past on
// the wall, compared with 1930s-style rear projection and a green screen. Plus where LED stages
// are used today, including India's, and an illustrative cost and time comparison.
import { THREE } from '../kit.js';
import { VP, makeCar, makeBoard, boardBg } from '../vp.js';

const LAMP_GAP = 24;           // metres between street lamps on each side of our virtual street

export default {
  id: 'uses',
  short: 'Where it’s used',
  title: 'Car chases that never leave the stage',
  subtitle: 'Films, series, ads and driving shots, from Hollywood to Hyderabad.',
  view: { pos: [-7.2, 3.4, 9.4], target: [0.6, 1.3, -1.4] },
  learn: `<p>Putting actors in a car and moving the world behind them is an old trick. From the 1930s, studios used <b>rear projection</b>: a projector behind a translucent screen played a filmed road behind a car on the stage. It was dim and flat, and the car's windows and paint reflected only a dark studio.</p>
    <p>LED volumes do this far better. The street scrolls past on the wall, and the car's glass, chrome and paint <b>reflect</b> passing street lights and signs, with light sweeping across the actors' faces. Crews call these <b>process shots</b> or <b>car process</b>, and they are now one of the most common uses of LED stages.</p>
    <p>LED volumes are used for series (<i>The Mandalorian</i>, shot on ILM's StageCraft stage from 2019, made the idea famous), films, ads and music videos. Since 2020 hundreds of stages have been built worldwide. India has them too: Annapurna Studios in Hyderabad opened an LED stage with Qube Cinema in 2022 to 2023, and more have followed in Mumbai and elsewhere.</p>
    <p>Is it cheaper than a location? Sometimes. You skip travel, weather and waiting for the light, but you pay for the stage and weeks of building the world first. It works best for places that are hard, dangerous or impossible to reach, and for scenes you need to repeat.</p>
    <p class="tip"><b>Try it:</b> change the speed and watch the street lights slide over the car. Then compare with rear projection and with a green screen.</p>`,
  terms: [
    { t: 'Rear projection', d: 'Projecting a film onto the back of a translucent screen behind actors, used from the 1930s.' },
    { t: 'Front projection', d: 'Projecting onto a very reflective screen from the camera side, used in 2001: A Space Odyssey.' },
    { t: 'Process shot', d: 'A shot where actors on a stage are combined with a background filmed elsewhere, often in a car.' },
    { t: 'Plate', d: 'Background footage filmed for later use, for example a road filmed from a moving car.' },
    { t: 'StageCraft', d: 'ILM’s LED volume system, built with Unreal Engine for The Mandalorian.' },
  ],
  defaults: { mode: 'led', speed: 45 },
  controls: [
    { key: 'mode', type: 'seg', label: 'Technique', options: [{ v: 'led', label: 'LED volume' }, { v: 'rear', label: 'Rear projection' }, { v: 'green', label: 'Green screen' }] },
    { key: 'speed', type: 'range', label: 'Driving speed', min: 0, max: 90, step: 1, ends: ['parked', '90 km/h'], fmt: (v) => Math.round(v) + ' km/h' },
  ],
  quiz: [
    { q: 'What made rear projection look less real than an LED wall?', options: ['It was in colour', 'It was dim and flat, and gave no light or reflections around the car', 'It was too bright', 'It needed actors to drive'], answer: 1, why: 'Only one screen behind the car glowed, faintly. The car’s paint and glass reflected a dark studio.' },
    { q: 'Why are driving scenes a popular use of LED stages?', options: ['Cars are cheap', 'The moving street lights and reflections on the car are captured in camera, safely, on a stage', 'Actors cannot drive', 'LEDs make cars go faster'], answer: 1, why: 'The car stays still and safe while the world scrolls past, lighting and reflecting on the car and faces.' },
    { q: 'When is an LED stage most worth it?', options: ['Always, it is always cheaper', 'For places hard or impossible to reach, or scenes you must repeat', 'Only for news', 'Never'], answer: 1, why: 'You pay for the stage and for building the world first, so it pays off when a location is hard to reach or the light must be repeated.' },
  ],
  reel: [
    { ms: 5400, caption: 'Driving shots: the street scrolls past on the wall and its lights slide over the car.', set: { mode: 'led' }, anim: { speed: [20, 70] }, view: { pos: [-7.2, 3.4, 9.4], target: [0.6, 1.3, -1.4] }, spin: 0.3 },
  ],

  build({ stage }) {
    const vp = new VP(stage, { env: 'city', hours: 22, lens: 28, lightAt: [0, 1.0, 0] });
    const car = makeCar(); stage.root.add(car.group);
    vp.addSet(car.group, car.mats, 2.4);
    const L = (t, p, cls) => stage.label(t, p, stage.root, cls);
    L('Car stays still', [0.6, 1.8, 1.4], 'hot');
    L('Street scrolls past on the wall', [3.2, 3.9, -4.6]);
    const board = makeBoard(3.4, 2.8, 900, (g, w, h) => {
      boardBg(g, w, h, 'Where LED stages are used');
      g.font = '25px sans-serif'; g.fillStyle = '#eef0f6';
      const uses = ['Series and films: alien planets, deserts, spaceships', 'Car and train scenes: process shots', 'Ads and music videos: one stage, many places', 'India: stages in Hyderabad (2022–23), Mumbai and more'];
      uses.forEach((u, i) => { g.fillStyle = '#5ce1a9'; g.fillText('•', 30, 90 + i * 44); g.fillStyle = '#eef0f6'; g.fillText(u, 56, 90 + i * 44); });
      g.fillStyle = '#8ee7ff'; g.font = '600 28px sans-serif'; g.fillText('A sunset scene, 5 script pages', 30, 290);
      g.font = '22px sans-serif'; g.fillStyle = '#ffb547'; g.fillText('ILLUSTRATIVE ONLY: made-up numbers to show the trade-off', 30, 330);
      const rows = [['Location', [['travel', 2, '#7aa2ff'], ['shoot, 1 hour of light a day', 5, '#ffb547']]], ['LED stage', [['build the world', 6, '#c49bff'], ['shoot', 1.5, '#ffb547']]]];
      const x0 = 190, sc = (w - x0 - 40) / 12;
      rows.forEach(([n, segs], i) => {
        const y = 380 + i * 90; let x = x0;
        g.fillStyle = '#eef0f6'; g.font = '24px sans-serif'; g.fillText(n, 30, y + 14);
        segs.forEach(([t, d, c]) => { g.fillStyle = c; g.fillRect(x, y, d * sc - 4, 40); g.fillStyle = '#0b0d12'; g.font = '19px sans-serif'; if (d * sc > 90) g.fillText(t, x + 8, y + 10); x += d * sc; });
      });
      g.fillStyle = '#a8aebf'; g.font = '20px sans-serif'; g.fillText('days of work (illustrative)', x0, 580);
      g.fillText('Location: weather risk, crew travel. Stage: fixed cost, same light every take.', 30, 620);
    });
    board.mesh.position.set(5.0, 3.1, 3.4); board.mesh.lookAt(-7.2, 3.4, 9.4); stage.root.add(board.mesh);
    let off = 0;
    return {
      update(dt, s, time) {
        dt = Math.max(0, dt);
        const v = s.speed / 3.6;
        off += v * dt;
        vp.world.setOffset(off);
        const mode = s.mode === 'green' ? 1 : s.mode === 'rear' ? 2 : 0;
        vp.setStageLight(mode === 2 ? 0.9 : mode === 1 ? 0.5 : 0.2);
        const pos = new THREE.Vector3(-4.3 + 0.25 * Math.sin(time * 0.5), 1.35, 2.6);
        vp.aim(pos, new THREE.Vector3(1.6, 1.35, -2.2));
        // Real cars bounce a little on the road; so does a good process car on its rig.
        car.group.position.y = s.speed > 0 ? 0.012 * Math.sin(time * 11) * Math.min(1, s.speed / 40) : 0;
        vp.update(dt, time, {
          lens: 28, mode, outerEvery: 1 / 12, lightEvery: 1 / 12,
          hud: { tr: s.mode === 'led' ? 'LED PROCESS' : s.mode === 'rear' ? 'REAR PROJECTION' : 'GREEN SCREEN', bl: '28 mm', br: `${Math.round(s.speed)} km/h` },
        });
      },
      readout: (s) => {
        const v = s.speed / 3.6, per = v > 0.1 ? LAMP_GAP / v : Infinity;
        const light = s.mode === 'led' ? 'the street itself, all round' : s.mode === 'rear' ? 'film lamps; one dim screen behind' : 'green spill, fixed later';
        return `<div class="big">${s.mode === 'led' ? 'LED car process' : s.mode === 'rear' ? 'Rear projection' : 'Green screen'}</div>
          <div class="row"><span>Speed on screen</span><b>${Math.round(s.speed)} km/h = ${v.toFixed(1)} m/s</b></div>
          <div class="row"><span>A street lamp passes every</span><b>${per === Infinity ? 'never (parked)' : per.toFixed(1) + ' s'}</b></div>
          <div class="row"><span>Reflections in the car</span><b class="${s.mode === 'led' ? 'ok' : 'no'}">${s.mode === 'led' ? 'real, in camera' : s.mode === 'rear' ? 'dark studio' : 'green'}</b></div>
          <div class="row"><span>Light on the actors</span><b>${light}</b></div>`;
      },
      dispose() { vp.dispose(); vp.world.setOffset(0); },
    };
  },
};
