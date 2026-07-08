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
import { STREAMING_MESSAGE_ID } from "@/core/message/streaming.constants";
import { MarkdownMessage } from "@/components/message/MarkdownMessage";
import { SessionSidebarList } from "@/components/session/SessionSidebarList";
import { EmptyState } from "@/components/layout/EmptyState";
import { TrustBadge } from "@/components/layout/TrustBadge";
import { handleComposerKeyDown } from "@/components/chat/composer-keydown";
import { messageRoleLabel } from "@/components/chat/message-labels";
import { useChatAutoScroll } from "@/components/chat/useChatAutoScroll";
import {
  formatFullDateTime,
  formatRelativeTime,
} from "@/core/utils/relative-time";

interface MindSurfaceProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}

function upsertStreamingAssistant(
  messages: Message[],
  sessionId: string,
  content: string,
): Message[] {
  const withoutStreaming = messages.filter((message) => message.id !== STREAMING_MESSAGE_ID);
  return [
    ...withoutStreaming,
    {
      id: STREAMING_MESSAGE_ID,
      sessionId,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    },
  ];
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
        <SessionSidebarList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onSessionsChange={() => void refresh()}
          renderSubtitle={(session) => (
            <span title={formatFullDateTime(session.updatedAt)}>
              {formatRelativeTime(session.updatedAt)}
            </span>
          )}
        />
      </div>
    </>
  );
}

export function MindMainPanel({ activeSessionId }: { activeSessionId: string | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { threadRef, handleScroll } = useChatAutoScroll([messages, busy, error]);

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

    const content = draft.trim();
    setBusy(true);
    setError(null);
    try {
      const isFirstMessage = messages.length === 0;
      await createMessage({
        sessionId: session.id,
        role: "user",
        content,
      });

      setDraft("");
      const history = await listMessages(session.id);
      setMessages(upsertStreamingAssistant(history, session.id, ""));

      if (isFirstMessage) {
        const updated = await updateSession(session.id, {
          title: deriveSessionTitle(content),
        });
        setSession(updated);
      }

      const memory = getDomainMemoryStore("mind");
      await memory.add({
        domain: "mind",
        layer: "episodic",
        sessionId: session.id,
        content,
      });

      const llm = createLlmProvider();
      const priorMessages = history.filter((message) => message.role !== "tool");
      const llmHistory = priorMessages.map((message) => ({
        role: message.role === "tool" ? ("assistant" as const) : message.role,
        content: message.content,
      }));

      let streamingContent = "";
      const result = await llm.streamWithHandler(
        {
          messages: [
            {
              role: "system",
              content:
                "You are a thoughtful companion for self-reflection, motivation, and emotional clarity.",
            },
            ...llmHistory,
            { role: "user", content },
          ],
        },
        (chunk) => {
          if (!chunk.delta) return;
          streamingContent += chunk.delta;
          setMessages((prev) => upsertStreamingAssistant(prev, session.id, streamingContent));
        },
      );

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

      setMessages(await listMessages(session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      if (session) {
        setMessages(await listMessages(session.id));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <EmptyState
        title="Start a mind session"
        description="Create a private session from the sidebar to reflect, think, and talk with Cohesive."
        icon="◎"
      />
    );
  }

  return (
    <>
      <div className="panel-header">
        <strong>{session.title}</strong>
        <TrustBadge label="Private · local memory" />
      </div>
      <div className="panel-body">
        <div className="chat-thread" ref={threadRef} onScroll={handleScroll}>
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <div className="muted chat-message-role">
                {messageRoleLabel(message.role)}
              </div>
              <MarkdownMessage
                content={message.content}
                isAnimating={busy && message.id === STREAMING_MESSAGE_ID}
              />
            </div>
          ))}
          {error ? (
            <div className="chat-error-card">
              <div className="chat-error-card-message">{error}</div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="chat-composer">
        {busy ? (
          <div className="composer-status-bar">
            <span className="trace-running-dot" aria-hidden="true" />
            Thinking...
          </div>
        ) : null}
        <textarea
          className="textarea-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => handleComposerKeyDown(event, () => void handleSend())}
          placeholder="Share what is on your mind... (Enter to send)"
          disabled={busy}
        />
        <button
          className="primary-button"
          disabled={busy || !draft.trim()}
          onClick={() => void handleSend()}
        >
          {busy ? <span className="button-spinner" aria-label="Thinking" /> : "Send"}
        </button>
      </div>
    </>
  );
}
