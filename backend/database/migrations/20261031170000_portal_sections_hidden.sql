-- Customer Portal records: a section can be hidden from the customer (e.g. while its format is being prepared).
-- Hidden sections are left out of the customer's dashboard and sidebar; the order follows sort_order as before.
ALTER TABLE public.portal_rec_sections ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

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
                               FROM public.portal_rec_sections s WHERE s.project_id = l.id AND NOT s.hidden), '[]') END
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
