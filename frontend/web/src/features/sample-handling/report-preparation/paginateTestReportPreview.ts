import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import {
  formatSheetPageNumber,
  resolvePrintPageSizeMm,
} from '@/features/settings/lab-settings/printSettingsTypes'

const CSS_PX_PER_MM = 96 / 25.4
/** Extra clearance so last lines never sit under the letterhead footer. */
const FOOTER_SAFETY_MM = 5

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
  if (images.length === 0) return Promise.resolve()
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}

async function waitForFonts(doc: Document): Promise<void> {
  const fonts = doc.fonts
  if (!fonts?.ready) return
  try {
    await fonts.ready
  } catch {
    /* ignore */
  }
}

function forceBreakClass(settings: TestReportPrintSettings): Set<string> {
  const set = new Set<string>()
  if (settings.partANewPage) set.add('part-a')
  if (settings.partBNewPage) set.add('part-b')
  if (settings.partCNewPage) set.add('part-c')
  if (settings.partDNewPage) set.add('part-d')
  return set
}

function outerHeight(el: HTMLElement): number {
  const win = el.ownerDocument.defaultView
  const cs = win?.getComputedStyle(el)
  const mt = cs ? parseFloat(cs.marginTop) || 0 : 0
  const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0
  return el.offsetHeight + mt + mb
}

/** Sum of direct children heights — works even before percentage height resolves. */
function contentHeight(body: HTMLElement): number {
  let h = 0
  for (const child of Array.from(body.children) as HTMLElement[]) {
    h += outerHeight(child)
  }
  return h
}

function bandHeightPx(el: HTMLElement | null | undefined): number {
  if (!el) return 0
  return Math.max(el.offsetHeight, el.scrollHeight, 0)
}

/**
 * Split the continuous print HTML into stacked paper sheets matching page size,
 * margins, forced part page-breaks, and overflowing tables/content.
 */
