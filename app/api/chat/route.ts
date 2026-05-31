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

    // Call the external Python backend
    console.log('[v0] Calling external API with message:', lastMessage.content)
    const externalResponse = await fetch('https://bhagwatgita-2026.onrender.com/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lastMessage.content }),
    })

    if (!externalResponse.ok) {
      const errorText = await externalResponse.text()
      console.error('[v0] External API error:', externalResponse.status, errorText)
      
      // Fall back to local knowledge base if external API fails
      console.log('[v0] Falling back to local knowledge base')
      return new Response(
        JSON.stringify({
          response: `I'm experiencing connection issues with the main server. Please try again in a moment. [Error: ${externalResponse.status}]`,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const externalData = await externalResponse.json()
    console.log('[v0] External API response:', externalData)
    
    // Handle various response formats from the backend
    let response = externalData.response || externalData.message || externalData.answer || externalData.reply
    
    if (!response) {
      response = JSON.stringify(externalData)
    }

    return new Response(JSON.stringify({ response }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[v0] API Error:', error)
    return new Response(
      JSON.stringify({
        response: 'I apologize for the difficulty. Please try your question again.',
        error: 'Failed to generate response',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
