// 모든 텍스처는 캔버스에서 절차적으로 생성한다 (외부 이미지 없음).
import * as THREE from 'three';
import { rng, hash2, fbm } from './noise.js';

export const PAL = {
  gold: [212, 168, 82],
  goldLight: [240, 206, 126],
  goldDeep: [172, 126, 50],
  lapis: [38, 64, 122],
  lapisDeep: [20, 34, 74],
  ivory: [236, 227, 207],
  cream: [218, 204, 176],
  oxblood: [124, 38, 34],
  skin: [216, 172, 134],
  white: [244, 240, 231],
  green: [58, 92, 68],
  hair: [74, 52, 38],
};

let maxAniso = 8;
export function setMaxAniso(a) {
  maxAniso = Math.min(16, a || 8);
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function tex(c, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function put(o, c, m = 0, ro = 0.6) {
  o.r = c[0];
  o.g = c[1];
  o.b = c[2];
  o.m = m;
  o.ro = ro;
}

// 가짜 글자(명문 띠)
function glyph(s, t) {
  const ci = Math.floor(s), fx = s - ci;
  if (hash2(ci, 3, 99) < 0.14 || fx > 0.76) return false;
  const h2 = hash2(ci, 7, 13), h3 = hash2(ci, 11, 5);
  const inY = t > 0.16 && t < 0.84;
  return (
    (fx < 0.17 && inY) ||
    (h2 > 0.45 && fx > 0.56 && fx < 0.73 && inY) ||
    (h3 > 0.4 && t > 0.16 && t < 0.3 && fx < 0.73) ||
    (h2 < 0.6 && Math.abs(t - 0.5) < 0.08 && fx < 0.7) ||
    (h3 < 0.55 && t > 0.7 && t < 0.84 && fx < 0.73)
  );
}

const MEANDER = ['111111', '100000', '101110', '101010', '100010', '111110'];
function meander(s, t) {
  const fx = s - Math.floor(s);
  const gx = Math.min(5, Math.floor(fx * 6)), gy = Math.min(5, Math.max(0, Math.floor(t * 6)));
  return MEANDER[gy][gx] === '1';
}

/**
 * 함수 fn(u, v, out)으로 색/금속/거칠기/높이/발광을 그린다.
 * cell > 0 이면 모자이크(테세라) 방식으로 칸마다 한 번씩 평가한다.
 * 반환: map(sRGB 색), orm(R=높이, G=거칠기, B=금속), em(발광)
 */
export function renderFn(w, h, fn, opt = {}) {
  const { cell = 0, seed = 1, jitter = 0.1, emissive = false, grout = [118, 92, 56], noise = 0 } = opt;
  const cm = canvas(w, h), co = canvas(w, h), ce = emissive ? canvas(w, h) : null;
  const im = cm.getContext('2d').createImageData(w, h);
  const io = co.getContext('2d').createImageData(w, h);
  const ie = ce ? ce.getContext('2d').createImageData(w, h) : null;
  const D = im.data, O = io.data, E = ie ? ie.data : null;
  const o = { r: 0, g: 0, b: 0, m: 0, ro: 0.6, h: 1, e: 0 };
  const R = rng(seed);
  const reset = () => {
    o.r = o.g = o.b = 0;
    o.m = 0;
    o.ro = 0.6;
    o.h = 1;
    o.e = 0;
  };
  const write = (i, r, g, b, m, ro, hh, e) => {
    D[i] = r;
    D[i + 1] = g;
    D[i + 2] = b;
    D[i + 3] = 255;
    O[i] = hh * 255;
    O[i + 1] = ro * 255;
    O[i + 2] = m * 255;
    O[i + 3] = 255;
    if (E) {
      E[i] = r * e;
      E[i + 1] = g * e;
      E[i + 2] = b * e;
      E[i + 3] = 255;
    }
  };
  if (cell > 0) {
    const cols = Math.ceil(w / cell) + 2;
    const tr = new Float32Array(cols * 8);
    for (let ry = 0; ry * cell < h; ry++) {
      const shift = Math.floor(R() * cell);
      const cy = Math.min(h - 1, ry * cell + cell * 0.5) / h;
      for (let tx = 0; tx < cols; tx++) {
        let cx = (tx * cell - shift + cell * 0.5) / w;
        cx -= Math.floor(cx);
        reset();
        fn(cx, cy, o);
        const metal = o.m > 0.5;
        const j = 1 + (R() - 0.5) * 2 * jitter * (metal ? 1.5 : 0.8);
        const hj = metal ? (R() - 0.5) * 18 : 0;
        const k = tx * 8;
        tr[k] = o.r * j + hj;
        tr[k + 1] = o.g * j;
        tr[k + 2] = o.b * j - hj * 0.6;
        tr[k + 3] = o.m;
        tr[k + 4] = Math.min(1, Math.max(0.05, o.ro + (R() - 0.5) * 0.2));
        tr[k + 5] = 0.72 + R() * 0.28;
        tr[k + 6] = o.e;
      }
      const y1 = Math.min(h, (ry + 1) * cell);
      for (let y = ry * cell; y < y1; y++) {
        const gy = y === ry * cell;
        for (let x = 0; x < w; x++) {
          const xx = x + shift;
          const k = ((xx / cell) | 0) * 8;
          const i = (y * w + x) * 4;
          if (gy || xx % cell === 0) {
            write(i, grout[0], grout[1], grout[2], tr[k + 3] * 0.5, 0.8, 0, tr[k + 6] * 0.4);
          } else {
            write(i, tr[k], tr[k + 1], tr[k + 2], tr[k + 3], tr[k + 4], tr[k + 5], tr[k + 6]);
          }
        }
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        reset();
        fn((x + 0.5) / w, (y + 0.5) / h, o);
        const n = noise ? (R() - 0.5) * noise : 0;
        write((y * w + x) * 4, o.r + n, o.g + n, o.b + n, o.m, o.ro, o.h, o.e);
      }
    }
  }
  cm.getContext('2d').putImageData(im, 0, 0);
  co.getContext('2d').putImageData(io, 0, 0);
  if (ce) ce.getContext('2d').putImageData(ie, 0, 0);
  return { map: tex(cm), orm: tex(co, { srgb: false }), em: ce ? tex(ce) : null, canvas: cm };
}

export function surfaceMat(t, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    roughnessMap: t.orm,
    metalnessMap: t.orm,
    roughness: 1,
    metalness: 1,
    bumpMap: o.bump === false ? null : t.orm,
    bumpScale: o.bumpScale ?? 0.6,
    side: o.side ?? THREE.DoubleSide,
  });
  if (t.em) {
    m.emissiveMap = t.em;
    m.emissive = new THREE.Color(1, 1, 1);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  return m;
}

/* ---------------------------------- 대리석 ---------------------------------- */

export function marbleCanvas({
  size = 512, base, base2, vein, amt = 0.6, a = 1, b = 2, turb = 2.6, sharp = 9, freq = 3, seed = 0, speck = 6,
}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const im = ctx.createImageData(size, size), d = im.data;
  const R = rng(seed + 11);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = fbm(u, v, freq, 5, seed);
      const cl = Math.min(1, Math.max(0, fbm(u, v, 2, 3, seed + 90) * 0.9 + 0.5));
      const s1 = Math.sin(Math.PI * 2 * (a * u + b * v) + n * turb * Math.PI);
      const n2 = fbm(u, v, freq * 2, 3, seed + 40);
      const s2 = Math.sin(Math.PI * 2 * (b * u - a * v) * 2 + n2 * turb * 3.5);
      const t = Math.min(1, Math.pow(1 - Math.abs(s1), sharp) * amt + Math.pow(1 - Math.abs(s2), sharp * 2.5) * amt * 0.45);
      const i = (y * size + x) * 4, sp = (R() - 0.5) * speck;
      for (let k = 0; k < 3; k++) {
        const bc = base[k] + (base2[k] - base[k]) * cl;
        d[i + k] = bc + (vein[k] - bc) * t + sp;
      }
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

export function makeMarbles() {
  return {
    cream: marbleCanvas({ base: [234, 225, 207], base2: [222, 209, 184], vein: [166, 150, 126], amt: 0.5, seed: 1 }),
    red: marbleCanvas({ base: [118, 52, 40], base2: [146, 70, 54], vein: [226, 200, 182], amt: 0.42, a: 2, b: 1, turb: 3.2, seed: 2 }),
    green: marbleCanvas({ base: [44, 70, 58], base2: [60, 92, 74], vein: [196, 214, 198], amt: 0.45, a: 1, b: 3, seed: 3 }),
    grey: marbleCanvas({ size: 256, base: [150, 146, 140], base2: [128, 124, 120], vein: [216, 212, 204], amt: 0.5, seed: 4 }),
    white: marbleCanvas({ size: 256, base: [242, 238, 230], base2: [230, 226, 218], vein: [190, 186, 180], amt: 0.25, seed: 5, speck: 3 }),
    yellow: marbleCanvas({ size: 256, base: [214, 178, 110], base2: [196, 156, 92], vein: [246, 232, 200], amt: 0.4, seed: 6 }),
  };
}

/* ---------------------------------- 바닥 ---------------------------------- */

function pat(ctx, cv, sc = 1) {
  const p = ctx.createPattern(cv, 'repeat');
  p.setTransform(new DOMMatrix().scale(sc));
  return p;
}

// 팔(신랑, 수랑) 바닥: 4m × 4m 반복 타일
export function floorTileCanvas(m) {
  const S = 1024, c = canvas(S, S), x = c.getContext('2d'), C = S / 2;
  x.fillStyle = pat(x, m.red, 0.8);
  x.fillRect(0, 0, S, S);
  const diamond = (cx, cy, r, fill, stroke, lw) => {
    x.beginPath();
    x.moveTo(cx, cy - r);
    x.lineTo(cx + r, cy);
    x.lineTo(cx, cy + r);
    x.lineTo(cx - r, cy);
    x.closePath();
    x.fillStyle = fill;
    x.fill();
    if (stroke) {
      x.strokeStyle = stroke;
      x.lineWidth = lw;
      x.stroke();
    }
  };
  diamond(C, C, 468, pat(x, m.cream), '#4a443c', 10);
  diamond(C, C, 330, pat(x, m.grey, 1.2), '#4a443c', 6);
  diamond(C, C, 290, pat(x, m.cream, 1.4), null);
  diamond(C, C, 90, pat(x, m.yellow, 1.5), '#7a2e2a', 6);
  for (const [cx, cy] of [[0, 0], [S, 0], [0, S], [S, S]]) diamond(cx, cy, 120, pat(x, m.green), '#2c2a26', 6);
  x.strokeStyle = 'rgba(60,48,38,0.55)';
  x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, S - 3, S - 3);
  return c;
}

// 돔 아래 교차부 바닥: 22m × 22m 한 장
export function crossingFloorCanvas(m) {
  const S = 2048, c = canvas(S, S), x = c.getContext('2d'), C = S / 2, k = S / 22;
  x.fillStyle = pat(x, m.grey, 1.4);
  x.fillRect(0, 0, S, S);
  x.fillStyle = pat(x, m.cream);
  x.fillRect(0.5 * k, 0.5 * k, 21 * k, 21 * k);
  x.fillStyle = pat(x, m.red);
  x.fillRect(0.8 * k, 0.8 * k, 20.4 * k, 20.4 * k);
  x.fillStyle = pat(x, m.cream, 1.2);
  x.fillRect(1.1 * k, 1.1 * k, 19.8 * k, 19.8 * k);
  const disk = (r, fill) => {
    x.beginPath();
    x.arc(C, C, r * k, 0, Math.PI * 2);
    x.fillStyle = fill;
    x.fill();
  };
  // 모서리 부채꼴
  for (const [cx, cy] of [[1.1, 1.1], [20.9, 1.1], [1.1, 20.9], [20.9, 20.9]]) {
    x.beginPath();
    x.arc(cx * k, cy * k, 3.6 * k, 0, Math.PI * 2);
    x.fillStyle = pat(x, m.green);
    x.fill();
    x.beginPath();
    x.arc(cx * k, cy * k, 3.0 * k, 0, Math.PI * 2);
    x.fillStyle = pat(x, m.cream, 1.3);
    x.fill();
  }
  disk(10.0, pat(x, m.red));
  disk(9.6, pat(x, m.yellow, 1.5));
  disk(9.4, pat(x, m.cream));
  // 32갈래 별
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, long = i % 2 === 0, R1 = (long ? 9.2 : 6.6) * k, r0 = 2.3 * k, hw = Math.PI / 32;
    x.beginPath();
    x.moveTo(C + Math.cos(a - hw) * r0, C + Math.sin(a - hw) * r0);
    x.lineTo(C + Math.cos(a) * R1, C + Math.sin(a) * R1);
    x.lineTo(C + Math.cos(a + hw) * r0, C + Math.sin(a + hw) * r0);
    x.closePath();
    x.fillStyle = long ? (i % 4 === 0 ? pat(x, m.red) : pat(x, m.green)) : pat(x, m.grey, 1.3);
    x.fill();
    x.strokeStyle = 'rgba(40,32,26,0.5)';
    x.lineWidth = 3;
    x.stroke();
  }
  disk(2.5, pat(x, m.yellow, 1.5));
  disk(2.25, pat(x, m.red));
  disk(1.5, pat(x, m.cream, 1.6));
  disk(0.6, pat(x, m.green));
  // 이음선
  x.strokeStyle = 'rgba(50,40,30,0.35)';
  x.lineWidth = 2;
  for (let r = 2.5; r <= 10; r += 2.5) {
    x.beginPath();
    x.arc(C, C, r * k, 0, Math.PI * 2);
    x.stroke();
  }
  return c;
}

