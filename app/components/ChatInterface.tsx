'use client'

import { useState, useRef, useEffect } from 'react'
import VoiceInput from './VoiceInput'
import VoiceOutput from './VoiceOutput'
import { Message, INITIAL_MESSAGE } from '@/lib/krishna-prompt'

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [currentResponse, setCurrentResponse] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize with Krishna's greeting on mount
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: INITIAL_MESSAGE,
        timestamp: new Date(),
      },
    ])
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, currentResponse])

  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return

    console.log('[v0] User message:', userText)

    // Add user message to history
    const newUserMessage: Message = {
      role: 'user',
      content: userText,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, newUserMessage])
    setCurrentResponse('')
    setError(null)
    setIsLoading(true)

    try {
      // Prepare messages for API
      const messagesForAPI = [...messages, newUserMessage]

      // Call the chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: messagesForAPI }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const data = await response.json()
      const assistantResponse = data.response

      console.log('[v0] Krishna response:', assistantResponse)

      // Add assistant message to history
      const newAssistantMessage: Message = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, newAssistantMessage])
      setCurrentResponse(assistantResponse)
    } catch (err) {
      console.error('[v0] Error getting response:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearHistory = () => {
    setMessages([
      {
        role: 'assistant',
        content: INITIAL_MESSAGE,
        timestamp: new Date(),
      },
    ])
    setCurrentResponse('')
    setError(null)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="bg-secondary-dark border-b border-accent-gold border-opacity-30 px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-accent-gold">Krishna-Arjun</h1>
            <p className="text-gray-400 text-sm">Bhagavad Gita Voice Assistant</p>
          </div>
          <button
            onClick={handleClearHistory}
            className="px-4 py-2 bg-accent-orange hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition"
          >
            New Conversation
          </button>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in`}
            >
              <div
                className={`max-w-xl px-6 py-4 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-accent-gold text-black rounded-br-none'
                    : 'bg-secondary-dark text-foreground border border-accent-gold border-opacity-30 rounded-bl-none'
                }`}
              >
                <p className="text-sm mb-2 font-semibold opacity-75">
                  {msg.role === 'user' ? 'Arjun' : 'Krishna'}
                </p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs mt-2 opacity-50">
                  {msg.timestamp?.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {currentResponse && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start fade-in">
              <div className="max-w-xl px-6 py-4 rounded-lg bg-secondary-dark text-foreground border border-accent-gold border-opacity-30 rounded-bl-none">
                <p className="text-sm mb-4 font-semibold opacity-75">Krishna</p>
                <VoiceOutput text={currentResponse} autoPlay={true} />
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="px-6 py-4 rounded-lg bg-secondary-dark border border-accent-gold border-opacity-30 rounded-bl-none">
                <p className="text-sm font-semibold opacity-75 mb-2">Krishna is thinking...</p>
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-accent-gold rounded-full pulse-soft"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="px-6 py-3 bg-red-900 bg-opacity-30 border border-red-500 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Voice Input Section */}
      <footer className="bg-secondary-dark border-t border-accent-gold border-opacity-30 px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          <VoiceInput onTranscript={handleUserMessage} disabled={isLoading} />
          <p className="text-xs text-gray-500 text-center">
            Click the microphone button and speak your question. Your voice will be transcribed and Krishna will respond.
          </p>
        </div>
      </footer>
    </div>
  )
}
