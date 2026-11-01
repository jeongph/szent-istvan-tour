// 사진 기반으로 다시 짠 성당 건축 (9칸 그리스 십자형)
import * as THREE from 'three';
import { Kit, boxGeo, cylGeo, invert, frame, scaleUV, halfAnnulusGeo, setUvMeters } from './geom.js';

setUvMeters(true);
import {
  W, HW, C, RR, S, PB, Q, HC, ENT, PIL_TOP, HRING, CORNER_H, APSE_Z, APSE_R, APSE_H, SANCT_Z, GALLERY_Z, addRect,
} from './plan.js';

const PI = Math.PI;

/* ---------------------------- 기하 도우미 ---------------------------- */

function grid(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const r = fn(i / nu, j / nv);
      pos.push(r[0], r[1], r[2]);
      uv.push(r[3], r[4]);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = (i + 1) * (nv + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 바닥 평면 다각형을 높이 y0~y1로 세운 기둥 (점은 [x, z])
export function prismGeo(pts, y0, y1, s = 1) {
  s = 1;
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-PI / 2);
  g.translate(0, y0, 0);
  // 옆면 UV를 둘레 길이와 높이 기준으로 다시 계산
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ny = Math.abs(n.getY(i));
    if (ny > 0.9) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
    else {
      const along = Math.abs(n.getX(i)) > Math.abs(n.getZ(i)) ? p.getZ(i) : p.getX(i);
      uv.setXY(i, along / s, p.getY(i) / s);
    }
  }
  return g;
}

// 원통 볼트: 원점이 기점 중심, 아치는 XY 평면, 길이는 +z
function barrelGeo(R, L, tile, segA = 48, segL = 8) {
  return grid(segA, segL, (a, b) => {
    const t = a * PI;
    return [Math.cos(t) * R, Math.sin(t) * R, b * L, (a * PI * R) / tile, (b * L) / tile];
  });
}

// 교차부 펜던티브 (모따기 기둥 위 작은 반원벽 포함 경계)
function pendentiveGeo() {
  const Rs = Math.sqrt(RR * RR + HW * HW);
  return grid(256, 30, (a, t) => {
    const phi = a * PI * 2, c = Math.abs(Math.cos(phi)), s = Math.abs(Math.sin(phi));
    const rb = Math.min(RR / Math.max(c, s), S / (c + s));
    const r = RR + (rb - RR) * t;
    const y = HC + Math.sqrt(Math.max(0, Rs * Rs - r * r));
    return [Math.cos(phi) * r, y, Math.sin(phi) * r, a, t];
  });
}

// 아치 안쪽 면(소피트): 로컬 XY 반원, 두께 d만큼 -z로
function archSoffit(r, d, seg = 32, uFull = 0) {
  return grid(seg, 1, (a, b) => {
    const t = a * PI;
    return [Math.cos(t) * r, Math.sin(t) * r, -b * d, uFull ? b * uFull : b * d, a * PI * r];
  });
}

function halfDisk(r, seg = 40) {
  const sh = new THREE.Shape();
  sh.moveTo(r, 0);
  sh.absarc(0, 0, r, 0, PI, false);
  sh.lineTo(r, 0);
  return new THREE.ShapeGeometry(sh, seg);
}

// 아치형 개구부가 뚫린 벽 판 (로컬 x: -w/2~w/2, y: 0~h, 두께 d는 -z 방향)
function wallWithArch(w, h, ow, spring, d = 1, s = 3, cx = 0) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(w / 2, h);
  sh.lineTo(-w / 2, h);
  sh.lineTo(-w / 2, 0);
  const hole = new THREE.Path();
  const r = ow / 2;
  hole.moveTo(cx - r, 0.001);
  hole.lineTo(cx - r, spring);
  hole.absarc(cx, spring, r, PI, 0, true);
  hole.lineTo(cx + r, 0.001);
  hole.lineTo(cx - r, 0.001);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -d);
  return scaleUV(g, 1 / s, 1 / s);
}

/* ------------------------------- 건축 ------------------------------- */

