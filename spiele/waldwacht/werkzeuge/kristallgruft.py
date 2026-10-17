# Baut den Dungeon „Die Kristallgruft“ (33 Räume) für spiele/waldwacht/index.html.
# Aufruf: python3 kristallgruft.py [--weg] [--sokoban] [--fallen] [--schreiben]
#   ohne Schalter: Räume bauen und Türen prüfen · --weg: Löser über alle Zustände (kürzester Weg, Sackgassen; ca. 1 min)
#   --sokoban: Schieberätsel lösen · --fallen: kann man sich mit Blöcken einsperren? (einige Minuten)
#   --schreiben: Löser, dann Dungeon, Gegnerarten und Kristalltyp in ../index.html eintragen
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gruft_kern import *
SPIEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')

R = {}
def raum(rid, nr, titel, pos, karte, **k):
    r = Raum(rid, nr, titel, pos, karte, **k); R[rid] = r; return r

def grubenrand(r, c0, r0, c1, r1):   # Außenmauer eines Schiebe-Geheges als Abgrund: wer sich einsperrt, springt hinein
    for y in range(r0, r1 + 1):      # (landet am Raumeingang; raus und wieder rein setzt die Blöcke zurück). Am Rätsel
        for x in range(c0, c1 + 1):  # ändert das nichts: ein Block, der hineinfällt, wäre ohnehin verloren.
            if (y in (r0, r1) or x in (c0, c1)) and r.k[y][x] == '#': r.k[y][x] = '~'

ZU_W = {'nicht': 'westsiegel'}
ZU_O = {'nicht': 'ostsiegel'}

# ================================================================ Süden
V = raum('vorhalle', '1', 'VORHALLE', [0, 0], [
    "####################",
    "####################",
    "#..S.............S.#",
    "#..................#",
    "#.....F......F.....#",
    "#..................#",
    "#xxxxxxxxxxxxxxxxxx#",
    "#..................#",
    "#..................#",
    "#...S........S.....#",
    "#..................#",
    "#..................#",
    "#.....P......P.....#",
    "#..................#",
    "####################"])
V.tuer('w', 'pfeilergang').tuer('o', 'schleusentor').tuer('n1', 'kreuzhalle').tuer('n3', 'kreuzhalle')
V.extra['einstieg'] = 'Die Kristallgruft.'

# ================================================================ Westflügel
P = raum('pfeilergang', '2', 'PFEILERGANG', [-1, 0], [
    "####################",
    "####################",
    "#.....x.....y......#",
    "#.S...x.....y....S.#",
    "#.....x.....y......#",
    "#.....x..S..y......#",
    "#.....x.....y......#",
    "#.....x.....y......#",
    "#.....x..C..y......#",
    "#.....x.....y......#",
    "#.....x..S..y......#",
    "#.....x.....y......#",
    "#.S...x.....y....S.#",
    "#.....x.....y......#",
    "####################"])
P.tuer('o', 'vorhalle').tuer('w', 'brunnenkammer')

BR = raum('brunnenkammer', '3', 'BRUNNENKAMMER', [-2, 0], [
    "####################",
    "####################",
    "#.E.....~~...S.....#",
    "#.......~~.........#",
    "#.......~~S.B......#",
    "#...S...~~....S....#",
    "#.......~~.S.......#",
    "#.......~~.....B...#",
    "#.......~~..S......#",
    "#.......~~S........#",
    "#..E....~~...B..S..#",
    "#.......~~..S......#",
    "#.......~~.........#",
    "#.......~~.S.......#",
    "####################"])
BR.tuer('o', 'pfeilergang').tuer('w3', 'zisterne').tuer('n1', 'gruft')
BR.aktion(req=[(18, 7)], fuellen=[(9, y) for y in range(2, 14)] + [(8, y) for y in range(2, 14)], sokoban='bruecke03')

ZI = raum('zisterne', '4', 'ZISTERNE', [-3, 0], [
    "####################",
    "####################",
    "#..................#",
    "#.yyyyy.....~~~....#",
    "#.y...y.....~~~....#",
    "#.y.T.y............#",
    "#.y...y....S.......#",
    "#.yyyyy............#",
    "#..................#",
    "#......~~~....S....#",
    "#......~~~.........#",
    "#..................#",
    "#..E...............#",
    "#..................#",
    "####################"], truhen=[{'inhalt': 'herzcontainer'}])
ZI.tuer('o3', 'brunnenkammer').tuer('n', 'uhrwerk', schloss=True)
ZI.feind('fuchs', 12, 7).feind('fuchs', 6, 11).feind('silber', 15, 4)

GR = raum('gruft', '5', 'FINSTERE GRUFT', [-2, -1], [
    "####################",
    "####################",
    "#~~~~~~~~..~~~~~~~~#",
    "#~~~~~~~~.~~~~~~~~~#",
    "#~T..~~~~.~~~~~~~~~#",
    "#~~~.~~.........~~~#",
    "#~~~.~~.~~~~~~~.~~~#",
    "#~~~....~~~~~~~....#",
    "#~~~~~~.~~~~~~~~~..#",
    "#~~~~~~.....~~~~~~~#",
    "#~~~~~~~~~~.~~~~~~~#",
    "#~~~~.......~~~~~~~#",
    "#~~~~.~~~~~~~~~~~~~#",
    "#~~~~..~~~~~~~~~~~~#",
    "####################"], licht='finster', truhen=[{'inhalt': 'laterne'}])
