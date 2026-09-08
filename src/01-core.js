/*!
 * StarGazer — Theodore Roosevelt Presidential Library
 * An embeddable night-sky explorer for phones and tablets (gyroscope) with a drag fallback for desktops.
 * https://stargazer.labs.trlibrary.com  ·  One-line embed:  <script src="https://stargazer.labs.trlibrary.com/stargazer.js"></script>
 *
 * Star catalog and constellation lines: d3-celestial (Olaf Frohn, BSD-3). Planetary positions: JPL approximate
 * Keplerian elements (Standish). Moon: Schlyter series. Aurora: NOAA SWPC planetary K index (live fetch, optional).
 */
(function () {
  'use strict';
  if (window.StarGazer && window.StarGazer.__loaded) return;

  // ---------------------------------------------------------------------------------------------
  // Brand + configuration
  // ---------------------------------------------------------------------------------------------
  var BRAND = {
    night: '#092A4D', darkGray: '#25282A', sand: '#D1CCBD', orange: '#E7805D', graySky: '#99ADC5',
    yellow: '#F9D635', white: '#FFFFFF', forest: '#1B4532', brightForest: '#8FC895'
  };
  var FONT_D = "'Dharma Gothic E','Oswald','Arial Narrow',Impact,'Helvetica Neue',sans-serif";
  var FONT_B = "'ITC Clearface','Clearface',Georgia,'Times New Roman',serif";
  var FONT_C = "'Frutiger Next','Frutiger',Arial,Helvetica,sans-serif";
  var DEFAULT_LOC = { lat: 46.914, lon: -103.524, name: 'Medora, North Dakota' };
  var VERSION = '1.0.0';
  var WORDMARK = '__WORDMARK__';

  var scriptEl = document.currentScript;
  if (!scriptEl) {
    var ss = document.getElementsByTagName('script');
    for (var si = ss.length - 1; si >= 0; si--) { if (/stargazer(\.min)?\.js/i.test(ss[si].src || '')) { scriptEl = ss[si]; break; } }
  }
  var BASE = (scriptEl && scriptEl.src) ? scriptEl.src.replace(/[^\/]*(\?.*)?$/, '') : '';

  // ---------------------------------------------------------------------------------------------
  // Math helpers
  // ---------------------------------------------------------------------------------------------
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, asin = Math.asin, sqrt = Math.sqrt, abs = Math.abs;
  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function vnorm(v) { var l = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vlerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // Unit vector from RA/Dec (degrees) in equatorial frame.
  function eqVec(ra, dec) { var cd = cos(dec * D2R); return [cd * cos(ra * D2R), cd * sin(ra * D2R), sin(dec * D2R)]; }
  // Unit vector from azimuth (from N through E) / altitude, in E,N,U frame.
  function hzVec(az, alt) { var ca = cos(alt * D2R); return [ca * sin(az * D2R), ca * cos(az * D2R), sin(alt * D2R)]; }
  function vecToAzAlt(v) { return { az: norm360(atan2(v[0], v[1]) * R2D), alt: asin(clamp(v[2], -1, 1)) * R2D }; }
  function angSep(a, b) { return Math.acos(clamp(vdot(a, b), -1, 1)) * R2D; }
  function fmtAz(az) {
    var names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round(norm360(az) / 22.5) % 16];
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(d) {
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'pm' : 'am'; h = h % 12; if (h === 0) h = 12;
    return h + ':' + pad2(m) + ' ' + ap;
  }
  function fmtDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------------------------------------
  // Astronomy
  // ---------------------------------------------------------------------------------------------
  function julianDay(date) { return date.getTime() / 86400000 + 2440587.5; }
  function gmstDeg(jd) {
    var T = (jd - 2451545.0) / 36525;
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000);
  }
  function obliquityDeg(jd) { var T = (jd - 2451545.0) / 36525; return 23.439291 - 0.0130042 * T; }
  function eclToEq(x, y, z, eps) {
    var ce = cos(eps * D2R), se = sin(eps * D2R);
    return [x, ce * y - se * z, se * y + ce * z];
  }
  function vecToRaDec(v) {
    var r = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return { ra: norm360(atan2(v[1], v[0]) * R2D), dec: asin(v[2] / r) * R2D, r: r };
  }
  function solveKepler(Mdeg, e) {
    var M = norm360(Mdeg) * D2R, E = M + e * sin(M) * (1 + e * cos(M));
    for (var i = 0; i < 12; i++) { var dE = (E - e * sin(E) - M) / (1 - e * cos(E)); E -= dE; if (abs(dE) < 1e-8) break; }
    return E;
  }
  // JPL approximate Keplerian elements, J2000 ecliptic, valid 1800–2050. [a, e, I, L, longPeri, longNode] + rates/century.
  var PLANET_EL = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]]
  };
  var PLANET_INFO = {
    mercury: { name: 'Mercury', color: '#d9c7b0', size: 1.0, blurb: 'The innermost planet, never far from the Sun, so it is only ever seen low in twilight. Its day is longer than its year.' },
    venus: { name: 'Venus', color: '#f7efd2', size: 1.6, blurb: 'The brightest planet, wrapped in clouds that reflect most of the sunlight that hits them. In Lakota tradition Venus at dawn is Aŋpó Wičháȟpi, the Morning Star.' },
    mars: { name: 'Mars', color: '#f0a070', size: 1.2, blurb: 'The red planet, colored by iron-rich dust. Its brightness swings widely as Earth and Mars move closer and farther apart.' },
    jupiter: { name: 'Jupiter', color: '#f2e6c8', size: 1.6, blurb: 'The largest planet, big enough to hold every other planet inside it. Steady binoculars show up to four of its moons in a line.' },
    saturn: { name: 'Saturn', color: '#f0e0b0', size: 1.3, blurb: 'The ringed planet. Its rings are mostly water ice, and any small telescope will show them.' },
    uranus: { name: 'Uranus', color: '#bfe3e6', size: 0.9, blurb: 'A pale blue-green ice giant at the edge of naked-eye visibility. It spins on its side.' },
    neptune: { name: 'Neptune', color: '#9fb8f0', size: 0.9, blurb: 'The most distant planet, too faint for the naked eye. Binoculars or a telescope are needed.' }
  };
  function helioPos(name, jd) {
    var el = PLANET_EL[name], T = (jd - 2451545.0) / 36525;
    var a = el[0][0] + el[1][0] * T, e = el[0][1] + el[1][1] * T, I = el[0][2] + el[1][2] * T,
      L = el[0][3] + el[1][3] * T, wp = el[0][4] + el[1][4] * T, O = el[0][5] + el[1][5] * T;
    var w = wp - O, M = L - wp;
    var E = solveKepler(M, e);
    var xp = a * (cos(E) - e), yp = a * sqrt(1 - e * e) * sin(E);
    var cw = cos(w * D2R), sw = sin(w * D2R), cO = cos(O * D2R), sO = sin(O * D2R), cI = cos(I * D2R), sI = sin(I * D2R);
    return [
      (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      (sw * sI) * xp + (cw * sI) * yp
    ];
  }
  // Returns { ra, dec, dist (AU), mag, phase } for each planet plus the Sun, geocentric.
  function solarSystem(jd) {
    var eps = obliquityDeg(jd), earth = helioPos('earth', jd), out = {};
    var R = sqrt(vdot(earth, earth));
    var sunEq = eclToEq(-earth[0], -earth[1], -earth[2], eps);
    var sunRD = vecToRaDec(sunEq);
    out.sun = { id: 'sun', name: 'Sun', ra: sunRD.ra, dec: sunRD.dec, dist: R, mag: -26.7, vec: vnorm(sunEq), lon: norm360(atan2(-earth[1], -earth[0]) * R2D) };
    for (var k in PLANET_EL) {
      if (k === 'earth') continue;
      var p = helioPos(k, jd), g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
      var r = sqrt(vdot(p, p)), d = sqrt(vdot(g, g));
      var ph = Math.acos(clamp((r * r + d * d - R * R) / (2 * r * d), -1, 1)) * R2D; // phase angle, degrees
      var lg = 5 * Math.log10(r * d), mag;
      switch (k) {
        case 'mercury': mag = -0.42 + lg + 0.0380 * ph - 0.000273 * ph * ph + 0.000002 * ph * ph * ph; break;
        case 'venus': mag = -4.40 + lg + 0.0009 * ph + 0.000239 * ph * ph - 0.00000065 * ph * ph * ph; break;
        case 'mars': mag = -1.52 + lg + 0.016 * ph; break;
        case 'jupiter': mag = -9.40 + lg + 0.005 * ph; break;
        case 'saturn': mag = -8.88 + lg + 0.044 * ph - 0.6; break;
        case 'uranus': mag = -7.19 + lg; break;
        default: mag = -6.87 + lg;
      }
      var eq = eclToEq(g[0], g[1], g[2], eps), rd = vecToRaDec(eq);
      var elong = angSep(vnorm(eq), out.sun.vec);
      out[k] = { id: k, name: PLANET_INFO[k].name, ra: rd.ra, dec: rd.dec, dist: d, mag: mag, phase: ph, elong: elong, vec: vnorm(eq) };
    }
    return out;
  }
  // Moon: Paul Schlyter's method with the main perturbation terms (~2 arcmin), then topocentric correction.
  function moonPos(jd, lat, lstDeg) {
    var d = jd - 2451543.5, eps = obliquityDeg(jd);
    var N = norm360(125.1228 - 0.0529538083 * d), i = 5.1454, w = norm360(318.0634 + 0.1643573223 * d), a = 60.2666, e = 0.054900, M = norm360(115.3654 + 13.0649929509 * d);
    var Ms = norm360(356.0470 + 0.9856002585 * d), ws = norm360(282.9404 + 4.70935e-5 * d);
    var E = solveKepler(M, e);
    var x = a * (cos(E) - e), y = a * sqrt(1 - e * e) * sin(E);
    var r = sqrt(x * x + y * y), v = atan2(y, x) * R2D;
    var vw = (v + w) * D2R, Nr = N * D2R, ir = i * D2R;
    var xe = r * (cos(Nr) * cos(vw) - sin(Nr) * sin(vw) * cos(ir)), ye = r * (sin(Nr) * cos(vw) + cos(Nr) * sin(vw) * cos(ir)), ze = r * sin(vw) * sin(ir);
    var lon = atan2(ye, xe) * R2D, lat_ = atan2(ze, sqrt(xe * xe + ye * ye)) * R2D;
    var Ls = Ms + ws, Lm = M + w + N, D = (Lm - Ls) * D2R, F = (Lm - N) * D2R, Mr = M * D2R, Msr = Ms * D2R;
    lon += -1.274 * sin(Mr - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Msr) - 0.059 * sin(2 * Mr - 2 * D) - 0.057 * sin(Mr - 2 * D + Msr)
      + 0.053 * sin(Mr + 2 * D) + 0.046 * sin(2 * D - Msr) + 0.041 * sin(Mr - Msr) - 0.035 * sin(D) - 0.031 * sin(Mr + Msr)
      - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(Mr - 4 * D);
    lat_ += -0.173 * sin(F - 2 * D) - 0.055 * sin(Mr - F - 2 * D) - 0.046 * sin(Mr + F - 2 * D) + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * Mr + F);
    r += -0.58 * cos(Mr - 2 * D) - 0.46 * cos(2 * D);
    var cl = cos(lat_ * D2R);
    var gx = r * cl * cos(lon * D2R), gy = r * cl * sin(lon * D2R), gz = r * sin(lat_ * D2R);
    var geq = eclToEq(gx, gy, gz, eps);
    // topocentric: subtract observer position (Earth radii) in the equatorial frame
    var cp = cos(lat * D2R), sp = sin(lat * D2R);
    var obs = [cp * cos(lstDeg * D2R), cp * sin(lstDeg * D2R), sp];
    var top = [geq[0] - obs[0], geq[1] - obs[1], geq[2] - obs[2]];
    var rd = vecToRaDec(top);
    return { id: 'moon', name: 'Moon', ra: rd.ra, dec: rd.dec, distER: rd.r, distKm: rd.r * 6378.14, vec: vnorm(top), lon: norm360(lon), geoVec: vnorm(geq) };
  }
  function moonPhase(moon, sun) {
    var elong = angSep(moon.geoVec, sun.vec);          // degrees between Moon and Sun
    var phaseAngle = 180 - elong;
    var illum = (1 + cos(phaseAngle * D2R)) / 2;
    var dl = norm360(moon.lon - sun.lon);               // 0 new, 90 first quarter, 180 full, 270 last quarter
    var age = dl / 360 * 29.530589;
    var name;
    if (dl < 11.25 || dl >= 348.75) name = 'New Moon'; else if (dl < 78.75) name = 'Waxing Crescent'; else if (dl < 101.25) name = 'First Quarter';
    else if (dl < 168.75) name = 'Waxing Gibbous'; else if (dl < 191.25) name = 'Full Moon'; else if (dl < 258.75) name = 'Waning Gibbous';
    else if (dl < 281.25) name = 'Last Quarter'; else name = 'Waning Crescent';
    return { illum: illum, age: age, name: name, waxing: dl < 180, elong: elong, dl: dl };
  }
  // Equatorial unit vector -> horizontal (E,N,U) unit vector for latitude phi (deg) and LST (deg).
  function eqToHzMatrix(latDeg, lstDeg) {
    var cp = cos(latDeg * D2R), sp = sin(latDeg * D2R), cl = cos(lstDeg * D2R), sl = sin(lstDeg * D2R);
    // x_h = cl*X + sl*Y ; y_h = sl*X - cl*Y ; z_h = Z   (hour-angle frame: x toward meridian, y toward west)
    // E = -y_h ; N = -sp*x_h + cp*z_h ; U = cp*x_h + sp*z_h
    return [
      -sl, cl, 0,
      -sp * cl, -sp * sl, cp,
      cp * cl, cp * sl, sp
    ];
  }
  // Precession J2000 -> mean equator/equinox of date (Meeus 21.2), as a 3x3 row-major matrix.
  function precessionMatrix(jd) {
    var T = (jd - 2451545.0) / 36525, s = D2R / 3600;
    var ze = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * s;
    var z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * s;
    var th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * s;
    var cz = cos(ze), sz = sin(ze), cZ = cos(z), sZ = sin(z), ct = cos(th), st = sin(th);
    return [
      cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ,
      cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ,
      cz * st, -sz * st, ct
    ];
  }
  function matMul(a, b) { // 3x3 * 3x3
    var o = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  function mulMat(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function altOf(eqv, lat, lst) { var m = eqToHzMatrix(lat, lst); return asin(clamp(m[6] * eqv[0] + m[7] * eqv[1] + m[8] * eqv[2], -1, 1)) * R2D; }
  function lstFor(date, lon) { return norm360(gmstDeg(julianDay(date)) + lon); }
  // Scan for rise/set style crossings of a body's altitude over the next `hours` from `start` (Date).
  function scanCrossings(start, hours, stepMin, altFn, threshold) {
    var out = [], prev = null, t = start.getTime(), end = t + hours * 3600000, step = stepMin * 60000;
    for (; t <= end; t += step) {
      var d = new Date(t), a = altFn(d);
      if (prev !== null) {
        if (prev < threshold && a >= threshold) out.push({ type: 'rise', time: new Date(t - step / 2) });
        else if (prev >= threshold && a < threshold) out.push({ type: 'set', time: new Date(t - step / 2) });
      }
      prev = a;
    }
    return out;
  }
  function bvColor(bv) {
    if (bv <= -0.1) return [170, 195, 255]; if (bv <= 0.2) return [205, 218, 255]; if (bv <= 0.45) return [245, 248, 255];
    if (bv <= 0.75) return [255, 244, 225]; if (bv <= 1.1) return [255, 224, 185]; if (bv <= 1.5) return [255, 200, 150]; return [255, 175, 120];
  }
  function bvWord(bv) { return bv <= 0 ? 'blue-white' : bv <= 0.35 ? 'white' : bv <= 0.7 ? 'yellow-white' : bv <= 1.1 ? 'yellow-orange' : bv <= 1.5 ? 'orange' : 'red-orange'; }
  // Geomagnetic latitude (centered dipole, IGRF ~2025: pole 80.8N 72.8W)
  function geomagLat(lat, lon) {
    var pl = 80.8 * D2R, po = -72.8 * D2R, la = lat * D2R, lo = lon * D2R;
    return asin(clamp(sin(la) * sin(pl) + cos(la) * cos(pl) * cos(lo - po), -1, 1)) * R2D;
  }
  // Estimated chance of seeing aurora somewhere in the sky (clear, dark) from geomagnetic latitude gl at planetary Kp.
  function auroraChance(kp, gl) {
    var edge = 63 - 2 * kp;               // NOAA: oval edge ~66-2Kp; glow often visible a few degrees equatorward
    var p = 1 / (1 + Math.exp(-(gl - edge) / 2.5));
    return clamp(Math.round(p * 100), 1, 98);
  }
