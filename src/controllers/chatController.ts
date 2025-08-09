import { Context } from 'hono'
import { prisma } from '../utils/prisma';
import { searchMemory, storeMemory } from '../services/memoryService'
import { executeAction } from '../services/actionService';
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

    const userMessage = await prisma.chatMessage.create({
      data: {
        content,
        sender: 'user',
        sessionId
      }
    })

    const { assistantMessage, executedActions } = await processMessageFlow(
      user.id,
      content,
      sessionId
    )

    return c.json({ userMessage, assistantMessage, executedActions: executedActions || [] }, 201)
  } catch (error) {
    console.error('Error sending message:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

const processMessageFlow = async ( userId: string, content: string, sessionId: string ): Promise<{ assistantMessage: any; executedActions?: any[] }> => {
  try {
    const aiResponse = await generateInitialAIResponse(userId, content, sessionId);
    const detectedActions = await detectActionsInResponse(aiResponse);

    let executedActions: any[] = []
    let finalResponse = aiResponse

    if (detectedActions.length > 0) {
      const actionResults = await executeDetectedActions(detectedActions, userId)
      executedActions = actionResults.executedActions

      finalResponse = await incorporateActionResults(aiResponse, actionResults)
    }

    const assistantMessage = await saveAssistantMessage(
      userId, 
      finalResponse, 
      sessionId, 
      executedActions
    )
    
    return { assistantMessage, executedActions }
  } catch (error) {
    console.error('Error in message flow:', error)
    throw error
  }
}

const generateInitialAIResponse = async (
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

  return aiResponse;
}

const detectActionsInResponse = async (aiResponse: string): Promise<any> => {
  const actionPatterns = [
    /create.*(?:meeting|appointment|event)/i,
    /send.*(?:email|message)/i,
    /schedule.*(?:call|meeting)/i,
    /add.*(?:task|reminder|note)/i,
    /search.*(?:calendar|contacts|files)/i,
    /update.*(?:status|profile)/i
  ]

  const detectedActions = [];

  for (const pattern of actionPatterns) {
    if (pattern.test(aiResponse)) {
      detectedActions.push({
        type: 'detected',
        pattern: pattern.source,
        content: aiResponse,
        confidence: 0.8
      })
    }
  }
}

const executeDetectedActions = async (
  detectedActions: any[],
  userId: string
): Promise<{ executedActions: any[]; results: any[] }> => {
  const executedActions = []
  const results = []

  for (const action of detectedActions) {
    try {
      const actionResult = await executeAction(action.content, userId)
      
      executedActions.push({
        ...action,
        status: 'executed',
        timestamp: new Date().toISOString()
      })
      
      results.push(actionResult)
    } catch (error) {
      console.error('Error executing action:', error)
      executedActions.push({
        ...action,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })
    }
  }

  return { executedActions, results }
}

const incorporateActionResults = async (
  originalResponse: string,
  actionResults: { executedActions: any[]; results: any[] }
): Promise<string> => {
  const successfulActions = actionResults.executedActions.filter(a => a.status === 'executed')
  
  if (successfulActions.length > 0) {
    const actionSummary = successfulActions.map(action => 
      `✓ Action completed: ${action.type}`
    ).join('\n')
    
    return `${originalResponse}\n\n${actionSummary}`
  }
  
  return originalResponse
}

const saveAssistantMessage = async (
  userId: string,
  finalResponse: string,
  sessionId: string,
  executedActions: any[]
): Promise<any> => {
  const memories = await searchMemory(userId, finalResponse)
  
  const serializedMetadata = {
    memories: memories.matches ? memories.matches.map((match) => ({
      id: match.id,
      score: match.score ?? 0,
      metadata: match.metadata
    })) : [],
    executedActions: executedActions || []
  }

  const [assistantMessage] = await Promise.all([
    prisma.chatMessage.create({
      data: {
        content: finalResponse,
        sender: 'assistant',
        sessionId,
        metadata: serializedMetadata
      }
    }),

    shouldStoreMemory(finalResponse) 
      ? storeMemory(userId, finalResponse, { sessionId })
      : Promise.resolve()
  ])

  return assistantMessage
}

function shouldStoreMemory(text: string): boolean {
  const importantKeywords = ['meeting', 'reminder', 'important', 'note', 'action item']
  return importantKeywords.some(keyword => text.toLowerCase().includes(keyword))
}