import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProfilesTool from "./tools/list-profiles";
import listTradesTool from "./tools/list-trades";
import getTradeTool from "./tools/get-trade";
import getStatsTool from "./tools/get-stats";
import logTradeTool from "./tools/log-trade";
import listConditionsTool from "./tools/list-conditions";
import createQuickNoteTool from "./tools/create-quick-note";
import listQuickNotesTool from "./tools/list-quick-notes";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "r-squared-journal",
  title: "R-Squared Journal",
  version: "0.1.0",
  instructions:
    "Tools for the R-Squared Journal trading journal (R-multiples only, no prices). Use `list_profiles` to see trading profiles, `list_trades` / `get_trade` to review journaled trades, `get_stats` for R performance summaries, `list_conditions` for checklist names, `log_trade` to journal a completed trade, and quick-note tools for rough ideas.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listProfilesTool,
    listTradesTool,
    getTradeTool,
    getStatsTool,
    listConditionsTool,
    logTradeTool,
    createQuickNoteTool,
    listQuickNotesTool,
  ],
});
