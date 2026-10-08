-- Baseline schema for Qirlpl LIMS (Railway Postgres)
-- Generated: 2026-07-20T15:52:10.2850973+05:30

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== _export_ddl.sql (33 statements) =====
CREATE TABLE IF NOT EXISTS public.accreditation_bodies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_id text NOT NULL,
  display_name text NOT NULL,
  api_key text,
  api_base_url text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000002'::uuid,
  default_model_id uuid,
  ai_enabled boolean NOT NULL DEFAULT true,
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 4096,
  system_prompt_prefix text,
  log_requests boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  agent_crud_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.ai_skills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  instructions text NOT NULL DEFAULT ''::text,
  trigger_keywords text[] DEFAULT '{}'::text[],
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_master_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text,
  label text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gst_number text,
  company_type text NOT NULL DEFAULT 'Manufacturer'::text,
  company_scale text NOT NULL DEFAULT 'Medium'::text,
  company_name text NOT NULL,
  contact_person_name text,
  country_code text,
  mobile text,
  email text,
  address text,
  pin_code text,
  district text,
  state text DEFAULT 'Chhattisgarh'::text,
  country text DEFAULT 'India'::text,
  opening_balance numeric DEFAULT 0,
  balance_type text NOT NULL DEFAULT 'Dr'::text,
  payment_term text NOT NULL DEFAULT '100 % Advance'::text,
  remark text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consent_letters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  consent_letter_no text NOT NULL,
  letter_date text NOT NULL,
  client_id uuid,
  client_name text NOT NULL,
  client_address text,
  is_code_id uuid,
  is_code_label text,
  is_number text,
  revision_year text,
  product_title text,
  test_parameter_names text[] NOT NULL DEFAULT '{}'::text[],
  clause_summary text,
  sample_id uuid,
  srf_number text,
  generated_by uuid,
  generated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_master (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  asset_code text NOT NULL,
  manufacturer text,
  model_number text,
  serial_number text,
  date_of_purchase date,
  purchased_from uuid,
  date_placed_in_service date,
  current_location text,
  equipment_status text,
  range_capacity text,
  resolution_least_count text,
  accuracy_acceptance_criteria text,
  calibration_frequency text,
  last_calibration_date date,
  next_calibration_due date,
  calibration_certificate_number text,
  external_calibration_agency uuid,
  intermediate_check_frequency text,
  last_intermediate_check_date date,
  next_intermediate_check_date date,
  intermediate_check_result text,
  maintenance_schedule_frequency text,
  last_maintenance_date date,
  next_maintenance_date date,
  maintenance_done_by uuid,
  history_of_damage text,
  upload_certificate_path text,
  upload_manual_sop_path text,
  custodian_employee_id uuid,
  calibration_certificate_uncertainty text,
  calibration_uncertainty_unit text,
  calibration_coverage_factor text,
  maintenance_checklist jsonb,
  maintenance_history jsonb,
  intermediate_check_history jsonb
);

CREATE TABLE IF NOT EXISTS public.iqc_masters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_code text NOT NULL,
  equipment_name text NOT NULL,
  manufacturer text,
  model_number text,
  serial_number text,
  date_of_purchase date,
  purchased_from uuid,
  date_placed_in_service date,
  current_location text,
  equipment_status text,
  range_capacity text,
  resolution_least_count text,
  accuracy_acceptance_criteria text,
  calibration_frequency text,
  last_calibration_date date,
  next_calibration_due date,
  calibration_certificate_number text,
  external_calibration_agency uuid,
  intermediate_check_frequency text,
  last_intermediate_check_date date,
  next_intermediate_check_date date,
  intermediate_check_result text,
  maintenance_schedule_frequency text,
  last_maintenance_date date,
  next_maintenance_date date,
  maintenance_done_by uuid,
  history_of_damage text,
  upload_certificate_path text,
  upload_manual_sop_path text,
  custodian_employee_id uuid,
  calibration_points jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.iqc_plan_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  check_type_slug text,
  frequency text NOT NULL DEFAULT ''::text,
  acceptance_criteria text,
  last_done date,
  next_due date,
  status text NOT NULL DEFAULT 'planned'::text,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.is_code_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_code_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.is_code_master_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text,
  label text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.is_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_number text NOT NULL,
  revision_year text,
  reaffirmation_year text,
  amendment_number text,
  title text NOT NULL,
  aspect text DEFAULT 'Specification'::text,
  testing_charges numeric,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_accreditations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  accreditation_body text NOT NULL,
  accreditation_number text,
  standard text DEFAULT 'ISO/IEC 17025:2017'::text,
  valid_from date,
  valid_until date,
  scope_document_path text,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  certificate_file_path text,
  logo_file_path text
);

