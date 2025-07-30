import { PrismaClient } from '@prisma/client';
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from '@pinecone-database/pinecone';

const prisma = new PrismaClient();
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_KEY! });
const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_KEY! });

export const storeMemory = async (userId: string, text: string, metadata: any) => {
  try {
    const index = pinecone.index('assistant-memory');
    const embedding = await embeddings.embedQuery(text);

    await index.upsert([{
      id: crypto.randomUUID(),
      values: embedding,
      metadata: {
        userId,
        text,
        ...metadata,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (error) {
    console.error('Error storing memory:', error);
    throw new Error('Failed to store memory');
  }
};

export const searchMemory = async (userId: string, query: string, k = 3) => {
  try {
    const index = pinecone.index('assistant-memory');
    const embedding = await embeddings.embedQuery(query);

    return await index.query({
      vector: embedding,
      filter: { userId },
      topK: k,
      includeMetadata: true
    });
  } catch (error) {
    console.error('Error searching memory:', error);
    throw new Error('Failed to search memory');
  }
};