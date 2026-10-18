# Rebuilds the self-hosted Noto fonts in public/fonts (OFL, see OFL.txt there).
# Downloads the upstream files into a cache dir, sets variable CJK fonts to
# Regular (400), subsets them, and pads glyph data so fontkit can subset again.
# Needs Python 3 with fonttools (pip install fonttools brotli).
# Usage: python scripts/build-fonts.py <cache dir> [output names to build, default all]
import os
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

CACHE = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'fonts')
NOTO = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/'
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'


def codec_chars(codec, lo1, hi1, lo2, hi2):
    out = set()
    for a in range(lo1, hi1 + 1):
        for b in range(lo2, hi2 + 1):
            try:
                out.update(ord(c) for c in bytes([a, b]).decode(codec))
            except UnicodeDecodeError:
                pass
    return out


def rng(a, b):
    return set(range(a, b))


BASIC = rng(0x20, 0x7F) | rng(0xA0, 0x180) | rng(0x2000, 0x2070) | rng(0x20A0, 0x20C0)
GREEK_CYR = rng(0x370, 0x530)
CJK_COMMON = BASIC | GREEK_CYR | rng(0x3000, 0x3040) | rng(0xFF00, 0xFFF0)
HAN = lambda c: 0x4E00 <= c <= 0x9FFF or 0xF900 <= c <= 0xFAFF

# out name: (source url, cache name, code points or None for the whole font)
FONTS = {
    'NotoSans-Regular.ttf': (
        NOTO + 'NotoSans/unhinted/ttf/NotoSans-Regular.ttf', 'NotoSans-Regular.ttf',
        rng(0x20, 0x370) | GREEK_CYR | rng(0x1E00, 0x1F00) | rng(0x2000, 0x2070) | rng(0x20A0, 0x20D0)
        | rng(0x2100, 0x2300) | rng(0x25A0, 0x2600),
    ),
    'NotoSansArabic-Regular.ttf': (NOTO + 'NotoSansArabic/unhinted/ttf/NotoSansArabic-Regular.ttf', 'NotoSansArabic-Regular.ttf', None),
    'NotoSansHebrew-Regular.ttf': (NOTO + 'NotoSansHebrew/unhinted/ttf/NotoSansHebrew-Regular.ttf', 'NotoSansHebrew-Regular.ttf', None),
    'NotoSansDevanagari-Regular.ttf': (NOTO + 'NotoSansDevanagari/unhinted/ttf/NotoSansDevanagari-Regular.ttf', 'NotoSansDevanagari-Regular.ttf', None),
    # GB2312
    'NotoSansSC-Regular.ttf': (GF + 'notosanssc/NotoSansSC%5Bwght%5D.ttf', 'NotoSansSC-var.ttf', CJK_COMMON | codec_chars('gb2312', 0xA1, 0xF7, 0xA1, 0xFE)),
    # JIS X 0208 (kana, level 1 and 2 kanji)
    'NotoSansJP-Regular.ttf': (GF + 'notosansjp/NotoSansJP%5Bwght%5D.ttf', 'NotoSansJP-var.ttf', CJK_COMMON | codec_chars('euc_jp', 0xA1, 0xFE, 0xA1, 0xFE) | rng(0x3040, 0x3100)),
    # Big5 level 1 (common Traditional Chinese)
    'NotoSansTC-Regular.ttf': (GF + 'notosanstc/NotoSansTC%5Bwght%5D.ttf', 'NotoSansTC-var.ttf', CJK_COMMON | codec_chars('big5', 0xA4, 0xC6, 0x40, 0xFE)),
    'NotoSansBengali-Regular.ttf': (NOTO + 'NotoSansBengali/unhinted/ttf/NotoSansBengali-Regular.ttf', 'NotoSansBengali-Regular.ttf', None),
    'NotoSansTamil-Regular.ttf': (NOTO + 'NotoSansTamil/unhinted/ttf/NotoSansTamil-Regular.ttf', 'NotoSansTamil-Regular.ttf', None),
    'NotoSansThai-Regular.ttf': (NOTO + 'NotoSansThai/unhinted/ttf/NotoSansThai-Regular.ttf', 'NotoSansThai-Regular.ttf', None),
    # arrows, technical, enclosed, misc symbols, dingbats (check marks, stars)
    'NotoSansSymbols2-Regular.ttf': (
        NOTO + 'NotoSansSymbols2/unhinted/ttf/NotoSansSymbols2-Regular.ttf', 'NotoSansSymbols2-Regular.ttf',
        rng(0x2190, 0x2200) | rng(0x2300, 0x2500) | rng(0x25A0, 0x27C0) | rng(0x2B00, 0x2C00),
    ),
    # KS X 1001 Hangul and jamo, no hanja
    'NotoSansKR-Regular.ttf': (
        GF + 'notosanskr/NotoSansKR%5Bwght%5D.ttf', 'NotoSansKR-var.ttf',
        CJK_COMMON | {c for c in codec_chars('euc_kr', 0xA1, 0xFE, 0xA1, 0xFE) if not HAN(c)} | rng(0x3130, 0x3190),
    ),
}

os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
only = set(sys.argv[2:])
for out_name, (url, cache_name, chars) in FONTS.items():
    if only and out_name not in only:
        continue
    src = os.path.join(CACHE, cache_name)
    if not os.path.exists(src):
        urllib.request.urlretrieve(url, src)
    font = TTFont(src)
    if 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wght': 400}, updateFontNames=True)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.hinting = False
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    cmap = font.getBestCmap()
    sub.populate(unicodes=sorted(c for c in (chars if chars is not None else cmap.keys()) if c in cmap))
    sub.subset(font)
    # fontkit's subsetter copies glyph data as is and breaks on odd lengths
    font['glyf'].padding = 4
    dest = os.path.join(OUT, out_name)
    font.save(dest)
    print(out_name, os.path.getsize(dest), 'bytes')

ofl = os.path.join(OUT, 'OFL.txt')
if not os.path.exists(ofl):
    urllib.request.urlretrieve(GF + 'notosans/OFL.txt', ofl)