CREATE TABLE IF NOT EXISTS public.lab_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  file_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  expiry_date date,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_letterheads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean DEFAULT false,
  header_html text,
  footer_html text,
  logo_path text,
  watermark_path text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  template_type text,
  title text,
  file_path text,
  content_text text
);

CREATE TABLE IF NOT EXISTS public.lab_master_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_prefixes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL,
  last_number integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lab_name text,
  lab_type text,
  lab_scale text,
  contact_person text,
  designation text,
  phone text,
  email text,
  address text,
  pin_code text,
  district text,
  state text,
  country text,
  country_code text DEFAULT '+91'::text,
  website text,
  currency text DEFAULT 'Γé╣'::text,
  date_format text DEFAULT 'DD/MM/YYYY'::text,
  time_format text DEFAULT '12-hour'::text,
  logo_path text,
  theme text DEFAULT 'light'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  seal_sign_path text,
  bank_name text,
  branch_name text,
  account_number text,
  ifsc text,
  upi text,
  cheque_copy_path text,
  qr_code_path text,
  report_scope_templates jsonb DEFAULT '{}'::jsonb,
  print_settings jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.master_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nabl_scope (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  s_no integer NOT NULL,
  discipline_group text NOT NULL,
  materials_products text NOT NULL,
  component_parameter text NOT NULL,
  test_method_specification text NOT NULL,
  permanent_testing text NOT NULL DEFAULT 'Permanent Testing'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  type_of_test text,
  range_minimum numeric,
  range_maximum numeric,
  uncertainty text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  full_name text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  remind_at timestamp with time zone NOT NULL,
  channel text NOT NULL DEFAULT 'both'::text,
  browser_sent_at timestamp with time zone,
  email_sent_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.result_validity_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_ref text NOT NULL,
  check_type text NOT NULL,
  check_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned'::text,
  title text NOT NULL,
  sample_id uuid,
  srf_number text,
  test_parameter_name text,
  equipment_id uuid,
  equipment_label text,
  iqc_master_id uuid,
  iqc_label text,
  performed_by uuid,
  performed_by_name text,
  reviewed_by uuid,
  reviewed_by_name text,
  predefined_criteria text,
  check_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  conclusion text,
  action_taken text,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  performed_by_department text,
  performed_by_designation text,
  reviewed_by_department text,
  reviewed_by_designation text
);

