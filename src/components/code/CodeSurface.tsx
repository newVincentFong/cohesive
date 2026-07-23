import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CodeMode } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";
import { permissionsForMode } from "@/core/code/agent.types";
import { listCodeProjects, registerCodeProject } from "@/core/code/agent.service";
import {
  createMessage,
  listConversationPath,
} from "@/core/message/message.service";
import {
  createAgentRun,
  listAgentRuns,
  updateAgentRun,
} from "@/core/agent-run/agent-run.service";
import type { AgentRun } from "@/core/agent-run/agent-run.types";
import {
  createTracePersister,
  getTraceByRun,
  pruneTraces,
  traceRunToColumns,
} from "@/core/code/agents/agent-trace.service";
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
import { runBuildAgent } from "@/core/code/agents/build-main-agent";
import { AgentTracePanel } from "@/components/code/AgentTracePanel";
import { MarkdownMessage } from "@/components/message/MarkdownMessage";
import { STREAMING_MESSAGE_ID } from "@/core/message/streaming.constants";
import { SessionSidebarList } from "@/components/session/SessionSidebarList";
import { ProjectSwitcher } from "@/components/code/ProjectSwitcher";
import { EmptyState } from "@/components/layout/EmptyState";
import { handleComposerKeyDown } from "@/components/chat/composer-keydown";
import {
  codeModeHints,
  formatCodeModeLabel,
  messageRoleLabel,
} from "@/components/chat/message-labels";
import { useChatAutoScroll } from "@/components/chat/useChatAutoScroll";
import {
  DEFAULT_CODE_MODE,
  ENABLED_CODE_MODES,
  resolveCodeMode,
} from "@/core/product-flags";
import {
  formatFullDateTime,
  formatRelativeTime,
} from "@/core/utils/relative-time";
import { DEMO_REFRESH_EVENT } from "@/demo/types";
import { isDemoMode } from "@/demo/isDemoMode";

const TRACE_RETENTION_RUNS = 200;

function agentPhaseLabel(update: AgentProgress): string {
  switch (update.phase) {
    case "reading":
      return "Reading files...";
    case "searching":
      return "Searching codebase...";
    case "editing":
      return "Editing files...";
    case "running_command":
      return "Running command...";
    case "delegating":
      return "Delegating exploration...";
    case "explore_result":
      return "Thinking...";
    default:
      return "Thinking...";
  }
}

function isAgentMode(mode: CodeMode): boolean {
  return mode === "explore" || mode === "build";
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
    const nextSessions = await listSessions("code");
    const nextProjects = await listCodeProjects();
    setSessions(nextSessions);
    setProjects(nextProjects);
    return { nextSessions, nextProjects };
  }

  function selectLatestSessionForProject(
    projectId: string,
    nextSessions: Session[],
  ) {
    const latest = nextSessions.find((session) => session.projectId === projectId);
    onSelectSession(latest?.id ?? null);
  }

  useEffect(() => {
    void (async () => {
      const { nextSessions, nextProjects } = await refresh();
      if (activeSessionId) {
        const session = nextSessions.find((item) => item.id === activeSessionId);
        if (
          session?.projectId &&
          nextProjects.some((project) => project.id === session.projectId)
        ) {
          setSelectedProjectId(session.projectId);
          return;
        }
      }
      if (nextProjects[0]) {
        setSelectedProjectId(nextProjects[0].id);
      }
    })();
    // Intentionally mount-only: activeSessionId sync lives in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    void (async () => {
      const { nextSessions, nextProjects } = await refresh();
      const session = nextSessions.find((item) => item.id === activeSessionId);
      if (session?.projectId && nextProjects.some((project) => project.id === session.projectId)) {
        setSelectedProjectId(session.projectId);
      }
    })();
  }, [activeSessionId]);

  async function handleSelectProject(project: CodeProject) {
    const updated = await registerCodeProject(project.path);
    setSelectedProjectId(updated.id);
    const { nextSessions } = await refresh();
    selectLatestSessionForProject(updated.id, nextSessions);
  }

  async function handlePickProject() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    const project = await registerCodeProject(selected);
    setSelectedProjectId(project.id);
    const { nextSessions } = await refresh();
    selectLatestSessionForProject(project.id, nextSessions);
  }

  async function handleNewSession() {
    if (!selectedProjectId) return;
    const session = await createSession({
      domain: "code",
      defaultMode: DEFAULT_CODE_MODE,
      projectId: selectedProjectId,
      title: "New code session",
    });
    await refresh();
    onSelectSession(session.id);
  }

  const projectSessions = selectedProjectId
    ? sessions.filter((session) => session.projectId === selectedProjectId)
    : [];

  return (
    <>
      <div className="sidebar-header sidebar-header--stacked">
        <ProjectSwitcher
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(project) => void handleSelectProject(project)}
          onPickProject={() => void handlePickProject()}
        />
        <button
          className="primary-button"
          data-demo="new-session"
          disabled={!selectedProjectId}
          onClick={() => void handleNewSession()}
        >
          New session
        </button>
      </div>
      <div className="sidebar-list">
        {projectSessions.length > 0 ? (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Sessions</div>
            <SessionSidebarList
              sessions={projectSessions}
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
        ) : null}
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
        { ...column, status: "running", messages: [], startedAt: Date.now() },
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
                  message.id === messageId
                    ? { ...message, ...patch, updatedAt: Date.now() }
                    : message,
                ),
              }
            : column,
        ),
      );
    },
    onColumnEnd(columnId, status) {
      setTraceColumns((prev) =>
        prev.map((column) =>
          column.id === columnId
            ? { ...column, status, endedAt: Date.now() }
            : column,
        ),
      );
    },
  };
}

