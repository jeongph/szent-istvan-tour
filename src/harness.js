// 단독 모듈 미리보기: /harness.html?m=<src/real 아래 모듈 이름>&az=30&el=10&dist=1.4
// 모듈은 export default async function build(THREE) { return group } 형태.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = +(q.get('exp') ?? 1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2622');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = +(q.get('env') ?? 0.6);
scene.add(new THREE.HemisphereLight('#fff1dc', '#3a2c20', 0.6));
const key = new THREE.DirectionalLight('#ffe2b8', 2.2);
key.position.set(3, 6, 5);
scene.add(key);
const camera = new THREE.PerspectiveCamera(+(q.get('fov') ?? 40), innerWidth / innerHeight, 0.01, 500);
const controls = new OrbitControls(camera, renderer.domElement);

const mod = await import(/* @vite-ignore */ `/src/real/${q.get('m')}.js`);
const group = await (mod.default || mod.build)(THREE, { base: '/real/' });
scene.add(group);
const box = new THREE.Box3().setFromObject(group);
const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
const r = size.length() * 0.5 * +(q.get('dist') ?? 1.5);
const az = THREE.MathUtils.degToRad(+(q.get('az') ?? 25)), el = THREE.MathUtils.degToRad(+(q.get('el') ?? 12));
camera.position.set(center.x + Math.sin(az) * Math.cos(el) * r * 2, center.y + Math.sin(el) * r * 2, center.z + Math.cos(az) * Math.cos(el) * r * 2);
controls.target.copy(center);
controls.update();
window.__info = { size: size.toArray().map((v) => +v.toFixed(3)), center: center.toArray().map((v) => +v.toFixed(3)) };
const grid = new THREE.GridHelper(Math.max(size.x, size.z) * 2, 20, '#6b5d4c', '#45392e');
grid.position.y = box.min.y;
scene.add(grid);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
setTimeout(() => (window.__ready = true), 800);
