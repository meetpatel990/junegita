'use client'

import { useState, useRef } from 'react'
import { startVoiceRecognition, stopVoiceRecognition, requestMicrophonePermission } from '@/lib/voice-utils'
import { Language, t } from '@/lib/translations'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  language?: Language
}

export default function VoiceInput({ onTranscript, disabled = false, language = 'English' }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  const handleStartListening = async () => {
    setError(null)
    
    // Request microphone permission first
    const hasPermission = await requestMicrophonePermission()
    if (!hasPermission) {
      setError('Please allow microphone access in your browser settings and try again.')
      return
    }
    
    setIsListening(true)

    const recognition = startVoiceRecognition(
      (transcript) => {
        console.log('[v0] Transcript received:', transcript)
        onTranscript(transcript)
        setIsListening(false)
      },
      (error) => {
        console.error('[v0] Voice error:', error)
        setError(error)
        setIsListening(false)
      }
    )

    recognitionRef.current = recognition
  }

  const handleStopListening = () => {
    if (recognitionRef.current) {
      stopVoiceRecognition(recognitionRef.current)
    }
    setIsListening(false)
  }

  return (
    <div className="flex flex-col gap-3 items-center">
      <button
        onClick={isListening ? handleStopListening : handleStartListening}
        disabled={disabled}
        className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center gap-2 ${
          isListening
            ? 'bg-red-500 hover:bg-red-600 text-white pulse-soft'
            : 'bg-saffron-500 hover:bg-saffron-600 text-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 16a1 1 0 11-2 0 5 5 0 10-10 0 1 1 0 01-2 0 7.001 7.001 0 016-10.93V4a1 1 0 012 0v10.93z" />
        </svg>
        {isListening ? t(language, 'listening') : t(language, 'speak-button')}
      </button>

      {error && (
        <div className="text-red-700 text-sm bg-red-50 px-4 py-2 rounded border border-red-200">
          {error}
        </div>
      )}
    </div>
  )
}
