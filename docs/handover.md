# Übergabe: Stand und nächste Schritte

Einstiegspunkt für eine neue Session oder einen neuen Rechner. Beschreibt den
**Familien-Planer** (die To-Do-App) — den Hauptentwicklungspfad dieses Repos.

Stand: 7. Oktober 2026. Letzte App-Änderung: Version 0.3 vom 9. August 2026.

## Wo das Projekt steht

Die App ist **live und im Einsatz**. Sie kann:

- Anmeldung über Supabase Auth, kein Registrieren-Formular (Accounts legt Philipp im Dashboard an)
- Aufgaben nach Tagen gruppiert, Abschnitte einklappbar, Zustand überlebt das Neuladen
- Verschieben per Knopfdruck: Text antippen öffnet eine Leiste mit Tages-Knöpfen
- „Ohne Datum" (frischer Eingang, oben) und „Später" (weggelegt, unten)
- Sichtbarkeit privat/geteilt mit Ich-Wir-Umschalter, Standard privat
- Erledigtes mit abgelaufenem Tag wird beim Laden endgültig gelöscht
- Vom Handy-Startbildschirm startbar (Manifest + Icons)

Die Details zu Datenmodell, Bedienkonzept und Fallstricken stehen in der
[CLAUDE.md](../CLAUDE.md) — hier steht nur, was **offen** ist.

## Offene Punkte, nach Dringlichkeit

### 1. Der Zwei-Account-Test ist nie gelaufen (wichtig)

Dass private Aufgaben zwischen zwei Nutzern wirklich getrennt bleiben, ist
**nicht gegen zwei echte Accounts verifiziert**. Geprüft ist nur:

- Ohne Login liefert die Tabelle 0 Zeilen, Schreibzugriff wird mit `42501` abgewiesen
- Die Policies lauten korrekt auf `user_id = auth.uid() OR visibility = 'geteilt'`

Was fehlt: mit zwei Logins je eine private und eine geteilte Aufgabe anlegen und
auf beiden Geräten nachsehen. Solange das aussteht, ist „privat bleibt privat"
eine begründete Annahme, kein geprüfter Zustand — und genau dieses Versprechen
ist die Grundlage dafür, dass überhaupt frei in die App geschrieben wird.

So wird geprüft (ausgeloggt, in der Browser-Konsole der laufenden Seite):

```js
await db.from('todos').select('*')            // erwartet: 0 Zeilen
await db.from('todos').insert([{task:'x'}])   // erwartet: Fehler 42501
```

Schreibtests niemals gegen echte Familiendaten laufen lassen — nur gegen
nicht existierende IDs. In dieser Session wurde versehentlich eine echte
Aufgabe überschrieben und musste wiederhergestellt werden.

### 2. Wird die App überhaupt benutzt?

Die ganze Gestaltung ist darauf ausgelegt, eine Notizen-App zu schlagen, in der
Aufgaben als Freitext unter Wochentags-Überschriften stehen. Ob der Umstieg
gelungen ist, war beim Stand 0.3 noch offen. Vor neuen Features klären:

- Wird sie benutzt, oder liegt sie brach?
- Falls brach: woran scheitert es konkret?

Der wahrscheinlichste Reibungspunkt ist bekannt: **innerhalb eines Tages lässt
sich nicht frei sortieren.** In der Notizen-App geht das per Drag&Drop. Es wurde
bewusst weggelassen (auf dem Handy aufwendig) — wenn etwas vermisst wird, ist
das der erste Kandidat.

### 3. Nächste Features

Reihenfolge nach Aufwand-Nutzen, Details im [Backlog](backlog.md):

| Kandidat | Einschätzung |
|---|---|
| Live-Sync zwischen den Geräten | Supabase Realtime, technisch billig, spürbarer Effekt |
| Freies Sortieren im Tag | Nur falls vermisst, auf dem Handy aufwendig |
| Rückfallebene offline | Service Worker + lokale Spiegelung, machbar; Schreiben-mit-Nachspielen deutlich teurer |
| Zuweisen, Wiederholungen, Push | Zurückgestellt, Nutzen zu zweit fraglich |

## Setup auf einem neuen Rechner

Es gibt keinen Build-Schritt, kein npm, keine Abhängigkeiten.

