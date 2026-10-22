# Baut den Dungeon „Die Fuchsfeste“ als JSON für spiele/waldwacht/index.html.
# Aufruf: python3 fuchsfeste.py [--schreiben]   (ohne Schalter: nur ausgeben/prüfen)
import json, os, sys

W, H = 20, 15

class Raum:
    def __init__(self, rid, nr, titel, pos, licht='hell'):
        self.id, self.nr, self.titel, self.pos, self.licht = rid, nr, titel, pos, licht
        self.k = [['#'] * W for _ in range(H)]
        for r in range(2, H - 1):
            for c in range(1, W - 1):
                self.k[r][c] = '.'
        self.tueren, self.objekte, self.gegner, self.extra = {}, [], [], {}

    def feld(self, c0, r0, c1, r1, ch):
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                self.k[r][c] = ch
        return self

    def abgrund(self, *a): return self.feld(*a, '~')
    def boden(self, *a): return self.feld(*a, '.')
    def mauer(self, *a): return self.feld(*a, '#')

    def setze(self, zeichen, *felder):   # einfache Deko-Zeichen der Legende (S Stein, b Busch, E Beerenbusch …)
        for c, r in felder:
            self.k[r][c] = zeichen
        return self

    def obj(self, art, c, r, **p):
        self.objekte.append({'objekt': art, 'feld': [c, r], **p}); return self

    def feind(self, art, c, r, **p):
        self.gegner.append({'gegner': art, 'feld': [c, r], **p}); return self

    def tuer(self, d, ziel, **p):
        self.tueren[d] = {'ziel': ziel, **p}; return self

    def daten(self):
        d = {'nr': self.nr, 'titel': self.titel, 'licht': self.licht, 'pos': self.pos}
        d.update(self.extra)
        d['tueren'] = self.tueren
        d['karte'] = [''.join(z) for z in self.k]
        d['objekte'] = self.objekte
        d['gegner'] = self.gegner
        return d

R = {}
def raum(*a, **k):
    r = Raum(*a, **k); R[r.id] = r; return r

# ---------------------------------------------------------------- Erdgeschoss: Dolch
A = raum('torhalle', '1', 'TORHALLE', [0, 0])
A.setze('S', (3, 3), (16, 3), (3, 11), (16, 11)).setze('P', (6, 6), (13, 6))
A.obj('fackel', 5, 2).obj('fackel', 14, 2)
A.obj('schild', 7, 4, text='Westen: Brunnenstube. Norden: Dornenhof. Der Ostflügel ist von der anderen Seite verriegelt - irgendwann kommst du von dort zurück.')
A.tuer('n', 'dornenhof').tuer('w', 'brunnen').tuer('o', 'ostfluegel', riegel=True)
A.extra['einstieg'] = 'Die Fuchsfeste! Ganz oben haust der Schattenfuchs. Du hast nur einen Dolch - such dir unterwegs ein Schwert. Leertaste: zustechen, lesen, öffnen.'

Wb = raum('brunnen', '2', 'BRUNNENSTUBE', [-1, 0])
for c in range(1, 19):
    Wb.obj('pflock', c, 5, kristalltyp='kristall', farbe='blau')
for c in range(1, 19):
    if c not in (17, 18):
        Wb.obj('pflock', c, 11, kristalltyp='kristall', farbe='orange')
Wb.obj('truhe', 9, 3, inhalt='herzcontainer').obj('kristall', 9, 8, kristalltyp='kristall')
Wb.obj('schild', 13, 8, text='Ein Kristallschalter: schlag ihn, dann tauschen blaue und orange Pflöcke. Seine Farbe gilt in der ganzen Feste!')
Wb.setze('E', (2, 12), (4, 13), (14, 13))
Wb.tuer('o', 'torhalle')

B = raum('dornenhof', '3', 'DORNENHOF', [0, -1])
B.feld(1, 11, 18, 11, 'b').setze('S', (3, 3), (16, 3)).setze('E', (8, 5), (11, 5))
B.obj('schild', 4, 12, text='Büsche versperren den Weg. Stich sie mit dem Dolch weg - manchmal steckt ein Herz darin.')
B.obj('schild', 7, 3, text='Die Tür im Norden ist verschlossen. Den Schlüssel bewachen Füchse in der Wachstube im Westen.')
B.feind('fuchs', 6, 7).feind('fuchs', 13, 7)
B.tuer('s', 'torhalle').tuer('w', 'wachstube').tuer('o', 'blocksaal').tuer('n', 'zwischenhalle', schloss=True)

