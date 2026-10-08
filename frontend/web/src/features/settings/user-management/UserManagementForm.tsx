import { useState, useEffect, type ReactNode } from 'react'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { LabManageDialogContent } from '@/features/settings/lab-settings/LabManageDialogContent'
import {
  deleteLabMasterOption,
  ensureLabMasterOptionByLabel,
  insertLabMasterOption,
  isProtectedDepartmentLabel,
  isProtectedDesignationLabel,
  isProtectedDivisionLabel,
  LAB_MASTER_OPTION_DEFAULTS,
  slugifyLabOptionValue,
  updateLabMasterOption,
  type LabMasterOptionCategory,
} from '@/features/settings/lab-settings/labMasterOptions'
import type { OptionItem } from '@/features/settings/lab-settings/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { UserAccount, UserForm } from './types'
import { emptyUserForm } from './types'

const sidebarCenteredOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'
const sidebarCenteredDialogPositionClass =
  'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2'

type UserManagementFormProps = {
  mode: 'create' | 'edit' | 'delete'
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: UserAccount | null
  designations: OptionItem[]
  setDesignations: React.Dispatch<React.SetStateAction<OptionItem[]>>
  departments: OptionItem[]
  setDepartments: React.Dispatch<React.SetStateAction<OptionItem[]>>
  divisions: OptionItem[]
  setDivisions: React.Dispatch<React.SetStateAction<OptionItem[]>>
  onSave: (formData: UserForm, countryCode?: string) => Promise<void>
  onOptionsChanged?: () => Promise<void>
  loading?: boolean
}

function FormSection({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-medium tracking-widest text-amber-800/90">{step}</span>
        <div className="h-px flex-1 bg-stone-300" />
        <h3 className="text-[13px] font-semibold tracking-wide text-stone-800">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Field({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}>{children}</div>
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
      {children}
    </Label>
  )
}

function sortOptions(items: OptionItem[]): OptionItem[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label))
}

function toManageItems(items: OptionItem[]) {
  return items.map((o) => ({ id: o.value, label: o.label }))
}

