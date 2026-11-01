// 성 이슈트반 대성당 주 제단 앙상블 (카우저 요제프 설계 닫집 제단 + 슈트로블 알러요시의 성 이슈트반 대리석상)
// export default async function build(THREE, { base }) → Group
// 원점: 앙상블 바닥(성소 바닥 높이) 중심, 정면 +z(신랑 쪽), 단위 m. 치수 근거는 research/notes/altar-modeler.md
// 개발용: harness.html?m=altar&part=statue 로 조각상만 볼 수 있다.

/* ============================== 공용 도구 ============================== */
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const gauss = (x, s) => Math.exp(-(x * x) / (s * s));

// 결정적 의사난수
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
// 1D 값 잡음 (주름 불규칙성)
function noise1(seed) {
  const r = rng(seed), T = [];
  for (let i = 0; i < 64; i++) T.push(r() * 2 - 1);
  return (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(T[((i % 64) + 64) % 64], T[(((i + 1) % 64) + 64) % 64], u);
  };
}

// 표 보간: [[x, ...vals], ...]
function table(rows) {
  return (x) => {
    if (x <= rows[0][0]) return rows[0].slice(1);
    for (let i = 1; i < rows.length; i++) {
      if (x <= rows[i][0]) {
        const a = rows[i - 1], b = rows[i], t = (x - a[0]) / (b[0] - a[0]);
        const s = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
        return a.slice(1).map((v, k) => lerp(v, b[k + 1], s));
      }
    }
    return rows[rows.length - 1].slice(1);
  };
}

