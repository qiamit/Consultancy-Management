import { supabase } from '@/lib/supabaseClient'

export type IndexRunStatus = 'running' | 'done' | 'failed' | 'stopped'

export type CategoryCounts = { files: number; pages: number; ocr_pages: number; review: number }

export type IndexRun = {
  id: number
  started_at: string
  finished_at: string | null
  host: string
  trigger: string
  status: IndexRunStatus
  files: number
  added: number
  changed: number
  moved: number
  removed: number
  unchanged: number
  pages: number
  ocr_pages: number
  categories: Record<string, CategoryCounts>
  errors: Array<{ file: string; error: string }>
  message: string | null
}

export type ReviewDoc = { relpath: string; category: string | null; review: string }

export type MissingListed = { row_no: number | null; is_number: string; title: string | null; standard_type: string | null }

export type StandardsLibraryStatus = {
  runs: IndexRun[]
  review: ReviewDoc[]
  oldIndexDocs: number
  listed: number
  missing: MissingListed[]
}

const REVIEW_LIMIT = 500

/** Everything the Standards Library page shows. Staff-only RLS on every table read here. */
export async function fetchStandardsLibraryStatus(): Promise<StandardsLibraryStatus> {
  const [runs, review, oldIndex, listed, missing] = await Promise.all([
    supabase.from('standard_index_runs').select('*').order('id', { ascending: false }).limit(10),
    supabase
      .from('standard_docs')
      .select('relpath, category, review')
      .eq('source', 'library')
      .not('review', 'is', null)
      .order('relpath')
      .limit(REVIEW_LIMIT),
    // Old-index rows the app still reads (hidden ones are invisible through RLS).
    supabase.from('standard_docs').select('id', { count: 'exact', head: true }).eq('source', 'mac'),
    supabase.from('standard_list').select('id', { count: 'exact', head: true }),
    supabase.from('standard_list_missing').select('row_no, is_number, title, standard_type').order('row_no').limit(REVIEW_LIMIT),
  ])
  const failed = [runs, review, oldIndex, listed, missing].find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  return {
    runs: (runs.data ?? []) as IndexRun[],
    review: (review.data ?? []) as ReviewDoc[],
    oldIndexDocs: oldIndex.count ?? 0,
    listed: listed.count ?? 0,
    missing: (missing.data ?? []) as MissingListed[],
  }
}
