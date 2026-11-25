/**
 * Words on the public website (qengineering.in/home), from Quality Engineering's own documents (checked 25 Nov 2026):
 * the OneDrive folder "Quality Engineering" (client folders by state and work type, BIS Process & Documents
 * Requirements, BIS Guidelines handbook, ISO 9001 / 14001 / 45001 / 50001 and NABL ISO/IEC 17025 quotations, QAI
 * CIA-025, BIS test requests and lab consent letters, implementation formats) and the app's own records (clients,
 * BIS projects, IS Code Master).
 *
 * Rules: Quality Engineering is a consultant. It does not grant licences, certificates or accreditation and does not
 * test samples itself; BIS, the certification body or the accreditation body decides, and samples are tested in
 * BIS-recognised or NABL-accredited laboratories. Never promise a result or a date that BIS decides.
 */

export type IconName =
  | 'atom'
  | 'badge'
  | 'building'
  | 'clipboard'
  | 'cog'
  | 'eye'
  | 'file'
  | 'flame'
  | 'flask'
  | 'gauge'
  | 'layers'
  | 'lock'
  | 'microscope'
  | 'ruler'
  | 'scale'
  | 'shield'
  | 'thermometer'
  | 'timer'
  | 'truck'
  | 'waves'
  | 'zap'

export const HERO = {
  eyebrow: 'BIS · ISO · NABL Consultants · Raipur, Chhattisgarh',
  titleLead: 'Your ISI Mark,',
  titleAccent: 'Made Simple.',
  lead: 'We guide manufacturers through BIS product certification, from the first document to the licence and every renewal after it, and help factories and laboratories get ISO certification and NABL accreditation.',
}

/** Figures from the company's records (client folders and the app, 25 Nov 2026). */
export const STATS: Array<{ value: string; label: string }> = [
  { value: '600+', label: 'Manufacturers Served' },
  { value: '1,100+', label: 'BIS Projects Handled' },
  { value: '330+', label: 'Indian Standards Covered' },
  { value: '24', label: 'States & Union Territories' },
]

export type ServiceCard = {
  title: string
  icon: IconName
  body: string
  items: string[]
}

/** BIS product certification work, as the client folders are organised (Application, Inclusion, Renewal ...). */
export const BIS_SERVICES: ServiceCard[] = [
  {
    title: 'New Licence',
    icon: 'badge',
    body: 'Grant of licence under Scheme-I (ISI Mark), normal or simplified procedure.',
    items: [
      'Product scope by IS, type, grade and size',
      'Documents and Manak Online application',
      'Factory readiness and sample testing',
    ],
  },
  {
    title: 'Inclusion',
    icon: 'layers',
    body: 'Add a new Indian Standard, grade, size or brand to an existing licence.',
    items: ['Scope check against the standard', 'Test reports for the added variety', 'Inclusion request and follow-up'],
  },
  {
    title: 'Renewal',
    icon: 'timer',
    body: 'Licence renewed on time, with the marking fee and records in order.',
    items: ['Reminders well before the expiry date', 'Renewal application and fee', 'Replies to BIS queries'],
  },
  {
    title: 'Surveillance',
    icon: 'eye',
    body: 'Ready for every BIS surveillance visit and sample.',
    items: ['Test records and quality control registers', 'Calibration and in-house test checks', 'Visit preparation and replies'],
  },
  {
    title: 'Sample Failure Reply',
    icon: 'shield',
    body: 'When a surveillance sample fails, a clear reply with the root cause and corrective action.',
    items: ['Root cause and corrective action', 'Retest and supporting evidence', 'Reply to the BIS branch office'],
  },
  {
    title: 'Licence Changes',
    icon: 'file',
    body: 'Keep the licence matching the business.',
    items: ['Firm name and address change', 'Brand name update', 'Stop marking and restart'],
  },
  {
    title: 'Suspension & Cancellation',
    icon: 'lock',
    body: 'Prompt, well-documented replies to BIS notices.',
    items: ['Show cause notices', 'Suspension notices', 'Cancellation notices'],
  },
  {
    title: 'New Revisions & Amendments',
    icon: 'clipboard',
    body: 'Move production and records to a revised standard or amendment in time.',
    items: ['Gap check against the new revision', 'Implementation documents', 'Updated test plan and records'],
  },
]

/** BIS standards seen most often in the client folders (25 Nov 2026), grouped by product family. */
export const PRODUCT_GROUPS: Array<{ title: string; icon: IconName; standards: string[] }> = [
  {
    title: 'Structural & Long Steel',
    icon: 'layers',
    standards: ['IS 2062', 'IS 1786', 'IS 15911', 'IS 10748', 'IS 513-1', 'IS 1079', 'IS 5986', 'IS 11513', 'IS 7887', 'IS 280', 'IS 432-1'],
  },
  {
    title: 'Billets & Ferro Alloys',
    icon: 'flame',
    standards: ['IS 14650', 'IS 2830', 'IS 2831', 'IS 1470'],
  },
  {
    title: 'Tubes & Pipes',
    icon: 'cog',
    standards: ['IS 1161', 'IS 3601', 'IS 4923', 'IS 18573', 'IS 1239-1', 'IS 3589', 'IS 9295', 'IS 4270'],
  },
  { title: 'Galvanised Steel & Wire', icon: 'shield', standards: ['IS 277', 'IS 2721', 'IS 278'] },
  {
    title: 'Stainless Steel & Kitchenware',
    icon: 'badge',
    standards: ['IS 15997', 'IS 14756', 'IS 6911', 'IS 5522', 'IS 17569', 'IS 17790'],
  },
  { title: 'Aluminium & Conductors', icon: 'zap', standards: ['IS 733', 'IS 1285', 'IS 5082', 'IS 398-2'] },
  {
    title: 'Plastics, Irrigation & Textiles',
    icon: 'waves',
    standards: ['IS 4984', 'IS 4985', 'IS 12786', 'IS 13488', 'IS 17425', 'IS 14887', 'IS 17261', 'IS 17262'],
  },
  {
    title: 'Building, Furniture & Food',
    icon: 'building',
    standards: ['IS 15658', 'IS 458', 'IS 1489-1', 'IS 17631', 'IS 17632', 'IS 17633', 'IS 17634', 'IS 17782'],
  },
]

