// 조각상, 제단, 신자석, 오르간, 성유물함
import * as THREE from 'three';
import { boxGeo, cylGeo, frame } from './geom.js';
import { addRect, addCircle } from './plan.js';
const NAVE_END = 47;

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);

// 두 점 사이를 잇는 원기둥 (frame 로컬 좌표)
function rod(F, mat, a, b, r, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  _q.setFromUnitVectors(UP, d.normalize());
  _e.setFromQuaternion(_q, 'YXZ');
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  F.add(mat, new THREE.CylinderGeometry(r, r, len, seg), m.x, m.y, m.z, _e.y, _e.x, _e.z);
}

export function statue(kit, M, x, y, z, ry, { h = 1.8, crown = false, halo = false, hold = 'book', seed = 1 } = {}) {
  const s = h / 1.8, F = frame(kit, x, z, ry), V = (a, b, c) => new THREE.Vector3(a * s, y + b * s, c * s);
  const prof = [[0, 0], [0.36, 0], [0.37, 0.06], [0.34, 0.45], [0.29, 0.85], [0.25, 1.12], [0.27, 1.3], [0.25, 1.42], [0.13, 1.5], [0.06, 1.54], [0, 1.55]];
  const robe = new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(r * s, yy * s)), 32);
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const a = Math.atan2(px, pz), t = py / (1.3 * s);
    const f = 1 + (t < 1 ? 0.075 * Math.sin(a * 9 + seed) * (1 - t) : 0);
    p.setXYZ(i, px * f * 1.12, py, pz * f * 0.86);
  }
  robe.computeVertexNormals();
  F.add(M.statue, robe, 0, y, 0);
  F.add(M.statue, new THREE.CylinderGeometry(0.05 * s, 0.055 * s, 0.14 * s, 10), 0, y + 1.57 * s, 0);
  F.add(M.statue, new THREE.SphereGeometry(0.115 * s, 18, 14), 0, y + 1.7 * s, 0.01 * s);
  for (const sd of [-1, 1]) {
    const hand = V(0.14 * sd, 1.06, 0.26);
    rod(F, M.statue, V(0.25 * sd, 1.42, 0), V(0.22 * sd, 1.18, 0.12), 0.06 * s);
    rod(F, M.statue, V(0.22 * sd, 1.18, 0.12), hand, 0.05 * s);
    F.add(M.statue, new THREE.SphereGeometry(0.052 * s, 10, 8), hand.x, hand.y, hand.z);
  }
  if (crown) {
    F.add(M.gold, new THREE.CylinderGeometry(0.12 * s, 0.11 * s, 0.09 * s, 18, 1, true), 0, y + 1.81 * s, 0.01 * s);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      F.add(M.gold, new THREE.ConeGeometry(0.025 * s, 0.07 * s, 6), Math.sin(a) * 0.115 * s, y + 1.89 * s, Math.cos(a) * 0.115 * s + 0.01 * s);
    }
    F.add(M.gold, new THREE.SphereGeometry(0.09 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, y + 1.84 * s, 0.01 * s);
    F.add(M.gold, boxGeo(0.015 * s, 0.09 * s, 0.015 * s), 0.02 * s, y + 1.97 * s, 0.01 * s, 0, 0, -0.35);
  }
  if (halo) F.add(M.gold, new THREE.TorusGeometry(0.21 * s, 0.014 * s, 6, 32), 0, y + 1.74 * s, -0.1 * s);
  if (hold === 'doublecross') {
    const hx = 0.14 * s;
    F.add(M.gold, boxGeo(0.035 * s, 1.35 * s, 0.035 * s), hx, y + 1.25 * s, 0.27 * s);
    F.add(M.gold, boxGeo(0.3 * s, 0.035 * s, 0.035 * s), hx, y + 1.78 * s, 0.27 * s);
    F.add(M.gold, boxGeo(0.2 * s, 0.035 * s, 0.035 * s), hx, y + 1.86 * s, 0.27 * s);
    F.add(M.gold, new THREE.SphereGeometry(0.08 * s, 14, 10), -0.14 * s, y + 1.15 * s, 0.28 * s);
    F.add(M.gold, boxGeo(0.02 * s, 0.1 * s, 0.02 * s), -0.14 * s, y + 1.26 * s, 0.28 * s);
  } else if (hold === 'book') {
    F.add(M.gold, boxGeo(0.22 * s, 0.28 * s, 0.06 * s), 0, y + 1.12 * s, 0.27 * s, 0, -0.4);
  } else if (hold === 'cross') {
    F.add(M.gold, boxGeo(0.03 * s, 0.7 * s, 0.03 * s), 0.14 * s, y + 1.3 * s, 0.27 * s);
    F.add(M.gold, boxGeo(0.22 * s, 0.03 * s, 0.03 * s), 0.14 * s, y + 1.5 * s, 0.27 * s);
  }
}

