import { z } from "zod";
import type { AgentContext, AgentTool, JsonSchema } from "../agent.types";

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(spec: {
  name: string;
  description: string;
  schema: S;
  execute(args: z.infer<S>, ctx: AgentContext): Promise<string>;
}): AgentTool {
  const jsonSchema = z.toJSONSchema(spec.schema) as JsonSchema;

  return {
    name: spec.name,
    description: spec.description,
    parameters: jsonSchema,
    execute: async (args, ctx) => {
      const parsed = spec.schema.safeParse(args);
      if (!parsed.success) {
        return `Error: Invalid arguments for ${spec.name}: ${formatZodError(parsed.error)}`;
      }
      try {
        return await spec.execute(parsed.data, ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Error executing ${spec.name}: ${message}`;
      }
    },
  };
}
