export interface UserData {
  name: string;
  email: string;
  password: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export interface SignInUserData {
  email: string;
  password: string;
}

export interface PasswordData {
  email: string;
  password: string;
}

export interface DecodedToken {
  userId: string;
  iat: number;
  exp: number;
}

export interface ChatMessage {
  id?: string;
  sessionId: string;
  sender: 'user' | 'assistant';
  content: string;
  metadata?: any;
  timestamp?: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  chatHandle: string;
  messages: ChatMessage[];
  userId: string;
  isPinned?: boolean;
  summary?: string;
}