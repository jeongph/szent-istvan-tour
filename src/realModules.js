// 에이전트가 사진을 보고 만든 모듈(주 제단, 오르간, 성유물함)을 실제 위치에 놓는다.
import * as THREE from 'three';
import { APSE_Z, APSE_R, Q, GALLERY_Z, RELIQUARY_POS, addRect, addCircle } from './plan.js';

// GitHub Pages 같은 하위 경로 배포에서도 사진 텍스처를 찾도록 base 경로를 붙인다
const REAL = import.meta.env.BASE_URL + 'real/';

const mods = import.meta.glob('./real/{altar,organ,reliquary}.js');

// 배치값: 에이전트 노트의 치수를 반영해 조정
export const PLACE = {
  altar: { pos: [0, 0.66, APSE_Z], ry: 0, scale: 1 }, // z는 모듈의 후진 중심 기준점으로 보정
  organ: { pos: [0, 0, GALLERY_Z], ry: Math.PI, scale: 1 },
  reliquary: { pos: RELIQUARY_POS, ry: -Math.PI / 2, scale: 1 },
};

async function load(name) {
  const key = `./real/${name}.js`;
  if (!mods[key]) return null;
  try {
    const m = await mods[key]();
    const g = await (m.default || m.build)(THREE, { base: `${REAL}` });
    return g || null;
  } catch (e) {
    console.warn(`[real] ${name} 모듈을 불러오지 못했어요`, e);
    return null;
  }
}

// 주 제단 모듈의 성인상 생성기 (없으면 null)
export async function loadStatueMaker() {
  const key = './real/altar.js';
  if (!mods[key]) return null;
  try {
    const m = await mods[key]();
    if (!m.makeSaintStatue) return null;
    return (opts) => m.makeSaintStatue(THREE, opts);
  } catch {
    return null;
  }
}

export async function placeRealModules(scene, world) {
  const out = {};
  for (const name of ['altar', 'organ', 'reliquary']) {
    const g = await load(name);
    if (!g) continue;
    const p = PLACE[name];
    g.position.set(...p.pos);
    if (name === 'altar' && g.userData?.anchors?.apseCenter) {
      const a = g.userData.anchors.apseCenter;
      g.position.z = APSE_Z - a[2];
      // 모듈의 후진 청동 부조를 이 모델의 후진 벽 반지름에 맞게 바깥으로 민다
      const rel = g.getObjectByName('apseReliefs');
      if (rel && g.userData.apseRadius) {
        const k = (APSE_R - 0.02) / g.userData.apseRadius;
        let zParent = a[2];
        for (let o = rel.parent; o && o !== g; o = o.parent) zParent -= o.position.z;
        rel.scale.set(k, 1, k);
        rel.position.z = zParent * (1 - k);
      }
    }
    g.rotation.y = p.ry;
    g.scale.setScalar(p.scale);
    scene.add(g);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    out[name] = g;
    out[name + 'Box'] = box;
    if (name === 'altar') addRect(box.min.x, box.min.z, box.max.x, box.max.z);
    if (name === 'organ') for (const x of [-5.5, -1.9, 1.9, 5.5]) addCircle(x, GALLERY_Z, 0.6);
    if (name === 'reliquary') {
      // 진열장 안 조명은 장면 조명과 겹쳐 번지므로 약하게
      g.traverse((o) => o.isLight && (o.intensity *= 0.25));
      addRect(box.min.x, box.min.z, box.max.x, box.max.z);
      out.reliquary = box.getCenter(new THREE.Vector3());
    }
  }
  return out;
}