C = raum('wachstube', '4', 'WACHSTUBE', [-1, -1])
C.setze('S', (5, 4), (14, 4), (5, 11), (14, 11)).setze('O', (2, 2), (17, 2))
C.feind('fuchs', 6, 6).feind('fuchs', 13, 9)
C.obj('truhe', 9, 7, inhalt='schluessel', sichtbar_wenn='geraeumt')
C.tuer('o', 'dornenhof', offen_wenn='geraeumt')
C.extra.update(kampf=True, wellen=[['fuchs', 'fuchs'], ['silber']], einstieg='Die Tür fällt zu! Besiege die Wachen - dann zeigt sich, was sie bewachen.')

D = raum('blocksaal', '5', 'BLOCKSAAL', [1, -1])
D.setze('S', (12, 4), (15, 4), (12, 10), (15, 10)).setze('O', (17, 12))
D.obj('block', 6, 10).obj('platte', 6, 4, signal='saal', wer='block')
D.obj('schild', 3, 12, text='Schieb den Steinblock auf die Platte: dagegen laufen und weiterdrücken. Steckt er fest, verlass den Raum und komm zurück.')
D.feind('fuchs', 14, 7)
D.tuer('w', 'dornenhof').tuer('n', 'abgrundsteg', offen_wenn='saal', merken=True)

F = raum('abgrundsteg', '6', 'ABGRUNDSTEG', [1, -2])
F.abgrund(1, 2, 18, 13)
F.boden(9, 11, 10, 13)      # vom Süden hinauf
F.boden(2, 11, 15, 12)      # Steg nach links und rechts
F.boden(2, 7, 4, 12)        # Insel mit der Laterne
F.boden(14, 5, 15, 12)      # rechts hinauf
F.boden(7, 5, 15, 6)        # oben nach links
F.boden(7, 3, 8, 6)         # links hinauf
F.boden(7, 3, 10, 4)        # zur Nordtür
F.boden(9, 2, 10, 4)
F.obj('truhe', 3, 7, inhalt='laterne')
F.feind('fuchs', 12, 11).feind('fuchs', 14, 8).feind('fuchs', 10, 5)
F.tuer('s', 'blocksaal').tuer('n', 'finstergang')
F.extra['einstieg'] = 'Schmale Stege über dem Abgrund. Stoß die Füchse hinunter - aber pass auf, dass sie dich nicht hinunterstoßen!'

G = raum('finstergang', '7', 'FINSTERER GANG', [1, -3], licht='finster')
for c in (4, 7, 12, 15):
    G.setze('S', (c, 4), (c, 10))
for c, r in ((2, 2), (17, 2), (2, 13), (17, 13)):
    G.obj('fackel', c, r, an_wenn='g_licht', merken=True)
G.obj('platte', 9, 7, signal='g_licht', wer='alle', merken=True)
G.feind('waechter', 3, 3, weg=[[3, 3], [16, 3]]).feind('waechter', 16, 12, weg=[[16, 12], [3, 12]])
G.tuer('s', 'abgrundsteg').tuer('o', 'kristallwache')
G.extra['einstieg'] = 'Finsternis. Irgendwo in der Mitte liegt eine Platte, die die Fackeln entzündet. Wächter sehen nur nach vorn.'

Hk = raum('kristallwache', '8', 'KRISTALLWACHE', [2, -3])
for c in range(1, 19):
    Hk.obj('pflock', c, 5, kristalltyp='kristall', farbe='blau')
    Hk.obj('pflock', c, 10, kristalltyp='kristall', farbe='orange')
Hk.obj('truhe', 9, 3, inhalt='schluessel').obj('kristall', 4, 7, kristalltyp='kristall').obj('kristall', 15, 12, kristalltyp='kristall')
Hk.setze('S', (2, 2), (17, 2))
Hk.feind('silber', 13, 8)
Hk.tuer('w', 'finstergang').tuer('s', 'blockgraben')
Hk.extra['einstieg'] = 'Blaue Pflöcke oben, orange unten. Du brauchst beide Wege - und denk an die Brunnenstube: Die Farbe gilt überall.'

