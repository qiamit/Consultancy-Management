import { bisPrintPageSizeMm, DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'

async function svgToWordImage(svg: SVGElement): Promise<HTMLImageElement | null> {
  try {
    const source = new XMLSerializer().serializeToString(svg)
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not render map image'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, image.naturalWidth || Number(svg.getAttribute('width')) || 1200)
    canvas.height = Math.max(1, image.naturalHeight || Number(svg.getAttribute('height')) || 800)
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = document.createElement('img')
    png.src = canvas.toDataURL('image/png')
    png.alt = 'Location map'
    png.style.width = '100%'
    png.style.height = 'auto'
    png.style.display = 'block'
    return png
  } catch {
    return null
  }
}

export async function combineWordHtml(
  title: string,
  documents: string[],
  settings: typeof DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
): Promise<string> {
  const pages = documents.map((html) => ({
    body: html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html,
    style: Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map((match) => match[1])
      .join('\n'),
  }))
  const safeTitle = title.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
  const document = new DOMParser().parseFromString(
    `<body>${pages.map((page) => `<section class="bis-word-document">${page.body}</section>`).join('')}</body>`,
    'text/html',
  )
  // Sheet scripts (the flow chart's fit-to-page helper) would come through as text.
  for (const script of Array.from(document.querySelectorAll('script'))) script.remove()
  // Print-only repeating blocks (Factory Test Report: title + details in <thead>, signatures in <tfoot>) are one wide
  // cell around whole blocks; html-to-docx tangles them with the table and drops the footer. Word gets them as plain
  // blocks above / below the table.
  for (const row of Array.from(document.querySelectorAll<HTMLTableRowElement>('thead > tr, tfoot > tr'))) {
    const cells = Array.from(row.cells)
    const table = row.closest('table')
    if (cells.length !== 1 || cells[0]!.colSpan < 2 || !table) continue
    const block = document.createElement('div')
    while (cells[0]!.firstChild) block.appendChild(cells[0]!.firstChild)
    if (row.parentElement?.tagName === 'THEAD') table.before(block)
    else table.after(block)
    const section = row.parentElement
    row.remove()
    if (section && !section.children.length) section.remove()
  }
  for (const svg of Array.from(document.querySelectorAll('svg'))) {
    const replacement = await svgToWordImage(svg)
    if (replacement) svg.replaceWith(replacement)
  }
  const pageBreak = () => {
    const element = document.createElement('div')
    element.className = 'page-break'
    element.style.pageBreakAfter = 'always'
    return element
  }
  document.querySelectorAll('.bis-word-document').forEach((section, index) => {
    if (index > 0) section.before(pageBreak())
    const sheets = Array.from(section.querySelectorAll('.pd-sheet, .al-sheet, .f1-sheet'))
    sheets.forEach((sheet, sheetIndex) => {
      if (sheetIndex > 0 || sheet.previousElementSibling?.classList.contains('f1-continuous')) {
        sheet.before(pageBreak())
      }
      const shell = document.createElement('table')
      shell.className = 'word-page-shell'
      shell.setAttribute('role', 'presentation')
      const row = document.createElement('tr')
      const cell = document.createElement('td')
      const pagePadding = Math.min(10, Math.max(0, settings.pageBorderPaddingMm))
      cell.style.padding = `${pagePadding}mm`
      cell.style.verticalAlign = 'top'
      if (settings.showPageBorder) {
        const borderColor = settings.pageBorderColor === 'amber'
          ? '#b45309'
          : settings.pageBorderColor === 'stone'
            ? '#57534e'
            : '#111111'
        const borderStyle = settings.pageBorderStyle === 'solid' ? 'solid' : 'double'
        cell.style.border = `${settings.pageBorderThicknessPt}pt ${borderStyle} ${borderColor}`
      }
      while (sheet.firstChild) cell.appendChild(sheet.firstChild)
      row.appendChild(cell)
      const body = document.createElement('tbody')
      body.appendChild(row)
      shell.appendChild(body)
      sheet.replaceWith(shell)
    })
  })
  const size = bisPrintPageSizeMm(settings)
  const wordLayoutCss = `
    @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; font-family: Arial, sans-serif !important; display: block !important; width: auto !important; min-width: 0 !important; transform: none !important; }
    .bis-word-document { display: block !important; }
    .page-break { display: block; page-break-after: always; mso-break-type: page; }
    .word-page-shell { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; page-break-inside: avoid !important; }
    .word-page-shell td { vertical-align: top !important; }
    .f1-continuous { display: block !important; width: 100% !important; max-width: 100% !important; height: auto !important; min-height: 0 !important; max-height: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
    .pd-firm, .al-firm { font-family: 'Times New Roman', serif; font-weight: bold; }
    .pd-firm-addr, .al-firm-addr { text-align: inherit; }
    .pd-firm-contact span { display: inline-block; margin: 0 5px; }
    .pd-to-row { display: table; width: 100%; table-layout: fixed; margin-bottom: 12px; }
    .pd-to-block, .pd-date-block { display: table-cell; vertical-align: top; width: 50%; }
    .pd-date-block { text-align: right; }
    table { border-collapse: collapse; max-width: 100%; }
    tr, img, .pd-meta, .pd-table, .loc-map-wrap { page-break-inside: avoid; }
    .loc-map-wrap img { width: 100% !important; height: auto !important; }
    img { max-width: 100%; }
  `
  const styleText = `${pages.map((page) => page.style).join('\n')}\n${wordLayoutCss}`
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><meta name="ProgId" content="Word.Document"/><title>${safeTitle}</title><style>${styleText}</style><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]--></head>${document.body.outerHTML}</html>`
}

/**
 * The process flow chart is a flexbox drawing that Word cannot lay out (it kept the boxes and lost the arrows), so it goes
 * in as a picture: the drawing with the sheet's styles inside an SVG foreignObject, painted on a canvas.
 */
async function rasterizeFlowCharts(doc: Document) {
  const css = Array.from(doc.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  for (const chart of Array.from(doc.querySelectorAll<HTMLElement>('.pfc-canvas'))) {
    const width = Math.ceil(Math.max(chart.scrollWidth, chart.offsetWidth))
    const height = Math.ceil(Math.max(chart.scrollHeight, chart.offsetHeight))
    if (!width || !height) continue
    const wrap = chart.closest<HTMLElement>('.pfc-drawing-wrap') ?? chart
    const markup = new XMLSerializer().serializeToString(chart)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: ${chart.ownerDocument.defaultView?.getComputedStyle(chart).fontSize ?? '12px'}"><style>${css}</style>${markup}</div></foreignObject></svg>`
    try {
      const image = new Image()
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      await image.decode()
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const context = canvas.getContext('2d')
      if (!context) continue
      context.fillStyle = '#fffdf8'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.scale(scale, scale)
      context.drawImage(image, 0, 0, width, height)
      const room = Math.max(50, wrap.clientWidth - 20)
      // Same bounds as the sheet's fit-to-page script (at most 470px tall), so the letter and chart share one page.
      const fit = Math.min(1, room / width, 470 / height)
      const picture = doc.createElement('img')
      picture.src = canvas.toDataURL('image/png')
      picture.alt = 'Process flow chart'
      picture.style.width = `${Math.round(width * fit)}px`
      picture.style.height = `${Math.round(height * fit)}px`
      picture.style.display = 'block'
      picture.style.margin = '0 auto'
      wrap.replaceChildren(picture)
    } catch {
      // Keep the boxes when the browser will not paint the drawing.
    }
  }
}

