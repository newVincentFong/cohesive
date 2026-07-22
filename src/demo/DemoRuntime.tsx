import { useCallback, useEffect, useRef, useState } from "react";
import { createSession } from "@/core/session/session.service";
import { DEFAULT_CODE_MODE } from "@/core/product-flags";
import { FakeCursor } from "./FakeCursor";
import { DemoHud } from "./DemoHud";
import { runDemoScript } from "./engine";
import { DEMO_SCRIPT_LIST, DEMO_SCRIPTS } from "./scripts";
import type { DemoCursorState, DemoScriptId } from "./types";

function readScriptFromUrl(): DemoScriptId {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("demo");
  if (value === "build" || value === "trace" || value === "explore") {
    return value;
  }
  return "explore";
}

function readHideHud(): boolean {
  return new URLSearchParams(window.location.search).get("hud") === "0";
}

interface DemoRuntimeProps {
  projectId: string;
  sessionId: string;
  ready: boolean;
  onSessionChange: (sessionId: string) => void;
}

export function DemoRuntime({
  projectId,
  sessionId,
  ready,
  onSessionChange,
}: DemoRuntimeProps) {
  const [scriptId, setScriptId] = useState<DemoScriptId>(readScriptFromUrl);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready — start screen recording, then Play");
  const [hideHud] = useState(readHideHud);
  const [cursor, setCursor] = useState<DemoCursorState>({
    x: 0,
    y: 0,
    visible: false,
    pressing: false,
  });
  const cancelRef = useRef(false);

  const stop = useCallback(() => {
    cancelRef.current = true;
    setRunning(false);
    setStatus("Stopped");
    setCursor((prev) => ({ ...prev, visible: false, pressing: false }));
  }, []);

  const play = useCallback(async () => {
    if (!ready || !projectId || running) return;
    cancelRef.current = false;
    setRunning(true);
    setStatus(`Playing ${scriptId}…`);
    try {
      const session = await createSession({
        domain: "code",
        defaultMode: scriptId === "build" ? "build" : DEFAULT_CODE_MODE,
        projectId,
        title:
          scriptId === "build"
            ? "Fix removeTodo off-by-one"
            : scriptId === "trace"
              ? "Inspect explore trace"
              : "Explore default filter",
      });
      onSessionChange(session.id);
      await new Promise((resolve) => window.setTimeout(resolve, 350));

      await runDemoScript(DEMO_SCRIPTS[scriptId], {
        sessionId: session.id,
        onCursor: setCursor,
        isCancelled: () => cancelRef.current,
      });
      if (!cancelRef.current) {
        setStatus("Done — stop recording");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Demo script failed");
    } finally {
      setRunning(false);
      setCursor((prev) => ({ ...prev, pressing: false }));
    }
  }, [ready, projectId, running, scriptId, onSessionChange]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (running) stop();
        else void play();
      }
      if (event.key === "r" || event.key === "R") {
        if (!running) void play();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [play, running, stop]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("demo", scriptId);
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [scriptId]);

  return (
    <>
      <FakeCursor cursor={cursor} />
      <DemoHud
        scriptId={scriptId}
        running={running}
        status={status}
        hideHud={hideHud}
        onScriptChange={setScriptId}
        onPlay={() => void play()}
        onStop={stop}
      />
      {!ready ? (
        <div className="demo-boot-banner">Preparing demo workspace…</div>
      ) : null}
      <div className="demo-script-chips" aria-hidden="true">
        {DEMO_SCRIPT_LIST.map((script) => (
          <span
            key={script.id}
            className={script.id === scriptId ? "active" : undefined}
            data-demo={`script-${script.id}`}
          />
        ))}
      </div>
      <span hidden data-demo="active-session">
        {sessionId}
      </span>
    </>
  );
}
