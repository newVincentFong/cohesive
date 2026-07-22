import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSession } from "@/core/session/session.service";
import { DEFAULT_CODE_MODE } from "@/core/product-flags";
import { prepareDemoFixture } from "./demo.service";
import { DEMO_WINDOW_HEIGHT, DEMO_WINDOW_WIDTH } from "./types";

export interface DemoBootstrapResult {
  projectId: string;
  projectPath: string;
  sessionId: string;
}

export async function bootstrapDemoMode(): Promise<DemoBootstrapResult> {
  const window = getCurrentWindow();
  await window.setSize(new LogicalSize(DEMO_WINDOW_WIDTH, DEMO_WINDOW_HEIGHT));
  try {
    await window.center();
  } catch {
    // center is best-effort; size is the important part for recording
  }

  const project = await prepareDemoFixture();
  const session = await createSession({
    domain: "code",
    defaultMode: DEFAULT_CODE_MODE,
    projectId: project.id,
    title: "Explore default filter",
  });

  return {
    projectId: project.id,
    projectPath: project.path,
    sessionId: session.id,
  };
}
