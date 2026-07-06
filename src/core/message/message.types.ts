export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  id: string;
  sessionId: string;
  parentMessageId?: string | null;
  agentRunId?: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolPayload?: string;
  createdAt: string;
}

export interface CreateMessageInput {
  sessionId: string;
  parentMessageId?: string | null;
  agentRunId?: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolPayload?: string;
}
