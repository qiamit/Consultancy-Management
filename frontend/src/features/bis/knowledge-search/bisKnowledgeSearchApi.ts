/** Local BIS knowledge search API client (Vite proxies /api/knowledge → 127.0.0.1:3851). */

export type KnowledgeStandardId = 'all' | 'IS 9666' | 'IS 2676'

export type AnswerabilityState = 'supported' | 'uncertain' | 'not_found'

export type KnowledgeSearchHit = {
  chunk_id: string
  text: string
  is_number: string | null
  clause_number: string | null
  pdf_pages: number[]
  source_relative_path: string
  review_status: string
  sample_label?: string
  rank?: number
}

export type KnowledgeEvidenceChunk = {
  chunk_id: string
  text: string
  standard?: string | null
  clause?: string | null
  pdf_pages: number[]
  review_status?: string
  rank?: number
  sample_label?: string
  source_relative_path?: string
}

export type KnowledgeSearchResponse = {
  ok: boolean
  query?: string
  standard?: string
  limit?: number
  result_count?: number
  collection?: string
  usable_chunk_total?: number
  disclaimer_hi?: string
  note_hi?: string
  message_hi?: string
  error_code?: string
  answerability_state?: AnswerabilityState
  evidence_reasons?: string[]
  evidence_chunks?: KnowledgeEvidenceChunk[]
  signals_summary?: Record<string, unknown>
  results?: KnowledgeSearchHit[]
  corpus_mode?: string
  banner_en?: string
  banner_hi?: string
}

export type KnowledgeHealthResponse = {
  ok: boolean
  message_hi?: string
  usable_chunk_total?: number
  collection?: string
  corpus_mode?: string
  banner_en?: string
  banner_hi?: string
  model_name?: string
  error?: string | null
}

const API_BASE = '/api/knowledge'

export async function fetchKnowledgeHealth(signal?: AbortSignal): Promise<KnowledgeHealthResponse> {
  const res = await fetch(`${API_BASE}/health`, { method: 'GET', signal })
  let data: KnowledgeHealthResponse
  try {
    data = (await res.json()) as KnowledgeHealthResponse
  } catch {
    throw new Error('service_down')
  }
  if (!res.ok || !data.ok) {
    const err = new Error('service_down')
    ;(err as Error & { payload?: KnowledgeHealthResponse }).payload = data
    throw err
  }
  return data
}

export async function searchKnowledge(args: {
  query: string
  standard: KnowledgeStandardId
  limit?: number
  signal?: AbortSignal
}): Promise<KnowledgeSearchResponse> {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: args.query,
      standard: args.standard,
      limit: args.limit ?? 5,
    }),
    signal: args.signal,
  })

  let data: KnowledgeSearchResponse
  try {
    data = (await res.json()) as KnowledgeSearchResponse
  } catch {
    throw new Error('service_down')
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new Error('service_down')
  }

  return data
}

export function answerabilityLabelHi(state: AnswerabilityState | undefined): string {
  switch (state) {
    case 'supported':
      return 'जाँचा हुआ संबंधित स्रोत मिला'
    case 'uncertain':
      return 'संबंधित स्रोत मिला, लेकिन सत्यापन आवश्यक है'
    case 'not_found':
      return 'जाँचे हुए स्रोत में पर्याप्त प्रमाण नहीं मिला'
    default:
      return 'स्थिति अज्ञात'
  }
}
