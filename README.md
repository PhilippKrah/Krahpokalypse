# Krahpokalypse

Private Familien-Anwendungen, als statische Seiten über Vercel veröffentlicht.

- **Familien-Planer** (`index.html`) — gemeinsame Aufgabenliste mit Supabase als Backend
- **Apps** (`apps/`) — Startmenü über alle Anwendungen
- **Der Gutsverwalter** (`spiele/foerster/`) — Spiel, wird aus einem separaten Repo hierher veröffentlicht

Kein Build-Schritt, keine Abhängigkeiten. Lokal ansehen:

```bash
python -m http.server 8765
```

Für die Mitarbeit: [CLAUDE.md](CLAUDE.md) (Architektur und Regeln),
[docs/handover.md](docs/handover.md) (Stand und nächste Schritte).
