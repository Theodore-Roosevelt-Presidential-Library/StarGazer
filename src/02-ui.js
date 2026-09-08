
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
    return Promise.all([loadScript(vurl('stargazer-data.js'), 'STARGAZER_DATA'), loadScript(vurl('stargazer-content.js'), 'STARGAZER_CONTENT')]);
  }

  // ---------------------------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------------------------
  var CARD_CSS = [
    ':host{all:initial;display:block;contain:content;font-size:16px;width:100%;height:100%;min-width:0;min-height:0;max-width:100%}',
    '*{box-sizing:border-box}',
    '.card{position:relative;overflow:hidden;background:#061a33;color:' + BRAND.sand + ';font-family:' + FONT_B + ';border-radius:4px;width:100%;height:100%;max-width:100%;min-height:300px;-webkit-font-smoothing:antialiased;cursor:pointer}',
    '.card::before{content:"";display:block;float:left;width:0;padding-top:62.5%}',   // 16:10 floor when the container has no height of its own; a height on the container wins
    '.card.full{max-width:none;height:100vh;height:100dvh;border-radius:0}.card.full::before{display:none}',
    '.card.full h1{font-size:72px}.card.full .lede{font-size:18px;max-width:520px}.card.full .wm{width:120px;left:28px;top:28px}.card.full .in{left:28px;right:28px;bottom:28px}',
    '.card.full .emb{position:absolute;left:28px;bottom:6px;font-family:' + FONT_C + ';font-size:11px;color:' + BRAND.graySky + ';opacity:.8}.card.full .emb a{color:inherit}',
    '@media (max-width:520px){.card.full h1{font-size:52px}.card.full .wm{width:84px;left:18px;top:18px}.card.full .in{left:18px;right:18px;bottom:22px}.card.full .emb{left:18px}}',
    '.sky{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,26,51,.55) 0%,rgba(6,26,51,0) 35%,rgba(6,26,51,0) 55%,rgba(6,26,51,.88) 100%);pointer-events:none}',
    '.wm{position:absolute;left:22px;top:20px;width:88px;height:auto;color:#fff;opacity:.95}',
    '.cap{position:absolute;right:20px;top:22px;font-family:' + FONT_C + ';font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:' + BRAND.graySky + ';display:flex;align-items:center;gap:7px}',
    '.dot{width:7px;height:7px;border-radius:50%;background:' + BRAND.brightForest + ';box-shadow:0 0 8px ' + BRAND.brightForest + '}',
    '.dot.off{background:' + BRAND.graySky + ';box-shadow:none;opacity:.7}',
    '.in{position:absolute;left:22px;right:22px;bottom:22px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px}',
    'h1{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:56px;line-height:.86;letter-spacing:.015em;color:#fff;margin:0 0 8px}',
    '.lede{font-size:16px;line-height:1.45;color:' + BRAND.sand + ';margin:0;max-width:420px}',
    '.btn{flex:none;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:24px;line-height:1;letter-spacing:.04em;background:' + BRAND.orange + ';color:' + BRAND.night + ';border:0;border-radius:2px;padding:14px 26px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s,background .15s}',
    '.card:hover .btn{background:#f08e6b;transform:translateY(-1px)}.btn:active{transform:translateY(1px)}',
    '.acts{display:flex;flex-direction:column;align-items:stretch;gap:10px;flex:none}',
    '.join{display:block;width:100%;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:20px;line-height:1;letter-spacing:.04em;color:#fff;background:rgba(4,13,27,.35);border:1.5px solid rgba(255,255,255,.55);border-radius:2px;padding:12px 18px 10px;margin:0;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;transition:border-color .15s,background .15s}',
    '.join:hover{border-color:#fff;background:rgba(255,255,255,.08)}.join:active{transform:translateY(1px)}',
    '.jp{position:absolute;inset:0;background:#071c38;display:none;flex-direction:column;justify-content:center;padding:28px 24px;cursor:default}',
    '.jp.show{display:flex}',
    '.jp h2{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:40px;line-height:.9;letter-spacing:.02em;color:#fff;margin:0 0 6px}',
    '.jp p{font-family:' + FONT_B + ';font-size:15px;line-height:1.45;color:' + BRAND.sand + ';margin:0 0 18px}',
    '.jp input{display:block;width:100%;font-family:' + FONT_D + ';font-weight:700;font-size:44px;line-height:1;letter-spacing:.22em;text-align:center;text-transform:uppercase;padding:14px 8px 12px;border:1px solid rgba(153,173,197,.55);border-radius:3px;background:rgba(4,13,27,.7);color:#fff;outline:none;margin:0 0 12px}',
    '.jp input:focus{border-color:' + BRAND.orange + '}',
    '.jp .go{display:block;width:100%;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:24px;line-height:1;letter-spacing:.04em;background:' + BRAND.orange + ';color:' + BRAND.night + ';border:0;border-radius:2px;padding:14px 20px 12px;cursor:pointer}',
    '.jp .go:disabled{opacity:.45;cursor:default}',
    '.jp .cancel{display:block;margin:14px auto 0;font-family:' + FONT_C + ';font-size:13px;color:' + BRAND.graySky + ';background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
    '.jp .err{font-family:' + FONT_C + ';font-size:12px;color:#F36079;min-height:16px;margin:0 0 6px;text-align:center}',
    '@media (max-width:520px){.jp{padding:22px 18px}.jp h2{font-size:34px}.jp input{font-size:38px}}',
    '@media (max-width:520px){.card{min-height:360px}.card::before{padding-top:125%}.in{flex-direction:column;align-items:stretch}h1{font-size:46px}.lede{font-size:15px}.btn{width:100%;font-size:22px}.join{font-size:22px;padding:13px 18px 11px}.wm{width:76px;left:18px;top:16px}.cap{right:16px;top:18px}.in{left:18px;right:18px;bottom:18px}}'
  ].join('');

  var SKY_CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
    '.root{position:fixed;inset:0;z-index:2147483000;background:#040d1b;color:' + BRAND.graySky + ';font-family:' + FONT_C + ';overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-font-smoothing:antialiased;',
    '--fg:' + BRAND.graySky + ';--fg2:' + BRAND.sand + ';--acc:' + BRAND.orange + ';--panel:rgba(9,42,77,.92);--line:rgba(153,173,197,.25);--bg:#040d1b}',
    '.root.inline{position:absolute;z-index:1}',
    '.root.inline .nav,.root.inline .chipsw,.root.inline .seg,.root.inline .ib.x,.root.inline .rb,.root.inline .cb,.root.inline .tourpill{display:none}',
    '.root.inline .ro .c{font-size:22px}.root.inline .ro .s{font-size:11px}.root.inline .top{padding:8px 10px 6px}.root.inline .bottom{padding:0}',
    '.root.inline .sheet{max-height:85%;left:0;right:0;bottom:0;width:auto;border-radius:8px 8px 0 0;transform:translateY(105%);opacity:1;pointer-events:auto}.root.inline .sheet.show{transform:none}',
    '.root.inline .sb{font-size:13px}.root.inline .sh .t{font-size:18px}.root.inline .target{top:56px;font-size:11px;padding:5px 8px 5px 10px}',
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
    '.toast{position:absolute;left:50%;bottom:200px;transform:translateX(-50%);background:var(--panel);color:var(--fg2);font-size:13px;padding:9px 14px;border-radius:3px;max-width:86%;text-align:center;opacity:0;transition:opacity .3s;pointer-events:none;line-height:1.4}',
    '.toast.show{opacity:1}',
    '.target{position:absolute;left:50%;top:calc(max(10px,env(safe-area-inset-top)) + 64px);transform:translateX(-50%);display:none;align-items:center;gap:10px;background:var(--acc);color:#0b1830;border:0;border-radius:20px;padding:8px 10px 8px 14px;font-family:' + FONT_C + ';font-size:13px;cursor:pointer;max-width:86%}',
    '.target.show{display:flex}.target .tx{width:22px;height:22px;border-radius:50%;background:rgba(11,24,48,.25);display:flex;align-items:center;justify-content:center;font-size:12px}',
    '.item.dimmed{opacity:.6}',
    '.tourpill{position:absolute;left:12px;top:calc(max(10px,env(safe-area-inset-top)) + 52px);display:none;align-items:center;gap:8px;background:rgba(9,42,77,.9);border:1px solid var(--acc);color:var(--fg2);border-radius:20px;padding:6px 8px 6px 12px;font-family:' + FONT_C + ';font-size:12px;cursor:pointer}',
    '.tourpill.show{display:flex}.tourpill .tx{width:18px;height:18px;border-radius:50%;background:rgba(153,173,197,.2);display:flex;align-items:center;justify-content:center;font-size:10px}',
    '.root.red .tourpill{background:rgba(30,4,4,.9)}',
    '.bottom{position:absolute;left:0;right:0;bottom:0;padding:26px 0 max(10px,env(safe-area-inset-bottom));pointer-events:none;display:flex;flex-direction:column;gap:8px;background:linear-gradient(rgba(4,13,27,0),rgba(4,13,27,.85) 45%)}',
    '.root.red .bottom{background:linear-gradient(rgba(9,0,0,0),rgba(9,0,0,.9) 45%)}',
    '.cbw{display:flex;justify-content:flex-end;margin:0 12px;pointer-events:none}',
    '.cb{display:none;align-items:center;gap:8px;pointer-events:auto;font-family:' + FONT_C + ';font-size:13px;line-height:1;padding:9px 16px 9px 12px;border-radius:22px;border:1px solid var(--fg2);background:rgba(4,13,27,.75);color:var(--fg2);cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.cb.show{display:inline-flex}.cb svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.cb.on{background:var(--acc);border-color:var(--acc);color:#0b1830}',
    '.seg{display:flex;gap:0;margin:0 12px 2px;border:1px solid var(--line);border-radius:4px;overflow:hidden;pointer-events:auto;background:rgba(4,13,27,.6)}',
    '.seg button{flex:1;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:15px;letter-spacing:.04em;line-height:1;padding:10px 6px 8px;border:0;background:transparent;color:var(--fg);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.seg button+button{border-left:1px solid var(--line)}.seg button.on{background:var(--acc);color:#0b1830}',
    '.root.red .seg{background:rgba(9,0,0,.7)}',
    '@media (max-width:420px){.seg button{font-size:13px;padding:9px 4px 7px}}',
    '.chipsw{position:relative;pointer-events:auto}',
    '.chips{display:flex;gap:6px;overflow-x:auto;padding:0 12px;scrollbar-width:none;scroll-padding:0 12px}.chips::-webkit-scrollbar{display:none}',
    '.chipsw:before,.chipsw:after{content:"";position:absolute;top:0;bottom:0;width:56px;pointer-events:none;opacity:0;transition:opacity .2s}',
    '.chipsw:before{left:0;background:linear-gradient(90deg,rgba(4,13,27,.95),rgba(4,13,27,0))}.chipsw:after{right:0;background:linear-gradient(270deg,rgba(4,13,27,.95) 20%,rgba(4,13,27,0))}',
    '.chipsw.more-l:before,.chipsw.more-r:after{opacity:1}',
    '.chipsw .hint{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;background:var(--acc);color:#0b1830;font-size:13px;line-height:22px;text-align:center;pointer-events:none;opacity:0;transition:opacity .2s}.chipsw.more-r .hint{opacity:1}',
    '.root.red .chipsw:before{background:linear-gradient(90deg,rgba(9,0,0,.95),rgba(9,0,0,0))}.root.red .chipsw:after{background:linear-gradient(270deg,rgba(9,0,0,.95) 20%,rgba(9,0,0,0))}',
    '.chip{flex:none;font-family:' + FONT_C + ';font-size:12px;letter-spacing:.02em;padding:7px 11px;border-radius:20px;border:1px solid var(--line);background:rgba(4,13,27,.5);color:var(--fg);cursor:pointer;white-space:nowrap}',
    '.chip.on{background:rgba(153,173,197,.18);color:var(--fg2);border-color:rgba(153,173,197,.5)}',
    '.root.red .chip.on{background:rgba(192,57,43,.2);border-color:rgba(192,57,43,.6)}',
    '.nav{display:flex;justify-content:center;gap:8px;padding:0 12px;pointer-events:auto}',
    '.nb{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:16px;letter-spacing:.04em;line-height:1;padding:11px 4px 9px;border:1px solid var(--line);border-radius:3px;background:rgba(4,13,27,.6);color:var(--fg2);cursor:pointer;flex:1 1 0;min-width:0;max-width:150px;text-align:center;white-space:nowrap;overflow:hidden}',
    '@media (max-width:420px){.nb{font-size:14px;letter-spacing:.02em;padding:10px 2px 8px}.nav{gap:5px;padding:0 8px}}',
    '.nb.on{background:var(--acc);color:#0b1830;border-color:var(--acc)}',
    '.sheet{position:absolute;left:0;right:0;bottom:0;max-height:min(46%,420px);background:var(--panel);border-top:1px solid var(--line);border-radius:10px 10px 0 0;transform:translateY(105%);transition:transform .28s ease;display:flex;flex-direction:column;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.sheet.show{transform:none}',
    '.sh{display:flex;align-items:center;gap:10px;padding:12px 14px 8px}',
    '.sh .t{flex:1;font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:24px;letter-spacing:.03em;line-height:1;color:var(--fg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sh .pin{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 9px;border-radius:17px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;font-family:' + FONT_C + ';font-size:12.5px;line-height:1;-webkit-tap-highlight-color:transparent}',
    '.sh .pin svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.sh .pin.on{background:var(--acc);border-color:var(--acc);color:#0b1830}',
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
    '.also{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:10px 0 4px;font-family:' + FONT_C + ';font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg)}',
    '.also .link{font-size:13px;letter-spacing:0;text-transform:none}',
    '.src{font-family:' + FONT_C + ';font-size:11.5px;color:var(--fg);line-height:1.5;margin:6px 0 0;padding-left:16px;overflow-wrap:anywhere}',
    '.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.joinrow{flex-wrap:nowrap}.joinrow input{flex:1;min-width:0;font-family:' + FONT_D + ';font-weight:700;font-size:28px;line-height:1;letter-spacing:.18em;text-transform:uppercase;text-align:center;padding:9px 8px 7px;border:1px solid var(--line);border-radius:3px;background:rgba(4,13,27,.6);color:var(--fg2);outline:none}',
    '.joinrow input:focus{border-color:var(--acc)}.joinrow .btn2:disabled{opacity:.45;cursor:default}',
    '.big{font-family:' + FONT_D + ';font-weight:700;font-size:54px;line-height:.9;color:var(--acc);letter-spacing:.02em}',
    '.kp{display:flex;align-items:flex-end;gap:3px;height:60px;margin:8px 0 2px}.kp i{flex:1;background:var(--fg);opacity:.35;border-radius:2px 2px 0 0;min-height:2px;position:relative}.kp i.now{background:var(--acc);opacity:1}',
    '.kpl{display:flex;justify-content:space-between;font-family:' + FONT_C + ';font-size:10.5px;color:var(--fg)}',
    'input[type=range]{width:100%;accent-color:' + BRAND.orange + '}',
    '.root.red input[type=range]{accent-color:#c0392b}',
    'label.sw{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line);font-family:' + FONT_C + ';font-size:14px;color:var(--fg2);cursor:pointer}',
    'label.sw input{width:20px;height:20px;accent-color:' + BRAND.orange + '}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}',
    '.loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--bg);color:var(--fg);font-family:' + FONT_C + ';font-size:13px;z-index:5;transition:opacity .6s}',
    '.loading.out{opacity:0;pointer-events:none}',
    '.loading .wm{width:150px;color:#fff;opacity:0;animation:sgwm 1.1s ease-out forwards}',
    '@keyframes sgwm{0%{opacity:0;transform:scale(.92) translateY(6px)}100%{opacity:.95;transform:none}}',
    '.loading .lmsg{opacity:0;animation:sgfade .8s ease-out .5s forwards}',
    '.loading .tips{display:flex;gap:22px;opacity:0;animation:sgfade .8s ease-out .9s forwards}',
    '.loading .tips div{font-family:' + FONT_D + ';font-weight:700;text-transform:uppercase;font-size:20px;letter-spacing:.04em;color:var(--fg2);text-align:center;line-height:1}',
    '.loading .tips small{display:block;font-family:' + FONT_C + ';font-size:11px;text-transform:none;letter-spacing:0;color:var(--fg);margin-top:5px}',
    '@keyframes sgfade{to{opacity:1}}',
    '@media (min-width:700px){.sheet{left:auto;right:16px;bottom:16px;width:420px;max-height:80%;border:1px solid var(--line);border-radius:6px;transform:translateY(20px);opacity:0;pointer-events:none}.sheet.show{transform:none;opacity:1;pointer-events:auto}.toast{bottom:120px}}'
  ].join('');

  // ---------------------------------------------------------------------------------------------
  // The embed card
  // ---------------------------------------------------------------------------------------------
  // Card background: a real chart of tonight's sky (facing south, 10 pm) drifting slowly, once the data
  // bundle has arrived; a procedural starfield until then.
  function CardSky(cv, loc) {
    this.cv = cv; this.loc = loc; this.t0 = null; this.data = null; this.running = false; this.seed = 12;
    var self = this;
    if (window.IntersectionObserver) { new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; if (self.visible) self.start(); }).observe(cv); this.visible = false; }
    else { this.visible = true; }
    loadBundles().then(function (r) { self.data = r[0]; self.prep(); self.start(); }).catch(function () { });
    this.start();
  }
  CardSky.prototype.prep = function () {
    var D = this.data, i, S = D.stars, n = Math.min(S.length, 2600);
    this.vec = new Float32Array(n * 3); this.n = n;
    for (i = 0; i < n; i++) { var v = eqVec(S[i][1], S[i][2]); this.vec[i * 3] = v[0]; this.vec[i * 3 + 1] = v[1]; this.vec[i * 3 + 2] = v[2]; }
    this.segs = [];
    for (var k in D.con) { var c = D.con[k]; for (var a = 0; a < c.l.length; a++) for (var b = 0; b < c.l[a].length - 1; b++) this.segs.push(eqVec(c.l[a][b][0], c.l[a][b][1]), eqVec(c.l[a][b + 1][0], c.l[a][b + 1][1])); }
    var d = new Date(); d.setHours(22, 0, 0, 0); this.base = d.getTime();
  };
  CardSky.prototype.start = function () {
    if (this.running || !this.visible) return; this.running = true;
    var self = this; (function frame() { if (!self.visible) { self.running = false; return; } self.draw(); requestAnimationFrame(frame); })();
  };
  CardSky.prototype.draw = function () {
    var cv = this.cv, dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.offsetWidth, h = cv.offsetHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#071a35'); g.addColorStop(1, '#0a2748');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var now = performance.now();
    if (!this.data) { // procedural placeholder
      var seed = 12; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
      for (var i = 0; i < 110; i++) { var x = rnd() * w, y = rnd() * h, r = rnd() * 1.4 + 0.4, a = 0.25 + 0.5 * rnd(); a *= 0.8 + 0.2 * Math.sin(now / 900 + i); ctx.fillStyle = 'rgba(220,226,240,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
      return;
    }
    if (this.t0 === null) this.t0 = now;
    var skyTime = new Date(this.base + (now - this.t0) * 240);             // 4 minutes of sky per second
    var jd = julianDay(skyTime), lst = lstFor(skyTime, this.loc.lon), HZ = eqToHzMatrix(this.loc.lat, lst), P = precessionMatrix(jd);
    var f = hzVec(180, 38), u = vnorm([0 - f[2] * f[0], 0 - f[2] * f[1], 1 - f[2] * f[2]]), r = vcross(f, u);
    var M = matMul(matMul([r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]], HZ), P);
    var fov = 95, cx = w / 2, cy = h / 2, S2 = 2 * (Math.max(w, h) / 2) / (2 * Math.tan(fov * D2R / 4));
    var m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
    var hzP = matMul(HZ, P), u0 = hzP[6], u1 = hzP[7], u2 = hzP[8], i2, z, k, px, py;
    ctx.strokeStyle = 'rgba(153,173,197,.22)'; ctx.lineWidth = 1; ctx.beginPath();
    for (i2 = 0; i2 < this.segs.length; i2 += 2) {
      var a1 = this.segs[i2], b1 = this.segs[i2 + 1], za = m6 * a1[0] + m7 * a1[1] + m8 * a1[2], zb = m6 * b1[0] + m7 * b1[1] + m8 * b1[2];
      if (za < 0.2 || zb < 0.2 || u0 * a1[0] + u1 * a1[1] + u2 * a1[2] < 0.02 || u0 * b1[0] + u1 * b1[1] + u2 * b1[2] < 0.02) continue;
      var ka = S2 / (1 + za), kb = S2 / (1 + zb);
      ctx.moveTo(cx + (m0 * a1[0] + m1 * a1[1] + m2 * a1[2]) * ka, cy - (m3 * a1[0] + m4 * a1[1] + m5 * a1[2]) * ka);
      ctx.lineTo(cx + (m0 * b1[0] + m1 * b1[1] + m2 * b1[2]) * kb, cy - (m3 * b1[0] + m4 * b1[1] + m5 * b1[2]) * kb);
    }
    ctx.stroke();
    var S = this.data.stars, v = this.vec;
    for (i2 = 0; i2 < this.n; i2++) {
      var o = i2 * 3, X = v[o], Y = v[o + 1], Z = v[o + 2]; z = m6 * X + m7 * Y + m8 * Z; if (z < 0.2) continue;
      if (u0 * X + u1 * Y + u2 * Z < 0.02) continue;
      k = S2 / (1 + z); px = cx + (m0 * X + m1 * Y + m2 * Z) * k; py = cy - (m3 * X + m4 * Y + m5 * Z) * k;
      if (px < 0 || px > w || py < 0 || py > h) continue;
      var mag = S[i2][3], rad = Math.max(0.5, 3.6 - mag * 0.6), al = Math.min(1, Math.max(0.2, 1.15 - mag * 0.16)) * (0.85 + 0.15 * Math.sin(now / 700 + i2));
      var col = bvColor(S[i2][4]); ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + al.toFixed(2) + ')';
      if (rad < 1.1) ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2); else { ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.283); ctx.fill(); }
    }
    // horizon glow
    var hg = ctx.createLinearGradient(0, h * 0.7, 0, h); hg.addColorStop(0, 'rgba(231,128,93,0)'); hg.addColorStop(1, 'rgba(231,128,93,.12)'); ctx.fillStyle = hg; ctx.fillRect(0, h * 0.7, w, h * 0.3);
  };
  function renderCard(container) {
    var cap = capability();
    var lat = parseFloat(container.getAttribute('data-lat')), lon = parseFloat(container.getAttribute('data-lon'));
    var place = container.getAttribute('data-place');
    var loc = (isFinite(lat) && isFinite(lon)) ? { lat: lat, lon: lon, name: place || (lat.toFixed(2) + ', ' + lon.toFixed(2)) } : null;
    var root = container.attachShadow ? container.attachShadow({ mode: 'open' }) : container;
    var st = document.createElement('style'); st.textContent = CARD_CSS; root.appendChild(st);
    var full = container.hasAttribute('data-full');
    var card = document.createElement('div'); card.className = 'card' + (full ? ' full' : '');
    card.innerHTML =
      '<canvas class="sky" aria-hidden="true"></canvas><div class="shade"></div>' +
      WORDMARK.replace('<svg ', '<svg class="wm" role="img" aria-label="Theodore Roosevelt Presidential Library" ') +
      '<div class="cap"><span class="dot' + (cap.ok ? '' : ' off') + '"></span>' + (cap.ok ? 'Motion sensor ready' : 'Drag to explore') + '</div>' +
      '<div class="in"><div><h1>Stargazer</h1><p class="lede">' + (cap.ok ? 'Hold your phone up to the night sky. It names what you see and tells its stories.' : 'Tonight\'s sky over the Badlands. Best on a phone, outside, after dark.') + '</p></div>' +
      '<div class="acts"><button class="btn" type="button">' + (cap.ok ? 'Start' : 'Explore') + '</button><button class="join" type="button">Join a tour</button></div></div>' +
      (full ? '<div class="emb">Theodore Roosevelt Presidential Library &middot; <a href="embed/">Put this on your site</a></div>' : '') +
      '<div class="jp" role="dialog" aria-label="Join a tour"><h2>Join a tour</h2><p>Enter the code your guide gives you. You can join any time while the tour is running.</p>' +
      '<input type="text" maxlength="6" placeholder="CODE" inputmode="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Tour code">' +
      '<div class="err"></div><button class="go" type="button" disabled>Join the tour</button><button class="cancel" type="button">Not now</button></div>';
    root.appendChild(card);
    var sky = new CardSky(card.querySelector('.sky'), loc || loadPrefs().loc || DEFAULT_LOC);
    var btn = card.querySelector('.btn'), busy = false;
    var joinBtn = card.querySelector('.join'), joinBox = card.querySelector('.jp'), joinIn = joinBox.querySelector('input'), joinGo = joinBox.querySelector('.go'), joinErr = joinBox.querySelector('.err'), joinCancel = joinBox.querySelector('.cancel');
    function go(tour) {
      if (busy) return; busy = true; btn.textContent = 'Opening…';
      var app = new SkyApp({ loc: loc, sensor: cap.ok, container: container, tour: tour || null });
      app.open().then(function () { busy = false; btn.textContent = cap.ok ? 'Start' : 'Explore'; });
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); go(); });
    function openJoin() { joinBox.classList.add('show'); sky.visible = false; setTimeout(function () { joinIn.focus(); }, 50); }
    function closeJoin() { joinBox.classList.remove('show'); sky.visible = true; sky.start(); }
    joinBtn.addEventListener('click', function (e) { e.stopPropagation(); openJoin(); });
    joinBox.addEventListener('click', function (e) { e.stopPropagation(); });
    joinCancel.addEventListener('click', closeJoin);
    joinIn.addEventListener('input', function () { joinIn.value = cleanCode(joinIn.value); joinGo.disabled = joinIn.value.length < 5; joinErr.textContent = ''; });
    joinGo.addEventListener('click', function () { var c = cleanCode(joinIn.value); if (c.length < 5) { joinErr.textContent = 'Codes are five letters or numbers.'; joinIn.focus(); return; } closeJoin(); go(c); });
    joinIn.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !joinGo.disabled) joinGo.click(); });
    var pre = new URLSearchParams(location.search).get('tour'); if (pre) { joinIn.value = cleanCode(pre); joinGo.disabled = joinIn.value.length < 5; openJoin(); }
    card.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) return; go(); });
    // prefetch bundles when the network is not constrained
    var conn = navigator.connection || {};
    if (!conn.saveData && (window.requestIdleCallback || setTimeout)) {
      (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(function () { loadBundles().catch(function () { }); });
    }
  }
