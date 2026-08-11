/*! VERDANT — a season in one scroll
 *  Hand-written WebGL2. No frameworks, no 3D library, no image assets.
 *  build 202608110937 · 8 modules · 93 KB
 */
(function(){
'use strict';

/* ---- 01-core.js ------------------------------------------------ */
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

/* ---- 02-gl.js -------------------------------------------------- */
/* ============================================================================
   VERDANT — GL layer
   Shader bundle parser (one file, {@}name{@} delimited, #! pragma sections),
   program cache with introspected uniform setters, geometry and render targets.
   ========================================================================== */

let gl = null;
let canvas = null;

const GL = {
  init(el) {
    canvas = el;
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,            // we resolve with our own post chain
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: FLAG('capture'),
    });
    if (!gl) throw new Error('webgl2 unavailable');
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    return gl;
  },
  get ctx() { return gl; },
  get canvas() { return canvas; },
};

/* ------------------------------------------------------- shader bundle --- */

const Shaders = {
  raw: {},
  programs: new Map(),
  drawCalls: 0,

  // Chunks are pulled in only when a shader actually references one of their
  // symbols — same idea as an #include graph, resolved by the loader instead of
  // by a preprocessor we would have to ship.
  DEPS: [
    ['curl.glsl',     ['curlNoise']],
    ['sdf.glsl',      ['leafMask', 'leafVeins', 'petalMask', 'leafHalfWidth']],
    ['lighting.glsl', ['wrapDiffuse', 'backScatter', 'fresnel(', 'aces(']],
    ['atmos.glsl',    ['skyColor', 'applyFog', 'uSunDir', 'uSunColor', 'uFogDensity', 'uFogColor', 'uSkyTop']],
    ['wind.glsl',     ['windOffset', 'uWindStrength']],
  ],

  async load(url) {
    const src = await (await fetch(url, { cache: 'no-cache' })).text();
    // {@}name{@}body{@}name{@}body...
    const parts = src.split('{@}');
    for (let i = 1; i < parts.length; i += 2) {
      this.raw[parts[i].trim()] = parts[i + 1] || '';
    }
    return this;
  },

  section(body, tag) {
    const i = body.indexOf('#!' + tag);
    if (i < 0) return '';
    const rest = body.slice(i + tag.length + 2);
    const next = rest.search(/#![A-Z]/);
    return next < 0 ? rest : rest.slice(0, next);
  },

  assemble(name, stage) {
    const body = this.raw[name];
    if (body === undefined) throw new Error('shader not in bundle: ' + name);

    const attribs  = this.section(body, 'ATTRIBUTES');
    const uniforms = this.section(body, 'UNIFORMS');
    const varyings = this.section(body, 'VARYINGS');
    const main     = this.section(body, 'SHADER') || body;

    const declared = attribs + uniforms + varyings + main;

    let chunks = this.raw['common.glsl'];
    for (const [file, tokens] of this.DEPS) {
      if (tokens.some((t) => declared.includes(t))) chunks += '\n' + this.raw[file];
    }

    return [
      '#version 300 es',
      stage === 'fs' ? 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;' : 'precision highp float;\nprecision highp int;',
      'uniform float uTime;',
      chunks,
      attribs, uniforms, varyings, main,
    ].join('\n');
  },

  compile(stage, src, label) {
    const sh = gl.createShader(stage === 'vs' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const lines = src.split('\n');
      const n = Number((log.match(/ERROR:\s*\d+:(\d+)/) || [])[1] || 0);
      const ctx = lines.slice(Math.max(0, n - 4), n + 3)
        .map((l, i) => String(Math.max(1, n - 3) + i).padStart(4) + ' | ' + l).join('\n');
      console.error(`[${label}.${stage}] ${log}\n${ctx}`);
      throw new Error('shader compile failed: ' + label);
    }
    return sh;
  },

  // get('leaf')        -> leaf.vs + leaf.fs
  // get('bright')      -> screen.vs + bright.fs   (fullscreen pass)
  get(name, vsName) {
    const key = (vsName || name) + '|' + name;
    if (this.programs.has(key)) return this.programs.get(key);

    const vsSrc = this.assemble(this.raw[name + '.vs'] !== undefined ? name + '.vs' : (vsName || 'screen.vs'), 'vs');
    const fsSrc = this.assemble(name + '.fs', 'fs');

    const p = gl.createProgram();
    gl.attachShader(p, this.compile('vs', vsSrc, name));
    gl.attachShader(p, this.compile('fs', fsSrc, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));

    const prog = new Program(p, name);
    this.programs.set(key, prog);
    return prog;
  },
};

class Program {
  constructor(p, name) {
    this.p = p;
    this.name = name;
    this.u = {};
    this._units = {};
    this._unitCount = 0;
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[\d+\]$/, '');
      this.u[base] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
  }

  use() { gl.useProgram(this.p); this._unitCount = 0; return this; }

  set(name, v) {
    const u = this.u[name];
    if (!u) return this;
    const t = u.type, G = gl;
    switch (t) {
      case G.FLOAT:        G.uniform1f(u.loc, v); break;
      case G.INT:
      case G.BOOL:         G.uniform1i(u.loc, v); break;
      case G.FLOAT_VEC2:   G.uniform2fv(u.loc, v); break;
      case G.FLOAT_VEC3:   G.uniform3fv(u.loc, v); break;
      case G.FLOAT_VEC4:   G.uniform4fv(u.loc, v); break;
      case G.FLOAT_MAT3:   G.uniformMatrix3fv(u.loc, false, v); break;
      case G.FLOAT_MAT4:   G.uniformMatrix4fv(u.loc, false, v); break;
      case G.SAMPLER_2D: {
        let unit = this._units[name];
        if (unit === undefined) unit = this._units[name] = this._unitCount++;
        G.activeTexture(G.TEXTURE0 + unit);
        G.bindTexture(G.TEXTURE_2D, v);
        G.uniform1i(u.loc, unit);
        break;
      }
      default: G.uniform1f(u.loc, v);
    }
    return this;
  }

  setAll(obj) { for (const k in obj) this.set(k, obj[k]); return this; }
}

/* ------------------------------------------------------------ geometry --- */

class Geo {
  constructor() {
    this.vao = gl.createVertexArray();
    this.count = 0;
    this.instances = 0;
    this.indexed = false;
    this._buffers = [];
  }
  bind() { gl.bindVertexArray(this.vao); return this; }

  attrib(loc, data, size, { divisor = 0, dynamic = false } = {}) {
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    if (divisor) gl.vertexAttribDivisor(loc, divisor);
    this._buffers[loc] = buf;
    if (!divisor && this.count === 0) this.count = data.length / size;
    return this;
  }

  index(data) {
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.count = data.length;
    this.indexed = true;
    return this;
  }

  update(loc, data) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers[loc]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    return this;
  }

  draw(mode = gl.TRIANGLES) {
    gl.bindVertexArray(this.vao);
    if (this.instances > 0) {
      if (this.indexed) gl.drawElementsInstanced(mode, this.count, gl.UNSIGNED_SHORT, 0, this.instances);
      else gl.drawArraysInstanced(mode, 0, this.count, this.instances);
    } else if (this.indexed) {
      gl.drawElements(mode, this.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(mode, 0, this.count);
    }
    Shaders.drawCalls++;
    return this;
  }
}

const Primitives = {
  // Unit quad, 0..1, two triangles. Used for every billboard and glyph.
  quad() {
    return new Geo().attrib(0, new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]), 2);
  },

  // Open cylinder, y from 0..1, radius 1. Branch segments instance this.
  cylinder(sides) {
    const pos = [], nrm = [];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      pos.push(c0,0,s0,  c1,0,s1,  c0,1,s0,   c0,1,s0,  c1,0,s1,  c1,1,s1);
      nrm.push(c0,0,s0,  c1,0,s1,  c0,0,s0,   c0,0,s0,  c1,0,s1,  c1,0,s1);
    }
    return new Geo().attrib(0, new Float32Array(pos), 3).attrib(1, new Float32Array(nrm), 3);
  },

  // UV sphere with positions doubling as normals. Only the seed uses it.
  sphere(seg) {
    const pos = [], idx = [];
    for (let y = 0; y <= seg; y++) {
      const v = y / seg, phi = v * Math.PI;
      for (let x = 0; x <= seg * 2; x++) {
        const u = x / (seg * 2), theta = u * Math.PI * 2;
        pos.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      }
    }
    const row = seg * 2 + 1;
    for (let y = 0; y < seg; y++) {
      for (let x = 0; x < seg * 2; x++) {
        const a = y * row + x, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return new Geo().attrib(0, new Float32Array(pos), 3).index(new Uint16Array(idx));
  },

  // Subdivided ground plane. Segments are dense enough for the fbm displacement.
  plane(size, seg) {
    const pos = [], uv = [], idx = [];
    for (let z = 0; z <= seg; z++) {
      for (let x = 0; x <= seg; x++) {
        // Quadratic spacing puts the triangles where the camera is, not at the horizon.
        const fx = (x / seg) * 2 - 1, fz = (z / seg) * 2 - 1;
        pos.push(Math.sign(fx) * fx * fx * size, 0, Math.sign(fz) * fz * fz * size);
        uv.push(x / seg, z / seg);
      }
    }
    for (let z = 0; z < seg; z++) {
      for (let x = 0; x < seg; x++) {
        const a = z * (seg + 1) + x, b = a + 1, c = a + seg + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return new Geo().attrib(0, new Float32Array(pos), 3).attrib(1, new Float32Array(uv), 2).index(new Uint16Array(idx));
  },
};

/* ------------------------------------------------------- render target --- */

class RT {
  constructor(w, h, { float = false, f32 = false, depth = false, filter = 'linear' } = {}) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    // Simulation state needs full float precision; HDR colour is happy at half.
    this.f32 = f32 && !!window._FLOAT_RT_;
    this.float = this.f32 || (float && !!window._HALF_RT_);
    this.opts = { float, f32, depth, filter };
    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();
    this.depthBuf = depth ? gl.createRenderbuffer() : null;
    this._alloc();
  }

  _alloc() {
    const G = gl;
    G.bindTexture(G.TEXTURE_2D, this.tex);
    const internal = this.f32 ? G.RGBA32F : this.float ? G.RGBA16F : G.RGBA8;
    const type = this.f32 ? G.FLOAT : this.float ? G.HALF_FLOAT : G.UNSIGNED_BYTE;
    G.texImage2D(G.TEXTURE_2D, 0, internal, this.w, this.h, 0, G.RGBA, type, null);
    const f = this.opts.filter === 'nearest' ? G.NEAREST : G.LINEAR;
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, f);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, f);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_S, G.CLAMP_TO_EDGE);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_T, G.CLAMP_TO_EDGE);

    G.bindFramebuffer(G.FRAMEBUFFER, this.fbo);
    G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, this.tex, 0);
    if (this.depthBuf) {
      G.bindRenderbuffer(G.RENDERBUFFER, this.depthBuf);
      G.renderbufferStorage(G.RENDERBUFFER, G.DEPTH_COMPONENT24, this.w, this.h);
      G.framebufferRenderbuffer(G.FRAMEBUFFER, G.DEPTH_ATTACHMENT, G.RENDERBUFFER, this.depthBuf);
    }
    G.bindFramebuffer(G.FRAMEBUFFER, null);
  }

  resize(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (w === this.w && h === this.h) return this;
    this.w = w; this.h = h;
    this._alloc();
    return this;
  }

  bind(clear = true) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    if (clear) gl.clear(gl.COLOR_BUFFER_BIT | (this.depthBuf ? gl.DEPTH_BUFFER_BIT : 0));
    return this;
  }

  static unbind(w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
  }
}

