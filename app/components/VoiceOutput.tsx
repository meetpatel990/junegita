'use client'

import { useState, useEffect, useRef } from 'react'
import { speakText, stopSpeaking } from '@/lib/voice-utils'

interface VoiceOutputProps {
  text: string
  autoPlay?: boolean
  onPlayEnd?: () => void
}

export default function VoiceOutput({ text, autoPlay = true, onPlayEnd }: VoiceOutputProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (autoPlay && text && !isPlaying) {
      handlePlay()
    }
  }, [text, autoPlay])

  const handlePlay = () => {
    setIsPlaying(true)
    const utterance = speakText(
      text,
      { rate: playbackSpeed },
      () => {
        setIsPlaying(false)
        onPlayEnd?.()
      }
    )
    utteranceRef.current = utterance
  }

  const handlePause = () => {
    stopSpeaking()
    setIsPlaying(false)
  }

  const handleSpeedChange = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed)
    if (isPlaying) {
      // Restart with new speed
      handlePause()
      setTimeout(() => handlePlay(), 300)
    }
  }

  if (!text) return null

  return (
    <div className="flex flex-col gap-3 p-4 bg-secondary-dark rounded-lg border border-accent-gold border-opacity-30">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          {isPlaying ? (
            <button
              onClick={handlePause}
              className="p-2 hover:bg-accent-gold hover:bg-opacity-20 rounded-lg transition"
              title="Pause audio"
            >
              <svg className="w-5 h-5 text-accent-gold" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.75 1.5A.75.75 0 005 2.25v15.5a.75.75 0 001.5 0V2.25A.75.75 0 005.75 1.5zm8.5 0a.75.75 0 00-.75.75v15.5a.75.75 0 001.5 0V2.25a.75.75 0 00-.75-.75z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="p-2 hover:bg-accent-gold hover:bg-opacity-20 rounded-lg transition"
              title="Play audio"
            >
              <svg className="w-5 h-5 text-accent-gold" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </button>
          )}
          <span className="text-sm text-accent-gold">Krishna speaks:</span>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="speed" className="text-xs text-gray-400">
            Speed:
          </label>
          <select
            id="speed"
            value={playbackSpeed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            className="bg-secondary-dark text-sm px-2 py-1 rounded border border-accent-gold border-opacity-30 cursor-pointer text-foreground"
          >
            <option value={0.8}>0.8x</option>
            <option value={1}>1x</option>
            <option value={1.2}>1.2x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </div>
      </div>

      {isPlaying && (
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-accent-gold rounded-full pulse-soft"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
