import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, resolveProfileId, textResult } from "../helpers";

export default defineTool({
  name: "list_trades",
  title: "List trades",
  description:
    "List journaled trades for a profile, newest first. Optionally filter by asset, result, or recent days.",
  inputSchema: {
    profile_id: z.string().uuid().nullable().describe("Profile to read. Null uses the active profile."),
    asset: z.string().nullable().describe("Filter by asset symbol, case-insensitive partial match."),
    result: z
      .enum(["Win", "Loss", "Break-even", "Missed", "Canceled"])
      .nullable()
      .describe("Filter by trade result."),
    days: z.number().int().nullable().describe("Only trades entered within the last N days."),
    limit: z.number().int().nullable().describe("Max rows to return (default 20, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ profile_id, asset, result, days, limit }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const profileId = await resolveProfileId(supabase, profile_id ?? undefined);
      const take = Math.min(Math.max(limit ?? 20, 1), 100);

      let query = supabase
        .from("trades")
        .select("id, entry_date, asset, direction, result, earned_r, missed_r, duration_minutes, recap_text")
        .eq("profile_id", profileId)
        .order("entry_date", { ascending: false })
        .limit(take);

      if (asset) query = query.ilike("asset", `%${asset}%`);
      if (result) query = query.eq("result", result);
      if (days) {
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        query = query.gte("entry_date", cutoff);
      }

      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return textResult({ profile_id: profileId, count: data?.length ?? 0, trades: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