export function candle(kit, M, flames, x, y, z, h = 0.5) {
  kit.add(M.gold, new THREE.CylinderGeometry(0.05, 0.12, 0.08, 12), x, y + 0.04, z);
  kit.add(M.gold, new THREE.CylinderGeometry(0.025, 0.04, h, 10), x, y + h / 2, z);
  kit.add(M.gold, new THREE.CylinderGeometry(0.07, 0.03, 0.05, 12), x, y + h, z);
  kit.add(M.candle, new THREE.CylinderGeometry(0.03, 0.03, 0.32, 10), x, y + h + 0.16, z);
  flames.push(new THREE.Vector3(x, y + h + 0.38, z));
}

export function makeFlames(group, M, flames) {
  const out = [];
  for (const p of flames) {
    const s = new THREE.Sprite(M.flame);
    s.position.copy(p);
    s.scale.set(0.16, 0.26, 1);
    s.userData.base = Math.random() * 10;
    group.add(s);
    out.push(s);
  }
  return out;
}

// 벽 부착 측면 제단 (로컬: +x 벽 방향, +z 실내 쪽)
export function sideAltar(kit, M, group, flames, F, lx, painting, sc = 1) {
  const S = (v) => v * sc;
  for (const sd of [-1, 1]) {
    const cx = lx + S(2.4) * sd;
    F.box(M.white, S(0.95), S(1.4), S(0.95), cx, S(0.7), S(0.75));
    F.add(M.green, cylGeo(S(0.27), S(0.3), S(5.8), 20, 2), cx, S(1.4 + 2.9), S(0.75));
    F.box(M.goldOrn, S(0.8), S(0.6), S(0.8), cx, S(7.5), S(0.75), 1.2);
  }
  F.box(M.white, S(5.9), S(0.4), S(1.05), lx, S(7.98), S(0.6));
  F.box(M.gold, S(6.3), S(0.45), S(1.25), lx, S(8.4), S(0.66));
  const tri = new THREE.Shape();
  tri.moveTo(-S(3.15), 0);
  tri.lineTo(S(3.15), 0);
  tri.lineTo(0, S(1.3));
  tri.closePath();
  F.add(M.gold, new THREE.ExtrudeGeometry(tri, { depth: S(0.7), bevelEnabled: false }), lx, S(8.62), S(0.05));
  F.box(M.green, S(5.0), S(6.7), 0.14, lx, S(1.4 + 3.35), 0.07);
  const pw = S(3.4), ph = S(5.0), py = S(4.6);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), painting);
  const [wx, wz] = F.w(lx, 0.16);
  mesh.position.set(wx, py, wz);
  mesh.rotation.y = F.ry;
  group.add(mesh);
  const ft = S(0.2);
  F.box(M.gold, pw + ft * 2, ft, 0.12, lx, py + ph / 2 + ft / 2, 0.18);
  F.box(M.gold, pw + ft * 2, ft, 0.12, lx, py - ph / 2 - ft / 2, 0.18);
  F.box(M.gold, ft, ph, 0.12, lx - pw / 2 - ft / 2, py, 0.18);
  F.box(M.gold, ft, ph, 0.12, lx + pw / 2 + ft / 2, py, 0.18);
  F.box(M.white, S(3.0), 1.0, S(1.1), lx, 0.5, S(1.55));
  F.box(M.white, S(3.3), 0.1, S(1.3), lx, 1.05, S(1.55));
  F.box(M.goldOrn, S(2.6), 0.6, 0.04, lx, 0.5, S(2.11), 1);
  for (const sd of [-1, 1]) {
    const [cx, cz] = F.w(lx + S(1.2) * sd, S(1.55));
    candle(kit, M, flames, cx, 1.1, cz, 0.45);
  }
  const a = F.w(lx - S(3.2), 0), b = F.w(lx + S(3.2), S(2.3));
  addRect(a[0], a[1], b[0], b[1]);
  return { pos: F.w(lx, S(1.0)), y: py };
}