CREATE TABLE IF NOT EXISTS public.sample_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL,
  section_code text,
  department text,
  designation text,
  is_code_id uuid,
  is_code_label text,
  allocation_date date,
  test_parameter_ids uuid[] DEFAULT '{}'::uuid[],
  test_parameter_summary text,
  quantity text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sample_receiving_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.samples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  srf_number text,
  date_of_sample_receiving date,
  sample_code text,
  sample_qr_code text,
  client_id uuid,
  client_name text,
  client_reference text,
  test_report_is_code_id uuid,
  test_report_is_code_label text,
  description text,
  sample_description text,
  matrix text,
  received_at timestamp with time zone,
  received_by text,
  sample_quantity text,
  shelf_life text,
  test_required text,
  batch_number text,
  date_of_manufacturing date,
  bis_seal boolean DEFAULT false,
  io_signature boolean DEFAULT false,
  sample_declaration text,
  any_other_information text,
  mode_of_disposal text,
  nature_of_sample text,
  statement_conformity_required boolean DEFAULT false,
  witness_test_required boolean DEFAULT false,
  competent_person_available boolean DEFAULT true,
  equipment_available boolean DEFAULT true,
  can_complete_within_time boolean DEFAULT true,
  deviation_from_methods boolean DEFAULT false,
  supporting_docs_required boolean DEFAULT false,
  decision_rule_applied boolean DEFAULT false,
  testing_method_available boolean DEFAULT true,
  sampling_procedure_ref boolean DEFAULT true,
  tentative_date_required date,
  tentative_date_by_lab date,
  sample_receiving_status text,
  client_references_path text,
  collection_date date,
  collection_location text,
  storage_conditions text,
  storage_location text,
  status text,
  stage text DEFAULT 'receiving'::text,
  quantity integer,
  quantity_unit text,
  condition_on_receipt text,
  condition_notes text,
  test_request_ids uuid[] DEFAULT '{}'::uuid[],
  referback_from_allocation boolean DEFAULT false,
  test_report_number text,
  test_report_draft_notes text,
  test_report_issued_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  test_report_nabl_issued_at timestamp with time zone,
  test_report_non_nabl_issued_at timestamp with time zone,
  test_report_nabl_ulr_number text,
  receiving_report_type text DEFAULT 'New Report'::text,
  referenced_srf_number text,
  test_report_nabl_required boolean,
  test_report_nabl_header_template text,
  test_report_nabl_footer_template text,
  test_report_non_nabl_header_template text,
  test_report_non_nabl_footer_template text,
  test_report_nabl_watermark_template text,
  test_report_non_nabl_watermark_template text,
  sample_receiving_edit_unlocked boolean NOT NULL DEFAULT false,
  sample_retention_due_date date,
  quantity_retained text,
  quantity_disposed text,
  sample_disposed_at date,
  sample_disposal_outcome text,
  sample_retention_status text
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo'::text,
  priority text NOT NULL DEFAULT 'medium'::text,
  due_date timestamp with time zone,
  category text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_allocation_parameters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  test_allocation_id uuid NOT NULL,
  test_parameter_id uuid,
  test_label text NOT NULL,
  test_start_date date,
  test_end_date date,
  results text,
  results_reviewer_id uuid,
  results_reviewer_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  report_remark text,
  specific_requirement text,
  results_review_status text
);

CREATE TABLE IF NOT EXISTS public.test_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sample_allocation_id uuid NOT NULL,
  sample_id uuid NOT NULL,
  section_code text,
  is_code_id uuid,
  is_code_label text,
  srf_number text,
  allocation_date date,
  department text,
  designation text,
  test_parameter_ids uuid[] DEFAULT '{}'::uuid[],
  test_parameter_summary text,
  assigned_employee_id uuid,
  assigned_employee_name text,
  referback_from_allocation boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sent_for_testing boolean NOT NULL DEFAULT false,
  referred_back_from_review boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.test_parameter_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_parameters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_code_id uuid,
  is_code_label text,
  clause_no text,
  unit_value text,
  test_method text,
  item_name text NOT NULL,
  specific_requirement text,
  under_accreditation_ids uuid[] DEFAULT '{}'::uuid[],
  uncertainty_mu text,
  department text,
  designation text,
  acceptance_criteria text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  uncertainty_calculation_data jsonb
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL,
  full_name text,
  designation text,
  department_name text,
  status text NOT NULL DEFAULT 'Active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  mobile text
);

-- ===== _export_functions.sql (4 statements) =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, designation, department_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'designation', ''),
    COALESCE(NEW.raw_user_meta_data->>'department_name', ''),
    'Active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.master_clients_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end; $function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end; $function$
;

-- ===== _export_constraints.sql (78 statements) =====
ALTER TABLE public.accreditation_bodies ADD CONSTRAINT accreditation_bodies_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_models ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_settings ADD CONSTRAINT ai_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_skills ADD CONSTRAINT ai_skills_pkey PRIMARY KEY (id);

ALTER TABLE public.client_master_options ADD CONSTRAINT client_master_options_pkey PRIMARY KEY (id);

ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE public.consent_letters ADD CONSTRAINT consent_letters_pkey PRIMARY KEY (id);

ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_pkey PRIMARY KEY (id);

ALTER TABLE public.iqc_masters ADD CONSTRAINT iqc_masters_pkey PRIMARY KEY (id);

ALTER TABLE public.iqc_plan_items ADD CONSTRAINT iqc_plan_items_pkey PRIMARY KEY (id);

