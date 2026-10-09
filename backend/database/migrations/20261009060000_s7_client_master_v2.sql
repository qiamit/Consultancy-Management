-- S7: Client Master v2.
-- States, statutory columns, sites, contacts, factory link, similar-name search,
-- and client certificate files. Does not rewrite company_scale.
-- Backfill copies today's single address into one Registered Office and one Factory,
-- and the single contact into one primary contact. Apply only when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Live DB uses touch_updated_at() and does not have set_updated_at().
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1) GST state codes
CREATE TABLE IF NOT EXISTS public.india_states (
  gst_code text PRIMARY KEY,
  name text NOT NULL,
  is_ut boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_india_states_updated_at ON public.india_states;
CREATE TRIGGER trg_india_states_updated_at
  BEFORE UPDATE ON public.india_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.india_states (gst_code, name, is_ut) VALUES
  ('01', 'Jammu and Kashmir', true),
  ('02', 'Himachal Pradesh', false),
  ('03', 'Punjab', false),
  ('04', 'Chandigarh', true),
  ('05', 'Uttarakhand', false),
  ('06', 'Haryana', false),
  ('07', 'Delhi', true),
  ('08', 'Rajasthan', false),
  ('09', 'Uttar Pradesh', false),
  ('10', 'Bihar', false),
  ('11', 'Sikkim', false),
  ('12', 'Arunachal Pradesh', false),
  ('13', 'Nagaland', false),
  ('14', 'Manipur', false),
  ('15', 'Mizoram', false),
  ('16', 'Tripura', false),
  ('17', 'Meghalaya', false),
  ('18', 'Assam', false),
  ('19', 'West Bengal', false),
  ('20', 'Jharkhand', false),
  ('21', 'Odisha', false),
  ('22', 'Chhattisgarh', false),
  ('23', 'Madhya Pradesh', false),
  ('24', 'Gujarat', false),
  ('26', 'Dadra and Nagar Haveli and Daman and Diu', true),
  ('27', 'Maharashtra', false),
  ('28', 'Andhra Pradesh', false),
  ('29', 'Karnataka', false),
  ('30', 'Goa', false),
  ('31', 'Lakshadweep', true),
  ('32', 'Kerala', false),
  ('33', 'Tamil Nadu', false),
  ('34', 'Puducherry', true),
  ('35', 'Andaman and Nicobar Islands', true),
  ('36', 'Telangana', false),
  ('37', 'Andhra Pradesh', false),
  ('38', 'Ladakh', true),
  ('97', 'Other Territory', false)
ON CONFLICT (gst_code) DO NOTHING;

ALTER TABLE public.india_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS india_states_select ON public.india_states;
CREATE POLICY india_states_select ON public.india_states
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.india_states FROM PUBLIC, anon;
GRANT SELECT ON public.india_states TO authenticated;

-- 2) Statutory columns. company_scale is not updated.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pan text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cin text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS llpin text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS udyam_no text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS msme_category text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS udyam_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS constitution text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_startup boolean;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS startup_dpiit_no text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_women_entrepreneur boolean;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS gst_registration_type text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS gst_state_code text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_status text NOT NULL DEFAULT 'Active';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS account_manager_id uuid;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_pan_shape_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_pan_shape_chk
  CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$') NOT VALID;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_gst_number_shape_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_gst_number_shape_chk
  CHECK (gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$') NOT VALID;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_client_status_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_client_status_chk
  CHECK (client_status IN ('Prospect', 'Active', 'Inactive', 'Blacklisted')) NOT VALID;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_sector_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_sector_chk
  CHECK (sector IS NULL OR sector IN ('Private', 'Public', 'Government', 'Cooperative', 'Other')) NOT VALID;

CREATE INDEX IF NOT EXISTS clients_account_manager_id_idx ON public.clients (account_manager_id);

-- 3) Sites and contacts
CREATE TABLE IF NOT EXISTS public.client_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  site_role text NOT NULL,
  address text,
  district text,
  state text,
  pin_code text,
  gst_number text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_sites_role_chk CHECK (site_role IN ('Registered Office', 'Factory', 'Other'))
);

