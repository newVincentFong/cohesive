import type { DemoScript } from "../types";

export const traceScript: DemoScript = {
  id: "trace",
  label: "Trace",
  steps: [
    { op: "wait", ms: 500 },
    { op: "moveTo", target: "mode-explore", ms: 450 },
    { op: "click", target: "mode-explore" },
    { op: "wait", ms: 250 },
    { op: "replay", clip: "trace", animate: true, speed: 2 },
    { op: "wait", ms: 500 },
    { op: "moveTo", target: "trace-toggle", ms: 500 },
    { op: "click", target: "trace-toggle" },
    { op: "wait", ms: 700 },
    { op: "moveTo", target: "trace-panel", ms: 600 },
    { op: "wait", ms: 2400 },
  ],
};