ALTER TABLE public.is_code_files ADD CONSTRAINT is_code_files_pkey PRIMARY KEY (id);

ALTER TABLE public.is_code_master_options ADD CONSTRAINT is_code_master_options_pkey PRIMARY KEY (id);

ALTER TABLE public.is_codes ADD CONSTRAINT is_codes_pkey PRIMARY KEY (id);

ALTER TABLE public.lab_accreditations ADD CONSTRAINT lab_accreditations_pkey PRIMARY KEY (id);

ALTER TABLE public.lab_documents ADD CONSTRAINT lab_documents_pkey PRIMARY KEY (id);

ALTER TABLE public.lab_letterheads ADD CONSTRAINT lab_letterheads_pkey PRIMARY KEY (id);

ALTER TABLE public.lab_master_options ADD CONSTRAINT lab_master_options_pkey PRIMARY KEY (id);

ALTER TABLE public.lab_prefixes ADD CONSTRAINT lab_prefixes_pkey PRIMARY KEY (id);

ALTER TABLE public.lab_settings ADD CONSTRAINT lab_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.master_clients ADD CONSTRAINT master_clients_pkey PRIMARY KEY (id);

ALTER TABLE public.nabl_scope ADD CONSTRAINT nabl_scope_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.reminders ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_pkey PRIMARY KEY (id);

ALTER TABLE public.sample_allocations ADD CONSTRAINT sample_allocations_pkey PRIMARY KEY (id);

ALTER TABLE public.sample_receiving_options ADD CONSTRAINT sample_receiving_options_pkey PRIMARY KEY (id);

ALTER TABLE public.samples ADD CONSTRAINT samples_pkey PRIMARY KEY (id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.test_allocation_parameters ADD CONSTRAINT test_allocation_parameters_pkey PRIMARY KEY (id);

ALTER TABLE public.test_allocations ADD CONSTRAINT test_allocations_pkey PRIMARY KEY (id);

ALTER TABLE public.test_parameter_units ADD CONSTRAINT test_parameter_units_pkey PRIMARY KEY (id);

ALTER TABLE public.test_parameters ADD CONSTRAINT test_parameters_pkey PRIMARY KEY (id);

ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.accreditation_bodies ADD CONSTRAINT accreditation_bodies_name_key UNIQUE (name);

ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_asset_code_key UNIQUE (asset_code);

ALTER TABLE public.iqc_masters ADD CONSTRAINT iqc_masters_asset_code_key UNIQUE (asset_code);

ALTER TABLE public.test_parameter_units ADD CONSTRAINT test_parameter_units_name_key UNIQUE (name);

ALTER TABLE public.iqc_plan_items ADD CONSTRAINT iqc_plan_items_status_chk CHECK ((status = ANY (ARRAY['planned'::text, 'on_track'::text, 'due_soon'::text, 'overdue'::text, 'inactive'::text])));

ALTER TABLE public.nabl_scope ADD CONSTRAINT nabl_scope_type_of_test_check CHECK (((type_of_test IS NULL) OR (type_of_test = ANY (ARRAY['Quantitative'::text, 'Qualitative'::text]))));

ALTER TABLE public.reminders ADD CONSTRAINT reminders_channel_check CHECK ((channel = ANY (ARRAY['browser'::text, 'email'::text, 'both'::text])));

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_check_type_chk CHECK ((check_type = ANY (ARRAY['7_7_a'::text, '7_7_b'::text, '7_7_c'::text, '7_7_d'::text, '7_7_e'::text, '7_7_f'::text, '7_7_g'::text, '7_7_h'::text, '7_7_i'::text, '7_7_j'::text, '7_7_k'::text])));

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_status_chk CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'satisfactory'::text, 'unsatisfactory'::text])));

ALTER TABLE public.samples ADD CONSTRAINT samples_receiving_report_type_check CHECK (((receiving_report_type IS NULL) OR (receiving_report_type = ANY (ARRAY['New Report'::text, 'Amendment Report'::text, 'Supplementary Report'::text]))));

ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));

ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])));

ALTER TABLE public.ai_settings ADD CONSTRAINT ai_settings_default_model_id_fkey FOREIGN KEY (default_model_id) REFERENCES ai_models(id) ON DELETE SET NULL;

