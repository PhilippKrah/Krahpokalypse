-- Zugriffsschutz für die Familien-To-Do-Liste
--
-- Auszuführen im Supabase-Dashboard unter "SQL Editor" > "New query" > "Run".
-- Wirkung: Ohne Login ist die Tabelle 'todos' komplett dicht. Jedes angemeldete
-- Familienmitglied sieht und bearbeitet dieselbe gemeinsame Liste.
--
-- Achtung: Ab diesem Moment funktioniert die Seite nur noch eingeloggt.
-- Vorher unter "Authentication" > "Users" > "Add user" die Accounts der
-- Familienmitglieder anlegen (E-Mail + Passwort, "Auto Confirm User" aktivieren).

-- 1. Row Level Security einschalten.
-- Solange RLS aus ist, darf der öffentliche anon-Key aus index.html alles lesen
-- und schreiben — und dieser Key steht für jeden sichtbar im Quelltext der Seite.
alter table public.todos enable row level security;

-- 2. Alte Policies entfernen, damit dieses Skript wiederholbar bleibt.
drop policy if exists "Familie darf lesen" on public.todos;
drop policy if exists "Familie darf anlegen" on public.todos;
drop policy if exists "Familie darf aendern" on public.todos;
drop policy if exists "Familie darf loeschen" on public.todos;

-- 3. Rechte ausschließlich für angemeldete Nutzer ('authenticated').
-- Die Rolle 'anon' bekommt bewusst keine einzige Policy und damit keinen Zugriff.
create policy "Familie darf lesen"
    on public.todos for select
    to authenticated
    using (true);

create policy "Familie darf anlegen"
    on public.todos for insert
    to authenticated
    with check (true);

create policy "Familie darf aendern"
    on public.todos for update
    to authenticated
    using (true)
    with check (true);

create policy "Familie darf loeschen"
    on public.todos for delete
    to authenticated
    using (true);

-- 4. Kontrolle: sollte 'true' und die vier Policies oben zeigen.
select relrowsecurity as rls_aktiv from pg_class where relname = 'todos';
select policyname, cmd, roles from pg_policies where tablename = 'todos';
