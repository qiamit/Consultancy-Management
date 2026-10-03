/** Splits shared `equipment_master` rows between Testing LIMS and Calibration LIMS. */
export const EQUIPMENT_KIND_TESTING = 'testing' as const
export const EQUIPMENT_KIND_CALIBRATION = 'calibration' as const

export type EquipmentKind =
  | typeof EQUIPMENT_KIND_TESTING
  | typeof EQUIPMENT_KIND_CALIBRATION
