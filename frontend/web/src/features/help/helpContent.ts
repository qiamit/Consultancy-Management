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

/** Short how-to guide for the BIS consultancy workflows. */
export const HELP_GUIDE_SECTIONS: HelpGuideSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    summary: 'A role-based overview of clients, BIS work, licences, and finance.',
    tips: [
      'Open a card to go to its module when your account has access.',
      'Use expiry and due-soon counts to plan licence follow-up.',
    ],
  },
  {
    id: 'clients',
    title: 'Clients',
    summary: 'Maintain company details, addresses, contacts, certificates, and portal access.',
    tips: [
      'Keep the registered office and factory addresses up to date for application documents.',
      'Upload client certificates in the client record so they can be included in document packs.',
    ],
  },
  {
    id: 'bis-projects',
    title: 'BIS Projects & Licences',
    summary: 'Manage applications, inclusions, renewals, surveillance, and licence documents.',
    tips: [
      'Select a client and IS Code, then maintain the application and project modules.',
      'Use document preview to review generated forms before printing or downloading.',
    ],
  },
  {
    id: 'documents',
    title: 'Application Documents',
    summary: 'Prepare Form 1, supporting declarations, location maps, and application packs.',
    tips: [
      'Check the preview for page breaks, dates, signatures, and attached certificates.',
      'Download one document or select documents for a combined export.',
    ],
  },
  {
    id: 'finance',
    title: 'Quotations & Finance',
    summary: 'Create and manage quotations, invoices, credit notes, and payment receipts.',
    tips: [
      'Review client, item, tax, payment terms, and totals before issuing a document.',
      'Use the document preview to print or share the generated finance document.',
    ],
  },
  {
    id: 'assistant',
    title: 'QE Assistant',
    summary: 'Ask questions about consultancy workflows and the current module.',
    tips: [
      'Give the assistant the relevant client, IS Code, and application context.',
      'Review generated content against the applicable BIS standard before using it.',
    ],
  },
  {
    id: 'masters',
    title: 'Masters',
    summary: 'Maintain clients, IS Codes, products and services, and shared options.',
    tips: [
      'Keep IS Code titles and revision details accurate; they appear in BIS documents.',
      'Changes to master records can affect linked applications and finance documents.',
    ],
  },
  {
    id: 'access',
    title: 'Settings & Access',
    summary: 'Configure company preferences, users, module access, and AI settings.',
    tips: [
      'Module access controls which sections each user can view or edit.',
      'Check currency, date format, and company details before generating documents.',
      'Settings access depends on your account role.',
    ],
  },
]

export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: 'faq-login',
    question: 'I cannot open a module that appears for other users. Why?',
    answer:
      'Your Module Access may not include that module. Ask an administrator to review the access assigned to your account.',
  },
  {
    id: 'faq-document-preview',
    question: 'How do I check a generated BIS document before printing?',
    answer:
      'Open the document preview and check its text, page breaks, dates, and signatures. If a supporting file is missing, confirm it is attached to the client or project record.',
  },
  {
    id: 'faq-theme',
    question: 'Where do I change date format or currency?',
    answer:
      'Open Company Settings and update the date, time, or currency preference. Review a document preview after changing these settings.',
  },
  {
    id: 'faq-application',
    question: 'What should I check before submitting an application pack?',
    answer:
      'Confirm the client details, factory address, selected IS Code and revision, application date, required declarations, and supporting attachments.',
  },
  {
    id: 'faq-is-title',
    question: 'How should Product IS Code Title appear on Form 1?',
    answer:
      'The product title, IS number, and revision year come from the linked IS Code master. Verify the master record before generating the application.',
  },
  {
    id: 'faq-support',
    question: 'Who do I contact for account or access issues?',
    answer:
      'Contact your account administrator for user access. Use Contact Us for company support details.',
  },
]
