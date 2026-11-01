// 돔 축 위 시점 P에서 본 (방위각, 천정각) 지도를 곡면에 투영하는 재질.
// 지도 형식: 가로 = φ = atan2(dx, -dz) ∈ [0, 2π), 세로 = θ ∈ [0, thetaMax] (이미지 위가 0).
// 정점 보강(zenith): 수직 원근 이미지, 이미지 u = 0.5 + (dx/dy)/(2T), 이미지 v(위에서) = 0.5 + (dz/dy)/(2T), T = tan(zenithDeg).
// 사진에 실제 빛이 담겨 있으므로 조명을 받지 않는 재질로 그리고, 시간대에 따라 gain, tint, night로 누른다.
import * as THREE from 'three';

export function angularMapMaterial(texture, { center, thetaMax, phiOffset = 0, gain = 1, side = THREE.DoubleSide, zenith = null, zenithDeg = 16 }) {
  const prep = (t, wrapS) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = wrapS;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
  };
  prep(texture, THREE.RepeatWrapping);
  if (zenith) prep(zenith, THREE.ClampToEdgeWrapping);
  return new THREE.ShaderMaterial({
    side,
    uniforms: {
      map: { value: texture },
      zmap: { value: zenith || texture },
      useZ: { value: zenith ? 1 : 0 },
      zT: { value: Math.tan(THREE.MathUtils.degToRad(zenithDeg)) },
      center: { value: center.clone() },
      thetaMax: { value: thetaMax },
      phiOffset: { value: phiOffset },
      gain: { value: gain },
      tint: { value: new THREE.Color(1, 1, 1) },
      night: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform sampler2D zmap; uniform float useZ; uniform float zT;
      uniform vec3 center; uniform float thetaMax; uniform float phiOffset; uniform float gain;
      uniform vec3 tint; uniform float night;
      varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vW - center);
        float theta = acos(clamp(d.y, -1.0, 1.0));
        float phi = atan(d.x, -d.z) + phiOffset;
        vec2 uv = vec2(fract(phi / (2.0 * PI)), 1.0 - theta / thetaMax);
        vec2 uvA = vec2(fract(phi / (2.0 * PI) + 0.5), uv.y);
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        if (abs(dx.x) > 0.25 || abs(dy.x) > 0.25) { dx = dFdx(uvA); dy = dFdy(uvA); }
        vec3 c = textureGrad(map, uv, dx, dy).rgb;
        if (useZ > 0.5 && d.y > 0.0) {
          vec2 q = vec2(d.x, d.z) / d.y;
          vec2 zuv = vec2(0.5 + q.x / (2.0 * zT), 1.0 - (0.5 + q.y / (2.0 * zT)));
          float w = 1.0 - smoothstep(zT * 0.86, zT * 0.97, length(q) * 0.7071 * 1.4142);
          if (w > 0.0 && all(greaterThan(zuv, vec2(0.0))) && all(lessThan(zuv, vec2(1.0)))) {
            c = mix(c, texture2D(zmap, zuv).rgb, w);
          }
        }
        // 밤에는 사진에 박힌 밝은 창을 누른다
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        float win = smoothstep(0.72, 0.93, lum);
        c *= mix(1.0, 0.18, night * win);
        gl_FragColor = vec4(c * gain * tint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
