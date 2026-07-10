import type { CodeMode, Domain } from "@/core/session/session.types";

/** Domains exposed in the product UI. Core code for others is retained. */
export const ENABLED_DOMAINS: Domain[] = ["code"];

/** Code composer modes exposed in the product UI. */
export const ENABLED_CODE_MODES: CodeMode[] = ["explore", "build"];

export const DEFAULT_DOMAIN: Domain = "code";
export const DEFAULT_CODE_MODE: CodeMode = "explore";

export function isDomainEnabled(domain: Domain): boolean {
  return ENABLED_DOMAINS.includes(domain);
}

export function isCodeModeEnabled(mode: CodeMode): boolean {
  return ENABLED_CODE_MODES.includes(mode);
}

export function resolveCodeMode(mode: CodeMode | null | undefined): CodeMode {
  if (mode && isCodeModeEnabled(mode)) {
    return mode;
  }
  return DEFAULT_CODE_MODE;
}
