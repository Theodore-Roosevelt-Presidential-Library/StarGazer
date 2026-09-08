#!/usr/bin/env python3
"""Build stargazer-content.js from content/*.json, then concatenate src/*.js into stargazer.js with the wordmark inlined. No dependencies."""
import glob, os, re, runpy, subprocess, datetime
here = os.path.dirname(os.path.abspath(__file__))

# Cache busting. Every build gets a stamp (the commit SHA on GitHub Actions, a timestamp elsewhere) that is
# baked into stargazer.js and appended as ?v= to everything it loads (data, content, art) and to the script
# tags in the site's own pages. Embedders keep the bare stargazer.js URL; GitHub Pages serves that with a
# ten-minute max-age, so a new build reaches every embed within ten minutes and its dependencies match
# exactly, because their URLs change with it.
def build_stamp():
    sha = os.environ.get('GITHUB_SHA')
    if sha: return sha[:7]
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=here, stderr=subprocess.DEVNULL, timeout=5).decode().strip() or 'dev'
    except Exception:
        return datetime.datetime.utcnow().strftime('%Y%m%d%H%M')
BUILD = build_stamp()
runpy.run_path(os.path.join(here, 'tools', 'build_content.py'), run_name='__main__')
parts = sorted(glob.glob(os.path.join(here, 'src', '*.js')))
src = ''.join(open(p, encoding='utf-8').read() for p in parts)
wm = open(os.path.join(here, 'assets', 'wordmark.svg'), encoding='utf-8').read().strip().replace("'", "\\'")
src = src.replace('__WORDMARK__', wm).replace('__BUILD__', BUILD)
open(os.path.join(here, 'stargazer.js'), 'w', encoding='utf-8').write(src)
print('stargazer.js', round(len(src) / 1024), 'KB from', len(parts), 'parts · build', BUILD)
# stamp the site's own script tags (relative src only; the embed snippets that show the public URL are untouched)
if os.environ.get('GITHUB_SHA') or os.environ.get('STAMP_HTML'):
    for page in ('index.html', 'guide/index.html', 'embed/index.html'):
        fp = os.path.join(here, page); html = open(fp, encoding='utf-8').read()
        html2 = re.sub(r'src="((?:\.\./)?(?:stargazer|guide)\.js)(?:\?v=[^"]*)?"', lambda m: 'src="' + m.group(1) + '?v=' + BUILD + '"', html)
        if html2 != html: open(fp, 'w', encoding='utf-8').write(html2); print('stamped', page)
