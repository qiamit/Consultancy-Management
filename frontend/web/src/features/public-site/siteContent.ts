import type { SiteIconName } from './siteParts'

/*
 * Words on the Quality Engineering website, from the company's own papers (checked 25 Nov 2026): the OneDrive folder
 * "Quality Engineering" (client folders by state and by kind of work, BIS Process & Documents Requirements, the BIS
 * guidelines handbook, ISO 9001 / 14001 / 45001 / 50001 and NABL ISO/IEC 17025 quotations, QAI CIA-025, BIS test
 * requests and laboratory consent letters, implementation formats) and the app's records (clients, BIS projects,
 * IS Code Master).
 *
 * Quality Engineering is a consultant: BIS, the certification body or the accreditation body decides, and samples
 * are tested by BIS-recognised laboratories. Never promise a result or a date that they decide, and never show the
 * ISI mark or the NABL logo (they belong to licensees and accredited laboratories).
 */

export const HOME = {
  badge: 'BIS, ISO and NABL Consultants in Raipur',
  title: ['Your ISI Mark,', 'Made Simple.'] as const,
  lede: 'We guide manufacturers through BIS product certification, from the first document to the licence and every renewal after it, and help factories and laboratories get ISO certification and NABL accreditation.',
  lines: [
    { to: '/bis-certification', label: 'BIS Product Certification (ISI Mark)', icon: 'licence' },
    { to: '/iso-certification', label: 'ISO 9001 · 14001 · 45001 · 50001', icon: 'checklist' },
    { to: '/accreditation', label: 'NABL · QAI · IQAS Accreditation', icon: 'lab' },
  ] satisfies Array<{ to: string; label: string; icon: SiteIconName }>,
  /** From the client folders and the app (25 Nov 2026). */
  figures: [
    { value: '600+', label: 'Manufacturers Served' },
    { value: '1,100+', label: 'BIS Projects Handled' },
    { value: '330+', label: 'Indian Standards Covered' },
    { value: '24', label: 'States & Union Territories' },
  ],
}

/** BIS work, in the same order as the folders kept for every client. */
export const BIS_WORK: Array<{ title: string; icon: SiteIconName; note: string; points: string[] }> = [
  {
    title: 'New Licence',
    icon: 'licence',
    note: 'Scheme-I licence, by the normal or the simplified procedure.',
    points: ['Product scope by IS, type, grade and size', 'Documents and Manak Online application', 'Factory readiness and sample testing'],
  },
  {
    title: 'Inclusion',
    icon: 'stack',
    note: 'A new standard, grade, size or brand on a licence.',
    points: ['Scope check against the standard', 'Test reports for the added variety', 'Inclusion request and follow-up'],
  },
  {
    title: 'Renewal',
    icon: 'renew',
    note: 'Renewed on time, with fee and records in order.',
    points: ['Reminders well before expiry', 'Renewal application and fee', 'Replies to BIS queries'],
  },
  {
    title: 'Surveillance',
    icon: 'watch',
    note: 'Ready for every BIS visit and sample.',
    points: ['Test records and control registers', 'Calibration and in-house test checks', 'Visit preparation and replies'],
  },
  {
    title: 'Sample Failure Reply',
    icon: 'reply',
    note: 'A clear reply with the cause and the action.',
    points: ['Root cause and corrective action', 'Retest and supporting evidence', 'Reply to the BIS branch office'],
  },
  {
    title: 'Licence Changes',
    icon: 'changes',
    note: 'The licence kept in line with the business.',
    points: ['Firm name and address change', 'Brand name update', 'Stop marking and restart'],
  },
  {
    title: 'BIS Notices',
    icon: 'notice',
    note: 'Prompt, documented replies to BIS.',
    points: ['Show cause notices', 'Suspension notices', 'Cancellation notices'],
  },
  {
    title: 'Revisions & Amendments',
    icon: 'checklist',
    note: 'Moved to a revised standard in time.',
    points: ['Gap check against the revision', 'Implementation documents', 'Updated test plan and records'],
  },
]

