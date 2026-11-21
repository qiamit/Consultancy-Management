/*
 * Standard names as asked -> Standards Library folders (same rules as backend/services/functions/libraryApi.mjs, which
 * serves the qirlpl.com Library API; keep the two alike).
 */

// Letters and digits only; "ISO/IEC 17025" is also asked as "ISO 17025".
const compact = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ISOIEC/, 'ISO')

/**
 * A standard's name as asked -> its library folder, Part and Sec; null when the library has no folder for it.
 * IS standards: "IS:1786", "is 1786", "1786", "IS 3025 (Part 11)" -> folder "IS 1786" / "IS 3025" (+ Part).
 * Other standards (ASTM, ISO, ISO-IEC, JIS, EN … one folder each): matched on letters and digits only, the edition
 * year left out, so "ASTM E415-21", "ISO/IEC 17025:2017" and "JIS B7184" find "ASTM E415", "ISO-IEC 17025", "JIS B 7184".
 * `otherFolders`: the library's folders that are not "IS <number>".
 */
export function resolveLibraryName(name, otherFolders = []) {
  const text = String(name ?? '').trim()
  if (!text) return null
  const part = text.match(/\bpart\s*[-:]?\s*(\d+)/i)?.[1] ?? ''
  const section = text.match(/\bsec(?:tion)?\s*[-:]?\s*(\d+)/i)?.[1] ?? ''
  const is = text.match(/\bIS\s*[:/-]?\s*(\d{1,5})\b/i) || text.match(/^\s*(\d{1,5})\s*$/)
  if (is) return { folder: `IS ${Number(is[1])}`, part: String(Number(part) || ''), section: String(Number(section) || '') }
  const key = compact(
    text
      .replace(/\(\s*(part|sec)[^)]*\)/gi, ' ')
      .replace(/\b(part|sec(tion)?)\s*[-:]?\s*\d+.*$/i, ' ')
      .replace(/\s*[:-]\s*(19|20)?\d{2}[a-z]?(\s*\(\s*\d{4}\s*\))?\s*$/i, '')
      .replace(/\(\s*\d{4}\s*\)\s*$/, ''),
  )
  if (key.length < 3) return null
  let best = null
  for (const folder of otherFolders) {
    const f = compact(folder)
    if (!f) continue
    // A longer number never matches a shorter folder ("ASTM D445" is not "ASTM D44").
    if (f === key || (key.startsWith(f) && !/\d/.test(key[f.length]) && /\d$/.test(f))) {
      if (!best || f.length > compact(best).length) best = folder
    }
  }
  return best ? { folder: best, part: '', section: '' } : null
}
