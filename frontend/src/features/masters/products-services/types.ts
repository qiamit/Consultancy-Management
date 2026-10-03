import { stripCurrencyNoise } from '@/lib/appCurrency'

export const ITEM_TYPES = ['Product', 'Service'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

/** Default seeded categories — UI also supports custom names via product_item_categories. */
export const ITEM_CATEGORIES = ['Calibration', 'Testing'] as const
export type ItemCategory = string

export type ProductServiceRow = {
  id: string
  item_type: ItemType
  item_code: string
  item_category: ItemCategory
  item_name: string
  item_description: string | null
  hsn_code: string | null
  sale_price: number
  purchase_price: number
  gst_percent: number
  discount: number
  unit_of_measurement: string | null
  make: string | null
  opening_stock: number
  low_stock_alert: number
  created_at?: string
  updated_at?: string
}

export type ProductServiceForm = {
  itemType: ItemType
  itemCode: string
  itemCategory: ItemCategory
  itemName: string
  itemDescription: string
  hsnCode: string
  salePrice: string
  purchasePrice: string
  gstPercent: string
  discount: string
  unitOfMeasurement: string
  make: string
  openingStock: string
  lowStockAlert: string
}

export function emptyProductServiceForm(itemType: ItemType = 'Service'): ProductServiceForm {
  return {
    itemType,
    itemCode: '',
    itemCategory: 'Testing',
    itemName: '',
    itemDescription: '',
    hsnCode: '',
    salePrice: '0.00',
    purchasePrice: '0.00',
    gstPercent: '18.00',
    discount: '0.00',
    unitOfMeasurement: 'Nos',
    make: 'QIRLPL',
    openingStock: '0',
    lowStockAlert: '0',
  }
}

export function normalizeText(value: string): string {
  return value.trim()
}

/** Strip currency formatting noise (symbols, commas, spaces) before parse. */
export function sanitizeMoneyInput(value: string): string {
  const cleaned = stripCurrencyNoise(value)
  if (!cleaned) return ''
  const parts = cleaned.split('.')
  const intPart = (parts[0] ?? '').replace(/[^0-9]/g, '')
  const decPart = (parts[1] ?? '').replace(/[^0-9]/g, '').slice(0, 2)
  if (parts.length > 1) return `${intPart}.${decPart}`
  return intPart
}

export function isValidNumberOrEmpty(value: string): boolean {
  const v = sanitizeMoneyInput(value)
  if (!v) return true
  const n = Number(v)
  return Number.isFinite(n) && n >= 0
}

export function parseMoney(value: string): number {
  const n = Number(sanitizeMoneyInput(value))
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(value: number | null | undefined): string {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Form field display — always 2 decimal places (plain, no commas while typing). */
export function formatMoneyInput(value: string): string {
  const v = sanitizeMoneyInput(value)
  if (!v) return '0.00'
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

/** Next code: Product → P-0001, Service → S-0001 */
export function nextItemCode(itemType: ItemType, existingCodes: string[]): string {
  const prefix = itemType === 'Product' ? 'P-' : 'S-'
  let max = 0
  for (const code of existingCodes) {
    const m = code.trim().toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`, 'i'))
    if (!m) continue
    const n = Number.parseInt(m[1]!, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** Product-only stock fields — hidden when Service is selected */
export function isProductStockFieldVisible(itemType: ItemType): boolean {
  return itemType === 'Product'
}
