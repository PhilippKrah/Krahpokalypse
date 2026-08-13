# Backlog

Ideen, die bewusst zurückgestellt sind. Reihenfolge ist keine Priorisierung.

## Rückfallebene ohne Internet

**Wunsch:** Wenn Vercel, Supabase, GitHub oder schlicht das Mobilfunknetz nicht erreichbar sind, soll auf dem Handy wenigstens der letzte bekannte Stand der Liste lesbar sein.

**Geht das? Ja, in zwei Ausbaustufen:**

1. *Lesen offline* — Ein Service Worker legt `index.html` samt Icons in den Browser-Cache, zusätzlich wird nach jedem erfolgreichen Laden die Aufgabenliste in `localStorage` gespiegelt. Ohne Netz startet die App aus dem Cache und zeigt den gespiegelten Stand mit einem deutlichen Hinweis „offline, Stand von …". Das deckt den geschilderten Fall ab und ist überschaubar.

   Haken: Ohne Netz gibt es keine Supabase-Session-Erneuerung. Der Zugriffsschutz muss dann bewusst geregelt werden — ein offline gespiegelter Stand liegt unverschlüsselt im Browser des Geräts. Für ein Familien-Handy vertretbar, sollte aber eine bewusste Entscheidung sein.

2. *Auch schreiben offline* — Änderungen wandern in eine Warteschlange und werden nachgespielt, sobald wieder Netz da ist. Deutlich aufwendiger: Es braucht eine Konfliktbehandlung, wenn beide Geräte dieselbe Aufgabe geändert haben. Nur angehen, wenn Stufe 1 sich als zu wenig erweist.

**Zusätzliche Absicherung, unabhängig davon:** Die App liegt komplett in einer Datei. Ein Duplikat davon auf dem Handy (oder in einer Notiz) reicht, um sie notfalls direkt aus dem Dateisystem zu öffnen. Nützt nur nichts, wenn Supabase das Problem ist — dann fehlen die Daten.

## Weitere zurückgestellte Punkte

- **Zuweisen an den anderen** — zu zweit vermutlich überflüssig, erst beobachten, ob es fehlt.
- **Wiederholungen** („jeden Dienstag Müll") — häufiger Familienbedarf, aber eigenes Datenmodell.
- **Live-Sync zwischen den Geräten** — Supabase Realtime, technisch billig, hoher Wow-Effekt. Nächster echter Kandidat.
- **Echte Push-Benachrichtigungen** — teuer (Service Worker, Schlüssel, Serverfunktion, iOS-Sonderregeln), Nutzen zu zweit fraglich.
- **Freies Sortieren per Drag&Drop innerhalb eines Tages** — kann sie in der Notizen-App, bei uns bewusst weggelassen. Wahrscheinlichster Vermisst-Kandidat, deshalb: abwarten und fragen.
- **Erledigtes ohne Datum aufräumen** — datierte Erledigte verschwinden automatisch, undatierte sammeln sich. Erst ändern, wenn es wirklich stört.
