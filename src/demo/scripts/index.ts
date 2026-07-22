import { exploreScript } from "./explore";
import { buildScript } from "./build";
import { traceScript } from "./trace";
import type { DemoScript, DemoScriptId } from "../types";

export const DEMO_SCRIPTS: Record<DemoScriptId, DemoScript> = {
  explore: exploreScript,
  build: buildScript,
  trace: traceScript,
};

export const DEMO_SCRIPT_LIST: DemoScript[] = [
  exploreScript,
  buildScript,
  traceScript,
];
