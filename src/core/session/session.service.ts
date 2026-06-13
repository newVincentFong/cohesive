import type {
  CreateSessionInput,
  Session,
  UpdateSessionInput,
  Domain,
} from "./session.types";
import { invoke } from "@/core/platform/tauri";

export async function createSession(input: CreateSessionInput): Promise<Session> {
  return invoke<Session>("session_create", { input });
}

export async function listSessions(domain: Domain): Promise<Session[]> {
  return invoke<Session[]>("session_list", { domain });
}

export async function getSession(id: string): Promise<Session | null> {
  return invoke<Session | null>("session_get", { id });
}

export async function updateSession(
  id: string,
  patch: UpdateSessionInput,
): Promise<Session> {
  return invoke<Session>("session_update", { id, patch });
}

export async function touchSession(id: string): Promise<Session> {
  return invoke<Session>("session_touch", { id });
}

export async function deleteSession(id: string): Promise<void> {
  await invoke("session_delete", { id });
}
