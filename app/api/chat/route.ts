import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { KRISHNA_SYSTEM_PROMPT } from '@/lib/krishna-prompt'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Transform messages to AI SDK format
    const formattedMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }))

    // Generate response with Krishna system prompt
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: KRISHNA_SYSTEM_PROMPT,
      messages: formattedMessages,
      temperature: 0.7,
      maxTokens: 1024,
    })

    return new Response(JSON.stringify({ response: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[v0] API Error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to generate response',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
