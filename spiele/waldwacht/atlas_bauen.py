# Schneidet die Grafiken, die Waldwacht braucht, aus dem Atlas des Gutsverwalters
# und schreibt sie als kleinen eigenen Atlas in spiele/waldwacht/index.html
# (Zeilen "const FR=" und "const ATLAS_SRC="). Nur nötig, wenn sich die Auswahl
# oder die Gutsverwalter-Grafik ändert; das Spiel selbst braucht kein Skript.
#
#   python3 spiele/waldwacht/atlas_bauen.py spiele/foerster/index.html spiele/waldwacht/index.html
#
# Braucht Pillow (pip install pillow).
import base64, io, json, re, sys
from PIL import Image

quelle, ziel = sys.argv[1:3]
html = open(quelle, encoding='utf-8').read()
FR = json.loads(re.search(r'const FR=(\{.*?\});', html).group(1))
b64 = re.search(r"atlas\.src='data:image/png;base64,([^']*)'", html).group(1)
atlas = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')

WAHL = {  # eigener Name: Name im Gutsverwalter-Atlas
    **{f'held_{i}': f'01-verwalter_{i}' for i in range(9)},   # 0-2 unten, 3-5 rechts, 6-8 oben
    'fuchs_0': '01-tiere_2', 'fuchs_1': '01-tiere_3',
    'gras_0': '01-boden_0', 'gras_1': '01-boden_1', 'gras_2': '01-boden_2', 'gras_3': '01-boden_5',
    'buesche': '01-deko_1', 'pilz': '01-deko_3', 'blumen': '01-deko_4',
    'stein': '01-deko_5', 'busch': '01-deko_8', 'beerenbusch': '01-deko_2',
    'stumpf': '01-objekte_1', 'holzstapel': '01-objekte_5',
    'stamm_0': '01-totholz_0', 'stamm_1': '01-totholz_1', 'stamm_2': '01-totholz_2',
}

BREITE = 32 * 8
x = y = zeilenhoehe = 0
rahmen, teile = {}, []
for name, alt in WAHL.items():
    sx, sy, w, h = FR[alt]
    if x + w > BREITE:
        x, y, zeilenhoehe = 0, y + zeilenhoehe + 1, 0
    teile.append((atlas.crop((sx, sy, sx + w, sy + h)), x, y))
    rahmen[name] = [x, y, w, h]
    x += w + 1
    zeilenhoehe = max(zeilenhoehe, h)

bild = Image.new('RGBA', (BREITE, y + zeilenhoehe))
for teil, px, py in teile:
    bild.paste(teil, (px, py))
puffer = io.BytesIO()
bild.save(puffer, format='PNG', optimize=True)
daten = base64.b64encode(puffer.getvalue()).decode()

seite = open(ziel, encoding='utf-8').read()
seite = re.sub(r'^const FR=.*$', 'const FR=' + json.dumps(rahmen, separators=(',', ':')) + ';', seite, count=1, flags=re.M)
seite = re.sub(r"^const ATLAS_SRC=.*$", "const ATLAS_SRC='data:image/png;base64," + daten + "';", seite, count=1, flags=re.M)
open(ziel, 'w', encoding='utf-8').write(seite)
print(f'{len(rahmen)} Bilder, Atlas {bild.size[0]}x{bild.size[1]}, {len(puffer.getvalue())} Bytes')
