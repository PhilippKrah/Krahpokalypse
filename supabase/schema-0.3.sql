-- Schema-Erweiterung für Version 0.3: zurückgestellte Aufgaben ("Später")
--
-- Auszuführen im Supabase-Dashboard unter "SQL Editor" > "New query" > "Run".
-- Die Policies aus rls-todos.sql bleiben unverändert gültig.
--
-- Unterschied der beiden terminlosen Ablagen:
--   deferred = false, due_date = null  ->  "Ohne Datum": frischer Eingang, steht oben
--   deferred = true                    ->  "Später": bewusst weggelegt, steht unten

alter table public.todos
    add column if not exists deferred boolean not null default false;

-- Kontrolle
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'todos' and column_name = 'deferred';
