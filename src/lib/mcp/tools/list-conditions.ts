import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, textResult } from "../helpers";

export default defineTool({
  name: "list_conditions",
  title: "List checklist conditions",
  description: "List the user's checklist condition names and tags, usable when logging a trade.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const [{ data: conditions, error: cErr }, { data: tags, error: tErr }] = await Promise.all([
        supabase.from("conditions").select("id, name").order("name"),
        supabase.from("tags").select("id, name").order("name"),
      ]);
      if (cErr) return errorResult(cErr.message);
      if (tErr) return errorResult(tErr.message);
      return textResult({ conditions: conditions ?? [], tags: tags ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
