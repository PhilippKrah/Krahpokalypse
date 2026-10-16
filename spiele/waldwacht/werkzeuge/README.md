# Werkzeuge für Waldwacht-Dungeons

Python-Skripte (nur Standardbibliothek, Python 3), mit denen die großen Dungeons
gebaut und geprüft werden. Sie laufen lokal, nicht im Spiel; Vercel liefert sie
nur als Dateien mit aus.

| Datei | Wozu |
|---|---|
| `kristallgruft.py` | Baut „Die Kristallgruft“ (33 Räume als ASCII-Karten), prüft sie und schreibt sie in `../index.html`. |
| `fuchsfeste.py` | Dasselbe für „Die Fuchsfeste“ (23 Räume, einfachere Wegeprüfung). |
| `gruft_kern.py` | Bausteine: Räume aus ASCII-Karten, Löser über alle Zustände, Sokoban mit Abgründen, Schreiben ins Spiel. |
| `sokoban.py` | Schneller Sokoban-Löser (ohne Abgründe). |
| `sokoban_suche.py` | Sucht zufällige Schieberätsel und zeigt die schwersten. |
| `sokoban_loesung.py` | Kürzeste Schub-Folgen der Kristallgruft-Rätsel als JSON. |
| `einzelspiel.py` | Baut einen Dungeon als eigenständiges Spiel (eine `index.html` plus ZIP für itch.io). |

## Aufrufe

```bash
cd spiele/waldwacht/werkzeuge
python3 kristallgruft.py              # Räume bauen, Türen prüfen (schnell)
python3 kristallgruft.py --sokoban    # Schieberätsel: lösbar? wie viele Schübe?
python3 kristallgruft.py --weg        # Löser: kürzester Weg und Sackgassen (ca. 1 Minute)
python3 kristallgruft.py --fallen     # kann man sich mit Blöcken einsperren? (einige Minuten)
python3 kristallgruft.py --schreiben  # Löser, dann in ../index.html eintragen
python3 sokoban_suche.py 8 6 3 3000 0.25
python3 einzelspiel.py fuchsfeste     # → einzelspiel/fuchsfeste/index.html und einzelspiel/fuchsfeste-itch.zip
```

`einzelspiel.py` lässt in den Spieldaten nur den einen Dungeon stehen und setzt
`"einzelspiel"`: Das Spiel zeigt dann ein Titelbild nur mit diesem Dungeon
(Spiel starten / Weiterspielen), speichert beim Betreten jedes Raums und zeigt am
Ende den Abspann (Ereignis-Schritt `ende`). Die ZIP enthält nur die `index.html`
und lässt sich bei itch.io als HTML-Spiel hochladen (Viewport z. B. 960 × 720).
Der Ordner `einzelspiel/` ist Bauergebnis und steht nicht im Repo.

`--schreiben` ersetzt den Dungeon und seine Gegnerarten/Kristalltypen im
`spieldaten`-Block und hängt sie dort wieder an. Wer erst `fuchsfeste.py` und
dann `kristallgruft.py` schreiben lässt, bekommt `index.html` unverändert zurück.
Änderungen an diesen Dungeons also hier machen, nicht direkt im JSON – sonst
überschreibt der nächste Lauf sie.

## Der Löser

(Für eigene Dungeons gibt es den Löser auch in JavaScript: `../loeser.js`, im
Editor unter Logik → „Durchrechnen“. Er arbeitet direkt auf den Spieldaten und
rechnet auch Schieberätsel und Zeitläufe selbst; die Python-Fassung hier bleibt
das Werkzeug für die beiden generierten Dungeons.)

`Loeser` in `gruft_kern.py` durchsucht alle Zustände: Ort (Raum und Abschnitt,
per Flutfüllung über die Karte), Kristallfarben, Signale, Gegenstände,
Schlüssel, geöffnete Türen und Truhen. Er kennt Pflöcke (Kristall und Sperre),
Abgründe, Türen aller Arten samt Bedingungen, Kampfräume und Truhen mit
Bedingung. Was in einem Raum nur durch Geschick oder Schieben geht, steht als
`aktion` am Raum (`req` = Felder, von denen aus es geht; `lokal` = Signale nur
im Raum, `glob` = dauerhafte Signale, `fuellen` = Abgründe, die Blöcke füllen).
Ob diese Aktionen wirklich gehen, prüfen `--sokoban` und Testläufe im Spiel.

Ergebnis: Ist das Ziel erreichbar? Welcher Weg ist der kürzeste? Gibt es
**Sackgassen** – Zustände, aus denen man das Ziel nie mehr erreicht (z. B. weil
ein Schlüssel an der falschen Tür verbraucht wurde)?

## Fallen in Schieberätseln

`--fallen` (Funktion `fallen` in `gruft_kern.py`) geht jede Blockstellung durch,
die man von den Türen aus erschieben kann, und meldet die, in denen der Held
eingesperrt ist: keine Tür und kein Abgrund mehr erreichbar. Ein Sturz in einen
Abgrund kostet ein halbes Herz und bringt ihn zum Raumeingang; raus und wieder
rein setzt die Blöcke zurück. Deshalb haben die Schiebe-Gehege einen Grubenrand
(`grubenrand()` im Generator) statt einer Außenmauer – am Rätsel ändert das
nichts, ein Block, der hineinfällt, wäre ohnehin verloren. Jedes neue
Schieberätsel mit `--fallen` prüfen: das Ergebnis muss überall „Fallen: 0“ sein.
