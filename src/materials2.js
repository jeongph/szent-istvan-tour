// 실사 재질: 에이전트가 사진에서 뽑은 텍스처(public/real/...)가 있으면 쓰고, 없으면 사진 색을 맞춘 대체 텍스처를 쓴다.
import * as THREE from 'three';
import * as T from './textures.js';
import { angularMapMaterial } from './real/angularMap.js';

// GitHub Pages 같은 하위 경로 배포에서도 사진 텍스처를 찾도록 base 경로를 붙인다
const REAL = import.meta.env.BASE_URL + 'real/';

const loader = new THREE.TextureLoader();
async function tryTex(url, { srgb = true, repeat = [1, 1] } = {}) {
  try {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    return t;
  } catch {
    return null;
  }
}
async function tryJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// 팔각 격자 볼트 (사진: 금 테 팔각 코퍼, 어두운 올리브 바탕, 금 로제트, 사이에 작은 사각 코퍼)
function octaCofferFn(u, v, o) {
  const dx = Math.abs(u - 0.5), dy = Math.abs(v - 0.5);
  const oct = Math.max(Math.max(dx, dy), (dx + dy) * 0.7071 * 1.0);
  const gold = [206, 164, 86], goldHi = [236, 200, 120], stone = [190, 176, 150], deep = [70, 74, 58], shade = [120, 110, 92];
  const set = (c, m, ro, h) => {
    o.r = c[0];
    o.g = c[1];
    o.b = c[2];
    o.m = m;
    o.ro = ro;
    o.h = h;
  };
  if (oct < 0.36) {
    const r = Math.hypot(dx, dy), a = Math.atan2(v - 0.5, u - 0.5);
    if (oct > 0.33) return set(gold, 1, 0.3, 0.55);
    if (oct > 0.29) return set(shade, 0, 0.7, 0.45);
    if (oct > 0.265) return set(gold, 1, 0.32, 0.35);
    if (r < 0.1 + 0.035 * Math.cos(a * 8)) return set(r < 0.04 ? goldHi : gold, 1, 0.28, 0.6);
    return set(deep, 0, 0.75, 0.2);
  }
  if (oct < 0.39) return set(gold, 1, 0.3, 0.8);
  // 모서리의 작은 사각 코퍼
  const cx = Math.min(u, 1 - u), cy = Math.min(v, 1 - v);
  const sq = Math.max(cx, cy);
  if (sq < 0.085) return set(Math.hypot(cx, cy) < 0.04 ? goldHi : deep, Math.hypot(cx, cy) < 0.04 ? 1 : 0, 0.5, 0.3);
  if (sq < 0.1) return set(gold, 1, 0.3, 0.6);
  return set(stone, 0, 0.62, 1);
}

function inscriptionCanvas() {
  const c = T.canvas(4096, 128), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#2c4b55');
  g.addColorStop(1, '#22383f');
  x.fillStyle = g;
  x.fillRect(0, 0, 4096, 128);
  x.fillStyle = '#d6b05a';
  x.fillRect(0, 0, 4096, 6);
  x.fillRect(0, 122, 4096, 6);
  x.font = 'bold 74px "Times New Roman", Georgia, serif';
  x.textBaseline = 'middle';
  x.textAlign = 'center';
  const text = 'SANCTE · STEPHANE · INTERCEDE · PRO · NOBIS · APUD · REGEM · SAECULORUM';
  const words = text.split('');
  const total = x.measureText(text).width;
  let sp = (4096 - 160 - total) / (words.length - 1);
  let px = 80;
  for (const ch of words) {
    const w = x.measureText(ch).width;
    x.fillStyle = '#e2bd62';
    x.fillText(ch, px + w / 2, 68);
    px += w + sp;
  }
  return c;
}

