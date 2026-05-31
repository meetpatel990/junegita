export type Language = 'English' | 'Hindi' | 'Gujarati'

export const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'English', label: 'ENG', short: 'English' },
  { code: 'Hindi', label: 'HIN', short: 'हिंदी' },
  { code: 'Gujarati', label: 'GUJ', short: 'ગુજરાતી' },
]

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  English: {
    'app-title': 'GitaVanni',
    'app-subtitle': 'Bhagavad Gita AI Voice Assistant',
    'new-conversation': 'New Conversation',
    'clear-chat': 'Clear Chat',
    'history': 'History',
    'no-conversations': 'No conversations yet',
    'ask-placeholder': 'Ask Krishna about duty, wisdom, action...',
    'send': 'Send',
    'stop-voice': 'Stop Voice',
    'speak-button': 'Speak to Krishna',
    'listening': 'Listening...',
    'voice-error': 'Voice Error',
    'connection-error': 'Connection Error',
    'ask-guidance': 'Speak your question or type above. Krishna will respond with Bhagavad Gita wisdom.',
    'arjun': 'Arjun',
    'krishna': 'Krishna',
    'thinking': 'Krishna is thinking...',
    'messages': 'messages',
  },
  Hindi: {
    'app-title': 'गीतावनी',
    'app-subtitle': 'भगवद गीता एआई वॉयस असिस्टेंट',
    'new-conversation': 'नई बातचीत',
    'clear-chat': 'चैट साफ करें',
    'history': 'इतिहास',
    'no-conversations': 'अभी कोई बातचीत नहीं',
    'ask-placeholder': 'कृष्ण से कर्तव्य, ज्ञान, कर्म के बारे में पूछें...',
    'send': 'भेजें',
    'stop-voice': 'वॉयस बंद करें',
    'speak-button': 'कृष्ण से बोलें',
    'listening': 'सुन रहे हैं...',
    'voice-error': 'वॉयस त्रुटि',
    'connection-error': 'कनेक्शन त्रुटि',
    'ask-guidance': 'अपना प्रश्न बोलें या ऊपर टाइप करें। कृष्ण भगवद गीता के ज्ञान के साथ जवाब देंगे।',
    'arjun': 'अर्जुन',
    'krishna': 'कृष्ण',
    'thinking': 'कृष्ण सोच रहे हैं...',
    'messages': 'संदेश',
  },
  Gujarati: {
    'app-title': 'ગીતાવાણી',
    'app-subtitle': 'ભગવદ ગીતા AI વૉయસ સહાયક',
    'new-conversation': 'નવી વાતચીત',
    'clear-chat': 'ચેટ સાફ કરો',
    'history': 'ઈતિહાસ',
    'no-conversations': 'હજુ કોઈ વાતચીત નથી',
    'ask-placeholder': 'કૃષ્ણને કર্તવ્ય, જ્ઞાન, કર્ મ વિશે પૂછો...',
    'send': 'મોકલો',
    'stop-voice': 'વૉયસ બંધ કરો',
    'speak-button': 'કૃષ્ણ સાથે બોલો',
    'listening': 'સાંભળી રહ્યા છીએ...',
    'voice-error': 'વૉયસ ભૂલ',
    'connection-error': 'કનેક્શન ભૂલ',
    'ask-guidance': 'તમારો પ્રશ્ન બોલો અથવા ઉપર ટાઈપ કરો. કૃષ્ણ ભગવદ ગીતા જ્ઞાન સાથે જવાબ આપશે.',
    'arjun': 'અર્જુન',
    'krishna': 'કૃષ્ણ',
    'thinking': 'કૃષ્ણ વિચાર કરી રહ્યા છે...',
    'messages': 'સંદેશ',
  },
}

export function t(lang: Language, key: string): string {
  return TRANSLATIONS[lang]?.[key] || key
}
