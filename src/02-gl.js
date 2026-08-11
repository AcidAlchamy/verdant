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