ALTER TABLE public.consent_letters ADD CONSTRAINT consent_letters_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE public.consent_letters ADD CONSTRAINT consent_letters_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.consent_letters ADD CONSTRAINT consent_letters_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES is_codes(id) ON DELETE SET NULL;

ALTER TABLE public.consent_letters ADD CONSTRAINT consent_letters_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE SET NULL;

ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_custodian_employee_id_fkey FOREIGN KEY (custodian_employee_id) REFERENCES user_profiles(id);

ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_external_calibration_agency_fkey FOREIGN KEY (external_calibration_agency) REFERENCES clients(id);

ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_maintenance_done_by_fkey FOREIGN KEY (maintenance_done_by) REFERENCES user_profiles(id);

ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_purchased_from_fkey FOREIGN KEY (purchased_from) REFERENCES clients(id);

ALTER TABLE public.iqc_masters ADD CONSTRAINT iqc_masters_custodian_employee_id_fkey FOREIGN KEY (custodian_employee_id) REFERENCES user_profiles(id);

ALTER TABLE public.iqc_masters ADD CONSTRAINT iqc_masters_external_calibration_agency_fkey FOREIGN KEY (external_calibration_agency) REFERENCES clients(id);

ALTER TABLE public.iqc_masters ADD CONSTRAINT iqc_masters_maintenance_done_by_fkey FOREIGN KEY (maintenance_done_by) REFERENCES user_profiles(id);

ALTER TABLE public.iqc_masters ADD CONSTRAINT iqc_masters_purchased_from_fkey FOREIGN KEY (purchased_from) REFERENCES clients(id);

ALTER TABLE public.is_code_files ADD CONSTRAINT is_code_files_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES is_codes(id) ON DELETE CASCADE;

ALTER TABLE public.master_clients ADD CONSTRAINT master_clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.reminders ADD CONSTRAINT reminders_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE public.reminders ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment_master(id) ON DELETE SET NULL;

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_iqc_master_id_fkey FOREIGN KEY (iqc_master_id) REFERENCES iqc_masters(id) ON DELETE SET NULL;

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.result_validity_checks ADD CONSTRAINT result_validity_checks_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE SET NULL;

ALTER TABLE public.sample_allocations ADD CONSTRAINT sample_allocations_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES is_codes(id) ON DELETE SET NULL;

ALTER TABLE public.sample_allocations ADD CONSTRAINT sample_allocations_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE;

ALTER TABLE public.samples ADD CONSTRAINT samples_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.test_allocation_parameters ADD CONSTRAINT test_allocation_parameters_test_allocation_id_fkey FOREIGN KEY (test_allocation_id) REFERENCES test_allocations(id) ON DELETE CASCADE;

ALTER TABLE public.test_allocation_parameters ADD CONSTRAINT test_allocation_parameters_test_parameter_id_fkey FOREIGN KEY (test_parameter_id) REFERENCES test_parameters(id) ON DELETE SET NULL;

ALTER TABLE public.test_allocations ADD CONSTRAINT test_allocations_sample_allocation_id_fkey FOREIGN KEY (sample_allocation_id) REFERENCES sample_allocations(id) ON DELETE CASCADE;

ALTER TABLE public.test_allocations ADD CONSTRAINT test_allocations_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE;

