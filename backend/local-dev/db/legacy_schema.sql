-- Local-only: tables that exist on Railway Postgres from the earlier app but that no
-- applied migration creates. Rebuilt from backend/database/schema/public-columns.json
-- (columns), with defaults borrowed from migration files where they define the same
-- column. Constraints and FKs are inferred. Never apply this to Railway.

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$ BEGIN CREATE TYPE public.bis_project_kind AS ENUM ('new_license', 'renewal', 'inclusion', 'maintenance'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.project_status AS ENUM ('lead', 'in_progress', 'submitted', 'completed', 'on_hold', 'cancelled', 'stop_marking'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text DEFAULT '' NOT NULL,
  model_id text DEFAULT '' NOT NULL,
  display_name text DEFAULT '' NOT NULL,
  api_key text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  api_base_url text,
  is_default boolean DEFAULT false NOT NULL,
  CONSTRAINT ai_models_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_dropdown_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  option_key text DEFAULT '' NOT NULL,
  value text DEFAULT '' NOT NULL,
  label text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT app_dropdown_options_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer DEFAULT 1 NOT NULL,
  site_title text DEFAULT 'Consultancy Pro' NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  document_number_prefix text,
  document_number_suffix text,
  reference_prefix text,
  reference_suffix text,
  app_theme text DEFAULT '' NOT NULL,
  app_currency text DEFAULT '' NOT NULL,
  date_format text DEFAULT '' NOT NULL,
  time_format text DEFAULT '' NOT NULL,
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email extensions.citext NOT NULL,
  password_hash text DEFAULT '' NOT NULL,
  email_confirmed_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  banned_until timestamp with time zone,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT app_users_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bis_new_applications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  project_kind text DEFAULT 'application' NOT NULL,
  title text DEFAULT '' NOT NULL,
  status public.project_status DEFAULT 'in_progress' NOT NULL,
  license_number text,
  start_date date,
  target_date date,
  notes text,
  is_code_id uuid,
  cm_l_digits text,
  license_validity_date date,
  case_handled_by text DEFAULT 'Amit Kumar' NOT NULL,
  case_referred_by text DEFAULT 'QE' NOT NULL,
  billing_amount numeric DEFAULT 0 NOT NULL,
  billing_frequency text DEFAULT 'Yearly' NOT NULL,
  portal_user_id text,
  portal_password text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bis_new_applications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bis_projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  project_kind text DEFAULT 'new_license' NOT NULL,
  title text DEFAULT '' NOT NULL,
  status public.project_status DEFAULT 'lead' NOT NULL,
  license_number text,
  start_date date,
  target_date date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_code_id uuid,
  cm_l_digits text,
  license_validity_date date,
  case_handled_by text DEFAULT '' NOT NULL,
  case_referred_by text DEFAULT '' NOT NULL,
  billing_amount numeric DEFAULT 0 NOT NULL,
  billing_frequency text DEFAULT 'Yearly' NOT NULL,
  portal_user_id text,
  portal_password text,
  application_stage text DEFAULT '' NOT NULL,
  is_qe_managed boolean DEFAULT false NOT NULL,
  application_process text,
  application_number text,
  application_date date,
  granted_date date,
  branch_name text,
  branch_state text,
  branch_head_name text,
  branch_head_designation text,
  inspection_officer_name text,
  inspection_officer_designation text,
  dealing_officer_name text,
  dealing_officer_designation text,
  type_of_inspection text,
  inspection_date date,
  portal_password_set boolean DEFAULT false NOT NULL,
  CONSTRAINT bis_projects_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text DEFAULT '' NOT NULL,
  company_name text,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  gst_number text,
  company_type text DEFAULT 'Manufacturer'::text,
  company_scale text DEFAULT 'Medium'::text,
  company_status text DEFAULT '' NOT NULL,
  contact_person_name text,
  pin_code text,
  city text,
  state text DEFAULT 'Chhattisgarh'::text,
  country text DEFAULT 'India'::text NOT NULL,
  opening_balance numeric DEFAULT 0 NOT NULL,
  balance_type text DEFAULT 'Dr'::text NOT NULL,
  payment_term text DEFAULT '100 % Advance'::text,
  phone_country_code text DEFAULT '' NOT NULL,
  mobile text,
  country_code text,
  district text,
  remark text,
  updated_by uuid,
  archived_at timestamp with time zone,
  archived_by uuid,
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.company_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text DEFAULT '' NOT NULL,
  name text DEFAULT '' NOT NULL,
  body text DEFAULT '' NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT company_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.company_scope_of_work (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text DEFAULT '' NOT NULL,
  name text DEFAULT '' NOT NULL,
  body text DEFAULT '' NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT company_scope_of_work_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.company_settings (
  id integer DEFAULT 1 NOT NULL,
  company_name text DEFAULT 'Q Engineering',
  address text,
  gst_number text,
  phone text,
  email text DEFAULT 'info@qengineering.in',
  logo_path text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  contact_person_name text,
  company_city text,
  company_pin_code text,
  company_state text,
  company_country text,
  bank_account_holder_name text,
  bank_account_number text,
  bank_branch_name text,
  bank_ifsc text,
  bank_swift text,
  bank_upi_id text,
  bank_upi_qr_path text,
  bank_cheque_image_path text,
  letterhead_upper_path text,
  letterhead_lower_path text,
  seal_sign_image_path text,
  company_terms_text text,
  print_paper_size text,
  print_orientation text,
  print_margin_top integer,
  print_margin_bottom integer,
  print_margin_left integer,
  print_margin_right integer,
  print_font_family text,
  print_primary_color text,
  print_show_letterhead boolean,
  print_letterhead_layout text,
  print_letterhead_tagline text,
  print_letterhead_show_address boolean,
  print_letterhead_show_contact boolean,
  print_letterhead_show_gst boolean,
  print_footer_left text,
  print_footer_center text,
  print_footer_right text,
  print_show_page_numbers boolean,
  print_show_footer_line boolean,
  website text,
  CONSTRAINT company_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.company_terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text DEFAULT '' NOT NULL,
  name text DEFAULT '' NOT NULL,
  body text DEFAULT '' NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT company_terms_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.email_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  display_name text DEFAULT '' NOT NULL,
  email_address text DEFAULT '' NOT NULL,
  provider text DEFAULT '' NOT NULL,
  auth_type text DEFAULT '' NOT NULL,
  imap_host text,
  imap_port integer DEFAULT 0 NOT NULL,
  imap_secure boolean DEFAULT false NOT NULL,
  smtp_host text,
  smtp_port integer DEFAULT 0 NOT NULL,
  smtp_secure boolean DEFAULT false NOT NULL,
  username text,
  password text,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_expires_at timestamp with time zone,
  ai_provider text,
  ai_model text,
  ai_api_key text,
  signature text,
  accent_color text,
  is_default boolean DEFAULT false NOT NULL,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_accounts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid NOT NULL,
  uid bigint DEFAULT 0 NOT NULL,
  folder text DEFAULT '' NOT NULL,
  message_id text,
  subject text,
  from_address text,
  from_name text,
  to_addresses jsonb DEFAULT '{}'::jsonb NOT NULL,
  cc_addresses jsonb DEFAULT '{}'::jsonb NOT NULL,
  bcc_addresses jsonb DEFAULT '{}'::jsonb NOT NULL,
  body_text text,
  body_html text,
  snippet text,
  email_date timestamp with time zone,
  is_read boolean DEFAULT false NOT NULL,
  is_starred boolean DEFAULT false NOT NULL,
  is_flagged boolean DEFAULT false NOT NULL,
  has_attachments boolean DEFAULT false NOT NULL,
  attachments jsonb DEFAULT '{}'::jsonb NOT NULL,
  in_reply_to text,
  reply_references text,
  synced_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_credit_note_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_note_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric DEFAULT 0 NOT NULL,
  unit_rate numeric DEFAULT 0 NOT NULL,
  line_discount text,
  gst_rate text,
  line_subtotal numeric DEFAULT 0 NOT NULL,
  line_tax numeric DEFAULT 0 NOT NULL,
  line_total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT finance_credit_note_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_credit_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_note_number text DEFAULT '' NOT NULL,
  credit_note_date date DEFAULT CURRENT_DATE NOT NULL,
  valid_until_date date DEFAULT CURRENT_DATE NOT NULL,
  client_id uuid,
  quotation_id uuid,
  sales_order_id uuid,
  proforma_invoice_id uuid,
  invoice_type text DEFAULT '' NOT NULL,
  credit_note_status text DEFAULT '' NOT NULL,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_total numeric DEFAULT 0 NOT NULL,
  grand_total numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT finance_credit_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_customer_statement_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_statement_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric DEFAULT 0 NOT NULL,
  unit_rate numeric DEFAULT 0 NOT NULL,
  line_discount text,
  gst_rate text,
  line_subtotal numeric DEFAULT 0 NOT NULL,
  line_tax numeric DEFAULT 0 NOT NULL,
  line_total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_customer_statement_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_customer_statements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_statement_number text DEFAULT '' NOT NULL,
  statement_date date DEFAULT CURRENT_DATE NOT NULL,
  valid_until_date date DEFAULT CURRENT_DATE NOT NULL,
  client_id uuid,
  quotation_id uuid,
  sales_order_id uuid,
  proforma_invoice_id uuid,
  invoice_type text DEFAULT '' NOT NULL,
  customer_statement_status text DEFAULT '' NOT NULL,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_total numeric DEFAULT 0 NOT NULL,
  grand_total numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_customer_statements_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_proforma_invoice_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  proforma_invoice_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric DEFAULT 0 NOT NULL,
  unit_rate numeric DEFAULT 0 NOT NULL,
  line_discount text,
  gst_rate text,
  line_subtotal numeric DEFAULT 0 NOT NULL,
  line_tax numeric DEFAULT 0 NOT NULL,
  line_total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT finance_proforma_invoice_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_proforma_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  proforma_invoice_number text DEFAULT '' NOT NULL,
  proforma_date date DEFAULT CURRENT_DATE NOT NULL,
  valid_until_date date DEFAULT CURRENT_DATE NOT NULL,
  client_id uuid,
  sales_order_id uuid,
  invoice_type text DEFAULT '' NOT NULL,
  proforma_status text DEFAULT '' NOT NULL,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_total numeric DEFAULT 0 NOT NULL,
  grand_total numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT finance_proforma_invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_quotation_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quotation_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric DEFAULT 0 NOT NULL,
  unit_rate numeric DEFAULT 0 NOT NULL,
  gst_rate text,
  line_subtotal numeric DEFAULT 0 NOT NULL,
  line_tax numeric DEFAULT 0 NOT NULL,
  line_total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  line_discount text,
  CONSTRAINT finance_quotation_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_quotations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quotation_number text DEFAULT '' NOT NULL,
  quotation_date date DEFAULT CURRENT_DATE NOT NULL,
  expiry_date date DEFAULT CURRENT_DATE NOT NULL,
  client_id uuid,
  quotation_type text DEFAULT '' NOT NULL,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_total numeric DEFAULT 0 NOT NULL,
  grand_total numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  quotation_status text DEFAULT '' NOT NULL,
  CONSTRAINT finance_quotations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_sales_order_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sales_order_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric DEFAULT 0 NOT NULL,
  unit_rate numeric DEFAULT 0 NOT NULL,
  line_discount text,
  gst_rate text,
  line_subtotal numeric DEFAULT 0 NOT NULL,
  line_tax numeric DEFAULT 0 NOT NULL,
  line_total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_sales_order_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_sales_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sales_order_number text DEFAULT '' NOT NULL,
  order_date date DEFAULT CURRENT_DATE NOT NULL,
  expected_delivery_date date DEFAULT CURRENT_DATE NOT NULL,
  client_id uuid,
  quotation_id uuid,
  order_type text DEFAULT '' NOT NULL,
  order_status text DEFAULT '' NOT NULL,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_total numeric DEFAULT 0 NOT NULL,
  grand_total numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finance_sales_orders_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_tax_invoice_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tax_invoice_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric DEFAULT 0 NOT NULL,
  unit_rate numeric DEFAULT 0 NOT NULL,
  line_discount text,
  gst_rate text,
  line_subtotal numeric DEFAULT 0 NOT NULL,
  line_tax numeric DEFAULT 0 NOT NULL,
  line_total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT finance_tax_invoice_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.finance_tax_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tax_invoice_number text DEFAULT '' NOT NULL,
  tax_date date DEFAULT CURRENT_DATE NOT NULL,
  valid_until_date date DEFAULT CURRENT_DATE NOT NULL,
  client_id uuid,
  quotation_id uuid,
  sales_order_id uuid,
  proforma_invoice_id uuid,
  invoice_type text DEFAULT '' NOT NULL,
  tax_status text DEFAULT '' NOT NULL,
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax_total numeric DEFAULT 0 NOT NULL,
  grand_total numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT finance_tax_invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.is_code_files (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  is_code_id uuid NOT NULL,
  storage_path text DEFAULT '' NOT NULL,
  file_name text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT is_code_files_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.is_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  is_number text DEFAULT '' NOT NULL,
  revision_year integer DEFAULT 0 NOT NULL,
  reaffirmation_year integer,
  amendment_number text,
  aspect_of_is text DEFAULT '' NOT NULL,
  product_manual_number text,
  is_code_title text DEFAULT '' NOT NULL,
  testing_charges numeric DEFAULT 0 NOT NULL,
  unit_of_is text DEFAULT '' NOT NULL,
  mmf_large_scale numeric DEFAULT 0 NOT NULL,
  mmf_medium_scale numeric DEFAULT 0 NOT NULL,
  mmf_small_scale numeric DEFAULT 0 NOT NULL,
  mmf_micro_scale numeric DEFAULT 0 NOT NULL,
  slab_1_quantity text DEFAULT '' NOT NULL,
  slab_1_rate numeric DEFAULT 0 NOT NULL,
  slab_2_quantity text DEFAULT '' NOT NULL,
  slab_2_rate numeric DEFAULT 0 NOT NULL,
  slab_3_quantity text DEFAULT '' NOT NULL,
  slab_3_rate numeric DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  title text,
  aspect text DEFAULT 'Specification'::text,
  remarks text,
  updated_by uuid,
  archived_at timestamp with time zone,
  archived_by uuid,
  CONSTRAINT is_codes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.iso_projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  project_kind text DEFAULT '' NOT NULL,
  accrediting_body text,
  standard text,
  title text DEFAULT '' NOT NULL,
  status public.project_status NOT NULL,
  certificate_number text,
  start_date date,
  target_date date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT iso_projects_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.portal_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text DEFAULT '' NOT NULL,
  label text DEFAULT '' NOT NULL,
  is_system boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT portal_roles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.product_master_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category text DEFAULT '' NOT NULL,
  item_code text DEFAULT '' NOT NULL,
  name text DEFAULT '' NOT NULL,
  description text,
  make text,
  unit_of_item text DEFAULT '' NOT NULL,
  hsn_code text,
  gst_rate text DEFAULT '' NOT NULL,
  mrp numeric DEFAULT 0 NOT NULL,
  sale_price numeric DEFAULT 0 NOT NULL,
  purchase_price numeric,
  opening_stock text,
  low_stock_value text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT product_master_items_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text,
  role text DEFAULT '' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  module_access jsonb DEFAULT '{}'::jsonb NOT NULL,
  mobile text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bis_project_id uuid,
  iso_project_id uuid,
  storage_path text DEFAULT '' NOT NULL,
  file_name text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT project_documents_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.service_offerings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text DEFAULT '' NOT NULL,
  category text,
  description text,
  is_active boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT service_offerings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.test_parameters (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  is_code_id uuid NOT NULL,
  test_name text DEFAULT '' NOT NULL,
  clause_no text DEFAULT '' NOT NULL,
  test_method text DEFAULT '' NOT NULL,
  unit text DEFAULT '' NOT NULL,
  specified_value text DEFAULT '' NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  item_name text,
  specific_requirement text,
  unit_value text,
  uncertainty_mu text,
  acceptance_criteria text,
  is_code_label text,
  accreditation text,
  under_accreditation_ids uuid[] DEFAULT '{}'::uuid[],
  department text,
  designation text,
  uncertainty_calculation_data jsonb,
  uncertainty_mu_history jsonb,
  updated_by uuid,
  archived_at timestamp with time zone,
  archived_by uuid,
  CONSTRAINT test_parameters_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  amount numeric DEFAULT 0 NOT NULL,
  currency text DEFAULT '' NOT NULL,
  txn_date date DEFAULT CURRENT_DATE NOT NULL,
  status text DEFAULT '' NOT NULL,
  description text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  payment_flow text DEFAULT '' NOT NULL,
  mode_of_payment text DEFAULT '' NOT NULL,
  receipt_number text,
  extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);

DO $$ BEGIN ALTER TABLE public.bis_new_applications ADD CONSTRAINT bis_new_applications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bis_new_applications ADD CONSTRAINT bis_new_applications_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES public.is_codes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bis_projects ADD CONSTRAINT bis_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.bis_projects ADD CONSTRAINT bis_projects_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES public.is_codes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_credit_note_lines ADD CONSTRAINT finance_credit_note_lines_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.finance_credit_notes(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_credit_note_lines ADD CONSTRAINT finance_credit_note_lines_product_master_item_id_fkey FOREIGN KEY (product_master_item_id) REFERENCES public.product_master_items(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_credit_notes ADD CONSTRAINT finance_credit_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_credit_notes ADD CONSTRAINT finance_credit_notes_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.finance_quotations(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_credit_notes ADD CONSTRAINT finance_credit_notes_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.finance_sales_orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_credit_notes ADD CONSTRAINT finance_credit_notes_proforma_invoice_id_fkey FOREIGN KEY (proforma_invoice_id) REFERENCES public.finance_proforma_invoices(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_customer_statement_lines ADD CONSTRAINT finance_customer_statement_lines_customer_statement_id_fkey FOREIGN KEY (customer_statement_id) REFERENCES public.finance_customer_statements(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_customer_statement_lines ADD CONSTRAINT finance_customer_statement_lines_product_master_item_id_fkey FOREIGN KEY (product_master_item_id) REFERENCES public.product_master_items(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_customer_statements ADD CONSTRAINT finance_customer_statements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_customer_statements ADD CONSTRAINT finance_customer_statements_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.finance_quotations(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_customer_statements ADD CONSTRAINT finance_customer_statements_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.finance_sales_orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_customer_statements ADD CONSTRAINT finance_customer_statements_proforma_invoice_id_fkey FOREIGN KEY (proforma_invoice_id) REFERENCES public.finance_proforma_invoices(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_proforma_invoice_lines ADD CONSTRAINT finance_proforma_invoice_lines_proforma_invoice_id_fkey FOREIGN KEY (proforma_invoice_id) REFERENCES public.finance_proforma_invoices(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_proforma_invoice_lines ADD CONSTRAINT finance_proforma_invoice_lines_product_master_item_id_fkey FOREIGN KEY (product_master_item_id) REFERENCES public.product_master_items(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_proforma_invoices ADD CONSTRAINT finance_proforma_invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_proforma_invoices ADD CONSTRAINT finance_proforma_invoices_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.finance_sales_orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_quotation_lines ADD CONSTRAINT finance_quotation_lines_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.finance_quotations(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_quotation_lines ADD CONSTRAINT finance_quotation_lines_product_master_item_id_fkey FOREIGN KEY (product_master_item_id) REFERENCES public.product_master_items(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_quotations ADD CONSTRAINT finance_quotations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_sales_order_lines ADD CONSTRAINT finance_sales_order_lines_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.finance_sales_orders(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_sales_order_lines ADD CONSTRAINT finance_sales_order_lines_product_master_item_id_fkey FOREIGN KEY (product_master_item_id) REFERENCES public.product_master_items(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_sales_orders ADD CONSTRAINT finance_sales_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_sales_orders ADD CONSTRAINT finance_sales_orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.finance_quotations(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_tax_invoice_lines ADD CONSTRAINT finance_tax_invoice_lines_tax_invoice_id_fkey FOREIGN KEY (tax_invoice_id) REFERENCES public.finance_tax_invoices(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_tax_invoice_lines ADD CONSTRAINT finance_tax_invoice_lines_product_master_item_id_fkey FOREIGN KEY (product_master_item_id) REFERENCES public.product_master_items(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_tax_invoices ADD CONSTRAINT finance_tax_invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_tax_invoices ADD CONSTRAINT finance_tax_invoices_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.finance_quotations(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_tax_invoices ADD CONSTRAINT finance_tax_invoices_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.finance_sales_orders(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.finance_tax_invoices ADD CONSTRAINT finance_tax_invoices_proforma_invoice_id_fkey FOREIGN KEY (proforma_invoice_id) REFERENCES public.finance_proforma_invoices(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.is_code_files ADD CONSTRAINT is_code_files_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES public.is_codes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.iso_projects ADD CONSTRAINT iso_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_bis_project_id_fkey FOREIGN KEY (bis_project_id) REFERENCES public.bis_projects(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_iso_project_id_fkey FOREIGN KEY (iso_project_id) REFERENCES public.iso_projects(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.test_parameters ADD CONSTRAINT test_parameters_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES public.is_codes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.transactions ADD CONSTRAINT transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