export function buildArchitecture(scene, M) {
  const group = new THREE.Group();
  scene.add(group);
  const kit = new Kit();
  const floorKit = new Kit();
  const glassKit = new Kit();
  const domeKit = new Kit();
  const info = { windows: [] };

  /* 바닥 */
  const floorRect = (x0, z0, x1, z1, y, mat) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
    floorKit.add(mat, g);
  };
  floorRect(-Q, SANCT_Z, Q, Q, 0, M.floor);
  {
    const g = new THREE.PlaneGeometry(2 * RR, 2 * RR).rotateX(-PI / 2).translate(0, 0.003, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
    floorKit.add(M.floorCross, g);
    if (M.medallion) {
      const s = M.medallionSize;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-PI / 2).translate(0, 0.006, 0), M.medallion);
      m.renderOrder = 1;
      group.add(m);
    }
  }
  floorRect(-Q, -Q, -HW, SANCT_Z, 0, M.floor);
  floorRect(HW, -Q, Q, SANCT_Z, 0, M.floor);
  floorRect(-HW, SANCT_Z - 0.45, HW, SANCT_Z, 0.22, M.floorSanct);
  floorRect(-HW, SANCT_Z - 0.9, HW, SANCT_Z - 0.45, 0.44, M.floorSanct);
  floorRect(-HW, APSE_Z, HW, SANCT_Z - 0.9, 0.66, M.floorSanct);
  {
    const g = new THREE.CircleGeometry(APSE_R, 48, 0, PI).rotateX(-PI / 2).translate(0, 0.66, APSE_Z);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
    floorKit.add(M.floorSanct, g);
  }
  for (const [y, z0, z1] of [[0.11, SANCT_Z - 0.45, SANCT_Z], [0.33, SANCT_Z - 0.9, SANCT_Z - 0.45], [0.33, APSE_Z, SANCT_Z - 0.9]]) {
    kit.box(M.whiteMarble, W, y * 2, z1 - z0, 0, y, (z0 + z1) / 2);
  }
  kit.add(M.whiteMarble, invert(cylGeo(APSE_R, APSE_R, 0.66, 48, 3, true, PI / 2, PI)), 0, 0.33, APSE_Z);

  /* 엔타블러처: 벽 면을 따라 (frame 로컬) */
  const entablature = (F, L, ext = 0.9, top = HC) => {
    const b = top - ENT;
    F.box(M.stone, L + ext * 2, 0.75, 0.5, 0, b + 0.375, 0.25, 2);
    F.box(M.frieze, L + ext * 2, 0.95, 0.38, 0, b + 0.75 + 0.475, 0.19, 2);
    F.box(M.goldOrn, L + ext * 2, 0.22, 0.6, 0, b + 1.82, 0.3, 1.2);
    F.box(M.stone, L + ext * 2, 0.68, 1.0, 0, top - 0.34, 0.5, 2);
    F.box(M.gold, L + ext * 2, 0.08, 1.04, 0, top - 0.7, 0.52);
  };
  const pilaster = (F, lx, w = 1.6, top = PIL_TOP, base = 0) => {
    F.box(M.whiteMarble, w + 0.4, 1.0, 0.7, lx, base + 0.5, 0.35);
    F.box(M.redMarble, w, top - base - 2.4, 0.45, lx, base + 1.0 + (top - base - 2.4) / 2, 0.225, 2);
    F.add(M.capital, capitalGeo(w), lx, top - 1.4, 0.0);
  };
  const dado = (F, L) => {
    F.box(M.greenMarble, L, 1.0, 0.1, 0, 0.5, 0.05, 2);
    F.box(M.whiteMarble, L, 0.2, 0.18, 0, 0.1, 0.09);
  };

  /* 교차부 기둥 4개 */
  const pierPts = [[RR, HW], [PB, HW], [PB, PB], [HW, PB], [HW, RR]];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts = pierPts.map(([x, z]) => [x * sx, z * sz]);
      if (sx * sz < 0) pts.reverse();
      kit.add(M.greenMarble, prismGeo(pts, 0, HC, 2.5));
      // 면마다 붉은 대리석 필라스터 쌍, 엔타블러처
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // 바깥 법선
        let nx = b[1] - a[1], nz = -(b[0] - a[0]);
        const nl = Math.hypot(nx, nz);
        nx /= nl;
        nz /= nl;
        if (nx * (mx - sx * (HW + PB) / 2) + nz * (mz - sz * (HW + PB) / 2) < 0) (nx = -nx), (nz = -nz);
        const ry = Math.atan2(nx, nz);
        const F = frame(kit, mx, mz, ry);
        entablature(F, L, 1.0);
        dado(F, L);
        const diag = Math.abs(Math.abs(nx) - Math.abs(nz)) < 0.1;
        if (diag) {
          info.diagonal = info.diagonal || [];
          info.diagonal.push({ x: mx, z: mz, ry, w: L });
        } else if (L > 5) {
          pilaster(F, -L / 2 + 1.0, 1.7);
          pilaster(F, L / 2 - 1.0, 1.7);
          F.box(M.greenPanel, L - 4.4, PIL_TOP - 3.2, 0.06, 0, 1.6 + (PIL_TOP - 3.2) / 2, 0.03, 2);
        }
      }
    }
  }

  /* 팔 4개: 원통 볼트, 옆벽(모서리 칸 개구부), 끝벽 */
  const TILE = 1;
  const arms = [
    { name: 'west', ry: 0, len: Q - RR, end: 'organ' },
    { name: 'east', ry: PI, len: PB - RR, end: 'apse', noSides: true },
    { name: 'south', ry: PI / 2, len: Q - RR, end: 'window' },
    { name: 'north', ry: -PI / 2, len: Q - RR, end: 'window' },
  ];
  for (const arm of arms) {
    // 팔 로컬 좌표: 교차부 아치면에서 바깥(+z_local)으로 len만큼
    const cr = Math.cos(arm.ry), sr = Math.sin(arm.ry);
    const toW = (lx, lz) => [lx * cr + lz * sr, -lx * sr + lz * cr];
    const BAND = 4.4;
    const [ox, oz] = toW(0, RR + BAND);
    kit.add(M.coffer, barrelGeo(HW, arm.len - BAND, TILE), ox, HC, oz, arm.ry);
    // 교차부 아치 띠: 사진의 소피트 한 줄을 그대로 (u = 폭 0~2.75 m 고정, v = 아치 둘레)
    const [bx, bz] = toW(0, RR + BAND);
    kit.add(M.soffit, archSoffit(HW, BAND, 64, 4.4), bx, HC, bz, arm.ry);
    for (const d of [0, BAND]) {
      const [rx, rz] = toW(0, RR + d);
      kit.add(M.gold, halfAnnulusGeo(HW - 0.08, HW + 0.3), rx, HC, rz, arm.ry);
    }
    // 옆벽: 기둥 면 이후 모서리 칸으로 열린 아치
    for (const side of arm.noSides ? [] : [-1, 1]) {
      const wlen = Q - PB;
      const [wx, wz] = toW(side * HW, PB + wlen / 2);
      const F = frame(kit, wx, wz, arm.ry - side * PI / 2);
      const ow = wlen - 1.6, spring = PIL_TOP - 0.4 - ow / 2;
      F.add(M.wall, wallWithArch(wlen, HC, ow, spring, 1.0, 3), 0, 0, 0);
      entablature(F, wlen, 0.9);
      pilaster(F, -wlen / 2 + 0.55, 1.1, PIL_TOP);
      pilaster(F, wlen / 2 - 0.55, 1.1, PIL_TOP);
      // 아치 테두리
      F.add(M.goldOrn, halfAnnulusGeo(ow / 2, ow / 2 + 0.35, 32), 0, spring, 0.05);
      F.add(M.soffit, archSoffit(ow / 2, 1.0, 32, 4.4), 0, spring, 0);
      // 볼트 기점 위 벽(반원 끝벽 사이의 볼트 측면)은 볼트가 덮는다
    }
    // 끝벽
    const [ex, ez] = toW(0, RR + arm.len);
    const FE = frame(kit, ex, ez, arm.ry + PI);
    if (arm.end !== 'apse') {
      FE.box(M.wall, W + 2, HC, 1, 0, HC / 2, -0.5, 3);
      entablature(FE, W, 0.9);
      dado(FE, W);
      pilaster(FE, -HW + 1.0, 1.7);
      pilaster(FE, HW - 1.0, 1.7);
      if (arm.end === 'window') {
        // 제단 뒤 벽은 회녹색 대리석 판으로 마감 (사진: 수랑 끝벽)
        FE.box(M.greenMarble, W - 4.2, PIL_TOP - 1.4, 0.06, 0, 1.2 + (PIL_TOP - 1.4) / 2, 0.03);
        for (const sd of [-1, 1]) FE.box(M.gold, 0.08, PIL_TOP - 1.4, 0.1, sd * (HW - 2.1), 1.2 + (PIL_TOP - 1.4) / 2, 0.05);
      }
      FE.add(M.wallDS, halfDisk(HW + 0.05), 0, HC, -0.02);
      FE.add(M.gold, halfAnnulusGeo(HW - 0.45, HW + 0.02), 0, HC, 0.04);
      // 반원창 (열창): 사진에서 편 텍스처가 있으면 그 비례(폭 6.8 m, 반원 + 아래 띠)를 따른다
      const lun = M.art?.[arm.name === 'south' ? 'lunette-holy-crown' : arm.name === 'north' ? 'lunette-holy-see' : '_'];
      const rw = lun ? lun.widthM / 2 : 3.6;
      const bandH = lun ? lun.heightM - rw : 0.45;
      const G = frame(glassKit, ex, ez, arm.ry + PI);
      const sh = new THREE.Shape();
      sh.moveTo(-rw, 0);
      sh.lineTo(rw, 0);
      sh.lineTo(rw, bandH);
      sh.absarc(0, bandH, rw, 0, PI, false);
      sh.lineTo(-rw, 0);
      const gw = new THREE.ShapeGeometry(sh, 48);
      const uv = gw.attributes.uv, p = gw.attributes.position, th = bandH + rw;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * rw) + 0.5, p.getY(i) / th);
      const by = HC + 0.35;
      G.add(lun ? lun.mat : M.thermalGlass, gw, 0, by, 0.06);
      FE.add(M.goldOrn, halfAnnulusGeo(rw, rw + 0.4, 48), 0, by + bandH, 0.08);
      for (const sd of [-1, 1]) FE.box(M.goldOrn, 0.4, bandH, 0.12, sd * (rw + 0.2), by + bandH / 2, 0.08, 1.2);
      FE.box(M.stone, rw * 2 + 1.2, 0.35, 0.5, 0, by - 0.1, 0.25);
      info.windows.push({ arm: arm.name, center: new THREE.Vector3(ex, by + th * 0.45, ez), r: rw });
      if (arm.end === 'organ') {
        // 정문 (청동)과 문틀
        FE.box(M.bronze, 4.8, 7.4, 0.25, 0, 3.7, 0.12, 4.8);
        for (const sd of [-1, 1]) FE.box(M.stone, 0.9, 8.4, 0.6, sd * 2.85, 4.2, 0.3);
        FE.box(M.stone, 6.6, 0.9, 0.7, 0, 8.85, 0.35);
      }
    } else {
      // 후진으로 열린 아치 위 띠벽
      const sh = new THREE.Shape();
      sh.moveTo(-HW, APSE_H);
      sh.lineTo(-HW, HC);
      sh.absarc(0, HC, HW, PI, 0, true);
      sh.lineTo(HW, APSE_H);
      sh.absarc(0, APSE_H, HW, 0, PI, false);
      FE.add(M.wallDS, new THREE.ShapeGeometry(sh, 32), 0, 0, -0.01);
      FE.add(M.goldOrn, halfAnnulusGeo(HW - 0.4, HW + 0.02, 48), 0, APSE_H, 0.03);
      // 후진 입구 양옆 벽 (APSE_H 아래)
      for (const side of [-1, 1]) FE.box(M.wall, 0.01, APSE_H, 0.01, side * HW, APSE_H / 2, 0);
    }
  }

  /* 교차부: 펜던티브, 모따기 위 반원벽, 드럼, 돔 */
  domeKit.add(M.crossing, pendentiveGeo());
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const r = C / Math.SQRT2;
      const mx = (sx * S) / 2, mz = (sz * S) / 2;
      domeKit.add(M.crossing, halfDisk(r, 24), mx, HC, mz, Math.atan2(-mx, -mz));
    }
  }
  info.crossing = { RR, HRING };

  /* 모서리 칸: 천장, 바깥벽, 창 */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.PlaneGeometry(Q - HW, Q - HW).rotateX(PI / 2);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / TILE, p.getZ(i) / TILE);
      kit.add(M.coffer, g, (sx * (Q + HW)) / 2, CORNER_H, (sz * (Q + HW)) / 2);
      // 바깥벽 두 면
      for (const [px, pz, ry, L] of [
        [sx * Q, (sz * (Q + HW)) / 2, sx > 0 ? -PI / 2 : PI / 2, Q - HW],
        [(sx * (Q + HW)) / 2, sz * Q, sz > 0 ? PI : 0, Q - HW],
      ]) {
        const F = frame(kit, px, pz, ry);
        F.box(M.wall, L + 1, CORNER_H, 1, 0, CORNER_H / 2, -0.5, 3);
        dado(F, L);
        entablature(F, L, 0.5, CORNER_H);
        // 측면 창: x 방향 벽(측면 제단 위)은 사진에서 편 스테인드글라스
        const xWall = !(ry === 0 || ry === PI);
        const winId = xWall ? { '1,1': 'window-st-catherine', '-1,1': 'window-st-leopold', '1,-1': 'window-st-henry', '-1,-1': 'window-st-andrew' }[`${sx},${sz}`] : null;
        const wart = winId && M.art?.[winId];
        const ww = 2.0, wh = 4.9, wb = 6.05;
        const G = frame(glassKit, px, pz, ry);
        G.add(wart ? wart.mat : M.archGlass, archPanel(ww, wh), 0, wb, 0.04);
        F.add(M.goldOrn, halfAnnulusGeo(ww / 2, ww / 2 + 0.3, 24), 0, wb + wh - ww / 2, 0.06);
        for (const sd of [-1, 1]) F.box(M.goldOrn, 0.3, wh - ww / 2, 0.1, sd * (ww / 2 + 0.15), wb + (wh - ww / 2) / 2, 0.06, 1.2);
        F.box(M.stone, ww + 0.8, 0.3, 0.35, 0, wb - 0.15, 0.17);
        info.windows.push({ arm: 'corner', center: new THREE.Vector3(px, wb + wh / 2, pz), r: 1.2 });
      }
    }
  }

  /* 후진 */
  {
    // 후진 바깥쪽 모서리 칸과 나누는 벽
    for (const side of [-1, 1]) {
      const F = frame(kit, side * (HW + 1), (APSE_Z - Q) / 2, side > 0 ? PI / 2 : -PI / 2);
      F.box(M.wall, Q + APSE_Z + 0.5, CORNER_H, 1, 0, CORNER_H / 2, -0.5, 3);
      dado(F, Q + APSE_Z);
      entablature(F, Q + APSE_Z, 0.5, CORNER_H);
    }
    kit.add(M.wall, invert(cylGeo(APSE_R, APSE_R, APSE_H, 64, 3, true, PI / 2, PI)), 0, APSE_H / 2, APSE_Z);
    // 열주 뒤 금빛 벽면 (사진: 후진 아래쪽)
    kit.add(M.apseGold, invert(cylGeo(APSE_R - 0.03, APSE_R - 0.03, 5.7, 64, 1, true, PI / 2, PI)), 0, 0.66 + 2.85, APSE_Z);
    kit.add(M.apseDome, new THREE.SphereGeometry(APSE_R, 64, 32, PI, PI, 0, PI / 2), 0, APSE_H, APSE_Z);
    // 명문 띠와 코니스
    const band = invert(new THREE.CylinderGeometry(APSE_R - 0.06, APSE_R - 0.06, 1.1, 96, 1, true, PI / 2, PI));
    const uv = band.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    kit.add(M.inscription, band, 0, APSE_H - 1.1, APSE_Z);
    const prof = [[APSE_R, APSE_H - 0.1], [APSE_R - 0.6, APSE_H - 0.05], [APSE_R - 0.6, APSE_H + 0.25], [APSE_R, APSE_H + 0.3]].map(([r, y]) => new THREE.Vector2(r, y));
    kit.add(M.goldDS, new THREE.LatheGeometry(prof, 64, PI / 2, PI), 0, 0, APSE_Z);
    const prof2 = [[APSE_R, APSE_H - 1.6], [APSE_R - 0.5, APSE_H - 1.5], [APSE_R - 0.5, APSE_H - 1.1], [APSE_R, APSE_H - 1.1]].map(([r, y]) => new THREE.Vector2(r, y));
    kit.add(M.goldDS, new THREE.LatheGeometry(prof2, 64, PI / 2, PI), 0, 0, APSE_Z);
    // 붉은 대리석 필라스터 (반원 벽면)
    for (let k = 0; k <= 6; k++) {
      const phi = PI / 2 + (k * PI) / 6;
      const F = frame(kit, Math.sin(phi) * APSE_R, APSE_Z + Math.cos(phi) * APSE_R, phi + PI);
      pilaster(F, 0, 1.1, APSE_H - 1.6, 0.66 + 5.0);
    }
    info.apse = { reliefY: 0.66 + 7.4, reliefH: 3.6 };
  }

  info.organ = { z: GALLERY_Z };

  kit.build(group);
  const glass = glassKit.build(group);
  glass.forEach((m) => (m.userData.noAO = true));
  const floors = floorKit.build(group);
  const dome = domeKit.build(group);
  return { group, floors, dome, info };
}

