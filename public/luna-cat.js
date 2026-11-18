import * as THREE from 'https://esm.sh/three@0.170.0';
import { GLTFLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

(() => {
  const stage = document.querySelector('#luna-cat-stage');
  const loading = document.querySelector('#luna-cat-loading');
  if (!stage) return;

  const MODEL_URL = 'https://raw.githubusercontent.com/datoskha-maker/kayuk-bet-miniapp/main/%D0%9B%D1%83%D0%BD%D0%B0%20%D0%93%D0%BE%D1%82%D0%BE%D0%B2%D0%B0%D1%8F.glb';
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
  const character = new THREE.Group();
  scene.add(character);

  let mixer = null;
  let activeAction = null;
  let clips = [];
  let model = null;
  let currentMode = null;
  let direction = 1;
  let sceneVisible = document.querySelector('.nav-btn.active[data-scene]')?.dataset.scene === 'room';
  let minX = -0.5;
  let maxX = 0.5;
  let approachStartX = 0;
  let approachStartedAt = 0;
  let approachDuration = 3000;
  let disposed = false;

  function findClip(name) {
    const wanted = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return clips.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted)
      || clips.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(wanted));
  }

  function play(name, loop) {
    if (!mixer) return;
    const clip = findClip(name);
    if (!clip) {
      console.warn('[Luna 3D] Animation not found:', name, clips.map(c => c.name));
      return;
    }
    const next = mixer.clipAction(clip);
    if (activeAction === next && next.isRunning()) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.clampWhenFinished = !loop;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    if (activeAction && activeAction !== next) next.crossFadeFrom(activeAction, 0.3, true);
    next.fadeIn(0.3).play();
    activeAction = next;
  }

  function moscowTime() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      hour: Number(values.hour),
      minute: Number(values.minute),
      second: Number(values.second),
      milliseconds: now.getMilliseconds()
    };
  }

  function scheduledMode() {
    const t = moscowTime();
    if (t.hour === 0 && t.minute === 59 && t.second >= 57) return 'prepare';
    if (t.hour >= 1 && (t.hour < 11 || (t.hour === 11 && t.minute < 34))) return 'sleep';
    return 'awake';
  }

  function syncSchedule(force = false) {
    if (!mixer || !model) return;
    const nextMode = scheduledMode();
    if (nextMode === currentMode && (nextMode !== 'prepare' || !force)) return;

    currentMode = nextMode;
    if (nextMode === 'prepare') {
      const t = moscowTime();
      approachStartX = character.position.x;
      approachStartedAt = performance.now();
      approachDuration = Math.max(80, (60 - t.second) * 1000 - t.milliseconds);
      play('Walk_Calm_Cat_v3', true);
    } else if (nextMode === 'sleep') {
      character.position.x = 0;
      character.rotation.y = Math.PI / 2;
      play('Curl_Up_Cat', false);
    } else {
      direction = 1;
      character.rotation.y = Math.PI / 2;
      play('Walk_Calm_Cat_v3', true);
    }
  }

  function resize() {
    const width = Math.max(1, stage.clientWidth || window.innerWidth);
    const height = Math.max(1, stage.clientHeight || window.innerHeight);
    const aspect = width / height;
    const view = 2.7;
    camera.left = -view * aspect;
    camera.right = view * aspect;
    camera.top = view;
    camera.bottom = -view;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    const halfWidth = view * aspect;
    const halfCat = model ? Math.max(0.38, model.userData.width * 0.42) : 0.45;
    const travel = Math.max(0.12, halfWidth - halfCat - 0.12);
    minX = -travel;
    maxX = travel;
    character.position.y = -1.27;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('luna-scene-change', event => {
    sceneVisible = event.detail?.scene === 'room';
    stage.style.visibility = sceneVisible ? 'visible' : 'hidden';
    if (loading) loading.style.visibility = sceneVisible && !model ? 'visible' : 'hidden';
    if (sceneVisible) syncSchedule(true);
  });

  stage.style.visibility = sceneVisible ? 'visible' : 'hidden';
  if (loading) loading.style.visibility = sceneVisible ? 'visible' : 'hidden';
  resize();

  loader.load(MODEL_URL, gltf => {
    if (disposed) return;
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.15 / Math.max(size.y, size.x * 0.8, size.z * 0.8);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    model.userData.width = size.x * scale;
    character.add(model);
    character.position.set(-0.35, -1.27, 0);
    character.rotation.y = Math.PI / 2;
    clips = gltf.animations || [];
    mixer = new THREE.AnimationMixer(model);
    resize();
    syncSchedule(true);
    if (loading) loading.style.visibility = 'hidden';
    console.info('[Luna 3D] Loaded animations:', clips.map(c => c.name));
  }, undefined, error => {
    console.error('[Luna 3D] Model loading failed', error);
    if (loading) loading.textContent = 'Не удалось загрузить Луну';
  });

  let scheduleCheck = 0;
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(delta);

    if (model && currentMode === 'awake') {
      character.position.x += direction * delta * 0.42;
      if (character.position.x >= maxX) {
        character.position.x = maxX;
        direction = -1;
        character.rotation.y = -Math.PI / 2;
      } else if (character.position.x <= minX) {
        character.position.x = minX;
        direction = 1;
        character.rotation.y = Math.PI / 2;
      }
    } else if (model && currentMode === 'prepare') {
      const progress = Math.min(1, (performance.now() - approachStartedAt) / approachDuration);
      character.position.x = approachStartX * (1 - progress);
    }

    scheduleCheck += delta;
    if (scheduleCheck >= 0.15) {
      scheduleCheck = 0;
      syncSchedule();
    }
    renderer.render(scene, camera);
  }

  animate();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clock.stop();
    else {
      clock.start();
      syncSchedule(true);
    }
  });
})();
