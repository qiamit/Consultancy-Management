-- Public read RPC for website CMS (anon-safe, no direct table grants)

CREATE OR REPLACE FUNCTION public.get_public_website_content()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'settings',
    COALESCE(
      (SELECT to_jsonb(ws) FROM public.website_settings ws WHERE ws.id = 1),
      '{}'::jsonb
    ),
    'services',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at ASC)
        FROM public.website_services s
        WHERE s.is_active = true
      ),
      '[]'::jsonb
    ),
    'news',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(n) ORDER BY n.published_date DESC)
        FROM (
          SELECT *
          FROM public.website_news
          ORDER BY published_date DESC
          LIMIT 10
        ) n
      ),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_website_content() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
