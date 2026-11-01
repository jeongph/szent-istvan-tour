import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setMaxAniso } from './textures.js';
import { makeMaterials2 } from './materials2.js';
import { buildArchitecture, buildDome } from './arch2.js';
import { buildProps } from './props2.js';
import { buildAltars } from './altars2.js';
import { setupLighting } from './lighting2.js';
import { placeRealModules, loadStatueMaker } from './realModules.js';
import { buildAtmosphere } from './atmosphere.js';
import { createTimeOfDay, budapestNowHours, formatHours, phaseLabel } from './timeofday.js';
import { TourControls } from './controls.js';
import { Minimap } from './minimap.js';
import { OrganAmbience } from './audio.js';
import { STOPS, ROMAN } from './stops.js';
import { walkable, floorY, lineOfSight, EYE, Q, HC, HW } from './plan.js';
import './style.css';

// GitHub Pages 같은 하위 경로 배포에서도 사진 텍스처를 찾도록 base 경로를 붙인다
const REAL = import.meta.env.BASE_URL + 'real/';

const $ = (s) => document.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const LIGHT = +(params.get('light') ?? 1);

/* ------------------------------ 렌더러 ------------------------------ */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor('#120c08');
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = +(params.get('exp') ?? 1.0);
setMaxAniso(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

const status = $('#status');
const step = async (label) => {
  status.textContent = label;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
};

let world, atmo, composer, gtao, bloom, controls, minimap, lights, tod;
const organ = new OrganAmbience();

async function init() {
  const M = await makeMaterials2(step);
  await step('성당을 세우는 중');
  world = buildArchitecture(scene, M);
  const dome = buildDome(scene, M.crossing, M.domeInfo?.geometry);
  const statue = await loadStatueMaker();
  world.props = buildProps(scene, M, world, { statue });
  buildAltars(scene, M, { statue });
  await step('제단과 오르간을 들이는 중');
  world.real = await placeRealModules(scene, world);
  const d = M.domeInfo?.geometry || {};
  const wy = Array.isArray(d.windowY) ? (d.windowY[0] + d.windowY[1]) / 2 : d.windowY;
  atmo = buildAtmosphere(scene, { windowY: wy ?? 46.8, windowR: d.drumR ?? 11, Q, HC, HW });
  atmo.group.traverse((o) => (o.userData.noAO = true));

  await step('빛을 들이는 중');
  lights = setupLighting(scene, renderer, world, { gain: LIGHT });
  tod = createTimeOfDay({ renderer, scene, lights, M, atmo });
  setupTime();
  setupComposer();

  controls = new TourControls(camera, canvas, { reducedMotion: reduced });
  controls.setView(STOPS[0].pos.clone().add(new THREE.Vector3(0, 0, 2.5)), STOPS[0].look);
  setupUI();
  renderer.compile(scene, camera);
  renderer.setAnimationLoop(frame);

  status.textContent = '준비됐어요';
  const enter = $('#enter');
  enter.disabled = false;
  enter.textContent = '성당 안으로 들어가기';
  enter.focus({ preventScroll: true });
  if (params.has('stop')) {
    enterTour();
    goStop(Math.max(0, Math.min(STOPS.length - 1, (+params.get('stop') || 1) - 1)), { instant: true });
  }
}

function addCoinLight(target) {
  if (!target) return null;
  const s = new THREE.SpotLight('#ffe6bf', 0, 0, 0.45, 0.6, 2);
  s.position.copy(target).add(new THREE.Vector3(1.6, 3.2, 0.8));
  s.target.position.copy(target);
  scene.add(s, s.target);
  return s;
}

/* ------------------------------ 후처리 ------------------------------ */
function setupComposer() {
  const w = window.innerWidth, h = window.innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pixelRatio, h * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  if (!params.has('noao')) {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    const orig = gtao._overrideVisibility.bind(gtao);
    gtao._overrideVisibility = function () {
      orig();
      scene.traverse((o) => {
        if ((o.userData.noAO || o.isSprite) && o.visible) {
          o.visible = false;
          this._visibilityCache.push(o);
        }
      });
    };
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

function setPixelRatio(pr) {
  pixelRatio = pr;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  onResize();
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer?.setSize(w, h);
  if (atmo) atmo.dustMat.uniforms.scale.value = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
window.addEventListener('resize', onResize);

/* ------------------------------ 투어 UI ------------------------------ */
let current = -1, autoOn = false, autoTimer = null, coinTimer = null, coinUntil = 0;
const markersEl = $('#markers');
const markers = [];
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hoverRing;

function setupUI() {
  STOPS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'marker';
    b.type = 'button';
    b.append(
      Object.assign(document.createElement('span'), { className: 'marker-num', textContent: ROMAN[i] }),
      Object.assign(document.createElement('span'), { className: 'marker-label', textContent: s.title }),
    );
    b.setAttribute('aria-label', `${i + 1}번째 장소, ${s.title}로 이동`);
    b.addEventListener('click', () => goStop(i));
    markersEl.appendChild(b);
    markers.push(b);
  });

  minimap = new Minimap($('#plan'), {
    onStop: (i) => goStop(i),
    onPoint: (x, z) => walkTo(x, z),
  });

  hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.4, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7), transparent: true, opacity: 0.85, depthWrite: false }),
  );
  hoverRing.visible = false;
  hoverRing.userData.noAO = true;
  scene.add(hoverRing);

  controls.onClick = (x, y) => {
    const hit = pickFloor(x, y);
    if (hit && walkable(hit.x, hit.z)) walkTo(hit.x, hit.z);
  };
  controls.onHover = (x, y) => {
    const hit = pickFloor(x, y);
    if (hit && walkable(hit.x, hit.z)) {
      hoverRing.position.set(hit.x, floorY(hit.x, hit.z) + 0.03, hit.z);
      hoverRing.visible = true;
      canvas.classList.add('can-walk');
    } else {
      hoverRing.visible = false;
      canvas.classList.remove('can-walk');
    }
  };
  controls.onUserMove = (kind) => {
    if (kind === 'move' && autoOn) setAuto(false);
    hideHint();
  };

  $('#enter').addEventListener('click', () => {
    enterTour();
    goStop(0);
  });
  $('#pl-prev').addEventListener('click', () => goStop((current - 1 + STOPS.length) % STOPS.length));
  $('#pl-next').addEventListener('click', () => goStop((current + 1) % STOPS.length));
  $('#pl-auto').addEventListener('click', () => setAuto(!autoOn));
  $('#pl-fold').addEventListener('click', () => {
    const p = $('#placard');
    const folded = p.classList.toggle('folded');
    $('#pl-fold').setAttribute('aria-expanded', String(!folded));
    $('#pl-fold').textContent = folded ? '설명 펼치기' : '설명 접기';
  });
  $('#pl-coin').addEventListener('click', lightReliquary);
  $('#btn-sound').addEventListener('click', () => {
    const on = !organ.on;
    on ? organ.start() : organ.stop();
    $('#btn-sound').setAttribute('aria-pressed', String(on));
  });
  $('#btn-help').addEventListener('click', () => {
    const h = $('#hint');
    h.hidden ? showHint() : hideHint();
  });
  $('#btn-credits').addEventListener('click', openCredits);
  $('#btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  window.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('touring') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') goStop((current + 1) % STOPS.length);
    else if (e.key === 'p' || e.key === 'P') goStop((current - 1 + STOPS.length) % STOPS.length);
    else if (/^[1-8]$/.test(e.key)) goStop(+e.key - 1);
    else if (e.key === 'Escape') hideHint();
  });
}

