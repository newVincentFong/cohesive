import type { CodeProject } from "@/core/code/agent.types";
import { invoke } from "@/core/platform/tauri";

export async function prepareDemoFixture(): Promise<CodeProject> {
  return invoke<CodeProject>("demo_prepare_fixture");
}
