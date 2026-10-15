# Bausteine für große Waldwacht-Dungeons (genutzt von kristallgruft.py): Räume aus ASCII-Karten, Löser über alle Zustände, Sokoban-Prüfung, Schreiben ins Spiel.
import json, sys
from collections import deque

W, H = 20, 15
SPALTE = {'1': 5, '': 9, '3': 13}
ZEILE = {'1': 3, '': 7, '3': 11}
GEGEN = {'n': 's', 's': 'n', 'w': 'o', 'o': 'w'}
RICHT = {'n': (0, -1), 's': (0, 1), 'w': (-1, 0), 'o': (1, 0)}
gegen = lambda d: GEGEN[d[0]] + d[1:]

def eingang(d):   # die beiden Felder innen vor der Tür
    s, nr = d[0], d[1:]
    if s == 'n': c = SPALTE[nr]; return [(c, 2), (c + 1, 2)]
    if s == 's': c = SPALTE[nr]; return [(c, 13), (c + 1, 13)]
    if s == 'w': r = ZEILE[nr]; return [(1, r), (1, r + 1)]
    r = ZEILE[nr]; return [(18, r), (18, r + 1)]

DEKOR = set('SEPOLb')
FEST_DEKOR = set('SEPOL')
K1, K2 = 'kristall', 'schleuse'
PFLOCKZEICHEN = {'x': (K1, 'blau'), 'y': (K1, 'orange'), 'r': (K2, 'rot'), 'g': (K2, 'gruen'), 'l': (K2, 'lila')}
KRISTALLZEICHEN = {'C': K1, 'K': K2}
FARBEN = {K1: ['blau', 'orange'], K2: ['rot', 'gruen', 'lila']}

class Raum:
    def __init__(self, rid, nr, titel, pos, karte, licht='hell', sperren=None, platten=None, truhen=None, fackeln=None):
        assert len(karte) == H and all(len(z) == W for z in karte), f'{rid}: Karte {len(karte)}×{[len(z) for z in karte]}'
        self.id, self.nr, self.titel, self.pos, self.licht = rid, nr, titel, pos, licht
        self.k = [list(z) for z in karte]
        self.objekte, self.gegner, self.tueren, self.extra, self.aktionen = [], [], {}, {}, []
        self.kampf = False
        sperren, platten, truhen, fackeln = sperren or {}, platten or {}, list(truhen or []), list(fackeln or [])
        for r in range(H):
            for c in range(W):
                ch = self.k[r][c]
                if ch in '#.~' or ch in DEKOR: continue
                self.k[r][c] = '.'
                if ch in PFLOCKZEICHEN: typ, f = PFLOCKZEICHEN[ch]; self.obj('pflock', c, r, kristalltyp=typ, farbe=f)
                elif ch in sperren: self.obj('pflock', c, r, oben_wenn=sperren[ch], farbe='weiss')
                elif ch in KRISTALLZEICHEN: self.obj('kristall', c, r, kristalltyp=KRISTALLZEICHEN[ch])
                elif ch == 'B': self.obj('block', c, r)
                elif ch == 'T': self.obj('truhe', c, r, **truhen.pop(0))
                elif ch == 'F': self.obj('fackel', c, r, **(fackeln.pop(0) if fackeln else {}))
                elif ch in platten: self.obj('platte', c, r, **platten[ch])
                else: raise ValueError(f'{rid}: unbekanntes Zeichen {ch!r} auf {c},{r}')
        assert not truhen, f'{rid}: zu viele Truhen-Angaben'

    def obj(self, art, c, r, **p): self.objekte.append({'objekt': art, 'feld': [c, r], **p}); return self
    def feind(self, art, c, r, **p): self.gegner.append({'gegner': art, 'feld': [c, r], **p}); return self
    def tuer(self, d, ziel, **p): self.tueren[d] = {'ziel': ziel, **p}; return self
    def aktion(self, **a): self.aktionen.append(a); return self   # req=[felder], wenn, lokal=[], glob=[], fuellen=[], weg=[], text

    def daten(self):
        d = {'nr': self.nr, 'titel': self.titel, 'licht': self.licht, 'pos': self.pos}
        if self.kampf: d['kampf'] = True
        d.update(self.extra)
        d['tueren'] = self.tueren
        d['karte'] = [''.join(z) for z in self.k]
        d['objekte'] = self.objekte
        d['gegner'] = self.gegner
        return d

