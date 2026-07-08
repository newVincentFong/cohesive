import type { CodeMode } from "@/core/session/session.types";

export function messageRoleLabel(role: string): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Cohesive";
    default:
      return role;
  }
}

export function formatCodeModeLabel(mode: CodeMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export const codeModeHints: Record<CodeMode, string> = {
  plan: "Plan: discuss without running the agent",
  explore: "Explore: let the agent read and search your codebase",
  build: "Build: let the agent edit files and run commands",
};