GR.tuer('s1', 'brunnenkammer').tuer('o', 'westwacht').tuer('n', 'knochengang')
GR.feind('fuchs', 12, 5).feind('fuchs', 8, 9)

WW = raum('westwacht', '6', 'WESTWACHT', [-1, -1], [
    "####################",
    "####################",
    "#......x...........#",
    "#..S...x.......S...#",
    "#......x.....T.....#",
    "#......x...........#",
    "#......xyyyyyyyyyyy#",
    "#......x...........#",
    "#......x...........#",
    "#..S...x...........#",
    "#......x.....C.....#",
    "#......x...........#",
    "#......x.......S...#",
    "#......x...........#",
    "####################"], truhen=[{'inhalt': 'schluessel'}])
WW.tuer('w', 'gruft').tuer('o', 'kreuzhalle')
WW.feind('silber', 15, 9).feind('fuchs', 3, 11)

KG = raum('knochengang', '7', 'KNOCHENGANG', [-2, -2], [
    "####################",
    "####################",
    "#.......w..w.......#",
    "#..S....wwww....S..#",
    "#..................#",
    "#.....~~....~~.....#",
    "#.....~~....~~.....#",
    "#..................#",
    "#..................#",
    "#.....~~....~~.....#",
    "#.....~~....~~.....#",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "####################"], sperren={'w': {'nicht': 'gebein'}})
KG.kampf = True
KG.tuer('s', 'gruft', offen_wenn='geraeumt').tuer('w', 'gebeinkammer', offen_wenn='geraeumt').tuer('o', 'spiegelsaal', offen_wenn='geraeumt')
KG.tuer('n', 'grube', schloss=True)
KG.feind('fuchs', 4, 8).feind('fuchs', 15, 8)
KG.extra['wellen'] = [['silber', 'fuchs', 'silber'], ['glut', 'schildfuchs', 'glut', 'fuchs']]

UW = raum('uhrwerk', '9', 'UHRWERK', [-3, -1], [
    "####################",
    "####################",
    "#T..w..............#",
    "#...w..............#",
    "#.1.w..............#",
    "#~~~~~~~~~~~~~~~~..#",
    "#..................#",
    "#....S......S......#",
    "#..................#",
    "#..~~~~~~~~~~~~~~~~#",
    "#..................#",
    "#.....S......S.....#",
    "#................1.#",
    "#..................#",
    "####################"], sperren={'w': {'nicht': 'uhr'}},
    platten={'1': {'signal': 'uhr', 'wer': 'alle', 'nachlauf': 15}}, truhen=[{'inhalt': 'schluessel'}])
UW.tuer('s', 'zisterne', schloss=True).tuer('n', 'gebeinkammer')
UW.feind('fuchs', 8, 7).feind('fuchs', 14, 10)
UW.aktion(req=[(17, 12)], lokal=['uhr'], zeit={'von': (17, 12), 'nach': [(4, 2), (4, 3), (4, 4)]})
UW.aktion(req=[(2, 4)], lokal=['uhr'])

SP = raum('spiegelsaal', '10', 'SPIEGELSAAL', [-1, -2], [
    "####################",
    "####################",
    "#~~~~~~......~~~~~~#",
    "#~~.~~~.wwww.~~~.~~#",
    "#~~~~~~.wT.w.~~~~~~#",
    "#~~~~~~.wwww.~~~~~~#",
    "#..................#",
    "#...S........S.....#",
    "#..................#",
    "#......S....S......#",
    "#..................#",
    "#..S...........S...#",
    "#..................#",
    "#..................#",
    "####################"], sperren={'w': {'nicht': {'alle': ['spiegel_l', 'spiegel_r']}}}, truhen=[{'inhalt': 'schluessel'}])
SP.tuer('w', 'knochengang')
SP.feind('schuetze', 3, 3, signal='spiegel_l', fern=True).feind('schuetze', 16, 3, signal='spiegel_r', fern=True).feind('schildfuchs', 9, 9)