# ---------------------------------------------------------------- Bedingungen
def gilt(b, ctx):
    if b is None: return True
    if isinstance(b, str):
        if b == 'geraeumt': return ctx['geraeumt']
        if b.startswith('hat:'): return b[4:] in ctx['items']
        if '=' in b: t, f = b.split('='); return FARBEN[t][ctx['krist'][t]] == f
        return b in ctx['sig']
    if 'alle' in b: return all(gilt(x, ctx) for x in b['alle'])
    if 'eine' in b: return any(gilt(x, ctx) for x in b['eine'])
    if 'nicht' in b: return not gilt(b['nicht'], ctx)
    raise ValueError(b)

NACHBARN = ((1, 0), (-1, 0), (0, 1), (0, -1))
innen = lambda c, r: 1 <= c <= 18 and 2 <= r <= 13

def blockiert(raum, ctx, gefuellt, weg):
    b = set()
    for r in range(H):
        for c in range(W):
            ch = raum.k[r][c]
            if ch == '#' or ch in FEST_DEKOR or (ch == '~' and (c, r) not in gefuellt): b.add((c, r))
    for o in raum.objekte:
        f = tuple(o['feld']); a = o['objekt']
        if f in weg: continue
        if a in ('truhe', 'kristall', 'block', 'fackel', 'schild'):
            if a == 'truhe' and not gilt(o.get('sichtbar_wenn'), ctx): continue
            b.add(f)
        elif a == 'pflock':
            oben = (FARBEN[o['kristalltyp']][ctx['krist'][o['kristalltyp']]] == o['farbe']) if 'kristalltyp' in o else gilt(o.get('oben_wenn'), ctx)
            if oben: b.add(f)
    return b

def flut(start, blk):
    da, q = {start}, [start]
    while q:
        c, r = q.pop()
        for dc, dr in NACHBARN:
            n = (c + dc, r + dr)
            if n not in da and innen(*n) and n not in blk: da.add(n); q.append(n)
    return da

def nah(feld, reg): return tuple(feld) in reg or any((feld[0] + a, feld[1] + b) in reg for a, b in NACHBARN)