// A pair of targets you can ping-pong. The GPGPU particle state lives in one.
class PingPong {
  constructor(w, h, opts) {
    this.a = new RT(w, h, opts);
    this.b = new RT(w, h, opts);
  }
  get read() { return this.a; }
  get write() { return this.b; }
  swap() { const t = this.a; this.a = this.b; this.b = t; }
}

// Fullscreen triangle — no VAO, no buffers, driven off gl_VertexID.
let _emptyVao = null;
function fullscreen() {
  if (!_emptyVao) _emptyVao = gl.createVertexArray();
  gl.bindVertexArray(_emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  Shaders.drawCalls++;
}

function dataTexture(data, w, h, float = true) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA32F : gl.RGBA8, w, h, 0, gl.RGBA,
                float ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/* ---- 03-text.js ------------------------------------------------ */
/* ============================================================================
   VERDANT — GLText
   There is no DOM text in this film. Type is rasterised once into a glyph atlas,
   laid out here (wrap, tracking, alignment, baselines), and drawn as one
   instanced batch of per-character quads so each letter can animate on its own.

   Sizing is viewport-relative, like CSS: `size` is a fraction of the viewport
   height and every other measurement is in ems. A block is anchored in camera
   space, so framing survives any camera move, focal length or aspect ratio.
   ========================================================================== */

const ATLAS_PX = 160;   // glyph raster size; world scale is applied at draw time
const ATLAS_PX_MONO = 96;

const FONT_DISPLAY = 'Constantia, "Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Times New Roman", serif';
const FONT_MONO    = 'ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "Roboto Mono", monospace';

const GlyphAtlas = {
  cache: new Map(),

  build(spec) {
    if (this.cache.has(spec.key)) return this.cache.get(spec.key);

    const { family, weight, style, chars, px } = spec;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = `${style} ${weight} ${px}px ${family}`;
    ctx.font = font;

    const pad = Math.ceil(px * 0.18);
    const list = [...new Set(chars.split(''))].filter((ch) => ch !== '\n');

    let maxAsc = 0, maxDesc = 0, maxInk = 0;
    const metrics = new Map();
    for (const ch of list) {
      const m = ctx.measureText(ch);
      const left  = m.actualBoundingBoxLeft  !== undefined ? m.actualBoundingBoxLeft  : 0;
      const right = m.actualBoundingBoxRight !== undefined ? m.actualBoundingBoxRight : m.width;
      const asc   = m.actualBoundingBoxAscent  !== undefined ? m.actualBoundingBoxAscent  : px * 0.78;
      const desc  = m.actualBoundingBoxDescent !== undefined ? m.actualBoundingBoxDescent : px * 0.22;
      metrics.set(ch, { adv: m.width, left, right, asc, desc });
      maxAsc  = Math.max(maxAsc, asc);
      maxDesc = Math.max(maxDesc, desc);
      maxInk  = Math.max(maxInk, left + right);
    }

    const cellW = Math.ceil(maxInk + pad * 2);
    const cellH = Math.ceil(maxAsc + maxDesc + pad * 2);
    const baselineInCell = pad + maxAsc;

    const cap = Math.min(4096, window._MAX_TEX_ || 2048);
    const cols = Math.max(1, Math.floor(cap / cellW));
    const rows = Math.ceil(list.length / cols);
    c.width  = cols * cellW;
    c.height = rows * cellH;

    ctx.font = font;                 // canvas resets state on resize
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const glyphs = new Map();
    list.forEach((ch, i) => {
      const col = i % cols, row = (i / cols) | 0;
      const ox = col * cellW, oy = row * cellH;
      const m = metrics.get(ch);
      const originX = pad + m.left;
      ctx.fillText(ch, ox + originX, oy + baselineInCell);
      glyphs.set(ch, {
        adv: m.adv / px,             // stored in ems
        originX: originX / px,
        u0: ox / c.width,
        v0: 1 - (oy + cellH) / c.height,
        u1: (ox + cellW) / c.width,
        v1: 1 - oy / c.height,
      });
    });

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (GL.aniso) gl.texParameterf(gl.TEXTURE_2D, GL.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);

    const atlas = {
      tex, glyphs,
      cellW: cellW / px, cellH: cellH / px,
      descent: (cellH - baselineInCell) / px,
      capHeight: maxAsc / px,
    };
    this.cache.set(spec.key, atlas);
    return atlas;
  },
};

class GLText {
  constructor(opts) {
    this.text = opts.text;
    this.size = opts.size || 0.05;                 // fraction of viewport height
    this.tracking = opts.tracking || 0;            // ems
    this.lineHeight = opts.lineHeight || 1.28;     // ems
    this.align = opts.align || 'left';
    this.maxWidth = opts.maxWidth || Infinity;     // ems
    this.anchor = opts.anchor || [0, 0];           // -1..1 of the visible frame
    this.dist = opts.dist || 3;                    // metres in front of the camera
    this.color = opts.color || [0.94, 0.96, 0.90];
    this.halo = opts.halo !== undefined ? opts.halo : 0.5;
    this.haloColor = opts.haloColor || [0.02, 0.03, 0.025];
    this.opacity = 1;
    this.reveal = 0;
    this.stagger = opts.stagger !== undefined ? opts.stagger : 0.55;
    this.drift = opts.drift !== undefined ? opts.drift : 0.30;
    this.parallax = opts.parallax !== undefined ? opts.parallax : 1;
    this.uppercase = !!opts.uppercase;
    this.model = M4.create();

    const family = opts.mono ? FONT_MONO : FONT_DISPLAY;
    const weight = opts.weight || 400;
    const style = opts.italic ? 'italic' : 'normal';
    const px = opts.mono ? ATLAS_PX_MONO : ATLAS_PX;

    this._src = this.uppercase ? this.text.toUpperCase() : this.text;
    this._spec = { key: `${family}|${weight}|${style}|${px}`, family, weight, style, px };

    // Layout is deferred: an atlas must contain every glyph of every block that
    // shares its style, and those blocks do not exist yet. GLText.flush() unions
    // the character sets, rasterises one atlas per style, then lays everything out.
    GLText._pending.push(this);
  }

  static flush() {
    const byStyle = new Map();
    for (const t of GLText._pending) {
      let e = byStyle.get(t._spec.key);
      if (!e) byStyle.set(t._spec.key, (e = { spec: t._spec, chars: new Set(' ') }));
      for (const ch of t._src) e.chars.add(ch);
    }
    for (const [, e] of byStyle) {
      GlyphAtlas.cache.delete(e.spec.key);
      GlyphAtlas.build({ ...e.spec, chars: [...e.chars].join('') });
    }
    for (const t of GLText._pending) {
      t.atlas = GlyphAtlas.cache.get(t._spec.key);
      t._layout(t._src);
    }
    const n = GLText._pending.length;
    GLText._pending = [];
    return { blocks: n, atlases: byStyle.size };
  }

  _layout(src) {
    const A = this.atlas;
    const glyph = (ch) => A.glyphs.get(ch) || A.glyphs.get(' ');
    const measure = (s) => { let w = 0; for (const ch of s) w += glyph(ch).adv + this.tracking; return w; };

    // Greedy word wrap, in ems.
    const lines = [];
    for (const para of src.split('\n')) {
      if (!para.length) { lines.push(''); continue; }
      let cur = '';
      for (const word of para.split(' ')) {
        const test = cur ? cur + ' ' + word : word;
        if (measure(test) > this.maxWidth && cur) { lines.push(cur); cur = word; }
        else cur = test;
      }
      lines.push(cur);
    }

    const widths = lines.map(measure);
    const blockW = Math.max(...widths, 0);

    const rects = [], uvs = [], metas = [];
    const totalChars = lines.reduce((n, l) => n + l.replace(/ /g, '').length, 0);
    let charIndex = 0, count = 0;

    lines.forEach((line, li) => {
      // The anchor is the block's own alignment edge: left blocks grow right,
      // right blocks grow left, centred blocks grow both ways.
      let pen = this.align === 'center' ? -widths[li] * 0.5
              : this.align === 'right'  ? -widths[li]
              : 0;
      // First line's cap sits on y = 0 so anchoring is predictable.
      const baselineY = -li * this.lineHeight - A.capHeight;

      for (const ch of line) {
        const g = glyph(ch);
        if (ch !== ' ') {
          rects.push(pen - g.originX, baselineY - A.descent, A.cellW, A.cellH);
          uvs.push(g.u0, g.v0, g.u1, g.v1);
          metas.push(charIndex++, li, Math.max(1, totalChars - 1), Math.random());
          count++;
        }
        pen += g.adv + this.tracking;
      }
    });

    this.blockWidth = blockW;
    this.blockHeight = lines.length * this.lineHeight;
    this.lines = lines;

    this.geo = Primitives.quad();
    this.geo.attrib(1, new Float32Array(rects), 4, { divisor: 1 });
    this.geo.attrib(2, new Float32Array(uvs), 4, { divisor: 1 });
    this.geo.attrib(3, new Float32Array(metas), 4, { divisor: 1 });
    this.geo.instances = count;
  }

  static _pending = [];

  /*
     Anchor the block in camera space. `frame` carries the camera basis and the
     half-extents of the visible rectangle at this block's distance, so a block
     placed at anchor [-0.6, 0.3] lands in the same part of the composition
     whatever the focal length or window aspect happens to be.
  */
  draw(prog, frame) {
    if (this.opacity <= 0.002 || this.reveal <= 0.0005) return;

    const d = this.dist;
    const halfH = d * frame.tanHalfFov;
    const halfW = halfH * frame.aspect;
    const em = halfH * 2 * this.size;

    const ox = this.anchor[0] * halfW + frame.parallaxX * this.parallax * halfW * 0.035;
    const oy = this.anchor[1] * halfH + frame.parallaxY * this.parallax * halfH * 0.035;

    const R = frame.right, U = frame.up, F = frame.forward, P = frame.pos;
    const px = P[0] + F[0]*d + R[0]*ox + U[0]*oy;
    const py = P[1] + F[1]*d + R[1]*ox + U[1]*oy;
    const pz = P[2] + F[2]*d + R[2]*ox + U[2]*oy;

    const m = this.model;
    m[0]=R[0]*em; m[1]=R[1]*em; m[2]=R[2]*em; m[3]=0;
    m[4]=U[0]*em; m[5]=U[1]*em; m[6]=U[2]*em; m[7]=0;
    m[8]=F[0]*em; m[9]=F[1]*em; m[10]=F[2]*em; m[11]=0;
    m[12]=px; m[13]=py; m[14]=pz; m[15]=1;

    prog.set('uModel', m)
        .set('uReveal', this.reveal)
        .set('uStagger', this.stagger)
        .set('uDrift', this.drift)
        .set('uColor', this.color)
        .set('uHalo', this.halo)
        .set('uHaloColor', this.haloColor)
        .set('uOpacity', this.opacity)
        .set('tAtlas', this.atlas.tex);
    this.geo.draw();
  }
}

/* ---- 04-world.js ----------------------------------------------- */
/* ============================================================================
   VERDANT — procedural world
   The tree, the meadow and the flowers are generated once from a seeded PRNG.
   Nothing is rebuilt while you scroll: growth is a single uniform that the
   vertex stage compares against a per-element birth time.
   ========================================================================== */

const V = {
  add: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  scale: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
  norm: (a) => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  // Rotate `v` around `axis` by `ang` (Rodrigues).
  rotAxis(v, axis, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const k = V.cross(axis, v);
    const d = axis[0]*v[0] + axis[1]*v[1] + axis[2]*v[2];
    return [
      v[0]*c + k[0]*s + axis[0]*d*(1-c),
      v[1]*c + k[1]*s + axis[1]*d*(1-c),
      v[2]*c + k[2]*s + axis[2]*d*(1-c),
    ];
  },
  perp(a) {
    const t = Math.abs(a[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    return V.norm(V.cross(t, a));
  },
};

const Tree = {
  segments: [],
  leafSlots: [],
  blossomSlots: [],
  maxArc: 0,

  generate(seed = 20260810) {
    const rnd = mulberry32(seed);
    this.segments = [];
    this.leafSlots = [];
    this.blossomSlots = [];

    const MAX_DEPTH = 7;
    const SEG_PER_BRANCH = 5;
    // Longest root-to-tip path, used to normalise birth times so the growth
    // front travels outward at a constant speed rather than per-generation.
    this.maxArc = 12.9;
    const BIRTH_FLOOR = 0.06;

    const grow = (origin, dir, length, radius, depth, arc, phase) => {
      const steps = depth === 0 ? SEG_PER_BRANCH + 4 : SEG_PER_BRANCH;
      const segLen = length / steps;
      let p = origin, d = dir;

      // Branches lean toward the light and sag under their own weight. The
      // trunk barely does either — that is most of what makes it read as a trunk.
      const lean = V.norm([rnd() - 0.5, 0, rnd() - 0.5]);
      const leanAmt = depth === 0 ? 0.010 : 0.030 + rnd() * 0.038;
      const droop = depth > 3 ? 0.032 * (depth - 3) : 0;

      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const r0 = radius * (1 - t0 * 0.55);
        const r1 = radius * (1 - t1 * 0.55);

        d = V.norm(V.add(d, V.scale(lean, leanAmt)));
        d = V.norm([d[0], d[1] - droop, d[2]]);
        const next = V.add(p, V.scale(d, segLen));

        const birth = clamp(BIRTH_FLOOR + (arc / this.maxArc) * (1 - BIRTH_FLOOR), 0, 1);
        this.segments.push({ p0: p, p1: next, r0, r1, birth, depth, phase });

        // Twigs carry the canopy. Deeper = denser, later.
        if (depth >= 4) {
          const perLeaf = depth >= 6 ? 5 : 2;
          for (let k = 0; k < perLeaf; k++) {
            const ang = rnd() * Math.PI * 2;
            const side = V.rotAxis(V.perp(d), d, ang);
            const out = V.norm(V.add(V.scale(side, 0.9), V.add(V.scale(d, 0.5), [0, 0.30, 0])));
            this.leafSlots.push({
              pos: V.add(p, V.scale(d, segLen * rnd())),
              dir: out,
              scale: 0.24 + rnd() * 0.19,
              birth: Math.min(0.99, birth + 0.03 + rnd() * 0.07),
              phase: rnd(), tintA: rnd(), tintB: rnd(), kind: rnd(),
            });
          }
        }
        // A scatter of blossom in the outer canopy.
        if (depth >= 6 && rnd() < 0.13) {
          this.blossomSlots.push({
            pos: V.add(p, V.scale(d, segLen * 0.7)),
            dir: V.norm(V.add(d, [0, 0.7, 0])),
            scale: 0.115 + rnd() * 0.095,
            birth: 0.42 + rnd() * 0.44,
            phase: rnd(), hue: rnd(), kind: rnd(),
            petals: 5 + ((rnd() * 3) | 0),
          });
        }

        p = next;
        arc += segLen;
      }

      if (depth >= MAX_DEPTH || length < 0.28) return;

      // Split. Two children usually, three occasionally, so the silhouette never
      // settles into an obvious binary rhythm.
      const kids = rnd() < (depth < 2 ? 0.5 : 0.26) ? 3 : 2;
      const axis = V.perp(d);
      for (let k = 0; k < kids; k++) {
        const spin = (k / kids) * Math.PI * 2 + rnd() * 1.2 + depth * 0.8;
        const spread = (depth === 0 ? 0.52 : 0.44 + rnd() * 0.36) - depth * 0.012;
        let nd = V.rotAxis(d, V.rotAxis(axis, d, spin), spread);
        nd = V.norm(V.add(nd, [0, 0.20, 0]));            // apical bias, always up
        const decay = depth === 0 ? 0.60 + rnd() * 0.08 : 0.77 + rnd() * 0.07;
        grow(p, nd, length * decay, radius * (0.58 + rnd() * 0.12), depth + 1, arc, rnd());
      }
    };

    grow([0, 0, 0], [0, 1, 0], 3.5, 0.165, 0, 0, 0);

    // Roots: the same recursion, mirrored, and born before the trunk moves.
    const rootRnd = mulberry32(seed ^ 0x5f3759df);
    const rootGrow = (origin, dir, length, radius, depth, birth) => {
      const steps = 4;
      const segLen = length / steps;
      let p = origin, d = dir;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        d = V.norm(V.add(d, [(rootRnd() - 0.5) * 0.34, -0.05, (rootRnd() - 0.5) * 0.34]));
        const next = V.add(p, V.scale(d, segLen));
        this.segments.push({
          p0: p, p1: next,
          r0: radius * (1 - t0 * 0.72), r1: radius * (1 - t1 * 0.72),
          birth: 0.004 + depth * 0.006 + i * 0.003, depth: depth + 4, phase: rootRnd(),
        });
        p = next;
      }
      if (depth >= 3 || length < 0.3) return;
      const n = rootRnd() < 0.45 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const spin = (k / n) * Math.PI * 2 + rootRnd() * 1.5;
        const axis = V.perp(d);
        const nd = V.rotAxis(d, V.rotAxis(axis, d, spin), 0.55 + rootRnd() * 0.55);
        rootGrow(p, nd, length * 0.7, radius * 0.62, depth + 1, birth + 0.01);
      }
    };
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      rootGrow([Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.1],
               V.norm([Math.cos(a), -0.62, Math.sin(a)]), 2.3, 0.095, 0, 0.004);
    }

    return this;
  },

  buildBranchGeo(sides) {
    const geo = Primitives.cylinder(sides);
    const n = this.segments.length;
    const s0 = new Float32Array(n * 4), s1 = new Float32Array(n * 4), meta = new Float32Array(n * 4);
    this.segments.forEach((s, i) => {
      s0.set([s.p0[0], s.p0[1], s.p0[2], s.r0], i * 4);
      s1.set([s.p1[0], s.p1[1], s.p1[2], s.r1], i * 4);
      meta.set([s.birth, s.depth, s.phase, 0], i * 4);
    });
    geo.attrib(2, s0, 4, { divisor: 1 }).attrib(3, s1, 4, { divisor: 1 }).attrib(4, meta, 4, { divisor: 1 });
    geo.instances = n;
    return geo;
  },

  buildLeafGeo(density) {
    const slots = density >= 1 ? this.leafSlots : this.leafSlots.filter((_, i) => (i % 100) / 100 < density);
    const n = slots.length;
    const geo = Primitives.quad();
    const anchor = new Float32Array(n * 4), orient = new Float32Array(n * 4), meta = new Float32Array(n * 4);
    slots.forEach((s, i) => {
      anchor.set([s.pos[0], s.pos[1], s.pos[2], s.scale], i * 4);
      orient.set([s.dir[0], s.dir[1], s.dir[2], s.birth], i * 4);
      meta.set([s.phase, s.tintA, s.tintB, s.kind], i * 4);
    });
    geo.attrib(1, anchor, 4, { divisor: 1 }).attrib(2, orient, 4, { divisor: 1 }).attrib(3, meta, 4, { divisor: 1 });
    geo.instances = n;
    return geo;
  },
};