GB = raum('gebeinkammer', '11', 'GEBEINKAMMER', [-3, -2], [
    "####################",
    "####################",
    "#..................#",
    "#....##########....#",
    "#....#..12###3#....#",
    "#....#...#.#.B#....#",
    "#....#....B...#....#",
    "#....##..B#...#....#",
    "#....###...#..#.T..#",
    "#....#...#.##.#....#",
    "#....#####.####....#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], platten={c: {'signal': 'gebein' + c, 'wer': 'block'} for c in '123'},
    truhen=[{'inhalt': 'herzcontainer', 'sichtbar_wenn': 'gebein'}])
grubenrand(GB, 5, 3, 14, 10)
GB.tuer('s', 'uhrwerk').tuer('o', 'knochengang')
GB.extra['ereignisse'] = [{'wenn': {'alle': ['gebein1', 'gebein2', 'gebein3']}, 'schritte': [{'art': 'signal', 'signal': 'gebein'}]}]
GB.aktion(req=[(10, 11)], glob=['gebein'], sokoban='gebein')

GU = raum('grube', '12', 'DIE GRUBE', [-2, -3], [
    "####################",
    "####################",
    "#..................#",
    "#..................#",
    "#...~~~......~~~...#",
    "#...~~~......~~~...#",
    "#...~~~......~~~...#",
    "#..................#",
    "#..................#",
    "#...~~~......~~~...#",
    "#...~~~......~~~...#",
    "#...~~~......~~~...#",
    "#..................#",
    "#..................#",
    "####################"], licht='daemmrig', truhen=[])
GU.kampf = True
GU.tuer('s', 'knochengang', offen_wenn='geraeumt')
GU.feind('grubenkeiler', 9, 4, signal='westsiegel')
GU.obj('truhe', 9, 8, inhalt='herzcontainer', sichtbar_wenn='geraeumt')
for c, r in ((2, 2), (17, 2), (2, 13), (17, 13)): GU.obj('fackel', c, r)

# ================================================================ Mitte
KH = raum('kreuzhalle', '8', 'KREUZHALLE', [0, -1], [
    "####################",
    "####################",
    "#......w....v......#",
    "#..S...w....v...S..#",
    "#......w....v......#",
    "#......w.SS.v......#",
    "#......w....v......#",
    "#......w....v......#",
    "#......w....v......#",
    "#......w.C..v......#",
    "#......w....v......#",
    "#..S...w....v...S..#",
    "#......w....v......#",
    "#......w....v......#",
    "####################"], sperren={'w': ZU_W, 'v': ZU_O})
KH.tuer('s1', 'vorhalle').tuer('s3', 'vorhalle').tuer('w', 'westwacht').tuer('o', 'ostwacht')
KH.tuer('n', 'saeulensaal', offen_wenn={'alle': ['westsiegel', 'ostsiegel']})

# ================================================================ Ostflügel
ST = raum('schleusentor', '13', 'SCHLEUSENTOR', [1, 0], [
    "####################",
    "####################",
    "#..................#",
    "#..S...........S...#",
    "#......~~~~~~......#",
    "#......~~~~~~......#",
    "#......~~K.~~......#",
    "#......~~~~~~......#",
    "#......~~~~~~......#",
    "#....S.......S.....#",
    "#...B..............#",
    "#..........S..B....#",
    "#......S...........#",
    "#..................#",
    "####################"])
ST.tuer('w', 'vorhalle').tuer('o', 'pumpenhaus', offen_wenn='schleuse=gruen')
ST.aktion(req=[(2, 10)], fuellen=[(10, 7), (10, 8), (10, 5), (10, 4), (11, 6), (12, 6)], sokoban='insel')

PU = raum('pumpenhaus', '14', 'PUMPENHAUS', [2, 0], [
    "####################",
    "####################",
    "#..................#",
    "#..S...........S...#",
    "#.......lllll......#",
    "#.......l...l......#",
    "#.......l.K.l......#",
    "#.......l...l......#",
    "#.......lllll......#",
    "#..................#",
    "#...S.........S....#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"])
PU.tuer('w', 'schleusentor', offen_wenn='schleuse=gruen').tuer('n', 'schleusenkammer', offen_wenn='schleuse=rot').tuer('o', 'ueberlauf', offen_wenn='schleuse=lila')
PU.feind('rammler', 4, 12).feind('rammler', 15, 12)

UL = raum('ueberlauf', '15', 'ÜBERLAUF', [3, 0], [
    "####################",
    "####################",
    "#..................#",
    "#..~~..........~~..#",
    "#..~~....K.....~~..#",
    "#..................#",
    "#......S....S......#",
    "#..................#",
    "#..................#",
    "#......S....S......#",
    "#..................#",
    "#..~~..........~~..#",
    "#..~~..........~~..#",
    "#..................#",
    "####################"])
UL.kampf = True
UL.tuer('w', 'pumpenhaus', offen_wenn={'alle': ['geraeumt', 'schleuse=lila']}).tuer('n', 'wasserspeicher', offen_wenn='geraeumt')
UL.feind('teiler', 5, 8).feind('teiler', 14, 8)
UL.extra['wellen'] = [['knaller', 'teiler', 'knaller'], ['glut', 'teiler', 'glut', 'knaller']]

OW = raum('ostwacht', '16', 'OSTWACHT', [1, -1], [
    "####################",
    "####################",
    "#......y....y......#",
    "#..S...y....y...S..#",
    "#......y....y......#",
    "#......yyyyyy......#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#....S........S....#",
    "#..................#",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "####################"])
OW.tuer('w', 'kreuzhalle').tuer('o', 'schleusenkammer', offen_wenn='schleuse=lila').tuer('n', 'stauwehr')
OW.feind('waechter', 3, 7, weg=[[3, 7], [16, 7], [16, 11], [3, 11]]).feind('waechter', 16, 10, weg=[[16, 10], [3, 10]], blick='links')

SK = raum('schleusenkammer', '17', 'SCHLEUSENKAMMER', [2, -1], [
    "####################",
    "####################",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "#wwwwwwwwwwwwwwwwww#",
    "#..................#",
    "#.......ggggg......#",
    "#.......g...g......#",
    "#.......g.K.g......#",
    "#.......g...g......#",
    "#.......ggggg......#",
    "#..................#",
    "#..................#",
    "####################"], sperren={'w': {'nicht': 'wehr'}})
SK.tuer('s', 'pumpenhaus', offen_wenn='schleuse=rot').tuer('w', 'ostwacht', offen_wenn='schleuse=lila').tuer('o', 'wasserspeicher', offen_wenn='schleuse=gruen').tuer('n', 'raederwerk')
SK.feind('silber', 4, 11).feind('silber', 15, 11)

WS = raum('wasserspeicher', '18', 'WASSERSPEICHER', [3, -1], [
    "####################",
    "####################",
    "#~~~~~~~~..~~~~~~~~#",
    "#~~~~~~~~..~~~~~~~~#",
    "#~T.~~~~~..~~~~~~~~#",
    "#~~.~~~~~..~~~~~~~~#",
    "#~~.......~~~~~~~1.#",
    "#.~~.~~~~.~~~~~....#",
    "#....~~~~.~~~~~.~..#",
    "#~~~~.....~~~~~.~~~#",
    "#~~~~.~~~~~~~~~.~~~#",
    "#~~~~...........~~~#",
    "#~~~~~~~~..~~~...~~#",
    "#~~~~~~~~..~~~~~~~~#",
    "####################"], licht='finster', truhen=[{'inhalt': 'schluessel'}],
    platten={'1': {'signal': 'pegel', 'wer': 'alle', 'merken': True}})
WS.tuer('w', 'schleusenkammer', offen_wenn='schleuse=gruen').tuer('s', 'ueberlauf').tuer('n', 'rinne', offen_wenn='schleuse=rot')
WS.feind('fuchs', 7, 11)

SW = raum('stauwehr', '19', 'STAUWEHR', [1, -2], [
    "####################",
    "####################",
    "#..................#",
    "#........#########.#",
    "#........#.#.#..##.#",
    "#........#...BB..#.#",
    "#........#.1...#.#.#",
    "#........#...#...#.#",
    "#........#......##.#",
    "#........#.2....##.#",
    "#........####.####.#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], platten={c: {'signal': 'wehr' + c, 'wer': 'block'} for c in '12'})
grubenrand(SW, 9, 3, 17, 10)
SW.tuer('s', 'ostwacht').tuer('o', 'raederwerk', offen_wenn='schleuse=lila')
SW.extra['ereignisse'] = [{'wenn': {'alle': ['wehr1', 'wehr2']}, 'schritte': [{'art': 'signal', 'signal': 'wehr'}]}]
SW.aktion(req=[(13, 11)], glob=['wehr'], sokoban='wehr')

RW = raum('raederwerk', '20', 'RÄDERWERK', [2, -2], [
    "####################",
    "####################",
    "#..................#",
    "#..S.......wwwww...#",
    "#..........w.K.w...#",
    "#..........w.1.w...#",
    "#..........wwwww...#",
    "#..................#",
    "#..................#",
    "#..~~~~~~~~~~~~~~~~#",
    "#..................#",
    "#~~~~~~~~~~~~~~~~..#",
    "#.1................#",
    "#..................#",
    "####################"], sperren={'w': {'nicht': 'raeder'}},
    platten={'1': {'signal': 'raeder', 'wer': 'alle', 'nachlauf': 14}})
RW.tuer('w', 'stauwehr', offen_wenn='schleuse=lila').tuer('s', 'schleusenkammer').tuer('o', 'rinne', offen_wenn='schleuse=gruen').tuer('n', 'wachsaal', offen_wenn='pegel')
RW.aktion(req=[(2, 12)], lokal=['raeder'], zeit={'von': (2, 12), 'nach': [(11, 4), (11, 5), (12, 6), (13, 6), (14, 6), (15, 5), (15, 4)]})
RW.aktion(req=[(13, 5)], lokal=['raeder'])
RW.feind('rammler', 9, 10)

RI = raum('rinne', '21', 'RINNE', [3, -2], [
    "####################",
    "####################",
    "#..................#",
    "#..~~~.......~~~...#",
    "#..~~~...T...~~~...#",
    "#..................#",
    "#..................#",
    "#......~~~~~~......#",
    "#......~~~~~~......#",
    "#..................#",
    "#..~~~.......~~~...#",
    "#..~~~.......~~~...#",
    "#..................#",
    "#..................#",
    "####################"], truhen=[{'inhalt': 'herzcontainer', 'sichtbar_wenn': 'geraeumt'}])
RI.kampf = True
RI.tuer('w', 'raederwerk', offen_wenn={'alle': ['geraeumt', 'schleuse=gruen']}).tuer('s', 'wasserspeicher', offen_wenn={'alle': ['geraeumt', 'schleuse=rot']})
RI.feind('rammler', 5, 6).feind('rammler', 14, 6).feind('rammler', 9, 12)
RI.extra['wellen'] = [['rammler', 'silber', 'rammler'], ['rammler', 'glut', 'rammler', 'glut']]

WA = raum('wachsaal', '22', 'WACHSAAL', [2, -3], [
    "####################",
    "####################",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "#.....S......S.....#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#.....S......S.....#",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "#..................#",
    "####################"], licht='daemmrig')
WA.kampf = True
WA.tuer('s', 'raederwerk', offen_wenn='geraeumt')
WA.feind('schildwache', 9, 4, signal='ostsiegel')
WA.obj('truhe', 9, 7, inhalt='herzcontainer', sichtbar_wenn='geraeumt')
for c, r in ((2, 2), (17, 2), (2, 13), (17, 13)): WA.obj('fackel', c, r)

# ================================================================ Norden
SA = raum('saeulensaal', '23', 'SÄULENSAAL', [0, -2], [
    "####################",
    "####################",
    "#..................#",
    "#..S...S....S...S..#",
    "#..................#",
    "#..................#",
    "#..S...S....S...S..#",
    "#..................#",
    "#..................#",
    "#..S...S....S...S..#",
    "#..................#",
    "#..................#",
    "#..S...S....S...S..#",
    "#..................#",
    "####################"], licht='daemmrig')
SA.kampf = True
SA.tuer('s', 'kreuzhalle', offen_wenn='geraeumt').tuer('n', 'folge', schloss=True)
SA.feind('waechter', 5, 7, weg=[[5, 4], [14, 4], [14, 10], [5, 10]]).feind('waechter', 14, 10, weg=[[14, 10], [5, 10], [5, 4], [14, 4]])
SA.extra['wellen'] = [['glut', 'silber', 'glut'], ['knaller', 'schildfuchs', 'knaller', 'silber']]

# Reihenfolge der Platten in der Halle der Folge: 3, 1, 4, 2 (gezeigt von den Fackeln der Glockenstube)
FOLGE = [3, 1, 4, 2]
GL = raum('glockenstube', '24', 'GLOCKENSTUBE', [-1, -3], [
    "####################",
    "####################",
    "#...F..F....F..F...#",
    "#..................#",
    "#..................#",
    "#~~~~~~~~~~~~~~~~..#",
    "#~~~~~~~~~~~~~~~~..#",
    "#~~.......~~~~~....#",
    "#~~.~~~~~.~~~~~.~..#",
    "#~~.~~~~~.......~~~#",
    "#~~.~~~~~~~~~~~~~~~#",
    "#~~.......~~~~~~~~~#",
    "#~~~~~~~~T~~~~~~~~~#",
    "#~~~~~~~~~~~~~~~~~~#",
    "####################"], licht='finster', truhen=[{'inhalt': 'schluessel'}],
    fackeln=[{'an_wenn': 'glocke1'}, {'an_wenn': 'glocke2'}, {'an_wenn': 'glocke3'}, {'an_wenn': 'glocke4'}])
GL.tuer('o', 'folge')
schritte = [{'art': 'signal', 'signal': 'glocke_lauf'}, {'art': 'warte', 's': 1.5}]
for i in FOLGE: schritte += [{'art': 'signal', 'signal': f'glocke{i}'}, {'art': 'warte', 's': 0.8}, {'art': 'signal', 'signal': f'glocke{i}', 'wert': False}, {'art': 'warte', 's': 0.4}]
schritte += [{'art': 'warte', 's': 1.5}, {'art': 'signal', 'signal': 'glocke_ende'}]
GL.extra['ereignisse'] = [
    {'wenn': {'nicht': 'glocke_lauf'}, 'wiederholen': True, 'schritte': schritte},
    {'wenn': 'glocke_ende', 'wiederholen': True, 'schritte': [{'art': 'signal', 'signal': 'glocke_ende', 'wert': False}, {'art': 'signal', 'signal': 'glocke_lauf', 'wert': False}]}]

FO = raum('folge', '25', 'HALLE DER FOLGE', [0, -3], [
    "####################",
    "####################",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#...1..2....3..4...#",
    "#..................#",
    "#..................#",
    "#.......F.F.F......#",
    "#..................#",
    "#..................#",
    "####################"], platten={str(i): {'signal': f'folge{i}', 'wer': 'alle'} for i in range(1, 5)},
    fackeln=[{'an_wenn': 'folge_a'}, {'an_wenn': 'folge_b'}, {'an_wenn': 'folge_c'}])
FO.tuer('s', 'saeulensaal', schloss=True).tuer('w', 'glockenstube').tuer('o', 'doppelkaefig', schloss=True).tuer('n', 'torhalle', offen_wenn='folge', merken=True)
a, b, c, d = [f'folge{i}' for i in FOLGE]
FO.extra['ereignisse'] = [
    {'wenn': {'alle': [a, {'nicht': 'folge_a'}]}, 'wiederholen': True, 'schritte': [{'art': 'signal', 'signal': 'folge_a'}]},
    {'wenn': {'alle': [b, 'folge_a', {'nicht': 'folge_b'}]}, 'wiederholen': True, 'schritte': [{'art': 'signal', 'signal': 'folge_b'}]},
    {'wenn': {'alle': [c, 'folge_b', {'nicht': 'folge_c'}]}, 'wiederholen': True, 'schritte': [{'art': 'signal', 'signal': 'folge_c'}]},
    {'wenn': {'alle': [d, 'folge_c']}, 'schritte': [{'art': 'signal', 'signal': 'folge'}]},
    {'wenn': {'alle': [{'nicht': 'folge'}, {'eine': [{'alle': [b, {'nicht': 'folge_a'}]}, {'alle': [c, {'nicht': 'folge_b'}]}, {'alle': [d, {'nicht': 'folge_c'}]}]}]},
     'wiederholen': True, 'schritte': [{'art': 'signal', 'signal': x, 'wert': False} for x in ('folge_a', 'folge_b', 'folge_c')]}]
FO.aktion(req=[(4, 8), (7, 8), (12, 8), (15, 8)], glob=['folge'])

DK = raum('doppelkaefig', '26', 'DOPPELKÄFIG', [1, -3], [
    "####################",
    "####################",
    "#..................#",
    "#..S.....T......S..#",
    "#xxxxxxxxxxxxxxxxxx#",
    "#rrrrrrrrrrrrrrrrrr#",
    "#gggggggggggggggggg#",
    "#..................#",
    "#..~~..........~~..#",
    "#..~~..........~~..#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], truhen=[{'inhalt': 'schluessel'}])
DK.tuer('w', 'folge', schloss=True).tuer('n', 'ostturm')
DK.feind('glut', 4, 12).feind('glut', 15, 12)

TH = raum('torhalle', '27', 'TORHALLE', [0, -4], [
    "####################",
    "####################",
    "#..................#",
    "#..S...S....S...S..#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#.........C........#",
    "#..................#",
    "#..................#",
    "#..S...S....S...S..#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"])
TH.tuer('s', 'folge').tuer('w', 'westturm').tuer('n', 'vorthron', offen_wenn={'alle': ['nord_w', 'nord_o']})

WT = raum('westturm', '28', 'WESTTURM', [-1, -4], [
    "####################",
    "####################",
    "#..................#",
    "#.##########.......#",
    "#.##..#....#.......#",
    "#.#.......##.......#",
    "#.#...1#2B.#.......#",
    "#.##.##...3#.......#",
    "#.#..B.B...#.......#",
    "#.#.#...#..#.......#",
    "#.#####.####.......#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], platten={c: {'signal': 'turm' + c, 'wer': 'block'} for c in '123'})
grubenrand(WT, 2, 3, 11, 10)
WT.tuer('o', 'torhalle').tuer('n', 'kapelle', schloss=True)
WT.extra['ereignisse'] = [{'wenn': {'alle': ['turm1', 'turm2', 'turm3']}, 'schritte': [{'art': 'signal', 'signal': 'nord_w'}]}]
WT.aktion(req=[(7, 11)], glob=['nord_w'], sokoban='turm')

OT = raum('ostturm', '29', 'OSTTURM', [1, -4], [
    "####################",
    "####################",
    "#..................#",
    "#..S............S..#",
    "#....yyyyyyyyyy....#",
    "#....y........y....#",
    "#.C..y........y....#",
    "#....y........y....#",
    "#....yyyyyyyyyy....#",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], licht='daemmrig')
OT.tuer('s', 'doppelkaefig').tuer('n', 'glockenkammer', schloss=True)
OT.feind('waechter', 7, 6, signal='nord_o', weg=[[6, 5], [13, 5], [13, 7], [6, 7]]).feind('waechter', 12, 7, weg=[[13, 7], [6, 7], [6, 5], [13, 5]])
OT.feind('waechter', 3, 11, weg=[[2, 11], [17, 11]])

KA = raum('kapelle', '30', 'KAPELLE', [-1, -5], [
    "####################",
    "####################",
    "#..................#",
    "#..F...........F...#",
    "#..................#",
    "#.....S......S.....#",
    "#..................#",
    "#........T.........#",
    "#..................#",
    "#.....S......S.....#",
    "#..................#",
    "#..F...........F...#",
    "#..................#",
    "#..................#",
    "####################"], licht='daemmrig', truhen=[{'inhalt': 'grosser_schluessel', 'sichtbar_wenn': 'geraeumt'}])
KA.kampf = True
KA.tuer('s', 'westturm', offen_wenn='geraeumt')
KA.feind('glut', 5, 7).feind('glut', 14, 7)
KA.extra['wellen'] = [['schildfuchs', 'glut', 'schildfuchs'], ['knaller', 'glut', 'silber', 'knaller', 'glut'], ['schildfuchs', 'schildfuchs', 'glut', 'glut']]

GK = raum('glockenkammer', '31', 'GLOCKENKAMMER', [1, -5], [
    "####################",
    "####################",
    "#..................#",
    "#..................#",
    "#......wwwww.......#",
    "#......w...w.......#",
    "#......w.T.w.......#",
    "#......w.2.w.......#",
    "#......wwwww.......#",
    "#..................#",
    "#..S.........S.....#",
    "#.....B............#",
    "#..1.........2.....#",
    "#..................#",
    "####################"], sperren={'w': {'nicht': {'alle': ['glocke_block', 'glocke_zeit']}}},
    platten={'1': {'signal': 'glocke_block', 'wer': 'block'}, '2': {'signal': 'glocke_zeit', 'wer': 'alle', 'nachlauf': 3}},
    truhen=[{'inhalt': 'herzcontainer'}])
GK.tuer('s', 'ostturm', schloss=True)
GK.aktion(req=[(6, 12)], lokal=['glocke_block'])
GK.aktion(req=[(13, 12)], wenn='glocke_block', lokal=['glocke_zeit'], zeit={'von': (13, 12), 'nach': [(9, 8), (8, 8), (10, 8)]})

VT = raum('vorthron', '32', 'VORTHRON', [0, -5], [
    "####################",
    "####################",
    "#..................#",
    "#..................#",
    "#xxxxxxxxxxxxxxxxxx#",
    "#..................#",
    "#...S....C....S....#",
    "#..................#",
    "#yyyyyyyyyyyyyyyyyy#",
    "#..................#",
    "#..S............S..#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], licht='daemmrig')
VT.tuer('s', 'torhalle').tuer('n', 'thron', schloss='gross')

TR = raum('thron', '33', 'KRISTALLTHRON', [0, -6], [
    "####################",
    "####################",
    "#..................#",
    "#..C...........C...#",
    "#..................#",
    "#.....xx....yy.....#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#.....yy....xx.....#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"], licht='daemmrig')
TR.kampf = True
TR.tuer('s', 'vorthron', offen_wenn='geraeumt')
TR.feind('kristallwaechter', 9, 4)
TR.extra['_sieg'] = ['sieg']
TR.extra['ereignisse'] = [{'wenn': 'geraeumt', 'schritte': [{'art': 'text', 'text': 'Der Kristallwächter zerspringt. Die Kristallgruft ist bezwungen!'}, {'art': 'ende'}]}]
for c, r in ((5, 2), (14, 2), (5, 13), (14, 13)): TR.obj('fackel', c, r)

# ================================================================ Gegnerarten und Kristalltyp
GEGNERARTEN = {
    'grubenkeiler': {'bild': 'hase', 'farben': {'#6f6463': '#3e2a20', '#848e92': '#5e3826', '#ece8d6': '#a3343a'},
                     'lp': 20, 'tempo': 45, 'schaden': 2, 'fuss': [8, 5], 'koerper': [18, 16], 'groesse': 2, 'gewicht': 0.9,
                     'beute': {'herz': 1}, 'ki': {'wegfindung': True}, 'boss': {'name': 'GRUBENKEILER'}, 'ruestung': 'betaeubt',
                     'rammen': {'reichweite': 480, 'zielen': 0.55, 'tempo': 380, 'dauer': 1.6, 'betaeubt': 2.2, 'pause': [0.4, 0.9]}},
    'schildwache': {'bild': 'fuchs', 'farben': {'#b88250': '#7a8088', '#4a2a2a': '#2e313b', '#ece8d6': '#f4cd5e'},
                    'lp': 18, 'tempo': 55, 'schaden': 2, 'fuss': [11, 6], 'koerper': [26, 20], 'groesse': 2, 'gewicht': 0.4, 'abgrundfest': True,
                    'beute': {'herz': 1}, 'ki': {'wegfindung': True}, 'boss': {'name': 'SCHILDWACHE'}, 'schild': {'drehtempo': 150},
                    'ausweichen': {'chance': 0.3, 'tempo': 360, 'abklingzeit': 1.4},
                    'stampfen': {'reichweite': 90, 'zielen': 0.6, 'radius': 90, 'schaden': 2, 'pause': [1.4, 2.2]},
                    'serienschutz': {'treffer': 3, 'zeit': 2, 'dauer': 1, 'konter': True, 'schaden': 1},
                    'phasen': [{'name': 'Wache'},
                               {'name': 'Zorn', 'tempoFaktor': 1.3, 'schild': {'drehtempo': 260},
                                'sprung': {'reichweite': 220, 'zielen': 0.5, 'dauer': 0.4, 'tempo': 340, 'pause': [1.6, 2.4]}}],
                    'wendepunkte': [{'wenn': 'lp', 'unter': 0.5, 'ziel': 1, 'text': 'DIE WACHE RUFT VERSTÄRKUNG!', 'ruft': {'waechter': 2}}]},
    'kristallwaechter': {'bild': 'fuchs', 'farben': {'#b88250': '#7fbcdc', '#4a2a2a': '#3f5190', '#ece8d6': '#fffbec'},
                         'lp': 20, 'tempo': 60, 'schaden': 2, 'fuss': [11, 6], 'koerper': [26, 20], 'groesse': 2, 'gewicht': 0.3, 'abgrundfest': True,
                         'beute': {'herz': 1}, 'ki': {'wegfindung': True}, 'boss': {'name': 'KRISTALLWÄCHTER'},
                         'sprung': {'reichweite': 240, 'zielen': 0.55, 'dauer': 0.42, 'tempo': 340, 'pause': [1.8, 2.6]},
                         'schuss': {'reichweite': 400, 'zielen': 0.6, 'tempo': 170, 'schaden': 1, 'anzahl': 3, 'pause': [2.4, 3.4]},
                         'serienschutz': {'treffer': 3, 'zeit': 2, 'dauer': 1, 'konter': True, 'schaden': 2},
                         'phasen': [
                             {'name': 'Blauer Panzer', 'unverwundbar': True, 'weiter': [{'wenn': 'signal', 'signal': 'kristall=orange', 'ziel': 1}]},
                             {'name': 'Offen', 'alarm': 'fliehen', 'sprung': None, 'schuss': None, 'tempoFaktor': 1.3, 'weiter': [{'wenn': 'zeit', 's': 4, 'ziel': 2}]},
                             {'name': 'Oranger Panzer', 'unverwundbar': True, 'tempoFaktor': 1.2, 'pauseFaktor': 0.8, 'weiter': [{'wenn': 'signal', 'signal': 'kristall=blau', 'ziel': 3}]},
                             {'name': 'Offen', 'alarm': 'fliehen', 'sprung': None, 'schuss': None, 'tempoFaktor': 1.5, 'weiter': [{'wenn': 'zeit', 's': 4, 'ziel': 0}]}],
                         'wendepunkte': [{'wenn': 'lp', 'unter': 0.5, 'ziel': 2, 'text': 'DER WÄCHTER WIRD RASEND!', 'ruft': {'knaller': 2}}]},
}
KRISTALLTYPEN = {'schleuse': {'name': 'Rot/Grün/Lila', 'farben': ['rot', 'gruen', 'lila']}}

DUNGEON = {'titel': 'DIE KRISTALLGRUFT', 'untertitel': '33 Räume, schwer',
           'start': {'raum': 'vorhalle', 'feld': [9.5, 10.5]},
           'raeume': {rid: {k: v for k, v in r.daten().items() if not k.startswith('_')} for rid, r in R.items()}}

# ================================================================ Prüfen
fehler = pruefe_tueren(R)
if fehler: print('\n'.join(fehler)); sys.exit(1)
print(f'{len(R)} Räume, Türen geprüft.')

if '--sokoban' in sys.argv:
    from sokoban import loese
    ctx = {'sig': set(), 'krist': {K1: 0, K2: 0}, 'items': set(), 'geraeumt': False}
    for rid in ('gebeinkammer', 'stauwehr', 'westturm'):
        r = R[rid]; wand = {(c, y) for y in range(H) for c in range(W) if r.k[y][c] in '#' or r.k[y][c] in FEST_DEKOR}
        bl = [tuple(o['feld']) for o in r.objekte if o['objekt'] == 'block']; zi = {tuple(o['feld']) for o in r.objekte if o['objekt'] == 'platte'}
        start = tuple(r.aktionen[0]['req'][0])
        print(rid, 'Sokoban:', loese(wand, bl, zi, start, W, H, 400000))
    for rid, start, ziel in (('schleusentor', (2, 10), lambda bl, gef: {(10, 7), (10, 8)} <= gef or {(10, 5), (10, 4)} <= gef or {(11, 6), (12, 6)} <= gef),
                             ('glockenkammer', (6, 12), lambda bl, gef: (3, 12) in bl)):
        print(rid, 'Schübe:', sokoban(R[rid], start, ziel, ctx, max_z=200000))

if '--fallen' in sys.argv:   # in keinem Blockraum darf man sich so einsperren, dass weder Tür noch Abgrund erreichbar ist
    ctx = {'sig': set(), 'krist': {K1: 0, K2: 0}, 'items': set(), 'geraeumt': True}
    GEHEGE = {'gebeinkammer': (5, 3, 14, 10), 'stauwehr': (9, 3, 17, 10), 'westturm': (2, 3, 11, 10)}
    for rid, r in R.items():
        if not any(o['objekt'] == 'block' for o in r.objekte): continue
        n, f = fallen(r, ctx, GEHEGE.get(rid))
        print(rid, 'Stellungen:', n, 'Fallen:', len(f), f[:2] if f else '', flush=True)

if '--weg' in sys.argv or '--schreiben' in sys.argv:
    L = Loeser(R, ('vorhalle', (9, 10)), (0, 0))
    ziele = L.loese()
    print('Zustände:', len(L.zust), 'Ziel erreicht:', len(ziele))
    if ziele:
        bester = min(ziele, key=lambda j: len(L.weg(j)))
        for s in L.weg(bester): print('  ', s)
        sg = L.sackgassen()
        print('Sackgassen:', len(sg))
        for j in sg[:3]:
            z = L.zust[j]; print('  Sackgasse in', z[0], 'Kristall', z[2], 'Schlüssel', z[5], 'Signale', sorted(L.menge(z[3])), 'Gegenstände', sorted(L.menge(z[4])))
            for s in L.weg(j)[-12:]: print('     ', s)
    else:
        besucht = {z[0] for z in L.zust}
        print('nie erreicht:', sorted(set(R) - besucht))
        m = 0
        for z in L.zust: m |= z[3]
        print('Signale:', sorted(L.menge(m)))

if '--schreiben' in sys.argv:
    schreiben(SPIEL, 'kristallgruft', DUNGEON, GEGNERARTEN, KRISTALLTYPEN)
    print('geschrieben')