function millimetresToTwips(value: number): number {
  return Math.round((value / 25.4) * 1440)
}

const WORD_BLOCK_TAGS = new Set(['DIV', 'P', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE'])

/**
 * html-to-docx only understands the `border` shorthand (it ignores the border-color / -style / -width longhands and then
 * writes "none" for the top and left edges of every table cell), so equal borders are written as one shorthand.
 */
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

function borderSides(computed: CSSStyleDeclaration) {
  return BORDER_SIDES.map((side) => {
    const width = parseFloat(computed.getPropertyValue(`border-${side}-width`)) || 0
    const style = computed.getPropertyValue(`border-${side}-style`)
    return { side, width, style, color: computed.getPropertyValue(`border-${side}-color`), visible: width > 0 && style !== 'none' && style !== 'hidden' }
  })
}

function applyWordBorder(element: HTMLElement, computed: CSSStyleDeclaration) {
  const sides = borderSides(computed)
  const first = sides[0]!
  if (first.visible && sides.every((side) => side.width === first.width && side.style === first.style && side.color === first.color)) {
    element.style.setProperty('border', `${first.width}px ${first.style} ${first.color}`)
  } else if (!sides.some((side) => side.visible)) {
    element.style.setProperty('border', '0 none')
  } else if (element.tagName === 'TD' || element.tagName === 'TH') {
    // Unequal cell borders: one shorthand per side (html-to-docx reads `border-bottom: …`, not the longhands).
    element.style.setProperty('border', '0 none')
    element.dataset.wordBorder = sides.map((side) => `border-${side.side}: ${side.visible ? `${side.width}px ${side.style} ${side.color}` : '0 none'}`).join('; ')
  }
}

/** First font of a CSS font-family list, without quotes (html-to-docx writes the raw value as the font name). */
function wordFontFamily(value: string): string {
  return (value.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '') || 'Arial'
}

function transformText(root: HTMLElement, transform: string) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    node.nodeValue = transform === 'uppercase'
      ? text.toUpperCase()
      : transform === 'lowercase'
        ? text.toLowerCase()
        : text.replace(/(^|\s)(\p{Ll})/gu, (_, lead: string, ch: string) => lead + ch.toUpperCase())
  }
}

