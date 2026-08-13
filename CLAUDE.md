# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

Privates Familienprojekt: eine Familien-To-Do-Liste, die über eine Web-URL erreichbar ist. Später sollen ggf. weitere kleine Familien-Projekte dazukommen. Stack (alles bereits eingerichtet, nichts neu anzulegen):

- **Supabase** — Datenbank/Backend, Tabelle `todos` mit den Spalten `id`, `task`, `is_completed`, `created_at`, `user_id` (Besitzer, Default `auth.uid()`), `visibility` (`privat`/`geteilt`, Default `privat`), `due_date` (nullable), `deferred` (bool). Die beiden terminlosen Ablagen sind verschieden: `deferred = false` + kein Datum heißt „Ohne Datum" (frischer Eingang, steht **oben**), `deferred = true` heißt „Später" (bewusst weggelegt, steht **unten**). Ein Datum zu wählen holt eine Aufgabe automatisch aus „Später" zurück.
- **Vercel** — Hosting, per Git-Integration an das GitHub-Repo angeschlossen.
- **GitHub** — `PhilippKrah/Krahpokalypse`, Branch `main`.

Deploy-Weg: Commit auf `main` → Push → Vercel deployt automatisch. Es gibt keinen Build-Schritt.

## Architektur

Die gesamte App ist eine einzige statische Datei: [index.html](index.html) — HTML, CSS (`<style>`) und JS (`<script>`) in einem Dokument, ohne Build-Tools, ohne npm, ohne Framework. Der Supabase-JS-Client wird per `<script src>` aus einem CDN geladen; `SUPABASE_URL` und der `anon`-Key stehen im Klartext im Script (bei diesem Setup ist der anon-Key öffentlich und das erwartet — der Schutz muss über Row Level Security in Supabase kommen, nicht über Geheimhaltung des Keys).

Datenfluss (seit 0.2 optimistisch): Mutationen ändern **zuerst** das globale Array `todos` und rufen `renderTodos()`, danach erst geht der Aufruf an Supabase; schlägt der fehl, wird der alte Wert zurückgeschrieben, neu gezeichnet und eine Meldung gezeigt. `speichere(id, aenderung, vorher)` kapselt das für Updates, `speichereNeu()` ersetzt beim Anlegen den lokalen Platzhalter (`id: 'neu-…'`) durch die echte Zeile aus der Datenbank. Grund für die Abkehr vom früheren „nach jeder Mutation komplett neu laden": gefühltes Tempo auf dem Handy ist hier ein Akzeptanz-Faktor. Wer eine neue Mutation ergänzt, muss beide Hälften mitliefern — lokale Änderung *und* Rollback.

`renderTodos()` erzeugt das HTML per `innerHTML` mit `onclick="…"`-Attributen, die auf globale Funktionen zeigen; die Funktionen müssen also global bleiben (kein Modul-Scope, kein `type="module"`, solange dieses Muster gilt). IDs werden als String übergeben, weil neue Aufgaben bis zur Antwort der Datenbank eine Platzhalter-ID tragen — Vergleiche deshalb immer über `findTodo()` bzw. `String(a) === String(b)`.

