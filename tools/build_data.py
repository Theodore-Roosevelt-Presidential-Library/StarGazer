#!/usr/bin/env python3
"""
Build stargazer-data.js from the d3-celestial data files (Olaf Frohn, BSD-3).

Pulls stars to magnitude 6 (Hipparcos numbers, positions, magnitude, B-V), proper names and Bayer
designations, constellation names/lines/boundaries, the bright deep-sky list, and the Milky Way
contours (sampled into a point cloud so it renders robustly in any projection).

Runs in CI on every deploy; pinned to a d3-celestial commit for reproducibility.
Requires only numpy. Usage:  python3 tools/build_data.py
"""
import json, math, os, random, sys, urllib.request
import numpy as np

COMMIT = '7e720a3de062059d4c5400a379146a601d9010e0'
BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/%s/data/' % COMMIT
FILES = ['stars.6.json', 'starnames.json', 'constellations.json', 'constellations.lines.json',
         'constellations.bounds.json', 'dsos.bright.json', 'mw.json']
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'stargazer-data.js')
CACHE = os.path.join(HERE, '.cache')

DSO_NAMES = {'M 31': 'Andromeda Galaxy', 'M 42': 'Orion Nebula', 'M 45': 'Pleiades', 'M 44': 'Beehive Cluster',
             'M 8': 'Lagoon Nebula', 'M 16': 'Eagle Nebula', 'M 33': 'Triangulum Galaxy', 'M 4': 'M4 Cluster',
             'M 6': 'Butterfly Cluster', 'M 7': "Ptolemy's Cluster", 'Mel 25': 'Hyades', 'Mel 20': 'Alpha Persei Cluster',
             'Mel 111': 'Coma Star Cluster', 'h Per': 'Double Cluster', 'Cr 399': 'Coathanger', 'NGC 2244': 'Rosette Cluster',
             'NGC 2264': 'Christmas Tree Cluster', 'NGC 2362': 'Tau Canis Majoris Cluster', 'GalCtr': 'Galactic Center',
             'η Car': 'Carina Nebula', 'ω Cen': 'Omega Centauri', '47 Tuc': '47 Tucanae', 'LMC': 'Large Magellanic Cloud',
             'SMC': 'Small Magellanic Cloud', 'IC 2602': 'Southern Pleiades', 'NGC 6231': 'Northern Jewel Box',
             'IC 2391': 'Omicron Velorum Cluster', 'NGC 2516': 'Southern Beehive', 'NGC 3532': 'Wishing Well Cluster',
             'Cr 140': 'Collinder 140', 'NGC 2451': 'NGC 2451'}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        print('downloading', name)
        urllib.request.urlretrieve(BASE + name, p)
    return json.load(open(p, encoding='utf-8'))


def norm(ra):
    return ra + 360 if ra < 0 else ra


def point_in_rings(rings, ra, dec):
    """Vectorized ray casting: rings is a list of (N,2) arrays in the same -180..180 RA space as the samples."""
    inside = np.zeros(len(ra), dtype=bool)
    for ring in rings:
        x0, y0 = ring[:, 0], ring[:, 1]
        x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
        hit = np.zeros(len(ra), dtype=bool)
        for i in range(len(x0)):
            cond = (y0[i] > dec) != (y1[i] > dec)
            if not cond.any():
                continue
            xint = (x1[i] - x0[i]) * (dec - y0[i]) / ((y1[i] - y0[i]) or 1e-12) + x0[i]
            hit ^= cond & (ra < xint)
        inside |= hit
    return inside


def main():
    stars = fetch('stars.6.json')['features']
    names = fetch('starnames.json')
    cons = fetch('constellations.json')['features']
    lines = fetch('constellations.lines.json')['features']
    bounds = fetch('constellations.bounds.json')['features']
    dsos = fetch('dsos.bright.json')['features']
    mw = fetch('mw.json')['features']

    S = []
    for f in stars:
        hip = f['id']; ra, dec = f['geometry']['coordinates']; p = f['properties']
        try:
            bv = float(p.get('bv', ''))
        except ValueError:
            bv = 0.6
        n = names.get(str(hip), {})
        S.append([hip, round(norm(ra), 3), round(dec, 3), round(p['mag'], 2), round(bv, 1),
                  n.get('c', ''), n.get('name', '') or '', (n.get('bayer', '') or n.get('flam', '') or '')])
    S.sort(key=lambda s: s[3])

    lmap = {f['id']: f['geometry']['coordinates'] for f in lines}
    C, seen = {}, set()
    for f in cons:
        cid = f['id']
        if cid in seen:
            continue
        seen.add(cid)
        p = f['properties']; ra, dec = f['geometry']['coordinates']
        L = [[[round(norm(x), 2), round(y, 2)] for x, y in seg] for seg in lmap.get(cid, [])]
        C[cid] = {'n': 'Serpens' if cid == 'Ser' else p['name'], 'g': p['gen'], 'ra': round(norm(ra), 2), 'dec': round(dec, 2), 'l': L}

    B = {}
    for f in bounds:
        k = f['id']
        if k in B:
            k += '2'   # Serpens has two polygons
        B[k] = [[round(norm(x), 2), round(y, 2)] for x, y in f['geometry']['coordinates'][0]]

    D = []
    for f in dsos:
        p = f['properties']; ra, dec = f['geometry']['coordinates']
        if p['desig'] == 'χ Per':
            continue
        D.append([DSO_NAMES.get(p['desig'], p['desig']), p['desig'], p['type'], round(norm(ra), 2), round(dec, 2), float(p.get('mag', 0))])

    # Milky Way point cloud: sample the sphere uniformly, keep points inside the contour levels
    rings = {}
    for f in mw:
        lvl = int(f['id'][2])
        for poly in f['geometry']['coordinates']:
            if len(poly[0]) >= 3:
                rings.setdefault(lvl, []).append(np.array(poly[0], dtype=float))
    rng = random.Random(7)
    N = 24000
    ra = np.array([rng.uniform(-180, 180) for _ in range(N)])
    dec = np.degrees(np.arcsin(np.array([rng.uniform(-1, 1) for _ in range(N)])))
    level = np.zeros(N, dtype=int)
    for lvl in sorted(rings):
        inside = point_in_rings(rings[lvl], ra, dec)
        level[inside] = np.maximum(level[inside], lvl)
    keep_p = {1: 0.35, 2: 0.6, 3: 0.8, 4: 1.0, 5: 1.0}
    pts = []
    for i in range(N):
        w = int(level[i])
        if w and rng.random() < keep_p[w]:
            pts.append([round(norm(float(ra[i])), 1), round(float(dec[i]), 1), w])
        if len(pts) >= 3600:
            break

    out = {'stars': S, 'con': C, 'dsos': D, 'mw': pts, 'bnd': B}
    js = ('// StarGazer data bundle — generated by tools/build_data.py from d3-celestial (BSD-3, Olaf Frohn) at commit %s.\n'
          'window.STARGAZER_DATA=' % COMMIT) + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ';'
    open(OUT, 'w', encoding='utf-8').write(js)
    print('wrote', os.path.relpath(OUT), round(len(js) / 1024), 'KB —', len(S), 'stars,', len(C), 'constellations,', len(pts), 'Milky Way points')


if __name__ == '__main__':
    main()
