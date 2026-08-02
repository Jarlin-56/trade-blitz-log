import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, resolveProfileId, textResult } from "../helpers";

export default defineTool({
  name: "list_quick_notes",
  title: "List quick notes",
  description: "List quick notes for a profile, newest first. Optionally only those not yet converted to trades.",
  inputSchema: {
    profile_id: z.string().uuid().nullable().describe("Profile to read. Null uses the active profile."),
    pending_only: z.boolean().nullable().describe("Only notes not yet converted into a trade."),
    limit: z.number().int().nullable().describe("Max rows to return (default 20, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ profile_id, pending_only, limit }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const profileId = await resolveProfileId(supabase, profile_id ?? undefined);
      let query = supabase
        .from("quick_notes")
        .select("id, note, asset, direction, converted_trade_id, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit ?? 20, 1), 100));
      if (pending_only) query = query.is("converted_trade_id", null);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return textResult({ profile_id: profileId, notes: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
