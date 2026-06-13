export type WritingDocumentStatus = "active" | "archived" | "deleted";

export interface WritingDocument {
  id: string;
  title: string;
  filePath: string;
  status: WritingDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWritingDocumentInput {
  title: string;
  initialContent?: string;
}

export type SelectionActionKind =
  | "translateSelection"
  | "adjustTone"
  | "rewriteSelection"
  | "continueWriting";

export interface SelectionActionRequest {
  documentId: string;
  action: SelectionActionKind;
  selectionText: string;
  surroundingContext?: string;
  tone?: string;
  targetLanguage?: string;
}

export interface SelectionActionResult {
  action: SelectionActionKind;
  output: string;
}
