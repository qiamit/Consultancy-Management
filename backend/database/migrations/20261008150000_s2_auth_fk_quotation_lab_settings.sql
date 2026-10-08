-- S2: (0) fix "Database error creating new user" by repointing legacy FKs from
--     public.app_users to auth.users; (A) lab_settings writes admin-only;
--     (B) quotation terms/notes document_kind + quotation-signatures storage policies.
-- Idempotent: safe to run twice. Runs as the migration superuser (POSTGRES_URL).

-- =====================================================================
-- PART 0 (highest priority): legacy FKs -> auth.users
-- Every GoTrue table (identities, sessions, mfa_*, one_time_tokens, oauth_*,
-- webauthn_*) and ~18 public tables reference public.app_users(id), a legacy
-- table that GoTrue never writes. Creating a user inserts auth.identities
-- with the new id -> FK violation "identities_user_id_app_users_fkey" ->
-- GoTrue 500 "Database error creating new user".
-- Repoint each single-column FK to auth.users(id), keeping its ON DELETE rule.
-- app_users ids == auth.users ids for all existing users (verified), so
-- validation passes. The app_users table itself is left in place.
-- =====================================================================
-- Part 0: repoint every FK that still references the legacy public.app_users to auth.users(id).
-- Root cause of "Database error creating new user": auth.identities.user_id (and sessions, mfa_factors,
-- one_time_tokens, oauth_*, webauthn_*) reference public.app_users, so any NEW GoTrue user fails.
DO $$
DECLARE
  r record;
  new_name text;
BEGIN
  IF to_regclass('public.app_users') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT c.oid,
           c.conrelid,
           c.conrelid::regclass::text AS tbl,
           c.conname,
           a.attname AS col,
           CASE c.confdeltype
             WHEN 'c' THEN 'CASCADE'
             WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT'
             WHEN 'r' THEN 'RESTRICT'
             ELSE 'NO ACTION'
           END AS on_delete
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.app_users'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    new_name := regexp_replace(r.conname, '_app_users_fkey$', '_fkey');
    IF new_name = r.conname
       OR EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conrelid = r.conrelid AND x.conname = new_name) THEN
      new_name := left(r.conname, 50) || '_auth_users_fkey';
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',
      r.tbl, new_name, r.col, r.on_delete
    );
    RAISE NOTICE 'repointed %.% (%) -> auth.users as %', r.tbl, r.col, r.conname, new_name;
  END LOOP;
END $$;

-- =====================================================================
-- PART A: lab_settings — every signed-in user can read, only admins write.
-- Writers in the app: Settings > Lab (director-only route), Quotation
-- "Templates" dialog (document_templates), report-prep print/scope settings
-- (route not mounted). Non-admin writes now affect 0 rows (UPDATE) or fail
-- (INSERT); the UI handles that (see frontend part).
-- =====================================================================
ALTER TABLE public.lab_settings ENABLE ROW LEVEL SECURITY;

-- Column used by QuotationTemplatesDialog / documentTemplatesConfig.ts but
-- missing live (every load/save currently errors).
ALTER TABLE public.lab_settings ADD COLUMN IF NOT EXISTS document_templates jsonb;

DO $$
DECLARE p record;
BEGIN
  -- Drop every existing policy on lab_settings (live: consultancy_lab_settings_all
  -- = ALL/true/authenticated). Permissive policies are OR-ed, so any leftover
  -- would re-open writes.
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lab_settings'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.lab_settings', p.policyname);
  END LOOP;
END $$;

CREATE POLICY lab_settings_select ON public.lab_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lab_settings_admin_insert ON public.lab_settings
  FOR INSERT TO authenticated WITH CHECK (public.app_is_admin());
CREATE POLICY lab_settings_admin_update ON public.lab_settings
  FOR UPDATE TO authenticated USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY lab_settings_admin_delete ON public.lab_settings
  FOR DELETE TO authenticated USING (public.app_is_admin());

