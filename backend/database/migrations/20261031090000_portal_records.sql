-- Customer Portal, Phase 2 (2026-10-31): QC + production records per licence (paid service).
--   portal_services        one row per licence: records service on/off, 30-day trial end, paid-until date.
--   portal_rec_sections    per licence: Raw Material, In-Process, Final Testing, Batch / Lot, custom sections.
--   portal_rec_columns     columns of a section, designed by Q Engineering only (admin).
--   portal_rec_entries     the customer's daily entries (values keyed by column key).
-- Customers stay locked out of every table (customer_lockout from 20261030235000). They read and write only through
-- the portal_* functions below, which check the licence is assigned to the login and, for writes, that the
-- service is active (trial or paid). Staff with Client Master access can read; only admins design and switch on.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

-- ── Tables ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_services (
  project_id      uuid PRIMARY KEY REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  records_enabled boolean NOT NULL DEFAULT false,
  trial_ends      date,
  paid_until      date,
  enabled_at      timestamptz,
  enabled_by      uuid,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portal_rec_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'custom'
                CHECK (kind IN ('raw_material', 'in_process', 'final_test', 'batch', 'custom')),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_rec_sections_project_idx ON public.portal_rec_sections (project_id, sort_order);

CREATE TABLE IF NOT EXISTS public.portal_rec_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES public.portal_rec_sections(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label       text NOT NULL,
  col_type    text NOT NULL
                CHECK (col_type IN ('text', 'number', 'spec', 'date', 'select', 'formula', 'link', 'pass_fail', 'attachment')),
  unit        text,
  spec_min    numeric,
  spec_max    numeric,
  -- select: {"options": [...]}; formula: {"formula": "..."}; link: {"section_id": "..."}; number: {"decimals": n}
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  required    boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, key)
);
CREATE INDEX IF NOT EXISTS portal_rec_columns_section_idx ON public.portal_rec_columns (section_id, sort_order);

CREATE TABLE IF NOT EXISTS public.portal_rec_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES public.portal_rec_sections(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  entry_date  date NOT NULL DEFAULT current_date,
  ref_no      text,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  result      text CHECK (result IN ('pass', 'fail')),
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_rec_entries_section_idx ON public.portal_rec_entries (section_id, entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_rec_entries_project_idx ON public.portal_rec_entries (project_id, entry_date DESC);

-- An entry always belongs to the licence of its section.
CREATE OR REPLACE FUNCTION public.portal_rec_entries_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT s.project_id INTO NEW.project_id FROM public.portal_rec_sections s WHERE s.id = NEW.section_id;
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'Section not found' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_rec_entries_project ON public.portal_rec_entries;
CREATE TRIGGER portal_rec_entries_project BEFORE INSERT OR UPDATE ON public.portal_rec_entries
  FOR EACH ROW EXECUTE FUNCTION public.portal_rec_entries_project();

-- ── Staff policies (customers are locked out by customer_lockout, added at the end) ──────────────────
ALTER TABLE public.portal_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_rec_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_rec_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_rec_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_services', 'portal_rec_sections', 'portal_rec_columns', 'portal_rec_entries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view(''/masters/clients'')))',
                   t || '_staff_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING ((SELECT public.app_is_admin())) WITH CHECK ((SELECT public.app_is_admin()))',
                   t || '_admin_write', t);
  END LOOP;
END $$;

