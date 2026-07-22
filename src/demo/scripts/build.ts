import type { DemoScript } from "../types";

export const buildScript: DemoScript = {
  id: "build",
  label: "Build",
  steps: [
    { op: "wait", ms: 600 },
    { op: "moveTo", target: "mode-build", ms: 550 },
    { op: "click", target: "mode-build" },
    { op: "wait", ms: 350 },
    { op: "moveTo", target: "composer", ms: 550 },
    { op: "click", target: "composer" },
    {
      op: "type",
      target: "composer",
      text: "Fix the off-by-one bug in TodoService.removeTodo so the last index is valid.",
      cps: 34,
    },
    { op: "wait", ms: 350 },
    { op: "clearComposer" },
    { op: "replay", clip: "build", animate: true, speed: 1.7 },
    { op: "wait", ms: 1800 },
  ],
};
