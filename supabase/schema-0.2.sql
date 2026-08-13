-- Schema-Erweiterung für Version 0.2: Besitzer, Sichtbarkeit und Fälligkeitsdatum
--
-- Auszuführen im Supabase-Dashboard unter "SQL Editor" > "New query" > "Run".
-- Reihenfolge: ZUERST dieses Skript, DANACH rls-todos.sql.
--
-- Das Skript ist wiederholbar: 'if not exists' und ein Nachtrag, der nur leere
-- Werte füllt. Ein zweiter Lauf ändert nichts mehr.

-- 1. Besitzer der Aufgabe.
-- Erst ohne 'not null' anlegen, denn die bereits vorhandenen Zeilen haben noch
-- keinen Besitzer und ein Default wirkt nicht rückwirkend.
alter table public.todos
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Bestehende Aufgaben dem eigenen Account zuschreiben.
-- Falls du eine andere Adresse verwendest: hier anpassen.
update public.todos
set user_id = (select id from auth.users where email = 'philippkrah87@gmail.com')
where user_id is null;

-- 3. Jetzt darf die Spalte Pflicht werden.
-- auth.uid() liefert beim Anlegen aus der App automatisch den angemeldeten Nutzer,
-- damit die App die Spalte nie selbst mitschicken muss.
alter table public.todos
    alter column user_id set default auth.uid();

alter table public.todos
    alter column user_id set not null;

-- 4. Sichtbarkeit: 'privat' sieht nur der Besitzer, 'geteilt' sehen beide.
-- Standard ist bewusst 'privat' — geteilt wird nur, was aktiv geteilt wird.
alter table public.todos
    add column if not exists visibility text not null default 'privat';

alter table public.todos
    drop constraint if exists todos_visibility_check;

alter table public.todos
    add constraint todos_visibility_check
    check (visibility in ('privat', 'geteilt'));

-- 5. Fälligkeitsdatum. Leer (null) bedeutet "Ohne Datum" — das ist ein
-- vollwertiger Zustand, kein Fehler.
alter table public.todos
    add column if not exists due_date date;

create index if not exists todos_due_date_idx on public.todos (due_date);

-- 6. Kontrolle: sollte die neuen Spalten und für jede Zeile einen Besitzer zeigen.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'todos'
order by ordinal_position;

select count(*) as zeilen_ohne_besitzer from public.todos where user_id is null;
