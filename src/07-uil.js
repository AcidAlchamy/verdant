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
