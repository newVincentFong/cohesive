import type { DemoCursorState, DemoScript, DemoStep } from "./types";
import {
  centerOf,
  queryDemoTarget,
  setNativeInputValue,
  sleep,
  waitForDemoTarget,
} from "./dom";
import { applyReplay } from "./replay";

export interface DemoEngineOptions {
  sessionId: string;
  onCursor: (state: DemoCursorState) => void;
  isCancelled: () => boolean;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function animateCursorMove(
  from: { x: number; y: number },
  to: { x: number; y: number },
  durationMs: number,
  onCursor: (state: DemoCursorState) => void,
  isCancelled: () => boolean,
) {
  if (durationMs <= 0) {
    onCursor({ x: to.x, y: to.y, visible: true, pressing: false });
    return;
  }

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (isCancelled()) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - started) / durationMs);
      const e = easeInOutCubic(t);
      onCursor({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        visible: true,
        pressing: false,
      });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

export async function runDemoScript(
  script: DemoScript,
  options: DemoEngineOptions,
): Promise<void> {
  const { sessionId, onCursor, isCancelled } = options;
  let cursor = { x: window.innerWidth * 0.55, y: window.innerHeight * 0.45 };
  onCursor({ ...cursor, visible: true, pressing: false });

  for (const step of script.steps) {
    if (isCancelled()) return;
    await runStep(step, {
      sessionId,
      onCursor,
      isCancelled,
      getCursor: () => cursor,
      setCursor: (next) => {
        cursor = next;
      },
    });
  }

  onCursor({ ...cursor, visible: true, pressing: false });
}

async function runStep(
  step: DemoStep,
  ctx: {
    sessionId: string;
    onCursor: (state: DemoCursorState) => void;
    isCancelled: () => boolean;
    getCursor: () => { x: number; y: number };
    setCursor: (next: { x: number; y: number }) => void;
  },
) {
  const { onCursor, isCancelled, getCursor, setCursor, sessionId } = ctx;

  switch (step.op) {
    case "wait":
      await sleep(step.ms);
      return;

    case "moveTo": {
      const el = await waitForDemoTarget(step.target);
      const to = centerOf(el);
      await animateCursorMove(getCursor(), to, step.ms ?? 550, onCursor, isCancelled);
      setCursor(to);
      return;
    }

    case "click": {
      const el = await waitForDemoTarget(step.target);
      const to = centerOf(el);
      await animateCursorMove(getCursor(), to, step.ms ?? 400, onCursor, isCancelled);
      setCursor(to);
      onCursor({ ...to, visible: true, pressing: true });
      await sleep(90);
      el.click();
      el.focus();
      onCursor({ ...to, visible: true, pressing: false });
      await sleep(120);
      return;
    }

    case "type": {
      const el = await waitForDemoTarget(step.target);
      if (!(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLInputElement)) {
        throw new Error(`Demo type target is not an input: ${step.target}`);
      }
      el.focus();
      const cps = step.cps ?? 30;
      const delay = Math.max(16, Math.round(1000 / cps));
      let value = "";
      for (const ch of step.text) {
        if (isCancelled()) return;
        value += ch;
        setNativeInputValue(el, value);
        await sleep(delay);
      }
      return;
    }

    case "clearComposer": {
      const el = queryDemoTarget("composer");
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        setNativeInputValue(el, "");
      }
      return;
    }

    case "waitFor": {
      await waitForDemoTarget(step.target, step.timeoutMs ?? 20000);
      return;
    }

    case "setMode": {
      const target = step.mode === "build" ? "mode-build" : "mode-explore";
      const el = await waitForDemoTarget(target);
      const to = centerOf(el);
      await animateCursorMove(getCursor(), to, 400, onCursor, isCancelled);
      setCursor(to);
      onCursor({ ...to, visible: true, pressing: true });
      await sleep(80);
      el.click();
      onCursor({ ...to, visible: true, pressing: false });
      return;
    }

    case "replay": {
      await applyReplay(sessionId, step.clip, {
        animate: step.animate ?? true,
        speed: step.speed ?? 1.5,
      });
      return;
    }

    default:
      return;
  }
}
