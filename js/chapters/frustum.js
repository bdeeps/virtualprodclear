// Chapter 2: camera tracking and the frustum. The patch of wall the camera sees is redrawn from the
// camera's exact position every frame, so the flat wall shows a deep world with true parallax.
import { THREE } from '../kit.js';
import { VP, makeFigure, makeProps, hitVolume, R, H, ASPECT, hfov, DEG } from '../vp.js';

const Z = 2.6, Y = 1.5;                 // the dolly track
const AIM = new THREE.Vector3(0, 1.35, -2.2);
const NEAR_ROCK = 15, MESA = 210;       // distances of a virtual boulder and the hero mesa, m

export default {
  id: 'frustum',
  short: 'Tracking and the frustum',
  title: 'The wall redraws itself for one camera',
  subtitle: 'Only the patch the lens sees gets the true perspective.',
  view: { pos: [4.2, 8.2, 10.5], target: [0, 1.4, -1.6] },
  learn: `<p>A picture on a flat wall has one problem: move the camera and a real mountain far away should hardly move, while a rock close by should slide past. A printed backdrop can't do that. An LED wall can, because it is <b>redrawn for the camera</b> 24 or more times a second.</p>
    <p>The camera is <b>tracked</b>. Infrared cameras on the truss watch a crown of reflective balls on it (as in MocapClear), so the engine always knows exactly where the lens is and where it points. The engine then draws the world from that very spot, and paints the result onto the patch of wall the lens can see. This patch is the <b>inner frustum</b> (a frustum is the pyramid of space a camera sees). Every LED in it shows whatever lies <b>behind it along the line to the lens</b>, so through the camera the wall vanishes and a deep world with true <b>parallax</b> appears.</p>
    <p>The rest of the wall, the <b>outer frustum</b>, shows the world from one fixed point at lower quality. The camera never looks at it directly: its job is to light the set. The inner patch is drawn a bit bigger than the lens needs (<b>overscan</b>), so quick moves don't show its edge.</p>
    <p class="tip"><b>Try it:</b> let the camera dolly and watch the bright outline slide across the wall. Look at the camera picture: near boulders slide, far mesas stay. Then switch tracking off and the whole world slides like a painting.</p>`,
  terms: [
    { t: 'Camera tracking', d: 'Measuring the camera’s position and direction many times a second, usually with infrared cameras and markers.' },
    { t: 'Frustum', d: 'The pyramid-shaped piece of space a camera can see, from the lens out to the far distance.' },
    { t: 'Inner frustum', d: 'The patch of LED wall inside the camera’s view, drawn in full quality from the camera’s exact position.' },
    { t: 'Outer frustum', d: 'The rest of the wall, drawn from a fixed point at lower quality, used mainly for light and reflections.' },
    { t: 'Parallax', d: 'Near things shift more than far things when you move. It is how we sense depth.' },
    { t: 'Overscan', d: 'Drawing the inner frustum larger than the lens needs, as a safety margin for movement.' },
  ],
  defaults: { move: true, cam: 0, tracking: true, overscan: 0.3, border: true, zones: false, lens: 35 },
  controls: [
    { key: 'move', type: 'toggle', label: 'Dolly the camera left and right' },
    { key: 'cam', type: 'range', label: 'Camera position on the track', min: -2.4, max: 2.4, step: 0.01, ends: ['left', 'right'], fmt: (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' m', hint: 'Turn off the dolly to drag it yourself.' },
    { key: 'tracking', type: 'toggle', label: 'Camera tracking on' },
    { key: 'overscan', type: 'range', label: 'Overscan', min: 0, max: 0.6, step: 0.01, ends: ['none', '60%'], fmt: (v) => '+' + Math.round(v * 100) + '%' },
    { key: 'lens', type: 'seg', label: 'Lens', options: [{ v: 24, label: '24 mm' }, { v: 35, label: '35 mm' }, { v: 50, label: '50 mm' }], fmt: (v) => Math.round(hfov(v) / DEG) + '° wide' },
    { key: 'border', type: 'toggle', label: 'Outline the inner frustum' },
    { key: 'zones', type: 'toggle', label: 'Tint the outer frustum blue' },
  ],
  onChange(s, key) { if (key === 'cam') s.move = false; },
  quiz: [
    { q: 'Why must the camera be tracked?', options: ['To stop it being stolen', 'So the engine can draw the world from the camera’s exact position', 'To keep the batteries charged', 'So the focus is always sharp'], answer: 1, why: 'The inner frustum is drawn from wherever the lens is. Without that position, the perspective would be wrong.' },
    { q: 'The camera slides 1 m sideways. What should a mountain 200 m away do in the picture?', options: ['Slide a lot', 'Hardly move at all', 'Grow bigger', 'Disappear'], answer: 1, why: 'Far things shift very little when you move (parallax). The tracked wall reproduces this; a painted backdrop can’t.' },
    { q: 'What is the outer frustum mainly for?', options: ['The final picture', 'Lighting and reflections on the set', 'Showing the actors their lines', 'Hiding the tracking cameras'], answer: 1, why: 'The camera doesn’t look at it directly. It shines the world’s light and colours onto the actors and props.' },
  ],
  reel: [
    { ms: 5400, caption: 'The camera is tracked, and the patch of wall it sees is redrawn from its exact spot.', set: { tracking: true, border: true, zones: true, overscan: 0.3, move: true, lens: 35 }, anim: {}, view: { pos: [4.2, 8.2, 10.5], target: [0, 1.4, -1.6] }, spin: 0 },
    { ms: 5200, caption: 'Switch tracking off and the far mountains slide with the wall, like a painted backdrop.', set: { border: true, zones: false, move: true }, anim: { tracking: [true, false] }, view: { pos: [2.6, 3.2, 7.8], target: [0, 1.6, -2.5] }, spin: 0 },
  ],

  build({ stage }) {
    const vp = new VP(stage, { env: 'canyon', hours: 9.5 });
    const actor = makeFigure({ helmet: true }); actor.group.position.set(0, 0, -2.2);
    const props = makeProps();
    stage.root.add(actor.group, props.group);
    vp.addSet(actor.group, actor.mats); vp.addSet(props.group, props.mats);
    // The dolly track.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a3f49, metalness: 0.6, roughness: 0.4 }));
    rail.position.set(0, 0.02, Z); stage.root.add(rail);
    // Tracking rays: from each infrared camera to the crown.
    const rayG = new THREE.BufferGeometry(); rayG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vp.vol.trackers.length * 6), 3));
    const rays = new THREE.LineSegments(rayG, new THREE.LineBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0.45, toneMapped: false })); rays.frustumCulled = false;
    stage.root.add(rays);
    const L = (t, p, cls) => stage.label(t, p, stage.root, cls);
    const lIn = L('Inner frustum: drawn for this camera', [0, 3.9, -6], 'hot');
    L('Outer frustum: lighting only', [-4.6, 0.9, -3.8]);
    L('Tracking cameras', [4.4, H + 0.7, -3.4]);
    L('Dolly track', [2.8, 0.25, Z + 0.4]);
    const info = { x: 0, width: 0, off: 0 };
    const crown = new THREE.Vector3();
    return {
      update(dt, s, time) {
        dt = Math.max(0, dt);
        if (s.move) s.cam = 2.2 * Math.sin(time * 0.45);
        const pos = new THREE.Vector3(s.cam, Y, Z);
        vp.aim(pos, AIM);
        const lagDisp = vp.frozen ? vp.frozen.p.x : s.cam;
        info.x = s.cam; info.off = s.cam - lagDisp;
        vp.update(dt, time, {
          lens: s.lens, tracking: s.tracking, overscan: s.overscan, border: s.border, zones: s.zones, lines: true,
          hud: { tr: s.tracking ? 'TRACKING OK' : 'TRACKING LOST', bl: `${s.lens} mm`, br: `x ${s.cam >= 0 ? '+' : '−'}${Math.abs(s.cam).toFixed(2)} m`, warn: s.tracking ? '' : 'PERSPECTIVE FROZEN' },
        });
        // Width of the inner frustum where the view axis meets the wall.
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(vp.quat), d = hitVolume(pos, dir);
        info.width = 2 * d * Math.tan(hfov(s.lens) / 2) * (1 + s.overscan);
        const hitP = pos.clone().addScaledVector(dir, d); lIn.position.set(hitP.x, 3.95, hitP.z);
        vp.rig.crown.getWorldPosition(crown);
        const a = rayG.attributes.position;
        vp.vol.trackers.forEach((t, i) => { a.setXYZ(i * 2, t.position.x, t.position.y, t.position.z); a.setXYZ(i * 2 + 1, crown.x, crown.y, crown.z); });
        a.needsUpdate = true;
        rays.material.opacity = s.tracking ? 0.45 + 0.2 * Math.sin(time * 20) : 0.05;
      },
      readout: (s) => {
        const dx = Math.max(0.001, Math.abs(s.tracking ? info.x : info.off));
        const wall = 8.6, sh = (D) => (Math.atan(dx / D) / DEG).toFixed(dx / D < 0.02 ? 2 : 1) + '°';
        return `<div class="big">${s.tracking ? 'Perspective follows the lens' : '<span class="no">Perspective frozen</span>'}</div>
          <div class="row"><span>Inner frustum on the wall</span><b>${info.width.toFixed(1)} m wide</b></div>
          <div class="row"><span>${s.tracking ? 'Camera moved from centre' : 'Moved since tracking froze'}</span><b>${dx.toFixed(2)} m</b></div>
          <div class="row"><span>Real shift, boulder ${NEAR_ROCK + 3} m away</span><b>${sh(NEAR_ROCK + 3)}</b></div>
          <div class="row"><span>Real shift, mesa ${MESA} m away</span><b>${sh(MESA)}</b></div>
          <div class="row"><span>${s.tracking ? 'Shown on the tracked wall' : 'Frozen wall shifts everything'}</span><b class="${s.tracking ? 'ok' : 'no'}">${s.tracking ? 'the same' : sh(wall)}</b></div>`;
      },
      dispose() { vp.dispose(); },
    };
  },
};
