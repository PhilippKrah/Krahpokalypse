#!/usr/bin/env python3
"""Einen Dungeon als eigenständiges Spiel bauen – z. B. die Fuchsfeste für itch.io.

Aufruf (im Ordner werkzeuge):
    python3 einzelspiel.py [dungeon-id] [ziel-ordner]        Vorgabe: fuchsfeste, ./einzelspiel

Ergebnis:
    <ziel>/<id>/index.html     das ganze Spiel in einer Datei (Grafik, Ton, Daten eingebettet)
    <ziel>/<id>-itch.zip       dieselbe index.html im ZIP – so lädt man ein HTML5-Spiel bei itch.io hoch

Aus ../index.html bleibt nur dieser Dungeon in den Spieldaten; "einzelspiel" schaltet im Spiel den
Einzelspiel-Modus ein: Titelbild nur mit diesem Dungeon (Spiel starten / Weiterspielen), Spielstand beim
Betreten jedes Raums, Abspann am Ende, kein Editor, keine eigenen Dungeons. Der Rest der Engine ist
unverändert – Änderungen am Spiel also in ../index.html machen und das Skript neu laufen lassen.
"""
import json, os, re, sys, zipfile

HIER = os.path.dirname(os.path.abspath(__file__))
SPIEL = os.path.join(HIER, '..', 'index.html')
ANFANG = '<script type="application/json" id="spieldaten">'


def baue(did='fuchsfeste', ziel=os.path.join(HIER, 'einzelspiel')):
    s = open(SPIEL, encoding='utf-8').read()
    a = s.index(ANFANG) + len(ANFANG)
    e = s.index('</script>', a)
    daten = json.loads(s[a:e])
    if did not in daten['dungeons']:
        sys.exit(f'Unbekannter Dungeon „{did}“ – vorhanden: {", ".join(daten["dungeons"])}')
    dungeon = daten['dungeons'][did]
    daten['dungeons'] = {did: dungeon}
    daten['einzelspiel'] = {'dungeon': did}
    text = json.dumps(daten, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')   # kein </script> im JSON
    s = s[:a] + '\n' + text + '\n' + s[e:]
    titel = dungeon.get('titel', did).title()
    s = re.sub(r'<title>.*?</title>', f'<title>{titel} – Waldwacht</title>', s, count=1)
    ordner = os.path.join(ziel, did)
    os.makedirs(ordner, exist_ok=True)
    pfad = os.path.join(ordner, 'index.html')
    open(pfad, 'w', encoding='utf-8').write(s)
    zpfad = os.path.join(ziel, f'{did}-itch.zip')
    with zipfile.ZipFile(zpfad, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(pfad, 'index.html')
    print(f'{titel}: {pfad} ({os.path.getsize(pfad) // 1024} KB), {zpfad} ({os.path.getsize(zpfad) // 1024} KB)')
    return pfad, zpfad


if __name__ == '__main__':
    baue(*sys.argv[1:3])
