// 수랑 끝 제단 2곳과 모서리 칸 측면 제단 4곳 (사진에서 원근 보정한 제단화 사용)
import * as THREE from 'three';
import { Kit, cylGeo, frame } from './geom.js';
import { statue } from './props.js';
import { capitalGeo } from './arch2.js';
import { HW, Q, addRect } from './plan.js';

const PI = Math.PI;

function archTopGeo(w, h) {
  const r = w / 2, sh = new THREE.Shape();
  sh.moveTo(-r, 0);
  sh.lineTo(r, 0);
  sh.lineTo(r, h - r);
  sh.absarc(0, h - r, r, 0, PI, false);
  sh.lineTo(-r, 0);
  const g = new THREE.ShapeGeometry(sh, 32);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h);
  return g;
}

function painting(group, F, art, lx, bottom, lz = 0.12) {
  const geo = /arch/.test(art.shape || '') && !/triple/.test(art.shape || '') ? archTopGeo(art.widthM, art.heightM) : new THREE.PlaneGeometry(art.widthM, art.heightM).translate(0, art.heightM / 2, 0);
  const m = new THREE.Mesh(geo, art.mat);
  const [x, z] = F.w(lx, lz);
  m.position.set(x, bottom, z);
  m.rotation.y = F.ry;
  group.add(m);
}

// 큰 제단 (수랑 끝벽)
function bigAltar(kit, M, group, F, art, saints, mk) {
  const pw = art ? art.widthM : 2.0, ph = art ? art.heightM : 3.2, pb = 3.2;
  // 받침, 제대
  F.box(M.whiteMarble, 6.4, 1.1, 1.6, 0, 0.55, 0.8);
  F.box(M.whiteMarble, 3.4, 1.0, 1.1, 0, 0.5, 2.1);
  F.box(M.whiteMarble, 3.7, 0.1, 1.3, 0, 1.05, 2.1);
  F.box(M.goldOrn, 2.9, 0.62, 0.04, 0, 0.52, 2.66, 1.1);
  for (let i = 0; i < 3; i++) F.box(M.whiteMarble, 4.4 - i * 0.3, 0.18, 0.4, 0, 0.09 + i * 0.18, 3.0 - i * 0.3);
  // 레타블: 기둥 2쌍, 엔타블러처, 박공
  F.box(M.greenMarble, pw + 1.6, ph + 1.0, 0.25, 0, pb + (ph + 1.0) / 2 - 0.4, 0.12);
  for (const sd of [-1, 1]) {
    for (const k of [0, 1]) {
      const cx = sd * (pw / 2 + 0.75 + k * 0.75);
      F.box(M.whiteMarble, 0.62, 1.0, 0.7, cx, 1.6, 0.7);
      F.add(M.redMarble, cylGeo(0.24, 0.27, 4.4, 20, 2), cx, 2.1 + 2.2, 0.7);
      F.add(M.capital, capitalGeo(0.5, 0.5), cx, 2.1 + 4.4, 0.45);
    }
  }
  const top = 2.1 + 4.4 + 1.4;
  F.box(M.stone, pw + 4.2, 0.55, 1.2, 0, top + 0.27, 0.6);
  F.box(M.goldOrn, pw + 4.2, 0.28, 1.22, 0, top - 0.08, 0.6, 1.2);
  const tri = new THREE.Shape();
  tri.moveTo(-(pw + 4.4) / 2, 0);
  tri.lineTo((pw + 4.4) / 2, 0);
  tri.lineTo(0, 1.35);
  tri.closePath();
  F.add(M.whiteMarble, new THREE.ExtrudeGeometry(tri, { depth: 1.1, bevelEnabled: false }), 0, top + 0.55, 0.05);
  F.add(M.goldDS, new THREE.CircleGeometry(0.55, 24), 0, top + 1.1, 1.17);
  // 그림 틀
  F.box(M.gold, pw + 0.36, 0.18, 0.14, 0, pb - 0.09, 0.3);
  for (const sd of [-1, 1]) F.box(M.gold, 0.18, ph - pw / 2, 0.14, sd * (pw / 2 + 0.09), pb + (ph - pw / 2) / 2, 0.3);
  F.add(M.gold, new THREE.TorusGeometry(pw / 2 + 0.09, 0.09, 6, 32, PI), 0, pb + ph - pw / 2, 0.3);
  if (art) painting(group, F, art, 0, pb, 0.27);
  // 양옆 성인상
  saints.forEach((s, i) => {
    const sd = i ? 1 : -1, sx = sd * 4.6;
    F.box(M.whiteMarble, 1.2, 1.9, 1.0, sx, 0.95, 0.9);
    F.box(M.stone, 1.4, 0.16, 1.15, sx, 1.98, 0.9);
    const [x, z] = F.w(sx, 0.9);
    if (mk) {
      const g = mk({ height: 2.4, attribute: s, halo: true, seed: 11 + i * 3 + (art ? art.id.length : 0) });
      g.position.set(x, 2.06, z);
      g.rotation.y = F.ry - sd * 0.18;
      group.add(g);
    } else statue(kit, M, x, 2.06, z, F.ry - sd * 0.18, { h: 2.4, halo: true, hold: s, seed: 5 + i });
  });
  const a = F.w(-5.4, 0), b = F.w(5.4, 3.3);
  addRect(a[0], a[1], b[0], b[1]);
}

