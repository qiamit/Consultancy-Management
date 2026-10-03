export const PUBLIC_SITE_PATHS = [
  '/home',
  '/about',
  '/services',
  '/contact',
  '/auth',
] as const

export type PublicSitePath = (typeof PUBLIC_SITE_PATHS)[number]

export const PUBLIC_NAV_ITEMS: Array<{ to: PublicSitePath; label: string }> = [
  { to: '/home', label: 'Home' },
  { to: '/auth', label: 'Login' },
]

export const PUBLIC_SECTION_LINKS: Array<{ href: string; label: string }> = [
  { href: '/home', label: 'Home' },
  { href: '/home#about', label: 'About' },
  { href: '/home#contact', label: 'Contact Us' },
  { href: '/auth', label: 'Login' },
]

export function isPublicSitePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return (PUBLIC_SITE_PATHS as readonly string[]).includes(path)
}

export const PUBLIC_LAB_NAME = 'Q Engineering'
export const PUBLIC_TAGLINE_LEAD = 'BIS Licensing &'
export const PUBLIC_TAGLINE_ACCENT = 'Compliance Consultancy'
export const PUBLIC_TAGLINE_SUB =
  'Consultancy Pro helps manufacturers and laboratories manage BIS licensing, renewals, surveillance, IS codes, and finance — on the same reliable Railway stack as Qirlpl LIMS.'
export const PUBLIC_EMAIL = 'info@qengineering.in'
export const PUBLIC_SUPPORT_EMAIL = 'info@qengineering.in'
export const PUBLIC_PHONE_PRIMARY = '+91 99816 33040'
export const PUBLIC_PHONE_SECONDARY = '+91 99146 63040'
export const PUBLIC_ADDRESS =
  'Raipur, Chhattisgarh, India'
export const PUBLIC_MAP_LAT = 21.2514
export const PUBLIC_MAP_LNG = 81.6296
export const PUBLIC_NABL_TESTING = 'BIS Consultancy'
export const PUBLIC_NABL_CALIBRATION = 'ISO Support'
export const PUBLIC_CIN = ''
export const PUBLIC_BIS = 'Consultancy Pro'
export const PUBLIC_DOC_NABL_CALIBRATION = '#'
export const PUBLIC_DOC_NABL_TESTING = '#'
export const PUBLIC_DOC_BIS = '#'
