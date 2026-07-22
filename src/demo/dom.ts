export function demoTargetSelector(target: string): string {
  return `[data-demo="${target}"]`;
}

export function queryDemoTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(demoTargetSelector(target));
}

export async function waitForDemoTarget(
  target: string,
  timeoutMs = 15000,
): Promise<HTMLElement> {
  const existing = queryDemoTarget(target);
  if (existing) return existing;

  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      const el = queryDemoTarget(target);
      if (el) {
        window.clearInterval(timer);
        resolve(el);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error(`Demo target not found: ${target}`));
      }
    }, 50);
  });
}

export function centerOf(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Set a React-controlled textarea/input value and notify React. */
export function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
