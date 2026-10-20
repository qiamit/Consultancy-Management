import { useCallback, useEffect, useRef, useState } from 'react'

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
  const w = window as Window & { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Voice typing with the browser's speech recognition: keeps listening while you talk, shows the words as they are
 * recognised and appends them to the text that was already typed. `onText` receives the whole text every time.
 */
export function useVoiceInput(onText: (text: string) => void, lang = 'en-IN') {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const baseRef = useRef('')
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(
    (currentText: string) => {
      const Ctor = recognitionCtor()
      if (!Ctor) {
        setError('Voice typing is not supported in this browser. Try Chrome or Edge.')
        return
      }
      try {
        const recognition = new Ctor()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = lang
        baseRef.current = currentText.trim() ? `${currentText.trim()} ` : ''
        recognition.onresult = (event) => {
          let interim = ''
          let finalChunk = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const piece = event.results[i]![0]!.transcript
            if (event.results[i]!.isFinal) finalChunk += piece
            else interim += piece
          }
          if (finalChunk) baseRef.current = `${baseRef.current}${finalChunk}`.replace(/\s+/g, ' ')
          onText(`${baseRef.current}${interim}`.trimStart())
        }
        recognition.onerror = (event) => {
          if (event.error === 'aborted' || event.error === 'no-speech') return
          setError(event.error === 'not-allowed' ? 'Microphone permission denied.' : `Voice error: ${event.error}`)
          setListening(false)
        }
        recognition.onend = () => {
          setListening(false)
          recognitionRef.current = null
        }
        recognitionRef.current = recognition
        recognition.start()
        setListening(true)
        setError(null)
      } catch {
        setError('Could not start voice typing.')
        setListening(false)
      }
    },
    [lang, onText],
  )

  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, listening, error, start, stop }
}
