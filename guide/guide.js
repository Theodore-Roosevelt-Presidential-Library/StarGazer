/* StarGazer tour guide — runs on the guide's phone or tablet. Holds the tour code as a PeerJS id,
   lists what is worth pointing at right now, and pushes state (sky, layers, arrow target, card) to
   every guest that has joined. No server: the guide's browser is the hub. */
(function () {
  'use strict';
  var SG = window.StarGazer, $ = function (id) { return document.getElementById(id); };
  var LAYERS = [['art', 'Figures'], ['lines', 'Constellations'], ['names', 'Star names'], ['planets', 'Planets'], ['mw', 'Milky Way'], ['native', 'Native sky'], ['meteors', 'Meteors'], ['dso', 'Deep sky'], ['grid', 'Horizon marks']];
  var state = { sky: 'both', layers: { art: true, lines: true, names: true, planets: true, mw: true, native: true, meteors: true, dso: false, grid: true }, target: null, card: null };
  var loc = SG.DEFAULT_LOC, code = null, peer = null, conns = [], catalog = { items: [] }, current = null, pointing = null, showingCard = null;

  fetch(SG.BASE + 'assets/wordmark.svg').then(function (r) { return r.text(); }).then(function (svg) { $('wm').innerHTML = svg.replace('<svg ', '<svg class="wm" '); }).catch(function () { });

  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2800); }
  function setStatus(txt, kind) { $('status').textContent = txt; $('dot').className = 'dot' + (kind ? ' ' + kind : ''); }

  // ---- hosting the tour --------------------------------------------------------------------
  function broadcast(msg) { for (var i = 0; i < conns.length; i++) { try { conns[i].send(msg); } catch (e) { } } }
  function pushState(extra) { var m = { t: 'state', sky: state.sky, layers: state.layers, target: state.target, card: state.card }; if (extra) for (var k in extra) m[k] = extra[k]; broadcast(m); }
  function updateCount() { $('count').textContent = conns.length; $('countLabel').textContent = conns.length === 1 ? 'joined' : 'joined'; }
  function startHost(newCode) {
    if (peer) { try { peer.destroy(); } catch (e) { } peer = null; conns = []; updateCount(); }
    code = newCode || SG.tourCode();
    $('code').textContent = code; $('code').classList.remove('off');
    setStatus('Opening the tour…');
    SG.loadPeerJS().then(function (Peer) {
      peer = new Peer(SG.PEER_PREFIX + code, { debug: 0 });
      peer.on('open', function () { setStatus('Tour is open. Guests can join with the code.', 'ok'); });
      peer.on('connection', function (conn) {
        conn.on('open', function () {
          conns.push(conn); updateCount(); toast('A guest joined');
          try { conn.send({ t: 'state', sky: state.sky, layers: state.layers, target: state.target, card: state.card }); } catch (e) { }
        });
        function drop() { var i = conns.indexOf(conn); if (i >= 0) conns.splice(i, 1); updateCount(); }
        conn.on('close', drop); conn.on('error', drop);
      });
      peer.on('disconnected', function () { setStatus('Reconnecting to the matchmaking service…', 'bad'); if (!peer.destroyed) { try { peer.reconnect(); } catch (e) { } } });
      peer.on('error', function (e) {
        var kind = String((e && e.type) || '');
        if (kind === 'unavailable-id') { setStatus('That code is in use; picking another.', 'bad'); setTimeout(function () { startHost(); }, 800); return; }
        if (kind === 'disconnected' && !peer.destroyed) { try { peer.reconnect(); } catch (err) { } return; }
        setStatus(kind === 'network' || kind === 'server-error' ? 'The matchmaking service is not responding. Guests cannot join right now.' : 'Connection problem: ' + kind, 'bad');
      });
    }, function () { setStatus('The connection library could not load on this network.', 'bad'); });
  }
  setInterval(function () { if (peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { } } }, 5000);

  $('newcode').addEventListener('click', function () { if (conns.length && !confirm('Guests on the current code will be dropped. Start a new code?')) return; broadcast({ t: 'end' }); startHost(); });
  $('endtour').addEventListener('click', function () { if (!confirm('End the tour for everyone?')) return; broadcast({ t: 'end' }); if (peer) { try { peer.destroy(); } catch (e) { } } peer = null; conns = []; updateCount(); $('code').textContent = 'Tour ended'; $('code').classList.add('off'); setStatus('Tour ended. Tap New code to start another.'); });
  $('share').addEventListener('click', function () {
    var url = 'https://stargazer.labs.trlibrary.com/?tour=' + code;
    if (navigator.share) navigator.share({ title: 'Join the star tour', text: 'Tour code ' + code, url: url }).catch(function () { });
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Link copied'); });
    else prompt('Join link', url);
  });

  // ---- controls -------------------------------------------------------------------------------
  function renderSeg() { var bs = $('seg').querySelectorAll('[data-sky]'); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-sky') === state.sky); }
  $('seg').addEventListener('click', function (e) { var b = e.target.closest('[data-sky]'); if (!b) return; state.sky = b.getAttribute('data-sky'); renderSeg(); pushState(); });
  function renderChips() { var h = ''; for (var i = 0; i < LAYERS.length; i++) h += '<button class="chip' + (state.layers[LAYERS[i][0]] ? ' on' : '') + '" data-l="' + LAYERS[i][0] + '">' + LAYERS[i][1] + '</button>'; $('chips').innerHTML = h; }
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; var l = b.getAttribute('data-l'); state.layers[l] = !state.layers[l]; renderChips(); pushState(); });
  $('freelook').addEventListener('click', function () { state.target = null; state.card = null; pointing = null; showingCard = null; pushState({ say: 'Free look. Explore on your own for a moment.' }); renderList(); if (current) renderDetail(current); toast('Guests are free to look around'); });

  // ---- the visible-now list --------------------------------------------------------------------
  function refreshCatalog() {
    catalog = SG.tourCatalog(loc, new Date());
    $('where').textContent = '· ' + loc.name;
    $('darknote').textContent = catalog.dark ? '' : (catalog.sunAlt > 0 ? 'The Sun is up; positions are shown for planning.' : 'Twilight: only the brightest things are out yet.');
    renderList();
  }
  function renderList() {
    var items = catalog.items, groups = {}, order = ['Moon and planets', 'Lakota and Native sky', 'Constellations', 'Stars and deep sky', 'Meteor showers'], h = '';
    for (var i = 0; i < items.length; i++) { var g = items[i].group; if (!groups[g]) groups[g] = []; groups[g].push(items[i]); }
    order = order.filter(function (g) { return groups[g]; });
    if (!items.length) { $('list').innerHTML = '<div class="meta">Nothing above the horizon yet.</div>'; return; }
    for (var o = 0; o < order.length; o++) {
      h += '<div class="g"><div class="k">' + order[o] + '</div>';
      var arr = groups[order[o]];
      for (var j = 0; j < arr.length; j++) { var it = arr[j], on = pointing === it.id; h += '<div class="item' + (on ? ' now' : '') + '" data-id="' + it.id + '"><div class="t"><h4>' + SG.esc(it.name) + '</h4><div class="d">' + SG.esc(it.sub) + '</div></div>' + (on ? '<span class="tag" style="border-color:var(--acc);color:var(--acc)">Pointing</span>' : '') + (it.sky === 'native' ? '<span class="tag">Native</span>' : '') + '</div>'; }
      h += '</div>';
    }
    $('list').innerHTML = h;
  }
  $('list').addEventListener('click', function (e) { var row = e.target.closest('.item'); if (!row) return; var id = row.getAttribute('data-id'); for (var i = 0; i < catalog.items.length; i++) if (catalog.items[i].id === id) { current = catalog.items[i]; renderDetail(current); break; } });

  // ---- interpretive screen for the guide ---------------------------------------------------------
  function detailHtml(it) {
    var C = window.STARGAZER_CONTENT, D = window.STARGAZER_DATA, c = it.card, h = '<div class="meta">' + SG.esc(it.sub) + '</div>';
    if (c.t === 'lore') {
      var L = C.indigenous[c.i]; var src = ''; for (var i = 0; i < L.sources.length; i++) src += '<li>' + SG.esc(L.sources[i]).replace(/\(fetched\)/g, '') + '</li>';
      h += '<div class="k">' + SG.esc(L.name) + '</div><div class="meta">' + SG.esc(L.translation || '') + ' · ' + SG.esc(L.western) + '</div><p>' + SG.esc(L.story) + '</p>';
      h += '<div class="tips"><b>Telling it:</b> Name the people first (“In Lakota tradition…”). Point out the Western constellation only after the Native figure is found. If asked where the story comes from, the sources are below; say it is shared with respect and is awaiting review by tribal partners.</div>';
      if (L.notes) h += '<details><summary>Notes for the guide</summary><p class="meta">' + SG.esc(L.notes) + '</p></details>';
      h += '<details><summary>Sources</summary><ul class="src">' + src + '</ul></details>';
    } else if (c.t === 'con') {
      var o = C.origins && C.origins[c.k];
      h += '<p>' + SG.esc(C.western[c.k] || '') + '</p>' + (o ? '<div class="k">Where it came from · ' + SG.esc(o.era) + '</div><p class="meta">' + SG.esc(o.text) + '</p>' : '');
      var lore = []; for (var li = 0; li < C.indigenous.length; li++) if (C.indigenous[li].con.indexOf(c.k) >= 0) lore.push(C.indigenous[li]);
      if (lore.length) { h += '<div class="k">In Native skies</div>'; for (var lj = 0; lj < lore.length; lj++) h += '<p class="meta"><b>' + SG.esc(lore[lj].label || lore[lj].name) + '</b> — ' + SG.esc(lore[lj].culture.split(',')[0]) + ': ' + SG.esc(lore[lj].story.split('. ')[0]) + '.</p>'; }
      h += '<div class="tips"><b>Telling it:</b> Have everyone find the brightest star first, then trace the lines. Ask what shape they see before you say what the Greeks saw.</div>';
    } else if (c.t === 'body') {
      var B = { moon: 'The Moon washes out faint stars; if it is up, this is the time for the Moon, planets and bright stars, and the Native figures built on bright stars.', mercury: 'Mercury is only ever in twilight; if it is on the list tonight, catch it first.', venus: 'Venus is the brightest thing after the Moon. In Lakota tradition Venus at dawn is Aŋpó Wičháȟpi, the Morning Star.', mars: 'Mars is the one that looks orange to the eye.', jupiter: 'With binoculars, ask them to look for tiny dots in a line: the four big moons.', saturn: 'Saturn looks like a steady yellow star; the rings need a telescope.', uranus: 'Uranus is a binocular object — a faint blue-green point.', neptune: 'Neptune needs binoculars and a chart.' };
      h += '<p>' + SG.esc(B[c.k] || '') + '</p><div class="tips"><b>Telling it:</b> Planets do not twinkle; stars do. That is the quickest way to prove which is which.</div>';
    } else if (c.t === 'star') {
      var s = D.stars[c.i]; h += '<p>' + SG.esc(s[6]) + ' · magnitude ' + s[3].toFixed(1) + ' · in ' + SG.esc(D.con[s[5]] ? D.con[s[5]].n : '') + '.</p><p class="meta">' + SG.esc(C.western[s[5]] || '') + '</p>';
    } else if (c.t === 'dso') {
      h += '<p>Best seen by looking slightly to one side of it (averted vision) once eyes have adapted for 20 minutes. Binoculars help.</p>';
    } else if (c.t === 'shower') {
      var sh = C.showers[c.i]; h += '<p>' + SG.esc(sh.note) + '</p><div class="tips"><b>Telling it:</b> Meteors appear anywhere; their trails point back to this spot. Lie back and look halfway up, not at the radiant itself.</div>';
    }
    return h;
  }
  function renderDetail(it) {
    $('sheetT').textContent = it.name;
    var isPointing = pointing === it.id, isCard = showingCard === it.id;
    $('sheetB').innerHTML = detailHtml(it) +
      '<div class="row" style="margin-top:14px"><button class="btn ' + (isPointing ? 'solid' : '') + '" id="pt">' + (isPointing ? 'Pointing everyone here' : 'Point everyone here') + '</button>' +
      '<button class="btn ' + (isCard ? 'solid' : '') + '" id="cd">' + (isCard ? 'Card is on their screens' : 'Show the card on their screens') + '</button></div>' +
      '<div class="row"><input class="say" id="say" placeholder="Say something to everyone (shows as a note)"><button class="btn quiet" id="sayGo">Send</button></div>' +
      (it.sky ? '<div class="meta">Pointing here switches the guests’ sky to ' + (it.sky === 'native' ? 'Lakota &amp; Native' : 'Greek &amp; Roman') + ' automatically.</div>' : '');
    $('sheet').classList.add('show');
    $('pt').addEventListener('click', function () {
      if (pointing === it.id) { pointing = null; state.target = null; }
      else { pointing = it.id; state.target = { vec: it.vec, j2000: it.j2000, label: it.name }; if (it.sky && state.sky !== it.sky) { state.sky = it.sky; renderSeg(); } if (it.sky === 'native' && !state.layers.native) { state.layers.native = true; renderChips(); } }
      pushState(); renderList(); renderDetail(it);
    });
    $('cd').addEventListener('click', function () {
      if (showingCard === it.id) { showingCard = null; state.card = null; } else { showingCard = it.id; state.card = it.card; if (it.sky && state.sky !== it.sky) { state.sky = it.sky; renderSeg(); } }
      pushState(); renderDetail(it);
    });
    $('sayGo').addEventListener('click', function () { var v = $('say').value.trim().slice(0, 140); if (!v) return; pushState({ say: v }); $('say').value = ''; toast('Sent'); });
  }
  $('sheetX').addEventListener('click', function () { $('sheet').classList.remove('show'); });

  // ---- boot ---------------------------------------------------------------------------------------
  renderSeg(); renderChips();
  SG.load().then(function () {
    refreshCatalog(); setInterval(refreshCatalog, 60000);
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { var la = p.coords.latitude, lo = p.coords.longitude; var near = Math.abs(la - SG.DEFAULT_LOC.lat) < 0.3 && Math.abs(lo - SG.DEFAULT_LOC.lon) < 0.45; loc = near ? SG.DEFAULT_LOC : { lat: la, lon: lo, name: 'Your location' }; refreshCatalog(); }, function () { }, { timeout: 8000, maximumAge: 600000 });
    startHost(new URLSearchParams(location.search).get('code') ? SG.cleanCode(new URLSearchParams(location.search).get('code')) : null);
  }, function () { $('list').innerHTML = '<div class="meta">The sky data could not be loaded.</div>'; });
})();
