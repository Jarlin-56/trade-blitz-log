import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, resolveProfileId, textResult } from "../helpers";

export default defineTool({
  name: "log_trade",
  title: "Log a trade",
  description:
    "Create a post-trade journal entry (R-multiples only, no prices). Optionally attach existing checklist condition names.",
  inputSchema: {
    asset: z.string().describe("Asset / symbol traded."),
    direction: z.enum(["Long", "Short"]).describe("Trade direction."),
    result: z.enum(["Win", "Loss", "Break-even", "Missed", "Canceled"]).describe("Trade result."),
    earned_r: z.number().nullable().describe("R multiple earned (negative for losses). Default 0."),
    missed_r: z.number().nullable().describe("R left on the table. Default 0."),
    entry_date: z.string().nullable().describe("ISO datetime of entry. Null means now."),
    duration_minutes: z.number().int().nullable().describe("Holding time in minutes."),
    recap_text: z.string().nullable().describe("Recap / lesson notes."),
    condition_names: z
      .array(z.string())
      .nullable()
      .describe("Names of existing checklist conditions that were met."),
    profile_id: z.string().uuid().nullable().describe("Profile to log into. Null uses the active profile."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const profileId = await resolveProfileId(supabase, input.profile_id ?? undefined);

      const { data: trade, error } = await supabase
        .from("trades")
        .insert({
          user_id: ctx.getUserId(),
          profile_id: profileId,
          asset: input.asset,
          direction: input.direction,
          result: input.result,
          earned_r: input.earned_r ?? 0,
          missed_r: input.missed_r ?? 0,
          entry_date: input.entry_date ?? new Date().toISOString(),
          duration_minutes: input.duration_minutes ?? null,
          recap_text: input.recap_text ?? null,
        })
        .select()
        .single();
      if (error) return errorResult(error.message);

      let linkedConditions: string[] = [];
      if (input.condition_names?.length) {
        const { data: conds } = await supabase
          .from("conditions")
          .select("id, name")
          .in("name", input.condition_names);
        if (conds?.length) {
          await supabase
            .from("trade_conditions")
            .insert(conds.map((c) => ({ trade_id: trade.id, condition_id: c.id })));
          linkedConditions = conds.map((c) => c.name);
        }
      }

      return textResult({ trade, linked_conditions: linkedConditions });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