-- ── Service state ────────────────────────────────────────────────────────────────────────────────────
-- 'off' | 'trial' | 'active' | 'expired', and the last day it is usable.
CREATE OR REPLACE FUNCTION public.portal_service_state(p_project_id uuid)
RETURNS TABLE (state text, valid_till date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN s.project_id IS NULL OR NOT s.records_enabled THEN 'off'
           WHEN s.paid_until IS NOT NULL AND s.paid_until >= current_date THEN 'active'
           WHEN s.trial_ends IS NOT NULL AND s.trial_ends >= current_date THEN 'trial'
           ELSE 'expired'
         END,
         GREATEST(s.paid_until, s.trial_ends)
    FROM (SELECT p_project_id AS id) x
    LEFT JOIN public.portal_services s ON s.project_id = x.id;
$$;
REVOKE ALL ON FUNCTION public.portal_service_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_service_state(uuid) TO authenticated;

-- ── Customer functions ───────────────────────────────────────────────────────────────────────────────
-- Dashboard: every assigned licence with validity, records service and this month's entry counts.
CREATE OR REPLACE FUNCTION public.portal_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', l.id, 'cm_l_digits', l.cm_l_digits, 'is_number', l.is_number, 'is_year', l.is_year,
               'is_title', l.is_title, 'license_validity_date', l.license_validity_date, 'company_name', l.company_name,
               'service', st.state, 'service_valid_till', st.valid_till,
               'entries_month', (SELECT count(*) FROM public.portal_rec_entries e
                                  WHERE e.project_id = l.id AND e.entry_date >= date_trunc('month', current_date)),
               'fails_month', (SELECT count(*) FROM public.portal_rec_entries e
                                WHERE e.project_id = l.id AND e.result = 'fail'
                                  AND e.entry_date >= date_trunc('month', current_date)),
               'last_entry', (SELECT max(e.entry_date) FROM public.portal_rec_entries e WHERE e.project_id = l.id),
               -- Sections show only once the service was switched on (trial, paid or expired = view only).
               'sections', CASE WHEN st.state = 'off' THEN '[]'::jsonb ELSE COALESCE((
                             SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                                              ORDER BY s.sort_order, s.name)
                               FROM public.portal_rec_sections s WHERE s.project_id = l.id), '[]') END
             ) ORDER BY l.license_validity_date NULLS LAST)
        FROM public.portal_my_licences() l
        CROSS JOIN LATERAL public.portal_service_state(l.id) st), '[]'),
    'recent', COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'created_at' DESC)
        FROM (SELECT jsonb_build_object('id', e.id, 'section', s.name, 'project_id', e.project_id,
                                        'entry_date', e.entry_date, 'ref_no', e.ref_no, 'result', e.result,
                                        'created_at', e.created_at) AS r
                FROM public.portal_rec_entries e
                JOIN public.portal_rec_sections s ON s.id = e.section_id
               WHERE public.portal_can_see_licence(e.project_id)
               ORDER BY e.created_at DESC
               LIMIT 8) x), '[]')
  );
$$;
REVOKE ALL ON FUNCTION public.portal_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_dashboard() TO authenticated;

