// 사진 속 실내 빛: 따뜻한 인공 조명(기둥 촛대, 숨은 조명) + 창으로 드는 낮빛
import * as THREE from 'three';
import { HW, Q, HC, RR, HRING, PB, APSE_Z } from './plan.js';

export function setupLighting(scene, renderer, A, { gain = 1 } = {}) {
  const L = [];
  const hemi = new THREE.HemisphereLight('#fff1e0', '#3a2c20', 0.42 * gain);
  scene.add(hemi);
  const point = (x, y, z, i, color = '#ffdcb0') => {
    const l = new THREE.PointLight(color, i * gain, 0, 2);
    l.position.set(x, y, z);
    scene.add(l);
    L.push(l);
    return l;
  };
  // 팔마다 숨은 조명 (볼트와 기둥을 밝힘), 교차부, 후진, 예배당
  for (const [x, z] of [[0, 12.5], [14, 0], [-14, 0]]) point(x, 15, z, 150);
  point(0, 12, -9, 120);
  point(0, HRING - 3, 0, 260, '#fff2de');
  point(0, 13.5, APSE_Z + 6.5, 45, '#ffd49a');
  point(-17.25, 5.5, -29.5, 26, '#ffd8a4');
  // 창으로 드는 낮빛 (남서쪽에서 비스듬히)
  const sun = new THREE.DirectionalLight('#fff3e2', 0.6 * gain);
  sun.position.set(30, 40, 12);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  // 금박 반사를 위한 실내 환경맵
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hide = [];
  scene.traverse((o) => {
    if ((o.userData.noAO || o.isSprite || o.isPoints) && o.visible) {
      o.visible = false;
      hide.push(o);
    }
  });
  const opt = { position: new THREE.Vector3(0, 8, 8), size: 256 };
  const a = pmrem.fromScene(scene, 0.02, 0.1, 200, opt);
  scene.environment = a.texture;
  const b = pmrem.fromScene(scene, 0.02, 0.1, 200, opt);
  scene.environment = b.texture;
  a.dispose();
  scene.environmentIntensity = 0.55;
  hide.forEach((o) => (o.visible = true));
  pmrem.dispose();
  return { lights: L, hemi, sun };
}
