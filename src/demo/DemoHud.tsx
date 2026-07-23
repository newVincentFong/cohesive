import type { DemoScriptId } from "./types";
import { DEMO_SCRIPT_LIST } from "./scripts";

interface DemoHudProps {
  scriptId: DemoScriptId;
  running: boolean;
  status: string;
  hideHud: boolean;
  onScriptChange: (id: DemoScriptId) => void;
  onPlay: () => void;
  onStop: () => void;
}

export function DemoHud({
  scriptId,
  running,
  status,
  hideHud,
  onScriptChange,
  onPlay,
  onStop,
}: DemoHudProps) {
  if (hideHud || running) return null;

  return (
    <div className="demo-hud" role="region" aria-label="Demo controls">
      <div className="demo-hud-title">Demo · {scriptId}</div>
      <select
        className="demo-hud-select"
        value={scriptId}
        disabled={running}
        onChange={(event) => onScriptChange(event.target.value as DemoScriptId)}
      >
        {DEMO_SCRIPT_LIST.map((script) => (
          <option key={script.id} value={script.id}>
            {script.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="demo-hud-button"
        onClick={() => (running ? onStop() : onPlay())}
      >
        {running ? "Stop" : "Play"}
      </button>
      <div className="demo-hud-status">{status}</div>
      <div className="demo-hud-hint">
        Space play/stop · R replay · hides while playing · ?hud=0 always hide
      </div>
    </div>
  );
}
