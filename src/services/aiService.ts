import OpenAI from 'openai';
import { Groq } from 'groq-sdk';
import { prisma } from '../utils/prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });
const groq = new Groq({ apiKey: process.env.GROQ_KEY! });

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const generateAIResponse = async (messages: AIMessage[], sessionId: string): Promise<string> => {
  try {
    const systemPrompt = `You are a helpful AI assistant that can perform actions for users.
      When you need to perform an action, use this format:
      [ACTION:type]{"key": "value"}[/ACTION]

      Available actions:
      - slack: [ACTION:slack]{"channel": "#general", "message": "Hello!"}[/ACTION]
      - gmail: [ACTION:gmail]{"to": "user@example.com", "subject": "Subject", "body": "Message body"}[/ACTION]
      - task: [ACTION:task]{"title": "Task name", "description": "Task description", "priority": "high"}[/ACTION]
      - reminder: [ACTION:reminder]{"message": "Reminder text", "reminderTime": "2024-01-01T10:00:00Z"}[/ACTION]
      - calendar: [ACTION:calendar]{"title": "Meeting", "startTime": "2024-01-01T10:00:00Z", "endTime": "2024-01-01T11:00:00Z"}[/ACTION]
      Always provide helpful responses and execute actions when requested.`;

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
        content: systemPrompt
      },
      ...messageHistory,
      ...messages.filter(m => m.role !== 'system')
    ];

    let response;
    let aiResponse;

    if (process.env.LLM_PROVIDER === 'groq') {
      response = await groq.chat.completions.create({
        model: process.env.LLM_MODEL || 'gpt-4-turbo',
        messages: allMessages,
        temperature: 0.7
      });

      aiResponse = response.choices[0]?.message?.content;
    } else {
      response = await openai.responses.create({
        model: process.env.LLM_MODEL || 'gpt-4-turbo',
        input: allMessages,
        temperature: 0.7
      });

      aiResponse = response.output_text;
    }
    
    if (!aiResponse) {
      throw new Error('No response received from AI provider');
    }

    return aiResponse;
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw new Error('Failed to generate AI response');
  }
}