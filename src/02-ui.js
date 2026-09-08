
  // ---------------------------------------------------------------------------------------------
  // Capability detection, storage, loading
  // ---------------------------------------------------------------------------------------------
  var UA = navigator.userAgent || '';
  var IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (navigator.maxTouchPoints > 1 && window.matchMedia && matchMedia('(pointer:coarse)').matches);
  var HAS_ORIENT = 'DeviceOrientationEvent' in window;
  var NEEDS_PERM = HAS_ORIENT && typeof DeviceOrientationEvent.requestPermission === 'function';
  var SECURE = window.isSecureContext !== false;
  function capability() {
    if (!HAS_ORIENT) return { ok: false, why: 'This browser does not expose a motion sensor.' };
    if (!IS_MOBILE) return { ok: false, why: 'No motion sensor found on this device. Drag to look around, or open this page on a phone.' };
    if (!SECURE) return { ok: false, why: 'Motion sensors need a secure (https) page.' };
    return { ok: true, why: NEEDS_PERM ? 'This device can point at the sky. Tap Start and allow motion access.' : 'This device can point at the sky.' };
  }
  var STORE_KEY = 'trpl.stargazer.v1';
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* private mode etc. */ } }

  var loadPromises = {};
  function loadScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (loadPromises[url]) return loadPromises[url];
    loadPromises[url] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = function () { window[globalName] ? res(window[globalName]) : rej(new Error('bad bundle ' + url)); };
      s.onerror = function () { rej(new Error('failed ' + url)); };
      document.head.appendChild(s);
    });
    return loadPromises[url];
  }
  function loadBundles() {
    return Promise.all([loadScript(BASE + 'stargazer-data.js', 'STARGAZER_DATA'), loadScript(BASE + 'stargazer-content.js', 'STARGAZER_CONTENT')]);
  }

  // ---------------------------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------------------------
  var CARD_CSS = [
    ':host{all:initial;display:block;contain:content;font-size:16px}',
    '*{box-sizing:border-box}',
    '.card{position:relative;overflow:hidden;background:' + BRAND.night + ';color:' + BRAND.sand + ';font-family:' + FONT_B + ';border-radius:4px;padding:24px 24px 18px;max-width:640px;width:100%;line-height:1.5;-webkit-font-smoothing:antialiased}',
    '.stars{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.9}',
    '.in{position:relative}',
    '.wm{width:100px;height:auto;display:block;color:#fff}',
    'h1{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:52px;line-height:.86;letter-spacing:.015em;color:#fff;margin:18px 0 10px}',
    'h1 small{display:block;font-size:.42em;letter-spacing:.06em;color:' + BRAND.graySky + ';margin-top:6px}',
    '.lede{font-size:16px;line-height:1.5;color:' + BRAND.sand + ';margin:0 0 18px;max-width:520px}',
    '.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:0 0 18px}',
    '.step{font-family:' + FONT_C + ';font-size:12.5px;line-height:1.4;color:' + BRAND.graySky + '}',
    '.step b{display:block;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:22px;line-height:1;color:' + BRAND.orange + ';letter-spacing:.03em;margin-bottom:4px}',
    '.status{font-family:' + FONT_C + ';font-size:12.5px;line-height:1.4;color:' + BRAND.graySky + ';display:flex;align-items:flex-start;gap:9px;margin:0 0 16px}',
    '.dot{flex:none;width:9px;height:9px;border-radius:50%;margin-top:4px;background:' + BRAND.brightForest + '}',
    '.dot.off{background:' + BRAND.graySky + ';opacity:.6}',
    '.row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}',
    '.btn{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:24px;line-height:1;letter-spacing:.04em;background:' + BRAND.orange + ';color:' + BRAND.night + ';border:0;border-radius:2px;padding:13px 28px 11px;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.btn:hover{background:#f08e6b}.btn:active{transform:translateY(1px)}',
    '.hint{font-family:' + FONT_C + ';font-size:12px;color:' + BRAND.graySky + '}',
    '.foot{font-family:' + FONT_C + ';font-size:11px;line-height:1.4;color:' + BRAND.graySky + ';margin-top:20px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;opacity:.9}',
    '.foot a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(153,173,197,.4)}',
    '@media (max-width:480px){.card{padding:20px 18px 16px}h1{font-size:44px}.steps{grid-template-columns:1fr 1fr 1fr;gap:10px}.step{font-size:12px}.btn{font-size:22px;padding:12px 22px 10px;width:100%}}'
  ].join('');

  var SKY_CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
    '.root{position:fixed;inset:0;z-index:2147483000;background:#040d1b;color:' + BRAND.graySky + ';font-family:' + FONT_C + ';overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-font-smoothing:antialiased;',
    '--fg:' + BRAND.graySky + ';--fg2:' + BRAND.sand + ';--acc:' + BRAND.orange + ';--panel:rgba(9,42,77,.92);--line:rgba(153,173,197,.25);--bg:#040d1b}',
    '.root.red{--fg:#c0392b;--fg2:#d9534f;--acc:#ff6b5b;--panel:rgba(30,4,4,.94);--line:rgba(192,57,43,.35);--bg:#090000;background:#090000;color:#c0392b}',
    'canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    'video.cam{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;background:#000}',
    '.root.cam video.cam{display:block}.root.cam{background:#000}',
    '.dim{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}',
    '.top{position:absolute;left:0;right:0;top:0;padding:max(10px,env(safe-area-inset-top)) 12px 8px;display:flex;align-items:flex-start;gap:10px;pointer-events:none}',
    '.top>*{pointer-events:auto}',
    '.ib{flex:none;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:rgba(4,13,27,.55);color:var(--fg);font-family:' + FONT_C + ';font-size:13px;display:flex;align-items:center;justify-content:center;cursor:pointer}',
    '.ib.on{background:var(--acc);color:#0b1830;border-color:var(--acc)}',
    '.root.red .ib,.root.red .chip{background:rgba(9,0,0,.6)}.root.red .nb{background:rgba(9,0,0,.7)}',
    '.ib svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.ro{flex:1;min-width:0;text-align:center;padding-top:2px}',
    '.ro .c{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:30px;line-height:.9;letter-spacing:.03em;color:var(--fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ro .s{font-size:12px;color:var(--fg);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cross{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:1px solid var(--line);border-radius:50%;pointer-events:none}',
    '.cross:after{content:"";position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px;background:var(--fg);border-radius:50%;opacity:.7}',
    '.toast{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);background:var(--panel);color:var(--fg2);font-size:13px;padding:9px 14px;border-radius:3px;max-width:86%;text-align:center;opacity:0;transition:opacity .3s;pointer-events:none;line-height:1.4}',
    '.toast.show{opacity:1}',
    '.bottom{position:absolute;left:0;right:0;bottom:0;padding:26px 0 max(10px,env(safe-area-inset-bottom));pointer-events:none;display:flex;flex-direction:column;gap:8px;background:linear-gradient(rgba(4,13,27,0),rgba(4,13,27,.85) 45%)}',
    '.root.red .bottom{background:linear-gradient(rgba(9,0,0,0),rgba(9,0,0,.9) 45%)}',
    '.chips{display:flex;gap:6px;overflow-x:auto;padding:0 12px;scrollbar-width:none;pointer-events:auto}.chips::-webkit-scrollbar{display:none}',
    '.chip{flex:none;font-family:' + FONT_C + ';font-size:12px;letter-spacing:.02em;padding:7px 11px;border-radius:20px;border:1px solid var(--line);background:rgba(4,13,27,.5);color:var(--fg);cursor:pointer;white-space:nowrap}',
    '.chip.on{background:rgba(153,173,197,.18);color:var(--fg2);border-color:rgba(153,173,197,.5)}',
    '.root.red .chip.on{background:rgba(192,57,43,.2);border-color:rgba(192,57,43,.6)}',
    '.nav{display:flex;justify-content:center;gap:8px;padding:0 12px;pointer-events:auto}',
    '.nb{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:16px;letter-spacing:.04em;line-height:1;padding:11px 4px 9px;border:1px solid var(--line);border-radius:3px;background:rgba(4,13,27,.6);color:var(--fg2);cursor:pointer;flex:1 1 0;min-width:0;max-width:150px;text-align:center;white-space:nowrap;overflow:hidden}',
    '@media (max-width:420px){.nb{font-size:14px;letter-spacing:.02em;padding:10px 2px 8px}.nav{gap:5px;padding:0 8px}}',
    '.nb.on{background:var(--acc);color:#0b1830;border-color:var(--acc)}',
    '.sheet{position:absolute;left:0;right:0;bottom:0;max-height:72%;background:var(--panel);border-top:1px solid var(--line);border-radius:10px 10px 0 0;transform:translateY(105%);transition:transform .28s ease;display:flex;flex-direction:column;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.sheet.show{transform:none}',
    '.sh{display:flex;align-items:center;gap:10px;padding:12px 14px 8px}',
    '.sh .t{flex:1;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:24px;letter-spacing:.03em;line-height:1;color:var(--fg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sh .x{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;font-size:16px;line-height:1}',
    '.sb{overflow-y:auto;padding:0 16px max(16px,env(safe-area-inset-bottom));font-family:' + FONT_B + ';font-size:15px;line-height:1.55;color:var(--fg2);-webkit-overflow-scrolling:touch}',
    '.sb p{margin:0 0 10px}',
    '.k{font-family:' + FONT_C + ';font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--fg);margin:14px 0 4px}',
    '.meta{font-family:' + FONT_C + ';font-size:12.5px;color:var(--fg);line-height:1.5;margin:0 0 8px}',
    '.tag{display:inline-block;font-family:' + FONT_C + ';font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;padding:3px 7px;border:1px solid var(--line);border-radius:2px;color:var(--fg);margin:0 6px 6px 0}',
    '.tag.acc{border-color:var(--acc);color:var(--acc)}',
    '.item{padding:10px 0;border-top:1px solid var(--line)}.item:first-child{border-top:0}',
    '.item h4{font-family:' + FONT_B + ';font-size:16px;margin:0 0 2px;color:var(--fg2);font-weight:700}',
    '.item .d{font-family:' + FONT_C + ';font-size:12px;color:var(--fg);margin-bottom:4px}',
    '.item .b{font-size:14px;color:var(--fg2)}',
    '.link{font-family:' + FONT_C + ';font-size:12.5px;color:var(--acc);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
    '.btn2{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:18px;letter-spacing:.04em;line-height:1;padding:10px 14px 8px;border:1px solid var(--acc);border-radius:3px;background:transparent;color:var(--acc);cursor:pointer;margin:6px 8px 6px 0}',
    '.btn2.solid{background:var(--acc);color:#0b1830}',
    'details{margin:6px 0}summary{font-family:' + FONT_C + ';font-size:12.5px;color:var(--fg);cursor:pointer}',
    '.src{font-family:' + FONT_C + ';font-size:11.5px;color:var(--fg);line-height:1.5;margin:6px 0 0;padding-left:16px}',
    '.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.big{font-family:' + FONT_D + ';font-weight:700;font-size:54px;line-height:.9;color:var(--acc);letter-spacing:.02em}',
    '.kp{display:flex;align-items:flex-end;gap:3px;height:60px;margin:8px 0 2px}.kp i{flex:1;background:var(--fg);opacity:.35;border-radius:2px 2px 0 0;min-height:2px;position:relative}.kp i.now{background:var(--acc);opacity:1}',
    '.kpl{display:flex;justify-content:space-between;font-family:' + FONT_C + ';font-size:10.5px;color:var(--fg)}',
    'input[type=range]{width:100%;accent-color:' + BRAND.orange + '}',
    '.root.red input[type=range]{accent-color:#c0392b}',
    'label.sw{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line);font-family:' + FONT_C + ';font-size:14px;color:var(--fg2);cursor:pointer}',
    'label.sw input{width:20px;height:20px;accent-color:' + BRAND.orange + '}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}',
    '.loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:var(--bg);color:var(--fg);font-family:' + FONT_C + ';font-size:13px;z-index:5}',
    '.loading .wm{width:120px;color:#fff;opacity:.9}',
    '@media (min-width:700px){.sheet{left:auto;right:16px;bottom:16px;width:420px;max-height:80%;border:1px solid var(--line);border-radius:6px;transform:translateY(20px);opacity:0;pointer-events:none}.sheet.show{transform:none;opacity:1;pointer-events:auto}.toast{bottom:120px}}'
  ].join('');

  // ---------------------------------------------------------------------------------------------
  // The embed card
  // ---------------------------------------------------------------------------------------------
  function drawCardStars(cv) {
    var ctx = cv.getContext('2d'), w = cv.width = cv.offsetWidth * 2, h = cv.height = cv.offsetHeight * 2;
    if (!w || !h) return;
    var seed = 12;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 90; i++) {
      var x = rnd() * w, y = rnd() * h, r = rnd() * 1.6 + 0.4, a = rnd() * 0.55 + 0.15;
      ctx.fillStyle = 'rgba(209,204,189,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
  }
  function renderCard(container) {
    var cap = capability();
    var lat = parseFloat(container.getAttribute('data-lat')), lon = parseFloat(container.getAttribute('data-lon'));
    var place = container.getAttribute('data-place');
    var loc = (isFinite(lat) && isFinite(lon)) ? { lat: lat, lon: lon, name: place || (lat.toFixed(2) + ', ' + lon.toFixed(2)) } : null;
    var root = container.attachShadow ? container.attachShadow({ mode: 'open' }) : container;
    var st = document.createElement('style'); st.textContent = CARD_CSS; root.appendChild(st);
    var card = document.createElement('div'); card.className = 'card';
    card.innerHTML =
      '<canvas class="stars"></canvas><div class="in">' +
      WORDMARK.replace('<svg ', '<svg class="wm" role="img" aria-label="Theodore Roosevelt Presidential Library" ') +
      '<h1>Stargazer<small>The night sky over the Badlands</small></h1>' +
      '<p class="lede">Hold your phone up to the sky and it names what you are looking at: stars, constellations, planets, the Moon, and the stories people have told about them for thousands of years. Built for dark skies, with a dimmed screen and a red-light mode.</p>' +
      '<div class="steps"><div class="step"><b>1. Go out</b>Find a dark spot after twilight. The Library grounds and the National Park are ideal.</div>' +
      '<div class="step"><b>2. Hold up</b>Tap Start, then raise the phone toward any patch of sky. Turn slowly to explore.</div>' +
      '<div class="step"><b>3. Tap</b>Tap any star, planet, or figure to learn its name and its story.</div></div>' +
      '<div class="status"><span class="dot' + (cap.ok ? '' : ' off') + '"></span><span>' + esc(cap.why) + '</span></div>' +
      '<div class="row"><button class="btn" type="button">' + (cap.ok ? 'Start stargazing' : 'Explore the sky') + '</button>' +
      '<span class="hint">' + (cap.ok ? 'Opens full screen and asks for your location so the sky matches where you stand. Best with your screen brightness low.' : 'Drag to look around. Scroll or pinch to zoom. Asks for your location; defaults to Medora.') + '</span></div>' +
      '<div class="foot"><span>Theodore Roosevelt Presidential Library &middot; Medora, North Dakota</span><span>Sky for ' + esc((loc || DEFAULT_LOC).name) + ' &middot; <a href="https://stargazer.labs.trlibrary.com" target="_blank" rel="noopener">stargazer.labs.trlibrary.com</a></span></div>' +
      '</div>';
    root.appendChild(card);
    var cv = card.querySelector('.stars');
    requestAnimationFrame(function () { drawCardStars(cv); });
    if (window.ResizeObserver) new ResizeObserver(function () { drawCardStars(cv); }).observe(card);
    var btn = card.querySelector('.btn');
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = 'Loading sky…';
      var app = new SkyApp({ loc: loc, sensor: cap.ok, container: container });
      app.open().then(function () { btn.disabled = false; btn.textContent = cap.ok ? 'Start stargazing' : 'Explore the sky'; });
    });
    // prefetch bundles when the network is not constrained
    var conn = navigator.connection || {};
    if (!conn.saveData && (window.requestIdleCallback || setTimeout)) {
      (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(function () { loadBundles().catch(function () { }); });
    }
  }
