-- One-time bridge: copy company_settings (Consultancy Pro) → lab_settings (LIMS-compat app layer).
-- Safe to re-run: updates the newest lab_settings row from company_settings id=1.

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS gst_number text;

CREATE OR REPLACE FUNCTION public.sync_company_settings_to_lab_settings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cs public.company_settings%ROWTYPE;
  target_id uuid;
BEGIN
  SELECT * INTO cs FROM public.company_settings WHERE id = 1 LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT id INTO target_id
  FROM public.lab_settings
  ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
  LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO public.lab_settings (
      lab_name,
      gst_number,
      contact_person,
      phone,
      email,
      address,
      pin_code,
      district,
      state,
      country,
      website,
      logo_path,
      seal_sign_path,
      bank_name,
      branch_name,
      account_number,
      ifsc,
      upi,
      cheque_copy_path,
      qr_code_path,
      updated_at
    )
    VALUES (
      cs.company_name,
      cs.gst_number,
      cs.contact_person_name,
      cs.phone,
      cs.email,
      cs.address,
      cs.company_pin_code,
      cs.company_city,
      cs.company_state,
      cs.company_country,
      cs.website,
      cs.logo_path,
      cs.seal_sign_image_path,
      cs.bank_account_holder_name,
      cs.bank_branch_name,
      cs.bank_account_number,
      cs.bank_ifsc,
      cs.bank_upi_id,
      cs.bank_cheque_image_path,
      cs.bank_upi_qr_path,
      now()
    );
    RETURN;
  END IF;

  UPDATE public.lab_settings ls
  SET
    lab_name = COALESCE(NULLIF(trim(cs.company_name), ''), ls.lab_name),
    gst_number = COALESCE(NULLIF(trim(cs.gst_number), ''), ls.gst_number),
    contact_person = COALESCE(NULLIF(trim(cs.contact_person_name), ''), ls.contact_person),
    phone = COALESCE(NULLIF(trim(cs.phone), ''), ls.phone),
    email = COALESCE(NULLIF(trim(cs.email), ''), ls.email),
    address = COALESCE(NULLIF(trim(cs.address), ''), ls.address),
    pin_code = COALESCE(NULLIF(trim(cs.company_pin_code), ''), ls.pin_code),
    district = COALESCE(NULLIF(trim(cs.company_city), ''), ls.district),
    state = COALESCE(NULLIF(trim(cs.company_state), ''), ls.state),
    country = COALESCE(NULLIF(trim(cs.company_country), ''), ls.country),
    website = COALESCE(NULLIF(trim(cs.website), ''), ls.website),
    logo_path = COALESCE(NULLIF(trim(cs.logo_path), ''), ls.logo_path),
    seal_sign_path = COALESCE(NULLIF(trim(cs.seal_sign_image_path), ''), ls.seal_sign_path),
    bank_name = COALESCE(NULLIF(trim(cs.bank_account_holder_name), ''), ls.bank_name),
    branch_name = COALESCE(NULLIF(trim(cs.bank_branch_name), ''), ls.branch_name),
    account_number = COALESCE(NULLIF(trim(cs.bank_account_number), ''), ls.account_number),
    ifsc = COALESCE(NULLIF(trim(cs.bank_ifsc), ''), ls.ifsc),
    upi = COALESCE(NULLIF(trim(cs.bank_upi_id), ''), ls.upi),
    cheque_copy_path = COALESCE(NULLIF(trim(cs.bank_cheque_image_path), ''), ls.cheque_copy_path),
    qr_code_path = COALESCE(NULLIF(trim(cs.bank_upi_qr_path), ''), ls.qr_code_path),
    print_settings = COALESCE(ls.print_settings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'pageSize', cs.print_paper_size,
      'orientation', cs.print_orientation,
      'marginTopMm', cs.print_margin_top,
      'marginBottomMm', cs.print_margin_bottom,
      'marginLeftMm', cs.print_margin_left,
      'marginRightMm', cs.print_margin_right,
      'fontFamily', cs.print_font_family,
      'primaryColor', cs.print_primary_color,
      'showLetterhead', cs.print_show_letterhead,
      'letterheadLayout', cs.print_letterhead_layout,
      'letterheadTagline', cs.print_letterhead_tagline,
      'letterheadShowAddress', cs.print_letterhead_show_address,
      'letterheadShowContact', cs.print_letterhead_show_contact,
      'letterheadShowGst', cs.print_letterhead_show_gst,
      'footerLeft', cs.print_footer_left,
      'footerCenter', cs.print_footer_center,
      'footerRight', cs.print_footer_right,
      'showPageNumbers', cs.print_show_page_numbers,
      'showFooterLine', cs.print_show_footer_line
    )),
    updated_at = now()
  WHERE ls.id = target_id;
END;
$$;

SELECT public.sync_company_settings_to_lab_settings();
