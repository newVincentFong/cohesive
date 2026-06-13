import type { Domain } from "../session/session.types";

export type MemoryLayer =
  | "session_context"
  | "episodic"
  | "semantic"
  | "artifact"
  | "reflection";

export interface MemoryItem {
  id: string;
  domain: Domain;
  layer: MemoryLayer;
  sessionId?: string;
  content: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryScope {
  domain: Domain;
  sessionId?: string;
  layer?: MemoryLayer;
}

export interface AddMemoryInput {
  domain: Domain;
  layer: MemoryLayer;
  content: string;
  sessionId?: string;
  metadata?: Record<string, string>;
}

export interface UpdateMemoryInput {
  content?: string;
  metadata?: Record<string, string>;
  layer?: MemoryLayer;
}

export interface MemoryQuery {
  domain: Domain;
  query: string;
  sessionId?: string;
  layer?: MemoryLayer;
  limit?: number;
}

export interface MemoryStore {
  add(input: AddMemoryInput): Promise<MemoryItem>;
  search(query: MemoryQuery): Promise<MemoryItem[]>;
  list(scope: MemoryScope): Promise<MemoryItem[]>;
  update(id: string, patch: UpdateMemoryInput): Promise<MemoryItem>;
  delete(id: string): Promise<void>;
}
