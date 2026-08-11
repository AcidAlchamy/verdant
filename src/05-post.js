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