CREATE INDEX IF NOT EXISTS client_sites_client_id_idx ON public.client_sites (client_id);
CREATE INDEX IF NOT EXISTS client_sites_primary_idx ON public.client_sites (client_id) WHERE is_primary;

DROP TRIGGER IF EXISTS trg_client_sites_updated_at ON public.client_sites;
CREATE TRIGGER trg_client_sites_updated_at
  BEFORE UPDATE ON public.client_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_role text NOT NULL DEFAULT 'Other',
  name text,
  designation text,
  mobile text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_contacts_role_chk CHECK (
    contact_role IN ('Primary', 'Signatory', 'Top Management', 'Technical', 'Accounts', 'Other')
  )
);

CREATE INDEX IF NOT EXISTS client_contacts_client_id_idx ON public.client_contacts (client_id);
CREATE INDEX IF NOT EXISTS client_contacts_primary_idx ON public.client_contacts (client_id) WHERE is_primary;

DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON public.client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.client_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_sites_select ON public.client_sites;
CREATE POLICY client_sites_select ON public.client_sites
  FOR SELECT TO authenticated USING ((SELECT public.app_can_view('/masters/clients')));
DROP POLICY IF EXISTS client_sites_insert ON public.client_sites;
CREATE POLICY client_sites_insert ON public.client_sites
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_can_edit('/masters/clients')));
DROP POLICY IF EXISTS client_sites_update ON public.client_sites;
CREATE POLICY client_sites_update ON public.client_sites
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_can_edit('/masters/clients')))
  WITH CHECK ((SELECT public.app_can_edit('/masters/clients')));
DROP POLICY IF EXISTS client_sites_delete ON public.client_sites;
CREATE POLICY client_sites_delete ON public.client_sites
  FOR DELETE TO authenticated USING ((SELECT public.app_is_admin()));

DROP POLICY IF EXISTS client_contacts_select ON public.client_contacts;
CREATE POLICY client_contacts_select ON public.client_contacts
  FOR SELECT TO authenticated USING ((SELECT public.app_can_view('/masters/clients')));
DROP POLICY IF EXISTS client_contacts_insert ON public.client_contacts;
CREATE POLICY client_contacts_insert ON public.client_contacts
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_can_edit('/masters/clients')));
DROP POLICY IF EXISTS client_contacts_update ON public.client_contacts;
CREATE POLICY client_contacts_update ON public.client_contacts
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_can_edit('/masters/clients')))
  WITH CHECK ((SELECT public.app_can_edit('/masters/clients')));
DROP POLICY IF EXISTS client_contacts_delete ON public.client_contacts;
CREATE POLICY client_contacts_delete ON public.client_contacts
  FOR DELETE TO authenticated USING ((SELECT public.app_is_admin()));

REVOKE ALL ON public.client_sites FROM PUBLIC, anon;
REVOKE ALL ON public.client_contacts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_sites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;

INSERT INTO public.client_sites (client_id, site_role, address, district, state, pin_code, gst_number, is_primary)
SELECT c.id, 'Registered Office', c.address, c.district, c.state, c.pin_code, c.gst_number, true
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_sites s
  WHERE s.client_id = c.id AND s.site_role = 'Registered Office'
);

INSERT INTO public.client_sites (client_id, site_role, address, district, state, pin_code, gst_number, is_primary)
SELECT c.id, 'Factory', c.address, c.district, c.state, c.pin_code, c.gst_number, false
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_sites s
  WHERE s.client_id = c.id AND s.site_role = 'Factory'
);

INSERT INTO public.client_contacts (client_id, contact_role, name, mobile, email, is_primary)
SELECT c.id, 'Primary', c.contact_person_name, c.mobile, c.email, true
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_contacts k
  WHERE k.client_id = c.id AND k.is_primary
);

CREATE OR REPLACE FUNCTION public.client_sites_sync_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.clients
       SET address = NEW.address,
           district = NEW.district,
           state = NEW.state,
           pin_code = NEW.pin_code
     WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_contacts_sync_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.clients
       SET contact_person_name = NEW.name,
           mobile = NEW.mobile,
           email = NEW.email
     WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_sites_sync_primary ON public.client_sites;
CREATE TRIGGER client_sites_sync_primary
  AFTER INSERT OR UPDATE OF address, district, state, pin_code, is_primary
  ON public.client_sites
  FOR EACH ROW EXECUTE FUNCTION public.client_sites_sync_primary();