// 조개 모양 벽감 + 조각상
export function niche(kit, M, F, lx, seed) {
  F.box(M.white, 1.2, 1.7, 0.9, lx, 0.85, 0.45);
  F.box(M.gold, 1.35, 0.12, 1.0, lx, 1.76, 0.5);
  const shell = new THREE.CircleGeometry(1.35, 24, 0, Math.PI);
  F.add(M.goldDS, shell, lx, 5.3, 0.03);
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI;
    F.box(M.gold, 0.06, 1.3, 0.06, lx + Math.cos(a) * 0.68, 5.3 + Math.sin(a) * 0.68, 0.06, 1);
  }
  F.box(M.green, 2.0, 4.6, 0.1, lx, 1.8 + 2.3, 0.05);
  const [x, z] = F.w(lx, 0.45);
  statue(kit, M, x, 1.82, z, F.ry, { h: 2.6, halo: true, hold: ['book', 'cross', 'none'][seed % 3], seed });
  const a = F.w(lx - 0.8, 0), b = F.w(lx + 0.8, 1.1);
  addRect(a[0], a[1], b[0], b[1]);
}

export function pews(kit, M) {
  const L = 7.0;
  for (let i = 0; i < 23; i++) {
    const z = 14.2 + i * 1.12;
    for (const sd of [-1, 1]) {
      const cx = sd * (1.5 + L / 2);
      kit.box(M.wood, L, 0.07, 0.44, cx, 0.46, z, 0, 1.5);
      kit.box(M.wood, L, 0.5, 0.06, cx, 0.86, z + 0.27, 0, 1.5);
      kit.box(M.wood, L, 0.1, 0.06, cx, 1.14, z + 0.28, 0, 1.5);
      kit.box(M.wood, L, 0.08, 0.2, cx, 0.2, z - 0.42, 0, 1.5);
      for (const e of [-1, 1]) kit.box(M.wood, 0.08, 1.05, 0.78, cx + e * (L / 2), 0.52, z + 0.02, 0, 1.5);
    }
  }
  addRect(1.1, 13.6, 8.8, 39.4);
  addRect(-8.8, 13.6, -1.1, 39.4);
}

