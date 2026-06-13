import { useEffect, useState } from "react";
import type {
  SelectionActionKind,
  WritingDocument,
} from "@/core/writing/writing.types";
import {
  createWritingDocument,
  listWritingDocuments,
  readWritingDocumentContent,
  runSelectionAction,
  saveWritingDocumentContent,
} from "@/core/writing/writing.service";
import { MarkdownEditor } from "./MarkdownEditor";

interface WritingSurfaceProps {
  activeDocumentId: string | null;
  onSelectDocument: (documentId: string | null) => void;
}

const selectionActions: { id: SelectionActionKind; label: string }[] = [
  { id: "translateSelection", label: "Translate" },
  { id: "adjustTone", label: "Adjust tone" },
  { id: "rewriteSelection", label: "Rewrite" },
  { id: "continueWriting", label: "Continue" },
];

export function WritingSidebar({
  activeDocumentId,
  onSelectDocument,
}: WritingSurfaceProps) {
  const [documents, setDocuments] = useState<WritingDocument[]>([]);

  async function refreshDocuments() {
    setDocuments(await listWritingDocuments());
  }

  useEffect(() => {
    void refreshDocuments();
  }, []);

  async function handleCreateDocument() {
    const document = await createWritingDocument({
      title: "Untitled document",
      initialContent: "# Untitled document\n",
    });
    await refreshDocuments();
    onSelectDocument(document.id);
  }

  return (
    <>
      <div className="sidebar-header">
        <button className="primary-button" onClick={() => void handleCreateDocument()}>
          New document
        </button>
      </div>
      <div className="sidebar-list">
        {documents.map((document) => (
          <button
            key={document.id}
            className={`sidebar-item ${activeDocumentId === document.id ? "active" : ""}`}
            onClick={() => onSelectDocument(document.id)}
          >
            <div>{document.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {new Date(document.updatedAt).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export function WritingMainPanel({ activeDocumentId }: { activeDocumentId: string | null }) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [selection, setSelection] = useState("");
  const [actionOutput, setActionOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeDocumentId) {
      setContent("");
      setTitle("");
      return;
    }

    void (async () => {
      const document = await readWritingDocumentContent(activeDocumentId);
      setContent(document);
      setTitle("Document");
    })();
  }, [activeDocumentId]);

  useEffect(() => {
    if (!activeDocumentId) return;
    const timer = window.setTimeout(() => {
      void saveWritingDocumentContent(activeDocumentId, content);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeDocumentId, content]);

  useEffect(() => {
    const handleSelection = () => {
      const selected = window.getSelection()?.toString() ?? "";
      setSelection(selected);
    };
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  async function handleSelectionAction(action: SelectionActionKind) {
    if (!activeDocumentId) return;
    setBusy(true);
    setActionOutput(null);
    try {
      const result = await runSelectionAction({
        documentId: activeDocumentId,
        action,
        selectionText: selection || content.slice(-200),
        surroundingContext: content.slice(-800),
        tone: "clear and concise",
        targetLanguage: "English",
      });
      setActionOutput(result.output);
    } finally {
      setBusy(false);
    }
  }

  if (!activeDocumentId) {
    return <div className="empty-state">Select or create a document to start writing.</div>;
  }

  return (
    <>
      <div className="panel-header">
        <strong>{title}</strong>
        <span className="muted">Markdown · autosave</span>
      </div>
      <div className="editor-toolbar">
        {selectionActions.map((action) => (
          <button
            key={action.id}
            className="secondary-button"
            disabled={busy}
            onClick={() => void handleSelectionAction(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {actionOutput ? (
        <div className="ai-suggestion-bar">
          <div className="muted ai-suggestion-label">
            AI suggestion
          </div>
          <div>{actionOutput}</div>
        </div>
      ) : null}
      <div className="panel-body">
        <MarkdownEditor value={content} onChange={setContent} />
      </div>
    </>
  );
}