DROP TRIGGER IF EXISTS client_contacts_sync_primary ON public.client_contacts;
CREATE TRIGGER client_contacts_sync_primary
  AFTER INSERT OR UPDATE OF name, mobile, email, is_primary
  ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.client_contacts_sync_primary();

REVOKE ALL ON FUNCTION public.client_sites_sync_primary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_contacts_sync_primary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_sites_sync_primary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_contacts_sync_primary() TO authenticated;

-- 4) Factory on the BIS project
ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS factory_site_id uuid REFERENCES public.client_sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bis_projects_factory_site_id_idx ON public.bis_projects (factory_site_id);

UPDATE public.bis_projects p
   SET factory_site_id = only_one.id
  FROM (
    SELECT client_id, (array_agg(id))[1] AS id
    FROM public.client_sites
    WHERE site_role = 'Factory'
    GROUP BY client_id
    HAVING count(*) = 1
  ) only_one
 WHERE p.client_id = only_one.client_id
   AND p.factory_site_id IS NULL;

-- 5) Case-insensitive name, and GSTIN, when there is no clash
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM (
    SELECT lower(btrim(company_name))
    FROM public.clients
    GROUP BY 1
    HAVING count(*) > 1
  ) clashes;
  IF n <> 0 THEN
    RAISE NOTICE 'S7: skipped clients_company_name_lower_uidx, clash groups %', n;
  ELSIF to_regclass('public.clients_company_name_lower_uidx') IS NULL THEN
    CREATE UNIQUE INDEX clients_company_name_lower_uidx ON public.clients (lower(btrim(company_name)));
  END IF;

  SELECT count(*) INTO n
  FROM (
    SELECT gst_number
    FROM public.clients
    WHERE gst_number IS NOT NULL AND gst_number <> ''
    GROUP BY gst_number
    HAVING count(*) > 1
  ) clashes;
  IF n <> 0 THEN
    RAISE NOTICE 'S7: skipped clients_gst_number_uidx, clash groups %', n;
  ELSIF to_regclass('public.clients_gst_number_uidx') IS NULL THEN
    CREATE UNIQUE INDEX clients_gst_number_uidx
      ON public.clients (gst_number)
      WHERE gst_number IS NOT NULL AND gst_number <> '';
  END IF;
END $$;

-- 6) Certificates
CREATE TABLE IF NOT EXISTS public.client_certificate_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cert_name text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_certificate_files_client_id_idx
  ON public.client_certificate_files (client_id);

DROP TRIGGER IF EXISTS trg_client_certificate_files_updated_at ON public.client_certificate_files;
CREATE TRIGGER trg_client_certificate_files_updated_at
  BEFORE UPDATE ON public.client_certificate_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.client_certificate_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_certificate_files_select ON public.client_certificate_files;
CREATE POLICY client_certificate_files_select ON public.client_certificate_files
  FOR SELECT TO authenticated USING ((SELECT public.app_can_view('/masters/clients')));
DROP POLICY IF EXISTS client_certificate_files_insert ON public.client_certificate_files;
CREATE POLICY client_certificate_files_insert ON public.client_certificate_files
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_can_edit('/masters/clients')));
DROP POLICY IF EXISTS client_certificate_files_update ON public.client_certificate_files;
CREATE POLICY client_certificate_files_update ON public.client_certificate_files
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_can_edit('/masters/clients')))
  WITH CHECK ((SELECT public.app_can_edit('/masters/clients')));
DROP POLICY IF EXISTS client_certificate_files_delete ON public.client_certificate_files;
CREATE POLICY client_certificate_files_delete ON public.client_certificate_files
  FOR DELETE TO authenticated USING ((SELECT public.app_can_edit('/masters/clients')));

