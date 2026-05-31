'use client'

import { useState, useRef, useEffect } from 'react'
import VoiceInput from './VoiceInput'
import { Message, INITIAL_MESSAGE } from '@/lib/krishna-prompt'
import { speakText, stopSpeaking } from '@/lib/voice-utils'
import { Language, LANGUAGES, t } from '@/lib/translations'

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

export default function ChatInterface() {
  const [language, setLanguage] = useState<Language>('English')
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Initialize with first chat session
  useEffect(() => {
    const firstChatId = 'chat-' + Date.now()
    const initialChat: ChatSession = {
      id: firstChatId,
      title: 'New Conversation',
      messages: [
        {
          role: 'assistant',
          content: INITIAL_MESSAGE,
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
    }
    setChatSessions([initialChat])
    setCurrentChatId(firstChatId)
  }, [])

  const currentChat = chatSessions.find((c) => c.id === currentChatId)
  const messages = currentChat?.messages || []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const createNewChat = () => {
    const newChatId = 'chat-' + Date.now()
    const newChat: ChatSession = {
      id: newChatId,
      title: 'New Conversation',
      messages: [
        {
          role: 'assistant',
          content: INITIAL_MESSAGE,
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
    }
    setChatSessions((prev) => [newChat, ...prev])
    setCurrentChatId(newChatId)
    setInputValue('')
    setError(null)
    setVoiceError(null)
  }

  const playKrishnaResponse = (text: string) => {
    setIsSpeaking(true)
    const utterance = speakText(text, {}, () => {
      setIsSpeaking(false)
    })
    currentUtteranceRef.current = utterance || null
  }

  const stopKrishnaVoice = () => {
    stopSpeaking()
    setIsSpeaking(false)
  }

  const handleUserMessage = async (userText: string) => {
    if (!userText.trim() || !currentChat) return

    console.log('[v0] User message:', userText)
    stopKrishnaVoice()

    const newUserMessage: Message = {
      role: 'user',
      content: userText,
      timestamp: new Date(),
    }

    // Update current chat with new user message
    const updatedChat = { ...currentChat, messages: [...currentChat.messages, newUserMessage] }
    setChatSessions((prev) =>
      prev.map((c) => (c.id === currentChatId ? updatedChat : c))
    )

    // Update title based on first user message if needed
    if (currentChat.messages.length === 1) {
      const newTitle = userText.length > 30 ? userText.substring(0, 30) + '...' : userText
      setChatSessions((prev) =>
        prev.map((c) => (c.id === currentChatId ? { ...c, title: newTitle } : c))
      )
    }

    setInputValue('')
    setError(null)
    setVoiceError(null)
    setIsLoading(true)

    try {
      // Call the chat API with language
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedChat.messages, language }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const data = await response.json()
      const assistantResponse = data.response

      console.log('[v0] Krishna response:', assistantResponse)

      const newAssistantMessage: Message = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date(),
      }

      // Update chat with assistant response
      setChatSessions((prev) =>
        prev.map((c) =>
          c.id === currentChatId
            ? { ...c, messages: [...c.messages, newAssistantMessage] }
            : c
        )
      )

      // Play Krishna's voice response
      playKrishnaResponse(assistantResponse)
    } catch (err) {
      console.error('[v0] Error getting response:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-white text-slate-800">
      {/* SIDEBAR */}
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-saffron-200 to-saffron-300 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-saffron-700">ॐ</span>
            </div>
            <div>
              <h1 className="font-bold text-saffron-600 text-base">{t(language, 'app-title')}</h1>
              <p className="text-slate-500 text-xs">3.0</p>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          onClick={createNewChat}
          className="m-3 px-4 py-2 bg-saffron-500 hover:bg-saffron-600 text-white rounded-lg text-sm font-semibold transition flex items-center gap-2"
        >
          <span>+</span> {t(language, 'new-conversation')}
        </button>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-2">
          <div className="text-xs font-semibold text-slate-600 px-3 py-2 uppercase tracking-wider">
            {t(language, 'history')}
          </div>
          {chatSessions.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-8">{t(language, 'no-conversations')}</div>
          ) : (
            <div className="space-y-1">
              {chatSessions.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  className={`group p-3 rounded-lg cursor-pointer transition ${
                    currentChatId === chat.id
                      ? 'bg-gradient-to-r from-saffron-100 to-saffron-200 border border-saffron-300'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <p className={`text-sm truncate ${currentChatId === chat.id ? 'text-saffron-700 font-semibold' : 'text-slate-700'}`}>
                    {chat.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {chat.messages.length} {t(language, 'messages')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 text-xs text-slate-600">
          <p className="italic leading-relaxed">
            "Yoga is the journey of the self, through the self, to the self." - Bhagavad Gita
          </p>
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-saffron-600">{t(language, 'app-title')}</h2>
              <p className="text-slate-500 text-sm">{t(language, 'app-subtitle')}</p>
            </div>
            <div className="flex items-center gap-4">
              <select
                id="langSelect"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="lang-select"
                title="Change response language"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <button
                onClick={createNewChat}
                className="px-4 py-2 bg-saffron-500 hover:bg-saffron-600 text-white rounded-lg text-sm font-semibold transition"
              >
                {t(language, 'clear-chat')}
              </button>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-8 py-8 bg-white">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
              >
                <div
                  className={`flex gap-4 max-w-2xl ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-saffron-300 to-saffron-500'
                        : 'bg-gradient-to-br from-saffron-100 to-saffron-200'
                    }`}
                  >
                    <span className="text-sm font-bold">
                      {msg.role === 'user' ? '🧑' : '🙏'}
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div className={msg.role === 'user' ? 'text-right' : ''}>
                    <p
                      className={`text-xs font-semibold mb-2 ${
                        msg.role === 'user' ? 'text-saffron-600' : 'text-saffron-700'
                      }`}
                    >
                      {msg.role === 'user' ? t(language, 'arjun') : t(language, 'krishna')}
                    </p>
                    <div
                      className={`px-5 py-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-saffron-500 text-white rounded-br-none'
                          : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {msg.timestamp?.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start animate-fadeIn">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron-100 to-saffron-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🙏</span>
                  </div>
                  <div className="px-5 py-3 rounded-lg bg-slate-100 border border-slate-200 rounded-bl-none">
                    <p className="text-xs font-semibold text-saffron-700 mb-3">
                      {t(language, 'thinking')}
                    </p>
                    <div className="flex gap-2">
                      {[...Array(3)].map((_, i) => (
                        <div
                          key={i}
                          className="w-2 h-2 bg-saffron-500 rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="px-6 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  ⚠️ {error}
                </div>
              </div>
            )}

            {voiceError && (
              <div className="flex justify-center">
                <div className="px-6 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                  🔊 {voiceError}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-slate-200 px-8 py-6">
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            {/* Text Input */}
            <div className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isLoading) {
                    handleUserMessage(inputValue)
                  }
                }}
                placeholder={t(language, 'ask-placeholder')}
                disabled={isLoading}
                className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-500 focus:outline-none focus:border-saffron-400 focus:ring-1 focus:ring-saffron-200 transition"
              />
              <button
                onClick={() => handleUserMessage(inputValue)}
                disabled={isLoading || !inputValue.trim()}
                className="px-6 py-3 bg-saffron-500 hover:bg-saffron-600 disabled:bg-slate-300 text-white font-semibold rounded-lg transition"
              >
                {t(language, 'send')}
              </button>
              {isSpeaking && (
                <button
                  onClick={stopKrishnaVoice}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition"
                >
                  {t(language, 'stop-voice')}
                </button>
              )}
            </div>

            {/* Voice Input */}
            <div className="flex flex-col gap-3">
              <VoiceInput 
                onTranscript={handleUserMessage} 
                disabled={isLoading}
                language={language}
              />
              <p className="text-xs text-slate-500 text-center">
                {t(language, 'ask-guidance')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
