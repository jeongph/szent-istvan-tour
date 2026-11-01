// 교차부 기둥의 에디큘라(조각상 벽감), 설교단, 촛대 조명, 성소 난간, 신자석
import * as THREE from 'three';
import { Kit, boxGeo, cylGeo, frame } from './geom.js';
import { statue } from './props.js';
import { capitalGeo } from './arch2.js';
import { HW, RR, PB, Q, SANCT_Z, GALLERY_Z, addRect, addCircle } from './plan.js';

const PI = Math.PI;

function aedicula(kit, M, d, seed, group, mk) {
  // d: 대각선 면 {x, z, ry, w}
  const F = frame(kit, d.x, d.z, d.ry);
  const w = 3.4;
  F.box(M.whiteMarble, w + 0.4, 2.6, 1.3, 0, 1.3, 0.65);
  F.box(M.stone, w + 0.6, 0.25, 1.45, 0, 2.72, 0.7);
  F.box(M.greenMarble, w - 1.2, 4.4, 0.25, 0, 2.85 + 2.2, 0.15);
  for (const sd of [-1, 1]) {
    F.add(M.greenMarble, cylGeo(0.2, 0.22, 4.0, 18, 2), sd * (w / 2 - 0.25), 2.85 + 2.0, 0.9);
    F.add(M.capital, capitalGeo(0.42, 0.42), sd * (w / 2 - 0.25), 2.85 + 4.0 - 0.0, 0.7);
  }
  F.box(M.stone, w + 0.4, 0.45, 1.2, 0, 7.5, 0.7);
  F.box(M.goldOrn, w + 0.4, 0.3, 1.22, 0, 7.15, 0.7, 1.2);
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2 - 0.3, 0);
  tri.lineTo(w / 2 + 0.3, 0);
  tri.lineTo(0, 1.25);
  tri.closePath();
  F.add(M.whiteMarble, new THREE.ExtrudeGeometry(tri, { depth: 1.0, bevelEnabled: false }), 0, 7.72, 0.15);
  // 벽감 반원 머리
  F.add(M.goldDS, new THREE.CircleGeometry(1.05, 24, 0, PI), 0, 2.85 + 3.4, 0.3);
  const [sx, sz] = F.w(0, 0.75);
  if (mk) {
    const g = mk({ height: 2.5, attribute: ['book', 'staff', 'cross', 'lily'][seed % 4], halo: true, seed });
    g.position.set(sx, 2.85, sz);
    g.rotation.y = d.ry;
    group.add(g);
    for (const sd of [-1, 1]) {
      const [ax, az] = F.w(sd * 1.2, 0.6);
      const a = mk({ height: 1.0, attribute: 'none', halo: false, seed: seed * 7 + sd });
      a.position.set(ax, 7.9, az);
      a.rotation.y = d.ry - sd * 0.35;
      group.add(a);
    }
  } else {
    statue(kit, M, sx, 2.85, sz, d.ry, { h: 2.5, halo: true, hold: ['book', 'cross', 'none'][seed % 3], seed });
    for (const sd of [-1, 1]) {
      const [ax, az] = F.w(sd * 1.2, 0.6);
      statue(kit, M, ax, 7.9, az, d.ry - sd * 0.35, { h: 1.0, hold: 'none', seed: seed + sd });
    }
  }
  const a = F.w(-w / 2 - 0.3, 0), b = F.w(w / 2 + 0.3, 1.5);
  addRect(a[0], a[1], b[0], b[1]);
}

function pulpit(kit, M, d) {
  const F = frame(kit, d.x, d.z, d.ry);
  F.add(M.whiteMarble, cylGeo(0.5, 0.42, 3.2, 20, 2), 0, 1.6, 1.4);
  F.add(M.whiteMarble, new THREE.CylinderGeometry(1.25, 0.55, 0.9, 8), 0, 3.6, 1.4);
  F.add(M.goldOrn, cylGeo(1.3, 1.3, 1.2, 8, 1.2), 0, 4.6, 1.4);
  F.add(M.whiteMarble, cylGeo(1.38, 1.38, 0.18, 8, 2), 0, 5.28, 1.4);
  F.box(M.wood, 1.8, 4.0, 0.2, 0, 6.6, 0.25);
  F.add(M.goldOrn, cylGeo(1.6, 1.6, 0.45, 8, 1.2), 0, 8.85, 1.25);
  F.add(M.gold, new THREE.ConeGeometry(1.5, 1.6, 8), 0, 9.9, 1.25);
  F.add(M.gold, new THREE.SphereGeometry(0.22, 12, 8), 0, 10.8, 1.25);
  // 계단
  for (let i = 0; i < 8; i++) F.box(M.whiteMarble, 0.9, 0.2, 0.32, 1.9 - i * 0.05, 0.1 + i * 0.4, 0.9 + i * 0.12);
  const a = F.w(-1.6, 0), b = F.w(2.4, 2.9);
  addRect(a[0], a[1], b[0], b[1]);
}

