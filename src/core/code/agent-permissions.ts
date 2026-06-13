import type { CodeMode } from "../session/session.types";
import type { AgentPermissionMatrix } from "./agent.types";
import { permissionsForMode } from "./agent.types";

export function getAgentPermissions(mode: CodeMode): AgentPermissionMatrix {
  return permissionsForMode(mode);
}

export function canExecuteShell(mode: CodeMode): boolean {
  return permissionsForMode(mode).canRunShell;
}

export function canMutateProject(mode: CodeMode): boolean {
  const permissions = permissionsForMode(mode);
  return permissions.canWriteFiles && permissions.canRunMutatingShell;
}
