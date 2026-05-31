// Voice utilities for speech recognition and text-to-speech

declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}

export interface VoiceOptions {
  rate?: number
  pitch?: number
  volume?: number
}

export const startVoiceRecognition = (
  onResult: (transcript: string) => void,
  onError: (error: string) => void
): any => {
  const SpeechRecognition = window.webkitSpeechRecognition || (window as any).SpeechRecognition

  if (!SpeechRecognition) {
    onError('Speech Recognition not supported in this browser')
    return null
  }

  const recognition = new SpeechRecognition()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'en-US'

  recognition.onstart = () => {
    console.log('[v0] Voice recognition started')
  }

  recognition.onresult = (event: any) => {
    let transcript = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript
    }
    onResult(transcript)
  }

  recognition.onerror = (event: any) => {
    console.error('[v0] Speech recognition error:', event.error)
    onError(`Voice error: ${event.error}`)
  }

  recognition.start()
  return recognition
}

export const stopVoiceRecognition = (recognition: any) => {
  if (recognition) {
    recognition.stop()
  }
}

export const speakText = (
  text: string,
  options: VoiceOptions = {},
  onEnd?: () => void
): SpeechSynthesisUtterance | null => {
  const synth = window.speechSynthesis

  if (!synth) {
    console.error('[v0] Speech Synthesis not supported')
    return null
  }

  // Cancel any ongoing speech
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = options.rate || 0.95
  utterance.pitch = options.pitch || 1
  utterance.volume = options.volume || 1

  if (onEnd) {
    utterance.onend = onEnd
  }

  synth.speak(utterance)
  return utterance
}

export const stopSpeaking = () => {
  const synth = window.speechSynthesis
  if (synth && synth.speaking) {
    synth.cancel()
  }
}

export const isSpeaking = (): boolean => {
  return window.speechSynthesis?.speaking || false
}