// 격자 매개 곡면. fn(u, v, out[3]). wrapU 이면 u 방향 이음매 정점을 공유해 법선이 매끈하다.
function paramSurface(THREE, nu, nv, fn, { wrapU = false, flip = false } = {}) {
  const cols = wrapU ? nu : nu + 1;
  const pos = new Float32Array(cols * (nv + 1) * 3), uv = new Float32Array(cols * (nv + 1) * 2);
  const p = [0, 0, 0];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      fn(i / nu, j / nv, p);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv;
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + i, d = (j + 1) * cols + ((i + 1) % cols);
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 두께 있는 천: fn(u, v, s, out) s=0 바깥면, s=1 안쪽면. 가장자리(v=1, 열린 경우 u=0,1)를 띠로 잇는다.
function clothShell(THREE, nu, nv, fn, { wrapU = false, rimTop = false, innerDiv = 1 } = {}) {
  const outer = paramSurface(THREE, nu, nv, (u, v, o) => fn(u, v, 0, o), { wrapU });
  const inner = paramSurface(THREE, Math.max(2, Math.round(nu / innerDiv)), Math.max(2, Math.round(nv / innerDiv)), (u, v, o) => fn(u, v, 1, o), { wrapU, flip: true });
  const parts = [outer, inner];
  const strip = (pts) => {
    // pts: [[outer xyz, inner xyz], ...]
    const n = pts.length, pos = new Float32Array(n * 2 * 3);
    pts.forEach(([a, b], i) => { pos.set(a, i * 6); pos.set(b, i * 6 + 3); });
    const idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const edge = (fu, fv, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = [0, 0, 0], b = [0, 0, 0];
      fn(fu(i / n), fv(i / n), 0, a); fn(fu(i / n), fv(i / n), 1, b);
      pts.push([a, b]);
    }
    return pts;
  };
  const bottom = edge((t) => t, () => 1, nu);
  if (wrapU) bottom.push(bottom[0]);
  parts.push(strip(bottom));
  if (rimTop) {
    const top = edge((t) => 1 - t, () => 0, nu);
    if (wrapU) top.push(top[0]);
    parts.push(strip(top));
  }
  if (!wrapU) {
    parts.push(strip(edge(() => 0, (t) => 1 - t, nv)));
    parts.push(strip(edge(() => 1, (t) => t, nv)));
  }
  return parts;
}

// 굵기가 변하는 관(팔, 손가락 등). pts: Vector3 배열, rad(t) → 반지름 또는 [rx, ry]
function sweepTube(THREE, pts, rad, { seg = 64, radial = 16, closeEnds = true, up = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const frames = curve.computeFrenetFrames(seg, false);
  const P = new THREE.Vector3();
  const pos = [], idx = [];
  // 프레넷 대신 위쪽 기준 프레임(비틀림 방지)
  const upv = up || new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    const T = curve.getTangentAt(t).normalize();
    let N = upv.clone().sub(T.clone().multiplyScalar(upv.dot(T)));
    if (N.lengthSq() < 1e-6) N = frames.normals[i].clone();
    N.normalize();
    const B = new THREE.Vector3().crossVectors(T, N);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const r = rad(t, a);
      const [rx, ry] = Array.isArray(r) ? r : [r, r];
      pos.push(P.x + N.x * Math.cos(a) * rx + B.x * Math.sin(a) * ry, P.y + N.y * Math.cos(a) * rx + B.y * Math.sin(a) * ry, P.z + N.z * Math.cos(a) * rx + B.z * Math.sin(a) * ry);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  if (closeEnds) {
    for (const [i, sgn] of [[0, -1], [seg, 1]]) {
      curve.getPointAt(i / seg, P);
      const T = curve.getTangentAt(i / seg).normalize();
      const c = pos.length / 3;
      const r0 = rad(i / seg, 0), rr = Array.isArray(r0) ? Math.min(r0[0], r0[1]) : r0;
      const cap = P.clone().add(T.multiplyScalar(sgn * rr * 0.6));
      pos.push(cap.x, cap.y, cap.z);
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + ((j + 1) % radial);
        if (sgn < 0) idx.push(c, b, a);
        else idx.push(c, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 오목한 곳을 어둡게 하는 정점 색(곡률 기반 간이 AO) + 사용자 차폐 함수
function bakeCavity(THREE, g, { strength = 6, base = 1, occl = null } = {}) {
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const sum = new Float32Array(n * 3), cnt = new Float32Array(n);
  const idx = g.index ? g.index.array : null;
  const tri = idx ? idx.length / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const v = idx ? [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        if (a === b) continue;
        sum[v[a] * 3] += P.getX(v[b]); sum[v[a] * 3 + 1] += P.getY(v[b]); sum[v[a] * 3 + 2] += P.getZ(v[b]);
        cnt[v[a]]++;
      }
    }
  }
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let c = base;
    if (cnt[i]) {
      const dx = sum[i * 3] / cnt[i] - P.getX(i), dy = sum[i * 3 + 1] / cnt[i] - P.getY(i), dz = sum[i * 3 + 2] / cnt[i] - P.getZ(i);
      const el = Math.hypot(dx, dy, dz) + 1e-9;
      const conc = (dx * N.getX(i) + dy * N.getY(i) + dz * N.getZ(i)) / el; // >0 오목
      c *= 1 - clamp(conc * strength * 0.1, -0.06, 0.45);
    }
    if (occl) c *= occl(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = clamp(c, 0, 1.1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 여러 지오메트리 합치기(같은 재질, 인덱스 유지): position/normal/uv/color
function merge(THREE, geos) {
  let n = 0, m = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    n += g.attributes.position.count;
    m += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
  const idx = n > 65535 ? new Uint32Array(m) : new Uint16Array(m);
  const anyCol = geos.some((g) => g.attributes.color);
  let o = 0, k = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, c * 3), o * 3);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[k++] = g.index.array[i] + o;
    else for (let i = 0; i < c; i++) idx[k++] = i + o;
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (anyCol) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// 지오메트리를 행렬로 옮겨 복제 (prim 조합용)
function placed(g, m) {
  const c = g.clone();
  c.applyMatrix4(m);
  return c;
}

/* ============================== 성 이슈트반 상 ============================== */
// 정규화 단위: 조각상 받침 윗면 y=0, 머리 꼭대기 y=1. 정면 +z, +x 는 조각상의 왼쪽(오브를 든 손).
// 사진 근거(Yair Haklai 정면 사진): 어깨 망토 하단 0.75, 허리띠 0.56~0.61, 지팡이 십자 꼭대기 0.90,
// 오브 중심 (0.12, 0.71), 칼 손잡이 0.59, 칼집 끝 0.15, 튜닉 단 0.06.
const se = (phi, a, b, n = 2.3) => {
  const s = Math.sin(phi), c = Math.cos(phi);
  return [a * Math.sign(s) * Math.abs(s) ** (2 / n), b * Math.sign(c) * Math.abs(c) ** (2 / n)];
};

// 머리(얼굴, 콧수염, 수염): 정점색에 눈두덩·코밑 그늘을 함께 굽는다. beard 0~1
function sculptHead(THREE, HC, HR, nu, nv, beard = 1) {
  const ao = [];
  const head = paramSurface(THREE, nu, nv, (u, v, o) => {
    const th = 0.02 + v * (Math.PI - 0.04), ph = u * TAU;
    const X = Math.sin(th) * Math.sin(ph), Y = Math.cos(th), F = Math.sin(th) * Math.cos(ph);
    let rx = HR.x, ry = HR.y, rz = HR.z;
    const jaw = smooth(-0.2, -0.95, Y);
    rx *= 1 - (0.16 + 0.06 * (1 - beard)) * jaw; rz *= 1 - 0.08 * jaw * (F < 0 ? 1.5 : 0.5);
    const fr = smooth(0.0, 0.5, F);
    let d = 0, dark = 0;
    for (const sx of [-1, 1]) {
      const sock = gauss(X - sx * 0.36, 0.16) * gauss(Y - 0.03, 0.12) * fr;
      d -= 0.0075 * sock; dark += 0.4 * sock;
      d += 0.0034 * gauss(X - sx * 0.36, 0.085) * gauss(Y - 0.0, 0.055) * fr;
      d += 0.0045 * gauss(X - sx * 0.56, 0.17) * gauss(Y + 0.1, 0.14) * fr;
      d -= 0.0035 * gauss(X - sx * 0.48, 0.14) * gauss(Y + 0.32, 0.12) * fr;
      d -= 0.003 * gauss(Math.abs(X) - 0.82, 0.12) * gauss(Y - 0.12, 0.25);
      d += 0.0042 * gauss(X - sx * 0.13, 0.05) * gauss(Y + 0.33, 0.05) * fr;
    }
    d += 0.005 * gauss(Y - 0.19, 0.075) * gauss(X, 0.52) * fr;
    const nose = Y > -0.38 && Y < 0.17 ? lerp(0.004, 0.019, smooth(0.15, -0.31, Y)) * smooth(-0.41, -0.33, Y) : 0;
    d += nose * gauss(X, 0.075 + 0.05 * smooth(0.1, -0.3, Y)) * fr;
    dark += 0.45 * gauss(Y + 0.4, 0.04) * gauss(X, 0.18) * fr;
    const ym = -0.44 - 0.45 * X * X;
    d += beard * 0.0068 * gauss(Y - ym, 0.075) * smooth(0.72, 0.05, Math.abs(X)) * fr;
    dark += beard * 0.3 * gauss(Y - ym + 0.09, 0.03) * smooth(0.6, 0.05, Math.abs(X)) * fr;
    if (!beard) { d -= 0.0022 * gauss(Y + 0.5, 0.03) * gauss(X, 0.2) * fr; d += 0.003 * gauss(Y + 0.7, 0.1) * gauss(X, 0.3) * fr; }
    const wB = beard * smooth(-0.32, -0.62, Y) * smooth(-0.55, 0.25, F);
    const strand = Math.sin(X * 48 + Y * 6 + 0.7 * Math.sin(Y * 9));
    d += wB * (0.0095 + 0.0017 * strand + 0.001 * Math.sin(X * 19));
    dark += wB * 0.18 * (0.5 - 0.5 * strand);
    let y = HC.y + (ry + d) * Y;
    if (beard) {
      y -= 0.042 * beard * smooth(-0.5, -1.0, Y) * smooth(-0.3, 0.45, F);
      if (F > -0.1) y = Math.max(y, HC.y - 0.066 + 0.004 * gauss(X, 0.4));
    }
    o[0] = HC.x + (rx + d) * X; o[1] = y; o[2] = HC.z + (rz + d) * F;
    ao.push(1 - clamp(dark, 0, 0.6));
  }, { wrapU: true });
  const col = new Float32Array(ao.length * 3);
  ao.forEach((a, i) => { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a; });
  head.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return head;
}

// 머리카락: 정수리를 덮고 얼굴 둘레를 감싼다. longHair 면 어깨까지 물결치며 늘어짐, 아니면 귀 아래에서 끝남
function sculptHair(THREE, HC, HR, nu, nv, longHair = true) {
  const top = longHair ? 0.5 : 0.62;
  const thEnd = Math.PI / 2 + 0.25;
  return paramSurface(THREE, nu, nv, (u, v, o) => {
    const th = v < top ? lerp(0.04, thEnd, v / top) : thEnd;
    const pf = 0.98 * smooth(0.42, 0.85, th);
    const ph = pf + u * (TAU - 2 * pf);
    const X = Math.sin(th) * Math.sin(ph), Y = Math.cos(th), F = Math.sin(th) * Math.cos(ph);
    const wave = 0.0032 * Math.sin(14 * ph + 7 * v) + 0.0012 * Math.sin(37 * ph + 3 * v);
    if (v < top) {
      const k = 1.07 + wave / 0.045 + (longHair ? 0.3 : 0.12) * smooth(1.05, thEnd, th) * (0.4 + 0.6 * Math.abs(Math.sin(ph)));
      o[0] = HC.x + HR.x * k * X;
      o[1] = HC.y + HR.y * 1.05 * Y + 0.002;
      o[2] = HC.z + HR.z * (1.06 + wave / 0.05) * F - 0.004;
    } else {
      const t = (v - top) / (1 - top);
      const side = 0.4 + 0.6 * Math.abs(Math.sin(ph));
      const eu = Math.min(u, 1 - u);
      const taper = smooth(0.0, 0.14, eu);
      const amp = longHair ? 1 : 0.35;
      const vol = 1.0 + amp * (0.35 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.2)) ** 0.8 * side - 0.25 * t * (1 - side)) * (0.25 + 0.75 * taper) + (longHair ? 0 : 0.12);
      const y0 = HC.y + HR.y * 1.06 * Y;
      const yEnd = longHair ? HC.y - 0.088 + 0.01 * Math.sin(ph * 9) - 0.012 * Math.max(0, -Math.cos(ph)) : HC.y - 0.03 - 0.012 * Math.max(0, -Math.cos(ph));
      const lock = 1 + 0.07 * Math.sin(16 * ph + 9 * t);
      o[0] = HC.x + HR.x * vol * lock * Math.sin(ph);
      o[1] = lerp(y0, yEnd, t) + 0.003 * Math.sin(ph * 23 + t * 12);
      o[2] = HC.z + HR.z * (1.1 + 0.2 * t) * lock * Math.cos(ph) - 0.008 * t;
    }
  });
}

function buildStatue(THREE, M) {
  const g = new THREE.Group();
  g.name = 'stephenStatue';
  const marble = [];
  const nz1 = noise1(11), nz2 = noise1(23), nz3 = noise1(37);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const push = (geo, bake) => { bakeCavity(THREE, geo, bake); marble.push(geo); return geo; };

  /* ---- 튜닉(달마티카) ---- */
  const tunicT = table([
    [0.050, 0.165, 0.130, 0.020],
    [0.10, 0.160, 0.125, 0.018],
    [0.18, 0.152, 0.116, 0.015],
    [0.28, 0.142, 0.104, 0.012],
    [0.40, 0.128, 0.093, 0.008],
    [0.50, 0.113, 0.085, 0.005],
    [0.56, 0.100, 0.079, 0.004],
    [0.60, 0.096, 0.077, 0.005],
    [0.66, 0.103, 0.079, 0.009],
    [0.72, 0.114, 0.079, 0.009],
    [0.77, 0.120, 0.073, 0.004],
    [0.805, 0.110, 0.062, 0.0],
    [0.83, 0.066, 0.050, 0.002],
    [0.85, 0.040, 0.040, 0.006],
    [0.90, 0.034, 0.036, 0.006],
  ]);
  const tunicFold = (phi, y) => {
    const below = smooth(0.58, 0.47, y);
    const A = (0.004 + 0.010 * (1 - y / 0.58)) * below;
    return A * (0.55 * Math.sin(6 * phi + 0.7 + nz1(y * 4) * 0.9) + 0.3 * Math.sin(11 * phi + 1.9 + y * 3 + nz2(y * 5)) + 0.15 * Math.sin(17 * phi + 0.3 + nz3(y * 7) * 2));
  };
  // 주름 골은 어둡고 마루는 밝게(매끈한 정점색 AO)
  const foldAO = (g, f) => {
    const uv = g.attributes.uv, n = uv.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = clamp(f(uv.getX(i), uv.getY(i)), 0.3, 1.05); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    marble.push(g);
  };
  {
    const parts = clothShell(THREE, 112, 84, (u, v, s, o) => {
      const y = lerp(0.9, 0.05, v);
      const phi = u * TAU;
      const [a, b, zc] = tunicT(y);
      const [x, z] = se(phi, a, b);
      let d = tunicFold(phi, y);
      const front = Math.max(0, Math.cos(phi));
      d += front * smooth(0.55, 0.3, y) * (0.007 * gauss(x + 0.05, 0.035) + 0.005 * gauss(x - 0.052, 0.035) + 0.006 * gauss(x - 0.052, 0.03) * gauss(y - 0.3, 0.06));
      d += 0.0028 * smooth(0.05, 0.056, y) * smooth(0.112, 0.104, y);
      const k = Math.round(phi / (TAU / 30)), dphi = phi - k * (TAU / 30);
      d += 0.0022 * gauss(dphi * 0.15 / 0.21, 0.011) * gauss(y - 0.08, 0.011);
      const r = Math.hypot(x, z) || 1;
      const sc = (r + d - (s ? 0.007 * smooth(0.2, 0.05, y) + 0.004 : 0)) / r;
      o[0] = x * sc; o[1] = y; o[2] = z * sc + zc;
    }, { wrapU: true, innerDiv: 3 });
    foldAO(parts[0], (u, v) => {
      const y = lerp(0.9, 0.05, v);
      const A = 0.004 + 0.010 * (1 - y / 0.58);
      return (0.93 + 0.1 * tunicFold(u * TAU, y) / A) * (0.86 + 0.14 * smooth(0.05, 0.2, y)) * (1 - 0.12 * gauss(y - 0.555, 0.012) - 0.1 * gauss(y - 0.76, 0.02));
    });
    for (let i = 1; i < parts.length; i++) push(parts[i], { strength: 0, base: 0.45 });
  }
  // 다리와 신발
  for (const sd of [-1, 1]) {
    push(new THREE.CylinderGeometry(0.032, 0.03, 0.12, 14, 1, true).translate(sd * 0.048, 0.08, 0.02), { strength: 0, base: 0.6 });
    const shoe = paramSurface(THREE, 16, 8, (u, v, o) => {
      const th = v * Math.PI * 0.5, ph = u * TAU;
      o[0] = 0.026 * Math.cos(th) * Math.sin(ph) * (1 - 0.15 * Math.max(0, Math.cos(ph)));
      o[2] = 0.062 * Math.cos(th) * Math.cos(ph);
      o[1] = 0.025 * Math.sin(th);
    }, { wrapU: true });
    shoe.rotateY(sd * 0.16).translate(sd * 0.05, 0.0, sd < 0 ? 0.075 : 0.06);
    push(shoe, { strength: 4, base: 0.92 });
  }

  /* ---- 허리띠와 장식 ---- */
  {
    const belt = paramSurface(THREE, 96, 6, (u, v, o) => {
      const y = lerp(0.558, 0.61, v), phi = u * TAU;
      const [a, b, zc] = tunicT(y);
      const [x, z] = se(phi, a, b);
      const r = Math.hypot(x, z);
      const bulge = 0.0045 + 0.0018 * Math.sin(v * Math.PI) + (v < 0.2 || v > 0.8 ? 0.0012 : 0);
      o[0] = x * (r + bulge) / r; o[1] = y; o[2] = z * (r + bulge) / r + zc;
    }, { wrapU: true });
    push(belt, { strength: 5 });
    const stud = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 24; i++) {
      const phi = (i / 24) * TAU, big = i % 2 === 0;
      const [a, b, zc] = tunicT(0.584);
      const [x, z] = se(phi, a, b);
      const r = Math.hypot(x, z);
      const m = new THREE.Matrix4().compose(V(x * (r + 0.0068) / r, 0.584, z * (r + 0.0068) / r + zc),
        new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(x / r, 0, z / r)), big ? V(0.011, 0.014, 0.004) : V(0.006, 0.006, 0.0035));
      push(placed(stud, m), { strength: 0, base: 0.95 });
    }
    for (const [y, sx, sy] of [[0.628, 0.011, 0.016], [0.668, 0.011, 0.016], [0.708, 0.010, 0.014], [0.742, 0.009, 0.012]]) {
      const [, b, zc] = tunicT(y);
      push(placed(stud, new THREE.Matrix4().compose(V(-0.004, y, b + zc + 0.002), new THREE.Quaternion(), V(sx, sy, 0.0055))), { strength: 0, base: 0.95 });
    }
  }

  /* ---- 어깨 망토(펠러린) ---- */
  const capeT = table([
    [0.00, 0.884, 0.036, 0.038, 0.005],
    [0.10, 0.872, 0.060, 0.056, 0.008],
    [0.24, 0.853, 0.094, 0.080, 0.007],
    [0.45, 0.826, 0.126, 0.093, 0.003],
    [0.72, 0.792, 0.148, 0.100, 0.0],
    [1.00, 0.758, 0.156, 0.104, 0.0],
  ]);
  {
    const parts = clothShell(THREE, 96, 26, (u, v, s, o) => {
      const phi = u * TAU;
      let [y, a, b, zc] = capeT(v);
      y -= v * (0.008 * gauss(Math.sin(phi / 2), 0.35) + 0.012 * Math.max(0, -Math.cos(phi)));
      const [x, z] = se(phi, a, b, 2.1);
      let d = v * v * 0.005 * Math.sin(5 * phi + 0.6) + v * v * 0.003 * Math.sin(9 * phi + 2);
      d += 0.0022 * gauss(v - 0.19, 0.035) * Math.max(0, Math.cos(phi)) * (0.6 + 0.4 * Math.cos(phi * 40));
      d += 0.0018 * smooth(0.9, 0.96, v);
      const r = Math.hypot(x, z);
      const sc = (r + d - (s ? 0.007 : 0)) / r;
      o[0] = x * sc; o[1] = y - (s ? 0.002 : 0); o[2] = z * sc + zc;
    }, { wrapU: true, innerDiv: 2 });
    push(parts[0], { strength: 3 });
    for (let i = 1; i < parts.length; i++) push(parts[i], { strength: 0, base: i === 1 ? 0.4 : 0.8 });
  }

  /* ---- 겉망토 ---- */
  {
    const mt = table([
      [0.00, 0.215, 0.180, -0.020],
      [0.12, 0.207, 0.165, -0.016],
      [0.30, 0.196, 0.144, -0.012],
      [0.50, 0.188, 0.125, -0.010],
      [0.66, 0.190, 0.112, -0.010],
      [0.74, 0.180, 0.104, -0.008],
      [0.79, 0.160, 0.098, -0.004],
    ]);
    const mantleFold = (phi, v, lft) => {
      const A = 0.004 + 0.02 * Math.pow(v, 1.1);
      return A * (0.5 * Math.sin(7 * phi + 0.4 + nz1(v * 3 + 2) * 1.2) + 0.32 * Math.sin(12 * phi + 2.2 + nz2(v * 4) * 1.5) + 0.18 * Math.sin(19 * phi + nz3(v * 6)))
        + lft * smooth(0.12, 0.35, v) * 0.012 * Math.sin(16 * phi + 1.3 + v * 4) * gauss(Math.sin(phi) - 0.9, 0.4);
    };
    const edgeR = table([[0, -1.72], [0.4, -1.62], [0.8, -1.5], [1, -1.38]]);
    const edgeL = table([[0, 0.62], [0.12, 0.66], [0.3, 0.86], [0.6, 0.92], [1, 0.95]]);
    const parts = clothShell(THREE, 110, 84, (u, v, s, o) => {
      const y = lerp(0.79, 0.0, v);
      const pr = edgeR(v)[0], pl = edgeL(v)[0];
      const phi = pr - u * (TAU + pr - pl);
      let [a, b, zc] = mt(y);
      const lft = smooth(-0.2, 0.8, Math.sin(phi));
      a += 0.012 * lft * gauss(y - 0.66, 0.12);
      const [x, z] = se(phi, a, b, 2.2);
      let d = mantleFold(phi, v, lft);
      const eu = Math.min(u, 1 - u);
      d += 0.006 * smooth(0.03, 0, eu);
      const r = Math.hypot(x, z);
      const sc = (r + d - (s ? 0.008 : 0)) / r;
      o[0] = x * sc;
      o[1] = Math.max(0.002, y + (v > 0.97 ? 0.004 * Math.sin(phi * 13) : 0));
      o[2] = z * sc + zc;
    }, { innerDiv: 3 });
    foldAO(parts[0], (u, v) => {
      const pr = edgeR(v)[0], pl = edgeL(v)[0];
      const phi = pr - u * (TAU + pr - pl);
      const lft = smooth(-0.2, 0.8, Math.sin(phi));
      const A = 0.004 + 0.02 * Math.pow(v, 1.1) + 0.012 * lft;
      const y = lerp(0.79, 0.0, v);
      return (0.92 + 0.1 * mantleFold(phi, v, lft) / A) * (0.84 + 0.16 * smooth(-0.6, 0.4, Math.cos(phi))) * (0.9 + 0.1 * smooth(0.0, 0.15, y));
    });
    for (let i = 1; i < parts.length; i++) push(parts[i], { strength: 0, base: 0.42 });
  }

  /* ---- 가슴을 가로지르는 망토 자락 ---- */
  {
    const pts = [V(-0.115, 0.768, 0.066), V(-0.05, 0.745, 0.088), V(0.02, 0.72, 0.097), V(0.085, 0.697, 0.098), V(0.14, 0.675, 0.08), V(0.178, 0.66, 0.03), V(0.19, 0.645, -0.03)];
    push(sweepTube(THREE, pts, (t, a) => [0.006 + 0.002 * Math.sin(a * 2) ** 2, lerp(0.026, 0.034, t) * (1 + 0.05 * Math.sin(t * 20))], { seg: 40, radial: 14 }), { strength: 6 });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const bead = new THREE.SphereGeometry(0.0034, 5, 4);
    for (let i = 2; i < 28; i++) {
      const t = i / 32, p = curve.getPointAt(t), T = curve.getTangentAt(t);
      const N = V(0, 0, 1).sub(T.clone().multiplyScalar(T.z)).normalize(), B = V().crossVectors(T, N);
      for (const sd of [-0.7, 0.7]) {
        const w = lerp(0.026, 0.034, t) * sd;
        push(bead.clone().translate(p.x + B.x * w + N.x * 0.006, p.y + B.y * w + N.y * 0.006, p.z + B.z * w + N.z * 0.006), { strength: 0, base: 0.95 });
      }
    }
  }

  /* ---- 팔(소매) ---- */
  const sleeve = (pts, r0, r1, rc, seed) => {
    const nz = noise1(seed);
    push(sweepTube(THREE, pts, (t, a) => {
      const base = t < 0.6 ? lerp(r0, r1, t / 0.6) : lerp(r1, rc, (t - 0.6) / 0.4);
      return base * (1 + 0.07 * Math.sin(5 * a + t * 9 + nz(t * 5)) * smooth(0.1, 0.5, t) + 0.05 * smooth(0.92, 1, t));
    }, { seg: 32, radial: 16 }), { strength: 3 });
  };
  sleeve([V(-0.11, 0.792, -0.004), V(-0.14, 0.715, -0.004), V(-0.155, 0.625, 0.01), V(-0.168, 0.56, 0.045), V(-0.178, 0.522, 0.07)], 0.042, 0.037, 0.044, 61);
  sleeve([V(0.11, 0.792, -0.004), V(0.145, 0.712, -0.012), V(0.158, 0.645, 0.002), V(0.145, 0.666, 0.045), V(0.128, 0.688, 0.076)], 0.042, 0.038, 0.036, 71);

  /* ---- 손 ---- */
  const staffAt = (y) => V(lerp(-0.18, -0.212, y / 0.9), y, lerp(0.1, 0.088, y / 0.9));
  {
    // 오른손: 지팡이를 감아쥔 주먹
    const c = staffAt(0.49);
    const hg = [];
    hg.push(new THREE.SphereGeometry(1, 14, 10).scale(0.016, 0.03, 0.024).translate(-0.016, 0.0, -0.006));
    for (let i = 0; i < 4; i++) {
      hg.push(new THREE.TorusGeometry(0.0115, 0.0063, 6, 12, Math.PI * 1.25).rotateX(Math.PI / 2).rotateY(Math.PI * 0.55).translate(0, 0.018 - i * 0.0125, 0));
    }
    hg.push(sweepTube(THREE, [V(-0.014, 0.024, 0.012), V(-0.004, 0.03, 0.016), V(0.008, 0.026, 0.014)], () => 0.0062, { seg: 6, radial: 6 }));
    const h = merge(THREE, hg);
    h.rotateY(-0.35).translate(c.x, c.y, c.z);
    push(h, { strength: 5 });
  }
  {
    // 왼손: 손바닥을 위로 하여 오브를 받침
    const oc = V(0.122, 0.716, 0.098);
    const hg = [];
    hg.push(new THREE.SphereGeometry(1, 14, 10).scale(0.024, 0.01, 0.028).translate(0, -0.03, -0.004));
    for (let i = 0; i < 4; i++) {
      const a = -0.55 + i * 0.36;
      hg.push(new THREE.TorusGeometry(0.03, 0.0058, 5, 10, Math.PI * 0.45).rotateY(Math.PI / 2).rotateX(Math.PI * 0.05).rotateY(a + Math.PI / 2).translate(0, 0.0, 0));
    }
    hg.push(sweepTube(THREE, [V(-0.022, -0.026, 0.0), V(-0.03, -0.012, 0.006), V(-0.03, 0.004, 0.01)], () => 0.0062, { seg: 6, radial: 6 }));
    const h = merge(THREE, hg);
    h.translate(oc.x, oc.y, oc.z);
    push(h, { strength: 5 });
    push(new THREE.SphereGeometry(0.027, 20, 14).translate(oc.x, oc.y, oc.z), { strength: 0, base: 0.98 });
  }

  /* ---- 머리, 얼굴, 수염 ---- */
  const HC = V(0, 0.93, 0.008), HR = V(0.045, 0.058, 0.05);
  {
    marble.push(sculptHead(THREE, HC, HR, 80, 64, 1));
    push(new THREE.CylinderGeometry(0.028, 0.034, 0.08, 16, 1, true).translate(0, 0.865, 0.004), { strength: 0, base: 0.7 });
  }
  // 머리카락: 정수리를 덮고 얼굴 둘레를 풍성하게 감싸며 어깨까지 물결
  {
    push(sculptHair(THREE, HC, HR, 80, 48, true), { strength: 4 });
    // 관자놀이의 진주 땋은 머리
    const pearl = new THREE.SphereGeometry(0.0033, 5, 4);
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        push(pearl.clone().translate(sd * (0.047 + 0.01 * t), lerp(0.958, 0.895, t), HC.z + 0.03 - 0.012 * t), { strength: 0, base: 0.95 });
      }
    }
  }

  /* ---- 칼(왼쪽 허리) ---- */
  {
    const s0 = V(0.075, 0.522, 0.105), s1 = V(0.09, 0.152, 0.142);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), s1.clone().sub(s0).normalize());
    const L = s0.distanceTo(s1);
    const scab = new THREE.BoxGeometry(0.024, L, 0.011, 1, 6, 1);
    const sp = scab.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const t = 0.5 - sp.getY(i) / L;
      sp.setX(i, sp.getX(i) * (1 - 0.25 * t) * (t > 0.97 ? 0.6 : 1));
    }
    scab.computeVertexNormals();
    const sg = merge(THREE, [
      scab.translate(0, -L / 2, 0),
      new THREE.BoxGeometry(0.058, 0.008, 0.012).translate(0, 0.004, 0),
      new THREE.CylinderGeometry(0.0055, 0.0065, 0.05, 8).translate(0, 0.033, 0),
      new THREE.SphereGeometry(0.011, 10, 8).scale(1.15, 0.75, 1.15).translate(0, 0.064, 0),
    ]);
    sg.applyQuaternion(q);
    sg.translate(s0.x, s0.y, s0.z);
    push(sg, { strength: 3, base: 0.97 });
  }

  /* ---- 받침 ---- */
  push(new THREE.BoxGeometry(0.42, 0.06, 0.36).translate(0, -0.03, 0.0), { strength: 0, base: 0.92 });

  const mesh = new THREE.Mesh(merge(THREE, marble), M.statue);
  mesh.name = 'statueMarble';
  g.add(mesh);

  /* ---- 금속: 지팡이(이중 십자), 오브 위 십자, 후광 ---- */
  const gold = [];
  {
    const b = staffAt(0.0), t = staffAt(0.82);
    const len = b.distanceTo(t);
    const staff = new THREE.CylinderGeometry(0.0055, 0.0062, len, 10).translate(0, len / 2, 0);
    staff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), t.clone().sub(b).normalize()));
    staff.translate(b.x, b.y, b.z);
    gold.push(staff);
    const k = staffAt(0.786);
    gold.push(new THREE.SphereGeometry(0.015, 16, 12).scale(1, 0.92, 1).translate(k.x, k.y, k.z));
    gold.push(new THREE.CylinderGeometry(0.009, 0.007, 0.012, 10).translate(k.x, k.y - 0.018, k.z));
    const c = staffAt(0.855);
    const cross = [
      new THREE.BoxGeometry(0.009, 0.095, 0.008),
      new THREE.BoxGeometry(0.044, 0.009, 0.008).translate(0, 0.022, 0),
      new THREE.BoxGeometry(0.066, 0.009, 0.008).translate(0, -0.007, 0),
    ];
    for (const [x, y] of [[-0.024, 0.022], [0.024, 0.022], [-0.035, -0.007], [0.035, -0.007], [0, 0.05]]) {
      cross.push(new THREE.SphereGeometry(0.0062, 8, 6).translate(x, y, 0));
      cross.push(new THREE.BoxGeometry(0.009, 0.009, 0.009).rotateZ(Math.PI / 4).translate(x * 0.9, y, 0.001));
    }
    const cg = merge(THREE, cross);
    cg.rotateZ(Math.atan2(0.032, 0.9));
    cg.translate(c.x, c.y, c.z);
    gold.push(cg);
  }
  {
    const halo = [];
    const R = 0.102;
    halo.push(new THREE.TorusGeometry(R, 0.0055, 6, 72));
    halo.push(new THREE.TorusGeometry(R - 0.024, 0.0038, 5, 64));
    halo.push(new THREE.TorusGeometry(0.022, 0.004, 5, 24));
    const bead = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      halo.push(bead.clone().scale(0.0072, 0.0072, 0.0035).translate(Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), 0.0));
      halo.push(new THREE.TorusGeometry(0.0085, 0.0016, 4, 12).translate(Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), 0.001));
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      halo.push(new THREE.TorusGeometry(1, 0.08, 4, 14).scale(0.026, 0.006, 0.02).translate(0.048, 0, 0).rotateZ(a));
    }
    const hg = merge(THREE, halo);
    hg.translate(0, 0.952, -0.062);
    gold.push(hg);
  }
  const goldMesh = new THREE.Mesh(merge(THREE, gold), M.gold);
  goldMesh.name = 'statueGold';
  g.add(goldMesh);
  {
    const c = staffAt(0.855);
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), M.ruby);
    j.position.set(c.x - 0.0003, c.y - 0.007, c.z + 0.006);
    g.add(j);
    const cr = merge(THREE, [
      new THREE.BoxGeometry(0.006, 0.05, 0.006).translate(0, 0.025, 0),
      new THREE.BoxGeometry(0.026, 0.006, 0.006).translate(0, 0.04, 0),
      new THREE.BoxGeometry(0.036, 0.006, 0.006).translate(0, 0.026, 0),
    ]);
    cr.translate(0.122, 0.741, 0.098);
    g.add(new THREE.Mesh(cr, M.bronze));
  }
  return g;
}


