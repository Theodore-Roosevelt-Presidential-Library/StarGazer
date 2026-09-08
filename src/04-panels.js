
  // ---------------------------------------------------------------------------------------------
  // Panels
  // ---------------------------------------------------------------------------------------------
  SkyApp.prototype.showSheet = function (name, title, html) {
    if (name !== 'info') this.sheetAuto = false;
    this.sheetName = name;
    var nbs = this.el.querySelectorAll('.nb'); for (var i = 0; i < nbs.length; i++) nbs[i].classList.toggle('on', nbs[i].getAttribute('data-sheet') === name);
    if (name === 'tonight') { title = 'Tonight'; html = this.tonightHtml(); }
    else if (name === 'aurora') { title = 'Aurora'; html = this.auroraHtml(); }
    else if (name === 'stories') { title = 'Stories in the sky'; html = this.storiesHtml(); }
    else if (name === 'settings') { title = 'Settings'; html = this.settingsHtml(); }
    this.sheetT.textContent = title; this.sheetB.innerHTML = html; this.sheetB.scrollTop = 0;
    this.sheet.classList.add('show');
    this.bindSheet(name);
  };
  SkyApp.prototype.hideSheet = function () {
    this.sheet.classList.remove('show'); this.sheetName = null;
    var nbs = this.el.querySelectorAll('.nb'); for (var i = 0; i < nbs.length; i++) nbs[i].classList.remove('on');
  };
  SkyApp.prototype.bindSheet = function (name) {
    var self = this, b = this.sheetB;
    if (!this.sheetBound) { this.sheetBound = true; b.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act]') : null; if (!t) return;
      var act = t.getAttribute('data-act'), arg = t.getAttribute('data-arg');
      if (act === 'show-lore') { var L = self.lore[+arg]; if (L.center) { self.select(L.center, true, L.label || L.name, L.size); self.hideSheet(); self.toast('Follow the arrow. Tap the banner at the top to stop.', 3000); } }
      else if (act === 'show-vec') { var p = arg.split(','); self.select([+p[0], +p[1], +p[2]], p[3] === '1', t.getAttribute('data-label') || '', +(t.getAttribute('data-size') || 0)); self.hideSheet(); self.toast('Follow the arrow. Tap the banner at the top to stop.', 3000); }
      else if (act === 'clear-sel') { self.clearSelected(); self.hideSheet(); }
      else if (act === 'lore') { self.showInfo({ t: 'lore', i: +arg }); }
      else if (act === 'con') { self.showInfo({ t: 'con', k: arg }); }
      else if (act === 'sheet') { self.showSheet(arg); }
      else if (act === 'geo') { self.useGeolocation(); }
      else if (act === 'medora') { self.loc = DEFAULT_LOC; self.persist(); self.computeBodies(true); self.dirty = true; self.showSheet('settings'); self.toast('Sky set for Medora, North Dakota'); }
      else if (act === 'now') { self.timeOffset = 0; self.computeBodies(true); self.dirty = true; self.showSheet('settings'); }
      else if (act === 'recal') { self.calib = 0; self.persist(); self.toast('Compass offset cleared'); }
      else if (act === 'aurora-refresh') { self.auroraCache = null; self.showSheet('aurora'); }
      else if (act === 'sky') { self.setSky(arg); self.showSheet('settings'); }
      else if (act === 'tab') { var panes = self.sheetB.querySelectorAll('.tabpane'); for (var pi = 0; pi < panes.length; pi++) panes[pi].hidden = panes[pi].getAttribute('data-pane') !== arg; if (arg === 'origin') self.sheetB.scrollTop = 0; }
    }); }
    if (name === 'settings') {
      var tr = b.querySelector('#sg-time'), tl = b.querySelector('#sg-timel');
      if (tr) tr.addEventListener('input', function () { self.timeOffset = +tr.value; tl.textContent = self.timeLabel(); self.computeBodies(true); self.dirty = true; });
      var dr = b.querySelector('#sg-dim'); if (dr) dr.addEventListener('input', function () { self.setDim(+dr.value / 100); });
      var rs = b.querySelector('#sg-red'); if (rs) rs.addEventListener('change', function () { self.setRed(rs.checked); });
      var sd = b.querySelector('#sg-steady'); if (sd) sd.addEventListener('change', function () { self.steady = sd.checked; self.persist(); });
      var ls = b.querySelectorAll('[data-layer]');
      for (var i = 0; i < ls.length; i++) ls[i].addEventListener('change', function (e) { self.layers[e.target.getAttribute('data-layer')] = e.target.checked; self.updateChips(); self.persist(); self.dirty = true; });
    }
    if (name === 'aurora' && !this.auroraCache) this.fetchAurora();
  };
  SkyApp.prototype.timeLabel = function () {
    if (!this.timeOffset) return 'Now';
    var m = abs(this.timeOffset), h = Math.floor(m / 60), mm = m % 60, d = this.now();
    return (this.timeOffset > 0 ? '+' : '−') + h + 'h' + (mm ? ' ' + mm + 'm' : '') + ' · ' + fmtTime(d) + ' ' + d.toLocaleDateString(undefined, { weekday: 'short' });
  };
  SkyApp.prototype.useGeolocation = function () {
    var self = this;
    if (!navigator.geolocation) { self.toast('Location is not available in this browser.'); return; }
    self.toast('Finding your location…', 6000);
    navigator.geolocation.getCurrentPosition(function (pos) {
      self.loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Your location (' + pos.coords.latitude.toFixed(2) + ', ' + pos.coords.longitude.toFixed(2) + ')' };
      self.locFixed = false; var pp = loadPrefs(); delete pp.geoDenied; savePrefs(pp); self.persist(); self.computeBodies(true); self.dirty = true; self.toast('Sky set for your location'); if (self.sheetName === 'settings') self.showSheet('settings');
    }, function () { self.toast('Location was not shared. Showing the sky over ' + self.loc.name + '. On iPhone: Settings → Privacy → Location Services → Safari.', 5000); }, { timeout: 10000, maximumAge: 600000 });
  };

  // ---- object info ----------------------------------------------------------------------------
  SkyApp.prototype.altAzLine = function (vecHz) {
    var aa = vecToAzAlt(vecHz);
    return aa.alt < 0 ? 'Below the horizon right now' : Math.round(aa.alt) + '° above the horizon, toward the ' + fmtAz(aa.az).replace(/^N$/, 'north').replace(/^E$/, 'east').replace(/^S$/, 'south').replace(/^W$/, 'west');
  };
  SkyApp.prototype.loreBlock = function (entries, compact) {
    if (!entries || !entries.length) return '';
    var h = '';
    for (var i = 0; i < entries.length; i++) {
      var L = entries[i], idx = C_idx(this.lore, L);
      if (compact) { h += '<div class="item"><h4>' + esc(L.name.split(' (')[0]) + '</h4><div class="d">' + esc(L.culture) + (L.translation ? ' · ' + esc(L.translation.split(' /')[0]) : '') + '</div><button class="link" data-act="lore" data-arg="' + idx + '">Read the story</button></div>'; }
      else h += this.loreDetail(L, idx);
    }
    return h;
  };
  SkyApp.prototype.loreDetail = function (L, idx) {
    var badges = '<span class="tag">' + esc(L.culture) + '</span>';
    return '<div class="item"><h4>' + esc(L.name) + '</h4><div class="d">' + esc(L.translation || '') + (L.western ? ' · ' + esc(L.western) : '') + '</div>' +
      '<div style="margin:6px 0 4px">' + badges + '</div><p class="b">' + esc(L.story) + '</p>' +
      (L.center ? (this.loreStatus(L).up ? '<button class="btn2" data-act="show-lore" data-arg="' + idx + '">Point me to it</button>' : '<div class="meta">' + esc(this.loreStatus(L).text) + '</div>') : '') + '</div>';
  };
  SkyApp.prototype.originBlock = function (k) {   // one line on the card; the full history sits behind a tab
    var o = this.content.origins && this.content.origins[k]; if (!o) return '';
    var first = o.text.split('. ')[0] + '.';
    return '<div class="meta" style="margin-top:6px"><span class="tag">' + esc(o.era) + '</span>' + esc(first) + ' <button class="link" data-act="tab" data-arg="origin">Full history</button></div>' +
      '<div class="tabpane" data-pane="origin" hidden><div class="k">Where it came from</div><p class="b">' + esc(o.text) + '</p><button class="link" data-act="tab" data-arg="story">Back to the story</button></div>';
  };
  SkyApp.prototype.conBlock = function (k, withLore) {
    var c = this.data.con[k]; if (!c) return '';
    var story = this.content.western[k] || '';
    var h = '<div class="k">About ' + esc(c.n) + '</div><div class="tabpane" data-pane="story"><p>' + esc(story) + '</p></div>' + this.originBlock(k);
    if (withLore && this.loreByCon[k]) { h += '<div class="k">In other skies</div>' + this.loreBlock(this.loreByCon[k], true); }
    return h;
  };
  SkyApp.prototype.showInfo = function (hit) {
    var D = this.data, title = '', h = '', self = this;
    if (hit.t === 'star') {
      var s = D.stars[hit.i], con = D.con[s[5]], name = s[6] || (s[7] && con ? s[7] + ' ' + con.g : 'HIP ' + s[0]);
      title = name;
      var hz = mulMat(matMul(this.HZ, this.P), [this.starVec[hit.i * 3], this.starVec[hit.i * 3 + 1], this.starVec[hit.i * 3 + 2]]);
      h += '<div class="meta">Star' + (con ? ' in ' + esc(con.n) : '') + ' · magnitude ' + s[3].toFixed(1) + ' · ' + bvWord(s[4]) + (s[7] && s[6] ? ' · ' + esc(s[7]) + ' ' + esc(con.g) : '') + '<br>' + this.altAzLine(hz) + '</div>';
      if (s[3] < 0.5) h += '<p>One of the brightest stars in the sky.</p>';
      var lore = this.loreByHip[s[0]];
      if (lore) h += '<div class="k">Native sky</div>' + this.loreBlock(lore, false);
      if (con) h += this.conBlock(s[5], !lore);
    } else if (hit.t === 'body') {
      var k = hit.k;
      if (k === 'moon') {
        var ph = this.phase; title = 'The Moon';
        var conM = this.constellationAt(mulMat(transpose(this.P), this.moon.vec));
        h += '<div class="meta">' + ph.name + ' · ' + Math.round(ph.illum * 100) + '% lit · ' + Math.round(ph.age) + ' days old · ' + Math.round(this.moon.distKm).toLocaleString() + ' km away' + (D.con[conM] ? ' · in ' + esc(D.con[conM].n) : '') + '<br>' + this.altAzLine(mulMat(this.HZ, this.moon.vec)) + '</div>';
        h += '<p>' + (ph.dl < 180 ? 'The Moon is waxing: a little more of it is lit each night, on its way to full.' : 'The Moon is waning: it rises later each night and grows thinner toward new.') + ' Moonlight washes out faint stars and the Milky Way, so the darkest skies come in the week around new Moon.</p>';
        h += this.moonTimesHtml();
        var lm = []; for (var li = 0; li < this.lore.length; li++) if (this.lore[li].body.indexOf('moon') >= 0) lm.push(this.lore[li]);
        if (lm.length) h += '<div class="k">Native sky</div>' + this.loreBlock(lm, true);
      } else {
        var b = this.ss[k]; title = b.name;
        var conB = this.constellationAt(b.vec);
        if (k === 'sun') {
          h += '<div class="meta">Our star · ' + (D.con[conB] ? 'in ' + esc(D.con[conB].n) + ' · ' : '') + this.altAzLine(mulMat(this.HZ, b.vecDate)) + '</div>' + this.sunTimesHtml() + '<p>Never look at the Sun through binoculars or a telescope without a proper solar filter.</p>';
        } else {
          var km = b.dist * 149597870.7;
          h += '<div class="meta">Planet · magnitude ' + b.mag.toFixed(1) + (D.con[conB] ? ' · in ' + esc(D.con[conB].n) : '') + ' · ' + (km / 1e6).toFixed(0) + ' million km away<br>' + this.altAzLine(mulMat(this.HZ, b.vecDate)) + '</div>';
          h += '<p>' + esc(PLANET_INFO[k].blurb) + '</p>';
          if (k === 'venus' || k === 'mercury') h += '<p>' + (b.elong < 12 ? 'Right now it is too close to the Sun to see.' : 'Currently ' + Math.round(b.elong) + '° from the Sun, so look for it in ' + (this.isMorningStar(b) ? 'the morning sky before sunrise.' : 'the evening sky after sunset.')) + '</p>';
          h += this.bodyTimesHtml(b.vecDate, b.name);
          var lb = []; for (var lj = 0; lj < this.lore.length; lj++) if (this.lore[lj].body.indexOf(k) >= 0) lb.push(this.lore[lj]);
          if (lb.length) h += '<div class="k">Native sky</div>' + this.loreBlock(lb, true);
        }
      }
    } else if (hit.t === 'dso') {
      var ds = D.dsos[hit.i], words = { oc: 'Open star cluster', gc: 'Globular star cluster', s: 'Galaxy', sfr: 'Nebula (star-forming region)', en: 'Nebula', i: 'Galaxy', sd: 'Galaxy', pos: 'Position' };
      title = ds[0]; var conD = this.constellationAt(this.dsoVec[hit.i]);
      h += '<div class="meta">' + (words[ds[2]] || 'Deep-sky object') + (ds[1] !== ds[0] ? ' · ' + esc(ds[1]) : '') + ' · magnitude ' + ds[5] + (D.con[conD] ? ' · in ' + esc(D.con[conD].n) : '') + '<br>' + this.altAzLine(mulMat(matMul(this.HZ, this.P), this.dsoVec[hit.i])) + '</div>';
      h += '<p>' + (ds[5] < 4 ? 'Visible to the naked eye from a dark site as a soft patch of light. ' : 'Best with binoculars. ') + (ds[2] === 's' ? 'The light arriving tonight left this galaxy long before there were people to see it.' : ds[2] === 'oc' ? 'A family of young stars born together from one cloud of gas.' : ds[2] === 'gc' ? 'A ball of hundreds of thousands of ancient stars orbiting the Milky Way.' : 'A glowing cloud of gas where new stars are forming.') + '</p>';
      if (ds[1] === 'M 45') { var lp = this.loreByHip[17702]; if (lp) h += '<div class="k">Native sky</div>' + this.loreBlock(lp, true); }
      h += this.conBlock(conD, true);
    } else if (hit.t === 'con') {
      var c = D.con[hit.k]; if (!c) return; title = c.n;
      h += '<div class="meta">Constellation · ' + this.altAzLine(mulMat(matMul(this.HZ, this.P), this.conCenter[hit.k])) + '</div>';
      h += '<div class="tabpane" data-pane="story"><p>' + esc(this.content.western[hit.k] || '') + '</p></div>' + this.originBlock(hit.k);
      if (this.loreByCon[hit.k]) h += '<div class="k">In other skies</div>' + this.loreBlock(this.loreByCon[hit.k], true);
      h += '<button class="btn2" data-act="show-vec" data-label="' + esc(c.n) + '" data-size="' + (this.conSize[hit.k] || 0) + '" data-arg="' + this.conCenter[hit.k].join(',') + ',1">Point me to it</button>';
    } else if (hit.t === 'lore') {
      var L = this.lore[hit.i]; title = L.name.split(' (')[0].split(' /')[0];
      h += this.loreDetail(L, hit.i);
    } else if (hit.t === 'shower') {
      var sh = this.content.showers[hit.i]; title = sh.name + ' meteors';
      h += '<div class="meta">Active ' + fmtMD(sh.start) + ' – ' + fmtMD(sh.end) + ' · peak ' + fmtMD(sh.peak) + ' · up to ' + sh.zhr + ' per hour under ideal skies · debris from ' + esc(sh.parent) + '</div>';
      h += '<p>' + esc(sh.note) + '</p><p>Meteors can appear anywhere in the sky; their trails point back to this radiant. Lie back, let your eyes adjust for 20 minutes, and look about halfway up.</p>';
      var lf = []; for (var lk = 0; lk < this.lore.length; lk++) if (this.lore[lk].id === 'lak-fallen-star') lf.push(this.lore[lk]);
      if (lf.length) h += '<div class="k">Native sky</div>' + this.loreBlock(lf, true);
    }
    if (this.selected) h += '<p><button class="link" data-act="clear-sel">Stop pointing</button></p>';
    // a card that opened because you are already looking at the thing has no use for "Point me to it"
    if (this.sheetAuto) h = h.replace(/<button class="(?:btn2|link)" data-act="show-(?:vec|lore)"[^>]*>[^<]*<\/button>/g, '');
    this.showSheet('info', title, h);
  };
  function transpose(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
  function fmtMD(s) { var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return mo[parseInt(s.slice(0, 2), 10) - 1] + ' ' + parseInt(s.slice(3), 10); }
  SkyApp.prototype.isMorningStar = function (b) { // elongation west of the Sun -> morning
    var d = norm360(b.ra - this.ss.sun.ra); return d > 180;
  };
  SkyApp.prototype.bodyTimesHtml = function (vecDate, name) {
    var self = this, start = this.now();
    var ev = scanCrossings(start, 24, 10, function (t) { return altOf(vecDate, self.loc.lat, lstFor(t, self.loc.lon)); }, -0.6);
    if (!ev.length) return '';
    var parts = []; for (var i = 0; i < ev.length; i++) parts.push((ev[i].type === 'rise' ? 'rises ' : 'sets ') + fmtTime(ev[i].time) + (ev[i].time.getDate() !== start.getDate() ? ' (' + ev[i].time.toLocaleDateString(undefined, { weekday: 'short' }) + ')' : ''));
    return '<div class="meta">' + esc(name) + ' ' + parts.join(', ') + '.</div>';
  };
  SkyApp.prototype.moonTimesHtml = function () {
    var self = this, start = this.now();
    var ev = scanCrossings(start, 24, 10, function (t) { var jd = julianDay(t), lst = lstFor(t, self.loc.lon); var m = moonPos(jd, self.loc.lat, lst); return altOf(m.vec, self.loc.lat, lst); }, 0.1);
    var parts = []; for (var i = 0; i < ev.length; i++) parts.push('Moon' + ev[i].type + ' ' + fmtTime(ev[i].time) + (ev[i].time.getDate() !== start.getDate() ? ' (' + ev[i].time.toLocaleDateString(undefined, { weekday: 'short' }) + ')' : ''));
    // next new / full
    var jd0 = julianDay(start), nextFull = null, nextNew = null, prev = this.phase.dl;
    for (var hh = 1; hh <= 30 * 24 && (!nextFull || !nextNew); hh += 1) {
      var t = new Date(start.getTime() + hh * 3600000), jd = julianDay(t);
      var ss = solarSystem(jd), mp = moonPos(jd, self.loc.lat, lstFor(t, self.loc.lon)), dl = norm360(mp.lon - ss.sun.lon);
      if (!nextFull && prev < 180 && dl >= 180) nextFull = t;
      if (!nextNew && prev > 300 && dl < 60) nextNew = t;
      prev = dl;
    }
    var h = parts.length ? '<div class="meta">' + parts.join(' · ') + '.</div>' : '';
    h += '<div class="meta">' + (nextFull ? 'Next full Moon ' + fmtDate(nextFull) + '. ' : '') + (nextNew ? 'Next new Moon ' + fmtDate(nextNew) + '.' : '') + '</div>';
    return h;
  };
  SkyApp.prototype.sunTimesHtml = function () {
    var self = this, start = this.now(), sv = this.ss.sun.vecDate;
    function altS(t) { return altOf(sv, self.loc.lat, lstFor(t, self.loc.lon)); }
    var rs = scanCrossings(start, 24, 5, altS, -0.833), tw = scanCrossings(start, 24, 5, altS, -18);
    var out = [];
    for (var i = 0; i < rs.length; i++) out.push((rs[i].type === 'set' ? 'Sunset ' : 'Sunrise ') + fmtTime(rs[i].time));
    for (i = 0; i < tw.length; i++) out.push((tw[i].type === 'set' ? 'fully dark by ' : 'dawn begins ') + fmtTime(tw[i].time));
    return out.length ? '<div class="meta">' + out.join(' · ') + '</div>' : '';
  };

  // ---- Tonight -----------------------------------------------------------------------------
  SkyApp.prototype.tonightHtml = function () {
    var self = this, d = this.now(), h = '';
    h += '<div class="meta">' + esc(this.loc.name) + ' · ' + d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (this.timeOffset ? ' · time shifted ' + this.timeLabel() : '') + '</div>';
    h += this.upNowHtml();
    h += '<div class="k">Sun</div>' + (this.sunTimesHtml() || '<div class="meta">—</div>');
    var moonHz = mulMat(this.HZ, this.moon.vec), moonAA = vecToAzAlt(moonHz);
    h += '<div class="k">Moon</div><div class="meta">' + this.phase.name + ', ' + Math.round(this.phase.illum * 100) + '% lit.' + (moonAA.alt > 0 ? ' Up now, ' + Math.round(moonAA.alt) + '° up in the ' + fmtAz(moonAA.az) + '.' : '') + '</div>' + this.moonTimesHtml() +
      (moonAA.alt > 0 ? '<div class="row"><button class="link" data-act="show-vec" data-label="the Moon" data-arg="' + this.moon.vec.join(',') + ',0">Point me to it</button></div>' : '');
    // planets tonight: sample the next 24h in the dark
    var sv = this.ss.sun.vecDate, rows = [];
    for (var k in this.ss) {
      if (k === 'sun') continue; var b = this.ss[k]; if (b.mag > 6.2) continue;
      var best = null;
      for (var hh = 0; hh <= 24; hh += 0.5) {
        var t = new Date(d.getTime() + hh * 3600000), lst = lstFor(t, this.loc.lon);
        if (altOf(sv, this.loc.lat, lst) > -9) continue;
        var a = altOf(b.vecDate, this.loc.lat, lst);
        if (a > 4 && (!best || a > best.alt)) { best = { alt: a, t: t }; }
      }
      if (!best) continue;
      var hzv = mulMat(eqToHzMatrix(this.loc.lat, lstFor(best.t, this.loc.lon)), b.vecDate), aa = vecToAzAlt(hzv);
      var lstNow = lstFor(d, this.loc.lon), nowAlt = altOf(b.vecDate, this.loc.lat, lstNow), darkNow = altOf(sv, this.loc.lat, lstNow) < -6;
      var upNow = nowAlt > 2;
      rows.push({ mag: b.mag, html: '<div class="item"><h4>' + esc(b.name) + '</h4><div class="d">' + (upNow ? 'Up now, ' + Math.round(nowAlt) + '° up in the ' + fmtAz(vecToAzAlt(mulMat(eqToHzMatrix(this.loc.lat, lstNow), b.vecDate)).az) + (darkNow ? '' : ' (daylight)') + '. ' : '') + 'Best around ' + fmtTime(best.t) + ', ' + Math.round(best.alt) + '° up in the ' + fmtAz(aa.az) + ' · magnitude ' + b.mag.toFixed(1) + '</div>' +
        (upNow ? '<div class="row"><button class="link" data-act="show-vec" data-label="' + esc(b.name) + '" data-arg="' + b.vecDate.join(',') + ',0">Point me to it</button></div>' : '') + '</div>' });
    }
    rows.sort(function (a, b) { return a.mag - b.mag; });
    h += '<div class="k">Planets tonight</div>' + (rows.length ? rows.map(function (r) { return r.html; }).join('') : '<div class="meta">No planets are well placed in the dark hours tonight.</div>');
    var act = this.activeShowers(d);
    if (act.length) {
      h += '<div class="k">Meteor showers</div>';
      for (var i = 0; i < act.length; i++) {
        var s = act[i].s, rv = this.showerVec[s.id], raa = vecToAzAlt(mulMat(matMul(this.HZ, this.P), rv));
        h += '<div class="item"><h4>' + esc(s.name) + '</h4><div class="d">' + (act[i].peakIn === 0 ? 'Peaks tonight' : act[i].peakIn > 0 ? 'Peaks in ' + act[i].peakIn + ' day' + (act[i].peakIn === 1 ? '' : 's') + ' (' + fmtMD(s.peak) + ')' : 'Peaked ' + (-act[i].peakIn) + ' day' + (act[i].peakIn === -1 ? '' : 's') + ' ago') + ' · up to ' + s.zhr + '/hour' + (raa.alt > 0 ? ' · radiant ' + Math.round(raa.alt) + '° up in the ' + fmtAz(raa.az) : ' · radiant below the horizon right now') + '</div><div class="b">' + esc(s.note) + '</div>' +
          (raa.alt > 0 ? '<div class="row"><button class="link" data-act="show-vec" data-label="the ' + esc(s.name) + ' radiant" data-arg="' + rv.join(',') + ',1">Point me to it</button></div>' : '') + '</div>';
      }
    }
    h += '<div class="k">Aurora</div><div class="meta">Northern lights are possible from North Dakota during geomagnetic storms. <button class="link" data-act="sheet" data-arg="aurora">Check tonight\'s chance</button></div>';
    // seasons
    var seasons = this.nextSeason(d); if (seasons) h += '<div class="k">Season</div><div class="meta">' + seasons + '</div>';
    // upcoming events
    var ev = this.content.events, up = [], nowT = d.getTime();
    for (i = 0; i < ev.length; i++) { var et = new Date(ev[i].date + 'T' + (ev[i].timeUTC || '00:00') + ':00Z').getTime(); if (et > nowT - 86400000) up.push([et, ev[i]]); }
    up.sort(function (a, b) { return a[0] - b[0]; });
    if (up.length) {
      h += '<div class="k">Coming up</div>';
      for (i = 0; i < Math.min(up.length, 8); i++) {
        var e = up[i][1], dt = new Date(up[i][0]), days = Math.round((up[i][0] - nowT) / 86400000);
        h += '<div class="item"><h4>' + esc(e.title) + '</h4><div class="d">' + fmtDate(dt) + (days <= 0 ? ' · today' : days === 1 ? ' · tomorrow' : ' · in ' + days + ' days') + (e.visibleFromMedora === false ? ' · <span class="tag" style="margin:0">Not visible from North Dakota</span>' : e.visibleFromMedora === 'partial' ? ' · <span class="tag" style="margin:0">Marginal from North Dakota</span>' : '') + '</div><div class="b">' + esc(e.blurb) + '</div></div>';
      }
      var last = new Date(up[up.length - 1][0]);
      h += '<div class="meta">Events listed through ' + last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '. Sources: NASA GSFC eclipse tables, EclipseWise, IMO meteor calendar, JPL ephemerides.</div>';
    }
    return h;
  };
  // A short list of the best naked-eye things above the horizon at this moment, each with a pointer.
  SkyApp.prototype.upNowHtml = function () {
    var M = matMul(this.HZ, this.P), items = [], D = this.data, i;
    var picks = { 'M 45': 1, 'M 31': 1, 'M 42': 1, 'M 44': 1, 'h Per': 1, 'Mel 25': 1, 'M 7': 1, 'M 8': 1, 'GalCtr': 1 };
    for (i = 0; i < D.dsos.length; i++) { var ds = D.dsos[i]; if (!picks[ds[1]]) continue; var aa = vecToAzAlt(mulMat(M, this.dsoVec[i])); if (aa.alt > 8) items.push({ n: ds[1] === 'GalCtr' ? 'Heart of the Milky Way' : ds[0], d: (ds[2] === 's' ? 'Galaxy' : ds[2] === 'oc' ? 'Star cluster' : ds[2] === 'pos' ? 'Toward Sagittarius' : 'Nebula') + ' · ' + Math.round(aa.alt) + '° up in the ' + fmtAz(aa.az), vec: this.dsoVec[i], j: 1, alt: aa.alt }); }
    for (i = 0; i < D.stars.length && D.stars[i][3] < 1.3; i++) { var st = D.stars[i]; if (!st[6]) continue; var o = i * 3, v = [this.starVec[o], this.starVec[o + 1], this.starVec[o + 2]], sa = vecToAzAlt(mulMat(M, v)); if (sa.alt > 8) items.push({ n: st[6], d: 'Bright star in ' + (D.con[st[5]] ? D.con[st[5]].n : '') + ' · ' + Math.round(sa.alt) + '° up in the ' + fmtAz(sa.az), vec: v, j: 1, alt: sa.alt }); }
    if (!items.length) return '';
    items.sort(function (a, b) { return b.alt - a.alt; }); items = items.slice(0, 6);
    var h = '<div class="k">Worth finding right now</div>';
    for (i = 0; i < items.length; i++) h += '<div class="item"><h4>' + esc(items[i].n) + '</h4><div class="d">' + esc(items[i].d) + '</div><div class="row"><button class="link" data-act="show-vec" data-label="' + esc(items[i].n) + '" data-arg="' + items[i].vec.join(',') + ',' + items[i].j + '">Point me to it</button></div></div>';
    return h;
  };
  SkyApp.prototype.nextSeason = function (d) {
    var names = { 0: 'March equinox — spring begins', 90: 'June solstice — the longest day and shortest night', 180: 'September equinox — autumn begins', 270: 'December solstice — the longest night of the year' };
    var prev = solarSystem(julianDay(d)).sun.lon;
    for (var day = 1; day <= 100; day++) {
      var t = new Date(d.getTime() + day * 86400000), lon = solarSystem(julianDay(t)).sun.lon;
      for (var q = 0; q < 360; q += 90) { var a = norm360(prev - q), b = norm360(lon - q); if (a > 300 && b < 60) { var days = day; return names[q] + ', ' + fmtDate(t) + (days === 1 ? ' (tomorrow)' : ' (in ' + days + ' days)') + '.'; } }
      prev = lon;
    }
    return '';
  };

  // ---- Aurora ------------------------------------------------------------------------------
  SkyApp.prototype.auroraHtml = function () {
    var gl = geomagLat(this.loc.lat, this.loc.lon), c = this.auroraCache;
    var h = '<div class="meta">' + esc(this.loc.name) + ' · geomagnetic latitude ' + gl.toFixed(0) + '°N</div>';
    if (!c) return h + '<p class="meta" id="sg-aur">Checking NOAA space weather…</p>';
    if (c.error) return h + '<p>' + esc(c.error) + '</p><button class="btn2" data-act="aurora-refresh">Try again</button>';
    var pNow = auroraChance(c.kpNow, gl), pMax = auroraChance(c.kpMax, gl);
    var word = pMax >= 70 ? 'Likely' : pMax >= 45 ? 'Possible' : pMax >= 20 ? 'Slight chance' : 'Unlikely';
    h += '<div class="row" style="align-items:baseline;gap:14px;margin:6px 0 2px"><div class="big">' + pMax + '%</div><div><div style="font-family:' + FONT_D + ';font-size:22px;text-transform:uppercase;letter-spacing:.03em;line-height:1">' + word + ' tonight</div><div class="meta" style="margin:2px 0 0">' + pNow + '% right now · Kp ' + c.kpNow.toFixed(1) + ' now, up to Kp ' + c.kpMax.toFixed(1) + ' in the next 24 hours</div></div></div>';
    h += '<div class="kp">';
    for (var i = 0; i < c.series.length; i++) { var s = c.series[i]; h += '<i class="' + (s.now ? 'now' : '') + '" style="height:' + Math.max(3, s.kp / 9 * 100) + '%" title="' + esc(s.label) + ' Kp ' + s.kp + '"></i>'; }
    h += '</div><div class="kpl"><span>' + esc(c.series[0] ? c.series[0].label : '') + '</span><span>Kp forecast, 3-hour steps</span><span>' + esc(c.series.length ? c.series[c.series.length - 1].label : '') + '</span></div>';
    h += '<div class="k">What this means</div><p>' + (pMax >= 45 ? 'Find a dark spot with a clear view to the north and let your eyes adjust for 20 minutes. Look low along the northern horizon first; during strong storms the lights climb overhead. A camera on a long exposure will see color before your eyes do.' : pMax >= 20 ? 'A faint glow or pale arc low on the northern horizon is possible, especially late at night. A camera on a long exposure may catch it before your eyes do.' : 'Geomagnetic activity is quiet. Aurora is unlikely this far south tonight, but the Badlands sky has plenty else to offer.') + '</p>';
    h += '<p class="meta">Estimate based on the NOAA planetary K index and this location\'s geomagnetic latitude, assuming clear, dark skies. Aurora reaches North Dakota at roughly Kp 5 and higher. This is not an official NOAA forecast. Data: NOAA Space Weather Prediction Center' + (c.updated ? ', updated ' + esc(c.updated) : '') + '.</p>';
    h += '<button class="btn2" data-act="aurora-refresh">Refresh</button>';
    return h;
  };
  SkyApp.prototype.fetchAurora = function () {
    var self = this;
    if (!window.fetch) { self.auroraCache = { error: 'This browser cannot load the space-weather feed.' }; return; }
    Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(function (r) { return r.json(); }),
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json').then(function (r) { return r.json(); })
    ]).then(function (r) {
      // NOAA has published this feed both as arrays of arrays (header row first) and as arrays of objects
      function row(x) { return Array.isArray(x) ? { t: x[0], kp: x[1] } : { t: x.time_tag, kp: (x.Kp != null ? x.Kp : x.kp) }; }
      var obs = r[0].map(row).filter(function (x) { return !isNaN(parseFloat(x.kp)); }), fc = r[1].map(row).filter(function (x) { return !isNaN(parseFloat(x.kp)); }), nowT = Date.now();
      var last = obs[obs.length - 1], kpNow = parseFloat(last.kp) || 0, updated = String(last.t).replace('T', ' ').replace(/:\d\d(\.\d+)?$/, '') + ' UTC';
      var series = [], kpMax = kpNow;
      for (var i = 0; i < fc.length; i++) {
        var t = new Date(String(fc[i].t).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime(), kp = parseFloat(fc[i].kp) || 0;
        if (t < nowT - 3 * 3600000 || t > nowT + 24 * 3600000) continue;
        var dt = new Date(t);
        series.push({ kp: kp, label: fmtTime(dt).replace(':00', ''), now: abs(t - nowT) < 1.5 * 3600000 });
        if (t >= nowT - 3600000) kpMax = Math.max(kpMax, kp);
      }
      self.auroraCache = { kpNow: kpNow, kpMax: kpMax, series: series, updated: updated, at: nowT };
      if (self.sheetName === 'aurora') self.showSheet('aurora');
    }).catch(function () {
      self.auroraCache = { error: 'The NOAA space-weather feed could not be reached. Check the connection and try again.' };
      if (self.sheetName === 'aurora') self.showSheet('aurora');
    });
  };

  // ---- Stories -----------------------------------------------------------------------------
  // Where a figure is right now: up (with direction) or below the horizon (with its next rise), or unplaced.
  SkyApp.prototype.loreStatus = function (L) {
    if (!L.center) return { up: false, rank: 2, text: '' };
    var self = this, hzP = matMul(this.HZ, this.P), hz = mulMat(hzP, L.center), aa = vecToAzAlt(hz);
    if (aa.alt > 3) return { up: true, rank: 0, alt: aa.alt, text: 'Up now · ' + Math.round(aa.alt) + '° up in the ' + fmtAz(aa.az) };
    var rise = scanCrossings(this.now(), 24, 20, function (t) { return altOf(L.center, self.loc.lat, lstFor(t, self.loc.lon)); }, 3).filter(function (e) { return e.type === 'rise'; })[0];
    return { up: false, rank: 1, riseT: rise ? rise.time.getTime() : Infinity, text: rise ? 'Below the horizon · rises ' + fmtTime(rise.time) + (rise.time.getDate() !== this.now().getDate() ? ' (' + rise.time.toLocaleDateString(undefined, { weekday: 'short' }) + ')' : '') : 'Below the horizon tonight' };
  };
  SkyApp.prototype.creditsList = function () {
    var seen = {}, out = '';
    for (var i = 0; i < this.lore.length; i++) for (var j = 0; j < (this.lore[i].sources || []).length; j++) {
      var src = String(this.lore[i].sources[j]).replace(/\(fetched\)/g, '').replace(/\s+/g, ' ').trim(), key = src.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 60);
      if (!src || seen[key]) continue; seen[key] = 1; out += '<li>' + esc(src) + '</li>';
    }
    return out;
  };
  SkyApp.prototype.storiesHtml = function () {
    var h = '<p class="meta">The figures and star names of the Plains and Great Lakes peoples. Tap one to read it; the ones up right now come first.</p>';
    var rows = [];
    for (var i = 0; i < this.lore.length; i++) { var L = this.lore[i], st = this.loreStatus(L); rows.push({ i: i, L: L, st: st }); }
    rows.sort(function (a, b) { return a.st.rank - b.st.rank || (a.st.rank === 0 ? b.st.alt - a.st.alt : a.st.rank === 1 ? a.st.riseT - b.st.riseT : a.i - b.i); });
    var heads = ['In the sky right now', 'Below the horizon', 'Stories without a fixed place'], lastRank = -1;
    for (var j = 0; j < rows.length; j++) {
      var E = rows[j].L, idx = rows[j].i, stt = rows[j].st;
      if (stt.rank !== lastRank) { lastRank = stt.rank; h += '<div class="k">' + heads[stt.rank] + '</div>'; }
      h += '<div class="item' + (stt.rank === 1 ? ' dimmed' : '') + '"><h4>' + esc(E.label || E.name.split(' (')[0]) + '</h4><div class="d">' + esc(E.culture.split(',')[0]) + ' · ' + esc((E.translation || '').split(' /')[0]) + (E.western ? ' · ' + esc(E.western.split(' (')[0]) : '') + (stt.text ? '<br>' + esc(stt.text) : '') + '</div>' +
        '<div class="row"><button class="link" data-act="lore" data-arg="' + idx + '">Read</button>' + (stt.up ? '<button class="link" data-act="show-lore" data-arg="' + idx + '">Point me to it</button>' : '') + '</div></div>';
    }
    h += '<div class="k">Western constellations</div><p class="meta">Tap any constellation name in the sky for its Greek, Roman, or early-modern story. The 88 constellations used by astronomers today were fixed by the International Astronomical Union in 1928.</p>';
    return h;
  };

  // ---- Settings ----------------------------------------------------------------------------
  SkyApp.prototype.settingsHtml = function () {
    var h = '';
    h += '<div class="k">Location</div><div class="meta">' + esc(this.loc.name) + ' · ' + this.loc.lat.toFixed(2) + '°, ' + this.loc.lon.toFixed(2) + '°</div>' +
      '<div class="row"><button class="btn2" data-act="geo">Use my location</button><button class="btn2" data-act="medora">Medora</button></div>';
    h += '<div class="k">Time</div><div class="meta" id="sg-timel">' + this.timeLabel() + '</div><input type="range" id="sg-time" min="-1440" max="1440" step="10" value="' + this.timeOffset + '"><div class="row"><button class="link" data-act="now">Back to now</button></div>';
    h += '<div class="k">Screen</div>';
    h += '<label class="sw">Red light mode (protects night vision)<input type="checkbox" id="sg-red"' + (this.red ? ' checked' : '') + '></label>';
    h += '<div class="meta" style="margin-top:8px">Extra dimming</div><input type="range" id="sg-dim" min="0" max="75" value="' + Math.round(this.dim * 100) + '">';
    h += '<div class="k">Which sky</div><div class="meta">Greek &amp; Roman shows the 88 constellations astronomers use. Lakota &amp; Native shows the figures and names of the Plains and Great Lakes peoples on their own. Both keeps the Western lines for finding your way and gives the Native figure the spot wherever one exists.</div>' +
      '<div class="row"><button class="btn2' + (this.sky === 'western' ? ' solid' : '') + '" data-act="sky" data-arg="western">Greek &amp; Roman</button><button class="btn2' + (this.sky === 'native' ? ' solid' : '') + '" data-act="sky" data-arg="native">Lakota &amp; Native</button><button class="btn2' + (this.sky === 'both' ? ' solid' : '') + '" data-act="sky" data-arg="both">Both</button></div>';
    h += '<div class="k">Show</div>';
    for (var i = 0; i < LAYERS.length; i++) { if (LAYERS[i][0] === 'camera') continue; h += '<label class="sw">' + LAYERS[i][1] + '<input type="checkbox" data-layer="' + LAYERS[i][0] + '"' + (this.layers[LAYERS[i][0]] ? ' checked' : '') + '></label>'; }
    if (this.cameraPossible()) h += '<div class="meta" style="margin-top:8px">See-through puts the rear camera behind the chart; the button above the sky switch turns it on. It stays off between sessions.</div>';
    h += '<div class="k">Motion</div><label class="sw">Steady view overhead (damps the spin near the zenith)<input type="checkbox" id="sg-steady"' + (this.steady ? ' checked' : '') + '></label><div class="meta">' + (this.mode === 'sensor' ? 'Motion sensor active. If the sky looks turned, drag sideways to line it up with a landmark such as the Moon or the North Star.' : 'Drag to look around. Pinch or scroll to zoom. Double-tap to zoom in and out.') + (this.calib ? ' Compass offset ' + Math.round(this.calib) + '°.' : '') + '</div>' +
      (this.mode === 'sensor' ? '<div class="row"><button class="btn2" data-act="recal">Clear compass offset</button></div>' : '');
    h += '<div class="k">About</div><p class="meta">StarGazer ' + VERSION + ' · Theodore Roosevelt Presidential Library, Medora, North Dakota. Stars and constellation lines from d3-celestial (Olaf Frohn) after the Hipparcos catalog; constellation figures by Johan Meuris for Stellarium (Free Art License); planets from JPL Keplerian elements; Moon from a standard series solution; aurora from NOAA SWPC. Positions are accurate to within a fraction of a degree; a phone compass is usually the larger source of error.</p>';
    h += '<details class="credits"><summary>Credits for the Native sky</summary><ul class="src">' + this.creditsList() + '</ul></details>';
    return h;
  };
