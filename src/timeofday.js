// 시간대: 부다페스트의 실제 태양 위치로 빛, 창, 돔 사진의 밝기와 색을 바꾼다.
import * as THREE from 'three';

const LAT = 47.5009, LON = 19.0540; // 성 이슈트반 대성당

// 부다페스트의 UTC 오프셋(시간). 서머타임 반영.
export function budapestOffset(date = new Date()) {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Budapest', timeZoneName: 'shortOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = /GMT([+-]\d+)/.exec(s || '');
    return m ? +m[1] : 1;
  } catch {
    return 1;
  }
}

export function budapestNowHours(date = new Date()) {
  const off = budapestOffset(date);
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + off;
  return (h + 24) % 24;
}

// NOAA 근사식. hour는 부다페스트 현지 시각.
export function sunPosition(hour, date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const n = Math.floor((date - start) / 86400000);
  const g = ((2 * Math.PI) / 365) * (n - 1 + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tz = budapestOffset(date);
  const tst = hour * 60 + eq + 4 * LON - 60 * tz;
  const ha = THREE.MathUtils.degToRad(tst / 4 - 180);
  const phi = THREE.MathUtils.degToRad(LAT);
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const el = Math.PI / 2 - Math.acos(THREE.MathUtils.clamp(cosZ, -1, 1));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI; // 북에서 시계 방향
  // 월드 축: 동 = -z, 북 = -x, 남 = +x, 서 = +z
  const toSun = new THREE.Vector3(-Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
  return { el, az, toSun };
}

const C = (h) => new THREE.Color(h);
const lerpC = (a, b, t) => a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1));
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// 해 고도에 따른 하늘빛과 햇빛 색
export function skyState(el) {
  const s = Math.sin(el);
  const day = smooth(-0.1, 0.22, s); // 시민박명(-6°)부터 차오름
  const golden = smooth(0.0, 0.05, s) * (1 - smooth(0.12, 0.35, s)); // 해 뜰 녘, 해 질 녘
  const sunCol = lerpC(C('#fff4e6'), C('#ff9a4a'), golden * 1.1);
  const skyCol = lerpC(lerpC(C('#20304f'), C('#d8e2ef'), day), C('#f0b27a'), golden * 0.8);
  return { day, golden, sunCol, skyCol, s };
}

export function formatHours(h) {
  const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60) % 60;
  const ap = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ap} ${h12}:${String(mm).padStart(2, '0')}`;
}

export function phaseLabel(el) {
  const d = THREE.MathUtils.radToDeg(el);
  if (d < -6) return '밤';
  if (d < 0) return '어스름';
  if (d < 8) return '노을빛';
  if (d < 25) return '낮은 햇살';
  return '한낮';
}

/**
 * refs: { renderer, scene, lights, M, atmo, bloom }
 * 반환된 apply(hour)를 슬라이더에서 부른다.
 */
export function createTimeOfDay(refs) {
  const { scene, lights, M, atmo } = refs;
  const base = {
    hemi: lights.hemi.intensity,
    sun: lights.sun.intensity,
    points: lights.lights.map((l) => ({ l, i: l.intensity, c: l.color.clone() })),
    env: scene.environmentIntensity,
    exposure: refs.renderer.toneMappingExposure,
    glass: (M.glassMats || []).map((m) => ({ m, c: m.color.clone() })),
  };
  const warm = C('#ffcf96');
  return function apply(hour) {
    const sp = sunPosition(hour);
    const st = skyState(sp.el);
    const night = 1 - st.day;
    // 낮빛(창으로 드는 산란광)
    lights.hemi.intensity = base.hemi * (0.1 + 0.9 * st.day);
    lights.hemi.color.copy(lerpC(C('#7d8db0'), C('#fff1e0'), st.day)).lerp(C('#ffc58e'), st.golden * 0.5);
    lights.sun.intensity = base.sun * st.day * (0.35 + 0.65 * smooth(0, 0.6, st.s));
    lights.sun.color.copy(st.sunCol);
    lights.sun.position.copy(sp.toSun).multiplyScalar(60);
    // 인공 조명: 밤에 상대적으로 주가 된다
    for (const p of base.points) {
      p.l.intensity = p.i * (0.92 + 0.08 * night);
      p.l.color.copy(p.c).lerp(warm, night * 0.45);
    }
    scene.environmentIntensity = base.env * (0.28 + 0.72 * st.day);
    refs.renderer.toneMappingExposure = base.exposure * (1 + 0.12 * night);
    // 창: 바깥 하늘빛이 비쳐 든다
    const glassGain = 0.09 + 0.91 * st.day; // 밤에도 실내 조명에 비친 유리 색이 희미하게 남는다
    for (const g of base.glass) {
      g.m.color.copy(g.c).multiplyScalar(glassGain);
      g.m.color.multiply(lerpC(C('#ffffff'), st.skyCol, 0.35 + 0.3 * night)).lerp(C('#ffb37a'), st.golden * 0.25 * glassGain);
    }
    // 돔 사진: 박혀 있는 낮빛을 시간대에 맞춰 누른다
    if (M.crossing?.uniforms?.gain) {
      M.crossing.uniforms.gain.value = (M.crossingGain ?? 1) * (0.2 + 0.8 * st.day);
      M.crossing.uniforms.night.value = night;
      M.crossing.uniforms.tint.value.copy(lerpC(C('#ffffff'), C('#ffd2a0'), st.golden * 0.6 + night * 0.35));
    }
    // 빛줄기
    atmo?.setSun?.(sp.toSun, st.day * smooth(0.02, 0.12, st.s), st.sunCol);
    return { ...sp, ...st };
  };
}