/* ============================== 건축 도구 ============================== */
// 재질 키별로 지오메트리를 모아 한 번에 합친다. 기본은 월드 좌표 기반 UV(대리석 텍스처 1장 = TILE m).
const TILE = 1.6;
function worldUV(THREE, g, s = TILE) {
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = P.getX(i); v = P.getZ(i); }
    else if (ax >= az) { u = P.getZ(i); v = P.getY(i); }
    else { u = P.getX(i); v = P.getY(i); }
    uv[i * 2] = u / s; uv[i * 2 + 1] = v / s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

class Kit {
  constructor(THREE) { this.T = THREE; this.g = {}; }
  add(key, geo, keepUV = false) {
    geo.userData.keepUV = keepUV;
    (this.g[key] ||= []).push(geo);
    return geo;
  }
  box(key, w, h, d, x, y, z, ry = 0) {
    const g = new this.T.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(key, g);
  }
  // 아래 중심(x, y0, z) 기준 원통/선반
  lathe(key, prof, x, y0, z, seg = 24, phi0 = 0, phiL = Math.PI * 2) {
    const g = new this.T.LatheGeometry(prof.map(([r, y]) => new this.T.Vector2(r, y)), seg, phi0, phiL);
    g.translate(x, y0, z);
    return this.add(key, g);
  }
  build(group, M) {
    const out = {};
    for (const [key, geos] of Object.entries(this.g)) {
      if (!geos.length) continue;
      for (const g of geos) {
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.userData.keepUV) worldUV(this.T, g);
      }
      const mesh = new this.T.Mesh(merge(this.T, geos), M[key]);
      mesh.name = key;
      group.add(mesh);
      out[key] = mesh;
    }
    return out;
  }
}

// 기둥 하나: 아티카 주초 + 엔타시스 기둥몸 + 기둥머리(코린트식 간이 조각)
function column(kit, THREE, o) {
  const { x, z, y0, r, baseH, shaftH, capH, shaft = 'grey', base = 'white', cap = 'gold', seg = 28, plinth = true } = o;
  let y = y0;
  if (plinth) { kit.box(base, r * 2.7, baseH * 0.3, r * 2.7, x, y + baseH * 0.15, z); }
  const b0 = plinth ? baseH * 0.3 : 0;
  // 주초: 토루스-스코샤-토루스
  kit.lathe(base, [[0, 0], [r * 1.32, 0], [r * 1.36, baseH * 0.08], [r * 1.32, baseH * 0.22], [r * 1.18, baseH * 0.3], [r * 1.12, baseH * 0.4], [r * 1.16, baseH * 0.5], [r * 1.12, baseH * 0.6], [r * 1.04, baseH * 0.66], [r * 1.0, baseH * 0.7], [0, baseH * 0.7]].map(([a, b]) => [a, b * (1 - b0 / baseH) + 0]), x, y + b0, z, seg);
  y += baseH;
  // 기둥몸: 아래 1/3 은 곧고 위로 가늘어짐
  const sp = [[0, 0], [r, 0]];
  for (let i = 1; i <= 6; i++) { const t = i / 6; sp.push([r * (1 - 0.14 * Math.max(0, (t - 0.33) / 0.67) ** 1.3), shaftH * t]); }
  sp.push([0, shaftH]);
  kit.lathe(shaft, sp, x, y, z, seg);
  // 목 고리
  const rt = r * 0.86;
  kit.lathe(cap, [[rt * 1.0, 0], [rt * 1.12, capH * 0.03], [rt * 1.12, capH * 0.07], [rt, capH * 0.1]], x, y + shaftH - capH * 0.05, z, seg);
  y += shaftH;
  corinthian(kit, THREE, cap, x, y, z, rt, capH);
  return y + capH;
}

// 간이 코린트식 기둥머리: 종 + 아칸서스 잎 2단 + 모서리 소용돌이 + 오목한 아바쿠스
let _leaf = null;
function leafGeo(THREE) {
  if (_leaf) return _leaf;
  _leaf = paramSurface(THREE, 5, 7, (u, v, o) => {
    const s = u * 2 - 1; // -1..1 폭
    const lobes = 0.75 + 0.25 * Math.abs(Math.sin(v * Math.PI * 3.2));
    const w = Math.sin(Math.PI * Math.min(1, v * 1.15)) ** 0.7 * 0.5 * lobes * (1 - 0.35 * v);
    const bend = v * v * 0.55; // 위쪽이 바깥으로 말림
    o[0] = s * w;
    o[1] = v - bend * 0.25;
    o[2] = bend * 0.6 - Math.abs(s) * 0.08 * (1 - v) + (1 - Math.abs(s)) * 0.04;
  });
  return _leaf;
}
function corinthian(kit, THREE, key, x, y, z, r, h) {
  // 종(bell)
  kit.lathe(key, [[0, 0], [r * 0.98, 0], [r * 1.02, h * 0.3], [r * 1.12, h * 0.6], [r * 1.25, h * 0.8], [r * 1.3, h * 0.82], [0, h * 0.82]], x, y, z, 20);
  const leaf = leafGeo(THREE);
  const small = r < 0.15;
  for (let row = small ? 1 : 0; row < 2; row++) {
    const n = 8, lh = h * (row ? 0.62 : 0.4), rr = r * (row ? 1.02 : 1.0);
    for (let i = 0; i < n; i++) {
      const a = (i + (row ? 0.5 : 0)) / n * TAU;
      const g = leaf.clone().scale(r * 0.85, lh, r * 0.7).translate(0, 0, rr * 0.92).rotateY(a).translate(x, y + (row ? h * 0.05 : 0), z);
      kit.add(key, g);
    }
  }
  // 모서리 소용돌이(4)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, rr = r * 0.22 * (1 - 0.6 * t), ang = t * Math.PI * 1.6;
      pts.push(new THREE.Vector3(0, h * 0.62 + r * 0.2 * (1 - t) * 0 + Math.sin(ang) * rr, r * 1.25 + Math.cos(ang) * rr * 0.9));
    }
    const g = sweepTube(THREE, [new THREE.Vector3(0, h * 0.45, r * 0.9), ...pts], () => r * 0.06, { seg: small ? 8 : 12, radial: small ? 4 : 6 });
    g.rotateY(a).translate(x, y, z);
    kit.add(key, g);
  }
  // 아바쿠스(모서리가 잘린 사각판)
  const ab = r * 1.42;
  const sh = new THREE.Shape();
  const c = ab * 0.25;
  sh.moveTo(-ab + c, -ab); sh.lineTo(ab - c, -ab); sh.lineTo(ab, -ab + c); sh.lineTo(ab, ab - c); sh.lineTo(ab - c, ab); sh.lineTo(-ab + c, ab); sh.lineTo(-ab, ab - c); sh.lineTo(-ab, -ab + c);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h * 0.16, bevelEnabled: false });
  g.rotateX(-Math.PI / 2).translate(x, y + h * 0.82, z);
  kit.add(key, g);
  // 꽃 장식(앞뒤좌우 가운데)
  for (let i = 0; i < (small ? 0 : 4); i++) {
    const a = i * Math.PI / 2;
    const f = new THREE.SphereGeometry(r * 0.12, 8, 6).translate(0, h * 0.86, ab * 1.02).rotateY(a).translate(x, y, z);
    kit.add(key, f);
  }
}