async function imageAsDataUrl(image: HTMLImageElement): Promise<string | null> {
  const src = image.currentSrc || image.src
  if (!src) return null
  if (src.startsWith('data:')) return src
  try {
    const response = await fetch(src, { mode: 'cors' })
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    try {
      const canvas = image.ownerDocument.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext('2d')?.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }
}

/**
 * Word drops paragraph borders (the letterhead rule, the signature line), so a block with a top / bottom rule becomes a
 * one-cell table whose cell carries the rule.
 */
function wrapRuledBlocks(doc: Document, win: Window) {
  for (const block of Array.from(doc.body.querySelectorAll<HTMLElement>('div, p, h1, h2, h3, h4, h5, h6'))) {
    const computed = win.getComputedStyle(block)
    const sides = borderSides(computed)
    const top = sides[0]!
    const bottom = sides[2]!
    if (!top.visible && !bottom.visible) continue
    const width = block.getBoundingClientRect().width
    const parentWidth = block.parentElement?.getBoundingClientRect().width ?? width
    const table = doc.createElement('table')
    table.style.borderCollapse = 'collapse'
    table.style.width = `${Math.round(width)}px`
    if (width < parentWidth - 2 && block.parentElement) {
      const offset = block.getBoundingClientRect().left - block.parentElement.getBoundingClientRect().left
      if (offset > (parentWidth - width) / 2) table.setAttribute('align', 'right')
    }
    table.style.marginTop = computed.marginTop
    table.style.marginBottom = computed.marginBottom
    const row = doc.createElement('tr')
    const cell = doc.createElement('td')
    cell.style.border = '0 none'
    cell.dataset.wordBorder = `border-top: ${top.visible ? `${top.width}px ${top.style} ${top.color}` : '0 none'}; border-bottom: ${bottom.visible ? `${bottom.width}px ${bottom.style} ${bottom.color}` : '0 none'}; border-left: 0 none; border-right: 0 none`
    cell.style.padding = `${computed.paddingTop} 0 ${computed.paddingBottom} 0`
    cell.style.verticalAlign = 'top'
    cell.style.textAlign = computed.textAlign
    block.style.removeProperty('border')
    block.style.setProperty('border', '0 none')
    block.style.setProperty('margin-top', '0')
    block.style.setProperty('margin-bottom', '0')
    block.style.setProperty('padding-top', '0')
    block.style.setProperty('padding-bottom', '0')
    block.replaceWith(table)
    cell.appendChild(block)
    row.appendChild(cell)
    const body = doc.createElement('tbody')
    body.appendChild(row)
    table.appendChild(body)
  }
}

/** Inline items set apart on the page (letterhead "Tel   Email   GSTIN") keep a visible gap in Word. */
function keepInlineGaps(doc: Document) {
  for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>('span, strong, b, em, i, a'))) {
    const next = element.nextSibling as HTMLElement | null
    // nodeType, not instanceof: these nodes belong to the layout frame's window.
    if (!next || next.nodeType !== Node.ELEMENT_NODE) continue
    const a = element.getBoundingClientRect()
    const b = next.getBoundingClientRect()
    const gap = b.left - a.right
    if (Math.abs(a.top - b.top) > 2 || gap < 3) continue
    element.after(doc.createTextNode('\u00a0'.repeat(Math.max(1, Math.min(6, Math.round(gap / 3))))))
  }
}