Rg = raum('blockgraben', '9', 'BLOCKGRABEN', [2, -2])
Rg.abgrund(1, 7, 18, 8)
Rg.obj('block', 5, 5).obj('block', 5, 3)
Rg.setze('S', (12, 3), (15, 4)).setze('E', (2, 12), (17, 12))
Rg.obj('schild', 8, 3, text='Zwei Blöcke, zwei Reihen Graben. Erst den unteren hinein, dann den oberen hinterher.')
Rg.feind('fuchs', 7, 11).feind('fuchs', 13, 11)
Rg.tuer('n', 'kristallwache').tuer('s', 'zeitsteg')

U = raum('zeitsteg', '10', 'ZEITSTEG', [2, -1])
U.feld(1, 6, 13, 6, 'S').feld(6, 10, 18, 10, 'S')
U.obj('platte', 16, 3, signal='u_zeit', wer='alle', nachlauf=7)
U.obj('schild', 13, 3, text='Zeitschalter! Die Tür im Süden bleibt nach dem Loslassen nur kurz offen. Lauf!')
U.feind('rammler', 4, 8)
U.tuer('n', 'blockgraben').tuer('s', 'ostwache', offen_wenn='u_zeit')

V = raum('ostwache', '11', 'OSTWACHE', [2, 0])
V.setze('S', (5, 5), (14, 5), (5, 10), (14, 10))
V.feind('knaller', 4, 3).feind('knaller', 15, 12).feind('schildfuchs', 9, 7).feind('fuchs', 12, 4)
V.tuer('n', 'zeitsteg', offen_wenn='geraeumt').tuer('w', 'ostfluegel', offen_wenn='geraeumt')
V.extra.update(kampf=True, einstieg='Knaller explodieren kurz nach dem Treffer - weg da! Ihre Explosion trifft auch andere Gegner.')

Q = raum('ostfluegel', '12', 'OSTFLÜGEL', [1, 0])
Q.feld(3, 3, 6, 3, 'b').feld(13, 3, 16, 3, 'b').feld(3, 12, 6, 12, 'b').feld(13, 12, 16, 12, 'b').setze('E', (2, 2), (17, 2), (2, 13), (17, 13))
Q.obj('schild', 9, 4, text='Der Riegel zur Torhalle lässt sich von hier aufschieben - eine Abkürzung zurück zum Eingang.').obj('truhe', 9, 9, inhalt='schluessel')
Q.tuer('o', 'ostwache').tuer('w', 'torhalle')

# ---------------------------------------------------------------- Mitte: Keiler, Schwert
E = raum('zwischenhalle', '13', 'ZWISCHENHALLE', [0, -2])
E.setze('S', (4, 4), (15, 4), (4, 11), (15, 11)).setze('P', (7, 8), (12, 8))
E.obj('schild', 7, 3, text='Das Tor im Norden öffnet sich nur für ein Schwert. Hinter der verschlossenen Tür im Westen haust der Panzerkeiler - er bewacht eines.')
E.tuer('s', 'dornenhof').tuer('w', 'keilerhoehle', schloss=True).tuer('n', 'schuetzengalerie', braucht='schwert')

J = raum('keilerhoehle', '14', 'KEILERHÖHLE', [-1, -2], licht='daemmrig')
J.setze('S', (5, 5), (14, 5), (5, 10), (14, 10))
J.obj('fackel', 2, 2).obj('fackel', 17, 2).obj('fackel', 2, 13).obj('fackel', 17, 13)
J.obj('truhe', 9, 7, inhalt='schwert', sichtbar_wenn='geraeumt')
J.feind('panzerkeiler', 9, 4)
J.tuer('o', 'zwischenhalle', offen_wenn='geraeumt')
J.extra.update(kampf=True, einstieg='Der Panzerkeiler! Sein Panzer ist zu hart für deinen Dolch. Lass ihn gegen Wand oder Säule rennen - benommen ist er verwundbar.',
               ereignisse=[{'wenn': 'geraeumt', 'schritte': [{'art': 'text', 'text': 'Der Keiler ist erledigt! In der Truhe glänzt ein Schwert.'}]}])

