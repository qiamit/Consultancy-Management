export type HelpGuideSection = {
  id: string
  title: string
  summary: string
  tips: string[]
}

export type HelpFaqItem = {
  id: string
  question: string
  answer: string
}

/** Short how-to guide aligned with main LIMS sidebar modules. */
export const HELP_GUIDE_SECTIONS: HelpGuideSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    summary: 'Role-based overview of samples, equipment, and finance shortcuts.',
    tips: [
      'Open any KPI or card to jump to the related module (if your Module Access allows it).',
      'Overdue and due-soon counts help prioritize daily work.',
    ],
  },
  {
    id: 'management',
    title: 'Management Documentation & System',
    summary: 'Level 1–4 documents, objectives, risk, audit/MRM, personnel, complaints, and CAPA.',
    tips: [
      'Use Master Document levels for controlled QMS documents.',
      'Non Conformities and Corrective Action share a unified CAPA hub where linked.',
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment Management',
    summary: 'Testing/calibration equipment masters, IQC, CRM, schedules, and breakdown register.',
    tips: [
      'Keep calibration and maintenance due dates updated so dashboards stay accurate.',
      'CRM list supports uncertainty rows used in testing traceability.',
    ],
  },
  {
    id: 'testing-lims',
    title: 'Testing LIMS (Sample Handling)',
    summary: 'End-to-end sample flow from receiving through issued test reports.',
    tips: [
      'Stages move with the sample: Receiving → Allocation → Test Allocation → Under Testing → Review → Report → Issued.',
      'Module Access and your designation control which stages you can open.',
      'Validating the Results, NABL Scope, and Test Parameter support quality of reported data.',
    ],
  },
  {
    id: 'calibration-lims',
    title: 'Calibration LIMS',
    summary: 'Service request through certificate preparation for calibration jobs.',
    tips: [
      'Use Calibration Handling stages in order for each job.',
      'Calibration Equipments and NABL Scope (Calibration) are separate from Testing equipment masters.',
    ],
  },
  {
    id: 'finance',
    title: 'Finance Management',
    summary: 'Sale documents: quotation, proforma, invoice, credit note, and payment receipt.',
    tips: [
      'Currency and date formats follow Lab Settings preferences across the app.',
      'Quotations can be printed or shared using the document view.',
    ],
  },
  {
    id: 'masters',
    title: 'Master Managements',
    summary: 'Client Master, IS Code Master, and Product & Services.',
    tips: [
      'Keep IS codes and product titles accurate — they appear on test reports and consent letters.',
      'Client address fields feed Part A cover details on reports.',
    ],
  },
  {
    id: 'access',
    title: 'Module Access & Lab Settings',
    summary: 'Laboratory Director configures themes, formats, users, and per-module View/Edit/None.',
    tips: [
      'None on a module hides it from that user’s sidebar and dashboard.',
      'View allows browsing without save/delete actions where enforced.',
      'Only Laboratory Director can open Lab Settings, User Management, Module Access, and AI Settings.',
    ],
  },
]

export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: 'faq-login',
    question: 'I cannot open a module that appears for other users. Why?',
    answer:
      'Your Module Access may be set to None for that module, or your designation/department role only allows specific stages. Ask your Laboratory Director to review Module Access for your user.',
  },
  {
    id: 'faq-none-calibration',
    question: 'Calibration LIMS is set to None but I still see related cards. What should I do?',
    answer:
      'After Module Access is saved, sign out and sign in (or hard refresh). Dashboard and sidebar now follow the saved matrix. Equipment Management (testing equipment) is separate from Calibration LIMS.',
  },
  {
    id: 'faq-theme',
    question: 'How do I change theme, date format, or currency?',
    answer:
      'Laboratory Director: open Lab Settings → System / preferences. Theme, date format, time format, and currency apply across the app for the lab session preferences stored on this device.',
  },
  {
    id: 'faq-report',
    question: 'Where do I prepare and issue a test report?',
    answer:
      'Open Testing LIMS → Test Report Preparation. Complete Part A–D checks, then Issue. Issued reports appear under Issued Test Report. Access depends on Module Access and role.',
  },
  {
    id: 'faq-is-title',
    question: 'How should Product IS Code Title appear on Part A?',
    answer:
      'Format is: IS Title as per IS Number: Revision Year (example: High Strength Deformed Steel Bars as per IS 1786: 2008). Values come from the linked IS Code master.',
  },
  {
    id: 'faq-support',
    question: 'Who do I contact for account or access issues?',
    answer:
      'Contact your Laboratory Director for Module Access and user accounts. Use Contact Us from the profile menu for laboratory phone, email, and address from Lab Settings.',
  },
]