/* -------------------------------------------------------------- flowers --- */

const Flowers = {
  build(seed, count, canopySlots) {
    const rnd = mulberry32(seed);
    const anchors = [], orients = [], metas = [];

    const push = (pos, dir, scale, birth, hue, kind, petals, phase) => {
      for (let p = 0; p < petals; p++) {
        anchors.push(pos[0], pos[1], pos[2], scale);
        orients.push(dir[0], dir[1], dir[2], birth);
        metas.push(p / petals, phase, hue, kind);
      }
    };

    // Ground flowers, pushed out of the very centre so the trunk stays clean.
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 1.9 + Math.pow(rnd(), 0.62) * 21;
      const pos = [Math.cos(a) * r, 0, Math.sin(a) * r];
      const tilt = V.norm([(rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5]);
      push(pos, tilt, 0.16 + rnd() * 0.17, 0.05 + rnd() * 0.55, rnd(), rnd(),
           5 + ((rnd() * 4) | 0), rnd());
    }
    // Blossom in the canopy, inheriting the tree's own birth schedule.
    for (const s of canopySlots) push(s.pos, s.dir, s.scale, s.birth, s.hue, s.kind, s.petals, s.phase);

    const geo = Primitives.quad();
    geo.attrib(1, new Float32Array(anchors), 4, { divisor: 1 });
    geo.attrib(2, new Float32Array(orients), 4, { divisor: 1 });
    geo.attrib(3, new Float32Array(metas), 4, { divisor: 1 });
    geo.instances = anchors.length / 4;
    return geo;
  },
};

/* ---------------------------------------------------------------- grass --- */

const Meadow = {
  build(seed, count) {
    if (count <= 0) return null;
    const rnd = mulberry32(seed);
    // A single blade: 4 stacked quads tapering to a point, as a triangle strip
    // expressed in triangles so we can keep one draw call.
    const SEGS = 4;
    const blade = [];
    for (let i = 0; i < SEGS; i++) {
      const t0 = i / SEGS, t1 = (i + 1) / SEGS;
      blade.push(-1, t0,  1, t0,  -1, t1,   -1, t1,  1, t0,  1, t1);
    }
    const geo = new Geo().attrib(0, new Float32Array(blade), 2);

    const offset = new Float32Array(count * 4);
    const params = new Float32Array(count * 4);
    let written = 0;
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      // sqrt keeps density uniform per unit area rather than piling up at the centre.
      const r = 1.35 + Math.sqrt(rnd()) * 38;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const clump = 0.55 + 0.45 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
      if (rnd() > clump * 1.15) continue;
      offset.set([x, 0, z, 0.24 + rnd() * 0.46], written * 4);
      params.set([rnd() * Math.PI * 2, rnd(), 0.22 + rnd() * 0.55, rnd()], written * 4);
      written++;
    }
    geo.attrib(1, offset, 4, { divisor: 1 }).attrib(2, params, 4, { divisor: 1 });
    geo.instances = written;
    return geo;
  },
};

