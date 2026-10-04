import type { ElementType } from 'react'
import {
  LayoutDashboard,
  FilePlus2,
  FileStack,
  RefreshCw,
  Ban,
  Eye,
  MessageSquareWarning,
  BadgeCheck,
  FolderKanban,
  CalendarX2,
  CalendarClock,
  Users,
  BookOpen,
  Package,
  TestTube,
  Wallet,
  Mail,
  Globe,
  Settings,
  HelpCircle,
} from 'lucide-react'

/** Sidebar navigation. Module Access catalog is generated from this tree. */
export interface NavItem {
  label: string
  to?: string
  icon: ElementType
  clause?: string
  children?: NavItem[]
  requiredDesignations?: string[]
}

export interface NavSection {
  title: string
  clause: string
  icon: ElementType
  items: NavItem[]
}

/** Primary ops modules shown in the left sidebar. */
export const SIDEBAR_NAV_SECTIONS: NavSection[] = [
  {
    title: 'Home',
    clause: 'home',
    icon: LayoutDashboard,
    items: [
      {
        label: 'Dashboard',
        to: '/',
        icon: LayoutDashboard,
        clause: 'dashboard',
      },
    ],
  },
  {
    title: 'BIS Operations',
    clause: 'bis-operations',
    icon: FolderKanban,
    items: [
      {
        label: 'BIS New Application',
        to: '/bis/new-applications',
        icon: FilePlus2,
        clause: 'bis-new-applications',
      },
      {
        label: 'BIS New Inclusion',
        to: '/bis/new-inclusion',
        icon: FileStack,
        clause: 'bis-new-inclusion',
      },
      {
        label: 'BIS License Renewals',
        to: '/bis/license-renewals',
        icon: RefreshCw,
        clause: 'bis-license-renewals',
      },
      {
        label: 'License Stop Marking',
        to: '/bis/stop-marking',
        icon: Ban,
        clause: 'license-stop-marking',
      },
      {
        label: 'BIS Surveillances',
        to: '/bis/surveillance',
        icon: Eye,
        clause: 'bis-surveillance',
      },
      {
        label: 'Sample Failure Reply',
        to: '/bis/sample-failure-reply',
        icon: MessageSquareWarning,
        clause: 'bis-sample-failure-reply',
      },
      {
        label: 'QE BIS Licenses',
        to: '/bis/our-licenses',
        icon: BadgeCheck,
        clause: 'our-bis-licenses',
      },
      {
        label: 'All BIS Licenses',
        to: '/bis/projects',
        icon: FolderKanban,
        clause: 'bis-projects',
      },
      {
        label: 'Expired Licenses',
        to: '/bis/expired-licenses',
        icon: CalendarX2,
        clause: 'expired-licenses',
      },
      {
        label: 'Licenses Due Soon',
        to: '/bis/due-soon',
        icon: CalendarClock,
        clause: 'due-soon-licenses',
      },
    ],
  },
  {
    title: 'Masters',
    clause: 'masters',
    icon: Users,
    items: [
      {
        label: 'Client Master',
        to: '/masters/clients',
        icon: Users,
        clause: 'clients',
      },
      {
        label: 'IS Code Master',
        to: '/masters/is-codes',
        icon: BookOpen,
        clause: 'is-codes',
      },
      {
        label: 'Product & Services',
        to: '/masters/product-services',
        icon: Package,
        clause: 'products',
      },
      {
        label: 'Test Parameter',
        to: '/masters/test-parameter',
        icon: TestTube,
        clause: 'test-parameters',
      },
    ],
  },
  {
    title: 'Finance',
    clause: 'finance',
    icon: Wallet,
    items: [
      {
        label: 'Quotation',
        to: '/finance/sale/quotation',
        icon: Wallet,
        clause: 'finance-quotation',
      },
      {
        label: 'Proforma Invoice',
        to: '/finance/sale/proforma-invoice',
        icon: Wallet,
        clause: 'finance-proforma',
      },
      {
        label: 'Tax Invoice',
        to: '/finance/sale/invoice',
        icon: Wallet,
        clause: 'finance-invoice',
      },
      {
        label: 'Credit Note',
        to: '/finance/sale/credit-note',
        icon: Wallet,
        clause: 'finance-credit-note',
      },
      {
        label: 'Payment Receipt',
        to: '/finance/sale/payment-receipt',
        icon: Wallet,
        clause: 'finance-payment',
      },
    ],
  },
]

/** Tools + Settings — shown in the header user-profile dropdown (not sidebar). */
export const PROFILE_MENU_SECTIONS: NavSection[] = [
  {
    title: 'Tools',
    clause: 'tools',
    icon: Mail,
    items: [
      {
        label: 'Email',
        to: '/tools/email',
        icon: Mail,
        clause: 'email',
      },
      {
        label: 'Website CMS',
        to: '/tools/cms',
        icon: Globe,
        clause: 'cms',
      },
    ],
  },
  {
    title: 'Settings',
    clause: 'settings',
    icon: Settings,
    items: [
      {
        label: 'Company Settings',
        to: '/settings/lab',
        icon: Settings,
        clause: 'company-settings',
      },
      {
        label: 'User Management',
        to: '/settings/users',
        icon: Users,
        clause: 'user-management',
      },
      {
        label: 'Module Access',
        to: '/settings/module-access',
        icon: Settings,
        clause: 'module-access',
      },
      {
        label: 'AI Settings',
        to: '/settings/ai',
        icon: Settings,
        clause: 'ai-settings',
      },
      {
        label: 'Help',
        to: '/help',
        icon: HelpCircle,
        clause: 'help',
      },
      {
        label: 'Contact Us',
        to: '/contact',
        icon: Mail,
        clause: 'contact',
      },
    ],
  },
]

/** Full nav tree (sidebar + profile menu) for Module Access catalog. */
export const NAV_SECTIONS: NavSection[] = [...SIDEBAR_NAV_SECTIONS, ...PROFILE_MENU_SECTIONS]

export function flattenNavModules(): { key: string; label: string; section: string }[] {
  const out: { key: string; label: string; section: string }[] = []

  const walk = (items: NavItem[], section: string) => {
    for (const item of items) {
      if (item.to) {
        out.push({ key: item.to, label: item.label, section })
      }
      if (item.children?.length) walk(item.children, section)
    }
  }

  for (const section of NAV_SECTIONS) {
    walk(section.items, section.title)
  }
  return out
}