/** Management system certification (quotations of 2026: ISO 9001, 14001, 45001, 50001). */
export const ISO_SYSTEMS: Array<{ code: string; title: string; body: string; icon: IconName }> = [
  { code: 'ISO 9001', title: 'Quality Management', body: 'Consistent products and processes, satisfied customers.', icon: 'badge' },
  { code: 'ISO 14001', title: 'Environmental Management', body: 'Control of environmental aspects and legal compliance.', icon: 'waves' },
  { code: 'ISO 45001', title: 'Occupational Health & Safety', body: 'Safe work, with hazards and risks under control.', icon: 'shield' },
  { code: 'ISO 50001', title: 'Energy Management', body: 'Measured, reviewed and reduced energy use.', icon: 'zap' },
]

export const ISO_STEPS: Array<{ title: string; body: string }> = [
  { title: 'Gap Analysis', body: 'A visit to your works to compare the present system with the standard.' },
  { title: 'Documentation', body: 'Four levels: system manual, procedures, work instructions and formats.' },
  { title: 'Implementation', body: 'Policy, objectives, risks and KPIs put to work in every department.' },
  { title: 'Internal Audit', body: 'Trained internal auditors, a full audit and a management review.' },
  { title: 'Certification', body: 'Application to the certification body, such as BIS, and support until the certificate.' },
]

/** Laboratory accreditation consultancy (NABL quotation of Oct 2026, QAI CIA-025, the tagline). */
export const ACCREDITATIONS: Array<{ code: string; title: string; body: string; items: string[]; icon: IconName }> = [
  {
    code: 'NABL',
    title: 'ISO/IEC 17025 Labs',
    body: 'For in-house factory labs, independent labs, and government and railway labs.',
    items: [
      'Gap analysis and action plan',
      'Quality manual, SOPs, validation, uncertainty',
      'Training, internal audit, management review',
      'Application, assessment and NC replies',
    ],
    icon: 'microscope',
  },
  {
    code: 'QAI',
    title: 'Quality and Accreditation Institute',
    body: 'Accreditation of testing laboratories under QAI.',
    items: ['Documents and forms as QAI requires', 'Impartiality and competence records', 'Assessment and ongoing monitoring'],
    icon: 'badge',
  },
  {
    code: 'IQAS',
    title: 'IQAS Accreditation',
    body: 'Documentation and training for IQAS accreditation.',
    items: ['Clause-by-clause training', 'Documents and records', 'Support during assessment'],
    icon: 'clipboard',
  },
]

/** The BIS licence path (BIS Process & Documents Requirements, 01 Oct 2026). */
export const PROCESS_STEPS: Array<{ title: string; body: string }> = [
  { title: 'Enquiry', body: 'Tell us the product. We confirm the Indian Standard, the scheme and the documents needed.' },
  { title: 'Documents', body: 'Firm, factory, staff, machinery and test equipment details, collected with our checklist.' },
  { title: 'Factory Readiness', body: 'In-house lab, quality control records and implementation documents set up as the standard asks.' },
  { title: 'Application', body: 'Registration and application on BIS Manak Online, with samples tested at a BIS-recognised lab.' },
  { title: 'Licence', body: 'BIS inspects and grants the licence. We stay for renewals, surveillance and every change.' },
]

export const QUALITY_POINTS: Array<{ title: string; body: string; icon: IconName }> = [
  { title: 'Complete File Handling', body: 'Documents, application and replies, done for you.', icon: 'clipboard' },
  { title: 'Always Up to Date', body: 'Current BIS guidelines, QCOs and standards.', icon: 'file' },
  { title: 'Confidential', body: 'Your documents and data stay yours.', icon: 'lock' },
  { title: 'On Time', body: 'Renewal and surveillance dates tracked.', icon: 'timer' },
  { title: 'Lab Network', body: 'Testing at BIS-recognised labs across India.', icon: 'flask' },
  { title: 'Digital Records', body: 'Every licence and document in our software.', icon: 'shield' },
]

export const INDUSTRIES: string[] = [
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

export const ABOUT_CARDS: Array<{ title: string; body: string }> = [
  {
    title: 'Who We Are',
    body: 'A BIS and ISO certification consultancy in Siltara Industrial Area, Raipur, working with manufacturers since 2018, in 24 states and union territories.',
  },
  {
    title: 'What We Do',
    body: 'BIS product certification (ISI Mark), from the first application to every renewal and change; ISO 9001, 14001, 45001 and 50001; NABL, QAI and IQAS accreditation for laboratories.',
  },
  {
    title: 'How We Work',
    body: 'A checklist for every standard, our own library of Indian Standards and BIS guidelines, and our own software that tracks every licence date.',
  },
]