`raeumeAuf()` läuft nach jedem `loadTodos()` und **löscht endgültig** aus der Datenbank, was erledigt ist und dessen Tag vorbei ist. Erledigtes ohne Datum bleibt bewusst stehen (da war nie ein Tag, der „rum" sein könnte). Beim Ändern dieser Bedingung daran denken, dass es keine Wiederherstellung gibt.

## Bedienkonzept (nicht ohne Not ändern)

Die App konkurriert mit einer Notizen-App, in der die Aufgaben als Freitext unter Wochentags-Überschriften stehen. Maßstab jeder Änderung: **sie muss mit weniger Tipps auskommen als dort.** Daraus folgt:

- **Kästchen antippen = erledigt, Text antippen = Aktionsleiste.** Diese Trennung ist der Grund, warum Verschieben zwei Tipps kostet. Ein Tipp auf den Text darf nicht wieder abhaken.
- Datum kommt **ausschließlich über Buttons** — bewusst keine Texterkennung von „Montag"/„morgen": was getippt werden muss, spart nichts.
- Die Tages-Buttons entstehen relativ zu heute (`Heute`, `Morgen`, dann Wochentagskürzel), damit die Frage „Montag = heute oder nächste Woche?" gar nicht aufkommt.
- Die nächsten sieben Tage haben **immer** eine Überschrift, auch leer — sonst gäbe es dort kein „+" zum Anlegen.
- Überfälliges rutscht in `gruppiere()` still nach „Heute" (das gespeicherte `due_date` bleibt unverändert). Keine Warnfarben, keine Überfällig-Zähler: eine App, die ein schlechtes Gewissen macht, wird nicht mehr geöffnet.
- Datumsrechnung immer in Ortszeit über `toIso()`/`fromIso()`. `toISOString()` ist hier falsch, das rechnet nach UTC und macht abends aus „heute" schon „morgen".

## Zugriffsschutz

Zwei Hälften, die zusammengehören — eine allein schützt nichts:

- **Im Frontend:** `db.auth.onAuthStateChange(...)` ist der einzige Einstiegspunkt der App. Ohne Session zeigt `showView()` nur `#authView` (Login per `signInWithPassword`), mit Session `#appView`; `loadTodos()` läuft ausschließlich mit Session. Kein Registrieren-Formular — Accounts der Familienmitglieder legt der Nutzer im Supabase-Dashboard unter Authentication > Users an. Diese Sichtbarkeits-Logik nur anfassen, wenn klar ist, dass `#appView` ohne Session verborgen bleibt.
- **In Supabase:** [supabase/rls-todos.sql](supabase/rls-todos.sql) schaltet RLS auf `todos` ein. Regel: eigene Aufgaben immer, fremde nur mit `visibility = 'geteilt'`; Anlegen nur im eigenen Namen (`with check (user_id = auth.uid())`); Ändern und Löschen auch für geteilte Aufgaben des Partners — das ist bei einer gemeinsamen Liste gewollt. Die Rolle `anon` hat bewusst keine Policy. [supabase/schema-0.2.sql](supabase/schema-0.2.sql) legt die Spalten dafür an. Beide Skripte sind wiederholbar und müssen vom Nutzer im SQL Editor ausgeführt werden — Schema zuerst.

Wichtig bei Schema-Änderungen: Das Frontend geht live, sobald auf `main` gepusht wird. Ein Push, bevor das passende SQL in Supabase gelaufen ist, macht die Seite für die Familie kaputt. Erst Skript, dann Push.

Solange RLS nicht aktiv ist, ist das Frontend-Gate reine Kosmetik: der `anon`-Key steht im Quelltext der öffentlichen Seite und erlaubt dann jeden Direktzugriff auf die Tabelle.

## Stolperfallen (waren schon einmal Bugs)

1. Das `<script src>` muss die echte Bundle-URL des UMD-Builds sein (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`) — `https://jsdelivr.net` allein lädt nur die CDN-Startseite.
2. Der globale Name der Bibliothek ist `supabase`. Der eigene Client heißt deshalb `db`; eine Zeile wie `const supabase = supabase.createClient(...)` wirft `SyntaxError`/`ReferenceError`. `db` nicht umbenennen.
3. `SUPABASE_URL` ist nur die Projekt-Basis-URL (`https://<ref>.supabase.co`), ohne `/rest/v1/` — den REST-Pfad hängt der Client selbst an.
4. Aufgaben-Text läuft in `renderTodos()` durch `escapeHtml()`, weil die `<li>` per `innerHTML` inklusive `onclick`-Attributen gebaut werden. Beim Erweitern des Templates beibehalten.
5. **Policies sind ODER-verknüpft.** In diesem Projekt lagen aus Supabase-Vorlagen vier Regeln „Erlaube … für alle" auf `{public}` mit `using (true)`. Daneben korrekte `{authenticated}`-Regeln zu stellen nützt nichts — eine einzige offene Regel genügt, und der öffentliche anon-Key darf wieder alles. `rls-todos.sql` löscht deshalb per `do`-Block *alle* Policies auf `todos` und baut nur die vier eigenen neu auf; Policies niemals über eine Namensliste aufräumen.
6. Zugriffsschutz nur am Frontend zu prüfen ist wertlos — die Login-Maske sah korrekt aus, während die Tabelle für jeden offen war. Immer ausgeloggt in der Browser-Konsole direkt gegen `db.from('todos')` testen, lesend **und** schreibend. Schreibtests nur gegen nicht existierende IDs, nie gegen echte Familiendaten.

## Repo-Eigenheit

Es gab einen versehentlichen zweiten Klon desselben Repos unter `Krahpokalypse/`; sein Inhalt ist in die äußere `index.html` übernommen und der Ordner geleert. Falls dort noch ein leeres Verzeichnis liegt, kann es gelöscht werden — es gehört nicht zum Projekt. Das äußere Repo hat zwei Remotes auf dasselbe GitHub-Projekt (`Krahpokalypse` und `PhilippKrah`); beim Pushen den richtigen wählen.

## Lokal ansehen

Datei direkt im Browser öffnen genügt für Layout-Änderungen. Für Supabase-Zugriffe besser über einen lokalen Server (`file://`-Origins können an CORS scheitern):

```bash
python -m http.server 8000
```

Es gibt keine Tests, keinen Linter und keine Build-Konfiguration im Repo.

## Sprache

Nutzer und Code kommunizieren auf Deutsch — UI-Texte, Kommentare und Commit-/Antwort-Sprache entsprechend Deutsch halten.
