export type Domain = "code" | "writing" | "mind";
export type CodeMode = "plan" | "explore" | "build";
export type SessionStatus = "active" | "archived" | "deleted";

export interface Session {
  id: string;
  domain: Domain;
  title: string;
  status: SessionStatus;
  mode?: CodeMode;
  projectId?: string;
  documentId?: string;
  memoryScopeId: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  summary?: string;
}

export interface CreateSessionInput {
  domain: Domain;
  title?: string;
  mode?: CodeMode;
  projectId?: string;
  documentId?: string;
}

export interface UpdateSessionInput {
  title?: string;
  status?: SessionStatus;
  mode?: CodeMode;
  projectId?: string;
  documentId?: string;
  summary?: string;
}

export const SESSION_TITLE_MAX_LENGTH = 32;

export function deriveSessionTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled session";
  if (trimmed.length <= SESSION_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SESSION_TITLE_MAX_LENGTH)}…`;
}

export function memoryScopeForDomain(domain: Domain): string {
  return `memory:${domain}`;
}
