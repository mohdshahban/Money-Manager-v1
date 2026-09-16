-- Run in the moneymanager project AFTER 001_full_schema.sql. Read-only.

-- 1. tables (expect 6)
select table_name from information_schema.tables
where table_schema='public' and table_type='BASE TABLE' order by 1;

-- 2. foreign keys (expect 11)
select tc.table_name, kcu.column_name, ccu.table_schema||'.'||ccu.table_name as references
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' order by 1,2;

-- 3. indexes
select tablename, indexname from pg_indexes where schemaname='public' order by 1,2;

-- 4. RLS enabled + policy count (expect rls=true, 1 policy each)
select c.relname, c.relrowsecurity as rls, count(p.polname) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_policy p on p.polrelid=c.oid
where n.nspname='public' and c.relkind='r' group by 1,2 order by 1;

-- 5. functions (expect handle_new_user, set_updated_at)
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 1;

-- 6. triggers (expect 5 public BEFORE UPDATE + on_auth_user_created on auth.users)
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema in ('public','auth') order by 1,2,3;

-- 7. storage bucket (expect receipts, public=false, 10485760)
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='receipts';

-- 8. storage policies (expect 4)
select polname from pg_policy where polrelid='storage.objects'::regclass order by 1;
