// 실측 사진 기반 평면 (9칸 그리스 십자형). 좌표: 교차부 바닥 중심 원점, 정문 +z(서), 제단 -z(동), 남 +x. 단위 m.
// 치수는 사진 비례와 전체 외곽(87.4 × 55 m)에서 추정한 값이며, 돔 사진 보정 결과로 다듬는다.

export const W = 16; // 팔 폭 = 교차부 아치 폭 (오르간 갤러리 실측 11.9 m + 벽기둥, 돔 안지름 22 m와 맞춤)
export const HW = W / 2;
export const C = 3; // 교차부 기둥 모따기 깊이
export const RR = HW + C; // 드럼과 돔 안반지름
export const S = RR + HW; // 모따기 면: |x| + |z| = S
export const PB = HW + 9; // 교차부 기둥 블록 바깥 좌표 (기둥은 [HW, PB]²에서 모서리를 깎은 형태)
export const Q = 25.5; // 실내 반폭 (정사각형 본체)
export const HC = 17.4; // 주 엔타블러처 위, 아치와 볼트 기점 (돔 사진 천정각으로 잰 아치 정점 25.43 m - 반폭 8)
export const ENT = 2.6; // 엔타블러처 높이
export const PIL_TOP = HC - ENT;
export const HRING = HC + HW; // 펜던티브 위 고리 = 아치 정점 높이
export const CORNER_H = 17.4; // 모서리 칸 천장 높이 (주 엔타블러처와 같다)
export const APSE_Z = -PB; // 후진 반원 중심 z (동쪽 팔은 기둥 깊이만큼 짧다)
export const APSE_R = HW;
export const APSE_H = 13.6; // 후진 반돔 기점
export const SANCT_Z = -12.2; // 성소 계단 시작
export const GALLERY_Z = Q - 5.6; // 오르간 갤러리 앞선 (오르간 모듈 원점)
export const EYE = 1.65;
// 성스러운 오른손 예배당: 성소 뒤 북동쪽, 북동 모서리 칸 바깥벽의 문으로 들어간다
export const CHAPEL = null; // 2017년부터 성유물은 본당 성모 승천 제단 앞에 있어 옛 예배당은 모델에 넣지 않는다
export const RELIQUARY_POS = [Q - 4.9, 0, 0]; // 남쪽 수랑 벤추르 제단 앞

const obstacles = [];
export function addRect(x0, z0, x1, z1) {
  obstacles.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
}
export function addCircle(x, z, r) {
  obstacles.push({ c: true, x, z, r });
}

// 교차부 기둥 안쪽인지 (모따기 반영)
export function inPier(x, z, m = 0) {
  const ax = Math.abs(x), az = Math.abs(z);
  return ax > HW - m && az > HW - m && ax < PB + m && az < PB + m && ax + az > S - m * Math.SQRT2;
}

export function insidePlan(x, z, m = 0) {
  if (z < APSE_Z) {
    if (Math.abs(x) < HW + 1) {
      const dz = z - APSE_Z;
      return x * x + dz * dz <= (APSE_R - m) ** 2;
    }
    return Math.abs(x) >= HW + 1 + m && Math.abs(x) <= Q - m && z >= -Q + m;
  }
  if (Math.abs(x) <= Q - m && Math.abs(z) <= Q - m) return !inPier(x, z, m);
  return false;
}

export function walkable(x, z, r = 0.35) {
  if (!insidePlan(x, z, r)) return false;
  for (const o of obstacles) {
    if (o.c) {
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + r) ** 2) return false;
    } else if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return false;
  }
  return true;
}

// 성소: 동쪽 팔 끝과 후진이 계단 셋 높이로 올라가 있다
export function floorY(x, z) {
  if (Math.abs(x) <= HW + 0.01 && z < SANCT_Z) {
    if (z < SANCT_Z - 0.9) return 0.66;
    if (z < SANCT_Z - 0.45) return 0.44;
    return 0.22;
  }
  return 0;
}

export function lineOfSight(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!insidePlan(ax + (bx - ax) * t, az + (bz - az) * t, 0.05)) return false;
  }
  return true;
}

const HUBS = [[0, 0], [0, 16], [0, -10], [16, 0], [-16, 0], [21.3, 21.3], [-21.3, 21.3], [21.3, -21.3], [-21.3, -21.3]];
export function route(a, b) {
  if (lineOfSight(a[0], a[1], b[0], b[1])) return [a, b];
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  let best = null, bestLen = Infinity;
  for (const h of HUBS) {
    if (lineOfSight(a[0], a[1], h[0], h[1]) && lineOfSight(h[0], h[1], b[0], b[1])) {
      const p = [a, h, b], l = len(p);
      if (l < bestLen) (best = p), (bestLen = l);
    }
  }
  if (best) return best;
  for (const h1 of HUBS) {
    for (const h2 of HUBS) {
      if (h1 === h2) continue;
      if (lineOfSight(a[0], a[1], h1[0], h1[1]) && lineOfSight(h1[0], h1[1], h2[0], h2[1]) && lineOfSight(h2[0], h2[1], b[0], b[1])) {
        const p = [a, h1, h2, b], l = len(p);
        if (l < bestLen) (best = p), (bestLen = l);
      }
    }
  }
  return best || [a, b];
}

// 미니맵용 외곽선과 기둥
export function outline() {
  const pts = [[-Q, Q], [Q, Q], [Q, -Q], [HW + 1, -Q], [HW + 1, APSE_Z], [HW, APSE_Z]];
  for (let i = 1; i < 32; i++) {
    const a = (i / 32) * Math.PI;
    pts.push([Math.cos(a) * APSE_R, APSE_Z - Math.sin(a) * APSE_R]);
  }
  pts.push([-HW, APSE_Z], [-HW - 1, APSE_Z], [-HW - 1, -Q], [-Q, -Q]);
  return pts;
}
export function piers() {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push([[RR, HW], [PB, HW], [PB, PB], [HW, PB], [HW, RR]].map(([x, z]) => [x * sx, z * sz]));
    }
  }
  return out;
}