export const BIS_ROUTES =
  'Normal procedure: BIS inspects the factory and tests samples first. Simplified procedure: the licence is granted on independent test reports, and BIS verifies afterwards. The product’s standard decides which applies.'

/** Standards our clients hold most (client folders, 25 Nov 2026), by product family. */
export const FAMILIES: Array<{ title: string; icon: SiteIconName; standards: string[] }> = [
  {
    title: 'Structural & Long Steel',
    icon: 'stack',
    standards: ['IS 2062', 'IS 1786', 'IS 15911', 'IS 10748', 'IS 513-1', 'IS 1079', 'IS 5986', 'IS 11513', 'IS 7887', 'IS 280', 'IS 432-1'],
  },
  { title: 'Billets & Ferro Alloys', icon: 'furnace', standards: ['IS 14650', 'IS 2830', 'IS 2831', 'IS 1470'] },
  {
    title: 'Tubes & Pipes',
    icon: 'pipe',
    standards: ['IS 1161', 'IS 3601', 'IS 4923', 'IS 18573', 'IS 1239-1', 'IS 3589', 'IS 9295', 'IS 4270'],
  },
  { title: 'Galvanised Steel & Wire', icon: 'guard', standards: ['IS 277', 'IS 2721', 'IS 278'] },
  {
    title: 'Stainless Steel & Kitchenware',
    icon: 'licence',
    standards: ['IS 15997', 'IS 14756', 'IS 6911', 'IS 5522', 'IS 17569', 'IS 17790'],
  },
  { title: 'Aluminium & Conductors', icon: 'bolt', standards: ['IS 733', 'IS 1285', 'IS 5082', 'IS 398-2'] },
  {
    title: 'Plastics, Irrigation & Textiles',
    icon: 'water',
    standards: ['IS 4984', 'IS 4985', 'IS 12786', 'IS 13488', 'IS 17425', 'IS 14887', 'IS 17261', 'IS 17262'],
  },
  {
    title: 'Building, Furniture & Food',
    icon: 'building',
    standards: ['IS 15658', 'IS 458', 'IS 1489-1', 'IS 17631', 'IS 17632', 'IS 17633', 'IS 17634', 'IS 17782'],
  },
]

/** Management systems (quotations of 2026). */
export const ISO_SYSTEMS: Array<{ code: string; title: string; note: string; icon: SiteIconName }> = [
  { code: 'ISO 9001', title: 'Quality Management', note: 'Consistent products and processes, satisfied customers.', icon: 'licence' },
  { code: 'ISO 14001', title: 'Environmental Management', note: 'Environmental aspects controlled, legal duties met.', icon: 'leaf' },
  { code: 'ISO 45001', title: 'Health & Safety at Work', note: 'Hazards and risks under control, safer work.', icon: 'safety' },
  { code: 'ISO 50001', title: 'Energy Management', note: 'Energy use measured, reviewed and reduced.', icon: 'gauge' },
]

export const ISO_PATH: Array<{ title: string; text: string }> = [
  { title: 'Gap Analysis', text: 'A visit to your works to compare today’s system with the standard.' },
  { title: 'Documentation', text: 'System manual, procedures, work instructions and formats.' },
  { title: 'Implementation', text: 'Policy, objectives, risks and KPIs working in every department.' },
  { title: 'Internal Audit', text: 'Trained internal auditors, a full audit and a management review.' },
  { title: 'Certification', text: 'Application to the certification body, such as BIS, and support to the certificate.' },
]

