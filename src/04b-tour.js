
  // ---------------------------------------------------------------------------------------------
  // Guided tours. A guide runs /guide/ on their own phone; its browser holds the tour code as a
  // PeerJS id and guests dial it directly over WebRTC (the same approach as the Quiz project's live
  // mode). GitHub Pages stays static: PeerJS's public broker only introduces the browsers, and no
  // tour data passes through it. The guide's state is pushed to every guest: which sky leads,
  // which layers are on, where to look (the orange arrow), and which card to show.
  // ---------------------------------------------------------------------------------------------
  var PEERJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
  var PEER_PREFIX = 'trplsg-';
  var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O or 1/I/L: read aloud in the dark
  var peerLoading = null;
  function loadPeerJS() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peerLoading) return peerLoading;
    peerLoading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PEERJS_SRC; s.async = true;
      s.onload = function () { window.Peer ? res(window.Peer) : rej(new Error('peerjs missing')); };
      s.onerror = function () { rej(new Error('peerjs blocked')); };
      document.head.appendChild(s);
    });
    return peerLoading;
  }
  function tourCode() {
    var out = '', buf = new Uint8Array(5);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf); else for (var i = 0; i < 5; i++) buf[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < 5; j++) out += CODE_ALPHABET[buf[j] % CODE_ALPHABET.length];
    return out;
  }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6); }

  // What is worth pointing at right now, for a guide's list. Works from the bundles alone so the
  // guide page does not need a sky view. Each item carries the `card` a guest's showInfo() accepts.
  var catalogCache = null;
  function tourCatalog(loc, date) {
    var D = window.STARGAZER_DATA, C = window.STARGAZER_CONTENT; if (!D || !C) return [];
    if (!catalogCache) {
      catalogCache = { con: {}, byHip: {}, lore: [], loreSize: [], conSize: {} };
      for (var k in D.con) { catalogCache.con[k] = eqVec(D.con[k].ra, D.con[k].dec); var mxs = 0; for (var a = 0; a < D.con[k].l.length; a++) for (var b = 0; b < D.con[k].l[a].length; b++) { var dq = angSep(eqVec(D.con[k].l[a][b][0], D.con[k].l[a][b][1]), catalogCache.con[k]); if (dq > mxs) mxs = dq; } catalogCache.conSize[k] = Math.max(mxs * 2, 6); }
      for (var i = 0; i < D.stars.length; i++) catalogCache.byHip[D.stars[i][0]] = i;
      for (var l = 0; l < C.indigenous.length; l++) {
        var L = C.indigenous[l], cv = [0, 0, 0], n = 0;
        var vs = [];
        for (var h = 0; h < L.hip.length; h++) { var si = catalogCache.byHip[L.hip[h]]; if (si == null) continue; var v = eqVec(D.stars[si][1], D.stars[si][2]); vs.push(v); cv[0] += v[0]; cv[1] += v[1]; cv[2] += v[2]; n++; }
        var mx = 0; for (var p1 = 0; p1 < vs.length; p1++) for (var p2 = p1 + 1; p2 < vs.length; p2++) { var d12 = angSep(vs[p1], vs[p2]); if (d12 > mx) mx = d12; }
        catalogCache.lore.push(n ? vnorm(cv) : null); catalogCache.loreSize.push(Math.max(mx, 1.5));
      }
    }
    var jd = julianDay(date), lst = lstFor(date, loc.lon), HZ = eqToHzMatrix(loc.lat, lst), P = precessionMatrix(jd), M = matMul(HZ, P);
    var ss = solarSystem(jd), moon = moonPos(jd, loc.lat, lst), phase = moonPhase(moon, ss.sun), items = [], i2;
    function aa(v) { return vecToAzAlt(v); }
    function where(a) { return Math.round(a.alt) + '° up in the ' + fmtAz(a.az); }
    var sunAlt = aa(mulMat(HZ, mulMat(P, ss.sun.vec))).alt;
    // Moon and planets (of-date vectors, j2000:false)
    var ma = aa(mulMat(HZ, moon.vec));
    if (ma.alt > 2) items.push({ id: 'moon', group: 'Moon and planets', name: 'The Moon', sub: phase.name + ', ' + Math.round(phase.illum * 100) + '% lit · ' + where(ma), alt: ma.alt, vec: moon.vec, j2000: false, sky: null, card: { t: 'body', k: 'moon' } });
    for (var pk in ss) {
      if (pk === 'sun') continue; var b = ss[pk], bv = mulMat(P, b.vec), pa = aa(mulMat(HZ, bv));
      if (pa.alt > 3 && b.mag < 6.2) items.push({ id: pk, group: 'Moon and planets', name: b.name, sub: 'Magnitude ' + b.mag.toFixed(1) + ' · ' + where(pa), alt: pa.alt, vec: bv, j2000: false, sky: null, card: { t: 'body', k: pk } });
    }
    // Native figures
    for (i2 = 0; i2 < C.indigenous.length; i2++) {
      var Le = C.indigenous[i2], lv = catalogCache.lore[i2]; if (!lv) continue; var la = aa(mulMat(M, lv));
      if (la.alt > 3) items.push({ id: Le.id, group: 'Lakota and Native sky', name: Le.label || Le.name, sub: (Le.translation || '').split(' /')[0] + ' · ' + Le.culture.split(',')[0] + ' · ' + where(la), alt: la.alt, vec: lv, j2000: true, size: catalogCache.loreSize[i2], sky: 'native', card: { t: 'lore', i: i2 } });
    }
    // Constellations with a figure and a bright star
    var brightest = {}; for (i2 = 0; i2 < D.stars.length && D.stars[i2][3] < 2.6; i2++) { var cc = D.stars[i2][5]; if (cc && brightest[cc] == null) brightest[cc] = i2; }
    for (var ck in D.con) { var cvv = catalogCache.con[ck], ca = aa(mulMat(M, cvv)); if (ca.alt > 12 && (brightest[ck] != null || (D.art && D.art[ck]))) items.push({ id: 'con-' + ck, group: 'Constellations', name: D.con[ck].n, sub: (C.origins && C.origins[ck] ? C.origins[ck].era + ' · ' : '') + where(ca), alt: ca.alt, vec: cvv, j2000: true, size: catalogCache.conSize[ck], sky: 'western', card: { t: 'con', k: ck } }); }
    // Bright stars and showpiece deep-sky objects
    for (i2 = 0; i2 < D.stars.length && D.stars[i2][3] < 1.3; i2++) { var st = D.stars[i2]; if (!st[6]) continue; var sv = eqVec(st[1], st[2]), sa = aa(mulMat(M, sv)); if (sa.alt > 8) items.push({ id: 'star-' + st[0], group: 'Stars and deep sky', name: st[6], sub: 'Bright star in ' + (D.con[st[5]] ? D.con[st[5]].n : '') + ' · ' + where(sa), alt: sa.alt, vec: sv, j2000: true, sky: null, card: { t: 'star', i: i2 } }); }
    var picks = { 'M 45': 1, 'M 31': 1, 'M 42': 1, 'M 44': 1, 'h Per': 1, 'Mel 25': 1, 'M 7': 1, 'M 8': 1, 'GalCtr': 1, 'M 13': 1 };
    for (i2 = 0; i2 < D.dsos.length; i2++) { var ds = D.dsos[i2]; if (!picks[ds[1]]) continue; var dv = eqVec(ds[3], ds[4]), da = aa(mulMat(M, dv)); if (da.alt > 8) items.push({ id: 'dso-' + i2, group: 'Stars and deep sky', name: ds[1] === 'GalCtr' ? 'Heart of the Milky Way' : ds[0], sub: where(da), alt: da.alt, vec: dv, j2000: true, size: 3, sky: null, card: { t: 'dso', i: i2 } }); }
    // Meteor showers active tonight
    var y = date.getFullYear(), md = (date.getMonth() + 1) * 100 + date.getDate();
    function num(s) { return parseInt(s.slice(0, 2), 10) * 100 + parseInt(s.slice(3), 10); }
    for (i2 = 0; i2 < C.showers.length; i2++) { var sh = C.showers[i2], a1 = num(sh.start), b1 = num(sh.end), on = a1 <= b1 ? (md >= a1 && md <= b1) : (md >= a1 || md <= b1); if (!on) continue; var rv = eqVec(sh.raDeg, sh.decDeg), ra2 = aa(mulMat(M, rv)); if (ra2.alt > 0) items.push({ id: 'shower-' + sh.id, group: 'Meteor showers', name: sh.name + ' radiant', sub: 'peak ' + fmtMD(sh.peak) + ' · up to ' + sh.zhr + '/hr · ' + where(ra2), alt: ra2.alt, vec: rv, j2000: true, sky: null, card: { t: 'shower', i: i2 } }); }
    items.sort(function (a, b) { return b.alt - a.alt; });
    return { items: items, sunAlt: sunAlt, dark: sunAlt < -12 };
  }

  // ---- guest side ------------------------------------------------------------------------------
  SkyApp.prototype.joinTour = function (code) {
    var self = this; code = cleanCode(code); if (!code) return;
    this.tour = { code: code, status: 'connecting', dials: 0 };
    this.tourBanner('Joining tour ' + code + '…');
    loadPeerJS().then(function (Peer) {
      var peer = new Peer(undefined, { debug: 0 }); self.tourPeer = peer;
      function dial() {
        self.tour.dials++;
        var conn = peer.connect(PEER_PREFIX + code, { reliable: true });
        conn.on('open', function () {
          self.tourConn = conn; self.tour.status = 'on'; self.tourBanner('On tour ' + code);
          conn.send({ t: 'hello', v: VERSION });
          conn.on('data', function (m) { self.tourMessage(m); });
          conn.on('close', function () { self.tourEnded('The guide ended the tour.'); });
          conn.on('error', function () { self.tourEnded('Lost the connection to the guide.'); });
        });
      }
      peer.on('open', dial);
      peer.on('error', function (e) {
        var kind = String((e && e.type) || '');
        if (kind === 'peer-unavailable' && self.tour && self.tour.status === 'connecting' && self.tour.dials < 3) { self.tourBanner('Looking for tour ' + code + '…'); setTimeout(function () { if (self.tour && self.tour.status === 'connecting') dial(); }, 4000); return; }
        if (kind === 'disconnected' && !peer.destroyed) { try { peer.reconnect(); return; } catch (err) { } }
        if (self.tour && self.tour.status === 'connecting') self.tourEnded(kind === 'peer-unavailable' ? 'No tour is open with that code. Check it with your guide.' : kind === 'webrtc' ? 'This network is blocking the connection to the guide.' : 'Could not reach the tour.');
      });
      peer.on('disconnected', function () { if (!peer.destroyed) { try { peer.reconnect(); } catch (err) { } } });
    }, function () { self.tourEnded('The connection library could not load on this network.'); });
  };
  SkyApp.prototype.tourBanner = function (text) {
    var el = this.el.querySelector('.tourpill'); el.querySelector('.tp').textContent = text; el.classList.add('show');
  };
  SkyApp.prototype.leaveTour = function () {
    if (this.tourConn) { try { this.tourConn.close(); } catch (e) { } }
    if (this.tourPeer) { try { this.tourPeer.destroy(); } catch (e) { } }
    this.tourConn = null; this.tourPeer = null; this.tour = null;
    this.el.querySelector('.tourpill').classList.remove('show');
    this.clearSelected(); this.dirty = true;
  };
  SkyApp.prototype.tourEnded = function (msg) { this.leaveTour(); this.toast(msg, 4500); };
  SkyApp.prototype.tourMessage = function (m) {
    if (!m || !m.t) return;
    if (m.t === 'state') {
      if (m.sky && m.sky !== this.sky) { this.sky = m.sky; this.persist(); this.updateSeg(); }
      if (m.layers) { for (var k in m.layers) if (k in this.layers && k !== 'camera') this.layers[k] = !!m.layers[k]; this.updateChips(); }
      if (m.target && m.target.vec) this.select(m.target.vec, !!m.target.j2000, m.target.label || '');
      else if (m.target === null) this.clearSelected();
      if (m.card) { this.sheetAuto = true; this.tourCard = true; this.showInfo(m.card); this.sheetAuto = true; }
      else if (m.card === null && this.tourCard) { this.hideSheet(); this.tourCard = false; }
      if (m.say) this.toast(m.say, 5000);
      this.dirty = true;
    } else if (m.t === 'end') { this.tourEnded('The guide ended the tour. Thanks for coming.'); }
  };
