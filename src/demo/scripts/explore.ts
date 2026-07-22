import type { DemoScript } from "../types";

export const exploreScript: DemoScript = {
  id: "explore",
  label: "Explore",
  steps: [
    { op: "wait", ms: 700 },
    { op: "moveTo", target: "mode-explore", ms: 500 },
    { op: "click", target: "mode-explore" },
    { op: "wait", ms: 300 },
    { op: "moveTo", target: "composer", ms: 600 },
    { op: "click", target: "composer" },
    {
      op: "type",
      target: "composer",
      text: "Where is the default todo filter defined, and who imports it?",
      cps: 32,
    },
    { op: "wait", ms: 400 },
    { op: "clearComposer" },
    { op: "replay", clip: "explore", animate: true, speed: 1.6 },
    { op: "wait", ms: 800 },
    { op: "moveTo", target: "trace-toggle", ms: 500 },
    { op: "click", target: "trace-toggle" },
    { op: "wait", ms: 2200 },
  ],
};