# ---------------------------------------------------------------- Oben: Schwert gebraucht
K = raum('schuetzengalerie', '15', 'SCHÜTZENGALERIE', [0, -3])
K.abgrund(1, 2, 7, 6).abgrund(12, 2, 18, 6).boden(3, 3, 5, 3).boden(14, 3, 16, 3)
K.setze('S', (3, 10), (16, 10))
K.feind('schuetze', 4, 3, signal='schuetze_links').feind('schuetze', 15, 3, signal='schuetze_rechts')
K.feind('schildfuchs', 6, 10).feind('schildfuchs', 13, 10)
K.obj('schild', 9, 9, text='Die Schützen stehen auf Inseln. Schlag ihre Kugeln mit dem Schwert zurück! Fallen beide, öffnet sich das Tor.')
K.tuer('s', 'zwischenhalle').tuer('w', 'waechtersaal').tuer('n', 'kreuzung', offen_wenn={'alle': ['schuetze_links', 'schuetze_rechts']}, merken=True)

Y = raum('waechtersaal', '16', 'WÄCHTERSAAL', [-1, -3], licht='daemmrig')
for c in (4, 8, 11, 15):
    Y.setze('S', (c, 6), (c, 9))
Y.obj('truhe', 3, 3, inhalt='schluessel', sichtbar_wenn='hauptmann')
Y.feind('waechter', 16, 3, signal='hauptmann', blick='links', weg=[[16, 3], [6, 3]])
Y.feind('waechter', 2, 7, weg=[[2, 7], [2, 12], [17, 12], [17, 7]])
Y.feind('waechter', 9, 12, blick='hoch', weg=[[9, 12], [10, 4]])
Y.tuer('o', 'schuetzengalerie')
Y.extra['einstieg'] = 'Wächter sehen nur nach vorn. Erwisch den Hauptmann oben - fällt er, erscheint der Schlüssel.'

L = raum('kreuzung', '17', 'KREUZUNG', [0, -4])
L.setze('S', (4, 4), (15, 4), (4, 11), (15, 11)).setze('O', (2, 2), (17, 2))
L.obj('schild', 7, 3, text='Norden: Thronsaal - nur mit dem großen Schlüssel. Westen und Osten: verschlossen. Den großen Schlüssel hütet die Turmeule im Osten.')
L.feind('silber', 6, 9).feind('silber', 13, 9)
L.tuer('s', 'schuetzengalerie').tuer('w', 'zeitlauf', schloss=True).tuer('o', 'dreiklang', schloss=True).tuer('n', 'vorkammer', schloss='gross')

M = raum('zeitlauf', '18', 'ZEITLAUF', [-1, -4])
M.abgrund(4, 4, 15, 5).abgrund(4, 10, 15, 11).feld(2, 8, 16, 8, 'S').boden(16, 8, 16, 8)
M.obj('platte', 16, 12, signal='m_zeit', wer='alle', nachlauf=6)
M.obj('schild', 17, 3, text='Die Platte unten rechts öffnet das Tor im Westen - aber nur kurz.')
M.feind('glut', 9, 7)
M.tuer('o', 'kreuzung').tuer('w', 'nest', offen_wenn='m_zeit')

O = raum('nest', '19', 'SPRÖSSLINGSNEST', [-2, -4])
O.setze('E', (3, 3), (16, 3), (3, 12), (16, 12)).setze('b', (6, 6), (13, 6), (6, 9), (13, 9))
O.feind('teiler', 5, 4).feind('teiler', 14, 4).feind('teiler', 9, 11).feind('knaller', 4, 11)
O.obj('truhe', 9, 7, inhalt='herzcontainer', sichtbar_wenn='geraeumt')
O.tuer('o', 'zeitlauf', offen_wenn='geraeumt')
O.extra.update(kampf=True, wellen=[['teiler', 'teiler'], ['knaller', 'knaller', 'teiler']],
               einstieg='Ein Nest! Teiler zerfallen in zwei. Halte die Taste gedrückt, bis das Schwert funkelt - loslassen räumt rundum auf.')

N = raum('dreiklang', '20', 'DREIKLANG', [1, -4])
for r in range(2, 14):
    N.obj('pflock', 6, r, kristalltyp='dreiklang', farbe='rot')
    N.obj('pflock', 11, r, kristalltyp='dreiklang', farbe='gruen')
    N.obj('pflock', 15, r, kristalltyp='dreiklang', farbe='blau')
N.obj('kristall', 3, 4, kristalltyp='dreiklang').obj('kristall', 9, 4, kristalltyp='dreiklang').obj('kristall', 13, 4, kristalltyp='dreiklang')
N.obj('schild', 3, 11, text='Drei Farben: Rot, Grün, Blau. Jeder Schlag schaltet alle Kristalle eine Farbe weiter. Pflöcke stehen, solange ihre Farbe leuchtet.')
N.feind('silber', 9, 10).feind('glut', 13, 10)
N.tuer('w', 'kreuzung').tuer('o', 'eulenturm')