// 작은 측면 제단 (모서리 칸 바깥벽)
function sideAltar(kit, M, group, F, art, opts = {}, mk = null) {
  const pw = art ? art.widthM : 1.8, ph = art ? art.heightM : 2.6, pb = art?.location?.bottomY ?? 2.2;
  F.box(M.whiteMarble, 3.4, 1.0, 1.0, 0, 0.5, 1.0);
  F.box(M.whiteMarble, 3.7, 0.1, 1.2, 0, 1.05, 1.0);
  F.box(M.goldOrn, 2.8, 0.6, 0.04, 0, 0.5, 1.51, 1.1);
  F.box(M.whiteMarble, 3.9, 0.18, 1.7, 0, 0.09, 1.2);
  F.box(M.stone, pw + 2.2, pb - 1.1, 0.5, 0, 1.1 + (pb - 1.1) / 2, 0.25);
  F.box(M.greenMarble, pw + 1.0, ph + 0.5, 0.2, 0, pb + ph / 2, 0.1);
  for (const sd of [-1, 1]) {
    const cx = sd * (pw / 2 + 0.55);
    F.add(opts.green ? M.greenMarble : M.redMarble, cylGeo(0.17, 0.19, ph + 0.2, 16, 2), cx, pb + (ph + 0.2) / 2, 0.4);
    F.add(M.capital, capitalGeo(0.36, 0.36), cx, pb + ph + 0.2 - 1.4 + 0.5, 0.22);
  }
  const top = pb + ph + 0.45;
  F.box(M.stone, pw + 1.8, 0.4, 0.8, 0, top + 0.2, 0.4);
  F.box(M.goldOrn, pw + 1.8, 0.2, 0.82, 0, top - 0.06, 0.4, 1.2);
  const tri = new THREE.Shape();
  tri.moveTo(-(pw + 1.9) / 2, 0);
  tri.lineTo((pw + 1.9) / 2, 0);
  tri.lineTo(0, 0.85);
  tri.closePath();
  F.add(M.whiteMarble, new THREE.ExtrudeGeometry(tri, { depth: 0.7, bevelEnabled: false }), 0, top + 0.4, 0.05);
  // 틀
  F.box(M.gold, pw + 0.24, 0.12, 0.1, 0, pb - 0.06, 0.25);
  F.box(M.gold, pw + 0.24, 0.12, 0.1, 0, pb + ph + 0.06, 0.25);
  for (const sd of [-1, 1]) F.box(M.gold, 0.12, ph, 0.1, sd * (pw / 2 + 0.06), pb + ph / 2, 0.25);
  if (art) painting(group, F, art, 0, pb, 0.215);
  else {
    const [x, z] = F.w(0, 0.6);
    F.add(M.goldDS, new THREE.CircleGeometry(0.8, 24, 0, PI), 0, pb + 2.3, 0.21);
    if (mk) {
      const g = mk({ height: 2.1, attribute: 'staff', halo: true, seed: 9 });
      g.position.set(x, pb - 0.05, z);
      g.rotation.y = F.ry;
      group.add(g);
    } else statue(kit, M, x, pb - 0.05, z, F.ry, { h: 2.1, halo: true, hold: 'cross', seed: 9 });
  }
  const a = F.w(-2.0, 0), b = F.w(2.0, 2.1);
  addRect(a[0], a[1], b[0], b[1]);
}

export function buildAltars(scene, M, { statue: mk = null } = {}) {
  const kit = new Kit();
  const group = new THREE.Group();
  scene.add(group);
  const A = M.art || {};
  // 남쪽 수랑: 벤추르 (성 임레, 성 머르기트), 북쪽: 스테트커 (아시시 성 프란치스코, 성 알로이시오)
  bigAltar(kit, M, group, frame(kit, Q, 0, -PI / 2), A['benczur-st-stephen-offers-crown'], ['book', 'lily'], mk);
  bigAltar(kit, M, group, frame(kit, -Q, 0, PI / 2), A['stetka-holy-cross'], ['cross', 'lily'], mk);
  const zc = (Q + HW) / 2;
  sideAltar(kit, M, group, frame(kit, -Q, -zc, PI / 2), A['feszty-st-joseph-triptych']);
  sideAltar(kit, M, group, frame(kit, Q, -zc, -PI / 2), A['vastagh-st-imre'], { green: true });
  sideAltar(kit, M, group, frame(kit, Q, zc, -PI / 2), A['nadler-st-cecilia']);
  sideAltar(kit, M, group, frame(kit, -Q, zc, PI / 2), null, {}, mk);
  kit.build(group);
  return group;
}
