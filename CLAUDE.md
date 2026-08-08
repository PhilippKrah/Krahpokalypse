# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

Privates Familienprojekt: eine Familien-To-Do-Liste, die über eine Web-URL erreichbar ist. Später sollen ggf. weitere kleine Familien-Projekte dazukommen. Stack (alles bereits eingerichtet, nichts neu anzulegen):

- **Supabase** — Datenbank/Backend, Tabelle `todos` mit den Spalten `id`, `task`, `is_completed`, `created_at`.
- **Vercel** — Hosting, per Git-Integration an das GitHub-Repo angeschlossen.
- **GitHub** — `PhilippKrah/Krahpokalypse`, Branch `main`.

Deploy-Weg: Commit auf `main` → Push → Vercel deployt automatisch. Es gibt keinen Build-Schritt.

## Architektur

Die gesamte App ist eine einzige statische Datei: [index.html](index.html) — HTML, CSS (`<style>`) und JS (`<script>`) in einem Dokument, ohne Build-Tools, ohne npm, ohne Framework. Der Supabase-JS-Client wird per `<script src>` aus einem CDN geladen; `SUPABASE_URL` und der `anon`-Key stehen im Klartext im Script (bei diesem Setup ist der anon-Key öffentlich und das erwartet — der Schutz muss über Row Level Security in Supabase kommen, nicht über Geheimhaltung des Keys).

Datenfluss: alle Mutationen (`addTodo`, `toggleTodo`, `deleteTodo`) schreiben direkt in Supabase und rufen danach `loadTodos()` auf, das das globale Array `todos` komplett neu füllt und `renderTodos()` auslöst. Es gibt keinen lokalen State, der ohne Roundtrip aktualisiert wird — bei Änderungen an der Logik dieses Muster beibehalten. `renderTodos()` erzeugt die `<li>`-Elemente per `innerHTML` mit `onclick="…"`-Attributen, die auf globale Funktionen zeigen; die Funktionen müssen also global bleiben (kein Modul-Scope, kein `type="module"`, solange dieses Muster gilt). `drawCanvasStats()` zeichnet am Ende von `renderTodos()` den Fortschrittsbalken aufs `<canvas id="statusCanvas">`.

## Zugriffsschutz

Zwei Hälften, die zusammengehören — eine allein schützt nichts:

- **Im Frontend:** `db.auth.onAuthStateChange(...)` ist der einzige Einstiegspunkt der App. Ohne Session zeigt `showView()` nur `#authView` (Login per `signInWithPassword`), mit Session `#appView`; `loadTodos()` läuft ausschließlich mit Session. Kein Registrieren-Formular — Accounts der Familienmitglieder legt der Nutzer im Supabase-Dashboard unter Authentication > Users an. Diese Sichtbarkeits-Logik nur anfassen, wenn klar ist, dass `#appView` ohne Session verborgen bleibt.
- **In Supabase:** [supabase/rls-todos.sql](supabase/rls-todos.sql) schaltet RLS auf `todos` ein und vergibt select/insert/update/delete nur an die Rolle `authenticated` (gemeinsame Familienliste, keine `user_id`-Trennung). Die Rolle `anon` hat bewusst keine Policy. Das Skript ist wiederholbar (`drop policy if exists`) und muss vom Nutzer im SQL Editor ausgeführt werden.

Solange RLS nicht aktiv ist, ist das Frontend-Gate reine Kosmetik: der `anon`-Key steht im Quelltext der öffentlichen Seite und erlaubt dann jeden Direktzugriff auf die Tabelle.

## Stolperfallen (waren schon einmal Bugs)

1. Das `<script src>` muss die echte Bundle-URL des UMD-Builds sein (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`) — `https://jsdelivr.net` allein lädt nur die CDN-Startseite.
2. Der globale Name der Bibliothek ist `supabase`. Der eigene Client heißt deshalb `db`; eine Zeile wie `const supabase = supabase.createClient(...)` wirft `SyntaxError`/`ReferenceError`. `db` nicht umbenennen.
3. `SUPABASE_URL` ist nur die Projekt-Basis-URL (`https://<ref>.supabase.co`), ohne `/rest/v1/` — den REST-Pfad hängt der Client selbst an.
4. Aufgaben-Text läuft in `renderTodos()` durch `escapeHtml()`, weil die `<li>` per `innerHTML` inklusive `onclick`-Attributen gebaut werden. Beim Erweitern des Templates beibehalten.

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
