/* ============================================================================
   VERDANT — core
   Single rAF authority, refresh-rate normalisation, GPU tiering, tuning store.
   ========================================================================== */

const Q = new URLSearchParams(location.search);
const FLAG = (k) => Q.has(k);
const FLAGV = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);

/* ---------------------------------------------------------------- math --- */

const M4 = {
  create: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),

  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
    return out;
  },

  lookAt(out, eye, center, up) {
    let z0=eye[0]-center[0], z1=eye[1]-center[1], z2=eye[2]-center[2];
    let len = Math.hypot(z0,z1,z2) || 1; z0/=len; z1/=len; z2/=len;
    let x0=up[1]*z2-up[2]*z1, x1=up[2]*z0-up[0]*z2, x2=up[0]*z1-up[1]*z0;
    len = Math.hypot(x0,x1,x2);
    if (!len) { x0=1; x1=0; x2=0; } else { x0/=len; x1/=len; x2/=len; }
    const y0=z1*x2-z2*x1, y1=z2*x0-z0*x2, y2=z0*x1-z1*x0;
    out[0]=x0; out[1]=y0; out[2]=z0; out[3]=0;
    out[4]=x1; out[5]=y1; out[6]=z1; out[7]=0;
    out[8]=x2; out[9]=y2; out[10]=z2; out[11]=0;
    out[12]=-(x0*eye[0]+x1*eye[1]+x2*eye[2]);
    out[13]=-(y0*eye[0]+y1*eye[1]+y2*eye[2]);
    out[14]=-(z0*eye[0]+z1*eye[1]+z2*eye[2]);
    out[15]=1;
    return out;
  },

  multiply(out, a, b) {
    for (let i = 0; i < 4; i++) {
      const b0=b[i*4], b1=b[i*4+1], b2=b[i*4+2], b3=b[i*4+3];
      out[i*4]   = b0*a[0]+b1*a[4]+b2*a[8]+b3*a[12];
      out[i*4+1] = b0*a[1]+b1*a[5]+b2*a[9]+b3*a[13];
      out[i*4+2] = b0*a[2]+b1*a[6]+b2*a[10]+b3*a[14];
      out[i*4+3] = b0*a[3]+b1*a[7]+b2*a[11]+b3*a[15];
    }
    return out;
  },

  invert(out, m) {
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
          a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
          b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
          b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
          b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return out;
    det = 1 / det;
    out[0]=(a11*b11-a12*b10+a13*b09)*det;  out[1]=(a02*b10-a01*b11-a03*b09)*det;
    out[2]=(a31*b05-a32*b04+a33*b03)*det;  out[3]=(a22*b04-a21*b05-a23*b03)*det;
    out[4]=(a12*b08-a10*b11-a13*b07)*det;  out[5]=(a00*b11-a02*b08+a03*b07)*det;
    out[6]=(a32*b02-a30*b05-a33*b01)*det;  out[7]=(a20*b05-a22*b02+a23*b01)*det;
    out[8]=(a10*b10-a11*b08+a13*b06)*det;  out[9]=(a01*b08-a00*b10-a03*b06)*det;
    out[10]=(a30*b04-a31*b02+a33*b00)*det; out[11]=(a21*b02-a20*b04-a23*b00)*det;
    out[12]=(a11*b07-a10*b09-a12*b06)*det; out[13]=(a00*b09-a01*b07+a02*b06)*det;
    out[14]=(a31*b01-a30*b03-a32*b00)*det; out[15]=(a20*b03-a21*b01+a22*b00)*det;
    return out;
  },

  compose(out, pos, scale, rotY) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    out[0]=c*scale[0]; out[1]=0; out[2]=-s*scale[0]; out[3]=0;
    out[4]=0; out[5]=scale[1]; out[6]=0; out[7]=0;
    out[8]=s*scale[2]; out[9]=0; out[10]=c*scale[2]; out[11]=0;
    out[12]=pos[0]; out[13]=pos[1]; out[14]=pos[2]; out[15]=1;
    return out;
  },
};

const clamp  = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp   = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2);
const lerp3 = (out, a, b, t) => { out[0]=lerp(a[0],b[0],t); out[1]=lerp(a[1],b[1],t); out[2]=lerp(a[2],b[2],t); return out; };

// Deterministic PRNG — the tree must be identical on every reload and every machine.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------- device --- */