class Loeser:
    """Durchsucht alle Zustände (Ort, Kristallfarben, Signale, Gegenstände, Schlüssel, geöffnete Türen, Truhen).
    Mengen als Bitmasken, damit auch große Zustandsräume in den Speicher passen."""
    def __init__(self, raeume, start, krist0, ziel='sieg', max_zustaende=6000000):
        self.R, self.start, self.krist0, self.ziel, self.maxz = raeume, start, krist0, ziel, max_zustaende
        self.cache = {}; self.bits = {}; self.namen = []
        self.rids = list(raeume); self.ridx = {r: i for i, r in enumerate(self.rids)}
    def bit(self, name):
        if name not in self.bits: self.bits[name] = 1 << len(self.namen); self.namen.append(name)
        return self.bits[name]
    def maske(self, namen):
        m = 0
        for n in namen: m |= self.bit(n)
        return m
    def menge(self, m): return {n for n in self.namen if self.bits[n] & m}

    def ctx(self, rid, krist, sig, items, lokal=()):
        return {'sig': self.menge(sig) | set(lokal), 'krist': dict(zip(FARBEN, krist)), 'items': {n[4:] for n in self.menge(items)},
                'geraeumt': bool(sig & self.bit('geraeumt:' + rid))}

    def region(self, rid, zelle, krist, sig, items, lok=0):
        key = (rid, zelle, krist, sig, items, lok)
        e = self.cache.get(key)
        if e: return e
        raum = self.R[rid]; lokal, gef, weg, glob = set(), set(), set(), set()
        fertig = {i for i in range(len(raum.aktionen)) if lok >> i & 1}
        for i in fertig:   # schon erledigt (bleibt, solange man im Raum ist: Blöcke, gefüllte Abgründe)
            a = raum.aktionen[i]
            lokal |= set(a.get('lokal', [])); gef |= set(map(tuple, a.get('fuellen', []))); weg |= set(map(tuple, a.get('weg', []))); glob |= set(a.get('glob', []))
        while True:
            ctx = self.ctx(rid, krist, sig, items, lokal)
            blk = blockiert(raum, ctx, gef, weg) - {zelle}
            reg = flut(zelle, blk)
            neu = False
            for i, a in enumerate(raum.aktionen):
                if i in fertig or not gilt(a.get('wenn'), ctx): continue
                if any(nah(f, reg) for f in a['req']):
                    fertig.add(i); neu = True
                    lokal |= set(a.get('lokal', [])); gef |= set(map(tuple, a.get('fuellen', []))); weg |= set(map(tuple, a.get('weg', []))); glob |= set(a.get('glob', []))
            if not neu: break
        bleibt = sum(1 << i for i in fertig if 'zeit' not in raum.aktionen[i])
        erg = (frozenset(reg), frozenset(lokal), self.maske(glob), bleibt, ctx)
        self.cache[key] = erg
        return erg

    def gewinne(self, rid, zelle, krist, sig, items, keys, truhen, lok):
        # Alles einsammeln, was ohne Entscheidung geht: Truhen, Platten mit merken, Gegner-Signale, globale Aktionen
        raum = self.R[rid]
        while True:
            reg, lokal, glob, bleibt, ctx = self.region(rid, zelle, krist, sig, items, lok)
            neu_sig, neu_items, neu_truhen, plus = glob, 0, 0, 0
            for o in raum.objekte:
                f = tuple(o['feld'])
                if o['objekt'] == 'truhe':
                    tb = self.bit(('truhe', rid, f))
                    if not truhen & tb and gilt(o.get('sichtbar_wenn'), ctx) and nah(f, reg):
                        neu_truhen |= tb
                        if o['inhalt'] == 'schluessel': plus += 1
                        else: neu_items |= self.bit('hat:' + o['inhalt'])
                if o['objekt'] == 'platte' and o.get('merken') and o.get('wer') == 'alle' and f in reg: neu_sig |= self.bit(o['signal'])
            for g in raum.gegner:
                if g.get('signal') and (nah(g['feld'], reg) or g.get('fern')): neu_sig |= self.bit(g['signal'])
            neu_sig &= ~sig; neu_items &= ~items
            if not (neu_sig or neu_items or neu_truhen): return reg, lokal, sig, items, keys, truhen, bleibt, ctx
            sig |= neu_sig; items |= neu_items; truhen |= neu_truhen; keys += plus

    def betreten(self, rid, sig):
        raum = self.R[rid]
        if raum.kampf or raum.extra.get('wellen') or any(t.get('offen_wenn') == 'geraeumt' for t in raum.tueren.values()):
            sig |= self.maske(['geraeumt:' + rid] + [g['signal'] for g in raum.gegner if g.get('signal')] + list(raum.extra.get('_sieg', [])))
        return sig

    def kanon(self, z):
        rid, zelle, krist, sig, items, keys, offen, truhen, lok = z
        reg, _, _, bleibt, _ = self.region(rid, zelle, krist, sig, items, lok)
        return (rid, min(reg), krist, sig, items, keys, offen, truhen, bleibt)

    def nachfolger(self, z):
        rid, zelle, krist, sig, items, keys, offen, truhen, lok = z
        reg, lokal, sig, items, keys, truhen, bleibt, ctx = self.gewinne(rid, zelle, krist, sig, items, keys, truhen, lok)
        raum = self.R[rid]; aus = []
        for d, t in raum.tueren.items():
            if not any(e in reg for e in eingang(d)): continue
            kb, o2, keys2 = self.bit(('tuer', rid, d)), offen, keys
            if offen & kb: pass
            elif t.get('schloss') == 'gross':
                if not items & self.bit('hat:grosser_schluessel'): continue
                o2 = offen | kb
            elif t.get('schloss'):
                if keys < 1: continue
                keys2 = keys - 1; o2 = offen | kb
            elif t.get('riegel'): continue
            elif t.get('braucht') and not items & self.bit('hat:' + t['braucht']): continue
            elif 'offen_wenn' in t:
                if not gilt(t['offen_wenn'], ctx): continue
                if t.get('merken'): o2 = offen | kb
            ziel, ankunft = t['ziel'], gegen(d)
            tt = self.R[ziel].tueren[ankunft]
            if tt.get('schloss') or tt.get('riegel') or ('offen_wenn' in tt and tt.get('merken')): o2 |= self.bit(('tuer', ziel, ankunft))
            s2 = self.betreten(ziel, sig)
            aus.append(((ziel, eingang(ankunft)[0], krist, s2, items, keys2, o2, truhen, 0), (rid, 'tuer', d, ziel)))
        for o in raum.objekte:
            if o['objekt'] != 'kristall': continue
            f = tuple(o['feld'])
            if not nah(f, reg): continue
            typ = o['kristalltyp']; i = list(FARBEN).index(typ)
            k2 = list(krist); k2[i] = (k2[i] + 1) % len(FARBEN[typ]); k2 = tuple(k2)
            for dc, dr in NACHBARN:
                p = (f[0] + dc, f[1] + dr)
                if p in reg:
                    aus.append(((rid, p, k2, sig, items, keys, offen, truhen, bleibt), (rid, 'kristall', typ, FARBEN[typ][k2[i]])))
        return aus

    @staticmethod
    def text(was):
        if was[1] == 'tuer': return f'{was[0]} → Tür {was[2]} → {was[3]}'
        return f'{was[0]}: Kristall {was[2]} → {was[3]}'

    def loese(self, melde=200000):
        s0 = self.kanon((self.start[0], self.start[1], self.krist0, self.betreten(self.start[0], 0), 0, 0, 0, 0, 0))
        zb = self.bit(self.ziel)
        idx = {s0: 0}; zust = [s0]; kanten = [[]]; vor = [None]; ziele = []
        q = deque([0])
        while q:
            i = q.popleft(); z = zust[i]
            if z[3] & zb: ziele.append(i); continue
            for nz, was in self.nachfolger(z):
                nz = self.kanon(nz)
                j = idx.get(nz)
                if j is None:
                    j = idx[nz] = len(zust); zust.append(nz); kanten.append([]); vor.append((i, was)); q.append(j)
                    if len(zust) % melde == 0: print('  …', len(zust), 'Zustände', flush=True)
                    if len(zust) > self.maxz: raise RuntimeError('zu viele Zustände')
                kanten[i].append(j)
            if len(self.cache) > 3000000: self.cache.clear()
        self.zust, self.kanten, self.vor, self.ziele = zust, kanten, vor, ziele
        return ziele

    def weg(self, j):
        schritte = []
        while self.vor[j]: i, was = self.vor[j]; schritte.append(self.text(was)); j = i
        return schritte[::-1]

    def sackgassen(self):   # Zustände, von denen aus das Ziel nicht mehr erreichbar ist
        rueck = [[] for _ in self.zust]
        for i, ks in enumerate(self.kanten):
            for j in ks: rueck[j].append(i)
        gut = set(self.ziele); q = deque(self.ziele)
        while q:
            j = q.popleft()
            for i in rueck[j]:
                if i not in gut: gut.add(i); q.append(i)
        return [i for i in range(len(self.zust)) if i not in gut]

