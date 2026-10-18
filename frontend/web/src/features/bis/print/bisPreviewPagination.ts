/**
 * Splits document sheets (fixed to the page size, e.g. A4) whose content is longer than one page into extra
 * sheets of the same size — tables split by rows with their header repeated, a closing block (seal / signature)
 * kept with what precedes it — and renumbers "Page X of Y". The same routine runs in the on-screen preview and on
 * the HTML sent for PDF / Word, so downloads break pages exactly where the preview does.
 *
 * Written without TypeScript-only syntax inside the function body: it is also injected into the preview frame as
 * a plain script (via Function.prototype.toString).
 */
export function paginateSheetsIn(doc: Document): void {
  const SHEETS = '.pd-sheet, .al-sheet'
  function bottomOf(el: HTMLElement, sheet: HTMLElement): number {
    let top = 0
    let n: HTMLElement | null = el
    while (n && n !== sheet) { top += n.offsetTop; n = n.offsetParent as HTMLElement | null }
    return top + el.offsetHeight
  }
  function limitOf(sheet: HTMLElement): number {
    const view = doc.defaultView
    const pad = view ? parseFloat(view.getComputedStyle(sheet).paddingBottom || '0') : 0
    let limit = sheet.clientHeight - pad
    // Content stays above the page number ("Page 01 of 02") at the foot of the sheet.
    const num = Array.prototype.find.call(sheet.children, function (k: Element) { return k.classList.contains('pd-page-num') }) as HTMLElement | undefined
    if (num && num.offsetHeight > 0 && num.offsetTop > 0) limit = Math.min(limit, num.offsetTop - 4)
    return limit
  }
  function flowChildren(sheet: HTMLElement): HTMLElement[] {
    const view = doc.defaultView
    return Array.prototype.filter.call(sheet.children, function (k: HTMLElement) {
      return !k.classList.contains('pd-page-num') && (!view || view.getComputedStyle(k).position !== 'absolute')
    }) as HTMLElement[]
  }
  function cloneTableShell(table: HTMLTableElement): { table: HTMLTableElement; body: HTMLTableSectionElement } {
    const shell = table.cloneNode(false) as HTMLTableElement
    shell.removeAttribute('id')
    const colgroup = table.querySelector('colgroup')
    if (colgroup) shell.appendChild(colgroup.cloneNode(true))
    if (table.tHead) shell.appendChild(table.tHead.cloneNode(true))
    const body = doc.createElement('tbody')
    shell.appendChild(body)
    // A table footer (e.g. the Factory Test Report signatures) repeats on every page like the header.
    if (table.tFoot) shell.appendChild(table.tFoot.cloneNode(true))
    return { table: shell, body: body }
  }
  /** Moves what does not fit into a new sheet right after this one; returns it (or null when nothing moved). */
  function split(sheet: HTMLElement): HTMLElement | null {
    const max = limitOf(sheet) + 1
    const kids = flowChildren(sheet)
    let idx = -1
    for (let i = 0; i < kids.length; i++) { if (bottomOf(kids[i], sheet) > max) { idx = i; break } }
    if (idx < 0) return null
    // A letterhead at the top of the sheet is repeated on each continuation page; content starts below it.
    const letterhead = kids[0] && kids[0].classList.contains('pd-letterhead') ? kids[0] : null
    const start = letterhead ? 1 : 0
    if (idx <= start - 1) return null
    const first = kids[idx]
    const next = sheet.cloneNode(false) as HTMLElement
    next.removeAttribute('id')
    if (letterhead) next.appendChild(letterhead.cloneNode(true))
    let moveFrom = idx
    if (first.tagName === 'TABLE' && (first as HTMLTableElement).tBodies.length) {
      const rows = Array.prototype.slice.call((first as HTMLTableElement).tBodies[0].rows) as HTMLTableRowElement[]
      // Rows must leave room for the table footer, which is drawn after them on the same page.
      const foot = (first as HTMLTableElement).tFoot
      const rowMax = max - (foot ? foot.offsetHeight : 0)
      let r = -1
      for (let j = 0; j < rows.length; j++) { if (bottomOf(rows[j], sheet) > rowMax) { r = j; break } }
      if (r > 0) {
        const rest = cloneTableShell(first as HTMLTableElement)
        rows.slice(r).forEach(function (row) { rest.body.appendChild(row) })
        next.appendChild(rest.table)
        moveFrom = idx + 1
      } else if (idx === start) {
        return null
      }
    } else if (idx === start) {
      return null // a single block taller than a page cannot be split here
    } else {
      // Keep a closing block (seal / signature) with what precedes it: a short paragraph before it moves too,
      // and when a table precedes, its last row comes along so the block never lands alone on a page.
      let before = kids[moveFrom - 1]
      if (before && before.tagName !== 'TABLE' && moveFrom - 1 > start && before.offsetHeight < 160 && first === kids[kids.length - 1]) {
        moveFrom -= 1
        before = kids[moveFrom - 1]
      }
      if (before && before.tagName === 'TABLE' && (before as HTMLTableElement).tBodies.length && (before as HTMLTableElement).tBodies[0].rows.length > 1) {
        const body0 = (before as HTMLTableElement).tBodies[0]
        const carried = cloneTableShell(before as HTMLTableElement)
        carried.body.appendChild(body0.rows[body0.rows.length - 1])
        next.appendChild(carried.table)
      }
    }
    sheet.parentNode!.insertBefore(next, sheet.nextSibling)
    kids.slice(moveFrom).forEach(function (k) { next.appendChild(k) })
    return next
  }
  const originals = Array.prototype.slice.call(doc.querySelectorAll(SHEETS)) as HTMLElement[]
  originals.forEach(function (sheet) {
    const pageNum = Array.prototype.find.call(sheet.children, function (k: Element) { return k.classList.contains('pd-page-num') }) as HTMLElement | undefined
    const created: HTMLElement[] = []
    let current: HTMLElement | null = sheet
    for (let guard = 0; current && guard < 60; guard++) {
      current = split(current)
      if (current) created.push(current)
    }
    // Every page of a split sheet gets its own page number.
    if (pageNum) created.forEach(function (s) { s.appendChild(pageNum!.cloneNode(true)) })
  })
  // Renumber "Page X of Y" by position among all sheets (a cover page without a number still counts).
  const allSheets = Array.prototype.slice.call(doc.querySelectorAll(SHEETS)) as HTMLElement[]
  const pad2 = function (n: number) { return n < 10 ? '0' + n : String(n) }
  allSheets.forEach(function (s, i) {
    const num = Array.prototype.find.call(s.children, function (k: Element) { return k.classList.contains('pd-page-num') }) as HTMLElement | undefined
    if (num && /Page\s+\d+\s+of\s+\d+/i.test(num.textContent || '')) {
      num.textContent = (num.textContent || '').replace(/Page\s+\d+\s+of\s+\d+/i, 'Page ' + pad2(i + 1) + ' of ' + pad2(allSheets.length))
    }
  })
}