export function CodeMainPanel({ activeSessionId }: { activeSessionId: string | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composerMode, setComposerMode] = useState<CodeMode>(DEFAULT_CODE_MODE);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentPhase, setAgentPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [traceColumns, setTraceColumns] = useState<AgentTraceColumn[]>([]);
  const [traceRuns, setTraceRuns] = useState<AgentRun[]>([]);
  const [selectedTraceRunId, setSelectedTraceRunId] = useState<string | null>(null);
  const { threadRef, handleScroll } = useChatAutoScroll([messages, busy, error]);

  async function refreshSessionData(nextSession: Session) {
    const path = await listConversationPath(
      nextSession.id,
      nextSession.currentLeafMessageId,
    );
    setMessages(path);
  }

  async function refreshTraceRuns(sessionId: string): Promise<AgentRun[]> {
    const runs = (await listAgentRuns(sessionId)).filter(
      (run) => run.mode === "explore" || run.mode === "build",
    );
    setTraceRuns(runs);
    return runs;
  }

  async function loadPersistedTrace(runId: string) {
    setSelectedTraceRunId(runId);
    const trace = await getTraceByRun(runId);
    setTraceColumns(traceRunToColumns(trace));
  }

  useEffect(() => {
    if (!activeSessionId) {
      setSession(null);
      setMessages([]);
      setTraceColumns([]);
      setTraceRuns([]);
      setSelectedTraceRunId(null);
      setComposerMode(DEFAULT_CODE_MODE);
      return;
    }

    async function loadActiveSession(options: { resetTraceSelection: boolean }) {
      const sessions = await listSessions("code");
      const nextSession = sessions.find((item) => item.id === activeSessionId) ?? null;
      setSession(nextSession);
      if (options.resetTraceSelection) {
        setTraceColumns([]);
        setSelectedTraceRunId(null);
      }
      if (nextSession) {
        setComposerMode(resolveCodeMode(nextSession.defaultMode));
        await touchSession(nextSession.id);
        await refreshSessionData(nextSession);
        const runs = await refreshTraceRuns(nextSession.id);
        const latest = runs[runs.length - 1];
        if (latest) {
          await loadPersistedTrace(latest.id);
        } else if (options.resetTraceSelection) {
          setTraceColumns([]);
        }
      } else {
        setTraceRuns([]);
      }
    }

    void loadActiveSession({ resetTraceSelection: true });

    if (!isDemoMode()) return;

    function onDemoRefresh() {
      void loadActiveSession({ resetTraceSelection: false });
    }
    window.addEventListener(DEMO_REFRESH_EVENT, onDemoRefresh);
    return () => window.removeEventListener(DEMO_REFRESH_EVENT, onDemoRefresh);
  }, [activeSessionId]);

  async function handleModeChange(mode: CodeMode) {
    if (!session) return;
    setComposerMode(mode);
    const updated = await updateSession(session.id, { defaultMode: mode });
    setSession(updated);
  }

  async function handleSendMessage() {
    if (!session || !draft.trim() || busy) return;

    const content = draft.trim();
    const parentId = session.currentLeafMessageId ?? null;
    const isFirstMessage = parentId === null;
    const isBuildMode = composerMode === "build";
    const runsAgent = isAgentMode(composerMode);

    setBusy(true);
    setError(null);
    setAgentPhase(null);
    setTraceColumns([]);

    let pathTailId = parentId;
    let agentRunId: string | null = null;

    async function persistToolTrace(update: AgentProgress) {
      if (!session || !update.toolTrace || !agentRunId) return;
      const toolMessage = await createMessage({
        sessionId: session.id,
        parentMessageId: pathTailId,
        agentRunId,
        role: "tool",
        content: update.toolTrace.content,
        toolName: update.toolTrace.toolName,
        toolPayload: update.toolTrace.toolPayload,
      });
      pathTailId = toolMessage.id;
      setMessages(await listConversationPath(session.id));
    }

    try {
      const userMessage = await createMessage({
        sessionId: session.id,
        parentMessageId: parentId,
        role: "user",
        content,
      });
      pathTailId = userMessage.id;

      if (isFirstMessage) {
        const updated = await updateSession(session.id, {
          title: deriveSessionTitle(content),
        });
        setSession(updated);
      }

      const agentRun = await createAgentRun({
        sessionId: session.id,
        parentMessageId: parentId,
        userMessageId: userMessage.id,
        mode: composerMode,
        permissionSnapshotJson: JSON.stringify(permissionsForMode(composerMode)),
      });
      agentRunId = agentRun.id;

      setDraft("");
      const path = await listConversationPath(session.id);
      setMessages(path);
      setSession((prev) =>
        prev ? { ...prev, currentLeafMessageId: userMessage.id } : prev,
      );

      if (!runsAgent) {
        await updateAgentRun(agentRun.id, { status: "done" });
        return;
      }

      if (!session.projectId) {
        throw new Error("This session has no project attached.");
      }

      const project = (await listCodeProjects()).find((item) => item.id === session.projectId);
      if (!project) {
        throw new Error("Project not found for this session.");
      }

      setAgentPhase(isBuildMode ? "Building..." : "Exploring...");
      const priorHistory = path
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(0, -1);
      setSelectedTraceRunId(agentRun.id);
      const tracePersister = createTracePersister({
        runId: agentRun.id,
        sessionId: session.id,
        ui: createTraceCallbacks(setTraceColumns),
      });
      setMessages((prev) => upsertStreamingAssistant(prev, session.id, ""));

      const agentInput = {
        session,
        project,
        userMessage: content,
        history: priorHistory,
        runId: agentRun.id,
        runMode: composerMode,
        onProgress: async (update: AgentProgress) => {
          setAgentPhase(agentPhaseLabel(update));
          await persistToolTrace(update);
        },
        onTrace: tracePersister.callbacks,
        onAnswerDelta: (streamingContent: string) => {
          setMessages((prev) => upsertStreamingAssistant(prev, session.id, streamingContent));
        },
      };

      let answer: string;
      try {
        const agentResult = isBuildMode
          ? await runBuildAgent(agentInput)
          : await runExploreAgent(agentInput);
        answer = agentResult.content;
      } finally {
        await tracePersister.finish();
        await refreshTraceRuns(session.id);
        void pruneTraces(TRACE_RETENTION_RUNS);
      }

      const assistantMessage = await createMessage({
        sessionId: session.id,
        parentMessageId: userMessage.id,
        agentRunId: agentRun.id,
        role: "assistant",
        content: answer,
      });

      await updateAgentRun(agentRun.id, {
        assistantMessageId: assistantMessage.id,
        status: "done",
      });

      const sessions = await listSessions("code");
      const refreshedSession = sessions.find((item) => item.id === session.id) ?? session;
      setSession(refreshedSession);
      await refreshSessionData(refreshedSession);
    } catch (err) {
      if (agentRunId) {
        await updateAgentRun(agentRunId, { status: "error" });
      }
      setError(err instanceof Error ? err.message : "Failed to run explore agent");
    } finally {
      setBusy(false);
      setAgentPhase(null);
    }
  }

  if (!session) {
    return (
      <EmptyState
        title="No code session yet"
        description="Pick a project from the sidebar, then start a session to explore or build with the agent."
        icon="</>"
      />
    );
  }

  const showTrace = isAgentMode(composerMode);

  return (
    <>
      <div className="panel-header">
        <strong>{session.title}</strong>
        <div className="panel-header-actions">
          {showTrace ? (
            <button
              type="button"
              className="secondary-button trace-toggle-button"
              data-demo="trace-toggle"
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
            <div className="chat-thread compact" ref={threadRef} onScroll={handleScroll}>
              {messages.map((message) => (
                <div key={message.id} className={`chat-message ${message.role}`}>
                  {message.role !== "tool" ? (
                    <div className="muted chat-message-role">
                      {messageRoleLabel(message.role)}
                    </div>
                  ) : null}
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
            <div className="chat-composer">
              {busy && agentPhase ? (
                <div className="composer-status-bar">
                  <span className="trace-running-dot" aria-hidden="true" />
                  {agentPhase}
                </div>
              ) : null}
              <div className="chat-composer-toolbar">
                <div className="mode-switch">
                  {ENABLED_CODE_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={composerMode === mode ? "active" : undefined}
                      title={codeModeHints[mode]}
                      data-demo={mode === "build" ? "mode-build" : "mode-explore"}
                      onClick={() => void handleModeChange(mode)}
                    >
                      {formatCodeModeLabel(mode)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chat-composer-row">
                <textarea
                  className="textarea-input"
                  data-demo="composer"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) =>
                    handleComposerKeyDown(event, () => void handleSendMessage())
                  }
                  placeholder={
                    composerMode === "build"
                      ? "Ask the coding agent to implement or fix something... (Enter to send)"
                      : "Ask the coding agent to explore this codebase... (Enter to send)"
                  }
                  disabled={busy}
                />
                <button
                  className="primary-button"
                  data-demo="send"
                  disabled={busy || !draft.trim()}
                  onClick={() => void handleSendMessage()}
                >
                  {busy ? <span className="button-spinner" aria-label="Working" /> : "Send"}
                </button>
              </div>
            </div>
          </section>
          {traceExpanded ? (
            <section className="panel-section">
              <AgentTracePanel
                columns={traceColumns}
                runs={traceRuns}
                selectedRunId={selectedTraceRunId}
                onSelectRun={(runId) => {
                  if (!busy) void loadPersistedTrace(runId);
                }}
                liveRunId={busy ? selectedTraceRunId : null}
              />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
