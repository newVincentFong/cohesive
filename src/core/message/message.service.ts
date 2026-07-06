import type { CreateMessageInput, Message } from "./message.types";
import { invoke } from "@/core/platform/tauri";

export async function createMessage(input: CreateMessageInput): Promise<Message> {
  return invoke<Message>("message_create", { input });
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  return invoke<Message[]>("message_list", { sessionId });
}

export async function listConversationPath(
  sessionId: string,
  leafMessageId?: string,
): Promise<Message[]> {
  return invoke<Message[]>("message_list_path", {
    sessionId,
    leafMessageId: leafMessageId ?? null,
  });
}

export async function listMessageChildren(parentMessageId: string): Promise<Message[]> {
  return invoke<Message[]>("message_list_children", { parentMessageId });
}

export function getParentForNextMessage(path: Message[]): string | null {
  return path.length > 0 ? path[path.length - 1].id : null;
}