const PAGINATE_SCRIPT = `<script id="bis-preview-pagination">
(function () {
  var paginateSheetsIn = ${paginateSheetsIn.toString()};
  var done = false;
  function run() { if (done) return; done = true; try { paginateSheetsIn(document); } catch (e) { /* leave the preview as rendered */ } }
  window.__bisPaginateNow = run; // printing calls this right before window.print()
  function whenReady() { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(run); }
  if (document.readyState === 'complete') whenReady(); else window.addEventListener('load', whenReady);
})();
</script>`

/** Preview frame: the page as built, plus the paginator. */
export function withPreviewPagination(html: string): string {
  if (html.includes('id="bis-preview-pagination"')) return html
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${PAGINATE_SCRIPT}</body>`) : `${html}${PAGINATE_SCRIPT}`
}

/**
 * Downloads: lays the document out in a hidden frame (screen page size), splits overflowing sheets like the
 * preview, and returns the paginated HTML for PDF / Word.
 */
export async function paginateHtmlForDownload(html: string): Promise<string> {
  if (typeof document === 'undefined') return html
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:1000px;border:0;visibility:hidden'
  document.body.appendChild(frame)
  try {
    const loaded = new Promise<void>((resolve) => {
      frame.onload = () => resolve()
    })
    frame.srcdoc = html
    await loaded
    const doc = frame.contentDocument
    if (!doc) return html
    await (doc.fonts?.ready ?? Promise.resolve())
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
          img.onload = () => resolve()
          img.onerror = () => resolve()
        }),
      ),
    )
    // Only documents with fixed-size sheets need splitting.
    if (!doc.querySelector('.pd-sheet, .al-sheet')) return html
    paginateSheetsIn(doc)
    const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '<!doctype html>'
    return `${doctype}\n${doc.documentElement.outerHTML}`
  } catch {
    return html
  } finally {
    frame.remove()
  }
}
