-- License Stop Marking: one case per stop-marking notice from BIS (report, review, AI reply, lift).
-- The licence's bis_projects.status is set to 'stop_marking' while a case is open and restored when it closes.

create table if not exists public.bis_stop_marking_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  is_code_id uuid not null references public.is_codes(id) on delete restrict,
  bis_project_id uuid references public.bis_projects(id) on delete set null,
  cm_l_digits text,
  project_kind text,
  stop_date date not null default current_date,
  -- Licence status to put back when the case is closed (marking resumed).
  previous_project_status text not null default 'completed',
  report_path text,
  report_name text,
  -- Facts read from the BIS report (by AI or typed) and the reviewer's own points.
  bis_reference text not null default '',
  bis_reason text not null default '',
  bis_deadline date,
  review_notes text not null default '',
  reply_draft text not null default '',
  reply_date date,
  status text not null default 'open',
  notes text not null default '',
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bis_stop_marking_cases
  drop constraint if exists bis_stop_marking_cases_status_check;
alter table public.bis_stop_marking_cases
  add constraint bis_stop_marking_cases_status_check
  check (status in ('open', 'reviewed', 'replied', 'closed'));

create index if not exists bis_stop_marking_cases_client_id_idx on public.bis_stop_marking_cases(client_id);
create index if not exists bis_stop_marking_cases_project_idx on public.bis_stop_marking_cases(bis_project_id);
create index if not exists bis_stop_marking_cases_created_at_idx on public.bis_stop_marking_cases(created_at desc);

alter table public.bis_stop_marking_cases enable row level security;
drop policy if exists "bis_stop_marking_cases_all" on public.bis_stop_marking_cases;
create policy "bis_stop_marking_cases_all"
  on public.bis_stop_marking_cases for all to authenticated
  using (true) with check (true);

drop trigger if exists bis_stop_marking_cases_touch_updated_at on public.bis_stop_marking_cases;
create trigger bis_stop_marking_cases_touch_updated_at
  before update on public.bis_stop_marking_cases
  for each row execute function public.touch_updated_at();

-- Licences already in Stop Marking before this module existed keep appearing: give each one an open case.
insert into public.bis_stop_marking_cases (client_id, is_code_id, bis_project_id, cm_l_digits, project_kind, stop_date)
select p.client_id, p.is_code_id, p.id, p.cm_l_digits, p.project_kind, coalesce(p.updated_at::date, current_date)
from public.bis_projects p
where p.status = 'stop_marking'
  and p.client_id is not null
  and p.is_code_id is not null
  and not exists (select 1 from public.bis_stop_marking_cases c where c.bis_project_id = p.id);