// 난간동자(발루스터) 단면
const BALUSTER = [[0, 0], [0.07, 0], [0.07, 0.04], [0.055, 0.06], [0.05, 0.08], [0.075, 0.16], [0.08, 0.2], [0.065, 0.26], [0.04, 0.32], [0.032, 0.36], [0.05, 0.38], [0.05, 0.4], [0.065, 0.41], [0.065, 0.45], [0, 0.45]];

/* ============================== 작은 조각들(천사, 푸토, 아기천사 머리) ============================== */
// 날개: 뿌리(0,0,0)에서 +x 로 뻗고 +y 로 들림. len 길이, w 폭. 깃털 가장자리는 톱니.
function wingGeo(THREE, len, w, lift = 0.6, sweep = 0.3, seed = 1) {
  const nz = noise1(seed);
  const parts = clothShell(THREE, 16, 10, (u, v, s, o) => {
    const span = u;
    const chord = w * (1 - 0.75 * span ** 1.4) * (0.85 + 0.15 * Math.sin(span * Math.PI));
    const feather = v > 0.6 ? 0.12 * Math.abs(Math.sin(span * 30 + nz(span * 4))) * chord * ((v - 0.6) / 0.4) : 0;
    const cv = v * (chord - feather);
    const ang = lift * span;
    o[0] = span * len * Math.cos(ang) + cv * Math.sin(ang) * 0.85;
    o[1] = span * len * Math.sin(ang) * 1.15 - cv * Math.cos(ang) * 0.9 + span * span * sweep * len;
    o[2] = -Math.sin(span * Math.PI) * 0.12 * len - v * 0.05 * len + (s ? 0.012 : 0) - span * 0.25 * len;
  });
  return merge(THREE, parts);
}

// 꼭대기 천사: 긴 옷, 두 팔을 들어 관을 받쳐 듦, 날개를 높이 펼침. 발바닥 y=0, 몸 높이 h
function buildAngel(THREE, h) {
  const geos = [];
  const nz = noise1(77);
  const robe = paramSurface(THREE, 40, 30, (u, v, o) => {
    const y = lerp(0.0, 0.82, v), ph = u * TAU;
    const T = table([[0, 0.17, 0.13], [0.2, 0.14, 0.1], [0.5, 0.1, 0.075], [0.62, 0.075, 0.06], [0.72, 0.1, 0.065], [0.8, 0.11, 0.06], [0.82, 0.05, 0.04]])(y);
    let [x, z] = se(ph, T[0], T[1]);
    const d = 0.012 * (1 - y) * Math.sin(7 * ph + nz(y * 3) * 2) + 0.006 * Math.sin(13 * ph);
    const r = Math.hypot(x, z);
    o[0] = x * (r + d) / r; o[1] = y; o[2] = z * (r + d) / r + 0.04 * (1 - v) * Math.max(0, Math.cos(ph)) * 0.0;
  }, { wrapU: true });
  geos.push(robe);
  geos.push(new THREE.SphereGeometry(0.07, 16, 12).scale(1, 1.15, 1.05).translate(0, 0.91, 0.01));
  geos.push(new THREE.SphereGeometry(0.078, 14, 10).scale(1.05, 1.0, 1.05).translate(0, 0.93, -0.012)); // 머리카락
  geos.push(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10).translate(0, 0.84, 0));
  // 팔: 어깨 → 위로
  for (const sd of [-1, 1]) {
    geos.push(sweepTube(THREE, [new THREE.Vector3(sd * 0.1, 0.79, 0), new THREE.Vector3(sd * 0.15, 0.92, 0.02), new THREE.Vector3(sd * 0.11, 1.05, 0.03), new THREE.Vector3(sd * 0.06, 1.12, 0.03)], (t) => 0.032 * (1 - 0.3 * t) * (t < 0.6 ? 1.25 : 1), { seg: 12, radial: 8 }));
    geos.push(new THREE.SphereGeometry(0.025, 8, 6).translate(sd * 0.055, 1.13, 0.03));
    const wg = wingGeo(THREE, 0.6, 0.34, 1.05, 0.2, 5 + sd);
    if (sd < 0) { wg.scale(-1, 1, 1); wg.index && wg.setIndex(Array.from(wg.index.array).reduce((a, x, i, arr) => (i % 3 === 0 ? a.concat([arr[i], arr[i + 2], arr[i + 1]]) : a), [])); }
    wg.translate(sd * 0.05, 0.78, -0.07);
    geos.push(wg);
  }
  // 받쳐 든 관
  geos.push(new THREE.TorusGeometry(0.065, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, 1.15, 0.03));
  for (let i = 0; i < 4; i++) geos.push(new THREE.TorusGeometry(0.06, 0.008, 5, 12, Math.PI).rotateY(i * Math.PI / 4).translate(0, 1.15, 0.03));
  geos.push(new THREE.SphereGeometry(0.018, 8, 6).translate(0, 1.22, 0.03));
  const g = merge(THREE, geos);
  g.scale(h, h, h);
  return g;
}

// 푸토(아기 천사): 앉거나 선 통통한 아이, 높이 h
function buildPutto(THREE, h, seed = 1) {
  const geos = [];
  const r = rng(seed);
  geos.push(new THREE.SphereGeometry(1, 16, 12).scale(0.15, 0.2, 0.12).translate(0, 0.5, 0)); // 몸통
  geos.push(new THREE.SphereGeometry(0.11, 14, 10).translate(0, 0.78, 0.01)); // 머리
  geos.push(new THREE.SphereGeometry(0.115, 12, 8).scale(1, 0.9, 1).translate(0, 0.81, -0.015)); // 곱슬머리
  for (const sd of [-1, 1]) {
    geos.push(sweepTube(THREE, [new THREE.Vector3(sd * 0.07, 0.36, 0.02), new THREE.Vector3(sd * 0.1, 0.2, 0.08 + r() * 0.06), new THREE.Vector3(sd * 0.09, 0.03, 0.04)], (t) => 0.055 * (1 - 0.35 * t), { seg: 10, radial: 8 }));
    const up = sd > 0 ? 0.25 : -0.1;
    geos.push(sweepTube(THREE, [new THREE.Vector3(sd * 0.13, 0.6, 0), new THREE.Vector3(sd * 0.2, 0.5 + up, 0.06), new THREE.Vector3(sd * 0.16, 0.42 + up * 1.5, 0.12)], (t) => 0.038 * (1 - 0.3 * t), { seg: 10, radial: 8 }));
    const wg = wingGeo(THREE, 0.22, 0.14, 0.9, 0.1, 9 + sd);
    if (sd < 0) { wg.scale(-1, 1, 1); wg.setIndex(Array.from(wg.index.array).reduce((a, x, i, arr) => (i % 3 === 0 ? a.concat([arr[i], arr[i + 2], arr[i + 1]]) : a), [])); }
    wg.translate(sd * 0.05, 0.62, -0.09);
    geos.push(wg);
  }
  // 늘어진 화환
  const gp = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; gp.push(new THREE.Vector3(lerp(-0.18, 0.2, t), 0.42 - Math.sin(t * Math.PI) * 0.12, 0.12 + Math.sin(t * Math.PI) * 0.05)); }
  geos.push(sweepTube(THREE, gp, (t, a) => 0.03 * (1 + 0.25 * Math.sin(t * 40 + a * 2)), { seg: 24, radial: 8 }));
  const g = merge(THREE, geos);
  g.scale(h, h, h);
  return g;
}

// 아기천사 머리(날개 달린 얼굴): 열주 엔타블러처 위 장식. 너비 약 w
function cherubHead(THREE, w) {
  const geos = [];
  const head = paramSurface(THREE, 18, 14, (u, v, o) => {
    const th = 0.05 + v * (Math.PI - 0.1), ph = u * TAU;
    const X = Math.sin(th) * Math.sin(ph), Y = Math.cos(th), F = Math.sin(th) * Math.cos(ph);
    let d = 0.012 * gauss(X, 0.15) * gauss(Y + 0.1, 0.15) * Math.max(0, F) + 0.02 * gauss(Y - 0.5, 0.4) * (1 - Math.max(0, F) * 0.5);
    d += 0.01 * gauss(X - 0.45, 0.2) * gauss(Y + 0.3, 0.25) * Math.max(0, F) + 0.01 * gauss(X + 0.45, 0.2) * gauss(Y + 0.3, 0.25) * Math.max(0, F);
    o[0] = (0.07 + d) * X; o[1] = (0.075 + d) * Y + 0.1; o[2] = (0.068 + d) * F;
  }, { wrapU: true });
  geos.push(head);
  for (const sd of [-1, 1]) {
    const wg = wingGeo(THREE, w * 0.42, w * 0.25, 0.35, 0.05, 3 + sd);
    if (sd < 0) { wg.scale(-1, 1, 1); wg.setIndex(Array.from(wg.index.array).reduce((a, x, i, arr) => (i % 3 === 0 ? a.concat([arr[i], arr[i + 2], arr[i + 1]]) : a), [])); }
    wg.translate(sd * 0.05, 0.12, -0.04);
    geos.push(wg);
  }
  // 아래 리본/구름
  geos.push(new THREE.SphereGeometry(1, 12, 6).scale(w * 0.32, 0.04, 0.07).translate(0, 0.02, 0.0));
  return merge(THREE, geos);
}

/* ============================== 제단 앙상블 ============================== */
// 내부 좌표: 닫집 중심 바로 아래 성소 바닥이 (0,0,0), +z 가 신랑 쪽. 마지막에 발자국 중심으로 옮긴다.
const L = {
  yLand: 0.8, // 5단 계단 위 단(제단 발판, 기단 바닥)
  yPod: 2.95, // 기단 윗면(열주와 닫집 바닥)
  podFront: 1.95, podHalfW: 6.25, podBack: -2.05,
  pierX: 5.66, pierZ: 1.25, pierW: 1.0, pierCap: 5.35, pierTop: 5.78,
  bc: 1.4, // 닫집 기둥 중심 반간격
  apse: { zO: 4.59, R: 7.49 }, // 추정 후진 반원(중심 z, 반지름) - 부조 배치용
  colTop: 6.45, entTop: 7.3, atticTop: 7.62, drumTop: 8.0, domeTop: 9.4, spring: 5.4,
  junction: [1.7, -0.4], // 열주가 닫집 옆면에 닿는 점(x, z)
  colEntB: 4.75, colEntT: 5.35, // 열주 엔타블러처
  statueY: 3.5, statueZ: -0.25, FH: 2.3,
  mensa: { hw: 1.75, z0: 1.95, z1: 3.1, top: 1.8 },
  stepsZ: 4.05, stepN: 5, stepD: 0.36, stepH: 0.16, stepHalfW: 6.25,
};
// 열주 호: 축 위의 중심(0, C)에서 반지름 R, 기둥 안쪽 면과 닫집 접점을 지난다
{
  const [jx, jz] = L.junction, px = L.pierX - L.pierW / 2, pz = L.pierZ;
  L.arcC = (px * px + pz * pz - jx * jx - jz * jz) / (2 * (pz - jz));
  L.arcR = Math.hypot(jx, jz - L.arcC);
  L.thJ = Math.asin(jx / L.arcR);
  L.thP = Math.asin(px / L.arcR);
}
const arcPt = (sd, th, dr = 0) => [sd * (L.arcR + dr) * Math.sin(th), L.arcC - (L.arcR + dr) * Math.cos(th)];

