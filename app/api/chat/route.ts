import { generateKrishnaResponse } from '@/lib/gita-knowledge-base'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Generate Krishna's response from the Gita knowledge base
    const response = generateKrishnaResponse(lastMessage.content)

    return new Response(JSON.stringify({ response }), {
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