/* ------------------------------ 돔과 볼트 디자인 ------------------------------ */

function standingFigure(o, X, Y, top, bot, k, angel) {
  // 머리 중심은 top 근처, 발은 bot
  const hy = Y - (top + 0.45), dHead = Math.hypot(X, hy);
  if (angel) {
    const wx = Math.abs(X) - 1.0, wy = Y - (top + 2.2);
    if ((wx * wx) / 0.42 + (wy * wy) / 5.2 < 1 && Math.abs(X) > 0.35) {
      put(o, Math.floor((wy + 4) / 0.38) % 2 ? PAL.white : [190, 206, 224], 0, 0.6);
    }
  }
  if (dHead < 0.88) put(o, dHead > 0.78 ? PAL.oxblood : PAL.goldLight, dHead > 0.78 ? 0 : 1, 0.22);
  if (dHead < 0.42) {
    put(o, PAL.skin, 0, 0.6);
    if (hy < -0.12 && Math.abs(X) < 0.42) put(o, angel ? [182, 132, 72] : PAL.hair, 0, 0.6);
  }
  const t0 = top + 0.95;
  if (Y > t0 && Y < bot) {
    const t = (Y - t0) / (bot - t0);
    const half = 0.5 + t * 0.6 - (t < 0.1 ? 0.22 * (1 - t / 0.1) : 0);
    if (Math.abs(X) < half) {
      const robe = angel ? PAL.white : k % 4 === 0 ? PAL.lapis : PAL.oxblood;
      put(o, robe, 0, 0.6);
      const fold = Math.abs(Math.sin((X / half) * 4.5 + t * 1.5));
      if (fold < 0.13 && t > 0.2) put(o, mix(robe, [16, 16, 26], 0.38), 0, 0.6);
      if (Math.abs(X) < 0.15 && t > 0.04) put(o, angel ? PAL.gold : PAL.ivory, angel ? 1 : 0, 0.4);
      if (t > 0.965) put(o, PAL.gold, 1, 0.3);
    }
  }
  if (Y > bot && Y < bot + 0.32) put(o, PAL.green, 0, 0.6);
}