# ---------------------------------------------------------------- Sokoban: Blöcke schieben wie im Spiel
def sokoban(raum, start, ziel, ctx, max_z=200000, bloecke=None):
    """start: Feld des Helden; ziel(bloecke, gefuellt) → bool. Gibt die Anzahl Schübe der kürzesten Lösung zurück (oder None)."""
    fest = blockiert(raum, ctx, set(), {tuple(o['feld']) for o in raum.objekte if o['objekt'] == 'block'})
    loch = {(c, r) for r in range(H) for c in range(W) if raum.k[r][c] == '~'}
    b0 = frozenset(tuple(o['feld']) for o in raum.objekte if o['objekt'] == 'block') if bloecke is None else frozenset(bloecke)
    def reg_von(p, bl, gef):
        return flut(p, ((fest - gef) | bl) - {p})
    q = deque([(start, frozenset(), b0, 0)]); gesehen = set()
    while q:
        p, gef, bl, n = q.popleft()
        reg = reg_von(p, bl, gef)
        key = (min(reg), gef, bl)
        if key in gesehen: continue
        gesehen.add(key)
        if ziel(bl, gef): return n
        if len(gesehen) > max_z: return None
        for b in bl:
            for dc, dr in NACHBARN:
                steh = (b[0] - dc, b[1] - dr); hin = (b[0] + dc, b[1] + dr)
                if steh not in reg or not innen(*hin) or hin in bl: continue
                if hin in fest and hin not in gef and hin not in loch: continue
                if hin in loch and hin not in gef:   # fällt hinein und füllt
                    q.append((b, gef | {hin}, bl - {b}, n + 1))
                else:
                    q.append((b, gef, (bl - {b}) | {hin}, n + 1))
    return None

def abstand(raum, ctx, von, nach_felder, gefuellt=frozenset()):
    blk = blockiert(raum, ctx, set(gefuellt), set()) - {von}
    dist = {von: 0}; q = deque([von])
    while q:
        p = q.popleft()
        if p in nach_felder: return dist[p]
        for dc, dr in NACHBARN:
            n = (p[0] + dc, p[1] + dr)
            if n not in dist and innen(*n) and n not in blk: dist[n] = dist[p] + 1; q.append(n)
    return None

