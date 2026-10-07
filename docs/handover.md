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