1. Repo klonen: `git clone https://github.com/PhilippKrah/Krahpokalypse.git`
2. Lokal ansehen: `python -m http.server 8765` im Repo-Wurzelverzeichnis,
   dann `http://localhost:8765/index.html`.
   Nicht per Doppelklick öffnen — `file://`-Origins scheitern an CORS.
3. Zugänge, die der Mensch braucht (nicht im Repo und nicht automatisierbar):
   - **Supabase-Dashboard** für SQL-Skripte und das Anlegen von Accounts
   - **GitHub** mit Push-Recht auf `PhilippKrah/Krahpokalypse`
   - **Vercel** nur zum Nachsehen; es deployt automatisch bei Push auf `main`

Der Supabase-`anon`-Key steht im Klartext in `index.html` und ist kein Geheimnis.
Der Schutz kommt ausschließlich aus Row Level Security.

## Stand der Datenbank-Skripte

Alle drei Skripte in `supabase/` sind **am 9. August 2026 ausgeführt worden**;
die Tabelle `todos` hat alle acht Spalten und vier Policies, alle auf
`{authenticated}`. Die Skripte sind wiederholbar und können bei einem neuen
Supabase-Projekt erneut gefahren werden, Reihenfolge:

1. `schema-0.2.sql` — `user_id`, `visibility`, `due_date`
   (vor dem Lauf die E-Mail-Adresse darin prüfen, sie schreibt bestehende
   Aufgaben einem Account zu)
2. `schema-0.3.sql` — `deferred`
2a. `schema-0.4.sql` — `sort_order` (Reihenfolge per ↑/↓). **Noch nicht
   ausgeführt** (Stand 22.10.2026) — muss vor dem Merge auf `main` laufen.
3. `rls-todos.sql` — räumt **alle** Policies ab und baut die vier eigenen neu auf

**Reihenfolge-Regel bei künftigen Schema-Änderungen:** erst das SQL in Supabase,
dann der Push. Umgekehrt ist die Seite für die Familie kaputt, bis das Skript
nachgezogen wird.

## Was sonst noch im Repo liegt

Dieses Repo ist inzwischen mehr als die To-Do-App:

- `index.html` — die To-Do-App, Hauptentwicklungspfad
- `apps/` — kleines Startmenü, das die einzelnen Anwendungen auflistet.
  Eine neue App = ein Eintrag mehr im Array `APPS` in `apps/index.html`
- `spiele/foerster/` — Spiel „Der Gutsverwalter". **Wird hier nicht entwickelt.**
  Die Dateien entstehen in einem separaten Repo (`Games`) und werden per Skript
  hierher veröffentlicht; die Commit-Beschreibungen nennen den Quell-Commit.
  Änderungen an diesen Dateien direkt im Krahpokalypse-Repo gehen beim nächsten
  Veröffentlichen verloren.
