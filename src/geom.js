// 기하 도우미와 재질별 병합 키트
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// UV를 m 단위로 통일하는 스위치 (실사 재질은 텍스처 repeat = 1 / 타일 크기로 맞춘다)
let UV_METERS = false;
export function setUvMeters(v) {
  UV_METERS = v;
}

// 면마다 실제 크기에 맞춘 UV (s = 텍스처 한 장이 덮는 미터)
export function boxGeo(w, h, d, s = 3) {
  if (UV_METERS) s = 1;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / s, (uv.getY(i) * dims[f][1]) / s);
    }
  }
  return g;
}

export function cylGeo(rt, rb, h, seg = 24, s = 3, open = false, t0 = 0, tl = Math.PI * 2) {
  if (UV_METERS) s = 1;
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl);
  const uv = g.attributes.uv, circ = Math.max(rt, rb) * tl;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / s, (uv.getY(i) * h) / s);
  return g;
}

export function scaleUV(g, su, sv) {
  if (UV_METERS) return g;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// 감는 방향과 법선을 뒤집어 안쪽에서 보이게 한다
export function invert(g) {
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
  }
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.array.length; i++) n.array[i] *= -1;
  return g;
}

function gridGeo(nu, nv, fn) {
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

// 직사각형 위 돛 돔(sail vault): 원점이 아치 기점, hw=x 반폭, hd=z 반폭
export function sailDomeGeo(hw, hd, seg = 40) {
  const R2 = hw * hw + hd * hd;
  return gridGeo(seg, seg, (a, b) => {
    const x = hw * Math.sin((a * 2 - 1) * Math.PI * 0.5);
    const z = hd * Math.sin((b * 2 - 1) * Math.PI * 0.5);
    const y = Math.sqrt(Math.max(0, R2 - x * x - z * z));
    return [x, y, z, x / (2 * hw) + 0.5, 1 - (z / (2 * hd) + 0.5)];
  });
}

// 정사각 교차부 펜던티브 4장 (구 반지름 = half·√2, 위쪽은 반지름 half 원)
export function pendentiveGeo(half = 11, nPhi = 256, nT = 28) {
  const R = half * Math.SQRT2, th0 = Math.PI / 4;
  return gridGeo(nPhi, nT, (a, t) => {
    const phi = a * Math.PI * 2;
    const rsq = half / Math.max(Math.abs(Math.cos(phi)), Math.abs(Math.sin(phi)));
    const thMax = Math.asin(Math.min(1, rsq / R));
    const th = th0 + (thMax - th0) * t;
    const s = Math.sin(th);
    return [R * s * Math.cos(phi), R * Math.cos(th), R * s * Math.sin(phi), a, 1 - (th - th0) / (Math.PI / 4)];
  });
}

// XY 평면의 반원 아치 띠 (안쪽 면 + 앞뒤 면). 깊이는 z 방향.
export function archSoffitGeo(r, depth, seg = 64, tile = 1.6) {
  const arc = Math.PI * r;
  return gridGeo(seg, 1, (a, b) => {
    const t = a * Math.PI;
    return [Math.cos(t) * r, Math.sin(t) * r, (b - 0.5) * depth, (a * arc) / tile, b];
  });
}

export function halfAnnulusGeo(r0, r1, seg = 64) {
  return gridGeo(seg, 1, (a, b) => {
    const t = a * Math.PI, r = r0 + (r1 - r0) * b;
    return [Math.cos(t) * r, Math.sin(t) * r, 0, a * 8, b];
  });
}

export function halfDiskGeo(r, seg = 48, s = 3) {
  const shape = new THREE.Shape();
  shape.moveTo(r, 0);
  shape.absarc(0, 0, r, 0, Math.PI, false);
  shape.lineTo(r, 0);
  const g = new THREE.ShapeGeometry(shape, seg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s, uv.getY(i) / s);
  return g;
}

// 반원 상단 아치 창/문 모양 평면 (밑변 중심이 원점)
export function archPanelGeo(w, h, seg = 24) {
  const r = w / 2, shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const g = new THREE.ShapeGeometry(shape, seg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h);
  return g;
}

// 아치 테두리 (두께 있는 반원+기둥 프레임)
export function archFrameGeo(w, h, t = 0.35, depth = 0.3) {
  const r = w / 2, shape = new THREE.Shape();
  shape.moveTo(-r - t, 0);
  shape.lineTo(-r - t, h - r);
  shape.absarc(0, h - r, r + t, Math.PI, 0, true);
  shape.lineTo(r + t, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
  return g;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const KEEP = new Set(['position', 'normal', 'uv']);

export class Kit {
  constructor() {
    this.map = new Map();
  }
  add(mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sc = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sc, sc, sc);
    g.applyMatrix4(new THREE.Matrix4().compose(_p, _q, _s));
    for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return this;
  }
  box(mat, w, h, d, x, y, z, ry = 0, s = 3) {
    return this.add(mat, boxGeo(w, h, d, s), x, y, z, ry);
  }
  build(parent) {
    const out = [];
    for (const [mat, list] of this.map) {
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

// 벽에 붙는 요소용 로컬 좌표계: 로컬 +z가 실내 쪽, 로컬 +x가 벽을 따라
export function frame(kit, px, pz, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const w = (lx, lz) => [px + lx * c + lz * s, pz - lx * s + lz * c];
  return {
    ry,
    w,
    box(mat, bw, bh, bd, lx, ly, lz, sUV = 3) {
      const [x, z] = w(lx, lz);
      kit.box(mat, bw, bh, bd, x, ly, z, ry, sUV);
    },
    add(mat, geo, lx, ly, lz, dry = 0, rx = 0, rz = 0, sc = 1) {
      const [x, z] = w(lx, lz);
      kit.add(mat, geo, x, ly, z, ry + dry, rx, rz, sc);
    },
  };
}
