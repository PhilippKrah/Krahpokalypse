-- Zugriffsschutz für die Familien-To-Do-Liste (Stand 0.2)
--
-- Auszuführen im Supabase-Dashboard unter "SQL Editor" > "New query" > "Run".
-- WICHTIG: vorher schema-0.2.sql laufen lassen, dieses Skript braucht die
-- Spalten user_id und visibility.
--
-- Regel in einem Satz: Man sieht die eigenen Aufgaben immer, fremde nur dann,
-- wenn sie geteilt sind. Ohne Login ist die Tabelle komplett dicht.
--
-- Das Skript ist wiederholbar (drop policy if exists).

-- 1. Row Level Security einschalten.
-- Solange RLS aus ist, darf der öffentliche anon-Key aus index.html alles lesen
-- und schreiben — und dieser Key steht für jeden sichtbar im Quelltext der Seite.
alter table public.todos enable row level security;

-- 2. ALLE vorhandenen Policies auf 'todos' entfernen — nicht nur die selbst
-- vergebenen Namen.
--
-- Warum so radikal: Postgres verknüpft Policies mit ODER. Eine einzige übrig
-- gebliebene Regel für die Rolle 'public' (etwa "Erlaube Lesen für alle" aus
-- einer Supabase-Vorlage) hebelt alles Folgende aus — dann darf der öffentliche
-- anon-Key wieder alles, obwohl daneben korrekte Regeln stehen. Genau das war
-- in diesem Projekt der Fall. Deshalb hier Tabula rasa statt Namensliste.
do $$
declare
    p record;
begin
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'todos'
    loop
        execute format('drop policy %I on public.todos', p.policyname);
    end loop;
end $$;

-- 3. Lesen: eigene Aufgaben und alles, was geteilt wurde.
create policy "Eigene und geteilte lesen"
    on public.todos for select
    to authenticated
    using (user_id = auth.uid() or visibility = 'geteilt');

-- 4. Anlegen: nur im eigenen Namen.
-- Verhindert, dass jemand eine Aufgabe im Namen des anderen einträgt.
create policy "Nur im eigenen Namen anlegen"
    on public.todos for insert
    to authenticated
    with check (user_id = auth.uid());

-- 5. Ändern: eigene Aufgaben und geteilte des anderen.
-- Geteilte Aufgaben darf bewusst auch der Partner abhaken oder umdatieren —
-- das ist der Sinn einer gemeinsamen Liste.
-- Das 'with check' verhindert, dass man sich eine fremde Aufgabe unter den Nagel
-- reißt, indem man beim Update die user_id auf sich selbst umschreibt.
create policy "Eigene und geteilte aendern"
    on public.todos for update
    to authenticated
    using (user_id = auth.uid() or visibility = 'geteilt')
    with check (user_id = auth.uid() or visibility = 'geteilt');

-- 6. Löschen: gleiche Regel wie beim Ändern.
create policy "Eigene und geteilte loeschen"
    on public.todos for delete
    to authenticated
    using (user_id = auth.uid() or visibility = 'geteilt');

-- 7. Kontrolle. Erwartet: rls_aktiv = true, und GENAU vier Policies, alle mit
-- der Rolle {authenticated}. Taucht hier irgendwo {public} oder {anon} auf,
-- ist die Tabelle offen — dann stimmt etwas nicht.
select relrowsecurity as rls_aktiv from pg_class where relname = 'todos';
select policyname, cmd, roles, qual from pg_policies where tablename = 'todos';
