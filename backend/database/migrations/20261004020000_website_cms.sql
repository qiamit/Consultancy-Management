-- Website CMS tables (Consultancy Pro parity: website_services, website_news, website_settings)

CREATE TABLE IF NOT EXISTS public.website_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  image_url text,
  published_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name text,
  logo_url text,
  contact_email text,
  contact_phone text,
  address text,
  about_text text,
  facebook_url text,
  linkedin_url text,
  instagram_url text,
  twitter_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_services_active_idx ON public.website_services (is_active);
CREATE INDEX IF NOT EXISTS website_news_published_idx ON public.website_news (published_date DESC);

ALTER TABLE public.website_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_services_authenticated_all ON public.website_services;
CREATE POLICY website_services_authenticated_all
  ON public.website_services FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS website_news_authenticated_all ON public.website_news;
CREATE POLICY website_news_authenticated_all
  ON public.website_news FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS website_settings_authenticated_all ON public.website_settings;
CREATE POLICY website_settings_authenticated_all
  ON public.website_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_news TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_settings TO authenticated;

-- Seed defaults once from company_settings (if present)
INSERT INTO public.website_settings (id, company_name, logo_url, contact_email, contact_phone, address)
SELECT 1, cs.company_name, cs.logo_path, cs.email, cs.phone, cs.address
FROM public.company_settings cs
WHERE cs.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.website_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
