export const PUBLIC_SITE_PATHS = [
  '/home',
  '/bis-certification',
  '/products',
  '/iso-certification',
  '/accreditation',
  '/how-it-works',
  '/about',
  '/enquiry',
  '/auth',
] as const

export type PublicSitePath = (typeof PUBLIC_SITE_PATHS)[number]

/** Tabs in the website's top bar and phone menu (owner, 25 Nov 2026); each is its own one-screen page. */
export const PUBLIC_TABS: Array<{ to: PublicSitePath; label: string }> = [
  { to: '/home', label: 'Home' },
  { to: '/bis-certification', label: 'BIS Certification' },
  { to: '/products', label: 'Products' },
  { to: '/iso-certification', label: 'ISO Certification' },
  { to: '/accreditation', label: 'Lab Accreditation' },
  { to: '/how-it-works', label: 'How it Works' },
  { to: '/about', label: 'About' },
  { to: '/enquiry', label: 'Contact' },
]

export function isPublicSitePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return (PUBLIC_SITE_PATHS as readonly string[]).includes(path)
}

/** Company details as on the letterhead and in Company Settings (checked 25 Nov 2026). */
export const PUBLIC_LAB_NAME = 'Quality Engineering'
export const PUBLIC_LAB_SHORT = 'Quality Engineering'
export const PUBLIC_TAGLINE = 'BIS & ISO Certification & NABL, QAI & IQAS Accreditation Consultants'
export const PUBLIC_EMAIL = 'info@qengineering.in'
export const PUBLIC_PHONE_PRIMARY = '+91 90094 13040'
export const PUBLIC_ADDRESS =
  'Plot No 7A, Avinash Logistic Park, SKS Road, Siltara Industrial Area, Phase II, Raipur 493221, Chhattisgarh, India'
export const PUBLIC_MAP_LAT = 21.384439868124627
export const PUBLIC_MAP_LNG = 81.66191600236276
export const PUBLIC_WEBSITE = 'www.qengineering.in'
