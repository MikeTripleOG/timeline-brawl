#!/usr/bin/env python3
"""Import Game Dev's art drops from /workspace/timeline-brawl-art/ into assets/art/ and regenerate js/art.js.
Drop-in names it understands (any of .jpg/.jpeg/.png/.webp):
  title_key*.*           -> title / loading key art, split into full/scene/logo/strip layers (assets/art/title_*.webp)
  crest_<kingdom>.*      -> one crest (eldenvale, northgard, solenthia, vellorien, drakonia, invader)
  banner_<kingdom>.*     -> one tall banner for the faction pickers
  kingdom_crests.jpg     -> the five-banner sheet (cropped automatically when no single crest file exists)
  horde_crest.jpg        -> the Horde banner (shield cropped into crest_invader)
  oathbound_unit.jpg     -> the Oathbound unit card (also unit_<name>.*)
Usage: python3 tools/import_art.py [srcdir]"""
import sys, os, glob, math, json
from PIL import Image, ImageDraw
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/timeline-brawl-art'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'assets', 'art')
IDS = ['eldenvale', 'northgard', 'solenthia', 'vellorien', 'drakonia', 'invader']
os.makedirs(OUT, exist_ok=True)
def find(stem):
    for ext in ('webp', 'png', 'jpg', 'jpeg'):
        f = glob.glob(os.path.join(SRC, stem + '.' + ext)) or glob.glob(os.path.join(SRC, stem + '*.' + ext))
        if f: return f[0]
def shield_mask(w, h):
    W, H = w * 4, h * 4; m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m); L, R = 0.055, 0.945
    pts = [(L * W, 0.085 * H)] + [((L + (R - L) * t / 20) * W, (0.085 - 0.075 * math.sin(t / 20 * math.pi)) * H) for t in range(1, 20)] + [(R * W, 0.085 * H), (R * W, 0.5 * H)]
    pts += [((R - (R - 0.5) * (t / 20) ** 1.4) * W, (0.5 + 0.49 * math.sin(t / 20 * math.pi / 2)) * H) for t in range(1, 21)]
    pts += [((L + (0.5 - L) * (t / 20) ** 1.4) * W, (0.5 + 0.49 * math.sin(t / 20 * math.pi / 2)) * H) for t in range(19, 0, -1)] + [(L * W, 0.5 * H)]
    d.polygon(pts, fill=255); return m.resize((w, h), Image.LANCZOS)
art = {'title': None, 'crest': {}, 'banner': {}, 'unit': {}}
# Title key art (16:9, title + tagline painted top-left, empty parchment strip along the bottom).
# Split into web-optimised layers so one painting fits portrait and landscape phones:
#   title_key.webp    full painting, 1280 wide. js/ui.js crops it live: landscape keeps the painted title, portrait shows
#                     only the battle below the tagline, centred on the clash (TITLE_FOCUS_X)
#   title_logo.webp   the painted title + tagline with feathered alpha edges (portrait: shown on its own at the top)
#   title_strip.webp  the empty parchment strip ("Tap to begin" is set on it in HTML)
# Fractions are of the painting's height/width; override with TITLE_* env vars if Game Dev repaints the layout.
f = find('title_key')
if f:
    im = Image.open(f).convert('RGB')
    if im.width > 1280: im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
    W, H = im.size; fr = lambda k, d: float(os.environ.get(k, d))
    STRIP, SCENE_TOP, LOGO = fr('TITLE_STRIP_TOP', 0.88), fr('TITLE_SCENE_TOP', 0.30), (fr('TITLE_LOGO_X0', 0.06), fr('TITLE_LOGO_X1', 0.565), fr('TITLE_LOGO_Y1', 0.33))
    im.save(os.path.join(OUT, 'title_key.webp'), quality=78, method=6)
    im.crop((0, round(H * STRIP), W, H)).save(os.path.join(OUT, 'title_strip.webp'), quality=78, method=6)
    lg = im.crop((round(W * LOGO[0]), 0, round(W * LOGO[1]), round(H * LOGO[2]))).convert('RGBA'); lw, lh = lg.size
    a = Image.new('L', (lw, lh), 255); px = a.load(); fx, fy = lw * 0.08, lh * 0.16
    for y in range(lh):
        for x in range(lw):
            k = min(1, x / fx, (lw - 1 - x) / fx, (lh - 1 - y) / fy); px[x, y] = round(255 * max(0, k) ** 0.8)
    lg.putalpha(a); lg.save(os.path.join(OUT, 'title_logo.webp'), quality=82, method=6)
    for old in ('title_key.jpg', 'title_scene.webp'):
        if os.path.exists(os.path.join(OUT, old)): os.remove(os.path.join(OUT, old))
    art['title'] = 'assets/art/title_key.webp'
    art['titleLayers'] = {'logo': 'assets/art/title_logo.webp', 'strip': 'assets/art/title_strip.webp', 'w': W, 'h': H, 'stripTop': STRIP, 'sceneTop': SCENE_TOP, 'focusX': fr('TITLE_FOCUS_X', 0.47), 'logoBox': [LOGO[0], LOGO[1], LOGO[2]], 'logoAlt': 'Timeline Brawl: Five Crowns. One Horde.'}