/** The "To / Date" header row is a flex row; Word needs a real two-cell table. */
function convertToRowsToTables(doc: Document) {
  for (const row of Array.from(doc.querySelectorAll<HTMLElement>('.pd-to-row'))) {
    const table = doc.createElement('table')
    // Measured width: html-to-docx reads 100% as the full page text width, wider than the page frame it sits in.
    table.style.width = `${Math.round(row.getBoundingClientRect().width)}px`
    table.style.borderCollapse = 'collapse'
    const tr = doc.createElement('tr')
    Array.from(row.children).forEach((child, index) => {
      const cell = doc.createElement('td')
      cell.style.verticalAlign = 'top'
      cell.style.width = index === 0 ? '60%' : '40%'
      cell.style.textAlign = index === 0 ? 'left' : 'right'
      cell.style.border = '0 none'
      // The block itself goes in (not its loose text / <br> nodes), so its lines stay one paragraph.
      const block = child as HTMLElement
      block.style.setProperty('margin', '0')
      block.style.setProperty('width', 'auto')
      cell.appendChild(block)
      tr.appendChild(cell)
    })
    const body = doc.createElement('tbody')
    body.appendChild(tr)
    table.appendChild(body)
    row.replaceWith(table)
  }
}

/**
 * html-to-docx drops the text of a <div> that wraps other block elements when it sits inside a table cell (every sheet is a
 * one-cell table), which removed the letterhead, address block and signature. Unwrap such containers, keeping their bottom rule.
 */
function flattenNestedDivs(root: HTMLElement, win: Window) {
  const isBlock = (node: Element) => WORD_BLOCK_TAGS.has(node.tagName)
  for (const div of Array.from(root.querySelectorAll('div')).reverse()) {
    const children = Array.from(div.children)
    if (!children.some(isBlock)) continue
    const lastBlock = [...children].reverse().find(isBlock) as HTMLElement | undefined
    if (lastBlock) {
      const computed = win.getComputedStyle(div)
      const ruleWidth = parseFloat(computed.getPropertyValue('border-bottom-width')) || 0
      if (ruleWidth > 0 && computed.getPropertyValue('border-bottom-style') !== 'none') {
        lastBlock.style.setProperty('border-bottom', `${ruleWidth}px ${computed.getPropertyValue('border-bottom-style')} ${computed.getPropertyValue('border-bottom-color')}`)
        lastBlock.style.setProperty('padding-bottom', computed.getPropertyValue('padding-bottom'))
        lastBlock.style.setProperty('margin-bottom', computed.getPropertyValue('margin-bottom'))
      }
    }
    div.replaceWith(...Array.from(div.childNodes))
  }
}

