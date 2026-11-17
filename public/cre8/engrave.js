/* Can't Wait to Cre8: live laser engraving mockup on the How It Works order form.
   Same idea as the garment mockup: product photo, the customer's text or logo burned into it, real inch sizes,
   drag to place, a PNG and the placement details sent with the quote. */
(function(){
  /* ===== Products. size: real item in inches [w, h]. area: engravable zone [left, top, w, h] in inches.
     photo: background-free product photo cropped tight to the item (falls back to a drawn surface).
     material: wood, slate, steel, acrylic, leather. shape: rect, round, tumbler (text wraps around the cup). ===== */
  var PRODUCTS = [
    { id: 'tumbler', name: '20 oz Tumbler', size: [3.34, 7.4], area: [.37, 1.3, 2.6, 4], material: 'steel', shape: 'tumbler', photo: '/cre8/engrave-tumbler.png?v=1' },
    { id: 'board', name: 'Cutting Board', size: [11, 8.07], area: [1.3, 1.2, 8.4, 5.6], material: 'wood', shape: 'rect', radius: .5, photo: '/cre8/engrave-board.png?v=1' },
    { id: 'slice', name: 'Wood Slice', size: [8.75, 9], area: [1.75, 2.1, 5.25, 4.8], material: 'wood', shape: 'round', photo: '/cre8/engrave-slice.png?v=1' },
    { id: 'coaster', name: 'Slate Coaster', size: [3.9, 4], area: [.6, .65, 2.7, 2.7], material: 'slate', shape: 'round', photo: '/cre8/engrave-coaster.png?v=1' },
    { id: 'journal', name: 'Leather Journal', size: [6, 8.4], area: [.85, 1.5, 4.5, 5.4], material: 'leather', shape: 'rect', radius: .25, photo: '/cre8/engrave-journal.png?v=1' },
    { id: 'sign', name: 'Acrylic Sign', size: [10.7, 12.1], area: [1.7, .85, 7.3, 8.4], material: 'acrylic', shape: 'rect', radius: .3, photo: '/cre8/engrave-sign.png?v=1' }
  ];
  var FONTS = [
    { name: 'Script', css: "'Great Vibes', cursive", family: 'Great Vibes', w: 400 },
    { name: 'Classic', css: "'Playfair Display', serif", family: 'Playfair Display', w: 700 },
    { name: 'Modern', css: "'Montserrat', sans-serif", family: 'Montserrat', w: 700 },
    { name: 'Bold', css: "'Bebas Neue', sans-serif", family: 'Bebas Neue', w: 400 },
    { name: 'Fun', css: "'Pacifico', cursive", family: 'Pacifico', w: 400 }
  ];
  var MAT = {
    wood:    { base: ['#e8c592', '#c9955f'], grain: '#8a5a2b', burn: '#3b200d', edge: 'rgba(255,238,210,.5)', blend: 'multiply', rough: 1.1, blur: .4 },
    leather: { base: ['#8f5835', '#6d3f22'], grain: '#4a2a14', burn: '#2b160a', edge: 'rgba(255,220,190,.3)', blend: 'multiply', rough: .8, blur: .45 },
    slate:   { base: ['#4d5157', '#33363b'], grain: '#22252a', burn: '#d7dadc', edge: 'rgba(0,0,0,.5)', blend: 'normal', rough: .7, blur: .35 },
    steel:   { base: ['#262626', '#0f0f0f'], grain: '#000', burn: '#dfe3e6', edge: 'rgba(0,0,0,.55)', blend: 'normal', rough: .3, blur: .2 },
    acrylic: { base: ['#eef6f8', '#dcebef'], grain: '#b9d3da', burn: '#ffffff', edge: 'rgba(30,70,90,.4)', blend: 'normal', rough: .5, blur: .55 }
  };
  var MIN_LETTER_IN = 0.12, W = 400, H = 440, NS = 'http://www.w3.org/2000/svg';

  var $ = function(id){ return document.getElementById(id); };
  var svg, state, images = [], view, drag = null, ready = false;

  function el(tag, a, parent){ var n = document.createElementNS(NS, tag); for(var k in a) n.setAttribute(k, a[k]); if(parent) parent.appendChild(n); return n; }
  function lines(){ return ['egL1', 'egL2', 'egL3'].map(function(id){ return ($(id).value || '').trim(); }).filter(Boolean); }
  function prod(){ return PRODUCTS[state.p]; }

  /* Wrap map for the tumbler: pixels near the sides squeeze in, like text on a cylinder seen straight on */
  var wrapUrl = null;
  function wrapMap(){
    if(wrapUrl) return wrapUrl;
    var n = 256, c = document.createElement('canvas'); c.width = n; c.height = 2; var x = c.getContext('2d'), d = x.createImageData(n, 2);
    for(var i = 0; i < n; i++){
      var u = (i + .5) / n * 2 - 1, src = Math.asin(Math.max(-1, Math.min(1, u * .97))) / (Math.PI / 2), dx = (src - u) / 2; // in units of the half width
      var v = Math.round(128 + dx * 255); for(var r = 0; r < 2; r++){ var k = (r * n + i) * 4; d.data[k] = v; d.data[k + 1] = 128; d.data[k + 2] = 128; d.data[k + 3] = 255; }
    }
    x.putImageData(d, 0, 0); return wrapUrl = c.toDataURL();
  }

  function drawProduct(p, d){
    var ppi = Math.min((W - 50) / p.size[0], (H - 60) / p.size[1]), w = p.size[0] * ppi, h = p.size[1] * ppi, ox = (W - w) / 2, oy = (H - h) / 2 - 6, m = MAT[p.material];
    view = { ppi: ppi, ox: ox, oy: oy, w: w, h: h, a: { x: ox + p.area[0] * ppi, y: oy + p.area[1] * ppi, w: p.area[2] * ppi, h: p.area[3] * ppi } };
    el('ellipse', { cx: W / 2, cy: oy + h + 10, rx: w * .45, ry: 8, fill: '#000', opacity: .16 }, svg);
    var mask = el('mask', { id: 'egShape', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H, style: 'mask-type:alpha' }, d);
    if(p.photo){
      var mi = el('image', { x: ox, y: oy, width: w, height: h, preserveAspectRatio: 'none' }, mask); mi.setAttribute('href', p.photo);
      var im = el('image', { x: ox, y: oy, width: w, height: h, preserveAspectRatio: 'none' }, svg); im.setAttribute('href', p.photo);
      return;
    }
    if(p.shape === 'round') el('circle', { cx: ox + w / 2, cy: oy + h / 2, r: w / 2, fill: '#000' }, mask);
    else el('rect', { x: ox, y: oy, width: w, height: h, rx: p.shape === 'tumbler' ? w * .14 : (p.radius || 0) * ppi, fill: '#000' }, mask);
    var g = el('linearGradient', { id: 'egBase', x1: 0, y1: 0, x2: p.shape === 'tumbler' ? 1 : 0, y2: p.shape === 'tumbler' ? 0 : 1 }, d);
    (p.shape === 'tumbler' ? [[0, m.base[1]], [.25, '#3a3a3a'], [.5, m.base[1]], [.8, '#2c2c2c'], [1, m.base[1]]] : [[0, m.base[0]], [1, m.base[1]]]).forEach(function(s){ el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
    var gf = el('filter', { id: 'egGrain', x: 0, y: 0, width: 1, height: 1 }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: p.material === 'wood' ? '0.006 0.22' : p.material === 'leather' ? '0.9' : '0.5', numOctaves: 3, seed: 7 }, gf);
    el('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ' + (p.material === 'wood' ? '.5' : '.2') + ' 0' }, gf);
    var body = el('g', { mask: 'url(#egShape)' }, svg);
    el('rect', { x: ox, y: oy, width: w, height: h, fill: 'url(#egBase)' }, body);
    el('rect', { x: ox, y: oy, width: w, height: h, fill: m.grain, filter: 'url(#egGrain)' }, body);
    if(p.shape === 'tumbler'){ el('rect', { x: ox, y: oy, width: w, height: h * .07, fill: '#bfc4c8' }, body); el('rect', { x: ox + w * .2, y: oy, width: w * .08, height: h, fill: 'rgba(255,255,255,.1)' }, body); }
  }

  /* The engraved design: optional logo on top, text under it, as one block that fits the engrave area */
  function drawDesign(p, d){
    var m = MAT[p.material], f = FONTS[state.f], a = view.a, L = lines(), img = state.img >= 0 ? images[state.img] : null, notes = [];
    if(!L.length && !img) L = ['Your Text Here'];
    var burn = el('filter', { id: 'egBurn', x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }, d);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '1.3', numOctaves: 1, seed: 4, result: 'r' }, burn);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'r', scale: m.rough, xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' }, burn);
    el('feGaussianBlur', { in: 'd', stdDeviation: m.blur }, burn);
    // turns any uploaded logo into a single burn color: dark parts burn, white or clear parts stay blank (flip with Invert)
    var lf = el('filter', { id: 'egLogo', 'color-interpolation-filters': 'sRGB' }, d), c = m.burn.match(/\w\w/g).map(function(h){ return (parseInt(h, 16) / 255).toFixed(3); });
    el('feColorMatrix', { type: 'matrix', values: '0 0 0 0 ' + c[0] + ' 0 0 0 0 ' + c[1] + ' 0 0 0 0 ' + c[2] + (state.invert ? ' .299 .587 .114 0 0' : ' -.299 -.587 -.114 1 0') }, lf);
    var wrapOn = p.shape === 'tumbler', outer = el('g', { mask: 'url(#egShape)' }, svg);
    if(wrapOn){
      var wf = el('filter', { id: 'egWrap', 'color-interpolation-filters': 'sRGB', filterUnits: 'userSpaceOnUse', x: a.x - 20, y: a.y - 20, width: a.w + 40, height: a.h + 40 }, d);
      var fi = el('feImage', { x: view.ox, y: a.y - 20, width: view.w, height: a.h + 40, preserveAspectRatio: 'none', result: 'map' }, wf); fi.setAttribute('href', wrapMap());
      el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: view.w, xChannelSelector: 'R', yChannelSelector: 'G' }, wf);
      outer = el('g', { filter: 'url(#egWrap)' }, outer);
    }
    var g = el('g', { 'class': 'eg-design' }, outer), inner = el('g', {}, g);
    function build(k){
      while(inner.firstChild) inner.removeChild(inner.firstChild);
      var y = 0, fs = a.h * .2 * k, lh = 1.12, logoH = 0;
      if(img){
        logoH = Math.min(a.h * (L.length ? .55 : .9), a.w * .9 * img.h / img.w) * k;
        var lw = logoH * img.w / img.h, x0 = state.align === 'start' ? 0 : state.align === 'end' ? -lw : -lw / 2;
        var im = el('image', { x: x0, y: 0, width: lw, height: logoH, filter: 'url(#egLogo)', preserveAspectRatio: 'xMidYMid meet' }, el('g', { filter: 'url(#egBurn)', style: 'mix-blend-mode:' + m.blend }, inner));
        im.setAttribute('href', img.url); y = logoH + (L.length ? fs * .35 : 0);
      }
      [[m.edge, .7], [m.burn, 0]].forEach(function(layer){
        if(!L.length) return;
        var t = el('text', { 'font-family': f.css, 'font-weight': f.w, 'font-size': fs, 'text-anchor': state.align, fill: layer[0], filter: 'url(#egBurn)', style: layer[1] ? '' : 'mix-blend-mode:' + m.blend }, inner);
        L.forEach(function(s, i){ var ts = el('tspan', { x: layer[1], dy: i ? fs * lh : 0 }, t); ts.textContent = s; });
        t.setAttribute('y', y + fs * .8 + layer[1]);
      });
      return { box: inner.getBBox(), fs: fs };
    }
    var k = state.size / 100 * 1.6, r = build(k);
    var fit = Math.min(1, a.w * .98 / Math.max(1, r.box.width), a.h * .98 / Math.max(1, r.box.height));
    if(fit < 1){ k *= fit; r = build(k); }
    var bb = r.box, room = { w: Math.max(0, a.w - bb.width), h: Math.max(0, a.h - bb.height) };
    state.ox = Math.max(-room.w / 2, Math.min(room.w / 2, state.ox)); state.oy = Math.max(-room.h / 2, Math.min(room.h / 2, state.oy));
    var tx = a.x + (a.w - bb.width) / 2 - bb.x + state.ox, ty = a.y + (a.h - bb.height) / 2 - bb.y + state.oy;
    inner.setAttribute('transform', 'translate(' + tx + ' ' + ty + ')');
    el('rect', { x: bb.x + tx, y: bb.y + ty, width: bb.width, height: bb.height, fill: 'transparent', 'class': 'eg-hit' }, g);
    if(L.length && r.fs * .7 / view.ppi < MIN_LETTER_IN) notes.push('Letters are under ' + MIN_LETTER_IN + ' in tall and may not engrave cleanly. Shorten the text, use fewer lines or pick a bigger item.');
    return { w: bb.width / view.ppi, h: bb.height / view.ppi, notes: notes };
  }

  function render(opts){
    opts = opts || {};
    var target = opts.svg || svg, keep = svg; svg = target;
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    var p = prod(), d = el('defs', {}, svg);
    if(opts.css){ var st = document.createElementNS(NS, 'style'); st.textContent = opts.css; d.appendChild(st); }
    drawProduct(p, d);
    var r = drawDesign(p, d), a = view.a;
    if(!opts.clean) el('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'none', stroke: MAT[p.material].blend === 'multiply' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.55)', 'stroke-dasharray': '5 5', 'stroke-width': 1.2, rx: 4, 'pointer-events': 'none' }, svg);
    svg = keep;
    if(opts.svg) return;
    var cx = state.ox / view.ppi, cy = state.oy / view.ppi;
    var px = Math.abs(cx) < .1 ? '' : Math.abs(cx).toFixed(2) + ' in ' + (cx > 0 ? 'right' : 'left'), py = Math.abs(cy) < .1 ? '' : Math.abs(cy).toFixed(2) + ' in ' + (cy > 0 ? 'down' : 'up');
    var pos = !px && !py ? 'centered' : [px, py].filter(Boolean).join(' and ') + ' from center';
    var size = r.w.toFixed(2) + ' x ' + r.h.toFixed(2) + ' in';
    $('egReadout').textContent = 'Engraving about ' + size + ' on a ' + p.size[0] + ' x ' + p.size[1] + ' in ' + p.name.toLowerCase() + ', ' + pos + '.';
    $('egWarn').textContent = r.notes.join(' '); $('egWarn').classList.toggle('hidden', !r.notes.length);
    var img = state.img >= 0 ? images[state.img] : null;
    $('eg_item').value = p.name;
    $('eg_text').value = lines().join(' / ');
    $('eg_font').value = lines().length ? FONTS[state.f].family : '';
    $('eg_design').value = [img ? 'Logo: ' + img.name + (state.invert ? ' (inverted)' : '') : '', size + ', ' + pos].filter(Boolean).join('. ');
  }

  function chips(box, items, isOn, onPick, styleOf){
    box.innerHTML = '';
    items.forEach(function(it, i){
      var b = document.createElement('button'); b.type = 'button'; b.textContent = it.name; if(isOn(i)) b.className = 'on';
      if(styleOf) b.setAttribute('style', styleOf(it));
      b.addEventListener('click', function(){ onPick(i); [].forEach.call(box.children, function(c, j){ c.className = isOn(j) ? 'on' : ''; }); render(); });
      box.appendChild(b);
    });
  }
  function imageOptions(){
    var s = $('egImage'); if(!s) return;
    s.innerHTML = '<option value="-1">No logo, text only</option>' + images.map(function(im, i){ return '<option value="' + i + '">' + im.name.replace(/[<>&"]/g, '') + '</option>'; }).join('');
    if(state.img >= images.length) state.img = -1;
    s.value = String(state.img);
    $('egImageWrap').classList.toggle('hidden', !images.length);
  }

  function init(){
    svg = $('egStage'); if(!svg) { ready = false; return; }
    if(!document.getElementById('egFonts')){ var l = document.createElement('link'); l.id = 'egFonts'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:wght@700&family=Montserrat:wght@700&family=Bebas+Neue&family=Pacifico&display=swap'; document.head.appendChild(l); }
    state = { p: 0, f: 1, align: 'middle', size: 70, ox: 0, oy: 0, img: images.length ? 0 : -1, invert: false };
    chips($('egProducts'), PRODUCTS, function(i){ return i === state.p; }, function(i){ state.p = i; state.ox = state.oy = 0; });
    chips($('egFontsPick'), FONTS, function(i){ return i === state.f; }, function(i){ state.f = i; }, function(f){ return 'font-family:' + f.css + ';font-weight:' + f.w + ';font-size:17px'; });
    var AL = [{ name: 'Left', v: 'start' }, { name: 'Center', v: 'middle' }, { name: 'Right', v: 'end' }];
    chips($('egAlign'), AL, function(i){ return AL[i].v === state.align; }, function(i){ state.align = AL[i].v; });
    ['egL1', 'egL2', 'egL3'].forEach(function(id){ $(id).addEventListener('input', function(){ render(); }); });
    $('egSize').addEventListener('input', function(){ state.size = +this.value; render(); });
    $('egImage').addEventListener('change', function(){ state.img = +this.value; render(); });
    $('egInvert').addEventListener('change', function(){ state.invert = this.checked; render(); });
    $('egCenter').addEventListener('click', function(){ state.ox = state.oy = 0; render(); });
    function pt(e){ var q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; return q.matrixTransform(svg.getScreenCTM().inverse()); }
    svg.addEventListener('pointerdown', function(e){ if(!e.target.closest('.eg-design')) return; var q = pt(e); drag = { x: q.x - state.ox, y: q.y - state.oy }; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
    svg.addEventListener('pointermove', function(e){ if(!drag) return; var q = pt(e); state.ox = q.x - drag.x; state.oy = q.y - drag.y; render(); });
    function end(){ drag = null; } svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    imageOptions(); ready = true; render();
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(ready) render(); });
    setTimeout(function(){ if(ready) render(); }, 1200);
  }

  function setImages(list){
    var picked = (list || []).filter(function(f){ return /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(f.type); }).slice(0, 10);
    return Promise.all(picked.map(function(f){ return new Promise(function(done){
      var rd = new FileReader(); rd.onload = function(){ var pr = new Image(); pr.onload = function(){ done({ name: f.name, url: rd.result, w: pr.naturalWidth || 500, h: pr.naturalHeight || 500 }); }; pr.onerror = function(){ done(null); }; pr.src = rd.result; };
      rd.onerror = function(){ done(null); }; rd.readAsDataURL(f); }); })).then(function(res){
      var had = images.length; images = res.filter(Boolean);
      if(!ready) return;
      if(!had && images.length) state.img = 0;
      imageOptions(); render();
    });
  }

  /* PNG for the quote: same picture at 2x, guide box removed, fonts embedded so it matches the screen */
  var fontCss = {};
  function fontEmbed(){
    if(!lines().length) return Promise.resolve('');
    var f = FONTS[state.f], url = 'https://fonts.googleapis.com/css2?family=' + f.family.replace(/ /g, '+') + (f.w !== 400 ? ':wght@' + f.w : '');
    if(fontCss[url] != null) return Promise.resolve(fontCss[url]);
    return fetch(url).then(function(r){ return r.text(); }).then(function(css){
      var m = (css.match(/url\((https:[^)]+)\)/g) || []).pop(); if(!m) return '';
      return fetch(m.slice(4, -1)).then(function(r){ return r.blob(); }).then(function(b){ return new Promise(function(ok){ var fr = new FileReader(); fr.onload = function(){ ok(fr.result); }; fr.readAsDataURL(b); }); })
        .then(function(data){ return fontCss[url] = "@font-face{font-family:'" + f.family + "';font-weight:" + f.w + ";src:url(" + data + ")}"; });
    }).catch(function(){ return fontCss[url] = ''; });
  }
  function photoData(){
    var p = prod(); if(!p.photo || /^data:/.test(p.photo)) return Promise.resolve();
    return fetch(p.photo).then(function(r){ return r.blob(); }).then(function(b){ return new Promise(function(ok){ var fr = new FileReader(); fr.onload = function(){ p.photo = fr.result; ok(); }; fr.readAsDataURL(b); }); }).catch(function(){});
  }
  function snapshot(){
    if(!ready) return Promise.resolve(null);
    return Promise.all([fontEmbed(), photoData()]).then(function(r){
      var s = document.createElementNS(NS, 'svg'); s.setAttribute('xmlns', NS); s.setAttribute('viewBox', '0 0 ' + W + ' ' + H); s.setAttribute('width', W * 2); s.setAttribute('height', H * 2);
      render({ svg: s, clean: true, css: r[0] }); render();
      var cap = el('text', { x: W / 2, y: H - 8, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 11, fill: '#555' }, s);
      cap.textContent = $('egReadout').textContent.replace(/^Engraving/, 'Engraving mockup:');
      return new Promise(function(done){
        var im = new Image();
        im.onload = function(){ try { var c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; var x = c.getContext('2d'); x.fillStyle = '#f4efe7'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0);
          c.toBlob(function(b){ done(b ? new File([b], 'engraving-mockup.png', { type: 'image/png' }) : null); }, 'image/png'); } catch(e){ done(null); } };
        im.onerror = function(){ done(null); };
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s));
      });
    });
  }

  // select an item by id (for example 'journal' when the customer picks Journals / Notebooks)
  function pick(id){
    var i = -1; PRODUCTS.forEach(function(p, k){ if(p.id === id) i = k; });
    if(i < 0 || !ready || state.p === i) return;
    var b = $('egProducts') && $('egProducts').children[i]; if(b) b.click();
  }
  window.Cre8Engrave = { init: init, setImages: setImages, snapshot: snapshot, products: PRODUCTS, pick: pick };
})();
