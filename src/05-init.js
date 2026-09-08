
  // ---------------------------------------------------------------------------------------------
  // Boot: render a card into every [data-stargazer] container, or right where the script tag sits
  // ---------------------------------------------------------------------------------------------
  function init() {
    var nodes = document.querySelectorAll('[data-stargazer]:not([data-stargazer-ready])'), i;
    if (!nodes.length && scriptEl && scriptEl.parentNode && !scriptEl.hasAttribute('data-no-auto')) {
      var d = document.createElement('div'); d.setAttribute('data-stargazer', '');
      scriptEl.parentNode.insertBefore(d, scriptEl);
      nodes = [d];
    }
    for (i = 0; i < nodes.length; i++) { nodes[i].setAttribute('data-stargazer-ready', ''); renderCard(nodes[i]); }
  }
  window.StarGazer = {
    __loaded: true,
    version: VERSION,
    init: init,
    open: function (o) { var app = new SkyApp(o || { sensor: capability().ok }); return app.open().then(function () { return app; }); },
    capability: capability,
    astro: { solarSystem: solarSystem, moonPos: moonPos, moonPhase: moonPhase, lstFor: lstFor, julianDay: julianDay, auroraChance: auroraChance, geomagLat: geomagLat, eqVec: eqVec, eqToHzMatrix: eqToHzMatrix, precessionMatrix: precessionMatrix, matMul: matMul, mulMat: mulMat, vecToAzAlt: vecToAzAlt, fmtAz: fmtAz, fmtTime: fmtTime },
    // for the guide app at /guide/
    load: loadBundles, tourCatalog: tourCatalog, tourCode: tourCode, cleanCode: cleanCode, loadPeerJS: loadPeerJS, PEER_PREFIX: PEER_PREFIX, DEFAULT_LOC: DEFAULT_LOC, esc: esc, BASE: BASE
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
