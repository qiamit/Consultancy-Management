import { useState } from 'react'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { GstRateSelect } from '@/features/masters/gst-rates/GstRateSelect'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { ItemCategorySelect } from './ItemCategorySelect'
import { MakeSelect } from './MakeSelect'
import {
  ITEM_TYPES,
  formatMoneyInput,
  isProductStockFieldVisible,
  isValidNumberOrEmpty,
  sanitizeMoneyInput,
  type ItemType,
  type ProductServiceForm,
} from './types'

/** Official GST portal — Search HSN / SAC codes (pre-login available). */
const HSN_SAC_FINDER_URL = 'https://services.gst.gov.in/services/searchhsnsac'

function CurrencyInrField({
  id,
  label,
  value,
  onChange,
  placeholder = '0.00',
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = focused ? value : formatMoneyInput(value || '0')

  return (
    <div className={cn('flex flex-col space-y-2', className)}>
      <div className="flex h-5 items-center">
        <Label htmlFor={id}>{label}</Label>
      </div>
      <div className="flex h-10 overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
        <span
          className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700"
          aria-hidden
        >
          {getCurrencySymbol()}
        </span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onFocus={() => setFocused(true)}
          onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
          onBlur={() => {
            setFocused(false)
            onChange(formatMoneyInput(value || '0'))
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-0"
          aria-label={`${label} in ${getCurrencyCode()}`}
        />
      </div>
    </div>
  )
}

export function ProductsServicesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onItemTypeChange,
  codeLocked,
  hideFooter = false,
}: {
  form: ProductServiceForm
  onChange: (next: ProductServiceForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  /** When item type changes, parent regenerates item code (P-#### / S-####). */
  onItemTypeChange: (itemType: ItemType) => void
  /** Auto code is read-only on create; editable only if parent allows. */
  codeLocked?: boolean
  /** When embedded in a parent dialog that already has a footer */
  hideFooter?: boolean
}) {
  const showStock = isProductStockFieldVisible(form.itemType)
  const priceError =
    !isValidNumberOrEmpty(form.salePrice) ||
    !isValidNumberOrEmpty(form.purchasePrice) ||
    !isValidNumberOrEmpty(form.gstPercent) ||
    !isValidNumberOrEmpty(form.discount) ||
    (showStock &&
      (!isValidNumberOrEmpty(form.openingStock) || !isValidNumberOrEmpty(form.lowStockAlert)))

  const set = <K extends keyof ProductServiceForm>(key: K, value: ProductServiceForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className={cn(limsRegistryFormClass, 'flex min-h-0 flex-1 flex-col')}>
      <div
        className={cn(
          'min-h-0 flex-1 space-y-5',
          hideFooter
            ? 'overflow-visible px-0 py-0'
            : 'overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5',
        )}
      >
        {priceError ? (
          <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Price, GST, discount and stock values must be valid numbers.
          </p>
        ) : null}

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6 flex flex-col space-y-2 md:col-span-3">
            <div className="flex h-5 items-center">
              <Label htmlFor="ps-item-type" className="min-w-0 truncate">
                Item (Product / Service) *
              </Label>
            </div>
            <Select value={form.itemType} onValueChange={(v) => onItemTypeChange(v as ItemType)}>
              <SelectTrigger id="ps-item-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-6 flex flex-col space-y-2 md:col-span-3">
            <div className="flex h-5 items-center">
              <Label htmlFor="ps-item-code">Item Code *</Label>
            </div>
            <Input
              id="ps-item-code"
              value={form.itemCode}
              onChange={(e) => set('itemCode', e.target.value.toUpperCase())}
              placeholder={form.itemType === 'Product' ? 'P-0001' : 'S-0001'}
              readOnly={codeLocked}
              className={codeLocked ? 'bg-stone-100 text-stone-700' : undefined}
            />
          </div>

          <div className="col-span-6 flex flex-col space-y-2 md:col-span-3">
            <div className="flex h-5 items-center">
              <Label htmlFor="ps-item-category">Item Category *</Label>
            </div>
            <ItemCategorySelect
              id="ps-item-category"
              showLabel={false}
              value={form.itemCategory}
              onChange={(itemCategory) => set('itemCategory', itemCategory)}
              placeholder="Type or select category"
            />
          </div>

          <div className="col-span-6 flex flex-col space-y-2 md:col-span-3">
            <div className="flex h-5 items-center">
              <Label htmlFor="ps-hsn">Item HSN Code</Label>
            </div>
            <div className="relative">
              <Input
                id="ps-hsn"
                value={form.hsnCode}
                onChange={(e) => set('hsnCode', e.target.value)}
                placeholder="HSN Code"
                className="pr-9"
              />
              <a
                href={HSN_SAC_FINDER_URL}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-amber-800 hover:bg-amber-500/10 hover:text-amber-950"
                aria-label="Open HSN Code Finder on GST portal"
                title="HSN Code Finder"
              >
                <Search size={15} strokeWidth={2.25} aria-hidden />
              </a>
            </div>
          </div>

          <div className="col-span-12 flex flex-col space-y-2 sm:col-span-6">
            <div className="flex h-5 items-center">
              <Label htmlFor="ps-item-name">Item Name *</Label>
            </div>
            <Input
              id="ps-item-name"
              value={form.itemName}
              onChange={(e) => set('itemName', e.target.value)}
              placeholder="Enter Item Name"
            />
          </div>

          <div className="col-span-12 flex flex-col space-y-2 sm:col-span-6">
            <div className="flex h-5 items-center">
              <Label htmlFor="ps-desc">Item Description</Label>
            </div>
            <Input
              id="ps-desc"
              value={form.itemDescription}
              onChange={(e) => set('itemDescription', e.target.value)}
              placeholder="Item Description"
            />
          </div>

          <div className="col-span-12 grid grid-cols-2 gap-4 md:grid-cols-4">
            <CurrencyInrField
              id="ps-sale"
              label="Sale Price"
              value={form.salePrice}
              onChange={(v) => set('salePrice', v)}
            />
            <CurrencyInrField
              id="ps-purchase"
              label="Purchase Price"
              value={form.purchasePrice}
              onChange={(v) => set('purchasePrice', v)}
            />
            <div className="flex flex-col space-y-2">
              <div className="flex h-5 items-center">
                <Label htmlFor="ps-gst">GST %</Label>
              </div>
              <GstRateSelect
                id="ps-gst"
                showLabel={false}
                value={form.gstPercent}
                onChange={(gstPercent) => set('gstPercent', gstPercent)}
                placeholder="18"
              />
            </div>
            <CurrencyInrField
              id="ps-discount"
              label="Discount"
              value={form.discount}
              onChange={(v) => set('discount', v)}
            />
          </div>

          <div
            className={cn(
              'col-span-12 grid gap-4',
              showStock
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
            )}
          >
            <div className="flex flex-col space-y-2">
              <div className="flex h-5 items-center">
                <Label htmlFor="ps-make">Make</Label>
              </div>
              <MakeSelect
                id="ps-make"
                showLabel={false}
                value={form.make}
                onChange={(make) => set('make', make)}
                placeholder="Type or select make"
              />
            </div>

            <div className="flex flex-col space-y-2">
              <div className="flex h-5 items-center">
                <Label htmlFor="ps-uom">Unit of Measurement</Label>
              </div>
              <MeasurementUnitSelect
                id="ps-uom"
                showLabel={false}
                value={form.unitOfMeasurement}
                onChange={(unitOfMeasurement) => set('unitOfMeasurement', unitOfMeasurement)}
                placeholder="Select or Add Unit"
              />
            </div>

            {showStock ? (
              <>
                <div className="flex flex-col space-y-2">
                  <div className="flex h-5 items-center">
                    <Label htmlFor="ps-opening-stock">Opening Stock</Label>
                  </div>
                  <Input
                    id="ps-opening-stock"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={form.openingStock}
                    onChange={(e) => set('openingStock', e.target.value)}
                    placeholder="0"
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <div className="flex h-5 items-center">
                    <Label htmlFor="ps-low-stock">Low Stock Alert</Label>
                  </div>
                  <Input
                    id="ps-low-stock"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={form.lowStockAlert}
                    onChange={(e) => set('lowStockAlert', e.target.value)}
                    placeholder="0"
                    className="h-10"
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {!hideFooter ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-9 px-4')}
            onClick={onSave}
            disabled={!canSave || saveLoading || priceError}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