/* ------------------------------------------------------ GPGPU particles --- */
/*
   Position and life live in a floating-point texture. Each frame a fullscreen
   pass reads the texture, advances every particle through the curl field, and
   writes the next state to its twin. The draw pass then samples that texture
   per instance. The CPU never touches a particle.
*/

class Particles {
  constructor(count) {
    this.size = Math.ceil(Math.sqrt(count));
    this.count = this.size * this.size;

    const n = this.count;
    const pos = new Float32Array(n * 4);
    const seed = new Float32Array(n * 4);
    const rnd = mulberry32(9127);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 12;
      pos.set([Math.cos(a) * r, rnd() * 9 - 1, Math.sin(a) * r, rnd()], i * 4);
      seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    }

    this.state = new PingPong(this.size, this.size, { f32: true, filter: 'nearest' });
    // Seed both halves so the first swap doesn't read uninitialised memory.
    for (const rt of [this.state.a, this.state.b]) {
      gl.bindTexture(gl.TEXTURE_2D, rt.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, rt.f32 ? gl.RGBA32F : gl.RGBA16F, this.size, this.size, 0,
                    gl.RGBA, rt.f32 ? gl.FLOAT : gl.HALF_FLOAT,
                    rt.f32 ? pos : new Uint16Array(n * 4));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.seedTex = dataTexture(seed, this.size, this.size, true);

    // Draw geometry: one quad per particle, with a lookup into the state texture.
    const lookup = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      lookup[i * 2]     = ((i % this.size) + 0.5) / this.size;
      lookup[i * 2 + 1] = (((i / this.size) | 0) + 0.5) / this.size;
    }
    this.geo = Primitives.quad();
    this.geo.attrib(1, lookup, 2, { divisor: 1 });
    this.geo.instances = n;

    this.simProg = Shaders.get('gpgpu');
    this.drawProg = Shaders.get('particle');
  }

  update(dt, uniforms) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.state.write.bind(false);
    this.simProg.use()
      .set('uTime', Render.TIME)
      .set('uDelta', Math.min(dt, 1 / 30))
      .set('tPos', this.state.read.tex)
      .set('tSeed', this.seedTex)
      .setAll(uniforms);
    fullscreen();
    this.state.swap();
    gl.enable(gl.DEPTH_TEST);
  }

  draw(uniforms) {
    this.drawProg.use()
      .set('uTime', Render.TIME)
      .set('tPos', this.state.read.tex)
      .set('tSeed', this.seedTex)
      .setAll(uniforms);
    this.geo.draw();
  }
}

/* ---- 05-post.js ------------------------------------------------ */
/* ============================================================================
   VERDANT — post chain
   Scene -> bright pass -> dual-filter pyramid -> radial god rays -> grade.
   The pyramid depth, ray sample count and aberration all come from the GPU tier.
   ========================================================================== */

class Post {
  constructor(w, h) {
    const q = Device.quality;
    this.levels = q.bloomLevels;
    this.raySamples = q.raySamples;
    this.useRays = q.godRays;

    this.scene = new RT(w, h, { float: true, depth: true });
    this.bright = new RT(w >> 1, h >> 1, { float: true });
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.levels; i++) {
      const s = 1 << (i + 2);
      this.down.push(new RT(Math.max(2, w / s), Math.max(2, h / s), { float: true }));
      this.up.push(new RT(Math.max(2, w / s), Math.max(2, h / s), { float: true }));
    }
    this.rays = new RT(Math.max(2, w >> 2), Math.max(2, h >> 2), { float: true });
    this.black = new RT(2, 2, { float: true });

    this.pBright = Shaders.get('bright');
    this.pDown = Shaders.get('down');
    this.pUp = Shaders.get('up');
    this.pRay = Shaders.get('godray');
    this.pComposite = Shaders.get('composite');
  }

  resize(w, h) {
    this.scene.resize(w, h);
    this.bright.resize(w >> 1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      const s = 1 << (i + 2);
      this.down[i].resize(Math.max(2, w / s), Math.max(2, h / s));
      this.up[i].resize(Math.max(2, w / s), Math.max(2, h / s));
    }
    this.rays.resize(Math.max(2, w >> 2), Math.max(2, h >> 2));
  }

  render(w, h, params, sunUv) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // --- bright pass -------------------------------------------------------
    this.bright.bind();
    this.pBright.use()
      .set('tScene', this.scene.tex)
      .set('uThreshold', params.bloomThreshold)
      .set('uKnee', 0.6);
    fullscreen();

    // --- downsample pyramid -----------------------------------------------
    let src = this.bright;
    for (let i = 0; i < this.levels; i++) {
      const dst = this.down[i];
      dst.bind();
      this.pDown.use()
        .set('tMap', src.tex)
        .set('uTexel', [1 / src.w, 1 / src.h]);
      fullscreen();
      src = dst;
    }

    // --- upsample, accumulating each level into the one above --------------
    let prev = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      const dst = this.up[i];
      dst.bind();
      this.pUp.use()
        .set('tMap', prev.tex)
        .set('tPrev', this.down[i].tex)
        .set('uTexel', [1 / dst.w, 1 / dst.h])
        .set('uRadius', params.bloomRadius);
      fullscreen();
      prev = dst;
    }
    const bloomTex = this.levels > 1 ? this.up[0].tex : this.down[0].tex;

    // --- god rays ----------------------------------------------------------
    let rayTex = this.black.tex;
    if (this.useRays && params.rayAmount > 0.001 && sunUv[0] > -0.6 && sunUv[0] < 1.6 && sunUv[1] > -0.6 && sunUv[1] < 1.6) {
      this.rays.bind();
      this.pRay.use()
        .set('tMap', this.down[0].tex)
        .set('uSunUv', sunUv)
        .set('uDensity', params.rayDensity)
        .set('uDecay', params.rayDecay)
        .set('uWeight', params.rayWeight)
        .set('uSamples', this.raySamples);
      fullscreen();
      rayTex = this.rays.tex;
    }

    // --- grade and out to the default framebuffer --------------------------
    RT.unbind(w, h);
    this.pComposite.use()
      .set('uTime', Render.TIME)
      .set('tScene', this.scene.tex)
      .set('tBloom', bloomTex)
      .set('tRays', rayTex)
      .set('uResolution', [w, h])
      .set('uExposure', params.exposure)
      .set('uBloomAmount', params.bloomAmount)
      .set('uRayAmount', this.useRays ? params.rayAmount : 0)
      .set('uLift', params.lift)
      .set('uGamma', params.gamma)
      .set('uGain', params.gain)
      .set('uShadowTint', params.shadowTint)
      .set('uHighlightTint', params.highlightTint)
      .set('uSaturation', params.saturation)
      .set('uContrast', params.contrast)
      .set('uVignette', params.vignette)
      .set('uVignetteSoft', params.vignetteSoft)
      .set('uGrain', params.grain)
      .set('uAberration', Device.quality.aberration ? params.aberration : 0)
      .set('uFade', params.fade);
    fullscreen();
  }
}

/* ------------------------------------------------------------- profiler --- */
/*
   Shipped, not stripped. ?stats prints a live HUD; the adaptive governor runs
   always and quietly drops resolution if the frame budget is being missed.
*/

const Profiler = {
  el: null,
  enabled: FLAG('stats'),
  scale: 1,
  _bad: 0,
  _good: 0,

  init() {
    if (!this.enabled) return;
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;top:12px;left:12px;z-index:50;font:11px/1.55 ui-monospace,Consolas,monospace;' +
      'color:#9fbfa4;background:rgba(6,10,8,.72);padding:10px 13px;border:1px solid rgba(140,190,150,.18);' +
      'border-radius:3px;letter-spacing:.06em;pointer-events:none;white-space:pre;backdrop-filter:blur(6px)';
    document.body.appendChild(this.el);
  },

  // Halve-and-recover render scale governor. Two seconds of pain before we act,
  // four seconds of comfort before we give the pixels back.
  govern(dt) {
    if (FLAG('noadapt')) return;
    if (Render.fps < Render.REFRESH_RATE * 0.62) { this._bad++; this._good = 0; }
    else if (Render.fps > Render.REFRESH_RATE * 0.88) { this._good++; this._bad = 0; }
    if (this._bad > 110 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.15); this._bad = 0; return true; }
    if (this._good > 260 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.15); this._good = 0; return true; }
    return false;
  },

  frame(info) {
    if (!this.enabled || !this.el) return;
    if (Render.FRAME % 12) return;
    this.el.textContent =
      `fps      ${Render.fps.toFixed(1)} / ${Render.REFRESH_RATE}\n` +
      `tier     ${Device.tier}  dpr ${Device.dpr.toFixed(2)}  scale ${this.scale.toFixed(2)}\n` +
      `draws    ${info.draws}\n` +
      `scroll   ${info.scroll.toFixed(4)}  ${info.route}\n` +
      `growth   ${info.growth.toFixed(3)}  bloom ${info.bloom.toFixed(3)}\n` +
      `particles ${info.particles}\n` +
      `gpu      ${(Device.gpu || 'masked').slice(0, 38)}`;
  },
};

/* ---- 06-scroll.js ---------------------------------------------- */
/* ============================================================================
   VERDANT — scroll, routing, and the crawler mirror
   Scroll position *is* the router: the URL rewrites itself as the film advances,
   and a deep link seeks straight to that moment. A hidden, real DOM tree carries
   the same content for screen readers and crawlers.
   ========================================================================== */

// The app can be mounted at the origin root or under a sub-path. Everything
// route-related goes through these two helpers so only one place knows.
const BASE = (window._BASE_ || '/').replace(/\/+$/, '');
const toURL   = (p) => (BASE + p).replace(/\/{2,}/g, '/') || '/';
const fromURL = (p) => {
  const s = BASE && p.startsWith(BASE) ? p.slice(BASE.length) : p;
  return (s.replace(/\/+$/, '') || '/');
};

