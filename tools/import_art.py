#!/usr/bin/env python3
"""Import Game Dev's art drops from /workspace/timeline-brawl-art/ into assets/art/ and regenerate js/art.js.
Drop-in names it understands (any of .jpg/.jpeg/.png/.webp):
  title_key_art_portrait*.* -> portrait title / loading key art (assets/art/title_portrait.webp)
  title_key_art*.*       -> landscape title / loading key art, largest file wins (assets/art/title_landscape.webp)
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
# Title key art: a landscape (16:9) and a portrait (9:16) painting, each with the title + tagline painted in and an
# empty parchment strip along the bottom. index.html serves one per orientation through a <picture> (portrait when the
# screen's aspect ratio is under 1); js/ui.js scales it so the painted title and the strip stay on screen and sets
# "Tap to begin" on the painting's own strip. Boxes are fractions of each painting; override with TITLE_<P|L>_* env vars.
#   title_key_art_portrait*.*  -> title_portrait.webp (max 1080 wide) + title_portrait_blur.webp (tiny placeholder)
#   title_key_art*.* (largest) -> title_landscape.webp (max 1920 wide) + title_landscape_blur.webp
TITLE_BOX = {'portrait': {'title': [0.072, 0.938, 0.024, 0.19], 'stripTop': 0.873, 'focusX': 0.5, 'maxW': 1080},
             'landscape': {'title': [0.078, 0.542, 0.035, 0.292], 'stripTop': 0.873, 'focusX': 0.45, 'maxW': 1920}}
def title_variant(f, kind, budget=260_000):
    im = Image.open(f).convert('RGB'); cfg = TITLE_BOX[kind]; ev = lambda k, d: float(os.environ.get('TITLE_%s_%s' % (kind[0].upper(), k), d))
    if im.width > cfg['maxW']: im = im.resize((cfg['maxW'], round(im.height * cfg['maxW'] / im.width)), Image.LANCZOS)
    out = os.path.join(OUT, 'title_%s.webp' % kind)
    for q in (74, 68, 62, 56): # keep each painting under ~260 KB
        im.save(out, quality=q, method=6)
        if os.path.getsize(out) <= budget: break
    tiny = im.copy(); tiny.thumbnail((48, 48), Image.LANCZOS); tiny.save(os.path.join(OUT, 'title_%s_blur.webp' % kind), quality=60)
    t = cfg['title']
    return {'src': 'assets/art/title_%s.webp' % kind, 'blur': 'assets/art/title_%s_blur.webp' % kind, 'w': im.width, 'h': im.height,
            'title': [ev('X0', t[0]), ev('X1', t[1]), ev('Y0', t[2]), ev('Y1', t[3])], 'stripTop': ev('STRIP', cfg['stripTop']), 'focusX': ev('FOCUS', cfg['focusX'])}
srcs = sorted(set(sum((glob.glob(os.path.join(SRC, 'title_key*.' + e)) for e in ('webp', 'png', 'jpg', 'jpeg')), [])))
por = [f for f in srcs if 'portrait' in os.path.basename(f)]; lan = [f for f in srcs if f not in por]
lan.sort(key=lambda f: Image.open(f).width, reverse=True)
if lan or por:
    for old in ('title_key.jpg', 'title_key.webp', 'title_scene.webp', 'title_logo.webp', 'title_strip.webp'):
        if os.path.exists(os.path.join(OUT, old)): os.remove(os.path.join(OUT, old))
    keys = {}
    if lan: keys['landscape'] = title_variant(lan[0], 'landscape')
    if por: keys['portrait'] = title_variant(por[0], 'portrait')
    art['title'] = (keys.get('landscape') or keys['portrait'])['src']
    art['titleArt'] = dict(keys, media='(max-aspect-ratio: 999/1000)', alt='Timeline Brawl: Five Crowns. One Horde.')
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
