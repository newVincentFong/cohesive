import type {
  CreateWritingDocumentInput,
  SelectionActionRequest,
  SelectionActionResult,
  WritingDocument,
} from "./writing.types";
import { invoke } from "@/core/platform/tauri";

export async function createWritingDocument(
  input: CreateWritingDocumentInput,
): Promise<WritingDocument> {
  return invoke<WritingDocument>("writing_document_create", { input });
}

export async function listWritingDocuments(): Promise<WritingDocument[]> {
  return invoke<WritingDocument[]>("writing_document_list");
}

export async function getWritingDocument(
  id: string,
): Promise<WritingDocument | null> {
  return invoke<WritingDocument | null>("writing_document_get", { id });
}

export async function readWritingDocumentContent(id: string): Promise<string> {
  return invoke<string>("writing_document_read", { id });
}

export async function saveWritingDocumentContent(
  id: string,
  content: string,
): Promise<void> {
  await invoke("writing_document_save", { id, content });
}

export async function runSelectionAction(
  request: SelectionActionRequest,
): Promise<SelectionActionResult> {
  return invoke<SelectionActionResult>("writing_selection_action", { request });
}
