-- Customer Portal records: link options also return each entry's stored values, so a formula in one section can use
-- values of the entries picked from another section of the same licence (e.g. SUM(rm_lots.quantity)).
-- Same guard as before: only a section of a licence the customer can see, while the service is not off.
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
    SELECT jsonb_build_object('id', e.id, 'entry_date', e.entry_date, 'ref_no', e.ref_no, 'result', e.result, 'data', e.data)
      FROM public.portal_rec_entries e
     WHERE e.section_id = p_section_id
     ORDER BY e.entry_date DESC, e.created_at DESC
     LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_link_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_link_options(uuid) TO authenticated;