-- =====================================================================
-- PART B1: quotation_terms_conditions / quotation_notes.document_kind
-- (from skipped LIMS migration 20260811000001; live tables lack the column,
-- so every request with document_kind=eq.quotation returns 400).
-- Do NOT touch sale_document_signature_defaults (live shape already works).
-- =====================================================================
ALTER TABLE public.quotation_terms_conditions
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'quotation';
ALTER TABLE public.quotation_notes
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'quotation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.quotation_terms_conditions'::regclass
                   AND conname = 'quotation_terms_conditions_document_kind_chk') THEN
    ALTER TABLE public.quotation_terms_conditions
      ADD CONSTRAINT quotation_terms_conditions_document_kind_chk
      CHECK (document_kind IN ('quotation','proformaInvoice','invoice','creditNote','paymentReceipt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.quotation_notes'::regclass
                   AND conname = 'quotation_notes_document_kind_chk') THEN
    ALTER TABLE public.quotation_notes
      ADD CONSTRAINT quotation_notes_document_kind_chk
      CHECK (document_kind IN ('quotation','proformaInvoice','invoice','creditNote','paymentReceipt'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_conditions_one_default_per_kind
  ON public.quotation_terms_conditions (document_kind) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS quotation_notes_one_default_per_kind
  ON public.quotation_notes (document_kind) WHERE is_default;

-- =====================================================================
-- PART B2: storage policies for the quotation-signatures bucket
-- (bucket exists live; its policies from skipped 20260809000016 do not).
-- Same shape as the live lims_laboratory_files_* policies.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects missing, skipping quotation-signatures policies';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS lims_quotation_signatures_select ON storage.objects';
  EXECUTE 'CREATE POLICY lims_quotation_signatures_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''quotation-signatures'')';
  EXECUTE 'DROP POLICY IF EXISTS lims_quotation_signatures_insert ON storage.objects';
  EXECUTE 'CREATE POLICY lims_quotation_signatures_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''quotation-signatures'')';
  EXECUTE 'DROP POLICY IF EXISTS lims_quotation_signatures_update ON storage.objects';
  EXECUTE 'CREATE POLICY lims_quotation_signatures_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''quotation-signatures'') WITH CHECK (bucket_id = ''quotation-signatures'')';
  EXECUTE 'DROP POLICY IF EXISTS lims_quotation_signatures_delete ON storage.objects';
  EXECUTE 'CREATE POLICY lims_quotation_signatures_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''quotation-signatures'')';
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- MANUAL TEST (run by hand in psql AFTER applying; every block rolls back)
-- Replace <ADMIN_UID> / <NON_ADMIN_UID> with real auth.users ids.
-- =====================================================================
-- 0) No FK left pointing at app_users (expect 0 rows):
-- SELECT conrelid::regclass, conname FROM pg_constraint
--  WHERE contype = 'f' AND confrelid = 'public.app_users'::regclass;
--
-- 0b) GoTrue-style user insert works (expect no error):
-- BEGIN;
--   INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
--   VALUES ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 's2-manual@example.invalid', now(), now());
--   INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
--   VALUES ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
--           '{"sub":"11111111-1111-1111-1111-111111111111"}', 'email', now(), now());
--   SELECT designation FROM public.user_profiles WHERE id = '11111111-1111-1111-1111-111111111111';  -- ''
-- ROLLBACK;
--
-- A) Non-admin cannot write lab_settings, can read it:
-- BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<NON_ADMIN_UID>","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) FROM public.lab_settings;                                   -- 1
--   UPDATE public.lab_settings SET lab_name = 'hack' RETURNING id;              -- 0 rows
--   INSERT INTO public.lab_settings (lab_name) VALUES ('x');                    -- ERROR row-level security
-- ROLLBACK;
-- BEGIN;
--   SELECT set_config('request.jwt.claims', '{"sub":"<ADMIN_UID>","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   UPDATE public.lab_settings SET lab_name = lab_name RETURNING id;            -- 1 row
-- ROLLBACK;
--
-- B) document_kind works for the app's query shape:
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT id, label, content, is_default, sort_order FROM public.quotation_terms_conditions
--    WHERE document_kind = 'quotation' ORDER BY sort_order, label;              -- no error
--   SELECT content FROM public.quotation_notes WHERE document_kind = 'quotation' AND is_default; -- no error
-- ROLLBACK;
-- SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'lims_quotation_signatures_%'; -- 4 rows