/* ------------------------------ 시간대 ------------------------------ */
function setupTime() {
  const input = $('#time'), label = $('#time-label'), phase = $('#time-phase');
  let pending = null;
  const show = (h) => {
    const r = tod(h);
    label.textContent = formatHours(h);
    phase.textContent = phaseLabel(r.el);
    input.style.setProperty('--p', `${(h / 24) * 100}%`);
    input.setAttribute('aria-valuetext', `${formatHours(h)}, ${phaseLabel(r.el)}`);
  };
  const set = (h) => {
    input.value = String(h);
    show(h);
  };
  input.addEventListener('input', () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      show(+input.value);
    });
  });
  $('#time-now').addEventListener('click', () => set(Math.round(budapestNowHours() * 4) / 4));
  set(params.has('t') ? +params.get('t') : Math.round(budapestNowHours() * 4) / 4);
}

let creditsLoaded = false;
async function openCredits() {
  const dlg = $('#credits');
  if (!creditsLoaded) {
    creditsLoaded = true;
    const seen = new Map();
    for (const n of ['dome-mapper', 'artworks', 'materials', 'altar-modeler', 'reliquary-organ']) {
      try {
        const r = await fetch(`${REAL}credits/${n}.json`);
        if (!r.ok) continue;
        for (const c of await r.json()) {
          const key = c.url || c.title;
          if (!seen.has(key)) seen.set(key, { ...c, uses: new Set() });
          if (c.usedFor) seen.get(key).uses.add(c.usedFor);
        }
      } catch {}
    }
    const list = $('#credits-list');
    for (const c of [...seen.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)))) {
      const li = document.createElement('li');
      const a = Object.assign(document.createElement('a'), { href: c.url, target: '_blank', rel: 'noopener', textContent: String(c.title).replace(/^File:/, '') });
      const who = Object.assign(document.createElement('span'), { className: 'who', textContent: ` ${c.author || '작자 미상'}, ${c.license}` });
      li.append(a, who);
      list.append(li);
    }
  }
  dlg.showModal();
}