ALTER TABLE public.test_parameters ADD CONSTRAINT test_parameters_is_code_id_fkey FOREIGN KEY (is_code_id) REFERENCES is_codes(id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ===== _export_indexes.sql (51 statements) =====
CREATE INDEX idx_ai_models_active ON public.ai_models USING btree (is_active);

CREATE INDEX idx_ai_models_provider ON public.ai_models USING btree (provider);

CREATE UNIQUE INDEX idx_ai_skills_name ON public.ai_skills USING btree (name);

CREATE UNIQUE INDEX idx_client_master_options_cat_label ON public.client_master_options USING btree (category, label);

CREATE INDEX idx_client_master_options_category ON public.client_master_options USING btree (category);

CREATE INDEX idx_client_master_options_label ON public.client_master_options USING btree (label);

CREATE UNIQUE INDEX idx_clients_company_name ON public.clients USING btree (company_name);

CREATE INDEX idx_clients_state ON public.clients USING btree (state);

CREATE INDEX idx_consent_letters_consent_letter_no ON public.consent_letters USING btree (consent_letter_no);

CREATE UNIQUE INDEX idx_consent_letters_consent_letter_no_unique ON public.consent_letters USING btree (consent_letter_no);

CREATE INDEX idx_consent_letters_generated_at ON public.consent_letters USING btree (generated_at DESC);

CREATE INDEX idx_equipment_master_name ON public.equipment_master USING btree (equipment_name);

CREATE INDEX idx_iqc_plan_items_next_due ON public.iqc_plan_items USING btree (next_due);

CREATE INDEX idx_iqc_plan_items_status ON public.iqc_plan_items USING btree (status);

CREATE INDEX idx_is_code_files_code_id ON public.is_code_files USING btree (is_code_id);

CREATE INDEX idx_is_code_master_options_category ON public.is_code_master_options USING btree (category);

CREATE INDEX idx_is_codes_aspect ON public.is_codes USING btree (aspect);

CREATE UNIQUE INDEX idx_is_codes_number_revision_unique ON public.is_codes USING btree (is_number, revision_year) NULLS NOT DISTINCT;

CREATE INDEX idx_lab_master_options_category ON public.lab_master_options USING btree (category);

CREATE INDEX idx_lab_master_options_label ON public.lab_master_options USING btree (label);

CREATE INDEX master_clients_name_idx ON public.master_clients USING btree (user_id, client_name);

CREATE INDEX master_clients_user_idx ON public.master_clients USING btree (user_id);

CREATE INDEX idx_nabl_scope_discipline ON public.nabl_scope USING btree (discipline_group);

CREATE INDEX idx_nabl_scope_materials ON public.nabl_scope USING btree (materials_products);

CREATE UNIQUE INDEX idx_nabl_scope_s_no ON public.nabl_scope USING btree (s_no);

CREATE INDEX reminders_due_active_idx ON public.reminders USING btree (remind_at, is_active) WHERE (is_active = true);

CREATE INDEX reminders_user_idx ON public.reminders USING btree (user_id);

CREATE INDEX idx_result_validity_checks_check_date ON public.result_validity_checks USING btree (check_date DESC);

CREATE UNIQUE INDEX idx_result_validity_checks_check_ref ON public.result_validity_checks USING btree (check_ref);

CREATE INDEX idx_result_validity_checks_check_type ON public.result_validity_checks USING btree (check_type, check_date DESC);

CREATE INDEX idx_result_validity_checks_status ON public.result_validity_checks USING btree (status);

CREATE INDEX idx_sample_allocations_department ON public.sample_allocations USING btree (department);

CREATE INDEX idx_sample_allocations_sample ON public.sample_allocations USING btree (sample_id);

CREATE INDEX idx_sample_receiving_options_category ON public.sample_receiving_options USING btree (category);

CREATE INDEX idx_sample_receiving_options_label ON public.sample_receiving_options USING btree (category, label);

CREATE INDEX idx_samples_client ON public.samples USING btree (client_id);

CREATE INDEX idx_samples_receiving_report_type ON public.samples USING btree (receiving_report_type);

CREATE INDEX idx_samples_referenced_srf ON public.samples USING btree (referenced_srf_number);

CREATE INDEX idx_samples_srf ON public.samples USING btree (srf_number);

CREATE INDEX idx_samples_stage ON public.samples USING btree (stage);

CREATE INDEX idx_samples_status ON public.samples USING btree (status);

CREATE INDEX tasks_user_status_due_idx ON public.tasks USING btree (user_id, status, due_date);

CREATE INDEX idx_tap_parameter ON public.test_allocation_parameters USING btree (test_parameter_id);

CREATE INDEX idx_tap_reviewer ON public.test_allocation_parameters USING btree (results_reviewer_id);

CREATE INDEX idx_tap_test_allocation ON public.test_allocation_parameters USING btree (test_allocation_id);

CREATE INDEX idx_test_allocations_employee ON public.test_allocations USING btree (assigned_employee_id);

CREATE INDEX idx_test_allocations_sample ON public.test_allocations USING btree (sample_id);

CREATE INDEX idx_test_allocations_sample_alloc ON public.test_allocations USING btree (sample_allocation_id);

CREATE INDEX idx_test_allocations_sent_for_testing ON public.test_allocations USING btree (sent_for_testing) WHERE (sent_for_testing = true);

CREATE INDEX idx_test_parameters_is_code ON public.test_parameters USING btree (is_code_id);

CREATE INDEX idx_test_parameters_item ON public.test_parameters USING btree (item_name);

-- ===== _export_triggers.sql (23 statements) =====
CREATE TRIGGER trg_ai_models_updated_at BEFORE UPDATE ON public.ai_models FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_settings_updated_at BEFORE UPDATE ON public.ai_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_skills_updated_at BEFORE UPDATE ON public.ai_skills FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_consent_letters_updated_at BEFORE UPDATE ON public.consent_letters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_equipment_master_updated_at BEFORE UPDATE ON public.equipment_master FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_iqc_masters_updated_at BEFORE UPDATE ON public.iqc_masters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_iqc_plan_items_updated_at BEFORE UPDATE ON public.iqc_plan_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_is_codes_updated_at BEFORE UPDATE ON public.is_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lab_accreditations_updated_at BEFORE UPDATE ON public.lab_accreditations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lab_documents_updated_at BEFORE UPDATE ON public.lab_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lab_letterheads_updated_at BEFORE UPDATE ON public.lab_letterheads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lab_prefixes_updated_at BEFORE UPDATE ON public.lab_prefixes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lab_settings_updated_at BEFORE UPDATE ON public.lab_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER master_clients_updated_at BEFORE UPDATE ON public.master_clients FOR EACH ROW EXECUTE FUNCTION master_clients_set_updated_at();

CREATE TRIGGER trg_nabl_scope_updated_at BEFORE UPDATE ON public.nabl_scope FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_result_validity_checks_updated_at BEFORE UPDATE ON public.result_validity_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sample_allocations_updated_at BEFORE UPDATE ON public.sample_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_samples_updated_at BEFORE UPDATE ON public.samples FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tap_updated_at BEFORE UPDATE ON public.test_allocation_parameters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_test_allocations_updated_at BEFORE UPDATE ON public.test_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_test_parameters_updated_at BEFORE UPDATE ON public.test_parameters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== _export_rls_enable.sql (33 statements) =====
ALTER TABLE public.accreditation_bodies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_skills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_master_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consent_letters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.equipment_master ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iqc_masters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iqc_plan_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.is_code_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.is_code_master_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.is_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lab_accreditations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lab_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lab_letterheads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lab_master_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lab_prefixes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lab_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.master_clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nabl_scope ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.result_validity_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sample_allocations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sample_receiving_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.test_allocation_parameters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.test_allocations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.test_parameter_units ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.test_parameters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ===== _export_policies.sql (48 statements) =====
CREATE POLICY lims_accreditation_bodies_authenticated_all ON public.accreditation_bodies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_ai_models_authenticated_all ON public.ai_models FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_ai_settings_authenticated_all ON public.ai_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_ai_skills_authenticated_all ON public.ai_skills FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_client_master_options_authenticated_all ON public.client_master_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_clients_authenticated_all ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_consent_letters_authenticated_all ON public.consent_letters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_equipment_master_authenticated_all ON public.equipment_master FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_iqc_masters_authenticated_all ON public.iqc_masters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_iqc_plan_items_authenticated_all ON public.iqc_plan_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_is_code_files_authenticated_all ON public.is_code_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_is_code_master_options_authenticated_all ON public.is_code_master_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_is_codes_authenticated_all ON public.is_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_lab_accreditations_authenticated_all ON public.lab_accreditations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_lab_documents_authenticated_all ON public.lab_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_lab_letterheads_authenticated_all ON public.lab_letterheads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_lab_master_options_authenticated_all ON public.lab_master_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_lab_prefixes_authenticated_all ON public.lab_prefixes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_lab_settings_authenticated_all ON public.lab_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY master_clients_delete_own ON public.master_clients FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY master_clients_insert_own ON public.master_clients FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY master_clients_select_own ON public.master_clients FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY master_clients_update_own ON public.master_clients FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY lims_nabl_scope_authenticated_all ON public.nabl_scope FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY task_mgr_users_insert_own_profile ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));

