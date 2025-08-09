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
        score: match.score ?? 0, // Handle undefined score by defaulting to 0
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