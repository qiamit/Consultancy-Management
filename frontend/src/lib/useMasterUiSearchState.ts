import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Syncs master-page dialog / nested-page UI to URL search params so a browser
 * refresh stays on the same screen (pairs with RoutePersistence for pathname+search).
 *
 * Default keys:
 * - `edit=new|<id>` — Add/Edit form dialog
 * - `view=<id>` — Secondary full-screen view (e.g. View Documents)
 * - `module=<slug>` — Nested module inside a view (e.g. legal-documents)
 * - `detail=<id>` — Linked record details dialog (e.g. IS Code from a license row)
 * - `client=<id>` — Linked client details dialog
 */
export type MasterUiSearchState = {
  editId: string | null
  viewId: string | null
  moduleSlug: string | null
  detailId: string | null
  clientId: string | null
  setEdit: (id: string | null) => void
  setView: (id: string | null) => void
  setModule: (slug: string | null) => void
  setDetail: (id: string | null) => void
  setClient: (id: string | null) => void
  clearUi: () => void
}

export function useMasterUiSearchState(options?: {
  editKey?: string
  viewKey?: string
  moduleKey?: string
  detailKey?: string
  clientKey?: string
}): MasterUiSearchState {
  const editKey = options?.editKey ?? 'edit'
  const viewKey = options?.viewKey ?? 'view'
  const moduleKey = options?.moduleKey ?? 'module'
  const detailKey = options?.detailKey ?? 'detail'
  const clientKey = options?.clientKey ?? 'client'
  const [searchParams, setSearchParams] = useSearchParams()

  const editId = (searchParams.get(editKey) ?? '').trim() || null
  const viewId = (searchParams.get(viewKey) ?? '').trim() || null
  const moduleSlug = (searchParams.get(moduleKey) ?? '').trim() || null
  const detailId = (searchParams.get(detailKey) ?? '').trim() || null
  const clientId = (searchParams.get(clientKey) ?? '').trim() || null

  const patch = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setEdit = useCallback(
    (id: string | null) => {
      patch((next) => {
        if (id) next.set(editKey, id)
        else next.delete(editKey)
      })
    },
    [patch, editKey],
  )

  const setView = useCallback(
    (id: string | null) => {
      patch((next) => {
        if (id) {
          next.set(viewKey, id)
        } else {
          next.delete(viewKey)
          next.delete(moduleKey)
        }
      })
    },
    [patch, viewKey, moduleKey],
  )

  const setModule = useCallback(
    (slug: string | null) => {
      patch((next) => {
        if (slug) next.set(moduleKey, slug)
        else next.delete(moduleKey)
      })
    },
    [patch, moduleKey],
  )

  const setDetail = useCallback(
    (id: string | null) => {
      patch((next) => {
        if (id) {
          next.set(detailKey, id)
          next.delete(clientKey)
        } else {
          next.delete(detailKey)
        }
      })
    },
    [patch, detailKey, clientKey],
  )

  const setClient = useCallback(
    (id: string | null) => {
      patch((next) => {
        if (id) {
          next.set(clientKey, id)
          next.delete(detailKey)
        } else {
          next.delete(clientKey)
        }
      })
    },
    [patch, clientKey, detailKey],
  )

  const clearUi = useCallback(() => {
    patch((next) => {
      next.delete(editKey)
      next.delete(viewKey)
      next.delete(moduleKey)
      next.delete(detailKey)
      next.delete(clientKey)
    })
  }, [patch, editKey, viewKey, moduleKey, detailKey, clientKey])

  return {
    editId,
    viewId,
    moduleSlug,
    detailId,
    clientId,
    setEdit,
    setView,
    setModule,
    setDetail,
    setClient,
    clearUi,
  }
}
