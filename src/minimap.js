// 건축 평면도 스타일의 미니맵 (입구가 아래, 제단이 위)
import { outline, piers, RR, APSE_Z, APSE_R, insidePlan } from './plan.js';
import { STOPS, ROMAN } from './stops.js';

const BOUNDS = { x0: -28, x1: 28, z0: -36, z1: 28 };

export class Minimap {
  constructor(cv, { onStop, onPoint }) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.onStop = onStop;
    this.onPoint = onPoint;
    this.active = -1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    cv.addEventListener('click', (e) => this._click(e));
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = this.w / (BOUNDS.x1 - BOUNDS.x0), sz = this.h / (BOUNDS.z1 - BOUNDS.z0);
    this.s = Math.min(sx, sz);
    this.ox = this.w / 2;
    this.oy = this.h / 2 - ((BOUNDS.z0 + BOUNDS.z1) / 2) * this.s;
    this.base = null;
  }

  // 월드 (x, z) → 캔버스. 제단(-z)이 위쪽.
  P(x, z) {
    return [this.ox + x * this.s, this.oy + z * this.s];
  }

  _drawBase() {
    const c = document.createElement('canvas');
    c.width = this.cv.width;
    c.height = this.cv.height;
    const x = c.getContext('2d');
    const dpr = this.cv.width / this.w;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = outline();
    x.beginPath();
    pts.forEach(([px, pz], i) => {
      const [a, b] = this.P(px, pz);
      i ? x.lineTo(a, b) : x.moveTo(a, b);
    });
    x.closePath();
    x.fillStyle = 'rgba(239,229,208,0.07)';
    x.fill();
    x.lineJoin = 'miter';
    x.strokeStyle = 'rgba(201,162,74,0.95)';
    x.lineWidth = Math.max(2, this.s * 1.0);
    x.stroke();
    x.setLineDash([3, 3]);
    x.lineWidth = 1;
    x.strokeStyle = 'rgba(201,162,74,0.55)';
    const [cx, cy] = this.P(0, 0);
    x.beginPath();
    x.arc(cx, cy, RR * this.s, 0, Math.PI * 2);
    x.stroke();
    const [ax, ay] = this.P(0, APSE_Z);
    x.beginPath();
    x.arc(ax, ay, APSE_R * this.s, Math.PI, 0);
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = 'rgba(201,162,74,0.9)';
    for (const poly of piers()) {
      x.beginPath();
      poly.forEach(([px, pz], i) => {
        const [a, b] = this.P(px, pz);
        i ? x.lineTo(a, b) : x.moveTo(a, b);
      });
      x.closePath();
      x.fill();
    }
    this.base = c;
  }

  draw(cam, yaw, fov) {
    if (!this.base) this._drawBase();
    const x = this.ctx;
    x.clearRect(0, 0, this.w, this.h);
    x.drawImage(this.base, 0, 0, this.w, this.h);
    // 장소 번호
    x.font = '600 11px "Cormorant Garamond", Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    STOPS.forEach((s, i) => {
      const [a, b] = this.P(s.marker.x, s.marker.z);
      const on = i === this.active;
      x.beginPath();
      x.arc(a, b, 8.5, 0, Math.PI * 2);
      x.fillStyle = on ? '#c9a24a' : 'rgba(28,20,15,0.92)';
      x.fill();
      x.lineWidth = 1;
      x.strokeStyle = '#c9a24a';
      x.stroke();
      x.fillStyle = on ? '#1c140f' : '#e8cf8a';
      x.fillText(ROMAN[i], a, b + 0.5);
    });
    // 현재 위치와 시야
    const [px, py] = this.P(cam.x, cam.z);
    const dir = -yaw - Math.PI / 2;
    const half = ((fov * Math.PI) / 180) * 0.62;
    const g = x.createRadialGradient(px, py, 0, px, py, 34);
    g.addColorStop(0, 'rgba(239,229,208,0.55)');
    g.addColorStop(1, 'rgba(239,229,208,0)');
    x.beginPath();
    x.moveTo(px, py);
    x.arc(px, py, 34, dir - half, dir + half);
    x.closePath();
    x.fillStyle = g;
    x.fill();
    x.beginPath();
    x.arc(px, py, 4, 0, Math.PI * 2);
    x.fillStyle = '#efe5d0';
    x.fill();
    x.strokeStyle = '#1c140f';
    x.lineWidth = 1.5;
    x.stroke();
  }

  _click(e) {
    const r = this.cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 12;
    STOPS.forEach((s, i) => {
      const [a, b] = this.P(s.marker.x, s.marker.z);
      const d = Math.hypot(a - mx, b - my);
      if (d < bd) (bd = d), (best = i);
    });
    if (best >= 0) return this.onStop(best);
    const wx = (mx - this.ox) / this.s, wz = (my - this.oy) / this.s;
    if (insidePlan(wx, wz, 0.4)) this.onPoint(wx, wz);
  }
}
