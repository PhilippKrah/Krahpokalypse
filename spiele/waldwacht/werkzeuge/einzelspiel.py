#!/usr/bin/env python3
"""Einen Dungeon als eigenständiges Spiel bauen – z. B. die Fuchsfeste für itch.io.

Aufruf (im Ordner werkzeuge):
    python3 einzelspiel.py [dungeon-id] [ziel-ordner] [--sprache en]     Vorgabe: fuchsfeste, ./einzelspiel, alle Sprachen

Ergebnis:
    <ziel>/<id>/index.html     das ganze Spiel in einer Datei (Grafik, Ton, Daten eingebettet)
    <ziel>/<id>-itch.zip       dieselbe index.html im ZIP – so lädt man ein HTML5-Spiel bei itch.io hoch
    mit --sprache en nur diese Sprache, die Dateien heißen dann <id>-en/ und <id>-en-itch.zip

Aus ../index.html bleibt nur dieser Dungeon in den Spieldaten; "einzelspiel" schaltet im Spiel den
Einzelspiel-Modus ein: Titelbild nur mit diesem Dungeon (Weiterspielen / Neues Spiel / Optionen), Spielstand beim
Betreten jedes Raums, Abspann am Ende, kein Editor, keine eigenen Dungeons. Der Rest der Engine ist
unverändert – Änderungen am Spiel also in ../index.html machen und das Skript neu laufen lassen.

Sprachen kommen aus "sprachen" in den Spieldaten (die erste ist die, in der die Texte geschrieben sind; jede weitere bringt
"texte" für die Engine und "daten" für die Dungeon-Texte mit). Mit mehreren Sprachen fragt das Spiel beim ersten Start und
unter „Optionen“. Fehlt einer Sprache eine Übersetzung für einen Text dieses Dungeons oder kann die Pixelschrift ein Zeichen
nicht, bricht das Skript mit einer Liste ab.
"""
import json, os, re, sys, zipfile

HIER = os.path.dirname(os.path.abspath(__file__))
SPIEL = os.path.join(HIER, '..', 'index.html')
ANFANG = '<script type="application/json" id="spieldaten">'
UEBERSETZEN = ('titel', 'untertitel', 'einstieg', 'text', 'name')   # Schlüssel mit Texten für die Spielenden
NICHT_AUF_LEINWAND = ('Aktion', 'Halten: Raum neu starten')          # stehen im HTML, nicht in der Pixelschrift


def schriftzeichen(s):
    """Zeichen, die die Pixelschrift (const SCHRIFT) kennt."""
    block = s[s.index('const SCHRIFT = {'):]
    block = block[:block.index('\n};')]
    return {a or b or c for a, b, c in re.findall(r"(?:^|[\s,{])(?:'(.)'|\"(.)\"|([A-Z0-9])):\s*'", block)}


def texte_der_daten(daten):
    """Alle Texte für die Spielenden in den (schon gekürzten) Spieldaten."""
    gefunden = []

    def lauf(o, k=''):
        if isinstance(o, dict):
            for kk, v in o.items():
                if kk != 'sprachen':
                    lauf(v, kk)
        elif isinstance(o, list):
            for v in o:
                lauf(v, k)
        elif isinstance(o, str) and k in UEBERSETZEN and re.search(r'[A-Za-zÄÖÜäöüß]', o):
            gefunden.append(o)
    lauf(daten)
    return list(dict.fromkeys(gefunden))


def pruefe_sprachen(daten, s):
    sprachen = daten.get('sprachen') or {}
    texte, schrift, fehler = texte_der_daten(daten), schriftzeichen(s), []
    for code, sp in list(sprachen.items())[1:] if len(sprachen) > 1 else []:
        fehlt = [t for t in texte if t not in sp.get('daten', {})]
        if fehlt:
            fehler.append(f'Sprache {code}: ohne Übersetzung in "sprachen" → "{code}" → "daten":\n  ' + '\n  '.join(fehlt))
        sp['daten'] = {t: sp['daten'][t] for t in texte if t in sp.get('daten', {})}   # nur was dieser Dungeon braucht
        for de in sp.get('texte', {}):
            if f"'{de}'" not in s:
                print(f'Hinweis ({code}): „{de}“ kommt in der Engine nicht mehr vor (veraltet?)')
        leinwand = [v for k, v in sp.get('texte', {}).items() if '<' not in k and k not in NICHT_AUF_LEINWAND] + list(sp['daten'].values())
        zeichen = {ch for t in leinwand for ch in re.sub(r'\{\d\}', '', t).upper() if ch not in schrift}
        if zeichen:
            fehler.append(f'Sprache {code}: diese Zeichen kann die Pixelschrift nicht: ' + ' '.join(sorted(zeichen)))
    if fehler:
        sys.exit('\n'.join(fehler) + '\n(Übersetzungen ergänzen – oder mit --sprache de nur in der ersten Sprache bauen.)')


def baue(did='fuchsfeste', ziel=os.path.join(HIER, 'einzelspiel'), sprache=None):
    s = open(SPIEL, encoding='utf-8').read()
    a = s.index(ANFANG) + len(ANFANG)
    e = s.index('</script>', a)
    daten = json.loads(s[a:e])
    if did not in daten['dungeons']:
        sys.exit(f'Unbekannter Dungeon „{did}“ – vorhanden: {", ".join(daten["dungeons"])}')
    daten['dungeons'] = {did: daten['dungeons'][did]}
    daten['einzelspiel'] = {'dungeon': did}
    sprachen = daten.get('sprachen') or {}
    if sprache:
        if sprache not in sprachen:
            sys.exit(f'Unbekannte Sprache „{sprache}“ – vorhanden: {", ".join(sprachen)}')
        daten['sprachen'] = {sprache: sprachen[sprache]}
        if sprache != next(iter(sprachen)):
            daten['sprachen'] = {next(iter(sprachen)): {'name': '-'}, **daten['sprachen']}   # zum Prüfen; unten wieder entfernt
    pruefe_sprachen(daten, s)
    if sprache:
        daten['sprachen'] = {sprache: daten['sprachen'][sprache]}
    titel = daten['dungeons'][did].get('titel', did)
    erste = next(iter(daten.get('sprachen') or {}), None)
    titel = ((daten.get('sprachen') or {}).get(erste, {}).get('daten') or {}).get(titel, titel)
    titel = titel.title() + ' – Waldwacht'   # der Browser-Titel folgt im Spiel der gewählten Sprache
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
    print(f'{titel} ({", ".join(daten.get("sprachen") or {}) or "ohne Sprachen"}): {pfad} ({os.path.getsize(pfad) // 1024} KB), '
          f'{zpfad} ({os.path.getsize(zpfad) // 1024} KB)')
    return pfad, zpfad


if __name__ == '__main__':
    argumente, sprache = sys.argv[1:], None
    if '--sprache' in argumente:
        i = argumente.index('--sprache')
        sprache = argumente[i + 1]
        del argumente[i:i + 2]
    baue(*argumente[:2], sprache=sprache)
