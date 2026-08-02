import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, textResult } from "../helpers";

export default defineTool({
  name: "list_profiles",
  title: "List trading profiles",
  description: "List the signed-in user's trading profiles (accounts) and which one is active.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, is_active, trading_style, created_at")
        .order("created_at", { ascending: true });
      if (error) return errorResult(error.message);
      return textResult({ profiles: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
