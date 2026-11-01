// 해가 드는 창으로 들어오는 빛줄기, 바닥과 벽의 빛 웅덩이, 떠다니는 먼지 (시간대에 따라 다시 배치)
import * as THREE from 'three';
import { tex, radialCanvas } from './textures.js';

const shaftVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vT = uv.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const shaftFrag = /* glsl */ `
  uniform vec3 color; uniform float strength; uniform float time; uniform float seed;
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main() {
    float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
    float along = smoothstep(0.0, 0.2, vT) * (0.5 + 0.5 * vT);
    float shimmer = 0.85 + 0.15 * sin(time * 0.35 + vT * 9.0 + seed);
    gl_FragColor = vec4(color * f * along * shimmer * strength, 1.0);
  }`;

// 창 목록: 위치, 실내 쪽 법선, 크기
function windowList({ windowY, windowR, Q, HC, HW }) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const phi = ((k + 0.5) / 8) * Math.PI * 2;
    const w = new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi));
    out.push({ p: w.clone().multiplyScalar(windowR - 0.3).setY(windowY), n: w.clone().negate(), size: 1.1, gain: 1 });
  }
  const lun = HC + 2.2;
  out.push({ p: new THREE.Vector3(Q - 0.2, lun, 0), n: new THREE.Vector3(-1, 0, 0), size: 2.6, gain: 1.1 });
  out.push({ p: new THREE.Vector3(-Q + 0.2, lun, 0), n: new THREE.Vector3(1, 0, 0), size: 2.6, gain: 1.1 });
  out.push({ p: new THREE.Vector3(0, lun, Q - 0.2), n: new THREE.Vector3(0, 0, -1), size: 2.6, gain: 1.0 });
  const zc = (Q + HW) / 2;
  for (const s of [-1, 1]) {
    out.push({ p: new THREE.Vector3(Q - 0.2, 8.5, s * zc), n: new THREE.Vector3(-1, 0, 0), size: 0.9, gain: 0.8 });
    out.push({ p: new THREE.Vector3(-Q + 0.2, 8.5, s * zc), n: new THREE.Vector3(1, 0, 0), size: 0.9, gain: 0.8 });
    out.push({ p: new THREE.Vector3(s * zc, 8.5, Q - 0.2), n: new THREE.Vector3(0, 0, -1), size: 0.9, gain: 0.8 });
    out.push({ p: new THREE.Vector3(s * zc, 8.5, -Q + 0.2), n: new THREE.Vector3(0, 0, 1), size: 0.9, gain: 0.8 });
  }
  return out;
}

