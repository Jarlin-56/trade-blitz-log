import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, requireAuth, resolveProfileId, textResult } from "../helpers";

export default defineTool({
  name: "create_quick_note",
  title: "Create quick note",
  description: "Save a quick trading note (idea, observation) that can later be converted into a full trade log.",
  inputSchema: {
    note: z.string().describe("Note text."),
    asset: z.string().nullable().describe("Asset / symbol, if known."),
    direction: z.enum(["Long", "Short"]).nullable().describe("Direction, if known."),
    profile_id: z.string().uuid().nullable().describe("Profile to save into. Null uses the active profile."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ note, asset, direction, profile_id }, ctx) => {
    try {
      const supabase = requireAuth(ctx);
      const profileId = await resolveProfileId(supabase, profile_id ?? undefined);
      const { data, error } = await supabase
        .from("quick_notes")
        .insert({
          user_id: ctx.getUserId(),
          profile_id: profileId,
          note,
          asset: asset ?? null,
          direction: direction ?? null,
        })
        .select()
        .single();
      if (error) return errorResult(error.message);
      return textResult({ quick_note: data });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
