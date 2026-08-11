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
