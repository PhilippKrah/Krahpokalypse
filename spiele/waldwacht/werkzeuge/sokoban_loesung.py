# Kürzeste Schub-Folge je Rätselraum der Kristallgruft (mit Abgründen), als JSON – z. B. für einen Testlauf, der die Lösung nachspielt.
# Aufruf: python3 sokoban_loesung.py [ausgabe.json]   (dauert einige Minuten)
import os, sys, json
from collections import deque
HIER = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HIER)
AUSGABE = sys.argv[1] if len(sys.argv) > 1 else 'sokoban_loesungen.json'
sys.argv = ['x']
exec(open(os.path.join(HIER, 'kristallgruft.py'), encoding='utf-8').read().split("if '--sokoban' in sys.argv")[0])
D = {(1, 0): 'rechts', (-1, 0): 'links', (0, 1): 'runter', (0, -1): 'hoch'}
def loese(raum, start, ziel, ctx, max_z=600000):
    fest = blockiert(raum, ctx, set(), {tuple(o['feld']) for o in raum.objekte if o['objekt'] == 'block'})
    loch = {(c, r) for r in range(H) for c in range(W) if raum.k[r][c] == '~'}
    b0 = frozenset(tuple(o['feld']) for o in raum.objekte if o['objekt'] == 'block')
    def reg(p, bl, gef): return flut(p, ((fest - gef) | bl) - {p})
    q = deque([(start, frozenset(), b0)]); vor = {}; fertig = set()
    while q:
        p, gef, bl = q.popleft()
        rg = reg(p, bl, gef); key = (min(rg), gef, bl)
        if key in fertig: continue
        fertig.add(key); vor.setdefault(key, None)
        if ziel(bl, gef):
            zug = []
            while vor[key]: key, z = vor[key]; zug.append(z)
            return zug[::-1]
        for b in bl:
            for (dc, dr), name in D.items():
                steh, hin = (b[0] - dc, b[1] - dr), (b[0] + dc, b[1] + dr)
                if steh not in rg or not innen(*hin) or hin in bl: continue
                if hin in fest and hin not in gef and hin not in loch: continue
                if hin in loch and hin not in gef: n = (b, gef | {hin}, bl - {b})
                else: n = (b, gef, (bl - {b}) | {hin})
                nk = (min(reg(n[0], n[2], n[1])), n[1], n[2])
                if nk not in vor: vor[nk] = (key, {'block': b, 'steh': steh, 'richtung': name}); q.append(n)
                if len(vor) > max_z: return None
    return None
ctx = {'sig': set(), 'krist': {K1: 0, K2: 0}, 'items': set(), 'geraeumt': True}
platten = lambda rid: {tuple(o['feld']) for o in R[rid].objekte if o['objekt'] == 'platte' and o.get('wer') == 'block'}
aufgaben = {
    'gebeinkammer': ((10, 11), lambda bl, gef: platten('gebeinkammer') <= bl),
    'stauwehr': ((13, 11), lambda bl, gef: platten('stauwehr') <= bl),
    'westturm': ((7, 11), lambda bl, gef: platten('westturm') <= bl),
    'brunnenkammer': ((18, 7), lambda bl, gef: any({(9, y), (8, y)} <= gef for y in range(2, 14))),
    'schleusentor': ((2, 10), lambda bl, gef: {(10, 7), (10, 8)} <= gef or {(10, 5), (10, 4)} <= gef or {(11, 6), (12, 6)} <= gef),
    'glockenkammer': ((6, 12), lambda bl, gef: (3, 12) in bl),
}
aus = {}
for rid, (start, ziel) in aufgaben.items():
    z = loese(R[rid], start, ziel, ctx)
    aus[rid] = {'start': start, 'zuege': z}
    print(rid, len(z) if z else None, flush=True)
json.dump(aus, open(AUSGABE, 'w'), default=list)
print('geschrieben:', AUSGABE)