function candelabrum(kit, M, bulbs, F, lx, y) {
  F.box(M.gold, 0.3, 1.2, 0.2, lx, y - 0.3, 0.1);
  F.add(M.gold, cylGeo(0.06, 0.06, 0.9, 8, 1), lx, y, 0.5, 0, PI / 2);
  F.add(M.gold, new THREE.TorusGeometry(0.75, 0.05, 6, 24).rotateX(PI / 2), lx, y + 0.1, 0.95);
  F.add(M.gold, cylGeo(0.12, 0.05, 0.9, 10, 1), lx, y - 0.4, 0.95);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    const [bx, bz] = F.w(lx + Math.cos(a) * 0.75, 0.95 + Math.sin(a) * 0.75);
    kit.add(M.gold, cylGeo(0.025, 0.025, 0.35, 6, 1), bx, y + 0.27, bz);
    bulbs.push(new THREE.Vector3(bx, y + 0.5, bz));
  }
  const [cx, cz] = F.w(lx, 0.95);
  bulbs.push(new THREE.Vector3(cx, y + 0.75, cz));
}

export function buildProps(scene, M, A, { statue: mk = null } = {}) {
  const kit = new Kit();
  const group = new THREE.Group();
  scene.add(group);
  const bulbs = [];
  // 대각선 면: 북동(설교단), 나머지는 에디큘라
  (A.info.diagonal || []).forEach((d, i) => {
    if (d.x < 0 && d.z < 0) pulpit(kit, M, d);
    else aedicula(kit, M, d, i + 1, group, mk);
  });
  // 기둥의 팔 쪽 면마다 촛대
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const faces = [
        { x: sx * HW, z: sz * ((RR + PB) / 2), ry: sx > 0 ? -PI / 2 : PI / 2 },
        { x: sx * ((RR + PB) / 2), z: sz * HW, ry: sz > 0 ? PI : 0 },
      ];
      for (const f of faces) {
        const F = frame(kit, f.x, f.z, f.ry);
        candelabrum(kit, M, bulbs, F, 0, 6.2);
      }
    }
  }
  // 성소 난간
  const rz = SANCT_Z - 1.0;
  for (const sd of [-1, 1]) {
    const x0 = sd * 1.6, x1 = sd * (HW - 0.3), cx = (x0 + x1) / 2, L = Math.abs(x1 - x0);
    kit.box(M.whiteMarble, L, 0.18, 0.5, cx, 0.66 + 0.09, rz);
    for (let x = Math.min(x0, x1) + 0.2; x < Math.max(x0, x1); x += 0.32) kit.add(M.whiteMarble, cylGeo(0.07, 0.09, 0.62, 8, 1), x, 0.66 + 0.18 + 0.31, rz);
    kit.box(M.whiteMarble, L, 0.14, 0.42, cx, 0.66 + 0.87, rz);
    kit.box(M.gold, L, 0.04, 0.44, cx, 0.66 + 0.95, rz);
    addRect(Math.min(x0, x1), rz - 0.3, Math.max(x0, x1), rz + 0.3);
  }
  // 신자석 (서쪽 팔과 교차부 앞쪽)
  const L = 6.6;
  for (let i = 0; i < 10; i++) {
    const z = 12.8 + i * 1.05;
    if (z > GALLERY_Z - 1.4) break;
    for (const sd of [-1, 1]) {
      const cx = sd * (1.4 + L / 2);
      kit.box(M.wood, L, 0.07, 0.42, cx, 0.46, z, 0, 1.5);
      kit.box(M.wood, L, 0.55, 0.06, cx, 0.86, z + 0.27, 0, 1.5);
      kit.box(M.wood, L, 0.08, 0.2, cx, 0.2, z - 0.42, 0, 1.5);
      for (const e of [-1, 1]) {
        kit.box(M.wood, 0.1, 1.15, 0.8, cx + e * (L / 2), 0.58, z + 0.02, 0, 1.5);
        kit.add(M.wood, new THREE.SphereGeometry(0.09, 8, 6), cx + e * (L / 2), 1.2, z + 0.3);
      }
    }
  }
  const pewEnd = Math.min(12.8 + 9 * 1.05, GALLERY_Z - 1.4) + 0.5;
  addRect(1.1, 12.2, 1.4 + L + 0.2, pewEnd);
  addRect(-1.4 - L - 0.2, 12.2, -1.1, pewEnd);
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = sd * (12.4 + i * 1.05);
      for (const s2 of [-1, 1]) {
        const cz = s2 * (1.3 + 2.6);
        kit.box(M.wood, 0.42, 0.07, 5.2, x, 0.46, cz, 0, 1.5);
        kit.box(M.wood, 0.06, 0.55, 5.2, x + sd * 0.27, 0.86, cz, 0, 1.5);
        for (const e of [-1, 1]) kit.box(M.wood, 0.8, 1.15, 0.1, x, 0.58, cz + e * 2.6, 0, 1.5);
      }
    }
    addRect(sd > 0 ? 11.9 : -18.2, -6.6, sd > 0 ? 18.2 : -11.9, 6.6);
  }
  kit.build(group);
  // 전구
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 2.6) });
  const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
  bulbs.forEach((p, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  inst.userData.noAO = true;
  group.add(inst);
  return { group, bulbs };
}