function stars(o, X, Y, k, base) {
  const s = 0.9, gx = Math.floor((X + 20) / s), gy = Math.floor(Y / s);
  const lx = Math.abs(((X + 20) / s) % 1 - 0.5), ly = Math.abs((Y / s) % 1 - 0.5);
  if (hash2(gx + k * 61, gy, 7) > 0.55) {
    if (lx + ly < 0.17 || (lx < 0.05 && ly < 0.32) || (ly < 0.05 && lx < 0.32)) put(o, PAL.goldLight, 1, 0.22);
  }
  return base;
}

// 중앙 돔: u 둘레, v 0=천창 가장자리 1=돔 밑단
export const DOME_TH0 = 0.218;
export function domeFn(u, v, o) {
  const N = 16, Rd = 11;
  const pu = u * N, k = Math.floor(pu), f = pu - k;
  const th = DOME_TH0 + v * (Math.PI / 2 - DOME_TH0);
  const sinT = Math.sin(th);
  const W = (2 * Math.PI * Rd * sinT) / N;
  const X = (f - 0.5) * W, Y = Rd * (th - DOME_TH0);
  const edge = Math.min(f, 1 - f) * W;
  if (Y < 1.0) {
    put(o, PAL.lapisDeep, 0, 0.6);
    if (Y < 0.14 || Y > 0.86) put(o, PAL.gold, 1, 0.3);
    else if (glyph((u * 2 * Math.PI * Rd * sinT) / 0.42, (Y - 0.14) / 0.72)) put(o, PAL.goldLight, 1, 0.25);
    return;
  }
  if (Y > 13.75) {
    put(o, PAL.lapis, 0, 0.6);
    const t = (Y - 13.75) / 1.15;
    if (t < 0.12 || t > 0.88 || meander((u * 2 * Math.PI * Rd) / 1.1, (t - 0.12) / 0.76)) put(o, PAL.gold, 1, 0.3);
    return;
  }
  if (edge < 0.34) {
    if (edge < 0.08) put(o, PAL.goldLight, 1, 0.24);
    else if (edge > 0.27) put(o, PAL.oxblood, 0, 0.6);
    else {
      put(o, PAL.ivory, 0, 0.55);
      if (Math.abs(((Y / 0.7) % 1) - 0.5) < 0.16) put(o, PAL.gold, 1, 0.3);
    }
    return;
  }
  if (Y < 4.8) {
    put(o, mix(PAL.lapisDeep, PAL.lapis, (Y - 1) / 3.8), 0, 0.65);
    stars(o, X, Y, k);
    if (Y > 4.5) put(o, PAL.gold, 1, 0.3);
    return;
  }
  put(o, PAL.gold, 1, 0.3);
  standingFigure(o, X, Y, 5.4, 12.2, k, k % 2 === 1);
  if (Y > 12.75 && Y < 13.55) {
    put(o, PAL.oxblood, 0, 0.6);
    if (glyph((u * 2 * Math.PI * Rd * sinT) / 0.5, (Y - 12.75) / 0.8)) put(o, PAL.goldLight, 1, 0.25);
  }
}

