#!/usr/bin/env python3
"""Einen Dungeon als eigenständiges Spiel bauen – z. B. die Fuchsfeste für itch.io.

Aufruf (im Ordner werkzeuge):
    python3 einzelspiel.py [dungeon-id] [ziel-ordner] [--sprache en]     Vorgabe: fuchsfeste, ./einzelspiel, deutsch

Ergebnis:
    <ziel>/<id>/index.html     das ganze Spiel in einer Datei (Grafik, Ton, Daten eingebettet)
    <ziel>/<id>-itch.zip       dieselbe index.html im ZIP – so lädt man ein HTML5-Spiel bei itch.io hoch
    mit --sprache en heißen sie <id>-en/ und <id>-en-itch.zip

Aus ../index.html bleibt nur dieser Dungeon in den Spieldaten; "einzelspiel" schaltet im Spiel den
Einzelspiel-Modus ein: Titelbild nur mit diesem Dungeon (Spiel starten / Weiterspielen), Spielstand beim
Betreten jedes Raums, Abspann am Ende, kein Editor, keine eigenen Dungeons. Der Rest der Engine ist
unverändert – Änderungen am Spiel also in ../index.html machen und das Skript neu laufen lassen.

Sprache: sprache_<code>.json enthält
    "html"         genaue Stellen im HTML-Gerüst (Hilfezeile, Touch-Knopf …) und ihren Ersatz
    "oberflaeche"  Bildschirmtexte der Engine (alles, was dort durch tx('…') läuft) – landen als "texte" in den Spieldaten
    "daten"        Texte aus den Spieldaten (Titel, Schilder, Ereignisse, Namen) – werden direkt ersetzt
Fehlt eine Übersetzung oder kann die Pixelschrift ein Zeichen nicht, bricht das Skript mit einer Liste ab.
"""
import json, os, re, sys, zipfile

HIER = os.path.dirname(os.path.abspath(__file__))
SPIEL = os.path.join(HIER, '..', 'index.html')
ANFANG = '<script type="application/json" id="spieldaten">'
UEBERSETZEN = ('titel', 'untertitel', 'einstieg', 'text', 'name')   # Schlüssel mit Texten für die Spielenden


def schriftzeichen(s):
    """Zeichen, die die Pixelschrift (const SCHRIFT) kennt."""
    block = s[s.index('const SCHRIFT = {'):]
    block = block[:block.index('\n};')]
    return {a or b or c for a, b, c in re.findall(r"(?:^|[\s,{])(?:'(.)'|\"(.)\"|([A-Z0-9])):\s*'", block)}


def uebersetze(daten, s, code):
    sp = json.load(open(os.path.join(HIER, f'sprache_{code}.json'), encoding='utf-8'))
    fehlt, zeichen, schrift = [], set(), schriftzeichen(s)

    def lauf(o, k=''):
        if isinstance(o, dict):
            return {kk: lauf(v, kk) for kk, v in o.items()}
        if isinstance(o, list):
            return [lauf(v, k) for v in o]
        if isinstance(o, str) and k in UEBERSETZEN and re.search(r'[A-Za-zÄÖÜäöüß]', o):
            if o not in sp['daten']:
                fehlt.append(o)
                return o
            return sp['daten'][o]
        return o
    daten = lauf(daten)
    if fehlt:
        sys.exit('Ohne Übersetzung in sprache_%s.json ("daten"):\n  ' % code + '\n  '.join(dict.fromkeys(fehlt)))
    for de in sp['oberflaeche']:
        if f"'{de}'" not in s:
            print(f'Hinweis: „{de}“ kommt in der Engine nicht mehr vor (veraltet?)')
    for t in [*sp['oberflaeche'].values(), *sp['daten'].values()]:
        zeichen |= {ch for ch in re.sub(r'\{\d\}', '', t).upper() if ch not in schrift}
    if zeichen:
        sys.exit('Diese Zeichen kann die Pixelschrift nicht: ' + ' '.join(sorted(zeichen)))
    daten['texte'] = sp['oberflaeche']
    for alt, neu in sp['html'].items():
        if s.count(alt) != 1:
            sys.exit(f'HTML-Stelle nicht (genau einmal) gefunden: {alt}')
        s = s.replace(alt, neu)
    return daten, s, sp.get('titel')


def baue(did='fuchsfeste', ziel=os.path.join(HIER, 'einzelspiel'), sprache=None):
    s = open(SPIEL, encoding='utf-8').read()
    a = s.index(ANFANG) + len(ANFANG)
    e = s.index('</script>', a)
    daten = json.loads(s[a:e])
    if did not in daten['dungeons']:
        sys.exit(f'Unbekannter Dungeon „{did}“ – vorhanden: {", ".join(daten["dungeons"])}')
    daten['dungeons'] = {did: daten['dungeons'][did]}
    daten['einzelspiel'] = {'dungeon': did}
    titel = None
    if sprache:
        daten, s, titel = uebersetze(daten, s, sprache)
        a = s.index(ANFANG) + len(ANFANG)   # das HTML davor hat sich verschoben
        e = s.index('</script>', a)
    titel = titel or daten['dungeons'][did].get('titel', did).title() + ' – Waldwacht'
    text = json.dumps(daten, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')   # kein </script> im JSON
    s = s[:a] + '\n' + text + '\n' + s[e:]
    s = re.sub(r'<title>.*?</title>', f'<title>{titel}</title>', s, count=1)
    name = did + (f'-{sprache}' if sprache else '')
    ordner = os.path.join(ziel, name)
    os.makedirs(ordner, exist_ok=True)
    pfad = os.path.join(ordner, 'index.html')
    open(pfad, 'w', encoding='utf-8').write(s)
    zpfad = os.path.join(ziel, f'{name}-itch.zip')
    with zipfile.ZipFile(zpfad, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(pfad, 'index.html')
    print(f'{titel}: {pfad} ({os.path.getsize(pfad) // 1024} KB), {zpfad} ({os.path.getsize(zpfad) // 1024} KB)')
    return pfad, zpfad


if __name__ == '__main__':
    argumente, sprache = sys.argv[1:], None
    if '--sprache' in argumente:
        i = argumente.index('--sprache')
        sprache = argumente[i + 1]
        del argumente[i:i + 2]
    baue(*argumente[:2], sprache=sprache)