# ---------------------------------------------------------------- Prüfung der Türen und Schreiben
def pruefe_tueren(R):
    fehler = []
    for rid, r in R.items():
        for d, t in r.tueren.items():
            z = R.get(t['ziel'])
            if not z: fehler.append(f'{rid}: Ziel {t["ziel"]} fehlt'); continue
            dx, dy = RICHT[d[0]]
            if z.pos != [r.pos[0] + dx, r.pos[1] + dy]: fehler.append(f'{rid}.{d} → {z.id}: Lage passt nicht')
            if gegen(d) not in z.tueren or z.tueren[gegen(d)]['ziel'] != rid: fehler.append(f'{rid}.{d}: Gegentür fehlt')
            for e in eingang(d):
                if r.k[e[1]][e[0]] != '.' and r.k[e[1]][e[0]] != 'b': fehler.append(f'{rid}.{d}: Eingang {e} ist {r.k[e[1]][e[0]]!r}')
                if any(tuple(o['feld']) == e and o['objekt'] not in ('platte',) for o in r.objekte): fehler.append(f'{rid}.{d}: Objekt auf Eingang {e}')
    pos = [tuple(r.pos) for r in R.values()]
    if len(set(pos)) != len(pos): fehler.append('zwei Räume auf demselben Feld')
    return fehler

def schreiben(pfad, did, dungeon, gegnerarten, kristalltypen):
    s = open(pfad, encoding='utf-8').read()
    def entferne(s, schluessel):
        a = s.find(f',\n    "{schluessel}": {{', s.index('id="spieldaten">'))
        if a < 0: return s
        tiefe, i = 0, s.index('{', a)
        while True:
            if s[i] == '{': tiefe += 1
            elif s[i] == '}':
                tiefe -= 1
                if tiefe == 0: break
            i += 1
        return s[:a] + s[i + 1:]
    def einfuegen(s, schluessel, text):
        a = s.index(f'  "{schluessel}": {{', s.index('id="spieldaten">'))
        tiefe, i = 0, s.index('{', a)
        while True:
            if s[i] == '{': tiefe += 1
            elif s[i] == '}':
                tiefe -= 1
                if tiefe == 0: break
            i += 1
        return s[:i].rstrip() + ',\n' + text + '\n  ' + s[i:]
    for k in [did, *gegnerarten, *kristalltypen]: s = entferne(s, k)
    def raum_text(rid, d):
        teile = [f'        "{rid}": {{']
        kopf = {k: v for k, v in d.items() if k not in ('karte', 'objekte', 'gegner', 'tueren', 'ereignisse', 'wellen', 'einstieg')}
        teile.append('          ' + json.dumps(kopf, ensure_ascii=False)[1:-1] + ',')
        for k in ('einstieg', 'wellen', 'ereignisse'):
            if k in d: teile.append(f'          "{k}": ' + json.dumps(d[k], ensure_ascii=False) + ',')
        teile.append('          "tueren": ' + json.dumps(d['tueren'], ensure_ascii=False) + ',')
        teile.append('          "karte": [\n' + ',\n'.join('            ' + json.dumps(z) for z in d['karte']) + ' ],')
        teile.append('          "objekte": [\n' + ',\n'.join('            ' + json.dumps(o, ensure_ascii=False) for o in d['objekte']) + ' ],' if d['objekte'] else '          "objekte": [],')
        teile.append('          "gegner": [\n' + ',\n'.join('            ' + json.dumps(g, ensure_ascii=False) for g in d['gegner']) + ' ]' if d['gegner'] else '          "gegner": []')
        return '\n'.join(teile) + '\n        }'
    kopf = {k: v for k, v in dungeon.items() if k != 'raeume'}
    dtext = f'    "{did}": {{\n      ' + json.dumps(kopf, ensure_ascii=False)[1:-1] + ',\n      "raeume": {\n' + ',\n'.join(raum_text(k, v) for k, v in dungeon['raeume'].items()) + '\n      }\n    }'
    s = einfuegen(s, 'dungeons', dtext)
    if gegnerarten: s = einfuegen(s, 'gegnerarten', ',\n'.join(f'    "{k}": ' + json.dumps(v, ensure_ascii=False) for k, v in gegnerarten.items()))
    if kristalltypen: s = einfuegen(s, 'kristalltypen', ',\n'.join(f'    "{k}": ' + json.dumps(v, ensure_ascii=False) for k, v in kristalltypen.items()))
    open(pfad, 'w', encoding='utf-8').write(s)