function buildEnsemble(THREE, M) {
  const root = new THREE.Group();
  const kit = new Kit(THREE);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---- 계단과 단 ---- */
  {
    const { yLand, stepsZ, stepN, stepD, stepH, stepHalfW } = L;
    kit.box('floorWhite', stepHalfW * 2, yLand, stepsZ - L.podBack, 0, yLand / 2, (stepsZ + L.podBack) / 2);
    for (let k = 1; k <= stepN; k++) {
      const zf = stepsZ + stepD * (stepN - k + 1);
      const h = stepH * k;
      kit.box('step', stepHalfW * 2, h, zf - stepsZ, 0, h / 2, (zf + stepsZ) / 2);
      // 둥근 코(노징)
      const n = new THREE.CylinderGeometry(0.03, 0.03, stepHalfW * 2, 8).rotateZ(Math.PI / 2).translate(0, h - 0.03, zf);
      kit.add('step', n);
    }
    // 붉은 카펫(가운데 계단과 제단 앞 발판) - 현대 사진에 늘 깔려 있음
    const cw = 2.6;
    const cg = [];
    for (let k = 1; k <= stepN; k++) {
      const zf = stepsZ + stepD * (stepN - k + 1);
      cg.push(new THREE.BoxGeometry(cw, 0.012, stepD).translate(0, stepH * k + 0.006, zf - stepD / 2 + 0.005));
      cg.push(new THREE.BoxGeometry(cw, stepH, 0.012).translate(0, stepH * (k - 0.5), zf + 0.006));
    }
    cg.push(new THREE.BoxGeometry(cw + 0.6, 0.012, stepsZ - L.mensa.z1 + 0.05).translate(0, yLand + 0.006, (stepsZ + L.mensa.z1) / 2));
    const carpet = new THREE.Mesh(merge(THREE, cg.map((g) => worldUV(THREE, g, 0.5))), M.carpet);
    carpet.name = 'carpet';
    root.add(carpet);
  }

  /* ---- 기단(열주와 닫집을 받치는 큰 대) ---- */
  {
    const { yLand, yPod, podFront, podHalfW, podBack } = L;
    // 평면 윤곽: 앞은 곧고, 뒤는 열주 호를 따라 돈다
    const pts = [[-podHalfW, podFront], [podHalfW, podFront], [podHalfW, L.pierZ - 0.75]];
    const Rb = L.arcR + 0.55;
    for (let i = 0; i <= 16; i++) {
      const x = lerp(L.pierX - 0.6, 2.0, i / 16);
      pts.push([x, L.arcC - Math.sqrt(Rb * Rb - x * x)]);
    }
    pts.push([2.0, podBack], [-2.0, podBack]);
    for (let i = 16; i >= 0; i--) {
      const x = lerp(L.pierX - 0.6, 2.0, i / 16);
      pts.push([-x, L.arcC - Math.sqrt(Rb * Rb - x * x)]);
    }
    pts.push([-podHalfW, L.pierZ - 0.75]);
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: yPod - yLand, bevelEnabled: false });
    g.rotateX(-Math.PI / 2).translate(0, yLand, 0);
    kit.add('white', g);
    // 앞면 쇠시리(직선 띠) - 아래 굽, 위 코니스
    const H = yPod - yLand, W = podHalfW * 2;
    const run = (key, y0, y1, out) => {
      kit.box(key, W + out * 2, y1 - y0, out, 0, yLand + (y0 + y1) / 2, podFront + out / 2);
      for (const sd of [-1, 1]) kit.box(key, out, y1 - y0, podFront - (L.pierZ - 0.75) + out, sd * (podHalfW + out / 2), yLand + (y0 + y1) / 2, (podFront + L.pierZ - 0.75 + out) / 2);
    };
    run('white', 0, 0.3, 0.08);
    run('white', 0.3, 0.38, 0.055);
    run('white', 0.38, 0.46, 0.03);
    run('grey', 0.5, 0.98, 0.006);
    run('white', 0.98, 1.05, 0.03);
    run('white', 1.7, 1.75, 0.025);
    run('white', H - 0.25, H - 0.17, 0.035);
    run('white', H - 0.15, H - 0.08, 0.07);
    run('white', H - 0.08, H, 0.12);
    // 판벽 띠(사진 텍스처, 조각 블록+각력암 판 한 단위 = 1.01 m, 띠 높이 0.65 m)
    const UNIT = 1.01;
    const pw = W, ph = 0.65, py = yLand + 1.05;
    const pg = new THREE.PlaneGeometry(pw, ph);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * pw / UNIT + 0.5);
    pg.translate(0, py + ph / 2, podFront + 0.004);
    kit.add('podiumPanels', pg, true);
    // 옆면 판벽
    for (const sd of [-1, 1]) {
      const d = podFront - (L.pierZ - 0.75);
      const sg = new THREE.PlaneGeometry(d, ph);
      const su = sg.attributes.uv;
      for (let i = 0; i < su.count; i++) su.setX(i, su.getX(i) * d / UNIT);
      sg.rotateY(sd * Math.PI / 2).translate(sd * (podHalfW + 0.004), py + ph / 2, (podFront + L.pierZ - 0.75) / 2);
      kit.add('podiumPanels', sg, true);
    }
  }

  /* ---- 양끝 각주(부조 패널과 붉은 등) ---- */
  for (const sd of [-1, 1]) {
    const x = sd * L.pierX, z = L.pierZ, w = L.pierW, y0 = L.yPod;
    kit.box('white', w + 0.16, 0.2, w + 0.16, x, y0 + 0.1, z);
    kit.box('white', w + 0.09, 0.08, w + 0.09, x, y0 + 0.24, z);
    kit.box('white', w, L.pierCap - y0 - 0.28, w, x, (y0 + 0.28 + L.pierCap) / 2, z);
    // 부조판: 앞면 2장(세로로 긴 판) + 아래 작은 정사각 판 2장, 옆면 1장
    const relief = (face, cx, cy, pw, ph, tex) => {
      const g = new THREE.PlaneGeometry(pw, ph);
      if (tex === 'small') { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5); }
      if (face === 'front') g.translate(x + cx, cy, z + w / 2 + 0.004);
      else g.rotateY(face * Math.PI / 2).translate(x + face * (w / 2 + 0.004), cy, z + cx);
      kit.add(tex === 'small' ? 'pierReliefSmall' : 'pierRelief', g, true);
    };
    const top = L.pierCap - 0.12, bot = y0 + 0.91;
    for (const face of ['front', sd, -sd]) {
      relief(face, 0, (top + bot) / 2, 0.64, top - bot, 'tall');
      relief(face, 0, y0 + 0.55, 0.62, 0.48, 'small');
    }
    // 판 테두리(앞면)
    for (const [yy, hh] of [[top + 0.02, 0.04], [bot - 0.02, 0.04], [y0 + 0.81, 0.04], [y0 + 0.29, 0.04]]) kit.box('white', 0.72, hh, 0.03, x, yy, z + w / 2 + 0.012);
    for (const cx of [-0.34, 0.34]) kit.box('white', 0.04, top - y0 - 0.27, 0.03, x + cx, (top + y0 + 0.27) / 2, z + w / 2 + 0.012);
    // 기둥머리 띠: 소용돌이 까치발과 가운데 조개 장식
    kit.box('white', w + 0.06, 0.3, w + 0.06, x, L.pierCap + 0.15, z);
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        const vol = new THREE.TorusGeometry(0.075, 0.03, 8, 16, Math.PI * 1.5).rotateY(Math.PI / 2).translate(x + cx * (w / 2 + 0.01), L.pierCap + 0.17, z + cz * (w / 2 - 0.08));
        kit.add('white', vol);
      }
    }
    kit.add('white', new THREE.SphereGeometry(0.11, 12, 8, 0, TAU, 0, Math.PI / 2).scale(1, 1.2, 0.5).translate(x, L.pierCap + 0.1, z + w / 2 + 0.03));
    kit.box('white', w + 0.2, 0.06, w + 0.2, x, L.pierCap + 0.33, z);
    kit.box('white', w + 0.26, 0.1, w + 0.26, x, L.pierCap + 0.41, z);
    kit.box('white', 0.55, 0.14, 0.55, x, L.pierTop + 0.07, z);
    // 등: 청동 받침 + 붉은 유리
    kit.lathe('bronze', [[0, 0], [0.18, 0], [0.16, 0.05], [0.06, 0.1], [0.05, 0.3], [0.09, 0.38], [0.12, 0.42], [0.0, 0.42]], x, L.pierTop + 0.14, z, 16);
    kit.lathe('lamp', [[0, 0], [0.1, 0.02], [0.12, 0.1], [0.11, 0.2], [0.07, 0.25], [0, 0.25]], x, L.pierTop + 0.56, z, 16);
    kit.lathe('bronze', [[0, 0], [0.08, 0], [0.06, 0.05], [0.02, 0.12], [0, 0.14]], x, L.pierTop + 0.8, z, 12);
  }

  /* ---- 반원 열주(양 날개) ---- */
  for (const sd of [-1, 1]) {
    const { thJ, thP, arcR, arcC, yPod } = L;
    const phi0 = sd > 0 ? Math.PI - thP : Math.PI + thJ, phiL = thP - thJ;
    const seg = 28;
    const ring = (key, prof) => kit.lathe(key, prof.map(([d, y]) => [arcR - d, y]), 0, 0, arcC, seg, phi0, phiL);
    // 난간 받침 띠(기단 위)
    ring('white', [[-0.24, yPod], [-0.24, yPod + 0.12], [0.24, yPod + 0.12], [0.24, yPod], [-0.24, yPod]]);
    // 기둥
    const colTh = [1, 2, 3].map((k) => thJ + (k * (thP - thJ)) / 4);
    for (const th of colTh) {
      const [x, z] = arcPt(sd, th);
      column(kit, THREE, { x, z, y0: yPod + 0.12, r: 0.11, baseH: 0.14, shaftH: L.colEntB - yPod - 0.12 - 0.14 - 0.24, capH: 0.24, shaft: 'yellow', base: 'white', cap: 'gold', seg: 18, plinth: true });
    }
    // 난간: 칸마다 위아래 가로대와 동자
    const bays = [thJ + 0.012, ...colTh, thP - 0.004];
    for (let b = 0; b < 4; b++) {
      const a0 = bays[b] + 0.017, a1 = bays[b + 1] - 0.017;
      const p0 = sd > 0 ? Math.PI - a1 : Math.PI + a0;
      kit.lathe('white', [[0.12, yPod + 0.12], [0.12, yPod + 0.2], [-0.12, yPod + 0.2], [-0.12, yPod + 0.12]].map(([d, y]) => [arcR - d, y]), 0, 0, arcC, 6, p0, a1 - a0);
      kit.lathe('white', [[0.13, yPod + 0.64], [0.13, yPod + 0.74], [-0.13, yPod + 0.74], [-0.13, yPod + 0.64]].map(([d, y]) => [arcR - d, y]), 0, 0, arcC, 6, p0, a1 - a0);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const th = lerp(a0, a1, (i + 0.5) / n);
        const [x, z] = arcPt(sd, th);
        kit.lathe('white', BALUSTER, x, yPod + 0.2, z, 10);
      }
      // 칸 끝 동자기둥 위 솔방울 장식
      for (const th of [a0 + 0.004, a1 - 0.004]) {
        if (b === 0 && th < a0 + 0.01) continue;
        const [x, z] = arcPt(sd, th);
        kit.box('white', 0.1, 0.44, 0.1, x, yPod + 0.42, z);
        kit.lathe('white', [[0, 0], [0.04, 0], [0.05, 0.05], [0.035, 0.11], [0, 0.15]], x, yPod + 0.74, z, 10);
      }
    }
    // 엔타블러처(살구빛 대리석): 뒤-아래 → 뒤-위 → 앞-위 → 앞(쇠시리) → 앞-아래
    const eB = L.colEntB, eT = L.colEntT;
    ring('white', [[-0.22, eT - 0.2], [-0.22, eT], [0.26, eT], [0.26, eT - 0.05], [0.21, eT - 0.11], [0.18, eT - 0.12], [0.17, eT - 0.18], [0.15, eT - 0.2], [-0.22, eT - 0.2]]);
    ring('pink', [[-0.21, eB + 0.2], [-0.21, eT - 0.2], [0.145, eT - 0.2], [0.145, eB + 0.2], [-0.21, eB + 0.2]]);
    ring('white', [[-0.22, eB], [-0.22, eB + 0.2], [0.15, eB + 0.2], [0.13, eB + 0.18], [0.13, eB + 0.1], [0.12, eB + 0.1], [0.12, eB], [-0.22, eB]]);
    ring('gold', [[0.13, eB + 0.19], [0.158, eB + 0.19], [0.158, eB + 0.215], [0.13, eB + 0.215]]);
    // 위 장식: 칸 가운데 아기천사 머리, 기둥 위 청동 촛대
    const ch = cherubHead(THREE, 0.42);
    ch.scale(1.35, 1.35, 1.35);
    for (let b = 0; b < 4; b++) {
      const th = (bays[b] + bays[b + 1]) / 2;
      const [x, z] = arcPt(sd, th, -0.12);
      const g = ch.clone().rotateY(sd * th).translate(x, eT, z);
      kit.add('white', g);
    }
    for (const th of colTh) {
      const [x, z] = arcPt(sd, th, -0.02);
      kit.lathe('bronze', [[0, 0], [0.07, 0], [0.05, 0.04], [0.025, 0.1], [0.05, 0.16], [0.02, 0.2], [0.03, 0.26], [0.008, 0.36], [0, 0.4]], x, eT, z, 10);
    }
  }

  /* ---- 닫집 ---- */
  {
    const b = L.bc, yP = L.yPod;
    // 기둥 받침대
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * b, z = sz * b;
      kit.box('white', 0.66, 0.08, 0.66, x, yP + 0.04, z);
      kit.box('white', 0.6, 0.32, 0.6, x, yP + 0.24, z);
      kit.box('white', 0.66, 0.06, 0.66, x, yP + 0.43, z);
      column(kit, THREE, { x, z, y0: yP + 0.46, r: 0.2, baseH: 0.2, shaftH: L.colTop - yP - 0.46 - 0.2 - 0.5, capH: 0.5, shaft: 'grey', base: 'white', cap: 'gold', seg: 28, plinth: false });
    }
    // 엔타블러처: 아키트레이브(흰색) / 프리즈(붉은 판) / 코니스
    const e0 = L.colTop;
    kit.box('white', 3.36, 0.24, 3.36, 0, e0 + 0.12, 0);
    kit.box('gold', 3.4, 0.03, 3.4, 0, e0 + 0.25, 0);
    kit.box('white', 3.32, 0.32, 3.32, 0, e0 + 0.42, 0);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BoxGeometry(2.1, 0.2, 0.02).translate(0, e0 + 0.42, 1.67).rotateY(i * Math.PI / 2);
      kit.add('red', g);
      for (const cx of [-1.3, 1.3]) kit.add('red', new THREE.BoxGeometry(0.3, 0.2, 0.02).translate(cx, e0 + 0.42, 1.67).rotateY(i * Math.PI / 2));
    }
    kit.box('white', 3.5, 0.05, 3.5, 0, e0 + 0.605, 0);
    // 치아 장식(덴틸)
    for (let i = 0; i < 4; i++) for (let k = -16; k <= 16; k++) kit.add('white', new THREE.BoxGeometry(0.05, 0.055, 0.06).translate(k * 0.1, e0 + 0.655, 1.76).rotateY(i * Math.PI / 2));
    kit.box('white', 3.7, 0.1, 3.7, 0, e0 + 0.73, 0);
    kit.box('white', 3.64, 0.05, 3.64, 0, e0 + 0.805, 0);
    // 다락(아틱)과 모서리 받침
    const a0 = L.entTop;
    kit.box('white', 3.1, L.atticTop - a0, 3.1, 0, (a0 + L.atticTop) / 2, 0);
    kit.box('white', 3.2, 0.06, 3.2, 0, L.atticTop - 0.03, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      kit.box('white', 0.52, 0.45, 0.52, sx * 1.48, a0 + 0.225, sz * 1.48);
      kit.box('white', 0.58, 0.06, 0.58, sx * 1.48, a0 + 0.48, sz * 1.48);
    }
    // 북(드럼)과 까치발
    { const dh0 = L.drumTop - L.atticTop; kit.lathe('white', [[0, 0], [1.3, 0], [1.3, 0.04], [1.22, 0.06], [1.22, dh0 - 0.04], [1.28, dh0 - 0.02], [1.28, dh0], [0, dh0]], 0, L.atticTop, 0, 40); }
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU;
      const scroll = sweepTube(THREE, [V(0, 0.28, 0), V(0, 0.12, 0.12), V(0, 0.02, 0.2), V(0, 0.08, 0.27), V(0, 0.14, 0.23)], (t) => 0.035 * (1 - 0.4 * t), { seg: 12, radial: 6 });
      scroll.translate(0, L.atticTop - 0.06, 1.22).rotateY(a);
      kit.add('gold', scroll);
    }
    // 돔: 흰 갈빗대 8개 + 금빛 격자판 + 안쪽 어두운 껍질
    const d0 = L.drumTop, dh = L.domeTop - d0, dr = 1.18;
    const domeR = (t) => dr * Math.cos(t * Math.PI / 2) ** 0.9; // t: 0 아래 → 1 꼭대기
    {
      const prof = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push([Math.max(0.001, domeR(t) - 0.02), d0 + dh * Math.sin(t * Math.PI / 2) ** 1.0 * 1.0]); }
      kit.lathe('domeDark', prof.map(([r, y]) => [r * 0.93, y]), 0, 0, 0, 32);
      const lat = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 0)), 48);
      kit.add('lattice', lat, true);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const rp = [];
        for (let k = 0; k <= 14; k++) { const t = k / 14 * 0.92; rp.push(V(0, d0 + dh * Math.sin(t * Math.PI / 2), domeR(t) + 0.035)); }
        const rib = sweepTube(THREE, rp, (t) => [0.05, 0.075 * (1 - 0.5 * t)], { seg: 20, radial: 8, up: V(0, 0, 1) });
        rib.rotateY(a);
        kit.add('white', rib);
      }
      // 아래 테
      kit.lathe('white', [[0, 0], [1.26, 0], [1.26, 0.12], [1.2, 0.16], [0, 0.16]], 0, d0, 0, 40);
      kit.lathe('gold', [[1.0, 0.16], [1.205, 0.16], [1.205, 0.19], [1.0, 0.19]], 0, d0, 0, 40);
      // 등롱(랜턴)과 금빛 구슬
      kit.lathe('white', [[0, 0], [0.3, 0], [0.3, 0.05], [0.22, 0.08], [0.2, 0.28], [0.26, 0.31], [0.26, 0.36], [0, 0.36]], 0, L.domeTop - 0.1, 0, 20);
      kit.lathe('gold', [[0, 0], [0.12, 0.03], [0.14, 0.1], [0.1, 0.18], [0, 0.2]], 0, L.domeTop + 0.26, 0, 16);
    }
    // 꼭대기 천사와 네 모서리 푸토
    const ang = buildAngel(THREE, 1.4);
    ang.translate(0, L.domeTop + 0.42, 0);
    kit.add('gold', ang);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = buildPutto(THREE, 0.72, (sx + 2) * 3 + sz);
      p.rotateY(Math.atan2(sx, sz) * 0.6).translate(sx * 1.48, L.entTop + 0.51, sz * 1.48);
      kit.add('gold', p);
    }

    // 안쪽 감실: 앞·옆·뒤 아치 벽, 노란 기둥, 임포스트, 격자 볼트
    const spring = L.spring, ar = 0.78, aw = 0.15;
    const archWall = (rot, dz = 0.9) => {
      const sh = new THREE.Shape();
      sh.moveTo(-1.62, spring - 0.02); sh.lineTo(1.62, spring - 0.02); sh.lineTo(1.62, L.colTop); sh.lineTo(-1.62, L.colTop); sh.closePath();
      const hp = new THREE.Path();
      hp.moveTo(ar + aw, spring - 0.02);
      hp.absarc(0, spring, ar + aw, 0, Math.PI, false);
      hp.lineTo(-(ar + aw), spring - 0.02);
      sh.holes.push(hp);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: false, curveSegments: 24 });
      g.translate(0, 0, dz).rotateY(rot);
      kit.add('white', g);
      // 아치 테(아키볼트)
      const ring = new THREE.Shape();
      ring.absarc(0, spring, ar + aw, 0, Math.PI, false);
      ring.lineTo(-ar, spring);
      ring.absarc(0, spring, ar, Math.PI, 0, true);
      ring.lineTo(ar + aw, spring);
      const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.3, bevelEnabled: false, curveSegments: 24 });
      rg.translate(0, 0, dz - 0.02).rotateY(rot);
      kit.add('white', rg);
      const gl = new THREE.TorusGeometry(ar + aw, 0.018, 6, 32, Math.PI).translate(0, spring, dz + 0.29).rotateY(rot);
      kit.add('gold', gl);
      // 이맛돌 까치발(금빛)
      kit.add('gold', new THREE.BoxGeometry(0.18, L.colTop - spring - ar + 0.02, 0.12).translate(0, (spring + ar + L.colTop) / 2, dz + 0.3).rotateY(rot));
      // 스팬드럴 원판(짙은 녹색 대리석 + 금테)
      for (const cx of [-1.25, 1.25]) {
        kit.add('dark', new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24).rotateX(Math.PI / 2).translate(cx, 6.1, dz + 0.25).rotateY(rot));
        kit.add('gold', new THREE.TorusGeometry(0.16, 0.018, 6, 24).translate(cx, 6.1, dz + 0.26).rotateY(rot));
      }
    };
    for (let i = 0; i < 4; i++) archWall(i * Math.PI / 2, i === 0 ? 0.9 : 1.18);
    // 옆 아치 아래를 막는 감실 옆벽(분홍) - 앞뒤 노란 기둥 사이
    for (const sx of [-1, 1]) {
      kit.box('pink', 0.22, spring - yP, 2.0, sx * 1.2, (spring + yP) / 2, -0.05);
      kit.box('dark', 0.02, 1.3, 1.5, sx * 1.085, yP + 1.5, -0.05);
      // 옆 아치 안쪽 반원을 채우는 벽
      const fill = new THREE.CircleGeometry(ar + aw, 24, 0, Math.PI).rotateY(sx * Math.PI / 2).translate(sx * 1.2, spring, 0);
      kit.add('pink', fill);
    }
    // 뒤벽(짙은 대리석 판 + 분홍 틀)
    kit.box('pink', 2.4, L.colTop - yP, 0.2, 0, (L.colTop + yP) / 2, -1.02);
    kit.box('dark', 1.6, 1.9, 0.02, 0, yP + 2.2, -0.91);
    kit.add('pink', new THREE.CircleGeometry(ar + aw, 24, 0, Math.PI).translate(0, spring, -0.9));
    // 격자 볼트(반원통 안쪽)
    {
      const vg = new THREE.CylinderGeometry(ar, ar, 2.1, 24, 1, true, -Math.PI / 2, Math.PI);
      vg.rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      // 안쪽을 보도록 면 뒤집기
      const idx = vg.index.array;
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      vg.computeVertexNormals();
      const nrm = vg.attributes.normal;
      vg.translate(0, spring, -0.0);
      const uv = vg.attributes.uv;
      for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * 2.0); uv.setY(i, uv.getY(i) * 1.0); }
      kit.add('coffer', vg, true);
    }
    // 노란 기둥 쌍(좌우 각 2개)과 임포스트 블록
    for (const sx of [-1, 1]) {
      for (const z of [1.02, 0.35]) {
        const x = sx * 0.98;
        kit.box('white', 0.3, 0.3, 0.3, x, yP + 0.15, z);
        column(kit, THREE, { x, z, y0: yP + 0.3, r: 0.105, baseH: 0.12, shaftH: spring - 0.42 - yP - 0.3 - 0.12 - 0.22, capH: 0.22, shaft: 'yellow', base: 'white', cap: 'gold', seg: 16, plinth: false });
      }
      kit.box('white', 0.42, 0.14, 1.1, sx * 0.98, spring - 0.35, 0.68);
      kit.box('pink', 0.4, 0.14, 1.06, sx * 0.98, spring - 0.21, 0.68);
      kit.box('white', 0.5, 0.05, 1.18, sx * 0.98, spring - 0.115, 0.68);
      kit.box('white', 0.54, 0.09, 1.22, sx * 0.98, spring - 0.045, 0.68);
    }
    // 조각상 받침대
    kit.box('white', 1.2, 0.12, 0.95, 0, yP + 0.06, L.statueZ);
    kit.box('white', 1.06, L.statueY - yP - 0.3, 0.82, 0, (yP + 0.12 + L.statueY - 0.18) / 2, L.statueZ);
    kit.box('white', 1.16, 0.08, 0.9, 0, L.statueY - 0.24, L.statueZ);
    kit.box('white', 1.2, 0.08, 0.95, 0, L.statueY - 0.17, L.statueZ);
  }

  /* ---- 주 제단(멘사), 계단식 촛대단(그라디네), 감실(타베르나쿨룸), 십자가 ---- */
  {
    const m = L.mensa, y0 = L.yLand;
    kit.box('white', m.hw * 2 - 0.1, 0.1, m.z1 - m.z0 - 0.05, 0, y0 + 0.05, (m.z0 + m.z1) / 2);
    kit.box('white', m.hw * 2, m.top - y0 - 0.22, m.z1 - m.z0 - 0.12, 0, (y0 + 0.1 + m.top - 0.12) / 2, (m.z0 + m.z1 - 0.12) / 2);
    kit.box('white', m.hw * 2 + 0.12, 0.12, m.z1 - m.z0 + 0.05, 0, m.top - 0.06, (m.z0 + m.z1 + 0.05) / 2);
    // 앞면: 녹색 대리석 판 3장과 사이 기둥
    for (const cx of [-1.1, 0, 1.1]) {
      kit.box('grey', 0.86, 0.5, 0.02, cx, y0 + 0.55, m.z1 - 0.115);
      kit.box('gold', 0.9, 0.02, 0.03, cx, y0 + 0.81, m.z1 - 0.11);
      kit.box('gold', 0.9, 0.02, 0.03, cx, y0 + 0.29, m.z1 - 0.11);
    }
    for (const cx of [-1.65, -0.55, 0.55, 1.65]) kit.box('white', 0.14, 0.82, 0.06, cx, y0 + 0.52, m.z1 - 0.1);
    // 제대보: 흰 천 + 앞으로 늘어진 레이스
    {
      const cg = [new THREE.BoxGeometry(m.hw * 2 + 0.2, 0.012, m.z1 - m.z0 + 0.06).translate(0, m.top + 0.006, (m.z0 + m.z1 + 0.06) / 2)];
      for (const sx of [-1, 1]) cg.push(new THREE.BoxGeometry(0.012, 0.3, m.z1 - m.z0 + 0.06).translate(sx * (m.hw + 0.1), m.top - 0.14, (m.z0 + m.z1 + 0.06) / 2));
      const cloth = new THREE.Mesh(merge(THREE, cg.map((g) => worldUV(THREE, g, 1))), M.linen);
      cloth.name = 'altarCloth';
      root.add(cloth);
      const lace = new THREE.PlaneGeometry(m.hw * 2 + 0.2, 0.3);
      const uv = lace.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 12);
      lace.translate(0, m.top - 0.15 + 0.005, m.z1 + 0.067);
      const lm = new THREE.Mesh(lace, M.lace);
      lm.name = 'altarLace';
      root.add(lm);
    }
    // 그라디네 2단
    kit.box('white', 3.3, 0.14, 0.45, 0, m.top + 0.07, m.z0 + 0.225);
    kit.box('white', 3.1, 0.14, 0.25, 0, m.top + 0.21, m.z0 + 0.125);
    // 촛대 6 + 초
    for (const cx of [-1.45, -1.05, -0.7, 0.7, 1.05, 1.45]) {
      const hi = Math.abs(cx) > 1;
      const yb = m.top + (hi ? 0.28 : 0.14), z = hi ? m.z0 + 0.12 : m.z0 + 0.34;
      kit.lathe('gold', [[0, 0], [0.09, 0], [0.08, 0.04], [0.03, 0.08], [0.025, 0.2], [0.045, 0.23], [0.02, 0.27], [0.02, 0.38], [0.05, 0.4], [0.05, 0.42], [0, 0.42]], cx, yb, z, 12);
      kit.lathe('candle', [[0, 0], [0.025, 0], [0.025, 0.42], [0.012, 0.43], [0, 0.43]], cx, yb + 0.42, z, 10);
    }
    // 감실: 받침, 몸체(흰 대리석), 녹색 기둥 4, 금 문, 박공
    const tz0 = m.z0, tz1 = m.z0 + 0.62, ty = m.top + 0.28, tw = 0.56;
    kit.box('white', tw * 2 + 0.16, 0.12, 0.7, 0, ty + 0.06, (tz0 + tz1) / 2);
    kit.box('white', tw * 2 + 0.06, 0.08, 0.66, 0, ty + 0.16, (tz0 + tz1) / 2);
    kit.box('white', tw * 2 - 0.1, 0.78, 0.56, 0, ty + 0.59, (tz0 + tz1) / 2 - 0.02);
    for (const sx of [-1, -0.62, 0.62, 1]) {
      const zz = tz1 - 0.06;
      kit.box('white', 0.13, 0.08, 0.13, sx * (tw - 0.06), ty + 0.24, zz);
      kit.lathe('verde', [[0, 0], [0.042, 0], [0.036, 0.62], [0, 0.62]], sx * (tw - 0.06), ty + 0.28, zz, 10);
      kit.box('gold', 0.11, 0.07, 0.11, sx * (tw - 0.06), ty + 0.935, zz);
    }
    const door = new THREE.Shape();
    door.moveTo(-0.17, 0); door.lineTo(0.17, 0); door.lineTo(0.17, 0.36); door.absarc(0, 0.36, 0.17, 0, Math.PI, false); door.closePath();
    const dg = new THREE.ExtrudeGeometry(door, { depth: 0.025, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.012, bevelSegments: 2 });
    dg.translate(0, ty + 0.3, tz1 - 0.04);
    kit.add('gold', dg);
    kit.box('white', tw * 2 + 0.08, 0.1, 0.68, 0, ty + 1.02, (tz0 + tz1) / 2);
    kit.box('gold', tw * 2 + 0.1, 0.025, 0.7, 0, ty + 1.08, (tz0 + tz1) / 2);
    const ped = new THREE.Shape();
    ped.moveTo(-tw - 0.06, 0); ped.lineTo(tw + 0.06, 0); ped.lineTo(0, 0.3); ped.closePath();
    const pg = new THREE.ExtrudeGeometry(ped, { depth: 0.66, bevelEnabled: false });
    pg.translate(0, ty + 1.09, tz0 - 0.02);
    kit.add('white', pg);
    for (const sx of [-1, 1]) kit.lathe('gold', [[0, 0], [0.05, 0], [0.04, 0.06], [0.06, 0.1], [0.02, 0.16], [0, 0.17]], sx * (tw + 0.02), ty + 1.09, tz1 - 0.08, 10);
    // 십자가 받침과 금 십자가(빛살)
    const cz = tz0 + 0.3, cy = ty + 1.37;
    kit.lathe('white', [[0, 0], [0.24, 0], [0.24, 0.06], [0.2, 0.08], [0.2, 0.16], [0.22, 0.18], [0, 0.18]], 0, cy - 0.02, cz, 20);
    kit.lathe('gold', [[0, 0], [0.11, 0], [0.1, 0.03], [0.05, 0.06], [0.07, 0.1], [0.03, 0.14], [0.025, 0.22], [0.05, 0.25], [0.015, 0.28], [0, 0.28]], 0, cy + 0.16, cz, 12);
    const crossY = cy + 0.44;
    kit.box('gold', 0.03, 0.55, 0.025, 0, crossY + 0.275, cz);
    kit.box('gold', 0.26, 0.03, 0.025, 0, crossY + 0.4, cz);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, len = i % 2 ? 0.07 : 0.12;
      kit.add('gold', new THREE.BoxGeometry(0.01, len, 0.008).translate(0, 0.045 + len / 2, 0).rotateZ(a).translate(0, crossY + 0.4, cz - 0.01));
    }
    kit.add('gold', sweepTube(THREE, [V(0, crossY + 0.37, cz + 0.025), V(0, crossY + 0.24, cz + 0.03), V(0, crossY + 0.14, cz + 0.025)], () => 0.014, { seg: 6, radial: 6 }));
  }

  /* ---- 큰 청동 촛대 2(제단 양옆, 발판 위) ---- */
  for (const sx of [-1, 1]) {
    const x = sx * 2.75, z = 2.55, y = L.yLand;
    kit.lathe('bronze', [[0, 0], [0.32, 0], [0.3, 0.06], [0.18, 0.14], [0.14, 0.3], [0.09, 0.4], [0.11, 0.48], [0.06, 0.56], [0.055, 1.2], [0.1, 1.26], [0.06, 1.32], [0.05, 1.6], [0.09, 1.66], [0, 1.68]], x, y, z, 16);
    const arms = [[0.55, 1.72, 8], [0.32, 1.95, 6]];
    for (const [rr, yy, n] of arms) {
      kit.add('bronze', new THREE.TorusGeometry(rr, 0.022, 6, 24).rotateX(Math.PI / 2).translate(x, y + yy, z));
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        const cx = x + Math.sin(a) * rr, czz = z + Math.cos(a) * rr;
        kit.add('bronze', sweepTube(THREE, [V(x, y + 1.64, z), V(x + Math.sin(a) * rr * 0.6, y + yy - 0.12, z + Math.cos(a) * rr * 0.6), V(cx, y + yy, czz)], () => 0.018, { seg: 8, radial: 5 }));
        kit.lathe('bronze', [[0, 0], [0.05, 0], [0.04, 0.05], [0, 0.06]], cx, y + yy, czz, 8);
        kit.lathe('candle', [[0, 0], [0.022, 0], [0.022, 0.3], [0, 0.31]], cx, y + yy + 0.05, czz, 8);
      }
    }
    kit.lathe('candle', [[0, 0], [0.026, 0], [0.026, 0.35], [0, 0.36]], x, y + 2.05, z, 8);
  }

  /* ---- 후진 벽의 청동 부조 2점(마이어 에데) - 선택 사항: 통합 시 후진 벽 담당과 겹치면 숨길 것 ---- */
  {
    const rel = new THREE.Group();
    rel.name = 'apseReliefs';
    const { zO, R } = L.apse, r = R - 0.06, y0 = 6.7, y1 = 9.3, dphi = 0.6, pc = 0.707;
    for (const sd of [-1, 1]) {
      const geo = paramSurface(THREE, 24, 1, (u, v, o) => {
        const ph = sd < 0 ? pc + dphi / 2 - u * dphi : pc - dphi / 2 + u * dphi;
        o[0] = sd * r * Math.sin(ph); o[1] = lerp(y0, y1, v); o[2] = zO - r * Math.cos(ph);
      });
      const m = new THREE.Mesh(geo, sd < 0 ? M.reliefL : M.reliefR);
      m.name = sd < 0 ? 'reliefLeft' : 'reliefRight';
      rel.add(m);
      // 금테
      const arc = (yy) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const ph = pc - dphi / 2 - 0.012 + (i / 16) * (dphi + 0.024); pts.push(new THREE.Vector3(sd * (r - 0.03) * Math.sin(ph), yy, zO - (r - 0.03) * Math.cos(ph))); }
        return pts;
      };
      kit.add('gold', sweepTube(THREE, arc(y0 - 0.05), () => [0.06, 0.06], { seg: 32, radial: 4, up: new THREE.Vector3(0, 1, 0) }));
      kit.add('gold', sweepTube(THREE, arc(y1 + 0.05), () => [0.06, 0.06], { seg: 32, radial: 4, up: new THREE.Vector3(0, 1, 0) }));
      for (const ph of [pc - dphi / 2 - 0.006, pc + dphi / 2 + 0.006]) {
        const x = sd * (r - 0.03) * Math.sin(ph), z = zO - (r - 0.03) * Math.cos(ph);
        kit.add('gold', new THREE.BoxGeometry(0.1, y1 - y0 + 0.2, 0.1).rotateY(-sd * ph).translate(x, (y0 + y1) / 2, z));
      }
    }
    root.add(rel);
  }

  const meshes = kit.build(root, M);

  /* ---- 성 이슈트반 상 ---- */
  const statue = buildStatue(THREE, M);
  statue.scale.setScalar(L.FH);
  statue.position.set(0, L.statueY, L.statueZ);
  root.add(statue);
  return { root, meshes, statue };
}