- `spiele/waldwacht/` — Spiel „Waldwacht" (Arbeitstitel), Top-Down-Action im Stil
  von „A Link to the Past". Stand Entwurf 4 (Oktober 2026): datengetriebene
  Engine – alle Räume, Dungeons, Objekt-/Gegnerarten, Gegenstände und
  Einstellungen stehen als JSON im Block `spieldaten` (Vorbereitung für einen
  Editor). Zwei Dungeons im Menü: der lineare Probe-Dungeon (je Raum eine
  Mechanik) und „Der dunkle Hain" (verzweigt: Abgründe, Block in den Graben,
  Kristallschalter mit Pflöcken, Dunkelheit mit Fackeln und Laterne, Schlüssel,
  Wellen). Dunkelheit ist als Lichtwert je Feld modelliert (wie im
  Gutsverwalter); was sie spielerisch bewirkt, ist noch offen – bisher nur
  Darstellung. Editor (`editor.js`, im Menü unter EDITOR): Dungeons mit
  Raumkarte anlegen, Räume malen (Gelände, alle Objekte, Gegner), Türen je
  Richtung (offen/Schloss/Kampf/Bedingung), Räume automatisch befüllen,
  Gegnerarten mit Werten, Sprungangriff und Farben, Testen direkt aus dem
  Editor, Rückgängig, Export/Import. Gespeichert wird nur im jeweiligen Browser.
  Seit Entwurf 6: Bedingungen per Formular statt Freitext (Signale zur Auswahl,
  `pruefeDaten()` meldet abgefragte, aber nie ausgelöste Signale), Kristalltypen
  mit eigener Farbfolge (global verwaltet, Zustand gilt im ganzen Dungeon,
  Pflöcke je Typ und Farbe), Pipette (Alt+Klick) und Vorlagen, Rechteck-Füllen
  (Umschalt+Ziehen), Wellen per Zahlenfeldern, Platten wahlweise „einmal drücken
  genügt“. Eigenlicht ohne Laterne nur noch ein kleiner Schein.
  Seit Entwurf 7: Gegner aus Bausteinen (Wegfindung, Angriffs-Reihenfolge,
  Abstand/Drängen; Wahrnehmung mit Sicht, Sichtkegel, Gehör, Schlaf; Bewegung
  ruhig/bemerkt inkl. Patrouille mit Wegpunkten je Gegner; Angriffe Sprung,
  Schuss (zurückschlagbar), Rammen, Stampfen, jeder mit Ankündigung; Schild,
  Rüstung, Gewicht; Teilen, Explodieren; Signal beim Besiegen; Bosse mit
  Lebensbalken und Phasen). Dritter eingebauter Dungeon „Gegner-Probe“ zeigt alles.
  Seit Entwurf 8: Gegner-Phasen als Zustandsautomat (je Phase eigenes Verhalten,
  Übergänge nach Zeit/Zufall/LP/Angriff/Trefferserie/Signal, Wendepunkte),
  neue Bausteine unverwundbar, benommen, Schutz bei Trefferserie, Ausweichen;
  Lebensbalken wählbar; Boss zerplatzt mit Explosionen und „WOWOWOW“ (erster Ton
  über WebAudio, M schaltet stumm). Logikprüfung `pruefeLogik()` mit Prüfstatus
  rot/gelb/grün, Stufen auf der Karte und Reiter „Logik“ im Editor; Ereignisse
  per Formular; Hilfe-Reiter. Offen: Lösbarkeit von Rätseln *innerhalb* eines
  Raums (Blöcke) – dafür seit Entwurf 9 Nachweise per Testlauf (s. u.).
  Seit Entwurf 9: Nachweise je Raum (Testlauf aus dem Editor protokolliert erreichte
  Türen/Truhen, gültig solange der Fingerabdruck des Raums gleich bleibt;
  Rätselräume ohne vollständigen Nachweis zählen als „ungetestet“), Test-Vorgaben
  (Raumtest startet mit dem Zustand, den die Logik beim Betreten erwartet), Bedingung
  „hat:<gegenstand>“. Grundlage für den späteren Randomizer: dieselbe Logik
  (Orte = Truhen, Sperren = Bedingungen über Signale/Gegenstände/Schlüssel).
  Nächster Ausbau für den Randomizer: Wege *innerhalb* eines Raums aus den Nachweisen
  ableiten (von welchem Eingang aus welches Ziel erreichbar war).
  Seit Entwurf 10: Waffen (Daten `waffen`, Grundtyp Stich/Schwung, Länge,
  Schaden, Dauer, Rückstoß, schneidet/reflektiert, Aufladen → Kreisschwung;
  jede Waffe ist auch Gegenstand, Startwaffe je Dungeon; Reiter „Waffen“ im
  Editor; eingebaut: Dolch, Schwert), Türvarianten (großer Schlüssel „gross“,
  Riegel = nur von der anderen Seite zu öffnen für Abkürzungen, Gegenstandstor
  `braucht`), Platten mit Zeitschalter (`nachlauf`), Ereignisse als Abläufe mit
  Schritten (Signal an/aus, warten, warten bis, Text; wiederholbar), Gegnerarten
  „abgrundfest“, Ton für alle wichtigen Aktionen und einfache Musik (Dungeon,
  Boss). Bugfix: schnelle Jäger kleben nicht mehr am Helden.
  Danach: Probe-Dungeon startet mit dem Dolch (Schwert aus der Truhe), Klingen
  werden je Länge gebaut (Griff und Spitze fest, nur das Mittelstück wächst).
  **Vierter Dungeon „Die Fuchsfeste“** (`fuchsfeste`, 23 Räume) – erster großer
  Dungeon, nur aus vorhandenen Bausteinen: Start mit Dolch, Ostflügel-Schleife
  (Block auf Platte, Abgrundstege mit Laterne, finsterer Gang mit Wächtern,
  Kristallwache mit dem Kristallzustand aus der Brunnenstube, Block-Graben,
  Zeitschalter, Riegel-Abkürzung zurück zur Torhalle), Zwischenboss
  Panzerkeiler (nur nach Aufprall verwundbar) mit dem Schwert, das man fürs
  Tor danach und zum Zurückschlagen braucht (Schützengalerie, Zwischenboss
  Turmeule auf einer Insel im Abgrund), Dreifarb-Kristalle, optionaler
  Zeitlauf zum Herzcontainer, Endboss Schattenfuchs (Phasen, Knaller-
  Explosionen treffen ihn immer). Logikprüfung: 10 Stufen, keine Hinweise.
  Erzeugt mit `spiele/waldwacht/werkzeuge/fuchsfeste.py`.
  Seit Entwurf 11: **bis zu drei Türen je Wand** (`n1 n n3`, `w1 w w3` …; 1 =
  links/oben, 3 = rechts/unten, Gegentür an derselben Stelle der Nachbarwand) –
  im Spiel, in Logik, Datenprüfung und Editor („＋ Tür links/rechts“, versetzte
  Marken auf der Karte). Pflöcke ohne Kristalltyp sind **Sperren**, die über ein
  Signal hoch- und runterfahren (`oben_wenn`, im Editor „Gesteuert von: Signal“).
  Hauptmenü in zwei Ebenen: Dungeons, Eigene Dungeons, Editor.
  **Fünfter Dungeon „Die Kristallgruft“** (`kristallgruft`, 33 Räume, schwer, ohne
  Erklärschilder): Grundkristall Blau/Orange und Schleusenkristall Rot/Grün/Lila,
  deren Farben Türen, Pflöcke und Raumtrenner im ganzen Dungeon steuern
  (Luftschleusen, Käfige, die eine Farbe „festhalten“, Türen je Farbe); drei
  Sokoban-Rätsel (Blöcke auf Platten, per Ereignis zum Signal), zwei
  Brücken-Rätsel, zwei lange Zeitläufe, Dunkel-Labyrinthe, ein
  Reihenfolge-Rätsel (die Glockenstube zeigt die Folge mit Fackeln, die Halle
  der Folge prüft sie per Ereignissen), Kreuzhalle mit Siegel-Sperren aus beiden
  Flügeln, Doppelkäfig (braucht Orange und Lila zugleich). Bosse: Grubenkeiler
  (gepanzert, praktisch nur über die Abgründe zu besiegen), Schildwache (nur von
  hinten), Kristallwächter (nur verwundbar, nachdem man den Kristall auf die
  jeweils andere Farbe geschlagen hat). Geprüft mit einem eigenen Löser über
  alle Zustände (Ort, Kristallfarben, Signale, Schlüssel; rund 180 000
  Zustände): lösbar, keine Sackgasse in irgendeiner Reihenfolge; alle
  Schieberätsel und Zeitläufe zusätzlich per Bot im Spiel nachgespielt.
  Generator, Löser und Sokoban-Werkzeuge liegen in `spiele/waldwacht/werkzeuge/`
  (README dort); Änderungen an Fuchsfeste und Kristallgruft dort machen.
  Nachbesserung nach dem Anspielen: In Gebeinkammer und Stauwehr konnte man
  sich mit den Blöcken im Gehege einsperren (Sackgasse ohne Ausweg). Die Gehege
  haben jetzt einen Grubenrand statt der Außenmauer – reinspringen, am Eingang
  landen, raus und wieder rein setzt die Blöcke zurück; in der Brunnenkammer ist
  ein Stein weg, der eine Ecke abriegeln konnte. `kristallgruft.py --fallen`
  prüft das für jede erschiebbare Blockstellung (überall 0 Fallen; in allen
  anderen Dungeons gab es keine).
  Allgemeines Sicherheitsnetz: **R halten** (am Handy der ↺-Knopf über „Aktion“)
  startet den aktuellen Raum neu – Blöcke, Gegner und Platten wie beim erneuten
  Betreten, Fortschritt bleibt, keine Heilung (sonst wäre es ein Heil-Trick).
  Halten statt Tippen (0,8 s, mit Balken), weil R neben W liegt.
  **Dungeon-Creator, Etappe 1 von 4** (Wunsch des Nutzers: eigener Modus, der
  den Editor enthält bzw. zu ihm umschalten kann; nur am Desktop; Hilfe und
  klare Arbeitsschritte). Etappe 1 = Werkzeuge, auf denen der Creator aufbaut:
  - **Gegner-Drops:** ein Gegner kann einen Gegenstand tragen (`traegt`), der
    beim Besiegen an seiner Stelle liegen bleibt (über Abgrund: nächstes freie
    Feld). Logik und Löser behandeln ihn wie eine Truhe.
  - **`loeser.js`** – Löser über alle Zustände in JavaScript, arbeitet direkt
    auf den Spieldaten (anders als der Python-Löser braucht er keine von Hand
    beschriebenen Raum-Aktionen): Raumteile per Flutfüllung, Kristallfarben,
    jede Blockstellung (Sokoban mit Abgründen, je Raum bis 200 000 Stellungen),
    Platten, Zeitschalter (mit Laufzeit-Prüfung), Ereignisse, Schlüssel,
    Truhen, Drops, Kampf- und Bossräume. Liefert kürzesten Weg, Sackgassen samt
    „so kommt man dahin“, Einsperr-Fallen, zu knappe Zeitläufe, nie erreichte
    Räume. Läuft im Editor als Web Worker; in Node per `require` testbar.
    Kristallgruft: 176 868 Zustände, lösbar, keine Sackgasse (im Browser rund
    1,5 Minuten). Einzige Warnung: Westturm hat 1,3 Mio. Blockstellungen und
    wird nur teilweise durchsucht – der Python-Prüfer (`--fallen`) hat ihn
    vollständig als fallenfrei bestätigt.
  - **Editor:** Reiter „Logik“ hat oben den Kasten „Löser: alle Spielverläufe“
    (Durchrechnen, Abbrechen, Ergebnis mit Raum-Knöpfen). Werkzeugleiste
    „Ansicht → Raumteile“ färbt die Flächen des Raums ein, schreibt an jede Tür
    den Buchstaben ihres Teils, Zustand (Kristallfarben, Signale, Gegenstände)
    rechts wählbar; „Ab Eingang erreichbar“ rechnet im Hintergrund alle
    Blockstellungen ab einer Tür durch und markiert die Felder. Drei neue
    Hilfe-Abschnitte.
  **Etappe 2: der Creator** (`creator.js`, Menüeintrag CREATOR; eigener Modus im
  Fenster des Editors, „⇄“ schaltet um, gleicher Dungeon, gleiches Rückgängig).
  Fünf Schritte mit Leiste oben (✓ je erledigtem Schritt), Hilfe in jedem Schritt:
  1 **Idee** (Name, Startwaffe, Idee-Text, Endboss als Ziel; „Beispiel laden“
  legt „Die alte Mühle“ an – 6 Räume, fertig geplant und gebaut) ·
  2 **Ablauf** rückwärts als Baum („＋ braucht …“: großer/kleiner Schlüssel,
  Gegenstand, Rätsel/Schalter mit Signal, Zwischenboss oder ein schon geplantes
  Element), daneben „So spielt es sich (geplant)“ vorwärts nummeriert, Kreise
  werden gemeldet · 3 **Raumplan**: Karte mit Räumen (Mini-Vorschau),
  ＋ legt leere Räume samt Tür an, runde Knöpfe zwischen Räumen = Türen (je
  Richtung einstellbar), Elemente per Klick in Räume legen, getrennte Räume rot
  gestrichelt · 4 **Räume bauen**: je Raum ein Auftrag aus dem Plan („Laterne –
  liegt in einer Truhe“, „Signal … auslösen – Platte“) mit Haken, die sich beim
  Bauen von selbst setzen, Raumteile-Buchstaben; „Im Editor bauen“ – dort steht
  der Auftrag rechts oben · 5 **Prüfen**: der Löser rechnet einmal alles und dann
  je Element „ohne dieses Element“; daraus: hält / geht auch ohne (Abkürzung,
  mit Tipp, an welche Tür die Sperre gehört) / zusätzlich nötig / noch nicht
  gebaut / nie erreichbar, dazu Spoiler-Log (kürzester Weg in Abschnitten),
  Sackgassen, Warnungen. Der Plan steht im Dungeon unter `plan` (Spiel ignoriert
  ihn, Export nimmt ihn mit). Löser dafür erweitert: `verboten`, `zielBits`,
  `nurErreichbar`, `pruefePlan`, je Wegschritt `neu`; Kampf gilt jetzt auch in
  Bossräumen und Räumen mit „geräumt“-Abfrage als gewonnen.
  **Etappe 3: Aufträge im Detail und Bausteine.** Der Auftrag eines Raums (Editor
  rechts oben und Creator-Schritt 4) prüft je Element sofort und nur für diesen
  Raum (Löser `pruefeRaum` im Worker, Ergebnisse zwischengespeichert): steht es
  da · erreichbar ab welchem Eingang (Kristallfarben in jeder Kombination) · hält
  jede geplante Abhängigkeit – im Raum (ohne das Benötigte unerreichbar), an der
  Tür herein oder „weiter vorn“ (Tür-Graph: der Nachbarraum ist ohne es nicht
  erreichbar); ⚠ sonst, dazu Eingänge mit Türart, Raumteil, „im Test erreicht“.
  Zustand dabei: alle dauerhaften Signale und Gegenstände außer dem, was laut Plan
  erst danach kommt; bestätigt Schritt 5 eine Abhängigkeit, gilt sie auch hier.
  **Bausteine** (Werkzeug „Bausteine“ im Editor, 14 Stück): Truhe hinter Sperre,
  Sperre (Pflock), Block auf Platte, zwei Blöcke/zwei Platten (Ereignis), Schalter,
  Truhe auf der Insel, Truhe nach dem Kampf, Gegner trägt etwas, Kampf löst Signal
  aus, Gegner mit Signal, Zeitlauf, Kristall-Schleuse, Boss, Truhe. Einstellungen
  rechts, Vorschau unter der Maus (grün/rot mit Grund: Rand, Tür, Startpunkt,
  Zugang), Klick setzt, Strg+Z nimmt zurück. Offene Auftragspunkte schlagen
  passende Bausteine mit vorbelegtem Inhalt/Signal vor (auch aus Schritt 4 heraus,
  dann öffnet sich der Editor im Raum). Jeder Baustein ist per Löser geprüft
  (mit Bedingung erreichbar, ohne nicht; keine Einsperr-Fallen; Zeitlauf 1,9 s
  bei 4 s). Definitionen in `creator.js` (`BAUSTEINE`, Gelände + Objekte relativ).
  **Etappe 4: ganze Räume vorschlagen.** „✨ Raum vorschlagen“ (Creator-Schritt 4
  je Raum, im Editor beim Auftrag bzw. „Raum gestalten“) erzeugt drei Varianten
  (`baueVariante` in `creator.js`): Stil fürs Gelände (Säulenhalle, Abgründe mit
  Stegen, Waldlichtung, Kammern, Ruine), die Bausteine des Auftrags – wo die Türen
  herein eine Abhängigkeit nicht sichern, mit Sperre im Raum (Bausteine kennen dafür
  die interne Einstellung `nurMit`: Pflock im Gehege-Zugang, Nische, Bedingung am
  Ereignis bzw. an der Kampf-Truhe) –, freie Wege (0-1-Suche räumt Stil-Hindernisse
  zwischen Türen, Startpunkt und Baustein-Zugängen) und Gegner (keine/wenige/einige/
  viele, nicht in Bossräumen). Jede Variante prüft der Löser (Auftrag erfüllt, alle
  Türen untereinander erreichbar, keine Einsperr-Falle), bis zu 12 Versuche je
  Variante. Im Editor „Ansehen“ (Vorschau im Raum, Klick in den Raum beendet sie),
  „Übernehmen“ ersetzt Gelände, Objekte, Gegner, Ereignisse (Strg+Z). Getestet:
  296/300 Varianten auf Anhieb gültig (Rest: Einsperr-Fallen, werden verworfen);
  fünfmal alle Räume des Beispiels (plus Zusatz-Elementen mit Sperre im Raum)
  erzeugt – jedes Mal lösbar, keine Sackgasse, alle 8 Abhängigkeiten halten.
  **Einzelspiel (für itch.io):** `werkzeuge/einzelspiel.py fuchsfeste` baut die
  Fuchsfeste als eigenes Spiel (eine Datei, ZIP zum Hochladen). Dafür kann die
  Engine jetzt: Einzelspiel-Modus über `"einzelspiel": {"dungeon": …}` in den
  Spieldaten (Titelbild nur mit diesem Dungeon, kein Editor, keine eigenen
  Dungeons, Rahmen-füllende Skalierung), Spielstand beim Betreten jedes Raums, beim
  Gang ins Menü und beim Schließen der Seite (localStorage `waldwacht.stand.<id>`,
  „Weiterspielen“), Ereignis-Schritt `ende` mit Abspann (Spielzeit, Truhen,
  Herzen; im Hauptspiel zurück ins Menü). Fuchsfeste und Kristallgruft haben ihn
  nach dem Endboss (über ihre Generator-Skripte). Maus-Klick wählt Menüeinträge.
  **Sprachen, Optionen, Spielstand (auch im Hauptspiel):** Übersetzungen stehen in den
  Spieldaten unter `"sprachen"` (erste Sprache Deutsch = Originaltexte; `"en"` mit
  `"texte"` für die Engine und `"daten"` für Dungeon-Texte, bisher nur die Fuchsfeste –
  andere Dungeons bleiben auf Englisch deutsch). Bildschirmtexte der Engine immer über
  `tx('deutscher Text')` schreiben und in `"sprachen"` → `"en"` → `"texte"` nachtragen.
  Gibt es mehrere Sprachen, fragt das Spiel beim ersten Start; dazu ein Menüpunkt
  **Optionen**: Sprache, Schwierigkeit (Normal: nach Tod/Neuladen weiter im Raum;
  **Classic**: zurück zum Dungeon-Eingang, Fortschritt bleibt) und Bild (scharfe Pixel /
  Rahmen füllen), gespeichert in localStorage `waldwacht.optionen`. Der Spielstand gilt
  jetzt für jeden Dungeon, der aus dem Menü gestartet wird (nicht für Editor-Tests und
  `?dungeon=`); hat einer einen Stand, fragt das Menü „Weiterspielen / Neues Spiel“.
  Das Standalone (`einzelspiel.py fuchsfeste`) ist damit zweisprachig; `--sprache en`
  baut ein rein englisches Paket. Im Creator-Raumplan lassen sich jetzt alle drei
  Türen einer Wand anlegen und einstellen (vorher nur die Mitte).
  **Unabhängige Wege durch einen Raum** (der Eingang ist relativ): Spiel (Neustart,
  Abgrund, Spielstand am Eintrittspunkt), Löser (Ort = Raumteil im Zustand) und die
  Python-Generatoren rechneten schon immer ab der Tür, durch die man kommt. Jetzt auch
  die Stufen-Logik (`pruefeLogik`): Orte sind Raumteile aus `wegeImRaum` (getrennt nur
  durch, was sich nie ändert – Mauern, feste Objekte ohne Bedingung, Abgründe in Räumen
  ohne Block), Truhen und bleibende Platten zählen nur in ihrem Teil, Rückweg je Teil,
  neue Meldungen für unerreichbare Wege. Bei den eingebauten Dungeons ändert sich nichts
  (keiner hat statisch getrennte Türen). Test-Vorgaben: Eingang = Tür, durch die man den
  Raum laut Logik zuerst betritt, Stand je Eingang (`vorherTuer`). Im Creator-Raumplan
  „Wege durch den Raum“: je Tür (und Startpunkt) eine Weg-Nummer, gespeichert in
  `plan.raeume[raum].wege`; sich kreuzende Wege werden gemeldet. Schritt 4 prüft den
  gebauten Raum dagegen (Löser `pruefeRaum` mit `wege`: Türen je Punkt), „✨ Raum
  vorschlagen“ legt Bausteine auf ihren Weg, zieht Trennmauern (`trenneWege`) und
  verbindet nur je Weg; „Automatisch befüllen“ im Editor ebenso. Getestet: 150/150
  Vorschläge mit zwei Wegen gültig. Dabei behoben: In `creator.js` verdeckte die
  Ereignis-Anmeldung (`verbinde()`) die gleichnamige Wege-Funktion des Raumvorschlags –
  Vorschläge räumten nie Wege frei, und jeder Vorschlag meldete die Klicks des Creators
  noch einmal an (Klicks wirkten danach mehrfach); heißt jetzt `meldeAn()`.
  **Creator nach den 5 Säulen:** Schritt 2 ist jetzt eine waagerechte **Etappen-Zeitleiste**
  statt des verschachtelten Baums (`plan.etappen`, `etappe` je Element, ohne Angabe aus der
  Kette der „braucht“; neue Elemente brauchen automatisch, was die Etappe davor liefert). Je
  Etappe Name, Spannung (auto/Ruhe/mittel/hart), geplante Räume je Rolle; darunter eine
  Spannungskurve mit Rhythmus-Hinweisen und eine Brotkrumen-Liste (`sichtbarAb`: in welcher
  Etappe man die Sperre zuerst sieht). Im Raumplan hat jeder Raum Etappe (Farbe) und **Rolle**
  mit großem Symbol (`plan.raeume[raum].rolle`: 🧩 raetsel, ⚔️ kampf, 💎 belohnung, 🔥 ruhe,
  👣 durchgang, 💀 boss; `ROLLEN` in `creator.js`), links je Etappe, was noch fehlt.
  **Design-Prüfung** (`designPruefung`, Creator-Schritt 5 und Editor-Reiter „Logik“): Hinweise
  zu Relevanz (Räume ohne Funktion, leere Wege ab 10 Feldern), Brotkrumen (Stufe der Sperre
  gegen Stufe der Lösung), Rhythmus (Spannung je Etappe/Stufe), Trash-Mobs (Gegner ohne Zweck)
  und Show-don’t-tell (erste Mechanik gefahrlos, eine nach der anderen). Raumvorschlag nach
  Rolle (Ruhe: Fackeln, keine Gegner; Kampf: Kampfraum mit 3–4 verschiedenen Gegnern;
  Durchgang: Stil „Enger Gang“), Gegnerwahl „viele“ entfällt, neue Mechaniken kommen als
  Einführung (ohne Gegner, Zeitlauf 6 s). Generatoren setzen keine Schilder. Kampfräume
  optional mit `kampf_neu`: Kampf bei jedem Betreten neu (Spiel setzt „geräumt“ beim
  Betreten zurück; Bosse und Gegner mit Signal bleiben besiegt). Die alten Dungeons bestehen
  die Design-Prüfung erwartungsgemäß nicht – neue Dungeons sollen danach entstehen.
  **Design-Leitlinien:** [spieldesign-saeulen.md](spieldesign-saeulen.md) – die 5 Säulen
  für maximale Spieldichte (radikale Relevanz, Brotkrumen statt Questmarker, emotionaler
  Rhythmus, keine Trash-Mobs, Show don’t tell). Gelten für alles weitere Spieldesign.
  Damit sind die vier abgestimmten Etappen des Creators fertig. Mögliche nächste
  Schritte: mehr Stile und Bausteine, Raumgrößen, Mobil-Bedienung des Creators,
  Randomizer auf Basis von Plan und Löser.
  Merkposten für später (vom Nutzer so gewünscht): mehrere Etagen (Treppen,
  Löcher nach unten), Erzählung über die Umgebung, große Räume mit mitlaufender
  Kamera, die Kernmechanik des Tutorials (nicht „Rückstoß“ – kommt später),
  weitere Waffen-Grundtypen (Speer, Keule, Peitsche, Wurfwaffe), Kristallzustand
  in den Test-Vorgaben, Wege innerhalb eines Raums für den Randomizer (Grundlage:
  `wegeImRaum` und die Wege im Plan).
  Plan: weitere Probe-Räume, daraus ein Tutorial; Raum-/Dungeonformen und
  Randomizer danach. Teststart `?dungeon=<id>&raum=<id>`.
  Grafik aus dem Gutsverwalter-Atlas, eingebettet per `atlas_bauen.py`.