-- A section with its columns, for the customer's entry screen (only on an assigned licence).
CREATE OR REPLACE FUNCTION public.portal_section(p_section_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
  v jsonb;
BEGIN
  SELECT project_id INTO v_project FROM public.portal_rec_sections WHERE id = p_section_id;
  IF v_project IS NULL OR NOT public.portal_can_see_licence(v_project)
     OR (SELECT state FROM public.portal_service_state(v_project)) = 'off' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
           'id', s.id, 'project_id', s.project_id, 'name', s.name, 'kind', s.kind,
           'service', (SELECT jsonb_build_object('state', st.state, 'valid_till', st.valid_till)
                         FROM public.portal_service_state(s.project_id) st),
           'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'key', c.key, 'label', c.label, 'col_type', c.col_type, 'unit', c.unit,
                                   'spec_min', c.spec_min, 'spec_max', c.spec_max, 'config', c.config,
                                   'required', c.required) ORDER BY c.sort_order, c.label)
                                  FROM public.portal_rec_columns c WHERE c.section_id = s.id), '[]'))
    INTO v
    FROM public.portal_rec_sections s
   WHERE s.id = p_section_id;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_section(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_section(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_entries(p_section_id uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.portal_rec_sections WHERE id = p_section_id;
  IF v_project IS NULL OR NOT public.portal_can_see_licence(v_project)
     OR (SELECT state FROM public.portal_service_state(v_project)) = 'off' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT jsonb_build_object('id', e.id, 'entry_date', e.entry_date, 'ref_no', e.ref_no, 'data', e.data,
                              'result', e.result, 'created_at', e.created_at, 'updated_at', e.updated_at)
      FROM public.portal_rec_entries e
     WHERE e.section_id = p_section_id
       AND (p_from IS NULL OR e.entry_date >= p_from)
       AND (p_to IS NULL OR e.entry_date <= p_to)
     ORDER BY e.entry_date DESC, e.created_at DESC
     LIMIT 2000;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_entries(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_entries(uuid, date, date) TO authenticated;

-- Entries of a linked section, for "Link" columns (any section of the same licence).
CREATE OR REPLACE FUNCTION public.portal_link_options(p_section_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.portal_rec_sections WHERE id = p_section_id;
  IF v_project IS NULL OR NOT public.portal_can_see_licence(v_project)
     OR (SELECT state FROM public.portal_service_state(v_project)) = 'off' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT jsonb_build_object('id', e.id, 'entry_date', e.entry_date, 'ref_no', e.ref_no, 'result', e.result)
      FROM public.portal_rec_entries e
     WHERE e.section_id = p_section_id
     ORDER BY e.entry_date DESC, e.created_at DESC
     LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_link_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_link_options(uuid) TO authenticated;

-- Add or change an entry. Only while the records service of the licence is in trial or paid.
CREATE OR REPLACE FUNCTION public.portal_entry_save(
  p_section_id uuid, p_entry_id uuid, p_entry_date date, p_ref_no text, p_values jsonb, p_result text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
  v_state   text;
  v_id      uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.portal_rec_sections WHERE id = p_section_id;
  IF v_project IS NULL OR NOT public.portal_can_see_licence(v_project)
     OR (SELECT state FROM public.portal_service_state(v_project)) = 'off' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO v_state FROM public.portal_service_state(v_project);
  IF v_state NOT IN ('trial', 'active') THEN
    RAISE EXCEPTION 'The records service of this licence is not active. Please contact Q Engineering.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_values, '{}'::jsonb)) <> 'object' OR length(p_values::text) > 100000 THEN
    RAISE EXCEPTION 'Invalid entry' USING ERRCODE = '22023';
  END IF;
  IF p_result IS NOT NULL AND p_result NOT IN ('pass', 'fail') THEN
    RAISE EXCEPTION 'Invalid result' USING ERRCODE = '22023';
  END IF;

  IF p_entry_id IS NULL THEN
    INSERT INTO public.portal_rec_entries (section_id, project_id, entry_date, ref_no, data, result, created_by, updated_by)
    VALUES (p_section_id, v_project, COALESCE(p_entry_date, current_date), NULLIF(trim(p_ref_no), ''),
            COALESCE(p_values, '{}'::jsonb), p_result, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.portal_rec_entries
       SET entry_date = COALESCE(p_entry_date, entry_date), ref_no = NULLIF(trim(p_ref_no), ''),
           data = COALESCE(p_values, '{}'::jsonb), result = p_result, updated_by = auth.uid()
     WHERE id = p_entry_id AND section_id = p_section_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Entry not found' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_entry_save(uuid, uuid, date, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_entry_save(uuid, uuid, date, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_entry_delete(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
  v_state   text;
BEGIN
  SELECT project_id INTO v_project FROM public.portal_rec_entries WHERE id = p_entry_id;
  IF v_project IS NULL OR NOT public.portal_can_see_licence(v_project)
     OR (SELECT state FROM public.portal_service_state(v_project)) = 'off' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO v_state FROM public.portal_service_state(v_project);
  IF v_state NOT IN ('trial', 'active') THEN
    RAISE EXCEPTION 'The records service of this licence is not active.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.portal_rec_entries WHERE id = p_entry_id;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_entry_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_entry_delete(uuid) TO authenticated;

-- New tables get the customer lockout like every other table.
SELECT public.app_apply_customer_lockout();

NOTIFY pgrst, 'reload schema';