async function inlineWordCompatibleStyles(
  html: string,
  pageWidthMm: number,
  pageHeightMm: number,
): Promise<string> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageWidthMm}mm;height:${pageHeightMm}mm;border:0;visibility:hidden;pointer-events:none`
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve()
    frame.onerror = () => reject(new Error('Could not prepare Word document layout'))
  })
  frame.srcdoc = html
  document.body.appendChild(frame)
  try {
    await loaded
    const frameDocument = frame.contentDocument
    const frameWindow = frame.contentWindow
    if (!frameDocument || !frameWindow) throw new Error('Could not prepare Word document layout')
    const styleProperties = [
      'background-color', 'border-collapse', 'color', 'font-family', 'font-size',
      'font-style', 'font-weight', 'line-height', 'margin-bottom', 'margin-left',
      'margin-right', 'margin-top', 'padding-bottom', 'padding-left', 'padding-right',
      'padding-top', 'text-align', 'text-decoration', 'vertical-align', 'white-space',
    ]
    await Promise.all(
      Array.from(frameDocument.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
          img.onload = () => resolve()
          img.onerror = () => resolve()
        }),
      ),
    )
    await rasterizeFlowCharts(frameDocument)
    keepInlineGaps(frameDocument)
    const images: { element: HTMLImageElement; width: number; height: number }[] = []
    const transforms: { element: HTMLElement; transform: string }[] = []
    for (const element of Array.from(frameDocument.body.querySelectorAll<HTMLElement>('*'))) {
      const computed = frameWindow.getComputedStyle(element)
      applyWordBorder(element, computed)
      for (const property of styleProperties) {
        const value = computed.getPropertyValue(property)
        if (value && value !== 'normal' && value !== 'auto' && value !== 'rgba(0, 0, 0, 0)') {
          element.style.setProperty(property, value)
        }
      }
      element.style.setProperty('font-family', wordFontFamily(computed.getPropertyValue('font-family')))
      // html-to-docx only knows the keyword "bold", not numeric weights.
      element.style.setProperty('font-weight', (parseInt(computed.getPropertyValue('font-weight'), 10) || 400) >= 600 ? 'bold' : 'normal')
      const transform = computed.getPropertyValue('text-transform')
      if (transform && transform !== 'none' && (!element.parentElement || frameWindow.getComputedStyle(element.parentElement).getPropertyValue('text-transform') !== transform)) {
        transforms.push({ element, transform })
      }
      if ((element.tagName === 'TABLE' || element.tagName === 'TD' || element.tagName === 'TH') && !element.matches('.word-page-shell > tbody > tr > td')) {
        const width = computed.getPropertyValue('width')
        if (width && width !== 'auto') element.style.width = width
      }
      if (element.tagName === 'IMG') {
        const box = element.getBoundingClientRect()
        if (computed.display === 'none' || computed.visibility === 'hidden' || box.width < 1 || box.height < 1) {
          element.remove()
          continue
        }
        images.push({ element: element as HTMLImageElement, width: Math.round(box.width), height: Math.round(box.height) })
      }
    }
    // Images are embedded (signatures and seals on remote storage would otherwise be dropped) at their on-page size.
    for (const { element, width, height } of images) {
      const data = await imageAsDataUrl(element)
      if (!data) {
        element.remove()
        continue
      }
      element.src = data
      element.removeAttribute('srcset')
      element.setAttribute('width', String(width))
      element.setAttribute('height', String(height))
      element.style.width = `${width}px`
      element.style.height = `${height}px`
      element.style.maxWidth = '100%'
    }
    for (const { element, transform } of transforms) transformText(element, transform)
    wrapRuledBlocks(frameDocument, frameWindow)
    convertToRowsToTables(frameDocument)
    flattenNestedDivs(frameDocument.body, frameWindow)
    for (const pageNumber of Array.from(frameDocument.querySelectorAll<HTMLElement>('.pd-page-num'))) {
      pageNumber.style.position = 'static'
      pageNumber.style.textAlign = 'right'
      pageNumber.style.marginTop = '8pt'
    }
    // Side borders go in last as plain text: setting them through element.style lets the browser fold them into
    // border-width / border-style longhands, which html-to-docx ignores.
    for (const element of Array.from(frameDocument.querySelectorAll<HTMLElement>('[data-word-border]'))) {
      element.setAttribute('style', `${element.getAttribute('style') ?? ''}; ${element.dataset.wordBorder}`)
      element.removeAttribute('data-word-border')
    }
    // The browser re-quotes multi-word font names ("Times New Roman"); html-to-docx would keep the quotes in the font name.
    return frameDocument.documentElement.outerHTML.replace(/font-family:\s*&quot;([^&;]+)&quot;/g, 'font-family: $1')
  } finally {
    frame.remove()
  }
}

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const wordChildren = (parent: Element, name: string) =>
  Array.from(parent.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === name)

const wordChild = (parent: Element | undefined, name: string) => (parent ? wordChildren(parent, name)[0] : undefined)

const wordInt = (element: Element | undefined, attribute = 'w') => {
  const value = Number(element?.getAttributeNS(WORD_NS, attribute) ?? element?.getAttribute(`w:${attribute}`))
  return Number.isFinite(value) ? value : 0
}

function setWordAttr(element: Element, name: string, value: string | number) {
  element.setAttributeNS(WORD_NS, `w:${name}`, String(value))
}

/** Left + right cell margins of a table (tblCellMar), in twips. */
function tableCellMargins(table: Element): number {
  const margins = wordChild(wordChild(table, 'tblPr'), 'tblCellMar')
  return wordInt(wordChild(margins, 'left')) + wordInt(wordChild(margins, 'right'))
}

/**
 * html-to-docx writes every table grid as equal (often fractional) columns, leaves many cells without a width and turns a
 * 100% nested table into a fixed 5000 twips. Word then discards the grid and auto-fits, so Form 1 and other tables collapse
 * to their text width. Rebuild each grid from the measured cell widths and fix the layout so Word keeps the on-screen columns.
 */
function normalizeDocxTables(xml: string, textWidthTwips: number, pagePaddingTwips: number): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return xml
  const tables = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'tbl'))
  const widthOfCell = new Map<Element, number>()
  for (const table of tables) {
    // Document order: a parent table is fixed before the tables nested in its cells.
    let parentCell: Element | null = table.parentElement
    while (parentCell && !(parentCell.namespaceURI === WORD_NS && parentCell.localName === 'tc')) parentCell = parentCell.parentElement
    let available = textWidthTwips
    if (parentCell) {
      const parentTable = parentCell.parentElement?.parentElement ?? null
      const cellWidth = widthOfCell.get(parentCell) ?? wordInt(wordChild(wordChild(parentCell, 'tcPr'), 'tcW'))
      const cellMar = wordChild(wordChild(parentCell, 'tcPr'), 'tcMar')
      const margins = cellMar
        ? wordInt(wordChild(cellMar, 'left')) + wordInt(wordChild(cellMar, 'right'))
        : parentTable ? tableCellMargins(parentTable) : 0
      if (cellWidth > 0) available = Math.max(200, cellWidth - margins)
    }

    let tblPr = wordChild(table, 'tblPr')
    if (!tblPr) {
      tblPr = doc.createElementNS(WORD_NS, 'w:tblPr')
      table.insertBefore(tblPr, table.firstChild)
    }
    setTableCellMargins(doc, table, tblPr, !parentCell, pagePaddingTwips)
    const rowsOfTable = wordChildren(table, 'tr')
    if (!parentCell && rowsOfTable.length === 1 && wordChildren(rowsOfTable[0]!, 'tc').length === 1) {
      // A page frame that runs a little longer in Word must flow on, not be clipped and pushed past a blank page.
      for (const cantSplit of wordChildren(wordChild(rowsOfTable[0]!, 'trPr') ?? rowsOfTable[0]!, 'cantSplit')) cantSplit.remove()
    }
    let tblW = wordChild(tblPr, 'tblW')
    const declared = tblW && (tblW.getAttributeNS(WORD_NS, 'type') ?? tblW.getAttribute('w:type')) === 'dxa' ? wordInt(tblW) : 0
    // 5000 is html-to-docx's "100%" written as twips.
    const tableWidth = Math.round(declared > 0 && declared !== 5000 ? Math.min(declared, available) : available)

    const rows = wordChildren(table, 'tr')
    const cellsOf = (row: Element) => wordChildren(row, 'tc').map((cell) => {
      const tcPr = wordChild(cell, 'tcPr')
      return { cell, span: Math.max(1, wordInt(wordChild(tcPr, 'gridSpan'), 'val') || 1), width: wordInt(wordChild(tcPr, 'tcW')) }
    })
    const columns = Math.max(1, ...rows.map((row) => cellsOf(row).reduce((sum, cell) => sum + cell.span, 0)))
    const grid: (number | null)[] = Array.from({ length: columns }, () => null)
    // Single-column cells give exact column widths; spanned cells fill what is still unknown.
    for (const row of rows) {
      let column = 0
      for (const cell of cellsOf(row)) {
        if (cell.span === 1 && cell.width > 0 && grid[column] == null) grid[column] = cell.width
        column += cell.span
      }
    }
    for (const row of rows) {
      let column = 0
      for (const cell of cellsOf(row)) {
        const slots = grid.slice(column, column + cell.span)
        const unknown = slots.filter((slot) => slot == null).length
        if (unknown && cell.width > 0) {
          const known = slots.reduce<number>((sum, slot) => sum + (slot ?? 0), 0)
          const share = Math.max(0, cell.width - known) / unknown
          for (let index = column; index < column + cell.span; index += 1) if (grid[index] == null) grid[index] = share
        }
        column += cell.span
      }
    }
    const knownTotal = grid.reduce<number>((sum, slot) => sum + (slot ?? 0), 0)
    const missing = grid.filter((slot) => slot == null || slot <= 0).length
    const filler = missing ? Math.max(0, tableWidth - knownTotal) / missing || tableWidth / columns : 0
    const raw = grid.map((slot) => (slot == null || slot <= 0 ? filler : slot))
    const rawTotal = raw.reduce((sum, value) => sum + value, 0) || 1
    const scaled = raw.map((value) => Math.max(1, Math.round((value * tableWidth) / rawTotal)))

    let tblGrid = wordChild(table, 'tblGrid')
    if (!tblGrid) {
      tblGrid = doc.createElementNS(WORD_NS, 'w:tblGrid')
      tblPr.after(tblGrid)
    }
    while (tblGrid.firstChild) tblGrid.removeChild(tblGrid.firstChild)
    for (const width of scaled) {
      const gridCol = doc.createElementNS(WORD_NS, 'w:gridCol')
      setWordAttr(gridCol, 'w', width)
      tblGrid.appendChild(gridCol)
    }

    if (!tblW) {
      tblW = doc.createElementNS(WORD_NS, 'w:tblW')
      tblPr.insertBefore(tblW, tblPr.firstChild)
    }
    setWordAttr(tblW, 'type', 'dxa')
    setWordAttr(tblW, 'w', scaled.reduce((sum, value) => sum + value, 0))
    let layout = wordChild(tblPr, 'tblLayout')
    if (!layout) {
      layout = doc.createElementNS(WORD_NS, 'w:tblLayout')
      const before = wordChild(tblPr, 'tblCellMar') ?? wordChild(tblPr, 'tblLook') ?? null
      tblPr.insertBefore(layout, before)
    }
    setWordAttr(layout, 'type', 'fixed')

    for (const row of rows) {
      let column = 0
      for (const { cell, span } of cellsOf(row)) {
        const width = scaled.slice(column, column + span).reduce((sum, value) => sum + value, 0)
        column += span
        let tcPr = wordChild(cell, 'tcPr')
        if (!tcPr) {
          tcPr = doc.createElementNS(WORD_NS, 'w:tcPr')
          cell.insertBefore(tcPr, cell.firstChild)
        }
        let tcW = wordChild(tcPr, 'tcW')
        if (!tcW) tcW = doc.createElementNS(WORD_NS, 'w:tcW')
        tcPr.insertBefore(tcW, tcPr.firstChild)
        setWordAttr(tcW, 'type', 'dxa')
        setWordAttr(tcW, 'w', width)
        widthOfCell.set(cell, width)
      }
    }
  }
  tidyPageBreaks(doc)
  return new XMLSerializer().serializeToString(doc)
}

/**
 * html-to-docx pads every cell 80 / 160 twips, including the invisible layout tables (letterhead, "To / Date", signature)
 * that have no padding on screen, so sheets grew taller than a page in Word and left blank pages; narrow headers also broke
 * mid-word. Pad by what the table is: page frame → page padding, bordered grid → the sheets' 4px 6px, rule → a little
 * above / below, layout → none.
 */
function setTableCellMargins(doc: Document, table: Element, tblPr: Element, topLevel: boolean, pagePaddingTwips: number) {
  const cells = wordChildren(table, 'tr').flatMap((row) => wordChildren(row, 'tc'))
  const borderSidesOf = (cell: Element) => {
    const borders = wordChild(wordChild(cell, 'tcPr'), 'tcBorders')
    return borders
      ? Array.from(borders.children).filter((side) => !['nil', 'none'].includes(side.getAttributeNS(WORD_NS, 'val') ?? side.getAttribute('w:val') ?? ''))
      : []
  }
  const frame = topLevel && cells.length === 1
  const grid = cells.filter((cell) => borderSidesOf(cell).length >= 4).length * 2 >= cells.length && cells.length > 0
  const ruled = cells.some((cell) => borderSidesOf(cell).length > 0)
  const [vertical, horizontal] = frame
    ? [pagePaddingTwips, pagePaddingTwips]
    : grid ? [60, 90] : ruled ? [40, 0] : [0, 0]
  let cellMar = wordChild(tblPr, 'tblCellMar')
  if (!cellMar) {
    cellMar = doc.createElementNS(WORD_NS, 'w:tblCellMar')
    tblPr.insertBefore(cellMar, wordChild(tblPr, 'tblLook') ?? null)
  }
  while (cellMar.firstChild) cellMar.removeChild(cellMar.firstChild)
  for (const [side, width] of [['top', vertical], ['left', horizontal], ['bottom', vertical], ['right', horizontal]] as const) {
    const margin = doc.createElementNS(WORD_NS, `w:${side}`)
    setWordAttr(margin, 'w', width)
    setWordAttr(margin, 'type', 'dxa')
    cellMar.appendChild(margin)
  }
}

const isEmptyParagraph = (node: Element) =>
  node.namespaceURI === WORD_NS && node.localName === 'p'
  && !['t', 'drawing', 'br', 'pict', 'object'].some((name) => node.getElementsByTagNameNS(WORD_NS, name).length)

/**
 * A page break written as "empty paragraph + paragraph with a page break" pushes an extra blank page whenever the sheet
 * before it already fills its page. One 1pt paragraph with "page break before" starts the next sheet on a new page either way.
 */
function tidyPageBreaks(doc: Document) {
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) return
  for (const paragraph of wordChildren(body, 'p')) {
    const breaks = paragraph.getElementsByTagNameNS(WORD_NS, 'br')
    const onlyPageBreak = breaks.length === 1
      && (breaks[0]!.getAttributeNS(WORD_NS, 'type') ?? breaks[0]!.getAttribute('w:type')) === 'page'
      && !paragraph.getElementsByTagNameNS(WORD_NS, 't').length
    if (!onlyPageBreak) continue
    for (let previous = paragraph.previousElementSibling; previous && isEmptyParagraph(previous); previous = paragraph.previousElementSibling) {
      previous.remove()
    }
    for (let next = paragraph.nextElementSibling; next && isEmptyParagraph(next); next = paragraph.nextElementSibling) {
      next.remove()
    }
    while (paragraph.firstChild) paragraph.removeChild(paragraph.firstChild)
    const pPr = doc.createElementNS(WORD_NS, 'w:pPr')
    pPr.appendChild(doc.createElementNS(WORD_NS, 'w:pageBreakBefore'))
    const spacing = doc.createElementNS(WORD_NS, 'w:spacing')
    setWordAttr(spacing, 'before', 0)
    setWordAttr(spacing, 'after', 0)
    setWordAttr(spacing, 'line', 20)
    setWordAttr(spacing, 'lineRule', 'exact')
    pPr.appendChild(spacing)
    const rPr = doc.createElementNS(WORD_NS, 'w:rPr')
    const size = doc.createElementNS(WORD_NS, 'w:sz')
    setWordAttr(size, 'val', 2)
    rPr.appendChild(size)
    pPr.appendChild(rPr)
    paragraph.appendChild(pPr)
  }
}

async function fixDocxTableLayout(bytes: ArrayBuffer, textWidthTwips: number, pagePaddingTwips: number): Promise<ArrayBuffer> {
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(bytes)
    const part = zip.file('word/document.xml')
    if (!part) return bytes
    zip.file('word/document.xml', normalizeDocxTables(await part.async('string'), textWidthTwips, pagePaddingTwips))
    return await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  } catch {
    return bytes
  }
}

export async function buildWordDocx(html: string, title: string, settings: typeof DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS): Promise<Blob> {
  // The browser build of html-to-docx still reads the Node-style `global` name.
  // Define that alias before loading its lazy chunk so the ESM bundle can run in browsers.
  const browserGlobal = globalThis as typeof globalThis & { global?: typeof globalThis }
  browserGlobal.global ??= globalThis
  // It also needs Node's Buffer to embed images.
  const browserBuffer = globalThis as typeof globalThis & { Buffer?: unknown }
  if (!browserBuffer.Buffer) browserBuffer.Buffer = (await import('buffer')).Buffer
  const { default: HTMLtoDOCX } = await import('@turbodocx/html-to-docx')
  const size = bisPrintPageSizeMm(settings)
  // Lay out at Word's text width (page minus side margins) so measured widths carry over without clipping.
  const wordReadyHtml = await inlineWordCompatibleStyles(
    html,
    Math.max(50, size.widthMm - settings.marginLeftMm - settings.marginRightMm),
    size.heightMm,
  )
  const wordDocument = await HTMLtoDOCX(wordReadyHtml, null, {
    orientation: settings.orientation,
    pageSize: {
      width: millimetresToTwips(size.widthMm),
      height: millimetresToTwips(size.heightMm),
    },
    margins: {
      top: millimetresToTwips(settings.marginTopMm),
      right: millimetresToTwips(settings.marginRightMm),
      bottom: millimetresToTwips(settings.marginBottomMm),
      left: millimetresToTwips(settings.marginLeftMm),
    },
    title,
    creator: 'Quality Engineering',
    font: 'Arial',
    table: {
      row: { cantSplit: true },
    },
    imageProcessing: { svgHandling: 'native', suppressSharpWarning: true },
  })
  const bytes = wordDocument instanceof Blob
    ? await wordDocument.arrayBuffer()
    : wordDocument instanceof ArrayBuffer
      ? wordDocument
      : Uint8Array.from(wordDocument).buffer
  const fixed = await fixDocxTableLayout(
    bytes,
    millimetresToTwips(size.widthMm - settings.marginLeftMm - settings.marginRightMm),
    millimetresToTwips(Math.min(10, Math.max(0, settings.pageBorderPaddingMm))),
  )
  return new Blob([fixed], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