// 펜던티브: u = 방위각/2π, v 0=드럼 고리 1=적도
export function pendFn(u, v, o) {
  const Rs = 11 * Math.SQRT2;
  const phi = u * Math.PI * 2, th = Math.PI / 4 + (v * Math.PI) / 4;
  const q = Math.round((phi - Math.PI / 4) / (Math.PI / 2));
  const pc = Math.PI / 4 + (q * Math.PI) / 2;
  const X = (phi - pc) * Rs * Math.sin(th), Y = (th - Math.PI / 4) * Rs;
  put(o, PAL.gold, 1, 0.3);
  const d1 = (X + Y) / 0.95, d2 = (X - Y) / 0.95;
  if (Math.abs(d1 - Math.round(d1)) < 0.07 || Math.abs(d2 - Math.round(d2)) < 0.07) put(o, PAL.goldDeep, 1, 0.42);
  if (Y < 0.75) {
    put(o, PAL.lapisDeep, 0, 0.6);
    if (Y < 0.12 || Y > 0.63) put(o, PAL.gold, 1, 0.3);
    else if (glyph((phi * Rs * Math.sin(th)) / 0.42, (Y - 0.12) / 0.51)) put(o, PAL.goldLight, 1, 0.25);
    return;
  }
  const dy = Y - 3.4, r = Math.hypot(X, dy);
  if (r < 2.15) {
    if (r > 1.95) put(o, PAL.goldLight, 1, 0.24);
    else if (r > 1.82) put(o, PAL.oxblood, 0, 0.6);
    else {
      put(o, mix(PAL.lapis, PAL.lapisDeep, r / 1.82), 0, 0.6);
      const hy = dy + 0.5, dh = Math.hypot(X, hy);
      if (dh < 0.72) put(o, PAL.goldLight, 1, 0.24);
      if (dh < 0.36) {
        put(o, PAL.skin, 0, 0.6);
        if (hy < -0.12) put(o, PAL.hair, 0, 0.6);
      }
      if (dy > -0.05 && dy < 1.75 && Math.abs(X) < 0.42 + (dy + 0.05) * 0.5) {
        put(o, q % 2 ? PAL.oxblood : PAL.ivory, 0, 0.6);
        if (Math.abs(X) < 0.1) put(o, PAL.gold, 1, 0.3);
      }
      if (dy > 0.55 && dy < 1.15 && X > 0.05 && X < 0.75) put(o, PAL.goldLight, 1, 0.3);
    }
  }
}

// 후진 반돔: u 반원 둘레, v 0=꼭대기 1=밑단
export function apseFn(u, v, o) {
  const Ra = 11, th = (v * Math.PI) / 2;
  const sinT = Math.sin(th);
  const X = (u - 0.5) * Math.PI * Ra * sinT, Y = th * Ra;
  const zEdge = Math.sin(u * Math.PI) * Ra * sinT; // 아치면까지 거리
  put(o, mix(PAL.lapisDeep, PAL.lapis, Y / 17.3), 0, 0.65);
  stars(o, X, Y, 3);
  const cy = 8.6, dx = X, dy = Y - cy;
  const ang = Math.atan2(dy, dx), r = Math.hypot(dx, dy * 0.75);
  if (r < 7.8 && r > 2.5 && Math.abs(Math.sin(ang * 14)) > 0.88) put(o, PAL.gold, 1, 0.3);
  const me = (dx * dx) / (2.7 * 2.7) + (dy * dy) / (4.9 * 4.9);
  if (me < 1) {
    put(o, me > 0.86 ? PAL.goldLight : mix(PAL.goldLight, PAL.gold, me), 1, 0.25);
    standingFigure(o, dx, Y, cy - 4.0, cy + 3.9, 4, false);
  }
  for (const side of [-1, 1]) {
    const ax = X - side * 5.6;
    if (Math.abs(ax) < 1.6 && Y > 6 && Y < 13.6) {
      const keep = { r: o.r, g: o.g, b: o.b, m: o.m, ro: o.ro };
      standingFigure(o, ax, Y, 6.2, 13.2, 1, true);
      if (o.r === keep.r && o.g === keep.g && o.b === keep.b) Object.assign(o, keep);
    }
  }
  if (Y > 15.6 && Y < 16.5) {
    put(o, PAL.oxblood, 0, 0.6);
    if (glyph(X / 0.45 + 100, (Y - 15.6) / 0.9)) put(o, PAL.goldLight, 1, 0.25);
  }
  if (Y > 16.5) put(o, PAL.gold, 1, 0.3);
  if (zEdge < 0.7) put(o, zEdge < 0.25 ? PAL.goldLight : PAL.ivory, zEdge < 0.25 ? 1 : 0, 0.3);
}

