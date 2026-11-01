// 걷기, 둘러보기, 장소 사이 비행
import * as THREE from 'three';
import { walkable, floorY, route, EYE } from './plan.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class TourControls {
  constructor(camera, dom, { reducedMotion = false } = {}) {
    this.cam = camera;
    this.dom = dom;
    this.reduced = reducedMotion;
    this.pos = new THREE.Vector3(0, EYE, 44);
    this.yaw = 0;
    this.pitch = 0.12;
    this.fov = camera.fov;
    this.fovTarget = camera.fov;
    this.keys = new Set();
    this.vel = new THREE.Vector2();
    this.flight = null;
    this.elevated = false;
    this.enabled = false;
    this.onClick = null;
    this.onUserMove = null;
    this.onHover = null;
    this._drag = null;
    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button > 0) return;
      d.setPointerCapture(e.pointerId);
      this._drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
      d.classList.add('dragging');
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const g = this._drag;
      if (!g) {
        this.onHover?.(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.x = e.clientX;
      g.y = e.clientY;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.moved > 4) {
        if (this.flight && !this.flight.look) this.flight.keepLook = true;
        if (this.flight?.look) this.cancelFlight();
        const k = 0.0034 * (this.fov / 70);
        this.yaw += dx * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.45, 1.45);
        this.onUserMove?.('look');
      }
    });
    const end = (e) => {
      const g = this._drag;
      if (!g) return;
      this._drag = null;
      d.classList.remove('dragging');
      if (g.moved <= 6 && performance.now() - g.t < 500) this.onClick?.(e.clientX, e.clientY);
    };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', () => {
      this._drag = null;
      d.classList.remove('dragging');
    });
    d.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.fovTarget = THREE.MathUtils.clamp(this.fovTarget + e.deltaY * 0.03, 30, 80);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (k.startsWith('arrow') && e.target instanceof HTMLElement && e.target.closest('button')) return;
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setView(pos, look) {
    this.pos.copy(pos);
    if (look) [this.yaw, this.pitch] = this.anglesTo(pos, look);
    this.elevated = Math.abs(pos.y - (floorY(pos.x, pos.z) + EYE)) > 0.4;
  }

  anglesTo(from, look) {
    const d = new THREE.Vector3().subVectors(look, from);
    return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))];
  }

  // pos로 이동. look이 있으면 그쪽을 바라보며 도착한다.
  flyTo(pos, look = null, { duration, onDone, fov } = {}) {
    const a = this.pos.clone(), b = pos.clone();
    const path = route([a.x, a.z], [b.x, b.z]);
    const pts = [];
    let total = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      pts.push({ x: path[i][0], z: path[i][1], d: total });
    }
    const p3 = pts.map((p, i) => {
      if (i === 0) return a;
      if (i === pts.length - 1) return b;
      const t = total ? p.d / total : 0;
      return new THREE.Vector3(p.x, Math.max(EYE + 0.6, a.y + (b.y - a.y) * t), p.z);
    });
    const curve = p3.length > 2 ? new THREE.CatmullRomCurve3(p3, false, 'centripetal') : new THREE.LineCurve3(a, b);
    const len = curve.getLength();
    let dur = duration ?? THREE.MathUtils.clamp(len / 5.5, 1.4, 6.5);
    if (this.reduced) dur = 0.01;
    const [ty, tp] = look ? this.anglesTo(b, look) : [this.yaw, this.pitch];
    this.flight = {
      curve, t: 0, dur, look: !!look,
      y0: this.yaw, p0: this.pitch, y1: this.yaw + wrapPi(ty - this.yaw), p1: tp,
      fov0: this.fovTarget, fov1: fov ?? this.fovTarget, onDone,
    };
    this.vel.set(0, 0);
  }

  cancelFlight() {
    if (!this.flight) return;
    this.flight = null;
    this.elevated = Math.abs(this.pos.y - (floorY(this.pos.x, this.pos.z) + EYE)) > 0.4;
  }

  descend() {
    let x = this.pos.x, z = this.pos.z;
    if (!walkable(x, z)) {
      for (let r = 0.5; r < 12; r += 0.5) {
        let found = false;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          if (walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) {
            x += Math.cos(a) * r;
            z += Math.sin(a) * r;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    const target = new THREE.Vector3(x, floorY(x, z) + EYE, z);
    const look = target.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * 10, 1.5, -Math.cos(this.yaw) * 10));
    this.flyTo(target, look, { duration: this.reduced ? 0.01 : 2.4 });
  }

  update(dt) {
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = ease(f.t);
      this.pos.copy(f.curve.getPointAt(e));
      if (f.look && !f.keepLook) {
        this.yaw = f.y0 + (f.y1 - f.y0) * e;
        this.pitch = f.p0 + (f.p1 - f.p0) * e;
      }
      this.fovTarget = f.fov0 + (f.fov1 - f.fov0) * e;
      if (f.t >= 1) {
        this.flight = null;
        this.elevated = Math.abs(this.pos.y - (floorY(this.pos.x, this.pos.z) + EYE)) > 0.4;
        f.onDone?.();
      }
    } else if (this.enabled) {
      const K = this.keys;
      const fw = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
      const st = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
      const turn = (K.has('arrowleft') || K.has('q') ? 1 : 0) - (K.has('arrowright') || K.has('e') ? 1 : 0);
      this.yaw += turn * dt * 1.4;
      if (turn) this.onUserMove?.('look');
      if ((fw || st) && this.elevated) {
        this.onUserMove?.('move');
        this.descend();
      } else {
        const speed = K.has('shift') ? 7 : 3.2;
        const tx = (-Math.sin(this.yaw) * fw + Math.cos(this.yaw) * st) * speed;
        const tz = (-Math.cos(this.yaw) * fw - Math.sin(this.yaw) * st) * speed;
        const n = Math.hypot(tx, tz) > speed ? speed / Math.hypot(tx, tz) : 1;
        const a = 1 - Math.exp(-dt * 9);
        this.vel.x += (tx * n - this.vel.x) * a;
        this.vel.y += (tz * n - this.vel.y) * a;
        if (fw || st) this.onUserMove?.('move');
        if (this.vel.lengthSq() > 1e-4) {
          const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
          if (walkable(nx, this.pos.z)) this.pos.x = nx;
          else this.vel.x = 0;
          if (walkable(this.pos.x, nz)) this.pos.z = nz;
          else this.vel.y = 0;
        }
        if (!this.elevated) {
          const ty = floorY(this.pos.x, this.pos.z) + EYE;
          this.pos.y += (ty - this.pos.y) * (1 - Math.exp(-dt * 8));
        }
      }
    }
    this.fov += (this.fovTarget - this.fov) * (1 - Math.exp(-dt * 8));
    if (Math.abs(this.cam.fov - this.fov) > 1e-3) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    this.cam.position.copy(this.pos);
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