const Device = {
  gpu: window._GPU_ || '',
  mobile: /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent),
  tier: 2,
  dpr: 1,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  detect() {
    const g = this.gpu;
    const has = (...s) => s.some((x) => g.includes(x));
    const num = (prefix) => {
      const i = g.indexOf(prefix);
      if (i < 0) return -1;
      const m = g.slice(i + prefix.length).match(/\d+/);
      return m ? Number(m[0]) : -1;
    };

    let tier;
    if (has('swiftshader', 'llvmpipe', 'software', 'basic render')) tier = 0;
    else if (this.mobile) tier = has('apple a1', 'apple m') ? 2 : 1;
    else if (has('rtx', 'titan', 'quadro', 'radeon vii')) tier = 3;
    else if (has('apple m')) tier = has('max', 'ultra', 'pro') ? 3 : 2;
    else if (num('gtx ') >= 1060 || num('radeon rx ') >= 5500) tier = 3;
    else if (has('nvidia', 'geforce', 'radeon', 'amd')) tier = 2;
    else if (has('iris', 'uhd graphics', 'hd graphics')) tier = num('uhd graphics ') >= 700 ? 1 : 0;
    else tier = 1;   // unknown vendor, or a browser hiding the string — assume modest

    if (g === '') tier = Math.min(tier, 2);
    if (FLAG('tier')) tier = clamp(FLAGV('tier', tier), 0, 3);

    this.tier = tier;
    this.dpr = Math.min(window.devicePixelRatio || 1, [1, 1.25, 1.75, 2][tier]);
    return tier;
  },

  // Quality budget derived from the tier. Every subsystem reads from here.
  get quality() {
    const t = this.tier;
    return {
      particles:   [4096, 10240, 20480, 32768][t],
      grass:       [14000, 36000, 70000, 110000][t],
      bloomLevels: [4, 5, 5, 6][t],
      godRays:     true,
      raySamples:  [16, 24, 34, 46][t],
      leafDensity: [0.55, 0.80, 1.0, 1.0][t],
      branchSides: [6, 7, 8, 9][t],
      halfFloat:   !!window._HALF_RT_,
      aberration:  t >= 1,
    };
  },
};

/* -------------------------------------------------------------- render --- */

const Render = {
  DT: 16.67,
  TIME: 0,
  FRAME: 0,
  REFRESH_RATE: 60,
  HZ_MULTIPLIER: 1,
  paused: false,

  _cbs: [],
  _last: performance.now(),
  _samples: [],
  _sampled: false,
  _fpsWindow: [],
  fps: 60,

  add(fn) { this._cbs.push(fn); return fn; },
  remove(fn) { const i = this._cbs.indexOf(fn); if (i > -1) this._cbs.splice(i, 1); },

  start() {
    const loop = (t) => {
      requestAnimationFrame(loop);
      if (this.paused) { this._last = t; return; }

      let dt = t - this._last;
      this._last = t;
      // A tab-out must not fire a 40-second timestep into the simulation.
      dt = clamp(dt, 1, 100);

      // Median of 40 samples, not a mean — one hitch shouldn't define the display.
      if (!this._sampled) {
        this._samples.push(1000 / dt);
        if (this._samples.length > 40) {
          const s = this._samples.slice().sort((a, b) => a - b);
          const med = s[s.length >> 1];
          this.REFRESH_RATE = med > 200 ? 240 : med > 100 ? 120 : med > 80 ? 90 : 60;
          this.HZ_MULTIPLIER = 60 / this.REFRESH_RATE;
          this._sampled = true;
        }
      }

      this._fpsWindow.push(1000 / dt);
      if (this._fpsWindow.length > 30) this._fpsWindow.shift();
      this.fps = this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length;

      this.DT = dt;
      this.TIME += dt / 1000;
      this.FRAME++;

      for (let i = 0; i < this._cbs.length; i++) this._cbs[i](dt / 1000, this.TIME);
    };
    requestAnimationFrame(loop);
  },
};

document.addEventListener('visibilitychange', () => { Render.paused = document.hidden; });

/* ---------------------------------------------------------------- tune --- */
/*
   Every art-directed number in the film lives here rather than in the code.
   Values are grouped, typed and ranged so the ?uil editor can build itself,
   and the whole set serialises back out to assets/data/tune.json.
*/

const Tune = {
  groups: {},
  values: {},
  _subs: [],

  def(group, key, value, min, max, step) {
    if (!this.groups[group]) this.groups[group] = [];
    const type = Array.isArray(value) ? (value.length === 3 ? 'color' : 'vec') : typeof value === 'boolean' ? 'bool' : 'num';
    this.groups[group].push({ key, min, max, step: step || (max - min) / 200, type });
    this.values[key] = value;
    return key;
  },

  get(k) { return this.values[k]; },
  set(k, v) { this.values[k] = v; this._subs.forEach((f) => f(k, v)); },
  onChange(fn) { this._subs.push(fn); },

  async load(url) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return;
      const j = await r.json();
      for (const k in j) if (k in this.values) this.values[k] = j[k];
    } catch (e) { /* defaults stand */ }
  },

  serialise() { return JSON.stringify(this.values, null, 2); },
};