// 작은 돔(신랑, 수랑): u,v는 직사각형 평면 좌표
export function sailFn(u, v, o) {
  const X = (u - 0.5) * 22, Z = (v - 0.5) * 18, r = Math.hypot(X, Z), a = Math.atan2(Z, X);
  o.h = 0.7;
  if (r < 3.0) {
    const n = fbm(u, v, 6, 4, 77);
    const sky = mix([250, 228, 170], [78, 124, 186], Math.min(1, r / 3));
    put(o, mix(sky, [246, 240, 228], Math.max(0, n * 1.6 + 0.1) * Math.min(1, r / 1.6)), 0, 0.8);
    return;
  }
  if (r < 3.35) return put(o, PAL.gold, 1, 0.28);
  if (r < 3.75) {
    put(o, PAL.ivory, 0, 0.55);
    const s = ((a / (Math.PI * 2)) * 64) % 1;
    if (Math.abs(r - 3.55) < 0.12 && Math.abs(s - 0.5) < 0.25) put(o, PAL.gold, 1, 0.3);
    return;
  }
  const ring = (r0, r1, n) => {
    const t = (r - r0) / (r1 - r0), s = (((a / (Math.PI * 2)) * n) % 1 + 1) % 1;
    const d = Math.max(Math.abs(t - 0.5), Math.abs(s - 0.5)) * 2;
    if (d > 0.84) put(o, PAL.ivory, 0, 0.55), (o.h = 1);
    else if (d > 0.74) put(o, PAL.gold, 1, 0.28), (o.h = 0.8);
    else if (d > 0.66) put(o, PAL.cream, 0, 0.6), (o.h = 0.55);
    else {
      const lr = Math.hypot((t - 0.5) * (r1 - r0), (s - 0.5) * ((r0 + r1) / 2) * ((Math.PI * 2) / n));
      const petals = Math.cos(Math.atan2(s - 0.5, t - 0.5) * 8);
      if (lr < 0.2 + 0.07 * petals) put(o, PAL.goldLight, 1, 0.25), (o.h = 0.6);
      else put(o, PAL.lapisDeep, 0, 0.7), (o.h = 0.25);
    }
  };
  if (r < 5.3) return ring(3.85, 5.3, 20);
  if (r < 5.6) return put(o, PAL.gold, 1, 0.3);
  if (r < 7.2) return ring(5.6, 7.2, 30);
  if (r < 7.5) return put(o, PAL.ivory, 0, 0.55);
  if (r < 7.8) return put(o, PAL.gold, 1, 0.3);
  put(o, PAL.ivory, 0, 0.55);
  const d1 = (X + Z) / 1.7, d2 = (X - Z) / 1.7;
  const l1 = Math.abs(d1 - Math.round(d1)), l2 = Math.abs(d2 - Math.round(d2));
  if (l1 < 0.045 || l2 < 0.045) put(o, PAL.gold, 1, 0.3);
  if (l1 < 0.12 && l2 < 0.12) put(o, PAL.goldLight, 1, 0.25);
}

// 아치 띠 안쪽(소피트) 격자
export function cofferFn(u, v, o) {
  const fx = Math.abs(u - 0.5) * 2, fy = Math.abs(v - 0.5) * 2, d = Math.max(fx, fy);
  if (d > 0.86) return put(o, PAL.ivory, 0, 0.55), (o.h = 1);
  if (d > 0.77) return put(o, PAL.gold, 1, 0.28), (o.h = 0.8);
  if (d > 0.69) return put(o, PAL.cream, 0, 0.6), (o.h = 0.55);
  const r = Math.hypot(u - 0.5, v - 0.5);
  const petals = Math.cos(Math.atan2(v - 0.5, u - 0.5) * 8);
  if (r < 0.11 + 0.05 * petals) put(o, PAL.goldLight, 1, 0.25), (o.h = 0.7);
  else put(o, [96, 30, 30], 0, 0.7), (o.h = 0.3);
}

// 드럼 벽 (창 16개)
export function drumFn(u, v, o) {
  const N = 16, circ = 2 * Math.PI * 11, H = 8;
  const X = ((((u * N) % 1) + 1) % 1 - 0.5) * (circ / N);
  const Y = (1 - v) * H;
  put(o, PAL.ivory, 0, 0.6);
  o.h = 0.6;
  const ww = 1.0, sill = 1.3, spring = 6.0;
  const inWin = Math.abs(X) < ww && Y > sill && (Y < spring || Math.hypot(X, Y - spring) < ww);
  const fr = ww + 0.2;
  const frame = Math.abs(X) < fr && Y > sill - 0.2 && (Y < spring || Math.hypot(X, Y - spring) < fr);
  if (frame && !inWin) put(o, PAL.gold, 1, 0.3), (o.h = 1);
  if (inWin) {
    const lx = Math.abs((((X + 5) / 0.5) % 1) - 0.5), ly = Math.abs(((Y / 0.6) % 1) - 0.5);
    if (lx > 0.43 || ly > 0.43) put(o, [40, 34, 28], 0, 0.8), (o.e = 0.04);
    else {
      const tint = hash2(Math.floor((X + 5) / 0.5), Math.floor(Y / 0.6), 4);
      put(o, tint > 0.8 ? [236, 214, 160] : tint < 0.1 ? [200, 214, 236] : [246, 238, 220], 0, 0.15);
      o.e = 0.82 + 0.18 * (Y / 7);
    }
    o.h = 0.2;
  }
  if (Y < 0.35 || Y > 7.6) put(o, PAL.gold, 1, 0.3), (o.h = 1);
}

// 꼭대기 랜턴 벽 (창 8개)
export function lanternFn(u, v, o) {
  const N = 8, circ = 2 * Math.PI * 2.38, H = 6.4;
  const X = ((((u * N) % 1) + 1) % 1 - 0.5) * (circ / N);
  const Y = (1 - v) * H;
  put(o, PAL.gold, 1, 0.3);
  const ww = 0.42, sill = 0.9, spring = 4.6;
  if (Math.abs(X) < ww && Y > sill && (Y < spring || Math.hypot(X, Y - spring) < ww)) {
    put(o, [250, 244, 228], 0, 0.2);
    o.e = 1;
  }
}

export function capFn(u, v, o) {
  const X = (u - 0.5) * 4.8, Y = (v - 0.5) * 4.8, r = Math.hypot(X, Y), a = Math.atan2(Y, X);
  put(o, PAL.gold, 1, 0.3);
  if (Math.abs(Math.sin(a * 12)) > 0.72 && r > 0.75) put(o, PAL.goldLight, 1, 0.22);
  if (r < 0.75) {
    put(o, [250, 246, 236], 0, 0.5);
    const wing = Math.abs(Y) < 0.18 + Math.abs(X) * 0.1 && Math.abs(X) < 0.65;
    const body = (X * X) / 0.05 + (Y * Y) / 0.2 < 1;
    if (!(wing || body)) put(o, PAL.goldLight, 1, 0.22);
  }
  if (r > 2.0) put(o, PAL.lapisDeep, 0, 0.6);
  o.e = 0.45;
}

