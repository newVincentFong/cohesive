import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CodeMode } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";
import { listCodeProjects, registerCodeProject } from "@/core/code/agent.service";
import {
  createMessage,
  listMessages,
} from "@/core/message/message.service";
import {
  createSession,
  listSessions,
  touchSession,
  updateSession,
} from "@/core/session/session.service";
import type { Message } from "@/core/message/message.types";
import type { Session } from "@/core/session/session.types";
import { deriveSessionTitle } from "@/core/session/session.types";
import { open } from "@tauri-apps/plugin-dialog";
import type { AgentProgress } from "@/core/code/agents/agent.types";
import type {
  AgentTraceCallbacks,
  AgentTraceColumn,
} from "@/core/code/agents/agent-trace.types";
import { runExploreAgent } from "@/core/code/agents/explore-main-agent";
import { AgentTracePanel } from "@/components/code/AgentTracePanel";
import { MarkdownMessage } from "@/components/message/MarkdownMessage";
import { STREAMING_MESSAGE_ID } from "@/core/message/streaming.constants";
import { SessionSidebarList } from "@/components/session/SessionSidebarList";

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

function ToolMessageBody({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.content.length > 600;

  return (
    <div className="tool-message-body">
      {message.toolName ? (
        <span className="tool-message-badge">{message.toolName}</span>
      ) : null}
      <div className={isLong && !expanded ? "tool-message-content--collapsed" : undefined}>
        <MarkdownMessage content={message.content} mode="static" className="tool-message-content" />
      </div>
      {isLong ? (
        <button className="secondary-button tool-message-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

interface CodeSurfaceProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}

export function CodeSidebar({ activeSessionId, onSelectSession }: CodeSurfaceProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<CodeProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  async function refresh() {
    setSessions(await listSessions("code"));
    setProjects(await listCodeProjects());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handlePickProject() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    const project = await registerCodeProject(selected);
    setSelectedProjectId(project.id);
    await refresh();
  }

  async function handleNewSession() {
    if (!selectedProjectId) return;
    const session = await createSession({
      domain: "code",
      mode: "plan",
      projectId: selectedProjectId,
      title: "New code session",
    });
    await refresh();
    onSelectSession(session.id);
  }

  return (
    <>
      <div className="sidebar-header">
        <button className="secondary-button" onClick={() => void handlePickProject()}>
          Pick project
        </button>
        <button
          className="primary-button"
          disabled={!selectedProjectId}
          onClick={() => void handleNewSession()}
        >
          New session
        </button>
      </div>
      <div className="sidebar-list">
        {projects.length > 0 ? (
          <div className="sidebar-section">
            <div className="muted sidebar-section-label">
              Projects
            </div>
            {projects.map((project) => (
              <button
                key={project.id}
                className={`sidebar-item ${selectedProjectId === project.id ? "active" : ""}`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div>{project.displayName}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {project.path}
                </div>
              </button>
            ))}
          </div>
        ) : null}
        <SessionSidebarList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onSessionsChange={() => void refresh()}
          renderSubtitle={(session) => session.mode ?? "plan"}
        />
      </div>
    </>
  );
}

function createTraceCallbacks(
  setTraceColumns: Dispatch<SetStateAction<AgentTraceColumn[]>>,
): AgentTraceCallbacks {
  return {
    onColumnStart(column) {
      setTraceColumns((prev) => [
        ...prev,
        { ...column, status: "running", messages: [] },
      ]);
    },
    onColumnMessage(columnId, message) {
      setTraceColumns((prev) =>
        prev.map((column) =>
          column.id === columnId
            ? { ...column, messages: [...column.messages, message] }
            : column,
        ),
      );
    },
    onColumnMessageUpdate(columnId, messageId, patch) {
      setTraceColumns((prev) =>
        prev.map((column) =>
          column.id === columnId
            ? {
                ...column,
                messages: column.messages.map((message) =>
                  message.id === messageId ? { ...message, ...patch } : message,
                ),
              }
            : column,
        ),
      );
    },
    onColumnEnd(columnId, status) {
      setTraceColumns((prev) =>
        prev.map((column) =>
          column.id === columnId ? { ...column, status } : column,
        ),
      );
    },
  };
}

export function CodeMainPanel({ activeSessionId }: { activeSessionId: string | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentPhase, setAgentPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [traceColumns, setTraceColumns] = useState<AgentTraceColumn[]>([]);

  async function refreshSessionData(nextSession: Session) {
    setMessages(await listMessages(nextSession.id));
  }

  useEffect(() => {
    if (!activeSessionId) {
      setSession(null);
      setMessages([]);
      setTraceColumns([]);
      return;
    }

    void (async () => {
      const sessions = await listSessions("code");
      const nextSession = sessions.find((item) => item.id === activeSessionId) ?? null;
      setSession(nextSession);
      if (nextSession) {
        await touchSession(nextSession.id);
        await refreshSessionData(nextSession);
      }
    })();
  }, [activeSessionId]);

  async function handleModeChange(mode: CodeMode) {
    if (!session) return;
    const updated = await updateSession(session.id, { mode });
    setSession(updated);
  }

  async function persistToolTrace(update: AgentProgress) {
    if (!session || !update.toolTrace) return;
    await createMessage({
      sessionId: session.id,
      role: "tool",
      content: update.toolTrace.content,
      toolName: update.toolTrace.toolName,
      toolPayload: update.toolTrace.toolPayload,
    });
    setMessages(await listMessages(session.id));
  }

  async function handleSendMessage() {
    if (!session || !draft.trim() || busy) return;

    const content = draft.trim();
    const isFirstMessage = messages.length === 0;
    const isExploreMode = (session.mode ?? "plan") === "explore";

    setBusy(true);
    setError(null);
    setAgentPhase(null);
    setTraceColumns([]);

    try {
      await createMessage({
        sessionId: session.id,
        role: "user",
        content,
      });

      if (isFirstMessage) {
        const updated = await updateSession(session.id, {
          title: deriveSessionTitle(content),
        });
        setSession(updated);
      }

      setDraft("");
      const history = await listMessages(session.id);
      setMessages(history);

      if (!isExploreMode) {
        return;
      }

      if (!session.projectId) {
        throw new Error("This session has no project attached.");
      }

      const project = (await listCodeProjects()).find((item) => item.id === session.projectId);
      if (!project) {
        throw new Error("Project not found for this session.");
      }

      setAgentPhase("Exploring...");
      const priorHistory = history.slice(0, -1);
      const onTrace = createTraceCallbacks(setTraceColumns);
      setMessages((prev) => upsertStreamingAssistant(prev, session.id, ""));

      const answer = await runExploreAgent({
        session,
        project,
        userMessage: content,
        history: priorHistory,
        onProgress: async (update) => {
          if (update.phase === "reading") {
            setAgentPhase("Reading files...");
          } else if (update.phase === "delegating") {
            setAgentPhase("Delegating exploration...");
          } else {
            setAgentPhase("Thinking...");
          }
          await persistToolTrace(update);
        },
        onTrace,
        onAnswerDelta: (streamingContent) => {
          setMessages((prev) => upsertStreamingAssistant(prev, session.id, streamingContent));
        },
      });

      await createMessage({
        sessionId: session.id,
        role: "assistant",
        content: answer,
      });

      await refreshSessionData(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run explore agent");
    } finally {
      setBusy(false);
      setAgentPhase(null);
    }
  }

  if (!session) {
    return <div className="empty-state">Pick a project and start a code session.</div>;
  }

  const isExploreMode = (session.mode ?? "plan") === "explore";

  return (
    <>
      <div className="panel-header">
        <strong>{session.title}</strong>
        <div className="panel-header-actions">
          <div className="mode-switch">
            {(["plan", "explore", "build"] as CodeMode[]).map((mode) => (
              <button
                key={mode}
                className={session.mode === mode ? "active" : undefined}
                onClick={() => void handleModeChange(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          {isExploreMode ? (
            <button
              type="button"
              className="secondary-button trace-toggle-button"
              onClick={() => setTraceExpanded(!traceExpanded)}
            >
              {busy ? <span className="trace-running-dot" aria-hidden="true" /> : null}
              {traceExpanded ? "Hide trace" : "Show trace"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="panel-body">
        <div className={`panel-grid ${traceExpanded ? "panel-grid--trace-expanded" : ""}`}>
          <section className="panel-section">
            <h3 className="section-title">Agent chat</h3>
            <div className="chat-thread compact">
              {messages.map((message) => (
                <div key={message.id} className={`chat-message ${message.role}`}>
                  <div className="muted chat-message-role">
                    {message.role}
                    {message.toolName ? ` · ${message.toolName}` : ""}
                  </div>
                  {message.role === "tool" ? (
                    <ToolMessageBody message={message} />
                  ) : (
                    <MarkdownMessage
                      content={message.content}
                      isAnimating={busy && message.id === STREAMING_MESSAGE_ID}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="chat-composer">
              {error ? (
                <div className="settings-message settings-message--error">{error}</div>
              ) : null}
              <textarea
                className="textarea-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  isExploreMode
                    ? "Ask the coding agent to explore this codebase..."
                    : "Switch to explore mode for agent chat"
                }
                disabled={busy}
              />
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void handleSendMessage()}
              >
                {busy ? (agentPhase ?? "Working...") : "Send"}
              </button>
            </div>
          </section>
          {traceExpanded ? (
            <section className="panel-section">
              <AgentTracePanel columns={traceColumns} />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
