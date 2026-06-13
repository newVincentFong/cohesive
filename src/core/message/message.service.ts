import type { CreateMessageInput, Message } from "./message.types";
import { invoke } from "@/core/platform/tauri";

export async function createMessage(input: CreateMessageInput): Promise<Message> {
  return invoke<Message>("message_create", { input });
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  return invoke<Message[]>("message_list", { sessionId });
}