sheet = find('kingdom_crests')
for i, k in enumerate(IDS):
    f = find('crest_' + k)
    if f:
        im = Image.open(f).convert('RGBA'); im.thumbnail((128, 256)); im.save(os.path.join(OUT, 'crest_%s.webp' % k), quality=85, method=6); art['crest'][k] = 'assets/art/crest_%s.webp' % k
    elif sheet and i < 5: # sheet: 5 banners evenly spaced across a 16:9 image
        src = Image.open(sheet).convert('RGB'); S = src.size[0] / 1024; cx = [121, 316, 511, 706, 902][i]
        im = src.crop(tuple(int(v * S) for v in (cx - 90, 125, cx + 90, 383))).convert('RGBA'); im.putalpha(shield_mask(*im.size))
        im = im.resize((128, int(128 * im.size[1] / im.size[0])), Image.LANCZOS); im.save(os.path.join(OUT, 'crest_%s.webp' % k), quality=85, method=6); art['crest'][k] = 'assets/art/crest_%s.webp' % k
        b = src.crop(tuple(int(v * S) for v in (cx - 92, 15, cx + 92, 545))); b = b.resize((180, int(180 * b.size[1] / b.size[0])), Image.LANCZOS); b.save(os.path.join(OUT, 'banner_%s.jpg' % k), quality=80); art['banner'][k] = 'assets/art/banner_%s.jpg' % k
    elif k == 'invader' and find('horde_crest'): # single Horde banner sheet (1024x1024): shield at fractional bounds
        src = Image.open(find('horde_crest')).convert('RGB'); X, Y = src.size
        im = src.crop((int(X * 0.335), int(Y * 0.316), int(X * 0.663), int(Y * 0.755))).convert('RGBA'); im.putalpha(shield_mask(*im.size))
        im = im.resize((128, int(128 * im.size[1] / im.size[0])), Image.LANCZOS); im.save(os.path.join(OUT, 'crest_invader.webp'), quality=85, method=6); art['crest'][k] = 'assets/art/crest_invader.webp'
        b = src.crop((int(X * 0.17), int(Y * 0.01), int(X * 0.83), int(Y * 0.99))); b = b.resize((180, int(180 * b.size[1] / b.size[0])), Image.LANCZOS); b.save(os.path.join(OUT, 'banner_invader.jpg'), quality=80); art['banner'][k] = 'assets/art/banner_invader.jpg'
    f = find('banner_' + k)
    if f: b = Image.open(f).convert('RGB'); b.thumbnail((180, 520)); b.save(os.path.join(OUT, 'banner_%s.jpg' % k), quality=80); art['banner'][k] = 'assets/art/banner_%s.jpg' % k
for u in ('oathbound',): # unit cards: <name>_unit.* or unit_<name>.* -> a 300x400 card plus a small face crop
    f = find(u + '_unit') or find('unit_' + u)
    if f:
        im = Image.open(f).convert('RGB'); X, Y = im.size; im.resize((300, int(300 * Y / X)), Image.LANCZOS).save(os.path.join(OUT, 'unit_%s.jpg' % u), quality=80)
        fc = im.crop((int(X * 0.22), int(Y * 0.27), int(X * 0.78), int(Y * 0.62))); fc.resize((160, int(160 * fc.size[1] / fc.size[0])), Image.LANCZOS).save(os.path.join(OUT, 'unit_%s_face.jpg' % u), quality=80)
        art['unit'][u] = {'card': 'assets/art/unit_%s.jpg' % u, 'face': 'assets/art/unit_%s_face.jpg' % u}
with open(os.path.join(ROOT, 'js', 'art.js'), 'w') as fh:
    fh.write('/* generated by tools/import_art.py: art that has landed in assets/art (missing entries use the vector placeholders) */\n')
    fh.write('(function (G) { const HB = G.HB || (G.HB = {}); HB.ART = ' + json.dumps(art) + '; })(typeof window !== "undefined" ? window : globalThis);\n')
print(json.dumps(art, indent=1))