export function buildAtmosphere(scene, { windowY = 46.8, windowR = 11, Q = 25.5, HC = 17.4, HW = 8 } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const windows = windowList({ windowY, windowR, Q, HC, HW });
  const MAXS = 6;
  const shaftGeo = new THREE.CylinderGeometry(1, 1.3, 1, 24, 1, true);
  const poolTex = tex(radialCanvas('rgba(255,236,200,1)'), { wrap: false });
  const shafts = [];
  for (let i = 0; i < MAXS; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(1, 0.86, 0.62) }, strength: { value: 0 }, time: { value: 0 }, seed: { value: i * 3.1 } },
      vertexShader: shaftVert,
      fragmentShader: shaftFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(shaftGeo, mat);
    m.renderOrder = 5;
    m.visible = false;
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(0, 0, 0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    pool.renderOrder = 4;
    pool.visible = false;
    group.add(m, pool);
    shafts.push({ m, mat, pool, top: new THREE.Vector3(), bot: new THREE.Vector3(), str: 0 });
  }

  // 먼지
  const N = 2400;
  const pos = new Float32Array(N * 3), rnd = new Float32Array(N), bright = new Float32Array(N);
  for (let i = 0; i < N; i++) rnd[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  g.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, scale: { value: 300 }, level: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float rnd; attribute float bright; uniform float time; uniform float scale; uniform float level;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = time * (0.05 + rnd * 0.08) + rnd * 60.0;
        p += vec3(sin(t) * 0.35, sin(t * 0.7 + rnd * 9.0) * 0.5, cos(t * 0.9) * 0.35);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = scale * (0.02 + rnd * 0.03) / -mv.z;
        vA = bright * level * (0.55 + 0.45 * sin(time * (0.6 + rnd) + rnd * 40.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.66) * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(g, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // 광선이 실내에서 처음 부딪치는 곳 (바닥, 바깥벽, 돔 안쪽에서 맞은편 드럼)
  function traceEnd(p, dir, fromDome) {
    let t = dir.y < -1e-4 ? -p.y / dir.y : 200;
    for (const [c, v] of [['x', dir.x], ['z', dir.z]]) {
      if (Math.abs(v) < 1e-4) continue;
      const lim = (v > 0 ? Q : -Q) - p[c];
      const tw = lim / v;
      if (tw > 0.01) t = Math.min(t, tw);
    }
    if (fromDome) {
      // 드럼 원통 안에서 맞은편 벽까지 (수평 거리가 반지름에 닿는 지점)
      const a = dir.x * dir.x + dir.z * dir.z, b = 2 * (p.x * dir.x + p.z * dir.z), cc = p.x * p.x + p.z * p.z - windowR * windowR;
      const disc = b * b - 4 * a * cc;
      if (a > 1e-6 && disc > 0) {
        const t2 = (-b + Math.sqrt(disc)) / (2 * a);
        const yAt = p.y + dir.y * t2;
        if (t2 > 0.5 && yAt > HC + HW + 1) t = Math.min(t, t2); // 고리 위에서 맞은편 드럼에 닿으면 거기서 끝
      }
    }
    return t;
  }

  function setSun(toSun, level, color) {
    const dir = toSun.clone().negate();
    const scored = windows
      .map((w) => ({ w, s: w.n.dot(dir) }))
      .filter((o) => o.s > 0.12 && toSun.y > 0.03)
      .sort((a, b) => b.s * b.w.gain * b.w.size - a.s * a.w.gain * a.w.size)
      .slice(0, MAXS);
    shafts.forEach((sh, i) => {
      const o = scored[i];
      if (!o || level <= 0.001) {
        sh.m.visible = sh.pool.visible = false;
        sh.str = 0;
        return;
      }
      const w = o.w;
      const fromDome = w.p.y > HC + HW;
      const t = traceEnd(w.p, dir, fromDome);
      sh.top.copy(w.p);
      sh.bot.copy(w.p).addScaledVector(dir, t);
      const len = Math.max(0.5, t);
      sh.m.position.copy(sh.top).add(sh.bot).multiplyScalar(0.5);
      sh.m.quaternion.setFromUnitVectors(up, tmp.copy(sh.top).sub(sh.bot).normalize());
      sh.m.scale.set(w.size, len, w.size);
      sh.str = level * w.gain * Math.min(1, o.s * 1.4) * (fromDome ? 0.09 : 0.06);
      sh.mat.uniforms.strength.value = sh.str;
      sh.mat.uniforms.color.value.copy(color);
      sh.m.visible = true;
      // 빛 웅덩이: 바닥이면 눕히고, 벽이면 벽면에 세운다
      const onFloor = sh.bot.y < 0.2;
      const el = Math.asin(Math.min(1, toSun.y));
      sh.pool.visible = sh.bot.y < HC + HW;
      if (sh.pool.visible) {
        if (onFloor) {
          sh.pool.position.set(sh.bot.x, 0.02, sh.bot.z);
          sh.pool.rotation.set(-Math.PI / 2, 0, Math.atan2(dir.x, dir.z));
          sh.pool.scale.set(w.size * 2.6, Math.min(16, (w.size * 2.6) / Math.max(0.2, Math.sin(el))), 1);
        } else {
          const nrm = Math.abs(sh.bot.x) > Math.abs(sh.bot.z) - 0.01 ? new THREE.Vector3(-Math.sign(sh.bot.x), 0, 0) : new THREE.Vector3(0, 0, -Math.sign(sh.bot.z));
          sh.pool.position.copy(sh.bot).addScaledVector(nrm, 0.05);
          sh.pool.lookAt(tmp.copy(sh.pool.position).add(nrm));
          sh.pool.scale.set(w.size * 2.6, w.size * 3.2, 1);
        }
        const k = level * w.gain * 0.5;
        sh.pool.material.color.copy(color).multiplyScalar(k);
      }
    });
    // 먼지를 빛줄기 안으로
    const live = shafts.filter((s) => s.m.visible);
    for (let i = 0; i < N; i++) {
      let p;
      if (live.length && i < N * 0.6) {
        const s = live[i % live.length];
        p = tmp.copy(s.top).lerp(s.bot, Math.random());
        const r = 1.1 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
        p.x += Math.cos(a) * r;
        p.z += Math.sin(a) * r;
        bright[i] = 0.6 + 0.4 * Math.min(1, s.str * 12);
      } else {
        p = tmp.set((Math.random() * 2 - 1) * 10, 0.5 + Math.random() * 24, (Math.random() * 2 - 1) * 10);
        bright[i] = 0.18;
      }
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.bright.needsUpdate = true;
    dustMat.uniforms.level.value = 0.25 + 0.75 * level;
  }

  return {
    group,
    dustMat,
    setSun,
    update(time) {
      for (const s of shafts) s.mat.uniforms.time.value = time;
      dustMat.uniforms.time.value = time;
    },
  };
}
