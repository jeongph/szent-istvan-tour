// 성스러운 오른손(Szent Jobb) 성유물함 + 현재 진열 구조(놋쇠 받침대 위의 무테 유리 진열장)
// 근거 사진: Hungary-02502 (Dennis Jarvis, CC BY-SA 2.0), Budapest Hungary 03 (Wilfredor, CC0) 정면 입면,
//           Interior of the Saint Stephen's Basilica (Yair Haklai, CC BY-SA 4.0) 현재 진열장,
//           Budapest bazylika sw Stefana 21/22 (Andrzej Otrębski, CC BY-SA 4.0) 3/4 시점.
// 성유물함 본체는 정면 입면 사진의 픽셀 단위(px)로 모델링하고 S(m/px)로 줄인다. 원점은 받침대 바닥 중심, 정면(+z)은 긴 면.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export default async function build(THREE, { base = '/real/' } = {}) {
  const S = 0.00062; // 정면 사진 1px = 0.62mm (손목 금띠 높이 약 5cm 기준 추정, 노트 참고)
  const PI = Math.PI;
  const V2 = (x, y) => new THREE.Vector2(x, y);

  // ---------- 텍스처 ----------
  const loader = new THREE.TextureLoader();
  const T = async (name, srgb = true, rep = null) => {
    const t = await loader.loadAsync(`${base}reliquary/${name}`);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  };
  const [frLong, frLongMR, frEnd, frEndMR, quat, quatMR, angelP, angelPMR, vine, scales] = await Promise.all([
    T('frieze_long.jpg'), T('frieze_long_mr.png', false), T('frieze_end.jpg'), T('frieze_end_mr.png', false),
    T('quatrefoil_bay.jpg'), T('quatrefoil_bay_mr.png', false), T('angel_panel.jpg'), T('angel_panel_mr.png', false),
    T('cornice_vine.jpg', true, [1, 1]), T('roof_scales_bump.png', false, [1, 1]),
  ]);
  vine.wrapS = THREE.RepeatWrapping;

  // ---------- 재질 ----------
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    silver: std({ color: '#ccd0d5', metalness: 1, roughness: 0.18 }),
    silverDim: std({ color: '#b9bcc1', metalness: 1, roughness: 0.3 }),
    gold: std({ color: '#f2c15a', metalness: 1, roughness: 0.27 }),
    goldDeep: std({ color: '#d9a640', metalness: 1, roughness: 0.34 }),
    roof: std({ color: '#dcdfe3', metalness: 1, roughness: 0.22, bumpMap: scales, bumpScale: 1.0 }),
    dark: std({ color: '#0d0d12', metalness: 0.2, roughness: 0.6 }),
    navy: std({ color: '#141a52', metalness: 0.1, roughness: 0.35 }),
    velvet: std({ color: '#4c0b14', metalness: 0, roughness: 0.95 }),
    hand: std({ color: '#3b2a1e', metalness: 0, roughness: 0.75 }),
    stone: std({ color: '#1e1d1c', metalness: 0, roughness: 0.22 }),
    brass: std({ color: '#d9b36a', metalness: 1, roughness: 0.16 }),
    plate: std({ color: '#141414', metalness: 0.3, roughness: 0.35 }),
    led: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
    ruby: std({ color: '#b3122a', metalness: 0.1, roughness: 0.08 }),
    amethyst: std({ color: '#6a2f8a', metalness: 0.1, roughness: 0.08 }),
    emerald: std({ color: '#178a52', metalness: 0.1, roughness: 0.08 }),
    topaz: std({ color: '#e6d6a8', metalness: 0.2, roughness: 0.08 }),
    aqua: std({ color: '#7fc0d0', metalness: 0.1, roughness: 0.08 }),
    sapphire: std({ color: '#1f3fb0', metalness: 0.1, roughness: 0.08 }),
    frLong: std({ map: frLong, metalnessMap: frLongMR, roughnessMap: frLongMR, metalness: 1, roughness: 1 }),
    frEnd: std({ map: frEnd, metalnessMap: frEndMR, roughnessMap: frEndMR, metalness: 1, roughness: 1 }),
    quat: std({ map: quat, metalnessMap: quatMR, roughnessMap: quatMR, metalness: 1, roughness: 1 }),
    angelP: std({ map: angelP, metalnessMap: angelPMR, roughnessMap: angelPMR, metalness: 1, roughness: 1 }),
    vine: std({ map: vine, color: '#ffe3a0', metalness: 1, roughness: 0.3 }),
  };
  const glassMat = (op = 0.1, tint = '#ffffff') => new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: 0.03, transparent: true, opacity: op, depthWrite: false,
    side: THREE.DoubleSide, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02,
  });
  M.glass = glassMat(0.12);
  M.glassIn = glassMat(0.16, '#fff6e0');
  M.vitrine = glassMat(0.07, '#e8fff6');
  M.vitrineEdge = new THREE.MeshStandardMaterial({ color: '#5fae98', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.55 });

  // ---------- 기하 수집 & 병합 ----------
  const bags = new Map();
  const mtx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  const mul = (...ms) => ms.reduce((a, b) => a.clone().multiply(b));
  function put(mat, geo, m) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (m) {
      g.applyMatrix4(m);
      if (m.determinant() < 0) { // 거울 변환이면 삼각형 감김 방향을 되돌린다
        for (const k of ['position', 'normal', 'uv']) {
          const a = g.attributes[k].array, n = g.attributes[k].itemSize;
          for (let t = 0; t < a.length; t += 3 * n) for (let c = 0; c < n; c++) { const tmp = a[t + n + c]; a[t + n + c] = a[t + 2 * n + c]; a[t + 2 * n + c] = tmp; }
        }
      }
    }
    if (!bags.has(mat)) bags.set(mat, []);
    bags.get(mat).push(g);
  }
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    cyl: (rt, rb, h, n = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open),
    sph: (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs),
    cone: (r, h, n = 8) => new THREE.ConeGeometry(r, h, n),
    torus: (R, r, rs = 6, ts = 24, arc = 2 * PI) => new THREE.TorusGeometry(R, r, rs, ts, arc),
    lathe: (pts, n = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), n),
  };
  // 점 a→b 사이 원기둥
  function rod(mat, a, b, r, n = 6, parent = null) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    put(mat, G.cyl(r, r, L, n, true), parent ? mul(parent, m) : m);
  }
  // 직사각형을 따라 몰딩 단면을 쓸어 만든 띠: prof = [[o, y], ...], 반폭 hl+o, 반깊이 hd+o
  function molding(prof, hl, hd, uvLen = 100, vLen = uvLen) {
    const pos = [], uv = [], idx = [];
    for (let s = 0; s < 4; s++) {
      const ph = (s * PI) / 2, n = [Math.sin(ph), Math.cos(ph)], t = [Math.cos(ph), -Math.sin(ph)];
      const base = pos.length / 3;
      let acc = 0;
      prof.forEach(([o, y], i) => {
        if (i) acc += Math.hypot(o - prof[i - 1][0], y - prof[i - 1][1]);
        const half = (s % 2 ? hd : hl) + o, dist = (s % 2 ? hl : hd) + o;
        for (const e of [-1, 1]) {
          pos.push(n[0] * dist + t[0] * half * e, y, n[1] * dist + t[1] * half * e);
          uv.push((half * e) / uvLen, acc / vLen);
        }
      });
      for (let i = 0; i < prof.length - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // 평면 판(사각형) : 텍스처 붙이기용
  const plane = (w, h) => new THREE.PlaneGeometry(w, h);
  const extrude = (shape, depth, bevel = 0) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10,
  });

  // 첨두아치 점열: 폭 w, 높이 rise(기점→정점), cusp: 삼엽 첨두 깊이
  function archPts(w, rise, cusp = 0, n = 24) {
    const r = (rise * rise + (w / 2) * (w / 2)) / w; // (r - w/2)^2 + rise^2 = r^2
    const cl = -w / 2 + r, th = Math.acos(Math.min(1, Math.max(-1, -cl / r)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let x, y, nx, ny;
      if (t <= 0.5) { const a = PI - (PI - th) * (t / 0.5); x = cl + r * Math.cos(a); y = r * Math.sin(a); nx = cl - x; ny = -y; }
      else { const a = PI - th - (PI - th) * ((t - 0.5) / 0.5); x = -cl + r * Math.cos(a); y = r * Math.sin(a); nx = -cl - x; ny = -y; }
      if (cusp) {
        const f = (t * 3) % 1, d = cusp * (1 - Math.sin(PI * f)) ** 1.4, l = Math.hypot(nx, ny) || 1;
        x += (nx / l) * d; y += (ny / l) * d;
      }
      pts.push([x, y]);
    }
    return pts;
  }
  // 첨두 창 구멍(Path): 문턱 y0, 기점 ys, 폭 w, 정점 높이 rise
  function lancetPath(cx, y0, ys, w, rise, cusp, Cls = THREE.Path) {
    const p = new Cls(), a = archPts(w, rise, cusp);
    const jx = a[0][0];
    p.moveTo(cx + jx, y0);
    a.forEach(([x, y]) => p.lineTo(cx + x, ys + y));
    p.lineTo(cx - jx, y0);
    p.lineTo(cx + jx, y0);
    return p;
  }
  const circlePath = (cx, cy, r, Cls = THREE.Path) => { const p = new Cls(); p.absarc(cx, cy, r, 0, 2 * PI, true); return p; };

  // ---------- 조각상류 ----------
  // 서 있는 성인 (높이 h, +z 정면, 발 y=0)
  function saint(mat, m, h = 110, opt = {}) {
    const robe = [[0, 0], [0.24, 0], [0.25, 0.04], [0.2, 0.3], [0.17, 0.55], [0.16, 0.66], [0.19, 0.76], [0.15, 0.8], [0.05, 0.82], [0, 0.82]].map(([x, y]) => [x * h, y * h]);
    put(mat, G.lathe(robe, 14), mul(m, mtx(0, 0, 0, 0, 0, 0, 1, 1, 0.78)));
    put(mat, G.sph(0.085 * h, 10, 8), mul(m, mtx(0, 0.89 * h, 0.01 * h)));
    put(mat, G.sph(0.045 * h, 8, 6), mul(m, mtx(0, 0.81 * h, 0)));
    // 망토 자락
    put(mat, G.lathe([[0.18 * h, 0.05 * h], [0.2 * h, 0.4 * h], [0.17 * h, 0.75 * h], [0.1 * h, 0.8 * h]], 10), mul(m, mtx(0, 0, -0.03 * h, 0, 0, 0, 1, 1, 0.7)));
    // 팔
    for (const e of [-1, 1]) rod(mat, [e * 0.14 * h, 0.74 * h, 0], [e * 0.06 * h, 0.56 * h, 0.14 * h], 0.035 * h, 6, m);
    put(mat, G.sph(0.04 * h, 8, 6), mul(m, mtx(0, 0.56 * h, 0.15 * h)));
    if (opt.crown) {
      put(mat, G.cyl(0.07 * h, 0.065 * h, 0.04 * h, 12, true), mul(m, mtx(0, 0.96 * h, 0.01 * h)));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * PI; put(mat, G.cone(0.016 * h, 0.05 * h, 4), mul(m, mtx(Math.sin(a) * 0.068 * h, 1.0 * h, 0.01 * h + Math.cos(a) * 0.068 * h))); }
    }
    if (opt.staff) {
      rod(mat, [0.1 * h, 0.05 * h, 0.12 * h], [0.12 * h, 1.02 * h, 0.12 * h], 0.012 * h, 5, m);
      put(mat, G.sph(0.035 * h, 8, 6), mul(m, mtx(0.12 * h, 1.04 * h, 0.12 * h)));
    }
    if (opt.sword) rod(mat, [-0.16 * h, 0.05 * h, 0.1 * h], [-0.2 * h, 0.85 * h, 0.12 * h], 0.012 * h, 4, m);
  }
  // 날개 모양(깃털 윤곽)
  const wingShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.35, 0.15, 0.55, 0.55, 0.42, 1.0);
    s.bezierCurveTo(0.3, 0.92, 0.18, 0.75, 0.12, 0.55);
    s.bezierCurveTo(0.05, 0.4, 0.0, 0.2, 0, 0);
    return s;
  })();
  // 천사 날개: 어깨(위)에 뿌리, 아래 바깥으로 늘어진 넓은 잎 모양
  const hangWing = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 1);
    s.bezierCurveTo(0.3, 1.08, 0.55, 0.95, 0.58, 0.7);
    s.bezierCurveTo(0.6, 0.45, 0.5, 0.18, 0.36, 0);
    s.bezierCurveTo(0.28, 0.2, 0.15, 0.35, 0.06, 0.5);
    s.bezierCurveTo(0.02, 0.7, 0, 0.85, 0, 1);
    return s;
  })();
  // 무릎 꿇은 천사 (높이 h, +z 정면): 넓게 퍼진 옷자락, 곧은 상체, 모은 손, 머리 위로 솟은 큰 날개
  function angel(mat, m, h = 150) {
    const L = (pts, n = 16) => G.lathe(pts.map(([x, y]) => [x * h, y * h]), n);
    put(mat, L([[0, 0], [0.3, 0], [0.31, 0.03], [0.27, 0.12], [0.2, 0.26], [0.15, 0.38], [0, 0.4]]), mul(m, mtx(0, 0, -0.02 * h, 0, 0, 0, 1, 1, 0.85))); // 옷자락
    put(mat, G.sph(1, 12, 8), mul(m, mtx(0, 0.12 * h, 0.08 * h, 0, 0, 0, 0.22 * h, 0.1 * h, 0.17 * h))); // 무릎
    put(mat, L([[0, 0.3], [0.16, 0.32], [0.14, 0.45], [0.12, 0.56], [0.15, 0.64], [0.16, 0.67], [0.1, 0.71], [0.04, 0.72], [0, 0.72]]), mul(m, mtx(0, 0, -0.03 * h, 0, 0, 0, 1, 1, 0.75))); // 상체
    // 옷주름(세로 골)
    for (let i = -2; i <= 2; i++) rod(mat, [i * 0.07 * h, 0.03 * h, 0.2 * h - Math.abs(i) * 0.04 * h], [i * 0.035 * h, 0.36 * h, 0.1 * h], 0.018 * h, 5, m);
    put(mat, G.sph(0.075 * h, 12, 10), mul(m, mtx(0, 0.8 * h, 0.0)));
    put(mat, G.sph(0.082 * h, 10, 8), mul(m, mtx(0, 0.82 * h, -0.025 * h, 0, 0, 0, 1.05, 1.0, 0.95))); // 머리칼
    put(mat, G.sph(0.03 * h, 6, 5), mul(m, mtx(0, 0.71 * h, 0.03 * h))); // 목
    for (const e of [-1, 1]) {
      rod(mat, [e * 0.13 * h, 0.65 * h, -0.02 * h], [e * 0.1 * h, 0.5 * h, 0.06 * h], 0.034 * h, 6, m); // 위팔
      rod(mat, [e * 0.1 * h, 0.5 * h, 0.06 * h], [e * 0.015 * h, 0.6 * h, 0.13 * h], 0.03 * h, 6, m); // 아래팔
    }
    put(mat, G.box(0.045 * h, 0.1 * h, 0.035 * h), mul(m, mtx(0, 0.63 * h, 0.14 * h, -0.25))); // 모은 손
    // 날개: 어깨 뒤에서 아래·바깥으로 펼쳐진다(정면에서 몸 양옆의 큰 잎 모양)
    for (const e of [-1, 1]) {
      const wm = mul(m, mtx(e * 0.07 * h, 0.06 * h, -0.08 * h, 0.12, e * -0.55, e * 0.05), mtx(0, 0, 0, 0, 0, 0, e * 0.5 * h, 0.82 * h, 0.9 * h));
      put(mat, extrude(hangWing, 0.04, 0), wm);
      for (let f = 0; f < 4; f++) put(mat, G.box(0.36, 0.014, 0.014), mul(wm, mtx(0.3, 0.2 + f * 0.17, 0.045, 0, 0, 0.9 - f * 0.12)));
    }
  }
  // 웅크린 날개 달린 용(받침 다리), 높이 약 h, +z 쪽을 본다
  function dragon(mat, m, h = 105) {
    const k = h / 105;
    const s = (x, y, z, sx, sy, sz, rx = 0) => put(mat, G.sph(1, 10, 8), mul(m, mtx(x * k, y * k, z * k, rx, 0, 0, sx * k, sy * k, sz * k)));
    s(0, 42, -8, 34, 30, 42, -0.3); // 몸통
    s(0, 58, 26, 22, 22, 22); // 가슴
    s(0, 66, 48, 20, 17, 22); // 머리
    put(mat, G.cone(10 * k, 22 * k, 8), mul(m, mtx(0, 62 * k, 70 * k, PI / 2))); // 주둥이
    s(0, 55, 64, 12, 6, 12); // 아래턱
    for (const e of [-1, 1]) {
      put(mat, G.cone(4 * k, 16 * k, 6), mul(m, mtx(e * 12 * k, 82 * k, 42 * k, -0.4, 0, e * -0.4))); // 귀/뿔
      rod(mat, [e * 18 * k, 48 * k, 30 * k], [e * 24 * k, 4 * k, 46 * k], 7 * k, 6, m); // 앞다리
      s(e * 25, 4, 50, 11, 5, 13); // 앞발
      s(e * 30, 26, -18, 18, 22, 22); // 넓적다리
      s(e * 32, 4, -6, 11, 5, 14); // 뒷발
      // 날개: 등에서 위·바깥으로 펴서 받침 바닥을 받친다
      const wm = mul(m, mtx(e * 14 * k, 60 * k, -6 * k, -0.15, e * 0.3, e * -0.95), mtx(0, 0, 0, 0, 0, 0, e * 72 * k, 74 * k, 60 * k));
      put(mat, extrude(wingShape, 0.06, 0), wm);
    }
    const tail = new THREE.CatmullRomCurve3([[0, 30, -40], [12, 12, -55], [30, 4, -40], [34, 4, -15]].map(([x, y, z]) => new THREE.Vector3(x * k, y * k, z * k)));
    put(mat, new THREE.TubeGeometry(tail, 12, 5 * k, 6), m);
  }
  // 작은 첨탑(피니얼): 높이 h, 밑변 반폭 r, 크로켓 포함
  function pinnacle(mat, m, h, r, crockets = 3) {
    put(mat, G.cone(r, h, 4), mul(m, mtx(0, h / 2, 0, 0, PI / 4)));
    for (let i = 1; i <= crockets; i++) {
      const t = i / (crockets + 1), y = h * t, rr = r * (1 - t) * 1.05;
      for (let q = 0; q < 4; q++) { const a = (q * PI) / 2 + PI / 4; put(mat, G.sph(r * 0.28, 5, 4), mul(m, mtx(Math.sin(a) * rr, y, Math.cos(a) * rr))); }
    }
    put(mat, G.sph(r * 0.35, 6, 5), mul(m, mtx(0, h + r * 0.2, 0)));
  }
  // 백합 끝 십자가
  function fleurCross(mat, m, h, w) {
    put(mat, G.box(w * 0.14, h, w * 0.14), mul(m, mtx(0, h / 2, 0)));
    put(mat, G.box(w, w * 0.14, w * 0.14), mul(m, mtx(0, h * 0.72, 0)));
    for (const [x, y] of [[-w / 2, h * 0.72], [w / 2, h * 0.72], [0, h]]) {
      put(mat, G.sph(w * 0.12, 6, 5), mul(m, mtx(x, y, 0)));
      for (const e of [-1, 1]) put(mat, G.sph(w * 0.08, 5, 4), mul(m, mtx(x + (y === h ? e * w * 0.1 : 0), y + (y === h ? -w * 0.06 : e * w * 0.1), 0)));
    }
  }
  // 백합 창살(용마루 장식 한 개)
  function fleurSpike(mat, m, h, w) {
    put(mat, G.box(w * 0.16, h * 0.75, w * 0.12), mul(m, mtx(0, h * 0.375, 0)));
    put(mat, G.cone(w * 0.16, h * 0.32, 4), mul(m, mtx(0, h * 0.86, 0)));
    for (const e of [-1, 1]) put(mat, G.sph(w * 0.17, 5, 4), mul(m, mtx(e * w * 0.24, h * 0.7, 0, 0, 0, 0, 1, 1.4, 0.7)));
  }
  // 크로켓 붙은 삼각 박공(투각) : 밑변 w, 높이 h, 두께 t, 판은 xy 평면, 앞면 +z
  function gablet(mat, m, w, h, t, opt = {}) {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.lineTo(-w / 2, 0);
    const k = 0.15, inner = new THREE.Path();
    inner.moveTo(-w / 2 + w * k, h * 0.07); inner.lineTo(0, h - h * k * 1.15); inner.lineTo(w / 2 - w * k, h * 0.07); inner.lineTo(-w / 2 + w * k, h * 0.07);
    sh.holes.push(inner);
    put(mat, extrude(sh, t, 0), mul(m, mtx(0, 0, -t / 2)));
    // 안쪽 트레이서리: 큰 원 + 사엽, 아래 두 개의 삼엽, 위 작은 원
    const cy = h * 0.34, cr = Math.min(w * 0.23, h * 0.2), tt = Math.max(1.6, t * 0.32);
    put(mat, G.torus(cr, tt, 5, 22), mul(m, mtx(0, cy, 0)));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 2 * PI; put(mat, G.torus(cr * 0.45, tt * 0.8, 4, 14), mul(m, mtx(Math.sin(a) * cr * 0.47, cy + Math.cos(a) * cr * 0.47, 0))); }
    put(mat, G.sph(cr * 0.16, 6, 5), mul(m, mtx(0, cy, 0)));
    for (const e of [-1, 1]) {
      const bx = e * w * 0.25, by = h * 0.11;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * 2 * PI; put(mat, G.torus(cr * 0.26, tt * 0.7, 4, 10), mul(m, mtx(bx + Math.sin(a) * cr * 0.25, by + Math.cos(a) * cr * 0.25, 0))); }
      rod(mat, [e * cr * 0.95, cy - cr * 0.3, 0], [e * (w / 2 - w * k), h * 0.07, 0], tt * 0.8, 5, m);
    }
    put(mat, G.torus(cr * 0.36, tt * 0.75, 4, 12), mul(m, mtx(0, h * 0.62, 0)));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * 2 * PI; put(mat, G.sph(cr * 0.12, 5, 4), mul(m, mtx(Math.sin(a) * cr * 0.18, h * 0.62 + Math.cos(a) * cr * 0.18, 0))); }
    rod(mat, [0, cy + cr, 0], [0, h * 0.62 - cr * 0.36, 0], tt * 0.8, 5, m);
    // 크로켓(잎 두 장씩)
    const nC = opt.crockets ?? 5, cs = w * 0.055;
    for (const e of [-1, 1]) for (let i = 1; i <= nC; i++) {
      const u = i / (nC + 1), x = e * (w / 2) * (1 - u) + e * w * 0.035, y = h * u + w * 0.03;
      put(mat, G.sph(cs, 6, 5), mul(m, mtx(x, y, 0, 0, 0, e * 0.6, 1.3, 0.8, 0.9)));
      put(mat, G.sph(cs * 0.7, 5, 4), mul(m, mtx(x + e * cs * 0.9, y + cs * 0.9, 0)));
    }
    if (opt.finial !== false) fleurCross(mat, mul(m, mtx(0, h, 0)), opt.finialH ?? h * 0.3, w * 0.3);
  }

  const R = new THREE.Group(); // 성유물함(px 단위)
  // ================= 성유물함 치수 (px) =================
  const BL = 755, BD = 455; // 유리 몸체 길이, 깊이
  const hl = BL / 2, hd = BD / 2;
  const bayN = { long: 5, end: 3 }, bayW = BL / 5; // 151
  const roofY0 = 980, roofY1 = 1232, eaveO = 57; // 처마, 용마루 높이
  const roofHL = 405, roofHD = hd + eaveO; // 지붕 반길이, 처마 반깊이

  // 대좌 석판 (현재 진열: 짙은 회색 돌판)
  put(M.stone, G.box(1180, 30, 830), mtx(0, -15, 0));
  // --- 받침 용 10마리 ---
  const dragPos = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) dragPos.push([sx * 468, sz * 318, Math.atan2(sx, sz)]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) dragPos.push([sx * 158, sz * 330, sz > 0 ? 0 : PI]);
  for (const sx of [-1, 1]) dragPos.push([sx * 482, 0, (sx * PI) / 2]);
  for (const [x, z, ry] of dragPos) dragon(M.gold, mtx(x, 0, z, 0, ry, 0), 105);

  // --- 아래 받침 (은) ---
  put(M.silver, molding([[100, 88], [116, 92], [118, 100], [118, 106], [112, 110], [106, 116], [103, 124], [100, 128], [97, 134], [96, 140], [96, 228], [100, 231], [105, 237], [110, 244], [112, 252], [112, 266], [110, 271], [106, 276], [104, 280], [104, 285]], hl, hd), null);
  put(M.silver, G.box(BL + 2 * 104, 2, BD + 2 * 104), mtx(0, 285, 0)); // 천사 받침 윗면
  put(M.silver, G.box(BL + 2 * 100, 2, BD + 2 * 100), mtx(0, 89, 0)); // 바닥면
  // 에나멜 프리즈 (사진 텍스처)
  const frW = 870, frH = (frW * 84) / 882, frY = 186, frEW = (frW * 582) / 882;
  for (const s of [0, 2]) put(M.frLong, plane(frW, frH), mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(0, frY, hd + 96.6)));
  for (const s of [1, 3]) put(M.frEnd, plane(frEW, frH), mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(0, frY, hl + 96.6)));
  // 서명 띠(정면 아래 몰딩의 'Jos. Lippert 1862' 자리) : 얇은 홈
  put(M.silverDim, G.box(220, 6, 2), mtx(0, 118, hd + 104));

  // --- 천사 단 ---
  put(M.silverDim, molding([[0, 285], [0, 400]], hl, hd), null);
  // 투각 판(사진 텍스처): 긴 면 3묶음, 짧은 면 2묶음
  const apW = 136, apH = (apW * 318) / 512, apY = 336;
  for (const s of [0, 2]) for (const x of [-290, 0, 290]) put(M.angelP, plane(apW, apH), mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(x, apY, hd + 0.8)));
  for (const s of [1, 3]) for (const x of [-140, 140]) put(M.angelP, plane(apW, apH), mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(x, apY, hl + 0.8)));
  // 천사 단 위 몰딩 + 보석
  put(M.silver, molding([[0, 398], [4, 402], [14, 407], [40, 414], [62, 420], [64, 424], [64, 444], [60, 448], [54, 451], [54, 455], [40, 458], [30, 464], [22, 472], [12, 480], [6, 486], [4, 490]], hl, hd), null);
  const gemMats = [M.topaz, M.ruby, M.amethyst, M.topaz, M.ruby, M.aqua];
  const sides = [[0, hl, hd], [1, hd, hl], [2, hl, hd], [3, hd, hl]];
  for (const [s, half, dist] of sides) {
    const xs = s % 2 ? [-151.7, 0, 151.7] : [-377, -226, -75, 75, 226, 377];
    xs.forEach((x, i) => {
      const gm = mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(x, 434, dist + 64));
      put(M.silver, G.cyl(9, 9, 4, 12), mul(gm, mtx(0, 0, 0, PI / 2)));
      put(gemMats[i % gemMats.length], G.sph(7, 10, 6), mul(gm, mtx(0, 0, 2.5, 0, 0, 0, 1, 1.15, 0.55)));
    });
  }
  // 천사 10: 모서리 4(대각), 긴 면 4, 짧은 면 2
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) angel(M.gold, mtx(sx * (hl + 52), 286, sz * (hd + 52), 0, Math.atan2(sx, sz), 0), 166);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) angel(M.gold, mtx(sx * 148, 286, sz * (hd + 48), 0, sz > 0 ? 0 : PI, 0), 170);
  for (const sx of [-1, 1]) angel(M.gold, mtx(sx * (hl + 48), 286, 0, 0, (sx * PI) / 2, 0), 166);

  // --- 유리 몸체 ---
  // 창턱 띠(사엽 무늬 텍스처)
  put(M.silver, molding([[2, 490], [2, 494], [0, 496], [0, 530], [4, 533], [4, 537]], hl, hd), null);
  for (const [s, half, dist] of sides) {
    const n = s % 2 ? 3 : 5, w = (2 * half) / n;
    for (let i = 0; i < n; i++) {
      const cx = -half + w * (i + 0.5);
      put(M.quat, plane(w - 16, ((w - 16) * 116) / 512), mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(cx, 513, dist + 0.6)));
    }
  }
  // 아케이드 판: 긴 면 5칸, 짧은 면 3칸의 삼엽 첨두창
  const frameY0 = 536, frameY1 = 932, sillIn = 546, springY = 808, riseA = 88;
  for (const [s, half, dist] of sides) {
    const n = s % 2 ? 3 : 5, w = (2 * half) / n;
    const sh = new THREE.Shape(); sh.moveTo(-half, frameY0); sh.lineTo(half, frameY0); sh.lineTo(half, frameY1); sh.lineTo(-half, frameY1); sh.lineTo(-half, frameY0);
    const back = new THREE.Shape(); back.moveTo(-half, frameY0); back.lineTo(half, frameY0); back.lineTo(half, frameY1); back.lineTo(-half, frameY1); back.lineTo(-half, frameY0);
    for (let i = 0; i < n; i++) {
      const cx = -half + w * (i + 0.5);
      sh.holes.push(lancetPath(cx, sillIn, springY, w - 16, riseA, 9));
      back.holes.push(lancetPath(cx, sillIn, springY, w - 16, riseA, 9));
      // 스팬드럴 원형 트레이서리
      if (i > 0) put(M.silver, G.torus(13, 2.6, 5, 16), mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(-half + w * i, 892, dist + 2)));
    }
    const R0 = mtx(0, 0, 0, 0, (s * PI) / 2);
    put(M.silver, extrude(sh, 8, 1), mul(R0, mtx(0, 0, dist - 8)));
    put(M.gold, extrude(back, 2, 0), mul(R0, mtx(0, 0, dist - 11))); // 안쪽 금도금 면
    // 유리
    put(M.glass, plane(2 * half - 4, frameY1 - frameY0 - 6), mul(R0, mtx(0, (frameY0 + frameY1) / 2, dist - 13)));
    // 작은 기둥 + 주두 + 아치 몰딩
    for (let i = 0; i <= n; i++) {
      const cx = -half + w * i;
      if (i > 0 && i < n) {
        put(M.silver, G.cyl(6.5, 6.5, springY - 14 - 546, 10, true), mul(R0, mtx(cx, (546 + springY - 14) / 2, dist + 6)));
        put(M.silver, G.lathe([[5, 0], [9, 2], [10, 6], [7, 8], [7, 10], [11, 14], [12, 17], [6, 18]], 10), mul(R0, mtx(cx, springY - 18, dist + 6)));
        put(M.silver, G.lathe([[9, 0], [9, 4], [7, 6], [8, 9], [6, 11]], 10), mul(R0, mtx(cx, 537, dist + 6)));
      }
      if (i < n) {
        const a = archPts(w, riseA + 6, 0, 18).map(([x, y]) => new THREE.Vector3(cx + w / 2 + x, springY + y, dist + 4));
        put(M.silver, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(a), 20, 4, 5), R0);
      }
    }
    // 처마 아래 보석 띠
    for (let i = 0; i <= n; i++) {
      const cx = -half + w * i, gm = mul(R0, mtx(cx, 938, dist + 8));
      put(M.silver, G.cyl(7.5, 7.5, 3, 10), mul(gm, mtx(0, 0, 0, PI / 2)));
      put([M.emerald, M.amethyst, M.emerald, M.emerald, M.ruby, M.emerald][i % 6], G.sph(6, 10, 6), mul(gm, mtx(0, 0, 2, 0, 0, 0, 1, 1.1, 0.5)));
    }
  }
  put(M.silver, molding([[0, 932], [8, 934], [8, 945]], hl, hd), null);
  put(M.gold, G.box(BL - 20, 3, BD - 20), mtx(0, 928, 0)); // 금 천장
  put(M.silverDim, G.box(BL - 10, 3, BD - 10), mtx(0, 537, 0)); // 바닥

  // --- 모서리 기둥(금): 묶음 기둥 + 두 면의 성인상 8 + 첨탑 묶음 천개 ---
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (hl + 14), cz = sz * (hd + 14), ry = Math.atan2(sx, sz);
    const C = mtx(cx, 0, cz, 0, ry, 0);
    put(M.gold, G.box(22, 470, 22), mul(C, mtx(0, 705, -4)));
    for (const [dx, dz, r] of [[0, 14, 7], [-12, 8, 5.5], [12, 8, 5.5], [-20, 0, 5], [20, 0, 5]]) {
      put(M.gold, G.cyl(r, r, 150, 8, true), mul(C, mtx(dx, 568, dz)));
      put(M.gold, G.lathe([[r, 0], [r + 2.5, 2], [r + 2.5, 5], [r, 7]], 8), mul(C, mtx(dx, 490, dz)));
    }
    const faces = [[sx * (hl + 6), sz * (hd + 34), sz > 0 ? 0 : PI, { sword: true }], [sx * (hl + 34), sz * (hd + 6), (sx * PI) / 2, { staff: true }]];
    for (const [fx, fz, fr, opt] of faces) {
      const F = mtx(fx, 0, fz, 0, fr, 0);
      put(M.gold, G.lathe([[0, 0], [10, 0], [14, 3], [18, 9], [22, 14], [22, 18], [0, 18]], 12), mul(F, mtx(0, 634, 0)));
      saint(M.gold, mul(F, mtx(0, 652, 0)), 116, opt);
      // 천개: 작은 박공 + 첨탑 셋
      put(M.gold, G.box(46, 8, 34), mul(F, mtx(0, 784, -4)));
      gablet(M.gold, mul(F, mtx(0, 788, 13)), 40, 40, 4, { crockets: 2, finial: false });
      pinnacle(M.gold, mul(F, mtx(0, 806, -6)), 132, 13, 4);
      for (const e of [-1, 1]) pinnacle(M.gold, mul(F, mtx(e * 19, 788, 2)), 86, 7, 2);
    }
    pinnacle(M.gold, mul(C, mtx(0, 942, -4)), 44, 9, 2);
  }

  // --- 처마 코니스 + 금박 덩굴 띠 ---
  put(M.silver, molding([[8, 945], [12, 947], [16, 951]], hl, hd), null);
  const vineG = molding([[16, 951], [30, 957], [44, 963], [54, 968]], hl, hd, 250, 42);
  put(M.vine, vineG, null);
  put(M.silver, molding([[54, 968], [58, 971], [58, 978], [54, 980]], hl, hd), null);
  put(M.silver, G.box(BL + 2 * 54, 2, BD + 2 * 54), mtx(0, 980, 0));

  // --- 지붕 ---
  const slope = Math.atan2(roofY1 - roofY0, roofHD), rlen = Math.hypot(roofY1 - roofY0, roofHD);
  for (const e of [-1, 1]) {
    const pg = new THREE.BoxGeometry(2 * roofHL, 6, rlen);
    const uv = pg.attributes.uv; // 비늘 반복: 길이 방향 22칸
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 5);
    put(M.roof, pg, mul(mtx(0, (roofY0 + roofY1) / 2, (e * roofHD) / 2), mtx(0, 0, 0, e * slope, 0, 0)));
    // 용마루 아래 판각 띠(두껍게)
    put(M.silver, G.box(2 * roofHL - 30, 4, 46), mul(mtx(0, roofY1 - 22, e * 23), mtx(0, 3, 0, e * slope, 0, 0)));
    // 패널 이음 리브
    for (const x of [-282, -141, 141, 282]) put(M.silver, G.box(4, 4, rlen - 50), mul(mtx(x, (roofY0 + roofY1) / 2 + 4, (e * roofHD) / 2), mtx(0, 2, 0, e * slope, 0, 0)));
  }
  put(M.silver, G.box(2 * roofHL, 10, 16), mtx(0, roofY1 + 2, 0)); // 용마루
  // 박공 끝면(장미창) + 크로켓 테두리 + 십자가
  for (const sx of [-1, 1]) {
    const Rg = mtx(sx * roofHL, 0, 0, 0, (sx * PI) / 2, 0);
    const tri = new THREE.Shape(); tri.moveTo(-roofHD, roofY0); tri.lineTo(roofHD, roofY0); tri.lineTo(0, roofY1); tri.lineTo(-roofHD, roofY0);
    tri.holes.push(circlePath(0, 1084, 100));
    put(M.silver, extrude(tri, 10, 0), mul(Rg, mtx(0, 0, -10)));
    put(M.dark, G.cyl(100, 100, 2, 32), mul(Rg, mtx(0, 1084, -12, PI / 2)));
    // 장미창: 바깥 고리, 안쪽 고리, 12 살, 삼엽 꽃잎
    const RC = mul(Rg, mtx(0, 1084, -2));
    put(M.gold, G.torus(95, 6, 6, 40), RC);
    put(M.gold, G.torus(28, 4.5, 6, 20), RC);
    put(M.sapphire, G.sph(10, 10, 8), RC);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * PI;
      rod(M.gold, [Math.sin(a) * 30, Math.cos(a) * 30, 0], [Math.sin(a) * 92, Math.cos(a) * 92, 0], 3, 5, RC);
      const b = a + PI / 12;
      put(M.gold, G.torus(15, 2.6, 5, 14), mul(RC, mtx(Math.sin(b) * 70, Math.cos(b) * 70, 0)));
      put(M.gold, G.torus(8, 2.2, 4, 10), mul(RC, mtx(Math.sin(b) * 44, Math.cos(b) * 44, 0)));
    }
    for (const e of [-1, 1]) put(M.gold, G.torus(22, 3.2, 5, 16), mul(Rg, mtx(e * 178, 1012, -1)));
    // 박공 테두리(은) + 크로켓
    for (const e of [-1, 1]) {
      const A = [e * (roofHD + 8), roofY0 - 4], B = [0, roofY1 + 10];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]), ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      put(M.silver, G.box(len, 20, 22), mul(Rg, mtx((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, -2, 0, 0, ang)));
      for (let i = 1; i < 12; i++) {
        const t = i / 12, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
        put(M.silver, G.sph(7, 6, 5), mul(Rg, mtx(x - e * 9 * Math.sin(ang) * 0, y + 14, -2, 0, 0, 0, 1, 1.3, 1)));
      }
    }
    fleurCross(M.gold, mul(Rg, mtx(0, roofY1 + 18, -4)), 88, 62);
    put(M.gold, G.box(22, 18, 22), mul(Rg, mtx(0, roofY1 + 12, -4)));
  }
  // 용마루 금박 투각 장식(크레스팅): 사엽 구멍 띠 + 촘촘한 백합 창살
  for (const e of [-1, 1]) {
    const x0 = e * 64, x1 = e * 368, len = Math.abs(x1 - x0), xm = (x0 + x1) / 2;
    const band = new THREE.Shape(); band.moveTo(-len / 2, 0); band.lineTo(len / 2, 0); band.lineTo(len / 2, 22); band.lineTo(-len / 2, 22); band.lineTo(-len / 2, 0);
    for (let x = -len / 2 + 10; x < len / 2 - 6; x += 19) band.holes.push(circlePath(x, 11, 6.5));
    put(M.gold, extrude(band, 4, 0), mtx(xm, roofY1 + 7, -2));
    put(M.gold, G.box(len, 3, 7), mtx(xm, roofY1 + 30, 0));
    for (let x = x0 + e * 9; Math.abs(x) < Math.abs(x1) - 4; x += e * 19) {
      fleurSpike(M.gold, mtx(x, roofY1 + 29, 0), 46, 20);
      put(M.gold, G.sph(3.2, 5, 4), mtx(x + e * 9.5, roofY1 + 36, 0));
    }
  }
  // 도머(금박 박공) 5×2 + 은 지붕, 처마의 작은 괴수
  for (const sz of [-1, 1]) {
    for (let i = -2; i <= 2; i++) {
      const x = i * 147.5, zf = sz * (roofHD - 12);
      const D = mtx(x, 990, zf, 0, sz > 0 ? 0 : PI, 0);
      const triS = new THREE.Shape(); triS.moveTo(-68, 0); triS.lineTo(68, 0); triS.lineTo(0, 156); triS.lineTo(-68, 0);
      put(M.navy, new THREE.ShapeGeometry(triS), mul(D, mtx(0, 0, -5)));
      gablet(M.gold, D, 142, 162, 8, { crockets: 6, finialH: 48 });
      // 도머 지붕(삼각기둥, 뒤쪽은 큰 지붕 속에 묻힘)
      const prof = new THREE.Shape(); prof.moveTo(-72, 0); prof.lineTo(72, 0); prof.lineTo(0, 166); prof.lineTo(-72, 0);
      put(M.roof, extrude(prof, 200, 0), mul(D, mtx(0, 0, -206)));
    }
    for (const x of [-367, -221, -74, 74, 221, 367]) {
      const B = mtx(x, 982, sz * (roofHD - 2), 0, sz > 0 ? 0 : PI, 0);
      put(M.gold, G.sph(1, 8, 6), mul(B, mtx(0, 10, 0, 0, 0, 0, 9, 9, 13)));
      put(M.gold, G.sph(7, 8, 6), mul(B, mtx(0, 20, 10)));
    }
  }

  // --- 꼭대기 랜턴(소탑) + 성 이슈트반 상 + 첨탑 + 십자가 ---
  {
    const sq = (w, c) => { const s = new THREE.Shape(); s.moveTo(-w + c, -w); s.lineTo(w - c, -w); s.lineTo(w, -w + c); s.lineTo(w, w - c); s.lineTo(w - c, w); s.lineTo(-w + c, w); s.lineTo(-w, w - c); s.lineTo(-w, -w + c); s.lineTo(-w + c, -w); return s; };
    put(M.silver, extrude(sq(61, 14), 128, 0), mtx(0, 1186, 0, -PI / 2));
    put(M.silver, molding([[-8, 1296], [-2, 1300], [2, 1306], [2, 1316]], 53, 53), null);
    put(M.silver, G.box(110, 3, 110), mtx(0, 1316, 0));
    for (let s = 0; s < 4; s++) for (const x of [-26, 0, 26]) {
      const m4 = mul(mtx(0, 0, 0, 0, (s * PI) / 2), mtx(x, 1262, 61.5));
      put(M.navy, G.cyl(9, 9, 1, 12), mul(m4, mtx(0, 0, 0, PI / 2)));
      for (let q = 0; q < 4; q++) put(M.silver, G.torus(5, 1.4, 4, 10), mul(m4, mtx(Math.sin((q * PI) / 2) * 5, Math.cos((q * PI) / 2) * 5, 0.5)));
    }
    put(M.silver, G.box(70, 10, 70), mtx(0, 1321, 0));
    put(M.silver, G.box(56, 10, 56), mtx(0, 1331, 0));
    saint(M.gold, mtx(0, 1336, 4), 160, { crown: true, staff: true });
    // 네 모서리 기둥 묶음 + 측면 투각 아치
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (const [dx, dz] of [[0, 0], [-sx * 9, 0], [0, -sz * 9]]) put(M.silver, G.cyl(4.5, 4.5, 180, 8, true), mtx(sx * 50 + dx, 1406, sz * 50 + dz));
      put(M.silver, G.lathe([[4, 0], [8, 3], [8, 8], [5, 10]], 8), mtx(sx * 50, 1494, sz * 50));
      pinnacle(M.gold, mtx(sx * 52, 1500, sz * 52), 52, 8, 2);
    }
    for (let s = 0; s < 4; s++) {
      const R0 = mtx(0, 0, 0, 0, (s * PI) / 2);
      const a = archPts(92, 52, 7, 18).map(([x, y]) => new THREE.Vector3(x, 1446 + y, 50));
      put(M.silver, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(a), 18, 3.2, 5), R0);
      if (s % 2) { // 측면은 아래쪽 난간 투각
        put(M.silver, G.box(92, 3, 3), mul(R0, mtx(0, 1360, 50)));
        for (const x of [-30, 0, 30]) rod(M.silver, [x, 1318, 50], [x, 1360, 50], 2, 5, R0);
      }
      gablet(M.gold, mul(R0, mtx(0, 1496, 52)), 100, 82, 6, { crockets: 3, finial: false });
      put(M.gold, G.box(108, 6, 6), mul(R0, mtx(0, 1497, 52)));
    }
    put(M.gold, G.box(104, 8, 104), mtx(0, 1500, 0));
    // 첨탑(팔각뿔) + 크로켓
    put(M.gold, G.cone(40, 128, 8), mtx(0, 1566 + 64, 0, 0, PI / 8));
    for (let i = 1; i <= 5; i++) {
      const t = i / 6, y = 1566 + 128 * t, rr = 40 * (1 - t) + 2;
      for (let q = 0; q < 8; q++) { const a = (q / 8) * 2 * PI; put(M.gold, G.sph(4.2, 5, 4), mtx(Math.sin(a) * rr, y, Math.cos(a) * rr)); }
    }
    put(M.gold, G.sph(7, 8, 6), mtx(0, 1696, 0));
    fleurCross(M.gold, mtx(0, 1700, 0), 38, 34);
  }

  // --- 안쪽 성유물: 타원 유리관, 금 보석 테, 붉은 벨벳, 오른손 ---
  {
    const L = 545, ry = 95, rz = 112, cy = 680;
    put(M.gold, G.box(L - 20, 12, 2 * rz - 10), mtx(0, 543, 0));
    // 레이스 같은 금 앞치마(물결 아래 테두리)
    for (const e of [-1, 1]) {
      const ap = new THREE.Shape(); ap.moveTo(-L / 2 + 10, 585); ap.lineTo(L / 2 - 10, 585); ap.lineTo(L / 2 - 10, 556);
      for (let x = L / 2 - 10; x > -L / 2 + 10; x -= 22) { ap.lineTo(x - 5.5, 548); ap.lineTo(x - 11, 556); ap.lineTo(x - 16.5, 548); ap.lineTo(x - 22, 556); }
      ap.lineTo(-L / 2 + 10, 585);
      for (let x = -L / 2 + 30; x < L / 2 - 20; x += 22) ap.holes.push(circlePath(x, 570, 6));
      put(M.gold, extrude(ap, 2, 0), mtx(0, 0, e * (rz - 8), 0, e > 0 ? 0 : PI, 0));
    }
    put(M.goldDeep, G.box(8, 34, 8), mtx(0, 580, rz + 2));
    fleurCross(M.gold, mtx(0, 588, rz + 4), 40, 30);
    put(M.velvet, G.box(L - 30, 44, 2 * rz - 40), mtx(0, 610, 0));
    const tube = G.cyl(1, 1, L - 20, 32, true);
    put(M.glassIn, tube, mtx(0, cy, 0, 0, 0, PI / 2, ry, 1, rz));
    for (const x of [-L / 2 + 12, L / 2 - 12]) {
      put(M.gold, G.torus(1, 0.09, 8, 40), mtx(x, cy, 0, 0, PI / 2, 0, rz, ry, 70));
      for (let i = 0; i < 14; i++) { const a = (i / 14) * 2 * PI; put(i % 2 ? M.ruby : M.emerald, G.sph(5, 6, 5), mtx(x + Math.sign(x) * 6, cy + Math.cos(a) * ry, Math.sin(a) * rz)); }
    }
    // 손: 주먹 쥔 미라화된 오른손 + 손목 금 보석띠 + 금 잎 장식
    put(M.hand, G.sph(1, 12, 10), mtx(40, 655, 0, 0, 0, 0.2, 46, 34, 40));
    for (let i = 0; i < 4; i++) put(M.hand, G.sph(11, 8, 6), mtx(72, 664 + i * 0, -27 + i * 18, 0, 0, 0, 1, 0.9, 1));
    put(M.hand, G.cyl(26, 30, 90, 12), mtx(-40, 648, 0, 0, 0, PI / 2 - 0.12));
    put(M.gold, G.torus(31, 7, 6, 20), mtx(-12, 651, 0, 0, PI / 2, 0));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * PI; put(M.ruby, G.sph(4.5, 6, 5), mtx(-6, 651 + Math.cos(a) * 33, Math.sin(a) * 33)); }
    put(M.gold, G.sph(1, 8, 6), mtx(-48, 690, 10, 0.3, 0, 0.5, 26, 6, 18));
  }

  // 성유물함(px)을 미터로
  const rel = new THREE.Group();
  for (const [mat, list] of bags) {
    const g = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(g, mat);
    if (mat.transparent) mesh.renderOrder = 2;
    rel.add(mesh);
  }
  bags.clear();
  rel.scale.setScalar(S);
  rel.name = 'szent-jobb-reliquary';

  // ================= 진열 구조 (m) =================
  const root = new THREE.Group();
  root.name = 'szent-jobb-display';
  const PED_H = 0.5, PLATE_H = 0.04, VW = 0.92, VD = 0.68, VH = 1.27, GT = 0.015;
  const top = PED_H + PLATE_H;
  // 놋쇠 받침대 (광택 패널, 세로 이음)
  put(M.brass, G.box(VW + 0.02, PED_H, VD + 0.02), mtx(0, PED_H / 2, 0));
  for (const x of [-(VW + 0.02) / 6, (VW + 0.02) / 6]) for (const e of [-1, 1]) put(M.plate, G.box(0.003, PED_H - 0.02, 0.003), mtx(x, PED_H / 2, e * ((VD + 0.02) / 2 + 0.001)));
  for (const e of [-1, 1]) put(M.plate, G.box(0.003, PED_H - 0.02, 0.003), mtx(e * ((VW + 0.02) / 2 + 0.001), PED_H / 2, 0));
  put(M.plate, G.box(VW + 0.06, 0.012, VD + 0.06), mtx(0, 0.006, 0));
  // 검은 상판 + LED 띠
  put(M.plate, G.box(VW + 0.06, PLATE_H, VD + 0.06), mtx(0, PED_H + PLATE_H / 2, 0));
  for (const e of [-1, 1]) {
    put(M.led, G.box(VW + 0.06, 0.008, 0.004), mtx(0, top - 0.012, e * ((VD + 0.06) / 2 + 0.001)));
    put(M.led, G.box(0.004, 0.008, VD + 0.06), mtx(e * ((VW + 0.06) / 2 + 0.001), top - 0.012, 0));
  }
  // 무테 유리 진열장 (판 5장 + 초록빛 모서리)
  const vit = [];
  vit.push([G.box(VW, VH, GT), mtx(0, top + VH / 2, VD / 2 - GT / 2)], [G.box(VW, VH, GT), mtx(0, top + VH / 2, -VD / 2 + GT / 2)]);
  vit.push([G.box(GT, VH, VD - 2 * GT), mtx(VW / 2 - GT / 2, top + VH / 2, 0)], [G.box(GT, VH, VD - 2 * GT), mtx(-VW / 2 + GT / 2, top + VH / 2, 0)]);
  vit.push([G.box(VW, GT, VD), mtx(0, top + VH + GT / 2, 0)]);
  for (const [g, m] of vit) put(M.vitrine, g, m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(M.vitrineEdge, G.box(0.006, VH, 0.006), mtx(sx * (VW / 2 - 0.003), top + VH / 2, sz * (VD / 2 - 0.003)));
  for (const e of [-1, 1]) {
    put(M.vitrineEdge, G.box(VW, 0.006, 0.006), mtx(0, top + VH + GT - 0.003, e * (VD / 2 - 0.003)));
    put(M.vitrineEdge, G.box(0.006, 0.006, VD), mtx(e * (VW / 2 - 0.003), top + VH + GT - 0.003, 0));
  }
  for (const [mat, list] of bags) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
    if (mat.transparent) mesh.renderOrder = 3;
    root.add(mesh);
  }
  rel.position.y = top + 30 * S;
  root.add(rel);

  // 진열장 안 조명(실제: 상판 LED와 위쪽 스포트). 장면 조명과 별도로 은은하게 더한다.
  const spot = new THREE.SpotLight('#fff3e0', 2.2, 3, 0.5, 0.6, 1.5);
  spot.position.set(0, top + VH - 0.05, 0.25);
  spot.target.position.set(0, top + 0.4, 0);
  root.add(spot, spot.target);

  root.userData = {
    source: 'Szent Jobb 성유물함 (Lippert József 설계, 1862, 은·금도금·에나멜) + 2017년 이후 본당 진열장',
    reliquarySize: { length: +(1180 * S).toFixed(3), depth: +(830 * S).toFixed(3), height: +((1737 + 30) * S).toFixed(3) },
    displaySize: { width: VW + 0.06, depth: VD + 0.06, height: +(top + VH + GT).toFixed(3) },
  };
  return root;
}
