# Schneller Sokoban-Löser für kleine Gitter (feste Wände, Blöcke, Ziele; ohne Abgründe – die kann gruft_kern.sokoban)
from collections import deque
def loese(waende, bloecke, ziele, start, breite, hoehe, max_z=200000):
    """waende: set (c,r); bloecke: tuple; ziele: set; start (c,r). Gibt (schuebe, zustaende) oder (None, zustaende)."""
    frei = lambda p: 0 <= p[0] < breite and 0 <= p[1] < hoehe and p not in waende
    D = ((1, 0), (-1, 0), (0, 1), (0, -1))
    # tote Ecken: Felder (kein Ziel), in denen ein Block nie wieder herauskommt
    tot = set()
    for c in range(breite):
        for r in range(hoehe):
            p = (c, r)
            if not frei(p) or p in ziele: continue
            w = [not frei((c + a, r + b)) for a, b in D]
            if (w[0] or w[1]) and (w[2] or w[3]): tot.add(p)
    def region(p, bl):
        da = {p}; q = [p]
        while q:
            x = q.pop()
            for a, b in D:
                n = (x[0] + a, x[1] + b)
                if n not in da and frei(n) and n not in bl: da.add(n); q.append(n)
        return da
    b0 = frozenset(bloecke)
    q = deque([(start, b0, 0)]); gesehen = set()
    while q:
        p, bl, n = q.popleft()
        reg = region(p, bl)
        key = (min(reg), bl)
        if key in gesehen: continue
        gesehen.add(key)
        if bl <= ziele: return n, len(gesehen)
        if len(gesehen) > max_z: return None, len(gesehen)
        for b in bl:
            for a, c in D:
                steh, hin = (b[0] - a, b[1] - c), (b[0] + a, b[1] + c)
                if steh in reg and frei(hin) and hin not in bl and hin not in tot:
                    q.append((b, (bl - {b}) | {hin}, n + 1))
    return None, len(gesehen)