function enterTour() {
  if (document.body.classList.contains('touring')) return;
  document.body.classList.add('touring');
  $('#intro').setAttribute('aria-hidden', 'true');
  controls.enabled = true;
  showHint();
}

let hintTimer;
function showHint() {
  const h = $('#hint');
  h.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 12000);
}
function hideHint() {
  $('#hint').hidden = true;
}

function pickFloor(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(world.floors, false)[0];
  return hit ? hit.point : null;
}

function walkTo(x, z) {
  controls.flyTo(new THREE.Vector3(x, floorY(x, z) + EYE, z), null);
}

function goStop(i, { instant = false } = {}) {
  clearTimeout(autoTimer);
  current = i;
  minimap.active = i;
  renderPlacard(i);
  const s = STOPS[i];
  if (instant) {
    controls.setView(s.pos, s.look);
    controls.fovTarget = controls.fov = s.fov ?? 70;
    scheduleAuto();
  } else {
    controls.flyTo(s.pos, s.look, { fov: s.fov ?? 70, onDone: scheduleAuto });
  }
}

function renderPlacard(i) {
  const s = STOPS[i];
  const p = $('#placard');
  p.hidden = false;
  $('#pl-num').textContent = ROMAN[i];
  $('#pl-title').textContent = s.title;
  $('#pl-hu').textContent = s.hu;
  $('#pl-body').replaceChildren(...s.body.map((t) => Object.assign(document.createElement('p'), { textContent: t })));
  $('#pl-facts').replaceChildren(
    ...s.facts.flatMap(([k, v]) => [
      Object.assign(document.createElement('dt'), { textContent: k }),
      Object.assign(document.createElement('dd'), { textContent: v }),
    ]),
  );
  $('#pl-count').textContent = `${i + 1} / ${STOPS.length}`;
  $('#pl-coin').hidden = s.action !== 'coin';
  p.classList.remove('swap');
  void p.offsetWidth;
  p.classList.add('swap');
}

function setAuto(on) {
  autoOn = on;
  $('#pl-auto').setAttribute('aria-pressed', String(on));
  $('#pl-auto').textContent = on ? '자동 안내 멈추기' : '자동 안내 시작';
  clearTimeout(autoTimer);
  if (on) {
    if (current < 0) goStop(0);
    else if (!controls.flight) scheduleAuto(2500);
  }
}

function scheduleAuto(delay) {
  clearTimeout(autoTimer);
  if (!autoOn) return;
  const s = STOPS[current];
  const chars = s.body.join('').length;
  const wait = delay ?? Math.min(22000, 7000 + chars * 45);
  autoTimer = setTimeout(() => {
    if (!autoOn) return;
    if (current >= STOPS.length - 1) return setAuto(false);
    goStop(current + 1);
  }, wait);
}

