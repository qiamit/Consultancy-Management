export type OptionItem = {
  value: string
  label: string
}

export type AccreditationCard = {
  id: string
  inputLabel: string
  inputId: string
  certificateLabel: string
  scopeLabel: string
  logoLabel: string
  certificateNo: string
  certificateFilePath?: string | null
  scopeFilePath?: string | null
  logoFilePath?: string | null
  validityStart?: string | null
  validityEnd?: string | null
}

export type RegistrationDocument = {
  id: string
  name: string
  number: string
  fileUrl?: string | null
}

export type PrefixItem = {
  id: string
  name: string
  prefix: string
}

export type FileTemplate = {
  id: string
  name: string
  fileUrl?: string | null
}

export type TermsTemplate = {
  id: string
  name: string
  text: string
}

export type WatermarkTemplate = {
  id: string
  name: string
  type: 'image' | 'text'
  imagePath?: string | null
  text?: string
}

export const LAB_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'
