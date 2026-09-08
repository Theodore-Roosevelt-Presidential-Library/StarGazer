/* StarGazer tour guide — runs on the guide's phone or tablet. Holds the tour code as a PeerJS id,
   lists what is worth pointing at right now, and pushes state (sky, layers, arrow target, card) to
   every guest that has joined. No server: the guide's browser is the hub.
   Four tabs: Sky (one-tap point/card on everything visible), Tell (the story to read aloud),
   Screen (what guests see + sky/layers/free look), Tour (code, share, location). */
(function () {
  'use strict';
  var SG = window.StarGazer, $ = function (id) { return document.getElementById(id); };
  var LAYERS = [['art', 'Figures'], ['lines', 'Constellations'], ['names', 'Star names'], ['planets', 'Planets'], ['mw', 'Milky Way'], ['native', 'Native sky'], ['meteors', 'Meteors'], ['dso', 'Deep sky'], ['grid', 'Horizon marks']];
  var ICON_POINT = '<svg viewBox="0 0 24 24"><path d="M3 12h13M12 6l6 6-6 6"/></svg>', ICON_CARD = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/></svg>';
  var state = { sky: 'both', layers: { art: true, lines: true, names: true, planets: true, mw: true, native: true, meteors: true, dso: false, grid: true }, target: null, card: null };
  var loc = SG.DEFAULT_LOC, code = null, peer = null, conns = [], catalog = { items: [] }, current = null, pointing = null, showingCard = null, preview = null, filter = 'all';

  fetch(SG.vurl ? SG.vurl('assets/wordmark.svg') : SG.BASE + 'assets/wordmark.svg').then(function (r) { return r.text(); }).then(function (svg) { $('wm').innerHTML = svg.replace('<svg ', '<svg class="wm" '); }).catch(function () { });
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function setStatus(txt, kind) { $('status').textContent = txt; $('dot').className = 'dot' + (kind ? ' ' + kind : ''); }
  function byId(id) { for (var i = 0; i < catalog.items.length; i++) if (catalog.items[i].id === id) return catalog.items[i]; return null; }

  // ---- tabs ----------------------------------------------------------------------------------
  function showTab(name) {
    var bs = document.querySelectorAll('.tabs button'), ps = document.querySelectorAll('.pane');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-tab') === name);
    for (var j = 0; j < ps.length; j++) ps[j].classList.toggle('on', ps[j].id === 'pane-' + name);
    if (name === 'screen' && preview) { preview.resize(); preview.dirty = true; }
  }
  document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) showTab(b.getAttribute('data-tab')); });

  // ---- preview mirror ------------------------------------------------------------------------
  function mirror() {
    if (!preview || !preview.running) return;
    if (preview.sky !== state.sky) { preview.sky = state.sky; preview.updateSeg(); }
    for (var k in state.layers) preview.layers[k] = state.layers[k];
    preview.updateChips();
    if (state.target) { preview.select(state.target.vec, state.target.j2000, state.target.label, state.target.size); preview.aimAt(state.target.vec, state.target.j2000, Math.max(22, Math.min(70, (state.target.size || 20) * 2.6 + 6))); }
    else preview.clearSelected();
    if (state.card) { preview.sheetAuto = true; preview.showInfo(state.card); } else preview.hideSheet();
    preview.dirty = true;
  }

  // ---- hosting -------------------------------------------------------------------------------
  function broadcast(msg) { for (var i = 0; i < conns.length; i++) { try { conns[i].send(msg); } catch (e) { } } }
  function pushState(extra) { var m = { t: 'state', sky: state.sky, layers: state.layers, target: state.target, card: state.card }; if (extra) for (var k in extra) m[k] = extra[k]; broadcast(m); mirror(); renderNow(); }
  function updateCount() { $('count').textContent = conns.length; }
  function startHost(newCode) {
    if (peer) { try { peer.destroy(); } catch (e) { } peer = null; conns = []; updateCount(); }
    code = newCode || SG.tourCode();
    $('code').textContent = code; $('code').classList.remove('off'); $('bigcode').textContent = code;
    setStatus('Opening the tour…');
    SG.loadPeerJS().then(function (Peer) {
      peer = new Peer(SG.PEER_PREFIX + code, { debug: 0 });
      peer.on('open', function () { setStatus('Tour is open. Guests can join with the code.', 'ok'); });
      peer.on('connection', function (conn) {
        conn.on('open', function () { conns.push(conn); updateCount(); toast('A guest joined · ' + conns.length + ' now'); try { conn.send({ t: 'state', sky: state.sky, layers: state.layers, target: state.target, card: state.card }); } catch (e) { } });
        function drop() { var i = conns.indexOf(conn); if (i >= 0) conns.splice(i, 1); updateCount(); }
        conn.on('close', drop); conn.on('error', drop);
      });
      peer.on('disconnected', function () { setStatus('Reconnecting…', 'bad'); if (!peer.destroyed) { try { peer.reconnect(); } catch (e) { } } });
      peer.on('error', function (e) {
        var kind = String((e && e.type) || '');
        if (kind === 'unavailable-id') { setStatus('That code is in use; picking another.', 'bad'); setTimeout(function () { startHost(); }, 800); return; }
        if (kind === 'disconnected' && !peer.destroyed) { try { peer.reconnect(); } catch (err) { } return; }
        setStatus(kind === 'network' || kind === 'server-error' ? 'The matchmaking service is not responding. Guests cannot join right now.' : 'Connection problem: ' + kind, 'bad');
      });
    }, function () { setStatus('The connection library could not load on this network.', 'bad'); });
  }
  setInterval(function () { if (peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { } } }, 5000);
  function shareLink() {
    if (!code) return; var url = 'https://stargazer.labs.trlibrary.com/?tour=' + code;
    if (navigator.share) navigator.share({ title: 'Join the star tour', text: 'Tour code ' + code, url: url }).catch(function () { });
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Join link copied'); });
    else prompt('Join link', url);
  }
  $('share').addEventListener('click', shareLink);
  $('code').addEventListener('click', function () { showTab('tour'); });
  $('newcode').addEventListener('click', function () { if (conns.length && !confirm('Guests on the current code will be dropped. Start a new code?')) return; broadcast({ t: 'end' }); startHost(); });
  $('endtour').addEventListener('click', function () { if (!confirm('End the tour for everyone?')) return; broadcast({ t: 'end' }); if (peer) { try { peer.destroy(); } catch (e) { } } peer = null; conns = []; updateCount(); $('code').textContent = 'ended'; $('code').classList.add('off'); $('bigcode').textContent = '—'; setStatus('Tour ended. Tap New code to start another.'); });

  // ---- actions (used from every tab) --------------------------------------------------------
  function pointTo(it) {
    if (pointing === it.id) { pointing = null; state.target = null; toast('Stopped pointing'); }
    else { pointing = it.id; state.target = { vec: it.vec, j2000: it.j2000, label: it.name, size: it.size || 0 }; if (it.sky && state.sky !== it.sky) { state.sky = it.sky; renderSeg(); } if (it.sky === 'native' && !state.layers.native) { state.layers.native = true; renderChips(); } toast('Pointing everyone to ' + it.name); }
    pushState(); renderList(); if (current) renderTell(current);
  }
  function cardFor(it) {
    if (showingCard === it.id) { showingCard = null; state.card = null; toast('Card cleared'); }
    else { showingCard = it.id; state.card = it.card; if (it.sky && state.sky !== it.sky) { state.sky = it.sky; renderSeg(); } toast('Card is on their screens'); }
    pushState(); renderList(); if (current) renderTell(current);
  }
  function freeLook(quiet) { state.target = null; state.card = null; pointing = null; showingCard = null; pushState(quiet ? null : { say: 'Free look. Explore on your own for a moment.' }); renderList(); if (current) renderTell(current); toast('Guests are free to look around'); }
  $('freelook').addEventListener('click', function () { freeLook(false); });
  $('nowStop').addEventListener('click', function () { freeLook(true); });
  $('nowCard').addEventListener('click', function () { var it = pointing && byId(pointing); if (it) cardFor(it); });
  $('sayGo').addEventListener('click', function () { var v = $('say').value.trim().slice(0, 140); if (!v) return; pushState({ say: v }); $('say').value = ''; toast('Sent'); });
  function renderNow() {
    var it = pointing && byId(pointing);
    document.body.classList.toggle('pointing', !!it);
    $('now').classList.toggle('show', !!it);
    if (it) { $('nowName').textContent = it.name; $('nowCard').textContent = showingCard === it.id ? 'Hide card' : 'Card'; }
  }

  // ---- Screen tab controls -------------------------------------------------------------------
  function renderSeg() { var bs = $('seg').querySelectorAll('[data-sky]'); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-sky') === state.sky); }
  $('seg').addEventListener('click', function (e) { var b = e.target.closest('[data-sky]'); if (!b) return; state.sky = b.getAttribute('data-sky'); renderSeg(); pushState(); });
  function renderChips() { var h = ''; for (var i = 0; i < LAYERS.length; i++) h += '<button class="chip' + (state.layers[LAYERS[i][0]] ? ' on' : '') + '" data-l="' + LAYERS[i][0] + '">' + LAYERS[i][1] + '</button>'; $('chips').innerHTML = h; }
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; var l = b.getAttribute('data-l'); state.layers[l] = !state.layers[l]; renderChips(); pushState(); });

  // ---- Sky tab: the list ---------------------------------------------------------------------
  var FILTER_GROUP = { native: 'Lakota and Native sky', planets: 'Moon and planets', con: 'Constellations', stars: 'Stars and deep sky', meteors: 'Meteor showers' };
  $('filters').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; filter = b.getAttribute('data-f'); var cs = $('filters').querySelectorAll('.chip'); for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('on', cs[i] === b); renderList(); });
  function refreshCatalog() {
    catalog = SG.tourCatalog(loc, new Date());
    $('where').textContent = '· ' + loc.name;
    if (preview && preview.running) { preview.loc = loc; preview.computeBodies(true); preview.dirty = true; }
    $('darknote').textContent = catalog.dark ? '' : (catalog.sunAlt > 0 ? 'The Sun is up; positions are for planning.' : 'Twilight: only the brightest things are out yet.');
    renderList();
  }
  function row(it) {
    var on = pointing === it.id, cd = showingCard === it.id;
    return '<div class="item' + (on ? ' now' : '') + '" data-id="' + it.id + '"><div class="t" data-act="tell"><h4>' + SG.esc(it.name) + '</h4><div class="d">' + SG.esc(it.sub) + '</div></div>' +
      '<div class="qa"><button data-act="point" class="' + (on ? 'on' : '') + '" aria-label="Point everyone here">' + ICON_POINT + '</button><button data-act="card" class="' + (cd ? 'on' : '') + '" aria-label="Show the card">' + ICON_CARD + '</button></div></div>';
  }
  function renderList() {
    var items = catalog.items, h = '';
    if (!items.length) { $('list').innerHTML = '<div class="empty">Nothing above the horizon yet.</div>'; return; }
    if (filter !== 'all') { var g = FILTER_GROUP[filter], sub = items.filter(function (it) { return it.group === g; }); h = sub.length ? sub.map(row).join('') : '<div class="empty">Nothing in this group is up right now.</div>'; }
    else {
      var order = ['Moon and planets', 'Lakota and Native sky', 'Constellations', 'Stars and deep sky', 'Meteor showers'], groups = {};
      for (var i = 0; i < items.length; i++) (groups[items[i].group] = groups[items[i].group] || []).push(items[i]);
      for (var o = 0; o < order.length; o++) { if (!groups[order[o]]) continue; h += '<div class="k">' + order[o] + '</div>' + groups[order[o]].map(row).join(''); }
    }
    $('list').innerHTML = h;
  }
  $('list').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]'), r = e.target.closest('.item'); if (!a || !r) return;
    var it = byId(r.getAttribute('data-id')); if (!it) return;
    var act = a.getAttribute('data-act');
    if (act === 'point') pointTo(it); else if (act === 'card') cardFor(it); else { current = it; renderTell(it); showTab('tell'); }
  });

  // ---- Tell tab: the interpretive screen ------------------------------------------------------
  function storyHtml(it) {
    var C = window.STARGAZER_CONTENT, D = window.STARGAZER_DATA, c = it.card, h = '';
    if (c.t === 'lore') {
      var L = C.indigenous[c.i]; var src = ''; for (var i = 0; i < L.sources.length; i++) src += '<li>' + SG.esc(L.sources[i]).replace(/\(fetched\)/g, '') + '</li>';
      h += '<div class="meta">' + SG.esc(L.name) + ' · ' + SG.esc(L.translation || '') + ' · ' + SG.esc(L.western) + '</div><p>' + SG.esc(L.story) + '</p>';
      h += '<div class="tips"><b>Telling it:</b> Name the people first (“In Lakota tradition…”). Point out the Western constellation only after the figure is found. If asked where it comes from, the sources are below.</div>';
      if (L.notes) h += '<details><summary>Notes for the guide</summary><p class="meta">' + SG.esc(L.notes) + '</p></details>';
      h += '<details><summary>Sources</summary><ul class="src">' + src + '</ul></details>';
    } else if (c.t === 'con') {
      var o = C.origins && C.origins[c.k];
      h += '<p>' + SG.esc(C.western[c.k] || '') + '</p>';
      var lore = []; for (var li = 0; li < C.indigenous.length; li++) if (C.indigenous[li].con.indexOf(c.k) >= 0) lore.push(C.indigenous[li]);
      if (lore.length) { h += '<div class="k">In Native skies</div>'; for (var lj = 0; lj < lore.length; lj++) h += '<p class="meta"><b>' + SG.esc(lore[lj].label || lore[lj].name) + '</b> — ' + SG.esc(lore[lj].culture.split(',')[0]) + ': ' + SG.esc(lore[lj].story.split('. ')[0]) + '.</p>'; }
      h += '<div class="tips"><b>Telling it:</b> Have everyone find the brightest star first, then trace the lines. Ask what shape they see before you say what the Greeks saw.</div>';
      if (o) h += '<details><summary>Where it came from · ' + SG.esc(o.era) + '</summary><p class="meta">' + SG.esc(o.text) + '</p></details>';
    } else if (c.t === 'body') {
      var B = { moon: 'The Moon washes out faint stars; when it is up, this is the time for the Moon, planets, bright stars, and the Native figures built on bright stars.', mercury: 'Mercury is only ever in twilight; if it is on the list tonight, catch it first.', venus: 'Venus is the brightest thing after the Moon. In Lakota tradition Venus at dawn is Aŋpó Wičháȟpi, the Morning Star.', mars: 'Mars is the one that looks orange to the eye.', jupiter: 'With binoculars, look for tiny dots in a line: the four big moons.', saturn: 'Saturn looks like a steady yellow star; the rings need a telescope.', uranus: 'Uranus is a binocular object, a faint blue-green point.', neptune: 'Neptune needs binoculars and a chart.' };
      h += '<p>' + SG.esc(B[c.k] || '') + '</p><div class="tips"><b>Telling it:</b> Planets do not twinkle; stars do. That is the quickest way to prove which is which.</div>';
    } else if (c.t === 'star') {
      var s = D.stars[c.i]; h += '<p>' + SG.esc(s[6]) + ' · magnitude ' + s[3].toFixed(1) + ' · in ' + SG.esc(D.con[s[5]] ? D.con[s[5]].n : '') + '.</p><p class="meta">' + SG.esc(C.western[s[5]] || '') + '</p>';
    } else if (c.t === 'dso') {
      h += '<p>Best seen by looking slightly to one side of it once eyes have adapted for twenty minutes. Binoculars help.</p>';
    } else if (c.t === 'shower') {
      var sh = C.showers[c.i]; h += '<p>' + SG.esc(sh.note) + '</p><div class="tips"><b>Telling it:</b> Meteors appear anywhere; their trails point back to this spot. Lie back and look halfway up, not at the radiant itself.</div>';
    }
    return h;
  }
  function renderTell(it) {
    var on = pointing === it.id, cd = showingCard === it.id;
    $('tell').innerHTML = '<div class="meta">' + SG.esc(it.sub) + '</div><h2 class="fd">' + SG.esc(it.name) + '</h2>' +
      '<div class="two" style="margin:10px 0 14px"><button class="btn ' + (on ? 'solid' : '') + '" data-act="point">' + (on ? 'Pointing · stop' : 'Point everyone here') + '</button><button class="btn ' + (cd ? 'solid' : '') + '" data-act="card">' + (cd ? 'Card on · hide' : 'Show the card') + '</button></div>' +
      storyHtml(it) + (it.sky ? '<div class="meta">Pointing here switches the guests’ sky to ' + (it.sky === 'native' ? 'Lakota &amp; Native' : 'Greek &amp; Roman') + ' automatically.</div>' : '');
  }
  $('tell').addEventListener('click', function (e) { var a = e.target.closest('[data-act]'); if (!a || !current) return; if (a.getAttribute('data-act') === 'point') pointTo(current); else cardFor(current); });

  // ---- location --------------------------------------------------------------------------------
  function locate(loud) {
    if (!navigator.geolocation) { if (loud) toast('Location is not available in this browser.'); return; }
    if (loud) toast('Finding your location…');
    navigator.geolocation.getCurrentPosition(function (p) {
      var la = p.coords.latitude, lo = p.coords.longitude, near = Math.abs(la - SG.DEFAULT_LOC.lat) < 0.3 && Math.abs(lo - SG.DEFAULT_LOC.lon) < 0.45;
      loc = near ? SG.DEFAULT_LOC : { lat: la, lon: lo, name: 'Your location (' + la.toFixed(2) + ', ' + lo.toFixed(2) + ')' };
      refreshCatalog(); toast('Sky set for ' + loc.name);
    }, function (err) { if (loud) toast(err && err.code === 1 ? 'Location was not allowed. Showing the sky over Medora.' : 'Could not get a location. Showing the sky over Medora.'); }, { timeout: 10000, maximumAge: 300000 });
  }
  $('geo').addEventListener('click', function () { locate(true); });

  // ---- boot ------------------------------------------------------------------------------------
  renderSeg(); renderChips();
  SG.load().then(function () {
    refreshCatalog(); setInterval(refreshCatalog, 60000);
    locate(false);
    preview = new SG.SkyApp({ mount: $('preview'), sensor: false, loc: loc });
    preview.open().then(function () { mirror(); });
    var pre = new URLSearchParams(location.search).get('code');
    startHost(pre ? SG.cleanCode(pre) : null);
  }, function () { $('list').innerHTML = '<div class="empty">The sky data could not be loaded.</div>'; });
})();
