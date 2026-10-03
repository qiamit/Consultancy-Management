-- Idempotent record of license_surveillance and bis_sample_failure_replies (already live on Railway Postgres).

create table if not exists public.license_surveillance (
  id uuid primary key default gen_random_uuid(),
  bis_project_id uuid references public.bis_projects(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  is_code_id uuid not null references public.is_codes(id) on delete restrict,
  cm_l_digits text,
  project_kind text,
  surveillance_date date not null,
  allotted_employee_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists license_surveillance_client_id_idx
  on public.license_surveillance(client_id);
create index if not exists license_surveillance_surveillance_date_idx
  on public.license_surveillance(surveillance_date desc);

alter table public.license_surveillance enable row level security;
drop policy if exists "license_surveillance_all" on public.license_surveillance;
create policy "license_surveillance_all"
  on public.license_surveillance for all to authenticated
  using (true) with check (true);

drop trigger if exists license_surveillance_touch_updated_at on public.license_surveillance;
create trigger license_surveillance_touch_updated_at
  before update on public.license_surveillance
  for each row execute function public.touch_updated_at();

create table if not exists public.bis_sample_failure_replies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  is_code_id uuid not null references public.is_codes(id) on delete restrict,
  bis_project_id uuid references public.bis_projects(id) on delete set null,
  cm_l_digits text,
  project_kind text,
  sample_failure_type text not null,
  sample_code text not null default '',
  sample_qr_code text not null default '',
  failure_letter_path text,
  failure_letter_name text,
  offer_letter_path text,
  offer_letter_name text,
  factory_test_report_path text,
  factory_test_report_name text,
  reply_draft text not null default '',
  status text not null default 'open',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bis_sample_failure_replies
  drop constraint if exists bis_sample_failure_replies_sample_failure_type_check;
alter table public.bis_sample_failure_replies
  add constraint bis_sample_failure_replies_sample_failure_type_check
  check (sample_failure_type in ('pi_sample', 'market_sample', 'surveillance_sample', 'verification_sample'));

alter table public.bis_sample_failure_replies
  drop constraint if exists bis_sample_failure_replies_status_check;
alter table public.bis_sample_failure_replies
  add constraint bis_sample_failure_replies_status_check
  check (status in ('open', 'drafted', 'submitted', 'closed'));

create index if not exists bis_sample_failure_replies_client_id_idx
  on public.bis_sample_failure_replies(client_id);
create index if not exists bis_sample_failure_replies_created_at_idx
  on public.bis_sample_failure_replies(created_at desc);
create index if not exists bis_sample_failure_replies_cm_l_digits_idx
  on public.bis_sample_failure_replies(cm_l_digits);

alter table public.bis_sample_failure_replies enable row level security;
drop policy if exists "bis_sample_failure_replies_all" on public.bis_sample_failure_replies;
create policy "bis_sample_failure_replies_all"
  on public.bis_sample_failure_replies for all to authenticated
  using (true) with check (true);

drop trigger if exists bis_sample_failure_replies_touch_updated_at on public.bis_sample_failure_replies;
create trigger bis_sample_failure_replies_touch_updated_at
  before update on public.bis_sample_failure_replies
  for each row execute function public.touch_updated_at();