N2 = raum('eulenturm', '21', 'EULENTURM', [2, -4])
N2.abgrund(3, 2, 16, 5).boden(5, 3, 14, 3).abgrund(1, 12, 3, 13).abgrund(16, 12, 18, 13).setze('S', (4, 8), (15, 8))
N2.obj('truhe', 9, 9, inhalt='grosser_schluessel', sichtbar_wenn='geraeumt')
N2.feind('turmeule', 9, 3)
N2.tuer('w', 'dreiklang', offen_wenn='geraeumt')
N2.extra.update(kampf=True, einstieg='Die Turmeule thront über dem Abgrund - unerreichbar für jede Klinge. Schlag ihre Kugeln mit dem Schwert zurück! Die Säulen geben Deckung.')

P = raum('vorkammer', '22', 'VORKAMMER', [0, -5], licht='daemmrig')
P.feld(3, 5, 6, 5, 'b').feld(13, 5, 16, 5, 'b').feld(3, 10, 6, 10, 'b').feld(13, 10, 16, 10, 'b')
P.obj('fackel', 7, 2).obj('fackel', 12, 2)
P.obj('schild', 9, 7, text='Der Schattenfuchs schimmert, solange er angreift - dann prallt alles ab. Warte, bis er erschöpft ist. Knaller-Explosionen treffen ihn immer.')
P.tuer('s', 'kreuzung').tuer('n', 'thronsaal')

Z = raum('thronsaal', '23', 'THRONSAAL', [0, -6], licht='daemmrig')
Z.abgrund(1, 2, 2, 3).abgrund(17, 2, 18, 3).abgrund(1, 12, 2, 13).abgrund(17, 12, 18, 13)
Z.obj('fackel', 5, 2).obj('fackel', 14, 2).obj('fackel', 5, 13).obj('fackel', 14, 13)
Z.obj('truhe', 9, 7, inhalt='herzcontainer', sichtbar_wenn='geraeumt')
Z.feind('schattenfuchs', 9, 5)
Z.tuer('s', 'vorkammer', offen_wenn='geraeumt')
Z.extra.update(kampf=True, einstieg='Der Schattenfuchs! Das Ende der Fuchsfeste.',
               ereignisse=[{'wenn': 'geraeumt', 'schritte': [{'art': 'text', 'text': 'Der Schattenfuchs ist besiegt - die Fuchsfeste ist befreit! Danke fürs Spielen.'}, {'art': 'ende'}]}])

DUNGEON = {'titel': 'DIE FUCHSFESTE', 'untertitel': '23 Räume, zwei Zwischenbosse',
           'start': {'raum': 'torhalle', 'feld': [9.5, 10.5], 'waffe': 'dolch'},
           'raeume': {rid: r.daten() for rid, r in R.items()}}

