/* Inline form validation shared by every Cre8 form: a message under each problem field,
   aria-invalid, a summary line, and focus on the first problem. */
function cre8FieldMsg(el){
  var named = { idea: 'Tell us what you want made.', qty: 'Add how many pieces you need.', quantity: 'Add how many pieces you need.', name: 'Add your name.', email: 'Add an email so we can send your mockup.', message: 'Add a short message.', goals: 'Tell us a little about what the site needs to do.', business: 'Add your business name.' };
  if(el.name === 'email' && !(el.form && el.form.id === 'orderForm')) named.email = 'Add an email so we can reply.';
  if(el.name === 'phone') named.phone = 'Add a phone number so we can text or call you.';
  if(el.validity.valueMissing) return el.type === 'checkbox' ? 'Please check this box to continue.' : (named[el.name] || 'This one is required.');
  if(el.validity.typeMismatch && el.type === 'email') return 'Enter an email like name@example.com.';
  if(el.validity.rangeUnderflow) return 'Pick a later date.';
  return el.validationMessage;
}
function cre8Mark(el){
  var key = (el.id || el.name) + '-err', box = el.closest('.field') || el.parentNode, err = document.getElementById(key);
  if(el.checkValidity()){ if(el.hasAttribute('aria-invalid')){ el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } if(err) err.remove(); return true; }
  el.setAttribute('aria-invalid', 'true');
  if(!err){ err = document.createElement('p'); err.className = 'field-err'; err.id = key; box.appendChild(err); el.setAttribute('aria-describedby', key); }
  err.textContent = cre8FieldMsg(el); return false;
}
function cre8Validate(form, summary){
  var bad = [];
  form.querySelectorAll('input,select,textarea').forEach(function(el){ if(el.willValidate && !cre8Mark(el)) bad.push(el); });
  if(summary){
    while(summary.firstChild) summary.removeChild(summary.firstChild);
    summary.classList.toggle('alert-err', !!bad.length); summary.classList.toggle('hidden', !bad.length);
    if(bad.length){
      summary.appendChild(document.createTextNode(bad.length === 1 ? 'One thing needs a fix before we can send this:' : bad.length + ' things need a fix before we can send this:'));
      var ul = document.createElement('ul');
      bad.forEach(function(el){
        var li = document.createElement('li'), a = document.createElement('a'); a.href = '#' + (el.id || ''); a.textContent = cre8FieldMsg(el);
        a.addEventListener('click', function(ev){ ev.preventDefault(); el.focus({preventScroll:true}); el.scrollIntoView({block:'center', behavior:'smooth'}); });
        li.appendChild(a); ul.appendChild(li);
      });
      summary.appendChild(ul);
    }
  }
  if(!bad.length) return true;
  bad[0].focus({preventScroll:true}); bad[0].scrollIntoView({block:'center', behavior:'smooth'});
  return false;
}
function cre8Live(form){
  form.addEventListener('blur', function(e){ var t = e.target; if(t.willValidate && (t.value || t.hasAttribute('aria-invalid'))) cre8Mark(t); }, true);
  form.addEventListener('change', function(e){ if(e.target.hasAttribute && e.target.hasAttribute('aria-invalid')) cre8Mark(e.target); });
}

