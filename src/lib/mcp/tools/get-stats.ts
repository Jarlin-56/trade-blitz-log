import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, resolveProfileId, textResult } from "../helpers";

export default defineTool({
  name: "get_stats",
  title: "Get performance stats",
  description:
    "Summarize R-multiple performance for a profile: total R, win rate, average R, missed R, and result counts.",
  inputSchema: {
    profile_id: z.string().uuid().nullable().describe("Profile to analyze. Null uses the active profile."),
    days: z.number().int().nullable().describe("Only trades within the last N days. Null means all time."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ profile_id, days }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const profileId = await resolveProfileId(supabase, profile_id ?? undefined);

      let query = supabase
        .from("trades")
        .select("result, earned_r, missed_r, entry_date")
        .eq("profile_id", profileId);
      if (days) {
        query = query.gte("entry_date", new Date(Date.now() - days * 86400000).toISOString());
      }
      const { data, error } = await query;
      if (error) return errorResult(error.message);

      const trades = data ?? [];
      const executed = trades.filter((t) => t.result === "Win" || t.result === "Loss" || t.result === "Break-even");
      const wins = executed.filter((t) => t.result === "Win").length;
      const totalR = executed.reduce((s, t) => s + Number(t.earned_r ?? 0), 0);
      const missedR = trades.reduce((s, t) => s + Number(t.missed_r ?? 0), 0);
      const counts: Record<string, number> = {};
      for (const t of trades) counts[t.result] = (counts[t.result] ?? 0) + 1;

      return textResult({
        profile_id: profileId,
        window_days: days ?? null,
        total_trades: trades.length,
        executed_trades: executed.length,
        total_r: Number(totalR.toFixed(2)),
        avg_r: executed.length ? Number((totalR / executed.length).toFixed(2)) : 0,
        win_rate: executed.length ? Number(((wins / executed.length) * 100).toFixed(1)) : 0,
        missed_r: Number(missedR.toFixed(2)),
        result_counts: counts,
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
