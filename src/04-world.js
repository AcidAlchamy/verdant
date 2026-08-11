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