export async function paginateTestReportPreview(
  doc: Document,
  settings: TestReportPrintSettings,
): Promise<void> {
  await waitForImages(doc)
  await waitForFonts(doc)
  if (doc.querySelector('.preview-sheets')) return

  const page = resolvePrintPageSizeMm(settings)
  const pageW = Math.round(page.width * CSS_PX_PER_MM)
  const pageH = Math.round(page.height * CSS_PX_PER_MM)
  const breaks = forceBreakClass(settings)
  const safetyPx = Math.round(FOOTER_SAFETY_MM * CSS_PX_PER_MM)

  const header = doc.querySelector<HTMLElement>('.print-header')
  const footer = doc.querySelector<HTMLElement>('.print-footer')
  const main = doc.querySelector<HTMLElement>('.print-body')
  if (!main) return

  const settingsTopPx = Math.round(settings.bodyPaddingTopMm * CSS_PX_PER_MM)
  const settingsBottomPx = Math.round(settings.bodyPaddingBottomMm * CSS_PX_PER_MM)
  const leftPx = Math.round(settings.bodyPaddingLeftMm * CSS_PX_PER_MM)
  const rightPx = Math.round(settings.bodyPaddingRightMm * CSS_PX_PER_MM)

  // Use the larger of configured padding and real letterhead/footer height so content
  // never paints underneath absolute header/footer bands.
  const topPadPx = Math.max(settingsTopPx, bandHeightPx(header))
  const bottomPadPx = Math.max(settingsBottomPx, bandHeightPx(footer) + safetyPx)
  const availableContentPx = Math.max(48, pageH - topPadPx - bottomPadPx)

  const blocks = Array.from(main.children) as HTMLElement[]
  if (blocks.length === 0) return

  const sheetsWrap = doc.createElement('div')
  sheetsWrap.className = 'preview-sheets'
  // Must be in the document while measuring — detached sheets make height:100% /
  // scrollHeight unreliable, so Part C never broke to the next page.
  doc.body.appendChild(sheetsWrap)

  type Sheet = { sheet: HTMLElement; body: HTMLElement }
  let current: Sheet | null = null
  let startNextOnNewSheet = false

  const startSheet = (): Sheet => {
    const sheet = doc.createElement('div')
    sheet.className = 'preview-sheet'
    sheet.style.width = `${pageW}px`
    sheet.style.setProperty('height', `${pageH}px`, 'important')
    sheet.style.setProperty('max-height', `${pageH}px`, 'important')
    sheet.style.setProperty('overflow', 'hidden', 'important')
    sheet.style.position = 'relative'
    sheet.style.background = '#fff'
    sheet.style.boxSizing = 'border-box'

    if (header) {
      const clone = header.cloneNode(true) as HTMLElement
      clone.style.position = 'absolute'
      clone.style.top = '0'
      clone.style.left = '0'
      clone.style.right = '0'
      clone.style.zIndex = '20'
      clone.style.background = '#fff'
      sheet.appendChild(clone)
    }

    const body = doc.createElement('main')
    body.className = 'print-body preview-sheet-body'
    // Explicit px height (not %) so overflow detection works reliably.
    body.style.setProperty('height', `${pageH}px`, 'important')
    body.style.setProperty('max-height', `${pageH}px`, 'important')
    body.style.setProperty('padding-top', `${topPadPx}px`, 'important')
    body.style.setProperty('padding-bottom', `${bottomPadPx}px`, 'important')
    body.style.setProperty('padding-left', `${leftPx}px`, 'important')
    body.style.setProperty('padding-right', `${rightPx}px`, 'important')
    body.style.setProperty('overflow', 'hidden', 'important')
    body.style.boxSizing = 'border-box'
    body.style.position = 'relative'
    body.style.zIndex = '1'
    sheet.appendChild(body)

    if (footer) {
      const clone = footer.cloneNode(true) as HTMLElement
      clone.style.position = 'absolute'
      clone.style.bottom = '0'
      clone.style.left = '0'
      clone.style.right = '0'
      clone.style.zIndex = '20'
      clone.style.background = '#fff'
      sheet.appendChild(clone)
    }

    sheetsWrap.appendChild(sheet)
    current = { sheet, body }
    startNextOnNewSheet = false
    return current
  }

  /**
   * Primary: content sum vs reserved content box (independent of % height quirks).
   * Secondary: scrollHeight when the sheet is mounted in the document.
   */
  const overflows = (bodyEl?: HTMLElement | null): boolean => {
    const body = bodyEl ?? current?.body
    if (!body) return false
    void body.offsetHeight
    if (contentHeight(body) > availableContentPx + 0.5) return true
    return body.scrollHeight > body.clientHeight + 1
  }

  const ensureSheet = () => {
    if (!current) startSheet()
  }

  const needsForceBreak = (el: HTMLElement): boolean => {
    if (!el.classList.contains('report-part')) return false
    return ['part-a', 'part-b', 'part-c', 'part-d'].some(
      (cls) => el.classList.contains(cls) && breaks.has(cls),
    )
  }

  const markOverflowForNext = () => {
    if (overflows()) startNextOnNewSheet = true
  }

  const placeWhole = (el: HTMLElement) => {
    ensureSheet()
    if (!current) return
    const childrenBefore = current.body.children.length
    if (startNextOnNewSheet && childrenBefore > 0) startSheet()
    if (!current) return

    current.body.appendChild(el)
    if (overflows() && childrenBefore > 0) {
      current.body.removeChild(el)
      startSheet()
      current.body.appendChild(el)
    }
    markOverflowForNext()
  }

  const splitByRows = (
    section: HTMLElement,
    rows: HTMLElement[],
    makeEmptyChunk: () => HTMLElement,
    rowParentOf: (chunk: HTMLElement) => HTMLElement | null,
  ) => {
    if (rows.length === 0) {
      placeWhole(section)
      return
    }

    ensureSheet()
    if (needsForceBreak(section) && current && current.body.children.length > 0) startSheet()
    if (startNextOnNewSheet && current && current.body.children.length > 0) startSheet()

    let chunk: HTMLElement | null = null
    let rowParent: HTMLElement | null = null

    const attachNewChunk = () => {
      ensureSheet()
      if (!current) return
      if (startNextOnNewSheet && current.body.children.length > 0) startSheet()
      if (!current) return

      chunk = makeEmptyChunk()
      const siblingsBefore = current.body.children.length
      current.body.appendChild(chunk)

      // Thead-only chunk can already overflow a nearly-full page — move it forward.
      if (overflows() && siblingsBefore > 0) {
        current.body.removeChild(chunk)
        startSheet()
        current.body.appendChild(chunk)
      }

      rowParent = rowParentOf(chunk)
    }

    for (const row of rows) {
      ensureSheet()
      if (!current) break
      if (!chunk || !rowParent) attachNewChunk()
      if (!rowParent || !current) break

      const rowsBefore = rowParent.children.length
      const blocksBefore = current.body.children.length
      rowParent.appendChild(row)

      if (overflows()) {
        if (rowsBefore > 0 || blocksBefore > 1) {
          rowParent.removeChild(row)
          startSheet()
          attachNewChunk()
          rowParent?.appendChild(row)
          if (overflows() && rowParent && rowParent.children.length === 1) {
            markOverflowForNext()
          }
        } else {
          markOverflowForNext()
        }
      }
    }

    markOverflowForNext()
    section.remove()
  }

  const splitPartA = (section: HTMLElement) => {
    const table = section.querySelector<HTMLTableElement>('table.part-a-table')
    if (!table) {
      placeWhole(section)
      return
    }
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[]
    splitByRows(
      section,
      rows,
      () => {
        const wrap = section.cloneNode(false) as HTMLElement
        const newTable = doc.createElement('table')
        newTable.className = 'part-a-table'
        const colgroup = table.querySelector('colgroup')
        if (colgroup) newTable.appendChild(colgroup.cloneNode(true))
        const thead = table.querySelector('thead')
        if (thead) newTable.appendChild(thead.cloneNode(true))
        const tbody = doc.createElement('tbody')
        newTable.appendChild(tbody)
        wrap.appendChild(newTable)
        return wrap
      },
      (chunk) => chunk.querySelector('tbody'),
    )
  }

  const splitPartB = (section: HTMLElement) => {
    const table = section.querySelector<HTMLTableElement>('table.part-b-table')
    if (!table) {
      placeWhole(section)
      return
    }
    const thead = table.querySelector('thead')
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[]
    splitByRows(
      section,
      rows,
      () => {
        const wrap = doc.createElement('section')
        wrap.className = 'report-part part-b'
        const newTable = doc.createElement('table')
        newTable.className = 'part-b-table'
        const colgroup = table.querySelector('colgroup')
        if (colgroup) newTable.appendChild(colgroup.cloneNode(true))
        if (thead) newTable.appendChild(thead.cloneNode(true))
        const tbody = doc.createElement('tbody')
        newTable.appendChild(tbody)
        wrap.appendChild(newTable)
        return wrap
      },
      (chunk) => chunk.querySelector('tbody'),
    )
  }

  const splitPartC = (section: HTMLElement) => {
    const table = section.querySelector<HTMLTableElement>('table.part-c-table')
    if (!table) {
      placeWhole(section)
      return
    }

    const thead = table.querySelector('thead')
    const colgroup = table.querySelector('colgroup')
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[]
    const endNotes = section.querySelector<HTMLElement>('.part-c-end-notes')

    const makeEmptyChunk = (): HTMLElement => {
      const wrap = doc.createElement('section')
      wrap.className = 'report-part part-c'
      const newTable = doc.createElement('table')
      newTable.className = 'part-c-table'
      if (colgroup) newTable.appendChild(colgroup.cloneNode(true))
      if (thead) newTable.appendChild(thead.cloneNode(true))
      const tbody = doc.createElement('tbody')
      newTable.appendChild(tbody)
      wrap.appendChild(newTable)
      return wrap
    }

    splitByRows(section, rows, makeEmptyChunk, (chunk) => chunk.querySelector('tbody'))

    if (endNotes) {
      ensureSheet()
      if (startNextOnNewSheet && current && current.body.children.length > 0) startSheet()
      const lastPart =
        current?.body.querySelector('.report-part.part-c:last-child') ?? null
      if (lastPart && current) {
        lastPart.appendChild(endNotes)
        if (overflows() && current.body.children.length > 0) {
          lastPart.removeChild(endNotes)
          startSheet()
          const wrap = makeEmptyChunk()
          wrap.appendChild(endNotes)
          current.body.appendChild(wrap)
        }
      } else {
        placeWhole(endNotes)
      }
      markOverflowForNext()
    }
  }

  startSheet()

  for (const block of blocks) {
    if (needsForceBreak(block) && current && current.body.children.length > 0) {
      startSheet()
    }

    if (block.classList.contains('part-a') && block.querySelector('table.part-a-table')) {
      splitPartA(block)
      continue
    }
    if (block.classList.contains('part-b') && block.querySelector('table.part-b-table')) {
      splitPartB(block)
      continue
    }
    if (block.querySelector('table.part-c-table')) {
      splitPartC(block)
      continue
    }

    placeWhole(block)
  }

  /**
   * Safety net: peel trailing rows/blocks onto the next sheet until each page fits.
   */
  const reflowOverflowingSheets = () => {
    const sheets = Array.from(sheetsWrap.querySelectorAll<HTMLElement>('.preview-sheet'))
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i]
      const body = sheet.querySelector<HTMLElement>('.preview-sheet-body')
      if (!body) continue

      let guard = 0
      while (overflows(body) && guard < 500) {
        guard += 1
        const lastBlock = body.lastElementChild as HTMLElement | null
        if (!lastBlock) break

        const table = lastBlock.querySelector<HTMLTableElement>('table')
        const tbody = table?.querySelector('tbody')
        const lastRow = tbody?.lastElementChild as HTMLElement | null

        let nextBody: HTMLElement | null = null
        const ensureNext = () => {
          if (nextBody) return nextBody
          const existingNext = sheetsWrap.children[i + 1] as HTMLElement | undefined
          if (existingNext?.classList.contains('preview-sheet')) {
            nextBody = existingNext.querySelector<HTMLElement>('.preview-sheet-body')
            if (nextBody) return nextBody
          }
          const saved = current
          const created = startSheet()
          if (created.sheet.parentElement === sheetsWrap && sheet.nextSibling !== created.sheet) {
            sheetsWrap.insertBefore(created.sheet, sheet.nextSibling)
          }
          current = saved
          nextBody = created.body
          sheets.splice(i + 1, 0, created.sheet)
          return nextBody
        }

        if (lastRow && tbody && tbody.children.length > 1) {
          const dest = ensureNext()
          if (!dest) break

          const partClass = ['part-a', 'part-b', 'part-c', 'part-d'].find((c) =>
            lastBlock.classList.contains(c),
          )
          let destTbody: HTMLElement | null = null
          if (partClass) {
            const destPart = dest.querySelector<HTMLElement>(`.report-part.${partClass}`)
            destTbody = destPart?.querySelector('tbody') ?? null
          }

          if (!destTbody) {
            const movedChunk = lastBlock.cloneNode(false) as HTMLElement
            const srcTable = lastBlock.querySelector('table')
            if (srcTable) {
              const newTable = doc.createElement('table')
              newTable.className = srcTable.className
              const cg = srcTable.querySelector('colgroup')
              if (cg) newTable.appendChild(cg.cloneNode(true))
              const th = srcTable.querySelector('thead')
              if (th) newTable.appendChild(th.cloneNode(true))
              const tb = doc.createElement('tbody')
              newTable.appendChild(tb)
              movedChunk.appendChild(newTable)
              dest.insertBefore(movedChunk, dest.firstChild)
              destTbody = tb
            }
          }

          if (destTbody) {
            destTbody.insertBefore(lastRow, destTbody.firstChild)
            continue
          }
        }

        const dest = ensureNext()
        if (!dest) break
        dest.insertBefore(lastBlock, dest.firstChild)
      }
    }
  }

  reflowOverflowingSheets()

  // Drop empty table shells (thead only, no rows).
  sheetsWrap.querySelectorAll<HTMLElement>('.preview-sheet-body').forEach((body) => {
    Array.from(body.querySelectorAll('.report-part')).forEach((part) => {
      const tbody = part.querySelector('tbody')
      const hasRows = Boolean(tbody && tbody.children.length > 0)
      const hasEndNotes = Boolean(part.querySelector('.part-c-end-notes'))
      if (!hasRows && !hasEndNotes && !part.querySelector('.report-title-block')) {
        if (part.querySelector('table')) part.remove()
      }
    })
  })

  // Inject page numbers on each sheet — @page margin-box counters only work in
  // continuous browser print, not on stacked .preview-sheet pages (screen + PDF).
  const pageNumbersEnabled =
    settings.showPageNumbers && settings.pageNumberType !== 'none'
  if (pageNumbersEnabled) {
    const sheets = Array.from(sheetsWrap.querySelectorAll<HTMLElement>('.preview-sheet'))
    const total = sheets.length
    const position = settings.pageNumberPosition
    sheets.forEach((sheet, idx) => {
      sheet.querySelectorAll('.preview-page-number').forEach((el) => el.remove())
      const label = formatSheetPageNumber(settings.pageNumberType, idx + 1, total)
      if (!label) return
      const el = doc.createElement('div')
      el.className = `preview-page-number preview-page-number--${position}`
      el.setAttribute('aria-label', label)
      el.textContent = label
      sheet.appendChild(el)
    })
  }

  header?.remove()
  footer?.remove()
  main.remove()

  // sheetsWrap is already on body — remove leftover continuous nodes.
  Array.from(doc.body.children).forEach((child) => {
    if (child !== sheetsWrap) child.remove()
  })

  doc.documentElement.style.height = 'auto'
  doc.body.style.height = 'auto'
  doc.body.style.overflow = 'visible'
}
