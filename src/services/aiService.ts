import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { Groq } from 'groq-sdk';

const prisma = new PrismaClient();

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });
const groq = new Groq({ apiKey: process.env.GROQ_KEY! });

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const generateAIResponse = async (messages: AIMessage[], sessionId: string): Promise<string> => {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { timestamp: 'asc' }, take: 20 } }
    });

    const messageHistory: AIMessage[] = session?.messages.map(m => ({
      role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content
    })) || [];

    const allMessages: AIMessage[] = [
      {
        role: 'system',
        content: `You're an AI productivity assistant. Current time: ${new Date().toISOString()}`
      },
      ...messageHistory,
      ...messages.filter(m => m.role !== 'system')
    ];

    const provider = process.env.LLM_PROVIDER === 'groq' ? groq : openai;
    
    const response = await provider.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4-turbo',
      messages: allMessages,
      temperature: 0.7
    });

    const aiResponse = response.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response received from AI provider');
    }

    return aiResponse;
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw new Error('Failed to generate AI response');
  }
}