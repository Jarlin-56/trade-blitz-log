import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, resolveProfileId, textResult } from "../helpers";

export default defineTool({
  name: "log_trade",
  title: "Log a trade",
  description:
    "Create a post-trade journal entry (R-multiples only, no prices). Optionally attach existing checklist condition names.",
  inputSchema: {
    asset: z.string().trim().min(1).describe("Asset / symbol traded."),
    direction: z.enum(["Long", "Short"]).describe("Trade direction."),
    result: z.enum(["Win", "Loss", "Break-even", "Missed", "Canceled"]).describe("Trade result."),
    earned_r: z.number().finite().nullable().describe("R multiple earned. Win must be positive; Loss is -1; other results are 0."),
    missed_r: z.number().finite().nullable().describe("R left on the table. Missed must be positive; otherwise 0."),
    entry_date: z.string().nullable().describe("ISO datetime of entry. Null means now."),
    duration_minutes: z.number().int().min(0).nullable().describe("Holding time in minutes."),
    recap_text: z.string().nullable().describe("Recap / lesson notes."),
    condition_names: z
      .array(z.string().trim().min(1))
      .nullable()
      .describe("Names of existing checklist conditions that were met."),
    profile_id: z.string().uuid().nullable().describe("Profile to log into. Null uses the active profile."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const profileId = await resolveProfileId(supabase, input.profile_id ?? undefined);
      const earnedR = input.earned_r ?? 0;
      const missedR = input.missed_r ?? 0;
      if (input.result === "Win" && earnedR <= 0) return errorResult("Win ต้องมี Earned R มากกว่า 0");
      if (input.result === "Missed" && missedR <= 0) return errorResult("Missed ต้องมี Missed R มากกว่า 0");
      if (input.result === "Loss" && earnedR !== 0 && earnedR !== -1) return errorResult("Loss ต้องมี Earned R เป็น -1");
      if (["Break-even", "Canceled"].includes(input.result) && earnedR !== 0) return errorResult(`${input.result} ต้องมี Earned R เป็น 0`);
      if (input.entry_date && !Number.isFinite(new Date(input.entry_date).getTime())) return errorResult("entry_date ต้องเป็นวันที่ ISO ที่ถูกต้อง");

      const normalizedEarnedR = input.result === "Loss" ? -1 : ["Win"].includes(input.result) ? earnedR : 0;
      const normalizedMissedR = input.result === "Missed" ? missedR : 0;
      const { data: trade, error } = await supabase
        .from("trades")
        .insert({
          user_id: ctx.getUserId(),
          profile_id: profileId,
          asset: input.asset.trim().toUpperCase(),
          direction: input.direction,
          result: input.result,
          earned_r: normalizedEarnedR,
          missed_r: normalizedMissedR,
          entry_date: input.entry_date ?? new Date().toISOString(),
          duration_minutes: input.duration_minutes ?? null,
          recap_text: input.recap_text?.trim() || null,
        })
        .select()
        .single();
      if (error) return errorResult(error.message);

      let linkedConditions: string[] = [];
      if (input.condition_names?.length) {
        const { data: conds, error: conditionError } = await supabase
          .from("conditions")
          .select("id, name")
          .eq("user_id", ctx.getUserId())
          .in("name", input.condition_names);
        if (conditionError) return errorResult(conditionError.message);
        if (conds?.length) {
          const { error: linkError } = await supabase
            .from("trade_conditions")
            .insert(conds.map((c) => ({ trade_id: trade.id, condition_id: c.id })));
          if (linkError) return errorResult(linkError.message);
          linkedConditions = conds.map((c) => c.name);
        }
      }

      return textResult({ trade, linked_conditions: linkedConditions });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
