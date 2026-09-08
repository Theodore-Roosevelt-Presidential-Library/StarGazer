# StarGazer

An embeddable night-sky explorer from the Theodore Roosevelt Presidential Library. On a phone or
tablet it uses the motion sensors: hold the screen up to the sky and it names what you are looking
at. On a desktop you drag to look around. Built with dark-sky intentions: a dim palette, an
extra-dimming slider, and a red-light mode that protects night vision.

**Live:** https://stargazer.labs.trlibrary.com

- **One line to embed.** `<script src="https://stargazer.labs.trlibrary.com/stargazer.js"></script>`
  renders a branded card where the tag sits. The card explains what the tool does, detects whether
  the device has a motion sensor, and offers a Start button that opens the sky full screen.
- **Self-contained.** No framework, no page dependencies, no API keys. All astronomy runs on the device;
  the only network call is the optional NOAA space-weather feed for the Aurora panel.
- **Isolated.** The card and the full-screen sky both render inside shadow roots, so host-page
  styles never leak in and the widget never disturbs the host page.
- **On-brand.** References the Library's brand fonts (Dharma Gothic E, ITC Clearface, Frutiger
  Next) with safe fallbacks; Night Sky background, Deep Orange accent, Gray Sky and Sand text.

## What it shows

| Layer | Source |
|-------|--------|
| ~5,000 stars to magnitude 6 with proper names and Bayer designations | Hipparcos via d3-celestial |
| All 88 constellations: lines, names, boundaries, and a short story each | d3-celestial (IAU), stories written for this widget |
| Constellation figures (85 illustrations pinned to their stars; "Figures" chip) | Stellarium western sky culture, drawn by Johan Meuris — Free Art License; anchors CC BY-SA |
| See-through mode: the rear camera behind the chart ("See-through" chip) | `getUserMedia`, on device; never recorded or uploaded |
| Sun, Moon (true phase, oriented toward the Sun), Mercury–Neptune | JPL Keplerian elements; Schlyter lunar series; precessed to date |
| Milky Way, 30 bright clusters, nebulae, and galaxies | d3-celestial |
| Lakota, Dakota, Arikara, Hidatsa, Mandan, Ojibwe, and Pawnee star knowledge | Published sources, cited on each story (see below) |
| Meteor showers active tonight, with radiants | IMO 2026 calendar |
| Tonight panel: sunset, full dark, moonrise, planets, next equinox/solstice, upcoming events through 2028 | Computed on device; NASA GSFC and EclipseWise for eclipses |
| Aurora panel: estimated chance of northern lights tonight | NOAA SWPC planetary K index, live |
| Guided tours: a guide at `/guide/` points every guest's arrow, sets their sky and layers, and pushes cards | PeerJS / WebRTC, no server |

Tap any star, planet, figure, or constellation name for its details. The reticle at the center of
the screen always reports the constellation you are pointing at and the nearest bright star.

## Quick start

```html
<script src="https://stargazer.labs.trlibrary.com/stargazer.js"></script>
```

That is the whole embed. To place the card somewhere other than where the script tag sits:

```html
<div data-stargazer></div>
<script src="https://stargazer.labs.trlibrary.com/stargazer.js"></script>
```

`stargazer.js` finds its own URL and loads `stargazer-data.js` (stars) and
`stargazer-content.js` (stories, events) from the same folder, so cross-origin embeds on other
sites still need only the one tag. The site root is the full-screen experience (a card that fills
the viewport, `<div data-stargazer data-full>`); `/embed/` is the preview and instruction page;
`/guide/` is the tour guide's console.

## Options

| Attribute | Example | Meaning |
|-----------|---------|---------|
| `data-lat` / `data-lon` | `data-lat="47.6" data-lon="-103.3"` | Fix the observer location for this embed. Default is Medora; participants can also use their own location from Settings. |
| `data-place` | `data-place="Elkhorn Ranch"` | Label for a fixed location. |
| `data-no-auto` (on the script tag) | | Do not insert a card automatically; only render into `[data-stargazer]` containers. |

From JavaScript, `StarGazer.open()` opens the sky directly; call it from a click handler so the
browser allows motion access and full screen. `StarGazer.astro` exposes the ephemeris functions.

## How it works

- **Sensors.** On iOS the Start tap requests motion permission (required since iOS 13). The
  widget listens for `deviceorientationabsolute` where available (Android Chrome) and falls back to
  `deviceorientation` with `webkitCompassHeading` (iOS). Device angles become a rotation matrix
  (W3C ZXY convention, corrected for screen rotation); the look direction is the axis out the back
  of the phone. A phone compass is usually off by a few degrees: dragging sideways in sensor mode
  nudges the sky to line up with a landmark such as the Moon, and the offset is remembered.
