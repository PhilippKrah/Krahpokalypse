-- Schema-Erweiterung für Version 0.4: eigene Reihenfolge innerhalb eines Tages
--
-- Auszuführen im Supabase-Dashboard unter "SQL Editor" > "New query" > "Run".
-- Die Policies aus rls-todos.sql bleiben unverändert gültig.
--
-- sort_order bleibt leer, bis jemand eine Aufgabe mit ↑/↓ verschiebt. Solange
-- sortiert die App nach dem Anlegezeitpunkt (Neues unten). Ein Pfeil-Tipp setzt
-- den Wert auf die Mitte zwischen den neuen Nachbarn — deshalb Kommazahl.

alter table public.todos
    add column if not exists sort_order double precision;

-- Kontrolle
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'todos' and column_name = 'sort_order';
