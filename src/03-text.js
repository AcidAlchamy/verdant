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
