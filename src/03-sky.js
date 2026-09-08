
  // ---------------------------------------------------------------------------------------------
  // The sky
  // ---------------------------------------------------------------------------------------------
  var ICONS = {
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    red: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16" opacity=".5"/></svg>',
    loc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 9l-4 4 1 5.5-5-2.7L7 18.5 8 13 4 9l5.5-.5z"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };
  var LAYERS = [
    ['camera', 'See-through'], ['art', 'Figures'], ['lines', 'Constellations'], ['names', 'Star names'], ['planets', 'Planets'],
    ['mw', 'Milky Way'], ['native', 'Native sky'], ['meteors', 'Meteors'], ['dso', 'Deep sky'], ['grid', 'Horizon marks']
  ];

  function SkyApp(o) {
    var prefs = loadPrefs();
    this.opts = o || {};
    this.loc = this.opts.loc || prefs.loc || DEFAULT_LOC;
    this.locFixed = !!this.opts.loc;
    this.sensorWanted = !!this.opts.sensor;
    this.layers = { art: true, lines: true, names: true, planets: true, mw: true, native: true, meteors: true, dso: false, grid: true, camera: false };
    if (prefs.layers) for (var k in prefs.layers) if (k in this.layers && k !== 'camera') this.layers[k] = !!prefs.layers[k];
    this.artImg = {};
    this.red = !!prefs.red;
    this.dim = typeof prefs.dim === 'number' ? prefs.dim : 0.15;
    this.calib = typeof prefs.calib === 'number' ? prefs.calib : 0;
    this.steady = prefs.steady !== false;
    this.sky = prefs.sky === 'western' || prefs.sky === 'native' ? prefs.sky : 'both';   // which sky culture leads
    this.fov = 70;
    this.timeOffset = 0;         // minutes
    this.mode = 'drag';          // 'drag' | 'sensor'
    this.gotSensor = false;
    this.view = { f: hzVec(180, 35), u: [0, 0, 1], r: [1, 0, 0] };
    this.target = { f: hzVec(180, 35), u: [0, 0, 1] };
    this.dragAz = 180; this.dragAlt = 35;
    this.hits = [];
    this.dirty = true;
    this.running = false;
    this.pointers = {};
    this.selected = null;   // target to highlight/point to: {vec, label}
    this.lastBodies = 0;
    this.lastReadout = 0;
    this.sunUpNoted = false;
  }
  SkyApp.prototype.persist = function () {
    var p = loadPrefs();
    p.layers = this.layers; p.red = this.red; p.dim = this.dim; p.calib = this.calib; p.steady = this.steady; p.sky = this.sky;
    if (!this.locFixed) p.loc = this.loc;
    savePrefs(p);
  };
  SkyApp.prototype.open = function () {
    var self = this;
    self.build(); window.StarGazer._app = self;
    var perm = Promise.resolve('granted');
    if (self.sensorWanted && NEEDS_PERM) {
      // must be called inside the user gesture: do it before any await
      try { perm = DeviceOrientationEvent.requestPermission().catch(function () { return 'denied'; }); } catch (e) { perm = Promise.resolve('denied'); }
    }
    if (self.sensorWanted && !self.inline) self.enterFullscreen();
    return Promise.all([loadBundles(), perm]).then(function (r) {
      self.data = r[0][0]; self.content = r[0][1];
      self.prepare();
      self.hideLoading();
      if (self.sensorWanted && r[1] === 'granted') self.startSensors();
      else if (self.sensorWanted) self.toast('Motion access was not allowed. Drag to look around instead.');
      if (!self.inline) self.requestWakeLock();
      self.running = true; self.loop();
      self.updateChips();
      if (!self.inline) self.autoLocate();
      if (self.opts.tour) self.joinTour(self.opts.tour);
      if (self.opts.autoOpen) self.showSheet(self.opts.autoOpen);
    }).catch(function (err) {
      if (window.console) console.error('StarGazer', err);
      self.showLoading('The sky data could not be loaded. Check the connection and try again.', true);
    });
  };
  SkyApp.prototype.build = function () {
    var self = this;
    var host = document.createElement('div'); host.setAttribute('data-stargazer-app', '');
    this.inline = !!this.opts.mount;
    if (this.inline) { host.style.cssText = 'position:absolute;inset:0;overflow:hidden;'; this.opts.mount.appendChild(host); }
    else { host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;'; document.body.appendChild(host); }
    var root = host.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = SKY_CSS; root.appendChild(st);
    var el = document.createElement('div'); el.className = 'root' + (this.red ? ' red' : '') + (this.inline ? ' inline' : '');
    el.innerHTML =
      '<video class="cam" autoplay muted playsinline></video><canvas></canvas><div class="dim"></div>' +
      '<div class="top"><button class="ib x" aria-label="Close">' + ICONS.close + '</button>' +
      '<div class="ro"><div class="c">&nbsp;</div><div class="s">Point the phone at the sky</div></div>' +
      '<button class="ib rb" aria-label="Red light mode" title="Red light mode">' + ICONS.red + '</button></div>' +
      '<div class="cross"></div><div class="toast"></div><button class="target" type="button"><span class="tl"></span><span class="tx">&#x2715;</span></button>' +
      '<button class="tourpill" type="button"><span class="tp"></span><span class="tx" title="Leave the tour">&#x2715;</span></button>' +
      '<div class="bottom"><div class="cbw"><button class="cb" type="button" aria-pressed="false">' + ICONS.cam + '<span>See-through</span></button></div><div class="seg" role="radiogroup" aria-label="Which sky"><button data-sky="western">Greek &amp; Roman</button><button data-sky="native">Lakota &amp; Native</button><button data-sky="both">Both</button></div><div class="chipsw"><div class="chips"></div><span class="hint">&#x203A;</span></div>' +
      '<div class="nav"><button class="nb" data-sheet="tonight">Tonight</button><button class="nb" data-sheet="aurora">Aurora</button><button class="nb" data-sheet="stories">Stories</button><button class="nb" data-sheet="settings">Settings</button></div></div>' +
      '<div class="sheet"><div class="sh"><div class="t"></div><button class="x" aria-label="Close panel">&#x2715;</button></div><div class="sb"></div></div>' +
      '<div class="loading">' + WORDMARK.replace('<svg ', '<svg class="wm" ') + '<div class="tips"><div>Hold up<small>raise the phone to the sky</small></div><div>Turn<small>slowly, in any direction</small></div><div>Tap<small>anything, for its story</small></div></div><div class="lmsg">Loading the sky&hellip;</div></div>';
    this.openedAt = Date.now();
    root.appendChild(el);
    this.host = host; this.root = root; this.el = el;
    this.canvas = el.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.video = el.querySelector('video.cam');
    this.dimEl = el.querySelector('.dim'); this.dimEl.style.opacity = this.dim;
    this.roC = el.querySelector('.ro .c'); this.roS = el.querySelector('.ro .s');
    this.toastEl = el.querySelector('.toast');
    this.targetEl = el.querySelector('.target'); this.targetEl.addEventListener('click', function () { self.clearSelected(); });
    el.querySelector('.tourpill').addEventListener('click', function () { if (self.tour && confirm('Leave the tour?')) { self.leaveTour(); self.toast('You left the tour. Rejoin any time with the code.', 3000); } });
    this.sheet = el.querySelector('.sheet'); this.sheetT = el.querySelector('.sh .t'); this.sheetB = el.querySelector('.sb');
    this.chipsEl = el.querySelector('.chips');
    this.segEl = el.querySelector('.seg');
    this.segEl.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('[data-sky]') : null; if (b) self.setSky(b.getAttribute('data-sky')); });
    this.updateSeg();
    el.querySelector('.ib.x').addEventListener('click', function () { self.close(); });
    el.querySelector('.rb').addEventListener('click', function () { self.setRed(!self.red); });
    var cb = el.querySelector('.cb'); if (this.cameraPossible() && !this.inline) { cb.classList.add('show'); cb.addEventListener('click', function () { self.toggleCamera(); }); }
    el.querySelector('.sh .x').addEventListener('click', function () { self.hideSheet(); });
    var nbs = el.querySelectorAll('.nb');
    for (var i = 0; i < nbs.length; i++) nbs[i].addEventListener('click', function (e) {
      var s = e.currentTarget.getAttribute('data-sheet');
      if (self.sheetName === s && self.sheet.classList.contains('show')) self.hideSheet(); else self.showSheet(s);
    });
    // chips
    var h = '';
    for (var j = 0; j < LAYERS.length; j++) { if (LAYERS[j][0] === 'camera') continue; h += '<button class="chip" data-l="' + LAYERS[j][0] + '">' + LAYERS[j][1] + '</button>'; }
    this.chipsEl.innerHTML = h;
    this.chipsWrap = el.querySelector('.chipsw');
    this.chipsEl.addEventListener('scroll', function () { self.updateChipEdges(); }, { passive: true });
    setTimeout(function () { self.updateChipEdges(); }, 50);
    this.chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.chip') : null; if (!b) return;
      var l = b.getAttribute('data-l');
      if (l === 'camera') { self.toggleCamera(); return; }
      self.layers[l] = !self.layers[l]; self.updateChips(); self.persist(); self.dirty = true;
    });
    if (this.red) el.querySelector('.rb').classList.add('on');
    this.resize();
    this.onResize = function () { self.resize(); };
    window.addEventListener('resize', this.onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.onResize);
    this.bindPointer();
    this.onFs = function () { if (!document.fullscreenElement && !document.webkitFullscreenElement && self.wasFullscreen) self.close(); };
    document.addEventListener('fullscreenchange', this.onFs); document.addEventListener('webkitfullscreenchange', this.onFs);
    this.onKey = function (e) { if (e.key === 'Escape' && !self.inline) { if (self.sheet.classList.contains('show')) self.hideSheet(); else self.close(); } };
    document.addEventListener('keydown', this.onKey);
    this.onVis = function () { if (document.visibilityState === 'visible') { self.requestWakeLock(); self.dirty = true; } };
    document.addEventListener('visibilitychange', this.onVis);
    this.prevOverflow = document.documentElement.style.overflow; if (!this.inline) document.documentElement.style.overflow = 'hidden';
  };
  // ---- which sky leads: Greek & Roman, Lakota & Native, or both side by side ------------------------
  SkyApp.prototype.setSky = function (v) {
    this.sky = v; this.persist(); this.updateSeg(); this.dirty = true;
    this.toast(v === 'native' ? 'Lakota and Native sky: figures and names from the Plains and Great Lakes.' : v === 'western' ? 'Greek and Roman sky: the 88 constellations astronomers use.' : 'Both skies. Where a Native figure exists it is shown first.', 3000);
  };
  SkyApp.prototype.updateSeg = function () { var bs = this.segEl.querySelectorAll('[data-sky]'); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-sky') === this.sky); };
  SkyApp.prototype.showWest = function () { return this.sky !== 'native'; };
  SkyApp.prototype.showNative = function () { return this.sky !== 'western' && this.layers.native; };
  // The Native figure that belongs to a constellation (first in list), if any
  SkyApp.prototype.nativeFor = function (con) { if (!con) return null; for (var i = 0; i < this.lore.length; i++) { var L = this.lore[i]; if ((L.artRecs || L.sk) && L.con.indexOf(con) >= 0) return L; } return null; };
  // ---- see-through camera (phones and tablets with a rear camera only) --------------------------
  SkyApp.prototype.cameraPossible = function () { return IS_MOBILE && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); };
  SkyApp.prototype.updateChipEdges = function () {
    var c = this.chipsEl, w = this.chipsWrap; if (!w) return;
    w.classList.toggle('more-r', c.scrollLeft + c.clientWidth < c.scrollWidth - 4);
    w.classList.toggle('more-l', c.scrollLeft > 4);
  };
  SkyApp.prototype.toggleCamera = function () {
    var self = this;
    if (this.layers.camera) { this.stopCamera(); return; }
    if (!this.cameraPossible()) { this.toast('See-through needs a phone or tablet with a rear camera.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (stream) {
      var tr = stream.getVideoTracks()[0], st = tr && tr.getSettings ? tr.getSettings() : {};
      if (st.facingMode && st.facingMode !== 'environment') { stream.getTracks().forEach(function (t) { t.stop(); }); self.toast('No rear camera found on this device.'); return; }
      self.camStream = stream; self.video.srcObject = stream; self.el.classList.add('cam');
      self.layers.camera = true; self.updateChips(); var cbOn = self.el.querySelector('.cb'); cbOn.classList.add('on'); cbOn.setAttribute('aria-pressed', 'true'); self.dirty = true;
      self.fovBeforeCam = self.fov; self.setFov(62);
      self.toast('See-through on. Pinch until the stars sit on the real ones; the phone camera and the chart are not a perfect match.', 4500);
    }).catch(function () { self.toast('Camera access was not allowed.'); });
  };
  SkyApp.prototype.stopCamera = function () {
    if (this.camStream) { try { this.camStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } this.camStream = null; }
    if (this.video) this.video.srcObject = null;
    if (this.el) this.el.classList.remove('cam');
    if (this.layers.camera) { this.layers.camera = false; if (this.fovBeforeCam) this.setFov(this.fovBeforeCam); this.updateChips(); this.dirty = true; }
    if (this.el) { var cbtn = this.el.querySelector('.cb'); if (cbtn) { cbtn.classList.remove('on'); cbtn.setAttribute('aria-pressed', 'false'); } }
  };
  // ---- constellation figures (Stellarium western sky culture, Johan Meuris, Free Art License) --
  SkyApp.prototype.artImage = function (k) {
    var self = this, a = this.data.art[k], rec = this.artImg[k];
    if (rec) return rec;
    rec = this.artImg[k] = { img: null, red: null, ok: false };
    var img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = function () { rec.img = img; rec.ok = true; self.dirty = true; };
    img.onerror = function () { rec.ok = false; };
    img.src = BASE + 'art/' + a[0];
    return rec;
  };
  SkyApp.prototype.loadNativeArt = function (rec) {
    var self = this; if (rec.img || rec.loading) return; rec.loading = true;
    var img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = function () { rec.img = img; rec.ok = true; self.dirty = true; }; img.onerror = function () { rec.ok = false; };
    img.src = BASE + 'art-native/' + rec.file;
  };
  // Draw an image whose three anchor pixels [x, y] must land on three screen points; returns false if off screen.
  SkyApp.prototype.drawPinned = function (ctx, img, w, h, ap, sp, alpha) {
    var x0 = ap[0][0], y0 = ap[0][1], x1 = ap[1][0], y1 = ap[1][1], x2 = ap[2][0], y2 = ap[2][1];
    var det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (abs(det) < 1e-6) return false;
    var ta = ((sp[1][0] - sp[0][0]) * (y2 - y0) - (sp[2][0] - sp[0][0]) * (y1 - y0)) / det;
    var tc = ((sp[2][0] - sp[0][0]) * (x1 - x0) - (sp[1][0] - sp[0][0]) * (x2 - x0)) / det;
    var tb = ((sp[1][1] - sp[0][1]) * (y2 - y0) - (sp[2][1] - sp[0][1]) * (y1 - y0)) / det;
    var td = ((sp[2][1] - sp[0][1]) * (x1 - x0) - (sp[1][1] - sp[0][1]) * (x2 - x0)) / det;
    var te = sp[0][0] - ta * x0 - tc * y0, tf = sp[0][1] - tb * x0 - td * y0;
    var cxs = [te, ta * w + te, tc * h + te, ta * w + tc * h + te], cys = [tf, tb * w + tf, td * h + tf, tb * w + td * h + tf];
    if (Math.max.apply(null, cxs) < 0 || Math.min.apply(null, cxs) > this.W || Math.max.apply(null, cys) < 0 || Math.min.apply(null, cys) > this.H) return false;
    if (abs(ta * td - tb * tc) > 40) return false;
    var dpr = this.dpr; ctx.globalAlpha = alpha; ctx.setTransform(dpr * ta, dpr * tb, dpr * tc, dpr * td, dpr * te, dpr * tf);
    ctx.drawImage(img, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; return true;
  };
  SkyApp.prototype.artTinted = function (rec) {  // red-mode copy: multiply the grey drawing by red, black stays black
    if (rec.red) return rec.red;
    var c = document.createElement('canvas'); c.width = rec.img.width; c.height = rec.img.height;
    var x = c.getContext('2d'); x.drawImage(rec.img, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = '#ff5a46'; x.fillRect(0, 0, c.width, c.height);
    rec.red = c; return c;
  };
  // Ask for the device location on open (unless the embed pinned one); fall back to Medora quietly.
  SkyApp.prototype.autoLocate = function () {
    var self = this;
    if (this.locFixed || !navigator.geolocation) return;
    var prefs = loadPrefs();
    if (prefs.geoDenied && Date.now() - prefs.geoDenied < 7 * 86400000) return; // asked recently and declined
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude, lo = pos.coords.longitude;
      var nearMedora = Math.abs(la - DEFAULT_LOC.lat) < 0.3 && Math.abs(lo - DEFAULT_LOC.lon) < 0.45;
      self.loc = nearMedora ? DEFAULT_LOC : { lat: la, lon: lo, name: 'Your location (' + la.toFixed(2) + ', ' + lo.toFixed(2) + ')' };
      self.persist(); self.computeBodies(true); self.dirty = true;
      self.toast(nearMedora ? 'Sky set for Medora, North Dakota' : 'Sky set for your location', 2500);
      if (self.sheetName) self.showSheet(self.sheetName);
    }, function (err) {
      if (err && err.code === 1) { var p = loadPrefs(); p.geoDenied = Date.now(); savePrefs(p); }
      self.toast('Showing the sky over ' + self.loc.name + '. Change it in Settings.', 3500);
    }, { timeout: 10000, maximumAge: 600000 });
  };
  SkyApp.prototype.enterFullscreen = function () {
    var self = this, h = this.host;
    try {
      var p = h.requestFullscreen ? h.requestFullscreen({ navigationUI: 'hide' }) : h.webkitRequestFullscreen ? h.webkitRequestFullscreen() : null;
      if (p && p.then) p.then(function () { self.wasFullscreen = true; self.lockOrientation(); }).catch(function () { });
      else if (p !== null) { self.wasFullscreen = true; self.lockOrientation(); }
    } catch (e) { /* not supported (iOS) */ }
  };
  SkyApp.prototype.lockOrientation = function () {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () { }); } catch (e) { }
  };
  SkyApp.prototype.requestWakeLock = function () {
    var self = this;
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) { self.wakeLock = l; }).catch(function () { });
  };
  SkyApp.prototype.close = function () {
    this.running = false;
    this.stopSensors(); this.stopCamera(); if (this.tour) this.leaveTour();
    if (this.wakeLock) { try { this.wakeLock.release(); } catch (e) { } this.wakeLock = null; }
    window.removeEventListener('resize', this.onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFs); document.removeEventListener('webkitfullscreenchange', this.onFs);
    document.removeEventListener('keydown', this.onKey); document.removeEventListener('visibilitychange', this.onVis);
    if (!this.inline) document.documentElement.style.overflow = this.prevOverflow || '';
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
    if (document.fullscreenElement || document.webkitFullscreenElement) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { } }
    if (this.host && this.host.parentNode) this.host.parentNode.removeChild(this.host);
  };
  SkyApp.prototype.showLoading = function (msg, isError) {
    var l = this.el.querySelector('.loading'); l.style.display = 'flex'; l.classList.remove('out');
    l.querySelector('.lmsg').innerHTML = esc(msg) + (isError ? '<br><br><button class="btn2" type="button">Close</button>' : '');
    var self = this; var b = l.querySelector('.btn2'); if (b) b.addEventListener('click', function () { self.close(); });
  };
  SkyApp.prototype.hideLoading = function () {  // let the intro play for a moment, then fade out
    var l = this.el.querySelector('.loading'), wait = Math.max(0, 2200 - (Date.now() - this.openedAt));
    setTimeout(function () { l.classList.add('out'); setTimeout(function () { l.style.display = 'none'; }, 650); }, wait);
  };
  SkyApp.prototype.toast = function (msg, ms) {
    var self = this; this.toastEl.textContent = msg; this.toastEl.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(function () { self.toastEl.classList.remove('show'); }, ms || 3200);
  };
  SkyApp.prototype.setRed = function (on) {
    this.red = on; this.el.classList.toggle('red', on); this.el.querySelector('.rb').classList.toggle('on', on); this.persist(); this.dirty = true;
  };
  SkyApp.prototype.setDim = function (v) { this.dim = clamp(v, 0, 0.75); this.dimEl.style.opacity = this.dim; this.persist(); };
  SkyApp.prototype.updateChips = function () {
    var cs = this.chipsEl.querySelectorAll('.chip');
    for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('on', !!this.layers[cs[i].getAttribute('data-l')]);
  };
  SkyApp.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.el.clientWidth || (this.inline ? 320 : window.innerWidth), h = this.el.clientHeight || (this.inline ? 200 : window.innerHeight);
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.dirty = true; if (this.chipsWrap) this.updateChipEdges();
  };

  // ---- data preparation ---------------------------------------------------------------------
  SkyApp.prototype.prepare = function () {
    var D = this.data, C = this.content, i;
    var stars = D.stars, n = stars.length;
    this.starVec = new Float32Array(n * 3); this.starMag = new Float32Array(n); this.starIdx = [];
    this.byHip = {};
    for (i = 0; i < n; i++) {
      var s = stars[i], v = eqVec(s[1], s[2]);
      this.starVec[i * 3] = v[0]; this.starVec[i * 3 + 1] = v[1]; this.starVec[i * 3 + 2] = v[2];
      this.starMag[i] = s[3];
      this.byHip[s[0]] = i;
    }
    // constellation lines as flat segment arrays
    this.conKeys = Object.keys(D.con);
    this.conSeg = {}; this.conCenter = {};
    for (i = 0; i < this.conKeys.length; i++) {
      var k = this.conKeys[i], c = D.con[k], segs = [];
      for (var a = 0; a < c.l.length; a++) { var line = c.l[a]; for (var b = 0; b < line.length - 1; b++) segs.push(eqVec(line[b][0], line[b][1]), eqVec(line[b + 1][0], line[b + 1][1])); }
      this.conSeg[k] = segs; this.conCenter[k] = eqVec(c.ra, c.dec);
      var mxs = 0; for (var q1 = 0; q1 < segs.length; q1++) { var dq = angSep(segs[q1], this.conCenter[k]); if (dq > mxs) mxs = dq; } this.conSize = this.conSize || {}; this.conSize[k] = Math.max(mxs * 2, 6);
    }
    this.mwVec = []; for (i = 0; i < D.mw.length; i++) this.mwVec.push(eqVec(D.mw[i][0], D.mw[i][1]));
    this.dsoVec = []; for (i = 0; i < D.dsos.length; i++) this.dsoVec.push(eqVec(D.dsos[i][3], D.dsos[i][4]));
    // indigenous figures
    this.lore = C.indigenous; this.loreByHip = {}; this.loreByCon = {};
    for (i = 0; i < this.lore.length; i++) {
      var L = this.lore[i]; L.starIdx = [];
      for (var h = 0; h < L.hip.length; h++) { var si = this.byHip[L.hip[h]]; if (si != null) { L.starIdx.push(si); (this.loreByHip[L.hip[h]] = this.loreByHip[L.hip[h]] || []).push(L); } }
      for (var cc = 0; cc < L.con.length; cc++) (this.loreByCon[L.con[cc]] = this.loreByCon[L.con[cc]] || []).push(L);
      if (L.art) { L.artRecs = []; for (var ai0 = 0; ai0 < L.art.length; ai0++) { var AA = L.art[ai0], recA = { file: AA.file, w: AA.size[0], h: AA.size[1], a: [], img: null, red: null, ok: false }; for (var q0 = 0; q0 < 3; q0++) { var sIdx = this.byHip[AA.anchors[q0][2]]; if (sIdx == null) { recA = null; break; } recA.a.push([AA.anchors[q0][0], AA.anchors[q0][1], sIdx]); } if (recA) L.artRecs.push(recA); } }
      if (L.sketch) { L.sk = { path: null, a: [] }; for (var q = 0; q < 3; q++) { var sidx = this.byHip[L.sketch.anchors[q][2]]; if (sidx == null) { L.sk = null; break; } L.sk.a.push([L.sketch.anchors[q][0], L.sketch.anchors[q][1], sidx]); } }
      if (L.starIdx.length) {
        var cv = [0, 0, 0];
        for (h = 0; h < L.starIdx.length; h++) { var o = L.starIdx[h] * 3; cv[0] += this.starVec[o]; cv[1] += this.starVec[o + 1]; cv[2] += this.starVec[o + 2]; }
        L.center = vnorm(cv);
        var mx = 0; for (var p1 = 0; p1 < L.starIdx.length; p1++) for (var p2 = p1 + 1; p2 < L.starIdx.length; p2++) { var o1 = L.starIdx[p1] * 3, o2 = L.starIdx[p2] * 3; var d12 = angSep([this.starVec[o1], this.starVec[o1 + 1], this.starVec[o1 + 2]], [this.starVec[o2], this.starVec[o2 + 1], this.starVec[o2 + 2]]); if (d12 > mx) mx = d12; }
        L.size = Math.max(mx, 1.5);
      }
    }
    this.artKeys = Object.keys(D.art || {}); this.artVec = {};
    for (i = 0; i < this.artKeys.length; i++) { var ak = this.artKeys[i], an = D.art[ak][3]; this.artVec[ak] = [eqVec(an[0][2], an[0][3]), eqVec(an[1][2], an[1][3]), eqVec(an[2][2], an[2][3])]; }
    this.showerVec = {}; for (i = 0; i < C.showers.length; i++) this.showerVec[C.showers[i].id] = eqVec(C.showers[i].raDeg, C.showers[i].decDeg);
    this.computeBodies(true);
  };
  SkyApp.prototype.now = function () { return new Date(Date.now() + this.timeOffset * 60000); };
  SkyApp.prototype.computeBodies = function (force) {
    var t = Date.now(); if (!force && t - this.lastBodies < 2000) return; this.lastBodies = t;
    var d = this.now(), jd = julianDay(d), lst = lstFor(d, this.loc.lon);
    var P = precessionMatrix(jd);
    var ss = solarSystem(jd);
    for (var k in ss) { ss[k].vecDate = mulMat(P, ss[k].vec); }
    this.ss = ss; this.moon = moonPos(jd, this.loc.lat, lst); this.phase = moonPhase(this.moon, ss.sun);
    this.P = P;
  };

  // ---- sensors -------------------------------------------------------------------------------
  SkyApp.prototype.startSensors = function () {
    var self = this;
    this.mode = 'sensor';
    this.onOri = function (e) { self.handleOrientation(e); };
    this.oriEvent = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(this.oriEvent, this.onOri, true);
    this.sensorTimer = setTimeout(function () {
      if (!self.gotSensor) { self.stopSensors(); self.toast('No motion data is coming through. Drag to look around instead.', 4000); }
    }, 3000);
  };
  SkyApp.prototype.stopSensors = function () {
    if (this.onOri) window.removeEventListener(this.oriEvent, this.onOri, true);
    this.onOri = null; clearTimeout(this.sensorTimer); this.mode = 'drag';
    var aa = vecToAzAlt(this.view.f); this.dragAz = aa.az; this.dragAlt = aa.alt;
  };
  SkyApp.prototype.handleOrientation = function (e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    if (!this.gotSensor) { this.gotSensor = true; clearTimeout(this.sensorTimer); this.roS.textContent = 'Turn slowly. Tap anything to learn more.'; }
    var alpha = e.alpha;
    if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
      // iOS: alpha is smooth but relative; the compass heading is absolute but meaningless when the phone is
      // flat or overhead. Keep the gyroscope's rotation and learn the heading offset only while the phone
      // is held upright, where the compass is trustworthy. That removes the snap near the zenith.
      var want = norm360(360 - e.webkitCompassHeading - e.alpha), upright = e.beta > 35 && e.beta < 145 && abs(e.gamma) < 60;
      var acc = e.webkitCompassAccuracy; if (acc != null && acc >= 0 && acc > 40) upright = false;   // poor compass fix
      if (this.iosOff == null) this.iosOff = want;
      else if (upright) { var dd = ((want - this.iosOff + 540) % 360) - 180; this.iosOff = norm360(this.iosOff + dd * (this.iosLocked ? 0.03 : 0.2)); if (abs(dd) < 3) this.iosLocked = true; }
      alpha = e.alpha + this.iosOff;
    }
    else if (this.oriEvent === 'deviceorientation' && e.absolute === false && !this.relNoted) { this.relNoted = true; this.toast('Compass not available: the sky may be turned. Drag sideways to line it up.', 4500); }
    var x = e.beta * D2R, y = e.gamma * D2R, z = (alpha + this.calib) * D2R;
    var cX = cos(x), cY = cos(y), cZ = cos(z), sX = sin(x), sY = sin(y), sZ = sin(z);
    // W3C device -> earth (E,N,U) rotation matrix, ZXY order
    var m11 = cZ * cY - sZ * sX * sY, m12 = -cX * sZ, m13 = cY * sZ * sX + cZ * sY;
    var m21 = cY * sZ + cZ * sX * sY, m22 = cZ * cX, m23 = sZ * sY - cZ * cY * sX;
    var m31 = -cX * sY, m32 = sX, m33 = cX * cY;
    var ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    var sa = sin(ang * D2R), ca = cos(ang * D2R);
    // look direction = device -Z ; screen-up = device (sa, ca, 0)
    var f = [-m13, -m23, -m33];
    var u = [m11 * sa + m12 * ca, m21 * sa + m22 * ca, m31 * sa + m32 * ca];
    this.target.f = f; this.target.u = u; this.dirty = true;
  };

  // ---- pointer handling ----------------------------------------------------------------------
  SkyApp.prototype.bindPointer = function () {
    var self = this, cv = this.canvas;
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      self.pointers[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 };
      var ids = Object.keys(self.pointers);
      if (ids.length === 2) { var a = self.pointers[ids[0]], b = self.pointers[ids[1]]; self.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); self.fov0 = self.fov; }
    });
    cv.addEventListener('pointermove', function (e) {
      var p = self.pointers[e.pointerId]; if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += abs(dx) + abs(dy);
      var ids = Object.keys(self.pointers);
      if (ids.length >= 2) {
        var a = self.pointers[ids[0]], b = self.pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (self.pinch0) { self.fovAnim = 0; self.setFov(self.fov0 * self.pinch0 / Math.max(d, 10)); }
        return;
      }
      var degPerPx = self.fov / self.H;
      if (self.mode === 'sensor') {
        if (abs(dx) > 0) { self.calib -= dx * degPerPx; self.calibTouched = true; self.dirty = true; }
      } else {
        self.dragAz = norm360(self.dragAz - dx * degPerPx); self.dragAlt = clamp(self.dragAlt + dy * degPerPx, -30, 89.5);
        self.target.f = hzVec(self.dragAz, self.dragAlt); self.target.u = [0, 0, 1]; self.dirty = true;
      }
    });
    function up(e) {
      var p = self.pointers[e.pointerId]; if (!p) return; delete self.pointers[e.pointerId];
      if (Object.keys(self.pointers).length < 2) self.pinch0 = 0;
      if (p.moved < 8 && e.type === 'pointerup') self.tap(e.clientX, e.clientY);
      if (self.calibTouched) { self.calibTouched = false; self.persist(); self.toast('Compass adjusted by ' + Math.round(self.calib) + '°', 1800); }
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); self.fovAnim = 0; self.setFov(self.fov * Math.pow(1.0015, e.deltaY)); }, { passive: false });
    cv.addEventListener('dblclick', function () { self.setFov(self.fov > 45 ? 35 : 70); });
  };
  // Turn the (drag-mode) view to face a sky vector — used by the guide's preview
  SkyApp.prototype.aimAt = function (vec, j2000, fov) {
    if (!this.HZ) return; var hz = j2000 ? mulMat(matMul(this.HZ, this.P), vec) : mulMat(this.HZ, vec), aa = vecToAzAlt(hz);
    this.dragAz = aa.az; this.dragAlt = clamp(aa.alt, -30, 89.5); this.target.f = hzVec(this.dragAz, this.dragAlt); this.target.u = [0, 0, 1];
    if (fov) this.animateFov(fov); this.dirty = true;
  };
  SkyApp.prototype.setFov = function (f) { this.fov = clamp(f, 18, 110); this.dirty = true; };
  // Smooth zoom: used when a pointed-to figure is small (the Pleiades, the Turtle) and the arrow has been followed.
  SkyApp.prototype.animateFov = function (to) {
    var self = this, from = this.fov, t0 = Date.now(), dur = 900; to = clamp(to, 18, 110);
    this.fovAnim = t0;
    (function step() { if (self.fovAnim !== t0 || !self.running) return; var k = Math.min(1, (Date.now() - t0) / dur); k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; self.fov = from + (to - from) * k; self.dirty = true; if (k < 1) requestAnimationFrame(step); })();
  };
  // Field of view that frames a figure of angular size `deg` comfortably
  function fovFor(deg) { return clamp(deg * 2.6 + 6, 22, 70); }

  // ---- main loop -------------------------------------------------------------------------------
  SkyApp.prototype.loop = function () {
    var self = this;
    if (!this.running) return;
    var v = this.view, t = this.target;
    // smooth toward target
    var k = this.mode === 'sensor' ? 0.22 : 0.35, ku = k;
    if (this.steady !== false && this.mode === 'sensor') { // near the zenith the compass heading swings wildly: damp the roll
      var altNow = asin(clamp(t.f[2], -1, 1)) * R2D;
      if (altNow > 72) ku = k * Math.max(0.15, (90 - altNow) / 18);
    }
    var nf = vlerp(v.f, t.f, k), nu = vlerp(v.u, t.u, ku);
    if (vdot(nf, nf) < 1e-4) nf = t.f;
    nf = vnorm(nf); nu = vnorm([nu[0] - vdot(nu, nf) * nf[0], nu[1] - vdot(nu, nf) * nf[1], nu[2] - vdot(nu, nf) * nf[2]]);
    if (!isFinite(nu[0]) || vdot(nu, nu) < 0.5) nu = vnorm([0 - vdot([0, 0, 1], nf) * nf[0], 0 - vdot([0, 0, 1], nf) * nf[1], 1 - vdot([0, 0, 1], nf) * nf[2]]);
    var moving = angSep(nf, v.f) > 0.02 || angSep(nu, v.u) > 0.02;
    v.f = nf; v.u = nu; v.r = vcross(nf, nu);
    var tick = Date.now() - (this.lastDraw || 0) > 1000;
    this.trackDwell(nf, moving);
    if (this.dirty || moving || tick) { this.draw(); this.dirty = false; this.lastDraw = Date.now(); }
    requestAnimationFrame(function () { self.loop(); });
  };

  SkyApp.prototype.select = function (vec, j2000, label, size) {
    if (this.selected && this.selected.fovBefore && !this.selected.zoomed) size = size; // keep
    var fovBefore = (this.selected && this.selected.fovBefore) || this.fov;
    this.selected = { vec: vec, j2000: j2000, label: label || '', size: size || 0, fovBefore: fovBefore, zoomed: false };
    this.targetEl.querySelector('.tl').textContent = 'Pointing to ' + (label || 'the target');
    this.targetEl.classList.add('show'); this.dirty = true;
  };
  SkyApp.prototype.clearSelected = function (msg) {
    if (this.selected && this.selected.zoomed && this.selected.fovBefore) this.animateFov(this.selected.fovBefore);
    this.selected = null; this.targetEl.classList.remove('show'); this.dirty = true;
    if (msg) this.toast(msg, 2500);
  };
  // ---- linger to read, move to dismiss ----------------------------------------------------------
  SkyApp.prototype.trackDwell = function (f, moving) {
    if (!this.HZ || !this.Ms || this.inline) return;   // the guide's preview only mirrors what is pushed
    var now = Date.now(), dw = this.dwell || (this.dwell = { anchor: f, since: now, shown: null, big: false });
    var drift = angSep(f, dw.anchor);
    if (drift > 4) { dw.anchor = f; dw.since = now; dw.big = drift > 12; }
    // big movement: close a card that was opened by lingering
    if (dw.shown && (drift > 12 || (moving && angSep(f, dw.shownAt) > 10))) { if (this.sheetName === 'info' && this.sheetAuto) this.hideSheet(); dw.shown = null; }
    if (this.sheetName && !(this.sheetName === 'info' && this.sheetAuto)) return; // a panel the visitor opened stays put
    if (now - dw.since < 1800 || Object.keys(this.pointers).length) return;
    var key = this.dwellTarget(); if (!key || key === dw.shown) return;
    dw.shown = key; dw.shownAt = f;
    this.sheetAuto = true; this.showInfo(this.dwellHit); this.sheetAuto = true;
  };
  SkyApp.prototype.dwellTarget = function () {
    var f = this.view.f, best = null, bd = 3;
    for (var pk in this.ss) { var d = angSep(mulMat(this.HZ, this.ss[pk].vecDate), f); if (d < bd) { bd = d; best = { t: 'body', k: pk }; } }
    if (angSep(mulMat(this.HZ, this.moon.vec), f) < bd) best = { t: 'body', k: 'moon' };
    if (!best) {
      var Ms = this.Ms, sd = 2.5, si = -1;
      for (var i = 0; i < this.data.stars.length && this.data.stars[i][3] < 3.0; i++) {
        if (!this.data.stars[i][6]) continue; var o = i * 3, z = Ms[6] * this.starVec[o] + Ms[7] * this.starVec[o + 1] + Ms[8] * this.starVec[o + 2];
        var ang = Math.acos(clamp(z, -1, 1)) * R2D; if (ang < sd) { sd = ang; si = i; }
      }
      var natL = this.showNative() ? this.nativeFor(this.focusCon) : null;
      if (natL && (this.sky === 'native' || si < 0)) best = { t: 'lore', i: C_idx(this.lore, natL) };
      else if (si >= 0) best = { t: 'star', i: si }; else if (this.focusCon && vecToAzAlt(f).alt > 0) best = { t: 'con', k: this.focusCon };
    }
    this.dwellHit = best;
    return best ? best.t + ':' + (best.k || best.i) : null;
  };
  // ---- rendering -------------------------------------------------------------------------------
  SkyApp.prototype.draw = function () {
    var ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr, red = this.red, L = this.layers, D = this.data;
    this.computeBodies();
    var d = this.now(), jd = julianDay(d), lst = lstFor(d, this.loc.lon);
    var HZ = eqToHzMatrix(this.loc.lat, lst);
    var v = this.view, Cam = [v.r[0], v.r[1], v.r[2], v.u[0], v.u[1], v.u[2], v.f[0], v.f[1], v.f[2]];
    var Mb = matMul(Cam, HZ);              // of-date equatorial -> camera
    var Ms = matMul(Mb, this.P);           // J2000 -> camera
    this.Ms = Ms; this.Mb = Mb; this.HZ = HZ; this.lst = lst;
    var cx = W / 2, cy = H / 2, S = (H / 2) / (2 * Math.tan(this.fov * D2R / 4)), S2 = 2 * S;
    this.S = S; this.cx = cx; this.cy = cy;
    var rc = sqrt(cx * cx + cy * cy), thc = 2 * Math.atan(rc / S2) + 3 * D2R, zmin = cos(Math.min(thc, 150 * D2R));
    var zoom = sqrt(clamp(70 / this.fov, 0.6, 2.6));
    var sunAlt = asin(clamp(HZ[6] * this.ss.sun.vecDate[0] + HZ[7] * this.ss.sun.vecDate[1] + HZ[8] * this.ss.sun.vecDate[2], -1, 1)) * R2D;
    var daylight = clamp((sunAlt + 12) / 12, 0, 1); // 0 at astronomical-ish dark, 1 by sun 0°
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // background (transparent over the camera feed)
    var camOn = L.camera && this.camStream;
    ctx.clearRect(0, 0, W, H);
    if (!camOn) {
      if (red) ctx.fillStyle = '#090000';
      else { var bg = [4 + 20 * daylight, 13 + 45 * daylight, 27 + 70 * daylight]; ctx.fillStyle = 'rgb(' + bg.map(Math.round).join(',') + ')'; }
      ctx.fillRect(0, 0, W, H);
    }
    var hits = this.hits = [];
    var m0 = Ms[0], m1 = Ms[1], m2 = Ms[2], m3 = Ms[3], m4 = Ms[4], m5 = Ms[5], m6 = Ms[6], m7 = Ms[7], m8 = Ms[8];
    var i, x, y, z, kx, px, py;
    // altitude of a J2000 vector, for ground culling
    var hzP = matMul(HZ, this.P), u0 = hzP[6], u1 = hzP[7], u2 = hzP[8];

    // Milky Way
    if (L.mw && daylight < 0.6) {
      var mw = this.mwVec, mwd = D.mw, lvlCol = red ? ['', 'rgba(140,20,10,', 'rgba(150,25,12,', 'rgba(160,30,15,', 'rgba(170,35,18,', 'rgba(180,40,20,'] : ['', 'rgba(150,170,205,', 'rgba(165,182,212,', 'rgba(180,192,218,', 'rgba(195,202,224,', 'rgba(210,212,230,'];
      var mwAlpha = 0.085 * (1 - daylight), mwR = 3.6 * zoom;
      for (var lv = 1; lv <= 5; lv++) {
        ctx.fillStyle = lvlCol[lv] + (mwAlpha * (0.7 + lv * 0.15)).toFixed(3) + ')'; ctx.beginPath();
        for (i = 0; i < mw.length; i++) {
          if (mwd[i][2] !== lv) continue; var mv = mw[i];
          if (u0 * mv[0] + u1 * mv[1] + u2 * mv[2] < -0.05) continue;
          z = m6 * mv[0] + m7 * mv[1] + m8 * mv[2]; if (z < zmin) continue;
          kx = S2 / (1 + z); px = cx + (m0 * mv[0] + m1 * mv[1] + m2 * mv[2]) * kx; py = cy - (m3 * mv[0] + m4 * mv[1] + m5 * mv[2]) * kx;
          ctx.moveTo(px + mwR, py); ctx.arc(px, py, mwR * (0.8 + lv * 0.1), 0, 6.2832);
        }
        ctx.fill();
      }
    }
    // constellation figures: each illustration is pinned to three stars; an affine fit of those three
    // screen positions places the drawing (the same method Stellarium uses)
    var focusCon = this.focusCon;
    var west = this.showWest(), nativeOn = this.showNative();
    var nativeHere = nativeOn && this.nativeFor(focusCon);   // in Both mode the Native figure takes the spot
    if (L.art && west && this.artKeys.length) {
      ctx.globalCompositeOperation = 'lighter';
      // only the constellation under the reticle shows its figure; it fades in and out
      var fade = this.artFade = this.artFade || {}, dt = Math.min(0.1, (Date.now() - (this.lastDraw || Date.now())) / 1000);
      for (var fk in fade) { fade[fk] += (fk === focusCon && !nativeHere ? 1 : -1) * dt * 2.2; if (fade[fk] <= 0) delete fade[fk]; else { if (fade[fk] > 1) fade[fk] = 1; this.dirty = true; } }
      if (focusCon && !nativeHere && D.art[focusCon] && fade[focusCon] == null) { fade[focusCon] = 0.01; this.dirty = true; }
      for (var ai = 0; ai < this.artKeys.length; ai++) {
        var ak2 = this.artKeys[ai]; if (!fade[ak2]) continue;
        var av = this.artVec[ak2], ad = D.art[ak2], sp = [], okA = true;
        for (var q3 = 0; q3 < 3; q3++) {
          var vv = av[q3]; z = m6 * vv[0] + m7 * vv[1] + m8 * vv[2]; if (z < 0.2) { okA = false; break; }
          kx = S2 / (1 + z); sp.push([cx + (m0 * vv[0] + m1 * vv[1] + m2 * vv[2]) * kx, cy - (m3 * vv[0] + m4 * vv[1] + m5 * vv[2]) * kx]);
        }
        if (!okA) continue;
        var an = ad[3], x0 = an[0][0], y0 = an[0][1], x1 = an[1][0], y1 = an[1][1], x2 = an[2][0], y2 = an[2][1];
        var det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (abs(det) < 1e-6) continue;
        // affine: screen = A * image + t, solved from the three anchor pairs
        var ta = ((sp[1][0] - sp[0][0]) * (y2 - y0) - (sp[2][0] - sp[0][0]) * (y1 - y0)) / det;
        var tc = ((sp[2][0] - sp[0][0]) * (x1 - x0) - (sp[1][0] - sp[0][0]) * (x2 - x0)) / det;
        var tb = ((sp[1][1] - sp[0][1]) * (y2 - y0) - (sp[2][1] - sp[0][1]) * (y1 - y0)) / det;
        var td = ((sp[2][1] - sp[0][1]) * (x1 - x0) - (sp[1][1] - sp[0][1]) * (x2 - x0)) / det;
        var te = sp[0][0] - ta * x0 - tc * y0, tf = sp[0][1] - tb * x0 - td * y0;
        // rough on-screen test using the image corners
        var cxs = [te, ta * ad[1] + te, tc * ad[2] + te, ta * ad[1] + tc * ad[2] + te], cys = [tf, tb * ad[1] + tf, td * ad[2] + tf, tb * ad[1] + td * ad[2] + tf];
        if (Math.max.apply(null, cxs) < 0 || Math.min.apply(null, cxs) > W || Math.max.apply(null, cys) < 0 || Math.min.apply(null, cys) > H) continue;
        if (abs(ta * td - tb * tc) > 40) continue; // absurdly magnified near the projection edge
        var rec = this.artImage(ak2); if (!rec.ok) continue;
        ctx.globalAlpha = 0.6 * fade[ak2] * (1 - daylight * 0.7);
        ctx.setTransform(dpr * ta, dpr * tb, dpr * tc, dpr * td, dpr * te, dpr * tf);
        ctx.drawImage(red ? this.artTinted(rec) : rec.img, 0, 0);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // Native figure sketches: interpretive monoline drawings pinned to three stars, shown while the reticle
    // rests on one of the figure's constellations (or while pointing to it), fading like the Western art
    if (nativeOn && window.Path2D) {
      var sf = this.sketchFade = this.sketchFade || {}, dts = Math.min(0.1, (Date.now() - (this.lastDraw || Date.now())) / 1000);
      var taken = false; // where two figures share the same stars (Big Dipper, Pleiades) show one at a time: the one being pointed to, else the first
      for (var li2 = 0; li2 < this.lore.length; li2++) {
        var Ls = this.lore[li2]; if (!Ls.sk && !Ls.artRecs) continue;
        var pointed = this.selected && this.selected.vec === Ls.center;
        var focused = focusCon && Ls.con.indexOf(focusCon) >= 0;
        var want = pointed || (this.sky === 'native' ? true : (!taken && !(this.selected && this.selected.vec) && focused));
        if (want && (pointed || focused)) taken = true;
        var emph = pointed || focused || this.sky !== 'native';   // in Native mode the rest sit quieter
        var cur = sf[Ls.id] || 0; cur += (want ? 1 : -1) * dts * 2.2; cur = clamp(cur, 0, 1);
        if (cur > 0) sf[Ls.id] = cur; else { delete sf[Ls.id]; continue; }
        if ((want && cur < 1) || (!want && cur > 0)) this.dirty = true;
        if (Ls.artRecs && Ls.artRecs.length) { // painted figure(s) take the place of the sketch
          ctx.globalCompositeOperation = 'lighter';
          for (var ar = 0; ar < Ls.artRecs.length; ar++) {
            var R2 = Ls.artRecs[ar]; if (!R2.img) { this.loadNativeArt(R2); continue; }
            var spA = [], okA2 = true;
            for (var q5 = 0; q5 < 3; q5++) { var so2 = R2.a[q5][2] * 3, X2 = this.starVec[so2], Y2 = this.starVec[so2 + 1], Z2 = this.starVec[so2 + 2]; z = m6 * X2 + m7 * Y2 + m8 * Z2; if (z < 0.2) { okA2 = false; break; } kx = S2 / (1 + z); spA.push([cx + (m0 * X2 + m1 * Y2 + m2 * Z2) * kx, cy - (m3 * X2 + m4 * Y2 + m5 * Z2) * kx]); }
            if (!okA2) continue;
            if (red && !R2.red) { R2.red = this.artTinted({ img: R2.img }); }
            this.drawPinned(ctx, red ? R2.red : R2.img, R2.w, R2.h, R2.a, spA, (emph ? 0.62 : 0.4) * cur * (1 - daylight * 0.7));
          }
          ctx.globalCompositeOperation = 'source-over';
          continue;
        }
        if (!Ls.sk) continue;
        var spn = [], okS = true;
        for (var q4 = 0; q4 < 3; q4++) { var so = Ls.sk.a[q4][2] * 3, sx3 = this.starVec[so], sy3 = this.starVec[so + 1], sz3 = this.starVec[so + 2]; z = m6 * sx3 + m7 * sy3 + m8 * sz3; if (z < 0.2) { okS = false; break; } kx = S2 / (1 + z); spn.push([cx + (m0 * sx3 + m1 * sy3 + m2 * sz3) * kx, cy - (m3 * sx3 + m4 * sy3 + m5 * sz3) * kx]); }
        if (!okS) continue;
        var A = Ls.sk.a, ax0 = A[0][0], ay0 = A[0][1], ax1 = A[1][0], ay1 = A[1][1], ax2 = A[2][0], ay2 = A[2][1];
        var dets = (ax1 - ax0) * (ay2 - ay0) - (ax2 - ax0) * (ay1 - ay0); if (abs(dets) < 1e-6) continue;
        var sa = ((spn[1][0] - spn[0][0]) * (ay2 - ay0) - (spn[2][0] - spn[0][0]) * (ay1 - ay0)) / dets;
        var sc = ((spn[2][0] - spn[0][0]) * (ax1 - ax0) - (spn[1][0] - spn[0][0]) * (ax2 - ax0)) / dets;
        var sb = ((spn[1][1] - spn[0][1]) * (ay2 - ay0) - (spn[2][1] - spn[0][1]) * (ay1 - ay0)) / dets;
        var sdd = ((spn[2][1] - spn[0][1]) * (ax1 - ax0) - (spn[1][1] - spn[0][1]) * (ax2 - ax0)) / dets;
        var se = spn[0][0] - sa * ax0 - sc * ay0, sff = spn[0][1] - sb * ax0 - sdd * ay0;
        var scale = sqrt(abs(sa * sdd - sb * sc)); if (!isFinite(scale) || scale <= 0 || scale > 60) continue;
        if (!Ls.sk.path) Ls.sk.path = new Path2D(Ls.sketch.path);
        ctx.save(); ctx.setTransform(dpr * sa, dpr * sb, dpr * sc, dpr * sdd, dpr * se, dpr * sff);
        ctx.strokeStyle = red ? 'rgba(255,100,80,' + ((emph ? 0.85 : 0.5) * cur).toFixed(2) + ')' : 'rgba(231,128,93,' + ((emph ? 0.8 : 0.5) * cur).toFixed(2) + ')';
        ctx.lineWidth = 1.6 / scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(Ls.sk.path); ctx.restore();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    // constellation lines
    if (L.lines && west) {
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = red ? (pass ? 'rgba(220,60,40,.7)' : 'rgba(170,40,30,.4)') : (pass ? 'rgba(180,196,220,.7)' : 'rgba(153,173,197,.3)');
        ctx.beginPath();
        for (var c = 0; c < this.conKeys.length; c++) {
          var key = this.conKeys[c]; if (pass ? key !== focusCon : key === focusCon) continue;
          var segs = this.conSeg[key];
          for (i = 0; i < segs.length; i += 2) {
            var a = segs[i], b = segs[i + 1];
            var za = m6 * a[0] + m7 * a[1] + m8 * a[2], zb = m6 * b[0] + m7 * b[1] + m8 * b[2];
            if (za < -0.2 || zb < -0.2) continue;
            if (u0 * a[0] + u1 * a[1] + u2 * a[2] < -0.12 && u0 * b[0] + u1 * b[1] + u2 * b[2] < -0.12) continue;
            var ka = S2 / (1 + za), kb = S2 / (1 + zb);
            ctx.moveTo(cx + (m0 * a[0] + m1 * a[1] + m2 * a[2]) * ka, cy - (m3 * a[0] + m4 * a[1] + m5 * a[2]) * ka);
            ctx.lineTo(cx + (m0 * b[0] + m1 * b[1] + m2 * b[2]) * kb, cy - (m3 * b[0] + m4 * b[1] + m5 * b[2]) * kb);
          }
        }
        ctx.stroke();
      }
    }
    // stars
    var sv = this.starVec, sm = this.starMag, stars = D.stars, n = stars.length;
    var limMag = clamp(4.6 + (70 - this.fov) / 18, 3.5, 6.3) - daylight * 3;
    var nameMag = clamp(1.6 + (70 - this.fov) / 14, 0.5, 4.5);
    var bright = 1 - daylight * 0.7;
    var labels = [];
    for (i = 0; i < n; i++) {
      var mag = sm[i]; if (mag > limMag) break;
      var o = i * 3, X = sv[o], Y = sv[o + 1], Z = sv[o + 2];
      z = m6 * X + m7 * Y + m8 * Z; if (z < zmin) continue;
      if (u0 * X + u1 * Y + u2 * Z < -0.03) continue;
      kx = S2 / (1 + z); px = cx + (m0 * X + m1 * Y + m2 * Z) * kx; py = cy - (m3 * X + m4 * Y + m5 * Z) * kx;
      if (px < -8 || px > W + 8 || py < -8 || py > H + 8) continue;
      var rad = (mag < -1 ? 6 : 5 - mag * 0.78) * zoom * 0.9; if (rad < 0.5) rad = 0.5;
      var al = clamp((1.3 - mag * 0.14) * bright, 0.22, 1);
      var st = stars[i];
      if (red) ctx.fillStyle = 'rgba(230,60,40,' + al.toFixed(2) + ')';
      else { var col = bvColor(st[4]); ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + al.toFixed(2) + ')'; }
      if (rad < 1.1) ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      else { ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.2832); ctx.fill(); }
      if (st[6] && mag <= 4.6) hits.push({ x: px, y: py, r: 22, t: 'star', i: i });
      if (L.names && st[6] && mag <= nameMag) labels.push([px + rad + 4, py + 4, st[6], 0]);
    }
    // deep sky
    if (L.dso) {
      ctx.strokeStyle = red ? 'rgba(200,50,30,.6)' : 'rgba(153,173,197,.55)'; ctx.lineWidth = 1;
      for (i = 0; i < this.dsoVec.length; i++) {
        var dv = this.dsoVec[i], ds = D.dsos[i]; if (ds[2] === 'pos') continue;
        z = m6 * dv[0] + m7 * dv[1] + m8 * dv[2]; if (z < zmin) continue; if (u0 * dv[0] + u1 * dv[1] + u2 * dv[2] < 0) continue;
        kx = S2 / (1 + z); px = cx + (m0 * dv[0] + m1 * dv[1] + m2 * dv[2]) * kx; py = cy - (m3 * dv[0] + m4 * dv[1] + m5 * dv[2]) * kx;
        ctx.beginPath(); if (ds[2] === 's' || ds[2] === 'i' || ds[2] === 'sd') ctx.ellipse(px, py, 7 * zoom, 3.5 * zoom, 0.6, 0, 6.2832); else ctx.arc(px, py, 5 * zoom, 0, 6.2832); ctx.stroke();
        if (this.fov < 60 || ds[5] < 3.6) labels.push([px + 9, py + 4, ds[0], 1]);
        hits.push({ x: px, y: py, r: 20, t: 'dso', i: i });
      }
    }
    // Indigenous figures
    if (nativeOn) {
      ctx.lineWidth = 1.2; var accent = red ? 'rgba(255,90,70,' : 'rgba(231,128,93,';
      for (i = 0; i < this.lore.length; i++) {
        var Lr = this.lore[i]; if (!Lr.starIdx.length) continue;
        var pts = [], anyFront = false;
        for (var h = 0; h < Lr.starIdx.length; h++) {
          o = Lr.starIdx[h] * 3; X = sv[o]; Y = sv[o + 1]; Z = sv[o + 2];
          z = m6 * X + m7 * Y + m8 * Z; if (z < -0.2) { pts.push(null); continue; }
          if (u0 * X + u1 * Y + u2 * Z < -0.05) { pts.push(null); continue; }
          kx = S2 / (1 + z); pts.push([cx + (m0 * X + m1 * Y + m2 * Z) * kx, cy - (m3 * X + m4 * Y + m5 * Z) * kx]); if (z > zmin) anyFront = true;
        }
        if (!anyFront) continue;
        ctx.strokeStyle = accent + '.75)'; ctx.beginPath();
        for (h = 0; h < pts.length; h++) if (pts[h]) { ctx.moveTo(pts[h][0] + 7 * zoom, pts[h][1]); ctx.arc(pts[h][0], pts[h][1], 7 * zoom, 0, 6.2832); }
        ctx.stroke();
        if (Lr.fig === 'ring' || Lr.fig === 'path') {
          ctx.setLineDash([3, 5]); ctx.strokeStyle = accent + '.5)'; ctx.beginPath(); var first = null, prev = null;
          for (h = 0; h < pts.length; h++) { if (!pts[h]) { prev = null; continue; } if (prev) ctx.lineTo(pts[h][0], pts[h][1]); else ctx.moveTo(pts[h][0], pts[h][1]); prev = pts[h]; if (!first) first = pts[h]; }
          if (Lr.fig === 'ring' && first && prev) ctx.lineTo(first[0], first[1]);
          ctx.stroke(); ctx.setLineDash([]);
        }
        var cvv = Lr.center; z = m6 * cvv[0] + m7 * cvv[1] + m8 * cvv[2];
        if (z > 0.1) { kx = S2 / (1 + z); px = cx + (m0 * cvv[0] + m1 * cvv[1] + m2 * cvv[2]) * kx; py = cy - (m3 * cvv[0] + m4 * cvv[1] + m5 * cvv[2]) * kx; if (px > 0 && px < W && py > 0 && py < H) labels.push([px, py + (Lr.fig === 'ring' ? 0 : 26 * zoom), Lr.label || Lr.name, 2]); hits.push({ x: px, y: py, r: 30, t: 'lore', i: i }); }
      }
    }
    // constellation names
    if (L.lines && west) for (var c2 = 0; c2 < this.conKeys.length; c2++) {
      var cvec = this.conCenter[this.conKeys[c2]]; z = m6 * cvec[0] + m7 * cvec[1] + m8 * cvec[2]; if (z < 0.25) continue;
      if (u0 * cvec[0] + u1 * cvec[1] + u2 * cvec[2] < 0.02) continue;
      kx = S2 / (1 + z); px = cx + (m0 * cvec[0] + m1 * cvec[1] + m2 * cvec[2]) * kx; py = cy - (m3 * cvec[0] + m4 * cvec[1] + m5 * cvec[2]) * kx;
      labels.push([px, py, D.con[this.conKeys[c2]].n, 3]); hits.push({ x: px, y: py, r: 34, t: 'con', k: this.conKeys[c2] });
    }
    // meteor shower radiants
    if (L.meteors) {
      var act = this.activeShowers(d);
      for (i = 0; i < act.length; i++) {
        var sh = act[i].s, rv = this.showerVec[sh.id]; z = m6 * rv[0] + m7 * rv[1] + m8 * rv[2]; if (z < zmin) continue;
        if (u0 * rv[0] + u1 * rv[1] + u2 * rv[2] < -0.05) continue;
        kx = S2 / (1 + z); px = cx + (m0 * rv[0] + m1 * rv[1] + m2 * rv[2]) * kx; py = cy - (m3 * rv[0] + m4 * rv[1] + m5 * rv[2]) * kx;
        ctx.strokeStyle = red ? 'rgba(255,90,70,.7)' : 'rgba(249,214,53,.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); for (var q = 0; q < 8; q++) { var an = q * Math.PI / 4; ctx.moveTo(px + cos(an) * 6, py + sin(an) * 6); ctx.lineTo(px + cos(an) * 16, py + sin(an) * 16); } ctx.stroke();
        labels.push([px + 20, py + 4, sh.name + (act[i].peakIn === 0 ? ' · peak tonight' : ''), 4]); hits.push({ x: px, y: py, r: 26, t: 'shower', i: C_idx(this.content.showers, sh) });
      }
    }
    // planets, Sun, Moon
    var bodiesDrawn = [];
    if (L.planets) {
      var mb0 = Mb[0], mb1 = Mb[1], mb2 = Mb[2], mb3 = Mb[3], mb4 = Mb[4], mb5 = Mb[5], mb6 = Mb[6], mb7 = Mb[7], mb8 = Mb[8];
      var hz0 = HZ[6], hz1 = HZ[7], hz2 = HZ[8];
      for (var pk in this.ss) {
        var body = this.ss[pk], bv = body.vecDate;
        if (hz0 * bv[0] + hz1 * bv[1] + hz2 * bv[2] < -0.02) continue;
        z = mb6 * bv[0] + mb7 * bv[1] + mb8 * bv[2]; if (z < zmin) continue;
        kx = S2 / (1 + z); px = cx + (mb0 * bv[0] + mb1 * bv[1] + mb2 * bv[2]) * kx; py = cy - (mb3 * bv[0] + mb4 * bv[1] + mb5 * bv[2]) * kx;
        if (pk === 'sun') {
          var sr = Math.max(9, S2 * Math.tan(0.27 * D2R)) * zoom;
          var g = ctx.createRadialGradient(px, py, sr * 0.5, px, py, sr * 6); g.addColorStop(0, red ? 'rgba(255,80,60,.5)' : 'rgba(249,214,53,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, sr * 6, 0, 6.2832); ctx.fill();
          ctx.fillStyle = red ? '#ff5a46' : '#fbe58a'; ctx.beginPath(); ctx.arc(px, py, sr, 0, 6.2832); ctx.fill();
          labels.push([px + sr + 6, py + 4, 'Sun', 5]); hits.push({ x: px, y: py, r: 26, t: 'body', k: 'sun' });
        } else {
          var info = PLANET_INFO[pk]; if (body.mag > limMag + 1.2 && pk !== 'uranus') continue;
          if ((pk === 'uranus' || pk === 'neptune') && this.fov > 50 && !L.dso) continue;
          var pr = clamp(info.size * 2.4 * zoom * (1.3 - body.mag * 0.12), 1.5, 9);
          if (body.mag < 0) { var gg = ctx.createRadialGradient(px, py, pr, px, py, pr * 4); gg.addColorStop(0, red ? 'rgba(255,90,70,.35)' : 'rgba(255,240,200,.28)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(px, py, pr * 4, 0, 6.2832); ctx.fill(); }
          ctx.fillStyle = red ? '#ff6b5b' : info.color; ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
          labels.push([px + pr + 5, py + 4, info.name, 5]); hits.push({ x: px, y: py, r: 24, t: 'body', k: pk });
        }
        bodiesDrawn.push(pk);
      }
      // Moon
      var mv2 = this.moon.vec;
      if (hz0 * mv2[0] + hz1 * mv2[1] + hz2 * mv2[2] > -0.03) {
        z = mb6 * mv2[0] + mb7 * mv2[1] + mb8 * mv2[2];
        if (z > zmin) {
          kx = S2 / (1 + z); px = cx + (mb0 * mv2[0] + mb1 * mv2[1] + mb2 * mv2[2]) * kx; py = cy - (mb3 * mv2[0] + mb4 * mv2[1] + mb5 * mv2[2]) * kx;
          var R = Math.max(8, S2 * Math.tan(0.26 * D2R)) * zoom;
          // direction to the Sun on screen (Sun may be behind the camera: use the full sphere projection anyway)
          var sv2 = this.ss.sun.vecDate, zs = mb6 * sv2[0] + mb7 * sv2[1] + mb8 * sv2[2], ks = S2 / (1 + Math.max(zs, -0.98));
          var sx = cx + (mb0 * sv2[0] + mb1 * sv2[1] + mb2 * sv2[2]) * ks, sy = cy - (mb3 * sv2[0] + mb4 * sv2[1] + mb5 * sv2[2]) * ks;
          var rot = atan2(sy - py, sx - px), k2 = this.phase.illum;
          var gm = ctx.createRadialGradient(px, py, R, px, py, R * 3.2); gm.addColorStop(0, red ? 'rgba(255,90,70,' + (0.25 * k2) + ')' : 'rgba(220,225,235,' + (0.22 * k2) + ')'); gm.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gm; ctx.beginPath(); ctx.arc(px, py, R * 3.2, 0, 6.2832); ctx.fill();
          ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
          ctx.fillStyle = red ? 'rgba(90,10,8,1)' : 'rgba(40,46,58,1)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();
          ctx.fillStyle = red ? '#ff7a66' : '#e9e6da'; ctx.beginPath();
          if (k2 >= 0.5) { ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false); ctx.ellipse(0, 0, Math.max(0.01, R * (2 * k2 - 1)), R, 0, Math.PI / 2, 3 * Math.PI / 2, false); }
          else { ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false); ctx.ellipse(0, 0, Math.max(0.01, R * (1 - 2 * k2)), R, 0, Math.PI / 2, -Math.PI / 2, true); }
          ctx.closePath(); ctx.fill(); ctx.restore();
          labels.push([px + R + 6, py + 4, 'Moon', 5]); hits.push({ x: px, y: py, r: Math.max(26, R + 8), t: 'body', k: 'moon' });
          bodiesDrawn.push('moon');
        }
      }
    }
    // selected target: highlight or edge arrow
    if (this.selected) {
      var tv = this.selected.j2000 ? mulMat(Ms, this.selected.vec) : mulMat(Mb, this.selected.vec);
      ctx.strokeStyle = red ? 'rgba(255,90,70,.9)' : 'rgba(231,128,93,.9)'; ctx.lineWidth = 1.5;
      if (tv[2] > zmin) {
        kx = S2 / (1 + tv[2]); px = cx + tv[0] * kx; py = cy - tv[1] * kx;
        if (px > 0 && px < W && py > 0 && py < H) {
          var pulse = 18 + 6 * sin(Date.now() / 300); ctx.beginPath(); ctx.arc(px, py, pulse * zoom, 0, 6.2832); ctx.stroke(); this.dirty = true;
          if (Math.hypot(px - cx, py - cy) < Math.min(W, H) * 0.18) {
            this.selected.centered = (this.selected.centered || Date.now());
            var held = Date.now() - this.selected.centered;
            if (held > 900 && !this.selected.zoomed && this.selected.size && fovFor(this.selected.size) < this.fov - 8) { this.selected.zoomed = true; this.animateFov(fovFor(this.selected.size)); this.toast('Zooming in on ' + this.selected.label, 1800); }
            if (held > 2500 && !this.tour && !this.selected.size) this.clearSelected('Found it: ' + this.selected.label);
          }
          else this.selected.centered = 0;
        }
        else this.drawEdgeArrow(ctx, atan2(-(py - cy), px - cx));
      } else this.drawEdgeArrow(ctx, atan2(tv[1], tv[0]));
    }
    // ground + horizon
    this.drawGround(ctx, W, H, Cam, S2, cx, cy, red, L.grid, camOn);
    // labels last
    ctx.textBaseline = 'alphabetic';
    var placed = [];
    for (i = 0; i < labels.length; i++) {
      var lb = labels[i], kind = lb[3];
      if (lb[1] < 78 && lb[1] > -20) continue; // keep the readout at the top clear
      if (kind === 2 || kind === 3) { // nudge figure/constellation names off each other
        var lw = lb[2].length * (kind === 3 ? 8 : 6.5), lx0 = lb[0] - lw / 2, ly = lb[1];
        for (var tries = 0; tries < 4; tries++) {
          var clash = false;
          for (var q2 = 0; q2 < placed.length; q2++) { var pr = placed[q2]; if (lx0 < pr[2] && lx0 + lw > pr[0] && ly - 12 < pr[3] && ly + 4 > pr[1]) { clash = true; break; } }
          if (!clash) break; ly += 16;
        }
        lb[1] = ly; placed.push([lx0, ly - 12, lx0 + lw, ly + 4]);
      }
      if (kind === 3) { ctx.font = '600 ' + Math.round(13 * clamp(zoom, 0.9, 1.4)) + 'px ' + FONT_D; ctx.textAlign = 'center'; ctx.fillStyle = red ? 'rgba(200,50,35,.55)' : 'rgba(153,173,197,.5)'; ctx.fillText(lb[2].toUpperCase(), lb[0], lb[1]); }
      else if (kind === 2) { ctx.font = 'italic 13px ' + FONT_B; ctx.textAlign = 'center'; ctx.fillStyle = red ? 'rgba(255,100,80,.9)' : 'rgba(231,128,93,.9)'; ctx.fillText(lb[2], lb[0], lb[1] + 4); }
      else if (kind === 5) { ctx.font = '12px ' + FONT_C; ctx.textAlign = 'left'; ctx.fillStyle = red ? 'rgba(255,110,90,.95)' : 'rgba(240,235,220,.9)'; ctx.fillText(lb[2], lb[0], lb[1]); }
      else if (kind === 4) { ctx.font = '11px ' + FONT_C; ctx.textAlign = 'left'; ctx.fillStyle = red ? 'rgba(255,110,90,.85)' : 'rgba(249,214,53,.8)'; ctx.fillText(lb[2], lb[0], lb[1]); }
      else { ctx.font = (kind === 1 ? 'italic ' : '') + '11.5px ' + FONT_C; ctx.textAlign = 'left'; ctx.fillStyle = red ? 'rgba(220,70,50,.8)' : 'rgba(153,173,197,.85)'; ctx.fillText(lb[2], lb[0], lb[1]); }
    }
    if (sunAlt > -6 && !this.sunUpNoted) { this.sunUpNoted = true; this.toast(sunAlt > 0 ? 'The Sun is up. The sky is drawn as it would look after dark.' : 'Twilight: the brightest stars and planets are coming out.', 4000); }
    this.updateReadout(d);
  };
  function C_idx(arr, item) { for (var i = 0; i < arr.length; i++) if (arr[i] === item) return i; return -1; }
  SkyApp.prototype.drawEdgeArrow = function (ctx, ang) {
    var cx = this.cx, cy = this.cy, r = Math.min(cx, cy) - 54;
    var x = cx + cos(ang) * r, y = cy - sin(ang) * r;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-ang); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath();
    ctx.fillStyle = this.red ? 'rgba(255,90,70,.9)' : 'rgba(231,128,93,.9)'; ctx.fill(); ctx.restore();
  };
  SkyApp.prototype.drawGround = function (ctx, W, H, Cam, S2, cx, cy, red, marks, camOn) {
    // project horizon points; the horizon is a circle in stereographic projection
    function projHz(az, alt) { var v = mulMat(Cam, hzVec(az, alt)); if (v[2] <= -0.995) return null; var k = S2 / (1 + v[2]); return [cx + v[0] * k, cy - v[1] * k, v[2]]; }
    var p1 = projHz(0, 0), p2 = projHz(120, 0), p3 = projHz(240, 0);
    var groundFill = camOn ? (red ? 'rgba(12,2,2,.35)' : 'rgba(5,9,15,.35)') : (red ? 'rgba(12,2,2,.88)' : 'rgba(5,9,15,.86)');
    if (p1 && p2 && p3) {
      var ax = p1[0], ay = p1[1], bx = p2[0], by = p2[1], qx = p3[0], qy = p3[1];
      var dd = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
      if (abs(dd) > 1e-6) {
        var ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / dd;
        var uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / dd;
        var rr = Math.hypot(ax - ux, ay - uy);
        if (rr < 1e6) {
          var nad = mulMat(Cam, [0, 0, -1]), inside;
          if (nad[2] > -0.99) { var kn = S2 / (1 + nad[2]); inside = Math.hypot(cx + nad[0] * kn - ux, cy - nad[1] * kn - uy) < rr; } else inside = false;
          ctx.fillStyle = groundFill; ctx.beginPath();
          if (inside) ctx.arc(ux, uy, rr, 0, 6.2832);
          else { ctx.rect(-10, -10, W + 20, H + 20); ctx.arc(ux, uy, rr, 0, 6.2832, true); }
          ctx.fill('evenodd');
          ctx.strokeStyle = red ? 'rgba(200,50,35,.5)' : 'rgba(153,173,197,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ux, uy, rr, 0, 6.2832); ctx.stroke();
        }
      }
    }
    if (!marks) return;
    var names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var az = 0; az < 360; az += 15) {
      var p = projHz(az, 0); if (!p || p[2] < 0.05) continue;
      var q = projHz(az, az % 45 === 0 ? 2.2 : 1); if (!q) continue;
      ctx.strokeStyle = red ? 'rgba(200,50,35,.5)' : 'rgba(153,173,197,.5)'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      if (names[az]) { var lp = projHz(az, 4.5); if (lp) { ctx.font = '700 ' + (az % 90 === 0 ? 20 : 14) + 'px ' + FONT_D; ctx.fillStyle = az === 0 ? (red ? '#ff6b5b' : BRAND.orange) : (red ? 'rgba(220,70,50,.9)' : 'rgba(209,204,189,.85)'); ctx.fillText(names[az], lp[0], lp[1]); } }
    }
  };

  // ---- readout, picking -------------------------------------------------------------------
  SkyApp.prototype.inverseView = function (px, py) { // screen -> J2000 unit vector
    var x = (px - this.cx) / (2 * this.S), y = -(py - this.cy) / (2 * this.S), r2 = x * x + y * y;
    var cam = [2 * x / (1 + r2), 2 * y / (1 + r2), (1 - r2) / (1 + r2)];
    var M = this.Ms; // transpose multiply
    return [M[0] * cam[0] + M[3] * cam[1] + M[6] * cam[2], M[1] * cam[0] + M[4] * cam[1] + M[7] * cam[2], M[2] * cam[0] + M[5] * cam[1] + M[8] * cam[2]];
  };
  SkyApp.prototype.constellationAt = function (vJ2000) {
    var rd = vecToRaDec(vJ2000), B = this.data.bnd, ra = rd.ra, dec = rd.dec;
    if (B) {
      for (var k in B) {
        var poly = B[k], inside = false, kk = k === 'Ser2' ? 'Ser' : k, c0 = poly[Math.floor(poly.length / 2)][0];
        var x = ((ra - c0 + 540) % 360) - 180; // unwrap around the constellation's own center so the seam is far away
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          var xi = ((poly[i][0] - c0 + 540) % 360) - 180, yi = poly[i][1], xj = ((poly[j][0] - c0 + 540) % 360) - 180, yj = poly[j][1];
          if ((yi > dec) !== (yj > dec) && x < (xj - xi) * (dec - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return kk;
      }
      if (dec > 66) return 'UMi'; if (dec < -75) return 'Oct';
    }
    var best = null, bd = 1e9;
    for (var c in this.conCenter) { var d = angSep(vJ2000, this.conCenter[c]); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  SkyApp.prototype.updateReadout = function (d) {
    var t = Date.now(); if (t - this.lastReadout < 250) return; this.lastReadout = t;
    var f = this.view.f, aa = vecToAzAlt(f);
    var vj = this.inverseView(this.cx, this.cy);
    var con = this.constellationAt(vj); this.focusCon = con;
    var title = '', sub = '';
    // nearest body within 4°
    var bestB = null, bdist = 4;
    for (var pk in this.ss) { var hv = mulMat(this.HZ, this.ss[pk].vecDate); var s = angSep(hv, f); if (s < bdist) { bdist = s; bestB = pk; } }
    var mvh = mulMat(this.HZ, this.moon.vec); if (angSep(mvh, f) < bdist) { bestB = 'moon'; }
    var nat = this.showNative() ? this.nativeFor(con) : null, conName = this.data.con[con] ? this.data.con[con].n : '';
    if (bestB && this.layers.planets) {
      title = bestB === 'moon' ? 'The Moon' : this.ss[bestB].name;
      sub = (bestB === 'moon' ? this.phase.name : bestB === 'sun' ? 'Our star' : 'Planet') + ' · in ' + conName + ' · ';
    } else if (nat) {
      title = nat.label || nat.name; sub = (nat.translation || '').split(' /')[0] + ' · ' + nat.culture.split(',')[0] + (this.sky === 'both' ? ' · ' + conName : '') + ' · ';
    } else {
      title = conName;
      var bestS = -1, sd = 7, Ms = this.Ms;
      for (var i = 0; i < this.data.stars.length && this.data.stars[i][3] < 4.2; i++) {
        if (!this.data.stars[i][6]) continue; var o = i * 3, z = Ms[6] * this.starVec[o] + Ms[7] * this.starVec[o + 1] + Ms[8] * this.starVec[o + 2];
        var ang = Math.acos(clamp(z, -1, 1)) * R2D; if (ang < sd) { sd = ang; bestS = i; }
      }
      sub = (bestS >= 0 ? 'near ' + this.data.stars[bestS][6] + ' · ' : '');
    }
    if (aa.alt < -2) { title = 'Below the horizon'; sub = 'Raise the phone toward the sky'; }
    else sub += 'looking ' + fmtAz(aa.az) + ', ' + Math.round(aa.alt) + '° up';
    if (this.roC.textContent !== title) { this.roC.textContent = title; this.roC.style.fontSize = title.length > 16 ? '20px' : title.length > 12 ? '25px' : ''; }
    this.roS.textContent = sub;
  };
  SkyApp.prototype.tap = function (px, py) {
    if (this.sheet.classList.contains('show') && this.sheetName === 'info') { this.hideSheet(); return; }
    this.sheetAuto = false;
    var best = null, bd = 1e9, pri = { body: 0, lore: 1, star: 2, dso: 2, shower: 2, con: 3 };
    for (var i = 0; i < this.hits.length; i++) {
      var h = this.hits[i], d = Math.hypot(h.x - px, h.y - py); if (d > h.r) continue;
      var score = d + pri[h.t] * 10; if (score < bd) { bd = score; best = h; }
    }
    if (!best) { var vj = this.inverseView(px, py); if (vecToAzAlt(mulMat(matMul(this.HZ, this.P), vj)).alt < 0) return; var ck = this.constellationAt(vj), nl = this.showNative() ? this.nativeFor(ck) : null; best = (nl && this.sky === 'native') ? { t: 'lore', i: C_idx(this.lore, nl) } : { t: 'con', k: ck }; }
    this.showInfo(best);
  };
  SkyApp.prototype.activeShowers = function (d) {
    var out = [], y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), md = m * 100 + day, S = this.content.showers;
    function num(s) { return parseInt(s.slice(0, 2), 10) * 100 + parseInt(s.slice(3), 10); }
    for (var i = 0; i < S.length; i++) {
      var s = S[i], a = num(s.start), b = num(s.end), on = a <= b ? (md >= a && md <= b) : (md >= a || md <= b);
      if (!on) continue;
      var pk = new Date(y + (num(s.peak) < a && md >= a ? 1 : 0), parseInt(s.peak.slice(0, 2), 10) - 1, parseInt(s.peak.slice(3), 10));
      var peakIn = Math.round((pk - new Date(y, m - 1, day)) / 86400000);
      out.push({ s: s, peakIn: peakIn });
    }
    return out;
  };
