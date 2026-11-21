import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * Voice for Ask AI (owner, 21 Nov 2026): answers read aloud (the browser's speech synthesis) and a question taken by
 * voice until a pause (the browser's speech recognition: Chrome, Edge, Safari). Nothing leaves the browser except
 * what the browser's own speech service needs.
 */

type RecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** What to read aloud: no Markdown marks, no "(IS 1786 2008 Amd 3.pdf p. 1)" citations, table cells as a list. */
export function speechText(markdown: string): string {
  const lines = markdown
    .replace(/\((?:[^()]*\.pdf[^()]*|[^()]*\bp\.\s*\d+[^()]*)\)/gi, '')
    .split('\n')
    .filter((line) => !/^\s*\|?\s*:?-{2,}/.test(line))
    .map((line) => {
      const t = line.trim()
      // A table row is read as its cells: "Fe 415, 0.30."
      if (/^\|.*\|$/.test(t)) return `${t.slice(1, -1).split('|').map((c) => c.trim()).filter(Boolean).join(', ')}.`
      return t.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '')
    })
    .filter(Boolean)
  return lines
    .join('\n')
    .replace(/[*_`]+/g, '')
    .replace(/\s*:\s*(?=\n|$)/g, '.')
    .replace(/([^.!?।,\n])\n/g, '$1.\n')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\.(\s*\.)+/g, '.')
    .trim()
}

/** Hindi voice for Devanagari text, else the chosen language. */
export function speechLang(text: string, fallback: string): string {
  return /[ऀ-ॿ]/.test(text) ? 'hi-IN' : fallback
}

export function useSpeech() {
  const synthOk = typeof window !== 'undefined' && 'speechSynthesis' in window
  const recognitionOk = recognitionCtor() !== null
  const [speakingId, setSpeakingId] = useState<number | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<RecognitionLike | null>(null)
  const speakToken = useRef(0)

  const stopSpeaking = useCallback(() => {
    speakToken.current += 1
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeakingId(null)
  }, [])

  /** Reads the text aloud, one sentence at a time (Chrome cuts a long utterance off after about 15 s). */
  const speak = useCallback(
    (text: string, id: number, lang: string) =>
      new Promise<void>((resolve) => {
        if (!synthOk) return resolve()
        window.speechSynthesis.cancel()
        const token = ++speakToken.current
        const clean = speechText(text)
        const voiceLang = speechLang(clean, lang)
        const pieces = (clean.match(/[^.!?।]+[.!?।]*/g) ?? []).map((s) => s.trim()).filter(Boolean)
        const voices = window.speechSynthesis.getVoices()
        const voice = voices.find((v) => v.lang === voiceLang) ?? voices.find((v) => v.lang.startsWith(voiceLang.slice(0, 2)))
        setSpeakingId(id)
        let i = 0
        const next = () => {
          if (token !== speakToken.current) return resolve()
          if (i >= pieces.length) {
            setSpeakingId(null)
            return resolve()
          }
          const u = new SpeechSynthesisUtterance(pieces[i++]!)
          u.lang = voiceLang
          if (voice) u.voice = voice
          u.onend = next
          u.onerror = next
          window.speechSynthesis.speak(u)
        }
        next()
      }),
    [synthOk],
  )

  const stopListening = useCallback(() => {
    recRef.current?.stop()
  }, [])

  /** One question by voice: listens until a pause, passes the words on as they come, resolves with what was said. */
  const listenOnce = useCallback(
    (lang: string, onWords: (text: string) => void) =>
      new Promise<string>((resolve) => {
        const Ctor = recognitionCtor()
        if (!Ctor) {
          setError('Voice is not supported in this browser. Try Chrome or Edge.')
          return resolve('')
        }
        recRef.current?.abort()
        let finalText = ''
        try {
          const r = new Ctor()
          r.continuous = false
          r.interimResults = true
          r.lang = lang
          r.onresult = (event) => {
            let interim = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const piece = event.results[i]![0]!.transcript
              if (event.results[i]!.isFinal) finalText += piece
              else interim += piece
            }
            onWords(`${finalText}${interim}`.replace(/\s+/g, ' ').trim())
          }
          r.onerror = (event) => {
            if (event.error === 'aborted' || event.error === 'no-speech') return
            setError(event.error === 'not-allowed' ? 'Microphone Permission Denied.' : `Voice Error: ${event.error}`)
          }
          r.onend = () => {
            recRef.current = null
            setListening(false)
            resolve(finalText.replace(/\s+/g, ' ').trim())
          }
          recRef.current = r
          setError(null)
          setListening(true)
          r.start()
        } catch {
          setListening(false)
          setError('Could Not Start the Microphone.')
          resolve('')
        }
      }),
    [],
  )

  useEffect(
    () => () => {
      recRef.current?.abort()
      speakToken.current += 1
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  return { synthOk, recognitionOk, speakingId, listening, error, clearError: () => setError(null), speak, stopSpeaking, listenOnce, stopListening }
}