CREATE POLICY task_mgr_users_update_own_profile ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

CREATE POLICY task_mgr_users_view_own_profile ON public.profiles FOR SELECT USING ((auth.uid() = id));

CREATE POLICY task_mgr_users_delete_own_reminders ON public.reminders FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY task_mgr_users_insert_own_reminders ON public.reminders FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY task_mgr_users_update_own_reminders ON public.reminders FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY task_mgr_users_view_own_reminders ON public.reminders FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY lims_result_validity_checks_authenticated_all ON public.result_validity_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_sample_allocations_authenticated_all ON public.sample_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_sample_receiving_options_authenticated_all ON public.sample_receiving_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_samples_authenticated_all ON public.samples FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY task_mgr_users_delete_own_tasks ON public.tasks FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY task_mgr_users_insert_own_tasks ON public.tasks FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY task_mgr_users_update_own_tasks ON public.tasks FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY task_mgr_users_view_own_tasks ON public.tasks FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY lims_test_allocation_parameters_authenticated_all ON public.test_allocation_parameters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_test_allocations_authenticated_all ON public.test_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_test_parameter_units_authenticated_all ON public.test_parameter_units FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_test_parameters_authenticated_all ON public.test_parameters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated" ON public.user_profiles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow select for authenticated" ON public.user_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow update for authenticated" ON public.user_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY lims_user_profiles_all ON public.user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== _export_buckets.sql (5 statements) =====
INSERT INTO storage.buckets (id, name, public) VALUES ('calibration-files', 'calibration-files', false) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('equipment-files', 'equipment-files', false) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('is-code-files', 'is-code-files', false) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('laboratory-files', 'laboratory-files', false) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('sample-client-references', 'sample-client-references', false) ON CONFLICT (id) DO NOTHING;