export async function makeMaterials2(step) {
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const realMat = await tryJSON(`${REAL}mat/mat.json`);
  const realByName = Object.fromEntries((realMat || []).map((m) => [m.name, m]));
  // 실사 재질: 텍스처 repeat = 1 / 타일 크기(m). 형상 UV는 m 단위다.
  const fromReal = async (names, fallback, opts = {}) => {
    for (const n of names) {
      const m = realByName[n];
      if (!m) continue;
      const k = opts.scale ?? 1;
      const rep = [1 / (m.tileM[0] * k), 1 / (m.tileM[1] * k)];
      const t = await tryTex(`${REAL}${m.files.albedo}`, { repeat: rep });
      if (!t) continue;
      const mat = std({ map: t, roughness: opts.roughness ?? 0.4, metalness: opts.metalness ?? 0, color: opts.color ?? 0xffffff, side: opts.side ?? THREE.FrontSide });
      if (m.files.rough) {
        const r = await tryTex(`${REAL}${m.files.rough}`, { srgb: false, repeat: rep });
        if (r) (mat.roughnessMap = r), (mat.roughness = opts.roughMul ?? 1);
      }
      if (m.files.metal) {
        const mm = await tryTex(`${REAL}${m.files.metal}`, { srgb: false, repeat: rep });
        if (mm) (mat.metalnessMap = mm), (mat.metalness = 1);
      }
      if (m.files.height) {
        const h = await tryTex(`${REAL}${m.files.height}`, { srgb: false, repeat: rep });
        if (h) (mat.bumpMap = h), (mat.bumpScale = opts.bumpScale ?? 2);
      }
      mat.name = n;
      mat.userData.real = true;
      return mat;
    }
    const f = fallback();
    // 대체 텍스처는 예전 기준(약 2.5 m 한 장)으로 맞춘다
    for (const k of ['map', 'bumpMap', 'roughnessMap', 'metalnessMap']) if (f[k] && !opts.keepRepeat) f[k].repeat.set(1 / 2.5, 1 / 2.5);
    return f;
  };

  await step('대리석을 고르는 중');
  const marble = (o, rough) => std({ map: T.tex(T.marbleCanvas({ size: 512, ...o })), roughness: rough });
  M.redMarble = await fromReal(['marble_red'], () => marble({ base: [112, 40, 38], base2: [140, 58, 50], vein: [214, 186, 172], amt: 0.42, a: 1, b: 3, turb: 3.4, seed: 12 }, 0.18), { roughness: 0.16 });
  M.greenMarble = await fromReal(['marble_green'], () => marble({ base: [92, 98, 88], base2: [112, 118, 104], vein: [186, 190, 176], amt: 0.35, a: 2, b: 1, seed: 13 }, 0.22), { roughness: 0.2 });
  M.greenPanel = M.greenMarble;
  M.frieze = await fromReal(['marble_blue'], () => marble({ base: [86, 104, 112], base2: [104, 122, 128], vein: [196, 206, 210], amt: 0.4, a: 3, b: 1, seed: 14 }, 0.2), { roughness: 0.2 });
  M.whiteMarble = await fromReal(['marble_cream'], () => marble({ base: [232, 228, 220], base2: [220, 216, 208], vein: [176, 172, 166], amt: 0.25, seed: 15, speck: 3 }, 0.3), { roughness: 0.28 });
  M.stone = await fromReal(['marble_cream'], () => marble({ base: [196, 186, 164], base2: [182, 172, 150], vein: [160, 150, 130], amt: 0.15, seed: 16, speck: 4 }, 0.6), { roughness: 0.6 });
  M.wall = await fromReal(['stucco_cream'], () => marble({ base: [176, 166, 144], base2: [164, 154, 132], vein: [150, 140, 120], amt: 0.12, seed: 17, speck: 4 }, 0.7), { roughness: 0.7 });
  M.statue = std({ map: T.tex(T.marbleCanvas({ size: 256, base: [240, 236, 228], base2: [230, 226, 218], vein: [196, 192, 186], amt: 0.2, seed: 21 })), roughness: 0.4, side: THREE.DoubleSide });
  M.wood = await fromReal(['wood_oak'], () => std({ map: T.tex(T.woodCanvas()), roughness: 0.5, color: '#8a6a52' }), { roughness: 0.5 });
  M.wallDS = M.wall.clone();
  M.apseGold = (await fromReal(['gold_leaf'], () => std({ color: '#b8904a', metalness: 0.7, roughness: 0.45 }), { metalness: 0.75, roughMul: 1.4 })).clone();
  M.apseGold.color = new THREE.Color('#d9b878');
  M.chapelWall = await fromReal(['chapel_wall', 'chapel_marble'], () => marble({ base: [120, 100, 84], base2: [136, 114, 96], vein: [190, 174, 156], amt: 0.25, seed: 22 }, 0.4), { roughness: 0.4 });
  M.chapelCeil = M.chapelWall;
  M.wallDS.side = THREE.DoubleSide;

  await step('바닥을 까는 중');
  M.floor = await fromReal(['floor_checker'], () => {
    const S = 1024, c = T.canvas(S, S), x = c.getContext('2d');
    const w = T.marbleCanvas({ size: 256, base: [232, 228, 222], base2: [222, 218, 210], vein: [180, 176, 170], amt: 0.25, seed: 18 });
    const k = T.marbleCanvas({ size: 256, base: [92, 100, 108], base2: [104, 112, 120], vein: [170, 176, 182], amt: 0.3, seed: 19 });
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) x.drawImage((i + j) % 2 ? k : w, i * 512, j * 512, 512, 512);
    const t = T.tex(c);
    t.repeat.set(1 / 1.6, 1 / 1.6);
    return std({ map: t, roughness: 0.12 });
  }, { roughness: 0.2, roughMul: 1.6, bumpScale: 0.6, keepRepeat: true });
  M.floorCross = await fromReal(['marble_salmon'], () => M.floor, { roughness: 0.24 });
  {
    const med = realByName.floor_medallion;
    const t = med && (await tryTex(`${REAL}${med.files.albedo}`));
    const a = med && med.files.mask && (await tryTex(`${REAL}${med.files.mask}`, { srgb: false }));
    if (t) {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      if (a) a.wrapS = a.wrapT = THREE.ClampToEdgeWrapping;
      M.medallion = std({ map: t, alphaMap: a || null, transparent: !!a, roughness: 0.24, polygonOffset: true, polygonOffsetFactor: -2 });
      M.medallionSize = med.tileM[0];
    }
  }
  M.floorSanct = M.floor;

  await step('볼트 격자를 새기는 중');
  M.coffer = await fromReal(['coffer_oct'], () => {
    const t = T.renderFn(512, 512, octaCofferFn, { noise: 5 });
    return T.surfaceMat(t, { bumpScale: 1.4 });
  }, { bumpScale: 1.5, side: THREE.DoubleSide, scale: 2 });
  M.soffit = await fromReal(['soffit_oct2'], () => M.coffer, { bumpScale: 1.5, side: THREE.DoubleSide, scale: 1.6 });
  M.coffer.side = THREE.DoubleSide;
  const orn = T.ornamentCanvas();
  M.gold = await fromReal(['gold_leaf'], () => std({ color: '#c9a050', metalness: 1, roughness: 0.32 }), { metalness: 1, roughMul: 1 });
  M.goldDS = M.gold.clone();
  M.goldDS.side = THREE.DoubleSide;
  M.goldOrn = await fromReal(['frieze_rinceau'], () =>
    std({ color: '#d4ab5c', map: T.tex(orn, { repeat: [1, 4] }), bumpMap: T.tex(orn, { repeat: [1, 4], srgb: false }), bumpScale: 3, metalness: 1, roughness: 0.34 }),
    { metalness: 1, bumpScale: 2.5 },
  );
  M.goldOrn.side = THREE.DoubleSide;
  if (M.goldOrn.userData.real) for (const k of ['map', 'bumpMap', 'roughnessMap', 'metalnessMap']) if (M.goldOrn[k]) M.goldOrn[k].wrapT = THREE.ClampToEdgeWrapping;
  if (M.soffit.userData?.real) for (const k of ['map', 'bumpMap', 'roughnessMap', 'metalnessMap']) if (M.soffit[k]) M.soffit[k].wrapS = THREE.ClampToEdgeWrapping;
  M.floorCross.polygonOffset = true;
  M.floorCross.polygonOffsetFactor = -1;
  M.capital = std({ color: '#d0a652', map: T.tex(orn, { repeat: [1, 2] }), bumpMap: T.tex(orn, { repeat: [1, 2], srgb: false }), bumpScale: 4, metalness: 1, roughness: 0.36 });
  const door = T.bronzeDoorCanvas();
  M.bronze = std({ color: '#7d5f3a', map: T.tex(door), bumpMap: T.tex(door, { srgb: false }), bumpScale: 3, metalness: 0.85, roughness: 0.45 });
  M.inscription = std({ map: T.tex(inscriptionCanvas(), { wrap: false }), roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
  M.apseDome = (await (async () => {
    const t = await tryTex(`${REAL}art/apse_halfdome.jpg`);
    if (t) return std({ map: t, roughness: 0.6, side: THREE.DoubleSide });
    return T.surfaceMat(T.renderFn(2048, 1024, T.apseFn, { cell: 5, seed: 23 }), { bumpScale: 0.4 });
  })());
  M.apseDome.side = THREE.DoubleSide;
  M.glassMats = [];
  M.thermalGlass = new THREE.MeshBasicMaterial({ map: T.tex(T.lunetteWindowCanvas(), { wrap: false }), color: new THREE.Color(1.9, 1.8, 1.65), side: THREE.DoubleSide });
  M.archGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.62, 1.5), side: THREE.DoubleSide });
  M.glassMats.push(M.thermalGlass, M.archGlass);

  await step('제단화와 스테인드글라스를 거는 중');
  M.art = {};
  const art = await tryJSON(`${REAL}art/art.json`);
  for (const a of art || []) {
    const map = await tryTex(`${REAL}${a.texture}`);
    if (!map) continue;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    const alpha = a.mask ? await tryTex(`${REAL}${a.mask}`, { srgb: false }) : null;
    if (alpha) alpha.wrapS = alpha.wrapT = THREE.ClampToEdgeWrapping;
    const glass = a.kind === 'stained-glass' || /window|lunette/.test(a.id);
    const mat = glass
      ? new THREE.MeshBasicMaterial({ map, alphaMap: alpha, alphaTest: alpha ? 0.5 : 0, color: new THREE.Color(1.55, 1.5, 1.42), side: THREE.DoubleSide })
      : std({ map, alphaMap: alpha, alphaTest: alpha ? 0.5 : 0, roughness: 0.55, side: THREE.DoubleSide });
    M.art[a.id] = { ...a, mat };
    if (glass) M.glassMats.push(mat);
  }

  await step('돔 사진을 펴는 중');
  const domeInfo = await tryJSON(`${REAL}dome/dome.json`);
  const skyTex = await tryTex(`${REAL}dome/sky.jpg`);
  const zenTex = await tryTex(`${REAL}dome/zenith.jpg`);
  if (domeInfo && skyTex) {
    M.crossing = angularMapMaterial(skyTex, {
      zenith: zenTex,
      zenithDeg: 16,
      center: new THREE.Vector3(0, domeInfo.cameraHeightM ?? domeInfo.map?.viewpoint?.P?.[1] ?? 1.6, 0),
      thetaMax: THREE.MathUtils.degToRad(domeInfo.map?.thetaMaxDeg ?? domeInfo.thetaMaxDeg ?? 45),
      gain: domeInfo.gain ?? 1,
    });
    M.domeInfo = domeInfo;
  } else {
    M.crossing = std({ color: '#b9a57e', roughness: 0.7, side: THREE.DoubleSide });
  }
  return M;
}
