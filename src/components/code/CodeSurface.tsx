import { useEffect, useState } from "react";
import type { CodeMode } from "@/core/session/session.types";
import type { CodeProject, ToolRun } from "@/core/code/agent.types";
import {
  listCodeProjects,
  listToolRuns,
  readProjectFile,
  registerCodeProject,
  runShellCommand,
  writeProjectFile,
} from "@/core/code/agent.service";
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
          <div style={{ padding: "0 8px 12px" }}>
            <div className="muted" style={{ marginBottom: 8 }}>
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
        {sessions.map((session) => (
          <button
            key={session.id}
            className={`sidebar-item ${activeSessionId === session.id ? "active" : ""}`}
            onClick={() => onSelectSession(session.id)}
          >
            <div>{session.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {session.mode ?? "plan"}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export function CodeMainPanel({ activeSessionId }: { activeSessionId: string | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolRuns, setToolRuns] = useState<ToolRun[]>([]);
  const [draft, setDraft] = useState("");
  const [filePath, setFilePath] = useState("README.md");
  const [fileContent, setFileContent] = useState("");
  const [shellCommand, setShellCommand] = useState("ls");
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);

  async function refreshSessionData(nextSession: Session) {
    setMessages(await listMessages(nextSession.id));
    setToolRuns(await listToolRuns(nextSession.id));
  }

  useEffect(() => {
    if (!activeSessionId) {
      setSession(null);
      setMessages([]);
      setToolRuns([]);
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

  async function handleSendMessage() {
    if (!session || !draft.trim()) return;
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
    setDraft("");
    await refreshSessionData(session);
  }

  async function handleReadFile() {
    if (!session?.projectId) return;
    const project = (await listCodeProjects()).find((item) => item.id === session.projectId);
    if (!project) return;
    const content = await readProjectFile({
      sessionId: session.id,
      projectPath: project.path,
      mode: session.mode ?? "plan",
      relativePath: filePath,
    });
    setFileContent(content);
  }

  async function handleWriteFile(confirmed = false) {
    if (!session?.projectId) return;
    const project = (await listCodeProjects()).find((item) => item.id === session.projectId);
    if (!project) return;
    const toolRun = await writeProjectFile({
      sessionId: session.id,
      projectPath: project.path,
      mode: session.mode ?? "plan",
      relativePath: filePath,
      content: fileContent,
      confirmed,
    });
    if (toolRun.status === "pending" && toolRun.requiresConfirmation) {
      setPendingConfirmation(toolRun.id);
      return;
    }
    setPendingConfirmation(null);
    await refreshSessionData(session);
  }

  async function handleRunShell(confirmed = false) {
    if (!session?.projectId) return;
    const project = (await listCodeProjects()).find((item) => item.id === session.projectId);
    if (!project) return;
    const result = await runShellCommand({
      sessionId: session.id,
      projectPath: project.path,
      mode: session.mode ?? "plan",
      command: shellCommand,
      confirmed,
    });
    if (result.blockedReason) {
      setPendingConfirmation(result.toolRun.id);
      return;
    }
    setPendingConfirmation(null);
    await refreshSessionData(session);
  }

  if (!session) {
    return <div className="empty-state">Pick a project and start a code session.</div>;
  }

  return (
    <>
      <div className="panel-header">
        <strong>{session.title}</strong>
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
      </div>
      <div className="panel-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16 }}>
          <section>
            <h3>Agent chat</h3>
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
            <div className="chat-composer">
              <textarea
                className="textarea-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask the coding agent..."
              />
              <button className="primary-button" onClick={() => void handleSendMessage()}>
                Send
              </button>
            </div>
          </section>
          <section>
            <h3>Project tools</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                className="text-input"
                value={filePath}
                onChange={(event) => setFilePath(event.target.value)}
                placeholder="Relative file path"
              />
              <textarea
                className="textarea-input"
                value={fileContent}
                onChange={(event) => setFileContent(event.target.value)}
                placeholder="File content"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="secondary-button" onClick={() => void handleReadFile()}>
                  Read file
                </button>
                <button className="secondary-button" onClick={() => void handleWriteFile()}>
                  Write file
                </button>
              </div>
              <input
                className="text-input"
                value={shellCommand}
                onChange={(event) => setShellCommand(event.target.value)}
                placeholder="Shell command"
              />
              <button className="secondary-button" onClick={() => void handleRunShell()}>
                Run command
              </button>
              {pendingConfirmation ? (
                <div className="tool-run">
                  <div>This action requires confirmation in build mode.</div>
                  <button
                    className="primary-button"
                    onClick={() => {
                      void handleRunShell(true);
                      void handleWriteFile(true);
                    }}
                  >
                    Confirm
                  </button>
                </div>
              ) : null}
            </div>
            <h3 style={{ marginTop: 24 }}>Tool runs</h3>
            {toolRuns.map((toolRun) => (
              <div key={toolRun.id} className="tool-run">
                <div>
                  {toolRun.kind} · {toolRun.status}
                  {toolRun.command ? ` · ${toolRun.command}` : ""}
                </div>
                {toolRun.stdoutTail ? <pre>{toolRun.stdoutTail}</pre> : null}
                {toolRun.stderrTail ? <pre>{toolRun.stderrTail}</pre> : null}
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
