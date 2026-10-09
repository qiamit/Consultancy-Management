-- F2: GST place of supply. Same state code is intra (CGST + SGST). A different state is inter (IGST).
-- A blank or invalid GSTIN returns intra so the app does not invent IGST. Does not rewrite saved documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sale_gst_supply_mode(p_supplier_gstin text, p_recipient_gstin text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_states constant text[] := ARRAY[
    '01','02','03','04','05','06','07','08','09','10',
    '11','12','13','14','15','16','17','18','19','20',
    '21','22','23','24','26','27','28','29','30','31',
    '32','33','34','35','36','37','38','97'
  ];
  v_supplier text := upper(btrim(COALESCE(p_supplier_gstin, '')));
  v_recipient text := upper(btrim(COALESCE(p_recipient_gstin, '')));
  v_gstin text;
  v_ok boolean;
  v_sum integer;
  v_i integer;
  v_code integer;
  v_product integer;
  v_check integer;
BEGIN
  FOREACH v_gstin IN ARRAY ARRAY[v_supplier, v_recipient]
  LOOP
    v_ok := v_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
      AND left(v_gstin, 2) = ANY (v_states);
    IF v_ok THEN
      v_sum := 0;
      FOR v_i IN 0..13 LOOP
        v_code := position(substr(v_gstin, v_i + 1, 1) IN v_chars) - 1;
        IF v_code < 0 THEN
          v_ok := false;
          EXIT;
        END IF;
        v_product := v_code * (CASE WHEN v_i % 2 = 0 THEN 1 ELSE 2 END);
        v_sum := v_sum + (v_product / 36) + (v_product % 36);
      END LOOP;
      v_check := (36 - (v_sum % 36)) % 36;
      IF substr(v_gstin, 15, 1) IS DISTINCT FROM substr(v_chars, v_check + 1, 1) THEN
        v_ok := false;
      END IF;
    END IF;
    IF NOT v_ok THEN
      RETURN 'intra';
    END IF;
  END LOOP;

  IF left(v_supplier, 2) = left(v_recipient, 2) THEN
    RETURN 'intra';
  END IF;
  RETURN 'inter';
END;
$$;

REVOKE ALL ON FUNCTION public.sale_gst_supply_mode(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sale_gst_supply_mode(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
