-- Invented data for testing tc.sh fetch and mask.sql without any real record. Load it into a database that a
-- fake server stands in for (README: "Testing the scripts"). Every name, address and number here is made up.
create extension if not exists citext with schema public;
create schema if not exists private;

create table public.clients (id uuid primary key default gen_random_uuid(), name text, company_name text, email text,
  phone text, mobile text, address text, gst_number text, contact_person_name text, city text, notes text, manak_user_id text);
create table public.client_contacts (id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id),
  contact_role text not null default 'Other', name text, designation text, mobile text, email text);
create table public.bis_projects (id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id),
  title text, notes text, portal_user_id text, portal_password text, cm_l_digits text, license_number text, project_kind text,
  status text not null default 'in_progress' check (status in ('lead', 'in_progress', 'submitted', 'completed')));
create table public.bis_project_module_data (id uuid primary key default gen_random_uuid(), bis_project_id uuid references public.bis_projects(id),
  module_kind text, payload jsonb);
create table public.user_profiles (id uuid primary key, full_name text, email text, mobile text, role text);
create table public.ai_models (id uuid primary key default gen_random_uuid(), provider text, api_key text);
create table public.company_settings (id int primary key, company_name text, bank_account_number text, bank_ifsc text,
  bank_upi_id text, bank_account_holder_name text);
create table public.assistant_mail_messages (id uuid primary key default gen_random_uuid(), from_addr text, subject text, body_text text);
create table public.audit_log (id bigserial primary key, table_name text, old_data jsonb, new_data jsonb);
create table private.bis_portal_secrets (project_id uuid primary key, secret bytea);
-- As on the server: pg_trgm lives in the schema extensions and a search index uses it.
create extension if not exists pg_trgm with schema extensions;
create index clients_company_name_trgm on public.clients using gin (company_name extensions.gin_trgm_ops);

insert into public.clients (name, company_name, email, phone, mobile, address, gst_number, contact_person_name, city, notes, manak_user_id) values
  ('Shree Ganesh Pipes Pvt Ltd', 'Shree Ganesh Pipes Pvt Ltd', 'accounts@ganeshpipes.example.com', '9876543210', '+91 9123456780',
   'Plot 12, Phase 2, Industrial Area, Faridabad', '06ABCDE1234F1Z5', 'Rakesh Sharma', 'Faridabad',
   'Call Rakesh Sharma on 9876543210 before the visit.', 'ganesh.pipes'),
  ('Om Steel Tubes LLP', 'Om Steel Tubes LLP', 'om.steel@example.org', '8899776655', null,
   'Survey 44, Ring Road, Raipur', '22PQRST6789K1Z2', 'Sunita Verma', 'Raipur', null, 'omsteel01');
insert into public.client_contacts (client_id, name, designation, mobile, email)
  select id, 'Mahesh Gupta', 'Partner', '7766554433', 'mahesh@example.org' from public.clients where company_name = 'Om Steel Tubes LLP';
-- As on the server: CM/L numbers are 10 digits starting 6-9 (like a mobile number) and unique except for Inclusions.
create unique index bis_projects_cm_l_digits_uidx on public.bis_projects (cm_l_digits)
  where cm_l_digits is not null and lower(coalesce(project_kind, '')) <> 'inclusion';
insert into public.bis_projects (client_id, title, notes, portal_user_id, portal_password, cm_l_digits, license_number, project_kind)
  select id, company_name || ' — IS 1161: 2014', 'Scope for ' || company_name || ', licence CM/L-' || cml, manak_user_id,
         'encrypted-elsewhere', cml, 'CM/L-' || cml, 'licence'
    from (select c.*, case when company_name like 'Shree%' then '7600012345' else '8400098765' end cml from public.clients c) c;
insert into public.bis_projects (client_id, title, cm_l_digits, license_number, project_kind)
  select id, 'Inclusion for CM/L-7600012345', '7600012345', 'CM/L-7600012345', 'inclusion' from public.clients where company_name like 'Shree%';
insert into public.bis_project_module_data (bis_project_id, module_kind, payload)
  select p.id, 'top-management', jsonb_build_object('rows', jsonb_build_array(
    jsonb_build_object('personName', 'Anil Kumar Jain', 'designation', 'Director', 'email', 'anil.jain@example.com', 'mobile', '9988776655'),
    jsonb_build_object('personName', 'Priya Singh', 'designation', 'Partner', 'email', '', 'mobile', '8877665544')),
    'signatoryName', 'Anil Kumar Jain', 'note', 'Signed by Anil Kumar Jain for ' || c.company_name)
  from public.bis_projects p join public.clients c on c.id = p.client_id;
insert into public.ai_models (provider, api_key) values ('deepseek', 'sk-not-a-real-key-0000');
insert into public.company_settings values (1, 'Q Engineering', '123456789012', 'HDFC0001234', 'qe@upi', 'Q Engineering');
insert into public.assistant_mail_messages (from_addr, subject, body_text) values ('someone@example.net', 'Renewal', 'Please renew.');
insert into public.audit_log (table_name, old_data, new_data)
  select 'clients', null, to_jsonb(c) from public.clients c;
insert into private.bis_portal_secrets select id, '\x00'::bytea from public.bis_projects;

-- Two sign-ins (the sign-in service's own table, as GoTrue creates it).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, phone)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
        'owner@realcompany.example.com', 'x', now(), now(), now(), '{}', '{"full_name":"Amit Owner"}', '919812345678'),
       ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
        'staff@realcompany.example.com', 'x', now(), now(), now(), '{}', '{}', null);
insert into public.user_profiles values
  ('11111111-1111-1111-1111-111111111111', 'Amit Owner', 'owner@realcompany.example.com', '9812345678', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Staff Member', 'staff@realcompany.example.com', null, 'user');
