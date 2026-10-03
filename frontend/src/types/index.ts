// ─── ISO 17025:2017 Core Entity Types ───────────────────────────────────────

// ── Clause 6.2 – Personnel ──────────────────────────────────────────────────
export type PersonnelRole =
  | 'laboratory_director'
  | 'quality_manager'
  | 'technical_manager'
  | 'analyst'
  | 'technician'
  | 'sampler'
  | 'auditor'
  | 'external_reviewer';

export interface Personnel {
  id: string;
  employee_code: string;
  full_name: string;
  role: PersonnelRole;
  department: string;
  qualifications: Qualification[];
  competency_records: CompetencyRecord[];
  authorized_methods: string[];       // method IDs
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Qualification {
  id: string;
  personnel_id: string;
  title: string;
  institution: string;
  year_obtained: number;
  document_ref?: string;
}

export interface CompetencyRecord {
  id: string;
  personnel_id: string;
  method_id: string;
  assessed_by: string;                // personnel ID
  assessment_date: string;
  next_assessment_date: string;
  result: 'competent' | 'training_required' | 'not_competent';
  notes?: string;
}

// ── Clause 6.3 – Facilities & Environmental Conditions ──────────────────────
export interface Facility {
  id: string;
  name: string;
  location: string;
  area_m2: number;
  environmental_requirements: EnvironmentalRequirement[];
  is_controlled: boolean;
}

export interface EnvironmentalRecord {
  id: string;
  facility_id: string;
  recorded_by: string;                // personnel ID
  recorded_at: string;
  temperature_c?: number;
  humidity_percent?: number;
  pressure_hpa?: number;
  within_limits: boolean;
  notes?: string;
}

export interface EnvironmentalRequirement {
  parameter: string;
  min_value: number;
  max_value: number;
  unit: string;
}

// ── Clause 6.4 – Equipment ──────────────────────────────────────────────────
export type EquipmentStatus =
  | 'in_service'
  | 'under_calibration'
  | 'under_maintenance'
  | 'out_of_service'
  | 'retired';

export interface Equipment {
  id: string;
  asset_code: string;
  name: string;
  model: string;
  manufacturer: string;
  serial_number: string;
  location: string;
  status: EquipmentStatus;
  calibration_due_date: string;
  last_calibration_date?: string;
  calibration_interval_days: number;
  calibration_records: CalibrationRecord[];
  maintenance_records: MaintenanceRecord[];
  responsible_person_id: string;
  purchase_date?: string;
  created_at: string;
  updated_at: string;
}

export interface CalibrationRecord {
  id: string;
  equipment_id: string;
  calibration_date: string;
  next_due_date: string;
  performed_by: string;               // personnel ID or external lab name
  certificate_number: string;
  traceability_reference: string;     // clause 6.5
  result: 'pass' | 'conditional_pass' | 'fail';
  uncertainty?: string;
  document_ref?: string;
  notes?: string;
}

export interface MaintenanceRecord {
  id: string;
  equipment_id: string;
  maintenance_date: string;
  type: 'preventive' | 'corrective';
  performed_by: string;
  description: string;
  parts_replaced?: string[];
  cost?: number;
  next_maintenance_date?: string;
}

// ── Clause 6.5 – Metrological Traceability ──────────────────────────────────
export interface TraceabilityChain {
  id: string;
  equipment_id: string;
  reference_standard: string;
  national_standard: string;
  calibration_lab: string;
  accreditation_body: string;
  accreditation_number: string;
  valid_until: string;
}

// ── Clause 6.6 – Externally Provided Products & Services ────────────────────
export interface Supplier {
  id: string;
  name: string;
  type: 'calibration_lab' | 'reagent_supplier' | 'equipment_vendor' | 'subcontractor';
  accreditation?: string;
  evaluation_records: SupplierEvaluation[];
  approved: boolean;
  contact_name?: string;
  contact_email?: string;
  created_at: string;
}

export interface SupplierEvaluation {
  id: string;
  supplier_id: string;
  evaluated_by: string;               // personnel ID
  evaluation_date: string;
  criteria_scores: Record<string, number>;
  overall_rating: 'approved' | 'conditionally_approved' | 'not_approved';
  notes?: string;
}

// ── Clause 7.2 – Method Selection & Validation ──────────────────────────────
export type MethodType = 'standard' | 'in_house' | 'modified_standard';
export type MethodStatus = 'draft' | 'under_validation' | 'validated' | 'approved' | 'withdrawn';

export interface TestMethod {
  id: string;
  method_code: string;
  title: string;
  type: MethodType;
  status: MethodStatus;
  reference_standard?: string;        // e.g. "ISO 6222:1999"
  applicable_matrices: string[];
  measurands: string[];
  uncertainty_budget?: string;
  version: string;
  approved_by?: string;               // personnel ID
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Clause 7.4 – Handling of Test/Calibration Items ─────────────────────────
export type SampleStatus =
  | 'registered'
  | 'in_transit'
  | 'in_storage'
  | 'in_testing'
  | 'testing_complete'
  | 'results_reviewed'
  | 'reported'
  | 'disposed'
  | 'rejected';

export interface Sample {
  id: string;
  sample_code: string;
  description: string;
  matrix: string;
  client_id: string;
  received_by: string;                // personnel ID
  received_at: string;
  collection_date?: string;
  collection_location?: string;
  collected_by?: string;
  storage_conditions?: string;
  storage_location?: string;
  status: SampleStatus;
  quantity: number;
  quantity_unit: string;
  condition_on_receipt: 'acceptable' | 'damaged' | 'compromised';
  condition_notes?: string;
  chain_of_custody: ChainOfCustodyEntry[];
  test_requests: string[];            // TestRequest IDs
  disposal_date?: string;
  disposal_method?: string;
  created_at: string;
  updated_at: string;
}

export interface ChainOfCustodyEntry {
  id: string;
  sample_id: string;
  from_person: string;                // personnel ID
  to_person: string;
  transferred_at: string;
  location: string;
  notes?: string;
}

// ── Clause 7.5 – Technical Records ──────────────────────────────────────────
export type TestStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'under_review'
  | 'approved'
  | 'cancelled';

export interface TestRequest {
  id: string;
  request_code: string;
  sample_id: string;
  method_id: string;
  assigned_to: string;                // personnel ID
  requested_by?: string;
  status: TestStatus;
  priority: 'routine' | 'urgent' | 'critical';
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface TestRecord {
  id: string;
  record_code: string;
  test_request_id: string;
  sample_id: string;
  method_id: string;
  analyst_id: string;                 // personnel ID
  equipment_used: string[];           // equipment IDs
  reagents_used: ReagentUsage[];
  raw_data: Record<string, unknown>;
  result_value: number | string;
  result_unit: string;
  measurement_uncertainty?: string;
  detection_limit?: number;
  quantification_limit?: number;
  started_at: string;
  completed_at?: string;
  reviewed_by?: string;               // personnel ID
  reviewed_at?: string;
  status: 'draft' | 'reviewed' | 'approved' | 'rejected';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReagentUsage {
  reagent_name: string;
  batch_number: string;
  expiry_date: string;
  quantity_used: number;
  unit: string;
}

// ── Clause 7.8 – Reporting of Results ───────────────────────────────────────
export type ReportStatus = 'draft' | 'under_review' | 'approved' | 'issued' | 'amended' | 'withdrawn';

export interface TestReport {
  id: string;
  report_number: string;
  client_id: string;
  sample_ids: string[];
  test_record_ids: string[];
  prepared_by: string;                // personnel ID
  reviewed_by?: string;
  approved_by?: string;
  issued_at?: string;
  status: ReportStatus;
  report_type: 'test' | 'calibration';
  version: number;
  amendment_reason?: string;
  created_at: string;
  updated_at: string;
}

// ── Clause 7.9 – Complaints ──────────────────────────────────────────────────
export interface Complaint {
  id: string;
  complaint_number: string;
  client_id: string;
  received_by: string;
  received_at: string;
  description: string;
  related_report_id?: string;
  status: 'open' | 'under_investigation' | 'closed';
  resolution?: string;
  closed_at?: string;
  root_cause?: string;
}

// ── Clause 7.10 – Nonconforming Work ────────────────────────────────────────
export interface NonconformingWork {
  id: string;
  ncw_number: string;
  identified_by: string;              // personnel ID
  identified_at: string;
  description: string;
  affected_sample_ids: string[];
  affected_test_record_ids: string[];
  immediate_action: string;
  root_cause?: string;
  corrective_action_id?: string;
  status: 'open' | 'contained' | 'closed';
  closed_at?: string;
}

// ── Clause 8.7 – Corrective Actions ─────────────────────────────────────────
export interface CorrectiveAction {
  id: string;
  ca_number: string;
  source: 'internal_audit' | 'external_audit' | 'complaint' | 'ncw' | 'proficiency_test' | 'other';
  source_ref_id?: string;
  description: string;
  root_cause: string;
  proposed_action: string;
  responsible_person_id: string;
  target_date: string;
  implementation_date?: string;
  verified_by?: string;               // personnel ID
  verification_date?: string;
  effectiveness_review?: string;
  status: 'open' | 'in_progress' | 'implemented' | 'verified' | 'closed';
  created_at: string;
  updated_at: string;
}

// ── Clause 8.8 – Internal Audits ────────────────────────────────────────────
export interface InternalAudit {
  id: string;
  audit_number: string;
  scope: string;
  audit_type: 'planned' | 'unplanned';
  lead_auditor_id: string;
  audit_team: string[];               // personnel IDs
  planned_date: string;
  actual_date?: string;
  findings: AuditFinding[];
  status: 'planned' | 'in_progress' | 'completed' | 'closed';
  created_at: string;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  clause_reference: string;          // e.g. "6.4.3"
  finding_type: 'nonconformity' | 'observation' | 'opportunity_for_improvement';
  description: string;
  corrective_action_id?: string;
}

// ── Clause 8.9 – Management Reviews ─────────────────────────────────────────
export interface ManagementReview {
  id: string;
  review_number: string;
  review_date: string;
  chaired_by: string;                 // personnel ID
  attendees: string[];
  agenda_items: string[];
  inputs: string[];
  outputs: string[];
  action_items: ReviewActionItem[];
  minutes_document_ref?: string;
  status: 'planned' | 'completed';
}

export interface ReviewActionItem {
  id: string;
  review_id: string;
  description: string;
  responsible_person_id: string;
  due_date: string;
  status: 'open' | 'closed';
}

// ── Client ───────────────────────────────────────────────────────────────────
export interface Client {
  id: string;
  client_code: string;
  name: string;
  organization?: string;
  contact_email: string;
  contact_phone?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

// ── Document Control (Clause 8.3) ────────────────────────────────────────────
export type DocumentType = 'procedure' | 'work_instruction' | 'form' | 'policy' | 'external_standard';

export interface ControlledDocument {
  id: string;
  document_number: string;
  title: string;
  type: DocumentType;
  version: string;
  status: 'draft' | 'under_review' | 'approved' | 'obsolete';
  clause_references: string[];
  approved_by?: string;
  approved_at?: string;
  effective_date?: string;
  review_date?: string;
  file_url?: string;
  created_at: string;
  updated_at: string;
}

// ── Shared / Utility Types ───────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}
