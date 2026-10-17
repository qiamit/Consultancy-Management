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

function millimetresToTwips(value: number): number {
  return Math.round((value / 25.4) * 1440)
}

const WORD_BLOCK_TAGS = new Set(['DIV', 'P', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE'])

/**
 * html-to-docx only understands the `border` shorthand (it ignores the border-color / -style / -width longhands and then
 * writes "none" for the top and left edges of every table cell), so equal borders are written as one shorthand.
 */
function applyWordBorder(element: HTMLElement, computed: CSSStyleDeclaration) {
  const sides = ['top', 'right', 'bottom', 'left'].map((side) => ({
    width: parseFloat(computed.getPropertyValue(`border-${side}-width`)) || 0,
    style: computed.getPropertyValue(`border-${side}-style`),
    color: computed.getPropertyValue(`border-${side}-color`),
  }))
  const visible = (side: (typeof sides)[number]) => side.width > 0 && side.style !== 'none' && side.style !== 'hidden'
  const first = sides[0]!
  if (visible(first) && sides.every((side) => side.width === first.width && side.style === first.style && side.color === first.color)) {
    element.style.setProperty('border', `${first.width}px ${first.style} ${first.color}`)
  } else if (!sides.some(visible)) {
    element.style.setProperty('border', '0 none')
  }
}

/** The "To / Date" header row is a flex row; Word needs a real two-cell table. */
function convertToRowsToTables(doc: Document) {
  for (const row of Array.from(doc.querySelectorAll<HTMLElement>('.pd-to-row'))) {
    const table = doc.createElement('table')
    table.style.width = '100%'
    table.style.borderCollapse = 'collapse'
    const tr = doc.createElement('tr')
    Array.from(row.children).forEach((child, index) => {
      const cell = doc.createElement('td')
      cell.style.verticalAlign = 'top'
      cell.style.width = index === 0 ? '60%' : '40%'
      cell.style.textAlign = index === 0 ? 'left' : 'right'
      cell.style.border = '0 none'
      while (child.firstChild) cell.appendChild(child.firstChild)
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
    for (const element of Array.from(frameDocument.body.querySelectorAll<HTMLElement>('*'))) {
      const computed = frameWindow.getComputedStyle(element)
      applyWordBorder(element, computed)
      for (const property of styleProperties) {
        const value = computed.getPropertyValue(property)
        if (value && value !== 'normal' && value !== 'auto' && value !== 'rgba(0, 0, 0, 0)') {
          element.style.setProperty(property, value)
        }
      }
      if (element.tagName === 'TABLE' || element.tagName === 'TD' || element.tagName === 'TH') {
        const width = computed.getPropertyValue('width')
        if (width && width !== 'auto') element.style.width = width
      }
      if (element.tagName === 'IMG') {
        const width = computed.getPropertyValue('width')
        if (width && width !== 'auto') element.style.width = width
        element.style.maxWidth = '100%'
        element.style.height = 'auto'
      }
    }
    convertToRowsToTables(frameDocument)
    flattenNestedDivs(frameDocument.body, frameWindow)
    for (const pageNumber of Array.from(frameDocument.querySelectorAll<HTMLElement>('.pd-page-num'))) {
      pageNumber.style.position = 'static'
      pageNumber.style.textAlign = 'right'
      pageNumber.style.marginTop = '8pt'
    }
    return frameDocument.documentElement.outerHTML
  } finally {
    frame.remove()
  }
}

export async function buildWordDocx(html: string, title: string, settings: typeof DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS): Promise<Blob> {
  // The browser build of html-to-docx still reads the Node-style `global` name.
  // Define that alias before loading its lazy chunk so the ESM bundle can run in browsers.
  const browserGlobal = globalThis as typeof globalThis & { global?: typeof globalThis }
  browserGlobal.global ??= globalThis
  const { default: HTMLtoDOCX } = await import('@turbodocx/html-to-docx')
  const size = bisPrintPageSizeMm(settings)
  const wordReadyHtml = await inlineWordCompatibleStyles(html, size.widthMm, size.heightMm)
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
      borderOptions: { size: 1, color: '000000' },
    },
    imageProcessing: { svgHandling: 'native', suppressSharpWarning: true },
  })
  const bytes = wordDocument instanceof Blob
    ? await wordDocument.arrayBuffer()
    : wordDocument instanceof ArrayBuffer
      ? wordDocument
      : Uint8Array.from(wordDocument).buffer
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
