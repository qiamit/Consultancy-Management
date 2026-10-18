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
  /** Where a block really ends: a table ends with its last row (and footer), not its outer border. */
  function contentBottom(el: HTMLElement, sheet: HTMLElement): number {
    if (el.tagName === 'TABLE') {
      const t = el as HTMLTableElement
      const body = t.tBodies.length ? t.tBodies[t.tBodies.length - 1] : null
      const last = body && body.rows.length ? body.rows[body.rows.length - 1] : null
      if (last) return bottomOf(last, sheet) + (t.tFoot ? t.tFoot.offsetHeight : 0)
    }
    return bottomOf(el, sheet)
  }
  /** A heading / caption that belongs with the block after it (never left alone at the foot of a page). */
  function isLeadIn(el: HTMLElement): boolean {
    if (/^H[1-6]$/.test(el.tagName)) return true
    if (/title|heading|caption|-ref\b|manual-ref|section-head/i.test(el.className || '')) return el.offsetHeight < 80
    return el.tagName === 'P' && el.offsetHeight < 32
  }
  /** A list-like block (numbered points, list items) that can be split between pages item by item. */
  function splittableItems(el: HTMLElement): HTMLElement[] | null {
    if (!/^(DIV|OL|UL|SECTION)$/.test(el.tagName) || /sign|letterhead|seal/i.test(el.className || '')) return null
    const items = Array.prototype.slice.call(el.children) as HTMLElement[]
    if (items.length < 2 || !items.every(function (c) { return /^(P|LI|DIV)$/.test(c.tagName) })) return null
    return items
  }
  /** Empty copy of a list block for the next page (an <ol> continues its numbering). */
  function cloneListShell(el: HTMLElement, movedFrom: number): HTMLElement {
    const shell = el.cloneNode(false) as HTMLElement
    shell.removeAttribute('id')
    if (el.tagName === 'OL') shell.setAttribute('start', String((parseInt(el.getAttribute('start') || '1', 10) || 1) + movedFrom))
    return shell
  }
  /** Moves what does not fit into a new sheet right after this one; returns it (or null when nothing moved). */
  function split(sheet: HTMLElement): HTMLElement | null {
    // A couple of pixels of tolerance: borders and rounding must not push a whole block to the next page.
    const max = limitOf(sheet) + 2
    const kids = flowChildren(sheet)
    let idx = -1
    for (let i = 0; i < kids.length; i++) { if (contentBottom(kids[i], sheet) > max) { idx = i; break } }
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
      // Every row fits and only the footer spills over: move just the last row, never the whole table.
      if (r < 0 && rows.length > 1) r = rows.length - 1
      if (r > 0) {
        // Headings marked to repeat (e.g. "Scheme of Inspection & Testing") open each continuation page.
        kids.slice(start, idx).forEach(function (k) { if (k.classList.contains('pd-repeat-head')) next.appendChild(k.cloneNode(true)) })
        const rest = cloneTableShell(first as HTMLTableElement)
        rows.slice(r).forEach(function (row) { rest.body.appendChild(row) })
        next.appendChild(rest.table)
        moveFrom = idx + 1
      } else if (idx === start) {
        return null
      }
    } else if (splittableItems(first) && (function () {
      const items = splittableItems(first)!
      let c = -1
      for (let j = 0; j < items.length; j++) { if (bottomOf(items[j], sheet) > max) { c = j; break } }
      if (c <= 0) return false
      const rest = cloneListShell(first, c)
      items.slice(c).forEach(function (it) { rest.appendChild(it) })
      next.appendChild(rest)
      moveFrom = idx + 1
      return true
    })()) {
      // Split point by point, like table rows.
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
      }      else if (before && first === kids[kids.length - 1] && splittableItems(before)) {
        // A list of points precedes the closing block: its last point comes along.
        const items = splittableItems(before)!
        const carried = cloneListShell(before, items.length - 1)
        carried.appendChild(items[items.length - 1])
        next.appendChild(carried)
      }
    }
    // Headings / captions right above the first moved block go with it (a table that moves whole takes its title).
    if (moveFrom === idx) {
      let m = moveFrom
      while (idx - m < 3 && m - 1 >= start && isLeadIn(kids[m - 1])) m -= 1
      // Only when something stays on this page; otherwise the sheet would be left empty.
      if (m > start) moveFrom = m
    }
    sheet.parentNode!.insertBefore(next, sheet.nextSibling)
    const leadIns = next.children.length
    kids.slice(moveFrom).forEach(function (k) { next.appendChild(k) })
    // A carried caption goes above the carried table rows, in document order.
    if (moveFrom < idx && leadIns > (letterhead ? 1 : 0)) {
      const anchor = next.children[letterhead ? 1 : 0]
      for (let i = moveFrom; i < idx; i++) next.insertBefore(kids[i], anchor)
    }
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
  // A full page must not scroll: when only the last block's bottom margin (blank space) spills past the sheet,
  // drop that margin.
  ;(Array.prototype.slice.call(doc.querySelectorAll(SHEETS)) as HTMLElement[]).forEach(function (sheet) {
    if (sheet.scrollHeight <= sheet.clientHeight) return
    const kids = flowChildren(sheet)
    const last = kids[kids.length - 1]
    if (!last) return
    const view = doc.defaultView
    const mb = view ? parseFloat(view.getComputedStyle(last).marginBottom || '0') : 0
    if (mb > 0 && sheet.scrollHeight - sheet.clientHeight <= mb + 1) last.style.marginBottom = '0px'
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
