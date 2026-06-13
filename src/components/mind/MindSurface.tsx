import { useEffect, useState } from "react";
import type { Message } from "@/core/message/message.types";
import type { Session } from "@/core/session/session.types";
import { deriveSessionTitle } from "@/core/session/session.types";
import { createMessage, listMessages } from "@/core/message/message.service";
import {
  createSession,
  listSessions,
  touchSession,
  updateSession,
} from "@/core/session/session.service";
import { getDomainMemoryStore } from "@/core/memory/memory-registry";
import { createLlmProvider } from "@/core/llm/deepseek-provider";

interface MindSurfaceProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}

export function MindSidebar({ activeSessionId, onSelectSession }: MindSurfaceProps) {
  const [sessions, setSessions] = useState<Session[]>([]);

  async function refresh() {
    setSessions(await listSessions("mind"));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleNewSession() {
    const session = await createSession({
      domain: "mind",
      title: "New mind session",
    });
    await refresh();
    onSelectSession(session.id);
  }

  return (
    <>
      <div className="sidebar-header">
        <button className="primary-button" onClick={() => void handleNewSession()}>
          New session
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={`sidebar-item ${activeSessionId === session.id ? "active" : ""}`}
            onClick={() => onSelectSession(session.id)}
          >
            <div>{session.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {new Date(session.updatedAt).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export function MindMainPanel({ activeSessionId }: { activeSessionId: string | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeSessionId) {
      setSession(null);
      setMessages([]);
      return;
    }

    void (async () => {
      const sessions = await listSessions("mind");
      const nextSession = sessions.find((item) => item.id === activeSessionId) ?? null;
      setSession(nextSession);
      if (nextSession) {
        await touchSession(nextSession.id);
        setMessages(await listMessages(nextSession.id));
      }
    })();
  }, [activeSessionId]);

  async function handleSend() {
    if (!session || !draft.trim() || busy) return;
    setBusy(true);
    try {
      const isFirstMessage = messages.length === 0;
      await createMessage({
        sessionId: session.id,
        role: "user",
        content: draft.trim(),
      });
      if (isFirstMessage) {
        await updateSession(session.id, {
          title: deriveSessionTitle(draft.trim()),
        });
      }

      const memory = getDomainMemoryStore("mind");
      await memory.add({
        domain: "mind",
        layer: "episodic",
        sessionId: session.id,
        content: draft.trim(),
      });

      const llm = createLlmProvider();
      const history = messages.map((message) => ({
        role: message.role === "tool" ? "assistant" as const : message.role,
        content: message.content,
      }));
      const result = await llm.complete({
        messages: [
          {
            role: "system",
            content:
              "You are a thoughtful companion for self-reflection, motivation, and emotional clarity.",
          },
          ...history,
          { role: "user", content: draft.trim() },
        ],
      });

      await createMessage({
        sessionId: session.id,
        role: "assistant",
        content: result.content,
      });

      await memory.add({
        domain: "mind",
        layer: "reflection",
        sessionId: session.id,
        content: result.content,
      });

      setDraft("");
      setMessages(await listMessages(session.id));
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <div className="empty-state">Start a private mind session.</div>;
  }

  return (
    <>
      <div className="panel-header">
        <strong>{session.title}</strong>
        <span className="muted">Private · local memory</span>
      </div>
      <div className="panel-body">
        <div className="chat-thread">
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {message.role}
              </div>
              <div>{message.content}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="chat-composer">
        <textarea
          className="textarea-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share what is on your mind..."
        />
        <button className="primary-button" disabled={busy} onClick={() => void handleSend()}>
          {busy ? "Thinking..." : "Send"}
        </button>
      </div>
    </>
  );
}
