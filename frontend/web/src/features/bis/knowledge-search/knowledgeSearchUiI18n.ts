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
  serviceUnavailableBanner: string
  serviceOn: string
  serviceOff: string
  serviceChecking: string
  standardLabel: string
  standardHint: string
  standardAll: string
  standardsLoading: string
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
    'Loading corpus status from the knowledge service…',
  serviceUnavailableBanner:
    'Knowledge search is not available on this server. It runs only on a local developer machine (port 3851). Railway does not host the knowledge sidecar yet.',
  serviceOn: 'Knowledge service: on',
  serviceOff: 'Knowledge service: unavailable',
  serviceChecking: 'Knowledge service: checking…',
  standardLabel: 'Standard',
  standardHint:
    'Choosing one IS keeps other standards out of the candidate set. “All” is a separate mode over the current corpus.',
  standardAll: 'All standards (current corpus)',
  standardsLoading: 'Loading standards…',
  queryLabel: 'Question',
  queryPlaceholder: 'Example: blank granules free from extraneous material',
  searchButton: 'Search',
  searchingButton: 'Searching…',
  healthButton: 'Check service',
  emptyQuery: 'Please enter a question to search.',
  loading: 'Search in progress…',
  searchFailed: 'Search failed.',
  serviceDown:
    'Knowledge search is unavailable here. On a developer Mac, start the local API (port 3851). Production does not include this service yet.',
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
    'ज्ञान सेवा से कॉर्पस स्थिति लोड हो रही है…',
  serviceUnavailableBanner:
    'इस सर्वर पर ज्ञान खोज उपलब्ध नहीं है। यह केवल डेवलपर मशीन पर स्थानीय API (पोर्ट 3851) से चलती है। Railway पर अभी knowledge sidecar नहीं है।',
  serviceOn: 'ज्ञान सेवा: चालू',
  serviceOff: 'ज्ञान सेवा: अनुपलब्ध',
  serviceChecking: 'ज्ञान सेवा: जाँच…',
  standardLabel: 'Standard',
  standardHint:
    'IS चुनने पर दूसरे standards candidate set में नहीं आते। «सभी» वर्तमान कॉर्पस पर अलग mode है।',
  standardAll: 'सभी standards (वर्तमान कॉर्पस)',
  standardsLoading: 'Standards लोड…',
  queryLabel: 'सवाल',
  queryPlaceholder: 'उदाहरण: blank granules free from extraneous material',
  searchButton: 'खोज',
  searchingButton: 'खोज…',
  healthButton: 'सेवा जाँच',
  emptyQuery: 'कृपया खोज के लिए सवाल लिखें।',
  loading: 'खोज चल रही है…',
  searchFailed: 'खोज असफल रही।',
  serviceDown:
    'ज्ञान खोज यहाँ उपलब्ध नहीं है। डेवलपर Mac पर स्थानीय API (पोर्ट 3851) चालू करें। Production में यह सेवा अभी नहीं है।',
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
