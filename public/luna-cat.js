import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

(() => {
  const game = document.querySelector('#game');
  const stage = document.querySelector('#luna-cat-stage');
  const hit = document.querySelector('#luna-cat-hit');
  if (!game || !stage || !hit) return;

  const MODEL_URL = 'https://raw.githubusercontent.com/datoskha-maker/kayuk-bet-miniapp/main/%D0%9B%D1%83%D0%BD%D0%B0%20%D0%93%D0%BE%D1%82%D0%BE%D0%B2%D0%B0%D1%8F.glb';
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2.7, 2.7, 2.7, -2.7, 0.1, 100);
  camera.position.set(0, 1.05, 8);
  camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x526070, 2.0));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(-3, 6, 5);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xb8dfff, 0.75);
  fillLight.position.set(4, 2, -3);
  scene.add(fillLight);

  const clock = new THREE.Clock();
  const loader = new GLTFLoader();
  let mixer = null;
  let activeAction = null;
  let clips = [];
  let idleTimer = null;
  let sequenceIndex = 0;
  let tapIndex = 0;
  let model = null;
  let disposed = false;

  const idleSequence = [
    ['Sit_Down_Cat', false, 1.8],
    ['Tail_Wag_Cat', true, 7],
    ['Lie_Down_Cat', false, 2.2],
    ['Curl_Up_Cat', false, 6],
    ['Stand_On_Hind_Legs_Cat', false, 2.4],
    ['Sit_Down_Cat', false, 2.2],
    ['Tail_Wag_Cat', true, 7]
  ];
  const tapSequence = [
    'Walk_Calm_Cat_v3',
    'Light_Run_Cat_v1',
    'Light_Run_Cat_v2',
    'Light_Run_Cat_v3_Head_Tail',
    'Stand_On_Hind_Legs_Cat'
  ];

  function findClip(name) {
    const wanted = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return clips.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted)
      || clips.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(wanted));
  }

  function play(name, loop, seconds) {
    if (!mixer) return;
    const clip = findClip(name);
    if (!clip) {
      console.warn('[Luna 3D] Animation not found:', name, clips.map(c => c.name));
      return;
    }
    const next = mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.clampWhenFinished = !loop;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    if (activeAction && activeAction !== next) next.crossFadeFrom(activeAction, 0.28, true);
    next.fadeIn(0.28).play();
    activeAction = next;
    if (seconds) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!disposed) runIdleSequence();
      }, seconds * 1000);
    }
  }

  function runIdleSequence() {
    clearTimeout(idleTimer);
    if (!clips.length || disposed) return;
    const step = idleSequence[sequenceIndex % idleSequence.length];
    sequenceIndex++;
    play(step[0], step[1], null);
    idleTimer = setTimeout(runIdleSequence, step[2] * 1000);
  }

  hit.addEventListener('click', () => {
    if (!mixer || !clips.length) return;
    const name = tapSequence[tapIndex % tapSequence.length];
    tapIndex++;
    play(name, true, name.includes('Run') ? 2.7 : 3.2);
  });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    const view = 2.7;
    camera.left = -view * aspect;
    camera.right = view * aspect;
    camera.top = view;
    camera.bottom = -view;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  loader.load(MODEL_URL, gltf => {
    if (disposed) return;
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.65 / Math.max(size.y, size.x * 0.8, size.z * 0.8);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    model.rotation.y = 0;
    scene.add(model);
    clips = gltf.animations || [];
    mixer = new THREE.AnimationMixer(model);
    if (!clips.length) {
      console.warn('[Luna 3D] GLB loaded without animation clips');
    } else {
      runIdleSequence();
    }
    hit.setAttribute('aria-label', 'Погладить Луну или попросить её подвигаться');
    hit.style.display = 'block';
    const loading = document.querySelector('#luna-cat-loading');
    if (loading) loading.remove();
  }, undefined, error => {
    console.error('[Luna 3D] Model loading failed', error);
    const loading = document.querySelector('#luna-cat-loading');
    if (loading) loading.textContent = 'Не удалось загрузить Луну';
  });

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(delta);
    renderer.render(scene, camera);
  }
  animate();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clock.stop();
    else clock.start();
  });
})();