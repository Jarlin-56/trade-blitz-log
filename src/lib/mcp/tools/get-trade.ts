import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, textResult } from "../helpers";

export default defineTool({
  name: "get_trade",
  title: "Get trade detail",
  description: "Get one trade with its checklist conditions and tags.",
  inputSchema: { trade_id: z.string().uuid().describe("Trade id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ trade_id }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const { data: trade, error } = await supabase
        .from("trades")
        .select("*")
        .eq("id", trade_id)
        .maybeSingle();
      if (error) return errorResult(error.message);
      if (!trade) return errorResult("Trade not found");

      const [{ data: tc }, { data: tt }] = await Promise.all([
        supabase.from("trade_conditions").select("conditions(name)").eq("trade_id", trade_id),
        supabase.from("trade_tags").select("tags(name)").eq("trade_id", trade_id),
      ]);

      return textResult({
        trade,
        conditions: (tc ?? []).map((r: any) => r.conditions?.name).filter(Boolean),
        tags: (tt ?? []).map((r: any) => r.tags?.name).filter(Boolean),
      });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