/** Laboratory accreditation (NABL quotation of Oct 2026, QAI CIA-025, the letterhead). */
export const LAB_SCHEMES: Array<{ code: string; name: string; note: string; points: string[]; icon: SiteIconName }> = [
  {
    code: 'NABL',
    name: 'ISO/IEC 17025 Laboratories',
    note: 'Factory laboratories, independent laboratories, government and railway laboratories.',
    points: ['Gap analysis and action plan', 'Quality manual, SOPs, validation, uncertainty', 'Training, internal audit, management review', 'Application, assessment and NC replies'],
    icon: 'lab',
  },
  {
    code: 'QAI',
    name: 'Quality and Accreditation Institute',
    note: 'Accreditation of testing laboratories under QAI.',
    points: ['Documents and forms QAI asks for', 'Impartiality and competence records', 'Assessment and ongoing monitoring'],
    icon: 'licence',
  },
  {
    code: 'IQAS',
    name: 'IQAS Accreditation',
    note: 'Documentation and training for IQAS accreditation.',
    points: ['Clause-by-clause training', 'Documents and records', 'Support during assessment'],
    icon: 'checklist',
  },
]

/** The way to a BIS licence (BIS Process & Documents Requirements, 01 Oct 2026). */
export const LICENCE_PATH: Array<{ title: string; text: string }> = [
  { title: 'Enquiry', text: 'Tell us the product. We confirm the Indian Standard, the scheme and the papers needed.' },
  { title: 'Documents', text: 'Firm, factory, staff, machinery and test equipment details, gathered with our checklist.' },
  { title: 'Factory Readiness', text: 'In-house laboratory, control records and implementation documents as the standard asks.' },
  { title: 'Application', text: 'Registration and application on BIS Manak Online, with samples tested at a BIS-recognised laboratory.' },
  { title: 'Licence', text: 'BIS inspects and grants the licence. We stay with you for renewals, surveillance and changes.' },
]

export const PATH_NOTES: Array<{ title: string; text: string; icon: SiteIconName; to?: string }> = [
  { title: 'Before You Apply', text: 'Our checklist names every paper: firm and factory documents, staff, machinery and test equipment.', icon: 'checklist' },
  { title: 'Testing Your Samples', text: 'We arrange testing at a BIS-recognised laboratory and check every report against the standard.', icon: 'flask' },
  { title: 'After the Licence', text: 'Renewals, surveillance, inclusions and changes, on time. Write to us ›', icon: 'timer', to: '/enquiry' },
]

export const WHY_US: Array<{ title: string; text: string; icon: SiteIconName }> = [
  { title: 'Complete File Handling', text: 'Documents, application and replies, done for you.', icon: 'checklist' },
  { title: 'Always Up to Date', text: 'Current BIS guidelines, QCOs and standards.', icon: 'changes' },
  { title: 'Confidential', text: 'Your documents and data stay yours.', icon: 'lock' },
  { title: 'On Time', text: 'Renewal and surveillance dates tracked.', icon: 'timer' },
  { title: 'Laboratory Network', text: 'Testing at BIS-recognised labs across India.', icon: 'flask' },
  { title: 'Digital Records', text: 'Every licence and document in our software.', icon: 'records' },
]

export const SECTORS: string[] = [
  'Steel Plants & Re-Rolling Mills',
  'Tube & Pipe Makers',
  'Stainless Steel Utensil Makers',
  'Housewares & Furniture',
  'Ferro Alloys',
  'Aluminium Products',
  'Plastic Pipes & Irrigation',
  'Textiles & Woven Sacks',
  'Cement & Building Products',
  'Food Products',
  'Testing Laboratories',
]

export const ABOUT: Array<{ title: string; text: string }> = [
  {
    title: 'Who We Are',
    text: 'A BIS and ISO certification consultancy in Siltara Industrial Area, Raipur, working with manufacturers since 2018, in 24 states and union territories.',
  },
  {
    title: 'What We Do',
    text: 'BIS product certification (ISI Mark), from the first application to every renewal and change; ISO 9001, 14001, 45001 and 50001; NABL, QAI and IQAS accreditation for laboratories.',
  },
  {
    title: 'How We Work',
    text: 'A checklist for every standard, our own library of Indian Standards and BIS guidelines, and our own software that tracks every licence date.',
  },
]
