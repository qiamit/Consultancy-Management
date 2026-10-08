import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import {
  REPAIR_DEFAULT_OK,
  type MaintenanceCheckpointRow,
} from './maintenanceChecklist'
import {
  buildConductMaintenanceGenerateContext,
  parseMaintenanceChecklistReply,
} from './parseMaintenanceChecklistReply'

export type MaintenanceEquipmentContext = {
  equipmentName?: string
  assetCode?: string
  manufacturer?: string
  modelNumber?: string
  rangeCapacity?: string
}

const GENERATE_MESSAGE =
  'Generate a preventive maintenance checklist for this equipment. Create at least 10 check points. Every status must be OK. Use clear professional English for each check point text. Return only a brief confirmation line and the JSON block.'

const MIN_CHECKPOINTS = 10

export async function generateMaintenanceChecklist(
  equipment: MaintenanceEquipmentContext,
): Promise<MaintenanceCheckpointRow[]> {
  const context = buildConductMaintenanceGenerateContext(equipment)

  const { reply } = await sendQiAssistantMessage({
    page: 'masters/equipment',
    message: GENERATE_MESSAGE,
    context,
    history: [],
  })

  const parsed = parseMaintenanceChecklistReply(reply)
  if (!parsed || parsed.length < MIN_CHECKPOINTS) {
    throw new Error(
      parsed && parsed.length > 0
        ? `AI returned only ${parsed.length} check point(s). At least ${MIN_CHECKPOINTS} are required. Please try again.`
        : 'Could not read checklist from AI response. Please try again.',
    )
  }

  return parsed.map((row) => ({
    ...row,
    status: 'OK' as const,
    repairIfAny: REPAIR_DEFAULT_OK,
  }))
}