export function UserManagementForm(props: UserManagementFormProps) {
  const [formData, setFormData] = useState<UserForm>(() => {
    if (props.initialData && props.mode === 'edit') {
      return {
        name: props.initialData.name,
        email: props.initialData.email,
        mobile: props.initialData.mobile,
        password: '',
        designation: props.initialData.designation,
        department: props.initialData.departmentName,
        division: props.initialData.division,
        status: props.initialData.status,
      }
    }
    return emptyUserForm
  })

  const [countryCodes] = useState([
    { value: '+91', label: '+91 (IN)' },
    { value: '+977', label: '+977 (NP)' },
    { value: '+975', label: '+975 (BT)' },
  ])
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91')
  const [designationDialogOpen, setDesignationDialogOpen] = useState(false)
  const [newDesignationName, setNewDesignationName] = useState('')
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [divisionDialogOpen, setDivisionDialogOpen] = useState(false)
  const [newDivisionName, setNewDivisionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const designationOptions =
    props.designations.length > 0 ? props.designations : LAB_MASTER_OPTION_DEFAULTS.designation
  const departmentOptions =
    props.departments.length > 0 ? props.departments : LAB_MASTER_OPTION_DEFAULTS.department
  const divisionOptions =
    props.divisions.length > 0 ? props.divisions : LAB_MASTER_OPTION_DEFAULTS.division

  const persistLabelsToStorage = (
    key: 'userManagement.designations' | 'userManagement.departments' | 'userManagement.divisions',
    items: OptionItem[],
  ) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(items.map((o) => o.label)))
  }

  const handleAddOption = (
    category: LabMasterOptionCategory,
    rawLabel: string,
    options: OptionItem[],
    setOptions: React.Dispatch<React.SetStateAction<OptionItem[]>>,
    storageKey: 'userManagement.designations' | 'userManagement.departments' | 'userManagement.divisions',
    formField: 'designation' | 'department' | 'division',
    clearInput: () => void,
    closeDialog: () => void,
  ) => {
    const formatted = rawLabel.trim()
    if (!formatted) return
    if (options.some((item) => item.label.toLowerCase() === formatted.toLowerCase())) {
      clearInput()
      closeDialog()
      return
    }
    void (async () => {
      try {
        const value = slugifyLabOptionValue(formatted, category)
        await insertLabMasterOption(category, formatted, value)
        const item = { value, label: formatted }
        setOptions((prev) => {
          const next = sortOptions([...prev, item])
          persistLabelsToStorage(storageKey, next)
          return next
        })
        setFormData((prev) => ({ ...prev, [formField]: formatted }))
        await props.onOptionsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : `Unable to save ${category}`)
      } finally {
        clearInput()
        closeDialog()
      }
    })()
  }

  const handleUpdateOption = (
    category: LabMasterOptionCategory,
    oldValue: string,
    rawLabel: string,
    options: OptionItem[],
    setOptions: React.Dispatch<React.SetStateAction<OptionItem[]>>,
    storageKey: 'userManagement.designations' | 'userManagement.departments' | 'userManagement.divisions',
    formField: 'designation' | 'department' | 'division',
    clearInput: () => void,
    closeDialog: () => void,
  ) => {
    const formatted = rawLabel.trim()
    if (!formatted || !oldValue) return
    const previousLabel = options.find((o) => o.value === oldValue)?.label
    if (category === 'department' && previousLabel && isProtectedDepartmentLabel(previousLabel)) {
      setError('Administration department cannot be edited')
      return
    }
    if (category === 'division' && previousLabel && isProtectedDivisionLabel(previousLabel)) {
      setError('Management division cannot be edited')
      return
    }
    if (category === 'designation' && previousLabel && isProtectedDesignationLabel(previousLabel)) {
      setError('Laboratory Director designation cannot be edited')
      return
    }
    void (async () => {
      try {
        await updateLabMasterOption(category, oldValue, formatted)
        setOptions((prev) => {
          const next = sortOptions(
            prev.map((o) => (o.value === oldValue ? { ...o, label: formatted } : o)),
          )
          persistLabelsToStorage(storageKey, next)
          return next
        })
        if (previousLabel && formData[formField] === previousLabel) {
          setFormData((prev) => ({ ...prev, [formField]: formatted }))
        }
        await props.onOptionsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : `Unable to update ${category}`)
      } finally {
        clearInput()
        closeDialog()
      }
    })()
  }

  const handleDeleteOption = (
    category: LabMasterOptionCategory,
    value: string,
    options: OptionItem[],
    setOptions: React.Dispatch<React.SetStateAction<OptionItem[]>>,
    storageKey: 'userManagement.designations' | 'userManagement.departments' | 'userManagement.divisions',
    formField: 'designation' | 'department' | 'division',
  ) => {
    const removed = options.find((o) => o.value === value)
    if (category === 'department' && removed && isProtectedDepartmentLabel(removed.label)) {
      setError('Administration department cannot be deleted')
      return
    }
    if (category === 'division' && removed && isProtectedDivisionLabel(removed.label)) {
      setError('Management division cannot be deleted')
      return
    }
    if (category === 'designation' && removed && isProtectedDesignationLabel(removed.label)) {
      setError('Laboratory Director designation cannot be deleted')
      return
    }
    void (async () => {
      try {
        await deleteLabMasterOption(category, value)
        const removed = options.find((o) => o.value === value)
        const next = options.filter((o) => o.value !== value)
        setOptions(next)
        persistLabelsToStorage(storageKey, next)
        if (removed && formData[formField] === removed.label) {
          setFormData((prev) => ({ ...prev, [formField]: next[0]?.label ?? '' }))
        }
        await props.onOptionsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : `Unable to delete ${category}`)
      }
    })()
  }

  const handleAddDesignation = () => {
    handleAddOption(
      'designation',
      newDesignationName,
      designationOptions,
      props.setDesignations,
      'userManagement.designations',
      'designation',
      () => setNewDesignationName(''),
      () => setDesignationDialogOpen(false),
    )
  }

  const handleUpdateDesignation = (value: string) => {
    handleUpdateOption(
      'designation',
      value,
      newDesignationName,
      designationOptions,
      props.setDesignations,
      'userManagement.designations',
      'designation',
      () => setNewDesignationName(''),
      () => setDesignationDialogOpen(false),
    )
  }

  const handleDeleteDesignation = (value: string) => {
    handleDeleteOption(
      'designation',
      value,
      designationOptions,
      props.setDesignations,
      'userManagement.designations',
      'designation',
    )
  }

  const handleAddDepartment = () => {
    handleAddOption(
      'department',
      newDepartmentName,
      departmentOptions,
      props.setDepartments,
      'userManagement.departments',
      'department',
      () => setNewDepartmentName(''),
      () => setDepartmentDialogOpen(false),
    )
  }

  const handleUpdateDepartment = (value: string) => {
    handleUpdateOption(
      'department',
      value,
      newDepartmentName,
      departmentOptions,
      props.setDepartments,
      'userManagement.departments',
      'department',
      () => setNewDepartmentName(''),
      () => setDepartmentDialogOpen(false),
    )
  }

  const handleDeleteDepartment = (value: string) => {
    handleDeleteOption(
      'department',
      value,
      departmentOptions,
      props.setDepartments,
      'userManagement.departments',
      'department',
    )
  }

  const handleAddDivision = () => {
    handleAddOption(
      'division',
      newDivisionName,
      divisionOptions,
      props.setDivisions,
      'userManagement.divisions',
      'division',
      () => setNewDivisionName(''),
      () => setDivisionDialogOpen(false),
    )
  }

  const handleUpdateDivision = (value: string) => {
    handleUpdateOption(
      'division',
      value,
      newDivisionName,
      divisionOptions,
      props.setDivisions,
      'userManagement.divisions',
      'division',
      () => setNewDivisionName(''),
      () => setDivisionDialogOpen(false),
    )
  }

  const handleDeleteDivision = (value: string) => {
    handleDeleteOption(
      'division',
      value,
      divisionOptions,
      props.setDivisions,
      'userManagement.divisions',
      'division',
    )
  }

  useEffect(() => {
    if (props.mode === 'edit' && props.initialData) {
      const rawMobile = props.initialData.mobile ?? ''
      const codeMatch = rawMobile.match(/^(\+\d{1,4})\s*(.*)$/)
      const base = {
        name: props.initialData.name,
        email: props.initialData.email,
        password: '',
        designation: props.initialData.designation,
        department: props.initialData.departmentName,
        division: props.initialData.division,
        status: props.initialData.status,
      }
      if (codeMatch) {
        setSelectedCountryCode(codeMatch[1])
        setFormData({
          ...base,
          mobile: codeMatch[2].trim() || rawMobile,
        })
      } else {
        setFormData({
          ...base,
          mobile: rawMobile,
        })
      }
    } else if (props.mode === 'create') {
      setFormData(emptyUserForm)
      setSelectedCountryCode('+91')
    }
  }, [props.initialData, props.mode])

  const handleSave = async () => {
    setError(null)

    if (props.mode === 'create') {
      if (
        !formData.name.trim() ||
        !formData.email.trim() ||
        !formData.mobile.trim() ||
        !formData.password.trim() ||
        !formData.designation ||
        !formData.department
      ) {
        setError('All fields are required')
        return
      }
    }

    setLoading(true)
    try {
      await props.onSave(formData, selectedCountryCode)
      props.onOpenChange(false)
      setFormData(emptyUserForm)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save')
    } finally {
      setLoading(false)
    }
  }

  const renderOptionManager = ({
    open,
    onOpenChange,
    title,
    addLabel,
    fieldId,
    placeholder,
    value,
    onChange,
    options,
    onSave,
    onUpdate,
    onDelete,
    canDelete,
    canEdit,
    addAriaLabel,
    children,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    addLabel: string
    fieldId: string
    placeholder: string
    value: string
    onChange: (value: string) => void
    options: OptionItem[]
    onSave: () => void
    onUpdate: (value: string) => void
    onDelete: (value: string) => void
    canDelete: (item: { id: string; label: string }) => boolean
    canEdit?: (item: { id: string; label: string }) => boolean
    addAriaLabel: string
    children: ReactNode
  }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <LimsFieldWithAdd
        addButton={
          <DialogTrigger asChild>
            <LimsFieldAddButton aria-label={addAriaLabel} />
          </DialogTrigger>
        }
      >
        {children}
      </LimsFieldWithAdd>
      <LabManageDialogContent
        open={open}
        layer="nested"
        overlayClassName={sidebarCenteredOverlayClass}
        className={cn('max-w-md', sidebarCenteredDialogPositionClass)}
        title={title}
        addLabel={addLabel}
        inputId={fieldId}
        placeholder={placeholder}
        value={value}
        onValueChange={onChange}
        onSave={onSave}
        onUpdate={onUpdate}
        saveDisabled={!value.trim()}
        items={toManageItems(options)}
        canDelete={canDelete}
        canEdit={canEdit}
        onDelete={onDelete}
      />
    </Dialog>
  )

  if (props.mode === 'delete') {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent
          overlayClassName={sidebarCenteredOverlayClass}
          className={cn(limsDialogClass, 'max-w-md', sidebarCenteredDialogPositionClass)}
          aria-describedby={undefined}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Remove Team Member
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <DialogDescription className="text-sm text-stone-700">
              This action cannot be undone. This will permanently remove the user entry from the list.
            </DialogDescription>
          </div>
          <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => props.onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-none"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Removing…' : 'Remove User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const isCreate = props.mode === 'create'
  const saveDisabled =
    (isCreate &&
      (!formData.name.trim() ||
        !formData.email.trim() ||
        !formData.mobile.trim() ||
        !formData.password.trim() ||
        !formData.designation ||
        !formData.department)) ||
    loading ||
    props.loading

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName={sidebarCenteredOverlayClass}
        className={cn(
          limsDialogClass,
          'max-h-[92vh] max-w-2xl',
          sidebarCenteredDialogPositionClass,
        )}
        aria-describedby={undefined}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {isCreate ? 'Add Team Member' : 'Edit Team Member'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            'max-h-[min(62vh,520px)] space-y-7 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            limsRegistryFormClass,
          )}
        >
          {error && (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <FormSection step="01" title="Contact Details">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="user-name">Full Name</FieldLabel>
                <Input
                  id="user-name"
                  className={limsFieldClass}
                  placeholder="Amit Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="user-mobile">Mobile Number</FieldLabel>
                <div className="grid grid-cols-3 gap-3">
                  <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                    <SelectTrigger id="country-code" aria-label="Country code" className={limsFieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countryCodes.map((code) => (
                        <SelectItem key={code.value} value={code.value}>
                          {code.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="user-mobile"
                    className={cn('col-span-2', limsFieldClass)}
                    placeholder="9041063388"
                    value={formData.mobile}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                  />
                </div>
              </Field>
              <Field className={isCreate ? '' : 'md:col-span-2'}>
                <FieldLabel htmlFor="user-email">Email Address</FieldLabel>
                <Input
                  id="user-email"
                  type="email"
                  className={limsFieldClass}
                  placeholder="amitrajput183@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />
              </Field>
              {isCreate ? (
                <Field>
                  <FieldLabel htmlFor="user-password">Password</FieldLabel>
                  <Input
                    id="user-password"
                    type="password"
                    className={limsFieldClass}
                    placeholder="Enter Password"
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </Field>
              ) : null}
            </div>
          </FormSection>

          <FormSection step="02" title="Lab Assignment">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="user-division">Division</FieldLabel>
                {renderOptionManager({
                  open: divisionDialogOpen,
                  onOpenChange: setDivisionDialogOpen,
                  title: 'Manage Divisions',
                  addLabel: 'Add Division',
                  fieldId: 'new-division',
                  placeholder: 'e.g., Calibration Division',
                  value: newDivisionName,
                  onChange: setNewDivisionName,
                  options: divisionOptions,
                  onSave: handleAddDivision,
                  onUpdate: handleUpdateDivision,
                  onDelete: handleDeleteDivision,
                  canEdit: (item) => !isProtectedDivisionLabel(item.label),
                  canDelete: (item) =>
                    divisionOptions.length > 1 && !isProtectedDivisionLabel(item.label),
                  addAriaLabel: 'Add division',
                  children: (
                    <Select
                      value={formData.division || '__none__'}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          division: value === '__none__' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="user-division">
                        <SelectValue placeholder="Select Division" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select Division</SelectItem>
                        {divisionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
                })}
              </Field>

              <Field>
                <FieldLabel htmlFor="user-department">Department</FieldLabel>
                {renderOptionManager({
                  open: departmentDialogOpen,
                  onOpenChange: setDepartmentDialogOpen,
                  title: 'Manage Departments',
                  addLabel: 'Add Department',
                  fieldId: 'new-department',
                  placeholder: 'e.g., Chemistry',
                  value: newDepartmentName,
                  onChange: setNewDepartmentName,
                  options: departmentOptions,
                  onSave: handleAddDepartment,
                  onUpdate: handleUpdateDepartment,
                  onDelete: handleDeleteDepartment,
                  canEdit: (item) => !isProtectedDepartmentLabel(item.label),
                  canDelete: (item) =>
                    departmentOptions.length > 1 && !isProtectedDepartmentLabel(item.label),
                  addAriaLabel: 'Add department',
                  children: (
                    <Select
                      value={formData.department || '__none__'}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          department: value === '__none__' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="user-department">
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select Department</SelectItem>
                        {departmentOptions.map((option) => (
                          <SelectItem key={option.value} value={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
                })}
              </Field>

              <Field>
                <FieldLabel htmlFor="user-designation">Designation</FieldLabel>
                {renderOptionManager({
                  open: designationDialogOpen,
                  onOpenChange: setDesignationDialogOpen,
                  title: 'Manage Designations',
                  addLabel: 'Add Designation',
                  fieldId: 'new-designation',
                  placeholder: 'e.g., Compliance Officer',
                  value: newDesignationName,
                  onChange: setNewDesignationName,
                  options: designationOptions,
                  onSave: handleAddDesignation,
                  onUpdate: handleUpdateDesignation,
                  onDelete: handleDeleteDesignation,
                  canEdit: (item) => !isProtectedDesignationLabel(item.label),
                  canDelete: (item) =>
                    designationOptions.length > 1 && !isProtectedDesignationLabel(item.label),
                  addAriaLabel: 'Add designation',
                  children: (
                    <Select
                      value={formData.designation || '__none__'}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          designation: value === '__none__' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="user-designation">
                        <SelectValue placeholder="Select Designation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select Designation</SelectItem>
                        {designationOptions.map((option) => (
                          <SelectItem key={option.value} value={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
                })}
              </Field>
            </div>
          </FormSection>
        </div>

        <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end sm:px-6">
          <Button
            type="button"
            className={cn('min-w-[140px]', limsPrimaryBtnClass)}
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {loading || props.loading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