const Scroll = {
  el: null,
  spacer: null,
  raw: 0,
  value: 0,          // smoothed, 0..1
  velocity: 0,
  pages: 7.4,        // viewport heights of travel
  route: '/',
  _routes: [],
  _lastRoute: '',

  init(routes) {
    this._routes = routes;

    this.el = document.createElement('div');
    this.el.id = 'Scroll';
    this.el.style.cssText = 'position:fixed;inset:0;overflow-x:hidden;overflow-y:scroll;z-index:2;-webkit-overflow-scrolling:touch';
    this.spacer = document.createElement('div');
    this.spacer.style.cssText = 'width:1px;pointer-events:none';
    this.el.appendChild(this.spacer);
    document.getElementById('Stage').appendChild(this.el);

    HydraCSS(`
      #Scroll::-webkit-scrollbar{width:9px}
      #Scroll::-webkit-scrollbar-track{background:transparent}
      #Scroll::-webkit-scrollbar-thumb{background:rgba(190,215,190,.16);border-radius:8px;border:3px solid transparent;background-clip:content-box}
      #Scroll::-webkit-scrollbar-thumb:hover{background:rgba(200,225,200,.32);background-clip:content-box}
      #Scroll{scrollbar-width:thin;scrollbar-color:rgba(190,215,190,.2) transparent}
    `);

    this.resize();
    this.el.addEventListener('scroll', () => this._read(), { passive: true });

    // Deep link: land on the right frame of the film, no animation.
    const path = fromURL(location.pathname);
    const hit = routes.find((r) => r.path === path) || routes.find((r) => '#' + r.name === location.hash);
    if (hit) {
      const y = hit.start * this._max();
      this.el.scrollTop = y;
      this.raw = this.value = hit.start;
    }
    this._read();
    return this;
  },

  _max() { return Math.max(1, this.spacer.offsetHeight - window.innerHeight); },
  _read() { this.raw = clamp(this.el.scrollTop / this._max(), 0, 1); },

  resize() {
    this.spacer.style.height = `${(this.pages * 100).toFixed(2)}vh`;
  },

  update() {
    const prev = this.value;
    // Frame-rate independent smoothing. Native wheel deltas are steppy on
    // Windows; this is what turns them into a dolly move.
    const k = 1 - Math.pow(0.0016, Render.DT / 1000);
    this.value += (this.raw - this.value) * k;
    this.velocity = (this.value - prev) / Math.max(0.0001, Render.DT / 1000);

    for (const r of this._routes) {
      if (this.value >= r.start - 0.0001 && this.value < r.end) {
        if (r.path !== this._lastRoute) {
          this._lastRoute = r.path;
          this.route = r.path;
          // replaceState, not push: scrolling should not fill the back stack,
          // but the address bar should always describe what you are looking at.
          history.replaceState({ r: r.path }, '', toURL(r.path) + location.search);
          document.title = r.title;
          SEO.focus(r.name);
        }
        break;
      }
    }
    return this.value;
  },

  // 0..1 progress within a named section.
  local(route) {
    const r = this._routes.find((x) => x.name === route);
    if (!r) return 0;
    return clamp((this.value - r.start) / (r.end - r.start), 0, 1);
  },
};

/* ------------------------------------------------------------------ SEO --- */

const SEO = {
  root: null,
  sections: {},

  build(routes, content) {
    const root = document.createElement('div');
    root.className = 'A11y';
    root.setAttribute('role', 'main');

    const h1 = document.createElement('h1');
    h1.textContent = 'Verdant — a season in one scroll';
    root.appendChild(h1);

    const intro = document.createElement('p');
    intro.textContent =
      'A real-time WebGL film about a single tree. Scroll to advance from seed to canopy. ' +
      'Every surface here is generated on the GPU — there are no photographs, no 3D models and no third-party libraries.';
    root.appendChild(intro);

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Chapters');
    const ul = document.createElement('ul');
    routes.forEach((r) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = toURL(r.path);
      a.textContent = r.title;
      a.addEventListener('click', (e) => { e.preventDefault(); Scroll.el.scrollTo({ top: r.start * Scroll._max(), behavior: 'smooth' }); });
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);
    root.appendChild(nav);

    routes.forEach((r) => {
      const sec = document.createElement('section');
      sec.id = 'chapter-' + r.name;
      sec.setAttribute('aria-label', r.title);
      const h2 = document.createElement('h2');
      h2.textContent = r.title;
      sec.appendChild(h2);
      const body = content[r.name];
      if (body) body.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        sec.appendChild(p);
      });
      root.appendChild(sec);
      this.sections[r.name] = sec;
    });

    const foot = document.createElement('footer');
    foot.innerHTML =
      '<p>Built with a hand-written WebGL2 engine: procedural L-system tree, GPU curl-noise particle simulation, ' +
      'instanced grass, glyph-atlas text rendering, and a dual-filter bloom and colour grade chain. ' +
      'Press <kbd>?uil</kbd> in the query string to open the live tuning editor.</p>';
    root.appendChild(foot);

    document.body.appendChild(root);
    this.root = root;
    return this;
  },

  // Mark the chapter currently on screen so assistive tech follows the film.
  focus(name) {
    for (const k in this.sections) {
      this.sections[k].setAttribute('aria-current', k === name ? 'true' : 'false');
    }
  },
};

/* ------------------------------------------------------------- HydraCSS --- */
// Tiny runtime stylesheet helper — the only CSS we inject after boot.
let _styleEl = null;
function HydraCSS(css) {
  if (!_styleEl) {
    _styleEl = document.createElement('style');
    document.head.appendChild(_styleEl);
  }
  _styleEl.appendChild(document.createTextNode(css));
}

/* ---------------------------------------------------------------- input --- */

const Input = {
  x: 0, y: 0,          // -1..1, smoothed
  tx: 0, ty: 0,
  down: false,

  init() {
    const set = (cx, cy) => {
      this.tx = (cx / window.innerWidth) * 2 - 1;
      this.ty = (cy / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', (e) => set(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerdown', () => { this.down = true; }, { passive: true });
    window.addEventListener('pointerup', () => { this.down = false; }, { passive: true });
    window.addEventListener('pointerleave', () => { this.tx = this.ty = 0; }, { passive: true });
    // Device orientation gives the same parallax on a phone as the mouse does here.
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      this.tx = clamp(e.gamma / 35, -1, 1);
      this.ty = clamp((e.beta - 45) / 35, -1, 1);
    }, { passive: true });
    return this;
  },

  update() {
    const k = 1 - Math.pow(0.004, Render.DT / 1000);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
  },
};

/* ---- 07-uil.js ------------------------------------------------- */
/* ============================================================================
   VERDANT — UIL (the tuning editor)
   Ships in the production bundle, gated behind ?uil. Every art-directed number
   in the film is a slider here; the panel builds itself from Tune's schema and
   serialises straight back out to assets/data/tune.json.
   ========================================================================== */

