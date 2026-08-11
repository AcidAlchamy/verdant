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
