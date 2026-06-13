import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function MarkdownEditor({ value, onChange, readOnly }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    });

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          markdown(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          updateListener,
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
            },
            ".cm-content": {
              caretColor: "var(--text-primary)",
              padding: "16px 0",
            },
            ".cm-gutters": {
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-muted)",
              borderRight: "1px solid var(--border-subtle)",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "var(--bg-elevated)",
            },
            ".cm-activeLine": {
              backgroundColor: "rgba(255,255,255,0.03)",
            },
          }),
          EditorView.editable.of(!readOnly),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [onChange, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={hostRef} className="editor-shell" />;
}
