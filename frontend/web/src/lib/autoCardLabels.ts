/**
 * Simple data tables marked `auto-cards` turn into cards on small screens (see `.list-cards` in index.css).
 * The card shows each value under its column name, so this copies every header's text onto the matching
 * body cells as `data-label`, and marks a cell holding only buttons as the row's actions. It watches the DOM
 * so rows added or re-rendered later are labelled too.
 */
const TABLE_SELECTOR = 'table.auto-cards'

function labelTable(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
  if (!headRow) return
  const labels: string[] = []
  for (const th of Array.from(headRow.cells)) {
    const text = (th.textContent ?? '').replace(/\s+/g, ' ').trim()
    for (let i = 0; i < Math.max(1, th.colSpan); i += 1) labels.push(text)
  }
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      let col = 0
      for (const cell of Array.from(row.cells)) {
        if (cell.colSpan > 1 && row.cells.length === 1) break
        const label = labels[col] ?? ''
        if (col === 0) cell.classList.add('lc-title')
        else if (!(cell.textContent ?? '').trim() && cell.querySelector('button, a')) cell.classList.add('lc-actions')
        else if (label && cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label)
        col += Math.max(1, cell.colSpan)
      }
    }
  }
}

function labelAll(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(labelTable)
}

export function startAutoCardLabels() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
  let queued = false
  const run = () => {
    queued = false
    labelAll(document)
  }
  new MutationObserver(() => {
    if (queued) return
    queued = true
    window.requestAnimationFrame(run)
  }).observe(document.body, { childList: true, subtree: true })
  run()
}
