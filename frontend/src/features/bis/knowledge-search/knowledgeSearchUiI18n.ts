/** Lightweight EN/HI UI strings for BIS Knowledge Search test page (no i18n package). */

export type KnowledgeUiLang = 'en' | 'hi'

const STORAGE_KEY = 'bis.knowledgeSearch.uiLang'

export const KNOWLEDGE_UI_LANGS: { id: KnowledgeUiLang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
]

type UiStrings = {
  pageTitle: string
  disclaimer: string
  serviceOn: string
  serviceOff: string
  serviceChecking: string
  standardLabel: string
  standardHint: string
  standardAll: string
  queryLabel: string
  queryPlaceholder: string
  searchButton: string
  searchingButton: string
  healthButton: string
  emptyQuery: string
  loading: string
  searchFailed: string
  serviceDown: string
  stateSupportedTitle: string
  stateUncertainTitle: string
  stateNotFoundTitle: string
  stateSupportedBody: string
  stateUncertainBody: string
  stateNotFoundBody: string
  evidenceHeading: string
  evidenceNote: string
  labelIs: string
  labelClause: string
  labelPdfPages: string
  labelReview: string
  labelRank: string
  labelChunk: string
  labelSource: string
  languageLabel: string
  languageHint: string
}

const EN: UiStrings = {
  pageTitle: 'BIS Knowledge Search — Test',
  disclaimer:
    'Loading corpus status from the local knowledge service…',
  serviceOn: 'Local service: on',
  serviceOff: 'Local service: off',
  serviceChecking: 'Local service: checking…',
  standardLabel: 'Standard',
  standardHint:
    'Choosing one IS keeps other standards out of the candidate set. “All” is a separate mode.',
  standardAll: 'All standards (in current corpus)',
  queryLabel: 'Question',
  queryPlaceholder: 'Example: blank granules free from extraneous material',
  searchButton: 'Search',
  searchingButton: 'Searching…',
  healthButton: 'Check service',
  emptyQuery: 'Please enter a question to search.',
  loading: 'Search in progress…',
  searchFailed: 'Search failed.',
  serviceDown:
    'Local knowledge search service is offline. Please start the local API (port 3851).',
  stateSupportedTitle: 'Supported',
  stateUncertainTitle: 'Uncertain',
  stateNotFoundTitle: 'Not found',
  stateSupportedBody: 'A reviewed related source was found.',
  stateUncertainBody: 'A possibly related excerpt was found, but verification is required.',
  stateNotFoundBody: 'No adequate evidence for this question was found in the reviewed sources.',
  evidenceHeading: 'Evidence excerpts',
  evidenceNote:
    'These are reviewed sources — an AI-generated answer is not produced yet. Rank order is not an accuracy percentage.',
  labelIs: 'IS',
  labelClause: 'Clause',
  labelPdfPages: 'PDF pages',
  labelReview: 'Review',
  labelRank: 'Rank',
  labelChunk: 'chunk',
  labelSource: 'source',
  languageLabel: 'UI language',
  languageHint: 'Controls labels only. You can search in Hindi or English in either mode.',
}

const HI: UiStrings = {
  pageTitle: 'BIS ज्ञान खोज — परीक्षण',
  disclaimer:
    'स्थानीय ज्ञान सेवा से कॉर्पस स्थिति लोड हो रही है…',
  serviceOn: 'स्थानीय सेवा: चालू',
  serviceOff: 'स्थानीय सेवा: बंद',
  serviceChecking: 'स्थानीय सेवा: जाँच…',
  standardLabel: 'Standard',
  standardHint:
    'IS चुनने पर दूसरे standards candidate set में नहीं आते। «सभी» अलग mode है।',
  standardAll: 'सभी standards (वर्तमान कॉर्पस)',
  queryLabel: 'सवाल',
  queryPlaceholder: 'उदाहरण: blank granules free from extraneous material',
  searchButton: 'खोज',
  searchingButton: 'खोज…',
  healthButton: 'सेवा जाँच',
  emptyQuery: 'कृपया खोज के लिए सवाल लिखें।',
  loading: 'खोज चल रही है…',
  searchFailed: 'खोज असफल रही।',
  serviceDown:
    'स्थानीय ज्ञान खोज सेवा बंद है। कृपया स्थानीय API चालू करें (पोर्ट 3851)।',
  stateSupportedTitle: 'Supported',
  stateUncertainTitle: 'Uncertain',
  stateNotFoundTitle: 'Not found',
  stateSupportedBody: 'जाँचा हुआ संबंधित स्रोत मिला।',
  stateUncertainBody: 'संभावित संबंधित अंश मिला है, लेकिन सत्यापन आवश्यक है।',
  stateNotFoundBody: 'जाँचे हुए स्रोत में इस प्रश्न का पर्याप्त प्रमाण नहीं मिला।',
  evidenceHeading: 'साक्ष्य अंश',
  evidenceNote:
    'ये जाँचे हुए स्रोत हैं — AI-generated उत्तर अभी नहीं बनाया जाता। मिलान क्रम शुद्धता प्रतिशत नहीं है।',
  labelIs: 'IS',
  labelClause: 'Clause',
  labelPdfPages: 'PDF पृष्ठ',
  labelReview: 'Review',
  labelRank: 'क्रम',
  labelChunk: 'chunk',
  labelSource: 'source',
  languageLabel: 'UI भाषा',
  languageHint: 'केवल लेबल बदलता है। किसी भी mode में Hindi या English में खोज सकते हैं।',
}

const BY_LANG: Record<KnowledgeUiLang, UiStrings> = { en: EN, hi: HI }

export function getKnowledgeUiStrings(lang: KnowledgeUiLang): UiStrings {
  return BY_LANG[lang] ?? EN
}

export function loadKnowledgeUiLang(): KnowledgeUiLang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'en' || raw === 'hi') return raw
  } catch {
    /* ignore */
  }
  return 'en'
}

export function saveKnowledgeUiLang(lang: KnowledgeUiLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

export function answerabilityUiCopy(
  lang: KnowledgeUiLang,
  state: 'supported' | 'uncertain' | 'not_found' | null | undefined,
): { title: string; body: string } {
  const t = getKnowledgeUiStrings(lang)
  if (state === 'supported') return { title: t.stateSupportedTitle, body: t.stateSupportedBody }
  if (state === 'uncertain') return { title: t.stateUncertainTitle, body: t.stateUncertainBody }
  if (state === 'not_found') return { title: t.stateNotFoundTitle, body: t.stateNotFoundBody }
  return { title: '', body: '' }
}