REVOKE ALL ON public.client_certificate_files FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_certificate_files TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-certificates',
  'client-certificates',
  false,
  26214400,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'S7: storage.objects missing, skipped';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS client_certificates_storage_select ON storage.objects';
  EXECUTE 'CREATE POLICY client_certificates_storage_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''client-certificates'' AND (SELECT public.app_can_view(''/masters/clients'')))';
  EXECUTE 'DROP POLICY IF EXISTS client_certificates_storage_insert ON storage.objects';
  EXECUTE 'CREATE POLICY client_certificates_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''client-certificates'' AND (SELECT public.app_can_edit(''/masters/clients'')))';
  EXECUTE 'DROP POLICY IF EXISTS client_certificates_storage_update ON storage.objects';
  EXECUTE 'CREATE POLICY client_certificates_storage_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''client-certificates'' AND (SELECT public.app_can_edit(''/masters/clients''))) WITH CHECK (bucket_id = ''client-certificates'' AND (SELECT public.app_can_edit(''/masters/clients'')))';
  EXECUTE 'DROP POLICY IF EXISTS client_certificates_storage_delete ON storage.objects';
  EXECUTE 'CREATE POLICY client_certificates_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''client-certificates'' AND (SELECT public.app_can_edit(''/masters/clients'')))';
END $$;

-- 7) Similar clients
CREATE OR REPLACE FUNCTION public.find_similar_clients(p_name text, p_gstin text)
RETURNS TABLE (id uuid, company_name text, gst_number text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT c.id,
         c.company_name,
         c.gst_number,
         GREATEST(
           extensions.similarity(lower(c.company_name), lower(btrim(p_name))),
           CASE
             WHEN btrim(COALESCE(p_gstin, '')) <> '' AND c.gst_number = btrim(p_gstin) THEN 1
             ELSE 0
           END
         )::real AS similarity
    FROM public.clients c
   WHERE btrim(COALESCE(p_name, '')) <> ''
     AND c.archived_at IS NULL
     AND (
       extensions.similarity(lower(c.company_name), lower(btrim(p_name))) > 0.35
       OR (btrim(COALESCE(p_gstin, '')) <> '' AND c.gst_number = btrim(p_gstin))
     )
   ORDER BY 4 DESC, c.company_name
   LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.find_similar_clients(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_similar_clients(text, text) TO authenticated;

-- 8) search_clients also returns payment_term and remark. No default term.
DROP FUNCTION IF EXISTS public.search_clients(text, integer, integer, boolean, text);

CREATE FUNCTION public.search_clients(
  p_search           text    DEFAULT '',
  p_limit            integer DEFAULT 30,
  p_offset           integer DEFAULT 0,
  p_include_archived boolean DEFAULT false,
  p_company_type     text    DEFAULT NULL
)
RETURNS TABLE (
  id uuid, company_name text, gst_number text, company_type text, company_scale text,
  contact_person_name text, email text, country_code text, mobile text, address text,
  district text, city text, state text, pin_code text, country text,
  opening_balance numeric, balance_type text, archived_at timestamptz, total_count bigint,
  payment_term text, remark text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT trim(COALESCE(p_search, '')) AS raw,
           '%' || replace(replace(replace(trim(COALESCE(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  )
  SELECT c.id, c.company_name, c.gst_number, c.company_type, c.company_scale,
         c.contact_person_name, c.email, c.country_code, c.mobile, c.address,
         c.district, c.city, c.state, c.pin_code, c.country,
         c.opening_balance, c.balance_type, c.archived_at,
         count(*) OVER () AS total_count,
         c.payment_term, c.remark
    FROM public.clients c, q
   WHERE (p_include_archived OR c.archived_at IS NULL)
     AND (p_company_type IS NULL OR c.company_type = p_company_type)
     AND (q.raw = ''
          OR c.company_name ILIKE q.pat
          OR c.gst_number ILIKE q.pat
          OR c.contact_person_name ILIKE q.pat
          OR c.mobile ILIKE q.pat
          OR c.city ILIKE q.pat)
   ORDER BY (lower(c.company_name) = lower(q.raw)) DESC,
            (c.company_name ILIKE replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%') DESC,
            c.company_name ASC, c.id ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.search_clients(text, integer, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_clients(text, integer, integer, boolean, text) TO authenticated;

INSERT INTO public.client_master_options (category, label, value)
SELECT 'company_type', v.label, v.label
FROM (
  VALUES
    ('Buyer'),
    ('Vendor'),
    ('Both'),
    ('Importer'),
    ('Foreign Manufacturer'),
    ('Trader')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'company_type' AND lower(o.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