GEGNERARTEN = {
    'panzerkeiler': {'bild': 'hase', 'farben': {'#6f6463': '#5e3826', '#848e92': '#454a55', '#ece8d6': '#a9b2b0'},
                     'lp': 5, 'tempo': 40, 'schaden': 2, 'fuss': [8, 5], 'koerper': [18, 16], 'groesse': 2, 'gewicht': 0.3, 'abgrundfest': True,
                     'beute': {'herz': 1}, 'ki': {'wegfindung': True}, 'boss': {'name': 'PANZERKEILER'}, 'ruestung': 'betaeubt',
                     'rammen': {'reichweite': 420, 'zielen': 0.6, 'tempo': 360, 'dauer': 1.6, 'betaeubt': 2.4, 'pause': [0.5, 1.0]}},
    'turmeule': {'bild': 'huhn', 'farben': {'#ece8d6': '#7a4f9a', '#b88250': '#3f5190', '#d0574a': '#f4cd5e'},
                 'lp': 6, 'tempo': 30, 'schaden': 2, 'fuss': [8, 5], 'koerper': [18, 18], 'groesse': 2, 'gewicht': 0.4, 'abgrundfest': True,
                 'beute': {'herz': 1}, 'boss': {'name': 'TURMEULE'}, 'ruhig': 'pendeln_w', 'alarm': 'bleiben',
                 'schuss': {'reichweite': 520, 'zielen': 0.5, 'tempo': 180, 'schaden': 1, 'anzahl': 1, 'pause': [1.0, 1.6]},
                 'phasen': [{'name': 'Lauern'},
                            {'name': 'Zorn', 'tempoFaktor': 1.8, 'pauseFaktor': 0.8, 'schuss': {'reichweite': 520, 'zielen': 0.45, 'tempo': 200, 'schaden': 1, 'anzahl': 3, 'pause': [1.2, 1.8]}}],
                 'wendepunkte': [{'wenn': 'lp', 'unter': 0.5, 'ziel': 1, 'text': 'DIE EULE WIRD ZORNIG!'}]},
    'schattenfuchs': {'bild': 'fuchs', 'farben': {'#b88250': '#3e2a5a', '#4a2a2a': '#120d14', '#ece8d6': '#d0574a'},
                      'lp': 12, 'tempo': 62, 'schaden': 2, 'fuss': [11, 6], 'koerper': [26, 20], 'groesse': 2, 'gewicht': 0.25, 'abgrundfest': True,
                      'beute': {'herz': 1}, 'ki': {'wegfindung': True}, 'boss': {'name': 'SCHATTENFUCHS'},
                      'sprung': {'reichweite': 260, 'zielen': 0.55, 'dauer': 0.45, 'tempo': 360, 'pause': [1.4, 2.2]},
                      'schuss': {'reichweite': 420, 'zielen': 0.6, 'tempo': 170, 'schaden': 1, 'anzahl': 3, 'pause': [2.6, 3.6]},
                      'serienschutz': {'treffer': 3, 'zeit': 2, 'dauer': 1, 'konter': True, 'schaden': 2},
                      'ausweichen': {'chance': 0.3, 'tempo': 380, 'abklingzeit': 1.6},
                      'phasen': [
                          {'name': 'Jagd', 'unverwundbar': True, 'weiter': [{'wenn': 'zufall', 's': [6, 8], 'ziel': 1}]},
                          {'name': 'Erschöpft', 'benommen': True, 'weiter': [{'wenn': 'zeit', 's': 4, 'ziel': 0}]},
                          {'name': 'Schattenwut', 'unverwundbar': True, 'tempoFaktor': 1.3, 'pauseFaktor': 0.7,
                           'stampfen': {'reichweite': 100, 'zielen': 0.7, 'radius': 90, 'schaden': 2, 'pause': [2, 3]},
                           'weiter': [{'wenn': 'zufall', 's': [5, 7], 'ziel': 3}]},
                          {'name': 'Erschöpft', 'benommen': True, 'weiter': [{'wenn': 'zeit', 's': 3.5, 'ziel': 2}]}],
                      'wendepunkte': [{'wenn': 'lp', 'unter': 0.5, 'ziel': 2, 'text': 'DER SCHATTEN ERWACHT!', 'ruft': {'knaller': 2}},
                                      {'wenn': 'lp', 'unter': 0.25, 'ziel': 2, 'text': 'LETZTE KRAFT!', 'ruft': {'glut': 1}}]},
}
KRISTALLTYPEN = {'dreiklang': {'name': 'Rot/Grün/Blau', 'farben': ['rot', 'gruen', 'blau']}}

# ---------------------------------------------------------------- Prüfung: Türen paarweise, Wege je Raum
RICHT = {'n': (0, -1), 's': (0, 1), 'w': (-1, 0), 'o': (1, 0)}
GEG = {'n': 's', 's': 'n', 'w': 'o', 'o': 'w'}
fehler = []
for rid, r in R.items():
    for d, t in r.tueren.items():
        z = R.get(t['ziel'])
        if not z: fehler.append(f'{rid}: Ziel {t["ziel"]} fehlt'); continue
        if z.pos != [r.pos[0] + RICHT[d][0], r.pos[1] + RICHT[d][1]]: fehler.append(f'{rid}.{d} → {z.id}: Lage passt nicht')
        if GEG[d] not in z.tueren or z.tueren[GEG[d]]['ziel'] != rid: fehler.append(f'{rid}.{d}: Gegentür fehlt')
positionen = [tuple(r.pos) for r in R.values()]
if len(set(positionen)) != len(positionen): fehler.append('Zwei Räume auf demselben Feld')