export function organ(kit, M) {
  const gy = 8.3, zf = 42.4;
  kit.box(M.cream, 22, 0.7, NAVE_END - zf, 0, gy, (NAVE_END + zf) / 2, 0, 2);
  kit.box(M.goldOrn, 22, 0.55, 0.2, 0, gy - 0.05, zf - 0.08, 0, 2);
  kit.box(M.white, 22, 0.15, 0.4, 0, gy + 0.42, zf + 0.05);
  // 난간
  kit.box(M.gold, 21.6, 0.12, 0.22, 0, gy + 1.45, zf + 0.12);
  for (let x = -10.5; x <= 10.5; x += 0.42) kit.add(M.white, cylGeo(0.06, 0.08, 0.95, 8, 1), x, gy + 0.95, zf + 0.12);
  for (const x of [-8.2, -3.6, 3.6, 8.2]) {
    kit.box(M.white, 1.1, 0.7, 1.1, x, 0.35, zf + 0.5);
    kit.add(M.green, cylGeo(0.36, 0.4, gy - 1.6, 20, 2), x, 0.7 + (gy - 1.6) / 2, zf + 0.5);
    kit.box(M.goldOrn, 1.0, 0.6, 1.0, x, gy - 0.65, zf + 0.5, 0, 1.2);
    addCircle(x, zf + 0.5, 0.65);
  }
  // 케이스와 파이프 탑
  const zc = 45.6, base = gy + 0.35;
  kit.box(M.wood, 17, 1.8, 1.6, 0, base + 0.9, zc, 0, 1.5);
  kit.box(M.goldOrn, 17.2, 0.3, 1.7, 0, base + 1.85, zc, 0, 1.5);
  kit.box(M.wood, 16, 7.5, 0.5, 0, base + 5.5, zc + 0.9, 0, 1.5);
  const towers = [[-7.0, 6.4, 7], [-3.6, 7.6, 9], [0, 8.6, 11], [3.6, 7.6, 9], [7.0, 6.4, 7]];
  for (const [tx, th, n] of towers) {
    const w = n * 0.34;
    kit.box(M.goldOrn, w + 0.5, 0.35, 1.0, tx, base + 2.1, zc, 0, 1.2);
    kit.box(M.gold, w + 0.7, 0.4, 1.1, tx, base + 2.0 + th + 0.5, zc, 0, 1.2);
    kit.box(M.wood, 0.25, th + 0.7, 1.0, tx - w / 2 - 0.2, base + 2.0 + th / 2 + 0.3, zc);
    kit.box(M.wood, 0.25, th + 0.7, 1.0, tx + w / 2 + 0.2, base + 2.0 + th / 2 + 0.3, zc);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const ph = th * (0.68 + 0.32 * Math.cos(u * Math.PI));
      const r = 0.13 + 0.05 * Math.cos(u * Math.PI);
      const px = tx + u * w;
      const pz = zc - 0.1 - Math.cos(u * Math.PI) * 0.25;
      kit.add(M.pipe, new THREE.ConeGeometry(r, 0.7, 14, 1, true), px, base + 2.3 + 0.35, pz, 0, Math.PI);
      kit.add(M.pipe, new THREE.CylinderGeometry(r, r, ph - 0.7, 14, 1, true), px, base + 2.65 + (ph - 0.7) / 2, pz);
      kit.box(M.dark, r * 1.1, 0.22, 0.02, px, base + 2.95, pz + r * 0.98);
    }
    kit.add(M.gold, new THREE.ConeGeometry(0.5, 1.0, 8), tx, base + 2.0 + th + 1.2, zc);
  }
}

export function reliquary(kit, M, group, x, y, z, ry) {
  const F = frame(kit, x, z, ry);
  F.box(M.gold, 1.15, 0.16, 0.7, 0, y + 0.08, 0);
  F.box(M.goldOrn, 1.05, 0.06, 0.62, 0, y + 0.19, 0, 0.6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      F.box(M.gold, 0.06, 0.62, 0.06, sx * 0.47, y + 0.53, sz * 0.27);
      F.add(M.gold, new THREE.ConeGeometry(0.045, 0.2, 6), sx * 0.47, y + 0.94, sz * 0.27);
    }
  }
  for (const sz of [-1, 1]) F.add(M.gold, boxGeo(1.0, 0.03, 0.36), 0, y + 0.98, sz * 0.13, 0, sz * 0.62);
  for (let i = -2; i <= 2; i++) F.add(M.gold, new THREE.ConeGeometry(0.03, 0.14, 5), i * 0.18, y + 1.13, 0);
  F.add(M.gold, new THREE.CylinderGeometry(0.06, 0.08, 0.18, 8), 0, y + 1.14, 0);
  F.add(M.gold, new THREE.ConeGeometry(0.07, 0.42, 8), 0, y + 1.44, 0);
  F.box(M.gold, 0.02, 0.12, 0.02, 0, y + 1.7, 0);
  F.box(M.gold, 0.07, 0.02, 0.02, 0, y + 1.72, 0);
  F.box(M.velvet, 0.62, 0.08, 0.32, 0, y + 0.26, 0);
  F.add(M.dark, new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), 0, y + 0.33, 0, 0, 0, Math.PI / 2);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.58, 0.5), M.glass);
  const [gx, gz] = F.w(0, 0);
  glass.position.set(gx, y + 0.52, gz);
  glass.rotation.y = ry;
  glass.renderOrder = 2;
  group.add(glass);
}
