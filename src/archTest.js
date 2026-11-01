// 건축만 렌더하는 비교용 페이지: /arch-test.html?pos=x,y,z&look=x,y,z&fov=60
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setMaxAniso } from './textures.js';
import { makeMaterials2 } from './materials2.js';
import { buildArchitecture, buildDome } from './arch2.js';
import { setupLighting } from './lighting2.js';
import { buildProps } from './props2.js';
import { buildAltars } from './altars2.js';
import { placeRealModules, loadStatueMaker } from './realModules.js';

const q = new URLSearchParams(location.search);
const v3 = (s, d) => new THREE.Vector3(...(s ? s.split(',').map(Number) : d));
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = +(q.get('exp') ?? 1);
setMaxAniso(renderer.capabilities.getMaxAnisotropy());
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0a08');
const camera = new THREE.PerspectiveCamera(+(q.get('fov') ?? 60), innerWidth / innerHeight, 0.1, 500);
camera.position.copy(v3(q.get('pos'), [0, 1.6, 20]));
camera.lookAt(v3(q.get('look'), [0, 8, -30]));
const M = await makeMaterials2(async () => {});
const A = buildArchitecture(scene, M);
buildDome(scene, M.crossing, M.domeInfo?.geometry);
const statue = await loadStatueMaker();
buildProps(scene, M, A, { statue });
buildAltars(scene, M, { statue });
await placeRealModules(scene, A);
setupLighting(scene, renderer, A, { quality: q.get('q') ?? 'high' });
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
if (!q.has('noao')) {
  const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 1.8, distanceExponent: 1.4, thickness: 1.6, scale: 1.0, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(ao);
}
composer.addPass(new OutputPass());
renderer.setAnimationLoop(() => composer.render());
setTimeout(() => (window.__ready = true), 1500);