FEST = {'S', 'E', 'P', 'O', 'L', '#', '~'}
EINGANG = {'n': [(9, 2), (10, 2)], 's': [(9, 13), (10, 13)], 'w': [(1, 7), (1, 8)], 'o': [(18, 7), (18, 8)]}
def wege(r, offen):   # offen(objekt) → ist das Objekt-Feld begehbar?
    blockiert = set()
    for z in range(H):
        for c in range(W):
            if r.k[z][c] in FEST: blockiert.add((c, z))
    for o in r.objekte:
        if not offen(o): blockiert.add(tuple(o['feld']))
    return blockiert
def erreichbar(r, start, blockiert):
    da, offen_ = {start}, [start]
    while offen_:
        c, z = offen_.pop()
        for dc, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c + dc, z + dz)
            if n not in da and n not in blockiert and 0 <= n[0] < W and 0 <= n[1] < H: da.add(n); offen_.append(n)
    return da
def neben(feld, menge): return any((feld[0] + a, feld[1] + b) in menge for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
def pruefe(rid, offen, von, ziele_tueren=(), ziele_felder=(), text=''):
    r = R[rid]; b = wege(r, offen)
    start = EINGANG[von][0] if von in EINGANG else von
    menge = erreichbar(r, start, b)
    for d in ziele_tueren:
        if not any(e in menge for e in EINGANG[d]): fehler.append(f'{rid} {text}: von {von} nicht zu Tür {d}')
    for f in ziele_felder:
        if not neben(tuple(f), menge) and tuple(f) not in menge: fehler.append(f'{rid} {text}: von {von} nicht an {f}')
alles_offen = lambda o: o['objekt'] in ('platte',)
fest_ausser = lambda *arten: (lambda o: o['objekt'] in arten or o['objekt'] == 'platte')
def kristall_offen(farbe_oben):   # Pflöcke der Farbe stehen, die anderen sind unten; Büsche gelten als schneidbar
    return lambda o: o['objekt'] == 'platte' or (o['objekt'] == 'pflock' and o['farbe'] != farbe_oben)

pruefe('torhalle', alles_offen, 'n', 'wo', text='')
pruefe('brunnen', kristall_offen('blau'), 'o', '', [[9, 8]], 'blau: Kristall')
pruefe('brunnen', kristall_offen('orange'), 'o', '', [[9, 3]], 'orange: Truhe')
pruefe('dornenhof', lambda o: True, 's', 'nwo', text='Büsche geschnitten')
pruefe('wachstube', alles_offen, 'o', '', [[9, 7]])
pruefe('blocksaal', alles_offen, 'w', 'n', [[6, 11]], 'Block-Weg')
pruefe('abgrundsteg', alles_offen, 's', 'n', [[3, 7]])
pruefe('finstergang', alles_offen, 's', 'o', [[9, 7]])
pruefe('kristallwache', kristall_offen('orange'), 'w', '', [[9, 3], [4, 7]], 'orange')
pruefe('kristallwache', kristall_offen('blau'), 'w', 's', [[4, 7]], 'blau')
pruefe('kristallwache', kristall_offen('orange'), 's', '', [[15, 12]], 'von Süden, orange')
pruefe('blockgraben', alles_offen, 'n', '', [[5, 4], [5, 2]], 'Blöcke erreichbar')
pruefe('zeitsteg', alles_offen, 'n', 's', [[16, 3]])
pruefe('zeitsteg', alles_offen, 's', 'n', [[16, 3]], 'zurück')
pruefe('ostwache', alles_offen, 'n', 'w')
pruefe('ostfluegel', lambda o: True, 'o', 'w', [[9, 9]])
pruefe('zwischenhalle', alles_offen, 's', 'nw')
pruefe('keilerhoehle', alles_offen, 'o', '', [[9, 7]])
pruefe('schuetzengalerie', alles_offen, 's', 'nw')
pruefe('waechtersaal', alles_offen, 'o', '', [[3, 3]])
pruefe('kreuzung', alles_offen, 's', 'nwo')
pruefe('zeitlauf', alles_offen, 'o', 'w', [[16, 12]])
pruefe('nest', lambda o: True, 'o', '', [[9, 7]])
for oben, start, ziel, text in (('rot', 'w', [3, 4], 'Zone 1'), ('gruen', 'w', [9, 4], 'Zone 2 bei Grün'), ('blau', (8, 7), [13, 4], 'Zone 3 bei Blau'), ('rot', (12, 7), None, 'Ausgang bei Rot')):
    pruefe('dreiklang', kristall_offen(oben), start, 'o' if ziel is None else '', [ziel] if ziel else [], text)
pruefe('eulenturm', alles_offen, 'w', '', [[9, 9]])
if any(x in erreichbar(R['eulenturm'], (1, 7), wege(R['eulenturm'], alles_offen)) for x in ((9, 3), (5, 3))): fehler.append('eulenturm: Eulen-Insel erreichbar')
pruefe('vorkammer', lambda o: True, 's', 'n')
pruefe('thronsaal', alles_offen, 's', '', [[9, 7]])

if fehler:
    print('\n'.join(fehler)); sys.exit(1)
print(f'{len(R)} Räume, Türen und Wege geprüft.')
if '--karten' in sys.argv:
    for rid, r in R.items():
        k=[z[:] for z in r.k]
        for o in r.objekte: k[o['feld'][1]][o['feld'][0]] = {'pflock':'x','truhe':'T','kristall':'C','platte':'_','block':'B','schild':'?','fackel':'F'}.get(o['objekt'],'o') if o['objekt']!='pflock' else o['farbe'][0]
        for g in r.gegner: k[g['feld'][1]][g['feld'][0]]='G'
        print(rid); print('\n'.join(''.join(z) for z in k))

if '--schreiben' in sys.argv:
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html'); s = open(p, encoding='utf-8').read()
    def einfuegen(s, schluessel, text):   # vor das schließende } des Objekts "schluessel" im JSON-Block
        a = s.index(f'  "{schluessel}": {{', s.index('id="spieldaten">'))
        tiefe, i = 0, s.index('{', a)
        while True:
            if s[i] == '{': tiefe += 1
            elif s[i] == '}':
                tiefe -= 1
                if tiefe == 0: break
            i += 1
        vorher = s[:i].rstrip()
        return vorher + ',\n' + text + '\n  ' + s[i:]
    def zeilen(obj, einzug):
        return '\n'.join(einzug + z for z in json.dumps(obj, ensure_ascii=False, indent=1).split('\n'))
    def raum_text(rid, d):
        teile = [f'        "{rid}": {{']
        kopf = {k: v for k, v in d.items() if k not in ('karte', 'objekte', 'gegner', 'tueren', 'ereignisse', 'wellen', 'einstieg')}
        teile.append('          ' + json.dumps(kopf, ensure_ascii=False)[1:-1] + ',')
        for k in ('einstieg', 'wellen', 'ereignisse'):
            if k in d: teile.append(f'          "{k}": ' + json.dumps(d[k], ensure_ascii=False) + ',')
        teile.append('          "tueren": ' + json.dumps(d['tueren'], ensure_ascii=False) + ',')
        teile.append('          "karte": [\n' + ',\n'.join('            ' + json.dumps(z) for z in d['karte']) + ' ],')
        teile.append('          "objekte": [\n' + ',\n'.join('            ' + json.dumps(o, ensure_ascii=False) for o in d['objekte']) + ' ],')
        teile.append('          "gegner": [\n' + ',\n'.join('            ' + json.dumps(g, ensure_ascii=False) for g in d['gegner']) + ' ]' if d['gegner'] else '          "gegner": []')
        return '\n'.join(teile) + '\n        }'
    dtext = '    "fuchsfeste": {\n      "titel": "%s", "untertitel": "%s",\n      "start": %s,\n      "raeume": {\n%s\n      }\n    }' % (
        DUNGEON['titel'], DUNGEON['untertitel'], json.dumps(DUNGEON['start']), ',\n'.join(raum_text(k, v) for k, v in DUNGEON['raeume'].items()))
    def entferne(s, schluessel):   # ein früher eingefügtes Objekt samt vorangehendem Komma entfernen
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
    for k in ['fuchsfeste', *GEGNERARTEN, *KRISTALLTYPEN]: s = entferne(s, k)
    s = einfuegen(s, 'dungeons', dtext)
    s = einfuegen(s, 'gegnerarten', ',\n'.join(f'    "{k}": ' + json.dumps(v, ensure_ascii=False) for k, v in GEGNERARTEN.items()))
    s = einfuegen(s, 'kristalltypen', ',\n'.join(f'    "{k}": ' + json.dumps(v, ensure_ascii=False) for k, v in KRISTALLTYPEN.items()))
    open(p, 'w', encoding='utf-8').write(s)
    print('geschrieben')
