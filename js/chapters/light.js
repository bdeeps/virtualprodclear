// Chapter 3: interactive light and reflections. The wall is the light source: change the place on
// the screens and the actor's lighting and the chrome reflections change with it, instantly.
import { THREE } from '../kit.js';
import { VP, makeFigure, makeProps, makeBoard, boardBg, fmtLux } from '../vp.js';

// Presets: location and time of day.
const LOOKS = {
  noon: { env: 'canyon', hours: 11.5, label: 'Canyon, midday' },
  sunset: { env: 'canyon', hours: 17.3, label: 'Canyon, sunset' },
  pass: { env: 'pass', hours: 8.5, label: 'Himalayan pass, morning' },
  city: { env: 'city', hours: 22, label: 'City street, night' },
};
const TURN = 0.75;                                  // the actor faces three-quarters to camera left
const FACE = [Math.sin(TURN), 0.15, Math.cos(TURN)];
const SUN_LUX = 100000;                             // direct sun on a clear day, roughly (CIE / IES handbooks)

export default {
  id: 'light',
  short: 'Light and reflections',
  title: 'The screen is also the light',
  subtitle: 'Change the world on the wall and the actor is lit by it, at once.',
  view: { pos: [4.6, 2.6, 4.2], target: [-0.1, 1.45, -1.6] },
  learn: `<p>Each LED is a tiny coloured lamp, and a wall has millions of them. So the wall doesn't just show the world: it <b>lights</b> the set with it. A sunset on the screens throws warm orange light on the actor's face; a city at night throws blue and pink neon. Nobody has to fake it with filters (see LightingClear for how film lights are normally set).</p>
    <p>Shiny things show it best. A chrome helmet, a car door or a pair of glasses <b>reflects</b> the wall, so the reflections are correct in camera. With a green screen, that same helmet would reflect a big green wall, and artists would have to paint every reflection out later.</p>
    <p>Change the location and the light changes <b>instantly</b>: a sunset can last all day. There are limits. Behind the camera there is no wall, so the face gets little light from the front, and a wall is far dimmer than the real sun. Crews still add film lights for <b>fill</b> and for hard sunlight.</p>
    <p class="tip"><b>Try it:</b> switch between midday, sunset and the city at night and watch the helmet and the numbers. Then switch to a green screen and look at the green spill.</p>`,
  terms: [
    { t: 'Interactive light', d: 'Light on the actors that comes from the scene itself and changes with it.' },
    { t: 'Image-based lighting', d: 'Lighting a scene with a picture of its surroundings. An LED wall does this for real.' },
    { t: 'Rim light', d: 'Light from behind that outlines a person’s edge. LED walls behind actors give lots of it.' },
    { t: 'Fill light', d: 'Soft light from the camera side that lifts the shadows on a face.' },
    { t: 'Lux', d: 'How much light lands on a surface. Direct sun is around 100,000 lux; an office about 500.' },
    { t: 'Nit', d: 'How bright a glowing surface is, in candela per square metre. A phone is about 500 to 1,000.' },
  ],
  defaults: { look: 'sunset', stage: 'led', fill: false },
  controls: [
    { key: 'look', type: 'seg', label: 'Place on the wall', options: [{ v: 'noon', label: 'Midday' }, { v: 'sunset', label: 'Sunset' }, { v: 'pass', label: 'Mountain pass' }, { v: 'city', label: 'Night city' }], fmt: (v) => LOOKS[v].label },
    { key: 'stage', type: 'seg', label: 'Stage', options: [{ v: 'led', label: 'LED volume' }, { v: 'green', label: 'Green screen' }] },
    { key: 'fill', type: 'toggle', label: 'Add a film light for fill' },
  ],
  quiz: [
    { q: 'Why does the actor’s face turn orange when a sunset is on the wall?', options: ['The camera adds a filter', 'The LEDs themselves shine orange light onto the actor', 'Make-up changes', 'The grade does it later'], answer: 1, why: 'The wall is made of millions of small lamps, so whatever it shows also lights the set.' },
    { q: 'An actor wears a chrome helmet in front of a green screen. What do you see in the helmet?', options: ['The finished world', 'A big green reflection that must be fixed later', 'Nothing', 'The camera operator only'], answer: 1, why: 'Chrome reflects its surroundings, and the surroundings are green. With an LED wall it reflects the world instead.' },
    { q: 'Why do LED stages still use film lights?', options: ['LEDs are too bright', 'Walls cannot match the sun’s brightness, and there is no wall behind the camera', 'Film lights are cheaper to run', 'The law requires it'], answer: 1, why: 'A wall at 1,800 nits gives a few thousand lux at most, while the sun gives about 100,000. And the camera side is open.' },
  ],
  reel: [
    { ms: 5400, caption: 'The wall is also the light: change the place, and the actor and chrome change with it.', set: { stage: 'led', fill: false, look: 'noon' }, anim: { look: ['noon', 'sunset'] }, view: { pos: [4.6, 2.6, 4.2], target: [-0.1, 1.45, -1.6] }, spin: 0.25 },
    { ms: 4800, caption: 'A green screen throws green light and green reflections, fixed later by hand.', set: { look: 'city', fill: false }, anim: { stage: ['led', 'green'] }, view: { pos: [3.2, 2.2, 3.4], target: [-0.1, 1.5, -1.6] }, spin: 0 },
  ],

  build({ stage }) {
    const vp = new VP(stage, { env: 'canyon', hours: 17.3, lens: 50, lightAt: [0, 1.5, -1.5] });
    const actor = makeFigure({ helmet: true, suit: 0xb7ada0 }); actor.group.position.set(0, 0, -1.5); actor.group.rotation.y = TURN;
    const props = makeProps();
    stage.root.add(actor.group, props.group);
    vp.addSet(actor.group, actor.mats, 3); vp.addSet(props.group, props.mats, 3);
    stage.label('Chrome helmet reflects the wall', [0.25, 2.0, -1.4], stage.root, 'hot');
    stage.label('Steel drum', [1.6, 1.0, -2.6]);
    const meas = { face: 0, top: 0, back: 0, rgb: [1, 1, 1], t: -9 };
    const sw = makeBoard(1.3, 0.62, 520, (g, w, h) => {
      boardBg(g, w, h, 'Light on the face');
      const m = Math.max(...meas.rgb, 1e-6), c = meas.rgb.map((v) => Math.round(255 * Math.pow(v / m, 1 / 2.2)));
      g.fillStyle = `rgb(${c})`; g.beginPath(); g.roundRect(30, 88, 110, 110, 18); g.fill();
      g.fillStyle = '#eef0f6'; g.font = '600 44px sans-serif'; g.fillText(fmtLux(meas.face), 170, 100);
      g.font = '24px sans-serif'; g.fillStyle = '#a8aebf'; g.fillText('from the LEDs alone', 170, 160);
    });
    sw.mesh.position.set(1.6, 2.7, -3.2); sw.mesh.lookAt(4.6, 2.6, 4.2); stage.root.add(sw.mesh);
    let lastKey = '';
    return {
      update(dt, s, time) {
        dt = Math.max(0, dt);
        const look = LOOKS[s.look] || LOOKS.sunset;
        vp.setEnv(look.env); vp.world.setSun(look.hours, 0);
        vp.setStageLight(s.fill ? 0.35 : 0);
        const key = `${s.look}|${s.stage}`;
        const x = 0.9 + 0.15 * Math.sin(time * 0.3);
        vp.aim(new THREE.Vector3(x, 1.62, 1.4), new THREE.Vector3(-0.35, 1.55, -2.4));
        vp.update(dt, time, {
          lens: 50, mode: s.stage === 'green' ? 1 : 0, lightEvery: 0.05,
          hud: { tr: s.stage === 'green' ? 'GREEN SCREEN' : look.label.toUpperCase(), bl: '50 mm', br: s.fill ? '+ FILL LIGHT' : 'LED LIGHT ONLY' },
          onLight: () => {
            // Measure when the look changes, and once more after the wall has settled.
            if (key !== lastKey) { lastKey = key; meas.t = time; meas.again = true; } else if (!(meas.again && time - meas.t > 0.4)) return; else meas.again = false;
            const [f, t, b] = vp.measure([FACE, [0, 1, 0], [-FACE[0], 0, -FACE[2]]]);
            meas.face = f.E; meas.top = t.E; meas.back = b.E; meas.rgb = f.E > 1 ? f.rgb : b.rgb;
            sw.redraw();
          },
        });
      },
      readout: (s) => {
        const look = LOOKS[s.look] || LOOKS.sunset, [r, g, b] = meas.rgb, sum = r + g + b || 1;
        return `<div class="big">${s.stage === 'green' ? 'Green screen' : look.label}</div>
          <div class="row"><span>Light on the face (from the wall)</span><b>${fmtLux(meas.face)}</b></div>
          <div class="row"><span>On the back and shoulders</span><b>${fmtLux(meas.back)}</b></div>
          <div class="row"><span>On top, from the ceiling</span><b>${fmtLux(meas.top)}</b></div>
          <div class="row"><span>Green share of that light</span><b class="${g / sum > 0.6 ? 'no' : ''}">${Math.round((100 * g) / sum)}%</b></div>
          <div class="row"><span>Direct sun, for comparison</span><b>${fmtLux(SUN_LUX)}</b></div>`;
      },
      dispose() { vp.dispose(); },
    };
  },
};
