-- S2b: merge duplicate lab_settings rows (keep singleton, copy bank fields from old row)
DO $$
DECLARE
  v_new uuid := '00000000-0000-0000-0000-000000000001';
  v_old uuid := '4cc807c6-8a94-4709-a7c9-89993442ab1e';
BEGIN
  IF EXISTS (SELECT 1 FROM public.lab_settings WHERE id = v_new)
     AND EXISTS (SELECT 1 FROM public.lab_settings WHERE id = v_old) THEN
    UPDATE public.lab_settings s SET
      account_number = COALESCE(NULLIF(s.account_number,''), o.account_number),
      bank_name      = COALESCE(NULLIF(s.bank_name,''),      o.bank_name),
      branch_name    = COALESCE(NULLIF(s.branch_name,''),    o.branch_name),
      ifsc           = COALESCE(NULLIF(s.ifsc,''),           o.ifsc),
      updated_at     = now()
    FROM public.lab_settings o
    WHERE s.id = v_new AND o.id = v_old;

    DELETE FROM public.lab_settings WHERE id = v_old;
    RAISE NOTICE 'S2b: merged lab_settings rows';
  ELSE
    RAISE NOTICE 'S2b: nothing to merge (one of the rows is missing)';
  END IF;
END $$;