- **Projection.** Stereographic, centered on the look direction; pinch or scroll to zoom
  (18°–110° field of view). The horizon is a true circle in this projection, which is how the
  ground is drawn.
- **Astronomy.** Julian day → Greenwich sidereal time → local sidereal time; J2000 star vectors
  are precessed to date and rotated into the horizon frame in one 3×3 matrix per frame. Planets
  use the JPL approximate elements (valid 1800–2050); the Moon uses Schlyter's series with the main
  perturbation terms and a topocentric correction. Checked against JPL DE440 via Skyfield:
  planets within 0.3°, Moon within 0.05°, which is well below phone-compass error.
- **Aurora.** Chance is estimated from the current and forecast Kp and the observer's geomagnetic
  latitude (centered dipole), following NOAA's guidance that the auroral oval edge sits near
  66° − 2·Kp geomagnetic latitude with glow visible a few degrees farther south. Medora is at about
  55° geomagnetic, so aurora becomes likely around Kp 5. This is an estimate, not a NOAA forecast,
  and it assumes clear, dark skies.
- **Figures.** Each illustration carries three star anchors; every frame the three stars are projected and an affine fit places the drawing (the same method Stellarium uses). Images are additive-blended so their black backgrounds vanish, loaded lazily, and tinted red in red mode. `tools/build_data.py` copies them into `art/` at build time from a pinned commit of [stellarium-skycultures](https://github.com/Stellarium/stellarium-skycultures).
- **See-through.** Turns on the rear camera behind a transparent chart. Phone cameras are rectilinear and the chart is stereographic, so the match is close, not exact; pinch to fit. The stream never leaves the device and stops when the sky closes.
- **Dark sky.** The sky field is darker than the brand Night Sky; UI chrome uses Night Sky, Gray
  Sky, and Sand. Red mode swaps every color for dim reds, including the canvas. The extra-dimming
  slider overlays black. The screen stays awake while the sky is open (Wake Lock API).
- **Preferences** (layers, red mode, dimming, location, compass offset) are kept in
  `localStorage` under `trpl.stargazer.v1`.

## Editing the content

Nothing in the stories or events requires touching the widget code. The readable sources are
plain JSON; `tools/build_content.py` assembles them into `stargazer-content.js` at build time.

- `content/western.json` — one paragraph per constellation, keyed by IAU abbreviation.
- `indigenous_star_knowledge.json` — the research file: one entry per Native star figure or story
  with `culture`, `name`, `translation`, `western`, `hip` (Hipparcos numbers of the stars to mark),
  `story`, `sensitivity`, `confidence`, `sources`, and reviewer `notes`; its `framing` paragraph is
  shown at the top of the Stories panel and under each story. The `excluded` list records what was
  deliberately left out and why, and `reviewer_checklist` is the ask for tribal partners.
- `content/figures.json` — how each entry is drawn: `label` (short name beside the figure), `con`
  (constellations whose panel lists the story), `fig` (`ring`, `path`, `cloud`, or `none`), `body`
  (`moon`, `sun`, `venus`, `milkyway`), `hold: true` to keep an entry out of the app until it has
  been reviewed (three MHA Nation entries ship on hold), and the figure artwork: `art` (images in
  `art-native/`, each pinned to three stars by `[x, y, HIP]` anchors, exactly like the Western
  figures) or `sketch` (an SVG path in a local frame, 10 units per degree). The `art-native/`
  images were generated for this project from the published descriptions in the same style as the
  Stellarium figures. The human figures (Seven Girls, the stretcher and mourners, the Wintermaker)
  were prompted from period photographs and museum descriptions of 1860s–1890s Lakota and Ojibwe
  dress (two-hide and wool dresses with beaded or dentalium yokes, braids; blanket-wrapped mourners
  with hair cut short; point-blanket capote, sash, fur cap, bandolier bag) and avoid feathers,
  headdresses, and face paint; faces are turned away or plain. They are interpretive placeholders,
  labeled as such in the app, and are meant to be replaced by commissioned work from Native artists.
- `content/showers.json` — the annual meteor showers (IMO working list).
- `content/events.json` — dated sky events; `visibleFromMedora` may be `true`, `false`, or
  `"partial"`. Add entries as the calendar rolls forward; the panel lists everything from today on.

`stargazer-data.js` is generated by `tools/build_data.py` from the d3-celestial data files at a
pinned commit (stars to magnitude 6, constellation lines and boundaries, Milky Way contours sampled
into a point cloud).

The widget itself is built from `src/*.js` by `build.py`, which also runs the content build and
inlines `assets/wordmark.svg`. The three built files (`stargazer.js`, `stargazer-content.js`,
`stargazer-data.js`) are produced by the deploy workflow and are not committed. To preview locally:

```
pip install numpy
python3 tools/build_data.py && python3 build.py
python3 -m http.server 8000     # then open http://localhost:8000/
```

## Guided tours

A guide opens **`/guide/`** on their own phone or tablet. The page shows a five-letter tour code,
how many guests have joined, a list of everything worth pointing at right now (Moon and planets,
Native figures, constellations, bright stars and deep-sky showpieces, active meteor showers —
highest first, refreshed each minute), and controls for what the guests see. Guests tap
*Join a tour* on the Stargazer card, enter the code (or open
`https://stargazer.labs.trlibrary.com/?tour=CODE`), and can join at any point while the code is
open. Tapping an item on the guide's list opens an interpretive screen — the story, the sources,
the origin, notes for the guide, and tips for telling it — with **Point everyone here** (the orange
arrow on every guest's screen), **Show the card on their screens**, and a short message box.
Pointing at a Native figure switches the guests' sky to *Lakota & Native* automatically; pointing at
a Western constellation switches to *Greek & Roman*. The guide can also set the sky and layers
directly, and *Free look* clears the arrow and card. A live preview on the guide's page shows a
guest's screen turned toward whatever is being pointed at. Small figures zoom themselves: once a
guest has followed the arrow and held the target near the center for a second, the view eases in
to frame it (the Pleiades, the Turtle) and eases back out when the pointing ends; the same happens
for "Point me to it" inside the app.

It runs the same way as the Quiz project's live mode: the guide's browser holds the code as a
PeerJS id and each guest connects to it directly over WebRTC. PeerJS's public broker only
introduces the browsers; nothing about the tour passes through a server, and the ~100 KB library
loads only when a tour is started or joined. If the broker is unreachable, guests see a plain
message and the sky still works on its own. A guide's phone can comfortably hold a group of
twenty or thirty; for larger events, self-host `peerjs-server` and point both ends at it.

## A note on Indigenous star knowledge

The Native entries come only from published sources: Goodman's *Lakota Star Knowledge* (Sinte
Gleska University), the Native Skywatchers star maps (Annette S. Lee, Jim Rock, William Wilson,
Carl Gawboy), South Dakota Public Broadcasting and National Park Service material by Craig Howe,
and the early ethnographies of Dorsey, Lowie, and Maximilian for the Arikara, Hidatsa, and Mandan.
Every story carries its citations (the app itself carries no review labels; review is handled
by the team, not the reader). Items that
are ceremonial, contested, or family-held were left out on purpose (the excluded list is in the
research file), and the three MHA Nation entries whose own notes call for review before any use are
held out of the app until that review happens. Before this content is promoted beyond the Labs
subdomain, the Standing Rock Sioux Tribe, the MHA Nation's cultural office, Nueta Hidatsa Sahnish
College, and the Turtle Mountain Band should be invited to review, correct, and expand it. Lakota
orthography with diacritics follows the standard used at Standing Rock and in the Lakota Language
Bowl materials; a fluent speaker should confirm the reconstructed spellings flagged in the research
notes.

No Roosevelt quotations appear in the widget.

## Hosting on GitHub Pages

This repo deploys to GitHub Pages via GitHub Actions on every push to `main`
(`.github/workflows/deploy.yml`), served at the custom domain in `CNAME`:
**https://stargazer.labs.trlibrary.com**. One-time setup: move `tools/deploy.yml` to
`.github/workflows/deploy.yml` (the API integration that scaffolded the repo cannot write to that
folder), set the Pages source to *GitHub Actions* in the repo settings, and add the `stargazer`
CNAME record at the DNS host pointing to `theodore-roosevelt-presidential-library.github.io`.
Motion sensors require https, which Pages provides.

## Credits

Star catalog, constellation lines, boundaries, and Milky Way contours: [d3-celestial](https://github.com/ofrohn/d3-celestial)
by Olaf Frohn (BSD-3). Constellation illustrations: Johan Meuris for [Stellarium](https://stellarium.org), released under the [Free Art License](https://artlibre.org/licence/lal/en/), used unmodified with attribution; anchor data CC BY-SA. Planetary elements: JPL Solar System Dynamics. Meteor showers: International
Meteor Organization. Eclipses: NASA GSFC and Fred Espenak's EclipseWise. Space weather: NOAA Space
Weather Prediction Center.
