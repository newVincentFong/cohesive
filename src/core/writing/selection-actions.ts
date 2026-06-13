export type { SelectionActionKind, SelectionActionRequest, SelectionActionResult } from "./writing.types";

export const SELECTION_ACTIONS = [
  "translateSelection",
  "adjustTone",
  "rewriteSelection",
  "continueWriting",
] as const;