/* ============================== 재질 ============================== */
function makeMaterials(THREE, base) {
  const loader = new THREE.TextureLoader();
  const dir = base + 'altar/';
  const tex = (name, { srgb = true, repeat = true } = {}) => {
    const t = loader.load(dir + name);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const marble = (name, o = {}) => new THREE.MeshPhysicalMaterial({ map: tex(name), roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.25, ...o });
  const M = {};
  M.statue = statueMaterials(THREE).marble;
  M.white = marble('marble_white.jpg', { roughness: 0.38, clearcoat: 0.2 });
  M.floorWhite = M.white;
  M.step = marble('marble_white.jpg', { color: '#e4e0da', roughness: 0.32 });
  M.grey = marble('marble_grey.jpg', { roughness: 0.18, clearcoat: 0.6 });
  M.yellow = marble('marble_yellow.jpg', { roughness: 0.2, clearcoat: 0.55 });
  M.pink = marble('marble_pink.jpg', { roughness: 0.32 });
  M.red = marble('marble_red.jpg', { roughness: 0.2, clearcoat: 0.5 });
  M.dark = new THREE.MeshStandardMaterial({ map: tex('marble_dark.jpg'), roughness: 0.32, envMapIntensity: 0.35 });
  M.verde = marble('marble_grey.jpg', { color: '#a9c0ae', roughness: 0.2, clearcoat: 0.5 });
  M.gold = new THREE.MeshStandardMaterial({ color: '#dcae55', metalness: 1, roughness: 0.3 });
  M.bronze = new THREE.MeshStandardMaterial({ color: '#86683c', metalness: 0.9, roughness: 0.42 });
  M.ruby = new THREE.MeshStandardMaterial({ color: '#7a0f12', metalness: 0.1, roughness: 0.2 });
  M.lamp = new THREE.MeshStandardMaterial({ color: '#8a1010', emissive: '#ff2a10', emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.92 });
  M.candle = new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.6 });
  M.carpet = new THREE.MeshStandardMaterial({ color: '#6e1420', roughness: 0.95 });
  M.linen = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.85 });
  M.lace = new THREE.MeshStandardMaterial({ map: tex('lace.png'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  M.domeDark = new THREE.MeshStandardMaterial({ color: '#1d1712', roughness: 0.9, side: THREE.DoubleSide });
  M.lattice = new THREE.MeshStandardMaterial({ map: tex('lattice.png'), alphaTest: 0.5, metalness: 1, roughness: 0.32, color: '#ffffff', side: THREE.DoubleSide });
  M.lattice.map.repeat.set(5, 1);
  M.coffer = new THREE.MeshStandardMaterial({ map: tex('coffer.jpg'), roughness: 0.4 });
  M.podiumPanels = new THREE.MeshPhysicalMaterial({ map: tex('podium_panels.jpg'), roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  M.pierRelief = new THREE.MeshStandardMaterial({ map: tex('pier_relief.jpg', { repeat: false }), roughness: 0.5 });
  M.reliefL = new THREE.MeshStandardMaterial({ map: tex('apse_relief_left.jpg', { repeat: false }), metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });
  M.reliefR = new THREE.MeshStandardMaterial({ map: tex('apse_relief_right.jpg', { repeat: false }), metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });
  M.pierReliefSmall = new THREE.MeshStandardMaterial({ map: tex('pier_relief_small.jpg', { repeat: false }), roughness: 0.5 });
  return M;
}

/* ============================== 조립 ============================== */
export default async function build(THREE, { base = '/real/' } = {}) {
  const part = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('part') : null;
  const M = makeMaterials(THREE, base);
  const group = new THREE.Group();
  group.name = 'mainAltar';
  if (part === 'saints') {
    const atts = ['book', 'cross', 'staff', 'lily', 'none'];
    atts.forEach((a, i) => { const st = makeSaintStatue(THREE, { height: 2.0, attribute: a, seed: i + 1 }); st.position.x = (i - 2) * 0.9; group.add(st); });
    return group;
  }
  if (part === 'statue') {
    const s = buildStatue(THREE, M);
    s.scale.setScalar(L.FH);
    group.add(s);
    return group;
  }
  const { root } = buildEnsemble(THREE, M);
  // 발자국(기단 뒤 ~ 맨 아래 계단 앞) 중심을 원점으로
  const zMid = (L.podBack + L.stepsZ + L.stepN * L.stepD) / 2;
  root.position.z = -zMid;
  group.add(root);
  // 통합용 기준점(모듈 좌표, m)
  group.userData = {
    note: 'research/notes/altar-modeler.md 참고. y=0 은 성소 바닥(제단 앞 5단 계단 아래), +z 는 신랑 쪽.',
    anchors: {
      statueFeet: [0, L.statueY, L.statueZ - zMid],
      statueHead: [0, L.statueY + L.FH, L.statueZ - zMid],
      baldachinCenter: [0, L.yPod, -zMid],
      mensaFront: [0, L.mensa.top, L.mensa.z1 - zMid],
      stepsFront: [0, 0, L.stepsZ + L.stepN * L.stepD - zMid],
      apseCenter: [0, 0, L.apse.zO - zMid],
    },
    apseRadius: L.apse.R,
  };
  return group;
}

/* ============================== 범용 성인상 생성기 ============================== */
// 교차부 기둥 벽감, 수랑 제단 옆 등에 서는 흰 대리석 성인상.
// makeSaintStatue(THREE, { height, attribute: 'book'|'cross'|'staff'|'lily'|'none', halo, seed, material }) → Group
// 원점: 발 아래(얇은 대좌 밑면) 중심, 정면 +z. height = 대좌 밑면~머리 꼭대기(후광 제외). 삼각형 약 1.1~1.3만 개.
let _saintMats = null;
function statueMaterials(THREE) {
  if (_saintMats && _saintMats.T === THREE) return _saintMats;
  _saintMats = {
    T: THREE,
    marble: new THREE.MeshPhysicalMaterial({
      color: '#efe9e0', roughness: 0.42, clearcoat: 0.12, clearcoatRoughness: 0.5,
      sheen: 0.35, sheenColor: new THREE.Color('#fff3e4'), sheenRoughness: 0.7, vertexColors: true, side: THREE.DoubleSide,
    }),
    gold: new THREE.MeshStandardMaterial({ color: '#dcae55', metalness: 1, roughness: 0.3 }),
  };
  return _saintMats;
}

export function makeSaintStatue(THREE, { height = 2.4, attribute = 'book', halo = true, seed = 1, material } = {}) {
  const R = rng((seed * 7919 + 13) >>> 0);
  for (let i = 0; i < 3; i++) R();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mats = statueMaterials(THREE);
  const marble = [];
  const nz1 = noise1(seed * 3 + 1), nz2 = noise1(seed * 3 + 2), nz3 = noise1(seed * 3 + 3);
  const beard = R() < 0.6 ? 1 : 0;
  const longHair = R() < 0.55;
  const mirror = R() < 0.5;
  const sway = (R() - 0.5) * 0.02;
  const turn = (R() - 0.5) * 0.4, tilt = (R() - 0.3) * 0.18;
  const ph0 = R() * 6;
  const flat = (g, c) => { const n = g.attributes.position.count, col = new Float32Array(n * 3).fill(c); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); marble.push(g); return g; };
  const foldAO = (g, f) => {
    const uv = g.attributes.uv, n = uv.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = clamp(f(uv.getX(i), uv.getY(i)), 0.3, 1.05); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    marble.push(g);
  };
  const swayX = (y) => sway * Math.sin(Math.PI * clamp(y / 0.85, 0, 1));

  /* 겉옷(튜닉) */
  const robeT = table([
    [0.03, 0.15, 0.125, 0.015], [0.1, 0.148, 0.12, 0.014], [0.25, 0.14, 0.106, 0.011], [0.4, 0.128, 0.094, 0.008],
    [0.52, 0.112, 0.085, 0.005], [0.58, 0.104, 0.08, 0.005], [0.66, 0.108, 0.08, 0.008], [0.72, 0.118, 0.08, 0.008],
    [0.765, 0.135, 0.076, 0.004], [0.795, 0.13, 0.068, 0.0], [0.82, 0.095, 0.056, 0.002], [0.84, 0.05, 0.043, 0.006], [0.9, 0.034, 0.036, 0.006],
  ]);
  const robeFold = (phi, y) => {
    const A = (0.004 + 0.011 * (1 - y / 0.6)) * smooth(0.62, 0.5, y) + 0.002;
    return A * (0.55 * Math.sin(5 * phi + ph0 + nz1(y * 4) * 0.9) + 0.3 * Math.sin(9 * phi + 1.9 + y * 3 + nz2(y * 5)) + 0.15 * Math.sin(15 * phi + nz3(y * 7) * 2));
  };
  {
    const parts = clothShell(THREE, 40, 30, (u, v, s, o) => {
      const y = lerp(0.9, 0.03, v), phi = u * TAU;
      const [a, b, zc] = robeT(y);
      const [x, z] = se(phi, a, b);
      const front = Math.max(0, Math.cos(phi));
      let d = robeFold(phi, y) + front * smooth(0.55, 0.3, y) * 0.007 * gauss(x - 0.05 * Math.sign(sway || 1), 0.035);
      const r = Math.hypot(x, z) || 1;
      const sc = (r + d - (s ? 0.007 : 0)) / r;
      o[0] = x * sc + swayX(y); o[1] = y; o[2] = z * sc + zc;
    }, { wrapU: true, innerDiv: 3 });
    foldAO(parts[0], (u, v) => { const y = lerp(0.9, 0.03, v); return (0.93 + 0.09 * robeFold(u * TAU, y) / (0.006 + 0.011 * (1 - y / 0.6))) * (0.86 + 0.14 * smooth(0.03, 0.18, y)); });
    for (let i = 1; i < parts.length; i++) flat(parts[i], 0.45);
    // 허리끈
    const belt = paramSurface(THREE, 40, 5, (u, v, o) => {
      const phi = u * TAU, a2 = v * TAU, y0 = 0.575;
      const [a, b, zc] = robeT(y0);
      const [x, z] = se(phi, a, b);
      const r = Math.hypot(x, z), rr = r + 0.004 + 0.006 * Math.cos(a2);
      o[0] = x * rr / r + swayX(y0); o[1] = y0 + 0.006 * Math.sin(a2); o[2] = z * rr / r + zc;
    }, { wrapU: true });
    flat(belt, 0.9);
    // 발끝
    for (const sd of [-1, 1]) flat(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2).scale(0.026, 0.024, 0.058).translate(sd * 0.05, 0, 0.075), 0.92);
  }

  /* 망토: 어깨를 덮고 앞이 열린 큰 천 */
  {
    const mt = table([[0.0, 0.205, 0.17, -0.02], [0.3, 0.19, 0.14, -0.012], [0.55, 0.182, 0.122, -0.01], [0.7, 0.172, 0.106, -0.008], [0.81, 0.148, 0.09, -0.004]]);
    const e1 = R(), e2 = R(), drop = 0.02 + R() * 0.12;
    const mantleFold = (phi, v) => (0.004 + 0.018 * v) * (0.5 * Math.sin(7 * phi + ph0 + nz1(v * 3 + 2) * 1.2) + 0.32 * Math.sin(12 * phi + 2.2 + nz2(v * 4) * 1.5) + 0.18 * Math.sin(19 * phi + nz3(v * 6)));
    const edges = (v) => [-(1.2 + 0.3 * v + 0.3 * e1), 1.2 + 0.25 * v + 0.3 * e2];
    const parts = clothShell(THREE, 44, 34, (u, v, s, o) => {
      const y = lerp(0.81, drop, v);
      const [pr, pl] = edges(v);
      const phi = pr - u * (TAU + pr - pl);
      const [a, b, zc] = mt(y);
      const [x, z] = se(phi, a, b, 2.2);
      let d = mantleFold(phi, v) + 0.006 * smooth(0.04, 0, Math.min(u, 1 - u));
      const r = Math.hypot(x, z);
      const sc = (r + d - (s ? 0.008 : 0)) / r;
      o[0] = x * sc + swayX(y); o[1] = y; o[2] = z * sc + zc;
    }, { innerDiv: 3 });
    foldAO(parts[0], (u, v) => {
      const [pr, pl] = edges(v);
      const phi = pr - u * (TAU + pr - pl);
      return (0.92 + 0.1 * mantleFold(phi, v) / (0.004 + 0.018 * v)) * (0.84 + 0.16 * smooth(-0.6, 0.4, Math.cos(phi)));
    });
    for (let i = 1; i < parts.length; i++) flat(parts[i], 0.42);
  }

  /* 팔과 손, 지물 */
  const sleeve = (pts, r0, r1, rc, sd) => {
    r0 *= 0.9; r1 *= 0.88; rc *= 0.92;
    const nz = noise1(seed * 5 + sd + 7);
    const g = sweepTube(THREE, pts, (t, a) => {
      const base = t < 0.6 ? lerp(r0, r1, t / 0.6) : lerp(r1, rc, (t - 0.6) / 0.4);
      return base * (1 + 0.07 * Math.sin(5 * a + t * 9 + nz(t * 5)) * smooth(0.1, 0.5, t) + 0.05 * smooth(0.92, 1, t));
    }, { seg: 16, radial: 10 });
    bakeCavity(THREE, g, { strength: 3 });
    marble.push(g);
  };
  const fist = (c, rotY = 0) => {
    const hg = [new THREE.SphereGeometry(1, 8, 6).scale(0.016, 0.03, 0.024).translate(-0.016, 0, -0.006)];
    for (let i = 0; i < 4; i++) hg.push(new THREE.TorusGeometry(0.0115, 0.0063, 4, 8, Math.PI * 1.25).rotateX(Math.PI / 2).rotateY(Math.PI * 0.55).translate(0, 0.018 - i * 0.0125, 0));
    const h = merge(THREE, hg);
    h.rotateY(rotY).translate(c.x, c.y, c.z);
    flat(h, 0.9);
  };
  const palm = (c, rx, ry, rz) => {
    const h = new THREE.SphereGeometry(1, 10, 8).scale(0.021, 0.036, 0.009);
    const pos = h.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.012) pos.setX(i, pos.getX(i) * (1 + 0.12 * Math.sin(pos.getX(i) * 400)));
    h.computeVertexNormals();
    h.rotateX(rx).rotateY(ry).rotateZ(rz).translate(c.x, c.y, c.z);
    flat(h, 0.92);
  };
  const SH = (sd) => V(sd * 0.112, 0.79, -0.004);
  const hang = (sd) => { sleeve([SH(sd), V(sd * 0.148, 0.7, 0.0), V(sd * 0.158, 0.6, 0.02), V(sd * 0.158, 0.53, 0.05), V(sd * 0.155, 0.5, 0.06)], 0.038, 0.033, 0.04, sd); palm(V(sd * 0.153, 0.47, 0.066), 0.15, sd * 0.3, 0); };
  const onChest = (sd) => { sleeve([SH(sd), V(sd * 0.15, 0.71, 0.0), V(sd * 0.155, 0.63, 0.04), V(sd * 0.1, 0.66, 0.1), V(sd * 0.05, 0.69, 0.115)], 0.042, 0.038, 0.04, sd); palm(V(sd * 0.035, 0.7, 0.122), -0.1, 0, sd * 1.1); };
  const extra = [];
  const att = attribute || 'none';
  if (att === 'staff') {
    const staffAt = (y) => V(lerp(-0.18, -0.205, y / 0.95), y, lerp(0.1, 0.09, y / 0.95));
    sleeve([SH(-1), V(-0.14, 0.715, -0.004), V(-0.155, 0.625, 0.01), V(-0.168, 0.56, 0.045), V(-0.178, 0.522, 0.07)], 0.042, 0.037, 0.044, -1);
    fist(staffAt(0.49), -0.35);
    const b = staffAt(0.0), t = staffAt(0.93), len = b.distanceTo(t);
    const st = new THREE.CylinderGeometry(0.0065, 0.0075, len, 8).translate(0, len / 2, 0);
    st.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), t.clone().sub(b).normalize())).translate(b.x, b.y, b.z);
    flat(st, 0.95);
    if (R() < 0.5) {
      // 목자 지팡이(크로저) 머리
      const crook = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 1.4; crook.push(V(t.x + 0.04 - 0.04 * Math.cos(a), t.y + 0.04 * Math.sin(a) + i * 0.002, t.z)); }
      flat(sweepTube(THREE, [V(t.x, t.y - 0.02, t.z), ...crook], () => 0.007, { seg: 14, radial: 6 }), 0.95);
    } else {
      flat(new THREE.BoxGeometry(0.01, 0.09, 0.01).translate(t.x, t.y + 0.04, t.z), 0.95);
      flat(new THREE.BoxGeometry(0.06, 0.01, 0.01).translate(t.x, t.y + 0.055, t.z), 0.95);
    }
    onChest(1);
  } else if (att === 'cross') {
    sleeve([SH(-1), V(-0.15, 0.71, 0.0), V(-0.16, 0.625, 0.03), V(-0.12, 0.66, 0.1), V(-0.08, 0.695, 0.122)], 0.042, 0.038, 0.04, -1);
    fist(V(-0.074, 0.705, 0.13), -1.2);
    flat(new THREE.BoxGeometry(0.014, 0.28, 0.014).translate(-0.074, 0.78, 0.132), 0.95);
    flat(new THREE.BoxGeometry(0.13, 0.014, 0.014).translate(-0.074, 0.85, 0.132), 0.95);
    if (R() < 0.5) hang(1); else onChest(1);
  } else if (att === 'book') {
    sleeve([SH(1), V(0.15, 0.71, -0.005), V(0.16, 0.63, 0.02), V(0.12, 0.625, 0.09), V(0.075, 0.63, 0.118)], 0.042, 0.038, 0.04, 1);
    palm(V(0.06, 0.628, 0.128), Math.PI / 2 - 0.2, 0, 0.1);
    const book = merge(THREE, [
      new THREE.BoxGeometry(0.12, 0.16, 0.036),
      new THREE.BoxGeometry(0.124, 0.164, 0.006).translate(0, 0, 0.018),
      new THREE.BoxGeometry(0.124, 0.164, 0.006).translate(0, 0, -0.018),
      new THREE.CylinderGeometry(0.02, 0.02, 0.164, 8, 1, false, 0, Math.PI).rotateY(-Math.PI / 2).translate(-0.062, 0, 0),
    ]);
    book.rotateX(-0.35).rotateY(-0.25).translate(0.045, 0.71, 0.135);
    flat(book, 0.95);
    if (R() < 0.5) { sleeve([SH(-1), V(-0.145, 0.71, 0.0), V(-0.15, 0.63, 0.04), V(-0.09, 0.665, 0.11), V(-0.03, 0.69, 0.138)], 0.042, 0.038, 0.04, -1); palm(V(-0.012, 0.7, 0.148), -0.2, 0.3, -0.4); } else hang(-1);
  } else if (att === 'lily') {
    sleeve([SH(-1), V(-0.15, 0.71, 0.0), V(-0.16, 0.625, 0.03), V(-0.12, 0.645, 0.1), V(-0.08, 0.665, 0.12)], 0.042, 0.038, 0.04, -1);
    fist(V(-0.072, 0.672, 0.128), -1.2);
    const stem = [V(-0.068, 0.6, 0.138), V(-0.072, 0.7, 0.14), V(-0.08, 0.8, 0.15), V(-0.09, 0.9, 0.162)];
    flat(sweepTube(THREE, stem, () => 0.005, { seg: 12, radial: 5 }), 0.95);
    const flower = (p, dir, s) => {
      const f = new THREE.LatheGeometry([[0, 0], [0.006, 0.005], [0.012, 0.025], [0.026, 0.045], [0.03, 0.05]].map(([a, b]) => new THREE.Vector2(a * s, b * s)), 6);
      f.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize())).translate(p.x, p.y, p.z);
      flat(f, 0.97);
    };
    flower(V(-0.09, 0.9, 0.162), V(0, 1, 0.3), 1.2);
    flower(V(-0.085, 0.86, 0.156), V(-1, 0.6, 0.3), 1.0);
    flower(V(-0.082, 0.84, 0.155), V(1, 0.5, 0.4), 1.0);
    for (const [y, sx] of [[0.74, 1], [0.78, -1]]) flat(new THREE.SphereGeometry(1, 6, 4).scale(0.008, 0.03, 0.003).rotateZ(sx * 0.5).translate(-0.075 + sx * 0.012, y, 0.146), 0.93);
    if (R() < 0.5) hang(1); else onChest(1);
  } else {
    // 기도하는 손
    for (const sd of [-1, 1]) {
      sleeve([SH(sd), V(sd * 0.145, 0.71, 0.0), V(sd * 0.15, 0.63, 0.04), V(sd * 0.08, 0.66, 0.11), V(sd * 0.022, 0.69, 0.126)], 0.042, 0.038, 0.04, sd);
      palm(V(sd * 0.008, 0.715, 0.134), -0.15, 0, sd * 0.08);
    }
  }

  /* 목, 머리, 머리카락 */
  {
    const HC = V(0, 0.93, 0.008), HR = V(0.045, 0.058, 0.05);
    const head = merge(THREE, [sculptHead(THREE, HC, HR, 28, 24, beard)]);
    const hair = sculptHair(THREE, HC, HR, 30, 18, longHair);
    bakeCavity(THREE, hair, { strength: 3 });
    const neck = new THREE.CylinderGeometry(0.028, 0.034, 0.08, 10, 1, true).translate(0, 0.865, 0.004);
    flat(neck, 0.75);
    const pivot = new THREE.Matrix4().makeTranslation(0, 0.87, 0).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, turn, 0))).multiply(new THREE.Matrix4().makeTranslation(0, -0.87, 0));
    head.applyMatrix4(pivot); hair.applyMatrix4(pivot);
    marble.push(head, hair);
  }
  // 얇은 대좌
  flat(new THREE.BoxGeometry(0.4, 0.03, 0.34).translate(0, -0.015, 0.0), 0.9);

  const group = new THREE.Group();
  group.name = 'saintStatue';
  const body = new THREE.Mesh(merge(THREE, marble), material || mats.marble);
  body.name = 'saintMarble';
  group.add(body);
  if (halo) {
    const hl = [new THREE.TorusGeometry(0.1, 0.005, 5, 48), new THREE.TorusGeometry(0.078, 0.0035, 4, 40)];
    for (let i = 0; i < 12; i++) hl.push(new THREE.BoxGeometry(0.003, 0.05, 0.002).translate(0, 0.05, 0).rotateZ((i / 12) * TAU));
    const hg = merge(THREE, hl);
    hg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.87, 0).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt * 0.5, turn * 0.5, 0))).multiply(new THREE.Matrix4().makeTranslation(0, 0.08, -0.07)));
    const hm = new THREE.Mesh(hg, mats.gold);
    hm.name = 'saintHalo';
    group.add(hm);
  }
  // 정규화 단위(대좌 밑 -0.03 ~ 머리 1.0)를 실제 높이로
  const s = height / 1.03;
  for (const c of group.children) {
    c.scale.set(mirror ? -s : s, s, s);
    c.position.y = 0.03 * s;
  }
  group.userData = { attribute: att, seed, height };
  return group;
}