// 성유물 예배당 벽지(다마스크)
export function damaskFn(u, v, o) {
  put(o, [104, 30, 30], 0, 0.75);
  const x = u * 2 - 1, y = v * 2 - 1;
  const d = Math.abs(x) + Math.abs(y);
  const lobe = Math.abs(Math.hypot(Math.abs(x) - 0.35, y + 0.1) - 0.25) < 0.06;
  if (Math.abs(d - 0.9) < 0.05 || lobe || (Math.abs(x) < 0.05 && Math.abs(y) < 0.6)) put(o, [138, 50, 42], 0, 0.55);
  if (Math.hypot(x, y) < 0.09) put(o, PAL.gold, 1, 0.3);
}

/* ------------------------------ 회화, 부조, 기타 ------------------------------ */

function painterly(ctx, w, h, seed, n = 2600) {
  const R = rng(seed);
  const src = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h;
    const p = ((y | 0) * w + (x | 0)) * 4;
    const l = 0.88 + R() * 0.24;
    ctx.strokeStyle = `rgba(${src[p] * l | 0},${src[p + 1] * l | 0},${src[p + 2] * l | 0},0.5)`;
    ctx.lineWidth = 2 + R() * 4;
    const a = R() * Math.PI, len = 4 + R() * 12;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

function glow(ctx, x, y, r, color, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function clouds(ctx, R, x0, x1, y0, y1, n) {
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0), r = 24 + R() * 46;
    glow(ctx, x + 6, y + 10, r, 'rgba(150,120,80,0.55)');
    glow(ctx, x, y, r, 'rgba(246,234,206,0.75)');
  }
}

