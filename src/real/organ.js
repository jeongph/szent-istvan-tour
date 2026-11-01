// 성 이슈트반 대성당 파이프 오르간 (Angster József és Fia, op. 450, 1905; 케이스: 카우저 요제프 설계, 테크 엔드레 가구공장 제작)
// + 오르간을 받치는 서쪽 갤러리(도리스식 엔타블러처, 기둥 4개, 대리석 난간, 촛대와 철제 난간 조명).
// 근거 사진: Organ of Saint Stephen's Basilica (Yair Haklai, CC BY-SA 4.0) 정면, Hungary-02521 (Dennis Jarvis, CC BY-SA 2.0),
//           Budapest St. Stephan 805 (GFreihalter, CC BY-SA 3.0), Budapest Basilika Sz. István Innen Orgel 1 (Zairon, CC BY-SA 3.0, 사람 기준 축척),
//           Basilica de San Esteban - panoramio (4) (CC BY-SA 3.0) 갤러리 정면.
// 원점: 갤러리 앞면 중앙 아래 바닥(본당 바닥). 정면 +z = 본당(제단) 쪽. 실제 배치 때는 서쪽 정문 위에 놓고 y축으로 180° 돌린다.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export default async function build(THREE, { base = '/real/' } = {}) {
  const PI = Math.PI;
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const loader = new THREE.TextureLoader();
  const T = async (name, srgb = true) => {
    const t = await loader.loadAsync(`${base}organ/${name}`);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const [pil, pilMR, frz, frzMR] = await Promise.all([T('pilaster.jpg'), T('pilaster_mr.png', false), T('crown_frieze.jpg'), T('crown_frieze_mr.png', false)]);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    wood: std({ color: '#5e2414', metalness: 0, roughness: 0.62 }),
    woodDark: std({ color: '#3e1a10', metalness: 0, roughness: 0.55 }),
    inside: std({ color: '#0c0807', metalness: 0, roughness: 0.9 }),
    gold: std({ color: '#e9b85a', metalness: 1, roughness: 0.3 }),
    pipe: std({ color: '#d5d7da', metalness: 1, roughness: 0.22 }),
    pipeLip: std({ color: '#5b5d61', metalness: 1, roughness: 0.35 }),
    copper: std({ color: '#d08a66', metalness: 1, roughness: 0.25 }),
    bronze: std({ color: '#6a4632', metalness: 0.7, roughness: 0.45 }),
    slate: std({ color: '#4b4f58', metalness: 0.3, roughness: 0.45 }),
    stone: std({ color: '#cbbfab', metalness: 0, roughness: 0.6 }),
    stoneDark: std({ color: '#8e6f62', metalness: 0, roughness: 0.4 }),
    marble: std({ color: '#b48f80', metalness: 0, roughness: 0.25 }),
    column: std({ color: '#9b8f82', metalness: 0, roughness: 0.22 }),
    plaster: std({ color: '#e2d6bf', metalness: 0, roughness: 0.75 }),
    iron: std({ color: '#141414', metalness: 0.6, roughness: 0.5 }),
    bulb: new THREE.MeshBasicMaterial({ color: '#fff1c8' }),
    pil: std({ map: pil, metalnessMap: pilMR, roughnessMap: pilMR, metalness: 1, roughness: 1 }),
    frz: std({ map: frz, metalnessMap: frzMR, roughnessMap: frzMR, metalness: 1, roughness: 1 }),
  };

  // ---------- 기하 수집 & 병합 ----------
  const bags = new Map();
  const mtx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  const mul = (...ms) => ms.reduce((a, b) => a.clone().multiply(b));
  function put(mat, geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (m) {
      g.applyMatrix4(m);
      if (m.determinant() < 0) for (const k of ['position', 'normal', 'uv']) {
        const a = g.attributes[k].array, n = g.attributes[k].itemSize;
        for (let t = 0; t < a.length; t += 3 * n) for (let c = 0; c < n; c++) { const tmp = a[t + n + c]; a[t + n + c] = a[t + 2 * n + c]; a[t + 2 * n + c] = tmp; }
      }
    }
    if (!bags.has(mat)) bags.set(mat, []);
    bags.get(mat).push(g);
  }
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    cyl: (rt, rb, h, n = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open),
    sph: (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs),
    cone: (r, h, n = 8, open = false) => new THREE.ConeGeometry(r, h, n, 1, open),
    torus: (R, r, rs = 6, ts = 24, arc = 2 * PI) => new THREE.TorusGeometry(R, r, rs, ts, arc),
    lathe: (pts, n = 16, a0 = 0, a1 = 2 * PI) => new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), n, a0, a1),
  };
  const box = (mat, w, h, d, x, y, z, m = null) => put(mat, G.box(w, h, d), m ? mul(m, mtx(x, y, z)) : mtx(x, y, z));
  function rod(mat, a, b, r, n = 6, parent = null) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    put(mat, G.cyl(r, r, L, n, true), parent ? mul(parent, m) : m);
  }
  const extrude = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
  // 앞으로 튀어나온 직선 몰딩(정면+양 옆면): 단면 prof=[[돌출, y], ...], 폭 w, 뒤 깊이 d
  function moldingFront(mat, prof, w, d, x, z, m = null) {
    const pos = [], idx = [];
    const faces = [[0, 1], [1, 0], [-1, 0]]; // 정면, 오른쪽, 왼쪽
    for (const [fx] of faces) {
      const b0 = pos.length / 3;
      prof.forEach(([o, y]) => {
        if (fx === 0) { pos.push(-w / 2 - o, y, o, w / 2 + o, y, o); }
        else if (fx === 1) { pos.push(w / 2 + o, y, o, w / 2 + o, y, -d); }
        else { pos.push(-w / 2 - o, y, -d, -w / 2 - o, y, o); }
      });
      for (let i = 0; i < prof.length - 1; i++) { const a = b0 + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    put(mat, g, m ? mul(m, mtx(x, 0, z)) : mtx(x, 0, z));
    const top = prof[prof.length - 1];
    put(mat, G.box(w + 2 * top[0], 0.004, d + top[0]), m ? mul(m, mtx(x, top[1], z + (top[0] - d) / 2)) : mtx(x, top[1], z + (top[0] - d) / 2));
  }
  // 반원/분절 아치 점열
  const arcPts = (cx, cy, r, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

  // ---------- 파이프 ----------
  // 정면 파이프 한 개: 발(원뿔) + 입(어두운 윗입술) + 몸통. x,z 위치, 발끝 y0, 입 높이 ym, 꼭대기 yt, 반지름 r
  function pipe(x, z, y0, ym, yt, r, m = null, ry = 0) {
    const P = mul(m || new THREE.Matrix4(), mtx(x, 0, z, 0, ry, 0));
    put(M.pipe, G.cone(r, ym - y0, 14, true), mul(P, mtx(0, (y0 + ym) / 2, 0, PI)));
    put(M.pipe, G.cyl(r, r, yt - ym, 14, true), mul(P, mtx(0, (ym + yt) / 2, 0)));
    // 입: 앞쪽의 납작한 홈 + 둥근 윗입술
    put(M.pipeLip, G.box(r * 1.1, r * 0.55, r * 0.25), mul(P, mtx(0, ym + r * 0.28, r * 0.88)));
    put(M.pipe, G.cyl(r * 0.55, r * 0.55, r * 0.12, 10, false), mul(P, mtx(0, ym + r * 0.62, r * 0.9, PI / 2, 0, 0, 1, 1, 1)));
  }
  // 평면 파이프 벽: 폭 w 안에 n개, 꼭대기 높이는 함수 top(u), 입 높이 mouth(u)
  function flat(cx, z, w, n, y0, top, mouth, rMax, m = null) {
    const step = w / n;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5, x = cx - w / 2 + step * (i + 0.5);
      const r = Math.min(rMax, step * 0.45);
      pipe(x, z, y0, mouth(u), top(u), r, m);
    }
    const yt = Math.max(...Array.from({ length: 9 }, (_, i) => top(i / 8 - 0.5)));
    put(M.inside, G.box(w, yt - y0, 0.02), mul(m || new THREE.Matrix4(), mtx(cx, (y0 + yt) / 2, z - rMax - 0.05)));
  }

  // ================= 치수 =================
  // 정면 사진(Yair) 픽셀 → m : 가로 8.6mm/px, 세로 8.4mm/px (Innen Orgel 1 사람 기준 축척과 원근 재현으로 맞춤), 파이프 발 높이 2.3m
  const KH = 0.0086, KV = 0.0084;
  const X = (px) => px * KH; // 중심(578px) 기준 오프셋 px
  const Y = (px) => 2.3 + (665 - px) * KV; // 사진 y → 갤러리 바닥 위 높이

  // ---------- 갤러리 ----------
  const GAL_Y = 7.8; // 갤러리 바닥(엔타블러처 위) 높이
  const COL_TOP = 6.52, PED_H = 1.72; // 기둥 꼭대기, 받침 높이
  const GW = 11.9, GD = 5.2; // 갤러리 폭, 깊이(서쪽 벽까지)
  const g = (m) => m; // 가독용
  // 기둥 4개 (토스카나식, 회색 대리석) : 중앙 한 쌍은 정문 통로 양옆
  for (const x of [-5.5, -1.9, 1.9, 5.5]) {
    const z = -0.48;
    box(M.stone, 1.12, PED_H - 0.24, 1.12, x, (PED_H - 0.24) / 2 + 0.12, z);
    box(M.stone, 1.24, 0.12, 1.24, x, 0.06, z);
    box(M.stone, 1.2, 0.12, 1.2, x, PED_H - 0.06, z);
    put(M.column, G.lathe([[0.5, 0], [0.5, 0.06], [0.47, 0.1], [0.5, 0.16], [0.43, 0.22], [0.42, 0.26]], 24), mtx(x, PED_H, z));
    put(M.column, G.cyl(0.355, 0.415, COL_TOP - PED_H - 0.26 - 0.5, 24, true), mtx(x, (PED_H + 0.26 + COL_TOP - 0.5) / 2, z));
    put(M.column, G.lathe([[0.355, 0], [0.38, 0.05], [0.38, 0.09], [0.36, 0.12], [0.36, 0.2], [0.42, 0.26], [0.5, 0.36], [0.52, 0.38]], 24), mtx(x, COL_TOP - 0.5, z));
    box(M.column, 1.08, 0.12, 1.08, x, COL_TOP - 0.06, z);
  }
  // 엔타블러처: 아키트레이브(2단), 트리글리프+원반 프리즈, 코니스
  const EW = GW, ED = 1.0;
  box(M.stone, EW, 0.15, ED, 0, COL_TOP + 0.075, -0.5);
  box(M.stone, EW, 0.16, ED + 0.04, 0, COL_TOP + 0.23, -0.48);
  moldingFront(M.stone, [[0.02, COL_TOP + 0.31], [0.06, COL_TOP + 0.34], [0.06, COL_TOP + 0.38]], EW, ED, 0, 0.0);
  const FR0 = COL_TOP + 0.38, FR1 = COL_TOP + 0.9;
  box(M.stone, EW, FR1 - FR0, ED, 0, (FR0 + FR1) / 2, -0.5);
  const tgN = 27, tgS = EW / tgN;
  for (let i = 0; i <= tgN; i++) {
    const x = -EW / 2 + i * tgS;
    if (Math.abs(x) > EW / 2 - 0.05) continue;
    box(M.stone, 0.17, FR1 - FR0 - 0.02, 0.05, x, (FR0 + FR1) / 2, 0.02);
    for (const e of [-1, 0, 1]) box(M.stoneDark, 0.018, FR1 - FR0 - 0.08, 0.02, x + e * 0.055, (FR0 + FR1) / 2 + 0.02, 0.05);
    if (i < tgN) put(M.stoneDark, G.cyl(0.085, 0.085, 0.04, 20), mtx(x + tgS / 2, (FR0 + FR1) / 2, 0.01, PI / 2));
  }
  moldingFront(M.stone, [[0.0, FR1], [0.06, FR1 + 0.03], [0.08, FR1 + 0.08], [0.3, FR1 + 0.14], [0.32, FR1 + 0.24], [0.34, FR1 + 0.26], [0.34, FR1 + 0.3], [0.3, FR1 + 0.32]], EW, ED, 0, 0);
  const GTOP = FR1 + 0.32; // ≈ 7.74 (Innen Orgel 1 원근 재현으로 맞춘 갤러리 바닥 높이)
  // 갤러리 바닥판과 밑면(우물반자)
  box(M.plaster, GW, 0.3, GD, 0, GTOP - 0.15, -GD / 2 - 0.4);
  for (let ix = -5; ix <= 5; ix++) box(M.stone, 0.12, 0.14, GD - 1.0, ix * 1.06 + 0.53, COL_TOP + 0.31, -GD / 2 - 0.9);
  for (let iz = 0; iz <= 4; iz++) box(M.stone, GW, 0.14, 0.12, 0, COL_TOP + 0.31, -1.0 - iz * 1.05);
  for (let ix = -5; ix <= 5; ix++) for (let iz = 0; iz < 4; iz++) put(M.gold, G.sph(0.07, 8, 6), mtx(ix * 1.06, COL_TOP + 0.36, -1.52 - iz * 1.05));
  box(M.plaster, GW, 0.02, GD - 1.0, 0, COL_TOP + 0.39, -GD / 2 - 0.9);
  // 난간: 받침대 4(기둥 위) + 양 끝, 배 모양 대리석 난간동자
  const BAL_Y = GTOP, BAL_H = 0.86, BAL_Z = 0.05;
  const pedX = [-5.75, -5.5, -1.9, 1.9, 5.5, 5.75].filter((v, i, a) => a.indexOf(v) === i);
  const peds = [-5.6, -1.9, 1.9, 5.6];
  box(M.marble, GW - 0.1, 0.16, 0.42, 0, BAL_Y + 0.08, BAL_Z);
  box(M.marble, GW - 0.1, 0.13, 0.44, 0, BAL_Y + BAL_H - 0.065, BAL_Z);
  box(M.marble, GW - 0.1, 0.04, 0.48, 0, BAL_Y + BAL_H - 0.01, BAL_Z);
  const baluster = G.lathe([[0.072, 0], [0.072, 0.035], [0.048, 0.06], [0.058, 0.1], [0.086, 0.19], [0.08, 0.26], [0.048, 0.36], [0.038, 0.43], [0.052, 0.46], [0.062, 0.5], [0.062, 0.545], [0, 0.55]], 12);
  for (let i = 0; i < peds.length - 1; i++) {
    const a = peds[i] + 0.3, b = peds[i + 1] - 0.3, n = Math.round((b - a) / 0.25);
    for (let k = 0; k <= n; k++) put(M.marble, baluster, mtx(a + ((b - a) * k) / n, BAL_Y + 0.16, BAL_Z));
  }
  for (const x of peds) {
    box(M.marble, 0.56, BAL_H, 0.52, x, BAL_Y + BAL_H / 2, BAL_Z);
    box(M.stoneDark, 0.36, 0.5, 0.02, x, BAL_Y + BAL_H / 2, BAL_Z + 0.265);
    box(M.marble, 0.62, 0.06, 0.58, x, BAL_Y + BAL_H + 0.03, BAL_Z);
  }
  // 철제 보조 난간 + 작은 전구 줄
  const IR_Z = -0.12;
  for (const h of [0.5, 1.05]) put(M.iron, G.cyl(0.012, 0.012, GW - 0.4, 6, true), mtx(0, BAL_Y + BAL_H + h, IR_Z, 0, 0, PI / 2));
  for (let x = -5.7; x <= 5.71; x += 0.95) put(M.iron, G.cyl(0.014, 0.014, 1.1, 6, true), mtx(x, BAL_Y + BAL_H + 0.55, IR_Z));
  for (let x = -5.55; x <= 5.56; x += 0.37) for (const h of [1.05, 0.5]) {
    if (h === 0.5 && Math.abs(Math.round(x / 0.37)) % 2) continue;
    put(M.bulb, G.sph(0.035, 8, 6), mtx(x, BAL_Y + BAL_H + h - 0.05, IR_Z + 0.03));
  }
  // 금박 촛대: 가운데 두 받침대(7등), 양 끝(큰 것, 아기천사 장식 대신 소용돌이 덩어리)
  function candelabrum(x, z, H, arms) {
    const y0 = BAL_Y + BAL_H + 0.06;
    put(M.gold, G.lathe([[0.2, 0], [0.2, 0.05], [0.12, 0.12], [0.07, 0.2], [0.09, 0.3], [0.05, 0.4], [0.04, H * 0.55], [0.07, H * 0.6], [0.045, H * 0.66], [0.04, H * 0.9], [0.06, H * 0.92], [0, H * 0.94]], 12), mtx(x, y0, z));
    for (const lv of [0.6, 0.8]) for (let i = 0; i < arms; i++) {
      const a = (i / arms) * 2 * PI + lv, R = H * (lv === 0.6 ? 0.22 : 0.14), y = y0 + H * lv;
      const ex = x + Math.sin(a) * R, ez = z + Math.cos(a) * R;
      rod(M.gold, [x, y, z], [ex, y + 0.08, ez], 0.014, 5);
      put(M.gold, G.cyl(0.03, 0.02, 0.06, 8), mtx(ex, y + 0.1, ez));
      put(M.bulb, G.sph(0.045, 8, 6), mtx(ex, y + 0.17, ez));
    }
    put(M.bulb, G.sph(0.05, 8, 6), mtx(x, y0 + H * 0.98, z));
  }
  candelabrum(-1.9, BAL_Z, 1.55, 4);
  candelabrum(1.9, BAL_Z, 1.55, 4);
  for (const x of [-5.6, 5.6]) {
    candelabrum(x, BAL_Z, 1.9, 5);
    put(M.gold, G.lathe([[0.26, 0], [0.26, 0.06], [0.16, 0.12], [0.1, 0.2], [0.2, 0.34], [0.24, 0.45], [0.18, 0.56], [0.08, 0.62], [0.1, 0.66], [0, 0.68]], 16), mtx(x, BAL_Y + BAL_H + 0.06, BAL_Z));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 2 * PI + PI / 4; const vs = Array.from({ length: 12 }, (_, k) => { const t = k / 11; return new THREE.Vector3(x + Math.sin(a) * (0.12 + 0.16 * Math.sin(t * PI)), BAL_Y + BAL_H + 0.12 + 0.45 * t, BAL_Z + Math.cos(a) * (0.12 + 0.16 * Math.sin(t * PI))); }); put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vs), 16, 0.022, 5), null); }
  }

  // ---------- 오르간 케이스 ----------
  const OZ = -2.4; // 케이스 앞면 z (난간에서 약 1.8m 뒤)
  const O = mtx(0, GTOP, OZ); // 오르간 좌표계: 갤러리 바닥, 케이스 앞면
  const B = (mat, w, h, d, x, y, z) => box(mat, w, h, d, x, y, z, O);
  const CW = X(252); // 중앙부 반폭(아래층) ≈ 2.31
  const CD = 1.7; // 케이스 깊이
  // 받침(임포스트): 연주대 부분 포함
  B(M.wood, 2 * CW, 1.9, CD, 0, 0.95, -CD / 2);
  for (const x of [-1.6, -0.55, 0.55, 1.6]) { // 장식 패널
    B(M.gold, 0.7, 0.03, 0.03, x, 1.55, 0.01); B(M.gold, 0.7, 0.03, 0.03, x, 0.55, 0.01);
    B(M.gold, 0.03, 1.0, 0.03, x - 0.35, 1.05, 0.01); B(M.gold, 0.03, 1.0, 0.03, x + 0.35, 1.05, 0.01);
  }
  B(M.woodDark, 1.3, 0.9, 0.3, 0, 1.15, 0.12); // 연주대 덮개/악보대
  moldingFront(M.wood, [[0, 1.86], [0.05, 1.9], [0.12, 1.98], [0.12, 2.04], [0.1, 2.06], [0.1, 2.1]], 2 * CW, CD, 0, 0, O);
  B(M.gold, 2 * CW + 0.22, 0.03, 0.02, 0, 2.01, 0.125);

  // 아래층: 가운데 큰 판(15관), 옆 판(7관씩), 필라스터 4, 아치 머리
  const L0 = 2.3, L1 = Y(445); // 파이프 발, 아치 기점(≈3.89)
  const lowFlats = [[0, X(182)], [-X(165), X(92)], [X(165), X(92)]];
  const pilasters = [[-X(105), X(28)], [X(105), X(28)], [-X(226), X(26)], [X(226), X(26)]];
  for (const [px, pw] of pilasters) {
    B(M.wood, pw + 0.04, L1 - L0 + 0.1, 0.16, px, (L0 + L1) / 2, 0.02);
    put(M.pil, new THREE.PlaneGeometry(pw, L1 - L0 - 0.12), mul(O, mtx(px, (L0 + L1) / 2, 0.101)));
    put(M.gold, G.box(pw + 0.08, 0.06, 0.2), mul(O, mtx(px, L0 + 0.03, 0.03)));
    // 코린트식 주두(금박): 종 모양 + 잎 + 아바쿠스
    put(M.gold, G.cyl(pw * 0.62, pw * 0.48, 0.2, 10), mul(O, mtx(px, L1 + 0.1, 0.06, 0, 0, 0, 1, 1, 0.55)));
    for (const e of [-1, 1]) put(M.gold, G.sph(0.05, 6, 5), mul(O, mtx(px + e * pw * 0.45, L1 + 0.17, 0.11)));
    put(M.gold, G.box(pw + 0.1, 0.05, 0.22), mul(O, mtx(px, L1 + 0.23, 0.04)));
  }
  B(M.wood, 0.18, L1 - L0, 0.2, -CW + 0.09, (L0 + L1) / 2, 0); B(M.wood, 0.18, L1 - L0, 0.2, CW - 0.09, (L0 + L1) / 2, 0);
  for (const [cx, w] of lowFlats) {
    const big = w > 1, n = big ? 15 : 7, r = big ? 0.048 : 0.043;
    const ys = big ? Y(478) : Y(494), rise = big ? Y(447) - Y(478) : w / 2 - 0.02; // 기점, 높이
    const R = (rise * rise + (w / 2) ** 2) / (2 * rise), cyA = ys + rise - R; // 아치 원
    const archY = (x) => cyA + Math.sqrt(Math.max(0, R * R - x * x));
    flat(cx, -0.04, w, n, L0, (u) => archY(u * w) - 0.07 - (big ? 0.0 : 0.03), (u) => L0 + (big ? 0.5 + 0.2 * Math.abs(2 * u) : 0.58 + 0.08 * Math.abs(2 * u)), r, O);
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, ys - 0.02); sh.lineTo(w / 2, ys - 0.02); sh.lineTo(w / 2, Y(436)); sh.lineTo(-w / 2, Y(436)); sh.lineTo(-w / 2, ys - 0.02);
    const hole = new THREE.Path(); hole.moveTo(-w / 2 + 0.02, ys - 0.02);
    for (let i = 0; i <= 24; i++) { const x = -w / 2 + 0.02 + ((w - 0.04) * i) / 24; hole.lineTo(x, archY(x)); }
    hole.lineTo(w / 2 - 0.02, ys - 0.02); hole.lineTo(-w / 2 + 0.02, ys - 0.02);
    sh.holes.push(hole);
    put(M.wood, extrude(sh, 0.12), mul(O, mtx(cx, 0, -0.06)));
    const ap = Array.from({ length: 25 }, (_, i) => { const x = -w / 2 + 0.01 + ((w - 0.02) * i) / 24; return new THREE.Vector3(cx + x, archY(x) + 0.01, 0.07); });
    put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ap), 24, 0.026, 6), O);
    // 판 양옆 금박 띠, 판 아래 금박 받침
    for (const e of [-1, 1]) B(M.gold, 0.035, ys - L0, 0.03, cx + e * (w / 2 - 0.015), (L0 + ys) / 2, 0.06);
    B(M.gold, w, 0.05, 0.08, cx, L0 + 0.025, 0.04);
    if (big) { // 금박 꽃줄(아치 아래로 늘어진 두 고리) + 가운데 장식
      for (const e of [-1, 1]) {
        const sw = Array.from({ length: 13 }, (_, i) => { const t = i / 12, x = e * (w / 2 - 0.06) * (1 - t); return new THREE.Vector3(cx + x, archY(x) - 0.03 - 0.16 * Math.sin(t * PI), 0.1); });
        put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sw), 20, 0.03, 6), O);
        for (let i = 1; i < 6; i++) { const t = i / 6, x = e * (w / 2 - 0.06) * (1 - t); put(M.gold, G.sph(0.04, 6, 5), mul(O, mtx(cx + x, archY(x) - 0.03 - 0.16 * Math.sin(t * PI), 0.11))); }
      }
      put(M.gold, G.sph(1, 10, 8), mul(O, mtx(cx, ys + rise - 0.02, 0.1, 0, 0, 0, 0.08, 0.1, 0.05)));
    }
  }
  // 스페인 트럼펫(수평 리드관, 구리색 나팔): 가운데 판 아래 양쪽에 두 줄, 바깥으로 갈수록 높아지는 V자
  for (const e of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const x = e * (0.13 + i * 0.12 + row * 0.06), L = 0.42 + i * 0.07 - row * 0.08, y = L0 + 0.12 + row * 0.16 + i * 0.045;
    const m = mul(O, mtx(x, y, 0.12, 0, e * 0.06 * i, 0));
    put(M.copper, G.cone(0.062 - row * 0.01, L, 14, true), mul(m, mtx(0, 0, L / 2, -PI / 2)));
    put(M.copper, G.torus(0.06 - row * 0.01, 0.008, 4, 14), mul(m, mtx(0, 0, L)));
    put(M.copper, G.cyl(0.018, 0.018, 0.2, 6, true), mul(m, mtx(0, 0, -0.08, PI / 2)));
  }
  // 층 사이 엔타블러처
  const E0 = Y(440), E1 = Y(395);
  B(M.wood, 2 * CW + 0.06, 0.12, CD, 0, E0 + 0.06, -CD / 2 + 0.03);
  B(M.gold, 2 * CW + 0.06, 0.03, 0.02, 0, E0 + 0.135, 0.04);
  B(M.wood, 2 * CW, 0.16, CD, 0, E0 + 0.23, -CD / 2);
  for (let i = -8; i <= 8; i++) put(M.gold, G.torus(0.045, 0.012, 4, 12), mul(O, mtx(i * 0.26, E0 + 0.23, 0.005)));
  moldingFront(M.wood, [[0, E0 + 0.31], [0.04, E0 + 0.33], [0.1, E0 + 0.38], [0.12, E1 - 0.02], [0.12, E1]], 2 * CW, CD, 0, 0, O);
  for (let x = -CW; x <= CW + 1e-6; x += 0.07) B(M.gold, 0.035, 0.035, 0.03, x, E0 + 0.355, 0.07);
  put(M.gold, G.sph(1, 10, 8), mul(O, mtx(0, E1 + 0.14, 0.05, 0, 0, 0, 0.13, 0.16, 0.06)));

  // 가운데층: 반원 아치 큰 판(13관) + 양쪽 작은 아치 두 쌍(각 4관)
  const M0 = E1, M1 = Y(285), MW = X(233);
  B(M.wood, 2 * MW, M1 - M0, CD - 0.1, 0, (M0 + M1) / 2, -(CD - 0.1) / 2 - 0.02);
  const midC = X(186);
  const SPR = Math.max(0.06, M1 - M0 - midC / 2 - 0.04); // 반원 아치 기점(층 바닥 가까이)
  flat(0, 0.0, midC, 13, M0 + 0.05, (u) => Math.max(M0 + 0.42, M0 + SPR + (midC / 2) * Math.sqrt(Math.max(0, 1 - (2 * u) ** 2)) * 0.96 - 0.03), (u) => M0 + 0.2 + 0.05 * Math.abs(2 * u), 0.034, O);
  {
    const sh = new THREE.Shape(); sh.moveTo(-midC / 2 - 0.02, M0); sh.lineTo(midC / 2 + 0.02, M0); sh.lineTo(midC / 2 + 0.02, M1); sh.lineTo(-midC / 2 - 0.02, M1); sh.lineTo(-midC / 2 - 0.02, M0);
    const hole = new THREE.Path(); hole.moveTo(-midC / 2, M0 + 0.02);
    arcPts(0, M0 + SPR, midC / 2, PI, 0, 24).forEach(([x, y]) => hole.lineTo(x, Math.min(y, M1 - 0.02)));
    hole.lineTo(midC / 2, M0 + 0.02); hole.lineTo(-midC / 2, M0 + 0.02);
    sh.holes.push(hole);
    put(M.wood, extrude(sh, 0.1), mul(O, mtx(0, 0, 0.0)));
    const ap = arcPts(0, 0, midC / 2 + 0.02, PI, 0, 28).map(([x, y]) => new THREE.Vector3(x, Math.min(M0 + SPR + y, M1 - 0.01), 0.11));
    put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ap), 28, 0.028, 6), O);
  }
  for (const e of [-1, 1]) {
    const pc = e * X(159), pw = X(78);
    for (let k = 0; k < 2; k++) {
      const cx = pc + (k - 0.5) * (pw / 2), w = pw / 2 - 0.03;
      flat(cx, 0.0, w, 4, M0 + 0.05, (u) => M0 + 0.68 + 0.04 * Math.cos(u * PI), () => M0 + 0.24, 0.028, O);
      const ap = arcPts(0, 0, w / 2, PI, 0, 14).map(([x, y]) => new THREE.Vector3(cx + x, M0 + 0.68 + y, 0.06));
      put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ap), 14, 0.018, 5), O);
      B(M.wood, w, M1 - (M0 + 0.68 + w / 2) - 0.04, 0.08, cx, (M1 + M0 + 0.68 + w / 2) / 2 - 0.02, 0.0);
    }
    for (const px of [e * X(108), e * X(216)]) {
      B(M.wood, X(22) + 0.04, M1 - M0, 0.14, px, (M0 + M1) / 2, 0.03);
      put(M.pil, new THREE.PlaneGeometry(X(22), M1 - M0 - 0.14), mul(O, mtx(px, (M0 + M1) / 2, 0.101)));
      put(M.gold, G.box(X(22) + 0.08, 0.06, 0.18), mul(O, mtx(px, M1 - 0.06, 0.04)));
    }
  }
  // 왕관 코니스(장미문 프리즈 텍스처)
  const K0 = M1, K1 = Y(237), KW = X(243);
  B(M.wood, 2 * KW, 0.1, CD - 0.2, 0, K0 + 0.05, -(CD - 0.2) / 2 + 0.06);
  {
    const fh = K1 - K0 - 0.2, fw = 2 * KW;
    const fg = new THREE.PlaneGeometry(fw, fh), uv = fg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (fw / (fh * (512 / 186))));
    put(M.frz, fg, mul(O, mtx(0, K0 + 0.1 + fh / 2, 0.07)));
    B(M.wood, fw, fh, 0.12, 0, K0 + 0.1 + fh / 2, 0.0);
  }
  moldingFront(M.wood, [[0.02, K1 - 0.1], [0.06, K1 - 0.08], [0.16, K1 - 0.03], [0.18, K1]], 2 * KW, CD - 0.2, 0, 0.06, O);
  B(M.gold, 2 * KW + 0.36, 0.025, 0.02, 0, K1 - 0.06, 0.18);
  // 위 끝 소용돌이 받침 + 나팔 부는 청동 천사 둘
  for (const e of [-1, 1]) {
    const sx = e * X(178);
    const vol = new THREE.Shape(); vol.moveTo(-0.55, 0); vol.lineTo(0.55, 0); vol.bezierCurveTo(0.55, 0.25, 0.3, 0.32, 0.1, 0.3); vol.bezierCurveTo(-0.2, 0.28, -0.45, 0.22, -0.55, 0);
    put(M.wood, extrude(vol, 0.7), mul(O, mtx(sx, K1, -0.6, 0, 0, 0, e, 1, 1)));
    put(M.gold, G.torus(0.09, 0.025, 6, 16), mul(O, mtx(sx + e * 0.5, K1 + 0.11, 0.12)));
    // 비스듬히 누운 천사(청동색, 길이 약 1.2m): 받침 위에 반쯤 누워 바깥쪽을 향해 나팔을 분다
    const A = mul(O, mtx(sx, K1 + 0.28, -0.15, 0, 0, 0, e, 1, 1)); // e<0이면 거울
    const L = (pts, n = 14) => G.lathe(pts.map(([a, b]) => V2(a, b)), n);
    put(M.bronze, L([[0, 0], [0.16, 0.02], [0.15, 0.2], [0.13, 0.36], [0.16, 0.46], [0.09, 0.52], [0, 0.53]]), mul(A, mtx(0.05, 0.02, 0, 0, 0, -0.35))); // 상체
    put(M.bronze, G.sph(0.085, 12, 10), mul(A, mtx(0.27, 0.56, 0.02))); // 머리
    put(M.bronze, G.sph(0.09, 10, 8), mul(A, mtx(0.25, 0.6, -0.02, 0, 0, 0, 1.05, 0.9, 1))); // 머리칼
    // 다리: 안쪽(가운데 쪽)으로 길게 뻗음 + 옷자락
    put(M.bronze, G.sph(1, 12, 8), mul(A, mtx(-0.28, 0.06, 0.02, 0, 0, -0.12, 0.42, 0.11, 0.17)));
    rod(M.bronze, [-0.2, 0.08, 0.08], [-0.66, 0.0, 0.12], 0.055, 8, A);
    rod(M.bronze, [-0.2, 0.08, -0.06], [-0.6, 0.14, -0.08], 0.055, 8, A);
    // 팔과 나팔: 바깥 위로
    rod(M.bronze, [0.18, 0.42, 0.08], [0.42, 0.62, 0.14], 0.035, 6, A);
    rod(M.bronze, [0.0, 0.42, 0.05], [0.3, 0.6, 0.16], 0.035, 6, A);
    put(M.gold, G.cone(0.05, 0.62, 12, true), mul(A, mtx(0.58, 0.73, 0.16, 0, 0, -1.0)));
    put(M.gold, G.cyl(0.012, 0.012, 0.3, 6, true), mul(A, mtx(0.42, 0.63, 0.16, 0, 0, -1.0)));
    // 날개: 등 뒤로 크게
    const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.bezierCurveTo(0.25, 0.1, 0.5, 0.45, 0.42, 0.78); wing.bezierCurveTo(0.25, 0.6, 0.08, 0.35, 0, 0);
    put(M.bronze, extrude(wing, 0.04), mul(A, mtx(-0.02, 0.3, -0.14, 0.85, 0.2, 1.05)));
    put(M.bronze, extrude(wing, 0.04), mul(A, mtx(-0.04, 0.28, -0.2, 1.0, 0.5, 1.2, 0.9, 0.9, 1)));
  }

  // 꼭대기 부분: 아치 판 3(가운데 7관, 양쪽 4관씩), 분절 페디먼트, 항아리 피니얼
  const U0 = K1, U1 = Y(150), UW = X(112);
  B(M.wood, 2 * UW, U1 - U0, 0.9, 0, (U0 + U1) / 2, -0.45);
  flat(0, 0.02, X(50), 7, U0 + 0.04, (u) => U0 + 0.75 + 0.14 * Math.sqrt(Math.max(0, 1 - (2 * u) ** 2)), () => U0 + 0.22, 0.026, O);
  put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts(0, 0, X(25) + 0.01, PI, 0, 14).map(([x, y]) => new THREE.Vector3(x, U0 + 0.75 + y, 0.06))), 14, 0.018, 5), O);
  for (const e of [-1, 1]) {
    const cx = e * X(66);
    for (const k of [-1, 1]) {
      const x = cx + k * X(10.5);
      flat(x, 0.02, X(20), 2, U0 + 0.04, () => U0 + 0.5, () => U0 + 0.18, 0.022, O);
      put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts(0, 0, X(10), PI, 0, 10).map(([a, b]) => new THREE.Vector3(x + a, U0 + 0.5 + b, 0.05))), 10, 0.014, 5), O);
    }
    for (const px of [e * X(30), e * X(101)]) {
      B(M.wood, 0.11, U1 - U0 - 0.2, 0.1, px, (U0 + U1 - 0.2) / 2, 0.03);
      B(M.gold, 0.06, U1 - U0 - 0.3, 0.02, px, (U0 + U1 - 0.2) / 2, 0.085);
    }
    B(M.wood, X(84), 0.18, 0.06, cx, U0 + 0.72, 0.03);
  }
  moldingFront(M.wood, [[0, U1 - 0.2], [0.04, U1 - 0.17], [0.1, U1 - 0.1], [0.1, U1 - 0.06], [0.08, U1]], 2 * UW, 0.9, 0, 0, O);
  B(M.gold, 2 * UW + 0.2, 0.025, 0.02, 0, U1 - 0.08, 0.11);
  { // 분절 페디먼트
    const R = 1.25, cy = U1 - R * 0.86, a0 = Math.acos(UW / R);
    const sh = new THREE.Shape(); sh.moveTo(-UW, U1);
    arcPts(0, cy, R, PI - a0, a0, 24).forEach(([x, y]) => sh.lineTo(x, y));
    sh.lineTo(UW, U1); sh.lineTo(-UW, U1);
    put(M.wood, extrude(sh, 0.3), mul(O, mtx(0, 0, -0.2)));
    const ap = arcPts(0, cy, R + 0.02, PI - a0, a0, 28).map(([x, y]) => new THREE.Vector3(x, y, 0.11));
    put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ap), 28, 0.04, 6), O);
    const ap2 = arcPts(0, cy, R - 0.1, PI - a0 + 0.04, a0 - 0.04, 24).map(([x, y]) => new THREE.Vector3(x, y, 0.11));
    put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ap2), 24, 0.02, 5), O);
    // 팀파눔 금박 소용돌이 장식
    for (const e of [-1, 1]) {
      const sc = Array.from({ length: 18 }, (_, i) => { const t = i / 17, a = t * 3.5; return new THREE.Vector3(e * (0.15 + 0.45 * t + 0.08 * Math.cos(a)), U1 + 0.08 + 0.1 * Math.sin(a) * (1 - t), 0.1); });
      put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sc), 24, 0.02, 5), O);
    }
    put(M.gold, G.sph(1, 10, 8), mul(O, mtx(0, U1 + 0.18, 0.1, 0, 0, 0, 0.12, 0.14, 0.05)));
    // 꼭대기 항아리 + 첨두
    const yTop = cy + R;
    put(M.gold, G.lathe([[0, 0], [0.1, 0], [0.12, 0.05], [0.06, 0.1], [0.14, 0.22], [0.12, 0.3], [0.05, 0.36], [0.07, 0.4], [0.02, 0.52], [0, 0.62]], 14), mul(O, mtx(0, yTop - 0.02, -0.05)));
    // 양 끝 불꽃 항아리
    for (const e of [-1, 1]) put(M.gold, G.lathe([[0, 0], [0.06, 0], [0.04, 0.05], [0.08, 0.13], [0.05, 0.2], [0.02, 0.3], [0, 0.34]], 10), mul(O, mtx(e * (UW - 0.05), U1, 0.0)));
  }

  // 원통 탑 둘 (아래 북: 파이프 3아치, 띠 코니스, 투각 난간띠, 위 북, 늑골 돔, 첨두)
  for (const e of [-1, 1]) {
    const tx = e * X(330), tz = 0.05, TR = X(77);
    const Tm = mul(O, mtx(tx, 0, tz));
    put(M.wood, G.lathe([[TR + 0.06, 0], [TR + 0.06, 1.7], [TR + 0.12, 1.8], [TR + 0.14, 1.95], [TR + 0.06, 2.05], [TR + 0.02, 2.1]], 32), Tm);
    put(M.gold, G.torus(TR + 0.13, 0.02, 5, 40), mul(Tm, mtx(0, 1.9, 0, PI / 2)));
    const T0 = 2.1, T1 = Y(410);
    // 뒤쪽 반은 막힌 나무, 앞쪽은 아치 3개
    const sector = 2.3, nA = 3, archSpring = Y(470);
    put(M.wood, new THREE.CylinderGeometry(TR, TR, T1 - T0, 32, 1, true, sector / 2, 2 * PI - sector), mul(Tm, mtx(0, (T0 + T1) / 2, 0)));
    put(M.wood, G.cyl(TR + 0.02, TR + 0.02, 0.04, 32), mul(Tm, mtx(0, T0 - 0.02, 0)));
    for (let i = 0; i < nA; i++) {
      const a0 = -sector / 2 + (sector / nA) * i, a1 = a0 + sector / nA, am = (a0 + a1) / 2;
      // 파이프(호를 따라 5개)
      for (let k = 0; k < 5; k++) {
        const a = a0 + ((a1 - a0) * (k + 0.5)) / 5, rr = TR - 0.07;
        const tall = archSpring + 0.18 * Math.cos(((k - 2) / 2.5) * (PI / 2));
        pipe(Math.sin(a) * rr, Math.cos(a) * rr, T0, T0 + 0.55 + 0.04 * Math.abs(k - 2), tall, 0.034, Tm, a);
      }
      // 아치 개구부를 나타내는 금박 아키볼트 + 위쪽 나무 스팬드럴(곡면 패널)
      const wA = 2 * TR * Math.sin((a1 - a0) / 2) - 0.06;
      const Am = mul(Tm, mtx(Math.sin(am) * (TR + 0.02), 0, Math.cos(am) * (TR + 0.02), 0, am, 0));
      put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts(0, 0, wA / 2, PI, 0, 14).map(([x, y]) => new THREE.Vector3(x, archSpring + y, 0.02))), 14, 0.022, 5), Am);
      put(M.gold, G.sph(1, 8, 6), mul(Am, mtx(0, archSpring + wA / 2 + 0.06, 0.03, 0, 0, 0, 0.06, 0.08, 0.03)));
      // 콜로넷(금박)
      const ab = a0;
      const cm = mul(Tm, mtx(Math.sin(ab) * (TR + 0.03), 0, Math.cos(ab) * (TR + 0.03), 0, ab, 0));
      put(M.gold, G.cyl(0.025, 0.025, archSpring - T0 - 0.1, 8, true), mul(cm, mtx(0, (T0 + archSpring) / 2, 0)));
      put(M.gold, G.cyl(0.05, 0.03, 0.1, 8), mul(cm, mtx(0, archSpring - 0.03, 0)));
    }
    { const ab = sector / 2; const cm = mul(Tm, mtx(Math.sin(ab) * (TR + 0.03), 0, Math.cos(ab) * (TR + 0.03), 0, ab, 0)); put(M.gold, G.cyl(0.025, 0.025, archSpring - T0 - 0.1, 8, true), mul(cm, mtx(0, (T0 + archSpring) / 2, 0))); }
    // 파이프 뒤 어두운 안쪽 + 아치 위 곡면 나무띠
    put(M.inside, G.cyl(TR - 0.14, TR - 0.14, T1 - T0, 24, true), mul(Tm, mtx(0, (T0 + T1) / 2, 0)));
    put(M.wood, G.cyl(TR + 0.01, TR + 0.01, T1 - archSpring - 0.14, 32, true), mul(Tm, mtx(0, (archSpring + 0.14 + T1) / 2, 0)));
    // 앞 아치 부분의 나무 원통을 비운다: 안쪽에서 보이지 않도록 앞쪽 벽은 위에서만 남김 → 원통 몸통은 뒤 절반만
    // 띠 코니스 + 금박 구슬
    put(M.wood, G.lathe([[TR, T1], [TR + 0.05, T1 + 0.03], [TR + 0.12, T1 + 0.1], [TR + 0.14, T1 + 0.16], [TR + 0.1, T1 + 0.2], [TR - 0.1, T1 + 0.22]], 36), Tm);
    for (let i = 0; i < 36; i++) { const a = (i / 36) * 2 * PI; put(M.gold, G.sph(0.018, 5, 4), mul(Tm, mtx(Math.sin(a) * (TR + 0.145), T1 + 0.13, Math.cos(a) * (TR + 0.145)))); }
    // 투각 난간띠(금박 타원 고리)
    const P0 = T1 + 0.22, PR = TR - 0.12;
    put(M.wood, G.cyl(PR, PR, 0.2, 32, true), mul(Tm, mtx(0, P0 + 0.1, 0)));
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 2 * PI; put(M.gold, G.torus(0.045, 0.012, 4, 12), mul(Tm, mtx(Math.sin(a) * (PR + 0.01), P0 + 0.1, Math.cos(a) * (PR + 0.01), 0, a, 0, 1, 0.75, 1))); }
    put(M.gold, G.torus(PR + 0.01, 0.015, 4, 36), mul(Tm, mtx(0, P0 + 0.2, 0, PI / 2)));
    // 위 북: 아치 4개(앞), 파이프
    const W0 = P0 + 0.2, W1 = Y(298), WR = X(46);
    put(M.wood, G.cyl(WR, WR, W1 - W0, 28, true), mul(Tm, mtx(0, (W0 + W1) / 2, -0.0)));
    for (let k = 0; k < 9; k++) {
      const a = -1.2 + (2.4 * (k + 0.5)) / 9, rr = WR + 0.03;
      pipe(Math.sin(a) * rr, Math.cos(a) * rr, W0 + 0.02, W0 + 0.2, W1 - 0.12 - 0.05 * Math.abs(k - 4) / 4, 0.022, Tm, a);
    }
    for (let i = 0; i <= 4; i++) {
      const a = -1.25 + (2.5 * i) / 4;
      const cm = mul(Tm, mtx(Math.sin(a) * (WR + 0.06), 0, Math.cos(a) * (WR + 0.06), 0, a, 0));
      put(M.gold, G.box(0.05, W1 - W0, 0.03), mul(cm, mtx(0, (W0 + W1) / 2, 0)));
    }
    put(M.wood, G.lathe([[WR + 0.06, W1], [WR + 0.1, W1 + 0.04], [WR + 0.1, W1 + 0.08], [WR + 0.02, W1 + 0.1]], 28), Tm);
    put(M.gold, G.torus(WR + 0.1, 0.012, 4, 28), mul(Tm, mtx(0, W1 + 0.06, 0, PI / 2)));
    // 늑골 돔 + 랜턴 + 첨두
    const D0 = W1 + 0.1, DR = WR + 0.02;
    put(M.slate, new THREE.SphereGeometry(DR, 24, 10, 0, 2 * PI, 0, PI / 2), mul(Tm, mtx(0, D0, 0, 0, 0, 0, 1, 1.0, 1)));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * PI;
      const rib = Array.from({ length: 9 }, (_, k) => { const t = (k / 8) * (PI / 2); return new THREE.Vector3(Math.sin(a) * Math.cos(t) * (DR + 0.01), D0 + Math.sin(t) * (DR + 0.01), Math.cos(a) * Math.cos(t) * (DR + 0.01)); });
      put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 10, 0.014, 4), Tm);
    }
    put(M.gold, G.lathe([[0, 0], [0.08, 0], [0.06, 0.06], [0.09, 0.14], [0.05, 0.2], [0.02, 0.24], [0.012, 0.5], [0, 0.55]], 12), mul(Tm, mtx(0, D0 + DR - 0.02, 0)));
  }
  // 탑과 가운데 사이 연결 벽(뒤로 물러남)
  for (const e of [-1, 1]) B(M.wood, X(330) - CW + 0.1, Y(420) - 0.0, 0.9, e * (CW + X(330)) / 2, Y(420) / 2, -0.75);
  // 케이스 지붕/뒤판(어두운 나무)
  B(M.woodDark, 2 * CW, 0.05, CD, 0, M1, -CD / 2 - 0.1);
  B(M.woodDark, 2 * CW, M1 - 0.1, 0.05, 0, (M1 - 0.1) / 2, -CD + 0.02);
  B(M.woodDark, 2 * UW, U1 - K0, 0.05, 0, (U1 + K0) / 2, -0.88);

  // ---------- 병합 ----------
  const root = new THREE.Group();
  root.name = 'organ-west-gallery';
  for (const [mat, list] of bags) root.add(new THREE.Mesh(mergeGeometries(list, false), mat));
  root.userData = {
    builder: 'Angster József és Fia, op. 450 (1905), 1932·1938 확장, 1993~ Váradi 복원, 2024~ 복원',
    galleryFloorY: +GTOP.toFixed(2),
    caseFrontZ: OZ,
    caseSize: { width: +(2 * (X(330) + X(77) + 0.14)).toFixed(2), height: 'about 7.2 m above gallery floor' },
    placement: '서쪽 정문 위 갤러리, 제단(동쪽)을 바라봄. 설치 시 y축 180° 회전 후 정문 안쪽 벽에 맞춘다.',
  };
  return root;
}
