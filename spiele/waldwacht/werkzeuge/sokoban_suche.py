# Sucht zufällige Schieberätsel (Breite × Höhe, Anzahl Blöcke) und zeigt die mit den meisten nötigen Schüben.
# Aufruf: python3 sokoban_suche.py <breite> <hoehe> <bloecke> <versuche> <wanddichte>   z. B. 8 6 3 3000 0.25
# Ausgabe: # Wand, B Block, * Platte; unten Mitte ist der Eingang.
import os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sokoban import loese
w, h, nbl, anz, dichte = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
best = []
for seed in range(anz):
    rnd = random.Random(seed * 7919 + w * 31 + h)
    # Gitter w×h, Rand Wand, Eingang unten Mitte (Start außerhalb)
    B, Ho = w + 2, h + 3
    waende = set()
    for c in range(B):
        for r in range(Ho - 1):
            if r == 0 or c in (0, B - 1) or r == Ho - 2: waende.add((c, r))
    ein = (B // 2, Ho - 2); waende.discard(ein); start = (ein[0], Ho - 1)
    zellen = [(c, r) for r in range(1, Ho - 2) for c in range(1, B - 1)]
    for z in zellen:
        if rnd.random() < dichte and z != (ein[0], ein[1] - 1): waende.add(z)
    frei = [z for z in zellen if z not in waende and z != (ein[0], ein[1] - 1)]
    if len(frei) < 2 * nbl + 4: continue
    rnd.shuffle(frei)
    bl, zi = frei[:nbl], set(frei[nbl:2 * nbl])
    # Zeile Ho-1 unter dem Eingang ist der Gang, von dem aus der Held startet
    n, z = loese(waende, bl, zi, start, B, Ho, 150000)
    if n: best.append((n, z, seed, waende, bl, zi, B, Ho))
best.sort(key=lambda x: (-x[0], -x[1]))
for n, z, seed, waende, bl, zi, B, Ho in best[:4]:
    print(n, 'Schübe', z, 'Zustände', 'seed', seed)
    for r in range(Ho):
        print(''.join('#' if (c, r) in waende else 'B' if (c, r) in bl else '*' if (c, r) in zi else '.' for c in range(B)))