const UIL = {
  open: false,
  el: null,

  init() {
    if (!FLAG('uil')) return;
    this.open = true;

    HydraCSS(`
      #UIL{position:fixed;top:0;right:0;bottom:0;width:322px;z-index:60;overflow-y:auto;overscroll-behavior:contain;
        background:rgba(8,12,10,.90);backdrop-filter:blur(14px);border-left:1px solid rgba(150,200,160,.16);
        font:11px/1.5 ui-monospace,"Cascadia Mono",Consolas,monospace;color:#b9d4bd;padding-bottom:64px}
      #UIL header{position:sticky;top:0;z-index:2;background:rgba(8,12,10,.96);padding:15px 16px 12px;
        border-bottom:1px solid rgba(150,200,160,.16);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      #UIL header b{font-weight:600;letter-spacing:.24em;font-size:10px;text-transform:uppercase;color:#8fbf98;flex:1}
      #UIL button{font:inherit;font-size:10px;letter-spacing:.08em;background:rgba(150,200,160,.10);color:#b9d4bd;
        border:1px solid rgba(150,200,160,.24);border-radius:2px;padding:5px 9px;cursor:pointer;transition:.15s}
      #UIL button:hover{background:rgba(150,200,160,.22);color:#e6f4e8}
      #UIL .grp{border-bottom:1px solid rgba(150,200,160,.09)}
      #UIL .grp>h4{margin:0;padding:9px 16px;cursor:pointer;font-size:10px;letter-spacing:.2em;text-transform:uppercase;
        color:#7fae89;display:flex;justify-content:space-between;user-select:none}
      #UIL .grp>h4:hover{color:#c8e6cd;background:rgba(150,200,160,.05)}
      #UIL .grp.closed .rows{display:none}
      #UIL .rows{padding:2px 16px 12px}
      #UIL .row{display:grid;grid-template-columns:1fr 52px;gap:6px 8px;align-items:center;padding:3px 0}
      #UIL .row label{color:#96b79c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
      #UIL .row .val{text-align:right;color:#dcefdf;font-variant-numeric:tabular-nums;font-size:10px}
      #UIL input[type=range]{grid-column:1/3;width:100%;height:2px;-webkit-appearance:none;appearance:none;
        background:rgba(150,200,160,.22);border-radius:2px;outline:none;margin:3px 0 5px}
      #UIL input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;
        background:#9fd4a8;cursor:pointer;box-shadow:0 0 0 3px rgba(159,212,168,.16)}
      #UIL input[type=range]::-moz-range-thumb{width:11px;height:11px;border:0;border-radius:50%;background:#9fd4a8;cursor:pointer}
      #UIL input[type=color]{grid-column:1/3;width:100%;height:22px;border:1px solid rgba(150,200,160,.2);
        border-radius:2px;background:none;cursor:pointer;padding:1px}
      #UIL .swatchrow{display:grid;grid-template-columns:1fr;gap:2px;padding:3px 0 7px}
      #UIL .toast{position:fixed;bottom:18px;right:340px;background:rgba(20,34,24,.95);border:1px solid rgba(150,200,160,.3);
        color:#c9e8ce;padding:9px 14px;border-radius:3px;opacity:0;transition:.3s;pointer-events:none;font-size:10px;letter-spacing:.1em}
      #UIL .toast.on{opacity:1}
    `);

    const el = document.createElement('div');
    el.id = 'UIL';
    el.innerHTML = `<header><b>Verdant · tune</b>
      <button data-a="copy">copy</button>
      <button data-a="save">.json</button>
      <button data-a="reset">reset</button></header>`;
    document.body.appendChild(el);
    this.el = el;

    const defaults = JSON.parse(JSON.stringify(Tune.values));

    for (const group in Tune.groups) {
      const g = document.createElement('div');
      g.className = 'grp';
      const h = document.createElement('h4');
      h.innerHTML = `<span>${group}</span><span>—</span>`;
      const rows = document.createElement('div');
      rows.className = 'rows';
      h.onclick = () => {
        g.classList.toggle('closed');
        h.lastElementChild.textContent = g.classList.contains('closed') ? '+' : '—';
      };
      g.appendChild(h);
      g.appendChild(rows);

      for (const item of Tune.groups[group]) rows.appendChild(this._row(item));
      el.appendChild(g);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    el.appendChild(toast);
    const flash = (m) => { toast.textContent = m; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 1400); };

    el.querySelector('[data-a="copy"]').onclick = async () => {
      try { await navigator.clipboard.writeText(Tune.serialise()); flash('tune.json copied'); }
      catch (e) { flash('clipboard blocked'); }
    };
    el.querySelector('[data-a="save"]').onclick = () => {
      const blob = new Blob([Tune.serialise()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tune.json';
      a.click();
      flash('downloaded');
    };
    el.querySelector('[data-a="reset"]').onclick = () => {
      for (const k in defaults) Tune.set(k, Array.isArray(defaults[k]) ? defaults[k].slice() : defaults[k]);
      el.querySelectorAll('[data-key]').forEach((n) => n.dispatchEvent(new CustomEvent('sync')));
      flash('defaults restored');
    };

    // The panel steals a chunk of the viewport, so give the film the rest.
    document.getElementById('Scroll').style.right = '322px';
  },

  _row(item) {
    const wrap = document.createElement('div');
    const v = Tune.get(item.key);

    if (item.type === 'color') {
      wrap.className = 'swatchrow';
      const lab = document.createElement('div');
      lab.className = 'row';
      lab.innerHTML = `<label title="${item.key}">${item.key}</label><span class="val"></span>`;
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.dataset.key = item.key;
      const toHex = (c) => '#' + c.map((x) => Math.round(clamp(Math.pow(clamp(x, 0, 1), 1 / 2.2), 0, 1) * 255).toString(16).padStart(2, '0')).join('');
      const fromHex = (h) => [1, 3, 5].map((i) => Math.pow(parseInt(h.substr(i, 2), 16) / 255, 2.2));
      inp.value = toHex(v);
      inp.oninput = () => Tune.set(item.key, fromHex(inp.value));
      inp.addEventListener('sync', () => { inp.value = toHex(Tune.get(item.key)); });
      wrap.appendChild(lab);
      wrap.appendChild(inp);
      return wrap;
    }

    if (item.type === 'bool') {
      wrap.className = 'row';
      wrap.innerHTML = `<label title="${item.key}">${item.key}</label>`;
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = !!v;
      inp.dataset.key = item.key;
      inp.style.cssText = 'justify-self:end;accent-color:#9fd4a8';
      inp.onchange = () => Tune.set(item.key, inp.checked);
      inp.addEventListener('sync', () => { inp.checked = !!Tune.get(item.key); });
      wrap.appendChild(inp);
      return wrap;
    }

    wrap.className = 'row';
    const label = document.createElement('label');
    label.textContent = item.key;
    label.title = item.key;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = (+v).toFixed(item.step < 0.01 ? 3 : 2);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = item.min; inp.max = item.max; inp.step = item.step;
    inp.value = v;
    inp.dataset.key = item.key;
    inp.oninput = () => {
      const n = parseFloat(inp.value);
      Tune.set(item.key, n);
      val.textContent = n.toFixed(item.step < 0.01 ? 3 : 2);
    };
    inp.addEventListener('sync', () => {
      inp.value = Tune.get(item.key);
      val.textContent = (+Tune.get(item.key)).toFixed(item.step < 0.01 ? 3 : 2);
    });
    wrap.appendChild(label);
    wrap.appendChild(val);
    wrap.appendChild(inp);
    return wrap;
  },
};

/* ---- 08-main.js ------------------------------------------------ */
/* ============================================================================
   VERDANT — the film
   Chapters, camera path, per-chapter looks, typography and the frame loop.
   ========================================================================== */

const ROUTES = [
  { name: 'seed',   path: '/',        title: 'Verdant · Seed',   start: 0.000, end: 0.150 },
  { name: 'roots',  path: '/roots',   title: 'Verdant · Roots',  start: 0.150, end: 0.360 },
  { name: 'growth', path: '/growth',  title: 'Verdant · Growth', start: 0.360, end: 0.580 },
  { name: 'bloom',  path: '/bloom',   title: 'Verdant · Bloom',  start: 0.580, end: 0.800 },
  { name: 'canopy', path: '/canopy',  title: 'Verdant · Canopy', start: 0.800, end: 1.001 },
];

const COPY = {
  seed:   ['Everything that follows is already folded into this. Scroll to begin the season.'],
  roots:  ['Before a single leaf, four metres of root. Growth is mostly the part nobody photographs.'],
  growth: ['The trunk commits. Every branch after it is a smaller argument with gravity and light.'],
  bloom:  ['Colour is expensive. A tree spends it for a fortnight, and only to be noticed.'],
  canopy: ['Full canopy, low sun. The season closes the way it opened — with something small, falling, carrying the whole plan.'],
};

/* ------------------------------------------------------------ camera ----- */
// Nine stations. The film is a single continuous move; chapters are just where
// the camera slows down enough for you to read something.
const CAM_KEYS = [
  { t: 0.00, pos: [ 0.00,  0.30,  1.40], look: [ 0.00,  0.13,  0.00], fov: 34 },
  { t: 0.12, pos: [ 0.42,  0.26,  0.92], look: [ 0.02,  0.12,  0.00], fov: 30 },
  { t: 0.24, pos: [ 1.90, -1.30,  2.70], look: [ 0.00, -1.60,  0.00], fov: 46 },
  { t: 0.34, pos: [ 3.10, -0.55,  4.10], look: [ 0.00, -0.55,  0.00], fov: 46 },
  { t: 0.46, pos: [ 3.20,  0.75,  5.40], look: [ 0.10,  3.10,  0.00], fov: 50 },
  { t: 0.58, pos: [ 8.40,  2.40, 11.80], look: [ 0.00,  5.60,  0.00], fov: 42 },
  { t: 0.70, pos: [-12.4,  6.40, 13.80], look: [ 0.00,  7.20,  0.00], fov: 37 },
  { t: 0.82, pos: [-5.40,  3.10,  7.60], look: [-0.60,  7.60,  0.00], fov: 44 },
  { t: 0.92, pos: [ 1.40,  1.35,  5.20], look: [ 0.15,  9.20,  0.00], fov: 54 },
  { t: 1.00, pos: [ 0.10,  1.15,  6.40], look: [ 0.00,  8.60,  0.00], fov: 50 },
];

/* -------------------------------------------------------------- looks ---- */
// One grade per chapter. These are the numbers a colourist would touch, and
// they are the numbers the ?uil panel exposes.
const LOOKS = {
  seed: {
    exposure: 1.00, bloomAmount: 0.50, bloomThreshold: 0.78, rayAmount: 0.16,
    saturation: 0.72, contrast: 1.14, vignette: 0.88, grain: 0.052, aberration: 0.55,
    skyTop: [0.012, 0.020, 0.030], skyHorizon: [0.055, 0.062, 0.058],
    fogColor: [0.030, 0.038, 0.040], fogDensity: 0.055, sunColor: [0.85, 0.72, 0.48],
    sunDir: [0.30, 0.16, -0.94], cloud: 0.22, stars: 0.85,
    shadowTint: [0.86, 0.94, 1.10], highlightTint: [1.06, 1.00, 0.92],
  },
  roots: {
    exposure: 1.14, bloomAmount: 0.38, bloomThreshold: 0.86, rayAmount: 0.05,
    saturation: 0.62, contrast: 1.18, vignette: 1.05, grain: 0.066, aberration: 0.70,
    skyTop: [0.014, 0.010, 0.007], skyHorizon: [0.040, 0.026, 0.016],
    fogColor: [0.052, 0.034, 0.022], fogDensity: 0.300, sunColor: [0.60, 0.40, 0.22],
    sunDir: [0.42, 0.20, -0.88], cloud: 0.0, stars: 0.0,
    shadowTint: [1.04, 0.92, 0.82], highlightTint: [1.10, 0.98, 0.84],
  },
  growth: {
    exposure: 1.04, bloomAmount: 0.40, bloomThreshold: 0.86, rayAmount: 0.26,
    saturation: 0.98, contrast: 1.06, vignette: 0.72, grain: 0.036, aberration: 0.40,
    skyTop: [0.115, 0.205, 0.330], skyHorizon: [0.400, 0.455, 0.400],
    fogColor: [0.300, 0.360, 0.330], fogDensity: 0.0190, sunColor: [1.00, 0.94, 0.76],
    sunDir: [0.36, 0.44, -0.82], cloud: 0.55, stars: 0.0,
    shadowTint: [0.90, 1.00, 1.06], highlightTint: [1.04, 1.02, 0.94],
  },
  bloom: {
    exposure: 1.07, bloomAmount: 0.50, bloomThreshold: 0.80, rayAmount: 0.32,
    saturation: 1.10, contrast: 1.02, vignette: 0.66, grain: 0.030, aberration: 0.45,
    skyTop: [0.170, 0.275, 0.400], skyHorizon: [0.545, 0.520, 0.435],
    fogColor: [0.400, 0.420, 0.380], fogDensity: 0.0175, sunColor: [1.00, 0.90, 0.70],
    sunDir: [-0.30, 0.40, -0.86], cloud: 0.62, stars: 0.0,
    shadowTint: [0.94, 1.00, 1.04], highlightTint: [1.06, 1.00, 0.90],
  },
  canopy: {
    exposure: 1.11, bloomAmount: 0.66, bloomThreshold: 0.70, rayAmount: 0.50,
    saturation: 1.06, contrast: 1.04, vignette: 0.80, grain: 0.040, aberration: 0.60,
    skyTop: [0.210, 0.235, 0.310], skyHorizon: [0.800, 0.500, 0.250],
    fogColor: [0.470, 0.340, 0.220], fogDensity: 0.0290, sunColor: [1.00, 0.76, 0.42],
    sunDir: [0.10, 0.28, -0.95], cloud: 0.78, stars: 0.10,
    shadowTint: [0.92, 0.96, 1.10], highlightTint: [1.10, 0.98, 0.82],
  },
};
const LOOK_T = { seed: 0.02, roots: 0.25, growth: 0.47, bloom: 0.69, canopy: 0.95 };
const LOOK_ORDER = ['seed', 'roots', 'growth', 'bloom', 'canopy'];

/* --------------------------------------------------------------- tune ---- */

function defineTune() {
  Tune.def('world', 'growthStart', 0.11, 0, 0.5);
  Tune.def('world', 'growthEnd', 0.70, 0.3, 1);
  Tune.def('world', 'bloomStart', 0.50, 0.2, 0.9);
  Tune.def('world', 'bloomEnd', 0.88, 0.4, 1);
  Tune.def('world', 'grassStart', 0.26, 0, 0.8);
  Tune.def('world', 'grassEnd', 0.60, 0.2, 1);
  Tune.def('world', 'leafFallAt', 0.90, 0.5, 1);
  Tune.def('world', 'autumnAmount', 0.30, 0, 1);
  Tune.def('world', 'groundLift', 1.00, 0, 2);

  Tune.def('foliage', 'leafYoung', [0.42, 0.60, 0.18]);
  Tune.def('foliage', 'leafMature', [0.13, 0.30, 0.10]);
  Tune.def('foliage', 'leafAutumn', [0.78, 0.38, 0.10]);
  Tune.def('foliage', 'translucency', 0.90, 0, 2);
  Tune.def('foliage', 'grassBase', [0.10, 0.17, 0.07]);
  Tune.def('foliage', 'grassTip', [0.46, 0.58, 0.20]);
  Tune.def('foliage', 'barkDark', [0.055, 0.048, 0.040]);
  Tune.def('foliage', 'barkLight', [0.32, 0.27, 0.21]);
  Tune.def('foliage', 'barkRough', 0.55, 0, 1);

  Tune.def('ground', 'soilDark', [0.045, 0.036, 0.028]);
  Tune.def('ground', 'soilLight', [0.20, 0.16, 0.11]);
  Tune.def('ground', 'mossColor', [0.14, 0.22, 0.09]);
  Tune.def('ground', 'mossAmount', 0.75, 0, 1);

  Tune.def('petals', 'petalA', [1.00, 0.86, 0.87]);
  Tune.def('petals', 'petalB', [1.00, 0.95, 0.86]);
  Tune.def('petals', 'petalCore', [1.00, 0.82, 0.34]);

  Tune.def('wind', 'windStrength', 0.055, 0, 0.3);
  Tune.def('wind', 'windSpeed', 0.85, 0, 3);

  Tune.def('particles', 'curlScale', 0.115, 0.01, 0.5);
  Tune.def('particles', 'curlStrength', 0.60, 0, 3);
  Tune.def('particles', 'rise', 0.13, -0.5, 1);
  Tune.def('particles', 'spread', 15.0, 3, 40);
  Tune.def('particles', 'lifeSpeed', 0.085, 0.01, 0.5);
  Tune.def('particles', 'size', 0.019, 0.002, 0.16);
  Tune.def('particles', 'opacity', 0.42, 0, 2);
  Tune.def('particles', 'dustA', [0.62, 0.66, 0.60]);
  Tune.def('particles', 'dustB', [0.90, 0.84, 0.66]);
  Tune.def('particles', 'pollenA', [1.00, 0.88, 0.44]);
  Tune.def('particles', 'pollenB', [0.86, 0.94, 0.52]);
  Tune.def('particles', 'petalPA', [0.86, 0.52, 0.54]);
  Tune.def('particles', 'petalPB', [0.92, 0.74, 0.58]);
  Tune.def('particles', 'flyA', [0.98, 0.78, 0.28]);
  Tune.def('particles', 'flyB', [0.72, 1.00, 0.46]);

  Tune.def('seed', 'seedScale', 0.052, 0.01, 0.3);
  Tune.def('seed', 'seedHeight', 0.070, 0, 0.5);
  Tune.def('seed', 'seedOpenAt', 0.045, 0, 0.3);
  Tune.def('seed', 'seedGoneAt', 0.135, 0.05, 0.4);
  Tune.def('seed', 'seedGlow', 1.60, 0, 6);
  Tune.def('seed', 'seedCore', [1.00, 0.74, 0.34]);

  Tune.def('camera', 'parallax', 0.42, 0, 2);
  Tune.def('camera', 'handheld', 0.55, 0, 3);
  Tune.def('camera', 'dolly', 1.00, 0, 2);

  Tune.def('post', 'cloudSharp', 0.68, 0.42, 0.95);
  Tune.def('post', 'bloomRadius', 1.05, 0.2, 3);
  Tune.def('post', 'rayDensity', 0.72, 0.1, 1.6);
  Tune.def('post', 'rayDecay', 0.955, 0.8, 1);
  Tune.def('post', 'rayWeight', 0.55, 0, 2);
  Tune.def('post', 'vignetteSoft', 0.42, 0, 1);

  Tune.def('type', 'typeReveal', 0.42, 0.05, 1);
  Tune.def('type', 'typeStagger', 0.62, 0, 0.95);
  Tune.def('type', 'typeDrift', 0.26, 0, 1.5);
  Tune.def('type', 'typeColor', [0.97, 0.98, 0.94]);
  Tune.def('type', 'typeHalo', 0.55, 0, 1.5);
  Tune.def('type', 'typeAccent', [0.80, 0.90, 0.62]);

  // Every chapter's grade becomes its own group of sliders.
  for (const name of LOOK_ORDER) {
    const L = LOOKS[name];
    for (const k in L) {
      const v = L[k];
      const key = `look.${name}.${k}`;
      if (Array.isArray(v)) Tune.def('look · ' + name, key, v.slice());
      else {
        const range = /density|grain|aberration/.test(k) ? [0, 2]
                    : /exposure|contrast|saturation/.test(k) ? [0, 2.5]
                    : /sunDir/.test(k) ? [-1, 1] : [0, 2];
        Tune.def('look · ' + name, key, v, range[0], range[1]);
      }
    }
  }
}

/* --------------------------------------------------------------- app ----- */

const App = {
  async boot() {
    // The bundle is async — it can win the race against the body.
    if (document.readyState === 'loading') {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    Device.detect();
    const cv = document.createElement('canvas');
    document.getElementById('Stage').appendChild(cv);
    GL.init(cv);

    const bar = document.querySelector('#BootBar i');
    const t0 = performance.now();
    const progress = (p, label) => {
      if (bar) bar.style.transform = `scaleX(${p})`;
      if (FLAG('log')) console.log(`[boot ${(performance.now() - t0).toFixed(0)}ms] ${label}`);
    };
    progress(0.08, 'gl ready');

    defineTune();
    await Promise.all([
      Shaders.load('assets/shaders/compiled.vs'),
      Tune.load('assets/data/tune.json'),
    ]);
    progress(0.3, 'assets loaded');

    this.q = Device.quality;
    this.buildScene();
    progress(0.62, 'scene built');
    this.buildType();
    progress(0.86, 'type built');

    SEO.build(ROUTES, COPY);
    Scroll.init(ROUTES);
    Input.init();
    UIL.init();
    Profiler.init();

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Warm every program and run one frame off-screen so the reveal is clean.
    this.frame(0.016);
    progress(1, 'first frame');
    await new Promise((r) => setTimeout(r, 260));
    const boot = document.getElementById('Boot');
    boot.classList.add('out');
    document.getElementById('Src')?.classList.add('in');
    setTimeout(() => boot.remove(), 1000);

    this.fade = 0;
    Render.add((dt) => this.frame(dt));
    Render.start();
  },

  buildScene() {
    const q = this.q;
    Tree.generate(20260810);

    this.geoSeed     = Primitives.sphere(24);
    this.geoGround   = Primitives.plane(34, 128);
    this.geoBranch   = Tree.buildBranchGeo(q.branchSides);
    this.geoLeaf     = Tree.buildLeafGeo(q.leafDensity);
    this.geoFlower   = Flowers.build(4242, Math.round(320 * (0.4 + q.leafDensity * 0.6)), Tree.blossomSlots);
    this.geoGrass    = Meadow.build(777, q.grass);

    this.pSeed   = Shaders.get('seed');
    this.pSky    = Shaders.get('sky');
    this.pGround = Shaders.get('ground');
    this.pGrass  = Shaders.get('grass');
    this.pBranch = Shaders.get('branch');
    this.pLeaf   = Shaders.get('leaf');
    this.pFlower = Shaders.get('flower');
    this.pText   = Shaders.get('text');

    this.particles = new Particles(q.particles);

    this.view = M4.create();
    this.proj = M4.create();
    this.viewProj = M4.create();
    this.invViewProj = M4.create();
    this.camPos = [0, 0, 3];
    this.camLook = [0, 0, 0];
    this.look = {};
    for (const k in LOOKS.seed) this.look[k] = Array.isArray(LOOKS.seed[k]) ? LOOKS.seed[k].slice() : LOOKS.seed[k];
  },

  buildType() {
    const T = (o) => new GLText(o);
    // Sizes are fractions of viewport height; anchors are fractions of the
    // visible frame. The layout therefore holds at any window shape.
    const LABEL = { size: 0.0135, tracking: 0.34, mono: true, uppercase: true, stagger: 0.45, drift: 0.5 };
    const HEAD  = { lineHeight: 1.16, stagger: 0.72, drift: 0.85 };
    const BODY  = { size: 0.0210, tracking: 0.015, italic: true, lineHeight: 1.72, maxWidth: 26, stagger: 0.4, drift: 0.45 };

    this.type = {
      seed: [
        T({ ...LABEL, text: 'a season in one scroll', size: 0.0125, tracking: 0.52,
            align: 'center', anchor: [0, 0.30], dist: 2.6, parallax: 0.4 }),
        T({ text: 'Verdant', size: 0.155, tracking: 0.045, align: 'center',
            anchor: [0, 0.20], dist: 2.6, stagger: 0.80, drift: 0.30, parallax: 0.7 }),
        T({ ...BODY, text: 'Everything that follows is already folded into this.',
            size: 0.0185, align: 'center', maxWidth: 34, anchor: [0, -0.02], dist: 2.6, parallax: 0.5 }),
        T({ ...LABEL, text: 'scroll', size: 0.0105, tracking: 0.66,
            align: 'center', anchor: [0, -0.74], dist: 2.6, parallax: 0.2, stagger: 0.2, drift: 0.2 }),
      ],
      roots: [
        T({ ...LABEL, text: '01 · roots', anchor: [-0.74, 0.44], dist: 3.0 }),
        T({ ...HEAD, text: 'Before a single leaf,\nfour metres of root.',
            size: 0.062, anchor: [-0.74, 0.36], dist: 3.0 }),
        T({ ...BODY, text: 'Growth is mostly the part nobody photographs.',
            anchor: [-0.74, 0.06], dist: 3.0 }),
      ],
      growth: [
        T({ ...LABEL, text: '02 · growth', anchor: [-0.76, 0.50], dist: 3.0 }),
        T({ ...HEAD, text: 'The trunk\ncommits.', size: 0.086, anchor: [-0.76, 0.42], dist: 3.0 }),
        T({ ...BODY, text: 'Every branch after it is a smaller argument with gravity and light.',
            anchor: [-0.76, 0.06], dist: 3.0 }),
      ],
      bloom: [
        T({ ...LABEL, text: '03 · bloom', align: 'right', anchor: [0.76, 0.50], dist: 3.0 }),
        T({ ...HEAD, text: 'Colour is\nexpensive.', size: 0.086, align: 'right',
            anchor: [0.76, 0.42], dist: 3.0 }),
        T({ ...BODY, text: 'A tree spends it for a fortnight, and only to be noticed.',
            align: 'right', anchor: [0.76, 0.06], dist: 3.0 }),
      ],
      canopy: [
        T({ ...LABEL, text: '04 · canopy', align: 'center', anchor: [0, 0.44], dist: 3.0 }),
        T({ ...HEAD, text: 'The season closes\nthe way it opened.', size: 0.058,
            align: 'center', anchor: [0, 0.36], dist: 3.0 }),
        T({ ...LABEL, text: 'something small · falling · carrying the whole plan',
            size: 0.0115, tracking: 0.30, align: 'center', anchor: [0, -0.44], dist: 3.0 }),
        T({ ...LABEL, text: 'no photographs · no 3D models · no libraries · no DOM',
            size: 0.0100, tracking: 0.26, align: 'center', anchor: [0, -0.54], dist: 3.0,
            stagger: 0.3, drift: 0.25 }),
      ],
    };

    const info = GLText.flush();
    if (FLAG('log')) console.log(`[type] ${info.blocks} blocks across ${info.atlases} atlases`);

    const accent = Tune.get('typeAccent');
    const plain = Tune.get('typeColor');
    for (const k in this.type) {
      this.type[k].forEach((t, i) => { t.color = i === 0 ? accent : plain; });
      if (k === 'canopy') this.type[k][3].color = accent;
    }
  },

  resize() {
    const dpr = Device.dpr * (Profiler.scale || 1);
    const cssW = window.innerWidth - (UIL.open ? 322 : 0);
    const cssH = window.innerHeight;
    this.w = Math.max(2, Math.round(cssW * dpr));
    this.h = Math.max(2, Math.round(cssH * dpr));
    const cv = GL.canvas;
    cv.width = this.w; cv.height = this.h;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    if (!this.post) this.post = new Post(this.w, this.h);
    else this.post.resize(this.w, this.h);
    Scroll.resize();
  },

  // Piecewise camera interpolation with eased segments — never a linear ramp.
  sampleCamera(t) {
    let i = 0;
    while (i < CAM_KEYS.length - 2 && t > CAM_KEYS[i + 1].t) i++;
    const a = CAM_KEYS[i], b = CAM_KEYS[i + 1];
    const k = easeInOutCubic(clamp((t - a.t) / (b.t - a.t), 0, 1));
    lerp3(this.camPos, a.pos, b.pos, k);
    lerp3(this.camLook, a.look, b.look, k);
    this.fov = lerp(a.fov, b.fov, k);
  },

  sampleLook(t) {
    let i = 0;
    while (i < LOOK_ORDER.length - 2 && t > LOOK_T[LOOK_ORDER[i + 1]]) i++;
    const an = LOOK_ORDER[i], bn = LOOK_ORDER[i + 1];
    const ta = LOOK_T[an], tb = LOOK_T[bn];
    const k = smooth(0, 1, clamp((t - ta) / (tb - ta), 0, 1));
    for (const key in LOOKS.seed) {
      const av = Tune.get(`look.${an}.${key}`);
      const bv = Tune.get(`look.${bn}.${key}`);
      if (Array.isArray(av)) {
        if (!Array.isArray(this.look[key])) this.look[key] = [0, 0, 0];
        lerp3(this.look[key], av, bv, k);
      } else this.look[key] = lerp(av, bv, k);
    }
  },

  frame(dt) {
    Shaders.drawCalls = 0;
    if (Profiler.govern(dt)) this.resize();

    Input.update();
    const s = Scroll.update();
    this.sampleCamera(s);
    this.sampleLook(s);

    const T = (k) => Tune.get(k);

    // ---- drivers -------------------------------------------------------
    const growth = smooth(T('growthStart'), T('growthEnd'), s);
    const bloomD = smooth(T('bloomStart'), T('bloomEnd'), s);
    const grassD = smooth(T('grassStart'), T('grassEnd'), s);
    const leafFall = smooth(T('leafFallAt'), 1.0, s) * 0.55;
    const autumn = smooth(0.84, 1.0, s) * T('autumnAmount');

    // ---- camera --------------------------------------------------------
    const px = Input.x * T('parallax'), py = -Input.y * T('parallax') * 0.6;
    const hh = T('handheld') * 0.055;
    const wob = [
      Math.sin(Render.TIME * 0.47) * hh + Math.sin(Render.TIME * 1.13) * hh * 0.4,
      Math.sin(Render.TIME * 0.61 + 2.0) * hh * 0.8 + Math.sin(Render.TIME * 1.7) * hh * 0.25,
      Math.sin(Render.TIME * 0.39 + 4.0) * hh * 0.5,
    ];
    const eye = [
      this.camPos[0] + px * 0.55 + wob[0],
      this.camPos[1] + py * 0.4 + wob[1],
      this.camPos[2] * T('dolly') + wob[2],
    ];
    const look = [
      this.camLook[0] + px * 0.14,
      this.camLook[1] + py * 0.10 + wob[1] * 0.3,
      this.camLook[2],
    ];

    const aspect = this.w / this.h;
    M4.perspective(this.proj, (this.fov * Math.PI) / 180, aspect, 0.04, 220);
    M4.lookAt(this.view, eye, look, [0, 1, 0]);
    M4.multiply(this.viewProj, this.proj, this.view);
    M4.invert(this.invViewProj, this.viewProj);

    const camRight = [this.view[0], this.view[4], this.view[8]];
    const camUp = [this.view[1], this.view[5], this.view[9]];
    const camFwd = [-this.view[2], -this.view[6], -this.view[10]];

    const frame = {
      pos: eye, right: camRight, up: camUp, forward: camFwd,
      tanHalfFov: Math.tan((this.fov * Math.PI) / 360),
      aspect,
      parallaxX: -Input.x, parallaxY: Input.y,
    };

    // ---- shared uniform block -----------------------------------------
    const sunDir = this.look.sunDir;
    const atmos = {
      uTime: Render.TIME,
      uSunDir: sunDir,
      uSunColor: this.look.sunColor,
      uSkyTop: this.look.skyTop,
      uSkyHorizon: this.look.skyHorizon,
      uFogColor: this.look.fogColor,
      uFogDensity: this.look.fogDensity,
      uFogHeight: 1.2,
      uViewProj: this.viewProj,
      uCameraPos: eye,
      uWindStrength: T('windStrength'),
      uWindSpeed: T('windSpeed'),
    };

    // ---- particle simulation ------------------------------------------
    const modeF = clamp((s - 0.06) / 0.86, 0, 1) * 3;
    const mode = Math.round(modeF);
    const modeDip = smooth(0.5, 0.28, Math.abs(modeF - mode));
    const pcols = [
      [T('dustA'), T('dustB')], [T('pollenA'), T('pollenB')],
      [T('petalPA'), T('petalPB')], [T('flyA'), T('flyB')],
    ][mode];

    this.particles.update(dt, {
      uCurlScale: T('curlScale'),
      uCurlStrength: T('curlStrength') * (mode === 3 ? 0.35 : 1),
      uRise: T('rise') * (mode === 2 ? -1.6 : 1),
      uSpread: T('spread') * (mode === 3 ? 0.55 : 1),
      uOrigin: [0, mode === 0 ? 0.8 : mode === 3 ? 3.2 : 4.0, 0],
      uLifeSpeed: T('lifeSpeed'),
      uMode: mode,
    });

    // ---- draw the world into the HDR target ----------------------------
    const G = gl;
    this.post.scene.bind(true);
    G.enable(G.DEPTH_TEST);
    G.depthMask(true);
    G.disable(G.BLEND);
    G.disable(G.CULL_FACE);

    // sky (no depth write — everything is in front of it)
    G.depthMask(false);
    this.pSky.use().setAll(atmos)
      .set('uInvViewProj', this.invViewProj)
      .set('uStarFade', this.look.stars)
      .set('uCloud', this.look.cloud)
      .set('uCloudSharp', Tune.get('cloudSharp'));
    fullscreen();
    G.depthMask(true);

    // ground
    this.pGround.use().setAll(atmos)
      .set('uGroundLift', T('groundLift'))
      .set('uSoilDark', T('soilDark'))
      .set('uSoilLight', T('soilLight'))
      .set('uMossColor', T('mossColor'))
      .set('uMossAmount', T('mossAmount') * grassD);
    this.geoGround.draw();

    // grass
    if (this.geoGrass) {
      this.pGrass.use().setAll(atmos)
        .set('uGrowth', grassD)
        .set('uGrassBase', T('grassBase'))
        .set('uGrassTip', T('grassTip'));
      this.geoGrass.draw();
    }

    // the seed — cracks open, then hands over to the trunk
    const seedOpen = smooth(T('seedOpenAt'), T('seedGoneAt'), s);
    const seedGone = smooth(T('seedGoneAt'), T('seedGoneAt') + 0.075, s);
    if (seedGone < 0.999) {
      this.pSeed.use().setAll(atmos)
        .set('uSeedPos', [0, T('seedHeight'), 0])
        .set('uSeedScale', T('seedScale') * (1 - seedGone) * (1 + seedOpen * 0.12))
        .set('uSeedOpen', seedOpen)
        .set('uSeedGlow', T('seedGlow') * (1 - seedGone * 0.4))
        .set('uSeedCore', T('seedCore'));
      this.geoSeed.draw();
    }

    // branches
    this.pBranch.use().setAll(atmos)
      .set('uGrowth', growth)
      .set('uBarkDark', T('barkDark'))
      .set('uBarkLight', T('barkLight'))
      .set('uBarkRough', T('barkRough'));
    this.geoBranch.draw();

    // leaves
    this.pLeaf.use().setAll(atmos)
      .set('uGrowth', growth)
      .set('uLeafFall', leafFall)
      .set('uLeafYoung', T('leafYoung'))
      .set('uLeafMature', T('leafMature'))
      .set('uLeafAutumn', T('leafAutumn'))
      .set('uAutumn', autumn)
      .set('uTranslucency', T('translucency'));
    this.geoLeaf.draw();

    // flowers
    this.pFlower.use().setAll(atmos)
      .set('uBloom', bloomD)
      .set('uPetalA', T('petalA'))
      .set('uPetalB', T('petalB'))
      .set('uPetalCore', T('petalCore'));
    this.geoFlower.draw();

    // particles — premultiplied over, depth tested but not written
    G.enable(G.BLEND);
    G.blendFunc(G.ONE, G.ONE_MINUS_SRC_ALPHA);
    G.depthMask(false);
    this.particles.draw({
      uViewProj: this.viewProj,
      uCameraPos: eye,
      uCameraRight: camRight,
      uCameraUp: camUp,
      uSize: T('size') * (mode === 2 ? 0.85 : mode === 3 ? 0.7 : 1),
      uMode: mode,
      uOpacity: T('opacity') * modeDip * (mode === 2 ? 0.62 : 1),
      uParticleColor: pcols[0],
      uParticleColorB: pcols[1],
      uFogDensity: this.look.fogDensity,
    });

    // ---- typography ----------------------------------------------------
    G.disable(G.DEPTH_TEST);
    // The opening title has no scroll to ride in on, so it gets a timed reveal.
    this.intro = Math.min(1, (this.intro || 0) + dt * 0.42);
    this.pText.use().set('uViewProj', this.viewProj).set('uTime', Render.TIME);
    for (const name in this.type) {
      const local = Scroll.local(name);
      let inT = smooth(0.03, T('typeReveal'), local);
      if (name === 'seed') inT = Math.max(inT, easeOutCubic(this.intro));
      const outT = 1 - smooth(0.66, 0.95, local);
      for (const block of this.type[name]) {
        block.halo = T('typeHalo');
        block.reveal = inT;
        block.opacity = outT;
        block.draw(this.pText, frame);
      }
    }
    G.enable(G.DEPTH_TEST);
    G.depthMask(true);
    G.disable(G.BLEND);

    // ---- post ----------------------------------------------------------
    this.fade = Math.min(1, (this.fade || 0) + dt * 1.1);
    const sunUv = this.projectSun(eye, sunDir);
    this.post.render(this.w, this.h, {
      exposure: this.look.exposure,
      bloomAmount: this.look.bloomAmount,
      bloomThreshold: this.look.bloomThreshold,
      bloomRadius: T('bloomRadius'),
      rayAmount: this.look.rayAmount,
      rayDensity: T('rayDensity'),
      rayDecay: T('rayDecay'),
      rayWeight: T('rayWeight'),
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      shadowTint: this.look.shadowTint,
      highlightTint: this.look.highlightTint,
      saturation: this.look.saturation,
      contrast: this.look.contrast,
      vignette: this.look.vignette,
      vignetteSoft: T('vignetteSoft'),
      grain: this.look.grain,
      aberration: this.look.aberration,
      fade: easeOutCubic(this.fade),
    }, sunUv);

    Profiler.frame({
      draws: Shaders.drawCalls, scroll: s, route: Scroll.route,
      growth, bloom: bloomD, particles: this.particles.count,
    });
  },

  projectSun(eye, dir) {
    const p = [eye[0] + dir[0] * 400, eye[1] + dir[1] * 400, eye[2] + dir[2] * 400, 1];
    const m = this.viewProj;
    const x = m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12];
    const y = m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13];
    const w = m[3]*p[0] + m[7]*p[1] + m[11]*p[2] + m[15];
    if (w <= 0) return [-9, -9];
    return [(x / w) * 0.5 + 0.5, (y / w) * 0.5 + 0.5];
  },
};

// Debug surface. Same idea as shipping the tuning editor: the tools stay in.
window.VERDANT = { App, Tune, Shaders, Tree, Device, Render, Scroll, Input, UIL, GL };

App.boot().catch((e) => {
  console.error('[verdant boot]', e);
  const b = document.getElementById('Boot');
  if (b) b.innerHTML = `<div style="max-width:34ch;text-align:center;line-height:1.9;letter-spacing:.1em;text-transform:none">Verdant failed to start.<br><span style="color:#7a8a7c;font-size:10px">${String(e.message || e)}</span></div>`;
});

})();