// 코린트식 주두를 단순화한 형태 (로컬 원점: 필라스터 앞면 아래쪽 중앙, +z 실내)
export function capitalGeo(w, d = 0.55) {
  const parts = [];
  const h = 1.4;
  parts.push(boxGeo(w * 0.96, h * 0.55, d * 0.9, 1.2).translate(0, h * 0.28, d * 0.45));
  parts.push(boxGeo(w * 1.12, h * 0.3, d * 1.05, 1.2).translate(0, h * 0.65, d * 0.52));
  parts.push(boxGeo(w * 1.3, h * 0.16, d * 1.2, 1.2).translate(0, h * 0.92, d * 0.6));
  for (const sd of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(0.16, 0.16, d * 1.1, 14).rotateX(PI / 2).translate(sd * w * 0.52, h * 0.72, d * 0.55));
  }
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const out = mergeGeos(geos);
  return out;
}

function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function archPanel(w, h, seg = 20) {
  const r = w / 2, sh = new THREE.Shape();
  sh.moveTo(-r, 0);
  sh.lineTo(r, 0);
  sh.lineTo(r, h - r);
  sh.absarc(0, h - r, r, 0, PI, false);
  sh.lineTo(-r, 0);
  const g = new THREE.ShapeGeometry(sh, seg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h);
  return g;
}