/* Can't Wait to Cre8 site script: shared by every page. Each block only runs when its page elements exist. */
(function(){
  /* Backend: your Render server. GOOGLE_REVIEW_LINK: paste your "Ask for reviews" link from Google Business Profile. */
  /* Served by the Render server itself (cantwaittocre8.com or the preview), so API calls stay on the same site.
     Opened anywhere else (a test file), it falls back to the full Render address. */
  var API = /(^|\.)cantwaittocre8\.(com|shop)$|onrender\.com$/.test(location.hostname) ? '' : 'https://live-above-scorecard.onrender.com';
  var GOOGLE_REVIEW_LINK = 'https://g.page/r/CeCLkLzJXNIJEAE/review';
  var yr = document.getElementById('yr'); if(yr) yr.textContent = new Date().getFullYear();
  document.documentElement.classList.remove('no-js');

  /* Google reviews from the backend; the section stays hidden until real reviews load */
  /* Everything from the server is placed as plain text (never as HTML), and links or images are only used
     when they are https addresses on Google's own domains */
  function el(tag, cls, text){ var n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = String(text); return n; }
  function googleUrl(u){
    try { var x = new URL(String(u)); return x.protocol === 'https:' && /(^|\.)(google\.com|googleusercontent\.com|ggpht\.com|g\.page)$/i.test(x.hostname) ? x.href : ''; }
    catch(e){ return ''; }
  }
  function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }
  function stars(n){ var r = Math.round(n); return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }
  /* Tap a photo to see it bigger: a real dialog with next/previous, arrow keys, swipe, a counter and scroll lock */
  var viewer = document.createElement('div'); viewer.className = 'viewer';
  viewer.setAttribute('role', 'dialog'); viewer.setAttribute('aria-modal', 'true'); viewer.setAttribute('aria-label', 'Photo viewer');
  var vClose = el('button', 'v-close', '✕'); vClose.type = 'button'; vClose.setAttribute('aria-label', 'Close');
  var vPrev = el('button', 'v-prev', '‹'); vPrev.type = 'button'; vPrev.setAttribute('aria-label', 'Previous photo');
  var vNext = el('button', 'v-next', '›'); vNext.type = 'button'; vNext.setAttribute('aria-label', 'Next photo');
  var vImg = el('img'); vImg.alt = '';
  var vCount = el('div', 'v-count'); vCount.setAttribute('aria-live', 'polite');
  [vClose, vPrev, vImg, vNext, vCount].forEach(function(n){ viewer.appendChild(n); });
  document.body.appendChild(viewer);
  var framed = false; try { framed = window.self !== window.top; } catch(x) { framed = true; }
  if(!framed) viewer.classList.add('overlay'); // own domain: full-screen overlay; inside a frame: open where tapped
  var lastPhoto = null, set = [], at = 0;
  function show(i){
    at = (i + set.length) % set.length;
    var im = set[at].querySelector('img'); vImg.src = im.currentSrc || im.src; vImg.alt = im.alt;
    vCount.textContent = (at + 1) + ' / ' + set.length;
    var many = set.length > 1; vPrev.hidden = vNext.hidden = vCount.hidden = !many;
  }
  function openViewer(item){
    set = Array.prototype.slice.call(document.querySelectorAll('.gallery .gitem')).filter(function(g){ return g.querySelector('img'); });
    lastPhoto = item; show(Math.max(0, set.indexOf(item)));
    if(framed){ /* GoDaddy's frame is page height, so position the viewer where the tap happened */
      var y = window.scrollY + item.getBoundingClientRect().top - 40; viewer.style.top = Math.max(0, y) + 'px';
    } else document.documentElement.classList.add('v-lock');
    viewer.classList.add('open'); vClose.focus();
  }
  function closeViewer(){
    if(!viewer.classList.contains('open')) return;
    viewer.classList.remove('open'); document.documentElement.classList.remove('v-lock');
    if(lastPhoto) lastPhoto.focus();
  }
  vPrev.addEventListener('click', function(e){ e.stopPropagation(); show(at - 1); });
  vNext.addEventListener('click', function(e){ e.stopPropagation(); show(at + 1); });
  vImg.addEventListener('click', function(e){ e.stopPropagation(); });
  viewer.addEventListener('click', closeViewer); // the backdrop and the ✕ close it
  var sx = null;
  viewer.addEventListener('touchstart', function(e){ sx = e.touches[0].clientX; }, { passive: true });
  viewer.addEventListener('touchend', function(e){ if(sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null; if(Math.abs(dx) > 40 && set.length > 1) show(at + (dx < 0 ? 1 : -1)); });
  document.addEventListener('keydown', function(e){
    if(viewer.classList.contains('open')){
      if(e.key === 'Escape') return closeViewer();
      if(e.key === 'ArrowRight' && set.length > 1) return show(at + 1);
      if(e.key === 'ArrowLeft' && set.length > 1) return show(at - 1);
      if(e.key === 'Tab'){ // keep focus inside the dialog
        var f = [vClose, vPrev, vNext].filter(function(b){ return !b.hidden; }), i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
      return;
    }
    // photos open from the keyboard too
    var it = e.target.closest && e.target.closest('.gallery .gitem');
    if(it && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openViewer(it); }
  });
  // every gallery photo, including ones added later from Google, is focusable and named
  function tagPhotos(){ document.querySelectorAll('.gallery .gitem').forEach(function(it){ if(it.hasAttribute('tabindex')) return; var im = it.querySelector('img'); it.tabIndex = 0; it.setAttribute('role', 'button'); it.setAttribute('aria-label', 'View larger: ' + ((im && im.alt) || 'photo')); }); }
  tagPhotos(); if('MutationObserver' in window) document.querySelectorAll('.gallery').forEach(function(g){ new MutationObserver(tagPhotos).observe(g, { childList: true }); });
  document.addEventListener('click', function(e){
    if(!e.target.closest('.gallery') || e.target.closest('a')) return;
    var item = e.target.closest('.gitem'); if(item && item.querySelector('img')) openViewer(item);
  });

  /* Jump links: GoDaddy runs this page in a frame, where plain #links do nothing, so scroll with code */
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#"]'); if(!a) return;
    var id = a.getAttribute('href').slice(1); if(!id) { e.preventDefault(); return; }
    var target = document.getElementById(id); if(!target) return;
    e.preventDefault();
    try { target.scrollIntoView({ behavior:'smooth', block:'start' }); } catch(x) { target.scrollIntoView(); }
  });

  /* ===== Links to a section of the page you are already on scroll smoothly instead of reloading ===== */
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]'); if(!a || a.target === '_top' && a.hostname !== location.hostname) return;
    var u; try { u = new URL(a.getAttribute('href'), location.href); } catch(x){ return; }
    if(u.origin !== location.origin || u.pathname.replace(/\/+$/, '') !== location.pathname.replace(/\/+$/, '') || !u.hash || u.search !== location.search && u.search) return;
    var t = document.getElementById(u.hash.slice(1)); if(!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if(history.replaceState) history.replaceState(null, '', u.pathname + u.search + u.hash);
  });

  /* ===== Websites page: demo cards open a live preview in a pop-up instead of leaving the page ===== */
  if(new URLSearchParams(location.search).get('demo')) document.documentElement.classList.add('demo');
  var demo = null;
  function closeDemo(){
    if(!demo || !demo.classList.contains('open')) return;
    demo.classList.remove('open'); document.documentElement.classList.remove('demo-lock');
    setTimeout(function(){ if(!demo.classList.contains('open')) demo.querySelector('iframe').src = 'about:blank'; }, 250);
    if(demo._from) try { demo._from.focus(); } catch(x){}
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a.demo-card'); if(!a || document.documentElement.classList.contains('demo')) return;
    e.preventDefault();
    if(!demo){
      demo = document.createElement('div'); demo.className = 'demo-pop'; demo.setAttribute('role', 'dialog'); demo.setAttribute('aria-modal', 'true'); demo.setAttribute('aria-labelledby', 'demoTitle');
      demo.innerHTML = '<div class="dp-box"><div class="dp-head"><span class="dp-ico"></span><div><b id="demoTitle"></b><p></p></div><button type="button" class="dp-x" aria-label="Close preview">✕</button></div>' +
        '<label class="dp-name"><span>Try it with your business name</span><input type="text" maxlength="28" placeholder="Your Brand" autocomplete="organization"></label>' +
        '<div class="dp-frame"><div class="dp-bar"><i></i><i></i><i></i><span></span></div><div class="dp-load">Loading live preview...</div><iframe title="Live preview" loading="eager"></iframe></div>' +
        '<p class="dp-tip">This is the live site running inside the preview. Tap, type and try it.</p></div>';
      document.body.appendChild(demo);
      demo.addEventListener('click', function(ev){ if(ev.target === demo || ev.target.closest('.dp-x')) closeDemo(); });
      demo.querySelector('iframe').addEventListener('load', function(){ demo.classList.add('loaded'); });
      document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') closeDemo(); });
      var nt; demo.querySelector('.dp-name input').addEventListener('input', function(ev){
        clearTimeout(nt); var v = ev.target.value;
        nt = setTimeout(function(){ try { demo.querySelector('iframe').contentWindow.cre8Sample(v); } catch(x){} }, 250);
      });
    }
    var u = new URL(a.getAttribute('href'), location.href);
    u.searchParams.set('demo', '1');
    var sample = !!a.dataset.sample; if(sample) u.searchParams.set('sample', '1');
    demo.classList.toggle('has-sample', sample);
    var nameBox = demo.querySelector('.dp-name input'); if(sample && nameBox.value.trim()) u.searchParams.set('name', nameBox.value.trim());
    demo.querySelector('.dp-tip').textContent = sample
      ? 'Sample logo shown so you can see it work. On your website, this tool becomes whatever your customers need: a menu, a booking calendar or a price calculator.'
      : 'This is the live site running inside the preview. Tap, type and try it.';
    demo.querySelector('.dp-ico').textContent = (a.querySelector('.d-ico') || {}).textContent || '';
    demo.querySelector('#demoTitle').textContent = a.querySelector('b').textContent;
    demo.querySelector('.dp-head p').textContent = (a.querySelector('span:not(.d-ico)') || {}).textContent || '';
    demo.querySelector('.dp-bar span').textContent = 'cantwaittocre8.com' + (u.pathname.replace(/^\/site\/cre8/, '') || '/');
    demo.classList.remove('loaded');
    demo.querySelector('iframe').src = u.pathname + u.search + u.hash;
    demo._from = a;
    demo.classList.add('open'); document.documentElement.classList.add('demo-lock');
    demo.querySelector('.dp-x').focus({ preventScroll: true });
  });

  var menuBtn = document.getElementById('menuBtn'), navlinks = document.getElementById('navlinks');
  if(menuBtn && navlinks){
    menuBtn.addEventListener('click', function(){
      var open = !navlinks.classList.contains('open');
      navlinks.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navlinks.addEventListener('click', function(e){ if(e.target.closest('a')){ navlinks.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });
  }

  /* ===== Photo tilt (desktop pointers only) ===== */
  if(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.addEventListener('pointermove', function(e){
      var t = e.target.closest && e.target.closest('.gitem.tilt'); if(!t) return;
      var r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      t.style.transform = 'perspective(700px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg) translateY(-3px)';
    });
    document.addEventListener('pointerout', function(e){
      var t = e.target.closest && e.target.closest('.gitem.tilt'); if(t && !t.contains(e.relatedTarget)) t.style.transform = '';
    });
  }

  /* ===== Everything that belongs to one page. Runs on first load and again after every page slide. ===== */
  var cleanups = [];
  function initPage(){
    while(cleanups.length){ try { cleanups.pop()(); } catch(e){} }
  /* ===== Order form (How It Works page) ===== */
  if(document.getElementById('orderForm')) (function(){
  /* Show garment section when apparel or hats is picked */
  var garmentSection = document.getElementById('garmentSection');
  var apparelBoxes = document.querySelectorAll('[data-apparel]');
  function renumber(){
    var n = 1;
    document.querySelectorAll('#orderForm fieldset').forEach(function(fs){
      if(fs.classList.contains('hidden')) return;
      var badge = fs.querySelector('.n'); if(badge) badge.textContent = n++;
    });
  }
  function toggleGarment(){
    var on = Array.prototype.some.call(apparelBoxes, function(b){return b.checked;});
    garmentSection.classList.toggle('hidden', !on);
    // Only show print locations that fit what was picked (no Hat Front on a shirts-only order)
    document.querySelectorAll('input[name="locations[]"][data-for]').forEach(function(l){
      var p = document.querySelector('input[name="product[]"][value="' + l.dataset.for + '"]'), show = !!(p && p.checked);
      l.closest('.chip').classList.toggle('hidden', !show); if(!show) l.checked = false;
    });
    document.getElementById('mockSection').classList.toggle('hidden', !on);
    renumber();
  }
  apparelBoxes.forEach(function(b){ b.addEventListener('change', toggleGarment); });
  /* Engraving mockup shows for laser engraving or any engravable item */
  var ENGRAVE_PRODUCTS = ['Tumblers / Drinkware', 'Wood (signs, puzzles, plaques)', 'Metal / Glass / Acrylic', 'Leather', 'Journals / Notebooks'];
  function toggleEngrave(){
    var sec = document.getElementById('engraveSection'); if(!sec) return;
    var m = document.querySelector('input[name=method]:checked');
    var on = (m && m.value === 'Laser Engraving') || Array.prototype.some.call(document.querySelectorAll('input[name="product[]"]'), function(b){ return b.checked && ENGRAVE_PRODUCTS.indexOf(b.value) > -1; });
    var was = !sec.classList.contains('hidden');
    sec.classList.toggle('hidden', !on); renumber();
    if(!on) ['eg_item', 'eg_text', 'eg_font', 'eg_design'].forEach(function(id){ var f = document.getElementById(id); if(f) f.value = ''; });
    if(on && !was && window.Cre8Engrave) window.Cre8Engrave.init();
    // journals picked: open the engraving preview on the leather journal
    var jb = document.querySelector('input[name="product[]"][value="Journals / Notebooks"]');
    if(on && jb && jb.checked && window.Cre8Engrave && window.Cre8Engrave.pick) window.Cre8Engrave.pick('journal');
  }
  /* Bring your own item: ask what it is. Print finish (flat or raised texture) shows for printing */
  function toggleExtras(){
    var own = document.querySelector('input[name="product[]"][value="Your Own Item"]');
    var ow = document.getElementById('ownItemWrap'); if(ow){ ow.classList.toggle('hidden', !(own && own.checked)); if(!(own && own.checked)) document.getElementById('ownItem').value = ''; }
    var m = document.querySelector('input[name=method]:checked'), fw = document.getElementById('finishWrap');
    if(fw){ var show = !!(m && (m.value === 'Full Color Print' || m.value === 'Not sure, recommend one')); fw.classList.toggle('hidden', !show);
      if(!show){ var flat = document.querySelector('input[name=finish][value=Flat]'); if(flat) flat.checked = true; }
      document.querySelectorAll('input[name=finish]').forEach(function(r){ r.disabled = !show; }); } // hidden = not sent with the quote
  }
  document.querySelectorAll('input[name="product[]"], input[name=method]').forEach(function(b){ b.addEventListener('change', toggleExtras); });
  toggleExtras();
  document.querySelectorAll('input[name="product[]"], input[name=method]').forEach(function(b){ b.addEventListener('change', toggleEngrave); });
  renumber();

  /* Other garment field */
  var garment = document.getElementById('garment');
  garment.addEventListener('change', function(){
    document.getElementById('otherGarmentWrap').classList.toggle('hidden', garment.value !== 'Other');
  });

  var ms = document.getElementById('moreSizes');
  if(ms) ms.addEventListener('click', function(){ var sz = document.getElementById('sizes'), on = !sz.classList.contains('show-all'); sz.classList.toggle('show-all', on); ms.setAttribute('aria-expanded', on ? 'true' : 'false'); ms.textContent = on ? 'Fewer sizes' : 'Youth and 2XL+ sizes'; });
  setTimeout(function(){ var sz = document.getElementById('sizes'); if(sz && Array.prototype.some.call(sz.querySelectorAll('.size-more input'), function(i){ return i.value; })){ sz.classList.add('show-all'); if(ms){ ms.textContent = 'Fewer sizes'; ms.setAttribute('aria-expanded', 'true'); } } }, 0);
  /* Size total syncs to quantity; warn if someone edits quantity so they no longer match */
  function qtyCheck(){
    var t = 0; document.querySelectorAll('#sizes input').forEach(function(s){ t += parseInt(s.value,10) || 0; });
    var q = parseInt(document.getElementById('qty').value, 10) || 0, n = document.getElementById('qtyNote');
    if(!n){ n = document.createElement('p'); n.id = 'qtyNote'; n.className = 'field-err'; n.setAttribute('role', 'status'); document.getElementById('qty').closest('.field').appendChild(n); }
    var off = t > 0 && q !== t; n.textContent = off ? 'Your sizes add up to ' + t + ', but quantity says ' + q + '. Update one so they match.' : ''; n.classList.toggle('hidden', !off);
  }
  document.getElementById('qty').addEventListener('input', qtyCheck);
  var sizeInputs = document.querySelectorAll('#sizes input');
  var qty = document.getElementById('qty');
  sizeInputs.forEach(function(i){
    i.addEventListener('input', function(){
      var t = 0; sizeInputs.forEach(function(s){ t += parseInt(s.value,10) || 0; });
      document.getElementById('sizeTotal').textContent = t;
      if(t > 0) qty.value = t;
      qtyCheck();
      checkTiming();
    });
  });

  /* Need-by date: warn if under 4 business days (1 day proof + 3 day production) */
  var needBy = document.getElementById('needBy');
  var today = new Date(); today.setHours(0,0,0,0);
  needBy.min = today.toISOString().split('T')[0];
  function addBusinessDays(d, n){
    var r = new Date(d);
    while(n > 0){ r.setDate(r.getDate()+1); if(r.getDay()!==0 && r.getDay()!==6) n--; }
    return r;
  }
  /* 5 pieces or fewer: 3 day turnaround, so warn if the date is under 4 business days (1 day proof + 3 days).
     More than 5: no promise on the page, the quote sets the date. */
  var SMALL_ORDER = 5;
  var rushNote = document.getElementById('rushNote');
  function checkTiming(){
    var n = parseInt(qty.value, 10) || 0;
    if(!needBy.value){ rushNote.classList.add('hidden'); return; }
    var picked = new Date(needBy.value + 'T00:00:00');
    var msg = '';
    if(n > SMALL_ORDER) msg = 'Orders over ' + SMALL_ORDER + ' pieces are scheduled when we quote. We will confirm whether we can hit your date before you pay.';
    else if(picked < addBusinessDays(today, 4)) msg = 'That date is tight. We will do our best and confirm if a rush is possible when we send your quote.';
    rushNote.textContent = msg;
    rushNote.classList.toggle('hidden', !msg);
  }
  needBy.addEventListener('change', checkTiming);
  qty.addEventListener('input', checkTiming);

  /* ===== Mockup: see the design on the garment, at real size =====
     Drawing scale: garments are drawn at 10 px per inch (adult large), the hat at 30 px per inch.
     Garments are shaded (volume, folds, fabric texture) and the print sits under the fold shading so it looks printed on.
     Placement is saved in inches into hidden fields, and a PNG of the mockup is attached to the quote. */
  var mock = (function(){
    var SVGNS = 'http://www.w3.org/2000/svg';
    var stage = document.getElementById('mockStage');
    // Tee brands. Colors on screen are close, not exact; availability is confirmed on the quote.
    var BRANDS = {
      ascolour: { label: 'AS Colour', style: 'AS Colour 5026 Classic Tee', colors: [
        ['White','#ffffff'],['Natural','#f1ead8'],['Bone','#ddd5c3'],['Grey Marle','#b9b9b7'],['Coal','#3b3c40'],['Black','#141416'],
        ['Navy','#232c4a'],['Bright Royal','#2f55b5'],['Red','#c4222f'],['Army','#5a5b3d'],['Camel','#b8874f'] ] },
      gildan: { label: 'Gildan', style: 'Gildan 5000 Heavy Cotton Tee', colors: [
        ['White','#ffffff'],['Natural','#efe7d6'],['Sand','#d8c8a6'],['Sport Grey','#a9aaac'],['Dark Heather','#4a4b4f'],['Charcoal','#56595d'],
        ['Black','#141416'],['Navy','#1f2a44'],['Royal','#2a50a8'],['Light Blue','#a8c6e4'],['Red','#c1272d'],['Maroon','#5f1f2c'],
        ['Forest Green','#2c4a36'],['Military Green','#5b5e3f'],['Gold','#f2b230'] ] },
      bella: { label: 'Bella+Canvas', style: 'Bella+Canvas 3001 Unisex Jersey Tee', colors: [
        ['White','#ffffff'],['Natural','#f0e9d8'],['Soft Cream','#efe3c8'],['Heather Dust','#dccbb5'],['Athletic Heather','#c4c4c2'],['Dark Grey Heather','#4c4d50'],
        ['Black','#141416'],['Navy','#222a43'],['True Royal','#2d55aa'],['Red','#c32032'],['Maroon','#5e1e2c'],['Forest','#2b4535'],
        ['Army','#6a6a4c'],['Heather Mauve','#c4a0a5'],['Pink','#f4c3d1'] ] },
      nextlevel: { label: 'Next Level', style: 'Next Level 3600 Cotton Tee', colors: [
        ['White','#ffffff'],['Cream','#efe6cf'],['Sand','#d8c9a8'],['Light Grey','#d0d0ce'],['Heather Grey','#b9b9b7'],['Heavy Metal','#4a4c50'],
        ['Black','#141416'],['Navy','#20283f'],['Indigo','#3c4f7a'],['Royal','#2c52a6'],['Cool Blue','#7fa6d6'],['Light Blue','#b4cfe9'],
        ['Turquoise','#2fa7b8'],['Red','#c62a33'],['Cardinal','#8b1e2d'],['Maroon','#5c1f2b'],['Purple Rush','#5a3a8a'],['Light Pink','#f5cbd6'],
        ['Kelly Green','#1e8a4a'],['Forest Green','#2b4a36'],['Military Green','#5c5f41'],['Light Olive','#9b9a6e'] ] }
    };
    var GENERIC = [
      ['White','#ffffff'],['Black','#141416'],['Heather Grey','#b9b8b6'],['Navy','#1f2a44'],['Red','#c8202f'],
      ['Royal Blue','#2a55b8'],['Forest Green','#2f4f3a'],['Maroon','#6b1f2b'],['Pink','#f4a7c0'],['Sand','#d9c7a5']
    ];
    var TYPE_NAME = { tee: 'T-Shirt', hoodie: 'Hoodie', crew: 'Crewneck', tank: 'Tank', hat: 'Hat', beanie: 'Beanie' };
    var BODY = {
      tee:  'M152,42 Q200,78 248,42 L312,58 C330,66 352,92 374,124 L336,156 C326,146 312,138 302,134 C300,200 302,320 304,416 Q200,430 96,416 C98,320 100,200 98,134 C88,138 74,146 64,156 L26,124 C48,92 70,66 88,58 Z',
      crew: 'M152,42 Q200,78 248,42 L312,58 C334,70 350,110 358,150 L384,330 L348,340 L322,182 C316,170 308,160 302,152 C300,230 302,330 304,418 Q200,428 96,418 C98,330 100,230 98,152 C92,160 84,170 78,182 L52,340 L16,330 L42,150 C50,110 66,70 88,58 Z',
      tank: 'M164,40 Q200,92 236,40 L262,40 C262,92 276,132 302,152 C300,240 302,330 304,416 Q200,430 96,416 C98,330 100,240 98,152 C124,132 138,92 138,40 Z',
      hat:  'M80,300 C80,108 320,108 320,300 Q200,318 80,300 Z'
    };
    BODY.hoodie = BODY.crew;
    // The back neckline sits higher than the front
    function bodyPath(view){
      var d = BODY[state.type] || BODY.hat; // beanie is photo-based; never hand the SVG an undefined path
      if(view !== 'back') return d;
      return d.replace('Q200,78', 'Q200,54').replace('Q200,92', 'Q200,62');
    }
    var NECK = { front: 'M152,42 Q200,78 248,42', back: 'M152,42 Q200,54 248,42' };
    // Print areas in drawing units (x, y, w, h)
    var AREAS = {
      tee:    { front: [140, 72, 120, 160], back: [140, 62, 120, 160] },
      crew:   { front: [140, 72, 120, 140], back: [140, 62, 120, 160] },
      hoodie: { front: [140, 80, 120, 100], back: [140, 72, 120, 150] },
      tank:   { front: [150, 84, 100, 140], back: [150, 70, 100, 140] },
      hat:    { front: [132, 184, 136, 76] }
    };
    var PPI = { tee: 10, crew: 10, hoodie: 10, tank: 10, hat: 40, beanie: 36 };
    // Photo garments (Canva generated blank tee): the shade image multiplies over the color, the mask cuts the shape.
    // Placed so the photo's body lines up with the drawing units above (body 98 to 302, collar top at 42).
    var PHOTO = { tee: { front: { shade: '/cre8/tee-front.png', mask: '/cre8/tee-front-mask.png', x: 10.7, y: 0.5, w: 380.6, h: 471.7, area: [140, 86, 120, 150], collar: 82 },
                       back: { shade: '/cre8/tee-back.png', mask: '/cre8/tee-back-mask.png', x: 2.6, y: -15.3, w: 394.2, h: 488.6, area: [140, 70, 120, 160], collar: 56 } },
      hoodie: { front: { shade: '/cre8/hoodie-front.png', mask: '/cre8/hoodie-front-mask.png', x: 2.9, y: -23.6, w: 394.2, h: 488.6, area: [140, 140, 120, 105], collar: 129 },
                back:  { shade: '/cre8/hoodie-back.png', mask: '/cre8/hoodie-back-mask.png', x: 3.8, y: -26.4, w: 394.2, h: 488.6, area: [140, 140, 120, 160], collar: 130 } },
      crew: { front: { shade: '/cre8/crew-front.png', mask: '/cre8/crew-front-mask.png', x: -0.6, y: -28.3, w: 403.3, h: 499.8, area: [140, 80, 120, 140], collar: 62 },
              back:  { shade: '/cre8/crew-back.png', mask: '/cre8/crew-back-mask.png', x: -1.6, y: -39.6, w: 403.3, h: 499.8, area: [140, 52, 120, 160], collar: 37 } },
      tank: { front: { shade: '/cre8/tank-front.png', mask: '/cre8/tank-front-mask.png', x: 8.0, y: -17.8, w: 384, h: 475.9, area: [150, 125, 100, 140], collar: 117 },
              back:  { shade: '/cre8/tank-back.png', mask: '/cre8/tank-back-mask.png', x: 23.9, y: -39.3, w: 352.2, h: 499.8, area: [150, 55, 100, 160], collar: 35 } },
      hat: { front: { shade: '/cre8/hat-front.png', mask: '/cre8/hat-front-mask.png', x: -4.5, y: -32, w: 409, h: 507, area: [110, 135, 180, 95], collar: 0 } },
      beanie: { front: { shade: '/cre8/beanie-front.png', mask: '/cre8/beanie-front-mask.png', x: -3.4, y: -28.4, w: 409, h: 507, area: [119, 300, 162, 81], collar: 0 } } };
    var photoData = {};
    Object.keys(PHOTO).forEach(function(t){ Object.keys(PHOTO[t]).forEach(function(v){ ['shade', 'mask'].forEach(function(k){
      var u = PHOTO[t][v][k];
      try { fetch(u).then(function(r){ return r.blob(); }).then(function(b){ var fr = new FileReader(); fr.onload = function(){ photoData[u] = fr.result; }; fr.readAsDataURL(b); }).catch(function(){}); } catch(e){}
    }); }); });
    function photo(view){ var t = PHOTO[state.type]; return t && t[view || state.view]; }
    function psrc(u){ return photoData[u] || u; }
    var COLLAR = { front: 56, back: 46 };
    var PRESETS = {
      front: [['Center chest', 'center', 10], ['Left chest', 'left', 3.75], ['Full front', 'full', 12]],
      back:  [['Full back', 'full', 12], ['Upper back', 'upper', 10], ['Back neck', 'neck', 3]],
      hat:   [['Hat front', 'center', 4]],
      beanie: [['Cuff front', 'center', 3.5]]
    };
    // Soft fold and shadow strokes (multiply) and highlights (screen), per garment family
    var FOLDS = {
      shirt: { dark: ['M106,150 Q146,196 136,262', 'M294,150 Q254,198 264,264', 'M126,384 Q168,368 204,394', 'M236,392 Q268,370 292,386', 'M118,300 Q132,330 124,372', 'M282,296 Q268,334 278,372'],
               sleeve: ['M330,92 Q344,112 350,138', 'M70,92 Q56,112 50,138'],
               light: [[200, 170, 64, 92], [150, 250, 26, 70], [252, 250, 26, 70]] },
      tank:  { dark: ['M112,170 Q146,210 138,270', 'M288,170 Q254,212 262,272', 'M126,384 Q168,368 204,394', 'M236,392 Q268,370 292,386'], sleeve: [],
               light: [[200, 190, 56, 92]] }
    };

    var state = { type: 'tee', brand: 'ascolour', color: 0, view: 'front', sides: { front: null, back: null } };
    var images = []; // { name, url, data, w, h }
    var drag = null;

    function palette(){ return state.type === 'tee' ? BRANDS[state.brand].colors : GENERIC; }
    function colorPair(){ var p = palette(); if(state.color >= p.length) state.color = 0; return p[state.color]; }
    function el(tag, attrs){ var n = document.createElementNS(SVGNS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); return n; }
    function lum(hex){ var c = parseInt(hex.slice(1), 16); return ((c >> 16) & 255) * .299 + ((c >> 8) & 255) * .587 + (c & 255) * .114; }
    function isDark(hex){ return lum(hex) < 110; }
    function isCap(){ return state.type === 'hat' || state.type === 'beanie'; }
    function views(){ return isCap() ? ['front'] : ['front', 'back']; }
    function area(view){ var p = photo(view); return p ? p.area : AREAS[state.type][view || state.view]; }
    function ppi(){ return PPI[state.type]; }
    function inch(px){ return Math.round(px / ppi() * 4) / 4; }
    function styleName(){ return state.type === 'tee' ? BRANDS[state.brand].style : TYPE_NAME[state.type]; }

    // Shared filters and gradients (ids are prefixed per drawing so several drawings can live in one file)
    function defs(px, heather, view){
      var d = el('defs', {});
      var lg = el('linearGradient', { id: px + 'side', x1: '0', x2: '1', y1: '0', y2: '0' });
      [['0', '.26'], ['.16', '.05'], ['.5', '0'], ['.84', '.05'], ['1', '.26']].forEach(function(s){ lg.appendChild(el('stop', { offset: s[0], 'stop-color': '#000', 'stop-opacity': s[1] })); });
      d.appendChild(lg);
      var vg = el('linearGradient', { id: px + 'vert', x1: '0', x2: '0', y1: '0', y2: '1' });
      [['0', '.06'], ['.16', '0'], ['.85', '0'], ['1', '.10']].forEach(function(s){ vg.appendChild(el('stop', { offset: s[0], 'stop-color': '#000', 'stop-opacity': s[1] })); });
      d.appendChild(vg);
      var hr = el('radialGradient', { id: px + 'hat', cx: '.42', cy: '.35', r: '.75' });
      [['0', '#fff', '.22'], ['.55', '#fff', '0'], ['1', '#000', '.30']].forEach(function(s){ hr.appendChild(el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] })); });
      d.appendChild(hr);
      var blur = el('filter', { id: px + 'blur', x: '-20%', y: '-20%', width: '140%', height: '140%' });
      blur.appendChild(el('feGaussianBlur', { stdDeviation: '6' })); d.appendChild(blur);
      var blur2 = el('filter', { id: px + 'blur2', x: '-30%', y: '-30%', width: '160%', height: '160%' });
      blur2.appendChild(el('feGaussianBlur', { stdDeviation: '14' })); d.appendChild(blur2);
      var shadow = el('filter', { id: px + 'shadow', x: '-20%', y: '-20%', width: '140%', height: '150%' });
      shadow.appendChild(el('feGaussianBlur', { stdDeviation: '9' })); d.appendChild(shadow);
      // Knit texture: fine noise, stronger for heathers and marles
      var tex = el('filter', { id: px + 'tex', x: '0', y: '0', width: '100%', height: '100%' });
      tex.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: heather ? '1.8 .6' : '1.6', numOctaves: '2', seed: '7', result: 'n' }));
      tex.appendChild(el('feColorMatrix', { 'in': 'n', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ' + (heather ? '-.55 .34' : '-.22 .12') }));
      d.appendChild(tex);
      // Gentle warp so the print follows the fabric
      var warp = el('filter', { id: px + 'warp', x: '-5%', y: '-5%', width: '110%', height: '110%' });
      warp.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: '.012 .02', numOctaves: '2', seed: '3', result: 'w' }));
      warp.appendChild(el('feDisplacementMap', { 'in': 'SourceGraphic', in2: 'w', scale: '5', xChannelSelector: 'R', yChannelSelector: 'G' }));
      d.appendChild(warp);
      var clip = el('clipPath', { id: px + 'clip' }); clip.appendChild(el('path', { d: bodyPath(view) })); d.appendChild(clip);
      return d;
    }

    function base(g, view, color, px){
      var stroke = isDark(color) ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.20)';
      if(state.type === 'hat'){
        g.appendChild(el('ellipse', { cx: 200, cy: 352, rx: 150, ry: 16, fill: '#000', opacity: '.18', filter: 'url(#' + px + 'shadow)' }));
        g.appendChild(el('path', { d: BODY.hat, fill: color, stroke: stroke, 'stroke-width': 1.5 }));
        return stroke;
      }
      g.appendChild(el('ellipse', { cx: 200, cy: 428, rx: 128, ry: 10, fill: '#000', opacity: '.16', filter: 'url(#' + px + 'shadow)' }));
      if(state.type === 'hoodie'){
        g.appendChild(el('path', { d: view === 'front' ? 'M146,46 C130,2 270,2 254,46 Q200,94 146,46 Z' : 'M146,48 C132,0 268,0 254,48 Q200,66 146,48 Z', fill: color, stroke: stroke, 'stroke-width': 1.5 }));
        g.appendChild(el('path', { d: view === 'front' ? 'M146,46 C130,2 270,2 254,46 Q200,94 146,46 Z' : 'M146,48 C132,0 268,0 254,48 Q200,66 146,48 Z', fill: 'url(#' + px + 'hat)', 'pointer-events': 'none' }));
      }
      g.appendChild(el('path', { d: bodyPath(view), fill: color, stroke: stroke, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
      // inside of the back neck shows through the front opening
      if(view === 'front' && state.type !== 'hoodie'){
        var inside = state.type === 'tank' ? 'M164,40 Q200,58 236,40 Q200,92 164,40 Z' : 'M152,42 Q200,58 248,42 Q200,78 152,42 Z';
        g.appendChild(el('path', { d: inside, fill: color }));
        g.appendChild(el('path', { d: inside, fill: '#000', opacity: '.28' }));
      }
      return stroke;
    }

    function shading(g, view, color, px){
      var dark = isDark(color), mult = { 'clip-path': 'url(#' + px + 'clip)', style: 'mix-blend-mode:multiply', 'pointer-events': 'none' };
      if(state.type === 'hat'){
        g.appendChild(el('path', { d: BODY.hat, fill: 'url(#' + px + 'hat)', 'pointer-events': 'none' }));
        return;
      }
      var sh = el('g', mult);
      sh.appendChild(el('rect', { x: 0, y: 0, width: 400, height: 440, fill: 'url(#' + px + 'side)' }));
      sh.appendChild(el('rect', { x: 0, y: 0, width: 400, height: 440, fill: 'url(#' + px + 'vert)' }));
      var fam = FOLDS[state.type === 'tank' ? 'tank' : 'shirt'];
      var fd = el('g', { filter: 'url(#' + px + 'blur)', fill: 'none', stroke: '#000', 'stroke-linecap': 'round', opacity: dark ? '.42' : '.16' });
      fam.dark.forEach(function(d){ fd.appendChild(el('path', { d: d, 'stroke-width': 6 })); });
      fam.sleeve.forEach(function(d){ fd.appendChild(el('path', { d: d, 'stroke-width': 5 })); });
      // underarm shadows
      if(state.type !== 'tank'){ fd.appendChild(el('ellipse', { cx: 102, cy: 142, rx: 8, ry: 16, fill: '#000', stroke: 'none' })); fd.appendChild(el('ellipse', { cx: 298, cy: 142, rx: 8, ry: 16, fill: '#000', stroke: 'none' })); }
      sh.appendChild(fd);
      sh.appendChild(el('rect', { x: 0, y: 0, width: 400, height: 440, filter: 'url(#' + px + 'tex)' }));
      g.appendChild(sh);
      var hl = el('g', { 'clip-path': 'url(#' + px + 'clip)', style: 'mix-blend-mode:screen', 'pointer-events': 'none', filter: 'url(#' + px + 'blur2)', opacity: dark ? '.06' : '.22' });
      fam.light.forEach(function(e){ hl.appendChild(el('ellipse', { cx: e[0], cy: e[1], rx: e[2], ry: e[3], fill: '#fff' })); });
      g.appendChild(hl);
    }

    function trims(g, view, color, stroke){
      if(state.type === 'hat'){
        g.appendChild(el('path', { d: 'M200,160 L200,312 M142,176 Q172,240 168,306 M258,176 Q228,240 232,306', fill: 'none', stroke: stroke, 'stroke-width': 1.4 }));
        g.appendChild(el('path', { d: 'M58,300 Q200,404 342,300 Q200,316 58,300 Z', fill: color, stroke: stroke, 'stroke-width': 1.5 }));
        g.appendChild(el('path', { d: 'M58,300 Q200,404 342,300 Q200,316 58,300 Z', fill: '#000', 'fill-opacity': .16, 'pointer-events': 'none' }));
        g.appendChild(el('path', { d: 'M90,312 Q200,380 310,312', fill: 'none', stroke: stroke, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
        g.appendChild(el('circle', { cx: 200, cy: 158, r: 6, fill: color, stroke: stroke, 'stroke-width': 1.5 }));
        return;
      }
      if(state.type !== 'tank'){
        g.appendChild(el('path', { d: NECK[view], fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        g.appendChild(el('path', { d: NECK[view], fill: 'none', stroke: '#000', 'stroke-opacity': isDark(color) ? .35 : .12, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        g.appendChild(el('path', { d: NECK[view].replace('Q200,78', 'Q200,84').replace('Q200,54', 'Q200,60').replace(/^M152,42/, 'M148,44').replace(/248,42$/, '252,44'), fill: 'none', stroke: stroke, 'stroke-width': 1, 'stroke-dasharray': '2 2' }));
      }
      // hem and sleeve stitching
      g.appendChild(el('path', { d: 'M98,406 Q200,420 304,406', fill: 'none', stroke: stroke, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      if(state.type === 'tee') g.appendChild(el('path', { d: 'M34,130 L66,150 M366,130 L334,150', fill: 'none', stroke: stroke, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      if(state.type === 'crew' || state.type === 'hoodie'){
        g.appendChild(el('path', { d: 'M96,402 Q200,414 304,402 M54,326 L86,334 M346,334 L380,326', fill: 'none', stroke: stroke, 'stroke-width': 2 }));
      }
      if(state.type === 'hoodie' && view === 'front'){
        g.appendChild(el('path', { d: 'M132,300 L268,300 L284,382 L116,382 Z', fill: 'none', stroke: stroke, 'stroke-width': 2 }));
        g.appendChild(el('path', { d: 'M186,62 L184,122 M214,62 L216,122', fill: 'none', stroke: isDark(color) ? '#ddd' : '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }));
        g.appendChild(el('path', { d: 'M186,62 L184,122 M214,62 L216,122', fill: 'none', stroke: '#000', 'stroke-opacity': .2, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      }
    }

    function clamp(side, view){
      var a = area(view), img = images[side.img]; if(!img) return;
      var maxW = Math.min(a[2], a[3] * img.w / img.h);
      side.w = Math.max(ppi() * 1, Math.min(side.w, maxW));
      var h = side.w * img.h / img.w;
      side.x = Math.max(a[0], Math.min(side.x, a[0] + a[2] - side.w));
      side.y = Math.max(a[1], Math.min(side.y, a[1] + a[3] - h));
    }

    function place(side, view, how, widthIn){
      var a = area(view), img = images[side.img]; if(!img) return;
      side.w = widthIn * ppi(); clamp(side, view);
      if(how === 'left'){ side.x = a[0] + a[2] - side.w - ppi() * 0.5; side.y = a[1] + ppi() * 0.5; }
      else if(how === 'neck' || how === 'upper'){ side.x = a[0] + (a[2] - side.w) / 2; side.y = a[1] + (how === 'neck' ? 0 : ppi()); }
      else { side.x = a[0] + (a[2] - side.w) / 2; side.y = a[1] + (how === 'full' ? 0 : ppi()); }
      side.preset = how; clamp(side, view);
    }

    var drawCount = 0;
    function drawInto(svg, view, opts){
      while(svg.firstChild) svg.removeChild(svg.firstChild);
      var cp = colorPair(), color = cp[1], px = 'mk' + (opts.prefix || '') + (++drawCount) + '_';
      var dfs = defs(px, /heather|marle/i.test(cp[0]), view), ph = photo(view);
      svg.appendChild(dfs);
      var g = el('g', {}); svg.appendChild(g);
      if(ph) return drawPhoto(svg, g, dfs, view, opts, color, px, ph);
      var stroke = base(g, view, color, px);
      var side = state.sides[view], img = side && images[side.img];
      var a = area(view);
      if(img){
        var h = side.w * img.h / img.w;
        var im = el('image', { x: side.x, y: side.y, width: side.w, height: h, preserveAspectRatio: 'xMidYMid meet', 'class': 'design' });
        im.setAttribute('href', opts.dataUrl ? img.data : img.url);
        var wrap = el('g', { 'clip-path': 'url(#' + px + 'clip)' });
        if(!opts.guides) im.setAttribute('filter', 'url(#' + px + 'warp)');
        wrap.appendChild(im); g.appendChild(wrap);
      }
      shading(g, view, color, px);
      trims(g, view, color, stroke);
      if(opts.guides){
        g.appendChild(el('rect', { x: a[0], y: a[1], width: a[2], height: a[3], fill: 'none', stroke: isDark(color) ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.28)', 'stroke-dasharray': '5 5', 'stroke-width': 1.2, rx: 4, 'pointer-events': 'none' }));
        if(img){
          var hh = side.w * img.h / img.w;
          // invisible hit box on top so the design can be dragged through the shading layers
          g.appendChild(el('rect', { x: side.x, y: side.y, width: side.w, height: hh, fill: 'transparent', stroke: '#ff3d7f', 'stroke-width': 1.2, 'stroke-dasharray': '3 3', 'class': 'design hit' }));
        }
      }
      return svg;
    }

    function drawPhoto(svg, g, dfs, view, opts, color, px, ph){
      var box = { x: ph.x, y: ph.y, width: ph.w, height: ph.h, preserveAspectRatio: 'none' };
      var mk = el('mask', { id: px + 'pm', maskUnits: 'userSpaceOnUse', x: 0, y: -20, width: 400, height: 500 });
      var mi = el('image', box); mi.setAttribute('href', psrc(ph.mask)); mk.appendChild(mi); dfs.appendChild(mk);
      var dark = isDark(color), side = state.sides[view], img = side && images[side.img], a = area(view);
      g.appendChild(el('ellipse', { cx: 200, cy: 430, rx: 120, ry: 9, fill: '#000', opacity: '.14', filter: 'url(#' + px + 'shadow)' }));
      g.appendChild(el('rect', { x: 0, y: -20, width: 400, height: 500, fill: color, mask: 'url(#' + px + 'pm)' }));
      if(img){
        var h = side.w * img.h / img.w;
        var im = el('image', { x: side.x, y: side.y, width: side.w, height: h, preserveAspectRatio: 'xMidYMid meet', 'class': 'design' });
        im.setAttribute('href', opts.dataUrl ? img.data : img.url);
        if(!opts.guides) im.setAttribute('filter', 'url(#' + px + 'warp)');
        var wrap = el('g', { mask: 'url(#' + px + 'pm)' }); wrap.appendChild(im); g.appendChild(wrap);
      }
      // real fabric shading from the photo; darker garments get a stronger pass so folds still read
      var sh = el('image', Object.assign({ style: 'mix-blend-mode:multiply', 'pointer-events': 'none' }, box)); sh.setAttribute('href', psrc(ph.shade)); g.appendChild(sh);
      if(dark){
        var sh2 = el('image', Object.assign({ style: 'mix-blend-mode:overlay', opacity: '.4', 'pointer-events': 'none' }, box)); sh2.setAttribute('href', psrc(ph.shade)); g.appendChild(sh2);
      }
      if(opts.guides){
        g.appendChild(el('rect', { x: a[0], y: a[1], width: a[2], height: a[3], fill: 'none', stroke: dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.28)', 'stroke-dasharray': '5 5', 'stroke-width': 1.2, rx: 4, 'pointer-events': 'none' }));
        if(img){
          var hh = side.w * img.h / img.w;
          g.appendChild(el('rect', { x: side.x, y: side.y, width: side.w, height: hh, fill: 'transparent', stroke: '#ff3d7f', 'stroke-width': 1.2, 'stroke-dasharray': '3 3', 'class': 'design hit' }));
        }
      }
      return svg;
    }

    function describe(view){
      var side = state.sides[view], img = side && images[side.img];
      if(!img) return '';
      var h = side.w * img.h / img.w, a = area(view);
      var ctr = (side.x + side.w / 2) - (a[0] + a[2] / 2);
      var horiz = Math.abs(ctr) < ppi() * 0.3 ? 'centered' : (inch(Math.abs(ctr)) + ' in to the ' + ((ctr > 0) === (view === 'front') ? "wearer's left" : "wearer's right"));
      var cl = photo(view) ? photo(view).collar : COLLAR[view];
      var top = isCap() ? '' : ', top ' + inch(side.y - cl) + ' in below the collar';
      return inch(side.w) + ' x ' + inch(h) + ' in, ' + horiz + top + ' (' + img.name + ')';
    }

    function sync(){
      var cp = colorPair();
      document.getElementById('mk_garment').value = images.length ? styleName() : '';
      document.getElementById('mk_color').value = images.length ? cp[0] : '';
      document.getElementById('mk_front').value = describe('front');
      document.getElementById('mk_back').value = isCap() ? '' : describe('back');
      var gc = document.getElementById('garmentColor');
      if(images.length && (!gc.value || gc.dataset.fromMock === '1')){ gc.value = cp[0]; gc.dataset.fromMock = '1'; }
    }

    function swatches(){
      var sw = document.getElementById('mockColors'); while(sw.firstChild) sw.removeChild(sw.firstChild);
      palette().forEach(function(c, i){
        var b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.background = c[1];
        b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c[0]); b.title = c[0];
        b.addEventListener('click', function(){ state.color = i; document.getElementById('garmentColor').dataset.fromMock = '1'; update(); });
        sw.appendChild(b);
      });
    }

    function controls(){
      var cp = colorPair();
      document.getElementById('mockBrandWrap').classList.toggle('hidden', state.type !== 'tee');
      document.querySelectorAll('#mockBrands button').forEach(function(b){ b.classList.toggle('on', b.dataset.brand === state.brand); });
      document.getElementById('mockStyleName').textContent = state.type === 'tee' ? BRANDS[state.brand].style : '';
      document.getElementById('mockColorName').textContent = cp[0];
      document.querySelectorAll('#mockColors .swatch').forEach(function(b, i){ b.classList.toggle('on', i === state.color); b.setAttribute('aria-checked', i === state.color ? 'true' : 'false'); });
      document.querySelectorAll('#mockViews button').forEach(function(b){
        b.classList.toggle('on', b.dataset.view === state.view);
        b.disabled = views().indexOf(b.dataset.view) < 0;
      });
      var sel = document.getElementById('mockImage'); while(sel.firstChild) sel.removeChild(sel.firstChild);
      var none = document.createElement('option'); none.value = ''; none.textContent = 'Nothing on this side'; sel.appendChild(none);
      images.forEach(function(img, i){ var o = document.createElement('option'); o.value = String(i); o.textContent = img.name; sel.appendChild(o); });
      var side = state.sides[state.view]; sel.value = side ? String(side.img) : '';
      var pw = document.getElementById('mockPresets'); while(pw.firstChild) pw.removeChild(pw.firstChild);
      (isCap() ? PRESETS[state.type] : PRESETS[state.view]).forEach(function(p){
        var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.style.border = '0'; b.style.background = 'none'; b.style.padding = '0';
        var s = document.createElement('span'); s.textContent = p[0]; if(side && side.preset === p[1]) { s.style.background = 'var(--ink)'; s.style.color = '#fff'; }
        b.appendChild(s); b.addEventListener('click', function(){ if(!state.sides[state.view]) return; place(state.sides[state.view], state.view, p[1], p[2]); update(); });
        pw.appendChild(b);
      });
      document.getElementById('mockPresetWrap').classList.toggle('hidden', !side);
      document.getElementById('mockSizeWrap').classList.toggle('hidden', !side);
      var range = document.getElementById('mockSize');
      if(side){
        var a = area(), img = images[side.img];
        range.max = String(Math.floor(Math.min(a[2], a[3] * img.w / img.h) / ppi() * 4) / 4);
        range.value = String(inch(side.w));
        document.getElementById('mockSizeLabel').textContent = inch(side.w) + ' in';
      }
      var lines = views().map(function(v){ var d = describe(v); return (v === 'front' ? 'Front: ' : 'Back: ') + (d || 'nothing'); });
      document.getElementById('mockReadout').textContent = lines.join('  |  ');
    }

    function update(){ drawInto(stage, state.view, { guides: true }); controls(); sync(); }

    function setImages(list){
      var picked = list.filter(function(f){ return /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(f.type); }).slice(0, 10);
      var jobs = picked.map(function(f){
        return new Promise(function(done){
          var rd = new FileReader();
          rd.onload = function(){
            var probe = new Image();
            probe.onload = function(){ done({ name: f.name, url: rd.result, data: rd.result, w: probe.naturalWidth || 500, h: probe.naturalHeight || 500 }); };
            probe.onerror = function(){ done(null); };
            probe.src = rd.result;
          };
          rd.onerror = function(){ done(null); };
          rd.readAsDataURL(f);
        });
      });
      return Promise.all(jobs).then(function(res){
        var oldNames = images.map(function(i){ return i.name; });
        images = res.filter(Boolean);
        ['front', 'back'].forEach(function(v){
          var s = state.sides[v];
          if(s){ var idx = images.map(function(i){ return i.name; }).indexOf(oldNames[s.img]); if(idx < 0) state.sides[v] = null; else s.img = idx; }
        });
        if(images.length && !state.sides.front && !state.sides.back){
          state.sides.front = { img: 0 }; place(state.sides.front, 'front', 'center', state.type === 'hat' ? 4 : state.type === 'beanie' ? 3.5 : 10);
        }
        document.getElementById('mockEmpty').classList.toggle('hidden', images.length > 0);
        document.getElementById('mockWrap').classList.toggle('hidden', images.length === 0);
        update();
      });
    }

    function svgPoint(evt){
      var pt = stage.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      return pt.matrixTransform(stage.getScreenCTM().inverse());
    }

    // Build the PNG attached to the quote: every side that has a design, side by side, with sizes
    function snapshot(){
      var sides = views().filter(function(v){ return state.sides[v] && images[state.sides[v].img]; });
      if(!sides.length) return Promise.resolve(null);
      var W = 400 * sides.length, H = 520;
      var root = el('svg', { xmlns: SVGNS, width: W * 2, height: H * 2, viewBox: '0 0 ' + W + ' ' + H });
      root.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#f6f2ec' }));
      sides.forEach(function(v, i){
        var g = el('svg', { x: i * 400, y: 30, width: 400, height: 440, viewBox: '0 0 400 440' });
        drawInto(g, v, { guides: false, dataUrl: true, prefix: 's' + i });
        root.appendChild(g);
        var t = el('text', { x: i * 400 + 200, y: 22, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 16, 'font-weight': 'bold', fill: '#111' });
        t.textContent = v.toUpperCase(); root.appendChild(t);
        var c = el('text', { x: i * 400 + 200, y: 494, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 11, fill: '#333' });
        c.textContent = describe(v).replace(/ \([^)]*\)$/, ''); root.appendChild(c);
      });
      var cap = el('text', { x: W / 2, y: 514, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 11, fill: '#666' });
      cap.textContent = colorPair()[0] + ', ' + styleName() + ' (adult large). Placement guide only, confirmed on your proof.';
      root.appendChild(cap);
      var src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(root));
      return new Promise(function(done){
        var im = new Image();
        im.onload = function(){
          try {
            var cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
            cv.getContext('2d').drawImage(im, 0, 0);
            cv.toBlob(function(b){ done(b ? new File([b], 'mockup.png', { type: 'image/png' }) : null); }, 'image/png');
          } catch(e){ done(null); }
        };
        im.onerror = function(){ done(null); };
        im.src = src;
      });
    }

    function setBrand(key, fromDropdown){
      if(!BRANDS[key]) return;
      var keepName = colorPair()[0];
      state.brand = key;
      var idx = BRANDS[key].colors.map(function(c){ return c[0]; }).indexOf(keepName);
      state.color = idx >= 0 ? idx : 0;
      if(!fromDropdown){ var gs = document.getElementById('garment'); gs.value = BRANDS[key].style; gs.dispatchEvent(new Event('change')); }
      swatches(); update();
    }

    // Wire up controls
    swatches();
    document.querySelectorAll('#mockBrands button').forEach(function(b){ b.addEventListener('click', function(){ setBrand(b.dataset.brand); }); });
    // One garment answer: picking a type in the mockup updates the Garment details dropdown
    var TYPE_PICK = { hoodie: 'Gildan 18500 Heavy Blend Hoodie', crew: 'Gildan 18000 Heavy Blend Crewneck', hat: 'Yupoong 6089 Classic Snapback', beanie: 'Sportsman SP12 Solid 12 Inch Cuffed Beanie', tank: 'Recommend one for me' };
    function typeOf(t){ t = t.toLowerCase(); return /beanie/.test(t) ? 'beanie' : /hoodie/.test(t) ? 'hoodie' : /crewneck/.test(t) ? 'crew' : /hat|snapback|trucker/.test(t) ? 'hat' : /tank/.test(t) ? 'tank' : /tee/.test(t) ? 'tee' : null; }
    function dropdownFollows(){
      var gs = document.getElementById('garment'); if(typeOf(gs.value) === state.type) return;
      gs.value = state.type === 'tee' ? BRANDS[state.brand].style : TYPE_PICK[state.type];
      document.getElementById('otherGarmentWrap').classList.add('hidden');
    }
    document.querySelectorAll('input[name=mk_type]').forEach(function(r){
      r.addEventListener('change', function(e){
        if(e.isTrusted) setTimeout(dropdownFollows, 0);
        var keepName = colorPair()[0];
        state.type = r.value;
        var idx = palette().map(function(c){ return c[0]; }).indexOf(keepName); state.color = idx >= 0 ? idx : 0;
        swatches();
        if(views().indexOf(state.view) < 0) state.view = 'front';
        ['front', 'back'].forEach(function(v){
          var s = state.sides[v]; if(!s) return;
          if(views().indexOf(v) < 0){ state.sides[v] = null; return; }
          var p = (isCap() ? PRESETS[state.type] : PRESETS[v])[0];
          place(s, v, p[1], p[2]);
        });
        if(!state.sides.front && !state.sides.back && images.length){ state.sides.front = { img: 0 }; var p = (isCap() ? PRESETS[state.type] : PRESETS.front)[0]; place(state.sides.front, 'front', p[1], p[2]); }
        update();
      });
    });
    document.querySelectorAll('#mockViews button').forEach(function(b){
      b.addEventListener('click', function(){ if(b.disabled) return; state.view = b.dataset.view; update(); });
    });
    document.getElementById('mockImage').addEventListener('change', function(e){
      var v = e.target.value;
      if(v === ''){ state.sides[state.view] = null; }
      else {
        var keep = state.sides[state.view];
        state.sides[state.view] = { img: parseInt(v, 10) };
        var p = (isCap() ? PRESETS[state.type] : PRESETS[state.view])[0];
        place(state.sides[state.view], state.view, keep && keep.preset ? keep.preset : p[1], keep ? inch(keep.w) : p[2]);
      }
      update();
    });
    document.getElementById('mockSize').addEventListener('input', function(e){
      var s = state.sides[state.view]; if(!s) return;
      var img = images[s.img], cx = s.x + s.w / 2, oldH = s.w * img.h / img.w;
      s.w = parseFloat(e.target.value) * ppi(); s.x = cx - s.w / 2; s.y = s.y + oldH / 2 - (s.w * img.h / img.w) / 2;
      s.preset = null; clamp(s, state.view); update();
    });
    stage.addEventListener('pointerdown', function(e){
      var s = state.sides[state.view]; if(!s || !e.target.classList.contains('design')) return;
      var p = svgPoint(e); drag = { dx: p.x - s.x, dy: p.y - s.y };
      e.target.classList.add('dragging'); stage.setPointerCapture(e.pointerId); e.preventDefault();
    });
    stage.addEventListener('pointermove', function(e){
      if(!drag) return; var s = state.sides[state.view]; var p = svgPoint(e);
      s.x = p.x - drag.dx; s.y = p.y - drag.dy; s.preset = null; clamp(s, state.view);
      stage.querySelectorAll('.design').forEach(function(n){ n.setAttribute('x', s.x); n.setAttribute('y', s.y); });
    });
    function endDrag(){ if(!drag) return; drag = null; update(); }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    // One garment answer: the color box and the swatches always agree (last change wins)
    document.getElementById('garmentColor').addEventListener('input', function(){
      this.dataset.fromMock = '0';
      var want = this.value.trim().toLowerCase(), idx = palette().map(function(c){ return c[0].toLowerCase(); }).indexOf(want);
      if(idx > -1 && idx !== state.color){ state.color = idx; update(); }
    });

    // Follow the garment dropdown when it names a type or one of the four tee brands
    document.getElementById('garment').addEventListener('change', function(){
      var t = this.value.toLowerCase(), want = /beanie/.test(t) ? 'beanie' : /hoodie/.test(t) ? 'hoodie' : /crewneck/.test(t) ? 'crew' : /hat|snapback|trucker/.test(t) ? 'hat' : /tank/.test(t) ? 'tank' : /tee/.test(t) ? 'tee' : null;
      if(want){ var r = document.querySelector('input[name=mk_type][value=' + want + ']'); if(r && !r.checked){ r.checked = true; r.dispatchEvent(new Event('change')); } }
      var b = /as colour/.test(t) ? 'ascolour' : /gildan 5000/.test(t) ? 'gildan' : /bella/.test(t) && /tee/.test(t) ? 'bella' : /next level/.test(t) ? 'nextlevel' : null;
      if(b && b !== state.brand) setBrand(b, true);
    });

    return { setImages: setImages, snapshot: snapshot };
  })();

  /* Uploads with previews */
  var drop = document.getElementById('drop');
  var fileInput = document.getElementById('fileInput');
  var previews = document.getElementById('previews');
  var files = [];
  var MAX_FILES = 10, MAX_SIZE = 10 * 1024 * 1024;
  /* Same file types the server accepts, so nothing else is ever sent */
  var OK_EXT = /\.(png|jpe?g|svg|heic|heif|webp|gif|pdf|ai|eps|psd)$/i;
  var uploadNote = document.getElementById('uploadNote');
  function note(n, text){ n.textContent = text; n.classList.toggle('hidden', !text); }
  function syncInput(){}
  function render(){
    while(previews.firstChild) previews.removeChild(previews.firstChild);
    files.forEach(function(f, idx){
      var pv = document.createElement('div'); pv.className = 'pv';
      if(f.type.indexOf('image/') === 0 && f.type !== 'image/heic'){
        var img = document.createElement('img'); img.src = URL.createObjectURL(f); img.alt = f.name; pv.appendChild(img);
      } else {
        var d = document.createElement('div'); d.className = 'doc'; d.textContent = '📄'; pv.appendChild(d);
      }
      var nm = document.createElement('div'); nm.className = 'fname'; nm.textContent = f.name; pv.appendChild(nm);
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label','Remove ' + f.name);
      x.onclick = function(){ files.splice(idx,1); syncInput(); render(); };
      pv.appendChild(x);
      previews.appendChild(pv);
    });
    mock.setImages(files);
    if(window.Cre8Engrave) window.Cre8Engrave.setImages(files);
  }
  function addFiles(list){
    var problems = [];
    Array.prototype.forEach.call(list, function(f){
      if(files.length >= MAX_FILES){ problems.push('Max ' + MAX_FILES + ' files.'); return; }
      if(!OK_EXT.test(f.name)){ problems.push(f.name + ' is not a supported file type.'); return; }
      if(f.size > MAX_SIZE){ problems.push(f.name + ' is over 10MB. Email it to us after you submit.'); return; }
      files.push(f);
    });
    note(uploadNote, problems.filter(function(p, i){ return problems.indexOf(p) === i; }).join(' '));
    syncInput(); render();
  }
  drop.addEventListener('click', function(){ fileInput.click(); });
  drop.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fileInput.click(); }});
  fileInput.addEventListener('change', function(){ var picked = Array.prototype.slice.call(fileInput.files); fileInput.value=''; addFiles(picked); });
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function(e){ addFiles(e.dataTransfer.files); });

  /* Submit: save the form, upload each file to the backend, then trigger the emails */
  var form = document.getElementById('orderForm');
  var status = document.getElementById('sendStatus');
  function postJSON(url, body, extra){
    var h = {'Content-Type':'application/json'}; if(extra) for(var k in extra) h[k] = extra[k];
    return fetch(url, { method:'POST', headers:h, body: body ? JSON.stringify(body) : '{}' })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.message || 'Could not send right now.'); return j; }); });
  }
  /* The artwork rights box is only required once something is uploaded */
  function rightsRule(){
    var rb = document.getElementById('rights'), has = !!document.querySelector('#previews > *');
    if(rb){ rb.required = has; var st = document.getElementById('rightsReq'); if(st) st.classList.toggle('hidden', !has); if(!has) cre8Mark(rb); }
  }
  var pv = document.getElementById('previews'); if(pv && 'MutationObserver' in window) new MutationObserver(rightsRule).observe(pv, {childList:true});
  /* Optional single-choice questions can be cleared by tapping the picked chip again */
  var md = document.getElementById('moreDetails');
  if(md) md.querySelectorAll('input[type=radio]').forEach(function(rd){
    var was = false;
    rd.closest('label').addEventListener('pointerdown', function(){ was = rd.checked; });
    rd.addEventListener('click', function(){ if(was){ rd.checked = false; was = false; rd.dispatchEvent(new Event('change', {bubbles:true})); } });
  });
  function checkForm(){ rightsRule(); return cre8Validate(form, document.getElementById('sendError')); }
  /* Required items counter */
  function reqCount(){
    var req = Array.prototype.filter.call(form.querySelectorAll('input,select,textarea'), function(el){ return el.required && el.willValidate; });
    var done = req.filter(function(el){ return el.checkValidity(); }).length, rc = document.getElementById('reqCount');
    if(rc) rc.textContent = done === req.length ? 'All required items done. Add anything else you like, then send.' : done + ' of ' + req.length + ' required items done';
  }
  form.addEventListener('input', reqCount); form.addEventListener('change', reqCount); setTimeout(reqCount, 0);
  /* Price guide shows the prices for what was picked */
  var PRICES = { 'Apparel': 'shirts from $12, hoodies from $25', 'Hats': 'hats from $17', 'Beanies': 'beanies from $17', 'Tumblers / Drinkware': 'mugs from $10, tumblers from $14', 'Journals / Notebooks': 'journals from $21', 'Wood (signs, puzzles, plaques)': 'wood from $23', 'Stickers / Decals': 'stickers 25 for $22' };
  function priceGuide(){
    var pg = document.getElementById('priceGuide'); if(!pg) return;
    var picked = Array.prototype.filter.call(form.querySelectorAll('input[name="product[]"]:checked'), function(b){ return PRICES[b.value]; }).map(function(b){ return PRICES[b.value]; });
    pg.firstChild.textContent = picked.length ? 'Per piece, one design: ' + picked.join('; ') + '. Bulk orders cost less per piece. ' : 'Per piece, one design, from $10. Pick what we are decorating to see your prices. ';
  }
  form.addEventListener('change', function(e){ if(e.target.name === 'product[]') priceGuide(); }); setTimeout(priceGuide, 0);
  cre8Live(form);

  /* Draft autosave: a reload or app switch does not wipe the form */
  var DKEY = 'cre8-order-draft';
  function saveDraft(){
    var d = {};
    form.querySelectorAll('input,select,textarea').forEach(function(el){
      if(!el.name || el.type === 'file' || el.name === 'website' || el.type === 'hidden') return;
      if(el.type === 'checkbox' || el.type === 'radio'){ if(el.checked) (d[el.name] = d[el.name] || []).push(el.value); }
      else if(el.value) d[el.name] = el.value;
    });
    try{ localStorage.setItem(DKEY, JSON.stringify(d)); }catch(_){}
  }
  function clearOrder(){
    var keep = null; try{ keep = localStorage.getItem(DKEY); }catch(_){}
    try{ localStorage.removeItem(DKEY); }catch(_){}
    form.reset();
    form.querySelectorAll('input[type=checkbox],input[type=radio]').forEach(function(el){ el.dispatchEvent(new Event('change', {bubbles:true})); });
    form.querySelectorAll('[aria-invalid]').forEach(function(el){ cre8Mark(el); });
    var dn = document.getElementById('draftNote'); if(dn) dn.classList.add('hidden');
    try{ localStorage.removeItem(DKEY); }catch(_){}
    window.scrollTo({ top: document.getElementById('create').offsetTop - 80, behavior: 'smooth' });
    if(keep){
      var dn2 = document.getElementById('draftNote'); while(dn2.firstChild) dn2.removeChild(dn2.firstChild);
      dn2.appendChild(document.createTextNode('Form cleared. '));
      var ub = document.createElement('button'); ub.type = 'button'; ub.textContent = 'Undo';
      ub.addEventListener('click', function(){ try{ localStorage.setItem(DKEY, keep); }catch(_){} location.reload(); });
      dn2.appendChild(ub); dn2.classList.remove('hidden');
      form.addEventListener('input', function hideU(){ dn2.classList.add('hidden'); form.removeEventListener('input', hideU); });
    }
    reqCount && setTimeout(reqCount, 0);
  }
  document.getElementById('orderReset').addEventListener('click', clearOrder);
  /* Same phone rule as the contact page: Text or Call needs a number */
  (function(){
    var ph = document.getElementById('phone'); if(!ph) return;
    var rule = function(){ var p = form.querySelector('input[name=contact_preference]:checked'); ph.required = !!(p && p.value !== 'Email'); var l = ph.closest('.field').querySelector('label'); if(l) l.innerHTML = ph.required ? 'Phone <span class="req">*</span>' : 'Phone'; if(!ph.required) cre8Mark(ph); };
    form.querySelectorAll('input[name=contact_preference]').forEach(function(x){ x.addEventListener('change', rule); }); rule();
  })();
  (function restoreDraft(){
    var d; try{ d = JSON.parse(localStorage.getItem(DKEY) || 'null'); }catch(_){}
    if(!d) return;
    var any = Object.keys(d).some(function(k){ return k !== 'contact_preference' && k !== 'finish' && k !== 'delivery'; });
    if(any){ var dn = document.getElementById('draftNote'); if(dn){ dn.textContent = 'We restored your unsent request. '; var cb = document.createElement('button'); cb.type = 'button'; cb.textContent = 'Clear it'; cb.addEventListener('click', clearOrder); dn.appendChild(cb); dn.classList.remove('hidden'); } }
    form.querySelectorAll('input,select,textarea').forEach(function(el){
      if(!(el.name in d) || el.type === 'file') return;
      if(el.type === 'checkbox' || el.type === 'radio'){ var on = d[el.name].indexOf(el.value) > -1; if(on !== el.checked){ el.checked = on; el.dispatchEvent(new Event('change', {bubbles:true})); } }
      else { el.value = d[el.name]; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }
    });
  })();
  form.addEventListener('input', saveDraft); form.addEventListener('change', saveDraft);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    if(!checkForm()) return;
    var btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.textContent = 'Sending...';
    note(document.getElementById('sendError'), '');
    var body = {};
    new FormData(form).forEach(function(v, k){
      if(v instanceof File) return;
      if(k.slice(-2) === '[]'){ k = k.slice(0,-2); (body[k] = body[k] || []).push(v); } else body[k] = v;
    });
    var quote;
    postJSON(API + '/api/cre8/quote', body)
      .then(function(q){
        quote = q;
        return files.reduce(function(p, f, i){
          return p.then(function(){
            status.textContent = 'Uploading file ' + (i+1) + ' of ' + files.length + '...';
            return fetch(API + '/api/cre8/quote/' + encodeURIComponent(q.id) + '/file', {
              method:'POST', headers:{ 'Content-Type': f.type || 'application/octet-stream', 'X-Cre8-Token': q.token, 'X-File-Name': encodeURIComponent(f.name) }, body: f
            }).then(function(r){ if(!r.ok) return r.json().catch(function(){return {};}).then(function(j){ throw new Error((j.message || 'Upload failed') + ' (' + f.name + ')'); }); });
          });
        }, Promise.resolve());
      })
      .then(function(){
        if(document.getElementById('mockSection').classList.contains('hidden')) return;
        return mock.snapshot().then(function(mf){
          if(!mf || files.length >= MAX_FILES) return;
          status.textContent = 'Attaching your mockup...';
          return fetch(API + '/api/cre8/quote/' + encodeURIComponent(quote.id) + '/file', {
            method:'POST', headers:{ 'Content-Type':'image/png', 'X-Cre8-Token': quote.token, 'X-File-Name': 'mockup.png' }, body: mf
          }).catch(function(){});
        }).catch(function(){});
      })
      .then(function(){
        var es = document.getElementById('engraveSection');
        if(!es || es.classList.contains('hidden') || !window.Cre8Engrave) return;
        return window.Cre8Engrave.snapshot().then(function(ef){
          if(!ef) return;
          status.textContent = 'Attaching your engraving mockup...';
          return fetch(API + '/api/cre8/quote/' + encodeURIComponent(quote.id) + '/file', {
            method:'POST', headers:{ 'Content-Type':'image/png', 'X-Cre8-Token': quote.token, 'X-File-Name': 'engraving-mockup.png' }, body: ef
          }).catch(function(){});
        }).catch(function(){});
      })
      .then(function(){ status.textContent = 'Finishing up...'; return postJSON(API + '/api/cre8/quote/' + encodeURIComponent(quote.id) + '/done', null, { 'X-Cre8-Token': quote.token }); })
      .then(function(){
        document.getElementById('quoteNum').textContent = '#' + quote.id;
        try{ localStorage.removeItem(DKEY); }catch(_){}
        form.classList.add('hidden');
        document.getElementById('success').classList.remove('hidden');
        document.getElementById('create').scrollIntoView({behavior:'smooth'});
      })
      .catch(function(err){
        note(document.getElementById('sendError'), err.message + ' Please try again, or call or text 732-720-9211.');
        btn.disabled = false; btn.textContent = 'Send for My Free Mockup';
        status.textContent = 'We reply with a mockup and quote, usually within 1 business day.';
      });
  });

    /* Deep links: /how-it-works?make=hats&method=Embroidery#create preselects the order */
    var MAKE = { shirts: ['Apparel', 'tee'], hoodies: ['Apparel', 'hoodie'], hats: ['Hats', 'hat'], beanies: ['Beanies', 'beanie'], tumblers: ['Tumblers / Drinkware'], mugs: ['Tumblers / Drinkware'],
      wood: ['Wood (signs, puzzles, plaques)'], stickers: ['Stickers / Decals'], signs: ['Signs / Banners'], journals: ['Journals / Notebooks'], own: ['Your Own Item'] };
    window.cre8Preselect = function(make, method){
      var m = MAKE[make];
      var lab = m && document.querySelector('input[name="product[]"][value="' + m[0] + '"]');
      var pn = document.getElementById('draftNote');
      if(pn && (lab || method)){
        var txt = 'Set up for ' + [lab ? lab.closest('label').textContent.trim() : '', method || ''].filter(Boolean).join(', ') + '. Change it any time below.';
        if(pn.classList.contains('hidden')) pn.textContent = txt; else pn.insertBefore(document.createTextNode(txt + ' '), pn.firstChild);
        pn.classList.remove('hidden');
      }
      if(m){
        document.querySelectorAll('input[name="product[]"]').forEach(function(b){
          if(b.value === m[0] && !b.checked){ b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        if(m[1]){ var r = document.querySelector('input[name=mk_type][value=' + m[1] + ']'); if(r && !r.checked){ r.checked = true; r.dispatchEvent(new Event('change')); } }
      }
      if(method){
        document.querySelectorAll('input[name=method]').forEach(function(r){ if(r.value === method) r.checked = true; });
        var md = document.getElementById('moreDetails'); if(md && document.querySelector('input[name=method]:checked')) md.open = true;
      }
    };
    var qp = new URLSearchParams(location.search);
    if(qp.get('make') || qp.get('method')) window.cre8Preselect(qp.get('make'), qp.get('method'));

    /* Website demo only (?demo=1&sample=1): put a sample logo with the visitor's business name on the shirt,
       so someone shopping for a website sees the tool working without needing a design of their own */
    var SAMPLE = 'sample-logo.png';
    function sampleLogo(name){
      name = String(name || '').trim().slice(0, 28) || 'Your Brand';
      var cv = document.createElement('canvas'); cv.width = 1200; cv.height = 900;
      var c = cv.getContext('2d'), font = '"Archivo Black", Impact, sans-serif';
      var words = name.toUpperCase().split(/\s+/), lines = [words.join(' ')];
      c.font = '200px ' + font;
      if(words.length > 1 && c.measureText(lines[0]).width > 1100){
        var best = 1, gap = 1e9;
        for(var i = 1; i < words.length; i++){ var d = Math.abs(c.measureText(words.slice(0, i).join(' ')).width - c.measureText(words.slice(i).join(' ')).width); if(d < gap){ gap = d; best = i; } }
        lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
      }
      var widest = Math.max.apply(null, lines.map(function(l){ return c.measureText(l).width; }));
      var size = Math.min(lines.length > 1 ? 230 : 260, 200 * 1100 / widest);
      var g = c.createLinearGradient(0, 0, 1200, 0); g.addColorStop(0, '#ff3d7f'); g.addColorStop(1, '#ffb020');
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = size + 'px ' + font; c.lineJoin = 'round';
      var top = 450 - (lines.length - 1) * size * 0.55;
      lines.forEach(function(l, k){ var y = top + k * size * 1.1; c.lineWidth = size * 0.12; c.strokeStyle = '#111014'; c.strokeText(l, 600, y); c.fillStyle = g; c.fillText(l, 600, y); });
      var below = top + (lines.length - 1) * size * 1.1 + size * 0.75;
      c.fillStyle = g; c.fillRect(250, below, 700, 14);
      c.font = '60px ' + font; c.lineWidth = 9; c.strokeStyle = '#111014'; c.strokeText('EST. ' + new Date().getFullYear(), 600, below + 75); c.fillStyle = '#ffffff'; c.fillText('EST. ' + new Date().getFullYear(), 600, below + 75);
      /* trim the empty margins so the logo fills the print area */
      var px = c.getImageData(0, 0, 1200, 900).data, x0 = 1200, y0 = 900, x1 = 0, y1 = 0;
      for(var yy = 0; yy < 900; yy += 2) for(var xx = 0; xx < 1200; xx += 2) if(px[(yy * 1200 + xx) * 4 + 3] > 8){ if(xx < x0) x0 = xx; if(xx > x1) x1 = xx; if(yy < y0) y0 = yy; if(yy > y1) y1 = yy; }
      if(x1 > x0){ var out = document.createElement('canvas'); out.width = x1 - x0 + 24; out.height = y1 - y0 + 24; out.getContext('2d').drawImage(cv, x0 - 12, y0 - 12, out.width, out.height, 0, 0, out.width, out.height); cv = out; }
      return new Promise(function(done){ cv.toBlob(function(b){ done(new File([b], SAMPLE, { type: 'image/png' })); }, 'image/png'); });
    }
    window.cre8Sample = function(name){
      var load = document.fonts && document.fonts.load ? document.fonts.load('60px "Archivo Black"').catch(function(){}) : Promise.resolve();
      return load.then(function(){ return sampleLogo(name); }).then(function(f){
        for(var i = files.length - 1; i >= 0; i--) if(files[i].name === SAMPLE) files.splice(i, 1);
        files.unshift(f); syncInput(); render();
      });
    };
    if(qp.get('demo') && qp.get('sample')) window.cre8Sample(qp.get('name'));
  })();

  if(document.getElementById('reviews')) fetch(API + '/api/google-reviews?place=cre8', { cache:'no-cache' })
    .then(function(r){ if(!r.ok) throw new Error(); return r.json(); })
    .then(function(d){
      if(!d.reviews || !d.reviews.length) return;
      document.getElementById('gRating').textContent = Number(d.rating).toFixed(1);
      document.getElementById('gStars').textContent = stars(d.rating);
      document.getElementById('gCount').textContent = d.count + ' Google review' + (d.count === 1 ? '' : 's');
      var gs = document.getElementById('gScore'); if(gs) gs.classList.remove('hidden');
      var grid = document.getElementById('gReviews'); clear(grid);
      d.reviews.slice(0, 5).forEach(function(v){
        var card = el('div', 'rcard');
        card.appendChild(el('div', 'stars', stars(Number(v.rating) || 0)));
        card.appendChild(el('p', null, v.text));
        var who = el('div', 'who'), photo = googleUrl(v.photo);
        if(photo){ var im = el('img'); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = function(){ this.remove(); }; im.src = photo; who.appendChild(im); }
        var nm = el('div', null, v.name); nm.appendChild(el('div', 'src', (v.when || '') + ' on Google')); who.appendChild(nm);
        card.appendChild(who); grid.appendChild(card);
      });
      var read = document.getElementById('readReviews'), mapUrl = googleUrl(d.url);
      if(mapUrl) read.href = mapUrl; // otherwise keep the profile link already in the page
      if(GOOGLE_REVIEW_LINK){ var lv = document.getElementById('leaveReview'); lv.href = GOOGLE_REVIEW_LINK; lv.classList.remove('hidden'); }
      document.getElementById('reviews').classList.remove('hidden');
    })
    .catch(function(){});

  /* Work photos from the Google listing, owner uploads first; Google requires the credit line on each */
  var gPhotos = document.getElementById('gallery');
  if(gPhotos && gPhotos.dataset.googlePhotos) fetch(API + '/api/google-photos?place=cre8', { cache:'no-cache' })
    .then(function(r){ if(!r.ok) throw new Error(); return r.json(); })
    .then(function(d){
      if(!d.photos || !d.photos.length) return;
      /* Same photos as the Apparel section, but Google holds the full-size originals, so they replace it */
      var good = d.photos.filter(function(ph){ return googleUrl(ph.url); });
      if(!good.length) return;
      /* Google photo links expire. Load each one first and only swap out our own photos once enough of them
         actually load, so a stale or blocked link never leaves an empty gap in the gallery. */
      var gal = document.getElementById('gallery'), loaded = [], left = good.length, swapped = false;
      function build(ph, im){
        var item = el('div', 'gitem');
        im.alt = "Custom work by Can't Wait to Cre8"; item.appendChild(im);
        if(ph.author){
          var tag = el('span', 'tag', 'Photo: '), link = googleUrl(ph.authorUrl);
          if(link){ var a = el('a', null, ph.author); a.href = link; a.target = '_top'; a.rel = 'noopener noreferrer'; a.style.color = '#fff'; tag.appendChild(a); }
          else tag.appendChild(document.createTextNode(ph.author));
          item.appendChild(tag);
        }
        return item;
      }
      function finish(){
        if(swapped || left > 0) return;
        swapped = true;
        var keep = good.map(function(ph, i){ return loaded[i] ? build(ph, loaded[i]) : null; }).filter(Boolean);
        if(keep.length < 3) return; // too few came through: keep our own photos
        clear(gal); keep.forEach(function(n){ gal.appendChild(n); });
      }
      good.forEach(function(ph, i){
        var im = new Image(); im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
        im.onload = function(){ if(im.naturalWidth > 0) loaded[i] = im; left--; finish(); };
        im.onerror = function(){ left--; finish(); };
        im.src = googleUrl(ph.url);
      });
      setTimeout(function(){ left = 0; finish(); }, 8000); // a hung photo never blocks the swap
    })
    .catch(function(){});

  /* ===== Land on the right section: when a page opens at #create or #work, photos and reviews load afterwards
     and push that section down. Keep it pinned under the menu until the visitor scrolls or taps themselves. ===== */
  (function(){
    var id = location.hash.slice(1), t = id && document.getElementById(id);
    if(!t) return;
    var stopped = false, stop = function(){ stopped = true; };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function(ev){ window.addEventListener(ev, stop, { passive: true, once: true }); });
    var pin = function(){
      if(stopped) return;
      var margin = parseFloat(getComputedStyle(t).scrollMarginTop) || 0, top = t.getBoundingClientRect().top;
      if(Math.abs(top - margin) > 4) t.scrollIntoView({ block: 'start' });
    };
    if('ResizeObserver' in window){ var ro = new ResizeObserver(pin); ro.observe(document.body); setTimeout(function(){ ro.disconnect(); }, 8000); cleanups.push(function(){ ro.disconnect(); stopped = true; }); }
    window.addEventListener('load', pin);
    setTimeout(pin, 50);
  })();

  /* ===== Nav: mark the current page, phone menu ===== */
  var page = document.body.dataset.page;
  document.querySelectorAll('.navlinks [data-nav]').forEach(function(a){
    if(a.dataset.nav === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  /* ===== Scroll reveal ===== */
  var reveals = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var sib = en.target.parentElement ? Array.prototype.indexOf.call(en.target.parentElement.children, en.target) : 0;
        en.target.style.transitionDelay = Math.min(sib, 6) * 70 + 'ms';
        en.target.classList.add('in'); io.unobserve(en.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function(n){ io.observe(n); });
    cleanups.push(function(){ io.disconnect(); });
  } else reveals.forEach(function(n){ n.classList.add('in'); });

  /* ===== How it works: steps progress bar fills as you scroll past the steps ===== */
  var stepsEl = document.getElementById('steps'), stepsFill = document.getElementById('stepsFill');
  if(stepsEl && stepsFill){
    var onScroll = function(){
      var r = stepsEl.getBoundingClientRect(), vh = window.innerHeight;
      var p = Math.max(0, Math.min(1, (vh - r.top) / (vh * .6 + r.height)));
      stepsFill.style.width = (p * 100) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    cleanups.push(function(){ window.removeEventListener('scroll', onScroll); });
  }

  /* ===== What we do: tabs switch animated scenes; auto-advance until the visitor taps ===== */
  var showcase = document.getElementById('showcase');
  if(showcase){
    var tabs = showcase.querySelectorAll('.wwd-tabs button'), scenes = showcase.querySelectorAll('.scene'), panels = showcase.querySelectorAll('.wwd-panel');
    var swatchRow = document.getElementById('scSwatches'), current = 'apparel', auto = null, touched = false;
    var showScene = function(name){
      current = name;
      tabs.forEach(function(t){ var on = t.dataset.scene === name; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      panels.forEach(function(p){ p.classList.toggle('on', p.dataset.scene === name); });
      scenes.forEach(function(s){
        var on = s.dataset.scene === name;
        s.classList.remove('play'); s.classList.toggle('show', on);
        if(on){ void s.getBoundingClientRect(); s.classList.add('play'); }
      });
      swatchRow.style.display = name === 'apparel' ? 'flex' : 'none';
    };
    tabs.forEach(function(t){ t.addEventListener('click', function(){ touched = true; clearInterval(auto); showScene(t.dataset.scene); }); });
    var tlist = Array.prototype.slice.call(tabs);
    tlist.forEach(function(t, i){
      var p = showcase.querySelector('.wwd-panel[data-scene="' + t.dataset.scene + '"]');
      t.id = 'tab-' + t.dataset.scene; if(p){ p.id = 'panel-' + t.dataset.scene; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', t.id); t.setAttribute('aria-controls', p.id); }
      t.addEventListener('keydown', function(e){
        var k = e.key, n = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? tlist.length - 1 : null;
        if(n === null) return; e.preventDefault(); n = (n + tlist.length) % tlist.length; tlist[n].focus(); tlist[n].click();
      });
    });
    var rove = function(){ tlist.forEach(function(t){ t.tabIndex = t.classList.contains('on') ? 0 : -1; }); };
    var _show = showScene; showScene = function(nm){ _show(nm); rove(); }; rove();
    // tapping the scene replays it
    scenes.forEach(function(s){ s.addEventListener('click', function(){ touched = true; clearInterval(auto); showScene(current); }); });
    swatchRow.querySelectorAll('button').forEach(function(b, i){
      if(i === 0) b.classList.add('on');
      b.addEventListener('click', function(){
        touched = true; clearInterval(auto);
        swatchRow.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
        document.getElementById('scGarment').style.fill = b.style.background;
      });
    });
    showScene('apparel');
    cleanups.push(function(){ clearInterval(auto); touched = true; if(typeof sio !== 'undefined' && sio) sio.disconnect(); });
    var names = Array.prototype.map.call(tabs, function(t){ return t.dataset.scene; });
    var startAuto = function(){
      if(touched || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
      auto = setInterval(function(){ if(touched) return clearInterval(auto); showScene(names[(names.indexOf(current) + 1) % names.length]); }, 6000);
    };
    if('IntersectionObserver' in window){
      var sio = new IntersectionObserver(function(en){ if(en[0].isIntersecting){ startAuto(); sio.disconnect(); } }, { threshold: .4 });
      sio.observe(showcase);
    }
    // "Start a ... order" buttons preselect the form on this page instead of reloading
    showcase.querySelectorAll('.wwd-panel a[data-make]').forEach(function(a){
      a.addEventListener('click', function(e){
        if(!window.cre8Preselect) return;
        e.preventDefault();
        window.cre8Preselect(a.dataset.make, a.dataset.method);
        var target = document.getElementById('create'); if(target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if(history.replaceState) history.replaceState(null, '', location.pathname + '#create');
      });
    });
  }

  /* ===== Work filters ===== */
  var filters = document.getElementById('workFilters');
  if(filters){
    filters.addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return;
      filters.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
      document.querySelectorAll('.work-group').forEach(function(g){ g.classList.toggle('dim', b.dataset.filter !== 'all' && g.dataset.group !== b.dataset.filter); });
    });
  }


  /* ===== Websites: package builder with live totals ===== */
  var builder = document.getElementById('builder');
  if(builder){
    var money = function(n){ return '$' + Math.round(n).toLocaleString('en-US'); };
    var extraPages = 0, last = {};
    var pick = function(name){ return builder.querySelector('input[name=' + name + ']:checked'); };
    var bump = function(id, val){
      var n = document.getElementById(id); if(n.textContent === val) return;
      n.textContent = val; n.classList.add('bump'); setTimeout(function(){ n.classList.remove('bump'); }, 200);
    };
    var calc = function(){
      var pkg = pick('b_pkg'), care = pick('b_care');
      var adds = Array.prototype.slice.call(builder.querySelectorAll('input[name=b_add]:checked'));
      var pagesEl = builder.querySelector('.addon.pages'), pgPrice = Number(pagesEl.dataset.price), pgStd = Number(pagesEl.dataset.standard);
      var addSum = adds.reduce(function(t, a){ return t + Number(a.dataset.price); }, 0) + extraPages * pgPrice;
      var addStd = adds.reduce(function(t, a){ return t + Number(a.dataset.standard || a.dataset.price); }, 0) + extraPages * pgStd;
      var local = document.getElementById('bLocal'), hasLocal = !!(local && local.checked);
      var setup = Number(pkg.dataset.price), up = setup + addSum, mo = hasLocal ? Number(local.dataset.price) : Number(care.dataset.price);
      builder.querySelector('.care').classList.toggle('care-off', hasLocal);
      var ln = document.getElementById('btLocalNote'); if(ln) ln.classList.toggle('hidden', !hasLocal);
      bump('btSetup', (pkg.value === 'signature' ? 'from ' : '') + money(setup));
      bump('btAdds', money(addSum));
      bump('btUpfront', (pkg.value === 'signature' ? 'from ' : '') + money(up));
      bump('btCare', hasLocal ? 'from ' + money(mo) + '/mo' : mo ? money(mo) + '/mo' : 'None');
      var cm = document.getElementById('btCareM'); if(cm) cm.textContent = (hasLocal ? '+ from ' + money(mo) + '/mo Local Search' : mo ? '+ ' + money(mo) + '/mo care' : 'No care plan') + ', first year ' + ((hasLocal || pkg.value === 'signature') ? 'from ' : '') + money(up + mo * 11);
      var note = document.getElementById('btNote');
      if(note) note.lastChild.textContent = mo ? '), 50% at launch. First month of care is free. Hosting and domain are in your name and billed to you directly by those providers.' : '), 50% at launch. No care plan: upkeep is yours after launch, and later fixes or edits are $85/hour, 1 hour minimum. Hosting and domain are in your name and billed to you directly.';
      var fromY = (hasLocal || pkg.value === 'signature') ? 'from ' : '';
      bump('btYear', fromY + money(up + mo * 11));
      var pn = document.getElementById('btPkgName'); if(pn) pn.textContent = pkg.dataset.label + ' + ' + (hasLocal ? 'Local Search' : care.dataset.label);
      bump('btDeposit', money(up / 2));
      var stdYear = Number(pkg.dataset.standard) + addStd + (hasLocal ? mo : Number(care.dataset.standard)) * 11;
      bump('btSave', money(stdYear - (up + mo * 11)));
      document.getElementById('pgCount').textContent = extraPages;
      var names = adds.map(function(a){ return a.dataset.label; }); if(extraPages) names.push(extraPages + ' extra page' + (extraPages > 1 ? 's' : ''));
      last = { text: pkg.dataset.label + ' (' + (pkg.value === 'signature' ? 'from ' : '') + money(setup) + ') + ' + (hasLocal ? 'Local Search (from ' + money(mo) + '/mo, includes Plus Care)' : care.dataset.label + (mo ? ' (' + money(mo) + '/mo)' : '')) + (names.length ? ' + ' + names.join(', ') : '') + '. Founding client pricing: estimated upfront ' + money(up) + ', first year ' + money(up + mo * 11) + '.' };
      var f = document.getElementById('s_pkg'); if(f) f.value = last.text;
    };
    var BKEY = 'cre8-builder';
    var saveB = function(){
      var d = { pkg: pick('b_pkg').value, care: pick('b_care').value, adds: Array.prototype.map.call(builder.querySelectorAll('input[name=b_add]:checked'), function(a){ return a.value; }), pages: extraPages, local: !!(document.getElementById('bLocal') || {}).checked, prevCare: builder.dataset.prevCare || '' };
      try{ localStorage.setItem(BKEY, JSON.stringify(d)); }catch(_){}
    };
    (function(){
      var d; try{ d = JSON.parse(localStorage.getItem(BKEY) || 'null'); }catch(_){}
      if(!d) return;
      var set = function(name, v){ var i = builder.querySelector('input[name=' + name + '][value="' + v + '"]'); if(i) i.checked = true; };
      set('b_pkg', d.pkg); set('b_care', d.care); (d.adds || []).forEach(function(v){ set('b_add', v); });
      extraPages = d.pages || 0; var bl = document.getElementById('bLocal'); if(bl) bl.checked = !!d.local;
      if(d.prevCare) builder.dataset.prevCare = d.prevCare;
      if((d.adds && d.adds.length) || d.pages){ var ex = document.getElementById('extras'); if(ex) ex.open = true; }
    })();
    (function(){
      var q = new URLSearchParams(location.search); if(!q.get('pkg')) return;
      var set = function(name, v){ var i = builder.querySelector('input[name=' + name + '][value="' + v + '"]'); if(i) i.checked = true; };
      set('b_pkg', q.get('pkg')); if(q.get('care')) set('b_care', q.get('care'));
      (q.get('add') || '').split(',').forEach(function(v){ if(v) set('b_add', v); });
      extraPages = parseInt(q.get('pages'), 10) || 0; var bl = document.getElementById('bLocal'); if(bl) bl.checked = q.get('local') === '1';
      if(q.get('add') || extraPages){ var ex = document.getElementById('extras'); if(ex) ex.open = true; }
    })();
    var shareURL = function(){
      var p = new URLSearchParams(); p.set('pkg', pick('b_pkg').value); p.set('care', pick('b_care').value);
      var ad = Array.prototype.map.call(builder.querySelectorAll('input[name=b_add]:checked'), function(a){ return a.value; }); if(ad.length) p.set('add', ad.join(','));
      if(extraPages) p.set('pages', extraPages); if((document.getElementById('bLocal') || {}).checked) p.set('local', '1');
      try{ history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash); }catch(_){}
    };
    builder.addEventListener('change', shareURL);
    document.getElementById('bCopy').addEventListener('click', function(){
      shareURL(); var btn = this, done = function(){ btn.textContent = 'Link copied'; setTimeout(function(){ btn.textContent = 'Copy link'; }, 2000); };
      if(navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function(){ prompt('Copy this link', location.href); }); else prompt('Copy this link', location.href);
    });
    builder.addEventListener('click', function(e){ if(e.target.closest('#pgPlus,#pgMinus,#bReset')) setTimeout(shareURL, 0); });
    builder.addEventListener('change', function(e){
      if(e.target.id === 'bLocal'){
        if(e.target.checked){ var cur = pick('b_care'); builder.dataset.prevCare = cur ? cur.value : 'essential'; var g = builder.querySelector('input[name=b_care][value=growth]'); if(g) g.checked = true; }
        else if(builder.dataset.prevCare){ var pc = builder.querySelector('input[name=b_care][value=' + builder.dataset.prevCare + ']'); if(pc) pc.checked = true; }
      }
      calc(); saveB();
    });
    document.getElementById('bReset').addEventListener('click', function(){
      var before = null; try{ before = localStorage.getItem(BKEY); }catch(_){}
      setTimeout(function(){
        var ln = document.getElementById('btLocalNote'); if(!before || !ln) return;
        var u = document.getElementById('bUndo'); if(!u){ u = document.createElement('p'); u.id = 'bUndo'; u.className = 'bt-undo'; ln.parentNode.insertBefore(u, ln); }
        u.textContent = 'Builder reset. '; var b = document.createElement('button'); b.type = 'button'; b.className = 'b-reset'; b.textContent = 'Undo';
        b.addEventListener('click', function(){ try{ localStorage.setItem(BKEY, before); history.replaceState(null, '', location.pathname + '#build'); }catch(_){} location.reload(); }); u.appendChild(b); u.classList.remove('hidden');
        setTimeout(function(){ builder.addEventListener('change', function hideB(){ u.classList.add('hidden'); builder.removeEventListener('change', hideB); }); }, 0);
      }, 0);
      builder.querySelector('input[name=b_pkg][value=launch]').checked = true;
      builder.querySelector('input[name=b_care][value=essential]').checked = true;
      builder.querySelectorAll('input[name=b_add]').forEach(function(a){ a.checked = false; });
      var bl = document.getElementById('bLocal'); if(bl) bl.checked = false;
      extraPages = 0; calc(); saveB();
    });
    document.getElementById('btSend').addEventListener('click', function(){
      setTimeout(function(){
        var n = document.getElementById('s_name'), p = document.getElementById('s_pkg');
        if(p){ p.classList.add('flash'); setTimeout(function(){ p.classList.remove('flash'); }, 1600); }
        if(n) n.focus({preventScroll:true});
      }, 450);
    });
    document.getElementById('pgPlus').addEventListener('click', function(){ extraPages = Math.min(20, extraPages + 1); calc(); saveB(); });
    document.getElementById('pgMinus').addEventListener('click', function(){ extraPages = Math.max(0, extraPages - 1); calc(); saveB(); });
    calc();
  }

  var sform = document.getElementById('siteForm');
  if(sform){
    var serr = document.getElementById('s_error');
    cre8Live(sform);
    var SKEY = 'cre8-site-draft', sids = ['s_name', 's_email', 's_phone', 's_biz', 's_current', 's_msg'].filter(function(id){ return document.getElementById(id); });
    try{ var sd = JSON.parse(localStorage.getItem(SKEY) || 'null');
      if(sd && sids.some(function(id){ return sd[id]; })){
        sids.forEach(function(id){ if(sd[id]) document.getElementById(id).value = sd[id]; });
        var sn = document.getElementById('siteDraftNote'); sn.textContent = 'We restored your unsent request. ';
        var sc = document.createElement('button'); sc.type = 'button'; sc.textContent = 'Clear it';
        sc.addEventListener('click', function(){ sids.forEach(function(id){ document.getElementById(id).value = ''; }); try{ localStorage.removeItem(SKEY); }catch(_){} sn.classList.add('hidden'); });
        sn.appendChild(sc); sn.classList.remove('hidden');
      }
    }catch(_){}
    sform.addEventListener('input', function(){ var d = {}; sids.forEach(function(id){ d[id] = document.getElementById(id).value; }); try{ localStorage.setItem(SKEY, JSON.stringify(d)); }catch(_){} });
    sform.addEventListener('submit', function(e){
      e.preventDefault();
      if(!cre8Validate(sform, serr)) return;
      var btn = document.getElementById('s_submit'); btn.disabled = true; btn.textContent = 'Sending...';
      serr.classList.add('hidden');
      var f = new FormData(sform), g = function(k){ return String(f.get(k) || '').trim(); };
      var message = ['Business: ' + (g('business') || 'not given'), 'Current site: ' + (g('current_site') || 'none'), 'Package: ' + (g('package_summary') || 'not chosen'), '', g('goals')].join('\n');
      var body = { name: g('name'), email: g('email'), phone: g('phone'), topic: 'Website / Brand Launch', contact_preference: '', message: message, website: g('website') };
      fetch(API + '/api/cre8/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.message || 'Could not send right now.'); return j; }); })
        .then(function(){ try{ localStorage.removeItem('cre8-site-draft'); }catch(_){} sform.classList.add('hidden'); document.getElementById('s_success').classList.remove('hidden'); })
        .catch(function(err){ serr.textContent = err.message + ' You can also call or text 732-720-9211.'; serr.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Book a Discovery Call'; });
    });
  }

  /* ===== Contact form ===== */
  var cform = document.getElementById('contactForm');
  if(cform){
    var cmsg = document.getElementById('c_msg'), ccount = document.getElementById('c_count'), cerr = document.getElementById('c_error');
    cmsg.addEventListener('input', function(){ var n = cmsg.value.length; ccount.textContent = n + ' / 3000'; ccount.classList.toggle('hidden', n < 2500); });
    ccount.classList.add('hidden'); cre8Live(cform);
    var cph = document.getElementById('c_phone'), phoneRule = function(){ var p = cform.querySelector('input[name=contact_preference]:checked'); cph.required = !!(p && p.value !== 'Email'); var l = cph.closest('.field').querySelector('label'); if(l) l.innerHTML = cph.required ? 'Phone <span class="req">*</span>' : 'Phone'; if(!cph.required) cre8Mark(cph); };
    cform.querySelectorAll('input[name=contact_preference]').forEach(function(r){ r.addEventListener('change', phoneRule); }); phoneRule();
    var tq = new URLSearchParams(location.search).get('topic');
    if(tq){ var tr = cform.querySelector('input[name=topic][value="' + tq.replace(/"/g, '') + '"]'); if(tr) tr.checked = true; }
    var CKEY = 'cre8-contact-draft';
    var cids = ['c_name', 'c_email', 'c_phone', 'c_msg'];
    var csave = function(){ var d = {}; cids.forEach(function(id){ d[id] = document.getElementById(id).value; }); ['topic', 'contact_preference'].forEach(function(n){ var x = cform.querySelector('input[name=' + n + ']:checked'); if(x) d[n] = x.value; }); try{ localStorage.setItem(CKEY, JSON.stringify(d)); }catch(_){} };
    try{ var cd = JSON.parse(localStorage.getItem(CKEY) || 'null');
      if(cd && cids.some(function(id){ return cd[id]; })){
        cids.forEach(function(id){ if(cd[id]) document.getElementById(id).value = cd[id]; });
        ['topic', 'contact_preference'].forEach(function(n){ if(cd[n] && !(n === 'topic' && tq)){ var x = cform.querySelector('input[name=' + n + '][value="' + cd[n] + '"]'); if(x){ x.checked = true; x.dispatchEvent(new Event('change', {bubbles:true})); } } });
        var cn = document.getElementById('cDraftNote'); cn.textContent = 'We restored your unsent message. ';
        var cb = document.createElement('button'); cb.type = 'button'; cb.textContent = 'Clear it';
        cb.addEventListener('click', function(){ cform.reset(); try{ localStorage.removeItem(CKEY); }catch(_){} cn.classList.add('hidden'); phoneRule(); });
        cn.appendChild(cb); cn.classList.remove('hidden');
      }
    }catch(_){}
    cform.addEventListener('input', csave); cform.addEventListener('change', csave);
    cform.addEventListener('submit', function(e){
      e.preventDefault();
      if(!cre8Validate(cform, cerr)) return;
      var btn = document.getElementById('c_submit'); btn.disabled = true; btn.textContent = 'Sending...';
      cerr.classList.add('hidden');
      var body = {}; new FormData(cform).forEach(function(v, k){ body[k] = v; });
      fetch(API + '/api/cre8/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.message || 'Could not send right now.'); return j; }); })
        .then(function(){ try{ localStorage.removeItem('cre8-contact-draft'); }catch(_){} cform.classList.add('hidden'); document.getElementById('c_success').classList.remove('hidden'); })
        .catch(function(err){
          cerr.textContent = err.message + ' You can also call or text 732-720-9211.'; cerr.classList.remove('hidden');
          btn.disabled = false; btn.textContent = 'Send Message';
        });
    });
  }
  }

  /* ===== Page slide: links between the site's pages load the next page in the background and slide it up into place,
     in every browser. If anything fails, the link just opens normally. ===== */
  var BASE = document.body.dataset.base || '';
  var PAGES = ['/', '/how-it-works', '/websites', '/about', '/contact'];
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var busy = false;
  function sitePath(u){
    if(u.origin !== location.origin) return null;
    var p = u.pathname;
    if(BASE){ if(p.indexOf(BASE) !== 0) return null; p = p.slice(BASE.length) || '/'; }
    p = p.length > 1 ? p.replace(/\/+$/, '') : p;
    return PAGES.indexOf(p) >= 0 ? p : null;
  }
  function landAt(hash){
    var t = hash && document.getElementById(hash.slice(1));
    if(t) t.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
  }
  function swapIn(doc, url){
    var main = document.getElementById('main'), next = doc.getElementById('main');
    main.innerHTML = next.innerHTML;
    document.title = doc.title;
    ['meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[name="robots"]'].forEach(function(sel){
      var a = document.head.querySelector(sel), b = doc.head.querySelector(sel);
      if(a && b){ if(a.tagName === 'LINK') a.href = b.href; else a.setAttribute('content', b.getAttribute('content')); }
    });
    var ld = document.head.querySelector('script[type="application/ld+json"]'), nld = doc.head.querySelector('script[type="application/ld+json"]');
    if(ld && !nld) ld.remove(); else if(nld && !ld) document.head.appendChild(nld.cloneNode(true));
    document.body.dataset.page = doc.body.dataset.page;
    initPage();
    landAt(new URL(url, location.href).hash);
  }
  function go(url, push){
    if(busy) return;
    busy = true;
    fetch(url, { headers: { 'Accept': 'text/html' }, credentials: 'same-origin' })
      .then(function(r){ if(!r.ok) throw new Error('load'); return r.text(); })
      .then(function(html){
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if(!doc.getElementById('main')) throw new Error('shape');
        if(push) history.pushState({ cre8: 1 }, '', url);
        var nl = document.getElementById('navlinks'), mb = document.getElementById('menuBtn');
        if(nl && nl.classList.contains('open')){ nl.style.transition = 'none'; nl.classList.remove('open'); if(mb) mb.setAttribute('aria-expanded', 'false'); void nl.offsetHeight; nl.style.transition = ''; }
        var main = document.getElementById('main'), finish = function(){ busy = false; };
        if(reduceMotion){ swapIn(doc, url); return finish(); }
        if(document.startViewTransition){
          var vt = document.startViewTransition(function(){ swapIn(doc, url); });
          vt.finished.then(finish, finish);
          return;
        }
        // Browsers without view transitions: fade the old page, then slide the new one up
        main.classList.add('page-leave');
        setTimeout(function(){
          main.classList.remove('page-leave');
          swapIn(doc, url);
          main.classList.add('page-enter');
          setTimeout(function(){ main.classList.remove('page-enter'); finish(); }, 520);
        }, 160);
      })
      .catch(function(){ busy = false; location.href = url; });
  }
  document.addEventListener('click', function(e){
    if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]'); if(!a || a.hasAttribute('download')) return;
    var u; try { u = new URL(a.getAttribute('href'), location.href); } catch(x){ return; }
    var to = sitePath(u), here = sitePath(new URL(location.href));
    if(!to || to === here && u.search === location.search) return; // same page: the section scroll handler takes it
    e.preventDefault();
    go(u.href, true);
  });
  window.addEventListener('popstate', function(){
    var to = sitePath(new URL(location.href));
    if(!to) return;
    if(document.body.dataset.page === (to === '/' ? 'home' : to.slice(1))) return landAt(location.hash);
    go(location.href, false);
  });
  initPage();
})();

/* Phone bar: keep "Free Mockup" until the order form is on screen */
(function(){
  var web = document.body.dataset.page === 'websites';
  if(web){
    var ms = document.querySelector('.m-bar .m-start'); if(ms){ ms.href = '#inquire'; ms.textContent = 'Discovery Call'; }
    var nb = document.querySelector('header nav .btn-hot, #navlinks .btn-hot'); if(nb){ nb.href = '#inquire'; nb.textContent = 'Book a Discovery Call'; }
  }
  var c = document.getElementById(web ? 'inquire' : 'create'); if(!c || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(function(es){ document.body.classList.toggle('at-form', es[0].isIntersecting); }).observe(c);
})();

/* Optional details on the order form open by themselves when something inside was already chosen (deep link or saved draft) */
(function(){
  var d = document.getElementById('moreDetails'); if(!d) return;
  setTimeout(function(){
    var used = d.querySelector('input[name=method]:checked, input[name=occasion]:checked, input[name=design_status]:checked') ||
      ['budget', 'org', 'heard'].some(function(id){ var e = document.getElementById(id); return e && e.value; });
    if(used) d.open = true;
  }, 0);
})();

/* Websites: on phones the sticky totals bar and the phone bar would stack; hide the phone bar while the builder is on screen */
(function(){
  var b = document.getElementById('build'), bar = document.querySelector('.m-bar'); if(!b || !bar || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(function(es){ bar.classList.toggle('m-hide', es[0].isIntersecting); }).observe(b);
})();

/* Help links open the matching FAQ answer */
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('a[href^="#faq"]'); if(!a) return;
  var d = document.getElementById(a.getAttribute('href').slice(1)); if(d && d.tagName === 'DETAILS'){ e.preventDefault(); d.open = true; d.scrollIntoView({block:'center', behavior:'smooth'}); var s = d.querySelector('summary'); if(s) s.focus({preventScroll:true}); }
});
