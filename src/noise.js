// 시드 고정 난수와 타일링 가능한 Perlin 노이즈 (텍스처 절차 생성용)

export function rng(seed = 1) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const perm = new Uint8Array(512);
{
  const r = rng(1905);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];

function grad(ix, iy, seed, dx, dy) {
  const h = perm[(perm[(ix + seed) & 255] + iy) & 255] & 7;
  return GX[h] * dx + GY[h] * dy;
}

// px, py: 격자 주기. 주기를 맞추면 텍스처 경계가 이어진다.
export function perlin(x, y, px = 256, py = 256, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = grad(x0, y0, seed, xf, yf), b = grad(x1, y0, seed, xf - 1, yf);
  const c = grad(x0, y1, seed, xf, yf - 1), d = grad(x1, y1, seed, xf - 1, yf - 1);
  const ab = a + u * (b - a), cd = c + u * (d - c);
  return ab + v * (cd - ab);
}

// u, v ∈ [0,1). freq가 정수면 타일링된다.
export function fbm(u, v, freq = 4, oct = 5, seed = 0) {
  let sum = 0, amp = 0.5, f = freq;
  for (let o = 0; o < oct; o++) {
    sum += amp * perlin(u * f, v * f, f, f, seed + o * 31);
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}