// 드럼, 돔, 정점 원판 (각도 지도 투영 대상). dims는 dome.json의 geometry(사진 천정각으로 잰 높이)를 쓴다.
export function buildDome(scene, mat, dims) {
  const d = dims || {};
  const R = d.drumR ?? RR, ring = d.ring ?? HRING + 0.3, ringTop = d.ringTop ?? ring + 0.76;
  const gallery = d.galleryY ?? ringTop + 4.4, cornice = d.corniceBottom ?? ringTop + 15.5, drumTop = d.drumTop ?? cornice + 3.2;
  const domeR = d.domeR ?? R, oculusR = d.oculusR ?? 3.4, lanternH = d.lanternH ?? 0.6;
  const kit = new Kit();
  const g = new THREE.Group();
  scene.add(g);
  const lathe = (pts) => kit.add(mat, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 128));
  // 펜던티브 위 고리 (까치발 코니스)
  lathe([[R + 0.3, ring - 0.5], [R - 0.2, ring - 0.4], [R - 0.6, ring - 0.05], [R - 1.0, ring], [R - 1.0, ringTop], [R - 0.2, ringTop + 0.05]]);
  // 회랑 난간 (고리 위, 드럼 벽 앞)
  lathe([[R - 0.95, ringTop], [R - 0.95, gallery - 0.15], [R - 1.05, gallery - 0.1], [R - 1.05, gallery], [R - 0.75, gallery + 0.02], [R - 0.75, ringTop]]);
  // 드럼 벽
  kit.add(mat, new THREE.CylinderGeometry(R, R, cornice - ringTop, 128, 8, true), 0, (cornice + ringTop) / 2, 0);
  // 돔 밑단 코니스
  lathe([[R, cornice], [R - 0.5, cornice + 0.3], [R - 0.9, cornice + 1.4], [R - 0.9, drumTop - 0.3], [R - 0.3, drumTop], [R, drumTop + 0.1]]);
  const th0 = Math.asin(Math.min(0.95, oculusR / domeR));
  kit.add(mat, new THREE.SphereGeometry(domeR, 128, 48, 0, PI * 2, th0, PI / 2 - th0), 0, drumTop, 0);
  const ocY = drumTop + domeR * Math.cos(th0);
  kit.add(mat, new THREE.CylinderGeometry(oculusR, oculusR, lanternH, 64, 1, true), 0, ocY + lanternH / 2, 0);
  kit.add(mat, new THREE.CircleGeometry(oculusR, 64).rotateX(PI / 2), 0, ocY + lanternH, 0);
  // 고리와 아치 정점 사이 빈틈을 막는 띠 (펜던티브 윗선 ~ 고리 아랫면)
  kit.add(mat, new THREE.CylinderGeometry(R + 0.3, R + 0.3, Math.max(0.05, ring - 0.5 - HRING) + 0.4, 128, 1, true), 0, (HRING - 0.2 + ring - 0.5) / 2 + 0.1, 0);
  kit.build(g);
  return { group: g, top: ocY + lanternH };
}