function lightReliquary() {
  coinUntil = performance.now() + 15000;
  const b = $('#pl-coin');
  b.disabled = true;
  clearInterval(coinTimer);
  const tick = () => {
    const left = Math.ceil((coinUntil - performance.now()) / 1000);
    if (left <= 0) {
      clearInterval(coinTimer);
      b.disabled = false;
      b.textContent = '동전 넣고 조명 켜기';
    } else b.textContent = `조명이 켜져 있어요 (${left}초)`;
  };
  tick();
  coinTimer = setInterval(tick, 500);
}

/* ------------------------------- 루프 ------------------------------- */
const timer = new THREE.Timer();
const tmp = new THREE.Vector3();
let perfAcc = 0, perfN = 0, perfStage = 0;

function updateMarkers() {
  const w = window.innerWidth, h = window.innerHeight;
  const placed = [];
  const order = STOPS.map((s, i) => [i, camera.position.distanceTo(s.marker)]).sort((p, q) => p[1] - q[1]);
  order.forEach(([i]) => {
    const el = markers[i];
    const s = STOPS[i];
    tmp.copy(s.marker).project(camera);
    const d = camera.position.distanceTo(s.marker);
    const behind = tmp.z > 1 || tmp.z < -1;
    const atStop = i === current && camera.position.distanceTo(s.pos) < 2.5;
    const high = camera.position.y > 6;
    const visible = !behind && !atStop && !high && d < 70 && lineOfSight(camera.position.x, camera.position.z, s.marker.x, s.marker.z);
    if (!visible) {
      el.classList.add('off');
      return;
    }
    const sx = ((tmp.x + 1) / 2) * w, sy = ((1 - tmp.y) / 2) * h;
    if (placed.some(([px, py]) => Math.hypot(px - sx, py - sy) < 40)) {
      el.classList.add('off');
      return;
    }
    placed.push([sx, sy]);
    el.classList.remove('off');
    el.style.transform = `translate(${sx}px, ${sy}px)`;
    el.style.opacity = String(THREE.MathUtils.clamp(1.25 - d / 55, 0.35, 1));
  });
}

function frame(time) {
  timer.update(time);
  const dt = Math.min(0.05, timer.getDelta());
  const t = timer.getElapsed();
  controls.update(dt);
  atmo.update(t);
  for (const f of world.flames || []) {
    const b = f.userData.base;
    const k = 0.9 + 0.1 * Math.sin(t * 9 + b) + 0.05 * Math.sin(t * 23 + b * 2);
    f.scale.set(0.15 * (0.95 + 0.05 * Math.sin(t * 13 + b)), 0.26 * k, 1);
  }
  if (lights.coin) {
    const target = performance.now() < coinUntil ? 30 * LIGHT : 0;
    lights.coin.intensity += (target - lights.coin.intensity) * (1 - Math.exp(-dt * (target ? 4 : 1.5)));
  }
  if (atmo.dustMat.uniforms.scale.value === 300) onResize();
  updateMarkers();
  minimap.draw(camera.position, controls.yaw, camera.fov);
  composer.render(dt);

  // 느린 기기에서는 AO를 끄고 해상도를 낮춘다
  perfAcc += dt;
  perfN++;
  if (perfN === 90) {
    const avg = perfAcc / perfN;
    if (avg > 0.034 && perfStage === 0 && gtao) {
      gtao.enabled = false;
      perfStage = 1;
    } else if (avg > 0.034 && perfStage <= 1 && pixelRatio > 1) {
      setPixelRatio(1);
      perfStage = 2;
    }
    perfAcc = 0;
    perfN = 0;
  }
}

window.__tour = { goStop, get controls() { return controls; }, scene, camera, renderer };

init().catch((err) => {
  console.error(err);
  status.textContent = '장면을 불러오지 못했어요. WebGL을 켠 최신 브라우저에서 다시 열어 주세요.';
});