function figure(ctx, cx, top, h, robe, cloak, R, opt = {}) {
  const s = h / 520;
  ctx.save();
  ctx.translate(cx, top);
  ctx.scale(s, s);
  if (opt.halo) glow(ctx, 0, 40, 95, 'rgba(255,226,140,0.95)');
  // 망토
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-58, 95);
  ctx.bezierCurveTo(-120, 220, -150, 420, -130, 520);
  ctx.lineTo(130, 520);
  ctx.bezierCurveTo(150, 400, 110, 210, 58, 95);
  ctx.closePath();
  ctx.fill();
  // 옷
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-34, 100);
  ctx.bezierCurveTo(-60, 250, -70, 420, -76, 520);
  ctx.lineTo(70, 520);
  ctx.bezierCurveTo(62, 400, 50, 240, 34, 100);
  ctx.closePath();
  ctx.fill();
  // 주름
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 16, 160);
    ctx.quadraticCurveTo(i * 26 + (R() - 0.5) * 20, 360, i * 30, 515);
    ctx.stroke();
  }
  // 머리
  ctx.fillStyle = '#d8ad87';
  ctx.beginPath();
  ctx.ellipse(0, 50, 30, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = opt.hair || '#3e2a1e';
  ctx.beginPath();
  ctx.ellipse(0, 30, 33, 26, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  if (opt.beard) {
    ctx.fillStyle = opt.beard;
    ctx.beginPath();
    ctx.ellipse(0, 78, 22, 26, 0, 0, Math.PI);
    ctx.fill();
  }
  if (opt.halo) {
    ctx.strokeStyle = 'rgba(255,214,120,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 42, 58, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 손과 지물
  ctx.fillStyle = '#d8ad87';
  ctx.beginPath();
  ctx.arc(-30, 250, 12, 0, Math.PI * 2);
  ctx.arc(32, 245, 12, 0, Math.PI * 2);
  ctx.fill();
  if (opt.attr === 'book') {
    ctx.fillStyle = '#7a2420';
    ctx.fillRect(-40, 230, 50, 64);
    ctx.fillStyle = '#e0b860';
    ctx.fillRect(-36, 234, 6, 56);
  } else if (opt.attr === 'cross') {
    ctx.fillStyle = '#d9b25a';
    ctx.fillRect(28, 120, 8, 230);
    ctx.fillRect(10, 160, 44, 8);
  } else if (opt.attr === 'lily') {
    ctx.strokeStyle = '#4f6e3c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(32, 250);
    ctx.lineTo(48, 120);
    ctx.stroke();
    glow(ctx, 48, 120, 22, 'rgba(255,255,248,0.95)');
  } else if (opt.attr === 'palm') {
    ctx.strokeStyle = '#5c7a3a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(32, 250);
    ctx.quadraticCurveTo(70, 160, 40, 90);
    ctx.stroke();
  }
  ctx.restore();
}

const ROBES = ['#2c4f8f', '#8c2a24', '#3f6b46', '#6a4a8a', '#a8742c', '#e8e0d0'];
const CLOAKS = ['#a3322a', '#26467e', '#c79a3c', '#5a2a22', '#2f5a4c', '#7d3b6a'];

// 측면 제단화 (가상의 성인 그림)
export function saintPainting(seed) {
  const W = 512, H = 768, c = canvas(W, H), x = c.getContext('2d'), R = rng(seed * 7 + 3);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e2c27c');
  g.addColorStop(0.4, '#9a6a34');
  g.addColorStop(1, '#2a1a10');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  glow(x, W / 2, 170, 300, 'rgba(255,236,180,0.9)');
  x.fillStyle = 'rgba(60,40,24,0.35)';
  x.fillRect(30, 240, 46, 528);
  x.fillRect(W - 76, 240, 46, 528);
  clouds(x, R, 0, W, 40, 200, 10);
  x.fillStyle = '#3a2a1c';
  x.fillRect(0, 690, W, 78);
  const attrs = ['book', 'cross', 'lily', 'palm'];
  figure(x, W / 2, 150, 560, ROBES[seed % ROBES.length], CLOAKS[(seed + 2) % CLOAKS.length], R, {
    halo: true, attr: attrs[seed % 4], beard: seed % 3 === 0 ? '#6b5a4a' : null,
  });
  for (let i = 0; i < 2; i++) glow(x, 90 + i * 330, 90 + R() * 40, 30, 'rgba(232,190,150,0.9)');
  painterly(x, W, H, seed);
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(20,10,4,0.55)');
  x.fillStyle = v;
  x.fillRect(0, 0, W, H);
  return c;
}

// 벤추르 줄러의 〈성스러운 왕관 봉헌〉을 단순화한 구도
export function benczurPainting() {
  const W = 640, H = 960, c = canvas(W, H), x = c.getContext('2d'), R = rng(1001);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f2d995');
  g.addColorStop(0.45, '#a8763c');
  g.addColorStop(1, '#2e1c10');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  glow(x, 430, 250, 420, 'rgba(255,240,196,0.95)');
  // 배경 건축
  x.fillStyle = 'rgba(70,46,26,0.45)';
  for (const cx of [40, 120]) x.fillRect(cx, 380, 44, 580);
  x.beginPath();
  x.arc(102, 380, 80, Math.PI, 0);
  x.lineWidth = 26;
  x.strokeStyle = 'rgba(70,46,26,0.45)';
  x.stroke();
  // 구름 위 성모
  clouds(x, R, 250, 640, 360, 480, 26);
  x.fillStyle = '#9b2f2a';
  x.beginPath();
  x.moveTo(400, 230);
  x.bezierCurveTo(380, 330, 360, 400, 350, 450);
  x.lineTo(520, 450);
  x.bezierCurveTo(500, 380, 480, 300, 460, 230);
  x.fill();
  x.fillStyle = '#28498a';
  x.beginPath();
  x.moveTo(410, 200);
  x.bezierCurveTo(330, 260, 300, 420, 290, 470);
  x.quadraticCurveTo(420, 500, 580, 465);
  x.bezierCurveTo(560, 400, 520, 260, 452, 200);
  x.fill();
  glow(x, 430, 180, 90, 'rgba(255,228,150,0.9)');
  x.fillStyle = '#efe6d4';
  x.beginPath();
  x.ellipse(430, 185, 34, 42, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#d9ae8a';
  x.beginPath();
  x.ellipse(430, 192, 22, 28, 0, 0, Math.PI * 2);
  x.fill();
  // 아기 예수
  x.fillStyle = '#e6c2a0';
  x.beginPath();
  x.arc(470, 300, 18, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#f2ebe0';
  x.beginPath();
  x.ellipse(462, 340, 26, 36, -0.3, 0, Math.PI * 2);
  x.fill();
  for (const [px, py] of [[300, 160], [580, 130], [560, 300]]) glow(x, px, py, 26, 'rgba(236,196,156,0.95)');
  // 수행원
  x.fillStyle = 'rgba(52,40,30,0.85)';
  x.beginPath();
  x.moveTo(20, 960);
  x.lineTo(30, 600);
  x.quadraticCurveTo(80, 540, 130, 600);
  x.lineTo(150, 960);
  x.fill();
  x.fillStyle = '#efe6d2';
  x.beginPath();
  x.moveTo(60, 560);
  x.lineTo(80, 500);
  x.lineTo(100, 560);
  x.fill();
  // 무릎 꿇은 이슈트반 왕
  x.fillStyle = '#9e2b22';
  x.beginPath();
  x.moveTo(190, 600);
  x.bezierCurveTo(120, 700, 110, 860, 150, 900);
  x.quadraticCurveTo(300, 940, 390, 890);
  x.bezierCurveTo(360, 800, 300, 680, 260, 600);
  x.fill();
  x.strokeStyle = '#e2b95a';
  x.lineWidth = 10;
  x.beginPath();
  x.moveTo(150, 900);
  x.quadraticCurveTo(300, 940, 390, 890);
  x.stroke();
  x.fillStyle = '#f4efe6';
  x.beginPath();
  x.ellipse(226, 600, 52, 20, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#1d1a18';
  for (let i = 0; i < 9; i++) x.fillRect(190 + i * 9, 594 + (i % 2) * 6, 3, 5);
  x.fillStyle = '#d4a582';
  x.beginPath();
  x.ellipse(232, 556, 24, 30, 0.2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#8c8070';
  x.beginPath();
  x.ellipse(236, 580, 18, 22, 0.2, 0, Math.PI);
  x.fill();
  // 들어 올린 팔과 왕관
  x.strokeStyle = '#9e2b22';
  x.lineWidth = 26;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(250, 620);
  x.quadraticCurveTo(300, 560, 318, 486);
  x.stroke();
  x.fillStyle = '#e6be5a';
  x.beginPath();
  x.moveTo(296, 470);
  x.lineTo(352, 470);
  x.lineTo(346, 440);
  x.quadraticCurveTo(324, 420, 302, 440);
  x.closePath();
  x.fill();
  x.strokeStyle = '#e6be5a';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(324, 424);
  x.lineTo(330, 404);
  x.moveTo(320, 410);
  x.lineTo(338, 414);
  x.stroke();
  glow(x, 324, 450, 50, 'rgba(255,230,160,0.6)');
  // 계단
  x.fillStyle = 'rgba(200,184,160,0.5)';
  x.fillRect(380, 880, 260, 20);
  x.fillRect(420, 860, 220, 20);
  painterly(x, W, H, 1001, 3600);
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(18,8,2,0.6)');
  x.fillStyle = v;
  x.fillRect(0, 0, W, H);
  return c;
}

// 회색조 부조 (map과 bumpMap 겸용)
export function reliefCanvas(seed) {
  const W = 384, H = 640, c = canvas(W, H), x = c.getContext('2d'), R = rng(seed);
  x.fillStyle = 'rgb(150,150,150)';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgb(235,235,235)';
  x.lineWidth = 22;
  x.strokeRect(11, 11, W - 22, H - 22);
  x.strokeStyle = 'rgb(90,90,90)';
  x.lineWidth = 6;
  x.strokeRect(30, 30, W - 60, H - 60);
  const n = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const cx = (W / (n + 1)) * (i + 1) + (R() - 0.5) * 20, top = 150 + R() * 60, s = 0.8 + R() * 0.25;
    x.fillStyle = 'rgb(220,220,220)';
    x.beginPath();
    x.arc(cx, top, 26 * s, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(cx - 30 * s, top + 34 * s);
    x.quadraticCurveTo(cx - 70 * s, top + 260 * s, cx - 64 * s, H - 70);
    x.lineTo(cx + 64 * s, H - 70);
    x.quadraticCurveTo(cx + 70 * s, top + 260 * s, cx + 30 * s, top + 34 * s);
    x.fill();
    x.strokeStyle = 'rgb(175,175,175)';
    x.lineWidth = 4;
    for (let k = -1; k <= 1; k++) {
      x.beginPath();
      x.moveTo(cx + k * 18, top + 80);
      x.lineTo(cx + k * 30, H - 80);
      x.stroke();
    }
    x.strokeStyle = 'rgb(240,240,240)';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(cx, top - 4, 44 * s, 0, Math.PI * 2);
    x.stroke();
  }
  const c2 = canvas(W, H), x2 = c2.getContext('2d');
  x2.filter = 'blur(2.5px)';
  x2.drawImage(c, 0, 0);
  return c2;
}

// 아칸서스 덩굴 띠 (주두, 프리즈)
export function ornamentCanvas() {
  const W = 1024, H = 256, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = 'rgb(120,120,120)';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgb(235,235,235)';
  x.lineCap = 'round';
  for (let p = 0; p < 4; p++) {
    const ox = p * 256;
    x.lineWidth = 14;
    x.beginPath();
    for (let t = 0; t < 1; t += 0.01) {
      const a = t * Math.PI * 3.2, r = 74 * (1 - t * 0.85);
      const px = ox + 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
      t === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
    x.fillStyle = 'rgb(210,210,210)';
    for (let l = 0; l < 6; l++) {
      const a = (l / 6) * Math.PI * 2;
      x.beginPath();
      x.ellipse(ox + 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 70, 26, 11, a, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.fillStyle = 'rgb(240,240,240)';
  for (let i = 0; i < 32; i++) {
    x.beginPath();
    x.arc(i * 32 + 16, 16, 9, 0, Math.PI * 2);
    x.arc(i * 32 + 16, 240, 9, 0, Math.PI * 2);
    x.fill();
  }
  const c2 = canvas(W, H), x2 = c2.getContext('2d');
  x2.filter = 'blur(2px)';
  x2.drawImage(c, 0, 0);
  return c2;
}

export function woodCanvas() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data;
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const u = xx / S, v = y / S;
      const n = fbm(u, v, 2, 4, 21);
      const g = 0.5 + 0.5 * Math.sin((v * 18 + n * 4) * Math.PI * 2);
      const t = 0.35 + 0.45 * g + fbm(u, v, 16, 2, 5) * 0.3;
      const i = (y * S + xx) * 4;
      d[i] = 62 + t * 46;
      d[i + 1] = 36 + t * 28;
      d[i + 2] = 22 + t * 16;
      d[i + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  return c;
}

export function bronzeDoorCanvas() {
  const W = 512, H = 1024, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = 'rgb(140,140,140)';
  x.fillRect(0, 0, W, H);
  const cols = 2, rows = 4, pw = W / cols, ph = H / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const px = i * pw, py = j * ph;
      x.fillStyle = 'rgb(210,210,210)';
      x.fillRect(px + 14, py + 14, pw - 28, ph - 28);
      x.fillStyle = 'rgb(110,110,110)';
      x.fillRect(px + 30, py + 30, pw - 60, ph - 60);
      x.fillStyle = 'rgb(200,200,200)';
      x.beginPath();
      x.arc(px + pw / 2, py + ph / 2, 52, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = 'rgb(150,150,150)';
      x.beginPath();
      x.arc(px + pw / 2, py + ph / 2, 30, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.fillStyle = 'rgb(60,60,60)';
  x.fillRect(W / 2 - 3, 0, 6, H);
  const c2 = canvas(W, H), x2 = c2.getContext('2d');
  x2.filter = 'blur(2px)';
  x2.drawImage(c, 0, 0);
  return c2;
}

// 반원창 (팬 모양 창살)
export function lunetteWindowCanvas() {
  const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d');
  const g = x.createRadialGradient(W / 2, H, 10, W / 2, H, W / 2);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#f1e2c2');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#3a3128';
  x.lineWidth = 9;
  for (let i = 1; i < 7; i++) {
    const a = Math.PI + (i / 7) * Math.PI;
    x.beginPath();
    x.moveTo(W / 2, H);
    x.lineTo(W / 2 + Math.cos(a) * W, H + Math.sin(a) * W);
    x.stroke();
  }
  x.lineWidth = 4;
  for (const r of [0.33, 0.66]) {
    x.beginPath();
    x.arc(W / 2, H, (W / 2) * r, Math.PI, 0);
    x.stroke();
  }
  x.lineWidth = 2;
  x.strokeStyle = 'rgba(58,49,40,0.6)';
  for (let yy = 16; yy < H; yy += 24) {
    x.beginPath();
    x.moveTo(0, yy);
    x.lineTo(W, yy);
    x.stroke();
  }
  return c;
}

export function radialCanvas(inner = 'rgba(255,240,210,1)', size = 128) {
  const c = canvas(size, size), x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(255,220,170,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export function raysCanvas() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), C = S / 2;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, len = i % 2 ? C * 0.8 : C * 0.98, w = (Math.PI / 48) * 0.7;
    x.beginPath();
    x.moveTo(C, C);
    x.lineTo(C + Math.cos(a - w) * len, C + Math.sin(a - w) * len);
    x.lineTo(C + Math.cos(a + w) * len, C + Math.sin(a + w) * len);
    x.closePath();
    x.fillStyle = i % 2 ? 'rgb(200,200,200)' : 'rgb(255,255,255)';
    x.fill();
  }
  x.beginPath();
  x.arc(C, C, C * 0.3, 0, Math.PI * 2);
  x.fillStyle = 'rgb(255,255,255)';
  x.fill();
  return c;
}
