#!/usr/bin/env python3
"""Concatenate src/*.js into stargazer.js and inline the wordmark SVG. No dependencies."""
import glob, os, re
here = os.path.dirname(os.path.abspath(__file__))
parts = sorted(glob.glob(os.path.join(here, 'src', '*.js')))
src = ''.join(open(p, encoding='utf-8').read() for p in parts)
wm = open(os.path.join(here, 'assets', 'wordmark.svg'), encoding='utf-8').read().strip().replace("'", "\\'")
src = src.replace('__WORDMARK__', wm)
open(os.path.join(here, 'stargazer.js'), 'w', encoding='utf-8').write(src)
print('stargazer.js', round(len(src) / 1024), 'KB from', len(parts), 'parts')
