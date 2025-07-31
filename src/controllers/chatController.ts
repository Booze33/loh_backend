import { Context } from 'hono'
import { prisma } from '../utils/prisma';
import { searchMemory, storeMemory } from '../services/memoryService'
import { generateAIResponse } from '../services/aiService'

export const createChatSession = async (c: Context) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { title } = body

    const session = await prisma.chatSession.create({
      data: {
        title: title || `New Session ${new Date().toLocaleDateString()}`,
        userId: user.id
      }
    })

    return c.json(session, 201)
  } catch (error) {
    console.error('Error creating chat:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const sendMessageToSession = async (c: Context) => {
  try {
    const sessionId = c.req.param('id')
    const body = await c.req.json()
    const { content } = body
    const user = c.get('user')

    const userMessage = await prisma.chatMessage.create({
      data: {
        content,
        sender: 'user',
        sessionId
      }
    })

    const memories = await searchMemory(user.id, content)
    const memoryContext = memories.matches?.map(m => m.metadata?.text).join('\n') || ''

    const messages = [
      ...(memoryContext ? [{ role: 'system' as const, content: `Relevant context:\n${memoryContext}` }] : []),
      { role: 'user' as const, content }
    ]

    const aiResponse = await generateAIResponse(messages, sessionId)

    if (!aiResponse || typeof aiResponse !== 'string') {
      throw new Error('AI response is invalid or empty')
    }

    const serializedMetadata = {
      memories: memories.matches ? memories.matches.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata
      })) : []
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        content: aiResponse,
        sender: 'assistant',
        sessionId,
        metadata: serializedMetadata
      }
    })

    if (shouldStoreMemory(aiResponse)) {
      await storeMemory(user.id, aiResponse, { sessionId })
    }

    return c.json({ userMessage, assistantMessage }, 201)
  } catch (error) {
    console.error('Error sending message:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

function shouldStoreMemory(text: string): boolean {
  const importantKeywords = ['meeting', 'reminder', 'important', 'note', 'action item']
  return importantKeywords.some(keyword => text.toLowerCase().includes(keyword))
}