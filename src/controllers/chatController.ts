import { Context } from 'hono'
import { prisma } from '../utils/prisma';
import { searchMemory, storeMemory } from '../services/memoryService'
import { generateAIResponse } from '../services/aiService'

export const createChatSession = async (c: Context) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { title, chatHandle } = body

    const session = await prisma.chatSession.create({
      data: {
        title: title || `New Session ${new Date().toLocaleDateString()}`,
        chatHandle,
        userId: user.id
      }
    })

    return c.json(session, 201)
  } catch (error) {
    console.error('Error creating chat:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const getChatSessions = async (c: Context) => {
  try {
    const user = c.get('user')
    const sessions = await prisma.chatSession.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    return c.json(sessions);
  } catch (error) {
    console.error('Error getting chat sessions:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const getChatMessages = async (c: Context) => {
  try {
    const sessionId = c.req.param('id')
    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId
      },
      orderBy: {
        timestamp: 'asc'
      }
    })
    return c.json(messages);
  } catch (error) {
    console.error('Error getting chat messages:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const sendMessageToSession = async (c: Context) => {
  try {
    const sessionId = c.req.param('id')
    const body = await c.req.json()
    const { content } = body
    const user = c.get('user')

    const [userMessage, assistantMessage] = await Promise.all([
      prisma.chatMessage.create({
        data: {
          content,
          sender: 'user',
          sessionId
        }
      }),

      processAIResponse(user.id, content, sessionId)
    ])

    return c.json({ userMessage, assistantMessage }, 201)
  } catch (error) {
    console.error('Error sending message:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

const processAIResponse = async (
  userId: string, 
  content: string, 
  sessionId: string
): Promise<any> => {
  const memories = await searchMemory(userId, content)
  const memoryContext = memories.matches?.map(m => m.metadata?.text).join('\n') || ''

  const messages = [
    ...(memoryContext ? [{ role: 'system' as const, content: `Relevant context:\n${memoryContext}` }] : []),
    { role: 'user' as const, content }
  ]

  const aiResponse = await generateAIResponse(messages, sessionId)

  if (!aiResponse || typeof aiResponse !== 'string') {
    throw new Error('AI response is invalid or empty')
  }

  const assistantMessage = await saveAIResponse(userId, aiResponse, sessionId, memories)
  
  return assistantMessage
}

const saveAIResponse = async (
  userId: string,
  aiResponse: string,
  sessionId: string,
  memories: any
): Promise<any> => {
  const serializedMetadata = {
    memories: memories.matches ? memories.matches.map((match: { id: string; score: number; metadata: any }) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata
    })) : []
  }

  const [assistantMessage] = await Promise.all([
    prisma.chatMessage.create({
      data: {
        content: aiResponse,
        sender: 'assistant',
        sessionId,
        metadata: serializedMetadata
      }
    }),
    shouldStoreMemory(aiResponse) 
      ? storeMemory(userId, aiResponse, { sessionId })
      : Promise.resolve()
  ])

  return assistantMessage
}

function shouldStoreMemory(text: string): boolean {
  const importantKeywords = ['meeting', 'reminder', 'important', 'note', 'action item']
  return importantKeywords.some(keyword => text.toLowerCase().includes(keyword))
}