-- ===== _export_storage_policies.sql (24 statements) =====
CREATE POLICY lims_calibration_files_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'calibration-files'::text));

CREATE POLICY lims_calibration_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'calibration-files'::text));

CREATE POLICY lims_calibration_files_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'calibration-files'::text));

CREATE POLICY lims_calibration_files_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'calibration-files'::text)) WITH CHECK ((bucket_id = 'calibration-files'::text));

CREATE POLICY lims_equipment_files_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'equipment-files'::text));

CREATE POLICY lims_equipment_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'equipment-files'::text));

CREATE POLICY lims_equipment_files_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'equipment-files'::text));

CREATE POLICY lims_equipment_files_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'equipment-files'::text)) WITH CHECK ((bucket_id = 'equipment-files'::text));

CREATE POLICY lims_is_code_files_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'is-code-files'::text));

CREATE POLICY lims_is_code_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'is-code-files'::text));

CREATE POLICY lims_is_code_files_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'is-code-files'::text));

CREATE POLICY lims_is_code_files_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'is-code-files'::text)) WITH CHECK ((bucket_id = 'is-code-files'::text));

CREATE POLICY lims_laboratory_files_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'laboratory-files'::text));

CREATE POLICY lims_laboratory_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'laboratory-files'::text));

CREATE POLICY lims_laboratory_files_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'laboratory-files'::text));

CREATE POLICY lims_laboratory_files_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'laboratory-files'::text)) WITH CHECK ((bucket_id = 'laboratory-files'::text));

CREATE POLICY lims_sample_client_references_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'sample-client-references'::text));

CREATE POLICY lims_sample_client_references_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'sample-client-references'::text));

CREATE POLICY lims_sample_client_references_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'sample-client-references'::text));

CREATE POLICY lims_sample_client_references_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'sample-client-references'::text)) WITH CHECK ((bucket_id = 'sample-client-references'::text));

CREATE POLICY lims_test_method_notes_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'test-method-notes'::text));

CREATE POLICY lims_test_method_notes_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'test-method-notes'::text));

CREATE POLICY lims_test_method_notes_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'test-method-notes'::text));

CREATE POLICY lims_test_method_notes_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'test-method-notes'::text)) WITH CHECK ((bucket_id = 'test-method-notes'::text));

